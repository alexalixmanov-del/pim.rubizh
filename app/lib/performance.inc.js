// Fact extraction is repeated during preview, fingerprinting and similarity checks.
// Cache only matching source data; return independent objects to protect provenance.
const _ceExtract105=ceExtract,_ceExtractCache105=new WeakMap();
ceExtract=function(p){
 const signature=JSON.stringify([ceTranslationSignature(),p.name,p.category,p.brand,p.attrs,ceSupplierSource(p),p.variants?.map(v=>[v.size,v.color]),(p.contentSourceKeys||[]).map(k=>{const c=S.content.get(k);return [k,c?.a,c?.originalDesc??c?.d];})]);
 const hit=_ceExtractCache105.get(p);if(hit?.signature===signature)return structuredClone(hit.data);
 const data=_ceExtract105(p);_ceExtractCache105.set(p,{signature,data:structuredClone(data)});return data;
};
function pimOperationsStatus(){
 const expired=new Set(),jumps=new Set();for(const p of S.products.values())for(const v of p.variants)for(const o of Object.values(v.offers||{})){if(offerStale(o))expired.add(p.id);if(o.priceAlert)jumps.add(p.id);}
 const unconfirmed=S.cfg.suppliers.filter(s=>s.terms?.preorderConfirmed!==true);
 return `<section class="panel"><h2>Что требует внимания</h2><p>Срок проверки наличия: ${esc(S.cfg.freshHours)} ч. У ${expired.size} товаров есть устаревшие предложения; обновите прайсы. Ожидают решения по скачку цены: ${jumps.size}.</p><p>Без подтверждённых правил предзаказа: ${unconfirmed.length} поставщиков. Условия изготовления задаются отдельно для каждого поставщика.</p><div class="row"><button class="btn" data-view="import">Обновить прайс</button><button class="btn" data-view="suppliers">Условия поставщиков</button><button class="btn" data-view="kits">Комплекты</button></div></section>`;
}
const _today105=vToday;vToday=function(){return _today105()+pimOperationsStatus();};
