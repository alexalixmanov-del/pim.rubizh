// Final workflow: publication decision, exact SITE wire contract and five owner screens.
// Business rules stay in the decision/export functions below; screens only read their cached results.
const FINAL_WORKFLOW_VERSION=1;
const PIM_SITE_CONTRACT=Object.freeze({contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products'});
const FINAL_VIEWS=[['ready','НА САЙТ'],['moderation','МОДЕРАЦИЯ'],['rejected','НЕ ПРОХОДИТ'],['import','ИМПОРТ'],['backup','BACKUP']];
const FINAL_UI={q:'',category:'',availability:'',page:0,rejectedCode:'',busy:false,hashes:null,lastPublish:null};
const FINAL_REJECT_TEXT={
 UNRESOLVABLE_PRODUCT:['Нет ни одного реального SKU','Карточку нельзя продать: у модели нет вариантов.'],
 NO_PHOTOS:['Нет пригодных фотографий','Нужна минимум одна фотография с корректным адресом.'],
 NO_TITLE:['Нет названия','Покупатель не увидит, что это за товар.'],
 NO_DESCRIPTION:['Нет описания','Нет фактического описания поставщика или подтверждённых характеристик.'],
 INVALID_SKU:['Ошибка SKU','Пустой или повторяющийся SKU: нельзя однозначно определить покупаемую единицу.'],
 NO_PRICE:['Нет цены','Ни у одного SKU нет рассчитанной цены продажи.'],
 MARGIN_VIOLATION:['Цена ниже допустимой маржи','Каждая цена нарушает минимальную маржу или обязательную РРЦ; автоматически цена не исправляется.'],
 RESTRICTED:['Запрещено для публикации','Товар относится к ограниченной группе.'],
 OWNER_UNPUBLISHED:['Снят с сайта владельцем','Ручное решение: не публиковать.']
};
const FINAL_MODERATION_TEXT={
 category:['Категория не подтверждена','Выберите одну каноническую категорию.'],
 grouping:['Неясно, одна это модель или разные','Решите: объединить в одну модель или оставить отдельно.'],
 color:['Неизвестное значение цвета или камуфляжа','Укажите цвет или камуфляж для этого значения.'],
 photo_ownership:['Не у всех цветов есть свои фото','Привяжите фото к цвету; общие фото модели не подставляются другим цветам автоматически.'],
 binding:['Привязка SKU поставщика не подтверждена','Подтвердите, какому SKU принадлежит артикул поставщика.'],
 price:['Конфликт цены','Проверьте ручную цену: она нарушает минимальную маржу или РРЦ.'],
 price_policy:['Правило маржи дорогих товаров','Подтвердите правило маржи для всей группы.'],
 size:['Размер требует подтверждения','Подтвердите размер; до этого возможна только заявка без оплаты.'],
 inventory:['Правило наличия поставщика','Подтвердите значение колонки наличия у поставщика; до этого наличие UNKNOWN и оплата закрыта.'],
 model:['Неясно, одна это модель или разные','Решите: объединить в одну модель или оставить отдельно.']
};
function finalUsablePhotos(p){return simplePhotos(p).filter(url=>p.photoMeta?.[url]?.broken!==true&&p.photoMeta?.[url]?.invalid!==true);}
function finalTitle(p){return String(p.marketing_name_uk||p.model_name||p.name||'').trim();}
// Performance only: the generated description is a pure function of the chosen source text, the manual flag, the
// name and the translation glossary. Reuse it while those are identical (a 3 113-product catalog re-translated
// every render otherwise took minutes).
// The memo also survives restarts in a separate derived-cache IndexedDB (never synced, never in backups, no
// business data): entries are keyed by a hash of every input plus the PIM version, so any change recomputes.
const FINAL_DESCRIPTION_MEMO=new Map(),finalUncachedSimpleDescription=simpleDescription;
const FINAL_DERIVED_CACHE={db:'rubizh_pim_derived_cache_v1',key:'final-descriptions',dirty:false,timer:null};
simpleDescription=function(p){
 const key=fnvHash(PIM_VERSION+'\u0000'+(p.fieldMeta?.desc?.source==='manual'?'M':'A')+'\u0000'+(p.name||'')+'\u0000'+ceTranslationSignature()+'\u0000'+simpleSource(p)),hit=FINAL_DESCRIPTION_MEMO.get(p.id);
 if(hit&&hit.key===key)return hit.out;
 const out=finalUncachedSimpleDescription(p);FINAL_DESCRIPTION_MEMO.set(p.id,{key,out});finalDerivedCacheSaveSoon();return out;
};
function finalDerivedCacheOpen(){return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined')return reject(Error('NO_IDB'));const r=indexedDB.open(FINAL_DERIVED_CACHE.db,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function finalDerivedCacheLoad(){
 try{const db=await finalDerivedCacheOpen(),value=await new Promise((resolve,reject)=>{const q=db.transaction('kv').objectStore('kv').get(FINAL_DERIVED_CACHE.key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
  if(value?.version===PIM_VERSION&&Array.isArray(value.entries))for(const [id,key,out] of value.entries)if(!FINAL_DESCRIPTION_MEMO.has(id))FINAL_DESCRIPTION_MEMO.set(id,{key,out});return FINAL_DESCRIPTION_MEMO.size;}
 catch{return 0;}
}
async function finalDerivedCacheSave(){
 FINAL_DERIVED_CACHE.dirty=false;
 try{const entries=[...FINAL_DESCRIPTION_MEMO].filter(([id])=>S.products.has(id)).map(([id,x])=>[id,x.key,x.out]),db=await finalDerivedCacheOpen();
  await new Promise((resolve,reject)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put({version:PIM_VERSION,entries},FINAL_DERIVED_CACHE.key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();return entries.length;}
 catch{return 0;}
}
function finalDerivedCacheSaveSoon(){FINAL_DERIVED_CACHE.dirty=true;if(FINAL_DERIVED_CACHE.timer)return;FINAL_DERIVED_CACHE.timer=setTimeout(()=>{FINAL_DERIVED_CACHE.timer=null;if(FINAL_DERIVED_CACHE.dirty)finalDerivedCacheSave();},3000);}
const finalProductionLoad=productionLoad;
productionLoad=async function(){const result=await finalProductionLoad(...arguments);await finalDerivedCacheLoad();return result;};
function finalDescription(p){return classificationEnabled()?classificationDescription(p):simpleDescription(p);}
const finalSkuCounts=memoByData(function(){const counts=new Map();for(const p of S.products.values())if(!p.archived)for(const v of p.variants||[]){const key=String(v.sku||'').trim().toLowerCase();if(key)counts.set(key,(counts.get(key)||0)+1);}return counts;});
const finalModelReview=memoByData(function(){try{return new Set(mcPlan().review.flatMap(g=>g.ids));}catch{return new Set();}});
function finalOwnerUnpublished(p){return !!p.simple_publish_disabled||p.fieldMeta?.pub?.source==='manual'&&p.pub===false;}
const finalDecision=memoProd('final-decision',function(p){
 const reject=[],moderate=[],variants=p.variants||[],add=(list,code,why,evidence=[])=>list.push({code,why,evidence});
 if(p.archived)return {state:'ARCHIVED',reasons:[]};
 if(!variants.length)add(reject,'UNRESOLVABLE_PRODUCT',FINAL_REJECT_TEXT.UNRESOLVABLE_PRODUCT[1]);
 if(!finalUsablePhotos(p).length)add(reject,'NO_PHOTOS',FINAL_REJECT_TEXT.NO_PHOTOS[1]);
 if(!finalTitle(p))add(reject,'NO_TITLE',FINAL_REJECT_TEXT.NO_TITLE[1]);
 const description=finalDescription(p);if(!simpleMeaningful(description,p.name))add(reject,'NO_DESCRIPTION',FINAL_REJECT_TEXT.NO_DESCRIPTION[1]);
 const counts=finalSkuCounts(),badSku=variants.filter(v=>!String(v.sku||'').trim()||counts.get(String(v.sku).trim().toLowerCase())>1).map(v=>v.sku||'(пусто)');
 if(badSku.length)add(reject,'INVALID_SKU',FINAL_REJECT_TEXT.INVALID_SKU[1],badSku.slice(0,5));
 const priced=variants.map(v=>({v,c:calc(p,v),m:modelVariant(p,v)})).filter(x=>x.c.price>0);
 if(variants.length&&!priced.length)add(reject,'NO_PRICE',FINAL_REJECT_TEXT.NO_PRICE[1]);
 else if(priced.length&&priced.every(x=>x.m.margin_blocked))add(reject,'MARGIN_VIOLATION',FINAL_REJECT_TEXT.MARGIN_VIOLATION[1],priced.slice(0,5).map(x=>x.v.sku+': '+money(x.c.price)));
 if(siteBlocked(p))add(reject,'RESTRICTED',FINAL_REJECT_TEXT.RESTRICTED[1]);
 if(finalOwnerUnpublished(p))add(reject,'OWNER_UNPUBLISHED',FINAL_REJECT_TEXT.OWNER_UNPUBLISHED[1]);
 if(reject.length)return {state:'REJECTED',reasons:reject};
 // Only owner questions that block a correct public MODEL; supplier inventory and size requests do not.
 const openCategory=(p.classification_exceptions||[]).some(e=>e.kind==='category'&&e.status==='OPEN');
 if(!p.canonical_category_id||openCategory)add(moderate,'category',FINAL_MODERATION_TEXT.category[1],[p.category_review_status||'NEEDS_REVIEW',p.suggested_category_id?'Предложено: '+canonicalPath(p.suggested_category_id):''].filter(Boolean));
 if(variants.length>modelLimit(p)||finalModelReview().has(p.id))add(moderate,'grouping',FINAL_MODERATION_TEXT.grouping[1],[variants.length+' SKU']);
 const unknownColors=uniq(variants.flatMap(v=>simplePalette(v).unknown));if(unknownColors.length)add(moderate,'color',FINAL_MODERATION_TEXT.color[1],unknownColors.slice(0,5));
 if(classificationEnabled()||mcEnabled()){const colors=mcColors(p);if(colors.length>1&&colors.some(c=>!c.photos.length))add(moderate,'photo_ownership',FINAL_MODERATION_TEXT.photo_ownership[1],colors.filter(c=>!c.photos.length).map(c=>[c.color,c.camouflage].filter(Boolean).join(' / ')||c.id));}
 const shared=variants.filter(v=>v.source_binding_status&&v.source_binding_status!=='CONFIRMED');if(shared.length)add(moderate,'binding',FINAL_MODERATION_TEXT.binding[1],shared.slice(0,5).map(v=>v.sku));
 const manualBelow=priced.filter(x=>x.m.margin_blocked);if(manualBelow.length)add(moderate,'price',FINAL_MODERATION_TEXT.price[1],manualBelow.slice(0,5).map(x=>x.v.sku+': '+money(x.c.price)));
 if(simplePricePolicyConflict(p))add(moderate,'price_policy',FINAL_MODERATION_TEXT.price_policy[1]);
 return moderate.length?{state:'MODERATION',reasons:moderate}:{state:'READY',reasons:[]};
});
const finalCounts=memoByData(function(){const out={READY:0,MODERATION:0,REJECTED:0,ARCHIVED:0};for(const p of S.products.values())out[finalDecision(p).state]++;return out;});
const finalSummary=memoProd('final-summary',function(p){
 const out={IN_STOCK:0,PREORDER:0,ORDER_ON_REQUEST:0,SIZE_CONFIRMATION_REQUIRED:0,UNKNOWN:0,OUT_OF_STOCK:0},prices=[];
 for(const v of p.variants||[]){const a=classificationEnabled()?classificationAvailability(p,v).availability:({in:'IN_STOCK',order:'PREORDER',out:'OUT_OF_STOCK'})[calc(p,v).avail]||'UNKNOWN';out[a]=(out[a]||0)+1;const c=calc(p,v);if(c.price>0)prices.push(c.price);}
 const colors=classificationEnabled()||mcEnabled()?mcColors(p).length:uniq((p.variants||[]).map(v=>v.color||'')).length;
 return {availability:out,colors,skus:(p.variants||[]).length,min:prices.length?Math.min(...prices):null,max:prices.length?Math.max(...prices):null,cover:finalUsablePhotos(p)[0]||''};
});
// Exact PIM → SITE wire: one MODEL per product, all real SKU with per-SKU pricing v1 (G02), private routing kept server-side.
// Observation age is derived from stock_observed_at at read time; it must not make an unchanged model look changed.
function finalModelHash(model){return fnvHash(stableValue105({...model,variants:model.variants.map(v=>{const x={...v};delete x.stock_data_age_hours;delete x.stale_source;return x;})}));}
const FINAL_COLOR_FIELDS=['id','color','camouflage','photos','variant_skus','photo_assignment'];
function finalWireProduct(p){
 const out=simpleProductPayload(simpleAssess(p)),photos=finalUsablePhotos(p);
 out.colors=(out.colors||[]).map(c=>Object.fromEntries(FINAL_COLOR_FIELDS.filter(k=>Object.hasOwn(c,k)).map(k=>[k,structuredClone(c[k])])));
 out.photos=photos;out.unassigned_photos=photos.filter(url=>!out.colors.some(c=>c.photos.includes(url)));
 out.name=out.marketing_name_uk=finalTitle(p);out.description=finalDescription(p);
 out.category=canonicalPath(out.canonical_category_id);out.category_path=out.category.split(' / ');
 out.publication_state='ACTIVE';out.publication={state:'READY',decision_version:FINAL_WORKFLOW_VERSION};
 out.pricing_policy_version=1;
 for(const v of out.variants){v.photos=out.colors.find(c=>c.id===v.color_id)?.photos||[];
  // Private shipment routing for the SITE server (never public): the offer that prices this SKU.
  const local=p.variants.find(x=>x.sku===v.sku),c=local?calc(p,local):null,o=c?.o||c?.ref,sid=o?.sid||'';
  v.fulfillment_supplier_id=sid;v.fulfillment_supplier=sid?supName(sid):'';v.fulfillment_supplier_sku=String(o?.s||'');}
 for(const k of ['availability_label','legacy_attributes','quality_score'])delete out[k];
 return out;
}
function finalExplicitHideIds(published){
 return Object.keys(published||{}).filter(id=>{const p=S.products.get(id);return p&&(p.archived||finalOwnerUnpublished(p));}).sort();
}
function pimSiteWire({published={}}={}){
 if(!classificationEnabled())throw Error('CONTRACT_V3_REQUIRES_CLASSIFICATION: сначала выполните импорт с классификацией');
 if(!pricingProtected())throw Error('PRICING_POLICY_V1_REQUIRED');
 const products=[...S.products.values()].filter(p=>finalDecision(p).state==='READY').sort((a,b)=>a.id.localeCompare(b.id)).map(finalWireProduct);
 const categories=categoryPublicCatalogue();
 return {contract_version:3,version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,pim_version:PIM_VERSION,currency:'UAH',generated_at:new Date().toISOString(),catalog_revision:fnvHash(stableValue105(products.map(finalModelHash))),category_catalog_hash:fnvHash(JSON.stringify(categories)),categories,products,hide_ids:finalExplicitHideIds(published)};
}
// classificationExport-based review feed now uses the same exact exporter.
const finalPreviousBuildFeed=buildFeed;
buildFeed=function(){
 if(!classificationEnabled()||!pricingProtected())return finalPreviousBuildFeed();
 const wire=pimSiteWire();return {...wire,review_only:classificationReviewMode(),sync_enabled:false};
};
// Publisher: SITE must advertise the exact contract; each batch is acknowledged per model; only explicit hide_ids hide.
const FINAL_SYNC_CHUNK=100,FINAL_NET={fetch:(...args)=>classificationNetwork(...args)};
async function finalSiteFetch(path,opt={}){
 if(classificationReviewMode())throw Error('REVIEW_ONLY: network disabled; production writes forbidden');
 const c=siteCfg(),url=c.url.replace(/\/+$/,'')+path;let r,j=null;
 try{r=await FINAL_NET.fetch(url,{...opt,headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.key,...(opt.headers||{})}});}catch{throw Error('нет связи с сайтом ('+c.url+')');}
 try{j=await r.json();}catch{}
 if(!r.ok||!j||j.ok===false)throw Error((j&&j.error)||('сайт ответил '+r.status));
 return j;
}
function finalCapabilitiesOk(caps){return caps&&Object.entries(PIM_SITE_CONTRACT).filter(([k])=>k!=='envelope').every(([k,v])=>Number(caps[k])===v)&&caps.envelope==='products';}
async function finalPublish(){
 if(!siteReady())throw Error('SYNC_DISABLED: укажите адрес API сайта и ключ PIM.');
 if(S.snap)throw Error('Сначала завершите или отмените импорт.');
 if(productionMode()&&PRODUCTION_MIGRATION.state!=='ready')throw Error('MIGRATION_PENDING: сначала завершите проверенную migration');
 const status=await finalSiteFetch('/pim/status');
 if(!finalCapabilitiesOk(status.capabilities))throw Error('SYNC_DISABLED: сайт не подтвердил contract v3 (contract/pricing/category/size/inventory/order versions). Передача остановлена.');
 const published=await Store.get('site/v3/published')||{},hashes=await Store.get('site/v3/hashes')||{};
 const wire=pimSiteWire({published:Object.fromEntries(Object.entries(published).filter(([,x])=>!x.hidden))});
 const items=wire.products.map(p=>({p,h:finalModelHash(p)})),changed=items.filter(o=>hashes[o.p.id]!==o.h),catsChanged=S.cfg.siteV3CatHash!==wire.category_catalog_hash;
 if(!changed.length&&!wire.hide_ids.length&&!catsChanged)return {nothing:true,ready:items.length};
 await requireBatchBackup('Перед отправкой на сайт');
 const chunks=[];for(let i=0;i<changed.length;i+=FINAL_SYNC_CHUNK)chunks.push(changed.slice(i,i+FINAL_SYNC_CHUNK));if(!chunks.length)chunks.push([]);
 const batchId='PB-'+wire.catalog_revision+'-'+fnvHash(stableValue105([changed.map(o=>o.h),wire.hide_ids,wire.category_catalog_hash]));
 const head=Object.fromEntries(Object.keys(PIM_SITE_CONTRACT).filter(k=>k!=='envelope').map(k=>[k,wire[k]]));
 let ack=null;
 for(let i=0;i<chunks.length;i++){
  const last=i===chunks.length-1,body={...head,pim_version:wire.pim_version,currency:wire.currency,generated_at:wire.generated_at,catalog_revision:wire.catalog_revision,batch_id:batchId,chunk_index:i,chunk_count:chunks.length,products:chunks[i].map(o=>o.p),hide_ids:last?wire.hide_ids:[]};
  if(i===0){body.categories=wire.categories;body.category_catalog_hash=wire.category_catalog_hash;}
  const j=await finalSiteFetch('/pim/sync',{method:'POST',body:JSON.stringify(body)});
  if(j.batch_id!==batchId||j.chunk_index!==i)throw Error('Сайт не подтвердил часть пакета '+(i+1)+'/'+chunks.length);
  if(last)ack=j;
 }
 if(ack.status!=='COMMITTED'||Number(ack.contract_version)!==3)throw Error('Сайт не зафиксировал пакет. Ничего не отмечено как опубликованное.');
 const sent=new Map(changed.map(o=>[o.p.id,o.h])),results=Array.isArray(ack.results)?ack.results:[],seen=new Set();
 for(const r of results){if(!r||!sent.has(r.id)||seen.has(r.id)||!['created','updated','unchanged','error'].includes(r.status))throw Error('Некорректное подтверждение сайта');seen.add(r.id);}
 if(seen.size!==sent.size)throw Error('Сайт подтвердил не все отправленные модели');
 const hidden=Array.isArray(ack.hidden_ids)?[...ack.hidden_ids].sort():null;if(stableValue105(hidden)!==stableValue105(wire.hide_ids))throw Error('Сайт не подтвердил скрытие конкретных моделей');
 const at=Date.now(),errors=[];
 for(const r of results){if(r.status==='error'){errors.push(r);continue;}hashes[r.id]=sent.get(r.id);published[r.id]={confirmed_at:at,hidden:false,catalog_revision:ack.catalog_revision};}
 for(const id of wire.hide_ids){published[id]={...(published[id]||{}),hidden:true,confirmed_at:at};delete hashes[id];}
 await Store.set('site/v3/hashes',hashes);await Store.set('site/v3/published',published);
 S.cfg.siteV3CatHash=wire.category_catalog_hash;S.cfg.siteSync={...(S.cfg.siteSync||{}),at,mode:'v3',sent:changed.length,hidden:wire.hide_ids.length,errors:errors.slice(0,50),batch_id:batchId,catalog_revision:ack.catalog_revision,lastError:''};S.cfgDirty=true;
 if(!await persist())throw Error('Ответ сайта получен, но локальное сохранение не завершено');
 FINAL_UI.hashes=hashes;return {batch_id:batchId,sent:changed.length,hidden:wire.hide_ids.length,errors:errors.length};
}
sitePublish=async function(mode,{silent=false}={}){
 if(classificationReviewMode())throw Error('REVIEW_ONLY: publication and /pim/sync disabled');
 try{const r=await finalPublish();if(!silent)toast(r.nothing?'На сайте всё актуально':'Сайт обновлён: моделей '+r.sent+', скрыто '+r.hidden+(r.errors?', ошибок '+r.errors:''));return r;}
 catch(error){S.cfg.siteSync={...(S.cfg.siteSync||{}),lastError:error.message||String(error),lastErrorAt:Date.now()};S.cfgDirty=true;throw error;}
};
siteAutoTick=function(){return false;};
// Screens.
const finalWireHash=memoProd('final-wire-hash',p=>finalModelHash(finalWireProduct(p)));
function finalSyncState(p){const h=FINAL_UI.hashes;if(!h)return '…';if(!h[p.id])return 'не отправлено';return h[p.id]===finalWireHash(p)?'на сайте':'есть изменения';}
function finalAvailabilityText(a){return [['IN_STOCK','в наличии'],['PREORDER','предзаказ'],['ORDER_ON_REQUEST','под заказ'],['SIZE_CONFIRMATION_REQUIRED','размер по запросу'],['UNKNOWN','неизвестно'],['OUT_OF_STOCK','нет']].filter(([k])=>a[k]).map(([k,l])=>a[k]+' '+l).join(' · ');}
function finalPager(total,size=50){FINAL_UI.page=Math.min(FINAL_UI.page,Math.max(0,Math.ceil(total/size)-1));return '<div class="row final-pager"><button class="btn" data-final="page" data-d="-1" '+(FINAL_UI.page?'':'disabled')+'>Назад</button><span>'+total+' · стр. '+(FINAL_UI.page+1)+'</span><button class="btn" data-final="page" data-d="1" '+((FINAL_UI.page+1)*size<total?'':'disabled')+'>Далее</button></div>';}
function finalLoadHashes(){if(FINAL_UI.hashes||FINAL_UI.loading)return;FINAL_UI.loading=true;Store.get('site/v3/hashes').then(h=>{FINAL_UI.hashes=h||{};FINAL_UI.loading=false;if(S.view==='ready')render();}).catch(()=>{FINAL_UI.loading=false;});}
// Approved price policy (30 / 25 / 20, discount floor 15% — OWNER_PRICE_POLICY) is never applied at startup in
// production. It is applied only by the owner's explicit preview → apply, after the data migration, through the
// 10.9.2 logic (full backup, safety/before_pricing_30_25_20, verified write, later owner edits kept).
function finalOwnerPriceApplyAllowed(){return !productionMode()||FINAL_UI.ownerPriceApply===true&&PRODUCTION_MIGRATION.state==='ready';}
const finalProductionPricing=ensurePricingPolicy;
ensurePricingPolicy=async function(){return productionMode()&&finalOwnerPriceApplyAllowed()?productionLegacyPricing(...arguments):finalProductionPricing(...arguments);};
const finalSimpleApplyPricePolicy=simpleApplyPricePolicy;
simpleApplyPricePolicy=async function(){
 if(productionMode()&&PRODUCTION_MIGRATION.state!=='ready')throw Error('Сначала завершите migration 10.9.3, затем примените правила цен.');
 FINAL_UI.ownerPriceApply=true;try{return await finalSimpleApplyPricePolicy(...arguments);}finally{FINAL_UI.ownerPriceApply=false;}
};
function finalPricePolicyNotice(){
 if(pricingProtected())return '';
 return '<section class="panel"><h2>Правила цен не применены</h2><p>Передача на сайт требует утверждённых правил: обычные товары 30%, дорогие 25%, комплекты 20%, скидки не ниже 15% после доната. Сейчас действуют прежние настройки: '+esc([S.cfg.minMargin,S.cfg.bigPriceMargin,S.cfg.kitMargin].join(' / '))+'. Цены не меняются, пока вы не проверите и не примените правила.</p><button class="btn primary" data-simple="pricePreview">Проверить правила цен</button></section>'+simplePricePolicyPanel();
}
function vFinalReady(){
 finalLoadHashes();
 const q=norm(FINAL_UI.q),tokens=searchTokens(FINAL_UI.q),list=[...S.products.values()].filter(p=>finalDecision(p).state==='READY'&&(!FINAL_UI.category||p.canonical_category_id===FINAL_UI.category)&&(!q||scoreProduct(p,tokens,q))&&(!FINAL_UI.availability||finalSummary(p).availability[FINAL_UI.availability]>0)).sort((a,b)=>pimCompare(finalTitle(a),finalTitle(b)));
 const cats=uniq([...S.products.values()].filter(p=>finalDecision(p).state==='READY').map(p=>p.canonical_category_id)).sort((a,b)=>pimCompare(canonicalPath(a),canonicalPath(b))),s=S.cfg.siteSync||{};
 const rows=list.slice(FINAL_UI.page*50,FINAL_UI.page*50+50).map(p=>{const x=finalSummary(p);return '<tr class="click" data-open="'+esc(p.id)+'"><td class="final-cover">'+(x.cover?'<img loading="lazy" alt="" src="'+esc(x.cover)+'">':'')+'</td><td><b>'+esc(finalTitle(p))+'</b><div class="small muted">'+esc(p.brand||'')+'</div></td><td class="small">'+esc(canonicalPath(p.canonical_category_id))+'</td><td>'+x.colors+'</td><td>'+x.skus+'</td><td>'+(x.min==null?'—':x.min===x.max?money(x.min):money(x.min)+' – '+money(x.max))+'</td><td class="small">'+esc(finalAvailabilityText(x.availability))+'</td><td class="small">'+esc(finalSyncState(p))+'</td></tr>';}).join('');
 return '<h1>На сайт</h1><p class="lead">Модели, готовые к публикации. Наличие влияет на возможность оплаты, а не убирает модель.</p>'+finalPricePolicyNotice()+'<section class="panel row final-actions"><button class="btn primary" data-final="publish" '+(siteReady()&&pricingProtected()?'':'disabled')+'>Отправить на сайт</button><span class="muted">Готово: '+finalCounts().READY+'</span>'+(s.at?'<span class="small muted">Последняя отправка: '+fmtDate(s.at)+(s.batch_id?' · '+esc(s.batch_id):'')+'</span>':'')+(s.lastError&&(s.lastErrorAt||0)>(s.at||0)?'<span class="small finance-bad">'+esc(s.lastError)+'</span>':'')+'</section><section class="panel row final-filters"><input id="finalQ" type="search" placeholder="Поиск по названию, SKU, бренду" value="'+esc(FINAL_UI.q)+'"><select id="finalCategory"><option value="">Все категории</option>'+cats.map(id=>'<option value="'+esc(id)+'" '+(FINAL_UI.category===id?'selected':'')+'>'+esc(canonicalPath(id))+'</option>').join('')+'</select><select id="finalAvailability"><option value="">Любое наличие</option>'+[['IN_STOCK','В наличии'],['PREORDER','Предзаказ'],['ORDER_ON_REQUEST','Под заказ'],['SIZE_CONFIRMATION_REQUIRED','Размер по запросу'],['UNKNOWN','Неизвестно'],['OUT_OF_STOCK','Нет в наличии']].map(([k,l])=>'<option value="'+k+'" '+(FINAL_UI.availability===k?'selected':'')+'>'+l+'</option>').join('')+'</select></section><div class="tablewrap"><table class="final-table"><thead><tr><th></th><th>Модель</th><th>Категория</th><th>Цвета</th><th>SKU</th><th>Цена</th><th>Наличие</th><th>Сайт</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8">Нет моделей по фильтру.</td></tr>')+'</tbody></table></div>'+finalPager(list.length)+'<details class="panel"><summary>Подключение сайта</summary><div class="grid2"><label class="f">Адрес API сайта<input id="siteApiUrl" value="'+esc(siteCfg().url)+'" placeholder="https://rubizh.shop/api"></label><label class="f">Ключ PIM<input id="siteApiKey" type="password" value="'+esc(siteCfg().key)+'"></label></div><button class="btn" data-final="saveSite">Сохранить</button></details>';
}
function finalQueue(){
 const items=simpleDecisions().map(t=>({...t,kind:t.kind==='grouping'?'model':t.kind})),covered=new Set(items.flatMap(t=>(t.ids||[]).map(id=>t.kind+':'+id)));
 for(const p of S.products.values()){const d=finalDecision(p);if(d.state!=='MODERATION')continue;for(const r of d.reasons){const kind=r.code==='grouping'?'model':r.code;if(covered.has(kind+':'+p.id))continue;covered.add(kind+':'+p.id);items.push({key:'final:'+kind+':'+p.id,kind,id:p.id,ids:[p.id],title:FINAL_MODERATION_TEXT[kind]?.[0]||kind,detail:finalTitle(p),evidence:r.evidence});}}
 const rank={category:1,model:2,color:3,photo_ownership:4,binding:5,price:6,price_policy:7,size:8,inventory:9};
 return items.sort((a,b)=>(rank[a.kind]||20)-(rank[b.kind]||20)||(b.ids||[]).length-(a.ids||[]).length);
}
function finalTaskEvidence(t){
 const ev=[...(t.evidence||[]).filter(x=>typeof x==='string'),...(t.examples||[]).map(x=>[x.name||S.products.get(x.product_id)?.name,x.sku,x.raw_value!=null?'значение «'+x.raw_value+'»':''].filter(Boolean).join(' · ')),t.tier?'Уровень: '+t.tier:'',t.detail&&t.kind!=='color'?t.detail:''].filter(Boolean);
 return ev.length?'<ul class="small">'+ev.slice(0,6).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="small muted">—</p>';
}
function finalTaskAction(t){
 const open=t.ids?.[0]?'<button class="btn small" data-open="'+esc(t.ids[0])+'">Открыть товар</button>':'';
 if(t.kind==='color')return '<input data-simple-color="'+esc(t.raw)+'" placeholder="Название цвета / камуфляжа"><select data-simple-color-kind="'+esc(t.raw)+'"><option value="color">Цвет</option><option value="camouflage">Камуфляж</option></select><button class="btn small primary" data-simple="color" data-key="'+esc(t.key)+'">Применить ко всей группе</button>';
 if(t.kind==='model'&&!String(t.key).startsWith('final:'))return '<button class="btn small" data-simple="modelMerge" data-key="'+esc(t.key)+'" '+(t.can_merge?'':'disabled')+'>Одна модель</button><button class="btn small" data-simple="modelSeparate" data-key="'+esc(t.key)+'">Разные модели</button>'+open;
 if(t.kind==='price_policy')return '<button class="btn small primary" data-simple="pricePreview">Проверить правило для всей группы</button>';
 if(t.kind==='inventory'&&t.target)return '<button class="btn small primary" data-view="'+esc(t.target)+'">Открыть правило поставщика</button>';
 return open;
}
function vFinalModeration(){
 const queue=finalQueue(),page=queue.slice(FINAL_UI.page*30,FINAL_UI.page*30+30);
 return '<h1>Модерация</h1><p class="lead">Одна очередь вопросов, которые требуют вашего решения. Решение сохраняется и применяется ко всей группе.</p>'+simplePricePolicyPanel()+(page.map(t=>{const text=FINAL_MODERATION_TEXT[t.kind]||[t.title,''];return '<section class="panel final-task"><div class="row"><b>'+esc(text[0])+'</b><span class="tag">'+(t.ids||[]).length+' товар(ов)</span></div><div class="final-task-grid"><div><h3>Причина</h3><p>'+esc(t.kind==='color'?t.title:t.detail||t.title||'')+'</p></div><div><h3>Evidence</h3>'+finalTaskEvidence(t)+'</div><div><h3>Требуемое решение</h3><p>'+esc(text[1])+'</p><div class="row">'+finalTaskAction(t)+'</div></div></div></section>';}).join('')||'<div class="panel">Вопросов нет.</div>')+(queue.length>30?finalPager(queue.length,30):'');
}
function vFinalRejected(){
 const groups=new Map();for(const p of S.products.values()){const d=finalDecision(p);if(d.state!=='REJECTED')continue;for(const r of d.reasons){if(!groups.has(r.code))groups.set(r.code,[]);groups.get(r.code).push({p,r});}}
 const codes=[...groups.keys()].sort((a,b)=>groups.get(b).length-groups.get(a).length),code=groups.has(FINAL_UI.rejectedCode)?FINAL_UI.rejectedCode:codes[0]||'',list=groups.get(code)||[];
 return '<h1>Не проходит</h1><p class="lead">Эти товары нельзя отправить на сайт. Причина указана для каждой позиции.</p><div class="simple-summaries">'+codes.map(c=>'<button class="simple-summary" data-final="rejectedCode" data-code="'+esc(c)+'" '+(c===code?'aria-current="true"':'')+'><b>'+groups.get(c).length+'</b><span>'+esc(FINAL_REJECT_TEXT[c]?.[0]||c)+'</span></button>').join('')+'</div>'+(code?'<section class="panel"><h2>'+esc(FINAL_REJECT_TEXT[code]?.[0]||code)+'</h2><p>'+esc(FINAL_REJECT_TEXT[code]?.[1]||'')+'</p><div class="tablewrap"><table><thead><tr><th>Товар</th><th>SKU</th><th>Детали</th></tr></thead><tbody>'+list.slice(FINAL_UI.page*50,FINAL_UI.page*50+50).map(({p,r})=>'<tr class="click" data-open="'+esc(p.id)+'"><td>'+esc(finalTitle(p)||p.id)+'</td><td class="small">'+esc((p.variants||[]).slice(0,3).map(v=>v.sku).join(', '))+'</td><td class="small">'+esc(r.evidence.join(' · '))+'</td></tr>').join('')+'</tbody></table></div>'+finalPager(list.length)+'</section>':'<div class="panel">Нет заблокированных товаров.</div>');
}
function finalViewAllowed(view){return FINAL_VIEWS.some(([k])=>k===view);}
function finalRenderView(){
 const custom={ready:vFinalReady,moderation:vFinalModeration,rejected:vFinalRejected}[S.view];if(!custom)return false;
 renderNav();const m=$('#view');if(m)m.innerHTML=(S.pricingPolicyError?'<div class="banner">Правила цен не сохранены: '+esc(S.pricingPolicyError)+'</div>':'')+backupBanner()+custom();afterRender();return true;
}
const finalPreviousRender=render;
render=function(){
 if(productionMode()&&PRODUCTION_MIGRATION.state!=='ready')return finalPreviousRender(...arguments);
 if(!S.view||S.view==='today')S.view='ready';
 if(!finalRenderView())return finalPreviousRender(...arguments);
};
renderNav=function(){
 const counts=finalCounts(),badge={ready:counts.READY,moderation:finalQueueCount(),rejected:counts.REJECTED};
 const button=([k,l])=>'<button class="navbtn" data-view="'+k+'" '+(S.view===k?'aria-current="page"':'')+'>'+l+(badge[k]!=null?'<span class="badge">'+badge[k]+'</span>':'')+'</button>';
 $('#nav').innerHTML='<div class="brand">РУБІЖ PIM<small>v'+PIM_VERSION+'</small></div><nav class="navlist">'+FINAL_VIEWS.map(button).join('')+'</nav><div class="navfoot"><label class="theme-control">Тема<select id="themeMode"><option value="auto" '+(themeChoice()==='auto'?'selected':'')+'>Авто</option><option value="dark" '+(themeChoice()==='dark'?'selected':'')+'>Тёмная</option><option value="light" '+(themeChoice()==='light'?'selected':'')+'>Светлая</option></select></label><div id="saveState" class="saving">'+esc(S.saveMsg||'')+'</div><div id="sbStatus">'+esc(sbStatusText())+'</div></div>';
};
const finalQueueCount=memoByData(function(){return finalQueue().length;});
document.addEventListener('input',e=>{
 if(e.target.id==='finalQ'){FINAL_UI.q=e.target.value;FINAL_UI.page=0;clearTimeout(FINAL_UI.timer);FINAL_UI.timer=setTimeout(()=>{const pos=e.target.selectionStart;render();const el=$('#finalQ');if(el){el.focus();try{el.setSelectionRange(pos,pos);}catch{}}},250);}
});
document.addEventListener('change',e=>{
 if(e.target.id==='finalCategory'){FINAL_UI.category=e.target.value;FINAL_UI.page=0;render();}
 if(e.target.id==='finalAvailability'){FINAL_UI.availability=e.target.value;FINAL_UI.page=0;render();}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-final]');if(b){
  e.preventDefault();if(FINAL_UI.busy)return;FINAL_UI.busy=true;
  try{const a=b.dataset.final;
   if(a==='page')FINAL_UI.page=Math.max(0,FINAL_UI.page+Number(b.dataset.d));
   if(a==='rejectedCode'){FINAL_UI.rejectedCode=b.dataset.code;FINAL_UI.page=0;}
   if(a==='saveSite'){S.cfg.siteApi={...siteCfg(),url:$('#siteApiUrl').value.trim(),key:$('#siteApiKey').value.trim(),auto:false};S.cfgDirty=true;await persist();toast('Подключение сохранено');}
   if(a==='publish')await sitePublish('delta');
  }catch(error){toast('Сайт: '+(error.message||error));}finally{FINAL_UI.busy=false;render();}
  return;
 }
 const v=e.target.closest('[data-view]');if(v&&v.dataset.view!==S.view)FINAL_UI.page=0;
},true);
// New supplier positions: no usable photo → minimal rejected-import record (NO_PHOTOS); no photo, title and
// description → GARBAGE. Neither creates a ProductModel. The queue item itself is the raw preserved record.
function finalGroupEvidence(gr){
 const ph=[],d=[];for(const k of gr.contentKeys||[gr.contentKey||gr.key]){const c=S.content.get(k);if(c){ph.push(...(c.ph||[]));if(c.d)d.push(String(c.d));}}
 const photos=ph.filter(url=>{try{return ['http:','https:'].includes(new URL(url).protocol);}catch{return false;}});
 const title=String(gr.items[0]?.n||gr.name||'').trim(),desc=d.join(' ').replace(/<[^>]*>/g,' ').trim();
 return {photos,title,desc,reason:photos.length?null:!title&&!desc?'GARBAGE':'NO_PHOTOS'};
}
const finalBuildGroups=buildGroups;
buildGroups=function(items){
 if(!FINAL_UI.importing)return finalBuildGroups(items);
 const out=[];
 for(const g of finalBuildGroups(items)){const e=finalGroupEvidence(g);
  for(const it of g.items){const was=it.rejected_import?.reason||null;if(was!==e.reason){touchQ(it.k);if(e.reason)it.rejected_import={reason:e.reason,at:Date.now()};else delete it.rejected_import;markQueue(it.k);}}
  if(!e.reason)out.push(g);}
 return out;
};
const finalRejectedImports=memoByData(function(){const out=new Map();for(const it of S.queue.values())if(it.rejected_import&&!it.ig){const r=it.rejected_import.reason;if(!out.has(r))out.set(r,[]);out.get(r).push(it);}return out;});
FINAL_REJECT_TEXT.GARBAGE=['Пустая строка поставщика','Нет фото, названия и описания: товар не создаётся.'];
FINAL_REJECT_TEXT.IMPORT_NO_PHOTOS=['Новая позиция без фото','Позиция поставщика сохранена только как запись импорта; карточка не создана.'];
// Existing zero-photo products: SCAN → read-only preview → owner confirmation → archive (never delete identity).
function finalZeroPhotoPreview(){
 const rows=[...S.products.values()].filter(p=>!p.archived&&finalDecision(p).reasons.some(r=>r.code==='NO_PHOTOS')).map(p=>({id:p.id,name:finalTitle(p)||p.id,skus:p.variants.map(v=>v.sku),reason:'NO_PHOTOS'}));
 return {rows,signature:fnvHash(stableValue105(rows.map(r=>[r.id,stableValue105(S.products.get(r.id))]))),at:Date.now()};
}
async function finalZeroPhotoArchive(plan){
 const now=finalZeroPhotoPreview();if(!plan||now.signature!==plan.signature)throw Error('STALE_PREVIEW: каталог изменился, повторите предпросмотр');
 if(!plan.rows.length)return 0;
 await requireBatchBackup('Перед архивом товаров без фото');const backup=fullStateData('До архива товаров без фото');
 try{for(const r of plan.rows){const p=S.products.get(r.id);const was={pub:p.pub,archived:p.archived};touchP(p.id);p.archivePrevPub=p.pub;p.archived=true;p.archiveReason='NO_PHOTOS: подтверждено владельцем';modelAudit(p,was,{pub:p.pub,archived:true},'Архив без фото (подтверждено)');markProduct(p);}
  rebuildIndex();bumpData();if(!await persist())throw Error('Архив не сохранён.');return plan.rows.length;}
 catch(error){loadStateData(backup);markAllDirty();await persist();throw error;}
}
const finalRejectedView=vFinalRejected;
vFinalRejected=function(){
 const imports=finalRejectedImports(),plan=FINAL_UI.zeroPlan;
 const importHtml=[...imports].map(([reason,list])=>'<section class="panel"><h2>'+esc((reason==='GARBAGE'?FINAL_REJECT_TEXT.GARBAGE:FINAL_REJECT_TEXT.IMPORT_NO_PHOTOS)[0])+' · '+list.length+'</h2><p class="small">'+esc((reason==='GARBAGE'?FINAL_REJECT_TEXT.GARBAGE:FINAL_REJECT_TEXT.IMPORT_NO_PHOTOS)[1])+'</p><p class="small muted">'+list.slice(0,8).map(it=>esc((S.cfg.suppliers.find(s=>s.id===it.sup)?.name||it.sup)+': '+(it.n||it.s||'—'))).join('<br>')+'</p></section>').join('');
 const cleanup='<section class="panel"><h2>Очистка товаров без фото</h2><p class="small">Сначала предпросмотр: список ID и SKU. Товары архивируются (не удаляются), история и идентичность сохраняются.</p>'+(plan?'<p>К архиву: <b>'+plan.rows.length+'</b></p><details><summary>Список</summary>'+plan.rows.slice(0,200).map(r=>'<p class="small">'+esc(r.id)+' · '+esc(r.name)+' · '+esc(r.skus.join(', '))+'</p>').join('')+'</details><button class="btn danger" data-final="zeroApply" '+(plan.rows.length?'':'disabled')+'>Подтверждаю: архивировать '+plan.rows.length+'</button> <button class="btn" data-final="zeroCancel">Отмена</button>':'<button class="btn" data-final="zeroPreview">Предпросмотр очистки</button>')+'</section>';
 return finalRejectedView()+cleanup+importHtml;
};
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-final^="zero"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 try{const a=b.dataset.final;
  if(a==='zeroPreview')FINAL_UI.zeroPlan=finalZeroPhotoPreview();
  if(a==='zeroCancel')FINAL_UI.zeroPlan=null;
  if(a==='zeroApply'){if(!confirm('Архивировать '+FINAL_UI.zeroPlan.rows.length+' товаров без фото? Копия базы будет сохранена.'))return;const n=await finalZeroPhotoArchive(FINAL_UI.zeroPlan);FINAL_UI.zeroPlan=null;toast('В архив: '+n);}
 }catch(error){toast(error.message||String(error));}finally{render();}
},true);
// Only automatic product creation during a supplier import applies the rule; grouping screens are unchanged.
const finalRunImport=runImport;
runImport=function(...args){FINAL_UI.importing=true;try{return finalRunImport(...args);}finally{FINAL_UI.importing=false;}};
