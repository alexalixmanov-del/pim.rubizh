'use strict';
const V2=require('./model-contract-v2.js');
function reconcile(pim,site){
 const full=site?.export_version==='rubizh-model-source-v1'&&site.snapshot?.tables;
 const tables=full?site.snapshot.tables:null;
 const products=tables?tables.products||[]:site.items||[];
 const variants=tables?tables.variants||[]:products.flatMap(p=>(p.variants||[]).map(v=>({...v,product_id:p.id})));
 const relations=new Map((tables?.rubizh_product_categories||[]).map(r=>[r.product_id,r.canonical_category_id??r.category_id]));
 const siteProducts=new Map(products.map(p=>[p.id,p])),pimSKUs=new Map(),siteSKUs=new Map(),errors=[],rows=[];
 for(const v of pim.variants||[]){if(pimSKUs.has(v.legacy_sku))errors.push({code:'DUPLICATE_PIM_SKU',sku:v.legacy_sku});pimSKUs.set(v.legacy_sku,v);}
 for(const v of variants){if(siteSKUs.has(v.sku))errors.push({code:'DUPLICATE_SITE_SKU',sku:v.sku});siteSKUs.set(v.sku,v);}
 const summary={pim_skus:pimSKUs.size,site_skus:siteSKUs.size,matched_skus:0,site_only_skus:0,pim_only_skus:0,product_owner_conflicts:0,price_differences:0,stock_differences:0};
 for(const [sku,v] of siteSKUs){
  const old=pimSKUs.get(sku),p=siteProducts.get(v.product_id);let data=v.data;
  if(typeof data==='string'){try{data=JSON.parse(data);}catch{errors.push({code:'INVALID_SITE_VARIANT_DATA',sku});data={};}}
  if(!old){summary.site_only_skus++;rows.push({sku,status:'SITE_ONLY',legacy_product_id:v.product_id});continue;}
  summary.matched_skus++;const ownerMatch=old.legacy_product_id===v.product_id;
  if(!ownerMatch){summary.product_owner_conflicts++;errors.push({code:'PRODUCT_OWNER_CONFLICT',sku,pim_product_id:old.legacy_product_id,site_product_id:v.product_id});}
  const sitePrice=v.price??data?.price??null,siteStock=v.stock??data?.stock??null;
  const equal=(a,b)=>a===null||b===null?a===b:String(a)===String(b);
  if(!equal(old.price,sitePrice))summary.price_differences++;if(!equal(old.stock,siteStock))summary.stock_differences++;
  rows.push({sku,status:ownerMatch?'EXACT_SKU_AND_PRODUCT':'OWNER_CONFLICT',legacy_product_id:v.product_id,legacy_variant_id:v.variant_id??data?.variant_id??null,site_variant_primary_key:sku,legacy_url:p?.slug?'/product/'+p.slug:null,canonical_category_id:relations.get(v.product_id)??p?.canonical_category_id??null,pim_price:old.price,site_price:sitePrice,pim_stock:old.stock,site_stock:siteStock});
 }
 for(const sku of pimSKUs.keys())if(!siteSKUs.has(sku))summary.pim_only_skus++;
 return {schema_version:V2.VERSION,mode:'read-only-reconciliation',production_modified:false,full_site_snapshot:!!full,ready_for_migration:false,summary,errors,rows,protected_site_taxonomy:full?Object.fromEntries(['rubizh_canonical_categories','rubizh_category_aliases','rubizh_category_decisions','rubizh_supplier_category_rules'].map(k=>[k,tables[k]||[]])):null,required_next_steps:['Resolve unmatched SKU and price/stock differences without overwriting either source','Use exact site canonical IDs and preserve alias/rule/lock metadata','Confirm model/color/SKU/photo registry in PIM','Run full migration validator before any shop APPLY']};
}
module.exports={reconcile};
