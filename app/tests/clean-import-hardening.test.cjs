'use strict';
// Clean-import hardening: explicit SKU sizes in size-free categories, supplier size labels that tell unconfirmed SKUs
// apart, models whose SKUs a buyer cannot tell apart never READY, supplier group codes that only slice one model,
// the card's own size in its title, and language-variant colour aliases of existing canonical colours.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
const DESC='<p>Модель для польових умов. Матеріал: Cordura 500D, посилені шви, регульовані ремені, сумісність з MOLLE. Виготовлено в Україні з дотриманням стандартів якості, підходить для щоденного використання та тривалих виходів.</p>';
function setup(){
 const h=createHarness({runtime:true});
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;');
 return h;
}
const offer=(s,extra={})=>({s,cost:500,payout:500,stock:5,availability:'in',at:Date.now(),photos:['https://rubizh.shop/media/'+s+'.webp'],source_description:DESC,...extra});
function card(h,id,name,category,variants,extra={}){
 const p=h.product({id,name,canonical_category_id:category,category_locked:true,desc:DESC,variants:variants.map(([sku,color,o,size=''])=>({sku,size,color,price:0,offers:{'supplier-a':o}})),...extra});
 h.add(p);h.ctx.pid=id;h.run('classificationApplyProduct(S.products.get(pid))');return p;
}
const state=(h,id)=>{h.ctx.pid=id;return JSON.parse(h.run('JSON.stringify(finalDecision(S.products.get(pid)))'));};
const sizes=(h,id)=>{h.ctx.pid=id;return JSON.parse(h.run('JSON.stringify(S.products.get(pid).variants.map(v=>[v.sku,v.size_status,v.size||""]))'));};
test('size-free category: the supplier\'s explicit SKU size (dedicated field) identifies the SKU; no size → still NO_SIZE_REQUIRED',()=>{
 const h=setup();h.run('bumpData()');
 card(h,'p-cap','Панама тактична Rip-stop','clothing_headwear',[['RUB-1','Піксель',offer('P-S',{structured_size:'S'})],['RUB-2','Піксель',offer('P-M',{structured_size:'M'})]]);
 assert.deepEqual(sizes(h,'p-cap'),[['RUB-1','EXACT_SIZE','S'],['RUB-2','EXACT_SIZE','M']]);
 assert.ok(!state(h,'p-cap').reasons.some(r=>r.code==='variant_cell'));
 card(h,'p-flag','Прапор України','clothing_headwear',[['RUB-3','Жовто-блакитний',offer('F-1')]]);
 assert.equal(sizes(h,'p-flag')[0][1],'NO_SIZE_REQUIRED');
});
test('a range or a model-wide value is not an explicit SKU size: size-free SKUs a buyer cannot tell apart go to MODERATION',()=>{
 const h=setup();
 card(h,'p-hat','Кепка «Німка» тактична','clothing_headwear',[['RUB-1','Олива',offer('K-1',{structured_size:'56-57'})],['RUB-2','Олива',offer('K-2',{structured_size:'58-59'})]]);
 assert.deepEqual(sizes(h,'p-hat').map(x=>x[1]),['NO_SIZE_REQUIRED','NO_SIZE_REQUIRED']);
 const d=state(h,'p-hat');assert.equal(d.state,'MODERATION');assert.deepEqual(d.reasons.find(r=>r.code==='variant_cell').evidence,['RUB-1','RUB-2']);
 card(h,'p-two','Кепка польова','clothing_headwear',[['RUB-3','Олива',offer('C-1')],['RUB-4','Чорний',offer('C-2')]]);
 assert.ok(!state(h,'p-two').reasons.some(r=>r.code==='variant_cell'),'different colours are different cells');
});
test('unconfirmed sizes: distinct SKU labels are shown so SKUs can be told apart; the size stays unconfirmed',()=>{
 const h=setup();
 card(h,'p-pc','Кріплення камербанду','armor_plate_carriers',[['RUB-1','Мультикам',offer('CB-M',{structured_size:'(M) 93*19 см'})],['RUB-2','Мультикам',offer('CB-L',{structured_size:'(L) 102*20,6 см'})]]);
 assert.deepEqual(sizes(h,'p-pc').map(x=>x[1]),['SIZE_CONFIRMATION_REQUIRED','SIZE_CONFIRMATION_REQUIRED']);
 assert.ok(!state(h,'p-pc').reasons.some(r=>r.code==='variant_cell'));
 const w=JSON.parse(JSON.stringify(h.run('finalWireProduct(S.products.get("p-pc"))')));
 assert.deepEqual(w.variants.map(v=>[v.size_status,v.size_display,v.size_unconfirmed]),[['SIZE_CONFIRMATION_REQUIRED','(M) 93*19 см',true],['SIZE_CONFIRMATION_REQUIRED','(L) 102*20,6 см',true]]);
 card(h,'p-same','Плитоноска Phantom GEN.2','armor_plate_carriers',[['RUB-3','Мультикам',offer('PH-1',{structured_size:'M-L, XL-XXL'})],['RUB-4','Мультикам',offer('PH-2',{structured_size:'M-L, XL-XXL'})]]);
 assert.equal(state(h,'p-same').state,'MODERATION','the same model-wide label on both SKUs does not tell them apart');
 card(h,'p-range','Плитоноска Spartan GEN.2','armor_plate_carriers',[['RUB-5','Мультикам',offer('SP-1',{structured_size:'M-L'})],['RUB-6','Мультикам',offer('SP-2',{structured_size:'XL-XXL'})]]);
 const r=JSON.parse(JSON.stringify(h.run('finalWireProduct(S.products.get("p-range"))')));
 assert.deepEqual(r.variants.map(v=>v.size_display),['',''],'a range (M-L) is never shown as one SKU size');assert.equal(state(h,'p-range').state,'MODERATION');
});
// Owner rule: a numeric clothing range is the MODEL's allowed sizes (clothing_numeric, step 2), never one size and never SKUs.
const rangeCard=(h,id,range,skus=[['RUB-R1','Олива',offer('R-1',{structured_size:range})]])=>card(h,id,'Штани польові Test','clothing_pants',skus,{desc:'<p>Розміри: '+range+'</p>'+DESC});
const options=(h,id)=>{h.ctx.pid=id;return JSON.parse(h.run('JSON.stringify(classificationOptions(S.products.get(pid)).map(o=>({size:o.size,sku:o.variant_sku,availability:o.availability,payment:o.payment_allowed,confirm:o.requires_order_confirmation})))'));};
for(const [range,expected] of [['42–60',['42','44','46','48','50','52','54','56','58','60']],['44–54',['44','46','48','50','52','54']],['46-58',['46','48','50','52','54','56','58']],['48–60',['48','50','52','54','56','58','60']]])
 test('clothing range '+range+' → model size options '+expected.join(','),()=>{
  const h=setup();rangeCard(h,'p-r',range);const o=options(h,'p-r');
  assert.deepEqual(o.map(x=>x.size),expected);
  for(const x of o)assert.deepEqual([x.sku,x.availability,x.payment,x.confirm],[null,'SIZE_CONFIRMATION_REQUIRED',false,true]);
  const v=JSON.parse(h.run('JSON.stringify(S.products.get("p-r").variants.map(v=>({status:v.size_status,normalized:v.size_normalized??null,size:v.size||""})))'));
  assert.deepEqual(v,[{status:'SIZE_CONFIRMATION_REQUIRED',normalized:null,size:''}],'"'+range+'" is not a size of the SKU');
 });
