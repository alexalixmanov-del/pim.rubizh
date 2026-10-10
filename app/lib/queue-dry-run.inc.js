// Offline candidate. Deliberately NOT included in tools/build.cjs or application startup.
// Loaded only by audit/queue-final-dry-run.cjs and isolated regression tests.
const DR_VERSION='queue-evidence-1';
const DR_ORDER=['SAFE_AUTO','LIKELY','AMBIGUOUS'];
function drLocked(p,field){return !!(p.manual_locks?.[field]||p.fieldMeta?.[field]?.source==='manual'||field==='category'&&(p.category_locked||p.category_source==='manual'||p.catSource==='manual'));}
function drResult(tier,reason,extra={}){return {tier,reason,...extra};}
function drText(raw){return norm(ceSourcePlain(raw)).replace(/\s+/g,' ').trim();}
function drSupplierAttrs(p){const m=p.fieldMeta?.attrs;return m?.supplierOriginal||m?.supplierValue||(m?.source==='supplier'?p.attrs:{})||{};}
function drCategory(p){
 if(drLocked(p,'category')||drLocked(p,'canonical_category_id')||drLocked(p,'primary_product_type'))return drResult('AMBIGUOUS','Сохранено ручное решение; автоматическая категория запрещена.');
 if(/^(?:mapping-|exact-product:)/u.test(p.category_rule_id||''))return drResult('AMBIGUOUS','Подтверждённая соответствующая запись поставщика сохранена.');
 const name=drText(p.name),parts=RubizhCategories.nameParts(name),head=parts.primary||name,attrs=drSupplierAttrs(p),source=drText(simpleSource(p));
 // These are anchored item rules, not additions to taxonomy, aliases or supplier mappings.
 // A purpose, included component or adjective alone cannot trigger a rule.
 const rules=[
  ['weapon_other',/^(?:глушник|глушитель|цівка|цевье|газблок|газоблок|запобіжник|кнопка ручного досилача|кришка вікна викиду гільзи|цілик та мушка|патрон \(лазерний\))/u],
  ['clothing_fleece',/^(?:(?:флісова|флисовая|тактична|тактическая|вітрозахисна|чоловіча|графітова|вовняний|тактичний|теплий)\s+)*(?:кофта|толстовка|світшот|светр|свитер)/u],
  ['clothing_suits',/^(?:(?:тактична|військова|военная|тактическая)\s+)*(?:форма)(?:\s|$)|^(?:армійський|тактичний) (?:костюм|комбінезон)/u],
  ['clothing_thermal',/^комплект (?:антибактеріальної )?нижньої білизни/u],
  ['clothing_tshirts',/^термофутболка/u],
  ['clothing_combat_shirts',/^(?:ubacs|убакс)(?:\s|$)/u],
  ['weapon_cleaning',/^набір для (?:чистки|чищення) зброї/u],
  ['footwear_insoles',/^(?:чоловічі )?термоустілки/u],
  ['armor_soft',/^балістичний пакет/u],
  ['armor_sets',/^(?:балістичний )?бронекомплект/u],
  ['armor_accessories',/^(?:балістичний )?захист (?:шиї|плечей|попереку|живота)|^фартух.*балістичн/u],
  ['helmets_padding',/^(?:підвісна система|подушки|комплект м.?яких протиу)/u],
  ['helmets_mounts',/^(?:кріплення.адаптер|адаптер кріплення).*навушник/u],
  ['helmets_accessories',/^велкро липучки|^комплект для шолому/u],
  ['power_accessories',/^перехідник (?:блок живлення|живлення)/u],
  ['bags_shoulder',/^сумка тактична через плече/u],
  ['bags_waist',/^сумка тактична поясна/u],
  ['pouches_utility',/^утилітарний підсумок/u],
  ['pouches_other',/^підсумок мультитул/u],
  ['pouches_dump',/^підсумок (?:неро[зс]?сипайка|нерассыпайка)/u],
  ['pouches_dangler',/^підсумок під захист живота/u],
  ['field_mats',/^п.?ятиточковий чотирьохсекційний каремат/u],
  ['field_hygiene',/^нейтралізатор запаху/u],
  ['electronics_accessories',/^чохол для екшн.камери/u],
  ['load_bearing_belts',/^розвантажувальний пояс|^ремінь розвантажувальний/u],
  ['load_bearing_rps',/^розвантажувальна система/u]
 ];
 let id=rules.find(([,re])=>re.test(name))?.[0];
 if(!id){const c=RubizhCategories.candidates(head);if(c.length===1)id=c[0].id;}
 if(id&&!RubizhCategories.leaf(id))id=null;
 if(id){
  const typeEntries=Object.entries(attrs).filter(([k])=>/^(тип|вид виробу|вид изделия|тип виробу|product type)$/u.test(norm(k)));
  const explicit=uniq(typeEntries.flatMap(([,v])=>RubizhCategories.candidates(String(v)).map(c=>c.id)));
  const protectedConflict=explicit.length===1&&explicit[0]!==id;
  const original=drText(p.fieldMeta?.name?.supplierOriginal||p.fieldMeta?.name?.supplierValue||p.original_name||p.source_name_raw||'');
  const provenance=!!original&&(original===name||drText(mcClean(original,p))===drText(mcClean(name,p)));
  const accessory=/^захист |^балістичний захист |^фартух/u.test(name);
  // Protective covers, bare inserts and assembled protection modules are different items.
  if(accessory){if(provenance&&/(?:чохол|чехол)\s*\+\s*балістичний пакет/u.test(source)&&/комплект|модуль/u.test(source.slice(0,240)))return drResult('SAFE_AUTO','Источник прямо описывает готовый модуль: чехол + пакет, а не отдельный вкладыш/плитоноску.',{category:id});return drResult('LIKELY','Защита отдельной области тела; нужно подтвердить готовый модуль, чехол или мягкий вкладыш.',{category:id});}
  if(/^бронекомплект|^балістичний бронекомплект/u.test(name))return drResult('LIKELY','Набор защиты: подтвердить состав и тип комплекта без категории отдельной детали.',{category:id});
  if(protectedConflict)return drResult('LIKELY','Название изделия и явное поле поставщика «Тип» различаются.',{category:id,source_type:explicit});
  if(provenance&&(source.length>=40||typeEntries.length))return drResult('SAFE_AUTO','Само изделие определено заголовком поставщика; описание/тип даёт независимый контекст. Детали и назначение исключены.',{category:id});
  return drResult('LIKELY','Название указывает тип, но независимое подтверждение поставщика ограничено.',{category:id});
 }
 if(/^(?:одноточковий|двоточковий|трьохточковий|ремінь (?:одноточковий|двоточковий|трьохточковий))/u.test(name)&&/збро|оруж|автомат|карабін|карабин/u.test(source))return drResult('SAFE_AUTO','Ремень и прямое назначение для оружия подтверждены поставщиком.',{category:'weapon_slings'});
 if(/^ремінь/u.test(name)&&/брюк|штани|штанів|штанями/u.test(source)&&!/збро|оруж|рпс/u.test(source))return drResult('SAFE_AUTO','Ремень одежды: поставщик прямо указывает брюки, а не оружие/РПС.',{category:'clothing_belts'});
 if(/^(?:комплект|комлпект).*шолом/u.test(name))return drResult('LIKELY','Полный комплект на базе шлема; согласовать основную категорию комплекта один раз.',{category:'helmets_ballistic'});
 if(/^(?:бойова|тактична) футболка.*(?:ubacs|убакс|убакc)/u.test(name))return drResult('LIKELY','Гибрид футболки и UBACS: одно решение о типе изделия для семейства.',{category:'clothing_combat_shirts'});
 if(/^ножиці/u.test(name)&&/медичн|травм|першої допомоги|первой помощи/u.test(source))return drResult('SAFE_AUTO','Ножницы для медицинской помощи подтверждены описанием назначения.',{category:'medical_scissors'});
 if(/^бронежилет/u.test(name))return drResult('LIKELY','Нужно отличить бронежилет с защитой от пустой плитоноски по комплектности.',{category:'armor_vests'});
 if(/^(?:баул|сумка.рюкзак)/u.test(name))return drResult('LIKELY','Универсальная сумка/рюкзак: подтвердить основной способ ношения.',{category:'bags_duffels'});
 return drResult('AMBIGUOUS','Нет однозначного типа в действующей taxonomy или недостаточно данных; справочник не расширялся.',{candidates:p.category_candidates||[]});
}
function drRequiredType(p){
 const id=p.canonical_category_id||p.last_confirmed_category_id;
 if(['clothing_balaclavas','clothing_headwear','footwear_gaiters','clothing_belts'].includes(id))return 'accessory';
 if(id==='footwear_insoles')return 'insoles';
 if(id==='helmets_covers')return 'helmet';
 return RubizhModel.type(id,p.name)||p.primary_product_type;
}
function drSpecificSize(p,v){
 const type=drRequiredType(p);let old=simpleSize(p,v);
 if(drLocked(p,'size')||v.manualFields?.size)return old.size_unconfirmed?drResult('AMBIGUOUS','Ручной размер сохранён, но его система не подтверждена.') : drResult('SAFE_AUTO','Ручной размер сохранён.',{size:old});
 if(type==='accessory')return drResult('SAFE_AUTO','Это аксессуар без обязательной размерной сетки; размер не придумывается.',{size:{...old,size_unconfirmed:false,required:false}});
 const offers=Object.values(v.offers||{}),raw=String(v.size_raw||v.native_size||offers.find(o=>o.native_size)?.native_size||v.size||'').trim(),normalized=drText(raw).replace(/\s+/g,'');
 old=RubizhModel.size(raw,type,{universalConfirmed:v.size_universal_confirmed===true});
 if(['socks','plate_carrier','armor_vest','battle_belt'].includes(type)&&!raw)old.size_unconfirmed=true;
 if(type==='insoles'&&!raw)old.size_unconfirmed=true;
 if(!old.size_unconfirmed)return drResult('SAFE_AUTO','Размер уже подтверждён.',{size:old});
 const out=(system,value,extra={})=>drResult('SAFE_AUTO','Разобран явно заданный размер без пересчёта между стандартами.',{size:{...old,size_raw:raw,size_display:raw,size_normalized:value,size_system:system,size_unconfirmed:false,...extra}});
 if(raw&&/^(?:clothing|combat_shirt|pants|jacket|fleece|base_layer)$/u.test(type||'')){
  let m=normalized.match(/^(\d{2}(?:-\d{2})?)\(?([2-6]?xl|xs|s|m|l)\)?(long|regular|short)$/iu);if(m)return out('supplier_combined',raw,{size_alpha:m[2].toUpperCase(),size_fit:m[3].toLowerCase()});
  m=normalized.match(/^(\d{2})\(([1-8](?:-[1-8])?)зріст\)$/u);if(m)return out('supplier_numeric_height',raw,{size_height:m[2]});
  m=normalized.match(/^([2-6]?xl|xs|s|m|l)\/(r|l|s)\((\d{2})\/(\d{3})\)$/iu);if(m)return out('supplier_combined',raw,{size_alpha:m[1].toUpperCase(),size_fit:m[2],size_height:m[4]});
  if(/^(?:дитяч|детск)/u.test(drText(p.name))&&/^(?:[6-9]\d|1[0-6]\d)см$/u.test(normalized))return out('child_height_cm',normalized);
 }
 if(type==='helmet'&&/^(?:m|l|xl)\/?\(?\d{2}-\d{2}(?:см)?\)?$/iu.test(normalized))return out('helmet_alpha_cm',raw);
 if(['boots','shoes','insoles'].includes(type)&&/^\d{2}[\/-]\d{2}$/u.test(normalized)){const n=normalized.split(/[\/-]/u).map(Number);if(n[0]>=20&&n[1]<=55&&n[1]>n[0]&&n[1]-n[0]<=5)return out('EU_range',normalized.replace('/','-'));}
 // Never use a catalogue-wide size range or a grid as the size of this SKU.
 const scoped=offers.map(o=>o.source_description).filter(Boolean),single=(p.variants||[]).length===1;
 if(single)scoped.push(simpleSource(p));
 const explicitAttrs=offers.map(o=>o.source_attributes||{});if(single)explicitAttrs.push(drSupplierAttrs(p));
 const universal=explicitAttrs.some(a=>Object.entries(a).some(([k,val])=>/^(розмір|размер|size|розмір одягу)$/u.test(norm(k))&&/^(універсальн|универсальн|one size|os$)/iu.test(String(val))))||scoped.some(s=>/(?:розмір|размер)\s*[:—-]\s*(?:універсальн|универсальн)/iu.test(ceSourcePlain(s))||type==='plate_carrier'&&/(?:модель|плитоноск)\S*[^.]{0,45}універсальн\S*\s+розмір/iu.test(ceSourcePlain(s)));
 if(universal&&!['boots','shoes','insoles','helmet'].includes(type))return drResult('SAFE_AUTO','Универсальный размер прямо указан для этого SKU/единственного варианта.',{size:{...RubizhModel.size('One Size',type,{universalConfirmed:true}),size_raw:raw,size_source:'supplier_explicit'}});
 return drResult('AMBIGUOUS',raw?'Размер записан, но его смысл/диапазон нельзя безопасно определить.':'SIZE_CONFIRMATION_REQUIRED: у конкретного SKU нет размера; общая сетка не доказательство.',{sku:v.sku,raw,status:'SIZE_CONFIRMATION_REQUIRED'});
}
function drSize(p,v){
 const type=drRequiredType(p),required=['combat_shirt','pants','jacket','fleece','base_layer','clothing','boots','shoes','gloves','helmet','insoles','socks','plate_carrier','armor_vest','battle_belt'].includes(type),fallback=drSpecificSize(p,v);
 const result=RubizhSizeEvidence.resolve({type,required,variant:v,product:{name:p.fieldMeta?.name?.supplierValue||p.original_name||p.name,description:simpleSource(p),supplier_attributes:drSupplierAttrs(p),variants:p.variants,size_system:p.confirmed_size_system},offers:Object.entries(v.offers||{}).map(([sid,o])=>({...o,sid})),rules:S.cfg.confirmed_supplier_size_rules||[],fallback});
 if(drLocked(p,'size')||v.manualFields?.size)return {...fallback,size_status:result.status,size_evidence:result};
 if(result.confidence!=='SAFE_AUTO')return drResult(result.confidence,result.reason||fallback.reason,{sku:v.sku,status:result.status,size_evidence:result});
 if(['SIZE_RANGE','SIZE_LIST'].includes(result.status))return drResult('SAFE_AUTO','Ассортимент размеров модели определён; SKU/stock остаются неподтверждёнными.',{size:{...simpleSize(p,v),size_unconfirmed:true},size_status:result.status,sku_status:'SIZE_CONFIRMATION_REQUIRED',size_evidence:result});
 const size=result.status==='NO_SIZE_REQUIRED'?{...simpleSize(p,v),size_unconfirmed:false,required:false}:fallback.tier==='SAFE_AUTO'&&fallback.size?.size_normalized!=null?fallback.size:{...RubizhModel.size(String(result.value),type,{universalConfirmed:result.status==='ONE_SIZE'}),size_raw:result.raw||'',size_display:result.raw||String(result.value),size_normalized:result.value,size_unconfirmed:false};
 return drResult('SAFE_AUTO',result.status==='NO_SIZE_REQUIRED'?'Размер для этого типа изделия не требуется.':'Конкретный размер SKU/One Size подтверждён явным полем источника.',{size,size_status:result.status,size_evidence:result});
}
function drColor(p,v,raw){
 if(v.manualFields?.color||drLocked(p,'color'))return drResult('AMBIGUOUS','Ручной цвет сохранён.');
 const label=norm(raw),attrs=drSupplierAttrs(p),patterns=Object.entries(attrs).filter(([k])=>/візерунк|узор|принт|camouflage/u.test(norm(k))).map(([,val])=>String(val));
 if(label==='сырий')return drResult('LIKELY','Похоже на опечатку «Сірий», но независимого подтверждения нет.',{color:'Сірий'});
 if(label==='карбон')return drResult('AMBIGUOUS','Карбон — материал/отделка; конкретный цвет из него не следует.');
 if(label==='різні кольори')return drResult('AMBIGUOUS','Ассортимент цветов без привязки к SKU; нельзя обещать покупателю конкретный цвет.');
 if(label==='камуфляж'){
  const pal=RubizhModel.palette(patterns.join(' ')),singleColor=uniq(p.variants.map(x=>norm(x.color))).length===1;
  if(singleColor&&pal.camouflage&&!pal.unknown.length)return drResult('SAFE_AUTO','Единственный цвет модели и отдельное поле рисунка поставщика согласованы.',{camouflage:pal.camouflage,color:null});
  return drResult('AMBIGUOUS','Камуфляж без однозначного рисунка этого SKU; общий рисунок модели не переносится на разные цвета.');
 }
 if(['листя','очерет','скеля','біла клякса','чорний камуфляж','пісочний камуфляж'].includes(label))return drResult('SAFE_AUTO','Сохранён буквальный рисунок поставщика; новый словарь/alias не создаётся.',{camouflage:raw,color:label==='чорний камуфляж'?'Чорний':label==='пісочний камуфляж'?'Пісочний':null});
 if(label==='різнокольоровий')return drResult('SAFE_AUTO','Сохранено буквальное обозначение поставщика без выбора выдуманного оттенка.',{color:raw,camouflage:null});
 return drResult('AMBIGUOUS','Недостаточно сведений о цвете конкретного SKU.');
}
function drModel(products){
 if(products.some(p=>p.manual_locks?.model_name||p.manual_locks?.model_grouping||p.manual_locks?.marketing_name_uk)&&uniq(products.map(p=>p.model_name||p.marketing_name_uk||p.name)).length>1)return drResult('AMBIGUOUS','Ручные названия/границы моделей различаются; объединение запрещено.');
 const reasons=mcReasons(products);if(reasons.length)return drResult('AMBIGUOUS',reasons.join('; '));
 const identity=mcIdentity(products[0]),texts=products.map(p=>drText(mcClean(simpleSource(p),p))),exact=texts[0].length>=200&&texts.every(t=>t===texts[0]);
 const codes=identity.codes;
 if(codes.length===1&&products.every(p=>mcIdentity(p).codes[0]===codes[0]))return drResult('SAFE_AUTO','Общий явный код модели и проверка всех защищённых полей.');
 const anchor=/(?:gen\.?\s*\d|mod\.?\s*\d|m-pact|m32|warrior spirit|\bpatriot\b|кайман|t-pads|tactic city|\bgu\b|\bth[oо]r\b|бруклін|summer fs)/iu.test(identity.name);
 const mechanical=/^антидронова сітка/u.test(norm(identity.name))&&(identity.name.match(/\d+(?:[.,]\d+)?/g)||[]).length>=4;
 if(exact&&(anchor||mechanical))return drResult('SAFE_AUTO','Модель/спецификация изделия и полный источник совпадают; цвет/размер различаются, конфликтов SKU/характеристик/связей нет.');
 if(exact||anchor||mechanical)return drResult('LIKELY','Название и часть признаков согласованы; нет общего кода/полного независимого подтверждения модели.');
 return drResult('AMBIGUOUS','Совпадает общее название; данных для объединения моделей недостаточно.');
}
function drWorst(rows){return DR_ORDER[Math.max(...rows.map(r=>DR_ORDER.indexOf(r.tier)))];}
function drPlan(tasks){return {version:DR_VERSION,signature:simpleFingerprint(),rows:tasks.map(t=>{
 const products=t.ids.map(id=>S.products.get(id));let d;
 if(t.kind==='category')d=drCategory(products[0]);
 else if(t.kind==='size'){const details=products[0].variants.filter(v=>simpleSize(products[0],v).size_unconfirmed).map(v=>({sku:v.sku,...drSize(products[0],v)}));d={tier:drWorst(details),reason:details.every(x=>x.tier==='SAFE_AUTO')?'Все обязательные размеры восстановлены по явным данным.':'Нужны размеры конкретных SKU, а не общий диапазон модели.',details};}
 else if(t.kind==='color'){const details=products.flatMap(p=>p.variants.filter(v=>simplePalette(v).unknown.includes(t.raw)).map(v=>({id:p.id,sku:v.sku,...drColor(p,v,t.raw)})));d={tier:drWorst(details),reason:'Группа общего обозначения; решения рассчитаны отдельно для каждого SKU.',details};}
 else if(t.kind==='model')d=drModel(products);
 else d=drResult('LIKELY','53 варианта — технический лимит 50, а не доказательство разных моделей. Нужна проверка/согласование лимита без потери вариантов.');
 return {key:t.key,kind:t.kind,ids:t.ids,name:t.raw||t.detail,...d};
 })};}
