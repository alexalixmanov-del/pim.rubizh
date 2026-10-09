'use strict';
// Final workflow: G02-preserving exact wire, READY/MODERATION/REJECTED decisions, explicit hide, v3 publisher ACK and cached navigation.
const test=require('node:test'),assert=require('node:assert/strict'),Ajv=require('ajv');
const {createHarness}=require('./isolated-harness.cjs');
const schema=require('../contracts/category-size-export.schema.json'),validate=new Ajv({strict:false}).compile(schema);
const wireSchema=require('../contracts/pim-site-wire-v3.schema.json'),validateWire=new Ajv({strict:false}).compile(wireSchema);
function setup({production=false}={}){
 const h=createHarness({runtime:true,production});
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 const p=h.product({canonical_category_id:'bags_backpacks',category_locked:true,name:'Рюкзак Test Pack'});
 p.variants[0].offers['supplier-a'].source_description='Рюкзак 30 л. Матеріал: нейлон.';
 const out=structuredClone(p.variants[0]);out.sku='RUB-00002';out.color='Чорний';Object.assign(out.offers['supplier-a'],{s:'feed-b',stock:0,photos:['https://rubizh.shop/media/black.webp']});p.variants.push(out);
 h.add(p);h.run('classificationApplyProduct(S.products.get("p-a"));bumpData()');return h;
}
const wire=h=>JSON.parse(JSON.stringify(h.run('pimSiteWire()')));
test('G02: every real SKU in the exact wire keeps pricing v1 fields from the same pricing functions',()=>{
 const h=setup(),w=wire(h);assert.equal(w.products.length,1);const model=w.products[0];
 assert.equal(model.variants.length,2,'out-of-stock real SKU stays in the model');
 for(const v of model.variants){
  for(const k of ['pricing_policy_version','site_price','minimum_sale_price','kit_price','wholesale','price'])assert.ok(Object.hasOwn(v,k),v.sku+' '+k);
  assert.equal(v.pricing_policy_version,1);h.ctx.sku=v.sku;
  assert.deepEqual(v.wholesale,JSON.parse(JSON.stringify(h.run('(()=>{const p=S.products.get("p-a"),x=p.variants.find(v=>v.sku===sku);return tierPrices(calc(p,x).price,S.cfg,p,x);})()'))));
  assert.equal(v.minimum_sale_price,h.run('(()=>{const p=S.products.get("p-a");return discountedPriceFloor(p,p.variants.find(v=>v.sku===sku));})()'));
  assert.equal(v.kit_price,h.run('(()=>{const p=S.products.get("p-a");return kitFloor(p,p.variants.find(v=>v.sku===sku));})()'));
  assert.equal(v.site_price,v.price);assert.equal(v.fulfillment_supplier,'Тестовий постачальник');assert.ok(v.fulfillment_supplier_sku);
 }
 assert.equal(model.pricing_policy_version,1);
 assert.equal(model.variants.find(v=>v.sku==='RUB-00002').availability,'OUT_OF_STOCK');
});
test('G02 audit repro: wrapped simple payload no longer drops variant pricing when normalized variants replace it',()=>{
 const h=setup(),out=JSON.parse(JSON.stringify(h.run('simpleProductPayload(simpleAssess(S.products.get("p-a")))')));
 const missing=['pricing_policy_version','site_price','minimum_sale_price','kit_price','wholesale'].filter(k=>!Object.hasOwn(out.variants[0],k));
 assert.deepEqual(missing,[]);assert.equal(out.variants[0].fulfillment_supplier_sku,'feed-a');
});
test('wire envelope: explicit versions, products[] envelope, 143 categories and every model valid against pinned schema',()=>{
 const h=setup(),w=wire(h);
 assert.equal(validateWire(w),true,JSON.stringify(validateWire.errors));
 for(const k of ['contract_version','version'])assert.equal(w[k],3);
 assert.deepEqual([w.pricing_policy_version,w.category_catalog_version,w.size_catalog_version,w.inventory_policy_version,w.order_policy_version],[1,2,1,1,1]);
 assert.ok(Array.isArray(w.products));assert.equal(w.models,undefined);assert.equal(w.categories.length,143);
 for(const m of w.products){assert.equal(validate(m),true,JSON.stringify(validate.errors));assert.equal(m.id,m.model_id);assert.equal(m.publication_state,'ACTIVE');}
 const text=JSON.stringify(w);for(const secret of ['"sources"','supplier_bindings','"cost"','"payout"','source_description','supplier_cost'])assert.ok(!text.includes(secret),secret);
});
test('colors own separate galleries; Black photos are not copied to the other color',()=>{
 const h=setup(),m=wire(h).products[0],black=m.colors.find(c=>c.variant_skus.includes('RUB-00002')),olive=m.colors.find(c=>c.variant_skus.includes('RUB-00001'));
 assert.notEqual(black.id,olive.id);assert.ok(!olive.photos.includes('https://rubizh.shop/media/black.webp'));assert.deepEqual(m.variants.find(v=>v.sku==='RUB-00002').photos,black.photos);
 for(const c of m.colors)assert.deepEqual(Object.keys(c).sort(),['camouflage','color','id','photo_assignment','photos','variant_skus']);
});
test('decision: READY ignores inventory; missing photos/description/price are REJECTED with readable reasons',()=>{
 const h=setup();assert.equal(h.run('finalDecision(S.products.get("p-a")).state'),'READY');
 h.run('for(const v of S.products.get("p-a").variants)v.offers["supplier-a"].stock=0;bumpData()');assert.equal(h.run('finalDecision(S.products.get("p-a")).state'),'READY');
 h.run('const p=S.products.get("p-a");p.photos=[];for(const v of p.variants){v.photos=[];v.offers["supplier-a"].photos=[];}bumpData()');
 assert.equal(h.run('finalDecision(S.products.get("p-a")).state'),'REJECTED');assert.equal(h.run('finalDecision(S.products.get("p-a")).reasons[0].code'),'NO_PHOTOS');
 assert.equal(h.run('pimSiteWire().products.length'),0);assert.equal(h.run('S.products.get("p-a").archived'),false,'rejection never archives');
});
test('decision: duplicate SKU across models is INVALID_SKU; same size and color on different SKU is not a duplicate',()=>{
 const h=setup();h.run('const v=S.products.get("p-a").variants[1];v.color="Олива";v.size="";bumpData()');assert.notEqual(h.run('finalDecision(S.products.get("p-a")).state'),'REJECTED');
 const q=h.product({id:'p-b',canonical_category_id:'bags_backpacks',category_locked:true});h.add(q);h.run('bumpData()');
 assert.equal(h.run('finalDecision(S.products.get("p-b")).reasons.map(r=>r.code).join()'),'INVALID_SKU');
});
test('decision: unconfirmed category and unknown color go to MODERATION, not REJECTED',()=>{
 const h=setup();h.run('const p=S.products.get("p-a");p.canonical_category_id=null;p.category_locked=false;bumpData()');
 assert.equal(h.run('finalDecision(S.products.get("p-a")).state'),'MODERATION');assert.equal(h.run('finalDecision(S.products.get("p-a")).reasons[0].code'),'category');
 assert.ok(h.run('finalQueue().some(t=>t.kind==="category"&&t.ids.includes("p-a"))'));
});
test('explicit hide only: archived published model is hidden; MODERATION or absence is never a hide',()=>{
 const h=setup(),published={'p-a':{hidden:false},'p-gone':{hidden:false}};h.ctx.published=published;
 h.run('const p=S.products.get("p-a");p.canonical_category_id=null;p.category_locked=false;bumpData()');
 assert.deepEqual(JSON.parse(JSON.stringify(h.run('pimSiteWire({published}).hide_ids'))),[]);
 h.run('S.products.get("p-a").archived=true;bumpData()');assert.deepEqual(JSON.parse(JSON.stringify(h.run('pimSiteWire({published}).hide_ids'))),['p-a']);
});
function mockSite(h,{caps=true,dropResult=false}={}){
 const calls=[];h.ctx.siteCall=async(url,opt)=>{calls.push({url,body:opt.body?JSON.parse(opt.body):null});const path=new URL(url).pathname;
  if(path.endsWith('/pim/status'))return {ok:true,json:async()=>({ok:true,capabilities:caps?{contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products'}:{pricing_policy_version:1}})};
  const b=JSON.parse(opt.body),last=b.chunk_index===b.chunk_count-1;
  return {ok:true,json:async()=>last?{ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:'COMMITTED',contract_version:3,catalog_revision:'rev-1',results:(dropResult?b.products.slice(1):b.products).map(p=>({id:p.id,status:'created',contract_version:3})),hidden_ids:b.hide_ids}:{ok:true,batch_id:b.batch_id,chunk_index:b.chunk_index,status:'STAGED'}};};
 h.run('PRODUCTION_MIGRATION.state="ready";FINAL_NET.fetch=siteCall;S.cfg.siteApi={url:"https://shop.invalid/api",key:"k"};requireBatchBackup=async()=>({local:true});');return calls;
}
test('publisher refuses while production migration is pending',async()=>{const h=setup({production:true});h.run('S.cfg.siteApi={url:"https://shop.invalid/api",key:"k"}');await assert.rejects(h.run('sitePublish("delta")'),/MIGRATION_PENDING/);});
test('publisher refuses without negotiated contract v3 and sends nothing to /pim/sync',async()=>{
 const h=setup({production:true}),calls=mockSite(h,{caps:false});
 await assert.rejects(h.run('sitePublish("delta")'),/SYNC_DISABLED/);assert.ok(calls.every(c=>!c.url.endsWith('/pim/sync')));
});
test('publisher sends the exact wire, records only acknowledged models and is idempotent on repeat',async()=>{
 const h=setup({production:true}),calls=mockSite(h);
 const r=await h.run('sitePublish("delta")');assert.equal(r.sent,1);
 const sync=calls.filter(c=>c.url.endsWith('/pim/sync'));assert.equal(sync.length,1);const body=sync[0].body;
 assert.equal(body.contract_version,3);assert.equal(body.products[0].variants[0].pricing_policy_version,1);assert.equal(body.categories.length,143);assert.deepEqual(body.hide_ids,[]);
 assert.deepEqual(Object.keys(await h.run('Store.get("site/v3/hashes")')),['p-a']);
 const again=await h.run('sitePublish("delta")');assert.equal(again.nothing,true);assert.equal(calls.filter(c=>c.url.endsWith('/pim/sync')).length,1);
});
test('incomplete ACK is not recorded as published',async()=>{
 const h=setup({production:true});mockSite(h,{dropResult:true});
 await assert.rejects(h.run('sitePublish("delta")'),/не все/);assert.equal(await h.run('Store.get("site/v3/hashes")')??null,null);
});
test('opening screens does not recalculate the catalog when data did not change',()=>{
 const h=setup();
 h.run('var calls=0;const old=classificationAvailability;classificationAvailability=function(){calls++;return old.apply(this,arguments);};');
 for(const v of ['ready','moderation','rejected'])h.run('S.view="'+v+'";FINAL_UI.hashes={};finalRenderView()');
 const first=h.run('calls');for(const v of ['ready','moderation','rejected','ready'])h.run('S.view="'+v+'";finalRenderView()');
 assert.equal(h.run('calls'),first,'navigation recalculations = 0');
});
test('committed exact wire fixture is byte-identical to the shipped exporter output',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'wire-')),'wire.json');execFileSync(process.execPath,[path.join(__dirname,'../tools/export-wire-fixture.cjs'),tmp]);
 assert.equal(fs.readFileSync(tmp,'utf8'),fs.readFileSync(path.join(__dirname,'../contracts/fixtures/pim-site-wire-v3.exact.json'),'utf8'));
 const w=JSON.parse(fs.readFileSync(tmp,'utf8'));assert.equal(validateWire(w),true,JSON.stringify(validateWire.errors));for(const m of w.products)assert.equal(validate(m),true);
});
test('new supplier position without photos becomes a rejected-import record, not a product; photos later restore it',()=>{
 const h=setup();
 h.run(`S.content.set('ck-x',{k:'ck-x',ph:[],d:'Опис без фото',a:{}});S.queue.set('supplier-a|X1',{k:'supplier-a|X1',sup:'supplier-a',s:'X1',n:'Ліхтар X',m:'',sz:'',c:'',attrs:{}});S.content.set('ck-g',{k:'ck-g',ph:[],d:'',a:{}});S.queue.set('supplier-a|G1',{k:'supplier-a|G1',sup:'supplier-a',s:'G1',n:'',m:'',sz:'',c:'',attrs:{}});`);
 h.run(`contentKey=function(sup,m,n){return n?'ck-x':'ck-g';};`);
 assert.equal(h.run('buildGroups([...S.queue.values()]).length'),2,'grouping screens unchanged outside import');
 h.run('FINAL_UI.importing=true');const groups=h.run('buildGroups([...S.queue.values()]).length');assert.equal(groups,0,'automatic import may not create a product');
 assert.equal(h.run('S.queue.get("supplier-a|X1").rejected_import.reason'),'NO_PHOTOS');assert.equal(h.run('S.queue.get("supplier-a|G1").rejected_import.reason'),'GARBAGE');
 const before=h.run('S.products.size');h.run('bumpData()');assert.equal(h.run('S.products.size'),before);
 h.run(`S.content.get('ck-x').ph=['https://rubizh.shop/media/x.webp']`);assert.equal(h.run('buildGroups([S.queue.get("supplier-a|X1")]).length'),1);h.run('FINAL_UI.importing=false');assert.equal(h.run('S.queue.get("supplier-a|X1").rejected_import'),undefined);
});
test('existing zero-photo cleanup: read-only preview, stale protection, archive (never delete) after confirmation',async()=>{
 const h=setup({production:true});h.run('PRODUCTION_MIGRATION.state="ready";requireBatchBackup=async()=>({local:true});persist=async()=>true;');
 h.run('const p=S.products.get("p-a");p.photos=[];for(const v of p.variants){v.photos=[];v.offers["supplier-a"].photos=[];}bumpData()');
 const plan=h.run('finalZeroPhotoPreview()');assert.equal(plan.rows.length,1);assert.deepEqual([...plan.rows[0].skus],['RUB-00001','RUB-00002']);assert.equal(h.run('S.products.get("p-a").archived'),false,'preview is read-only');
 h.ctx.plan=plan;h.run('S.products.get("p-a").note="changed";bumpData()');await assert.rejects(h.run('finalZeroPhotoArchive(plan)'),/STALE_PREVIEW/);
 h.ctx.plan=h.run('finalZeroPhotoPreview()');assert.equal(await h.run('finalZeroPhotoArchive(plan)'),1);
 assert.equal(h.run('S.products.get("p-a").archived'),true);assert.equal(h.run('S.products.has("p-a")'),true);assert.equal(h.run('S.products.get("p-a").variants.length'),2);
});
test('wire carries size metadata as text: a classifier-normalised numeric size (41) is exported as "41"',()=>{
 const h=setup();h.run('const p=S.products.get("p-a");Object.assign(p.variants[0],{size:"41",size_raw:"41",size_display:"41",size_normalized:41,size_system:"EU",size_status:"EXACT_SIZE"});bumpData()');
 const v=wire(h).products[0].variants.find(x=>x.sku===h.run('S.products.get("p-a").variants[0].sku'));
 assert.equal(v.size_normalized,'41');for(const f of ['size_raw','size_display','size_normalized','size_system','size_type','size_alpha','size_fit','size_height'])assert.ok(v[f]==null||typeof v[f]==='string',f);
 assert.equal(h.run('S.products.get("p-a").variants[0].size_normalized'),41,'stored PIM data unchanged');
});