test('range expansion creates no SKU; real SKUs of concrete sizes keep their own size and are not repeated as options',()=>{
 const h=setup();rangeCard(h,'p-r','42–60',[['RUB-44','Олива',offer('R-44',{structured_size:'44'}),'44'],['RUB-46','Олива',offer('R-46',{structured_size:'46'}),'46']]);
 const p=JSON.parse(h.run('JSON.stringify(S.products.get("p-r").variants.map(v=>[v.sku,v.size_status,String(v.size)]))'));
 assert.deepEqual(p,[['RUB-44','EXACT_SIZE','44'],['RUB-46','EXACT_SIZE','46']],'still exactly the two supplier SKUs');
 assert.deepEqual(options(h,'p-r').map(x=>x.size),['42','48','50','52','54','56','58','60']);
 const w=JSON.parse(JSON.stringify(h.run('finalWireProduct(S.products.get("p-r"))')));
 assert.deepEqual(w.variants.map(v=>v.sku),['RUB-44','RUB-46']);
 for(const v of w.variants)assert.notEqual(v.size_normalized,'42-60');
});
test('footwear interval keeps its own system (step 1), never the clothing step',()=>{
 const E=require('../lib/size-evidence.js');assert.deepEqual(E.expand(E.parse('40–46'),{type:'boots'}).allowed_sizes,['40','41','42','43','44','45','46']);
 assert.equal(E.expand(E.parse('42–60'),{type:'helmet'}).confidence,'AMBIGUOUS','no confirmed system → no expansion');
});
const slice=(h,id,name,code,color,sku,size='')=>card(h,id,name,'pouches_magazine',[[sku,color,offer(sku,{source_model:code,structured_size:size||null}),size]]);
test('supplier group codes that only slice one model (one colour per code) plus the existing strong evidence merge automatically',()=>{
 const h=setup();
 slice(h,'p-1','Підсумок Kiborg Rapid Mag Pro','100455','Койот','RUB-1');slice(h,'p-2','Підсумок Kiborg Rapid Mag Pro','101455','Олива','RUB-2');slice(h,'p-3','Підсумок Kiborg Rapid Mag Pro','102455','Чорний','RUB-3');
 h.run('bumpData()');const plan=JSON.parse(JSON.stringify(h.run('mcPlan()')));
 assert.equal(plan.automatic.length,1,JSON.stringify(plan.groups));assert.deepEqual(plan.automatic[0].ids,['p-1','p-2','p-3']);
 h.run('mcMigrate()');const active=JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>!p.archived).map(p=>({id:p.id,skus:p.variants.map(v=>v.sku),colors:mcColors(p).length})))'));
 assert.deepEqual(active,[{id:'p-1',skus:['RUB-1','RUB-2','RUB-3'],colors:3}]);
});
test('without the strong evidence slices are an owner question (mergeable), and codes that overlap colours stay a contradiction',()=>{
 const h=setup();
 slice(h,'p-1','Підсумок під турнікет','200455','Койот','RUB-1');slice(h,'p-2','Підсумок під турнікет','201455','Олива','RUB-2');
 h.run('bumpData()');let plan=JSON.parse(JSON.stringify(h.run('mcPlan()')));
 assert.equal(plan.automatic.length,0,'no Latin model tokens: the approved strong rule does not apply');
 assert.ok(!plan.review[0].reasons.includes('Поставщик передал разные коды модели'));
 assert.ok(JSON.parse(JSON.stringify(h.run('simpleDecisions()'))).some(t=>t.kind==='model'&&t.can_merge));
 const k=setup();
 card(k,'p-a','Підсумок Kiborg Rapid Mag Pro','pouches_magazine',[['RUB-1','Койот',offer('A1',{source_model:'300455'})],['RUB-2','Олива',offer('A2',{source_model:'300455'})]]);
 card(k,'p-b','Підсумок Kiborg Rapid Mag Pro','pouches_magazine',[['RUB-3','Чорний',offer('B1',{source_model:'301455'})],['RUB-4','Хакі',offer('B2',{source_model:'301455'})]]);
 k.run('bumpData()');plan=JSON.parse(JSON.stringify(k.run('mcPlan()')));
 assert.equal(plan.automatic.length,0);assert.ok(plan.review[0].reasons.includes('Поставщик передал разные коды модели'),'multi-colour, multi-size cards are not slices');
});
test('the card\'s own SKU size in its title is a variant value: size slices of one model share a model identity',()=>{
 const h=setup();
 for(const [i,size] of ['S','M','L'].entries())card(h,'p-'+size,'Пояс для РПС GEN.2 ('+size+') Kiborg R-1 IRR','load_bearing_rps',[['RUB-'+i,'Койот',offer('BELT-'+size,{source_model:'40'+i+'455',structured_size:size}),size]]);
 h.run('bumpData()');assert.deepEqual(JSON.parse(JSON.stringify(h.run('mcIdentity(S.products.get("p-M")).name'))),'Пояс для РПС GEN.2 Kiborg R-1 IRR');
 const plan=JSON.parse(JSON.stringify(h.run('mcPlan()')));assert.equal(plan.automatic.length,1,JSON.stringify(plan.groups));
 h.run('mcMigrate()');const p=JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>!p.archived).map(p=>p.variants.map(v=>v.size).sort()))'));
 assert.deepEqual(p,[['L','M','S']]);
 assert.equal(h.run('mcStripOwnSize("Рукавиці M-Pact",{variants:[{size_status:"EXACT_SIZE",size:"M"}]})'),'Рукавиці M-Pact','size letters inside model words stay');
});
test('language variants of existing canonical colours resolve; new camouflage names stay unknown for the owner',()=>{
 const M=require('../lib/product-model.js');
 assert.equal(M.palette('Рейнджер грін').color,'Ranger Green');assert.equal(M.palette('Темний-хакі').color,'Темний хакі');
 assert.equal(M.palette('Альпійська клякса').camouflage,M.palette('Альпийская клякса').camouflage);
 for(const c of ['Камуфляж','Очерет','Листя','Карбон','Скеля'])assert.deepEqual(M.palette(c).unknown,[c]);
});
test('made-to-measure nets priced per square metre are never READY (price is per unit area, not per item)',()=>{
 const h=setup();
 card(h,'p-net','Маскувальна сітка M-Win мультикам','camouflage_nets',[['RUB-N1','Мультикам',offer('ZM-IND',{source_name:'Маскувальна сітка M-Win мультикам. Індивідуальний розмір (ціна за 1 кв.м.)',cost:42,payout:42})]]);
 const d=state(h,'p-net');assert.equal(d.state,'MODERATION');assert.deepEqual(d.reasons.find(r=>r.code==='price_unit').evidence,['RUB-N1']);
 card(h,'p-attr','Антидронова сітка M-WIN Піксель','camouflage_nets',[['RUB-N2','Піксель',offer('AD-IND',{source_attributes:{'ОБЕРІТЬ РОЗМІР СІТКИ':': Індивідуальний розмір'}})]]);
 assert.ok(state(h,'p-attr').reasons.some(r=>r.code==='price_unit'));
 card(h,'p-fixed','Маскувальна сітка M-Win мультикам 3х6 м','camouflage_nets',[['RUB-N3','Мультикам',offer('ZM-3x6',{source_name:'Маскувальна сітка M-Win мультикам 3х6 м (площа 18 кв.м.)'})]]);
 assert.ok(!state(h,'p-fixed').reasons.some(r=>r.code==='price_unit'),'a fixed size with its area is an item price');
});
test('category evidence reads the supplier description carried by the offer when the card has none (clean import)',()=>{
 const h=setup();
 const p=h.product({id:'p-pants',name:'Тактичні штани Raptor Яструб',desc:'',category:'',catSource:'',fieldMeta:{},variants:[{sku:'RUB-P1',size:'48',color:'Піксель',price:0,offers:{'supplier-a':offer('RAPTOR-48',{source_name:'Тактичні штани Raptor Яструб Піксель 48',supplier_category_raw:'Військові штани',supplier_category_path_raw:'ВІЙСЬКОВИЙ ОДЯГ / ШТАНИ / Військові штани',structured_size:'48',source_description:'<p>Тактичні штани з посиленими колінами, кишенями для наколінників і регульованим поясом. Тканина ріп-стоп.</p>'})}}]});
 h.add(p);
 const before=JSON.parse(JSON.stringify(h.run('(()=>{const x=S.products.get("p-pants");return [ceSupplierSource(x)||x.source_description||x.desc||"",classificationSupplierDescription(x).length>40]})()')));
 assert.deepEqual(before,['',true],'the card itself has no description; the offer has one');
 const d=JSON.parse(JSON.stringify(h.run('classificationDecision(S.products.get("p-pants"))')));
 assert.equal(d.category,'clothing_pants');assert.equal(d.tier,'SAFE_AUTO',JSON.stringify(d));
});
test('colour galleries keep SKU-bound photos: a card gallery shared by colour cards never leaks into another colour after the merge',()=>{
 const h=setup(),url=x=>'https://rubizh.shop/media/'+x+'.webp',shared=['a1','a2','b1','b2'].map(url);
 for(const [id,color,code,own] of [['p-1','Мультикам','18460',['a1','a2']],['p-2','Піксель','22460',['b1','b2']]])
  card(h,id,'Бронежилет тактичний Ranger Плитоноска M-WIN GEN.2','armor_plate_carriers',[['RUB-'+id,color,offer('S'+id,{source_model:code,native_color:color,photos:own.map(url)})]],{photos:shared});
 h.run('bumpData()');assert.equal(h.run('mcPlan().automatic.length'),1);h.run('mcMigrate()');
 const colors=JSON.parse(h.run('JSON.stringify(mcColors([...S.products.values()].find(p=>!p.archived)).map(c=>[c.camouflage,c.photos.map(u=>u.split("/").pop())]))'));
 assert.deepEqual(colors,[['Мультикам',['a1.webp','a2.webp']],['Піксель',['b1.webp','b2.webp']]]);
 const w=JSON.parse(JSON.stringify(h.run('finalWireProduct([...S.products.values()].find(p=>!p.archived))')));
 assert.deepEqual(w.variants.map(v=>v.photos.length),[2,2]);
 card(h,'p-3','Ліхтар налобний','lighting_tactical',[['RUB-3','Чорний',offer('L-1',{photos:[]})]],{photos:[url('l1')]});
 assert.deepEqual(JSON.parse(h.run('JSON.stringify(mcColors(S.products.get("p-3"))[0].photos)')),[url('l1')],'no SKU photo: the card gallery is the colour gallery');
});
test('shipped audit mappings: a pure supplier path classifies silent names; a contradicting name and an owner mapping win',()=>{
 const h=setup();h.run('S.cfg.suppliers.push({id:"s2bggyi42dhh",name:"киборг",auto:true,mapping:{}})');
 const m=JSON.parse(JSON.stringify(h.run('RubizhCategoryEvidence.supplierMappings.find(m=>m.canonical_category_id==="weapon_slings"&&m.supplier_id==="s2bggyi42dhh")')));
 const src=(name)=>({supplier_id:'s2bggyi42dhh',supplier_category_raw:m.supplier_category_raw,supplier_category_path_raw:m.supplier_category_path_raw,original_name:name});
 h.ctx.a=src('Kiborg QD Tactical 2P');h.ctx.b=src('Підсумок для магазину АК Kiborg');
 assert.equal(h.run('RubizhCategories.classify({...a,name:a.original_name},categoryOptions()).canonical_category_id'),'weapon_slings','the path decides a name that names no type');
 assert.notEqual(h.run('RubizhCategories.classify({...b,name:b.original_name},categoryOptions()).canonical_category_id'),'weapon_slings','a name naming another type is not overridden');
 h.run('S.cfg.supplier_category_mapping=[{supplier_id:"s2bggyi42dhh",supplier_category_raw:a.supplier_category_raw,supplier_category_path_raw:a.supplier_category_path_raw,canonical_category_id:"weapon_other",confirmed:true}]');
 assert.equal(h.run('RubizhCategories.classify({...a,name:a.original_name},categoryOptions()).canonical_category_id'),'weapon_other','owner configuration first');
});
test('description: SKU rows repeating one supplier text publish it once; the title line is not repeated; facts are kept',()=>{
 const h=setup(),block='<p>Тактичні шорти BR Stinger</p><p>Легкі, еластичні та витривалі шорти для польових умов.</p><p>Характеристики:</p><p>Матеріал: еластичний стрейч</p><p>Упаковка</p>';
 card(h,'p-d','Тактичні шорти BR Stinger','clothing_shorts',[['RUB-1','Сірий',offer('ST-S',{source_description:block.repeat(6)}),'S']],{desc:block.repeat(6)});
 const html=h.run('finalDescription(S.products.get("p-d"))');
 assert.equal((html.match(/еластичні та витривалі/g)||[]).length,1);assert.equal((html.match(/Упаковка/g)||[]).length,1);
 assert.ok(html.includes('Матеріал: еластичний стрейч'));assert.ok(!html.includes('<p>Тактичні шорти BR Stinger</p>'),'title line not repeated as a paragraph');
});
test('public title: supplier «|» descriptor segments without model identity are cut; identity segments and manual titles stay',()=>{
 const h=setup(),t=(name,src,extra={})=>{h.ctx.x={name,variants:[{offers:{a:{original_name:src}}}],...extra};return h.run('finalTitle(x)');};
 assert.equal(t('Тактичні шорти BR Stinger Стрейч, сірі Літо, ТрО, польові умови','Тактические шорты BR Stinger | Стрейч, серые | Лето, ТрО, полевые условия'),'Тактичні шорти BR Stinger');
 assert.equal(t('Пояс РПС Militex R-3 GEN.2 Cordura 1000D USA','Пояс РПС Militex R-3 GEN.2 | Cordura 1000D USA | Мультикам (M)'),'Пояс РПС Militex R-3 GEN.2 Cordura 1000D USA','a material/version segment is identity');
 assert.equal(t('Тактичний шолом ECLIPSE HC GEN 3 SXE GROUP','Тактический шлем ECLIPSE HC GEN 3 | SXE GROUP'),'Тактичний шолом ECLIPSE HC GEN 3 SXE GROUP','a brand segment is identity');
 assert.equal(t('Шорти Stinger Літо, ТрО','Шорты Stinger | Лето, ТрО',{fieldMeta:{name:{source:'manual'}}}),'Шорти Stinger Літо, ТрО','manual title untouched');
 assert.equal(t('Інша назва моделі','Тактические шорты BR Stinger | Лето'),'Інша назва моделі','a title that does not start with the first segment is not rewritten');
});
test('wire: SKU sizes go in logical order inside each colour, never alphabetical',()=>{
 const h=setup(),sizes=['L','M','S','XL','2XL','3XL'];
 card(h,'p-o','Тактичні шорти BR Stinger','clothing_shorts',sizes.map((z,i)=>['RUB-'+i,'Сірий',offer('ST-'+z,{structured_size:z}),z]));
 const w=JSON.parse(JSON.stringify(h.run('finalWireProduct(S.products.get("p-o"))')));
 assert.deepEqual(w.variants.map(v=>v.size_display),['S','M','L','XL','2XL','3XL']);
 assert.deepEqual(w.colors[0].variant_skus,w.variants.map(v=>v.sku));
 const n=setup();card(n,'p-n','Штани польові Test','clothing_pants',['50/4','46/3','48/3','46/4'].map((z,i)=>['RUB-'+i,'Олива',offer('P-'+i,{structured_size:z}),z]));
 assert.deepEqual(JSON.parse(JSON.stringify(n.run('finalWireProduct(S.products.get("p-n"))'))).variants.map(v=>v.size_display),['46/3','46/4','48/3','50/4']);
});
test('a confirmed supplier mapping is applied to a freshly imported card (not treated as an already-applied manual lock)',()=>{
 const h=setup();h.run('S.cfg.suppliers.push({id:"sf0t3l7jegf9",name:"м вин",auto:true,mapping:{}})');
 const p=h.product({id:'p-net',name:'Маскувальна сітка M-Win Хижак 3х6 м',desc:'',category:'',catSource:'',variants:[{sku:'RUB-N',size:'',color:'Хижак',price:0,offers:{'sf0t3l7jegf9':offer('HZ-3x6',{supplier_category_raw:'Маскувальні сітки',supplier_category_path_raw:'Маскувальні сітки',source_name:'Маскувальна сітка M-Win Хижак 3х6 м'})}}]});
 h.add(p);h.run('classificationApplyProduct(S.products.get("p-net"))');
 assert.deepEqual(JSON.parse(h.run('JSON.stringify((p=>[p.canonical_category_id,p.category_source])(S.products.get("p-net")))')),['camouflage_nets','mapping']);
 const q=h.product({id:'p-man',name:'Маскувальна сітка M-Win Хижак 3х6 м',canonical_category_id:'camouflage_antidrone',category_locked:true,variants:p.variants.map(v=>({...v,sku:'RUB-M'}))});h.add(q);h.run('classificationApplyProduct(S.products.get("p-man"))');
 assert.equal(h.run('S.products.get("p-man").canonical_category_id'),'camouflage_antidrone','manual lock wins');
});
test('public identity: digit segments stay in the title, two active cards never share one public title as READY, slug follows the title',()=>{
 const h=setup();
 assert.equal((()=>{h.ctx.x={name:'Штани "Піхота" Розмір: 50/4',variants:[{offers:{a:{original_name:'Штани "Піхота", Піксель |Розмір: 50/4'}}}]};return h.run('finalTitle(x)');})(),'Штани "Піхота" Розмір: 50/4');
 card(h,'p-a','Зимовий костюм горка','clothing_suits',[['RUB-A','Мультикам',offer('G-A'),'50']],{brand:'Stimul'});
 card(h,'p-b','Зимовий костюм горка','clothing_suits',[['RUB-B','Піксель',offer('G-B'),'52']],{brand:''});
 h.run('bumpData()');for(const id of ['p-a','p-b']){const d=state(h,id);assert.equal(d.state,'MODERATION');assert.ok(d.reasons.some(r=>r.code==='grouping'&&String(r.evidence).includes('Та сама назва')));}
 const s=setup();card(s,'p-s','Тактичні шорти BR Stinger Стрейч, сірі Літо, ТрО','clothing_shorts',[['RUB-S','Сірий',offer('ST',{original_name:'Тактические шорты BR Stinger | Стрейч, серые | Лето, ТрО'}),'S']]);
 const w=JSON.parse(JSON.stringify(s.run('finalWireProduct(S.products.get("p-s"))')));assert.equal(w.name,'Тактичні шорти BR Stinger');assert.equal(w.slug,s.run('slugify("Тактичні шорти BR Stinger")'));
});
const MWIN='sf0t3l7jegf9';
function net(h,id,name,sku,selector,extra={}){
 const attrs={'ОБЕРІТЬ РОЗМІР СІТКИ':': '+selector,'Колір':'Осіннє листя'},m=String(selector).match(/^(\d+)х(\d+)$/u);if(m){attrs['Ширина']=m[1]+' м';attrs['Довжина']=m[2]+' м';}
 const o={...offer(sku),source_model:'37469',source_name:name,supplier_category_raw:'Маскувальні сітки',source_attributes:attrs,...extra};
 const p=h.product({id,name,brand:'M-WIN',canonical_category_id:extra.category||'camouflage_nets',category_locked:true,desc:DESC,attrs:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k,String(v).replace(/^:\s*/,'')])),variants:[{sku:'RUB-'+sku,size:'',color:'',camouflage:'Осіннє листя',price:0,offers:{[MWIN]:o}}]});
 h.add(p);h.ctx.pid=id;h.run('classificationApplyProduct(S.products.get(pid))');return p;
}
function mwinSetup(){const h=setup();h.run(`S.cfg.suppliers.push({id:'${MWIN}',name:'M-WIN',auto:false,priority:1,terms:{priceType:'cost'}})`);return h;}
test('M-WIN net grid selector: W×H is the exact SKU size of real nets; per-m² and non-net rows never get one',()=>{
 const h=mwinSetup(),T='Маскувальна сітка M-Win Листя осінь. Маскування весна, літо, осінь.';
 net(h,'n1',T+' 2х3 м (площа 6 кв.м.)','LO-2х3','2х3');net(h,'n2',T+' 3х4 м (площа 12 кв.м.)','LO-3х4','3х4');
 net(h,'n0',T+' індивідуального розміру (ціна за 1 кв.м.)','0000LO','Індивідуальний розмір');
 const sz=id=>{h.ctx.pid=id;return JSON.parse(h.run('JSON.stringify(S.products.get(pid).variants.map(v=>[v.size_status,v.size||"",v.size_system||null]))'))[0];};
 assert.deepEqual(sz('n1'),['EXACT_SIZE','2×3 м','net_dimensions']);assert.deepEqual(sz('n2'),['EXACT_SIZE','3×4 м','net_dimensions']);
 assert.equal(sz('n0')[0],'NO_SIZE_REQUIRED','«Індивідуальний розмір» is not a size');
 net(h,'x1','Рюкзак тактичний 2х3','BAG-1','2х3',{category:'backpacks_tactical'});assert.notEqual(sz('x1')[0],'EXACT_SIZE','not an approved net category');
 net(h,'x2',T+' 4х5 м','LO-4х5c','2х3');assert.notEqual(sz('x2')[0],'EXACT_SIZE','title contradicts the selector');
 net(h,'x3',T+' 5х6 м','LO-5х6w','5х6',{source_attributes:{'ОБЕРІТЬ РОЗМІР СІТКИ':': 5х6','Ширина':'4 м','Довжина':'6 м'}});assert.notEqual(sz('x3')[0],'EXACT_SIZE','width contradicts the selector');
 h.run('for(const id of ["x1","x2","x3"])S.products.delete(id);bumpData()');
 const plan=JSON.parse(h.run('JSON.stringify(mcPlan())')),g=plan.automatic.find(g=>g.ids.includes('n1'));
 assert.ok(g,'size grid of one colour merges automatically');assert.deepEqual(g.ids,['n1','n2']);assert.ok(!g.ids.includes('n0'));
 h.run('mcMigrate()');h.ctx.pid=g.ids[0];
 const wire=JSON.parse(h.run('JSON.stringify(finalWireProduct(S.products.get(pid)))'));
 assert.deepEqual(wire.variants.map(v=>[v.sku,v.size_display]),[['RUB-LO-2х3','2×3 м'],['RUB-LO-3х4','3×4 м']],'one real SKU per size, no invented SKU');
 assert.equal(state(h,'n0').state,'MODERATION');assert.ok(state(h,'n0').reasons.some(r=>r.code==='price_unit'));
});
test('a READY model never has zero priced variants; one unpriced SKU of a priced model is published disabled, never with a price',()=>{
 const h=setup();
 card(h,'p-none','Куртка тестова Хуртовина','clothing_jackets',[['RUB-Z1','Олива',offer('Z-1',{cost:0,payout:0}),'M']]);
 const none=state(h,'p-none');assert.notEqual(none.state,'READY');
 card(h,'p-one','Куртка тестова Завірюха','clothing_jackets',[['RUB-G1','Олива',offer('G-1'),'M'],['RUB-G2','Олива',offer('G-2',{cost:0,payout:0}),'L']]);
 assert.equal(state(h,'p-one').state,'READY');h.ctx.pid='p-one';
 const bad=JSON.parse(h.run('JSON.stringify(finalWireProduct(S.products.get(pid)))')).variants.find(v=>v.sku==='RUB-G2');
 assert.equal(bad.price,null);assert.equal(bad.price_ready,false);assert.equal(bad.payment_allowed,false);assert.equal(bad.order_submission_allowed,false);
});
test('import path: M-WIN net rows of one supplier group become one model with W×H sizes in the same import; the per-m² row stays apart',async()=>{
 // Production channel: automatic MODEL → COLOR merges run during import (the review channel only proposes them).
 const h=createHarness({runtime:true,production:true});h.run('render=()=>{}');await h.run('Store.init()');h.run('PRODUCTION_MIGRATION.state="ready"');h.run(`Object.assign(S.cfg,OWNER_PRICE_POLICY);classificationEnable();S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};S.cfg.simple_mode_version=1;S.cfg.model_colors_version=MC_VERSION;S.cfg.suppliers.push({id:'${MWIN}',name:'M-WIN',auto:true,priority:1,terms:{priceType:'cost'}})`);
 const T='Маскувальна сітка M-Win Листя осінь. Маскування весна, літо, осінь.',row=(sku,title,sel,cost)=>[sku,title,'37469','Маскувальні сітки','https://rubizh.shop/media/'+sku+'.webp',cost,'Осіннє листя',DESC,'ОБЕРІТЬ РОЗМІР СІТКИ:: '+sel+(/х/.test(sel)?'\nШирина: '+sel.split('х')[0]+' м\nДовжина: '+sel.split('х')[1]+' м':'')];
 h.ctx.rows=[['Артикул','Название','Модель','Категория','Фото','Цена','Цвет','Описание','Характеристики'],row('LO-2х3',T+' 2х3 м (площа 6 кв.м.)','2х3',252),row('LO-3х4',T+' 3х4 м (площа 12 кв.м.)','3х4',504),row('0000LO',T+' індивідуального розміру (ціна за 1 кв.м.)','Індивідуальний розмір',42)];
 h.run(`S.imp={sup:'${MWIN}',file:'mwin.xml',rows,hdr:0,map:{sku:0,name:1,model:2,category:3,photos:4,cost:5,color:6,desc:7,attrs:8}}`);await h.run('doImport()');assert.equal(await h.run('applyImport()'),true);
 const models=JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>!p.archived).map(p=>({cat:p.canonical_category_id,v:p.variants.map(v=>[v.sku,v.size_status,v.size||""]).sort()})))'));
 const net=models.find(m=>m.v.length===2);assert.ok(net,JSON.stringify(models));assert.deepEqual(net.v.map(x=>x[2]).sort(),['2×3 м','3×4 м']);
 assert.equal(models.filter(m=>m.v.length===1).length,1,'the per-m² row is its own card');assert.equal(h.run('[...S.products.values()].reduce((n,p)=>n+p.variants.length,0)'),3,'no SKU invented');
});
test('one supplier group per colour (M-WIN antidrone nets): each colour\'s size cards become that colour\'s model; per-m² cards stay out; colour stays in the title',()=>{
 const h=mwinSetup(),T='Антидронова маскувальна сітка M-WIN';let n=0;
 const card=(colour,code,sel)=>{const id='a'+(++n),name=T+' '+colour+(/х/.test(sel)?' '+sel+' м (площа '+sel.split('х').reduce((a,b)=>a*b,1)+' кв.м.)':' індивідуального розміру (ціна за 1 кв.м.)');
  const p=net(h,id,name,'AD-'+code+'-'+n,sel,{source_model:code});h.ctx.pid=id;h.run(`S.products.get(pid).variants[0].camouflage=${JSON.stringify(colour)};classificationApplyProduct(S.products.get(pid))`);return id;};
 const px=[card('Піксель','80469','2х6'),card('Піксель','80469','3х4'),card('Піксель','80469','Індивідуальний розмір')];
 const mc=[card('Мультикам','5469','2х6'),card('Мультикам','5469','3х4'),card('Мультикам','5469','Індивідуальний розмір')];
 h.run('bumpData()');const plan=JSON.parse(h.run('JSON.stringify(mcPlan())'));
 const auto=plan.automatic.map(g=>({ids:g.ids,name:g.name}));
 assert.deepEqual(auto.map(g=>g.ids).sort(),[px.slice(0,2).sort(),mc.slice(0,2).sort()].sort(),JSON.stringify(plan.groups.map(g=>[g.ids,g.automatic,g.reasons])));
 assert.ok(auto.some(g=>/Піксель/.test(g.name))&&auto.some(g=>/Мультикам/.test(g.name)),JSON.stringify(auto));
 assert.ok(auto.every(g=>!/\d×\d|\dх\d|площа/.test(g.name)),'own sizes are not in the model name');
 h.run('mcMigrate()');assert.equal(state(h,px[2]).state,'MODERATION');assert.ok(state(h,px[2]).reasons.some(r=>r.code==='price_unit'));
});
