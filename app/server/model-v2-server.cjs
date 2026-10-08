#!/usr/bin/env node
'use strict';
// Optional PIM-side service. It never sends a mutation to the live shop.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const V2=require('../lib/model-contract-v2.js');
const digest=x=>crypto.createHash('sha256').update(V2.stable(x)).digest('hex');
class ApiError extends Error{constructor(status,code,detail=null){super(code);this.status=status;this.code=code;this.detail=detail;}}
function createService({directory,token,maxBytes=256*1024*1024}={}){
 if(typeof token!=='string'||token.length<32)throw Error('PIM_API_TOKEN must contain at least 32 characters');
 if(!directory)throw Error('PIM_DATA_DIR is required outside the application/web root');
 const root=path.resolve(__dirname,'..'),dir=path.resolve(directory);
 if(dir===root||dir.startsWith(root+path.sep))throw Error('Private state must be outside the web root');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink())throw Error('Private directory must not be a symlink');fs.chmodSync(dir,0o700);
 const real=fs.realpathSync(dir);if(real===root||real.startsWith(root+path.sep))throw Error('Private state resolves inside web root');
 const lock=path.join(dir,'service.lock'),fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));
 const file=path.join(dir,'state.json');
 let state;
 try{if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink())throw Error('State file must not be a symlink');state=JSON.parse(fs.readFileSync(file,'utf8'));}else state={format:'rubizh.pim.v2.state',revision:0,source:null,registry:null,bundle:null,batches:{}};
 if(state.format!=='rubizh.pim.v2.state'||!Number.isSafeInteger(state.revision))throw Error('Invalid persistent state');
 }catch(e){fs.closeSync(fd);fs.unlinkSync(lock);throw e;}
 function write(next){
  const temp=path.join(dir,'state-'+crypto.randomUUID()+'.tmp');
  const out=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(out,JSON.stringify(next));fs.fsyncSync(out);}finally{fs.closeSync(out);}
  try{if(fs.existsSync(file))fs.copyFileSync(file,path.join(dir,'state.previous.json'));fs.chmodSync(temp,0o600);fs.renameSync(temp,file);const dfd=fs.openSync(dir,'r');try{fs.fsyncSync(dfd);}finally{fs.closeSync(dfd);}state=next;}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
 function auth(req){const expected=Buffer.from('Bearer '+token),got=Buffer.from(req.headers.authorization||'');if(got.length!==expected.length||!crypto.timingSafeEqual(got,expected))throw new ApiError(401,'UNAUTHORIZED');}
 async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ApiError(415,'JSON_REQUIRED');
  if(Number(req.headers['content-length'])>maxBytes)throw new ApiError(413,'BODY_TOO_LARGE');
  let bytes=0;const parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBytes)throw new ApiError(413,'BODY_TOO_LARGE');parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON');}
 }
 const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
 const server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://pim.invalid');auth(req);
   if(req.headers.origin)throw new ApiError(403,'BROWSER_ORIGIN_NOT_ALLOWED');
   if(req.method==='GET'&&u.pathname==='/api/pim/status')return send(res,200,{schema_version:V2.VERSION,revision:state.revision,source_sha256:state.source?digest(state.source):null,capabilities:{models_export_version:2,legacy_mapping_version:2,publish_batches_version:1},site_connected:false});
   if(req.method==='POST'&&u.pathname==='/api/pim/catalog-snapshots'){
    const data=await body(req);if(data.base_revision!==state.revision)throw new ApiError(409,'REVISION_CONFLICT',{revision:state.revision});
    if(data.source?.schema_version!==V2.VERSION||data.source.kind!=='rubizh.pim.source'||!['products','variants','photos','categories'].every(k=>Array.isArray(data.source[k])))throw new ApiError(422,'SOURCE_SCHEMA');
    // Structural/source identity checks run even before a confirmed registry exists.
    const check=V2.build(data.source,V2.draft(data.source));
    if(check.report.errors.length)throw new ApiError(422,'SOURCE_INVALID',check.report.errors);
    if(state.source){
     const variants=new Map(data.source.variants.map(v=>[V2.variantKey(v),v])),photos=new Map(data.source.photos.map(p=>[p.legacy_photo_id,p])),products=new Map(data.source.products.map(p=>[p.legacy_product_id,p])),categories=new Set(data.source.categories.map(c=>c.id));
     const lost=[];
     for(const v of state.source.variants)if(!variants.has(V2.variantKey(v)))lost.push({code:'LOST_SOURCE_SKU',ref:V2.variantKey(v)});
     for(const p of state.source.products)if(!products.has(p.legacy_product_id))lost.push({code:'LOST_SOURCE_PRODUCT',ref:p.legacy_product_id});
     for(const p of state.source.photos)if(!photos.has(p.legacy_photo_id)||photos.get(p.legacy_photo_id).url!==p.url)lost.push({code:'LOST_SOURCE_PHOTO',ref:p.legacy_photo_id});
     for(const c of state.source.categories)if(!categories.has(c.id))lost.push({code:'LOST_SOURCE_CATEGORY',ref:c.id});
     if(lost.length)throw new ApiError(422,'SOURCE_LOSS_BLOCKED',lost);
    }
    const next=structuredClone(state);next.source=data.source;next.revision++;next.bundle=null;
    for(const b of Object.values(next.batches))if(b.status==='READY_FOR_SITE')b.status='STALE';
    write(next);return send(res,201,{revision:state.revision,source_sha256:digest(state.source),site_modified:false});
   }
   if(req.method==='POST'&&u.pathname==='/api/pim/publish-batches'){
    const data=await body(req);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(data.batch_id||'')||['__proto__','constructor','prototype'].includes(data.batch_id))throw new ApiError(422,'BATCH_ID');
    const hash=digest({base_revision:data.base_revision,source_sha256:data.source_sha256,registry:data.registry});
    if(data.request_hash!==hash)throw new ApiError(422,'REQUEST_HASH');
    // Check retry identity before revision: a lost response must be recoverable.
    const existing=Object.hasOwn(state.batches,data.batch_id)?state.batches[data.batch_id]:null;
    if(existing){if(existing.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');return send(res,200,existing);}
    if(data.base_revision!==state.revision)throw new ApiError(409,'REVISION_CONFLICT',{revision:state.revision});
    if(!state.source||data.source_sha256!==digest(state.source))throw new ApiError(409,'SOURCE_CHANGED');
    const bundle=V2.build(state.source,data.registry,{previous:state.registry});
    if(!bundle.report.ready_for_migration)throw new ApiError(422,'DRY_RUN_BLOCKED',bundle.report);
    const next=structuredClone(state);next.registry=data.registry;next.bundle=bundle;next.revision++;
    const batch={batch_id:data.batch_id,request_hash:hash,base_revision:data.base_revision,result_revision:next.revision,source_sha256:data.source_sha256,status:'READY_FOR_SITE',site_modified:false,report:bundle.report,created_at:new Date().toISOString()};next.batches[data.batch_id]=batch;
    write(next);return send(res,201,batch);
   }
   const match=/^\/api\/pim\/publish-batches\/([A-Za-z0-9_-]{1,100})$/.exec(u.pathname);
   if(req.method==='GET'&&match){if(!Object.hasOwn(state.batches,match[1]))throw new ApiError(404,'BATCH_NOT_FOUND');return send(res,200,state.batches[match[1]]);}
   if(req.method==='GET'&&['/api/pim/export/models','/api/pim/export/legacy-mapping'].includes(u.pathname)){
    if(!state.bundle)throw new ApiError(409,'NO_CONFIRMED_EXPORT');
    const payload=u.pathname.endsWith('legacy-mapping')?state.bundle.legacy_mapping:state.bundle;
    return send(res,200,{...payload,revision:state.revision,source_sha256:digest(state.source)});
   }
   throw new ApiError(404,'NOT_FOUND');
  }catch(e){send(res,e.status||500,{error:e.code||'INTERNAL_ERROR',...(e.detail?{detail:e.detail}:{})});}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 let closed=false;const close=()=>{if(!closed){closed=true;fs.closeSync(fd);fs.unlinkSync(lock);}};server.on('close',close);
 return {server,close,digest};
}
if(require.main===module){
 try{const service=createService({directory:process.env.PIM_DATA_DIR,token:process.env.PIM_API_TOKEN});const port=Number(process.env.PIM_API_PORT||8766);service.server.listen(port,'127.0.0.1',()=>console.log('PIM v2 API started on loopback port '+port));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>service.server.close());}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={createService,digest};
