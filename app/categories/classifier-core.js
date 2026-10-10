const VERSION=1;
const RULESET_VERSION=3;
const negativeRules=[
 {id:'assembly_is_not_component',description:'Костюм або комплект одягу визначається як цілий виріб, а не як перелік його складових.'},
 {id:'characteristic_is_not_product',description:'Акумуляторний і термостійкий описують властивості, а не окремі акумулятори чи термоси.'},
 {id:'supplier_list_is_hint',description:'Змішаний розділ постачальника є підказкою; конкретний тип виробу визначається за назвою.'},
 {id:'accessory_is_not_target',description:'Підсумок, сумка, кавер або чохол не є предметом, для якого призначені.'},
 {id:'weapon_magazine_requires_context',description:'Слово «магазин» без збройового контексту не визначає категорію.'},
 {id:'plate_requires_armor_context',description:'Слово «плита» без бронезахисту не визначає бронеплиту.'},
 {id:'material_is_not_product_type',description:'Фліс, soft shell і камуфляж самі по собі не визначають тип виробу.'},
 {id:'ifak_empty_bag',description:'Підсумок або порожня сумка для аптечки не є укомплектованою аптечкою.'},
 {id:'training_is_not_medical_use',description:'Навчальний турнікет належить до навчальних медичних засобів.'},
 {id:'specific_before_generic',description:'Спеціальні призначення мають перевагу над загальним типом того самого виробу.'}
];
const equivalents={балистический:'баллистический',балистичний:'балістичний',берцы:'берці',берци:'берці',куртки:'куртка',брюки:'штани',подсумок:'підсумок',подсумки:'підсумок',підсумки:'підсумок',підсум:'підсумок',рации:'рація',рация:'рація',рацій:'рація',шлем:'шолом',шлема:'шолом',шолома:'шолом',шоломи:'шолом',наушники:'навушники',плитоноски:'плитоноска',бронеплиты:'бронеплита',бронеплити:'бронеплита',флис:'фліс',зимняя:'зимова',зимние:'зимові',мужская:'чоловіча',мужские:'чоловічі',женская:'жіноча',тактические:'тактичні',тактическая:'тактична',сумки:'сумка',маскировочная:'маскувальна',сетка:'сітка',курткаа:'куртка',убакc:'убакс',ubaks:'убакс',kurtka:'куртка',podsumok:'підсумок',plitonoska:'плитоноска',broneplita:'бронеплита',multikam:'multicam',мультикам:'multicam'};
const escape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function normalize(value){let s=String(value??'').normalize('NFKC').toLowerCase().trim().replace(/[’‘`ʼ]/g,"'").replace(/[–—−]/g,'-').replace(/[>→\\]+/g,' / ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/soft[ -]?shell/g,'soft_shell').replace(/\s+/g,' ');s=s.replace(/[\p{L}\p{N}_']+/gu,w=>equivalents[w]||w);return s.replace(/\s*\/\s*/g,' / ').trim();}
const catalogueCache=new WeakMap(),preparedCache=new WeakMap(),pathCache=new WeakMap();
function catalogue(custom){if(!custom?.length)return defaults;if(catalogueCache.has(custom))return catalogueCache.get(custom);const replacements=new Map((custom||[]).map(c=>[c.id,c]));const result=defaults.map(c=>({...c,...(replacements.get(c.id)||{}),id:c.id,parent_id:c.parent_id,aliases:[...new Set([...c.aliases,...(replacements.get(c.id)?.aliases||[])])]}));catalogueCache.set(custom,result);return result;}
function path(id,custom){const cats=catalogue(custom);let cache=pathCache.get(cats);if(!cache){const map=new Map(cats.map(c=>[c.id,c]));cache=new Map(cats.map(c=>[c.id,c.parent_id?map.get(c.parent_id).name+' / '+c.name:c.name]));pathCache.set(cats,cache);}return cache.get(id)||'';}
function leaf(id,custom){return !!catalogue(custom).find(c=>c.id===id&&c.parent_id&&c.deprecated!==true&&c.active!==false);}
// Schema version stays stable: updating rules must not disable a migrated catalog.
function nameParts(value){const text=normalize(value),match=/\s+(?:для|з|із|зі|с|со|with|for|під|под|на|до|без|without)\s+/u.exec(text);return {text,primary:match?text.slice(0,match.index):text,purpose:match?text.slice(match.index).trim():'',components:(text.match(/\([^)]*\)/gu)||[]).filter(s=>/[+]|\bwith\b|\bта\b/u.test(s))};}
const refinements={clothing_suits:['camouflage_suits'],medical_tourniquets:['medical_training'],bags_backpacks:['bags_assault_backpacks','bags_hydration'],bags_tactical:['bags_duffels','bags_waist','bags_shoulder','bags_organizers','pouches_medical','pouches_dump','pouches_dangler'],lighting_handheld:['lighting_headlamps','lighting_tactical'],clothing_headwear:['clothing_balaclavas'],clothing_jackets:['clothing_fleece'],protection_knee:['protection_kits'],protection_elbow:['protection_kits'],medical_bandages:['medical_hemostatic'],pouches_utility:['pouches_panels'],pouches_magazine:['pouches_dump'],tools_other:['tools_multitools']};
// A component -> kit transition is not a whole-item refinement.
const supplierRefinements=Object.fromEntries(Object.entries(refinements).filter(([id])=>!['protection_knee','protection_elbow','pouches_magazine'].includes(id)));
const patterns=new Map();
function aliasPattern(alias){const n=normalize(alias);let re=patterns.get(n);if(!re){const words=n.split(' '),last=words.pop();let stem=last;if(last.length>5&&/^[\p{L}]+$/u.test(last)){stem=last.replace(/(?:ками|ники|ники|ник|ами|ові|ова|ими|их|ки|ка|ки|и|і|а|я|у|ю)$/u,'');if(stem.length<4)stem=last;}const ending=stem!==last||last.length>5&&/^[\p{L}]+$/u.test(last)?'[\\p{L}]*':'';re=new RegExp('(?<![\\p{L}\\p{N}])'+words.map(escape).concat(escape(stem)+ending).join('\\s+')+'(?![\\p{L}\\p{N}])','u');patterns.set(n,re);}return re;}
function preparedCategories(custom){const cats=catalogue(custom);if(preparedCache.has(cats))return preparedCache.get(cats);const result=cats.filter(c=>c.parent_id&&c.deprecated!==true&&c.active!==false).map(c=>({...c,compiled:[...new Set([c.name,...c.aliases])].map(alias=>{const n=normalize(alias),first=n.match(/[\p{L}\p{N}]+/u)?.[0]||'';return {alias,normalized:n,re:aliasPattern(alias),weight:n.length,prefix:first.length>=3?first.slice(0,3):null};})}));preparedCache.set(cats,result);return result;}
function candidates(value,custom,category=false){const text=normalize(value);if(!text)return [];if(category&&text.includes(' / ')){const leafMatches=candidates(text.split(' / ').pop(),custom,true);if(leafMatches.length)return leafMatches;}if(category){const exact=preparedCategories(custom).flatMap(c=>c.compiled.filter(a=>a.normalized===text).map(a=>({id:c.id,alias:a.alias,weight:a.weight})));if(new Set(exact.map(x=>x.id)).size===1)return [exact[0]];}let found=[];const prefixes=new Set((text.match(/[\p{L}\p{N}]+/gu)||[]).map(w=>w.slice(0,3)));for(const c of preparedCategories(custom))for(const a of c.compiled){if((!a.prefix||prefixes.has(a.prefix))&&a.re.test(text))found.push({id:c.id,alias:a.alias,weight:a.weight});}
 const primary=category?text:nameParts(text).primary,bundle=!category&&/^(?:(?:тактичн\S*|бойов\S*|тепл\S*|зимов\S*|флісов\S*|утеплен\S*)\s+)*(?:комплект|комлпект|комлект|набір|набор)(?![\p{L}])/u.test(primary)&&/(?:\+|\sта\s|\sи\s|\sand\s)/u.test(primary),pouch=!bundle&&/підсум|подсум|pouch/u.test(primary),bag=!bundle&&/сумк|рюкзак|bag|backpack/u.test(primary),cover=!bundle&&/кавер|чохол|чехол|футляр|cover|sheath/u.test(primary),mount=!bundle&&/кріплен|креплен|mount|рейк|rails|подушк|padding|адаптер|перехідник|переходник/u.test(primary);
 if(!category&&primary!==text&&!pouch&&!bag&&!cover&&!mount){const main=candidates(primary,custom);if(main.length)found=found.filter(x=>main.some(y=>y.id===x.id));}
 if(!pouch&&!bag&&!cover&&/магазин.*(?:\b(?:ak|ar|hk|glock)\b|ак(?:м|с)?(?:[ -]|$)|збро|оруж|5[.,]45|7[.,]62|5[.,]56)/u.test(text))found.push({id:'weapon_magazines',alias:'магазин + збройовий контекст',weight:40});
 if(mount&&/плитоноск|бронежилет/u.test(text))found.push({id:'armor_accessories',alias:'кріплення для бронезахисту',weight:40});
 if(pouch){const targetText=category?text:text.split(/\s+(?:з|із|зі|с|со|with|без|without)\s+/u)[0];found=found.filter(x=>x.id.startsWith('pouches_')&&(category||aliasPattern(x.alias).test(targetText)));const targets=[['pouches_dump',/dump|(?:скид|сброс|скидан)\S*\s+(?:магазин|магів)|(?:сумк|підсумок|подсумок)\s+(?:скид|сброс)/u],['pouches_medical',/аптеч|медич|медицин|ifak/u],['pouches_tourniquet',/турнікет|турникет|жгут|tourniquet/u],['pouches_radio',/раці|рація|раци|рация|radio/u],['pouches_grenade',/гранат|grenade/u],['pouches_magazine',/магазин|mag pouch|magazine/u],['pouches_phone',/телефон|phone/u],['pouches_other',/навушник|планшет/u]];for(const [id,pattern] of targets)if(pattern.test(targetText))found.push({id,alias:'підсумок + призначення',weight:30});}
 else if(bag){found=found.filter(x=>x.id.startsWith('bags_')||x.id==='pouches_medical'||x.id==='pouches_dump'||x.id==='pouches_dangler'||x.id==='field_sleeping_bags');if(!category&&primary!==text){const own=candidates(primary,custom);if(own.length===1)found=found.filter(x=>!x.id.startsWith('bags_')||x.id===own[0].id);}}
 if(cover)found=found.filter(x=>['helmets_covers','weapon_cases','eye_accessories','tools_accessories','armor_accessories','pouches_other'].includes(x.id)||x.id.startsWith('pouches_'));
 if(mount&&!pouch&&!bag&&!cover)found=found.filter(x=>!['helmets_ballistic','communications_headsets','communications_radios','electronics_monoculars','armor_plate_carriers'].includes(x.id));
 if(text!=='фліс'&&text!=='fleece'&&(!/кофт|худі|худи|флісов\S*\s+куртк|флисов\S*\s+куртк|fleece jacket|флиск/u.test(text)||/підклад|подклад/u.test(text)))found=found.filter(x=>x.id!=='clothing_fleece');
 if(/штани|брюки|pants/u.test(text))found=found.filter(x=>!['clothing_jackets','clothing_fleece','clothing_thermal'].includes(x.id)||x.id==='clothing_thermal'&&/термо/u.test(text));
 if(cover||pouch||bag)found=found.filter(x=>!['armor_plates','armor_plate_carriers','medical_ifak','medical_tourniquets','communications_radios','helmets_ballistic','tools_knives','weapon_magazines'].includes(x.id));
 if(/карабін\S*\s+(?:ак|ar|мислив|зброй)|винтовка|рушниц/u.test(text))found=found.filter(x=>x.id!=='field_carabiners');
 if(/(?:ремінь|ремень|кумербанд|камербанд).*(?:плитоноск|бронежилет)/u.test(text))found=found.filter(x=>x.id==='armor_accessories');
 if(!category){
  const add=(id,alias)=>found.push({id,alias,weight:50}),keep=(ids)=>found=found.filter(x=>ids.includes(x.id));
  if(/плит[аи](?![\p{L}])/u.test(primary)&&/(?:\bnij\b|[1-6](?:-го)?\s+клас)/u.test(primary)&&/кераміч|поліетилен|брон|баліст|захист|\bnij\b/u.test(primary))add('armor_plates','плита + явний контекст бронезахисту');
  // Restrict adjectives only in names; a supplier category still provides context.
  if(!/(?:^|[^\p{L}])(?:акумулятор(?:и|ів|ом|а)?|аккумулятор(?:ы|ов|ом|а)?|батарей(?:ка|ки|ок|ку)|батаре(?:я|ї|и|ю)|batter(?:y|ies))(?![\p{L}])/u.test(primary))found=found.filter(x=>x.id!=='power_batteries');
  if(!/(?:^|[^\p{L}])термос(?:и|ів|ом|а|ы|ов)?(?![\p{L}])/u.test(primary))found=found.filter(x=>x.id!=='field_thermos');
  if(/^(?:(?:тактичн\S*|військов\S*|военн\S*|тепл\S*|зимов\S*|зимн\S*|утеплен\S*|польов\S*|функціональн\S*|бойов\S*|літн\S*|демісезонн\S*)\s+)*(?:костюм|комплект|комлект|набір|набор|set)(?![\p{L}])/u.test(primary)){
   if(/термобілиз|термобель|thermal\s+(?:underwear|suit)/u.test(primary)&&!/(?:кітель|китель|убакс|ubacs|куртк)/u.test(primary)&&!/(?:костюм|suit).*\+/u.test(primary)){add('clothing_thermal','комплект термобілизни');found=found.filter(x=>!x.id.startsWith('clothing_')||x.id==='clothing_thermal');}
   else if(found.some(x=>x.id==='clothing_suits')||/(?:убакс|ubacs|кітель|китель).*(?:\+|\sта\s|\sи\s|\sand\s).*(?:штани|брюки)|(?:штани|брюки).*(?:\+|\sта\s|\sи\s|\sand\s).*(?:убакс|ubacs|кітель|китель)/u.test(primary)){add('clothing_suits','цілий костюм / комплект одягу');found=found.filter(x=>!x.id.startsWith('clothing_')||x.id==='clothing_suits');}
  }
  if(/наколін|наколен|knee/u.test(primary)&&/налокіт|налокот|elbow/u.test(primary)&&/(?:комплект|набір|набор|\+|\sта\s|\sи\s|\sand\s)/u.test(primary)){add('protection_kits','комплект захисту колін і ліктів');keep(['protection_kits']);}
  if(/(?:сумк\S*\s*-\s*органайзер|сумк\S*\s+органайзер)/u.test(primary)){add('bags_organizers','сумка-органайзер');keep(['bags_organizers']);}
  if(/п'ятиточк|пятиточк/u.test(primary))add('field_seats',"п'ятиточка / сидушка");
  if(/(?:каремат|килимок).*(?:сидушка|п'ятиточк|пятиточк)|(?:каремат|килимок).*для\s+сидіння/u.test(text)&&!/каремат.*\+.*сидушк/u.test(text)){add('field_seats','каремат для сидіння');keep(['field_seats']);}
  if(/ремінно[ -]плечов|ременно[ -]плечев/u.test(primary))found=found.filter(x=>x.id!=='load_bearing_harness');
  if(mount&&/монокуляр|пнб|пнв|тепловіз|тепловиз/u.test(text)){add('electronics_mounts','адаптер / кріплення для оптики');keep(['electronics_mounts']);}
  if(cover&&/навушник|наушник/u.test(text)){add('pouches_other','футляр для навушників');keep(['pouches_other']);}
  if(!bundle&&/(?:кейс|чохол|чехол|case)/u.test(primary)&&/збро|оруж|гвинтів|винтов|rifle/u.test(text)){add('weapon_cases','кейс / чохол для зброї');keep(['weapon_cases']);}
  if(/(?:підсум|подсум)/u.test(primary)&&/напашн/u.test(primary)){add('pouches_dangler','напашний підсумок');keep(['pouches_dangler']);}
  if(/панел\S*\s+під\s+(?:\d+|три|два)?\s*магазин/u.test(text)){add('pouches_panels','панель під магазини');keep(['pouches_panels']);}
  if(/(?:ножиці|ножницы).*медич|медич.*ножиці|trauma\s+scissors/u.test(primary)){add('medical_scissors','медичні ножиці');keep(['medical_scissors']);}
  if(/маркер(?![\p{L}])/u.test(primary)&&/турнікет|турникет/u.test(text)){add('medical_other','маркер для турнікета');keep(['medical_other']);}
  if(/^термоковдр|^термоодеял/u.test(primary))keep(['field_thermal_blankets']);
  if(/зарядн\S*.*(?:пристр|устройств)/u.test(primary)&&/раці|радіостанц|радиостанц/u.test(text)){add('communications_accessories','зарядний пристрій для рацій');keep(['communications_accessories']);}
  // An explicit item before a parenthesized target is stronger than that target.
  if(primary.includes('(')&&!bundle&&!pouch&&!bag&&!cover&&!mount){const head=primary.slice(0,primary.indexOf('(')).trim(),main=candidates(head,custom);if(main.length===1&&main[0].id!=='clothing_suits')keep([main[0].id]);}
  if(/^бронежилет(?![\p{L}])/u.test(primary)&&/\+\s*балістичн\S*\s+пакет/u.test(primary)&&!found.some(x=>x.id==='armor_plate_carriers'))keep(['armor_vests']);
 }
 const categoryList=category&&/[,;]|\s(?:та|і|и|and)\s/u.test(text)&&!/(?:^|\s)(?:комплект|набір|набор)\s/u.test(text);
 const present=new Set(found.map(x=>x.id));found=found.filter(x=>!((categoryList||bundle&&x.id!=='clothing_suits') ? [] : refinements[x.id]||[]).some(id=>present.has(id)));
 if(!category&&found.some(x=>x.id==='medical_ifak')&&/порожн|пуст|empty|без\s+(?:наповнен|содержим)|неукомплект/u.test(text)){found=found.filter(x=>x.id!=='medical_ifak');found.push({id:'pouches_medical',alias:'порожня аптечка / медична сумка',weight:40});}
 const best=new Map();for(const x of found)if(!best.has(x.id)||x.weight>best.get(x.id).weight)best.set(x.id,x);
 return [...best.values()].sort((a,b)=>b.weight-a.weight);
}
function attributes(input,id){const s=normalize([input.name,input.supplier_category_raw,input.supplier_category_path_raw,input.supplier_subcategory_raw,Object.values(input.attributes||{}).join(' ')].join(' ')),out={};
 if(/жіноч|женск|women|female/u.test(s))out.gender='female';else if(/чоловіч|мужск|male|men'?s/u.test(s))out.gender='male';else if(/унісекс|унисекс|unisex/u.test(s))out.gender='unisex';
 if(/зимов|зимн|winter/u.test(s))out.season='winter';else if(/літн|летн|summer/u.test(s))out.season='summer';else if(/демісез|демисез|demiseason/u.test(s))out.season='demiseason';
 if(/soft_shell/u.test(s))out.material_type='soft_shell';if(/multicam/u.test(s))out.camouflage='multicam';
 if(id==='armor_plates'||id==='armor_soft'||id==='armor_vests'||id==='armor_sets'){const cls=s.match(/([1-6])\s*(?:клас|класс)/u);if(cls)out.protection_class=Number(cls[1]);}
 if(id==='armor_plates'){const dim=s.match(/(\d{2})\s*[xх×]\s*(\d{2})/u);if(dim)out.size=dim[1]+'x'+dim[2];}return out;
}
function supplierContextAllows(category,name,raw){
 const leafText=normalize(raw).split(' / ').pop();
 if(category.id==='clothing_headwear'&&name.id==='clothing_balaclavas'&&/головні убор|головные убор/u.test(leafText))return true;
 if(category.id==='footwear_tactical_boots'&&name.id.startsWith('footwear_')&&/взуття|обувь/u.test(leafText)&&!/(?:черев|ботин)/u.test(leafText))return true;
 if(category.id==='helmets_ballistic'&&name.id.startsWith('helmets_')&&name.id!=='helmets_ballistic'&&!/баліст|баллист/u.test(leafText))return true;
 if(category.id==='bags_tactical'&&name.id.startsWith('bags_')&&/^(?:тактичні |тактические )?сумк/u.test(leafText))return true;
 if((supplierRefinements[category.id]||[]).includes(name.id))return true;
 if(category.id==='helmets_ballistic'&&!/баліст|баллист/u.test(leafText)&&['eye_glasses','lighting_handheld','lighting_tactical','electronics_action_cameras'].includes(name.id))return true;
 if(category.id==='pouches_medical'&&name.id==='pouches_tourniquet')return true;
 if(category.id==='communications_accessories'&&['communications_antennas','power_batteries'].includes(name.id))return true;
 if(category.id==='communications_radios'&&name.id==='power_batteries')return true;
 if(category.id==='load_bearing_rps'&&name.id==='load_bearing_harness')return true;
 if(category.id==='pouches_magazine'&&name.id==='pouches_panels')return true;
 if(category.id==='armor_plate_carriers'&&name.id==='armor_accessories')return true;
 if(category.id==='field_mats'&&name.id==='field_seats')return true;
 if(category.id==='electronics_mounts'&&name.id==='electronics_accessories'&&/пнб|пнв|тепловіз/u.test(leafText))return true;
 return false;
}
function mixedSupplierGroup(raw,found){const text=normalize(raw).split(' / ').pop(),primary=nameParts(text).primary,exact=preparedCategories().some(c=>c.compiled.some(a=>a.normalized===text));return found.length>0&&!exact&&!/(?:^|\s)(?:комплект|набір|набор|set)\s/u.test(primary)&&/[,;]|\s(?:та|і|и|and)\s/u.test(primary);}
function contextualNameEvidence(value,byName,byCategory){
 const text=normalize(value),primary=nameParts(text).primary;
 // “Ballistic protection” alone does not prove soft armor. Require the supplier's
 // explicit soft-package group and an insert for another item, not a whole vest.
 if(/^балістичн\S*\s+захист/u.test(primary)&&byCategory.some(x=>x.id==='armor_soft')&&/\sдля\s/u.test(text))return [{id:'armor_soft',alias:'балістичний вкладиш + група бронепакетів',weight:50}];
 if(!byName.length&&byCategory.length===1){
  if(byCategory[0].id==='clothing_suits'&&/^(?:(?:бойов\S*|тактичн\S*|зимов\S*)\s+)*(?:комплект|комлект)(?![\p{L}])/u.test(primary))return [{id:'clothing_suits',alias:'комплект + розділ комплектів одягу',weight:40}];
  if(byCategory[0].id==='electronics_mounts'){
   if(/адаптер|кріплен|маунт|міст|перехідник/u.test(primary))return [{id:'electronics_mounts',alias:'кріплення / адаптер + розділ кріплень оптики',weight:40}];
   if(/криш|кришеч|наочник|захисн.*скло|набір аксесуар/u.test(primary))return [{id:'electronics_accessories',alias:'аксесуар + розділ оптики',weight:40}];
  }
 }
 return byName;
}
function explicitProductTypes(input,custom){
 const values=Object.entries(input.attributes||{}).filter(([key])=>/^(тип|вид виробу|вид изделия|тип товару|тип виробу|product type)$/u.test(normalize(key))).map(([,v])=>String(v));
 const description=String(input.description||'').replace(/<br\s*\/?\s*>|<\/p>|<\/li>/giu,'\n').replace(/<[^>]*>/g,' ');
 for(const line of description.split(/[\n;]+/u)){const match=/^\s*(?:тип товару|тип виробу|вид виробу|тип изделия|вид изделия|product type)\s*:\s*(.{1,100})\s*$/iu.exec(line);if(match)values.push(match[1]);}
 return [...new Set(values.flatMap(v=>candidates(v,custom)).map(x=>x.id))];
}
function supplierPath(input,raw){const full=String(input.supplier_category_path_raw||raw||''),sub=String(input.supplier_subcategory_raw||'');return sub&&normalize(full).split(' / ').pop()!==normalize(sub)?[full,sub].filter(Boolean).join(' / '):full;}
function mappingConfidence(m){return m.confidence==null?1:(Number.isFinite(Number(m.confidence))?Number(m.confidence):0);}
function classify(input={},options={}){const custom=options.categories||[],sid=String(input.supplier_id||''),raw=String(input.supplier_category_raw??''),rawPath=supplierPath(input,raw),name=input.normalized_name||input.name||input.original_name||'',mapping=options.mappings||[];
 const result=(id,source,confidence,rule,extra={})=>({canonical_category_id:id||null,category:id?path(id,custom):'',category_source:source,source:source==='manual'?'manual':source==='mapping'?'auto_mapping':source==='attributes'?'auto_attrs':source==='supplier_rule'?'auto_supplier_category':'auto_name',category_confidence:confidence,decision_score:Math.round(confidence*100),ruleset_version:RULESET_VERSION,category_rule_id:rule,category_status:id?'CONFIRMED':'NEEDS_REVIEW',category_review_status:id?'CONFIRMED':'NEEDS_REVIEW',normalized_name:normalize(name),attributes:attributes({...input,name},id),reasons:[],candidates:[],...extra});
 if(input.category_source==='manual'){const id=leaf(input.canonical_category_id,custom)?input.canonical_category_id:leaf(options.manualCategoryId,custom)?options.manualCategoryId:null;return id?result(id,'manual',1,'manual'):result(null,'manual',0,'manual-unmapped',{reasons:['Ручне рішення збережено; старий шлях потребує відповідності.']});}
 for(const mode of ['exact','path']){let matches=mapping.filter(m=>m.supplier_id===sid&&m.confirmed!==false&&leaf(m.canonical_category_id,custom)&&(!m.semantic_type_id||leaf(m.semantic_type_id,custom)&&candidates(name,custom).length===1&&candidates(name,custom)[0].id===m.semantic_type_id)&&(!m.name_must_not_contradict||(()=>{const c=candidates(name,custom);return !c.length||c.some(x=>x.id===m.canonical_category_id);})())&&(mode==='exact'?String(m.supplier_category_raw)===raw&&(!m.supplier_category_path_raw||normalize(m.supplier_category_path_raw)===normalize(rawPath)):normalize(m.supplier_category_path_raw||m.supplier_category_normalized||m.supplier_category_raw)===normalize(rawPath)));if(mode==='exact'&&matches.some(m=>m.supplier_category_path_raw))matches=matches.filter(m=>m.supplier_category_path_raw);if(matches.some(m=>m.semantic_type_id))matches=matches.filter(m=>m.semantic_type_id);const ids=[...new Set(matches.map(m=>m.canonical_category_id))];if(ids.length>1)return result(null,'conflict',Math.max(...matches.map(m=>mappingConfidence(m))),'mapping-conflict',{category_status:'CONFLICT_REVIEW',category_review_status:'CONFLICT_REVIEW',candidates:ids,reasons:['Суперечливі підтверджені відповідності постачальника.']});if(ids.length===1&&mappingConfidence(matches[0])>=0.8)return result(ids[0],'mapping',mappingConfidence(matches[0]),'mapping-'+mode,{mapping_id:matches[0].id});}
 const exact=(options.productRules||[]).filter(r=>r.confirmed===true&&r.supplier_id===sid&&leaf(r.canonical_category_id,custom)&&((r.supplier_sku&&String(r.supplier_sku)===String(input.supplier_sku||''))||(r.supplier_product_id&&String(r.supplier_product_id)===String(input.supplier_product_id||''))));const exactIds=[...new Set(exact.map(r=>r.canonical_category_id))];if(exactIds.length>1)return result(null,'conflict',1,'exact-rule-conflict',{category_status:'CONFLICT_REVIEW',category_review_status:'CONFLICT_REVIEW',candidates:exactIds,reasons:['Суперечливі точні правила артикулу.']});if(exactIds.length===1)return result(exactIds[0],'exact_product_rule',1,'exact-product:'+exact[0].id);
 const byCategory=candidates(rawPath||raw,custom,true),byName=contextualNameEvidence(name,candidates(name,custom),byCategory),strongCat=byCategory.length===1?byCategory[0]:null,strongName=byName.length===1?byName[0]:null;
 if((strongCat?.id==='medical_ifak'||strongName?.id==='medical_ifak')&&/без\s+(?:наповнен|содержим)|порожн\S*\s+(?:аптеч|сумк|підсум)|empty\s+(?:ifak|medical)/u.test(normalize(input.description||'')))return result(null,'conflict',0.7,'empty-ifak-description',{category_status:'CONFLICT_REVIEW',category_review_status:'CONFLICT_REVIEW',candidates:['medical_ifak','pouches_medical'],reasons:['Опис вказує на порожню аптечку; підтвердіть комплектацію.']});
 if(mixedSupplierGroup(rawPath||raw,byCategory)&&strongName)return result(strongName.id,'name',0.96,'mixed-supplier-group-specific-item',{reasons:['Змішаний розділ постачальника є підказкою; назва визначає конкретний виріб.']});
 if(mixedSupplierGroup(rawPath||raw,byCategory)&&!byName.length)return result(null,'unknown',0.5,'mixed-group-no-item',{candidates:byCategory.map(x=>x.id),reasons:['Розділ постачальника змішаний, а назва не визначає тип виробу. Потрібен опис або характеристика «Тип».']});
 const explicitTypes=explicitProductTypes(input,custom);
 if(byName.length>1&&explicitTypes.length===1&&byName.some(x=>x.id===explicitTypes[0])&&(!byCategory.length||byCategory.some(x=>x.id===explicitTypes[0])||mixedSupplierGroup(rawPath||raw,byCategory)))return result(explicitTypes[0],'attributes',0.97,'explicit-type-resolves-name',{reasons:['Характеристика «Тип виробу» уточнює неоднозначну назву; тип присутній у назві й узгоджується з групою постачальника.']});
 if(strongCat&&strongName&&strongCat.id!==strongName.id&&supplierContextAllows(strongCat,strongName,rawPath||raw))return result(strongName.id,'supplier_rule',0.97,'supplier-group-specific-name',{reasons:['Загальна група постачальника уточнена типом виробу в назві.']});
 if(strongCat&&strongName&&strongCat.id!==strongName.id&&(supplierRefinements[strongName.id]||[]).includes(strongCat.id))return result(strongCat.id,'supplier_rule',0.97,'supplier-specific-type',{reasons:['Тип виробу збігається; постачальник уточнює його підтип.']});
 if(strongCat&&strongName&&strongCat.id!==strongName.id)return result(null,'conflict',0.7,'supplier-name-conflict',{category_status:'CONFLICT_REVIEW',category_review_status:'CONFLICT_REVIEW',candidates:[strongCat.id,strongName.id],reasons:[`Категорія постачальника: ${strongCat.id} (${strongCat.alias})`,`Назва: ${strongName.id} (${strongName.alias})`]});
 if(strongName&&mixedSupplierGroup(rawPath||raw,byCategory))return result(strongName.id,'name',0.96,'mixed-supplier-group-specific-item',{reasons:['Змішаний розділ постачальника є підказкою; назва визначає конкретний виріб.']});
 if(byCategory.length>1&&strongName&&byCategory.some(x=>x.id===strongName.id))return result(strongName.id,'supplier_rule',0.97,'context-agreement');
 if(byCategory.length>1||byName.length>1)return result(null,'conflict',0.65,'rules-conflict',{category_status:'CONFLICT_REVIEW',category_review_status:'CONFLICT_REVIEW',candidates:[...new Set([...byCategory,...byName].map(x=>x.id))],reasons:[byName.length>1?'Назва містить кілька самостійних типів виробу. Перевірте конструкцію або склад комплекту.':'Змішаний розділ постачальника; у назві немає однозначного типу виробу. Потрібен опис або характеристика «Тип».']});
 if(strongCat)return result(strongCat.id,'supplier_rule',strongName?0.99:0.96,'supplier-alias:'+strongCat.id);
 if(strongName)return result(strongName.id,'name',0.96,'name-alias:'+strongName.id);
 const byDesc=candidates(input.description||'',custom),attrType=Object.entries(input.attributes||{}).filter(([k])=>/^(тип|вид виробу|вид изделия|тип товару|тип виробу|product type|категорія|категория)$/u.test(normalize(k))).map(([,v])=>v).join(' '),byAttrs=candidates(attrType,custom);const suggestions=byDesc.length?byDesc:byAttrs;
 if(suggestions.length)return result(null,byDesc.length?'description':'attributes',suggestions.length===1?0.75:0.6,'weak-context',{candidates:suggestions.map(x=>x.id),suggested_category_id:suggestions.length===1?suggestions[0].id:null,reasons:['Лише опис або характеристики: підтвердіть тип виробу.']});
 return result(null,'unknown',0,'unrecognized',{reasons:['Не знайдено надійного відповідника; товар зберігається.']});
}
function migrationMapping(paths,options={}){return [...new Set(paths)].sort().map(old=>{const exact=catalogue(options.categories).filter(c=>c.parent_id&&path(c.id,options.categories)===old),d=exact.length===1?{canonical_category_id:exact[0].id,category_confidence:1,category_status:'CONFIRMED'}:classify({name:String(old).split(/\s*\/\s*/).pop(),supplier_category_raw:old},options);return {old_category:old,canonical_category_id:d.canonical_category_id,new_category:d.canonical_category_id?path(d.canonical_category_id,options.categories):null,confidence:d.category_confidence,status:d.category_status,candidates:d.candidates||[]};});}
return {VERSION,RULESET_VERSION,defaults,negativeRules,equivalents,normalize,catalogue,path,leaf,candidates,classify,attributes,migrationMapping,nameParts};
