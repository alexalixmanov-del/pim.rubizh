(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RubizhContractV2=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='2.0';
const AVAILABILITY=['IN_STOCK','PREORDER','ORDER_ON_REQUEST','SIZE_CONFIRMATION_REQUIRED','OUT_OF_STOCK','HIDDEN'];
const clone=x=>JSON.parse(JSON.stringify(x)), list=x=>Array.isArray(x)?x:[], own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
// Reversible keys avoid collisions and do not infer model/color identity.
const key=(...parts)=>parts.map(x=>encodeURIComponent(String(x??''))).join(':');
const variantKey=v=>key(v.legacy_product_id,v.legacy_sku);
const id=(prefix,...parts)=>prefix+'_'+key(...parts);
function urlOK(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
function pathOK(value){return typeof value==='string'&&/^\/product\/[^/?#]+$/.test(value)&&!/[\s\\\x00-\x1f]/.test(value);}
function source(backup,categories,resolve){
 if(!backup||!Array.isArray(backup.products))throw Error('Full PIM products array required');
 const variants=[],photos=[],products=[];
 for(const p of backup.products){
  if(!p.id)throw Error('Missing source product ID');
  const pid=String(p.id);
  products.push({legacy_product_id:pid,legacy_urls:list(p.legacy_urls).concat(p.legacy_url?[p.legacy_url]:[]),canonical_category_id:p.canonical_category_id??p.last_confirmed_category_id??null,protected:clone(p)});
  for(const [index,v] of list(p.variants).entries()){
   if(!v.sku)throw Error('Missing source SKU: '+pid+' / '+index);
   const resolved=resolve?resolve(p,v):{};
   variants.push({legacy_product_id:pid,legacy_variant_id:v.id??v.variant_id??null,legacy_sku:String(v.sku),price:resolved.price??v.site_price??v.price??null,stock:own(resolved,'stock')?resolved.stock:v.stock??null,size:{raw:v.size_raw??v.native_size??v.size??null,normalized:v.size_normalized??v.size??null},availability:resolved.availability??(AVAILABILITY.includes(v.availability)?v.availability:'HIDDEN'),availability_unknown:resolved.availability_unknown??!AVAILABILITY.includes(v.availability),lead_time_days:resolved.lead_time_days??v.lead_time_days??null,preorder_confirmed:resolved.preorder_confirmed??v.preorder_confirmed??false,stock_stale:resolved.stock_stale??v.stock_stale??false,selected_supplier_id:resolved.supplier_id??null,supplier_links:Object.entries(v.offers||{}).map(([supplier_id,o])=>({supplier_id,supplier_sku:o.s??o.supplier_sku??null,stock:o.stock??null,price:o.price??null,cost:o.cost??null,raw:clone(o)})),protected:clone(v)});
   collectPhotos(list(v.photos),pid,'variant',String(v.sku),null);
   for(const [sid,o] of Object.entries(v.offers||{}))collectPhotos(list(o.photos),pid,'offer',String(v.sku),sid);
  }
  collectPhotos(list(p.photos),pid,'product',null,null);
  for(const [n,s] of list(p.model_color_sources).entries())collectPhotos(list(s.photos),pid,'historical-'+n,null,null);
 }
 function collectPhotos(values,pid,scope,sku,sid){const occurrences=new Map();for(const [i,url] of values.entries()){const occurrence=occurrences.get(url)||0;occurrences.set(url,occurrence+1);photos.push({legacy_photo_id:id('lph',pid,scope,sku,sid,url,occurrence),legacy_product_id:pid,legacy_sku:sku,supplier_id:sid,url,sort:i+1,scope});}}
 const taxonomy_state={};
 for(const [k,v] of Object.entries(backup.cfg||{}))if(k==='ourCats'||/^canonical_categories$|^category_|^supplier_category_|^taxonomy_/.test(k))taxonomy_state[k]=clone(v);
 return {schema_version:VERSION,kind:'rubizh.pim.source',categories:clone(categories),taxonomy_state,products,variants,photos};
}
function draft(s){
 return {schema_version:VERSION,models:s.products.map(p=>({model_id:id('mdl',p.legacy_product_id),marketing_name_uk:p.protected.marketing_name_uk||p.protected.name||'',brand:p.protected.brand||'',description:p.protected.desc||'',canonical_category_id:p.canonical_category_id,slug:null,size_policy:null,publication_status:'UNPUBLISHED',attributes:clone(p.protected.normalized_attributes||p.protected.canonical_attributes||{}),mapping_status:'UNKNOWN'})),colors:[],product_mappings:s.products.map(p=>({legacy_product_id:p.legacy_product_id,model_id:id('mdl',p.legacy_product_id),color_id:null,mapping_status:'UNKNOWN'})),variant_mappings:s.variants.map(v=>({legacy_product_id:v.legacy_product_id,legacy_variant_id:v.legacy_variant_id,legacy_sku:v.legacy_sku,model_id:id('mdl',v.legacy_product_id),color_id:null,variant_id:id('var',v.legacy_product_id,v.legacy_sku),sku:v.legacy_sku,size:clone(v.size),mapping_status:'UNKNOWN'})),photo_mappings:s.photos.map(p=>({legacy_photo_id:p.legacy_photo_id,model_id:id('mdl',p.legacy_product_id),color_id:null,photo_id:id('ph',p.legacy_photo_id),sort:p.sort,mapping_status:'UNKNOWN'}))};
}
function build(s,r,{previous=null}={}){
 const errors=[],warnings=[],error=(code,ref,detail)=>errors.push({code,ref,detail});
 const summary=Object.fromEntries(['SKU','VARIANTS','PHOTOS','PRICES','STOCK','CANONICAL_CATEGORIES','SUPPLIER_LINKS'].map(k=>['LOST_'+k,0]));
 if(s?.schema_version!==VERSION||r?.schema_version!==VERSION)error('SCHEMA_VERSION',null,'Expected 2.0');
 if(!s||!r||!['products','variants','photos','categories'].every(k=>Array.isArray(s[k]))||!['models','colors','variant_mappings','product_mappings','photo_mappings'].every(k=>Array.isArray(r[k]))){error('DOCUMENT_SHAPE',null,null);return {schema_version:VERSION,models:[],categories:[],legacy_mapping:{},report:{ready_for_migration:false,summary,errors,warnings,production_modified:false,unconfirmed_mappings:0}};}
 const index=(rows,field,label)=>{const out=new Map();for(const row of list(rows)){if(!row||typeof row!=='object'||Array.isArray(row)){error('ROW_SHAPE',label,null);continue;}const k=typeof field==='function'?field(row):row[field];if(typeof k!=='string'||k==='')error('MISSING_ID',label,null);else if(out.has(k))error('DUPLICATE_ID',k,label);else out.set(k,row);}return out;};
 const products=index(s.products,'legacy_product_id','source products'), sv=index(s.variants,variantKey,'source variants'), sp=index(s.photos,'legacy_photo_id','source photos');
 index(s.variants,'legacy_sku','source SKU');
 for(const v of sv.values())if(!products.has(v.legacy_product_id)||!Array.isArray(v.supplier_links)||!v.size||!v.protected)error('SOURCE_VARIANT_SHAPE',variantKey(v),null);
 for(const p of products.values())if(!p.protected||!Array.isArray(p.legacy_urls))error('SOURCE_PRODUCT_SHAPE',p.legacy_product_id,null);
 for(const p of sp.values())if(!products.has(p.legacy_product_id))error('SOURCE_PHOTO_OWNER',p.legacy_photo_id,null);
 if(errors.length)return {schema_version:VERSION,models:[],categories:[],legacy_mapping:{},report:{ready_for_migration:false,summary,errors,warnings,production_modified:false,unconfirmed_mappings:0}};
 const cats=index(s.categories,'id','categories'),parents=new Set(list(s.categories).map(c=>c.parent_id).filter(Boolean));
 for(const c of cats.values()){if(c.parent_id&&!cats.has(c.parent_id))error('CATEGORY_PARENT',c.id,c.parent_id);const seen=new Set([c.id]);let current=c;while(current.parent_id&&cats.has(current.parent_id)){if(seen.has(current.parent_id)){error('CATEGORY_CYCLE',c.id,current.parent_id);break;}seen.add(current.parent_id);current=cats.get(current.parent_id);}}
 const models=index(r.models,'model_id','models'),colors=index(r.colors,'color_id','colors'),vm=index(r.variant_mappings,variantKey,'variant mappings'),pm=index(r.product_mappings,'legacy_product_id','product mappings'),phm=index(r.photo_mappings,'legacy_photo_id','photo mappings');
 index(r.variant_mappings,'variant_id','variant IDs');index(r.variant_mappings,'sku','target SKU');index(r.photo_mappings,'photo_id','photo IDs');
 const slugs=new Map(),modelOut=new Map();
 for(const m of models.values()){
  if(!['UNKNOWN','CONFIRMED'].includes(m.mapping_status))error('MAPPING_STATUS',m.model_id,m.mapping_status);
  if(m.mapping_status==='CONFIRMED'){
   if(!m.marketing_name_uk?.trim())error('MODEL_NAME',m.model_id,null);
   if(!cats.has(m.canonical_category_id)||parents.has(m.canonical_category_id))error('CATEGORY_NOT_LEAF',m.model_id,m.canonical_category_id);
   if(!['NONE','OPTIONAL','REQUIRED'].includes(m.size_policy))error('SIZE_POLICY',m.model_id,m.size_policy);
   if(!m.slug||!pathOK('/product/'+m.slug))error('MODEL_SLUG',m.model_id,m.slug);
  }
  if(!['PUBLISHED','UNPUBLISHED'].includes(m.publication_status))error('PUBLICATION_STATUS',m.model_id,m.publication_status);
  if(m.slug){if(slugs.has(m.slug))error('SLUG_COLLISION',m.slug,null);slugs.set(m.slug,m.model_id);}
  modelOut.set(m.model_id,{model_id:m.model_id,marketing_name_uk:m.marketing_name_uk,brand:m.brand??null,canonical_category_id:m.canonical_category_id??null,description:m.description??'',slug:m.slug??null,size_policy:m.size_policy??null,publication_status:m.publication_status,mapping_status:m.mapping_status,attributes:clone(m.attributes||{}),legacy_product_ids:[],colors:[],unassigned_photos:[]});
 }
 const colorOut=new Map();
 for(const c of colors.values()){
  if(!models.has(c.model_id))error('ORPHAN_COLOR',c.color_id,c.model_id);
  if(c.mapping_status!=='CONFIRMED')error('UNCONFIRMED_COLOR',c.color_id,null);
  const out={color_id:c.color_id,color:c.color??null,camouflage:c.camouflage??null,legacy_product_ids:[],photos:[],variants:[]};colorOut.set(c.color_id,out);modelOut.get(c.model_id)?.colors.push(out);
 }
 let unconfirmed=[...models.values()].filter(m=>m.mapping_status!=='CONFIRMED').length;const unmapped_variants=[],variant_mappings=[],product_mappings=[],photo_mappings=[];
 const modelProducts=new Map(),colorProducts=new Map(),sourceModel=new Map(),sourceColors=new Map();
 const add=(map,k,v)=>{if(!map.has(k))map.set(k,new Set());map.get(k).add(v);};
 for(const v of sv.values()){
  const k=variantKey(v),m=vm.get(k);
  if(!m){summary.LOST_SKU++;summary.LOST_VARIANTS++;summary.LOST_PRICES++;summary.LOST_STOCK++;summary.LOST_SUPPLIER_LINKS+=v.supplier_links.length;error('MISSING_VARIANT_MAPPING',k,null);continue;}
  if(m.legacy_variant_id!==v.legacy_variant_id||m.sku!==v.legacy_sku){error('SKU_IDENTITY_CHANGED',k,null);summary.LOST_SKU++;}
  add(sourceColors,v.legacy_product_id,m.color_id);
  const mo=models.get(m.model_id),co=colors.get(m.color_id);
  if(!mo||!co||co.model_id!==m.model_id||m.mapping_status!=='CONFIRMED'||mo.mapping_status!=='CONFIRMED'){
   unconfirmed++;unmapped_variants.push(clone(v));if(m.mapping_status==='CONFIRMED')error('VARIANT_TARGET',k,null);
  }else{
   if(v.protected.manual_locks?.size&&stable(m.size)!==stable(v.size))error('SIZE_LOCKED',k,null);
   if(!m.size||m.size.raw!==v.size.raw)error('RAW_SIZE_CHANGED',k,null);
   const z={variant_id:m.variant_id,sku:v.legacy_sku,supplier_sku:v.supplier_links.find(o=>o.supplier_id===v.selected_supplier_id)?.supplier_sku??(v.supplier_links.length===1?v.supplier_links[0].supplier_sku:null),size:clone(m.size||v.size),price:v.price,stock:v.stock,availability:v.availability,availability_unknown:v.availability_unknown,lead_time_days:v.lead_time_days,preorder_confirmed:v.preorder_confirmed,stock_stale:v.stock_stale,supplier_links:clone(v.supplier_links),legacy_product_id:v.legacy_product_id,legacy_variant_id:v.legacy_variant_id};
   if(!AVAILABILITY.includes(z.availability))error('AVAILABILITY',k,z.availability);
   if(z.price!==null&&(!Number.isFinite(z.price)||z.price<0))error('PRICE_INVALID',k,null);
   if(z.stock!==null&&(!Number.isFinite(z.stock)||z.stock<0))error('STOCK_INVALID',k,null);
   if(z.availability==='IN_STOCK'&&(z.stock===null||z.stock<=0||z.stock_stale))error('STOCK_NOT_CONFIRMED',k,null);
   if(z.availability==='PREORDER'&&(!z.preorder_confirmed||!(z.lead_time_days>0)))error('PREORDER_NOT_CONFIRMED',k,null);
   if(z.availability==='ORDER_ON_REQUEST'&&z.lead_time_days!==null)error('REQUEST_DEADLINE',k,null);
   if(mo.size_policy==='REQUIRED'&&!z.size.normalized&&['IN_STOCK','PREORDER','ORDER_ON_REQUEST'].includes(z.availability))error('REQUIRED_SIZE',k,null);
   if(mo.publication_status==='PUBLISHED'&&(['IN_STOCK','PREORDER','ORDER_ON_REQUEST'].includes(z.availability))&&!(z.price>0))error('BUYABLE_PRICE',k,null);
   colorOut.get(m.color_id).variants.push(z);add(modelProducts,m.model_id,v.legacy_product_id);add(colorProducts,m.color_id,v.legacy_product_id);add(sourceModel,v.legacy_product_id,m.model_id);
  }
  variant_mappings.push({...clone(m),legacy_variant_id:v.legacy_variant_id,legacy_sku:v.legacy_sku});
 }
 for(const m of vm.values())if(!sv.has(variantKey(m)))error('EXTRA_VARIANT_MAPPING',variantKey(m),null);
 const redirectOwners=new Map();
 for(const p of products.values()){
  const m=pm.get(p.legacy_product_id),targets=sourceModel.get(p.legacy_product_id)||new Set();
  if(!m||m.mapping_status!=='CONFIRMED'){unconfirmed++;product_mappings.push(m?clone(m):{legacy_product_id:p.legacy_product_id,model_id:null,color_id:null,mapping_status:'UNKNOWN'});continue;}
  if(!models.has(m.model_id)||targets.size>1||targets.size===1&&!targets.has(m.model_id))error('PRODUCT_TARGET',p.legacy_product_id,null);
  if(m.color_id&&colors.get(m.color_id)?.model_id!==m.model_id)error('PRODUCT_COLOR',p.legacy_product_id,m.color_id);
  if(m.color_id&&[...sourceColors.get(p.legacy_product_id)||[]].some(c=>c!==m.color_id))error('PRODUCT_COLOR',p.legacy_product_id,'Color does not contain every source SKU');
  const model=models.get(m.model_id);
  if(p.canonical_category_id!==model?.canonical_category_id){summary.LOST_CANONICAL_CATEGORIES++;error('CATEGORY_CHANGED',p.legacy_product_id,p.canonical_category_id);}
  add(modelProducts,m.model_id,p.legacy_product_id);
  const urls=[...new Set(list(p.legacy_urls).concat(list(m.legacy_urls)))];
  if(!urls.length)warnings.push({code:'LEGACY_URL_UNKNOWN',ref:p.legacy_product_id});
  for(const url of urls){if(!pathOK(url))error('LEGACY_URL',p.legacy_product_id,url);const target='/product/'+model?.slug+(m.color_id?'?color='+encodeURIComponent(m.color_id):'');if(redirectOwners.has(url)&&redirectOwners.get(url)!==target)error('REDIRECT_COLLISION',url,null);redirectOwners.set(url,target);if(slugs.has(url.slice(9))&&slugs.get(url.slice(9))!==m.model_id)error('LEGACY_SLUG_COLLISION',url,null);product_mappings.push({legacy_product_id:p.legacy_product_id,legacy_url:url,model_id:m.model_id,color_id:m.color_id??null,redirect_url:target,mapping_status:'CONFIRMED'});}
  if(!urls.length)product_mappings.push({...clone(m),legacy_url:null,redirect_url:null,url_mapping_status:'UNKNOWN'});
 }
 for(const m of pm.values())if(!products.has(m.legacy_product_id))error('EXTRA_PRODUCT_MAPPING',m.legacy_product_id,null);
 for(const p of sp.values()){
  const m=phm.get(p.legacy_photo_id);
  if(!m){summary.LOST_PHOTOS++;error('MISSING_PHOTO_MAPPING',p.legacy_photo_id,null);continue;}
  const po={photo_id:m.photo_id,url:p.url,sort:m.sort??p.sort,legacy_photo_id:p.legacy_photo_id,legacy_product_id:p.legacy_product_id,model_id:m.model_id??null,color_id:m.color_id??null,mapping_status:m.mapping_status};
  const target=pm.get(p.legacy_product_id)?.model_id;
  if(m.model_id!==target||!models.has(m.model_id))error('PHOTO_MODEL',p.legacy_photo_id,null);
  if(!['UNKNOWN','CONFIRMED'].includes(m.mapping_status))error('MAPPING_STATUS',p.legacy_photo_id,m.mapping_status);
  if(m.mapping_status==='UNKNOWN'){if(m.color_id!==null)error('UNKNOWN_PHOTO_COLOR',p.legacy_photo_id,null);modelOut.get(m.model_id)?.unassigned_photos.push(po);}
  else{
   const c=colors.get(m.color_id);
   if(!c||c.model_id!==m.model_id)error('PHOTO_COLOR',p.legacy_photo_id,null);
   if(!urlOK(p.url))error('PHOTO_URL',p.legacy_photo_id,null);
   colorOut.get(m.color_id)?.photos.push(po);
  }
  photo_mappings.push(po);
 }
 for(const m of phm.values())if(!sp.has(m.legacy_photo_id))error('EXTRA_PHOTO_MAPPING',m.legacy_photo_id,null);
 for(const [mid,mo] of modelOut){mo.legacy_product_ids=[...(modelProducts.get(mid)||[])].sort();for(const co of mo.colors){co.legacy_product_ids=[...(colorProducts.get(co.color_id)||[])].sort();co.photos.sort((a,b)=>a.sort-b.sort||a.photo_id.localeCompare(b.photo_id));
   if(mo.publication_status==='PUBLISHED'&&(!co.photos.length||!co.variants.length))error('PUBLIC_COLOR_EMPTY',co.color_id,null);
   const sizes=new Set();for(const v of co.variants){const size=stable(v.size.normalized);if(sizes.has(size))error('DUPLICATE_COLOR_SIZE',co.color_id,v.size.normalized);sizes.add(size);}
  }
  if(mo.publication_status==='PUBLISHED'&&(!mo.description?.trim()||!mo.colors.length||mo.mapping_status!=='CONFIRMED'))error('PUBLIC_MODEL_INCOMPLETE',mid,null);
 }
 // Stable identity is a persisted contract, not something recomputed after each import.
 if(previous){const prev=index(previous.variant_mappings,variantKey,'previous mapping');for(const m of vm.values()){const old=prev.get(variantKey(m));if(old?.mapping_status==='CONFIRMED'&&['model_id','color_id','variant_id','sku'].some(k=>old[k]!==m[k]))error('CONFIRMED_ID_CHANGED',variantKey(m),null);}}
 const locked=new Map();for(const p of products.values())if(p.protected.model_grouping_locked){const m=pm.get(p.legacy_product_id);if(m?.model_id){if(locked.has(m.model_id))error('GROUPING_LOCK',p.legacy_product_id,null);locked.set(m.model_id,p.legacy_product_id);}}
 for(const [mid,pid] of locked)if([...modelProducts.get(mid)||[]].some(x=>x!==pid))error('GROUPING_LOCK',pid,null);
 const report={schema_version:VERSION,production_modified:false,summary,errors,warnings,unconfirmed_variants:unmapped_variants.length,unconfirmed_mappings:unconfirmed,ready_for_migration:errors.length===0&&unconfirmed===0&&warnings.length===0,counts:{source_products:products.size,source_variants:sv.size,source_photos:sp.size,models:modelOut.size,colors:colorOut.size}};
 return {schema_version:VERSION,models:[...modelOut.values()],unmapped_variants,legacy_mapping:{schema_version:VERSION,product_mappings,variant_mappings,photo_mappings},categories:clone(s.categories),taxonomy_state:clone(s.taxonomy_state||{}),source_archive:clone(s),report};
}
function publicExport(bundle){
 // An explicit allowlist prevents supplier links, costs, raw data and unknown photos leaking.
 if(!bundle.report?.ready_for_migration)return {schema_version:VERSION,categories:clone(bundle.categories||[]),models:[],publication_blocked:true};
 const keys=new Set(['season','seasons','gender','material','insulation','waterproof','weight_g','dimensions_mm','protection_class','plate_type','capacity_l','temperature_comfort_c','size_system']);
 return {schema_version:VERSION,categories:clone(bundle.categories),models:bundle.models.filter(m=>m.publication_status==='PUBLISHED'&&m.mapping_status==='CONFIRMED').map(m=>({model_id:m.model_id,marketing_name_uk:m.marketing_name_uk,brand:m.brand,canonical_category_id:m.canonical_category_id,description:m.description,slug:m.slug,size_policy:m.size_policy,attributes:Object.fromEntries(Object.entries(m.attributes).filter(([k])=>keys.has(k)).map(([k,v])=>[k,clone(v)])),colors:m.colors.map(c=>({color_id:c.color_id,color:c.color,camouflage:c.camouflage,photos:c.photos.map(p=>({photo_id:p.photo_id,url:p.url,sort:p.sort})),variants:c.variants.filter(v=>!v.availability_unknown&&v.availability!=='HIDDEN').map(v=>({variant_id:v.variant_id,sku:v.sku,size:clone(v.size),price:v.price,stock:v.stock,availability:v.availability,lead_time_days:v.lead_time_days,preorder_confirmed:v.preorder_confirmed,stock_stale:v.stock_stale}))}))}))};
}
return {VERSION,AVAILABILITY,stable,key,variantKey,source,draft,build,publicExport};
});
