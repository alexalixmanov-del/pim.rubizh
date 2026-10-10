// Classification pipeline: review-safe evidence and normalized size catalogs.
const CLASSIFICATION_VERSION=1;
// Release channel changes only operational boundaries; accepted RC evidence rules are unchanged.
const PIM_RELEASE_CHANNEL="production";
function classificationReviewMode(){return PIM_RELEASE_CHANNEL==="review";}
const classificationNetwork=window.fetch;
window.fetch=async function(...args){if(classificationReviewMode())throw Error('REVIEW_ONLY: network disabled; production writes forbidden');const raw=typeof args[0]==='string'||args[0] instanceof URL?String(args[0]):args[0]?.url;let path='';try{path=decodeURIComponent(new URL(raw,location.href).pathname);}catch{}if(/\/pim\/sync\/?$/i.test(path))throw Error('SYNC_DISABLED: магазин ще не підтримує contract v3');return classificationNetwork(...args);};
const classificationSB=sbCfg;sbCfg=function(){return classificationReviewMode()?null:classificationSB();};
const classificationSitePublish=sitePublish;
sitePublish=async function(){throw Error(classificationReviewMode()?'REVIEW_ONLY: publication and /pim/sync disabled':'SYNC_DISABLED: contract v3 не підключено до магазину');};
const classificationSimplePolicy=simpleApplyPolicy;
simpleApplyPolicy=async function(){throw Error(classificationReviewMode()?'REVIEW_ONLY: automatic publication/archive policy disabled':'PUBLICATION_DISABLED: масова публікація/архівування не входять у migration');};
const classificationRefreshDescription=refreshGeneratedDescription;
refreshGeneratedDescription=function(){return classificationReviewMode()?false:classificationRefreshDescription(...arguments);};
const classificationRepair=repairDuplicateSupplierLinksSafe;
repairDuplicateSupplierLinksSafe=function(){return classificationReviewMode()?{merged:0,mergedVariants:0,detached:0,repairedLinks:0}:classificationRepair(...arguments);};
const classificationStartup=startupIntegrityCheck;
startupIntegrityCheck=async function(){return classificationReviewMode()?{review_only:true,stats:catalogStats()}:classificationStartup(...arguments);};
const classificationPricing=ensurePricingPolicy;
ensurePricingPolicy=async function(){return classificationReviewMode()?false:classificationPricing(...arguments);};
function classificationLocked(p,field){return !!(p.manual_locks?.[field]||p.fieldMeta?.[field]?.source==='manual'||field==='category'&&(p.category_locked||p.category_source==='manual'||p.catSource==='manual'));}
function classificationEnable(){
 const defaults=RubizhCategories.catalogue(),existing=S.cfg.canonical_categories||[];
 S.cfg.canonical_categories=[...existing,...defaults.filter(c=>!existing.some(x=>x.id===c.id)).map(c=>structuredClone(c))];
 for(const supplier of S.cfg.suppliers)if(!supplier.inventory_policy&&RubizhInventory.defaults[supplier.id])supplier.inventory_policy=structuredClone(RubizhInventory.defaults[supplier.id]);
 S.cfg.inventory_policy_version=RubizhInventory.version;
 S.cfg.classification_version=CLASSIFICATION_VERSION;S.cfgDirty=true;
}
function classificationEnabled(){return S.cfg.classification_version===CLASSIFICATION_VERSION;}
function classificationHash(value){return fnvHash(stableValue105(value));}
function classificationSources(p){return (p.variants||[]).flatMap(v=>Object.entries(v.offers||{}).map(([sid,o])=>({...categorySourceRecord(p,sid,o),source_description:o.source_description||'',source_attributes:o.source_attributes||{}})));}
// Supplier facts for evidence: the card's supplier description, else the description each supplier offer carries
// (after a clean import the text lives on the offers; the publication path already reads it the same way).
function classificationSupplierDescription(p){return ceSupplierSource(p)||p.source_description||p.desc||(p.variants||[]).flatMap(v=>Object.values(v.offers||{}).map(o=>String(o.source_description||''))).find(s=>s.trim())||'';}
function classificationDecision(p){
 const id=p.canonical_category_id||p.last_confirmed_category_id||categoryIdForPath(p.category);
 if(classificationLocked(p,'category')||classificationLocked(p,'canonical_category_id')||classificationLocked(p,'primary_product_type'))return {tier:'SAFE_AUTO',category:id,rule_id:'manual-lock',reason:'Ручне рішення збережене.',protected:true};
 const gathered=classificationSources(p),sources=gathered.length?gathered:p.category_sources||[],dto={...p,name:p.name,description:classificationSupplierDescription(p),attrs:p.attrs,sources};
 const mapped=sources.map(s=>RubizhCategories.classify({...s,name:p.name,description:dto.description,attributes:p.attrs},categoryOptions())).filter(d=>/^(mapping-|exact-product:)/u.test(d.category_rule_id||''));
 if(mapped.length||/^(mapping-|exact-product:)/u.test(p.category_rule_id||'')){
  const ids=[...new Set(mapped.map(d=>d.canonical_category_id).filter(Boolean))];
  return {tier:ids.length>1?'AMBIGUOUS':'SAFE_AUTO',category:ids[0]||id,rule_id:'confirmed-mapping',reason:'Підтверджені mappings мають пріоритет.',protected:true};
 }
 const evidence=RubizhCategoryEvidence.resolve(dto,canonicalCategories());
 if(evidence.rule_id!=='insufficient-independent-evidence'){const scoped=RubizhCategoryEvidence.supplierRules.filter(r=>r.target_category_id===evidence.category&&sources.some(s=>s.supplier_id===r.supplier_id&&[s.supplier_category_raw,s.supplier_category_path_raw].includes(r.supplier_category)));return {...evidence,conditional_supplier_rules:scoped};}
 const contexts=sources.length?sources:[{}],decisions=contexts.map(s=>RubizhCategories.classify({...s,name:p.name,description:dto.description,attributes:p.attrs},categoryOptions())),ids=[...new Set(decisions.map(d=>d.canonical_category_id).filter(Boolean))];
 const approvedNew=new Set(RubizhCategoryEvidence.gaps.map(g=>g.id).concat('field_watches'));
 if(ids.length===1&&!approvedNew.has(ids[0])&&decisions.every(d=>d.canonical_category_id===ids[0]&&d.category_status==='CONFIRMED')){
  const proven=sources.length>0&&RubizhCategoryEvidence.plain(dto.description).length>=40&&sources.every(s=>RubizhCategories.classify({name:s.original_name,attributes:s.source_attributes},categoryOptions()).canonical_category_id===ids[0]);
  return {tier:proven?'SAFE_AUTO':'LIKELY',category:ids[0],rule_id:'canonical-whole-item-corroborated',reason:proven?'Тип виробу підтверджений заголовками та незалежними фактами постачальника.':'Недостатньо незалежних source facts.',evidence:{supplier_titles:sources.map(s=>s.original_name)}};
 }
 return {...evidence,tier:ids.length===1?'LIKELY':evidence.tier,category:evidence.category||ids[0]||null};
}
const classificationPreviousDecision=categoryDecisionForProduct;
categoryDecisionForProduct=function(p,...args){
 if(!classificationEnabled())return classificationPreviousDecision(p,...args);
 const e=classificationDecision(p),safe=e.tier==='SAFE_AUTO';
 return {canonical_category_id:safe?e.category:null,category:safe?canonicalPath(e.category):'',category_source:e.protected?p.category_source||'manual':'evidence',source:'auto_evidence',category_confidence:safe?1:e.tier==='LIKELY'?.8:.3,category_rule_id:e.rule_id,category_status:safe?'CONFIRMED':'NEEDS_REVIEW',category_review_status:safe?'CONFIRMED':e.tier,candidates:e.category?[e.category]:[],suggested_category_id:e.category,reasons:[e.reason],classification:e};
};
const classificationCachedCategory=categoryDecisionCached;
categoryDecisionCached=function(name,raw,attrs={},context={}){
 if(!classificationEnabled())return classificationCachedCategory(...arguments);
 const source={...context,supplier_id:context.supplier_id||S._classificationSupplier?.id,original_name:name,supplier_category_raw:raw,source_attributes:attrs};
 return categoryDecisionForProduct({name,desc:context.description||'',attrs,category_sources:[source],variants:[]});
};
const classificationPreviousApply=categoryApplyDecision;
categoryApplyDecision=function(p,d,options){
 if(!classificationEnabled())return classificationPreviousApply(p,d,options);
 const e=d.classification;
 if(!e){if(d.category_source==='manual')return classificationPreviousApply(p,d,options);return;}
 p.category_confidence_tier=e.tier;p.category_evidence={...(e.evidence||{reason:e.reason}),conditional_supplier_rules:e.conditional_supplier_rules||[]};p.category_rule_version=CLASSIFICATION_VERSION;
 if(e.protected||e.tier!=='SAFE_AUTO')return;
 p.pricing_canonical_category_id??=p.canonical_category_id;classificationPreviousApply(p,d,options);
};
function classificationSizePolicy(p){
 const category=p.canonical_category_id||p.last_confirmed_category_id;
 const canonicalType=RubizhModel.type(category),knownCategory=RubizhCategories.leaf(category,S.cfg.canonical_categories);
 let type=classificationLocked(p,'primary_product_type')?p.primary_product_type:canonicalType||(knownCategory?'accessory':p.primary_product_type);
 if(['clothing_balaclavas','clothing_headwear','footwear_gaiters','clothing_belts'].includes(category)||category==='clothing_rainwear'&&/пончо/iu.test(p.name))type='accessory';
 if(category==='footwear_insoles')type='insoles';if(category==='helmets_covers')type='helmet';
 const required=['combat_shirt','pants','jacket','fleece','base_layer','clothing','boots','shoes','gloves','helmet','insoles','socks','plate_carrier','armor_vest','battle_belt'].includes(type);
 return {type,required:!type?true:required};
}
function classificationSize(p,v){
 const policy=classificationSizePolicy(p),locked=classificationLocked(p,'size')||v.manualFields?.size||v.manual_locks?.size||v.fieldMeta?.size?.source==='manual';
 const variant=locked?{...v,manualFields:{...v.manualFields,size:true}}:v;
 const input={...policy,variant,product:{name:p.original_name||p.name,description:classificationSupplierDescription(p),variants:p.variants,supplier_attributes:p.supplier_attributes,size_system:p.confirmed_size_system},offers:Object.entries(v.offers||{}).map(([sid,o])=>({...o,sid})),rules:S.cfg.confirmed_supplier_size_rules||[],fallback:classificationSupplierFormat(p,v,policy.type)};
 const z=RubizhSizeEvidence.resolve(input);
 if(policy.required||locked)return z;
 // The category needs no size, but the supplier states this SKU's own size in a dedicated SKU field (Panama M, cap 58,
 // RPS S/M/L): the same approved parser, SKU scope only. Without it the model's SKUs are indistinguishable on the site.
 const explicit=RubizhSizeEvidence.resolve({...input,required:true});
 return explicit.confidence==='SAFE_AUTO'&&['EXACT_SIZE','ONE_SIZE'].includes(explicit.status)&&(explicit.evidence||[]).some(e=>e.scope==='sku'&&e.kind===explicit.status&&CLASSIFICATION_SKU_SIZE_SOURCES.test(e.source||''))?explicit:z;
}
const CLASSIFICATION_SKU_SIZE_SOURCES=/^(?:structured_size_field|offer\.(?:size_raw|native_size|variant_size))$/u;
function classificationSupplierFormat(p,v,type){
 // Previously approved supplier formats; fallback never beats dedicated column evidence.
 const offers=Object.values(v.offers||{});if(offers.some(o=>o.sharedSku)&&v.source_review_confirmed!==true)return null;
 const raw=String(v.size_raw||v.native_size||offers.find(o=>o.native_size)?.native_size||v.size||'').trim(),n=raw.toLowerCase().replace(/\s+/g,'');
 const out=(system,value)=>({tier:'SAFE_AUTO',size:{size_raw:raw,size_display:raw,size_normalized:value,size_system:system,size_unconfirmed:false}});
 if(['clothing','combat_shirt','pants','jacket','fleece','base_layer'].includes(type)){
  if(/^(\d{2}(?:-\d{2})?)\(?([2-6]?xl|xs|s|m|l)\)?(long|regular|short)$/iu.test(n))return out('supplier_combined',raw);
  if(/^(\d{2})\(([1-8](?:-[1-8])?)зріст\)$/u.test(n))return out('supplier_numeric_height',raw);
  if(/^([2-6]?xl|xs|s|m|l)\/(r|l|s)\((\d{2})\/(\d{3})\)$/iu.test(n))return out('supplier_combined',raw);
  if(/^(?:дитяч|детск)/iu.test(p.name)&&/^(?:[6-9]\d|1[0-6]\d)см$/u.test(n))return out('child_height_cm',n);
 }
 if(type==='helmet'&&/^(?:m|l|xl)\/?\(?\d{2}-\d{2}(?:см)?\)?$/iu.test(n))return out('helmet_alpha_cm',raw);
 const attrs=offers.map(o=>o.source_attributes||{}),descriptions=offers.map(o=>o.source_description).filter(Boolean);
 if(p.variants.length===1){attrs.push(p.supplier_attributes||{});descriptions.push(ceSupplierSource(p)||'');}
 const universal=attrs.some(a=>Object.entries(a).some(([k,val])=>/^(розмір|размер|size|розмір одягу)$/iu.test(k)&&/^(?:універсальний|универсальный|one size|os)$/iu.test(String(val).trim())))||descriptions.some(s=>/(?:розмір|размер)\s*[:—-]\s*(?:універсальний|универсальный)/iu.test(ceSourcePlain(s))||type==='plate_carrier'&&/(?:модель|плитоноск)\S*[^.]{0,45}універсальн\S*\s+розмір/iu.test(ceSourcePlain(s)));
 if(universal&&!['boots','shoes','insoles','helmet'].includes(type))return {tier:'SAFE_AUTO',size:{...RubizhModel.size('One Size',type,{universalConfirmed:true}),size_unconfirmed:false}};
 return null;
}
function classificationException(p,kind,tier,rule,reason,ref,evidence,candidate){
 const suppliers=ref.suppliers||[],key=classificationHash([kind,ref.sku||null,rule,suppliers]);
 return {exception_id:key,kind,tier,rule_id:rule,reason_code:reason,product_id:p.id,variant_sku:ref.sku||null,supplier_ids:suppliers,category_id:p.canonical_category_id||null,group_key:classificationHash([kind,suppliers,p.canonical_category_id,rule,reason]),evidence,candidate,fingerprint:classificationHash([evidence,candidate]),status:'OPEN'};
}
let classificationConfigText='',classificationConfigHash='';
function classificationInputFingerprint(p){
 const config=stableValue105([CLASSIFICATION_VERSION,RubizhSizeEvidence.version,RubizhCategoryEvidence.version,S.cfg.canonical_categories,S.cfg.supplier_category_mapping,S.cfg.confirmed_supplier_size_rules]);
 if(config!==classificationConfigText){classificationConfigText=config;classificationConfigHash=classificationHash(config);}
 return classificationHash([classificationConfigHash,p.name,classificationSupplierDescription(p),p.attrs,p.canonical_category_id,p.category_source,p.catSource,p.primary_product_type,p.confirmed_size_system,p.category_locked,p.manual_locks,
 Object.fromEntries(Object.entries(p.fieldMeta||{}).filter(([,m])=>m.source==='manual')),
 p.manual_locks?.allowed_sizes?p.size_catalogs:null,
 p.variants.map(v=>[v.sku,v.size,v.size_raw,v.native_size,v.variant_name,v.variant_label,v.manualFields,v.manual_locks,v.fieldMeta,v.source_review_confirmed,
 Object.entries(v.offers||{}).map(([sid,o])=>[sid,o.s,o.sharedSku,o.structured_size,o.native_size,o.variant_size,o.size_raw,o.variant_name,o.source_variant_name,o.variant_label,o.source_name,o.original_name,o.source_description,o.source_attributes,o.source_row_raw,o.supplier_category_raw,o.supplier_category_path_raw])])]);
}
function classificationApplyProduct(p){
 const input=classificationInputFingerprint(p);
 if(p.classification_input_fingerprint===input)return;
 touchP(p.id);
 const d=categoryDecisionForProduct(p),e=d.classification;categoryApplyDecision(p,d);
 const exceptions=[],catalogs=new Map(),suppliers=[...new Set(classificationSources(p).map(s=>s.supplier_id))];
 if(e.tier!=='SAFE_AUTO')exceptions.push(classificationException(p,'category',e.tier,e.rule_id,e.rule_id,{suppliers},e.evidence||{},e.category));
 for(const v of p.variants||[]){
  const z=classificationSize(p,v),locked=classificationLocked(p,'size')||v.manualFields?.size||v.manual_locks?.size||v.fieldMeta?.size?.source==='manual';
  v.size_status=z.sku_status||z.status;v.size_confidence_tier=z.confidence;v.size_evidence=z.evidence;v.size_rule_version=CLASSIFICATION_VERSION;
  v.size_source_scope=z.sku_status?'MODEL':'SKU';
  const offers=Object.entries(v.offers||{}),shared=offers.some(([sid,o])=>o.sharedSku&&v.source_review_confirmed!==true);
  v.source_binding_status=shared?'CONFIRMATION_REQUIRED':'CONFIRMED';
  if(z.confidence==='SAFE_AUTO'&&!locked&&['EXACT_SIZE','ONE_SIZE'].includes(z.status)){
   const n=RubizhModel.size(String(z.value),classificationSizePolicy(p).type,{universalConfirmed:z.status==='ONE_SIZE'});
   Object.assign(v,n,{size:String(z.value),size_raw:z.raw||String(z.value),size_display:z.raw||String(z.value),size_normalized:z.value,size_system:z.size_system,size_unconfirmed:false});
  }else if(!locked)v.size_unconfirmed=z.status!=='NO_SIZE_REQUIRED';
  for(const m of z.metadata||[]){
   if(m.confidence!=='SAFE_AUTO'||!m.allowed_sizes?.length||m.source?.startsWith('variant.'))continue;
   const signature=classificationHash([m.size_system,m.allowed_sizes]),catalog=catalogs.get(signature)||{catalog_id:signature,scope:'MODEL',color_id:null,size_system:m.size_system,allowed_sizes:[...new Set(m.allowed_sizes.map(String))],size_range_min:m.size_range_min??null,size_range_max:m.size_range_max??null,confidence_tier:'SAFE_AUTO',source_refs:[],evidence:[],rules_version:CLASSIFICATION_VERSION};
   const ref={supplier_id:offers.find(([,o])=>o.s===m.supplier_sku)?.[0]||null,supplier_sku:m.supplier_sku||null,source:m.source};
   if(!catalog.source_refs.some(x=>stableValue105(x)===stableValue105(ref)))catalog.source_refs.push(ref);
   if(!catalog.evidence.some(x=>stableValue105(x)===stableValue105(m)))catalog.evidence.push(m);
   catalogs.set(signature,catalog);
  }
  if(v.size_status==='SIZE_CONFIRMATION_REQUIRED'||z.confidence!=='SAFE_AUTO')exceptions.push(classificationException(p,'size',z.confidence==='SAFE_AUTO'?'AMBIGUOUS':z.confidence,z.reason||'SKU_SIZE_REQUIRED','SIZE_CONFIRMATION_REQUIRED',{sku:v.sku,suppliers:offers.map(([sid])=>sid)},z.evidence,z.suggestion||null));
 }
 const next=[...catalogs.values()].sort((a,b)=>a.catalog_id.localeCompare(b.catalog_id));
 // Conflicting model lists remain candidates and never silently union into a fake assortment.
 if(next.length>1){p.size_catalog_candidates=next;exceptions.push(classificationException(p,'size','AMBIGUOUS','conflicting-model-options','CONFLICTING_MODEL_SIZE_OPTIONS',{suppliers},next,null));}
 else {if(!classificationLocked(p,'allowed_sizes'))p.size_catalogs=next;delete p.size_catalog_candidates;}
 const previous=p.classification_exceptions||[];
 p.classification_exceptions=exceptions.map(x=>{const old=previous.find(o=>o.exception_id===x.exception_id&&o.fingerprint===x.fingerprint);return old?{...x,status:old.status,resolution:old.resolution}:x;});
 p.classification_fingerprint=classificationHash([CLASSIFICATION_VERSION,classificationSources(p),d.classification,p.size_catalogs,p.classification_exceptions]);p.classification_input_fingerprint=classificationInputFingerprint(p);markProduct(p);
}
function classificationOptions(p){
 return (p.size_catalogs||[]).flatMap(c=>c.allowed_sizes.filter(size=>!p.variants.some(v=>v.size_status==='EXACT_SIZE'&&String(v.size_normalized??v.size)===size)).map(size=>({option_id:c.catalog_id+':'+size,catalog_id:c.catalog_id,scope:c.scope,color_id:c.color_id,size,size_system:c.size_system,variant_sku:null,supplier_sku:null,stock:null,stock_quantity:null,stock_status:'UNKNOWN',availability_status:'UNKNOWN',availability_source:null,availability_confirmation:'UNKNOWN',availability:'SIZE_CONFIRMATION_REQUIRED',...classificationPermissions('SIZE_CONFIRMATION_REQUIRED'),selectable_for_request:true})));
}
const STOCK_WARNING_DEFAULT_HOURS=36;
function classificationFreshnessHours(sid){
 const raw=S.cfg.suppliers.find(s=>s.id===sid)?.stock_freshness_hours;
 return typeof raw==='number'&&Number.isFinite(raw)&&raw>0?raw:STOCK_WARNING_DEFAULT_HOURS;
}
function classificationObservedAt(o){
 // Legacy at is an observation only until separate import provenance exists.
 if(!o)return null;
 if(Object.hasOwn(o,'stock_observed_at')){const observed=o.stock_observed_at;if(o.stock_observation_provenance!=='SUPPLIER_FIELD'&&observed!=null&&(Number(observed)===Number(o.imported_at)||Number(observed)===Number(o.at)))return null;return observed;}
 return o.imported_at!=null?null:o.at;
}
function classificationPermissions(availability){
 const payment=availability==='IN_STOCK',request=['PREORDER','SIZE_CONFIRMATION_REQUIRED','ORDER_ON_REQUEST'].includes(availability);
 return {order_submission_allowed:payment||request,payment_allowed:payment,requires_order_confirmation:request||availability==='UNKNOWN'};
}
function classificationStockMetadata(o){
 const observed=classificationSourceTimestamp(classificationObservedAt(o)),updated=classificationSourceTimestamp(o?.source_updated_at),age=observed?Math.max(0,(Date.now()-observed)/3600000):null;
 const expires=classificationSourceTimestamp(o?.expires_at,true);
 return {stock_observed_at:observed,source_updated_at:updated,stock_data_age_hours:age,stale_source:age!=null&&age>=classificationFreshnessHours(o?.sid),stock_warning_hours:classificationFreshnessHours(o?.sid),expires_at:expires};
}
const classificationLegacyOfferStale=offerStale;
offerStale=function(o,cfg=S.cfg){return classificationReviewMode()||classificationEnabled()?false:classificationLegacyOfferStale(o,cfg);};
function classificationInventoryContext(o,v){
 const context={...(o||{})};if(v?.manualFields?.stock||v?.manual_locks?.stock||v?.fieldMeta?.stock?.source==='manual')context.stock_manual=true;
 if(v?.manualFields?.availability||v?.manual_locks?.availability){context.availability_manual=true;context.manual_availability_status=context.manual_availability_status||({in:'IN_STOCK',out:'OUT_OF_STOCK',order:'PREORDER'}[context.availability])||context.availability;}
 return context;
}
function classificationInventory(o,v){const supplier=S.cfg.suppliers.find(s=>s.id===o?.sid);return RubizhInventory.observe(RubizhInventory.policy(supplier),classificationInventoryContext(o,v));}
function classificationAvailability(p,v){
 const c=calc(p,v),fallback=Object.entries(v.offers||{}).filter(([sid])=>S.cfg.suppliers.some(s=>s.id===sid&&!s.disabled)).map(([sid,o])=>({sid,...o})),selected=c.o||c.ref||fallback[0],o=selected?.sid&&v.offers?.[selected.sid]?{sid:selected.sid,...v.offers[selected.sid]}:selected,metadata=classificationStockMetadata(o),inv=classificationInventory(o,v);
 const priceReady=c.price>0&&!modelVariant(p,v).margin_blocked;
 const result=(availability,confirmed=false)=>{
  const quantity=confirmed?inv.stock_quantity:null,flags=classificationPermissions(availability);
  if(availability==='IN_STOCK'&&!priceReady)Object.assign(flags,{order_submission_allowed:false,payment_allowed:false,requires_order_confirmation:true});
  return {availability,stock:quantity,stock_quantity:quantity,stock_status:confirmed?(inv.quantity_confirmation==='CONFIRMED'?'CONFIRMED':inv.availability_source==='FEED_PRESENCE'?'CONFIRMED_BY_PRESENCE':'CONFIRMED_BY_STATUS'):'UNKNOWN',availability_status:inv.availability_status,availability_source:inv.availability_source,availability_confirmation:inv.availability_confirmation,inventory_mode:inv.inventory_mode,inventory_policy_id:inv.policy_id,inventory_policy_version:inv.policy_version,inventory_policy_confirmed:inv.availability_confirmation==='CONFIRMED',delivery_lead_time_days:inv.delivery_lead_time_days,ready_to_dispatch:inv.ready_to_dispatch,price_ready:priceReady,binding_confirmation_required:v.source_binding_status!=='CONFIRMED',size_confirmation_required:v.size_status==='SIZE_CONFIRMATION_REQUIRED'||v.size_confidence_tier!=='SAFE_AUTO',...metadata,...flags};
 };
 if(!o||o.missing||o.discontinued||v.source_binding_status!=='CONFIRMED')return result('UNKNOWN');
 if(v.size_status==='SIZE_CONFIRMATION_REQUIRED'||v.size_confidence_tier!=='SAFE_AUTO')return result('SIZE_CONFIRMATION_REQUIRED');
 if(metadata.expires_at&&Date.now()>=metadata.expires_at)return result('UNKNOWN');
 if(!['EXACT_SIZE','ONE_SIZE','NO_SIZE_REQUIRED'].includes(v.size_status))return result('UNKNOWN');
 return result(inv.availability_status,['IN_STOCK','OUT_OF_STOCK','PREORDER','ORDER_ON_REQUEST'].includes(inv.availability_status));
}
const classificationSimpleSize=simpleSize;
simpleSize=function(p,v){if(!classificationEnabled()||!v.size_status)return classificationSimpleSize(p,v);return {size_raw:v.size_raw??v.size??'',size_display:v.size_display??v.size??'',size_normalized:v.size_normalized??null,size_system:v.size_status==='NO_SIZE_REQUIRED'?'NONE':v.size_system||null,size_status:v.size_status,size_confidence_tier:v.size_confidence_tier,size_unconfirmed:v.size_status==='SIZE_CONFIRMATION_REQUIRED'||v.size_confidence_tier!=='SAFE_AUTO',required:v.size_status!=='NO_SIZE_REQUIRED'};};
const classificationSimpleVariant=simpleVariant;
simpleVariant=function(p,v){const old=classificationSimpleVariant(p,v);if(!classificationEnabled())return old;const availability=classificationAvailability(p,v),eligible=availability.order_submission_allowed&&old.site_price>0&&!old.margin_blocked;return {...old,...availability,request:availability.requires_order_confirmation,order_on_request:availability.availability==='ORDER_ON_REQUEST',available:availability.order_submission_allowed,eligible,availability_label:({IN_STOCK:'В наявності',PREORDER:'Під замовлення — підтвердження перед оплатою',ORDER_ON_REQUEST:'На запит — підтвердження перед оплатою',OUT_OF_STOCK:'Немає в наявності',UNKNOWN:'Наявність потребує підтвердження',SIZE_CONFIRMATION_REQUIRED:'Розмір потребує підтвердження'})[availability.availability],lead_time_days:availability.availability==='PREORDER'&&availability.delivery_lead_time_days==null?confirmedPreorderDays(old.selected_offer):null};};
function classificationSourceTimestamp(raw,allowFuture=false){
 if(raw==null||String(raw).trim()==='')return null;
 const value=typeof raw==='number'?raw:/^\d{13}$/.test(String(raw))?Number(raw):Date.parse(String(raw));
 return Number.isFinite(value)&&value>0&&(allowFuture||value<=Date.now())?value:null;
}
function classificationSourceBoolean(raw){return /^(?:1|true|yes|так|да)$/iu.test(String(raw??'').trim());}
const classificationExtract=extract;
extract=function(row,map,headers=[]){const rec=classificationExtract(...arguments);const inventoryPolicy=RubizhInventory.policy(S._classificationSupplier);rec.inventorySourceColumn=map.stock!=null?headers[map.stock]||null:null;if(inventoryPolicy.confirmed&&inventoryPolicy.mode==='QUANTITY'){rec.stock=RubizhInventory.quantity(map.stock!=null?row[map.stock]:null);rec.invalidStock=rec.stock==null;}rec.sizeInputProvenance=map.size!=null&&map.size!==''?'DEDICATED_COLUMN':'GENERIC_ATTRIBUTES';rec.variantName=map.variantName!=null?String(row[map.variantName]||''):'';rec.stockObservedAt=classificationSourceTimestamp(map.stockObservedAt!=null?row[map.stockObservedAt]:null);rec.sourceUpdatedAt=classificationSourceTimestamp(map.sourceUpdatedAt!=null?row[map.sourceUpdatedAt]:null);rec.stockExpiresAt=classificationSourceTimestamp(map.stockExpiresAt!=null?row[map.stockExpiresAt]:null,true);rec.preorderConfirmed=map.preorder!=null?classificationSourceBoolean(row[map.preorder]):rec.availability==='order'&&/(?:preorder|предзаказ|під замов|под заказ)/iu.test(rec.rawAvailability||'');rec.orderOnRequest=map.orderOnRequest!=null?classificationSourceBoolean(row[map.orderOnRequest]):rec.availability==='order'&&!rec.preorderConfirmed&&/(?:order[ _-]?on[ _-]?request|on request|на запит|по запросу)/iu.test(rec.rawAvailability||'');if(rec.preorderConfirmed||rec.orderOnRequest)rec.availability='order';const replay=headers.indexOf('__review_replay');if(replay>=0){if(!classificationReviewMode())throw Error('Replay fixtures require review mode');rec.reviewReplay=row[replay];}return rec;};
const classificationCombos=variantCombos;
variantCombos=function(rec){
 if(!classificationEnabled())return classificationCombos(rec);
 if(rec.reviewReplay)return [{size:rec.reviewReplay.offer.variant_size??rec.reviewReplay.offer.native_size??rec.reviewReplay.variant_size??'',color:rec.reviewReplay.offer.variant_color??rec.reviewReplay.variant_color??''}];
 const d=categoryDecisionCached(rec.name,rec.category,rec.attrs,{supplier_id:S._classificationSupplier?.id,description:rec.sourceDesc}),p={name:rec.name,desc:rec.sourceDesc,canonical_category_id:d.canonical_category_id,variants:[{}]},policy=classificationSizePolicy(p);
 const z=RubizhSizeEvidence.resolve({...policy,variant:{},product:{name:rec.sourceName,description:rec.sourceDesc,variants:[{}]},offers:[{sid:S._classificationSupplier?.id,s:rec.sku,source_name:rec.sourceName,source_description:rec.sourceDesc,source_attributes:rec.sourceAttrs,source_row_raw:rec.sourceRowRaw,variant_name:rec.variantName,...(rec.sizeInputProvenance==='DEDICATED_COLUMN'?{structured_size:rec.rz,size_raw:rec.rz}:{})}],rules:S.cfg.confirmed_supplier_size_rules||[]});
 rec.classificationSize=z;
 // One source row is one binding. Model lists never create a cartesian product.
 return [{size:z.confidence==='SAFE_AUTO'&&['EXACT_SIZE','ONE_SIZE'].includes(z.status)?String(z.value):'',color:splitVariantValues(rec.rc).length===1?rec.rc:''}];
};
function classificationRetainStock(old,o,rec,v,sup){
 const policy=RubizhInventory.policy(sup),manual=!!(v.manualFields?.stock||v.manual_locks?.stock||v.fieldMeta?.stock?.source==='manual'||old?.stock_manual||v.manualFields?.availability||v.manual_locks?.availability);
 const incoming={...o,stock:rec.stock,invalid_stock:rec.invalidStock,source_updated_at:rec.sourceUpdatedAt,stock_observed_at:rec.stockObservedAt};
 const decision=RubizhInventory.retain(policy,old?classificationInventoryContext(old,v):null,incoming,{manual});
 if(decision.retained&&old){
  for(const k of ['stock','invalid_stock','rawAvailability','availability','preorder','preorder_confirmed','order_on_request','leadDays','stock_observed_at','stock_observation_provenance','source_updated_at','expires_at','stock_manual','availability_manual','manual_availability_status','last_valid_stock_observation'])if(Object.hasOwn(old,k))o[k]=structuredClone(old[k]);else delete o[k];
  o.invalid_stock=!!old.invalid_stock;if(!Object.hasOwn(o,'stock_observed_at'))o.stock_observed_at=classificationObservedAt(old);
  o.stock_input_warning=decision.warning==='INVALID_AVAILABILITY_RETAINED'&&policy.mode==='QUANTITY'?'INVALID_OR_MISSING_STOCK_RETAINED':decision.warning;
 }else {o.source_updated_at=rec.sourceUpdatedAt;o.expires_at=rec.stockExpiresAt;delete o.stock_input_warning;}
 if(decision.observation.availability_confirmation==='CONFIRMED')o.last_valid_inventory_observation={...decision.observation,supplier_sku:o.s};
 else delete o.last_valid_inventory_observation;
 if(RubizhInventory.validQuantity(o.stock)&&!o.invalid_stock)o.last_valid_stock_observation={supplier_sku:o.s,stock:o.stock,stock_observed_at:classificationObservedAt(o),source_updated_at:o.source_updated_at||null,expires_at:o.expires_at||null,fingerprint:classificationHash([o.s,o.stock,classificationObservedAt(o),o.source_updated_at,o.expires_at])};
 return decision.retained;
}
const classificationOfferUpdate=applyOfferUpdate;
applyOfferUpdate=function(p,v,sup,offer,rec,cat,d,ck,stats,at){
 if(rec.reviewReplay){
  const old=v.offers?.[sup.id];if(!old||old.s!==rec.reviewReplay.offer.s)throw Error('Replay binding mismatch');
  touchP(p.id);v.offers[sup.id]={...structuredClone(old),at,imported_at:at,stock_observed_at:classificationObservedAt(old)};const inv=classificationInventory({sid:sup.id,...old},v);if(inv.availability_confirmation==='CONFIRMED')v.offers[sup.id].last_valid_inventory_observation={...inv,supplier_sku:old.s};stats.updated++;markProduct(p);return;
 }
 const previousStock=structuredClone(v.offers?.[sup.id]);
 const locks=structuredClone({size:v.size,manualFields:v.manualFields,manual_locks:v.manual_locks,fieldMeta:v.fieldMeta});
 const z=classificationOfferUpdate(...arguments);const o=v.offers?.[sup.id];if(o){o.structured_size=rec.sizeInputProvenance==='DEDICATED_COLUMN'?rec.rz:null;o.variant_name=rec.variantName;o.size_input_provenance=rec.sizeInputProvenance;o.imported_at=at;o.stock_observed_at=rec.stockObservedAt;o.stock_observation_provenance=rec.stockObservedAt?'SUPPLIER_FIELD':'UNKNOWN';o.inventory_source_column=rec.inventorySourceColumn;if(RubizhInventory.policy(sup).confirmed&&RubizhInventory.policy(sup).mode==='FEED_PRESENCE'&&RubizhInventory.policy(sup).feed_presence_confirmed===true)o.feed_presence_confirmed=true;if(!o.preorderManual){o.preorder=rec.preorderConfirmed;o.preorder_confirmed=rec.preorderConfirmed;o.order_on_request=rec.orderOnRequest;}classificationRetainStock(previousStock,o,rec,v,sup);}
 if(locks.manualFields?.size||locks.manual_locks?.size||locks.fieldMeta?.size?.source==='manual'||classificationLocked(p,'size'))v.size=locks.size;
 return z;
};
const classificationImport=runImport;
runImport=function(sup,rows,hdr,map,opts={}){
 classificationEnable();
 const publication=new Map([...S.products.values()].map(p=>[p.id,Object.fromEntries(['pub','archived','archiveReason','archivePrevPub','syncStatus','simple_excluded_reason'].filter(k=>Object.hasOwn(p,k)).map(k=>[k,structuredClone(p[k])]))]));
 const replay=rows.slice(hdr+1).some(row=>row[(rows[hdr]||[]).indexOf('__review_replay')]);
 const contentBefore=replay?new Map([...S.products.values()].map(p=>[p.id,Object.fromEntries(['name','desc','attrs','photos','photoMeta','fieldMeta','translated_description_uk','source_description'].filter(k=>Object.hasOwn(p,k)).map(k=>[k,structuredClone(p[k])]))])):null;
 const previousSupplier=S._classificationSupplier;let result;
 try{S._classificationSupplier=sup;result=classificationImport(sup,rows,hdr,map,{...opts,zeroMissing:classificationEnabled()?false:opts.zeroMissing});}finally{S._classificationSupplier=previousSupplier;}
 const touched=[...S.products.values()].filter(p=>p.variants.some(v=>v.offers?.[sup.id]?.at===result.at));
 for(const p of touched){if(contentBefore?.has(p.id)){const old=contentBefore.get(p.id);for(const k of ['name','desc','attrs','photos','photoMeta','fieldMeta','translated_description_uk','source_description'])if(Object.hasOwn(old,k))p[k]=old[k];else delete p[k];}classificationApplyProduct(p);}
 // Cards merged into a model during this import stay archived; restoring their pre-import flags would revive empty cards.
 for(const p of S.products.values()){if(p.merged_into)continue;const old=publication.get(p.id);if(!old){p.pub=false;p.archived=false;continue;}for(const k of ['pub','archived','archiveReason','archivePrevPub','syncStatus','simple_excluded_reason']){if(Object.hasOwn(old,k))p[k]=old[k];else delete p[k];}}
 bumpData();result.classification_report=classificationSummary(touched);return result;
};
function classificationSummary(products=[...S.products.values()]){const out={SAFE_AUTO:0,LIKELY:0,AMBIGUOUS:0,exact_sku_sizes:0,allowed_sizes_without_sku:0,SIZE_CONFIRMATION_REQUIRED:0,UNKNOWN_stock:0,NO_SIZE_REQUIRED:0,ONE_SIZE:0};for(const p of products){out[p.category_confidence_tier||'AMBIGUOUS']++;out.allowed_sizes_without_sku+=classificationOptions(p).length;for(const v of p.variants){out[v.size_confidence_tier||'AMBIGUOUS']++;if(v.size_status==='EXACT_SIZE')out.exact_sku_sizes++;if(v.size_status==='SIZE_CONFIRMATION_REQUIRED')out.SIZE_CONFIRMATION_REQUIRED++;if(v.size_status==='NO_SIZE_REQUIRED')out.NO_SIZE_REQUIRED++;if(v.size_status==='ONE_SIZE')out.ONE_SIZE++;if(classificationAvailability(p,v).stock_quantity==null)out.UNKNOWN_stock++;}}return out;}
function classificationGroups(){const groups=new Map();for(const p of S.products.values())for(const e of p.classification_exceptions||[]){if(e.status!=='OPEN')continue;const g=groups.get(e.group_key)||{key:e.group_key,kind:e.kind,title:e.reason_code,detail:e.rule_id,tier:e.tier,ids:[],exceptions:[],examples:[]};g.ids.push(p.id);g.exceptions.push(e);if(g.examples.length<3)g.examples.push({product_id:p.id,name:p.name,sku:e.variant_sku});groups.set(g.key,g);}return [...groups.values()].map(g=>({...g,ids:[...new Set(g.ids)],count:g.exceptions.length}));}
function classificationInventoryGroups(){
 const groups=new Map();for(const p of S.products.values())for(const v of p.variants)for(const [sid,o] of Object.entries(v.offers||{})){
  const supplier=S.cfg.suppliers.find(s=>s.id===sid);if(!supplier||supplier.disabled)continue;const policy=RubizhInventory.policy(supplier),inv=classificationInventory({sid,...o},v);if(inv.availability_confirmation==='CONFIRMED')continue;
  const pattern=policy.confirmed?'unknown-value:'+String(o.rawAvailability??'').trim():'policy-unconfirmed',key='inventory:'+sid+':'+policy.id+':'+pattern,g=groups.get(key)||{key,kind:'inventory',title:supplier.name+': правило доступності',detail:policy.confirmed?'Невідоме значення наявності; попереднє підтверджене не перезаписується.':'Потрібне одне підтвердження значення колонки '+(policy.source_column||'наявності')+' для постачальника.',tier:'AMBIGUOUS',target:'sup:'+sid,ids:[],count:0,examples:[]};g.ids.push(p.id);g.count++;if(g.examples.length<3)g.examples.push({product_id:p.id,sku:v.sku,raw_value:o.rawAvailability});groups.set(key,g);
 }return [...groups.values()].map(g=>({...g,ids:[...new Set(g.ids)]}));
}
const classificationDecisions=simpleDecisions;
simpleDecisions=function(){const old=classificationDecisions();if(!classificationEnabled())return old;const ids=new Set([...S.products.values()].filter(p=>p.classification_exceptions).map(p=>p.id));return [...old.filter(t=>!['size','category'].includes(t.kind)||!(t.ids||[]).every(id=>ids.has(id))),...classificationGroups(),...classificationInventoryGroups()];};
// Private server-side fulfillment routing kept when normalized variants replace the legacy list (G02).
const CLASSIFICATION_RETAINED_VARIANT_FIELDS=['barcode','fulfillment_supplier_id','fulfillment_supplier_sku','fulfillment_origin'];
function classificationExport(p,{publicOnly=false}={}){
 if(classificationReviewMode()&&(!classificationEnabled()||S.cfg.inventory_policy_version!==1||(p.variants||[]).some(v=>!v.size_status||!v.size_confidence_tier||!v.source_binding_status)))throw Error('RC_IMPORT_REQUIRED: виконайте контрольний імпорт перед export');
 const colors=mcColors(p),variants=p.variants.map(v=>{const pal=simplePalette(v),a=classificationAvailability(p,v),z=simpleSize(p,v),c=calc(p,v);const color=colors.find(x=>x.variant_skus.includes(v.sku));return {sku:v.sku,color_id:color?.id||null,color:pal.color,camouflage:pal.camouflage,photos:color?.photos||[],size:z.size_normalized??v.size??null,...z,source_binding_status:v.source_binding_status||'CONFIRMATION_REQUIRED',price:c.price,...variantSalePricing(p,v,c),...a,lead_time_days:a.availability==='PREORDER'&&a.delivery_lead_time_days==null?confirmedPreorderDays(c.o||c.ref):null,...(!publicOnly?{supplier_bindings:Object.entries(v.offers||{}).map(([sid,o])=>({supplier_id:sid,supplier_sku:o.s}))}:{})};});
 const availability=variants.some(v=>v.availability==='IN_STOCK')?'IN_STOCK':variants.some(v=>v.availability==='PREORDER')?'PREORDER':variants.some(v=>v.availability==='ORDER_ON_REQUEST')?'ORDER_ON_REQUEST':variants.some(v=>v.availability==='SIZE_CONFIRMATION_REQUIRED')?'SIZE_CONFIRMATION_REQUIRED':variants.length&&variants.every(v=>v.availability==='OUT_OF_STOCK')?'OUT_OF_STOCK':'UNKNOWN';
 return {id:p.id,model_id:p.id,classification_version:1,size_catalog_version:1,canonical_category_id:p.canonical_category_id||null,availability,order_policy_version:1,inventory_policy_version:1,order_submission_allowed:variants.some(v=>v.order_submission_allowed)||classificationOptions(p).length>0,payment_allowed:variants.some(v=>v.payment_allowed),requires_order_confirmation:!variants.some(v=>v.payment_allowed)&&(variants.some(v=>v.requires_order_confirmation)||classificationOptions(p).length>0),size_catalogs:(p.size_catalogs||[]).map(c=>Object.fromEntries(['catalog_id','scope','color_id','size_system','allowed_sizes','size_range_min','size_range_max'].map(k=>[k,c[k]]))),size_options:classificationOptions(p),colors,variants};
}
const classificationPayload=simpleProductPayload;
simpleProductPayload=function(a){if(classificationReviewMode()&&(!classificationEnabled()||S.cfg.inventory_policy_version!==1))throw Error('RC_IMPORT_REQUIRED: спочатку контрольний імпорт');const out=classificationPayload(a);if(!classificationEnabled())return out;const normalized=classificationExport(a.p,{publicOnly:true}),previous=new Map(out.variants.map(v=>[v.sku,v]));for(const v of normalized.variants){const old=previous.get(v.sku);if(old)for(const k of CLASSIFICATION_RETAINED_VARIANT_FIELDS)if(Object.hasOwn(old,k)&&!Object.hasOwn(v,k))v[k]=old[k];}Object.assign(out,normalized);const prices=normalized.variants.map(v=>v.price).filter(v=>Number.isFinite(v)&&v>0);out.site_price=prices.length?Math.min(...prices):null;return out;};
const classificationMcSelect=mcSelect;
mcSelect=function(p,colorId,sku){const out=classificationMcSelect(p,colorId,sku);if(out&&classificationEnabled()){out.model_size_options=classificationOptions(p).filter(o=>o.scope==='MODEL');out.size_options.push(...classificationOptions(p).filter(o=>o.scope==='COLOR'&&o.color_id===out.color.id));}return out;};
function classificationDescription(p){
 if(classificationLocked(p,'desc'))return String(p.desc||'');
 const existing=simpleDescription(p);if(existing)return existing;
 const facts=classificationSources(p).flatMap(s=>Object.entries(s.source_attributes||{})).filter(([k,v])=>/^(матеріал|материал|склад|состав|тип|вага|вес|об.?єм|объем|розмір|размер|size|колір|цвет|color|довжина|длина|ширина|висота|высота|бренд|brand)$/iu.test(k)&&String(v??'').trim());
 const unique=[...new Map(facts.map(([k,v])=>[k+':'+v,[k,v]])).values()];
 return unique.map(([k,v])=>'<p>'+htmlSafeText(autoUkText(k+': '+v))+'</p>').join('');
}
const classificationBuildFeed=buildFeed;
buildFeed=function(){
 if(!classificationEnabled()||classificationReviewMode()&&S.cfg.inventory_policy_version!==1)return classificationReviewMode()?{version:3,review_only:true,classification_pending:true,order_policy_version:1,inventory_policy_version:1,category_catalog_version:2,size_catalog_version:1,categories:categoryPublicCatalogue(),products:[]}:classificationBuildFeed();
 // Review export includes unconfirmed selectable options, but never permits their checkout.
 const products=[...S.products.values()].filter(p=>p.pub&&!p.archived&&p.canonical_category_id&&simplePhotos(p).length&&classificationDescription(p)).map(p=>({...classificationExport(p,{publicOnly:true}),name:p.marketing_name_uk||p.model_name||p.name,photos:simplePhotos(p),description:classificationDescription(p),category:canonicalPath(p.canonical_category_id),category_path:canonicalPath(p.canonical_category_id).split(' / ')}));
 return {version:3,review_only:classificationReviewMode(),sync_enabled:false,order_policy_version:1,inventory_policy_version:1,category_catalog_version:2,size_catalog_version:1,categories:categoryPublicCatalogue(),products};
};
const classificationPreviewHtml=mcPreviewHtml;
mcPreviewHtml=function(p){const html=classificationPreviewHtml(p);if(!classificationEnabled())return html;const options=classificationOptions(p).filter(o=>o.scope==='MODEL');return html+(options.length?'<section class="panel"><h3>Асортимент розмірів моделі</h3><p>'+options.map(o=>esc(o.size)).join(' · ')+'</p><p class="small">Ці опції не мають підтвердженого SKU, кольору або залишку. Потрібні дані постачальника; можна подати заявку; оплата до підтвердження заборонена.</p></section>':'');};
const classificationPreview=doImport;
doImport=async function(){const result=await classificationPreview(...arguments);if(S.imp?.preview)S.imp.classification_preview_signature=classificationHash([S.imp.rows,S.imp.map,[...S.products.values()],S.cfg]);return result;};
const classificationApplyImport=applyImport;
applyImport=async function(options={}){if(classificationEnabled()&&S.imp?.preview&&S.imp.classification_preview_signature!==classificationHash([S.imp.rows,S.imp.map,[...S.products.values()],S.cfg]))throw Error('STALE_PREVIEW: повторіть preview');return classificationApplyImport(options);};

const classificationPriceScope=categoryPriceScope;categoryPriceScope=function(p,rule){return classificationPriceScope(p.pricing_canonical_category_id?{...p,canonical_category_id:p.pricing_canonical_category_id,last_confirmed_category_id:p.pricing_canonical_category_id}:p,rule);};

const classificationSupplierView=vSupplier;vSupplier=function(id){const supplier=S.cfg.suppliers.find(s=>s.id===id),policy=RubizhInventory.policy(supplier);return '<section class="panel"><h3>Правило доступності</h3><p>'+esc(policy.mode)+' · '+(policy.confirmed?'Підтверджено':'Потребує підтвердження постачальника')+'</p><p class="small">'+esc(policy.source_column||'Сигнал не визначено')+'. Кількість не створюється зі статусу. Давність дає лише попередження.</p></section>'+classificationSupplierView(id).replace('<label class="f">Приоритет',`<label class="f">Попередження про давність, годин<input type="number" min="0.1" step="0.1" data-sf="stock_freshness_hours" value="${esc(S.cfg.suppliers.find(s=>s.id===id)?.stock_freshness_hours??'')}" placeholder="${STOCK_WARNING_DEFAULT_HOURS}"></label><label class="f">Приоритет`);};
