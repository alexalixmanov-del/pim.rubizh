"""Package public review code and runtime; exclude private catalogs and credentials."""
from pathlib import Path
import argparse, hashlib, json, zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', required=True)
args = parser.parse_args()
output = Path(args.output_dir).resolve()
if output == root or root in output.parents:
    raise SystemExit('Output must be outside the application directory')
version = json.loads((root / 'package.json').read_text())['version']
tests = json.loads((root / 'verification/v2-tests-20261008.json').read_text())
assert tests['passed'] == tests['tests'] and tests['failed'] == tests['skipped'] == 0
runtime = [
    'rubizh_pim.html', 'index.html', 'lib/kits.js', 'lib/categories.js',
    'lib/product-model.js', 'lib/model-contract-v2.js', 'lib/ui.css',
    'vendor/xlsx-0.20.3.min.js', 'vendor/LICENSE', 'np-origins.json'
]
patterns = [
    '*.html', '*.md', 'package*.json', 'deploy-adm-tools.sh',
    'supabase-audit-readonly.sql', 'np-origins.json',
    'categories/*.json', 'categories/*.txt', 'categories/*.js',
    'lib/*.js', 'lib/*.cjs', 'lib/*.css', 'tests/*.cjs', 'tests/fixtures/*.cjs',
    'tools/*.cjs', 'tools/*.php', 'tools/*.py', 'tools/requirements*.txt',
    'tests/*.py',
    'server/*.cjs', 'server/*.py', 'server/*.md',
    'docs/*.md', 'docs/*.json', 'verification/*.json', 'vendor/*'
]
files = {}
for pattern in patterns:
    for path in sorted(root.glob(pattern)):
        if path.is_symlink():
            raise SystemExit('Refusing symbolic link: ' + str(path))
        if path.is_file():
            files[path.relative_to(root).as_posix()] = path.read_bytes()
files['SHA256SUMS'] = ''.join(
    hashlib.sha256(files[name]).hexdigest() + '  ' + name + chr(10)
    for name in runtime
).encode()
release = {
    'version': version, 'schema_version': '2.0', 'tests': tests['tests'],
    'productionDeployed': False, 'realCatalogMigrationReady': False
}
files['RELEASE.json'] = (json.dumps(release, indent=2) + chr(10)).encode()
for name in ['SHA256SUMS', 'RELEASE.json']:
    (root / name).write_bytes(files[name])
output.mkdir(parents=True, exist_ok=True)
archive = output / ('rubizh-pim-' + version + '-review.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 8, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, data, compresslevel=9)
manifest = {
    **release, 'zip': archive.name,
    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'bytes': archive.stat().st_size
}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + chr(10))
print(json.dumps(manifest))
