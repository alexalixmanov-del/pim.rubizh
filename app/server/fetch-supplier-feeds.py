#!/usr/bin/env python3
"""Download supplier files for a hosting cron job. Never expose purchase-price files publicly."""
import argparse, hashlib, json, os, re, tempfile, urllib.parse, urllib.request
from pathlib import Path
from datetime import datetime, timezone
MAX_BYTES=64*1024*1024

def atomic_write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    descriptor,tmp=tempfile.mkstemp(prefix='.feed-',dir=path.parent)
    try:
        with os.fdopen(descriptor,'wb') as stream:stream.write(data)
        os.chmod(tmp,0o600);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def source_url(raw):
    url=urllib.parse.urlsplit(raw)
    if url.scheme!='https' or not url.hostname or url.username or url.password:
        raise ValueError('Only direct HTTPS URLs without embedded credentials are supported')
    return raw

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        source_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(raw,opener=None):
    request=urllib.request.Request(source_url(raw),headers={'User-Agent':'Rubizh-PIM-feed-collector/10.6'})
    opener=opener or urllib.request.build_opener(SafeRedirect())
    with opener.open(request,timeout=45) as response:
        if int(response.headers.get('Content-Length') or 0)>MAX_BYTES:raise ValueError('Feed exceeds 64 MiB')
        data=response.read(MAX_BYTES+1)
        if not data:raise ValueError('Empty feed')
        if len(data)>MAX_BYTES:raise ValueError('Feed exceeds 64 MiB')
        if 'text/html' in response.headers.get('Content-Type','').lower() or re.match(rb'\s*(?:<!doctype\s+html|<html\b)',data,re.I):
            raise ValueError('Expected a price file, received an HTML page')
        return data

def collect(config,output,opener=None):
    output=Path(output);output.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(output,0o700)
    results=[];seen=set()
    for source in config.get('sources',[]):
        if not source.get('enabled',True):continue
        sid=str(source.get('id',''))
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}',sid) or sid in ('.','..') or sid in seen:
            raise ValueError('Every source requires a unique, valid ID')
        seen.add(sid);checked=datetime.now(timezone.utc).isoformat();row={'id':sid,'checked_at':checked}
        try:
            data=fetch(source['url'],opener);path=output/(sid+'.feed');atomic_write(path,data)
            row.update(ok=True,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),file=path.name)
            atomic_write(output/(sid+'.json'),json.dumps(row,indent=2).encode())
        except Exception as error:
            # Avoid logging signed URLs or credentials. Retain the previous good file and metadata.
            row.update(ok=False,error_type=type(error).__name__)
        results.append(row)
    status={'checked_at':datetime.now(timezone.utc).isoformat(),'sources':results,'applied_to_pim':False}
    atomic_write(output/'status.json',json.dumps(status,indent=2).encode())
    return status

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--web-root',required=True,help='Public PIM directory; output must be outside it')
    args=parser.parse_args();output=Path(args.output).resolve();web=Path(args.web_root).resolve()
    if output==web or web in output.parents:parser.error('Supplier files must be stored outside the public website directory')
    config=json.loads(Path(args.config).read_text());status=collect(config,output)
    print(json.dumps(status,ensure_ascii=False))
    return 1 if any(not x['ok'] for x in status['sources']) else 0

if __name__=='__main__':raise SystemExit(main())
