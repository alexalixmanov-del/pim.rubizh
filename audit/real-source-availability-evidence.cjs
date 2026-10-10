'use strict';
// Read-only evidence for STATUS-policy XML feeds: which raw availability signal each offer carries, what the shipped
// parser extracts, and what the approved supplier policy resolves — with real SKU samples. No network, no writes
// except the report file. Usage: node audit/real-source-availability-evidence.cjs entries.json report.json
const fs=require('node:fs'),crypto=require('node:crypto');
const {createHarness,appRequire}=require('../app/tests/isolated-harness.cjs');
const Inventory=require('../app/lib/inventory-policy.js');
function evidence(entry){
 const h=createHarness({runtime:true});h.ctx.DOMParser=appRequire('linkedom').DOMParser;
 const bytes=fs.readFileSync(entry.file);h.ctx.ymlText=bytes.toString('utf8');
 const {rows}=h.run('parseYml(ymlText)'),head=rows[0],col=n=>head.indexOf(n),policy=Inventory.policy({id:entry.supplier_id});
 const count=(m,k)=>{m[k]=(m[k]||0)+1;},attr={},param={},parsed={},status={},pairs={},samples={};
 for(const r of rows.slice(1)){
  const a=r[col('offer@available (сирий)')]||'(no attribute)',p=r[col('Параметр наявності (сирий)')]||'(no param)',raw=r[col(policy.source_column)]??'';
  const inv=Inventory.resolve(policy,{s:r[0],rawAvailability:raw,inventory_source_column:policy.source_column,stock:Inventory.quantity(r[col('Stock')])});
  count(attr,a);count(param,p);count(parsed,raw===''?'(empty)':raw);count(status,inv.availability_status);
  const key=a+' | '+p+' → '+inv.availability_status;count(pairs,key);
  (samples[key]||(samples[key]=[])).length<3&&samples[key].push({sku:r[0],offer_id:r[col('ID предложения')],raw_available:a,raw_param:p,parsed_column:policy.source_column,parsed_value:raw,status:inv.availability_status,stock_quantity:inv.stock_quantity});
 }
 const conflicts=Object.entries(pairs).filter(([k])=>/В наявності|В наличии/.test(k)&&!/IN_STOCK$/.test(k)||/Немає|Нет в/.test(k)&&!/OUT_OF_STOCK$/.test(k)).reduce((n,[,c])=>n+c,0);
 return {supplier_id:entry.supplier_id,source_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),policy_id:policy.id,policy_mode:policy.mode,policy_confirmed:!!policy.confirmed,
  RAW_SIGNAL_SOURCE:'offer@available → column «'+policy.source_column+'» (есть/нет); Наличие/Наявність param kept as separate raw evidence, not used by the policy',
  RAW_VALUES:{offer_available:attr,availability_param:param},PARSED_VALUES:parsed,PARSED_STATUS_COUNTS:status,
  IN_STOCK:status.IN_STOCK||0,OUT_OF_STOCK:status.OUT_OF_STOCK||0,UNKNOWN:status.UNKNOWN||0,PREORDER:status.PREORDER||0,
  PARAM_CONFLICTS_WITH_STATUS:conflicts,SIGNAL_COMBINATIONS:pairs,SAMPLES:samples};
}
if(require.main===module){const entries=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=entries.map(evidence);fs.writeFileSync(process.argv[3],JSON.stringify(out,null,2)+'\n');for(const e of out)console.log(e.supplier_id,JSON.stringify(e.PARSED_STATUS_COUNTS),'conflicts',e.PARAM_CONFLICTS_WITH_STATUS);}
module.exports={evidence};
