'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('./category-reasons.cjs');
const tax=JSON.parse(fs.readFileSync(path.join(__dirname,'../category-gaps-dry-run-2026-10-08/taxonomy-before.json'),'utf8')).categories;
const item=(name,description,extra={})=>({id:'fixture',name,description,sources:[{supplier_id:'s-a',supplier_name:'A',supplier_category_raw:'mixed',original_name:name}],...extra});
const resolve=(p,t=tax,c={})=>R.resolve(p,t,c);
function deepFreeze(o){for(const v of Object.values(o))if(v&&typeof v==='object')deepFreeze(v);return Object.freeze(o);}
const tests=[
 ['grenade model words cannot turn a grenade pouch into magazine pouch','Підсумок під 2 гранати KIBORG GU Double Mag Pouch','Підсумок призначений для двох гранат. Клапани фіксують гранати.','pouches_grenade'],
 ['pouch purpose is not the item','Підсумок під пляшку','Фіксація на MOLLE, тримає пляшку.','pouches_other'],
 ['scope case is not an optical sight','Чохол підсумок для оптичного прицілу','Чохол захистить прилад від пилу.','pouches_other'],
 ['toiletry pouch is not hygiene consumable','Підсумок тактичний для гігієни (несесер) WS','Матеріал Cordura 1000D. Бокові кармани.','pouches_other'],
 ['utility pouch can carry a phone without becoming phone pouch','Підсумок утилітарний горизонтальний NAVIGARA','Для зберігання і транспортування документів, телефонів та речей.','pouches_utility'],
 ['rigid phone mount is not a soft pouch','Кріплення для смартфона MOLLE, відкидний холдер','Корпус з ударостійкого ABS-пластику, силіконові ремінці.','electronics_mounts'],
 ['battery charger is not autonomous power station','Зарядний пристрій YX DJI','Пристрій для заряджання акумуляторів.','power_accessories'],
 ['war belt is not ordinary waist belt','Тактичний ремінь War Belt M-WIN','Складається з внутрішнього та зовнішнього ременя.','load_bearing_belts'],
 ['MOLLE construction outranks waist dimension','Ремінь тактичний ANTITERROR','Об\'єм талії до 130 см. Система MOLLE по всій довжині ременя для кріплення подсумків.','load_bearing_belts'],
 ['waist belt evidence is explicit','Ремінь тактичний 4 см','Об\'єм талії до 130 см.','clothing_belts'],
 ['buffer tube is a component, not full buttstock','Комплект буферної трубки AR15','Компоненти для AR15: трубка, буфер, пружина.','weapon_other'],
 ['charging handle is not support hand grip','Рукоятка зведення AR15','Двосторонній компонент AR15 для заряджання.','weapon_other'],
 ['weapon retainer is not whole sling','Магнітний фіксатор для зброї MAG-R','Фіксує зброю магнітом.','weapon_other'],
 ['THOR attachment that really is a full sling','Додаткове кріплення-ремінь THOR-5','Двоточковий ремінь для носіння зброї.','weapon_slings'],
 ['field vessel is not a hydration reservoir','Фляга V-1л','Матеріал фляги: алюміній. Комплектація: фляга, ремінь.','field_cookware'],
 ['textile skull mask is not ballistic face protection','Маска з черепом Ghost','Еластична балаклава з бавовни.','clothing_balaclavas'],
 ['rollneck classification does not invent fleece material','Базовий тактичний гольф','Гольф (водолазка), виготовлений з бавовняної тканини.','clothing_fleece'],
 ['survival assortment is not the included knife','Набір для виживання','Комплект для допомоги в походах і на природі. Ніж, компас, ліхтар.','field_other'],
 ['field cartridge is not a burner','Балон газовий Adimanti','Картридж для роботи в полевых условиях, сумісний з пальником.','field_other'],
 ['chemically heated foot warmer is not an insole size model','Грілки для ніг TakeHot','Хімічна грілка виділяє тепло.','field_other'],
 ['completed armored bag remains a bag','Комплект сумка-напашник M + захист','Функціональна сумка-напашник з вбудованим захистом.','pouches_dangler'],
 ['two complete armor modules are not an isolated pouch','Комплект захисту живота та паху','Комплект складається з двох тактичних підсумків та двох балістичних пакетів.','armor_sets'],
 ['electronic in-ear hearing devices fit existing headphones','Активні беруші EARMOR','Електронні беруші з Bluetooth для аудіо.','communications_headsets'],
 ['generic outdoor compass need not trigger taxonomy expansion','Компас рідинний','Дозволяє визначити напрям та азимут.','field_other']
];
for(const [name,title,desc,id] of tests)test(name,()=>{const r=resolve(item(title,desc));assert.equal(r.category,id);assert.equal(r.tier,'SAFE_AUTO');assert.equal(r.partition,'EXISTING_CATEGORY_AMBIGUOUS');});
for(const [name,id,description] of [
 ['Бронековдра Kiborg','armor_ballistic_blankets','Самостійна ковдра з балістичним захистом.'],
 ['Жилетка утеплена','clothing_insulated_vests','Утеплений жилет безрукавка із синтепоном.'],
 ['Водовідштовхуючий спрей Nasse Blocker','footwear_care','Спрей для догляду за взуттям.'],
 ['Чоловічі замшеві лофери','footwear_shoes','Лофери із замші, легка підошва.'],
 ['Беруші багаторазові','communications_earplugs','Блокують небажаний шум, вставити у вухо.'],
 ['Пристрій радіоелектронної розвідки','electronics_rf_detectors','Сканування і перехоплення сигналів.'],
 ['Прапор України','symbols_flags','Полотнище прапора, кріпиться під древко.']
])test('actual missing product class: '+id,()=>{const r=resolve(item(name,description));assert.equal(r.partition,'TAXONOMY_GAP');assert.equal(r.proposed_category_id,id);assert.equal(r.tier,'AMBIGUOUS');assert(!r.category);});
for(const name of ['category','canonical_category_id','primary_product_type'])test('manual lock preserved: '+name,()=>{const p=deepFreeze(item('Грілки для рук','Хімічна грілка виділяє тепло.',{manual_locks:{[name]:true}}));assert.equal(resolve(p).tier,'AMBIGUOUS');assert.equal(resolve(p).rule_id,'protected-existing-decision');});
for(const name of ['source','category_source','catSource'])test('manual category provenance: '+name,()=>assert.equal(resolve(item('Грілки для рук','Хімічна грілка',{[name]:'manual'})).rule_id,'protected-existing-decision'));
test('supplier field metadata manual lock preserved',()=>assert.equal(resolve(item('Грілки для рук','Хімічна грілка',{fieldMeta:{category:{source:'manual'}}})).rule_id,'protected-existing-decision'));
test('explicit mapping rule preserved',()=>assert.equal(resolve(item('Грілки для рук','Хімічна грілка',{category_rule_id:'mapping-exact'})).rule_id,'protected-existing-decision'));
test('mapping supplied by adapter has priority',()=>assert.equal(resolve(item('Грілки для рук','Хімічна грілка'),tax,{mappingDecisions:[{supplier_id:'s-a',category_rule_id:'mapping-path',canonical_category_id:'tools_other'}]}).rule_id,'protected-supplier-mapping'));
test('mapping of a different supplier is irrelevant',()=>assert.equal(resolve(item('Грілки для рук','Хімічна грілка'),tax,{mappingDecisions:[{supplier_id:'s-b',category_rule_id:'mapping-path',canonical_category_id:'tools_other'}]}).tier,'SAFE_AUTO'));
test('similar name alone does not authorize auto',()=>assert.notEqual(resolve(item('Підсумок під 2 гранати','Колір олива.')).tier,'SAFE_AUTO'));
test('source title must confirm the item',()=>assert.notEqual(resolve(item('Підсумок під 2 гранати','Призначений для двох гранат.',{sources:[{supplier_id:'s-a',original_name:'Рюкзак'}]})).tier,'SAFE_AUTO'));
test('conflicting supplier titles prevent auto',()=>assert.notEqual(resolve(item('Підсумок під 2 гранати','Призначений для двох гранат.',{sources:[{supplier_id:'s-a',original_name:'Підсумок під 2 гранати'},{supplier_id:'s-b',original_name:'Рюкзак'}]})).tier,'SAFE_AUTO'));
test('component names do not make a taxonomy gap',()=>assert.notEqual(resolve(item('Чохол для прапора','Чохол закриває прапор.')).partition,'TAXONOMY_GAP'));
test('sleeveless jacket does not become armor based on material',()=>assert.equal(resolve(item('Жилетка утеплена','Безрукавка із синтепоном та тканини Cordura.')).proposed_category_id,'clothing_insulated_vests'));
test('whole armor composition conflict stays unresolved',()=>assert.equal(resolve(item('Комплект (захист живота Kiborg + пакет)','Чохол під пакет. Пакет можна замовити окремо.')).rule_id,'armor-cover-or-complete'));
test('compatibility with plates is not completed armor contents',()=>assert.notEqual(resolve(item('Комплект бронезахисту','Сумісний з плитами NIJ, пакет можна купити окремо.')).tier,'SAFE_AUTO'));
test('passive plugs are not headphones',()=>assert.equal(resolve(item('Беруші універсальні','Блокують небажаний шум.')).partition,'TAXONOMY_GAP'));
test('a description with active electronics cannot be labelled passive plugs',()=>assert.notEqual(resolve(item('Беруші EARMOR','Електронні беруші з Bluetooth; блокують шум.')).proposed_category_id,'communications_earplugs'));
test('model mismatch is disclosed even when product class is clear',()=>assert.match(resolve(item('Беруші EARMOR','Беруші MaxDefense виготовлені з піни.')).warnings.join(' '),/SOURCE_MODEL_MISMATCH/));
test('approved current category is existing, not a gap',()=>assert.equal(resolve(item('Прапор України','Прапор під древко.'),[...tax,{id:'symbols',name:'Символіка',parent_id:null},{id:'symbols_flags',name:'Прапори',parent_id:'symbols'}]).partition,'EXISTING_CATEGORY_AMBIGUOUS'));
test('deprecated category cannot be auto-selected',()=>assert.notEqual(resolve(item('Грілки для рук','Хімічна грілка'),tax.map(c=>c.id==='field_other'?{...c,deprecated:true}:c)).tier,'SAFE_AUTO'));
const neighbors=[{id:'known',supplier_id:'s-a',supplier_group:'Komplektuyuschie dlya oruzhiya',category:'weapon_slings',independent_source_evidence:true,source_excerpt:'Для носіння зброї.'}];
const point=()=>item('Ремінь двоточковий','Ремінь колір олива.',{sources:[{supplier_id:'s-a',supplier_category_raw:'Komplektuyuschie dlya oruzhiya',original_name:'Ремінь двоточковий'}]});
test('same supplier group and independently proven neighboring item type corroborate',()=>assert.equal(resolve(point(),tax,{neighbors}).tier,'SAFE_AUTO'));
for(const [name,change]of [['different supplier',{supplier_id:'s-b'}],['different supplier group',{supplier_group:'clothing'}],['unproven neighbour',{independent_source_evidence:false}],['different item type',{category:'clothing_belts'}]])test('no neighbor propagation from '+name,()=>assert.equal(resolve(point(),tax,{neighbors:neighbors.map(x=>({...x,...change}))}).tier,'LIKELY'));
test('read-only resolver preserves full input and taxonomy',()=>{const p=deepFreeze(item('Грілки для рук','Хімічна грілка',{variants:[{sku:'SKU',photos:['p'],price:101,stock:2}],canonical_category_id:null,category_history:[]})),t=deepFreeze(structuredClone(tax));const before=JSON.stringify({p,t});resolve(p,t);assert.equal(JSON.stringify({p,t}),before);});
const approved=[R.symbolsRoot,...R.gaps,R.watchRule].map(c=>({id:c.id,name:c.name,parent_id:c.parent,aliases:[...c.aliases]}));
const virtual=[...structuredClone(tax),...approved];
test('approved manifest contains exactly nine IDs and no footwear_loafers',()=>{assert.equal(approved.length,9);assert.equal(approved.find(c=>c.id==='footwear_shoes').name,'Туфлі та лофери');assert(!approved.some(c=>c.id==='footwear_loafers'));assert.equal(virtual.length,143);});
test('virtual taxonomy keeps all 134 existing entries byte-equivalent',()=>{for(const c of tax)assert.deepEqual(virtual.find(v=>v.id===c.id),c);});
for(const name of ['Годинник Glock Automatic','Годинник наручний SKMEI','Наручний годинник Smael','Тактичний протиударний годинник SKMEI','SKMEI 1968 — водонепроникний годинник','Watch Example'])test('approved category needs independently proven watch: '+name,()=>{const r=resolve(item(name,'Корпус і циферблат. Кварцовий механізм, відображення дати.'),virtual);assert.equal(r.category,'field_watches');assert.equal(r.tier,'SAFE_AUTO');});
test('watch title alone does not become safe by taxonomy approval',()=>{const r=resolve(item('Годинник Example','Колір чорний.'),virtual);assert.equal(r.category,'field_watches');assert.equal(r.tier,'LIKELY');});
test('supplier group about watches is only a hint',()=>{const p=item('Годинник Example','Новинка.',{sources:[{supplier_id:'s-a',supplier_category_raw:'Годинники',original_name:'Годинник Example'}]});assert.equal(resolve(p,virtual).tier,'LIKELY');});
test('watch component remains outside watch category',()=>assert.notEqual(resolve(item('Ремінець для годинника','Ремінець до годинника з циферблатом.'),virtual).category,'field_watches'));
test('standalone stopwatch is not silently included in watch approval',()=>{const r=resolve(item('Секундомір тактичний','Формат часу 12/24, будильник.'),virtual);assert.notEqual(r.category,'field_watches');assert.equal(r.tier,'LIKELY');});
test('approved category cannot override manual watch classification',()=>assert.equal(resolve(item('Годинник Example','Кварцовий механізм.',{category_locked:true}),virtual).rule_id,'protected-existing-decision'));
test('inconsistent supplier titles do not auto-confirm a watch',()=>assert.equal(resolve(item('Годинник Example','Кварцовий механізм.',{sources:[{supplier_id:'s-a',original_name:'Годинник Example'},{supplier_id:'s-b',original_name:'Ремінець'}]}),virtual).tier,'LIKELY'));
test('source model mismatch remains likely after earplug category approval',()=>{const r=resolve(item('Беруші EARMOR M02','Беруші MaxDefense виготовлені з піни.'),virtual);assert.equal(r.category,'communications_earplugs');assert.equal(r.tier,'LIKELY');assert.match(r.warnings.join(' '),/SOURCE_MODEL_MISMATCH/);});
test('consistent passive plug source is safely classifiable in virtual taxonomy',()=>assert.equal(resolve(item('Беруші багаторазові','Блокують небажаний шум, вставити у вухо.'),virtual).tier,'SAFE_AUTO'));
test('approval of protective categories does not close unknown armor composition',()=>assert.equal(resolve(item('Комплект (захист живота Kiborg + пакет)','Чохол, пакет доступний окремо.'),virtual).tier,'AMBIGUOUS'));
test('universal shoes category handles conventional shoes, not only loafers',()=>{const r=resolve(item('Чоловічі класичні туфлі','Класичні туфлі, легка підошва.'),virtual);assert.equal(r.category,'footwear_shoes');assert.equal(r.tier,'SAFE_AUTO');});
test('virtual classification cannot write into any frozen working data',()=>{const working=deepFreeze({cfg:{canonical_categories:structuredClone(tax),supplier_category_mapping:[]},products:[item('Годинник Example','Кварцовий механізм.',{variants:[{sku:'SKU',size:'48',price:101,stock:3,photos:['photo'],offers:{a:{s:3}}}]})]});const before=JSON.stringify(working);const v=deepFreeze(structuredClone(virtual));resolve(working.products[0],v);assert.equal(JSON.stringify(working),before);assert.equal(working.cfg.canonical_categories.length,134);});
