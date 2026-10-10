'use strict';
// Clean-import audit lines, written by catalog-reset-rehearsal.cjs right after the supplier imports (5th argument).
// One JSON line per product, queue entry and MODEL→COLOR plan group: supplier rows, evidence, decision and reasons.
// The file is private (supplier data); aggregates for Git are produced by audit/import-audit-report.py.
const fs=require('node:fs');
const LINE=`globalThis.__auditProduct=function(p){
 const d=finalDecision(p),id=mcIdentity(p),short=v=>typeof v==='string'&&v.length>160?v.slice(0,160):v;
 return {t:'product',id:p.id,archived:!!p.archived,merged_into:p.merged_into||null,name:p.name,model_name:p.model_name||null,title:finalTitle(p),brand:p.brand||'',
  category:p.category||'',canonical_category_id:p.canonical_category_id||null,category_review_status:p.category_review_status||null,suggested_category_id:p.category_suggestion_id||null,category_source:p.category_source||p.catSource||'',category_rule_id:p.category_rule_id||null,category_candidates:p.category_candidates||p.candidates||null,
  exceptions:(p.classification_exceptions||[]).filter(e=>e.status==='OPEN').map(e=>({kind:e.kind,tier:e.tier||null,code:e.reason_code||null,rule:e.rule_id||null,sku:e.variant_sku||null,candidate:typeof e.candidate==='string'?e.candidate:e.candidate?.category||e.candidate?.id||null})),
  state:d.state,reasons:d.reasons.map(r=>({code:r.code,evidence:r.evidence})),identity:{name:id.name,category:id.category,codes:id.codes,suppliers:id.suppliers,key:id.key},
  photos:finalUsablePhotos(p).length,colors:mcColors(p).map(c=>({key:c.key,color:c.color,camouflage:c.camouflage,photos:c.photos.length,skus:c.variant_skus})),
  variants:(p.variants||[]).map(v=>{const c=calc(p,v),a=classificationAvailability(p,v),pal=simplePalette(v);return {sku:v.sku,size:v.size||'',size_status:v.size_status||null,size_reason:v.size_reason||v.size_evidence?.reason||null,color:v.color||'',palette:{color:pal.color||null,camouflage:pal.camouflage||null,unknown:pal.unknown||[]},
   availability:a.availability,availability_reason:a.reason||a.code||null,price:c.price||0,cost:c.cost??null,rrp:c.rrp??null,minPrice:c.minPrice??null,margin:c.margin??null,
   offers:Object.entries(v.offers||{}).map(([sid,o])=>({sid,s:o.s,source_model:o.source_model||'',size_raw:o.size_raw||'',color_raw:o.color_raw||'',native_size:o.native_size||'',structured_size:o.structured_size??null,size_input_provenance:o.size_input_provenance||null,
    cat:o.supplier_category_raw||'',path:o.supplier_category_path_raw||'',sub:o.supplier_subcategory_raw||'',name:o.source_name||'',stock:o.stock??null,availability:o.availability||'',raw:o.rawAvailability||'',cost:o.cost,rrp:o.rrp,priceInput:o.priceInput??null,photos:(o.photos||[]).length,
    attrs:Object.fromEntries(Object.entries(o.source_attributes||{}).map(([k,x])=>[k,short(String(x))]))}))};})};
};
globalThis.__auditQueue=function(it){return {t:'queue',sup:it.sup,s:it.s,n:it.n,photos:(it.photos||[]).length,desc:String(it.source_description||'').trim().length,cost:it.cost??null,rrp:it.rrp??null,status:it.status||null,rejected_import:it.rejected_import||null,review:it.review||null,cat:it.cat||'',rcat:it.rcat||'',m:it.m||'',sz:it.sz||'',c:it.c||''};};`;
function writeDetail(h,file){
 const fd=fs.openSync(file,'w',0o600);const line=x=>fs.writeSync(fd,JSON.stringify(x)+'\n');
 try{
  h.run(LINE);
  line({t:'meta',suppliers:h.run('S.cfg.suppliers.map(s=>({id:s.id,name:s.name}))'),mappings:h.run('(S.cfg.supplier_category_mapping||[]).length'),
   categories:h.run('(S.cfg.canonical_categories||[]).map(c=>({id:c.id,path:canonicalPath(c.id),leaf:!!RubizhCategories.leaf(c.id,S.cfg.canonical_categories)}))')});
  // What each supplier category path says on its own (approved canonical aliases only) and what its products resolved to.
  line({t:'paths',rows:h.run(`(()=>{const m=new Map();for(const p of S.products.values())if(!p.archived)for(const v of p.variants||[])for(const [sid,o] of Object.entries(v.offers||{})){const raw=String(o.supplier_category_raw||''),path=String(o.supplier_category_path_raw||raw),k=sid+'\u0000'+raw+'\u0000'+path;if(!m.has(k))m.set(k,{sid,raw,path,sub:String(o.supplier_subcategory_raw||''),products:new Set(),confirmed:{},suggested:{}});const x=m.get(k);if(x.products.has(p.id))continue;x.products.add(p.id);if(p.canonical_category_id)x.confirmed[p.canonical_category_id]=(x.confirmed[p.canonical_category_id]||0)+1;else{const g=p.category_suggestion_id||'none';x.suggested[g]=(x.suggested[g]||0)+1;}}
   return [...m.values()].map(x=>({sid:x.sid,raw:x.raw,path:x.path,sub:x.sub,products:x.products.size,confirmed:x.confirmed,suggested:x.suggested,path_candidates:RubizhCategories.candidates(x.path||x.raw,S.cfg.canonical_categories,true).map(c=>c.id)}));})()`)});
  for(const g of h.run('mcPlan().groups.map(g=>({key:g.key,name:g.name,ids:g.ids,automatic:g.automatic,reasons:g.reasons,variants:g.variants,colors:g.colors}))'))line({t:'group',...g});
  for(const id of h.run('[...S.products.keys()]')){h.ctx.__auditId=id;fs.writeSync(fd,h.run('JSON.stringify(__auditProduct(S.products.get(__auditId)))')+'\n');}
  for(const k of h.run('[...S.queue.keys()]')){h.ctx.__auditId=k;fs.writeSync(fd,h.run('JSON.stringify(__auditQueue(S.queue.get(__auditId)))')+'\n');}
 }finally{fs.closeSync(fd);}
}
module.exports={writeDetail};
