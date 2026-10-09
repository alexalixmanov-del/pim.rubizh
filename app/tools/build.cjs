const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),file=path.join(root,'rubizh_pim.html');let html=fs.readFileSync(file,'utf8');
const categories=JSON.parse(fs.readFileSync(path.join(root,'categories/canonical-categories.json'),'utf8')).categories;
const core=fs.readFileSync(path.join(root,'categories/classifier-core.js'),'utf8');
fs.writeFileSync(path.join(root,'lib/categories.js'),'(function(root,factory){if(typeof module===\"object\"&&module.exports)module.exports=factory();else root.RubizhCategories=factory();})(typeof globalThis!==\"undefined\"?globalThis:this,function(){\n\"use strict\";const defaults='+JSON.stringify(categories)+';\n'+core+'\n});\n');
for(const [name,start,end] of [
 ['pricing.inc.js','/* ===================== цены ===================== */','/* ===================== поиск похожих ===================== */'],
 ['kits-ui.inc.js','// Included in the application before startup.','function typedCategoryDecision'],
 ['content.inc.js','function ceSupplierRewrite(', 'const tzOldCheck=vCheck;'],
 ['sync.inc.js','async function rememberSiteCredentials105(', 'async function sbBeforeLoad()'],
 ['performance.inc.js','// Fact extraction is repeated during preview,', '// Keep the historical identity fingerprint'],
 ['storage.inc.js','// Keep the historical identity fingerprint', '// Unified workflow, actionable problems and supplier source automation.'],
 ['workflow.inc.js','// Unified workflow, actionable problems and supplier source automation.', '// Canonical categories: explicit migration, supplier-scoped evidence and review.'],
 ['categories-ui.inc.js','// Canonical categories: explicit migration, supplier-scoped evidence and review.', '// Product model: explicit normalization, quality, relations and safe import.'],
 ['product-model-ui.inc.js','// Product model: explicit normalization, quality, relations and safe import.', '// Simple workflow: owner-authorized requests, automatic exclusions and publication preview.'],
 ['simple-ui.inc.js','// Simple workflow: owner-authorized requests, automatic exclusions and publication preview.', '// Model colors: explicit galleries, conservative family migration and stable SKU selection.'],
 ['classification-ui.inc.js','// Classification pipeline: review-safe evidence and normalized size catalogs.', '// Production release: controlled migration on the existing production store.'],
 ['production-ui.inc.js','// Production release: controlled migration on the existing production store.', '/* ===================== старт ===================== */'],
 ['model-colors-ui.inc.js','// Model colors: explicit galleries, conservative family migration and stable SKU selection.', '// Classification pipeline: review-safe evidence and normalized size catalogs.']
]){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 if(a<0||b<a||html.indexOf(start,a+1)>=0)throw Error('Missing or duplicate source marker: '+name);
 const source=fs.readFileSync(path.join(root,'lib',name),'utf8')+(name==='content.inc.js'?'\n'+fs.readFileSync(path.join(root,'lib/localization.inc.js'),'utf8'):'');
 html=html.slice(0,a)+source+'\n'+html.slice(b);
}
fs.writeFileSync(file,html);console.log('Application sources assembled.');
