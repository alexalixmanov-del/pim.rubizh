'use strict';
// AUTOPRICES PREVIEW: a fresh supplier file is compared SKU by SKU against the current prices from the import preview;
// nothing is written, autoprices stay OFF, and cancelling leaves the catalog byte-identical.
const test=require('node:test'),assert=require('node:assert/strict'),{createHarness}=require('./isolated-harness.cjs');
async function setup(){
 const h=createHarness({runtime:true});h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();');await h.run('Store.init()');
 const p=h.product({category_locked:true,canonical_category_id:'clothing_pants',name:'Штани Test'});p.variants[0].size='48';Object.assign(p.variants[0].offers['supplier-a'],{s:'feed-a',cost:1000,payout:1000,rrp:null,rawAvailability:'есть'});h.add(p);
 h.run('markAllDirty()');await h.run('persist()');return h;
}
async function preview(h,cost){h.ctx.rows=[['SKU','Name','Size','Cost'],['feed-a','Штани Test','48',cost]];h.run('S.imp={sup:"supplier-a",file:"fresh.csv",rows,hdr:0,map:{sku:0,name:1,size:2,cost:3}}');await h.run('doImport()');return JSON.parse(h.run('JSON.stringify(autopricesPreview())'));}
test('preview reports current vs proposed price, rule, delta, margin and blockers per SKU, and writes nothing',async()=>{
 const h=await setup(),before=h.run('JSON.stringify([...S.products.values()])');
 const small=await preview(h,1050);assert.equal(small.rows[0].blocker,null);assert.ok(small.rows[0].delta_pct>0);h.run('cancelImport(true)');
 const r=await preview(h,1200),row=r.rows.find(x=>x.sku===h.run('[...S.products.values()][0].variants[0].sku'));
 assert.equal(r.mode,'PREVIEW');assert.equal(r.autoprices_enabled,false);assert.equal(r.writes,0);
 assert.equal(row.cost,1200);assert.ok(row.current_price>0&&row.proposed_price>row.current_price,JSON.stringify(row));assert.ok(row.delta_pct>0);assert.equal(row.rule,'30%');assert.ok(row.margin_pct>=30-0.01,JSON.stringify(row));assert.equal(row.blocker,'PRICE_JUMP_REVIEW','a 20% cost jump is held for the owner');
 assert.equal(r.summary.affected,1);assert.equal(r.summary.blocked,1);assert.equal(r.summary.price_decreases,0);assert.equal(r.summary.top_increases.length,1);assert.equal(r.summary.missing_rrp,1);
 assert.match(h.run('autopricesPreviewCsv()'),/^supplier,sku,supplier_sku,cost,rrp,current_price,proposed_price,rule,delta_pct,margin_pct,blocker\n/);
 h.run('cancelImport(true)');assert.equal(h.run('JSON.stringify([...S.products.values()])'),before,'cancel restores the catalog exactly');
});
test('preview without an import preview refuses; a missing cost is a blocker, never a fake price',async()=>{
 const h=await setup();assert.throws(()=>h.run('autopricesPreview()'),/AUTOPRICES_PREVIEW_REQUIRES_IMPORT_PREVIEW/);
 const r=await preview(h,'');const row=r.rows[0];assert.ok(row);h.run('cancelImport(true)');
 assert.ok(row.proposed_price==null||row.blocker==null||/MISSING_COST/.test(row.blocker));
});
