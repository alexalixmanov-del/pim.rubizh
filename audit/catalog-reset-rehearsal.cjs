'use strict';
// Staging rehearsal of the full catalog reset on a private PIM backup, all network disabled:
// migration → approved price policy (owner path) → reset → every supplier file through the shipped import pipeline
// (saved supplier mapping) → quality checks → contract-3 wire. Writes an aggregate report and the private wire.
// Usage: node audit/catalog-reset-rehearsal.cjs BACKUP.json SOURCES.json REPORT.json WIRE.json
//   SOURCES.json: [{"supplier_id":"…","file":"/private/…"}] in import order
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {createHarness,appRequire}=require('../app/tests/isolated-harness.cjs');
const [backupPath,sourcesPath,reportPath,wirePath]=process.argv.slice(2);if(!wirePath)throw Error('Usage: BACKUP SOURCES REPORT WIRE');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const bytes=fs.readFileSync(backupPath),source=JSON.parse(bytes),h=createHarness({runtime:true,production:true}),timing={};
 const time=async(k,fn)=>{const t=performance.now();const r=await fn();timing[k]=Math.round(performance.now()-t);return r;};
 h.ctx.XLSX=require('../app/vendor/xlsx-0.20.3.min.js');h.ctx.DOMParser=appRequire('linkedom').DOMParser;
 h.ctx.source=source;h.run('render=()=>{}');await h.run('Store.init()');
 await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(source))');await h.run('productionLoad()');
 await time('migration_ms',async()=>{await h.run('productionPreview()');await h.run('productionApply()');});
 h.run('SIMPLE_UI.pricePreview=simplePricePolicyPreview()');await h.run('simpleApplyPricePolicy()');
 const cfgKeep=()=>JSON.parse(h.run(`JSON.stringify({categories:(S.cfg.canonical_categories||[]).length,suppliers:S.cfg.suppliers.map(s=>({id:s.id,name:s.name,auto:s.auto,mapping:s.mapping,fulfillment:s.fulfillment})),catMap:S.cfg.catMap,catRules:S.cfg.catRules,colorMap:S.cfg.colorMap,sizeMap:S.cfg.sizeMap,brandMap:S.cfg.brandMap,supplierAliases:S.cfg.supplierAliases,pricing:[S.cfg.pricing_policy_version,S.cfg.minMargin,S.cfg.bigPriceFrom,S.cfg.bigPriceMargin,S.cfg.kitMargin,S.cfg.discountMarginFloor],inventory_policy_version:S.cfg.inventory_policy_version,classification_version:S.cfg.classification_version,model_colors_version:S.cfg.model_colors_version,nextSku:S.cfg.nextSku})`));
 const keepBefore=cfgKeep(),before={products:h.run('S.products.size'),skus:h.run('[...S.products.values()].reduce((n,p)=>n+p.variants.length,0)')};
 const plan=h.run('finalCatalogResetPreview()');h.ctx.plan=plan;
 const reset=await time('reset_ms',()=>h.run('finalCatalogReset(plan,FINAL_RESET_CONFIRM)'));
 await h.run('productionLoad()');
 const after={products:h.run('S.products.size'),skus:h.run('[...S.products.values()].reduce((n,p)=>n+p.variants.length,0)'),queue:h.run('S.queue.size'),content:h.run('S.content.size')};
 const keepAfter=cfgKeep(),keptIdentical=JSON.stringify(keepBefore)===JSON.stringify(keepAfter);
 // Imports: original supplier files, saved mapping of each supplier, the same calls the ИМПОРТ screen makes.
 const imports=[],sourceSkus=new Map();
 for(const src of JSON.parse(fs.readFileSync(sourcesPath,'utf8'))){
  const file=fs.readFileSync(src.file),name=path.basename(src.file);h.ctx.download={blob:new Blob([file]),url:'https://import.invalid/'+encodeURIComponent(name)};h.ctx.supId=src.supplier_id;
  const t0=performance.now();
  const parsed=await h.run('workflowParseSource(download,S.cfg.suppliers.find(s=>s.id===supId))');h.ctx.parsed=parsed;
  h.run('S.imp={sup:supId,file:download.url.split("/").pop(),rows:parsed.rows,hdr:parsed.hdr,sheet:parsed.sheet,sheets:parsed.sheets,wb:parsed.wb||null,zero:true,xml:parsed.sheet==="XML"};remap()');
  const map=h.run('Object.fromEntries(Object.entries(S.imp.map).map(([k,i])=>[k,String(S.imp.rows[S.imp.hdr][i])]))');
  const skuCol=h.run('S.imp.map.sku');sourceSkus.set(src.supplier_id,new Set(parsed.rows.slice(parsed.hdr+1).map(r=>String(r[skuCol]??'').trim()).filter(Boolean)));
  await h.run('doImport()');const applied=await h.run('applyImport()');
  imports.push({supplier_id:src.supplier_id,file_sha256:sha(file),rows:parsed.rows.length-parsed.hdr-1,mapped:map,applied,ms:Math.round(performance.now()-t0),products_after:h.run('S.products.size'),queue_after:h.run('S.queue.size')});
 }
 // Quality checks on the new catalog.
 const q=h.run(`(()=>{
  const out={models:0,skus:0,duplicate_model_ids:0,duplicate_skus:0,duplicate_supplier_bindings:(S.dupLinks||[]).length,same_name_brand_models:0,
   skus_without_supplier_offer:0,offers_not_in_source:0,variants_sharing_one_supplier_sku:0,
   multi_color_models:0,colors:0,colors_without_photos:0,photos_shared_between_colors:0,models_without_usable_photo:0,
   size_status:{},size_options:0,without_category:0,price_zero_ready_skus:0,margin_blocked_skus:0,availability:{},by_supplier:{},
   decisions:{READY:0,MODERATION:0,REJECTED:0,ARCHIVED:0},reasons:{REJECTED:{},MODERATION:{}},queue:{total:S.queue.size,rejected_import:{}}};
  const skuSeen=new Map(),nameSeen=new Map(),offerSeen=new Map();
  for(const p of S.products.values()){out.models++;
   const nk=(finalTitle(p)||p.name||'').toLowerCase().trim()+'|'+(p.brand||'').toLowerCase();nameSeen.set(nk,(nameSeen.get(nk)||0)+1);
   const d=finalDecision(p);out.decisions[d.state]++;if(out.reasons[d.state])for(const r of d.reasons)out.reasons[d.state][r.code]=(out.reasons[d.state][r.code]||0)+1;
   if(!p.canonical_category_id)out.without_category++;
   if(!finalUsablePhotos(p).length)out.models_without_usable_photo++;
   const colors=mcColors(p);out.colors+=colors.length;if(colors.length>1)out.multi_color_models++;
   const photoOwners=new Map();for(const c of colors){if(!c.photos.length)out.colors_without_photos++;for(const u of c.photos)photoOwners.set(u,(photoOwners.get(u)||0)+1);}
   for(const n of photoOwners.values())if(n>1)out.photos_shared_between_colors++;
   out.size_options+=classificationOptions(p).length;
   for(const v of p.variants){out.skus++;skuSeen.set(v.sku,(skuSeen.get(v.sku)||0)+1);
    const offers=Object.entries(v.offers||{});if(!offers.length)out.skus_without_supplier_offer++;
    for(const [sid,o] of offers){const k=sid+'|'+o.s;offerSeen.set(k,(offerSeen.get(k)||0)+1);const bs=out.by_supplier[sid]||(out.by_supplier[sid]={skus:0,availability:{}});bs.skus++;
     const a=classificationAvailability(p,v).availability;bs.availability[a]=(bs.availability[a]||0)+1;}
    out.size_status[v.size_status||'NONE']=(out.size_status[v.size_status||'NONE']||0)+1;
    const a=classificationAvailability(p,v).availability;out.availability[a]=(out.availability[a]||0)+1;
    const c=calc(p,v),m=modelVariant(p,v);if(m.margin_blocked)out.margin_blocked_skus++;if(d.state==='READY'&&!(c.price>0))out.price_zero_ready_skus++;}
  }
  for(const n of skuSeen.values())if(n>1)out.duplicate_skus+=n-1;
  for(const n of offerSeen.values())if(n>1)out.variants_sharing_one_supplier_sku+=n-1;
  for(const n of nameSeen.values())if(n>1)out.same_name_brand_models+=n-1;
  for(const it of S.queue.values()){const r=it.rejected_import?.reason||it.status||'OPEN';out.queue.rejected_import[r]=(out.queue.rejected_import[r]||0)+1;}
  return out;})()`);
 // Offers must come from the files just imported (no carry-over from the old catalog).
 q.offers_not_in_source=h.run('[...S.products.values()].flatMap(p=>p.variants.flatMap(v=>Object.entries(v.offers||{}).map(([sid,o])=>[sid,String(o.s??"").trim()])))').filter(([sid,s])=>!sourceSkus.get(sid)?.has(s)).length;
 const wire=await time('wire_export_ms',()=>h.run('pimSiteWire()'));const wireText=JSON.stringify(wire);fs.writeFileSync(wirePath,wireText);fs.chmodSync(wirePath,0o600);
 const wireSkus=wire.products.flatMap(p=>p.variants.map(v=>v.sku));
 const report={source_backup_sha256:sha(bytes),before,reset:{removed:reset.removed,backup_sha256:reset.backup?.sha256||null},after,kept_identical:keptIdentical,kept:{categories:keepAfter.categories,suppliers:keepAfter.suppliers.length,pricing:keepAfter.pricing,inventory_policy_version:keepAfter.inventory_policy_version,next_sku:keepAfter.nextSku},
  imports,quality:q,wire:{models:wire.products.length,skus:wireSkus.length,duplicate_skus:wireSkus.length-new Set(wireSkus).size,categories:wire.categories.length,hide_ids:wire.hide_ids.length,catalog_revision:wire.catalog_revision,sha256:sha(wireText)},timing_ms:timing,network_requests:h.requests?.length??0};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({PIM_PRODUCTS:q.models,PIM_SKU:q.skus,...q.decisions,DUPLICATE_SKU:q.duplicate_skus,wire_models:wire.products.length},null,0));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
