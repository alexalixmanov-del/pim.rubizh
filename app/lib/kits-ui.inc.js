// Included in the application before startup. All changes use the existing durable store.
const PIM_KIT_DEFS=[{id:'b1',name:'Базовий літній',note:'Літня форма та спорядження'},{id:'b2',name:'Перша лінія',note:'Бронезахист, убакс та аптечка'},{id:'b3',name:'Холодний сезон',note:'Термошар, фліс та рукавички'}].map(d=>({...d,roles:RubizhKits.SPECS[d.id].roles}));
function pimKitOptions(){return {role:storeRole,eligible:storeKitEligible,palette:storePalette,hasPlates:storeHasPlates,seasonOK:storeSeasonOK,seasons:storeSeasons};}
function pimKitProducts(){return buildFeed().feed.products.map(p=>({...p,path:p.category_path,price:Math.min(...p.variants.map(v=>v.price)),storeReady:true,variants:Object.fromEntries(p.variants.map((v,i)=>[String(i),{...v,published:true}]))}));}
function pimKitDrafts(){return S.cfg.siteKitDrafts||PIM_KIT_DEFS.map(d=>({...d,items:[],palette:'Будь-яка',allowPreorder:true,maxPreorderDays:3}));}
function pimKitCheck(b,products=pimKitProducts()){return RubizhKits.validate(b,products,pimKitOptions());}
function pimKitIssues(b,all=pimKitDrafts(),products=pimKitProducts()){return pimKitCheck(b,products).issues;}
function pimKitSizeOK(p,color=''){return !['ubacs','pants','thermal','fleece','outer'].includes(storeRole(p))||RubizhKits.sizeSet(p,color).length>=3;}
function tzKitStockColors(p,b={}){return [...new Set(RubizhKits.selected(p,'',b).map(v=>v.color||''))];}
function tzBuildKitDrafts(drafts,products){return RubizhKits.plan(drafts,products,pimKitOptions());}
function pimKitPublication(products=pimKitProducts()){
 const ready=[],blocked=[];
 for(const b of S.cfg.siteKitsPublished||[]){const check=pimKitCheck(b,products);if(!check.ok){blocked.push({id:b.id,name:b.name,issues:check.issues});continue;}
 ready.push({id:b.id,name:b.name,note:b.note||'',palette:b.palette||'Будь-яка',items:check.items,availability:check.availability,lead_time_days:check.leadDays,common_sizes:check.commonSizes,common_heights:check.commonHeights,price_min:check.minTotal,price_max:check.maxTotal,validation_version:1});}
 return {ready,blocked};
}
function pimKitPayload(){return S.cfg.siteKitsInitialized?pimKitPublication().ready:null;}
async function pimKitCommit(drafts,extra={}){
 const previous=structuredClone(S.cfg);
 Object.assign(S.cfg,extra,{siteKitDrafts:drafts});S.cfgDirty=true;bumpData();
 try{if(!await persist())throw Error('Не вдалося зберегти комплекти. Перевірте сховище та спробуйте ще раз.');}
 catch(error){S.cfg=previous;S.cfgDirty=true;bumpData();render();throw error;}
 render();
}
const KIT_JOB={busy:false};
function pimKitBusyStart(){if(KIT_JOB.busy){toast('Дочекайтеся завершення збереження комплекту');return false;}KIT_JOB.busy=true;$$('.pim-kit-panel input,.pim-kit-panel select,.pim-kit-panel button').forEach(e=>e.disabled=true);return true;}
async function pimKitAction(t){
 if(!pimKitBusyStart())return;try{
 const action=t.dataset.act,id=t.dataset.kitId,products=pimKitProducts();let drafts=structuredClone(pimKitDrafts()),b=drafts.find(x=>x.id===id),extra={},message='Зміни збережено';
 if(b)S.ui.kitOpen=b.id;
 if(action==='kitAuto'||action==='kitAutoOne'){
  if(drafts.some(x=>(!id||x.id===id)&&!x.locked&&x.items.length)&&!confirm('Перепідібрати незаблоковані чернетки? Затверджений склад збережеться.'))return;
  drafts=drafts.map(x=>id&&x.id!==id?x:tzBuildKitDrafts([x],products)[0]);message='Автопідбір завершено. Перевірте результати та причини блокування.';
 }else if(!b)throw Error('Комплект не знайдено');
 else if(action==='kitAdd'){if(b.items.length>=8)throw Error('У комплекті може бути до 8 товарів');b.items.push({product_id:'',role:'',color:'',quantity:1});}
 else if(action==='kitDrop'){const index=Number(t.dataset.index);if(!Number.isInteger(index)||index<0||index>=b.items.length)throw Error('Позицію не знайдено');b.items.splice(index,1);}
 else if(action==='kitAlternative'){
  const alt=b.alternatives?.[Number(t.dataset.index)];if(!alt)throw Error('Альтернатива більше не доступна');
  Object.assign(b,structuredClone(alt),{alternatives:[]});message='Застосовано альтернативу; перевірки виконано заново';
 }else if(action==='kitLock'){b.locked=!b.locked;message=b.locked?'Ручний склад зафіксовано: автопідбір його пропустить':'Автопідбір дозволено';}
 else if(action==='kitCompatibility'){
  const carrier=products.find(p=>p.id===b.items.find(x=>x.role==='protection')?.product_id),plate=products.find(p=>p.id===b.items.find(x=>x.role==='plate')?.product_id);
  if(!carrier||!plate)throw Error('Спочатку оберіть плитоноску та плити');
  const match=RubizhKits.compatibility(carrier,plate,b);if(!match.unknown)throw Error(match.ok?'Сумісність уже підтверджено':'Відомі розміри несумісні. Оберіть іншу пару.');
  if(!confirm('Підтвердити, що специфікація виробника дозволяє використовувати ці плити з цією плитоноскою?\n'+carrier.name+'\n'+plate.name+'\nПідтвердження скасується після зміни характеристик.'))return;
  b.compatibilityChecks=[{carrierId:carrier.id,plateId:plate.id,carrierSignature:RubizhKits.evidenceSignature(carrier),plateSignature:RubizhKits.evidenceSignature(plate)}];
 }else if(action==='kitIncludedPlates'){
  const carrier=products.find(p=>p.id===b.items.find(x=>x.role==='protection')?.product_id);if(!carrier||!storeHasPlates(carrier))throw Error('Оберіть бронекомплект із плитами');
  if(!confirm('За специфікацією постачальника до «'+carrier.name+'» входять дві бронеплити?'))return;
  b.includedPlateChecks=[{productId:carrier.id,signature:RubizhKits.evidenceSignature(carrier),count:2}];
 }else if(action==='kitApprove'){
  const check=pimKitCheck(b,products);if(!check.ok)throw Error(check.issues.join(' · '));
  await requireBatchBackup('Перед затвердженням комплекту');
  const fresh=pimKitCheck(b);if(!fresh.ok)throw Error('Каталог змінився: '+fresh.issues.join(' · '));
  b.locked=true;extra={siteKitsPublished:[...(S.cfg.siteKitsPublished||[]).filter(x=>x.id!==id),structuredClone(b)],siteKitsInitialized:true};message='Склад затверджено і збережено. Для передачі на сайт відкрийте «Публікація на сайт».';
 }else if(action==='kitHide'){
  if(!confirm('Приховати комплект на сайті під час наступної публікації?'))return;
  extra={siteKitsPublished:(S.cfg.siteKitsPublished||[]).filter(x=>x.id!==id),siteKitsInitialized:true};message='Приховування збережено. Опублікуйте зміни на сайт.';
 }else throw Error('Невідома дія комплекту');
 await pimKitCommit(drafts,extra);toast(message);
 }finally{KIT_JOB.busy=false;render();}
}
async function pimKitChange(t){
 if(!pimKitBusyStart())return;try{
 const drafts=structuredClone(pimKitDrafts()),b=drafts.find(x=>x.id===t.dataset.kitId);if(!b)throw Error('Комплект не знайдено');
 S.ui.kitOpen=b.id;const field=t.dataset.kitField;
 if(field==='allowPreorder')b.allowPreorder=t.value==='yes';
 else if(['name','note','palette','budgetTier'].includes(field))b[field]=t.value;
 else if(['budgetMin','budgetMax','minCommonSizes','maxPreorderDays'].includes(field)){if(t.value.trim()==='')delete b[field];else b[field]=Number(t.value);}
 else{const it=b.items[Number(t.dataset.index)];if(!it)throw Error('Позицію не знайдено');if(field==='quantity')it.quantity=Number(t.value);else if(['product_id','role','color'].includes(field)){it[field]=t.value;if(field==='product_id'){it.color='';it.quantity=1;}}else throw Error('Невідоме поле');}
 b.alternatives=[];delete b.planning;await pimKitCommit(drafts);
 }finally{KIT_JOB.busy=false;render();}
}
function pimKitSummary(){const {ready,blocked}=pimKitPublication();return `<section class="panel"><h2>Комплекти</h2><p>Затверджено та доступно: ${ready.length}. Заблоковано після зміни каталогу: ${blocked.length}.</p>${blocked.map(b=>`<p class="small" style="color:var(--bad)">${esc(b.name)}: ${esc(b.issues.join(' · '))}. На сайт передаватиметься лише повний доступний склад.</p>`).join('')}<button class="btn" data-view="kits">Відкрити конструктор комплектів</button></section>`;}
function vKits(){return `<h1>Комплекти</h1><p class="muted">Підбір → перевірка → затвердження → публікація на сайт. Кожна публікація повторно перевіряє актуальні товари.</p>${pimKitSummary()}${pimKitPanel()}`;}
function pimKitPanel(){
 const products=pimKitProducts(),drafts=pimKitDrafts(),labels=RubizhKits.ROLE_LABELS;
 return `<section class="panel pim-kit-panel"><div class="row"><h2>Конструктор комплектів</h2><button class="btn primary" data-act="kitAuto">Підібрати всі чернетки</button></div><p class="small muted">Потрібні всі обов'язкові ролі, наявність вибраного кольору, спільні розміри та бюджет. Один товар може входити до різних віртуальних комплектів. Остаточне резервування залишку виконує магазин.</p>${drafts.map(b=>{
  const check=pimKitCheck(b,products),spec=RubizhKits.policy(b),kit=`data-kit-id="${esc(b.id)}"`,published=(S.cfg.siteKitsPublished||[]).some(x=>x.id===b.id);
  return `<details class="kit-card" data-kit-open="${esc(b.id)}" ${b.id===(S.ui.kitOpen??'b1')?'open':''}><summary><b>${esc(b.name)}</b> · ${check.ok?'Готовий до затвердження':'Потрібна перевірка'}${b.locked?' · ручний склад':''}${published?' · затверджений':''}</summary>
  ${b.planning?`<p class="small">${esc(b.planning.message)}${b.planning.searchLimited?' Пошук обмежений; можна змінити склад вручну.':''}</p>`:''}
  <div class="grid2"><label class="f">Назва<input maxlength="24" data-kit-field="name" ${kit} value="${esc(b.name)}"></label><label class="f">Підпис<input maxlength="80" data-kit-field="note" ${kit} value="${esc(b.note||'')}"></label></div>
  <div class="grid3"><label class="f">Гамма<select data-kit-field="palette" ${kit}>${['Будь-яка',...RubizhKits.PALETTES].map(c=>`<option ${c===(b.palette||'Будь-яка')?'selected':''}>${c}</option>`).join('')}</select></label><label class="f">Бюджет від, ₴<input type="number" min="0" data-kit-field="budgetMin" ${kit} value="${esc(b.budgetMin??spec?.budget[0]??'')}"></label><label class="f">Бюджет до, ₴<input type="number" min="0" data-kit-field="budgetMax" ${kit} value="${esc(b.budgetMax??spec?.budget[1]??'')}"></label></div>
  <div class="grid2"><label class="f">Наявність<select data-kit-field="allowPreorder" ${kit}><option value="yes" ${b.allowPreorder===true?'selected':''}>В наявності та підтверджене виготовлення</option><option value="no" ${b.allowPreorder===true?'':'selected'}>Тільки в наявності</option></select></label><label class="f">Виготовлення до, днів<input type="number" min="1" max="365" data-kit-field="maxPreorderDays" ${kit} value="${esc(b.maxPreorderDays??3)}"></label></div>
  <label class="f">Рівень товарів<select data-kit-field="budgetTier" ${kit}><option value="">Будь-який</option>${['basic','optimal','premium'].map(t=>`<option value="${t}" ${b.budgetTier===t?'selected':''}>${t}</option>`).join('')}</select></label>
  <label class="f">Мінімум спільних розмірів одягу<input type="number" min="1" max="8" data-kit-field="minCommonSizes" ${kit} value="${esc(b.minCommonSizes??3)}"></label>
  <p class="small">Обов'язковий склад: ${esc((spec?.roles||[]).map(r=>labels[r]).join(' · '))}</p>
  ${b.items.map((it,i)=>{
   const p=products.find(x=>x.id===it.product_id),colors=tzKitStockColors(p,b),a=`${kit} data-index="${i}"`,pool=products.filter(x=>storeKitEligible(x)&&(it.role&&storeRole(x)===it.role||x.id===it.product_id));
   return `<div class="kit-item"><div class="grid3"><label class="f">Роль<select data-kit-field="role" ${a}><option value="">Обрати роль</option>${Object.entries(labels).map(([r,l])=>`<option value="${r}" ${r===it.role?'selected':''}>${l}</option>`).join('')}</select></label><label class="f">Товар<select data-kit-field="product_id" ${a}><option value="">Обрати товар</option>${!p&&it.product_id?`<option value="${esc(it.product_id)}" selected>Недоступний товар: ${esc(it.product_id)}</option>`:''}${pool.map(x=>`<option value="${esc(x.id)}" ${x.id===it.product_id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label class="f">Колір<select data-kit-field="color" ${a}><option value="">Обрати колір</option>${it.color&&!colors.includes(it.color)?`<option selected value="${esc(it.color)}">${esc(it.color)} — немає в наявності</option>`:''}${colors.map(c=>`<option value="${esc(c)}" ${c===it.color?'selected':''}>${esc(c||'Без кольору')}</option>`).join('')}</select></label></div><div class="row"><label class="f">Кількість<input type="number" min="1" max="10" data-kit-field="quantity" ${a} value="${esc(it.quantity??1)}"></label><button class="btn" data-act="kitDrop" ${a}>Прибрати позицію</button></div></div>`;
  }).join('')}
  ${check.issues.length?`<div class="kit-problems" role="status"><b>Що потрібно виправити</b><ul>${check.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:`<p><b>${money(check.minTotal)}–${money(check.maxTotal)}</b> · ${check.leadDays?'Під замовлення до '+check.leadDays+' днів':'В наявності'} · Спільні розміри: ${esc(check.commonSizes.join(', ')||'не потрібні')}</p>`}
  ${check.warnings.map(x=>`<p class="small muted">${esc(x)}</p>`).join('')}
  ${check.issues.some(x=>x.includes('сумісність плитоноски'))?`<button class="btn" data-act="kitCompatibility" ${kit}>Підтвердити сумісність за специфікацією</button>`:''}
  ${check.issues.some(x=>x.includes('дві плити в поставці'))?`<button class="btn" data-act="kitIncludedPlates" ${kit}>Підтвердити дві плити в поставці</button>`:''}
  <div class="row"><button class="btn" data-act="kitAdd" ${kit} ${b.items.length>=8?'disabled':''}>Додати товар</button><button class="btn" data-act="kitLock" ${kit}>${b.locked?'Дозволити автопідбір':'Зафіксувати ручний склад'}</button><button class="btn" data-act="kitAutoOne" ${kit} ${b.locked?'disabled':''}>Перепідібрати цей комплект</button><button class="btn primary" data-act="kitApprove" ${kit} ${check.ok?'':'disabled'}>Затвердити склад</button>${published?`<button class="btn" data-act="kitHide" ${kit}>Приховати на сайті</button>`:''}</div>
  ${(b.alternatives||[]).map((x,i)=>`<button class="btn small" data-act="kitAlternative" ${kit} data-index="${i}">Альтернатива ${i+1}: ${esc(x.palette)}</button>`).join('')}</details>`;
 }).join('')}</section>`;
}

document.addEventListener('toggle',e=>{const id=e.target?.dataset?.kitOpen;if(!id)return;if(e.target.open)S.ui.kitOpen=id;else if(S.ui.kitOpen===id)S.ui.kitOpen='';},true);
