'use strict';
// Read-only control run on a private PIM backup: migration (preview → apply) in an isolated runtime, then the real
// READY / MODERATION / REJECTED decision for every product, reason histograms, timings of the owner screens and the
// real contract-3 wire export. All network disabled. The wire is written next to the private backup, never to Git.
// Usage: node audit/final-decision-control.cjs PRIVATE_BACKUP.json REPORT.json [WIRE_OUT.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {createHarness}=require('../app/tests/isolated-harness.cjs');
const [input,reportPath,wireOut]=process.argv.slice(2);if(!input||!reportPath)throw Error('Usage: final-decision-control.cjs BACKUP REPORT [WIRE]');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const bytes=fs.readFileSync(input),source=JSON.parse(bytes),h=createHarness({runtime:true,production:true}),timing={};
 const time=async(name,fn)=>{const t=performance.now();const r=await fn();timing[name]=Math.round(performance.now()-t);return r;};
 h.ctx.source=source;h.run('render=()=>{}');
 await time('store_init_ms',()=>h.run('Store.init()'));
 await h.run('releaseStorage.write(Store.db,[],releaseStorage.portableRows(source))');
 await time('production_load_ms',()=>h.run('productionLoad()'));
 await time('migration_preview_ms',()=>h.run('productionPreview()'));
 const applied=await time('migration_apply_ms',()=>h.run('productionApply()'));
 await time('restart_load_ms',()=>h.run('productionLoad()'));
 const decisions=await time('decisions_all_products_cold_ms',()=>h.run(`(()=>{const out=[];for(const p of S.products.values()){const d=finalDecision(p);out.push({id:p.id,state:d.state,codes:d.reasons.map(r=>r.code),variants:(p.variants||[]).length});}return out;})()`));
 await time('decisions_all_products_warm_ms',()=>h.run('finalCounts()'));
 // Performance caches must not change output: memoised description == uncached generator for every product.
 const memoMismatch=h.run('[...S.products.values()].filter(p=>simpleDescription(p)!==finalUncachedSimpleDescription(p)).length');
 await h.run('finalDerivedCacheSave()');h.run('FINAL_DESCRIPTION_MEMO.clear()');await time('restart_with_derived_cache_load_ms',()=>h.run('productionLoad()'));h.run('bumpData()');
 await time('decisions_after_restart_with_cache_ms',()=>h.run('for(const p of S.products.values())finalDecision(p)'));
 fs.writeFileSync(reportPath+'.partial',JSON.stringify({timing},null,1));
 h.run('bumpData()');// first screen measured cold, as on a fresh start
 for(const view of ['ready','moderation','rejected','import','backup'])await time('screen_'+view+'_ms',()=>h.run(`(()=>{S.view=${JSON.stringify(view)};finalRenderView();return true;})()`));
 const states={READY:0,MODERATION:0,REJECTED:0,ARCHIVED:0},reasons={REJECTED:{},MODERATION:{}},sku={READY:0,MODERATION:0,REJECTED:0,ARCHIVED:0};
 for(const d of decisions){states[d.state]++;sku[d.state]+=d.variants;if(reasons[d.state])for(const c of d.codes)reasons[d.state][c]=(reasons[d.state][c]||0)+1;}
 // Contract 3 needs pricing policy v1. Production never reprices at startup or migration; the approved policy
 // (OWNER_PRICE_POLICY 30 / 25 / 20, discount floor 15) is applied only by the owner's preview → apply on the
 // migrated store. Run exactly that owner path here (isolated copy) and report the price impact.
 const pricingBefore=h.run('pricingProtected()'),legacyMargins=h.run('({minMargin:S.cfg.minMargin,bigPriceFrom:S.cfg.bigPriceFrom,bigPriceMargin:S.cfg.bigPriceMargin,kitMargin:S.cfg.kitMargin,discountMarginFloor:S.cfg.discountMarginFloor??null})');let pricing=null;
 if(!pricingBefore){
  const before=h.run(`(()=>{const m={};for(const p of S.products.values())for(const v of p.variants||[])m[v.sku]=calc(p,v).price;return m;})()`);
  const preview=await time('price_policy_preview_ms',()=>h.run('SIMPLE_UI.pricePreview=simplePricePolicyPreview()'));
  await time('price_policy_apply_ms',()=>h.run('simpleApplyPricePolicy()'));
  const after=h.run(`(()=>{const m={};for(const p of S.products.values())for(const v of p.variants||[])m[v.sku]=calc(p,v).price;return m;})()`);
  const changed=Object.keys(before).filter(k=>before[k]!==after[k]),up=changed.filter(k=>after[k]>before[k]).length;
  const redo={READY:0,MODERATION:0,REJECTED:0,ARCHIVED:0},codes={REJECTED:{},MODERATION:{}};for(const d of h.run('[...S.products.values()].map(p=>{const d=finalDecision(p);return {state:d.state,codes:d.reasons.map(r=>r.code)};})')){redo[d.state]++;if(codes[d.state])for(const c of d.codes)codes[d.state][c]=(codes[d.state][c]||0)+1;}
  pricing={kind:'OWNER_PREVIEW_APPLY_APPROVED_POLICY_ON_ISOLATED_COPY',legacy_settings_in_backup:legacyMargins,applied:h.run('({minMargin:S.cfg.minMargin,bigPriceFrom:S.cfg.bigPriceFrom,bigPriceMargin:S.cfg.bigPriceMargin,kitMargin:S.cfg.kitMargin,discountMarginFloor:S.cfg.discountMarginFloor,pricing_policy_version:S.cfg.pricing_policy_version})'),
   preview_rows:preview.rows.length,sku_prices_checked:Object.keys(before).length,sku_prices_changed:changed.length,sku_prices_up:up,sku_prices_down:changed.length-up,
   examples:changed.slice(0,8).map(k=>({sku:k,before:before[k],after:after[k]})),safety_copy:!!(await h.run('Store.get("safety/before_pricing_30_25_20")')),decisions_after:redo,reasons_after:codes};
 }
 const wire=await time('wire_export_ms',()=>h.run('pimSiteWire()'));const wireText=JSON.stringify(wire);
 const avail={};for(const p of wire.products)for(const v of p.variants)avail[v.availability_status]=(avail[v.availability_status]||0)+1;
 const report={source:{sha256:hash(bytes),bytes:bytes.length,pimVersion:source.pimVersion||null,at:source.at||null},
  migration:{categories_after:applied.categories_after,LOST:Object.fromEntries(Object.entries(applied).filter(([k])=>k.startsWith('LOST_'))),PRODUCTION_WRITES:applied.PRODUCTION_WRITES??0},
  products:decisions.length,variants:decisions.reduce((n,d)=>n+d.variants,0),
  READY:states.READY,MODERATION:states.MODERATION,REJECTED:states.REJECTED,ARCHIVED:states.ARCHIVED,sku_by_state:sku,
  rejected_reasons:reasons.REJECTED,moderation_reasons:reasons.MODERATION,
  wire:{models:wire.products.length,variants:wire.products.reduce((n,p)=>n+p.variants.length,0),categories:wire.categories.length,hide_ids:wire.hide_ids.length,
   catalog_revision:wire.catalog_revision,category_catalog_hash:wire.category_catalog_hash,bytes:Buffer.byteLength(wireText),sha256:hash(wireText),availability:avail,
   envelope:Object.keys(wire).filter(k=>!['products','categories','hide_ids'].includes(k))},
  pricing_policy_v1_in_backup:pricingBefore,pricing:pricing,
  description_memo_mismatches:memoMismatch,
  timing_ms:timing,network_requests:h.requests?.length??0};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 if(wireOut){fs.writeFileSync(wireOut,wireText);fs.chmodSync(wireOut,0o600);}
 console.log(JSON.stringify({READY:report.READY,MODERATION:report.MODERATION,REJECTED:report.REJECTED,ARCHIVED:report.ARCHIVED,wire:report.wire.models,timing_ms:timing}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