function drAvailability(o){
 const historical=typeof _DR_ISOLATED_AUDIT!=='undefined'&&_DR_ISOLATED_AUDIT===true&&typeof _DR_USE_HISTORICAL_STOCK!=='undefined'&&_DR_USE_HISTORICAL_STOCK===true;
 if(o?.stock_stale&&!historical)return {status:'STOCK_CONFIRMATION_REQUIRED',preorder:false,lead_time_days:null};
 if(!o||o.missing||o.discontinued||o.invalid_stock||typeof o.stock==='number'&&o.stock<0)return {status:'UNAVAILABLE',preorder:false,lead_time_days:null};
 if(o.availability==='in'&&(o.stock==null||typeof o.stock==='number'&&o.stock>0))return {status:'IN_STOCK',preorder:false,lead_time_days:null};
 const confirmed=o.preorder===true&&o.preorderManual!==true&&(o.preorder_source_confirmed===true||o.availability==='order');
 if(!confirmed)return {status:'UNAVAILABLE',preorder:false,lead_time_days:null};
 const raw=o.leadDays??o.preorderDays??o.lead_time_days??o.leadTime,days=Number(raw);
 return {status:'PREORDER',preorder:true,lead_time_days:raw!=null&&raw!==''&&Number.isFinite(days)&&days>0&&days<=365?days:null};
}
function drContent(p){
 const source=simpleDescription(p);if(simpleMeaningful(source,p.name))return {description:source,source:'existing_supplier_facts',facts:[],archive:false};
 if(drLocked(p,'desc'))return {description:'',source:'manual_lock',facts:[],archive:false};
 const facts=Object.entries(drSupplierAttrs(p)).filter(([k,v])=>/^(?:матеріал|материал|склад|состав|тип тканини|об.?єм|объем|вага|вес|довжина|длина|ширина|висота|высота|габарити|габариты|країна виробник|страна производитель|клас захисту|класс защиты|система кріплення|сезон|кількість кишень|количество карманов)$/iu.test(k)&&ceValue(v));
 return {description:facts.map(([k,v])=>'<p>'+htmlSafeText(k)+': '+htmlSafeText(ceValue(v))+'</p>').join(''),source:facts.length?'supplier_attributes':'CONTENT_CONFIRMATION_REQUIRED',facts:facts.map(([key,value])=>({key,value:ceValue(value),source:'fieldMeta.attrs.supplierValue'})),archive:false};
}
function drPhotos(p){
 const raw=uniq([...(p.photos||[]),...(p.variants||[]).flatMap(v=>[...(v.photos||[]),...Object.values(v.offers||{}).flatMap(o=>o.photos||[])])]);
 const status=url=>p.photoMeta?.[url]?.status||p.photoMeta?.[url]?.state;
 const valid=raw.filter(url=>{try{return ['https:','http:'].includes(new URL(url).protocol)&&!['failed','deleted','broken','unusable'].includes(status(url))&&!/(?:^|\/)(?:no[-_]image|placeholder|no[-_]photo)(?:[.\/]|$)/iu.test(new URL(url).pathname);}catch{return false;}});
 return {urls:valid,zero:valid.length===0,verified:valid.filter(url=>['usable','verified','ok'].includes(status(url))).length,unverified:valid.filter(url=>!['usable','verified','ok'].includes(status(url))).length};
}
function drPublication(p){
 const photos=drPhotos(p),content=drContent(p),category=categoryPublicationProduct(p),normalizedModel=RubizhModel.normalized(p),rows=p.variants.map(v=>{const size=drSize(p,v),c=calc(p,v),availability=drAvailability(c.o||c.ref),exact=size.tier==='SAFE_AUTO'&&!size.sku_status;return {sku:v.sku,availability,size_status:exact?'CONFIRMED':'SIZE_CONFIRMATION_REQUIRED',eligible:exact&&['IN_STOCK','PREORDER'].includes(availability.status)&&c.price>0&&!modelVariant(p,v,normalizedModel).margin_blocked};});
 const reasons=[...(photos.zero?['NO_USABLE_PHOTOS']:photos.verified===0?['PHOTO_VERIFICATION_REQUIRED']:[]),...(!content.description?['CONTENT_CONFIRMATION_REQUIRED']:[]),...(!category?.canonical_category_id?['CATEGORY_CONFIRMATION_REQUIRED']:[]),...(!rows.some(r=>r.eligible)?[rows.some(r=>r.size_status==='SIZE_CONFIRMATION_REQUIRED')?'SIZE_CONFIRMATION_REQUIRED':'AVAILABILITY_OR_PRICE_REQUIRED']:[])];
 return {id:p.id,archive:photos.zero,description:content,photos,variants:rows,reasons,publish:!reasons.length&&!p.archived&&simpleAllowed(p)&&!siteBlocked(p)};
}
function drProcessContent(){
 if(typeof _DR_ISOLATED_AUDIT==='undefined'||_DR_ISOLATED_AUDIT!==true)throw Error('Isolated audit required.');
 const result={archived_photo:0,restored_description:0,descriptions_from_attributes:0,content_exceptions:0};
 for(const p of S.products.values()){
  if(p.merged_into)continue;
  const photos=drPhotos(p),content=drContent(p);
  if(content.source==='supplier_attributes'){p.dry_run_description=content;result.descriptions_from_attributes++;}
  if(photos.zero&&!p.archived){p.dry_run_archive_previous={pub:p.pub,archived:p.archived};p.archivePrevPub=p.pub;p.pub=false;p.archived=true;p.archiveReason='DR: NO_USABLE_PHOTOS';result.archived_photo++;}
  else if(!photos.zero&&p.simple_excluded_reason&&p.archiveReason===p.simple_excluded_reason&&p.archiveReason.includes('description')){p.dry_run_archive_previous={pub:p.pub,archived:p.archived,reason:p.archiveReason};p.archived=false;p.pub=false;p.archiveReason='';delete p.simple_excluded_reason;result.restored_description++;}
  if(!p.archived&&!content.description)result.content_exceptions++;
 }
 rebuildIndex();bumpData();return result;
}
function drApplySafe(plan){
 if(typeof _DR_ISOLATED_AUDIT==='undefined'||_DR_ISOLATED_AUDIT!==true)throw Error('Dry-run mutations are permitted only in the isolated audit, never production.');
 if(plan.signature!==simpleFingerprint())throw Error('Baseline changed; rerun the dry-run.');
 const changes={categories:0,sizes:0,colors:0,models:0,model_cards:0};
 for(const row of plan.rows){
  if(row.kind==='category'&&row.tier==='SAFE_AUTO'){
   const p=S.products.get(row.ids[0]);if(drLocked(p,'category'))throw Error('Category lock changed.');
   p.dry_run_original_category={category:p.category,canonical_category_id:p.canonical_category_id,last_confirmed_category_id:p.last_confirmed_category_id};
   const d={canonical_category_id:row.category,category:canonicalPath(row.category),category_source:'name',source:'auto_name',category_confidence:0.97,category_status:'CONFIRMED',category_review_status:'CONFIRMED',category_rule_id:DR_VERSION,reasons:[row.reason],candidates:[],attributes:p.canonical_attributes||{}};
   categoryApplyDecision(p,d);p.primary_product_type=RubizhModel.type(row.category,p.name);changes.categories++;
  }
  // Partial SAFE_AUTO resolutions are permitted within a mixed task; its overall tier stays conservative.
  for(const detail of row.details||[]){if(detail.tier!=='SAFE_AUTO')continue;const p=S.products.get(detail.id||row.ids[0]),v=p.variants.find(v=>v.sku===detail.sku);if(!v)throw Error('Missing SKU.');
   if(row.kind==='size'){v.dry_run_size={...detail.size,status:detail.size_status,evidence:detail.size_evidence||detail.reason};changes.sizes++;}
   if(row.kind==='color'){v.dry_run_color={color:detail.color,camouflage:detail.camouflage,raw:row.name,evidence:detail.reason};changes.colors++;}
  }
 }
 rebuildIndex();bumpData();
 for(const row of plan.rows.filter(r=>r.kind==='model'&&r.tier==='SAFE_AUTO')){const result=mcMergeGroup({ids:row.ids,name:mcIdentity(S.products.get(row.ids[0])).name,automatic:true});changes.models++;changes.model_cards+=result.merged_ids.length;}
 rebuildIndex();bumpData();return changes;
}
