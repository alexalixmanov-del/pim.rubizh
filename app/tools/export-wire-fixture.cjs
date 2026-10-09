// Runs the real PIM exporter (pimSiteWire) on a representative catalog and writes the exact wire fixture.
// Catalog input is synthetic and labelled as such; the envelope, field names and values come from the shipped exporter.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createHarness}=require('../tests/isolated-harness.cjs');
const out=process.argv[2]||path.join(__dirname,'../contracts/fixtures/pim-site-wire-v3.exact.json');
const FIXED_NOW=Date.parse('2026-10-09T12:00:00Z');
function build(){
 const h=createHarness({runtime:true,production:true});
 h.ctx.Date=class extends Date{constructor(...a){super(...(a.length?a:[FIXED_NOW]));}static now(){return FIXED_NOW;}};
 h.run('render=()=>{};Object.assign(S.cfg,OWNER_PRICE_POLICY);S.cfg.simple_mode_version=1;S.cfg.model_colors_version=1;S.cfg.category_engine={version:RubizhCategories.VERSION,migration_validated:true};');
 h.run(`S.cfg.suppliers=[
  {id:'sf0t3l7jegf9',name:'M-WIN',auto:false,priority:3,terms:{priceType:'cost'}},
  {id:'s2akya7xoafn',name:'UKR-TEC',auto:false,priority:2,terms:{priceType:'cost'}},
  {id:'s4p9slmnn0ki',name:'Tactical Belt',auto:false,priority:1,terms:{priceType:'cost'}}];classificationEnable();`);
 const at=FIXED_NOW-6*3600000,img=n=>'https://rubizh.shop/media/fixture/'+n+'.webp';
 const offer=(sid,s,cost,raw,extra={})=>({[sid]:{s,cost,payout:cost,rawAvailability:raw,availability:raw==='нет'||raw==='-'?'out':'in',at,stock_observed_at:at,stock_observation_provenance:'SUPPLIER_FIELD',inventory_source_column:sid==='s2akya7xoafn'?'Наявність':'Наличие',...extra}});
 const jacket={id:'m-jacket',name:'Куртка Fixture Softshell',brand:'FIXTURE',canonical_category_id:'clothing_jackets',category_locked:true,desc:'<p>Софтшел куртка. Матеріал: поліестер.</p>',attrs:{Матеріал:'Поліестер'},photos:[],pub:true,catSource:'manual',fieldMeta:{},variants:[
  {sku:'RUB-F0001',size:'M',color:'Чорний',photos:[img('jacket-black-1'),img('jacket-black-2')],offers:offer('sf0t3l7jegf9','MW-J-BK-M',1800,'есть')},
  {sku:'RUB-F0002',size:'L',color:'Чорний',photos:[img('jacket-black-1'),img('jacket-black-2')],offers:offer('sf0t3l7jegf9','MW-J-BK-L',1800,'есть')},
  {sku:'RUB-F0003',size:'L',color:'Олива',photos:[img('jacket-olive-1')],offers:offer('sf0t3l7jegf9','MW-J-OL-L',1800,'есть')},
  {sku:'RUB-F0004',size:'XL',color:'Олива',photos:[img('jacket-olive-1')],offers:offer('sf0t3l7jegf9','MW-J-OL-XL',1800,'нет')}]};
 const pants={id:'m-pants',name:'Штани Fixture Field',brand:'FIXTURE',canonical_category_id:'clothing_pants',category_locked:true,desc:'<p>Польові штани. Розміри 42–60.</p>',attrs:{Матеріал:'Ріп-стоп'},photos:[img('pants-1')],pub:true,catSource:'manual',fieldMeta:{},variants:[
  {sku:'RUB-F0010',size:'',color:'Мультикам',offers:offer('sf0t3l7jegf9','MW-P-MC',1200,'есть',{source_name:'Штани Fixture Field',source_description:'Розміри 42–60. Матеріал: ріп-стоп.',size_raw:'42–60',photos:[img('pants-1')]})}]};
 const tec={id:'m-pouch',name:'Підсумок Fixture Utility',brand:'FIXTURE',canonical_category_id:'bags_backpacks',category_locked:true,desc:'<p>Рюкзак 25 л. Матеріал: кордура.</p>',attrs:{'Об’єм':'25 л'},photos:[img('pack-1')],pub:true,catSource:'manual',fieldMeta:{},variants:[
  {sku:'RUB-F0020',size:'',color:'Койот',photos:[img('pack-coyote-1')],offers:offer('s2akya7xoafn','UT-P-CY',900,'3')},
  {sku:'RUB-F0021',size:'',color:'Чорний',photos:[img('pack-black-1')],offers:offer('s2akya7xoafn','UT-P-BK',900,'!')}]};
 const belt={id:'m-belt',name:'Ремінь Fixture Duty',brand:'FIXTURE',canonical_category_id:'clothing_belts',category_locked:true,desc:'<p>Тактичний ремінь. Ширина 45 мм.</p>',attrs:{Ширина:'45 мм'},photos:[img('belt-1')],pub:true,catSource:'manual',fieldMeta:{},variants:[
  {sku:'RUB-F0030',size:'',color:'Чорний',offers:offer('s4p9slmnn0ki','TB-D-BK',700,'12',{stock:12})}]};
 for(const p of [jacket,pants,tec,belt])h.add(p);
 h.run('for(const p of S.products.values())classificationApplyProduct(p);rebuildIndex();bumpData();');
 return h;
}
const h=build(),wire=JSON.parse(JSON.stringify(h.run('pimSiteWire()'))),decisions=JSON.parse(JSON.stringify(h.run('[...S.products.values()].map(p=>({id:p.id,state:finalDecision(p).state,reasons:finalDecision(p).reasons.map(r=>r.code)}))')));
const text=JSON.stringify(wire,null,2)+'\n';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,text);
const manifest={generator:'app/tools/export-wire-fixture.cjs',exporter:'pimSiteWire() in app/lib/final-workflow.inc.js',catalog_input:'SYNTHETIC_REPRESENTATIVE (not owner data)',envelope:'products',sha256:crypto.createHash('sha256').update(text).digest('hex'),products:wire.products.length,skus:wire.products.reduce((n,p)=>n+p.variants.length,0),decisions};
fs.writeFileSync(out.replace(/\.json$/,'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,1));
