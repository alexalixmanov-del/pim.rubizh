#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),V2=require('../lib/model-contract-v2.js'),{reconcile,prepareReconciledSource}=require('../lib/site-reconciliation-v2.cjs');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
try{
 const p=get('--pim-source'),s=get('--site-source'),o=get('--output');if(!p||!s||!o)throw Error('Use --pim-source /private/source.json --site-source /private/site.json --output /private/new-report.json');
 const read=f=>{if(fs.statSync(f).size>256*1024*1024)throw Error('Input exceeds 256 MiB');return JSON.parse(fs.readFileSync(f,'utf8'));};
 const out=path.resolve(o),root=path.resolve(__dirname,'..');fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});const parent=fs.realpathSync(path.dirname(out));if(parent===root||parent.startsWith(root+path.sep))throw Error('Output must be outside the web root');
 const pim=read(p),site=read(s),r=reconcile(pim,site);fs.writeFileSync(path.join(parent,path.basename(out)),JSON.stringify(r,null,2),{mode:0o600,flag:'wx'});
 let preparation=null;
 const directory=get('--prepare-dir');
 if(directory){
  const target=path.resolve(directory);fs.mkdirSync(target,{mode:0o700});const real=fs.realpathSync(target);if(real===root||real.startsWith(root+path.sep))throw Error('Prepared source must be outside the web root');
  const source=prepareReconciledSource(pim,site),registry=V2.draft(source),bundle=V2.build(source,registry);
  if(bundle.report.errors.length)throw Error('Prepared source failed validator: '+bundle.report.errors[0].code);
  for(const [name,data] of Object.entries({'source.private.json':source,'mapping-draft.private.json':registry,'dry-run.private.json':bundle.report}))fs.writeFileSync(path.join(real,name),JSON.stringify(data),{mode:0o600,flag:'wx'});
  preparation={directory:real,counts:bundle.report.counts,loss:bundle.report.summary,unconfirmed_mappings:bundle.report.unconfirmed_mappings,ready_for_migration:bundle.report.ready_for_migration};
 }
 console.log(JSON.stringify({full_site_snapshot:r.full_site_snapshot,integrity:r.integrity,summary:r.summary,photo_summary:r.photo_summary,errors:r.errors.length,ready_for_migration:false,preparation,output:out}));process.exitCode=r.errors.length?2:0;
}catch(e){console.error(e.message);process.exitCode=1;}
