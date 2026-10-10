'use strict';
// Supplier profiles document exactly what the code applies: availability policy, size rules, supplier set.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const I=require('../lib/inventory-policy.js'),profiles=require('../contracts/supplier-profiles.v1.json');
const html=fs.readFileSync(path.join(__dirname,'../rubizh_pim.html'),'utf8');
test('five supplier profiles, each with every required field',()=>{
 assert.equal(profiles.suppliers.length,5);
 for(const p of profiles.suppliers)for(const k of ['supplier_id','name','format','file_identification','sku_source','cost_source','rrp_source','availability_source','availability_mode','availability_policy_id','size_source','color_source','group_source','model_family_evidence','confidence','known_exceptions'])assert.ok(p[k]!=null&&p[k]!=='',p.name+' '+k);
});
test('profile availability policy = the policy the code applies (no PREORDER from 0/нет anywhere)',()=>{
 for(const p of profiles.suppliers){const d=I.defaults[p.supplier_id];assert.ok(d,p.name);assert.equal(d.id,p.availability_policy_id);assert.equal(d.mode,p.availability_mode);assert.equal(d.confirmed,true,p.name);
  for(const raw of ['нет','0','-',''])assert.notEqual(I.resolve(d,{rawAvailability:raw}).availability_status,'PREORDER');}
});
test('profile size rules exist in the shipped application and are supplier-scoped',()=>{
 for(const p of profiles.suppliers)for(const id of p.size_rule_ids){const m=html.match(new RegExp("\\{id:'"+id+"'[^}]*supplier_id:'([^']+)'"));assert.ok(m,id);assert.equal(m[1],p.supplier_id);}
});
