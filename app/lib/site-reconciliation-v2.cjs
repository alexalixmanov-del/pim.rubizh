'use strict';
const crypto=require('node:crypto'),V2=require('./model-contract-v2.js');
const copy=v=>JSON.parse(JSON.stringify(v));
const taxonomyTables=['categories','rubizh_product_categories','rubizh_canonical_categories','rubizh_category_aliases','rubizh_category_decisions','rubizh_supplier_category_rules'];
function digestPHP(rows){
 // The existing PHP exporter uses JSON_UNESCAPED_UNICODE, while escaping slashes.
 return crypto.createHash('sha256').update(JSON.stringify(rows).replace(/\//g,'\\/').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')).digest('hex');
}
function decimal(v){if(v===null||v===undefined)return null;const s=String(v);if(!/^\d+(?:\.\d+)?$/.test(s))return s;let [a,b='']=s.split('.');a=a.replace(/^0+(?=\d)/,'');b=b.replace(/0+$/,'');return a+(b?'.'+b:'');}
function equal(a,b){return decimal(a)===decimal(b);}
function availabilityLabel(v){return ({in:'IN',in_stock:'IN',IN_STOCK:'IN',out:'OUT',out_of_stock:'OUT',OUT_OF_STOCK:'OUT',order:'ORDER',preorder:'ORDER',PREORDER:'ORDER'})[v]??v??null;}
function reconcile(pim,site){
 const full=site?.export_version==='rubizh-model-source-v1'&&site.snapshot?.tables;
 const tables=full?site.snapshot.tables:null,errors=[],warnings=[];
 const products=tables?tables.products||[]:site.items||[];
 const variants=tables?tables.variants||[]:products.flatMap(p=>(p.variants||[]).map(v=>({...v,product_id:p.id})));
 const parse=(v,code,ref)=>{if(v===null||v===undefined||v==='')return {};if(typeof v==='object'&&!Array.isArray(v))return v;try{const out=JSON.parse(v);if(out&&typeof out==='object'&&!Array.isArray(out))return out;}catch{}errors.push({code,ref});return {};};
 const index=(rows,field,code)=>{const out=new Map();for(const r of rows){const k=r[field];if(k===null||k===undefined||k===''){errors.push({code:'MISSING_'+code});continue;}if(out.has(k))errors.push({code:'DUPLICATE_'+code,ref:k});else out.set(k,r);}return out;};
 const siteProducts=index(products,'id','SITE_PRODUCT'),pimProducts=index(pim.products||[],'legacy_product_id','PIM_PRODUCT');
 const pimSKUs=index(pim.variants||[],'legacy_sku','PIM_SKU'),siteSKUs=index(variants,'sku','SITE_SKU');
 const relationRows=index(tables?.rubizh_product_categories||[],'product_id','CATEGORY_RELATION');
 const relations=new Map([...relationRows].map(([id,r])=>[id,r.canonical_category_id??r.category_id]));
 const categories=index(tables?.rubizh_canonical_categories||[],'category_id','SITE_CATEGORY');
 const nonleaves=new Set([...categories.values()].map(c=>c.parent_id).filter(Boolean));
 const integrity={fingerprints_present:!!site.snapshot?.fingerprints,verified_tables:0,all_verified:false};
 if(full&&integrity.fingerprints_present){for(const [name,rows] of Object.entries(tables)){if(digestPHP(rows)!==site.snapshot.fingerprints[name])errors.push({code:'SITE_FINGERPRINT_MISMATCH',ref:name});else integrity.verified_tables++;}integrity.all_verified=integrity.verified_tables===Object.keys(tables).length;}
 for(const c of categories.values()){
  if(c.parent_id&&!categories.has(c.parent_id))errors.push({code:'CATEGORY_PARENT_MISSING',ref:c.category_id});
  const seen=new Set([c.category_id]);let current=c;while(current.parent_id&&categories.has(current.parent_id)){if(seen.has(current.parent_id)){errors.push({code:'CATEGORY_CYCLE',ref:c.category_id});break;}seen.add(current.parent_id);current=categories.get(current.parent_id);}
 }
 for(const r of relationRows.values()){
  const category=relations.get(r.product_id);
  if(!siteProducts.has(r.product_id))errors.push({code:'ORPHAN_CATEGORY_RELATION',ref:r.product_id});
  if(categories.size&&!categories.has(category))errors.push({code:'UNKNOWN_CANONICAL_CATEGORY',ref:r.product_id});
  if(nonleaves.has(category))errors.push({code:'NONLEAF_CANONICAL_CATEGORY',ref:r.product_id});
 }
 const product_rows=[],rows=[],photo_rows=[];
 const summary={pim_products:pimProducts.size,site_products:siteProducts.size,matched_products:0,site_only_products:0,pim_only_products:0,pim_skus:pimSKUs.size,site_skus:siteSKUs.size,matched_skus:0,site_only_skus:0,pim_only_skus:0,product_owner_conflicts:0,price_differences:0,stock_differences:0,price_compared:0,stock_compared:0,stock_unknown_both:0,stock_unknown_one_side:0,size_differences:0,color_differences:0,barcode_differences:0,raw_availability_compared:0,raw_availability_differences:0,internal_category_products:0};
 for(const [id,p] of siteProducts){
  const old=pimProducts.get(id),cat=relations.get(id)??p.canonical_category_id??null;
  const legacy_url=p.slug?'/product/'+p.slug:null;
  if(old)summary.matched_products++;else summary.site_only_products++;
  if(categories.get(cat)?.status&&categories.get(cat).status!=='active')summary.internal_category_products++;
  if(full&&!cat)errors.push({code:'PRODUCT_CATEGORY_MISSING',ref:id});
  if(old?.canonical_category_id&&old.canonical_category_id!==cat)errors.push({code:'PIM_SITE_CATEGORY_CONFLICT',ref:id,pim:old.canonical_category_id,site:cat});
  product_rows.push({legacy_product_id:id,status:old?'EXACT_PRODUCT_ID':'SITE_ONLY',legacy_url,canonical_category_id:cat,model_id:null,color_id:null,mapping_status:'UNKNOWN'});
 }
 for(const [id,p] of pimProducts)if(!siteProducts.has(id)){summary.pim_only_products++;product_rows.push({legacy_product_id:id,status:'PIM_ONLY',legacy_urls:copy(p.legacy_urls||[]),canonical_category_id:p.canonical_category_id??null,model_id:null,color_id:null,mapping_status:'UNKNOWN'});}
 for(const [sku,v] of siteSKUs){
  const old=pimSKUs.get(sku),p=siteProducts.get(v.product_id),data=parse(v.data,'INVALID_SITE_VARIANT_DATA',sku);
  if(!p)errors.push({code:'ORPHAN_SITE_VARIANT',ref:sku});
  const sitePrice=v.price??data.price??null,siteStock=v.stock??data.stock??null;
  const siteRawSize=data.size_native??data.size_raw??v.size??null;
  if(!old){summary.site_only_skus++;rows.push({sku,status:'SITE_ONLY',legacy_product_id:v.product_id,legacy_variant_id:v.variant_id??data.variant_id??null,site_variant_primary_key:sku,site_price:sitePrice,site_stock:siteStock,site_size:{raw:siteRawSize,normalized:data.size_letter??v.size??null},legacy_url:p?.slug?'/product/'+p.slug:null,canonical_category_id:relations.get(v.product_id)??p?.canonical_category_id??null});continue;}
  summary.matched_skus++;const ownerMatch=old.legacy_product_id===v.product_id;
  if(!ownerMatch){summary.product_owner_conflicts++;errors.push({code:'PRODUCT_OWNER_CONFLICT',sku,pim_product_id:old.legacy_product_id,site_product_id:v.product_id});}
  if(old.price!==null&&old.price!==undefined&&sitePrice!==null){summary.price_compared++;if(!equal(old.price,sitePrice))summary.price_differences++;}
  else if(!equal(old.price,sitePrice))summary.price_differences++;
  let stock_status='KNOWN_BOTH';
  if(old.stock==null&&siteStock==null){summary.stock_unknown_both++;stock_status='UNKNOWN_BOTH';}
  else if(old.stock==null||siteStock==null){summary.stock_unknown_one_side++;stock_status='UNKNOWN_ONE_SIDE';summary.stock_differences++;}
  else{summary.stock_compared++;if(!equal(old.stock,siteStock))summary.stock_differences++;}
  if(!equal(old.size?.normalized,v.size??null))summary.size_differences++;
  if((old.protected?.color??null)!==(v.color??null))summary.color_differences++;
  if((old.protected?.barcode??null)!==(v.barcode??null))summary.barcode_differences++;
  const offer=old.supplier_links?.find(o=>o.supplier_id===old.selected_supplier_id)??(old.supplier_links?.length===1?old.supplier_links[0]:null);
  const rawAvailability=offer?.raw?.availability??null;
  if(rawAvailability!==null&&v.availability!=null){summary.raw_availability_compared++;if(availabilityLabel(rawAvailability)!==availabilityLabel(v.availability))summary.raw_availability_differences++;}
  rows.push({sku,status:ownerMatch?'EXACT_SKU_AND_PRODUCT':'OWNER_CONFLICT',legacy_product_id:v.product_id,legacy_variant_id:v.variant_id??data.variant_id??null,site_variant_primary_key:sku,legacy_url:p?.slug?'/product/'+p.slug:null,canonical_category_id:relations.get(v.product_id)??p?.canonical_category_id??null,pim_price:old.price,site_price:sitePrice,pim_stock:old.stock,site_stock:siteStock,stock_status,pim_size:copy(old.size),site_size:{raw:siteRawSize,normalized:data.size_letter??v.size??null},pim_raw_availability:rawAvailability,site_raw_availability:v.availability??null});
 }
 for(const [sku,v] of pimSKUs)if(!siteSKUs.has(sku)){summary.pim_only_skus++;rows.push({sku,status:'PIM_ONLY',legacy_product_id:v.legacy_product_id,pim_price:v.price,pim_stock:v.stock});}
 const pimPhotos=new Map();for(const p of pim.photos||[]){const key=JSON.stringify([p.legacy_product_id,p.url]);if(!pimPhotos.has(key))pimPhotos.set(key,[]);pimPhotos.get(key).push(p.legacy_photo_id);}
 const photos=index(tables?.photos||[],'id','SITE_PHOTO'),photoSummary={site_rows:photos.size,exact_product_url_matches:0,site_only_references:0,states:{},processed_files_reported:0,usable_file_ids_reported:site.snapshot?.usable_photo_ids?.length??null,products_with_processed_photos:0};const processedProducts=new Set();
 for(const p of photos.values()){
  if(!siteProducts.has(p.product_id))errors.push({code:'ORPHAN_SITE_PHOTO',ref:p.id});
  photoSummary.states[p.status]=(photoSummary.states[p.status]||0)+1;
  if(p.status==='ok'&&p.file){photoSummary.processed_files_reported++;processedProducts.add(p.product_id);}
  const refs=pimPhotos.get(JSON.stringify([p.product_id,p.src_url]))||[];
  if(refs.length)photoSummary.exact_product_url_matches++;else photoSummary.site_only_references++;
  photo_rows.push({site_photo_id:p.id,legacy_product_id:p.product_id,url:p.src_url,pim_photo_reference_ids:copy(refs),status:refs.length?'EXACT_PRODUCT_AND_URL':'SITE_ONLY_REFERENCE',color_id:null,mapping_status:'UNKNOWN',processing_status:p.status});
 }
 photoSummary.products_with_processed_photos=processedProducts.size;
 if(summary.stock_unknown_both)warnings.push({code:'QUANTITY_UNKNOWN',variants:summary.stock_unknown_both,detail:'Equal null values do not verify stock quantities.'});
 if(summary.pim_only_skus||summary.site_only_skus)warnings.push({code:'CATALOGS_DIVERGED',detail:'Preserve both sources; absence is not a delete instruction.'});
 if((photoSummary.states.pending||0)>0)warnings.push({code:'SITE_PHOTO_QUEUE_PENDING',photos:photoSummary.states.pending});
 if(summary.internal_category_products)warnings.push({code:'INTERNAL_CATEGORY_REQUIRES_REVIEW',products:summary.internal_category_products});
 return {schema_version:V2.VERSION,mode:'read-only-reconciliation',production_modified:false,full_site_snapshot:!!full,ready_for_migration:false,integrity,summary,photo_summary:photoSummary,errors,warnings,product_rows,rows,photo_rows,protected_site_taxonomy:full?Object.fromEntries(taxonomyTables.filter(k=>Object.hasOwn(tables,k)).map(k=>[k,copy(tables[k])])):null,site_taxonomy_tables_not_present:full?taxonomyTables.filter(k=>!Object.hasOwn(tables,k)):null,required_next_steps:['Preserve unmatched products/SKU in quarantine; never overwrite the site from the older backup','Keep exact site canonical IDs, URLs, alias/rule/lock metadata and original photo IDs','Refresh explicit supplier quantities without inventing stock from availability labels','Confirm model/color/SKU/photo registry in PIM','Run full migration validator before any shop APPLY']};
}
function prepareReconciledSource(pim,site){
 const report=reconcile(pim,site);
 if(!report.full_site_snapshot||!report.integrity.all_verified||report.errors.length)throw Error('A complete fingerprint-verified site snapshot without identity/taxonomy errors is required');
 if(site.contains_customer_data!==false)throw Error('Source must explicitly exclude customer data');
 const tables=site.snapshot.tables;
 for(const name of ['products','variants','photos','rubizh_product_categories','rubizh_canonical_categories','rubizh_category_aliases'])if(!Array.isArray(tables[name]))throw Error('Required source table: '+name);
 const source=copy(pim),products=new Map(source.products.map(p=>[p.legacy_product_id,p])),variants=new Map(source.variants.map(v=>[v.legacy_sku,v]));
 const relation=new Map(tables.rubizh_product_categories.map(r=>[r.product_id,r.category_id]));
 for(const p of products.values())p.source_presence='PIM_ONLY';
 for(const v of variants.values())v.source_presence='PIM_ONLY';
 const sitePhotos=new Map();for(const p of tables.photos){if(!sitePhotos.has(p.product_id))sitePhotos.set(p.product_id,[]);sitePhotos.get(p.product_id).push(p);}
 for(const p of tables.products){
  const existing=products.get(p.id),url=p.slug?'/product/'+p.slug:null;
  if(existing){existing.legacy_urls=[...new Set([...existing.legacy_urls,...(url?[url]:[])])];existing.canonical_category_id=relation.get(p.id);existing.site_product=copy(p);existing.source_presence='BOTH';}
  else{const row={legacy_product_id:p.id,legacy_urls:url?[url]:[],canonical_category_id:relation.get(p.id),protected:{id:p.id,name:p.name,brand:p.brand,desc:p.description,photos:(sitePhotos.get(p.id)||[]).map(ph=>ph.src_url),pub:p.visible===true||p.visible===1,source_origin:'current_site',source_site_product:copy(p)},source_presence:'SITE_ONLY'};source.products.push(row);products.set(p.id,row);}
 }
 for(const v of tables.variants){
  const existing=variants.get(v.sku),data=typeof v.data==='string'?JSON.parse(v.data):v.data||{};
  if(existing){existing.site_variant=copy(v);existing.site_variant_primary_key=v.sku;existing.source_presence='BOTH';}
  else source.variants.push({legacy_product_id:v.product_id,legacy_variant_id:data.variant_id??null,legacy_sku:v.sku,price:v.price??data.price??null,stock:v.stock??data.stock??null,size:{raw:data.size_native??data.size_raw??v.size??null,normalized:data.size_letter??v.size??null},availability:'HIDDEN',availability_unknown:true,lead_time_days:null,preorder_confirmed:false,stock_stale:true,selected_supplier_id:null,supplier_links:[],supplier_links_status:'UNKNOWN',protected:{sku:v.sku,source_origin:'current_site',source_site_variant:copy(v)},source_presence:'SITE_ONLY',site_variant_primary_key:v.sku});
 }
 const ids=new Set(source.photos.map(p=>p.legacy_photo_id));
 for(const p of tables.photos){const id='lph_site_'+encodeURIComponent(String(p.id));if(ids.has(id))throw Error('Site photo identity collision: '+p.id);ids.add(id);source.photos.push({legacy_photo_id:id,legacy_product_id:p.product_id,legacy_sku:null,supplier_id:null,url:p.src_url,sort:Number(p.pos)+1,scope:'site',site_photo_id:p.id,source_site_photo:copy(p)});}
 source.taxonomy_state={...source.taxonomy_state,pim_source_categories:copy(pim.categories),current_site:{tables:copy(report.protected_site_taxonomy),meta:copy(site.snapshot.meta||{}),asset_fingerprints:copy(site.snapshot.asset_fingerprints||{})}};
 source.categories=tables.rubizh_canonical_categories.map(c=>({...copy(c),id:c.category_id,name:c.display_name_uk}));
 source.reconciliation={mode:'UNION_WITH_QUARANTINE',source_fingerprints:copy(site.snapshot.fingerprints),site_created_at:site.created_at,ready_for_migration:false,stock_quantities_verified:false,automatic_model_grouping:false};
 return source;
}
module.exports={reconcile,prepareReconciledSource,digestPHP};
