"""Package an explicit allow-list. Private catalogs and historical sources are excluded."""
from pathlib import Path
import hashlib, json, zipfile, re
root=Path(__file__).resolve().parents[1]
repo=root.parent
version=json.loads((root/'package.json').read_text())['version']
runtime=['rubizh_pim.html','lib/kits.js','lib/categories.js','lib/product-model.js','lib/ui.css','vendor/xlsx-0.20.3.min.js','vendor/LICENSE','np-origins.json','index.html']
html=(root/'rubizh_pim.html').read_bytes()
files={f:html if f=='index.html' else (root/f).read_bytes() for f in runtime}
for f in ['README.md','UPGRADE-10.5.md','CONTENT-FREE.md','DEPLOY-ADM-TOOLS.md','deploy-adm-tools.sh','server-contract.md','WORKFLOW-10.6.md','CATEGORIES-10.7.md','CATEGORIES-10.7.1.md','SUPPLIER-REQUEST.md','DATA-MODEL-10.8.md','SIMPLE-10.9.md','supabase-audit-readonly.sql','package.json','package-lock.json']:
 files[f]=(root/f).read_bytes()
for folder,patterns in [('categories',['*.json','*.txt','*.js']),('lib',['*.inc.js']),('tests',['*.test.cjs','isolated-harness.cjs']),('tools',['build.cjs','package.py']),('server',['fetch-supplier-feeds.py','AUTOMATION.md'])]:
 for pattern in patterns:
  for p in (root/folder).glob(pattern):files[p.relative_to(root).as_posix()]=p.read_bytes()
for f in ['SIMPLE-10.9-ACCEPTANCE.md','simple-10.9-tests.txt','simple-10.9-browser.json','simple-10.9-static.txt','simple-10.9-catalog-summary.json','simple-10.9-suppliers.json','simple-10.9-scale.json','model-colors-10.9-catalog-summary.json','simple-10.9-1440.png','simple-10.9-390.png','DATA-MODEL-10.8-ACCEPTANCE.md','product-model-10.8-tests.txt','product-model-10.8-browser.json','product-model-10.8-static.txt','product-model-10.8-catalog.json','product-model-10.8-suppliers.json','product-model-10.8-scale.json','product-model-10.8-1440.png','product-model-10.8-390.png','CATEGORIES-10.7.1.md','category-migration-10.7.1-summary.json','categories-10.7.1-browser.json','categories-10.7.1-tests-release-final.txt','categories-10.7.1-static.txt','category-regression-10.7.1.json','category-scale-10.7.1.json','category-supplier-imports-10.7.1.json','CATEGORIES-10.7.0.md','category-migration-summary.json','old-category-mapping.json','category-supplier-imports.json','categories-browser.json','categories-tests.txt','categories-static.txt','categories-1440.png','categories-390.png','categories-layouts.json','workflow-tests.txt','workflow-browser.json','workflow-catalog-summary.json','feed-collector-tests.json','workflow-today-1440.png','workflow-today-390.png','workflow-queue-1440.png','workflow-queue-390.png','WORKFLOW-10.6.0.md','MATCHING-OPTIONS-10.5.3.md','check-matching-options-tests.txt','check-matching-options-browser.json','RECHECK-2026-10-07.md','REPORT.md','FREE-CONTENT-REPORT.md','recheck-final-tests.txt','static-results.json','catalog-migration.json','browser-after.json','kits-browser.json','free-content-browser.json','recheck-save-browser.json','deployment-check.json','free-content-1440.png','free-content-390.png']:
 p=repo/'audit'/f
 if p.exists():
  archive_name=f
  if f=='product-model-10.8-catalog.json':
   summary=json.loads(p.read_text());assert isinstance(summary['products'],int) and isinstance(summary['variants'],int)
   archive_name='product-model-10.8-catalog-summary.json'
  files['audit/'+archive_name]=p.read_bytes()
files['SHA256SUMS']=(''.join(hashlib.sha256(files[f]).hexdigest()+'  '+f+'\n' for f in runtime)).encode()
test_log=(repo/'audit/simple-10.9-tests.txt').read_text();test_count=int(re.search(r'ℹ tests (\d+)',test_log).group(1));assert re.search(r'ℹ fail 0(?:\n|$)',test_log)
files['RELEASE.json']=(json.dumps({'version':version,'tests':test_count,'paidAIRequired':False,'productionDeployed':False},indent=2)+'\n').encode()
output=repo/'dist';output.mkdir(exist_ok=True)
archive=output/('rubizh-pim-'+version+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for name,data in sorted(files.items()):
  info=zipfile.ZipInfo(name,date_time=(2026,10,8,12,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,data,compresslevel=9)
manifest={'version':version,'zip':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'tests':test_count,'paidAIRequired':False,'productionDeployed':False,'catalogProductsChecked':3113,'catalogVariantsChecked':8734}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
