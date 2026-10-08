'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHarness}=require('./isolated-harness.cjs');
test('v2 mapping persists in IndexedDB and backup without changing source products or taxonomy',async()=>{
 const h=createHarness();h.ctx.setTimeout=setTimeout;h.ctx.clearTimeout=clearTimeout;h.add(h.product());await h.run('Store.init();markAllDirty();persist()');const before=h.run('stableValue105([...S.products.values()])');
 h.run('var registry=RubizhContractV2.draft(v2Source())');const r=await h.run('v2Apply(registry)');assert.equal(r.ready_for_migration,false);
 const saved=await h.run('Store.get("meta/config")');assert.equal(saved.model_schema_version,2);assert.equal(saved.model_registry_v2.variant_mappings.length,1);assert.equal(h.run('stableValue105([...S.products.values()])'),before);
 const backup=await h.run('Store.get("safety/before_model_v2")');assert.equal(backup.products.length,1);assert.equal(backup.cfg.model_registry_v2,undefined);
 assert.equal(h.run('backupData().cfg.model_registry_v2.schema_version'),'2.0');
});
test('legacy site POST is blocked after v2 activation',async()=>{const h=createHarness();h.run('S.cfg.model_schema_version=2;var networkCalls=0;siteFetch=async()=>{networkCalls++;return {ok:true};}');await h.run('sitePublish("delta")');assert.equal(h.run('networkCalls'),0);assert.match(h.run('S.cfg.siteSync.lastError'),/schema 2.0/);});
test('new PIM screen exposes source, draft, dry-run, export and rollback',()=>{const h=createHarness(),html=h.run('vModelV2()');for(const act of ['v2Source','v2Draft','v2Check','v2Export','v2Rollback'])assert.ok(html.includes('data-act="'+act+'"'));assert.ok(h.run('vDataModel()').includes('data-view="modelV2"'));});
test('an expired supplier availability stays unverified in v2 instead of proving out of stock',()=>{
 const h=createHarness();h.add(h.product());h.run('S.cfg.freshHours=1;S.products.get("p-a").variants[0].offers["supplier-a"].at=Date.now()-7200000;');
 const source=h.run('v2Source()');assert.equal(source.variants[0].stock_stale,true);assert.equal(source.variants[0].availability_unknown,true);
});
test('failed persistence rolls registry back and keeps source data',async()=>{const h=createHarness();await h.run('Store.init()');h.add(h.product());const before=h.run('stableValue105([...S.products.values()])');h.run('persist=async()=>false;var registry=RubizhContractV2.draft(v2Source())');await assert.rejects(()=>h.run('v2Apply(registry)'),/не збережено/);assert.equal(h.run('S.cfg.model_registry_v2'),undefined);assert.equal(h.run('stableValue105([...S.products.values()])'),before);});
test('registry rollback never discards later supplier or price updates',async()=>{const h=createHarness();h.ctx.setTimeout=setTimeout;h.ctx.clearTimeout=clearTimeout;await h.run('Store.init()');h.add(h.product());await h.run('markAllDirty();persist();v2Apply(RubizhContractV2.draft(v2Source()))');h.run('S.products.get("p-a").variants[0].offers["supplier-a"].cost=1777;markProduct(S.products.get("p-a"));');await h.click('v2Rollback');assert.equal(h.run('S.cfg.model_registry_v2'),undefined);assert.equal(h.run('S.products.get("p-a").variants[0].offers["supplier-a"].cost'),1777);});
