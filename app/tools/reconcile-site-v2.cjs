#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{reconcile}=require('../lib/site-reconciliation-v2.cjs');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
try{
 const p=get('--pim-source'),s=get('--site-source'),o=get('--output');if(!p||!s||!o)throw Error('Use --pim-source /private/source.json --site-source /private/site.json --output /private/new-report.json');
 const read=f=>{if(fs.statSync(f).size>256*1024*1024)throw Error('Input exceeds 256 MiB');return JSON.parse(fs.readFileSync(f,'utf8'));};
 const out=path.resolve(o),root=path.resolve(__dirname,'..');fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});const parent=fs.realpathSync(path.dirname(out));if(parent===root||parent.startsWith(root+path.sep))throw Error('Output must be outside the web root');
 const r=reconcile(read(p),read(s));fs.writeFileSync(path.join(parent,path.basename(out)),JSON.stringify(r,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify({full_site_snapshot:r.full_site_snapshot,summary:r.summary,errors:r.errors.length,ready_for_migration:false,output:out}));process.exitCode=r.errors.length?2:0;
}catch(e){console.error(e.message);process.exitCode=1;}
