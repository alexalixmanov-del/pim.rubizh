#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{supplierReconcile}=require('../lib/supplier-reconciliation-v2.cjs');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
try{
 const source=get('--source'),feeds=get('--feeds'),output=get('--output');if(!source||!feeds||!output)throw Error('Use --source /private/source.json --feeds /private/feeds.json --output /private/new-report.json');
 const read=file=>{if(fs.statSync(file).size>256*1024*1024)throw Error('Input exceeds 256 MiB');return JSON.parse(fs.readFileSync(file,'utf8'));};
 const out=path.resolve(output),root=path.resolve(__dirname,'..');fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});const parent=fs.realpathSync(path.dirname(out));if(parent===root||parent.startsWith(root+path.sep))throw Error('Output must be outside the application/web root');
 const report=supplierReconcile(read(source),read(feeds));fs.writeFileSync(path.join(parent,path.basename(out)),JSON.stringify(report),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({summary:report.summary,errors:report.errors.length,ready_for_migration:report.ready_for_migration,production_modified:false}));process.exitCode=report.errors.length?2:0;
}catch(error){console.error(error.message);process.exitCode=1;}
