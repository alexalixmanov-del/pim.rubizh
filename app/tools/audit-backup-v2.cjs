#!/usr/bin/env node
'use strict';
// Offline source extraction reuses the verified PIM pricing implementation in an
// isolated VM. The harness forbids real networking; no browser database is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {createHarness}=require('../tests/isolated-harness.cjs'),V2=require('../lib/model-contract-v2.js');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
try{
 const input=get('--backup'),output=get('--output-dir');if(!input||!output)throw Error('Use --backup /private/backup.json --output-dir /private/new-directory');
 if(fs.statSync(input).size>256*1024*1024)throw Error('Backup exceeds 256 MiB');
 const out=path.resolve(output),root=path.resolve(__dirname,'..');
 fs.mkdirSync(out,{mode:0o700});const real=fs.realpathSync(out);if(real===root||real.startsWith(root+path.sep))throw Error('Output must be outside the application/web root');
 const raw=fs.readFileSync(input),backup=JSON.parse(raw);if(!['rubizh-pim-backup','pim-backup','pim-safety-backup'].includes(backup.format))throw Error('Unknown PIM backup format');
 const h=createHarness();h.ctx.backupInput=backup;h.run('S.cfg=Object.assign(structuredClone(DEFAULT_CFG),backupInput.cfg||{});S.products=new Map(backupInput.products.map(p=>[p.id,p]));rebuildIndex();bumpData();');
 const started=performance.now(),source=h.run('v2Source()'),registry=V2.draft(source),bundle=V2.build(source,registry);
 for(const [name,data] of Object.entries({'source.private.json':source,'mapping-draft.private.json':registry,'dry-run.private.json':bundle.report}))fs.writeFileSync(path.join(real,name),JSON.stringify(data),{flag:'wx',mode:0o600});
 const summary={backup_sha256:crypto.createHash('sha256').update(raw).digest('hex'),pim_code_baseline:'10.9.0 SIMPLE; explicit schema 2.0',counts:bundle.report.counts,summary:bundle.report.summary,errors:bundle.report.errors.length,unconfirmed_mappings:bundle.report.unconfirmed_mappings,ready_for_migration:bundle.report.ready_for_migration,canonical_ids_present:source.products.filter(p=>p.canonical_category_id).length,legacy_variant_ids_present:source.variants.filter(v=>v.legacy_variant_id).length,legacy_urls_present:source.products.filter(p=>p.legacy_urls.length).length,elapsed_ms:Math.round(performance.now()-started),source_bytes:fs.statSync(path.join(real,'source.private.json')).size,mapping_bytes:fs.statSync(path.join(real,'mapping-draft.private.json')).size,production_modified:false};
 fs.writeFileSync(path.join(real,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(summary));process.exitCode=summary.errors?2:0;
}catch(e){console.error(e.message);process.exitCode=1;}
