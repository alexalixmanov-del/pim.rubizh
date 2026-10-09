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
