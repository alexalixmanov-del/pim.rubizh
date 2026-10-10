(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./product-model.js'));else root.RubizhSizeEvidence=factory(root.RubizhModel);})(typeof globalThis!=='undefined'?globalThis:this,function(Model){
'use strict';
const ALPHA=['XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL'],clean=x=>String(x??'').normalize('NFKC').replace(/\.{3}|…/g,'-').replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim(),alpha=x=>clean(x).toUpperCase().replace(/^2XL$/,'XXL').replace(/^3XL$/,'XXXL'),uniq=a=>[...new Set(a)];
function sizeSystem(type,explicit){if(explicit)return explicit;return ['combat_shirt','pants','jacket','fleece','base_layer','clothing'].includes(type)?'clothing_numeric':['boots','shoes','insoles'].includes(type)?'footwear_eu':null;}
function expand(entry,{type,system,step,combinedRange=false}={}){
 if(entry.kind==='ONE_SIZE')return {confidence:'SAFE_AUTO',size_system:'universal',allowed_sizes:['OS']};
 const inferred=sizeSystem(type,system),declared=system||entry.size_system,numeric=typeof entry.size_range_min==='number'||entry.size_list?.every(v=>typeof v==='number'||/^\d{2}$/u.test(String(v)))||['clothing_numeric','footwear_eu'].includes(declared);
 const actual=declared||(numeric?inferred:entry.kind==='SIZE_LIST'||entry.kind==='SIZE_RANGE'?'letter_clothing':null);
 if(!numeric&&!['clothing','combat_shirt','pants','jacket','fleece','base_layer','gloves'].includes(type)&&system!=='letter_clothing')return {confidence:'AMBIGUOUS',reason:'SIZE_SYSTEM_UNKNOWN'};
 if(!actual)return {confidence:'AMBIGUOUS',reason:'SIZE_SYSTEM_UNKNOWN'};
 if(entry.kind==='SIZE_LIST')return {confidence:'SAFE_AUTO',size_system:actual,allowed_sizes:entry.size_list.map(String)};
 if(entry.kind!=='SIZE_RANGE')return {confidence:'AMBIGUOUS',reason:'NOT_A_RANGE'};
 if(numeric){const inc=step??(actual==='clothing_numeric'?2:actual==='footwear_eu'?1:null),min=entry.size_range_min,max=entry.size_range_max;
  if(combinedRange)return {confidence:'AMBIGUOUS',reason:'COMBINED_SIZE_OR_RANGE'};
  if(!Number.isInteger(inc)||inc<1||inc>10||max<min||(max-min)%inc!==0||(actual==='clothing_numeric'&&(min<20||max>90))||(actual==='footwear_eu'&&(min<15||max>55)))return {confidence:'AMBIGUOUS',reason:'SIZE_SYSTEM_RANGE_CONFLICT'};
  return {confidence:'SAFE_AUTO',size_system:actual,allowed_sizes:Array.from({length:(max-min)/inc+1},(_,i)=>String(min+i*inc))};
 }
 const first=ALPHA.indexOf(alpha(entry.size_range_min)),last=ALPHA.indexOf(alpha(entry.size_range_max));return first>=0&&last>=first?{confidence:'SAFE_AUTO',size_system:actual,allowed_sizes:ALPHA.slice(first,last+1)}:{confidence:'AMBIGUOUS',reason:'LETTER_ORDER_UNKNOWN'};
}
function priority(e){const s=e.source||'';return s==='manual_size'?0:s.startsWith('supplier_grid:')?1.5:/xls_column|structured_size_field/u.test(s)?1:/^offer\.(?:size_raw|native_size|variant_size)$/u.test(s)?2:s.startsWith('supplier_rule:')?3:/^variant\.(?:size|size_raw|native_size)$/u.test(s)?3.5:/variant_name|variant_label/u.test(s)?4:/source_name|original_name|product.name/u.test(s)?5:/structured/u.test(s)?6:7;}
function parse(raw,{scope='model',type='clothing',sharedSku=false}={}){
 const text=clean(raw),label=text.replace(/^(?:розміри|размеры|sizes?|розмір|размер)\s*[:=-]?\s*/iu,'').trim(),n=label.replace(/\s+/g,'').toUpperCase();
 if(!n)return null;
 if(/^(?:ONE[ -]?SIZE|OS|УНІВЕРСАЛЬНИЙ|УНИВЕРСАЛЬНЫЙ|ОДИН РОЗМІР|ОДИН РАЗМЕР)$/iu.test(label))return {kind:'ONE_SIZE',value:'OS',raw:text};
 const parts=label.split(/\s*[,;/]\s*/u);
 if(parts.length>=3&&parts.every(p=>/^\d{2}$/u.test(p)||ALPHA.includes(alpha(p))))return {kind:'SIZE_LIST',size_list:uniq(parts.map(p=>/^\d{2}$/u.test(p)?Number(p):alpha(p))),raw:text};
 let m=n.match(/^(\d{2})-(\d{2})$/u);
 if(m){const min=Number(m[1]),max=Number(m[2]);if(max<min)return {kind:'SIZE_CONFIRMATION_REQUIRED',raw:text,invalid:true};const combined=type==='insoles'&&max-min<=4||['clothing','combat_shirt','pants','jacket','fleece','base_layer'].includes(type)&&[2,4].includes(max-min);if(scope==='sku'&&!sharedSku&&combined)return {kind:'EXACT_SIZE',value:min+'-'+max,raw:text};return {kind:'SIZE_RANGE',size_range_min:min,size_range_max:max,raw:text};}
 m=n.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL)-(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL)$/u);
 if(m){const min=alpha(m[1]),max=alpha(m[2]);if(ALPHA.indexOf(min)>ALPHA.indexOf(max))return {kind:'SIZE_CONFIRMATION_REQUIRED',raw:text,invalid:true};return {kind:'SIZE_RANGE',size_range_min:min,size_range_max:max,raw:text};}
 if(parts.length===2&&parts.every(p=>/^\d{2}$/u.test(p)||ALPHA.includes(alpha(p)))){
  const numeric=parts.every(p=>/^\d{2}$/u.test(p)),a=numeric?Number(parts[0]):ALPHA.indexOf(alpha(parts[0])),b=numeric?Number(parts[1]):ALPHA.indexOf(alpha(parts[1]));
  const combined=numeric?type==='insoles'&&b-a<=4||['boots','shoes'].includes(type)&&b-a===1||['clothing','combat_shirt','pants','jacket','fleece','base_layer'].includes(type)&&[2,4].includes(b-a):b-a===1;
  if(scope==='sku'&&!sharedSku&&b>a&&combined)return {kind:'EXACT_SIZE',value:parts.map(p=>numeric?Number(p):alpha(p)).join('/'),raw:text};
  return {kind:'SIZE_LIST',size_list:parts.map(p=>numeric?Number(p):alpha(p)),raw:text};
 }
 const base=Model.size(label,type,{universalConfirmed:true});
 if(label&&base.size_normalized!=null&&!base.size_unconfirmed){if(scope==='sku'&&!sharedSku)return {kind:'EXACT_SIZE',value:base.size_normalized,raw:text,normalized:base};return {kind:'SIZE_LIST',size_list:[label],size_system:({clothing_alpha:'letter_clothing',eu_shoes:'footwear_eu'}[base.size_system]||base.size_system),raw:text};}
 return null;
}
function fromText(raw,{type,scope='model',source='description'}={}){
 const text=clean(String(raw||'').replace(/<[^>]*>/g,' ')),out=[];
 // Size labels terminate at units/sentence or unrelated words. Dimensions are not body sizes.
 const re=/(?:розміри|размеры|sizes|розмір|размер|size)\s*[:=-]?\s*(one\s+size|універсальний|универсальный|(?:\d{2}|XXXS|XXS|XS|[2-6]?XL|XXL|XXXL|S|M|L)(?:\s*[-–—,;/]\s*(?:\d{2}|XXS|XS|[2-6]?XL|XXL|XXXL|S|M|L))*)(?![\p{L}\p{N}])/giu;
 for(const m of text.matchAll(re)){if(/^\s*(?:[xх×]|см|cm|мм|mm)/iu.test(text.slice(m.index+m[0].length)))continue;const plural=/^(?:розміри|размеры|sizes)/iu.test(m[0]),parsed=parse(m[1],{type,scope:plural?'model':scope});if(parsed)out.push({...parsed,source,scope:plural?'model':scope,proof:m[0]});}
 return out;
}
function variantLabel(raw,{type,source='variant.label'}={}){
 const text=clean(raw),m=text.match(/(?:^|[\s,;(])((?:\d{2}(?:[/-]\d{1,2})?|XXS|XS|[2-6]?XL|XXL|XXXL|S|M|L)(?:\s*\((?:LONG|REGULAR|SHORT)\))?)\s*\)?$/iu);
 if(!m)return [];
 const parsed=parse(m[1],{type,scope:'sku'});return parsed&&['EXACT_SIZE','ONE_SIZE'].includes(parsed.kind)?[{...parsed,source,scope:'sku',proof:m[0]}]:[];
}
// Owner-approved supplier grid selector (M-WIN nets «ОБЕРІТЬ РОЗМІР СІТКИ: 3х4»): the selector names the SKU's own
// W×H only for that supplier, an approved category and a product name of that family; the title and the
// width/length attributes must not contradict it. «Індивідуальний розмір» and anything else is no evidence.
function gridDimension(rule,o,product){
 const key=x=>clean(x).replace(/[:\s]+$/u,'').toLocaleLowerCase('uk-UA'),attrs=o.source_attributes||{},raw=Object.entries(attrs).find(([k])=>key(k)===key(rule.attribute))?.[1];
 if(raw==null||!(rule.canonical_categories||[]).includes(product.category_id))return null;
 if(rule.supplier_categories&&!rule.supplier_categories.map(key).includes(key(o.supplier_category_raw||'')))return null;
 const name=clean(o.source_name||o.original_name||product.name||'');if(rule.name_pattern&&!new RegExp(rule.name_pattern,'iu').test(name))return null;
 const value=clean(String(raw).replace(/^[:\s]+/u,'')),m=value.match(/^(\d{1,2})\s*[xх×]\s*(\d{1,2})\s*(?:м\.?)?$/iu);if(!m)return null;
 const w=Number(m[1]),h=Number(m[2]),max=rule.max_dimension||50;if(!w||!h||w>max||h>max)return null;
 const dims=[...name.matchAll(/(?<![\p{N}])(\d{1,2})\s*[xх×]\s*(\d{1,2})(?![\p{N}])/giu)].map(x=>x[1]+'×'+x[2]);if(dims.some(d=>d!==w+'×'+h))return null;
 const metre=k=>{const v=Object.entries(attrs).find(([a])=>key(a)===k)?.[1];if(v==null)return null;const n=clean(v).match(/^(\d+(?:[.,]\d+)?)\s*м\.?$/u);return n?Number(n[1].replace(',','.')):NaN;},side=[metre('ширина'),metre('довжина')].filter(x=>x!=null);
 if(side.some(x=>Number.isNaN(x))||side.length===2&&[...side].sort((a,b)=>a-b).join()!==[w,h].sort((a,b)=>a-b).join()||side.length===1&&![w,h].includes(side[0]))return null;
 const label=w+'×'+h+' м';return {kind:'EXACT_SIZE',value:label,raw:label,size_system:rule.size_system||'net_dimensions',source:'supplier_grid:'+rule.id,scope:'sku',supplier_sku:o.s,proof:value};
}
function resolveCore({type,required=true,variant={},product={},offers=[],rules=[],fallback=null}={}){
 if(!required)return {status:'NO_SIZE_REQUIRED',confidence:'SAFE_AUTO',evidence:[],metadata:[]};
 const evidence=[],push=(raw,source,scope='sku',extra={})=>{const parsed=parse(raw,{type,scope,sharedSku:extra.sharedSku});if(parsed)evidence.push({...parsed,source,scope,...extra});};
 if(variant.manualFields?.size){push(variant.size,'manual_size');const e=evidence[0];return e&&['EXACT_SIZE','ONE_SIZE'].includes(e.kind)?{status:e.kind,confidence:'SAFE_AUTO',value:e.value,raw:e.raw,evidence,metadata:[],manual:true}:{status:'SIZE_CONFIRMATION_REQUIRED',confidence:'AMBIGUOUS',evidence,metadata:[],manual:true};}
 const variantScope=offers.some(o=>o.sharedSku)&&variant.source_review_confirmed!==true?'model':'sku';
 for(const key of ['size_raw','native_size','size'])if(variant[key])push(variant[key],'variant.'+key,variantScope);
 for(const o of offers){
  if(o.structured_size!=null&&o.structured_size!=='')push(o.structured_size,'structured_size_field','sku',{supplier_sku:o.s,sharedSku:!!o.sharedSku});
  for(const key of ['native_size','variant_size','size_raw'])if(o[key])push(o[key],'offer.'+key,'sku',{supplier_sku:o.s,sharedSku:!!o.sharedSku});
  for(const [container,attrs] of [['structured_attributes',o.source_attributes],['xls_column',o.source_row_raw]])for(const [key,val] of Object.entries(attrs||{}))if(/^(розмір|размер|size|розмір одягу|размер одежды|розмір виробника|размер производителя)$/iu.test(clean(key)))push(val,container+':'+key,'sku',{supplier_sku:o.s,sharedSku:!!o.sharedSku});
  for(const key of ['variant_name','source_variant_name','variant_label'])if(o[key]){push(o[key],'offer.'+key,'sku',{supplier_sku:o.s});evidence.push(...fromText(o[key],{type,scope:'sku',source:'offer.'+key}),...variantLabel(o[key],{type,source:'offer.'+key}));}
  for(const key of ['source_name','original_name'])if(o[key])evidence.push(...fromText(o[key],{type,scope:o.sharedSku?'model':'sku',source:'offer.'+key}));
  if(o.source_description)evidence.push(...fromText(o.source_description,{type,scope:'model',source:'offer.description'}));
  for(const rule of rules.filter(r=>r.confirmed===true&&!r.kind&&r.supplier_id===o.sid&&(!r.product_type||r.product_type===type))){try{const re=new RegExp(rule.pattern,'u');if(!rule.pattern.startsWith('^')||!rule.pattern.endsWith('$'))continue;const match=String(o.s||'').match(re);if(match&&match[rule.size_group||1])push(match[rule.size_group||1],'supplier_rule:'+rule.id,'sku',{supplier_sku:o.s});}catch{/* Invalid rules never generate sizes. */}}
 }
 for(const o of offers)if(!o.sharedSku)for(const rule of rules.filter(r=>r.confirmed===true&&r.kind==='GRID_DIMENSION_ATTRIBUTE'&&r.supplier_id===o.sid)){const e=gridDimension(rule,o,product);if(e)evidence.push(e);}
 for(const key of ['variant_name','variant_label','name'])if(variant[key]){push(variant[key],'variant.'+key);evidence.push(...fromText(variant[key],{type,scope:'sku',source:'variant.'+key}),...variantLabel(variant[key],{type,source:'variant.'+key}));}
 const single=(product.variants||[]).length===1;
 if(single)for(const [key,val] of Object.entries(product.supplier_attributes||{}))if(/^(розмір|размер|size|розмір одягу|размер одежды)$/iu.test(clean(key)))push(val,'product.structured:'+key);
 // A product title can identify a SKU only when the product has one variant.
 evidence.push(...fromText(product.name,{type,scope:single?'sku':'model',source:'product.name'}));
 evidence.push(...fromText(product.description,{type,scope:'model',source:'product.description'}));
 const allExact=evidence.filter(e=>e.scope==='sku'&&['EXACT_SIZE','ONE_SIZE'].includes(e.kind)),best=allExact.length?Math.min(...allExact.map(priority)):null,exact=allExact.filter(e=>priority(e)===best);
 const rangeRules=rules.filter(r=>r.confirmed===true&&r.size_system&&r.range_step!=null&&offers.some(o=>o.sid===r.supplier_id)&&(!r.product_type||r.product_type===type)),rangePolicies=uniq(rangeRules.map(r=>JSON.stringify([r.size_system,r.range_step])));
 const rangeRule=rangePolicies.length===1?rangeRules[0]:null;
 const metadata=evidence.filter(e=>['SIZE_LIST','SIZE_RANGE'].includes(e.kind)).map(e=>({...e,...(rangePolicies.length>1?{confidence:'AMBIGUOUS',reason:'CONFLICTING_SUPPLIER_RANGE_RULES'}:expand(e,{type,system:product.size_system||rangeRule?.size_system,step:rangeRule?.range_step}))})),values=uniq(exact.map(e=>JSON.stringify(e.value)));
 if(values.length>1)return {status:'SIZE_CONFIRMATION_REQUIRED',confidence:'AMBIGUOUS',evidence,metadata,reason:'CONFLICTING_SKU_SIZE_EVIDENCE'};
 if(values.length===1){const e=exact[0];return {status:e.kind,confidence:'SAFE_AUTO',value:e.value,raw:e.raw,...(e.size_system?{size_system:e.size_system}:{}),evidence,metadata,weak_source_conflicts:allExact.filter(x=>JSON.stringify(x.value)!==JSON.stringify(e.value))};}
 // Existing supplier-specific parsers may contribute ONLY evidence already classified SAFE_AUTO.
 const fallbackParsed=fallback?.size?parse(fallback.size.size_display||fallback.size.size_raw,{type,scope:'sku'}):null;
 if(fallback?.tier==='SAFE_AUTO'&&fallback.size&&!fallback.size.size_unconfirmed&&fallback.size.size_normalized!=null&&!['SIZE_RANGE','SIZE_LIST'].includes(fallbackParsed?.kind)&&(!offers.some(o=>o.sharedSku)||variant.source_review_confirmed===true))return {status:fallback.size.size_system==='universal'?'ONE_SIZE':'EXACT_SIZE',confidence:'SAFE_AUTO',value:fallback.size.size_normalized,raw:fallback.size.size_display,evidence:[{source:'supplier_format_parser',...fallback.size}],metadata};
 const options=metadata.filter(e=>e.confidence==='SAFE_AUTO');
 if(options.length){const signatures=uniq(options.map(e=>JSON.stringify([e.size_system,e.allowed_sizes])));if(signatures.length>1)return {status:'SIZE_CONFIRMATION_REQUIRED',confidence:'AMBIGUOUS',evidence,metadata,reason:'CONFLICTING_MODEL_SIZE_OPTIONS'};const chosen=options[0];return {status:chosen.kind,sku_status:'SIZE_CONFIRMATION_REQUIRED',confidence:'SAFE_AUTO',size_system:chosen.size_system,size_range_min:chosen.size_range_min,size_range_max:chosen.size_range_max,allowed_sizes:chosen.allowed_sizes,size_options:chosen.allowed_sizes.map(size=>({size,supplier_sku:null,stock:null,stock_status:'UNKNOWN',availability:'SIZE_CONFIRMATION_REQUIRED',selectable_for_request:true,checkout_allowed:false})),evidence,metadata,reason:'MODEL_SIZE_OPTIONS_CONFIRMED_STOCK_UNKNOWN'};}
 const skuSuggestions=offers.filter(o=>o.s&&/[-_](?:XXS|XS|S|M|L|XL|XXL|[2-5]XL)$/iu.test(o.s));
 if(skuSuggestions.length&&/^(?:clothing|combat_shirt|pants|jacket|fleece|base_layer|gloves)$/u.test(type||''))return {status:'SIZE_CONFIRMATION_REQUIRED',confidence:'LIKELY',evidence,metadata,suggestion:skuSuggestions[0].s.match(/[-_]([^_-]+)$/u)[1],reason:'SUPPLIER_SKU_RULE_NOT_CONFIRMED'};
 return {status:'SIZE_CONFIRMATION_REQUIRED',confidence:'AMBIGUOUS',evidence,metadata,reason:metadata.length?'MODEL_SIZE_OPTIONS_WITHOUT_SKU_ASSIGNMENT':'NO_SKU_SIZE_EVIDENCE'};
}
function resolve(input={}){const out=resolveCore(input);out.size_required=input.required!==false;out.size_system=out.status==='NO_SIZE_REQUIRED'?'NONE':out.status==='ONE_SIZE'?'universal':out.size_system||(/^\D/u.test(String(out.value??''))&&ALPHA.includes(alpha(out.value))?'letter_clothing':sizeSystem(input.type,input.product?.size_system));return out;}
return {version:1,parse,fromText,resolve,expand,sizeSystem,priority,variantLabel,gridDimension};
});
