const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHarness}=require('./isolated-harness.cjs');
function draft(h,p){h.add(p);return h.run("ceGenerate(S.products.get('p-a'))");}
test('extra supplier fields survive alongside familiar facts without publishing purchasing metadata',()=>{
 const h=createHarness(),d=draft(h,h.product({attrs:{Матеріал:'Нейлон','Максимальне навантаження':'25 кг','Водонепроникність':'5000 мм','Закупочная цена':'900','Артикул':'private-123'}}));
 assert.match(d.html,/Максимальне навантаження: 25 кг/);assert.match(d.html,/Водонепроникність: 5000 мм/);assert.doesNotMatch(d.html,/private-123|900/);assert.equal(d.supplementalFacts,2);
});
test('conflicting extra fields from supplier rows block approval rather than choosing a convenient value',()=>{
 const h=createHarness();h.run("S.content.set('supplier-a|row',{a:{'Максимальне навантаження':'35 кг'}})");
 const d=draft(h,h.product({attrs:{'Максимальне навантаження':'25 кг'},contentSourceKeys:['supplier-a|row']}));
 h.ctx.draftInput=d;const result=h.run("(()=>{const p=S.products.get('p-a');p.contentDraft=draftInput;return ceApply(p);})()");assert.equal(result.ok,false);assert.ok(d.conflicts.some(x=>x.label==='Максимальне навантаження'));assert.doesNotMatch(d.html,/35 кг/);
});
test('unknown untranslated attribute values cannot be silently lost',()=>{
 const h=createHarness(),d=draft(h,h.product({attrs:{'Особливий параметр':'Предохранитель необычный'}}));assert.ok(d.languageWarnings.length);assert.equal(h.run('ceContentBlock('+JSON.stringify(d)+')'),true);
});
test('degree symbols, decimal weights and dimensions survive encoded supplier prose',()=>{
 const h=createHarness(),d=draft(h,h.product({attrs:{},desc:'Температура: -40&amp;deg;C.\nРозміри: 30 &times; 20 &times; 10 см.\nВага: 1.5 кг.\nМатеріал: 65% поліестер, 35% бавовна.'}));
 assert.match(d.html,/-40°C/);assert.match(d.html,/30 × 20 × 10 см/);assert.match(d.html,/1\.5 кг/);assert.match(d.html,/65% поліестер, 35% бавовна/);assert.doesNotMatch(d.html,/&amp;deg|&amp;times/);assert.equal(d.sourceCoverage,1);
});
test('escaped supplier scripts do not become preview content',()=>{
 const h=createHarness(),d=draft(h,h.product({desc:'&lt;script&gt;alert(1)&lt;/script&gt;Матеріал: Нейлон'}));assert.doesNotMatch(d.html,/alert|script/);assert.match(d.html,/Нейлон/);
});
test('a source sentence containing a link keeps its actual specification',()=>{
 const h=createHarness(),d=draft(h,h.product({attrs:{},desc:'Допустиме навантаження 25 кг, інструкція https://supplier.test/manual.\nЦіна: 500 грн.\nЗамовляйте зараз!'}));assert.match(d.html,/навантаження 25 кг/);assert.doesNotMatch(d.html,/500 грн|Замовляйте/);assert.equal(d.excludedSentences.length,2);
});
test('restrictions, omitted plates and separate accessories remain negative after translation and all styles',()=>{
 const h=createHarness();h.add(h.product({attrs:{},desc:'В комплект не входят плиты.\nНельзя применять отбеливатель.\nРемень приобретается отдельно.'}));
 for(let style=0;style<4;style++){const d=h.run("ceGenerate(S.products.get('p-a'),"+style+")");assert.match(d.html,/не входять/);assert.match(d.html,/Не можна/);assert.match(d.html,/Обмеження та важливі зауваження/);assert.match(d.html,/окремо/);}
});
test('translation retains mixed-language supplier brands, percentages, NATO standard and model identifiers',()=>{
 const h=createHarness();const text='Армированные нити Cordura 1050D и молнии YKK. STANAG 2920, V50 600 м/с. 65% polyester, 35% cotton. SBN-188.';h.ctx.inputText=text;const out=h.run('autoUkText(inputText)');for(const token of ['Cordura 1050D','YKK','STANAG 2920','V50 600','65% polyester','35% cotton','SBN-188'])assert.ok(out.includes(token),token);assert.match(out,/Армовані нитки/);
});
test('custom supplier phrases override local rules, preserve word boundaries and do not cascade',()=>{
 const h=createHarness();h.run("S.cfg.translationGlossary=ceParseGlossary('плечевой ремень => поясна система\\nпоясна система => інший текст')");assert.equal(h.run("autoUkText('Плечевой ремень. Не плечевой ременьок.')"),'Поясна система. Не плечовий ременьок.');
});
test('saving a changed glossary invalidates both translations and existing content drafts',()=>{
 const h=createHarness();h.add(h.product({attrs:{},desc:'Назва компонента: Фастексы.'}));h.run("(()=>{const p=S.products.get('p-a');p.contentDraft=ceGenerate(p);})()");assert.equal(h.run("ceDraftValid(S.products.get('p-a'))"),true);h.run("S.cfg.translationGlossary=ceParseGlossary('Фастексы => Застібки-фастекси')");assert.equal(h.run("autoUkText('Фастексы')"),'Застібки-фастекси');assert.equal(h.run("ceDraftValid(S.products.get('p-a'))"),false);assert.match(h.run("ceGenerate(S.products.get('p-a')).html"),/Застібки-фастекси/);
});
test('glossary rejects changed quantities, units and reversed restrictions',()=>{
 const h=createHarness();for(const pair of ['Нагрузка 25 кг => Навантаження 35 кг','Вес 25 кг => Вага 25 г','не входит => входить','содержит => не містить']){h.ctx.inputText=pair;assert.throws(()=>h.run('ceParseGlossary(inputText)'),/числа, одиниці та заперечення/);}
});
test('literal glossary terms are not interpreted as regex or applied inside HTML addresses',()=>{
 const h=createHarness();h.run("S.cfg.translationGlossary=ceParseGlossary('A+B => A плюс B\\nЧерный => Чорний')");assert.equal(h.run(`autoUkText('<a title="Черный > Черный" href="https://test/Черный">Черный A+B</a> Черный@example.test')`),'<a title="Черный > Черный" href="https://test/Черный">Чорний A ПЛЮС B</a> Черный@example.test');
});
test('bad imported glossary cannot break translation or inject markup',()=>{
 const h=createHarness();h.run("S.cfg.translationGlossary=[{from:'Нейлон',to:'<script>bad()</script>'}]");assert.equal(h.run("autoUkText('Нейлон')"),'Нейлон');
});
test('a supplier name with unknown Russian text cannot bypass application checks',()=>{
 const h=createHarness(),d=draft(h,h.product({name:'Необычный предохранитель'}));assert.equal(d.html,'');assert.ok(d.languageWarnings.some(x=>x.label==='Назва товару'));
});
test('glossary save failure restores previous rules and reports the failure',async()=>{
 const h=createHarness();h.run("S.view='contentEngine';S.cfg.translationGlossary=[{from:'ремень',to:'ремінь'}];render();persist=async()=>false;");h.document.querySelector('#ce-glossary').value='ремень => пояс';assert.deepEqual(await h.click('ceSaveGlossary'),[]);assert.equal(h.run('S.cfg.translationGlossary[0].to'),'ремінь');assert.match(h.document.querySelector('#toast').textContent,/не збережено/);
});
test('glossary is persisted in local storage and included in portable backups',async()=>{
 const h=createHarness();await h.run('Store.init()');h.run("S.view='contentEngine';render();");h.document.querySelector('#ce-glossary').value='ремень => ремінь';assert.deepEqual(await h.click('ceSaveGlossary'),[]);const cfg=await h.run("Store.get('meta/config')");assert.equal(cfg.translationGlossary[0].to,'ремінь');assert.equal(h.run("backupData().cfg.translationGlossary[0].to"),'ремінь');
});
test('repeated batch preview keeps valid drafts and makes no additional writes to products',async()=>{
 const h=createHarness();h.add(h.product());h.run("persist=async()=>true;S.view='today';");await h.run("ceBatch('preview')");const before=h.run("S.products.get('p-a').contentDraft.createdAt");await h.run("ceBatch('preview')");assert.equal(h.run("S.products.get('p-a').contentDraft.createdAt"),before);assert.match(h.run('CE_UI.progress'),/Чернеток створено: 0/);assert.match(h.run('CE_UI.progress'),/Без змін: 1/);
});
test('cached generated description cannot be poisoned and refreshes when supplier facts change',()=>{
 const h=createHarness();h.add(h.product({attrs:{'Максимальне навантаження':'25 кг'}}));const a=h.run("ceGenerate(S.products.get('p-a'))");a.html='poison';a.facts[0].value='poison';assert.doesNotMatch(h.run("ceGenerate(S.products.get('p-a')).html"),/poison/);h.run("S.products.get('p-a').attrs['Максимальне навантаження']='35 кг'");assert.match(h.run("ceGenerate(S.products.get('p-a')).html"),/35 кг/);
});
