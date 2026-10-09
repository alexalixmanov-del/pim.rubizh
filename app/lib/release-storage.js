(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RubizhReleaseStorage=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DATABASE='rubizh_pim_v7_launch',BACKUP_DATABASE='rubizh_pim_release_backups_v1',FORMAT='rubizh-pim-production-snapshot',VERSION=1;
// Deep-copy mutable containers without serializing immutable text repeatedly.
// Structured-clone-only types retain native semantics.
function cloneSnapshot(value,seen=new WeakMap()){
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return seen.get(value);
 const proto=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)return structuredClone(value);
 const out=Array.isArray(value)?new Array(value.length):Object.create(proto);seen.set(value,out);
 for(const key of Object.keys(value))Object.defineProperty(out,key,{value:cloneSnapshot(value[key],seen),enumerable:true,writable:true,configurable:true});
 return out;
}
// Incremental SHA-256: bounded buffers for snapshot integrity and CAS checks.
class SnapshotSHA256 {
 constructor(){this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.buffer=new Uint8Array(64);this.used=0;this.length=0;this.w=new Uint32Array(64);}
 block(b){const w=this.w;for(let i=0;i<16;i++)w[i]=(b[i*4]<<24)|(b[i*4+1]<<16)|(b[i*4+2]<<8)|b[i*4+3];const rr=(x,n)=>(x>>>n)|(x<<(32-n));for(let i=16;i<64;i++){const a=w[i-15],z=w[i-2];w[i]=(w[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[i-7]+(rr(z,17)^rr(z,19)^(z>>>10)))>>>0;}let [a,b0,c,d,e,f,g,h]=this.h;for(let i=0;i<64;i++){const t=(h+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+SnapshotSHA256.K[i]+w[i])>>>0,u=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b0)^(a&c)^(b0&c)))>>>0;h=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b0;b0=a;a=(t+u)>>>0;}const v=[a,b0,c,d,e,f,g,h];for(let i=0;i<8;i++)this.h[i]=(this.h[i]+v[i])>>>0;}
 update(bytes){this.length+=bytes.length;let at=0;if(this.used){const n=Math.min(64-this.used,bytes.length);this.buffer.set(bytes.subarray(0,n),this.used);this.used+=n;at=n;if(this.used===64){this.block(this.buffer);this.used=0;}}while(at+64<=bytes.length){this.block(bytes.subarray(at,at+64));at+=64;}if(at<bytes.length){this.buffer.set(bytes.subarray(at));this.used=bytes.length-at;}return this;}
 hex(){const bits=this.length*8;this.buffer[this.used++]=128;if(this.used>56){this.buffer.fill(0,this.used);this.block(this.buffer);this.used=0;}this.buffer.fill(0,this.used,56);const view=new DataView(this.buffer.buffer);view.setUint32(56,Math.floor(bits/4294967296));view.setUint32(60,bits>>>0);this.block(this.buffer);return Array.from(this.h,x=>x.toString(16).padStart(8,'0')).join('');}
}
SnapshotSHA256.K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const snapshotEncoder=new TextEncoder();
const blobMetadata=(_,v)=>typeof Blob!=='undefined'&&v instanceof Blob?{__blob_metadata:true,size:v.size,type:v.type}:v;
const rowHash=row=>new SnapshotSHA256().update(snapshotEncoder.encode(JSON.stringify(row,blobMetadata))).hex();
async function snapshotYield(){if(typeof scheduler!=='undefined'&&scheduler.yield)return scheduler.yield();if(typeof requestAnimationFrame==='function')return new Promise(r=>setTimeout(r,0));}
async function rowsDigest(rows){const h=new SnapshotSHA256().update(snapshotEncoder.encode('[')),sorted=[...rows].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);for(let i=0;i<sorted.length;i++){if(i)h.update(snapshotEncoder.encode(','));h.update(snapshotEncoder.encode(JSON.stringify(sorted[i],blobMetadata)));await snapshotYield();}h.update(snapshotEncoder.encode(']'));return h.hex();}
async function blobDigest(blob){const h=new SnapshotSHA256();for(let i=0;i<blob.size;i+=65536){h.update(new Uint8Array(await blob.slice(i,i+65536).arrayBuffer()));await snapshotYield();}return h.hex();}
function reviveSnapshot(value,blobs){if(value&&typeof value==='object'){if(Object.hasOwn(value,'__pim_blob_ref')){const blob=blobs[value.__pim_blob_ref];if(!blob||blob.size!==value.size)throw Error('INVALID_BLOB_REFERENCE');return new Blob([blob],{type:value.type});}for(const k of Object.keys(value))value[k]=reviveSnapshot(value[k],blobs);}return value;}
async function binaryBlob(b){const parts=[],h=new SnapshotSHA256();for(let i=0;i<b.base64.length;i+=65536){const s=atob(b.base64.slice(i,i+65536)),bytes=new Uint8Array(s.length);for(let j=0;j<s.length;j++)bytes[j]=s.charCodeAt(j);h.update(bytes);parts.push(new Blob([bytes]));await snapshotYield();}if(h.hex()!==b.sha256)throw Error('CORRUPT_BACKUP_BINARY');return new Blob(parts);}
async function encodeBlob(rows,local,metadata={},onProgress=()=>{}){
 const binaries=[],header={format:FORMAT,v:VERSION,streaming_json:1,database:DATABASE,at:Date.now(),metadata,local_storage:local};
 async function* chunks(){
  yield JSON.stringify(header).slice(0,-1)+',"rows":[\n';
  for(let i=0;i<rows.length;i++){
   const text=JSON.stringify(rows[i],(_,v)=>{if(typeof Blob!=='undefined'&&v instanceof Blob){const n=binaries.length;binaries.push(v);return {__pim_blob_ref:n,size:v.size,type:v.type};}return v;});
   yield text+(i+1<rows.length?',':'')+'\n';onProgress('rows',i+1,rows.length);await snapshotYield();
  }
  yield '],"binaries":[\n';
  for(let i=0;i<binaries.length;i++){
   const blob=binaries[i],sha256=await blobDigest(blob);yield '{"sha256":'+JSON.stringify(sha256)+',"base64":"';
   for(let at=0;at<blob.size;at+=49152){const bytes=new Uint8Array(await blob.slice(at,at+49152).arrayBuffer());let s='';for(let j=0;j<bytes.length;j++)s+=String.fromCharCode(bytes[j]);yield btoa(s);await snapshotYield();}
   yield '"}'+(i+1<binaries.length?',':'')+'\n';onProgress('binaries',i+1,binaries.length);
  }
  yield ']}\n';
 }
 const iterator=chunks(),stream=new ReadableStream({async pull(c){try{const next=await iterator.next();if(next.done)c.close();else c.enqueue(snapshotEncoder.encode(next.value));}catch(e){c.error(e);}},async cancel(){await iterator.return();}});
 const gz=typeof CompressionStream!=='undefined';return {blob:await new Response(gz?stream.pipeThrough(new CompressionStream('gzip')):stream).blob(),gz};
}
async function decodeSnapshotStream(stream){
 const reader=stream.pipeThrough(new TextDecoderStream()).getReader();let fragments=[],header,section='header',finished=false;const rows=[],blobs=[],binaryMetadata=[];
 async function line(text){
  if(section==='header'){if(!text.endsWith(',"rows":['))throw Error('INVALID_STREAMED_BACKUP');header=JSON.parse(text.slice(0,-9)+'}');section='rows';return;}
  if(section==='rows'&&text==='],"binaries":['){section='binaries';return;}
  if(section==='binaries'&&text===']}'){finished=true;section='done';return;}
  if(section==='done'){if(text.trim())throw Error('INVALID_STREAMED_BACKUP');return;}
  if(!text)return;const value=JSON.parse(text.endsWith(',')?text.slice(0,-1):text);
  if(section==='rows')rows.push(value);else {blobs.push(await binaryBlob(value));binaryMetadata.push({sha256:value.sha256});}
  await snapshotYield();
 }
 try{for(;;){const r=await reader.read();if(r.done)break;let start=0,nl;while((nl=r.value.indexOf('\n',start))>=0){fragments.push(r.value.slice(start,nl));const text=fragments.join('');fragments=[];await line(text);start=nl+1;}if(start<r.value.length)fragments.push(r.value.slice(start));}if(fragments.length)await line(fragments.join(''));}finally{reader.releaseLock();}
 if(!finished||!header||header.format!==FORMAT||header.v!==VERSION||header.database!==DATABASE||new Set(rows.map(r=>r.key)).size!==rows.length)throw Error('INVALID_FULL_BACKUP');
 const data={...header,rows,binaries:binaryMetadata};
 // Binary payloads are transport data; decoded rows hold the verified Blobs.
 for(let i=0;i<rows.length;i++){rows[i]=reviveSnapshot(rows[i],blobs);await snapshotYield();}
 if(data.metadata.source_sha256&&await rowsDigest(rows)!==data.metadata.source_sha256)throw Error('CORRUPT_BACKUP_ROWS');return data;
}

