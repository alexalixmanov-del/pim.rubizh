'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
const {fixture}=require('./fixtures/model-v2.cjs'),{supplierReconcile}=require('../lib/supplier-reconciliation-v2.cjs');
function feed(source){return {format:'rubizh.supplier-sources.v2',feeds:[{supplier_id:'supplier',supplier_key:'synthetic',source_sha256:'checked',generated_at_raw:'2026-04-08 14:45',summary:{offers:6},offers:source.variants.map((v,i)=>({offer_id:'id-'+i,supplier_sku:v.supplier_links[0].supplier_sku,identity_fields:[{field:'vendorCode',value:v.supplier_links[0].supplier_sku},{field:'@id',value:'id-'+i}],group_id:'group-1',group_source:'@group_id',color_values:[v.protected.color],size_values:[v.size.raw],quantity:'4',quantity_fields:[{field:'quantity',raw:'4'}],availability_raw:'true',photos:[source.photos.find(p=>p.legacy_product_id===v.legacy_product_id).url]}))}]};}
test('confirmed supplier links use exact scoped primary SKU and preserve source prices and quantities',()=>{
 const {source}=fixture(),document=feed(source),before=JSON.stringify({source,document}),r=supplierReconcile(source,document);
 assert.equal(r.summary.confirmed_supplier_links,6);assert.equal(r.summary.source_model_groups,1);assert.equal(r.summary.missing_supplier_links,0);assert.ok(r.supplier_links.every(l=>l.quantity_verified_current===false));assert.equal(r.ready_for_migration,false);assert.equal(JSON.stringify({source,document}),before);
});
test('unrelated offer IDs and duplicate primary supplier SKU never resolve an ambiguous link',()=>{
 const {source}=fixture(),document=feed(source);document.feeds[0].offers[0].supplier_sku='other';document.feeds[0].offers[0].identity_fields.push({field:'@id',value:source.variants[0].supplier_links[0].supplier_sku});document.feeds[0].offers.push({...document.feeds[0].offers[1],offer_id:'duplicate-primary'});
 const r=supplierReconcile(source,document);assert.equal(r.summary.missing_supplier_links,1);assert.equal(r.summary.ambiguous_supplier_links,1);assert.equal(r.summary.confirmed_supplier_links,4);
});
test('manufacturer groups crossing categories and old cards spanning groups remain review cases',()=>{
 const {source}=fixture(),document=feed(source);source.products[1].canonical_category_id='another-category';document.feeds[0].offers[1].group_id='group-2';const r=supplierReconcile(source,document);assert.equal(r.summary.product_group_conflicts,1);assert.equal(r.summary.model_category_conflicts,1);assert.equal(r.product_groups.find(p=>p.legacy_product_id==='old-black').status,'MULTIPLE_SUPPLIER_GROUPS_REVIEW');assert.ok(r.model_groups.every(g=>!g.ready_for_publication));
});
test('even unique site article and exact photo observations remain UNKNOWN candidates',()=>{
 const {source}=fixture(),document=feed(source);source.products.push({legacy_product_id:'new',canonical_category_id:'clothing_jackets',source_presence:'SITE_ONLY',protected:{source_site_product:{attributes:JSON.stringify({'Артикул':document.feeds[0].offers[0].supplier_sku})}}});source.photos.push({legacy_product_id:'new',url:document.feeds[0].offers[0].photos[0],scope:'site'});source.variants.push({legacy_product_id:'new',legacy_sku:'NEW',supplier_links:[]});
 const r=supplierReconcile(source,document),candidate=r.site_only_candidates[0];assert.equal(r.summary.site_only_unique_article_candidates,1);assert.equal(r.summary.site_only_unique_photo_group_candidates,1);assert.equal(candidate.mapping_status,'UNKNOWN');assert.equal(r.summary.confirmed_supplier_links,6);assert.equal(r.summary.variants_without_supplier_links,1);
});
test('ungrouped offers with the same title never become a source MODEL group',()=>{
 const {source}=fixture(),document=feed(source);for(const o of document.feeds[0].offers){o.group_id=null;o.name='Same jacket';}const r=supplierReconcile(source,document);assert.equal(r.model_groups.length,0);assert.equal(r.summary.matched_without_model_group,6);assert.ok(r.supplier_links.every(l=>l.model_id===null));
});
test('supplier parser rejects entities, preserves grouping provenance, and reads XLSX without executing formulas',()=>{
 const root=path.resolve(__dirname,'..'),result=spawnSync(process.env.PIM_SUPPLIER_PYTHON||'python3',['tests/test-supplier-feeds.py'],{cwd:root,env:{...process.env,PYTHONPATH:(process.env.PIM_SUPPLIER_PYTHON_PATH||'/workspace/pim-python')+(process.env.PYTHONPATH?':'+process.env.PYTHONPATH:'')},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Ran 6 tests/);assert.match(result.stderr,/OK/);
});
