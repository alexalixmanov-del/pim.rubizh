'use strict';
const crypto=require('node:crypto'),V2=require('./model-contract-v2.js');
const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const uniq=a=>[...new Set(a)].sort();
const aliases={
 black:['black','чорний','черный','чёрный'],olive:['olive','олива','оливковый','оливковий'],khaki:['khaki','хаки','хакі'],
 coyote:['coyote','койот'],multicam:['multicam','мультикам','мультикамі'],pixel:['pixel','пиксель','піксель','мм14','мм-14','укрпіксель','укрпиксель'],
 dark_olive:['dark olive','темна олива','темная олива'],grey:['grey','gray','сірий','серый'],graphite:['графіт','графит'],
 white:['white','білий','белый'],multicam_black:['multicam black','чорний мультикам','черный мультикам'],
 white_multicam:['білий мультикам','белый мультикам'],green_multicam:['зелений мультикам','зеленый мультикам']
};
function color(value){const n=normalize(value);return Object.keys(aliases).find(k=>aliases[k].includes(n))||n;}
const traitKeys={season:['сезон'],material:['матеріал','материал'],composition:['склад','состав'],type:['тип'],item_type:['вид изделия','вид виробу'],outer_layer:['зовнішній шар'],lining:['підкладка','подкладка'],armor_class:['класс защиты','клас захисту']};
function traits(offer){const out={};for(const [key,names] of Object.entries(traitKeys)){const vals=uniq((offer.params||[]).filter(p=>names.includes(normalize(p.name))).map(p=>normalize(p.value)).filter(Boolean));if(vals.length)out[key]=vals;}return out;}
function frame(offer,sizes=[]){
 let name=normalize(offer.name);const tokens=[];for(const raw of offer.color_values||[]){const k=color(raw);tokens.push(raw,...(aliases[k]||[]));}
 const escape=raw=>normalize(raw).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 for(const raw of uniq(tokens).filter(Boolean).sort((a,b)=>b.length-a.length)){
  name=name.replace(new RegExp('(^|[^\\p{L}\\p{N}])'+escape(raw)+'(?=$|[^\\p{L}\\p{N}])','gu'),' ');
 }
 // Size letters are removed only from labeled or terminal size positions, never from M-Tac or a model code.
 for(const raw of uniq([...(offer.size_values||[]),...sizes]).filter(Boolean).sort((a,b)=>b.length-a.length)){
  const token=escape(raw);name=name.replace(new RegExp('(?:розмір|размер|size)\\s*[:=]?\\s*'+token+'(?=$|[^\\p{L}\\p{N}])','gu'),' ');
  name=name.replace(new RegExp('(?:^|[^\\p{L}\\p{N}])'+token+'\\s*[)\\]]?\\s*$','gu'),' ');
 }
 return name.replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function technicalDescription(offer){
 const raw=offer.fields?.description?.[0]??offer.fields?.description_ua?.[0]??offer.fields?.Опис_укр?.[0]??offer.fields?.Опис?.[0]??null;
 const text=normalize(String(raw??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' '));
 return {length:text.length,digest:crypto.createHash('sha256').update(text).digest('hex')};
}
function skuFamily(offer){
 const code=String(offer.supplier_sku??''),tokens=code.split('-');let stripped=false;const colors=uniq((offer.color_values||[]).map(color));const suffixCodes={coyote:['К','K','COY','COYOTE'],olive:['О','O','OLV','OLIVE'],black:['Ч','BLK','BLACK'],multicam:['MC','MULTICAM'],pixel:['P','П','MM14','PIXEL'],khaki:['KH','KHAKI']};
 while(tokens.length>1){const last=tokens[tokens.length-1];const isSize=(offer.size_values||[]).some(s=>normalize(s)===normalize(last));const isColor=colors.some(c=>(suffixCodes[c]||[]).includes(last.toUpperCase()));if(isSize===isColor)break;if(!isSize&&!isColor)break;tokens.pop();stripped=true;}
 return {family:tokens.join('-'),suffix_verified_from_variant_fields:stripped};
}
function triageConflicts(source,report,document){
 const products=new Map(source.products.map(p=>[p.legacy_product_id,p])),variants=new Map(source.variants.map(v=>[v.legacy_sku,v]));const feedIndex=new Map(document.feeds.map(f=>[f.supplier_id,f]));const offers=new Map(document.feeds.flatMap(f=>f.offers.map(o=>[V2.key(f.supplier_id,o.offer_id),o])));
 const links=new Map();for(const l of report.supplier_links){if(!links.has(l.legacy_product_id))links.set(l.legacy_product_id,[]);links.get(l.legacy_product_id).push(l);}
 const groups=new Map(report.model_groups.map(g=>[g.model_id,g]));const cases=[];
 for(const row of report.product_groups.filter(p=>p.model_ids.length>1)){
  const p=products.get(row.legacy_product_id),ls=links.get(row.legacy_product_id)||[],distinct=new Map();for(const l of ls){const key=V2.key(l.supplier_id,l.offer_id);if(!distinct.has(key))distinct.set(key,{link:l,offer:offers.get(key),sizes:[]});const v=variants.get(l.legacy_sku);distinct.get(key).sizes.push(v?.size?.raw,v?.size?.normalized);}
  const entries=[...distinct.values()],os=entries.map(e=>e.offer).filter(Boolean),sids=uniq(ls.map(l=>l.supplier_id)),brands=uniq(os.map(o=>normalize(o.brand)).filter(Boolean)),cats=uniq(os.map(o=>o.category_id).filter(Boolean));
  const blocked=[],insufficient=[],positive=[];if(os.length!==entries.length||ls.some(l=>l.status!=='CONFIRMED_SUPPLIER_LINK'))blocked.push('UNVERIFIED_SUPPLIER_LINK');if(sids.length!==1)blocked.push('MULTIPLE_SUPPLIERS');
  const brandKnown=os.every(o=>o.brand&& !['no brand','без бренду','без бренда'].includes(normalize(o.brand)))&&brands.length===1;if(brands.length>1)blocked.push('BRAND_CONTRADICTION');else if(brandKnown)positive.push('EXACT_BRAND');else insufficient.push('BRAND_UNKNOWN');
  const sameCategory=os.every(o=>o.category_id)&&cats.length===1;if(!sameCategory)blocked.push('SUPPLIER_CATEGORY_CONTRADICTION');else positive.push('EXACT_SUPPLIER_CATEGORY');
  const fingerprints=os.map(traits),agreed=[];
  for(const key of Object.keys(traitKeys)){
   const known=fingerprints.filter(t=>t[key]).map(t=>JSON.stringify(t[key])),distinctValues=uniq(known);if(distinctValues.length>1)blocked.push('TRAIT_CONTRADICTION:'+key);else if(known.length===os.length&&known.length)agreed.push(key);
  }
  const descriptions=os.map(technicalDescription);const exactTechnical=descriptions.length>0&&descriptions.every(d=>d.length>=500)&&uniq(descriptions.map(d=>d.digest)).length===1;if(exactTechnical)positive.push('EXACT_SUBSTANTIAL_SUPPLIER_DESCRIPTION');
  const frames=uniq(entries.filter(e=>e.offer).map(e=>frame(e.offer,e.sizes.filter(Boolean))));const frameAgrees=frames.length===1&&!!frames[0];if(frameAgrees)positive.push('EXACT_NAME_FRAME_EXCLUDING_RECORDED_VARIANTS');else insufficient.push('NAME_FRAME_DIFFERS');
  const familyRows=os.map(skuFamily),family=uniq(familyRows.map(r=>r.family));const familyProven=family.length===1&&familyRows.some(r=>r.suffix_verified_from_variant_fields)&&family[0].length>=3;
  if(familyProven)positive.push('EXACT_SUPPLIER_SKU_FAMILY_WITH_VERIFIED_VARIANT_SUFFIX');else insufficient.push('NO_VERIFIED_COMMON_SUPPLIER_FAMILY');
  const nativeModels=os.map(o=>uniq((o.params||[]).filter(p=>['model','model_id','модель','код моделі','код модели','артикул моделі'].includes(normalize(p.name))).map(p=>normalize(p.value)).filter(Boolean)));
  const explicitModel=nativeModels.length&&nativeModels.every(v=>v.length===1)&&uniq(nativeModels.map(v=>v[0])).length===1;if(explicitModel)positive.push('EXPLICIT_MANUFACTURER_MODEL');
  if(uniq(nativeModels.flat()).length>1)blocked.push('MANUFACTURER_MODEL_CONTRADICTION');
  // Check all occurrences; duplicate supplier offer linkage does not authorize deduplicating SKU.
  const colorConflicts=os.filter(o=>uniq((o.color_values||[]).map(color)).length>1).length;if(colorConflicts)insufficient.push('RAW_COLOR_FIELDS_NEED_DECISION');
  const variantPairs=new Map(),collisions=[];for(const l of ls){const v=variants.get(l.legacy_sku),o=offers.get(V2.key(l.supplier_id,l.offer_id)),cs=uniq((o?.color_values||[]).map(color));const size=v?.size?.normalized??null;if(cs.length!==1||size===null)continue;const key=JSON.stringify([cs[0],normalize(size)]);if(variantPairs.has(key)&&variantPairs.get(key)!==l.legacy_sku)collisions.push([variantPairs.get(key),l.legacy_sku]);else variantPairs.set(key,l.legacy_sku);}
  if(collisions.length)insufficient.push('DUPLICATE_COLOR_SIZE_SKU');
  const canonicalIDs=uniq(row.model_ids.flatMap(id=>groups.get(id)?.canonical_category_ids||[]));if(canonicalIDs.length>1)blocked.push('CANONICAL_CATEGORY_CONTRADICTION');
  let bucket='AMBIGUOUS';if(!blocked.length&&brandKnown&&sameCategory&&frameAgrees&&((familyProven||explicitModel)&&agreed.length>=2||exactTechnical&&agreed.length>=3&&frames[0].split(' ').length>=5)&&!colorConflicts&&!collisions.length)bucket='SAFE_AUTO';
  else if(!blocked.length&&sameCategory&&(brandKnown&&(frameAgrees||exactTechnical&&agreed.length>=2||familyProven||explicitModel)||frameAgrees&&agreed.length>=2))bucket='LIKELY';
  else if(!blocked.length&&brandKnown&&sameCategory&&frameAgrees)bucket='LIKELY';
  const reason=bucket==='SAFE_AUTO'?'Verified supplier family/model ID with two characteristics, or exact substantial technical description and exact model-name frame with at least three characteristics; brand/category agree and no contradictions':bucket==='LIKELY'?'Independent brand/category/link evidence and exact variant-stripped name frame or family; insufficient proof for automatic consolidation':'Contradictory or insufficient model identity evidence';
  cases.push({legacy_product_id:p.legacy_product_id,name:p.protected.name||null,source_presence:p.source_presence,site_product_present:p.source_presence==='BOTH',canonical_category_id:p.canonical_category_id??null,supplier_ids:sids,supplier_keys:sids.map(id=>feedIndex.get(id)?.supplier_key),source_group_ids:row.model_ids,bucket,confidence:bucket==='SAFE_AUTO'?'RULE_ELIGIBLE_PENDING_REVIEW':bucket==='LIKELY'?'REVIEW_CANDIDATE':'UNRESOLVED',reason,positive_evidence:positive,fully_agreed_characteristics:agreed,agreed_characteristic_values:Object.fromEntries(agreed.map(k=>[k,fingerprints[0][k]])),contradictory_characteristic_values:Object.fromEntries(Object.keys(traitKeys).filter(k=>uniq(fingerprints.filter(t=>t[k]).map(t=>JSON.stringify(t[k]))).length>1).map(k=>[k,uniq(fingerprints.flatMap(t=>t[k]||[]))])),brands,supplier_category_ids:cats,technical_description_match:exactTechnical,technical_description_sha256:exactTechnical?descriptions[0].digest:null,blocking_evidence:uniq(blocked),missing_evidence:uniq(insufficient),source_names_frames:frames,verified_sku_family:familyProven?family[0]:null,explicit_manufacturer_model:explicitModel?nativeModels[0][0]:null,sku_count:uniq(ls.map(l=>l.legacy_sku)).length,offer_count:os.length,duplicate_color_size_pairs:uniq(collisions.map(JSON.stringify)).map(JSON.parse),raw_color_conflict_offers:colorConflicts,proposed_model_id:'mdl_'+V2.key(p.legacy_product_id),mapping_status:'UNKNOWN',automatic_apply:false,availability_verified:false});
 }
 const counts=Object.fromEntries(['SAFE_AUTO','LIKELY','AMBIGUOUS'].map(k=>[k,cases.filter(c=>c.bucket===k).length]));
 return {algorithm_version:'conflict-triage-v1',production_modified:false,confirmed_registry_changed:false,similar_name_is_sufficient:false,scope:'source groups within an existing legacy product; no cross-product merge',summary:{cases:cases.length,...counts,current_site_cases:cases.filter(c=>c.site_product_present).length,pim_only_cases:cases.filter(c=>!c.site_product_present).length,actual_multiple_supplier_cases:cases.filter(c=>c.supplier_ids.length>1).length},cases};
}
module.exports={triageConflicts,normalize,color,traits,frame,skuFamily};
