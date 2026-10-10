// Read-only image URL preflight for a PIM wire (contract 3): HEAD (redirects followed), falling back to a 1 KB
// ranged GET when HEAD is refused; never downloads whole images. Network failures (DNS, connect, proxy) are counted
// separately from HTTP answers, so «host unreachable from here» is never reported as «photo missing».
// Usage: node audit/image-preflight.mjs WIRE.json OUT.json [concurrency=16] [timeout_ms=10000]
import {readFileSync,writeFileSync} from 'node:fs';
const [wirePath,outPath,conc='16',timeout='10000']=process.argv.slice(2);if(!outPath)throw Error('Usage: WIRE.json OUT.json');
const wire=JSON.parse(readFileSync(wirePath,'utf8'));
const urls=[...new Set(wire.products.flatMap(p=>[...(p.photos||[]),...(p.colors||[]).flatMap(c=>c.photos||[]),...(p.variants||[]).flatMap(v=>v.photos||[])]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean))];
const counts={IMAGE_URLS_TOTAL:urls.length,IMAGE_URLS_REACHABLE:0,IMAGE_URLS_FAILED:0,IMAGE_URLS_TIMEOUT:0,IMAGE_URLS_403:0,IMAGE_URLS_404:0,IMAGE_URLS_OTHER_HTTP:0,IMAGE_URLS_INVALID_CONTENT_TYPE:0,IMAGE_URLS_NETWORK_UNREACHABLE:0,IMAGE_URLS_REDIRECTED:0};
const byHost={},examples=[];
async function probe(url){
 const host=(()=>{try{return new URL(url).host;}catch{return 'invalid';}})(),h=byHost[host]||(byHost[host]={total:0,ok:0,failed:0,unreachable:0});h.total++;
 const attempt=async(method,headers={})=>{const ac=new AbortController(),t=setTimeout(()=>ac.abort(),Number(timeout));try{return await fetch(url,{method,headers,redirect:'follow',signal:ac.signal});}finally{clearTimeout(t);}};
 try{let r=await attempt('HEAD');if([403,405,501].includes(r.status))r=await attempt('GET',{Range:'bytes=0-1023'});
  try{await r.body?.cancel();}catch{}
  if(r.redirected)counts.IMAGE_URLS_REDIRECTED++;
  const type=r.headers.get('content-type')||'';
  if(r.ok){if(/^image\//i.test(type)){counts.IMAGE_URLS_REACHABLE++;h.ok++;return;}counts.IMAGE_URLS_INVALID_CONTENT_TYPE++;}
  else if(r.status===403)counts.IMAGE_URLS_403++;else if(r.status===404)counts.IMAGE_URLS_404++;else counts.IMAGE_URLS_OTHER_HTTP++;
  counts.IMAGE_URLS_FAILED++;h.failed++;if(examples.length<20)examples.push({url,status:r.status,type});
 }catch(e){if(e.name==='AbortError'){counts.IMAGE_URLS_TIMEOUT++;counts.IMAGE_URLS_FAILED++;h.failed++;}else{counts.IMAGE_URLS_NETWORK_UNREACHABLE++;h.unreachable++;}}
}
let i=0;await Promise.all(Array.from({length:Number(conc)},async()=>{while(i<urls.length)await probe(urls[i++]);}));
const report={...counts,complete:counts.IMAGE_URLS_NETWORK_UNREACHABLE===0,by_host:byHost,failed_examples:examples};
writeFileSync(outPath,JSON.stringify(report,null,1)+'\n');console.log(JSON.stringify(counts));
