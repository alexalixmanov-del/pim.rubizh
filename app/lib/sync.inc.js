async function rememberSiteCredentials105(cfg){
 if(cfg?.siteApi?.key)await Store._set0('auth/site_credentials',{url:cfg.siteApi.url||'',key:cfg.siteApi.key});
}
async function syncedConfig105(cfg){await rememberSiteCredentials105(cfg);return sanitizePortableConfig(cfg);}
async function receiveConfig105(cfg){
 const clean=sanitizePortableConfig(cfg),auth=await Store._get0('auth/site_credentials');
 if(auth?.key&&auth.url===(clean.siteApi?.url||''))clean.siteApi={...clean.siteApi,key:auth.key};
 return clean;
}
async function applyRemote105(puts,dels,revision){
 const next=revision+1;
 if(!Store.db){await Store._batch0([...puts,['sync/local_revision',next]],dels);return next;}
 await new Promise((resolve,reject)=>{
  const tx=Store.db.transaction('kv','readwrite'),st=tx.objectStore('kv');let error;
  const read=st.get('sync/local_revision');read.onsuccess=()=>{
   if((+read.result?.data||0)!==revision){error=Error('Локальну базу змінила інша вкладка під час синхронізації. Повторіть завантаження.');tx.abort();return;}
   for(const [key,data] of puts)st.put({key,data});for(const key of dels)st.delete(key);st.put({key:'sync/local_revision',data:next});
  };
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(error||tx.error||Error('Синхронізацію не збережено'));
 });return next;
}
async function sbPull(full=false){
 const known=full?{}:lsGet(SB_LS.known,{}),pending=sbPending();
 if(full&&pending.size)throw Error('Спочатку збережіть та синхронізуйте локальні зміни або зробіть їх окрему копію');
 const revision=+(await Store._get0('sync/local_revision'))||0;
 const readList=async()=>{const list=[];for(let off=0;;off+=1000){const rows=await sbJson(`/rest/v1/pim_kv?select=key,updated_at&order=key.asc&limit=1000&offset=${off}`);if(!Array.isArray(rows))throw Error('Невірний список бази сервера');list.push(...rows);if(rows.length<1000)break;}return list.filter(r=>!SB_LOCAL_ONLY.test(r.key));};
 const list=await readList(),versions=new Map();
 for(const row of list){if(typeof row.key!=='string'||!row.updated_at||versions.has(row.key))throw Error('Неповний або повторний ключ бази сервера');versions.set(row.key,row.updated_at);}
 const need=list.filter(r=>known[r.key]!==r.updated_at&&!pending.has(r.key)).map(r=>r.key),staged=[],received=new Set();
 for(let i=0;i<need.length;i+=15){
  const batch=need.slice(i,i+15),rows=await sbJson(`/rest/v1/pim_kv?select=key,data,updated_at&key=${encodeURIComponent(sbIn(batch))}`);
  if(!Array.isArray(rows)||rows.length!==batch.length)throw Error('Сервер повернув неповну базу; локальні дані збережено');
  for(const row of rows){if(!batch.includes(row.key)||received.has(row.key)||row.updated_at!==versions.get(row.key))throw Error('База на сервері змінилася під час завантаження; повторіть синхронізацію');received.add(row.key);staged.push(row);}
 }
 if(full){const again=await readList();if(again.length!==list.length||again.some(r=>versions.get(r.key)!==r.updated_at))throw Error('База на сервері змінилася; локальну копію не замінено');if(sbPending().size)throw Error('Під час завантаження з’явилися локальні зміни; заміну скасовано');}
 await rememberSiteCredentials105(await Store._get0('meta/config'));
 const nowPending=sbPending(),rows=staged.filter(r=>!nowPending.has(r.key)),puts=[],dels=[];
 for(const row of rows){if(row.data==null)dels.push(row.key);else puts.push([row.key,row.key==='meta/config'?await receiveConfig105(row.data):row.data]);}
 if(full)for(const key of await Store.keys())if(!SB_LOCAL_ONLY.test(key)&&!versions.has(key))dels.push(key);
 if(puts.length||dels.length)S.storageRevision=await applyRemote105(puts,[...new Set(dels)],revision);
 for(const row of rows)known[row.key]=row.updated_at;lsSet(SB_LS.known,known);SB.lastSync=Date.now();
 return {changed:rows.length+dels.filter(k=>!received.has(k)).length,total:list.length};
}
