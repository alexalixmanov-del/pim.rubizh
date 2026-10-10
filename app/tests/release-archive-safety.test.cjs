'use strict';
// Release archive safety: the production archive is built from the allowlist and must carry no private data,
// credentials, supplier source files, staging config or developer paths.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const DENY_NAMES=/(?:^|\/)(?:\.env|config\.php|.*\.sql(?:\.gz)?|.*\.gz|.*\.xlsx?|.*\.xml|.*\.ya?ml|.*backup.*\.json|.*\.pem|.*\.key|id_rsa.*|.*private.*|.*staging.*|.*\.jsonl)$/iu;
const DENY_TEXT=[[/\/tmp\/claude-0/u,'sandbox path'],[/\/home\/user\b|\/Users\/[a-z]/u,'developer path'],[/-----BEGIN [A-Z ]*PRIVATE KEY-----/u,'private key'],[/\bAKIA[0-9A-Z]{16}\b/u,'AWS key'],[/\bgh[pousr]_[A-Za-z0-9]{30,}/u,'GitHub token'],[/\bsk-[A-Za-z0-9]{32,}/u,'API key'],[/\b(?:password|passwd|db_pass|secret)\s*[:=]\s*['"][^'"\s]{6,}['"]/iu,'credential literal']];
function entries(zip){const py="import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode('utf-8','replace') for n in z.namelist()}))";return JSON.parse(execFileSync('python3',['-c',py,zip],{maxBuffer:1<<28}));}
test('production archive: allowlisted files only, no private data, credentials or developer paths',()=>{
 const zip=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pim-rel-')),'r.zip');execFileSync('python3',[path.join(__dirname,'../tools/package-production.py'),zip]);
 const files=entries(zip),bad=[];
 for(const [name,text] of Object.entries(files)){if(DENY_NAMES.test(name))bad.push(name+': denied file');for(const [re,why] of DENY_TEXT)if(re.test(text))bad.push(name+': '+why);}
 assert.deepEqual(bad,[]);assert.ok(files['index.html']&&files['PRODUCTION-MANIFEST.json']);
 const manifest=JSON.parse(files['PRODUCTION-MANIFEST.json']);assert.equal(manifest.autoprices_enabled,false);assert.deepEqual(Object.keys(manifest.files).sort(),Object.keys(files).filter(n=>n!=='PRODUCTION-MANIFEST.json').sort());
});
test('the committed release archive is exactly the one the packager builds from this commit',()=>{
 const zip=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pim-rel-')),'r.zip');execFileSync('python3',[path.join(__dirname,'../tools/package-production.py'),zip]);
 const sha=f=>require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex'),committed=path.join(__dirname,'../../releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip');
 assert.equal(sha(zip),sha(committed));assert.equal(fs.readFileSync(committed+'.sha256','utf8').split(/\s+/)[0],sha(committed));
});
