'use strict';
const V2=require('./model-contract-v2.js');
const copy=v=>JSON.parse(JSON.stringify(v));
function supplierReconcile(source,document){
 if(document?.format!=='rubizh.supplier-sources.v2'||!Array.isArray(document.feeds))throw Error('Explicit supplier source document required');
 const errors=[],feeds=new Map(),groups=new Map(),rows=[],sourceProducts=new Map(source.products.map(p=>[p.legacy_product_id,p]));
 const groupsByProduct=new Map(),linksByProduct=new Map(),articleIndex=new Map(),photoIndex=new Map();
 const modelKey=(sid,gid)=>'mdl_supplier_'+V2.key(sid,gid);
 const groupKey=(feed,offer)=>offer.group_id?modelKey(feed.supplier_id,offer.group_id):null;
 for(const feed of document.feeds){
  if(feeds.has(feed.supplier_id))throw Error('Duplicate supplier identity');
  const primary=new Map(),offerIDs=new Set();
  for(const offer of feed.offers){
   if(offerIDs.has(offer.offer_id))errors.push({code:'DUPLICATE_FEED_OFFER',supplier_id:feed.supplier_id,offer_id:offer.offer_id});offerIDs.add(offer.offer_id);
   if(offer.supplier_sku){if(!primary.has(offer.supplier_sku))primary.set(offer.supplier_sku,[]);primary.get(offer.supplier_sku).push(offer);}
   const gid=groupKey(feed,offer),owner=gid||'offer_'+V2.key(feed.supplier_id,offer.offer_id);
   if(gid&&!groups.has(gid))groups.set(gid,{model_id:gid,supplier_id:feed.supplier_id,supplier_key:feed.supplier_key,supplier_group_id:offer.group_id,identity_source:offer.group_source,source_sha256:feed.source_sha256,legacy_product_ids:new Set(),legacy_skus:new Set(),canonical_category_ids:new Set(),unclassified_product_ids:new Set(),offer_ids:new Set(),mapping_status:'SOURCE_GROUP_CONFIRMED',ready_for_publication:false});
   if(gid)groups.get(gid).offer_ids.add(offer.offer_id);
   // Offer primary ID is not silently interpreted as a product article.
   const fields=offer.identity_fields.filter(f=>['vendorCode','article','param:Артикул','Код_товару','Номер_пристрою_(MPN)'].includes(f.field));
   for(const field of fields){if(!field.value)continue;const key=V2.key(feed.supplier_id,offer.offer_id);if(!articleIndex.has(field.value))articleIndex.set(field.value,new Map());articleIndex.get(field.value).set(key,{supplier_id:feed.supplier_id,offer_id:offer.offer_id,model_id:gid,source_field:field.field});}
   for(const url of new Set(offer.photos||[])){if(!photoIndex.has(url))photoIndex.set(url,new Set());photoIndex.get(url).add(owner);}
  }
  feeds.set(feed.supplier_id,{feed,primary});
 }
 const summary={source_variants:source.variants.length,legacy_supplier_links:0,confirmed_supplier_links:0,ambiguous_supplier_links:0,missing_supplier_links:0,variants_without_supplier_links:0,matched_with_model_group:0,matched_without_model_group:0,source_model_groups:groups.size,product_group_conflicts:0,model_category_conflicts:0,models_with_unclassified_products:0,site_only_unique_article_candidates:0,site_only_ambiguous_articles:0,site_only_unique_photo_group_candidates:0};
 for(const v of source.variants){
  if(!v.supplier_links.length)summary.variants_without_supplier_links++;
  for(const link of v.supplier_links){
   summary.legacy_supplier_links++;const entry=feeds.get(link.supplier_id),offers=entry?.primary.get(link.supplier_sku)||[];
   if(offers.length!==1){const ambiguous=offers.length>1;summary[ambiguous?'ambiguous_supplier_links':'missing_supplier_links']++;rows.push({legacy_product_id:v.legacy_product_id,legacy_sku:v.legacy_sku,supplier_id:link.supplier_id,supplier_sku:link.supplier_sku,status:ambiguous?'AMBIGUOUS':'UNKNOWN',model_id:null});continue;}
   const offer=offers[0],feed=entry.feed,gid=groupKey(feed,offer);summary.confirmed_supplier_links++;summary[gid?'matched_with_model_group':'matched_without_model_group']++;
   if(!linksByProduct.has(v.legacy_product_id))linksByProduct.set(v.legacy_product_id,[]);linksByProduct.get(v.legacy_product_id).push({sku:v.legacy_sku,model_id:gid});
   if(gid){
    if(!groupsByProduct.has(v.legacy_product_id))groupsByProduct.set(v.legacy_product_id,new Set());groupsByProduct.get(v.legacy_product_id).add(gid);
    const group=groups.get(gid),p=sourceProducts.get(v.legacy_product_id);group.legacy_product_ids.add(v.legacy_product_id);group.legacy_skus.add(v.legacy_sku);
    if(p?.canonical_category_id)group.canonical_category_ids.add(p.canonical_category_id);else group.unclassified_product_ids.add(v.legacy_product_id);
   }
   rows.push({legacy_product_id:v.legacy_product_id,legacy_sku:v.legacy_sku,supplier_id:link.supplier_id,supplier_sku:link.supplier_sku,offer_id:offer.offer_id,model_id:gid,supplier_group_id:offer.group_id,status:'CONFIRMED_SUPPLIER_LINK',mapping_basis:'EXACT_CONFIGURED_SUPPLIER_SKU',source_sha256:feed.source_sha256,generated_at_raw:feed.generated_at_raw,raw_colors:copy(offer.color_values),raw_sizes:copy(offer.size_values),raw_quantity:offer.quantity,quantity_fields:copy(offer.quantity_fields),quantity_verified_current:false,raw_availability:offer.availability_raw,source_photo_urls:copy(offer.photos),color_mapping_status:'UNKNOWN'});
  }
 }
 const product_groups=[];
 for(const [pid,set] of groupsByProduct){const ids=[...set].sort(),links=linksByProduct.get(pid);if(ids.length>1)summary.product_group_conflicts++;product_groups.push({legacy_product_id:pid,model_ids:ids,status:ids.length===1&&links.every(l=>l.model_id===ids[0])?'EXACT_SUPPLIER_GROUP':'MULTIPLE_SUPPLIER_GROUPS_REVIEW',redirect_target_status:'UNKNOWN'});}
 const group_rows=[...groups.values()].map(g=>{
  const out=Object.fromEntries(Object.entries(g).map(([k,v])=>[k,v instanceof Set?[...v].sort():v]));
  if(out.canonical_category_ids.length>1)summary.model_category_conflicts++;
  if(out.unclassified_product_ids.length)summary.models_with_unclassified_products++;
  return out;
 });
 const sourcePhotoByProduct=new Map();for(const p of source.photos){if(p.scope!=='site')continue;if(!sourcePhotoByProduct.has(p.legacy_product_id))sourcePhotoByProduct.set(p.legacy_product_id,new Set());sourcePhotoByProduct.get(p.legacy_product_id).add(p.url);}
 const site_only_candidates=[];
 for(const p of source.products){
  if(p.source_presence!=='SITE_ONLY')continue;
  const site=p.site_product||p.protected.source_site_product||{};let attrs=site.attributes||{};if(typeof attrs==='string'){try{attrs=JSON.parse(attrs);}catch{attrs={};}}
  const article=attrs['Артикул']??attrs['SKU']??attrs['Код товару']??null;
  const articleMatches=article==null?[]:[...(articleIndex.get(String(article))?.values()||[])];
  if(articleMatches.length===1)summary.site_only_unique_article_candidates++;else if(articleMatches.length>1)summary.site_only_ambiguous_articles++;
  let intersection=null,matchedURLs=0,unknownURLs=0;
  for(const url of sourcePhotoByProduct.get(p.legacy_product_id)||[]){const owners=photoIndex.get(url);if(!owners){unknownURLs++;continue;}matchedURLs++;intersection=intersection===null?new Set(owners):new Set([...intersection].filter(x=>owners.has(x)));}
  const photoGroups=[...(intersection||[])].sort();
  if(photoGroups.length===1&&photoGroups[0].startsWith('mdl_supplier_'))summary.site_only_unique_photo_group_candidates++;
  site_only_candidates.push({legacy_product_id:p.legacy_product_id,canonical_category_id:p.canonical_category_id,article_candidates:copy(articleMatches),photo_group_candidates:photoGroups,matched_photo_urls:matchedURLs,unknown_photo_urls:unknownURLs,mapping_status:'UNKNOWN',reason:'No persisted supplier/SKU link in shop snapshot; exact article/photo observations are review candidates, not an automatic merge'});
 }
 return {schema_version:'2.0',mode:'OFFLINE_EXPLICIT_SUPPLIER_RECONCILIATION',production_modified:false,ready_for_migration:false,freshness_verified:false,summary,errors,feed_summaries:document.feeds.map(f=>({supplier_key:f.supplier_key,source_sha256:f.source_sha256,generated_at_raw:f.generated_at_raw,...f.summary})),supplier_links:rows,model_groups:group_rows,product_groups,site_only_candidates};
}
module.exports={supplierReconcile};
