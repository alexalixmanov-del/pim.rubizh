#!/usr/bin/env python3
"""Explicit offline file installer. Never connects to PIM, suppliers or store APIs."""
import argparse, gzip, hashlib, json, os, shutil, sys, tempfile, time, zipfile
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest()
def inside(p,root): return p==root or root in p.parents
def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.pim-10.9.3-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o644);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
def validate_data(data):
    d=json.loads(gzip.decompress(data) if data[:2]==b'\x1f\x8b' else data)
    if d.get('format')=='rubizh-pim-production-snapshot':
        if d.get('database')!='rubizh_pim_v7_launch' or not isinstance(d.get('rows'),list):raise ValueError('INVALID_FULL_BACKUP')
        if not any(r['key'].startswith('cat/') and r['data'].get('products') for r in d['rows']):raise ValueError('EMPTY_BACKUP')
        return
    if d.get('format') not in ('rubizh-pim-backup','pim-backup','pim-safety-backup') or not d.get('cfg') or not d.get('products'):raise ValueError('FULL_PIM_BACKUP_REQUIRED')
    if any(x['id'] not in d.get('docFiles',{}) for x in d.get('docs',[])):raise ValueError('MISSING_DOCUMENT_BINARIES')
def rollback(backup):
    backup=Path(backup).resolve();state=json.loads((backup/'installation.json').read_text());target=Path(state['target']).resolve()
    if sha((backup/'data-backup.bin').read_bytes())!=state['data_backup_sha256']:raise ValueError('DATA_BACKUP_CORRUPT')
    for name,record in state['previous'].items():
        path=target/name
        if path.is_symlink() or any(p.is_symlink() for p in path.parents if inside(p,target)):raise ValueError('SYMLINK_TARGET')
        if record:
            data=(backup/'previous'/name).read_bytes()
            if sha(data)!=record['sha256']:raise ValueError('PREVIOUS_CODE_BACKUP_CORRUPT')
    # index last, as on install; business data restored separately in the same-origin recovery page.
    for name,record in sorted(state['previous'].items(),key=lambda x:x[0]=='index.html'):
        path=target/name
        if record:atomic(path,(backup/'previous'/name).read_bytes())
        elif path.exists():path.unlink()
    for name,record in state['previous'].items():
        path=target/name
        if (record and sha(path.read_bytes())!=record['sha256']) or (not record and path.exists()):raise ValueError('ROLLBACK_VERIFICATION_FAILED')
    return {'CODE_ROLLBACK_VERIFIED':True,'DATA_BACKUP':str(backup/'data-backup.bin'),'DATA_RESTORE_REQUIRED':True}
def install(archive,target,data_backup,backup_root):
    target=Path(target).resolve();backup_root=Path(backup_root).resolve();data_backup=Path(data_backup).resolve()
    if inside(backup_root,target) or inside(data_backup,target):raise ValueError('BACKUP_MUST_BE_OUTSIDE_PUBLIC_TARGET')
    if not (target/'index.html').is_file():raise ValueError('EXISTING_PIM_REQUIRED')
    previous_index=(target/'index.html').read_text()
    if 'rubizh_pim_v7_launch' not in previous_index or 'rubizh_pim_rc_' in previous_index:raise ValueError('EXISTING_DATABASE_NAMESPACE_NOT_CONFIRMED')
    raw_backup=data_backup.read_bytes();validate_data(raw_backup)
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or any(n.startswith('/') or '..' in Path(n).parts or '\\' in n for n in names):raise ValueError('UNSAFE_ARCHIVE')
        m=json.loads(z.read('PRODUCTION-MANIFEST.json'))
        if m.get('version')!='10.9.3' or m.get('sync_enabled') is not False or m.get('autoprices_enabled') is not False:raise ValueError('INVALID_RELEASE')
        if set(names)!=set(m['files'])|{'PRODUCTION-MANIFEST.json'}:raise ValueError('UNLISTED_ARCHIVE_FILES')
        for n,expected in m['files'].items():
            if sha(z.read(n))!=expected:raise ValueError('RELEASE_CHECKSUM_FAILED: '+n)
        runtime={n:z.read(n) for n in m['runtime_files']}
    previous={}
    for name in runtime:
        p=target/name
        if p.is_symlink() or any(x.is_symlink() for x in p.parents if inside(x,target)):raise ValueError('SYMLINK_TARGET')
        if p.exists() and not p.is_file():raise ValueError('INVALID_TARGET_FILE')
        previous[name]={'sha256':sha(p.read_bytes())} if p.exists() else None
    backup_root.mkdir(parents=True,exist_ok=True,mode=0o700)
    backup=Path(tempfile.mkdtemp(prefix='pim-10.9.3-'+time.strftime('%Y%m%d-%H%M%S')+'-',dir=backup_root));os.chmod(backup,0o700)
    for name,record in previous.items():
        if record:atomic(backup/'previous'/name,(target/name).read_bytes())
    (backup/'data-backup.bin').write_bytes(raw_backup);os.chmod(backup/'data-backup.bin',0o600)
    if sha((backup/'data-backup.bin').read_bytes())!=sha(raw_backup):raise ValueError('DATA_BACKUP_READBACK_FAILED')
    state={'target':str(target),'previous':previous,'data_backup_sha256':sha(raw_backup),'runtime_hashes':{n:sha(b) for n,b in runtime.items()}}
    (backup/'installation.json').write_text(json.dumps(state,indent=2));shutil.copy2(__file__,backup/'install-production.py')
    for name,record in previous.items():
        if record and sha((backup/'previous'/name).read_bytes())!=record['sha256']:raise ValueError('PREVIOUS_BACKUP_READBACK_FAILED')
    try:
        for i,(name,data) in enumerate(sorted(runtime.items(),key=lambda x:x[0]=='index.html')):
            atomic(target/name,data)
            if os.environ.get('PIM_INSTALL_TEST_FAIL_AFTER')==str(i+1):raise ValueError('INJECTED_INSTALL_FAILURE')
        for name,data in runtime.items():
            if sha((target/name).read_bytes())!=sha(data):raise ValueError('INSTALLED_CHECKSUM_FAILED')
    except BaseException:
        rollback(backup);raise
    return {'FILES_INSTALLED':len(runtime),'BACKUP_PATH':str(backup),'BACKUP_FORMAT':'previous runtime files + installation.json + full data-backup.bin','SYNC_ENABLED':False,'AUTOPRICES_ENABLED':False,'DATA_MIGRATION':'PENDING_BROWSER_DRY_RUN','PRODUCTION_API_CALLS':0}
def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action');sub.required=True # Python 3.6 compatibility, action stays mandatory
    s=sub.add_parser('install');s.add_argument('--archive',required=True);s.add_argument('--target',required=True);s.add_argument('--data-backup',required=True);s.add_argument('--backup-root',required=True)
    s=sub.add_parser('rollback');s.add_argument('--backup',required=True)
    a=p.parse_args();print(json.dumps(install(a.archive,a.target,a.data_backup,a.backup_root) if a.action=='install' else rollback(a.backup),ensure_ascii=False,indent=2))
if __name__=='__main__':
    try:main()
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
