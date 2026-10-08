#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),v2=require('../lib/model-contract-v2.js');
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
try{
 const sourcePath=get('--source'),mappingPath=get('--mapping'),output=get('--output');
 if(!sourcePath||!mappingPath||!output)throw Error('Usage: node tools/model-v2-dry-run.cjs --source /private/source.json --mapping /private/mapping.json --output /private/new-report-directory');
 const read=p=>{if(fs.statSync(p).size>256*1024*1024)throw Error('Input exceeds 256 MiB');return JSON.parse(fs.readFileSync(p,'utf8'));};
 const source=read(sourcePath),registry=read(mappingPath),bundle=v2.build(source,registry),out=path.resolve(output),app=path.resolve(__dirname,'..');
 if(out===app||out.startsWith(app+path.sep))throw Error('Output must be outside the application/web root');
 fs.mkdirSync(out,{mode:0o700});
 for(const [name,data] of Object.entries({'dry-run.json':bundle.report,'models.private.json':bundle,'legacy-mapping.private.json':bundle.legacy_mapping,'models.public.json':v2.publicExport(bundle)}))fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({ready_for_migration:bundle.report.ready_for_migration,summary:bundle.report.summary,errors:bundle.report.errors.length,warnings:bundle.report.warnings.length,source_sha256:crypto.createHash('sha256').update(v2.stable(source)).digest('hex'),output:out}));process.exitCode=bundle.report.ready_for_migration?0:2;
}catch(e){console.error(e.message);process.exitCode=1;}
