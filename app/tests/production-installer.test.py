import unittest,tempfile,subprocess,json,os,zipfile
from pathlib import Path
from hashlib import sha256
ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/'app/tools/install-production.py'
ARCHIVE=ROOT/'releases/pim-10.9.3/rubizh-pim-10.9.3-production.zip'
class Installer(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.target=self.root/'public';self.target.mkdir();(self.target/'index.html').write_text('previous PIM 10.9.0 rubizh_pim_v7_launch');(self.target/'custom.txt').write_text('unchanged');self.data=self.root/'full.json';self.data.write_text(json.dumps({'format':'rubizh-pim-backup','cfg':{'owner':'test'},'products':[{'id':'p1','variants':[]}]}));self.backups=self.root/'private-backups'
 def tearDown(self):self.tmp.cleanup()
 def install(self,archive=ARCHIVE,env=None,backup_root=None):
  return subprocess.run(['python3',str(SCRIPT),'install','--archive',str(archive),'--target',str(self.target),'--data-backup',str(self.data),'--backup-root',str(backup_root or self.backups)],capture_output=True,text=True,env=env)
 def test_install_and_complete_code_rollback(self):
  before=(self.target/'index.html').read_bytes();r=self.install();self.assertEqual(r.returncode,0,r.stderr);report=json.loads(r.stdout);b=Path(report['BACKUP_PATH']);self.assertFalse(report['SYNC_ENABLED']);self.assertFalse(report['AUTOPRICES_ENABLED']);self.assertEqual((b/'data-backup.bin').read_bytes(),self.data.read_bytes());self.assertEqual(os.stat(b).st_mode&0o777,0o700);self.assertEqual((self.target/'custom.txt').read_text(),'unchanged');self.assertNotEqual((self.target/'index.html').read_bytes(),before);rb=subprocess.run(['python3',str(b/'install-production.py'),'rollback','--backup',str(b)],capture_output=True,text=True);self.assertEqual(rb.returncode,0,rb.stderr);self.assertEqual((self.target/'index.html').read_bytes(),before);self.assertFalse((self.target/'lib/release-storage.js').exists());self.assertEqual((self.target/'custom.txt').read_text(),'unchanged')
 def test_checksum_failure_no_changes_or_backup(self):
  bad=self.root/'bad.zip'
  with zipfile.ZipFile(ARCHIVE) as z,zipfile.ZipFile(bad,'w') as w:
   for n in z.namelist():w.writestr(n,b'corrupt' if n=='index.html' else z.read(n))
  r=self.install(bad);self.assertNotEqual(r.returncode,0);self.assertIn('CHECKSUM_FAILED',r.stderr);self.assertFalse(self.backups.exists());self.assertEqual((self.target/'index.html').read_text(),'previous PIM 10.9.0 rubizh_pim_v7_launch')
 def test_partial_install_failure_rolls_back(self):
  r=self.install(env={**os.environ,'PIM_INSTALL_TEST_FAIL_AFTER':'4'});self.assertNotEqual(r.returncode,0);self.assertIn('INJECTED_INSTALL_FAILURE',r.stderr);self.assertEqual((self.target/'index.html').read_text(),'previous PIM 10.9.0 rubizh_pim_v7_launch');self.assertFalse((self.target/'lib/release-storage.js').exists())
 def test_public_backup_directory_rejected(self):
  r=self.install(backup_root=self.target/'backups');self.assertNotEqual(r.returncode,0);self.assertIn('BACKUP_MUST_BE_OUTSIDE',r.stderr)
 def test_empty_backup_rejected(self):
  self.data.write_text('{"format":"rubizh-pim-backup","cfg":{},"products":[]}');r=self.install();self.assertNotEqual(r.returncode,0);self.assertFalse(self.backups.exists())
 def test_missing_binary_document_rejected(self):
  d=json.loads(self.data.read_text());d['docs']=[{'id':'doc1'}];self.data.write_text(json.dumps(d));r=self.install();self.assertNotEqual(r.returncode,0);self.assertIn('MISSING_DOCUMENT_BINARIES',r.stderr)
 def test_symlink_escape_rejected(self):
  outside=self.root/'outside';outside.mkdir();(self.target/'lib').symlink_to(outside,target_is_directory=True);r=self.install();self.assertNotEqual(r.returncode,0);self.assertIn('SYMLINK_TARGET',r.stderr);self.assertFalse(self.backups.exists())
 def test_archive_traversal_rejected(self):
  bad=self.root/'bad.zip'
  with zipfile.ZipFile(ARCHIVE) as z,zipfile.ZipFile(bad,'w') as w:
   for n in z.namelist():w.writestr(n,z.read(n))
   w.writestr('../escape','unsafe')
  r=self.install(bad);self.assertNotEqual(r.returncode,0);self.assertIn('UNSAFE_ARCHIVE',r.stderr)
 def test_wrong_storage_namespace_rejected(self):
  (self.target/'index.html').write_text('rubizh_pim_rc_v1');r=self.install();self.assertNotEqual(r.returncode,0);self.assertIn('NAMESPACE_NOT_CONFIRMED',r.stderr)
 def test_corrupt_previous_backup_blocks_rollback_before_any_write(self):
  r=self.install();self.assertEqual(r.returncode,0,r.stderr);b=Path(json.loads(r.stdout)['BACKUP_PATH']);(b/'previous/index.html').write_text('corrupt');before=(self.target/'index.html').read_bytes();rb=subprocess.run(['python3',str(SCRIPT),'rollback','--backup',str(b)],capture_output=True,text=True);self.assertNotEqual(rb.returncode,0);self.assertIn('PREVIOUS_CODE_BACKUP_CORRUPT',rb.stderr);self.assertEqual((self.target/'index.html').read_bytes(),before)
 def test_corrupt_data_backup_blocks_code_rollback(self):
  r=self.install();self.assertEqual(r.returncode,0,r.stderr);b=Path(json.loads(r.stdout)['BACKUP_PATH']);(b/'data-backup.bin').write_bytes(b'corrupt');before=(self.target/'index.html').read_bytes();rb=subprocess.run(['python3',str(SCRIPT),'rollback','--backup',str(b)],capture_output=True,text=True);self.assertNotEqual(rb.returncode,0);self.assertIn('DATA_BACKUP_CORRUPT',rb.stderr);self.assertEqual((self.target/'index.html').read_bytes(),before)
if __name__=='__main__':unittest.main(verbosity=2)
