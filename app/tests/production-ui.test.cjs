'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
test('production migration redraw preserves original view, search and main nodes',()=>{
 const h=createHarness({runtime:true,production:true}),view=h.document.querySelector('#view'),search=h.document.querySelector('#gs'),main=h.document.querySelector('#main');
 for(const state of ['pending','blocked','rolled-back','pending']){h.ctx.state=state;h.run('PRODUCTION_MIGRATION.state=state;render();render()');assert.equal(h.document.querySelector('#view'),view);assert.equal(h.document.querySelector('#gs'),search);assert.equal(h.document.querySelector('#main'),main);}
 assert.match(view.textContent,/профіл/);assert(view.querySelector('[data-release-action="preview"]').hasAttribute('disabled'));
});
test('nonempty production copy enables preview and backup rendering keeps the shell',()=>{
 const h=createHarness({runtime:true,production:true});h.add(h.product());h.run('render();render()');assert(!h.document.querySelector('[data-release-action="preview"]').hasAttribute('disabled'));
 const view=h.document.querySelector('#view');h.run('S.view="backup";PRODUCTION_MIGRATION.backupId="test-backup";render();render()');assert.equal(h.document.querySelector('#view'),view);assert.equal(h.document.querySelectorAll('[data-release-action="rollback"]').length,1);assert.equal(h.document.querySelector('#gs').id,'gs');
});
test('pending migration does not build the hidden full publication page',()=>{const h=createHarness({runtime:true,production:true});h.add(h.product());h.run('S.view="simplePublication";vSimplePublication=()=>{throw Error("HIDDEN_PAGE_EVALUATED")};PRODUCTION_MIGRATION.state="pending";render();render()');assert.match(h.document.querySelector('#view').textContent,/міграція/);assert.throws(()=>h.run('PRODUCTION_MIGRATION.state="ready";render()'),/HIDDEN_PAGE_EVALUATED/);});
test('view preparation warms existing assessments without modifying catalog or permissions',async()=>{const h=createHarness({runtime:true,production:true});h.add(h.product());h.run('requestAnimationFrame=()=>{};render=()=>{};S.view="simplePublication";PRODUCTION_MIGRATION.state="ready"');const before=h.run('stableValue105({products:[...S.products.values()],cfg:S.cfg})'),decisions=h.run('stableValue105(simpleDecisions())'),version=h.run('_dataVer');await h.run('productionWarmView()');assert.equal(h.run('stableValue105({products:[...S.products.values()],cfg:S.cfg})'),before);assert.equal(h.run('stableValue105(simpleDecisions())'),decisions);assert.equal(h.run('_dataVer'),version);assert.equal(h.run('PRODUCTION_MIGRATION.state'),'ready');assert.equal(h.run('PRODUCTION_MIGRATION.progress'),'');});
