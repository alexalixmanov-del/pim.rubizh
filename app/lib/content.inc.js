function ceSupplierRewrite(text,style){
 if(!style)return text;
 // Literal restatements only: counts, negations, units and supplier evidence stay intact.
 return text.replace(/^(?:Виріб|Рюкзак|Сумка|Підсумок) має /iu,'Конструкція передбачає ').replace(/^Має /iu,'Передбачено ').replace(/^Матеріал:\s*/iu,'Матеріал виробу: ').replace(/^Об[’']єм:\s*/iu,'Об’єм виробу: ').replace(/^Вага:\s*/iu,'Вага виробу: ');
}
// Preserve product information; language gaps and contradictions must be visible.
function ceContentBlock(d){return !!(d?.conflicts?.length||d?.languageWarnings?.length||d?.sourceCoverage<1||d?.attributeCoverage<1);}
// Decode supplier entities before segmentation: the semicolon in &deg; is not a sentence.
ceSourcePlain=function(raw){
 let text=String(raw||'');
 const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',deg:'°',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',sup2:'²',sup3:'³',times:'×',hellip:'…',bull:'•',copy:'©',reg:'®'};
 for(let pass=0;pass<3;pass++){
  const decoded=text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/giu,(all,key)=>{
   if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all;}
   return entities[key.toLowerCase()]??all;
  });if(decoded===text)break;text=decoded;
 }
 text=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 text=text.replace(/<br\s*\/?>|<\/(?:p|li|div|h[1-6]|tr)>/gi,'\n').replace(/<\/(?:td|th)>/gi,'; ').replace(/<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi,' ');
 const el=document.createElement('textarea');el.innerHTML=text;
 return el.value.replace(/[^\S\n]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
};
function ceSourceUnits(text){
 // Protect still unknown HTML entities from the list separator as well.
 return String(text).split(/\n+|(?<!&[a-zA-Z]{1,20});\s*|(?<=[!?])\s+|(?<=\.)\s+(?=[A-ZА-ЯІЇЄҐ])/u).map(s=>s.replace(/^[•▪–—-]+\s*/u,'').trim()).filter(Boolean);
}
function ceCommercialOnly(text){
 const hasTechnical=/\d\s*(?:кг|г|гр|см|мм|л|мл|м[²2]|%|°)(?=$|[^\p{L}])|комплект(?:аці|аци)|не вход|не міст|не содерж|не використ|не использ|не можна|нельзя|заборон|запрещ|\b(?:molle|cordura|stanag|ykk)\b/iu.test(text);
 if(hasTechnical)return false;
 return /^(?:(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+|(?:\+?380)[\d ()-]{8,})$/iu.test(text)||/^(?:ціна|цена|вартість|стоимость|доставка|оплата|передплат\p{L}*|предоплат\p{L}*|наявність|наличие|замовляйте|заказывайте|наш магазин|наш менеджер|для замовлення|вкажіть у коментар|обов.?язково вкажіть|зв.яжеться з вами|ми пропонуємо|мы предлагаем)(?=$|[^\p{L}])/iu.test(text);
}
function ceSourceSectionTitle(text){
 if(/не вход|не міст|не содерж|не можна|нельзя|заборон|запрещ|обмежен|ограничен|попереджен|предупрежден|правил\p{L}* експлуатац/iu.test(text))return 'Обмеження та важливі зауваження';
 if(/комплект|поставк/iu.test(text))return 'Комплектація';
 if(/догляд|прання|прати|сушити/iu.test(text))return 'Догляд';
 if(/захист|випроб|дсту|stanag|клас|стандарт/iu.test(text))return 'Захист: дані постачальника';
 if(/матеріал|тканин|бавовн|нейлон|поліестер|cordura|softshell/iu.test(text))return 'Матеріали';
 if(/признач|використ|підходить/iu.test(text))return 'Призначення';
 return 'Конструкція та особливості';
}
function tzSourceSections(p,data=ceExtract(p)){
 const sources=[ceSupplierSource(p),...(p.contentSourceKeys||[]).map(k=>S.content.get(k)?.originalDesc||S.content.get(k)?.d||'')].filter(Boolean);
 const seen=new Set(),sections=[],languageWarnings=[],omitted=[],excluded=[];let total=0;
 for(const source of sources)for(const line of ceSourceUnits(ceSourcePlain(source))){
  const text=autoUkText(line).replace(/^[•▪–—-]+\s*/u,'').trim();if(!text)continue;
  const key=text.toLowerCase().replace(/\s+/g,' ');if(seen.has(key))continue;seen.add(key);
  if(ceCommercialOnly(text)){excluded.push(text);continue;}
  total++;
  const field=ceFactField(text.split(/[:—–]/u)[0]),conflict=data.conflicts.find(c=>c.key===field?.[0]||c.values.some(v=>{
   const value=autoUkText(v.value).toLowerCase();if(value.length<3)return false;
   return ceLiteralRule(value,'')[0].test(text.toLowerCase());
  }));
  if(conflict){omitted.push({reason:'conflict',text});continue;}
  if(hasRussianText(text)){languageWarnings.push({label:'Речення постачальника',value:text,source:'Опис постачальника'});omitted.push({reason:'language',text});continue;}
  const title=ceSourceSectionTitle(text);
  sections.push({title,text});
 }
 return {sections,languageWarnings,omitted,excluded,total,coverage:total?sections.length/total:1};
}
function ceSupplementalFacts(p){
 const groups=new Map(),languageWarnings=[],excluded=[];
 const sets=[{attrs:p.attrs,source:'Характеристики master'},...(p.contentSourceKeys||[]).map(k=>({attrs:S.content.get(k)?.a,source:'Характеристики прайсу '+k.split('|')[0]}))];
 const technicalLabel=label=>!/^(?:sku|артикул|код|id|постачальник|поставщик|supplier|залишок|остаток|stock|наявність|наличие|url|посилання|ссылка|фото|photos?|images?|опис|description|категорія|category)(?=$|[^\p{L}])/iu.test(label)&&!/(?:^|[^\p{L}])(?:ціна|цена|вартість|стоимость|cost|payout|price|purchase|wholesale|profit|margin|commission|закуп\p{L}*|собіварт\p{L}*|маржа|націн\p{L}*|прибут\p{L}*|коміс\p{L}*)(?=$|[^\p{L}])/iu.test(label);
 for(const set of sets)for(const [raw,value] of Object.entries(set.attrs||{})){
  if(ceFactField(raw)||value==null||typeof value==='object')continue;
  const label=autoUkText(ceSourcePlain(raw)).trim(),val=autoUkText(ceSourcePlain(String(value))).trim();
  if(!label||!val||/^(?:-|—|n\/?a|null|undefined)$/iu.test(val))continue;
  if(!technicalLabel(label)){excluded.push(label);continue;}
  if(hasRussianText(label+' '+val)){languageWarnings.push({label,value:val,source:set.source});continue;}
  const key=label.toLowerCase(),group=groups.get(key)||{key:'extra:'+key,label,values:[],sources:[]};
  group.values.push(val);group.sources.push(set.source);groups.set(key,group);
 }
 const facts=[],conflicts=[];
 for(const group of groups.values()){
  const values=uniq(group.values);if(values.length>1){conflicts.push({key:group.key,label:group.label,values:values.map(value=>({value,source:uniq(group.sources).join(' · ')}))});continue;}
  facts.push({key:group.key,label:group.label,value:values[0],sources:uniq(group.sources),source:group.sources[0]});
 }
 return {facts,conflicts,languageWarnings,excluded,coverage:languageWarnings.length||conflicts.length?0:1};
}
const tzAccepted=memoProd('ceAccepted103',ceAccepted);ceAccepted=p=>tzAccepted(p);
const tzOldGenerate=ceGenerate;
const tzOldSignature=ceInputSignature;ceInputSignature=function(p,data=ceExtract(p)){return tzOldSignature(p,data)+'|'+fnvHash(JSON.stringify([ceTranslationSignature(),p.attrs,ceSupplierSource(p),...(p.contentSourceKeys||[]).map(k=>{const c=S.content.get(k);return [c?.a,c?.originalDesc||c?.d||''];})]))};
ceGenerate=function(p,style=0){
 const draft=tzOldGenerate(p,style),source=tzSourceSections(p,draft),extra=ceSupplementalFacts(p),groups=new Map();
 for(const {title,text} of source.sections){if(!groups.has(title))groups.set(title,[]);groups.get(title).push(text);}
 const n=((Number(style)||0)%4+4)%4,headings=[...groups];if(n===1)headings.reverse();if(n===2)headings.sort(([a],[b])=>a.localeCompare(b));
 const name=cleanLocalizedName(autoUkText(String(p.name||''))).trim();
 let html=name&&!hasRussianText(name)?`<p><strong>${htmlSafeText(name)}</strong></p>`:'';
 for(const [title,lines] of headings){html+=`<p><strong>${htmlSafeText(title)}</strong></p>`;html+=n===3?'<ul>'+lines.map(s=>`<li>${htmlSafeText(ceSupplierRewrite(s,n))}</li>`).join('')+'</ul>':lines.map(s=>`<p>${htmlSafeText(ceSupplierRewrite(s,n))}</p>`).join('');}
 if(!source.sections.length)html=draft.html;
 else if(draft.facts.length)html+='<p><strong>Характеристики</strong></p><ul>'+draft.facts.map(f=>'<li>'+htmlSafeText(f.label+': '+f.value)+'</li>').join('')+'</ul>';
 if(extra.facts.length)html+='<p><strong>Додаткові характеристики постачальника</strong></p><ul>'+extra.facts.map(f=>'<li>'+htmlSafeText(f.label+': '+f.value)+'</li>').join('')+'</ul>';
 if(!name||hasRussianText(name))html='';
 const languageWarnings=[...draft.languageWarnings,...source.languageWarnings,...extra.languageWarnings];
 if(hasRussianText(name))languageWarnings.push({label:'Назва товару',value:name,source:'Master'});
 return {...draft,html,short:plainSupplierText(html).slice(0,280),facts:[...draft.facts,...extra.facts],factsUsed:draft.factsUsed+extra.facts.length,supplementalFacts:extra.facts.length,conflicts:[...draft.conflicts,...extra.conflicts],sourceCoverage:source.coverage,attributeCoverage:extra.coverage,sourceSentences:source.total,retainedSentences:source.sections.length,omittedSentences:source.omitted,excludedSentences:source.excluded,excludedAttributes:extra.excluded,languageWarnings};
};
// Rendering and draft validation revisit the same cards; avoid repeating the translation pipeline.
const ceGenerateUncached108=ceGenerate,ceGeneratedCache108=new Map();let ceGeneratedChars108=0;
ceGenerate=function(p,style=0){
 const signature=JSON.stringify([CE_VERSION,style,p.id,p.name,p.category,p.brand,p.attrs,ceTranslationSignature(),ceSupplierSource(p),p.variants?.map(v=>[v.size,v.color]),(p.contentSourceKeys||[]).map(k=>{const c=S.content.get(k);return [k,c?.a,c?.originalDesc??c?.d];})]);
 const prior=ceGeneratedCache108.get(p);
 if(prior?.signature===signature){ceGeneratedCache108.delete(p);ceGeneratedCache108.set(p,prior);return structuredClone(prior.draft);}
 if(prior){ceGeneratedChars108-=prior.chars;ceGeneratedCache108.delete(p);}
 const draft=ceGenerateUncached108(p,style),chars=signature.length+JSON.stringify(draft).length;
 if(chars<=3000000){while(ceGeneratedCache108.size&&(ceGeneratedCache108.size>=128||ceGeneratedChars108+chars>3000000)){const key=ceGeneratedCache108.keys().next().value;ceGeneratedChars108-=ceGeneratedCache108.get(key).chars;ceGeneratedCache108.delete(key);}ceGeneratedCache108.set(p,{signature,chars,draft:structuredClone(draft)});ceGeneratedChars108+=chars;}
 return draft;
};
const ceMetrics108=ceMetricsHtml;
ceMetricsHtml=function(d){return ceMetrics108(d)+(d.supplementalFacts?`<p class="small">Додатково збережено характеристик поза шаблонами: ${d.supplementalFacts}.</p>`:'')+(d.excludedSentences?.length?`<details><summary class="small">Вилучені службові речення · ${d.excludedSentences.length}</summary><ul class="small">${d.excludedSentences.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul></details>`:'');};
