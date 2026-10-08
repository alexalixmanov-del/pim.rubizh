// Model contract v2: explicit persisted ownership; legacy products remain a source archive.
const V2_UI={report:null,candidate:null,busy:false};
function v2Source(){
 const products=[...S.products.values()].map(p=>({...p,legacy_urls:p.legacy_urls||((p.site_slug||p.slug)?['/product/'+(p.site_slug||p.slug)]:[])}));
 return RubizhContractV2.source({products,cfg:S.cfg},canonicalCategories(),(p,v)=>{
  const c=calc(p,v),o=c.o||c.ref,days=confirmedPreorderDays(o),stock=offerConfirmedStock(o);
  const request=v.order_on_request===true||c.avail==='out'&&S.cfg.simple_policy?.unavailable==='owner_order_on_request'&&!!o&&!o.missing&&!o.discontinued&&!o.invalid_stock&&!o.priceAlert&&c.price>0;
  let availability=c.avail==='in'?'IN_STOCK':c.avail==='order'&&days>0?'PREORDER':request?'ORDER_ON_REQUEST':c.avail==='out'?'OUT_OF_STOCK':'HIDDEN';
  if(p.archived||p.pub===false)availability='HIDDEN';
  return {price:c.price,stock:stock??null,availability,availability_unknown:!o||!!o.stock_stale,lead_time_days:availability==='PREORDER'?days:null,preorder_confirmed:availability==='PREORDER',stock_stale:!!o?.stock_stale,supplier_id:o?.sid||null};
 });
}
function v2Bundle(registry=S.cfg.model_registry_v2){if(!registry)throw Error('Спочатку завантажте та підтвердьте mapping v2.');return RubizhContractV2.build(v2Source(),registry);}
async function v2Download(name,data){return offerDownload(name,new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));}
async function v2Apply(registry){
 const source=v2Source(),previous=S.cfg.model_registry_v2||null,bundle=RubizhContractV2.build(source,registry,{previous});
 V2_UI.report=bundle.report;if(bundle.report.errors.length)throw Error('Mapping не збережено: '+bundle.report.errors[0].code);
 const before=structuredClone(S.cfg),signature=RubizhContractV2.stable(source);
 await Store.set('safety/before_model_v2',fullStateData('До MODEL → COLOR → SKU v2'));
 if(signature!==RubizhContractV2.stable(v2Source()))throw Error('Каталог змінився під час збереження. Повторіть dry-run.');
 try{
  S.cfg.model_registry_v2=structuredClone(registry);S.cfg.model_schema_version=2;S.cfgDirty=true;
  if(!await persist())throw Error('Mapping не збережено');
  const stored=await Store.get('meta/config');if(RubizhContractV2.stable(stored?.model_registry_v2)!==RubizhContractV2.stable(registry))throw Error('Mapping не пройшов перевірку збереження');
  V2_UI.candidate=null;bumpData();return bundle.report;
 }catch(e){S.cfg=before;S.cfgDirty=true;await persist();throw e;}
}
function vModelV2(){
 const r=V2_UI.report;return `<h1>MODEL → COLOR → SKU</h1><p class="lead">Визначте моделі та кольори явним mapping. Старі картки, SKU, ціни, залишки й taxonomy зберігаються без об’єднання за назвами.</p><section class="panel"><h2>1. Вихідні дані та mapping</h2><div class="row"><button class="btn" data-act="v2Source">Експорт поточного каталогу</button><button class="btn" data-act="v2Draft">Шаблон mapping</button><label class="btn">Завантажити mapping JSON<input type="file" id="v2-mapping-file" accept="application/json,.json" hidden></label></div><p>У шаблоні всі зв’язки UNKNOWN. Підтвердіть model_id, color_id, кожен SKU та фото. Невідоме фото залишається без кольору; не потрапляє до публічної галереї.</p></section><section class="panel"><h2>2. Dry-run та збереження</h2><div class="row"><button class="btn primary" data-act="v2Check">Перевірити mapping</button><button class="btn" data-act="v2Apply" ${V2_UI.candidate?'':'disabled'}>Зберегти структуру v2</button><button class="btn" data-act="v2Report" ${r?'':'disabled'}>Звіт JSON</button><button class="btn" data-act="v2Export">Експорт MODEL та legacy mapping</button><button class="btn" data-act="v2Rollback">Відкотити структуру v2</button></div>${r?`<p class="banner">${r.ready_for_migration?'Mapping готовий до міграції':'Міграцію заблоковано'} · ${r.errors.length} помилок · ${r.unconfirmed_mappings} непідтверджених зв’язків · ${r.warnings.length} попереджень</p><div class="stats">${Object.entries(r.summary).map(([k,v])=>`<div class="stat"><b>${v}</b><span>${esc(k)}</span></div>`).join('')}</div>${r.errors.slice(0,15).map(e=>`<p>${esc(e.code)} · ${esc(e.ref||'')}</p>`).join('')}`:''}</section><p>Експорт приватний: містить SKU постачальників і вихідний архів. Публічний експорт створюється окремо. Перед застосуванням на сайті потрібні підтверджені старі URL та серверна підтримка schema 2.0.</p>`;
}
document.addEventListener('change',async e=>{
 if(e.target.id!=='v2-mapping-file')return;
 try{const f=e.target.files?.[0];if(!f)return;if(f.size>64*1024*1024)throw Error('Mapping перевищує 64 МБ');V2_UI.candidate=JSON.parse(await f.text());V2_UI.report=RubizhContractV2.build(v2Source(),V2_UI.candidate,{previous:S.cfg.model_registry_v2}).report;render();}catch(err){toast(err.message);}finally{e.target.value='';}
});
document.addEventListener('click',async e=>{
 const action=e.target.closest('[data-act]')?.dataset.act;if(!action?.startsWith('v2')||V2_UI.busy)return;
 V2_UI.busy=true;
 try{
  if(action==='v2Source')await v2Download('rubizh-pim-source-v2.json',v2Source());
  if(action==='v2Draft')await v2Download('rubizh-pim-mapping-draft-v2.json',RubizhContractV2.draft(v2Source()));
  if(action==='v2Check')V2_UI.report=RubizhContractV2.build(v2Source(),V2_UI.candidate||S.cfg.model_registry_v2||RubizhContractV2.draft(v2Source()),{previous:S.cfg.model_registry_v2}).report;
  if(action==='v2Apply')await v2Apply(V2_UI.candidate);
  if(action==='v2Report')await v2Download('rubizh-pim-dry-run-v2.json',V2_UI.report);
  if(action==='v2Export'){
   const bundle=v2Bundle();V2_UI.report=bundle.report;
   if(!bundle.report.ready_for_migration)throw Error('Міграцію заблоковано. Перевірте повний звіт.');
   await v2Download('rubizh-pim-models-v2.private.json',bundle);
   await v2Download('rubizh-pim-legacy-mapping-v2.private.json',bundle.legacy_mapping);
   await v2Download('rubizh-pim-public-models-v2.json',RubizhContractV2.publicExport(bundle));
  }
  if(action==='v2Rollback'){
   const b=await Store.get('safety/before_model_v2');if(!b)throw Error('Копію v2 не знайдено');
   // Roll back only the registry; never overwrite prices/imports made since that backup.
   const before=structuredClone(S.cfg);try{for(const key of ['model_schema_version','model_registry_v2']){if(Object.prototype.hasOwnProperty.call(b.cfg,key))S.cfg[key]=structuredClone(b.cfg[key]);else delete S.cfg[key];}S.cfgDirty=true;if(!await persist())throw Error('Відкат не збережено');}catch(err){S.cfg=before;S.cfgDirty=true;await persist();throw err;}
   V2_UI.report=null;V2_UI.candidate=null;bumpData();
  }
  render();
 }catch(err){toast(err.message);render();}finally{V2_UI.busy=false;}
});
// Legacy sync cannot silently flatten the new registry back into PRODUCT cards.
const v2LegacyPublish=sitePublish;
sitePublish=async function(){if(S.cfg.model_schema_version===2){S.cfg.siteSync=S.cfg.siteSync||{};S.cfg.siteSync.lastError='MODEL schema 2.0: використайте перевірений export/batch API, legacy /pim/sync заблоковано.';toast(S.cfg.siteSync.lastError);return null;}return v2LegacyPublish(...arguments);};
const v2LegacyView=vDataModel;
vDataModel=function(){return '<section class="panel"><h2>Нова структура каталогу</h2><button class="btn primary" data-view="modelV2">MODEL → COLOR → SKU · mapping та dry-run</button></section>'+v2LegacyView();};
