"""Deterministic release, explicit allowlist; private supplier/config data never packaged."""
from pathlib import Path
from hashlib import sha256
import json,sys,zipfile
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip'
runtime=['index.html','release-recovery.html','lib/release-storage.js','lib/kits.js','lib/categories.js','lib/product-model.js','lib/category-evidence.js','lib/size-evidence.js','lib/inventory-policy.js','lib/ui.css','vendor/xlsx-0.20.3.min.js','vendor/LICENSE','categories/canonical-categories.json','categories/approved-evidence-rules.json','contracts/category-size-export.schema.json']
extra=['tools/install-production.py','PRODUCTION-INSTALL.md','server-contract.md']
# Publishing starts only after the shop advertises the exact contract v3 (never unconditional); autoprices stay off.
manifest={'version':'10.9.3','rc_commit':'440aa60ee42795ba8bf5167d8121470a5a56aab3','workflow':'final-ready-moderation-rejected-1','sync_enabled':'requires_site_contract_v3','autoprices_enabled':False,'runtime_files':runtime,'files':{}}
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in runtime+extra:
        data=(root/('rubizh_pim.html' if name=='index.html' else name)).read_bytes();manifest['files'][name]=sha256(data).hexdigest()
        info=zipfile.ZipInfo(name,(2026,10,9,0,0,0));info.external_attr=0o644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    info=zipfile.ZipInfo('PRODUCTION-MANIFEST.json',(2026,10,9,0,0,0));info.external_attr=0o644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(out),'sha256':sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size}))