function rowText(rows){return JSON.stringify([...rows].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),(_,v)=>typeof Blob!=='undefined'&&v instanceof Blob?{__blob_metadata:true,size:v.size,type:v.type}:v);}
async function digest(text){const b=typeof text==='string'?new TextEncoder().encode(text):text;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function capture(db){return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),rows=[],req=tx.objectStore('kv').openCursor();req.onsuccess=()=>{const cursor=req.result;if(cursor){rows.push(cursor.value);cursor.continue();}};tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(tx.error||Error('CAPTURE_FAILED'));});}
async function write(db,expected,puts,dels=[]){
 const wanted=new Map();for(const row of expected){if(wanted.has(row.key))throw Error('INVALID_EXPECTED_ROWS');wanted.set(row.key,rowHash(row));await snapshotYield();}
 return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),st=tx.objectStore('kv');let failure,seen=0;const req=st.openCursor();
 req.onsuccess=()=>{const cursor=req.result;if(cursor){const row=cursor.value;if(wanted.get(row.key)!==rowHash(row)){failure=Error('STALE_MIGRATION: дані змінила інша вкладка');tx.abort();return;}seen++;cursor.continue();return;}
 if(seen!==wanted.size){failure=Error('STALE_MIGRATION: дані змінила інша вкладка');tx.abort();return;}for(const row of puts)st.put(row);for(const key of dels)st.delete(key);};
 tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('MIGRATION_TRANSACTION_ABORTED'));});
}
async function encode(rows,local,metadata={}){
 const binaries=[];const json=JSON.stringify({format:FORMAT,v:VERSION,database:DATABASE,at:Date.now(),metadata,local_storage:local,rows},(_,v)=>{if(typeof Blob!=='undefined'&&v instanceof Blob){const i=binaries.length;binaries.push(v);return {__pim_blob_ref:i,size:v.size,type:v.type};}return v;});
 const data=JSON.parse(json);data.binaries=[];for(const blob of binaries){const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));data.binaries.push({base64:btoa(s),sha256:await digest(bytes)});}
 return JSON.stringify(data);
}
async function decode(text){
 const data=JSON.parse(text);if(data.format!==FORMAT||data.v!==VERSION||data.database!==DATABASE||!Array.isArray(data.rows)||new Set(data.rows.map(x=>x.key)).size!==data.rows.length)throw Error('INVALID_FULL_BACKUP');
 const blobs=[];for(const b of data.binaries||[])blobs.push(await binaryBlob(b));
 for(let i=0;i<data.rows.length;i++){data.rows[i]=reviveSnapshot(data.rows[i],blobs);await snapshotYield();}
 if(data.metadata.source_sha256&&await rowsDigest(data.rows)!==data.metadata.source_sha256)throw Error('CORRUPT_BACKUP_ROWS');return data;
}
function openBackups(){return new Promise((resolve,reject)=>{const req=indexedDB.open(BACKUP_DATABASE,1);req.onupgradeneeded=()=>req.result.createObjectStore('backups',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveBackup(backup){const db=await openBackups();try{await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');tx.objectStore('backups').add(backup);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('BACKUP_FAILED'));});const loaded=await getBackup(backup.id);if(!loaded||loaded.sha256!==backup.sha256||await blobDigest(loaded.blob)!==backup.sha256)throw Error('BACKUP_READBACK_FAILED');return loaded;}finally{db.close();}}
async function getBackup(id){const db=await openBackups();try{return await new Promise((resolve,reject)=>{const req=db.transaction('backups','readonly').objectStore('backups').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}}
async function readSnapshotPayload(blob,gz){const stream=()=>gz?blob.stream().pipeThrough(new DecompressionStream('gzip')):blob.stream();const reader=stream().getReader();let prefix='';try{while(prefix.length<4096){const r=await reader.read();if(r.done)break;prefix+=new TextDecoder().decode(r.value);if(prefix.includes('\n'))break;}}finally{await reader.cancel();}if(prefix.split('\n')[0].includes('"streaming_json":1'))return decodeSnapshotStream(stream());const text=await new Response(stream()).text(),data=JSON.parse(text);return data.format===FORMAT?decode(text):{format:FORMAT,v:VERSION,database:DATABASE,rows:portableRows(data),local_storage:{},metadata:{portable:true}};}
async function readBackup(row){if(!row||await blobDigest(row.blob)!==row.sha256)throw Error('BACKUP_CHECKSUM_FAILED');return readSnapshotPayload(row.blob,row.gz);}
function gates(cfg){if(cfg.siteApi)cfg.siteApi.auto=false;cfg.sync_enabled=false;cfg.autoprices_enabled=false;for(const s of cfg.suppliers||[])if(s.source){s.source.enabled=false;s.source.autoApply=false;}return cfg;}
async function rollback(db,snapshot,{localStorage:ls=null,operationalGates=true,bumpRevision=true}={}){
 const current=await capture(db),rows=cloneSnapshot(snapshot.rows),config=rows.find(x=>x.key==='meta/config');if(config&&operationalGates)gates(config.data);
 const revision=current.find(x=>x.key==='sync/local_revision')?.data||0;const row=rows.find(x=>x.key==='sync/local_revision');if(bumpRevision){if(row)row.data=revision+1;else rows.push({key:'sync/local_revision',data:revision+1});}
 const keys=new Set(rows.map(x=>x.key));await write(db,current,rows,current.filter(x=>!keys.has(x.key)).map(x=>x.key));
 // The current CAS version map must survive rollback: remote rows may already contain the migration.
 if(ls){const known=ls.getItem('rubizh_sb_known'),pending=new Set(JSON.parse(ls.getItem('rubizh_sb_pending')||'[]'));if(!snapshot.metadata?.portable)for(const key of Array.from({length:ls.length},(_,i)=>ls.key(i)).filter(Boolean))if(!['rubizh_sb_known','rubizh_sb_pending'].includes(key)&&!Object.hasOwn(snapshot.local_storage||{},key))ls.removeItem(key);for(const key of Object.keys(snapshot.local_storage||{}))if(!['rubizh_sb_known','rubizh_sb_pending'].includes(key))ls.setItem(key,snapshot.local_storage[key]);for(const r of [...current,...rows])if(!/^(autobak\/|autobak_meta\/|safety\/|docfile\/|sync\/|auth\/)/.test(r.key))pending.add(r.key);if(known!=null)ls.setItem('rubizh_sb_known',known);ls.setItem('rubizh_sb_pending',JSON.stringify([...pending]));}
 return {catalog_restored:true,operational_gates:{SYNC_ENABLED:false,AUTOPRICES_ENABLED:false},revision:revision+1};
}
function openDatabase(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DATABASE,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv',{keyPath:'key'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function portableRows(d){
 if(!['rubizh-pim-backup','pim-backup','pim-safety-backup'].includes(d.format)||!d.cfg||!Array.isArray(d.products)||!d.products.length)throw Error('INVALID_PORTABLE_BACKUP');
 const rows=[{key:'meta/config',data:cloneSnapshot(d.cfg)}];
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
 for(const [prefix,field,items,id] of [['cat','products',d.products,'id'],['queue','items',d.queue||[],'k'],['content','items',d.content||[],'k']]){const seen=new Set(),buckets=new Map();for(const p of items){if(!p[id]||seen.has(p[id]))throw Error('DUPLICATE_OR_MISSING_ID');seen.add(p[id]);const key=prefix+'/b'+String(hash(p[id])%256).padStart(2,'0');if(!buckets.has(key))buckets.set(key,{});buckets.get(key)[p[id]]=cloneSnapshot(p);}for(const [key,values] of buckets)rows.push({key,data:{[field]:values}});}
 for(const [i,x] of (d.logs||[]).entries())rows.push({key:'logs/'+(x.id||'restored-'+i),data:cloneSnapshot(x)});
 rows.push({key:'docs/index',data:cloneSnapshot(d.docs||[])});
 for(const doc of d.docs||[]){const b=d.docFiles?.[doc.id];if(!b)throw Error('FULL_DOCUMENT_BACKUP_REQUIRED: '+doc.id);const bytes=Uint8Array.from(atob(b.b64),c=>c.charCodeAt(0));rows.push({key:'docfile/'+doc.id,data:{blob:new Blob([bytes],{type:b.mime||doc.mime||'application/octet-stream'})}});}
 for(const x of d.massLogs||[])rows.push({key:'masslog/'+x.id,data:cloneSnapshot(x)});if(d.massLogIndex)rows.push({key:'masslog_meta/index',data:cloneSnapshot(d.massLogIndex)});
 if(new Set(rows.map(r=>r.key)).size!==rows.length)throw Error('DUPLICATE_BACKUP_KEYS');return rows;
}
async function readFile(file){const gzip=new Uint8Array(await file.slice(0,2).arrayBuffer());return readSnapshotPayload(file,gzip[0]===31&&gzip[1]===139);}
return {DATABASE,BACKUP_DATABASE,FORMAT,VERSION,clone:cloneSnapshot,SnapshotSHA256,rowsDigest,blobDigest,encodeBlob,openDatabase,portableRows,readFile,rowText,digest,capture,write,encode,decode,saveBackup,getBackup,readBackup,gates,rollback};
});
