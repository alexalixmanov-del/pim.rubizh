// Model colors: explicit galleries, conservative family migration and stable SKU selection.
const MC_VERSION=1,MC_UI={selected:new Map()};
function mcEnabled(){return S.cfg.model_colors_version===MC_VERSION;}
function mcValidPhotos(photos){return uniq((photos||[]).filter(s=>{try{return ['http:','https:'].includes(new URL(s).protocol);}catch{return false;}}));}
function mcColor(v){const a=simplePalette(v);return {key:norm(a.color||(!a.camouflage?v.color:'')||'')+'|'+norm(a.camouflage||v.camouflage||''),color:a.color||(!a.camouflage?v.color:null)||null,camouflage:a.camouflage||v.camouflage||null};}
function mcColors(p){
 const groups=new Map();for(const v of p.variants||[]){const c=mcColor(v);if(!groups.has(c.key))groups.set(c.key,{id:'clr-'+fnvHash(c.key),...c,photos:[],variant_skus:[],sources:[]});const g=groups.get(c.key);g.variant_skus.push(v.sku);
  if(v.photos?.length){g.photos.push(...mcValidPhotos(v.photos));g.sources.push({kind:'variant',sku:v.sku});}
  for(const [sid,o] of Object.entries(p.fieldMeta?.photos?.source==='manual'?{}:v.offers||{})){const raw=o.native_color||o.color_raw;if((!raw||mcColor({color:raw,camouflage:o.camouflage}).key===c.key)&&o.photos?.length){g.photos.push(...mcValidPhotos(o.photos));g.sources.push({kind:'offer',supplier_id:sid,supplier_sku:o.s,sku:v.sku});}}
 }
 // The card gallery is shared content (same base name across colour cards) and may hold other colours' photos:
 // it belongs to the only colour only when no SKU-bound (offer/variant) photo exists for it.
 if(groups.size===1){const g=[...groups.values()][0];if(!g.photos.length){g.photos.push(...mcValidPhotos(p.photos));g.sources.push({kind:'single_color_product',product_id:p.id});}}
 for(const saved of p.model_color_sources||[]){const g=groups.get(mcColor({color:saved.color,camouflage:saved.camouflage}).key);if(g){g.photos.push(...mcValidPhotos(saved.photos));g.sources.push({kind:'source_product',product_id:saved.product_id});}}
 return [...groups.values()].map(g=>({...g,photos:uniq(g.photos),variant_skus:uniq(g.variant_skus),photo_assignment:g.photos.length?'source_associated':'unknown'}));
}
function mcClean(raw,p){
 let s=String(raw||'');const colors=uniq((p.variants||[]).flatMap(v=>[v.color,v.camouflage,simplePalette(v).color,simplePalette(v).camouflage]).filter(Boolean));
 for(const value of colors){const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');s=s.replace(new RegExp('(^|[^\\p{L}\\p{N}])'+escaped+'(?=$|[^\\p{L}\\p{N}])','giu'),'$1 ');}
 s=s.replace(/(^|[^\p{L}\p{N}])(?:чорн(?:а|ий|і|е)|черн(?:ая|ый|ые|ое)|black|multicam|мультикам|олива|оливков(?:а|ий|ый|ая)|olive|coyote|койот|khaki|хакі|хаки)(?=$|[^\p{L}\p{N}])/giu,'$1 ').replace(/\(\s*(?:темн(?:ий|ый)|dark)\s*\)\s*$/iu,'');
 return s.replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
}
// A card that is one size slice of a model (Kiborg: «Пояс РПС … (S)», «… (M)») carries that SKU size in its title; the
// size is a variant value, not part of the model name. Only approved EXACT sizes of the card's own SKU are removed.
function mcStripOwnSize(text,p){
 const sizes=uniq((p.variants||[]).filter(v=>v.size_status==='EXACT_SIZE'&&v.size).map(v=>String(v.size)));if(sizes.length!==1)return String(text||'').replace(/[\s.,]+(?:розмір|размер|size)[\s.,]*$/iu,'').trim()||text;
 const escaped=[...sizes[0]].map(ch=>({M:'[MМ]',X:'[XХ]'}[ch.toUpperCase()]||ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))).join(''),out=String(text||'').replace(new RegExp('(^|[^\\p{L}\\p{N}-])(?:(?:розмір|размер|size)\\s*)?\\(?\\s*'+escaped+'\\s*\\)?(?=$|[^\\p{L}\\p{N}-])','giu'),'$1 ').replace(/\s+/g,' ').replace(/[\s.,]+(?:розмір|размер|size)[\s.,]*$/iu,'').trim();
 return out.length>=3?out:text;
}
function mcIdentity(p,{keepSize=false}={}){const cleaned=mcClean(p.model_name||p.name,p),clean=keepSize?cleaned:mcStripOwnSize(cleaned,p),name=clean.charAt(0).toLocaleUpperCase('uk-UA')+clean.slice(1),category=p.canonical_category_id||p.last_confirmed_category_id||categoryIdForPath(p.category)||p.category,suppliers=uniq((p.variants||[]).flatMap(v=>Object.keys(v.offers||{}))).sort(),codes=uniq([p.modelArticle,p.model_code,...(p.variants||[]).flatMap(v=>Object.values(v.offers||{}).map(o=>o.source_model))].filter(Boolean).map(norm));return {name,category,suppliers,codes,key:JSON.stringify([norm(name),category,norm(p.brand||''),suppliers])};}
function mcReasons(products){
 const why=[],first=products[0],identity=mcIdentity(first),all=products.flatMap(p=>p.variants||[]),codes=uniq(products.flatMap(p=>mcIdentity(p).codes));
 if(products.some(p=>p.model_grouping_locked))why.push('Ручное разделение модели зафиксировано');
 if(products.some(p=>p.simple_publish_disabled||p.fieldMeta?.pub?.source==='manual'&&p.pub===false))why.push('Различаются ручные правила публикации');
 if(products.some(p=>mcIdentity(p).key!==identity.key))why.push('Различаются модель, категория, бренд или поставщики');
 // Supplier group codes that only slice one model (each card one colour or one size, cells disjoint, one code per card)
 // do not contradict it; anything else stays a contradiction. Strong evidence is still required for an automatic merge.
 const codeSets=products.map(p=>mcIdentity(p).codes),slices=codeSets.every(c=>c.length>0)&&new Set(codeSets.flat()).size===codeSets.flat().length&&products.every(p=>new Set((p.variants||[]).map(v=>mcColor(v).key)).size===1||(p.variants||[]).every(v=>v.size)&&new Set((p.variants||[]).map(v=>norm(v.size))).size===1);
 if(codes.length>1&&!slices)why.push('Поставщик передал разные коды модели');
 if(new Set(all.map(v=>v.sku)).size!==all.length)why.push('Повторяется RUB-SKU');
 const ownership=new Map(),cells=new Map();for(const p of products)for(const v of p.variants){const cell=mcColor(v).key+'|'+norm(v.size||'');if(cells.has(cell)&&cells.get(cell)!==p.id)why.push('Один цвет и размер принадлежат разным исходным карточкам');else cells.set(cell,p.id);for(const [sid,o] of Object.entries(v.offers||{})){const k=sid+'|'+o.s;if(o.s&&ownership.has(k)&&ownership.get(k)!==v.sku)why.push('Артикул поставщика привязан к нескольким SKU');else ownership.set(k,v.sku);}}
 if(all.length>modelLimit(first))why.push('Превышен лимит вариантов');
 const variantKey=k=>/(?:колір|цвет|розмір|размер|camouflage|^color$|^size(?:_|$))/iu.test(k),adminKey=k=>/^(?:артикул|назва(?: модифікації)?|название|наявність|наличие|валюта|ціна|цена|популярність|популярность|розділ|раздел)$/iu.test(k),fields=o=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>!variantKey(k)&&!adminKey(k)));
 const attrs=p=>stableValue105({attrs:fields(p.attrs),normalized:fields(p.normalized_attributes),canonical:fields(p.canonical_attributes),compatibility:p.compatibility||{},relations:p.relations||[],recommended:p.recommended_with||[],kit:p.kit_component});
 if(products.some(p=>attrs(p)!==attrs(first)))why.push('Различаются характеристики, совместимость или связи');
 if(products.some(p=>p.fieldMeta?.name?.source==='manual')&&products.some(p=>p.name!==first.name))why.push('Различаются ручные названия');
 if(products.some(p=>p.fieldMeta?.desc?.source==='manual')&&products.some(p=>p.desc!==first.desc))why.push('Различаются ручные описания');
 return uniq(why);
}
function mcGroup(products,id){
 const reasons=mcReasons(products),latin=uniq((id.name.match(/[a-z][a-z0-9-]{2,}/gi)||[]).map(norm).filter(t=>!['tactical','pouch','jacket','pants','black','olive','multicam','shirt','pack','double','mag','winter','softshell'].includes(t))),desc=p=>norm(mcClean(ceSourcePlain(simpleSource(p)),p)),sameDescription=desc(products[0]).length>=200&&products.every(p=>desc(p)===desc(products[0]));
 const strong=!reasons.length&&(id.codes.length===1&&products.every(p=>mcIdentity(p).codes[0]===id.codes[0])||latin.length>=3&&sameDescription);
 return {key:id.key,name:id.name,ids:products.map(p=>p.id).sort(),variants:products.reduce((n,p)=>n+p.variants.length,0),colors:uniq(products.flatMap(p=>mcColors(p).map(c=>c.key))).length,automatic:strong,reasons:reasons.length?reasons:strong?[]:['Название похоже, но код модели или полное совпадение источника не подтверждены']};
}
const mcPlan=memoByData(function(){
 const buckets=new Map();for(const p of S.products.values()){if(p.archived||p.merged_into||!p.variants?.length||p.model_grouping_locked)continue;const id=mcIdentity(p);if(!buckets.has(id.key))buckets.set(id.key,[]);buckets.get(id.key).push(p);}
 const groups=[];for(const products of buckets.values()){if(products.length<2)continue;const group=mcGroup(products,mcIdentity(products[0]));groups.push(group);
  // Without the whole size family proven, the cards of one size (title still naming it) are judged on their own.
  if(!group.automatic){const exact=new Map();for(const p of products){const k=mcIdentity(p,{keepSize:true}).key;if(!exact.has(k))exact.set(k,[]);exact.get(k).push(p);}
   if(exact.size>1)for(const part of exact.values())if(part.length>1){const sub=mcGroup(part,mcIdentity(part[0],{keepSize:true}));if(sub.automatic)groups.push(sub);}}
 }return {version:1,groups,automatic:groups.filter(g=>g.automatic),review:groups.filter(g=>!g.automatic)};
});
function mcMergeGroup(group,{manual=false}={}){
 const products=group.ids.map(id=>S.products.get(id));if(products.some(p=>!p||p.archived||p.merged_into))throw Error('Исходные карточки изменились. Повторите проверку.');const reasons=mcReasons(products);if(reasons.length)throw Error(reasons.join('; '));if(!manual&&!group.automatic)throw Error('Для этой группы требуется подтверждение модели.');
 const survivor=products.slice().sort((a,b)=>(a.created||0)-(b.created||0)||a.id.localeCompare(b.id))[0],oldIds=products.filter(p=>p!==survivor).map(p=>p.id),sources=products.flatMap(p=>mcColors(p).map(c=>({product_id:p.id,color:c.color,camouflage:c.camouflage,photos:c.photos,variant_skus:c.variant_skus}))),before=products.map(p=>({id:p.id,skus:p.variants.map(v=>v.sku)}));
 for(const p of products)touchP(p.id);
 survivor.model_color_sources=[...(survivor.model_color_sources||[]),...sources];survivor.model_source_ids=uniq([...(survivor.model_source_ids||[]),...products.flatMap(p=>p.model_source_ids||[p.id])]);survivor.model_name=group.name;survivor.model_colors_version=1;
 for(const p of products)if(p!==survivor){survivor.variants.push(...p.variants);p.variants=[];p.merged_into=survivor.id;p.pub=false;p.archived=true;p.archiveReason='MODEL: объединена с '+survivor.id;delete p.simple_excluded_reason;markProduct(p);}
 modelAudit(survivor,{source_products:before},{model:survivor.id,colors:mcColors(survivor).length,source_products:survivor.model_source_ids},'Одна модель → цвета → варианты',manual?'manual':'automatic');markProduct(survivor);return {id:survivor.id,merged_ids:oldIds,variants:survivor.variants.length};
}
function mcMigrate(groups=mcPlan().automatic){const results=groups.map(g=>mcMergeGroup(g));S.cfg.model_colors_version=1;S.cfgDirty=true;rebuildIndex();bumpData();return results;}
function mcResolveId(id){const seen=new Set();while(S.products.get(id)?.merged_into&&!seen.has(id)){seen.add(id);id=S.products.get(id).merged_into;}return id;}
function mcSelect(p,colorId,sku){const colors=mcColors(p),color=colors.find(c=>c.id===colorId)||colors[0];if(!color)return null;const variants=p.variants.filter(v=>color.variant_skus.includes(v.sku)),variant=variants.find(v=>v.sku===sku)||variants[0];return {color,variant,photos:color.photos,size_options:variants.map(v=>({sku:v.sku,size:v.size||null,...simpleSize(p,v),...(()=>{const a=simpleVariant(p,v);return {price:a.site_price,stock:a.stock,availability:a.availability,eligible:a.eligible};})()}))};}
const mcOldPayload=simpleProductPayload;
simpleProductPayload=function(a){const out=mcOldPayload(a);if(!mcEnabled())return out;const colors=mcColors(a.p),publicSkus=new Set(out.variants.map(v=>v.sku));out.model_colors_version=1;out.model_id=a.p.id;out.model_name=a.p.manual_locks?.marketing_name_uk?a.p.marketing_name_uk:a.p.model_name||out.name;out.name=out.model_name;out.marketing_name_uk=out.model_name;out.source_product_ids=a.p.model_source_ids||[a.p.id];out.colors=colors.map(c=>({...c,variant_skus:c.variant_skus.filter(sku=>publicSkus.has(sku))})).filter(c=>c.variant_skus.length);for(const v of out.variants){const c=out.colors.find(c=>c.variant_skus.includes(v.sku));v.color_id=c.id;v.color=c.color;v.camouflage=c.camouflage;v.photos=c.photos;v.photo_assignment=c.photo_assignment;}out.recommended_with=uniq((out.recommended_with||[]).map(mcResolveId)).filter(id=>id!==out.id);out.relations=(out.relations||[]).map(r=>({...r,product_id:mcResolveId(r.product_id)})).filter(r=>r.product_id!==out.id);for(const field of ['compatible_product_ids','incompatible_product_ids'])if(out.compatibility?.[field])out.compatibility[field]=uniq(out.compatibility[field].map(mcResolveId)).filter(id=>id!==out.id);out.unassigned_photos=out.photos.filter(url=>!out.colors.some(c=>c.photos.includes(url)));return out;};
const mcOldDecisions=simpleDecisions;
simpleDecisions=function(){const tasks=mcOldDecisions();if(!mcEnabled())return tasks;for(const g of mcPlan().review.filter(g=>!mcReasons(g.ids.map(id=>S.products.get(id))).length))tasks.push({key:'model:'+g.key,kind:'model',title:'Это одна модель в разных цветах?',detail:g.name+' · '+g.ids.length+' карточек · '+g.variants+' SKU. '+g.reasons.join('; '),ids:g.ids,can_merge:!mcReasons(g.ids.map(id=>S.products.get(id))).length});return tasks;};
const mcOldHide=simpleHideIds;
simpleHideIds=async function(hashes,ids){const hidden=await mcOldHide(hashes,ids);if(!mcEnabled())return hidden;const published=await Store.get('site/published')||{};return uniq([...hidden,...[...S.products.values()].filter(p=>p.merged_into&&published[p.id]?.hidden!==true).map(p=>p.id)]);};
const mcOldRetained=categoryPublicationRetainedIds;
categoryPublicationRetainedIds=function(){return mcOldRetained().filter(id=>!S.products.get(id)?.merged_into);};
const mcOldImport=runImport;
runImport=function(){const result=mcOldImport(...arguments);if(mcEnabled()){const changed=new Set([...S.products.values()].filter(p=>p.variants.some(v=>Object.values(v.offers||{}).some(o=>o.at===result.at))).map(p=>p.id));bumpData();if(!classificationReviewMode())mcMigrate(mcPlan().automatic.filter(g=>g.ids.some(id=>changed.has(id))));simpleProcessProducts([...S.products.values()].filter(p=>!p.archived&&p.variants.some(v=>Object.values(v.offers||{}).some(o=>o.at===result.at))));}return result;};
function mcPreviewHtml(p){const chosen=MC_UI.selected.get(p.id)||{},s=mcSelect(p,chosen.color,chosen.sku);if(!s)return '';return '<h2>Модель → цвет → размер</h2><p>'+esc(p.model_name||p.name)+'</p><label class="f">Цвет<select data-mc-color>'+mcColors(p).map(c=>'<option value="'+esc(c.id)+'" '+(c.id===s.color.id?'selected':'')+'>'+esc([c.color,c.camouflage].filter(Boolean).join(' / ')||'Без цвета')+'</option>').join('')+'</select></label><label class="f">Размер / вариант<select data-mc-sku>'+s.size_options.map(v=>'<option value="'+esc(v.sku)+'" '+(v.sku===s.variant.sku?'selected':'')+'>'+esc(v.size_display||v.size||'Без размерной сетки')+' · '+esc(v.sku)+' · '+money(v.price)+'</option>').join('')+'</select></label><div class="mc-gallery">'+(s.photos.length?s.photos.map(url=>'<img loading="lazy" src="'+esc(url)+'" alt="'+esc([s.color.color,s.color.camouflage].filter(Boolean).join(' / '))+'">').join(''):'<p>Фото цвета не подтверждены. Общие фото не подставляются.</p>')+'</div><p class="small">Выбран SKU: '+esc(s.variant.sku)+'. Галерея относится только к выбранному цвету.</p>';}
const mcOldDrawer=renderDrawer;
renderDrawer=function(){mcOldDrawer();if(!S.edit||!mcEnabled())return;const html=mcPreviewHtml(S.edit);if(!html)return;const box=document.createElement('section');box.id='model-color-preview';box.className='panel';box.innerHTML=html;($('#drawer .dpanel')||$('#drawer')).appendChild(box);};
document.addEventListener('change',e=>{if(!e.target.matches('[data-mc-color],[data-mc-sku]')||!S.edit)return;MC_UI.selected.set(S.edit.id,{color:$('#drawer [data-mc-color]').value,sku:e.target.matches('[data-mc-sku]')?e.target.value:null});$('#model-color-preview').innerHTML=mcPreviewHtml(S.edit);});

const mcOldLinks=feedLinksFor;feedLinksFor=function(p,ids){if(!mcEnabled())return mcOldLinks(p,ids);const clone={...p,links:Object.fromEntries(Object.entries(linksOf(p)).map(([k,values])=>[k,uniq(values.map(mcResolveId)).filter(id=>id!==p.id)]))};return mcOldLinks(clone,ids);};
// A user-confirmed split is a grouping decision and must survive future automatic imports.
const mcOldSplit=splitVariants;splitVariants=async function(){const original=S.edit?.id,ids=new Set(S.products.keys()),count=S.products.get(original)?.variants.length;const result=await mcOldSplit(...arguments);const added=[...S.products.values()].filter(p=>!ids.has(p.id));if(original&&added.length&&S.products.get(original)?.variants.length!==count){for(const p of [S.products.get(original),...added]){p.model_grouping_locked=true;delete p.model_name;markProduct(p);}S.cfgDirty=true;if(!await persist())throw Error('Ручное разделение не сохранено. Повторите сохранение перед импортом.');}return result;};
