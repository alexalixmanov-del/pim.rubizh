// Keep the historical identity fingerprint for migration/health compatibility.
// Verify actual persisted values independently when checking a committed snapshot.
const _catalogStats105=catalogStats;
function stableValue105(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
catalogStats=function(products=S.products,cfg=S.cfg,queue=S.queue,content=S.content){
 const stats=_catalogStats105(products,cfg,queue,content);
 const records=(values,key)=>[...(values.values?values.values():values)].map(x=>[x[key],fnvHash(stableValue105(x))]).sort(([a],[b])=>String(a).localeCompare(String(b)));
 stats.valueFingerprint=fnvHash(stableValue105([records(products,'id'),records(queue,'k'),records(content,'k'),records(cfg.suppliers||[],'id')]));
 stats.valueFingerprintVersion=1;return stats;
};
