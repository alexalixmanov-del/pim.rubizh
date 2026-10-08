'use strict';
// Reads a private classified copy; executes only local calculations, never import/apply/persist/network.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{createHarness}=require('../../app/tests/isolated-harness.cjs');
const file=process.argv[2]||'/workspace/private/pim-data/category-size-rc-candidate.json';
const out=process.argv[3]||'/tmp/pim-inventory-payment-facts.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(file),data=JSON.parse(bytes),h=createHarness({runtime:true});
h.ctx.backup=data;h.run('loadStateData(backup);');
const facts=JSON.parse(JSON.stringify(h.run('[...S.products.values()].flatMap(p=>p.variants.map(v=>{const z=simpleVariant(p,v);return {product_id:p.id,sku:v.sku,size_status:v.size_status,size_confidence_tier:v.size_confidence_tier,source_binding_status:v.source_binding_status,price:z.site_price,margin_blocked:z.margin_blocked,archived:!!p.archived,pub:!!p.pub};}))')));
if(sha(fs.readFileSync(file))!==sha(bytes))throw Error('Private copy changed');
fs.writeFileSync(out,JSON.stringify({candidate_sha256:sha(bytes),runtime_html_sha256:sha(fs.readFileSync(path.join(__dirname,'../../app/rubizh_pim.html'))),facts,input_unchanged:true,import_calls:0,persist_calls:0,production_writes:0}));
console.log(JSON.stringify({rows:facts.length,input_unchanged:true,production_writes:0}));
