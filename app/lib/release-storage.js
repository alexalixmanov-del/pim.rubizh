(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RubizhReleaseStorage=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DATABASE='rubizh_pim_v7_launch',BACKUP_DATABASE='rubizh_pim_release_backups_v1',FORMAT='rubizh-pim-production-snapshot',VERSION=1;
function rowText(rows){return JSON.stringify([...rows].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),(_,v)=>typeof Blob!=='undefined'&&v instanceof Blob?{__blob_metadata:true,size:v.size,type:v.type}:v);}
async function digest(text){const b=typeof text==='string'?new TextEncoder().encode(text):text;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function capture(db){return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').getAll();let rows;req.onsuccess=()=>rows=req.result;tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(tx.error||Error('CAPTURE_FAILED'));});}
function write(db,expected,puts,dels=[]){const text=rowText(expected);return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),st=tx.objectStore('kv');let failure;const req=st.getAll();req.onsuccess=()=>{if(rowText(req.result)!==text){failure=Error('STALE_MIGRATION: дані змінила інша вкладка');tx.abort();return;}for(const row of puts)st.put(row);for(const key of dels)st.delete(key);};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('MIGRATION_TRANSACTION_ABORTED'));});}
async function encode(rows,local,metadata={}){
 const binaries=[];const json=JSON.stringify({format:FORMAT,v:VERSION,database:DATABASE,at:Date.now(),metadata,local_storage:local,rows},(_,v)=>{if(typeof Blob!=='undefined'&&v instanceof Blob){const i=binaries.length;binaries.push(v);return {__pim_blob_ref:i,size:v.size,type:v.type};}return v;});
 const data=JSON.parse(json);data.binaries=[];for(const blob of binaries){const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));data.binaries.push({base64:btoa(s),sha256:await digest(bytes)});}
 return JSON.stringify(data);
}
async function decode(text){
 const data=JSON.parse(text);if(data.format!==FORMAT||data.v!==VERSION||data.database!==DATABASE||!Array.isArray(data.rows)||new Set(data.rows.map(x=>x.key)).size!==data.rows.length)throw Error('INVALID_FULL_BACKUP');
 const blobs=[];for(const b of data.binaries||[]){const s=atob(b.base64),bytes=Uint8Array.from(s,c=>c.charCodeAt(0));if(await digest(bytes)!==b.sha256)throw Error('CORRUPT_BACKUP_BINARY');blobs.push(bytes);}
 const revived=JSON.parse(JSON.stringify(data),(_,v)=>{if(v&&Object.hasOwn(v,'__pim_blob_ref')){const bytes=blobs[v.__pim_blob_ref];if(!bytes||bytes.length!==v.size)throw Error('INVALID_BLOB_REFERENCE');return new Blob([bytes],{type:v.type});}return v;});
 if(revived.metadata.source_sha256&&await digest(rowText(revived.rows))!==revived.metadata.source_sha256)throw Error('CORRUPT_BACKUP_ROWS');return revived;
}
function openBackups(){return new Promise((resolve,reject)=>{const req=indexedDB.open(BACKUP_DATABASE,1);req.onupgradeneeded=()=>req.result.createObjectStore('backups',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveBackup(backup){const db=await openBackups();try{await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');tx.objectStore('backups').add(backup);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('BACKUP_FAILED'));});const loaded=await getBackup(backup.id);if(!loaded||loaded.sha256!==backup.sha256||await digest(await loaded.blob.arrayBuffer())!==backup.sha256)throw Error('BACKUP_READBACK_FAILED');return loaded;}finally{db.close();}}
async function getBackup(id){const db=await openBackups();try{return await new Promise((resolve,reject)=>{const req=db.transaction('backups','readonly').objectStore('backups').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}}
async function readBackup(row){if(!row||await digest(await row.blob.arrayBuffer())!==row.sha256)throw Error('BACKUP_CHECKSUM_FAILED');const text=row.gz?await new Response(row.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await row.blob.text();return decode(text);}
function gates(cfg){if(cfg.siteApi)cfg.siteApi.auto=false;cfg.sync_enabled=false;cfg.autoprices_enabled=false;for(const s of cfg.suppliers||[])if(s.source){s.source.enabled=false;s.source.autoApply=false;}return cfg;}
async function rollback(db,snapshot,{localStorage:ls=null,operationalGates=true,bumpRevision=true}={}){
 const current=await capture(db),rows=structuredClone(snapshot.rows),config=rows.find(x=>x.key==='meta/config');if(config&&operationalGates)gates(config.data);
 const revision=current.find(x=>x.key==='sync/local_revision')?.data||0;const row=rows.find(x=>x.key==='sync/local_revision');if(bumpRevision){if(row)row.data=revision+1;else rows.push({key:'sync/local_revision',data:revision+1});}
 const keys=new Set(rows.map(x=>x.key));await write(db,current,rows,current.filter(x=>!keys.has(x.key)).map(x=>x.key));
 // The current CAS version map must survive rollback: remote rows may already contain the migration.
 if(ls){const known=ls.getItem('rubizh_sb_known'),pending=new Set(JSON.parse(ls.getItem('rubizh_sb_pending')||'[]'));if(!snapshot.metadata?.portable)for(const key of Array.from({length:ls.length},(_,i)=>ls.key(i)).filter(Boolean))if(!['rubizh_sb_known','rubizh_sb_pending'].includes(key)&&!Object.hasOwn(snapshot.local_storage||{},key))ls.removeItem(key);for(const key of Object.keys(snapshot.local_storage||{}))if(!['rubizh_sb_known','rubizh_sb_pending'].includes(key))ls.setItem(key,snapshot.local_storage[key]);for(const r of [...current,...rows])if(!/^(autobak\/|autobak_meta\/|safety\/|docfile\/|sync\/|auth\/)/.test(r.key))pending.add(r.key);if(known!=null)ls.setItem('rubizh_sb_known',known);ls.setItem('rubizh_sb_pending',JSON.stringify([...pending]));}
 return {catalog_restored:true,operational_gates:{SYNC_ENABLED:false,AUTOPRICES_ENABLED:false},revision:revision+1};
}
function openDatabase(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DATABASE,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv',{keyPath:'key'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function portableRows(d){
 if(!['rubizh-pim-backup','pim-backup','pim-safety-backup'].includes(d.format)||!d.cfg||!Array.isArray(d.products)||!d.products.length)throw Error('INVALID_PORTABLE_BACKUP');
 const rows=[{key:'meta/config',data:structuredClone(d.cfg)}];
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
 for(const [prefix,field,items,id] of [['cat','products',d.products,'id'],['queue','items',d.queue||[],'k'],['content','items',d.content||[],'k']]){const seen=new Set(),buckets=new Map();for(const p of items){if(!p[id]||seen.has(p[id]))throw Error('DUPLICATE_OR_MISSING_ID');seen.add(p[id]);const key=prefix+'/b'+String(hash(p[id])%256).padStart(2,'0');if(!buckets.has(key))buckets.set(key,{});buckets.get(key)[p[id]]=structuredClone(p);}for(const [key,values] of buckets)rows.push({key,data:{[field]:values}});}
 for(const [i,x] of (d.logs||[]).entries())rows.push({key:'logs/'+(x.id||'restored-'+i),data:structuredClone(x)});
 rows.push({key:'docs/index',data:structuredClone(d.docs||[])});
 for(const doc of d.docs||[]){const b=d.docFiles?.[doc.id];if(!b)throw Error('FULL_DOCUMENT_BACKUP_REQUIRED: '+doc.id);const bytes=Uint8Array.from(atob(b.b64),c=>c.charCodeAt(0));rows.push({key:'docfile/'+doc.id,data:{blob:new Blob([bytes],{type:b.mime||doc.mime||'application/octet-stream'})}});}
 for(const x of d.massLogs||[])rows.push({key:'masslog/'+x.id,data:structuredClone(x)});if(d.massLogIndex)rows.push({key:'masslog_meta/index',data:structuredClone(d.massLogIndex)});
 if(new Set(rows.map(r=>r.key)).size!==rows.length)throw Error('DUPLICATE_BACKUP_KEYS');return rows;
}
async function readFile(file){const gzip=new Uint8Array(await file.slice(0,2).arrayBuffer());const text=gzip[0]===31&&gzip[1]===139?await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text():await file.text();const d=JSON.parse(text);return d.format===FORMAT?decode(text):{format:FORMAT,v:VERSION,database:DATABASE,rows:portableRows(d),local_storage:{},metadata:{portable:true}};}
return {DATABASE,BACKUP_DATABASE,FORMAT,VERSION,openDatabase,portableRows,readFile,rowText,digest,capture,write,encode,decode,saveBackup,getBackup,readBackup,gates,rollback};
});
