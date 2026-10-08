"""Package the assembled review app; never include catalog data or an installer."""
from pathlib import Path
from hashlib import sha256
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / 'reviews/category-size-runtime-2026-10-09/rubizh-pim-10.9.3-review.zip'
files = [
    'rubizh_pim.html', 'README.md', 'server-contract.md',
    'lib/kits.js', 'lib/categories.js', 'lib/product-model.js',
    'lib/category-evidence.js', 'lib/size-evidence.js', 'lib/ui.css',
    'vendor/xlsx-0.20.3.min.js', 'vendor/LICENSE',
    'categories/canonical-categories.json', 'categories/approved-evidence-rules.json',
    'contracts/category-size-export.schema.json',
]
manifest = {'version': '10.9.3-review', 'review_only': True, 'files': {}}
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        data = (root / name).read_bytes()
        manifest['files'][name] = sha256(data).hexdigest()
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 9, 0, 0, 0))
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
    info = zipfile.ZipInfo('REVIEW-MANIFEST.json', date_time=(2026, 10, 9, 0, 0, 0))
    info.external_attr = 0o644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'path': str(out), 'sha256': sha256(out.read_bytes()).hexdigest(), 'bytes': out.stat().st_size}))
