// Simple workflow: owner-authorized requests, automatic exclusions and publication preview.
const SIMPLE_VERSION=1;
const SIMPLE_UI={preview:null,busy:false,group:'',page:0};
function simpleEnabled(){return S.cfg?.simple_mode_version===SIMPLE_VERSION;}
function simpleSource(p){
 if(p.fieldMeta?.desc?.source==='manual')return String(p.desc||'');
 const sources=[ceSupplierSource(p),p.source_description,p.fieldMeta?.desc?.source==='generated'?'':p.desc,...(p.variants||[]).flatMap(v=>Object.values(v.offers||{}).map(o=>o.source_description))];
 return sources.find(s=>simpleMeaningful(s,p.name))||'';
}
function simpleMeaningful(raw,name){
 const t=ceSourcePlain(raw).trim(),n=norm(t);
 return /[\p{L}\p{N}]/u.test(t)&&t.length>=4&&n!==norm(name)&&!(/^(?:опис(?:ання|ание)?(?: відсутнє| отсутствует)?|немає(?: опису| даних)?|нет(?: описания| данных)?|n\/?a|none|null|[-—.]+)$/iu.test(t));
}
function simpleDescription(p){
 const raw=simpleSource(p);if(!simpleMeaningful(raw,p.name))return '';
 if(p.fieldMeta?.desc?.source==='manual')return raw;
 const lines=ceSourceUnits(ceSourcePlain(raw)).filter(s=>!ceCommercialOnly(s));
 return lines.map(s=>'<p>'+htmlSafeText(autoUkText(s))+'</p>').join('');
}
function simplePhotos(p){
 const raw=p.fieldMeta?.photos?.source==='manual'?p.photos||[]:[...(p.photos||[]),...(p.variants||[]).flatMap(v=>[...(v.photos||[]),...Object.values(v.offers||{}).flatMap(o=>o.photos||[])])];
 return uniq(raw.filter(url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!!u.hostname;}catch{return false;}}));
}
function simpleSize(p,v){
 const type=p.primary_product_type||RubizhModel.type(p.canonical_category_id||p.last_confirmed_category_id,p.name);
 const category=p.canonical_category_id||p.last_confirmed_category_id;
 const freeSize=['clothing_balaclavas','clothing_headwear','footwear_gaiters'].includes(category)||category==='clothing_rainwear'&&/пончо/iu.test(p.name);
 const inferred=freeSize?'accessory':category==='footwear_insoles'?'shoes':category==='helmets_covers'?'helmet':type||(/^(?:берц|черевик|кросів|ботин|сапог)/iu.test(p.name)?'boots':/^(?:штани|брюк|куртк|костюм|сорочк|убакс|фліс|термобілиз)/iu.test(p.name)?'clothing':null);
 const raw=v.manualFields?.size?v.size:v.size_raw??v.native_size??Object.values(v.offers||{}).find(o=>o.native_size)?.native_size??v.size;
 const z=RubizhModel.size(raw,inferred,{universalConfirmed:v.size_universal_confirmed===true});
 if(['socks','plate_carrier','armor_vest','battle_belt'].includes(inferred)&&!String(raw||'').trim())z.size_unconfirmed=true;
 return z;
}
function simplePalette(v){const raw=v.manualFields?.color?v.color:mapVal(S.cfg.colorMap,v.color)||v.color,pal=RubizhModel.palette(raw,v.camouflage||'');for(const value of [...pal.unknown]){const alias=S.cfg.simple_color_aliases?.[norm(value)];if(alias){pal[alias.kind]=alias.value;pal.unknown=pal.unknown.filter(v=>v!==value);}}return pal;}
function simpleVariant(p,v){
 const c=calc(p,v),size=simpleSize(p,v),n=modelVariant(p,v),o=c.o||c.ref;
 const request=!o?.missing&&!o?.discontinued&&!o?.invalid_stock&&!o?.priceAlert&&!(o?.preorderManual&&o.preorder===false)&&!(typeof o?.stock==='number'&&o.stock<0)&&!!o&&c.avail==='out'&&c.price>0;
 const available=c.avail==='in'||c.avail==='order'&&confirmedPreorderDays(o)!=null||request;
 return {...n,...size,available,request,selected_offer:o,raw_stock:o?.stock??null,availability:request?'preorder':n.availability,availability_label:request?'Під замовлення':c.avail==='in'?'В наявності':c.avail==='order'?'Під замовлення':'Немає в наявності',order_on_request:request,requires_order_confirmation:request,lead_time_days:request?null:confirmedPreorderDays(o),stock:request?0:c.avail==='in'?offerConfirmedStock(o):null,stock_stale:!!o?.stock_stale,margin_blocked:n.margin_blocked,eligible:available&&!o?.invalid_stock&&!(typeof o?.stock==='number'&&o.stock<0)&&c.price>0&&!n.margin_blocked&&!size.size_unconfirmed&&(!sourceReviewRequired108(v)||v.source_review_confirmed===true)||false};
}
function simpleAllowed(p){return !p.simple_publish_disabled&&!(p.fieldMeta?.pub?.source==='manual'&&p.pub===false);}
const simpleAssess=memoProd('simple-assess',function(p){
 const photos=simplePhotos(p),description=simpleDescription(p),variants=(p.variants||[]).map(v=>simpleVariant(p,v)),reasons=[];
 if(!photos.length)reasons.push('photo');
 if(!simpleMeaningful(description,p.name))reasons.push('description');
 const category=categoryPublicationProduct(p)||(()=>{const id=categoryIdForPath(p.category);return id?{canonical_category_id:id}:null;})();
 if(!category?.canonical_category_id)reasons.push('category');
 if(!String(p.marketing_name_uk||p.name||'').trim())reasons.push('name');
 if(siteBlocked(p))reasons.push('restricted');
 if(p.variants.length>modelLimit(p))reasons.push('grouping');
 if(!variants.some(v=>v.eligible)){if(variants.some(v=>v.available&&v.site_price>0&&!v.margin_blocked&&v.size_unconfirmed))reasons.push('size');else if(variants.some(v=>v.margin_blocked))reasons.push('price');else reasons.push('availability');}
 const excluded=reasons.includes('photo')||reasons.includes('description');
 const ready=!reasons.length&&!p.archived&&simpleAllowed(p);
 return {p,photos,description,variants,category,reasons,excluded,ready};
});
function simpleFingerprint(){return fnvHash(stableValue105([...S.products.values()])+stableValue105(S.cfg));}
function simplePolicyPreview(){
 return {signature:simpleFingerprint(),at:Date.now(),model_groups:mcPlan(),rows:[...S.products.values()].filter(p=>!p.archived||p.simple_excluded_reason).map(p=>{const a=simpleAssess(p);return {id:p.id,name:p.name,reasons:a.reasons,archive:a.excluded,under_order:a.variants.filter(v=>v.request).length,size_needed:a.reasons.includes('size')};})};
}
function simpleProcessProducts(products){
 let excluded=0,restored=0,published=0;
 for(const p of products){
  const a=simpleAssess(p),was=structuredClone({pub:p.pub,archived:p.archived,simple_excluded_reason:p.simple_excluded_reason});
  if(a.excluded&&!p.archived){touchP(p.id);p.archivePrevPub=p.pub;p.pub=false;p.archived=true;p.archiveReason='SIMPLE: '+a.reasons.filter(r=>['photo','description'].includes(r)).join(', ');p.simple_excluded_reason=p.archiveReason;excluded++;}
  else if(!a.excluded&&p.simple_excluded_reason&&p.archiveReason===p.simple_excluded_reason){touchP(p.id);p.archived=false;p.archiveReason='';delete p.simple_excluded_reason;restored++;}
  if(!p.archived&&simpleAllowed(p)&&!a.reasons.length){touchP(p.id);if(!p.pub)published++;p.pub=true;}
  if(stableValue105(was)!==stableValue105({pub:p.pub,archived:p.archived,simple_excluded_reason:p.simple_excluded_reason})){modelAudit(p,was,{pub:p.pub,archived:p.archived,simple_excluded_reason:p.simple_excluded_reason},'Правила SIMPLE v1');markProduct(p);}
 }
 return {excluded,restored,published};
}
async function simpleApplyPolicy(){
 const plan=SIMPLE_UI.preview;if(!plan||plan.signature!==simpleFingerprint())throw Error('Каталог изменился. Повторите предварительную проверку.');
 await requireBatchBackup('Перед включением SIMPLE');const backup=fullStateData('До SIMPLE');await Store.set('safety/before_simple',backup);
 try{
  const merged=mcMigrate(plan.model_groups.automatic);
  S.cfg.simple_mode_version=SIMPLE_VERSION;S.cfg.simple_policy={unavailable:'owner_order_on_request',missing_content:'archive',required_size:'category_specific',version:1};S.cfg.hideUnavailable=false;S.cfgDirty=true;bumpData();
  const result=simpleProcessProducts([...S.products.values()]);rebuildIndex();bumpData();
  if(!await persist())throw Error('Правила SIMPLE не сохранены.');
  const stored=await persistedStateData('SIMPLE verify');if(!sameStats(catalogStats(),stored.stats,true))throw Error('Сохранение SIMPLE не подтверждено.');
  SIMPLE_UI.preview=null;return {...result,models_merged:merged.length};
 }catch(error){loadStateData(backup);markAllDirty();await persist();throw error;}
}
function simpleProductPayload(a){
 const p=a.p,n=RubizhModel.normalized({...p,canonical_category_id:a.category.canonical_category_id},{path:canonicalPath});
 const variants=a.variants.filter(v=>v.eligible).map(z=>{
  const v=p.variants.find(v=>v.sku===z.sku),c=calc(p,v),o=z.selected_offer||{},pal=simplePalette(v);
  const out={sku:v.sku,price:c.price,site_price:c.price,stock:z.stock,availability:z.availability,availability_label:z.availability_label,order_on_request:z.request,requires_order_confirmation:z.request,preorder_confirmed:!z.request&&c.avail==='order'&&z.lead_time_days!=null,lead_time_days:z.lead_time_days,lead_time:z.lead_time_days,stock_stale:z.stock_stale,size:v.size||null,...simpleSize(p,v),color:pal.color||v.color||null,camouflage:pal.camouflage,photos:v.photos?.length?v.photos:o.photos?.length?o.photos:a.photos,barcode:v.barcode||null,wholesale:tierPrices(c.price),kit_price:kitFloor(p,v),fulfillment_supplier_id:o.sid||'',fulfillment_supplier_sku:o.s||'',fulfillment_origin:supplierOrigin104(o.sid)};
  return out;
 });
 return {id:p.id,product_id:p.id,product_model_version:1,simple_policy_version:1,slug:productSlug(p),name:n.marketing_name_uk,marketing_name_uk:n.marketing_name_uk,brand:p.brand,category:n.canonical_category_path,category_path:n.canonical_category_path.split(' / '),canonical_category_id:n.canonical_category_id,primary_product_type:n.primary_product_type,description:a.description,photos:a.photos,attributes:n.filter_attributes,filter_attributes:n.filter_attributes,legacy_attributes:tzPublicAttrs(p.attrs),variants,site_price:Math.min(...variants.map(v=>v.price)),availability:variants.some(v=>v.availability==='in_stock')?'in_stock':'preorder',quality_score:modelView(p).quality_score,kit_component:n.kit_component,kit_component_tags:n.kit_component_tags,kit_eligible:n.kit_eligible,kit_priority:n.kit_priority,budget_tier:n.budget_tier,compatibility:n.compatibility,recommended_with:n.recommended_with,alternative_group:n.alternative_group,relations:n.relations,ads_allowed:false,links:{}};
}
const simpleBuildFeed=memoByData(function(){
 const products=[...S.products.values()].map(simpleAssess).filter(a=>a.ready).map(simpleProductPayload),ids=new Set(products.map(p=>p.id));
 for(const x of products)x.links=feedLinksFor(S.products.get(x.id),ids);
 return {feed:{schema_version:'rubizh.catalog.v1',pim_version:PIM_VERSION,currency:'UAH',generated_at:new Date().toISOString(),hide_unavailable:false,categories:categoryPublicCatalogue(),products},skipped:{simple:[...S.products.values()].filter(p=>!p.archived&&!simpleAssess(p).ready).length}};
});
function buildFeed(){return simpleEnabled()?simpleBuildFeed():buildFeedBase109();}
const simpleLegacyRetained=categoryPublicationRetainedIds;
categoryPublicationRetainedIds=function(){return simpleLegacyRetained().filter(id=>!simpleEnabled()||!simpleAssess(S.products.get(id)).excluded);};
const simpleLegacyImport=runImport;
runImport=function(...args){const result=simpleLegacyImport(...args);if(simpleEnabled())simpleProcessProducts([...S.products.values()].filter(p=>p.variants.some(v=>Object.values(v.offers||{}).some(o=>o.at===result.at))));return result;};
function simpleDecisions(){
 const tasks=new Map(),add=(key,item)=>{const t=tasks.get(key)||{...item,ids:[]};t.ids.push(item.id);tasks.set(key,t);};
 for(const p of S.products.values()){
  if(p.archived)continue;const a=simpleAssess(p);
  for(const r of ['grouping','category','size','price'].filter(r=>a.reasons.includes(r)).slice(0,1))add(r+':'+p.id,{id:p.id,kind:r,title:({category:'Какая категория у этого товара?',size:'Укажите размер для размерного изделия',grouping:'Это одна модель или разные товары?',price:'Проверьте цену и маржу'})[r],detail:p.name});
  for(const v of p.variants)for(const raw of simplePalette(v).unknown)add('color:'+norm(raw),{id:p.id,kind:'color',raw,title:'Как назвать цвет или камуфляж «'+raw+'»?',detail:'Один ответ применяется ко всем связанным товарам.'});
 }
 return [...tasks.entries()].map(([key,t])=>({...t,key,ids:uniq(t.ids)}));
}
async function simpleHideIds(hashes,ids){const published=await Store.get('site/published')||{};return uniq([...Object.keys(hashes).filter(id=>!ids.has(id)),...(simpleEnabled()?[...S.products.values()].filter(p=>simpleAssess(p).excluded&&published[p.id]?.hidden!==true).map(p=>p.id):[])]);}
async function simplePublicationPlan(){
 const products=buildFeed().feed.products.map(sitePayloadProduct),hashes=await Store.get('site/hashes')||{},ids=new Set([...products.map(p=>p.id),...categoryPublicationRetainedIds()]);
 return {at:Date.now(),signature:simpleFingerprint(),create:products.filter(p=>!hashes[p.id]),update:products.filter(p=>hashes[p.id]&&hashes[p.id]!==fnvHash(JSON.stringify(p))),hide:await simpleHideIds(hashes,ids),decisions:simpleDecisions(),products};
}
async function simplePublish(){
 if(!simpleEnabled())throw Error('Сначала включите правила SIMPLE через предварительную проверку.');
 const plan=await simplePublicationPlan();SIMPLE_UI.publishPlan=plan;
 if(!confirm('Новые: '+plan.create.length+'\nОбновить: '+plan.update.length+'\nСкрыть: '+plan.hide.length+'\nВопросов: '+plan.decisions.length+'\nСинхронизировать сайт?'))return;
 await requireBatchBackup('Перед синхронизацией сайта SIMPLE');
 const id='PB-'+Date.now()+'-'+uid('batch'),batch={id,started_at:Date.now(),base_revision:_dataVer,status:'running',create:plan.create.map(p=>p.id),update:plan.update.map(p=>p.id),hide:plan.hide,confirmed:[],errors:[]};
 SITE.currentBatch=batch;await Store.set('simple/publish/'+id,batch);S.cfg.simple_last_batch=id;S.cfgDirty=true;
 try{const result=await sitePublish('delta');batch.status=result?result.error?'partial':'completed':batch.confirmed.length?'partial':'failed';batch.finished_at=Date.now();batch.duration_ms=batch.finished_at-batch.started_at;batch.error=result?null:S.cfg.siteSync?.lastError;await Store.set('simple/publish/'+id,batch);if(!await persist())throw Error('Результат операции не сохранён.');return batch;}
 finally{SITE.currentBatch=null;}
}
async function simpleCheckpoint(products,results,hashes){
 const published=await Store.get('site/published')||{},byId=new Map(products.map(p=>[p.id,p])),at=Date.now();
 for(const r of results)if(r.status!=='error'){published[r.id]={payload:byId.get(r.id),confirmed_at:at,hidden:false};if(SITE.currentBatch)SITE.currentBatch.confirmed.push(r.id);}
 else if(SITE.currentBatch)SITE.currentBatch.errors.push({id:r.id,error:r.error||'Ошибка магазина'});
 await Store.set('site/published',published);await Store.set('site/hashes',hashes);
 if(SITE.currentBatch)await Store.set('simple/publish/'+SITE.currentBatch.id,SITE.currentBatch);
}
async function simpleConfirmHide(ids,response){
 if(!ids.length)return;
 const ack=response.hidden_ids;if(!Array.isArray(ack)||ack.length!==ids.length||new Set(ack).size!==ids.length||ack.some(id=>!ids.includes(id)))throw Error('Магазин не подтвердил скрытие конкретных товаров. Результаты отправленных карточек сохранены.');
 const published=await Store.get('site/published')||{};for(const id of ids)published[id]={...(published[id]||{}),hidden:true,confirmed_at:Date.now()};
 await Store.set('site/published',published);if(SITE.currentBatch){SITE.currentBatch.hidden_confirmed=[...ids];await Store.set('simple/publish/'+SITE.currentBatch.id,SITE.currentBatch);}
}
function simplePolicyPanel(){
 const preview=SIMPLE_UI.preview;
 return '<section class="panel"><h2>Правила автоматической обработки</h2><p>Без фото или содержательного описания → архив и скрытие. Позиция есть в прайсе, но недоступна → «Під замовлення», срок подтверждает менеджер. Размер нужен только размерным изделиям.</p><button class="btn" data-simple="preview">Проверить текущий каталог</button>'+(preview?'<p>Объединить групп одной модели: <b>'+preview.model_groups.automatic.length+'</b> · Уточнить модель: <b>'+preview.model_groups.review.length+'</b></p><details><summary>Какие карточки объединятся</summary>'+preview.model_groups.automatic.slice(0,50).map(g=>'<p>'+esc(g.name)+' · '+g.ids.length+' карточек → '+g.colors+' цветов · '+g.variants+' SKU</p>').join('')+'</details><p>В архив: <b>'+preview.rows.filter(r=>r.archive).length+'</b> · Вариантов под заказ: <b>'+preview.rows.reduce((n,r)=>n+r.under_order,0)+'</b> · Товаров с обязательным размером для уточнения: <b>'+preview.rows.filter(r=>r.size_needed).length+'</b></p><div class="row"><button class="btn primary" data-simple="apply">Применить с резервной копией</button><button class="btn" data-simple="cancel">Отмена</button></div>':'')+'<p class="small muted">Исходные цены, остатки, SKU и категории сохраняются. Из архива можно восстановить товар.</p></section>';
}
function vSimplePublication(){
 const feed=simpleEnabled()?buildFeed().feed.products:[],tasks=simpleDecisions(),plan=SIMPLE_UI.publishPlan;
 const row=(title,count,group)=>'<button class="simple-summary" data-simple="group" data-group="'+group+'"><b>'+count+'</b><span>'+title+'</span></button>';
 const selected=SIMPLE_UI.group==='decisions'?tasks:plan&&['create','update','hide'].includes(SIMPLE_UI.group)?plan[SIMPLE_UI.group]:[];
 SIMPLE_UI.page=Math.min(SIMPLE_UI.page,Math.max(0,Math.ceil(selected.length/30)-1));
 return '<h1>Публикация</h1><p class="lead">Всё готовое отправляется одной операцией. Здесь остаются только изменения и вопросы.</p><div class="simple-summaries">'+row('Новые товары',plan?.create.length??'—','create')+row('Будут обновлены',plan?.update.length??'—','update')+row('Будут скрыты',plan?.hide.length??'—','hide')+row('Нужно ваше решение',tasks.length,'decisions')+'</div><div class="panel row"><button class="btn primary" data-simple="sync" '+(!simpleEnabled()?'disabled':'')+'>СИНХРОНИЗИРОВАТЬ САЙТ</button><button class="btn" data-simple="refresh">Проверить изменения</button><span class="muted">Готовых карточек: '+feed.length+'</span></div>'+(!simpleEnabled()?simplePolicyPanel():'<details class="panel"><summary>Автоматическая обработка и откат</summary>'+simplePolicyPanel()+'<button class="btn" data-simple="rollback">Откатить включение SIMPLE</button></details>')+(selected.length?'<section class="panel"><h2>'+({create:'Новые товары',update:'Обновления',hide:'Скрытия',decisions:'Нужно ваше решение'})[SIMPLE_UI.group]+'</h2>'+selected.slice(SIMPLE_UI.page*30,SIMPLE_UI.page*30+30).map(x=>typeof x==='string'?'<p>'+esc(S.products.get(x)?.name||x)+'</p>':x.kind==='color'?'<div class="simple-task"><b>'+esc(x.title)+'</b><p>'+x.ids.length+' товаров. '+esc(x.detail)+'</p><input data-simple-color="'+esc(x.raw)+'" placeholder="Название цвета / камуфляжа"><select data-simple-color-kind="'+esc(x.raw)+'"><option value="color">Цвет</option><option value="camouflage">Камуфляж</option></select><button class="btn small" data-simple="color" data-key="'+esc(x.key)+'">Применить ко всей группе</button></div>':x.kind?'<div class="simple-task"><b>'+esc(x.title)+'</b><p>'+esc(x.detail)+'</p><button class="btn small" data-open="'+esc(x.ids[0])+'">Открыть товар</button>'+(x.kind==='model'?'<button class="btn small" data-simple="modelMerge" data-key="'+esc(x.key)+'" '+(x.can_merge?'':'disabled')+'>Одна модель</button><button class="btn small" data-simple="modelSeparate" data-key="'+esc(x.key)+'">Разные модели</button>':'')+'</div>':'<p><button class="link" data-open="'+esc(x.id)+'">'+esc(x.name)+'</button></p>').join('')+'<div class="row"><button class="btn" data-simple="page" data-d="-1" '+(SIMPLE_UI.page?'':'disabled')+'>Назад</button><span>'+selected.length+' записей · страница '+(SIMPLE_UI.page+1)+'</span><button class="btn" data-simple="page" data-d="1" '+((SIMPLE_UI.page+1)*30<selected.length?'':'disabled')+'>Далее</button></div></section>':'')+(S.cfg.siteSync?.lastError?'<div class="banner">'+esc(S.cfg.siteSync.lastError)+'</div>':'')+'<details class="panel"><summary>Подключение сайта и результаты</summary>'+sitePanel()+'</details>';
}
function vSimpleTaxonomy(){
 const count=new Map();for(const p of S.products.values()){const id=p.canonical_category_id||p.last_confirmed_category_id;if(!p.archived)count.set(id,(count.get(id)||0)+1);}
 return '<h1>Категории и фильтры</h1><p>Текущие категории и подкатегории сохранены. Фильтры берутся из их схемы.</p><button class="btn" data-view="categorization">Настроить категории и правила</button><div class="tablewrap"><table><thead><tr><th>Категория</th><th>Товаров</th><th>Фильтры</th></tr></thead><tbody>'+canonicalCategories().filter(c=>c.parent_id).map(c=>'<tr><td>'+esc(canonicalPath(c.id))+'</td><td>'+(count.get(c.id)||0)+'</td><td>'+esc((S.cfg.category_metadata?.[c.id]?.filters||RubizhModel.filterSchema(c.id)).join(', '))+'</td></tr>').join('')+'</tbody></table></div>';
}
function vSimpleSettings(){return '<h1>Настройки</h1>'+simplePolicyPanel()+'<section class="panel"><h2>Расширенные функции</h2><p>Комплекты, таблица, технические проверки, документы и настройки API доступны отдельно.</p><div class="row"><button class="btn" data-view="kits">Комплекты</button><button class="btn" data-view="settings">Расширенные настройки</button><button class="btn" data-view="dataModel">Диагностика данных</button></div></section>';}
const simpleLegacyRenderNav=renderNav;
renderNav=function(){
 const main=[['simplePublication','Публикация'],['products','Товары'],['import','Импорт'],['simpleTaxonomy','Категории и фильтры'],['suppliers','Поставщики'],['backup','Резервные копии'],['simpleSettings','Настройки']];
 const button=([k,l])=>'<button class="navbtn" data-view="'+k+'" '+(S.view===k?'aria-current="page"':'')+'>'+l+'</button>';
 $('#nav').innerHTML='<div class="brand">РУБІЖ PIM<small>v'+PIM_VERSION+' · SIMPLE</small></div><nav class="navlist">'+main.map(button).join('')+'</nav><details class="nav-more"><summary>Для разработчика / Дополнительно</summary><nav class="nav-tools">'+VIEWS.filter(([k])=>!main.some(([id])=>id===k)).concat([['check','Проверка'],['settings','Расширенные настройки']]).map(button).join('')+'</nav></details><div class="navfoot"><label class="theme-control">Тема<select id="themeMode"><option value="auto" '+(themeChoice()==='auto'?'selected':'')+'>Авто</option><option value="dark" '+(themeChoice()==='dark'?'selected':'')+'>Тёмная</option><option value="light" '+(themeChoice()==='light'?'selected':'')+'>Светлая</option></select></label><div id="saveState" class="saving">'+esc(S.saveMsg||'')+'</div><div id="sbStatus">'+esc(sbStatusText())+'</div></div>';
};
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-simple]');if(!button)return;
 if(SIMPLE_UI.busy||WORKFLOW.active||MODEL_UI.busy||S.saving||SITE.busy){workflowToast('Дождитесь завершения текущей операции.');return;}
 SIMPLE_UI.busy=true;
 try{
  const action=button.dataset.simple;
  if(['preview','apply','sync','refresh','color'].includes(action)&&S.snap)throw Error('Сначала завершите или отмените импорт.');
  if(action==='preview')SIMPLE_UI.preview=simplePolicyPreview();
  if(action==='cancel')SIMPLE_UI.preview=null;
  if(action==='apply'){await simpleApplyPolicy();SIMPLE_UI.publishPlan=await simplePublicationPlan();workflowToast('Правила сохранены. Неполные карточки убраны в архив.');}
  if(action==='refresh')SIMPLE_UI.publishPlan=await simplePublicationPlan();
  if(action==='group'){SIMPLE_UI.page=0;SIMPLE_UI.group=button.dataset.group;if(!SIMPLE_UI.publishPlan)SIMPLE_UI.publishPlan=await simplePublicationPlan();}
  if(action==='modelSeparate'||action==='modelMerge'){const task=simpleDecisions().find(t=>t.key===button.dataset.key),group=mcPlan().review.find(g=>task?.ids.join('|')===g.ids.join('|'));if(!group)throw Error('Группа изменилась. Повторите проверку.');if(!confirm((action==='modelSeparate'?'Зафиксировать разные модели':'Объединить одну модель')+': '+group.name+'?'))return;await requireBatchBackup('Перед решением о модели');const backup=fullStateData('До решения о модели');try{if(action==='modelSeparate')for(const id of group.ids){const p=S.products.get(id);p.model_grouping_locked=true;markProduct(p);}else mcMergeGroup(group,{manual:true});rebuildIndex();bumpData();if(!await persist())throw Error('Решение не сохранено.');}catch(e){loadStateData(backup);markAllDirty();await persist();throw e;}SIMPLE_UI.publishPlan=await simplePublicationPlan();}
  if(action==='page')SIMPLE_UI.page=Math.max(0,SIMPLE_UI.page+Number(button.dataset.d));
  if(action==='sync'){const result=await simplePublish();if(result)workflowToast('Операция '+result.id+': '+result.status+'. Ошибок: '+result.errors.length);SIMPLE_UI.publishPlan=await simplePublicationPlan();}
  if(action==='color'){
   const task=simpleDecisions().find(t=>t.key===button.dataset.key),input=[...document.querySelectorAll('[data-simple-color]')].find(el=>el.dataset.simpleColor===task?.raw),value=input?.value.trim();
   if(!task||!value)throw Error('Укажите название для этой группы.');
   if(!confirm('Значение «'+task.raw+'» → «'+value+'». Затронет '+task.ids.length+' товаров. Применить?'))return;
   await requireBatchBackup('Перед правилом цвета SIMPLE');const selector=[...document.querySelectorAll('[data-simple-color-kind]')].find(el=>el.dataset.simpleColorKind===task.raw);S.cfg.simple_color_aliases={...(S.cfg.simple_color_aliases||{}),[norm(task.raw)]:{value,kind:selector?.value==='camouflage'?'camouflage':'color'}};S.cfgDirty=true;bumpData();if(!await persist())throw Error('Правило не сохранено.');
  }
  if(action==='rollback'){const backup=await Store.get('safety/before_simple');if(!backup)throw Error('Копия до SIMPLE отсутствует.');if(!confirm('Вернуть всю базу до включения SIMPLE? Последующие изменения тоже откатятся.'))return;await requireBatchBackup('Перед откатом SIMPLE');loadStateData(backup);markAllDirty();if(!await persist())throw Error('Откат не сохранён.');SIMPLE_UI.preview=null;SIMPLE_UI.publishPlan=null;}
 }catch(error){workflowToast(error.message||String(error));}
 finally{SIMPLE_UI.busy=false;render();}
});

// Legacy payload adapters must not overwrite explicitly approved SIMPLE fields.
const simpleLegacyPayload=sitePayloadProduct;
sitePayloadProduct=function(x){
 const out=simpleLegacyPayload(x);if(!simpleEnabled())return out;
 out.attributes=structuredClone(x.attributes);out.filter_attributes=structuredClone(x.filter_attributes);
 const bySku=new Map(x.variants.map(v=>[v.sku,v]));
 for(const v of out.variants){const original=bySku.get(v.sku);for(const field of ['color','camouflage','size_raw','size_display','size_normalized','size_system','size_unconfirmed','order_on_request','requires_order_confirmation','preorder_confirmed','lead_time','lead_time_days','stock','availability','availability_label'])v[field]=original[field];}
 return out;
};
