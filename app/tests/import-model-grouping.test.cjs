'use strict';
// Import: supplier group_id is the MODEL boundary (only while colour/size cells stay distinct); Prom size selector.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
async function imported(rows){
 const h=createHarness({runtime:true});h.run('render=()=>{}');await h.run('Store.init()');h.run('S.cfg.suppliers[0].auto=true');
 h.ctx.rows=[['SKU','Name','Size','Color','Model','Category','Photo','Stock','Cost'],...rows];
 h.run('S.imp={sup:"supplier-a",file:"feed.csv",rows,hdr:0,map:{sku:0,name:1,size:2,color:3,model:4,category:5,photos:6,stock:7,cost:8}}');
 await h.run('doImport()');assert.equal(await h.run('applyImport()'),true);return h;
}
const products=h=>JSON.parse(h.run('JSON.stringify([...S.products.values()].filter(p=>!p.archived).map(p=>({id:p.id,skus:p.variants.map(v=>v.size+"/"+v.color)})))'));
test('one supplier group_id with recognised sizes/colours becomes one MODEL even when names differ',async()=>{
 const h=await imported([
  ['RP-MC-S','Штани тактичні Raptor Мультикам S','S','Мультикам','20208','Штани','https://rubizh.shop/media/r1.webp',3,900],
  ['RP-MC-M','Штани тактичні Raptor Мультикам M','M','Мультикам','20208','Штани','https://rubizh.shop/media/r1.webp',3,900],
  ['RP-OL-M','Штани тактичні Raptor Олива M','M','Олива','20208','Штани','https://rubizh.shop/media/r2.webp',3,900]]);
 const list=products(h);assert.equal(list.length,1,JSON.stringify(list));assert.deepEqual(list[0].skus.sort(),['M/Мультикам','M/Олива','S/Мультикам']);
});
test('same group_id whose sizes the approved size rules do not recognise stays apart (no guessing)',async()=>{
 const h=await imported([
  ['ZL-2x3','Сітка маскувальна Зелене листя 2х3 м (площа 6 кв.м.)','2х3','Зелене листя','46469','Маскувальні сітки','https://rubizh.shop/media/n1.webp',3,250],
  ['ZL-2x4','Сітка маскувальна Зелене листя 2х4 м (площа 8 кв.м.)','2х4','Зелене листя','46469','Маскувальні сітки','https://rubizh.shop/media/n1.webp',3,330]]);
 assert.equal(products(h).length,2,'photos present → products created, not NO_PHOTOS');
});
test('sizes the approved size engine reads from the name (розмір L / XL) are distinct cells → one MODEL',async()=>{
 const h=await imported([
  ['KV-L','Кавер на шолом Мультикам розмір L','','Мультикам','6459','Кавери','https://rubizh.shop/media/k1.webp',3,500],
  ['KV-XL','Кавер на шолом Мультикам розмір XL','','Мультикам','6459','Кавери','https://rubizh.shop/media/k2.webp',3,500]]);
 const list=products(h);assert.equal(list.length,1);assert.deepEqual(list[0].skus.sort(),['L/Мультикам','XL/Мультикам']);
});
test('different supplier group_ids never merge by this rule',async()=>{
 const h=await imported([
  ['A-S','Футболка Test Олива','S','Олива','100','Футболки','https://rubizh.shop/media/a.webp',3,300],
  ['C-L','Футболка Test Олива','L','Олива','200','Футболки','https://rubizh.shop/media/c.webp',3,300]]);
 assert.equal(products(h).length,2);
});
test('Prom size selector param is the offer size; descriptive size attributes are not',()=>{
 const h=createHarness({runtime:true});h.ctx.DOMParser=appRequire('linkedom').DOMParser;
 h.ctx.text='<?xml version="1.0"?><yml_catalog><shop><offers>'+
  '<offer id="1" group_id="9" available="true"><vendorCode>ZL-2x3</vendorCode><name>Сітка 2х3</name><price>1</price><param name="ОБЕРІТЬ РОЗМІР СІТКИ:">2х3</param></offer>'+
  '<offer id="2" group_id="8" available="true"><vendorCode>BAG</vendorCode><name>Сумка</name><price>1</price><param name="Розмір в сумці">35х49х12 см</param></offer>'+
  '<offer id="3" group_id="7" available="true"><vendorCode>T-S</vendorCode><name>Футболка</name><price>1</price><param name="Розмір">S</param><param name="ОБЕРІТЬ РОЗМІР СІТКИ:">X</param></offer></offers></shop></yml_catalog>';
 const {rows}=h.run('parseYml(text)'),i=rows[0].indexOf('Размер'),a=rows[0].indexOf('Характеристики');
 assert.deepEqual(JSON.parse(JSON.stringify(rows.slice(1).map(r=>r[i]))),['2х3','','S']);assert.doesNotMatch(String(rows[1][a]),/ОБЕРІТЬ/);
});
