"""Isolated Lighthouse CLI audits through a fresh Chromium CDP instance per profile."""
import argparse,json,socket,subprocess,urllib.request,time
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--output',required=True);parser.add_argument('--node',required=True);parser.add_argument('--lighthouse',required=True);parser.add_argument('--profiles',nargs='+',choices=['mobile','desktop'],default=['mobile','desktop']);args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
summary={'url':args.url,'captured_at':datetime.now(timezone.utc).isoformat(),'execution':'Lighthouse CLI with isolated Playwright Chromium over loopback CDP; emulation, not physical devices or branded Chrome DevTools','profiles':{}}
with sync_playwright() as p:
 for profile in args.profiles:
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  browser=p.chromium.launch(headless=True,args=[f'--remote-debugging-port={port}','--remote-debugging-address=127.0.0.1'])
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version',timeout=5) as response:identity=json.load(response)
   command=[args.node,args.lighthouse,args.url,'--port='+str(port),'--hostname=127.0.0.1','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html','--output-path='+str(out/profile),'--quiet']
   if profile=='desktop':command.append('--preset=desktop')
   result=subprocess.run(command,capture_output=True,text=True,timeout=150)
   (out/(profile+'-execution.log')).write_text(result.stdout+result.stderr)
   reportpath=out/(profile+'.report.json')
   if not reportpath.exists():
    summary['profiles'][profile]={'status':'blocked','exit_code':result.returncode,'diagnostic':(result.stderr or result.stdout)[-2000:]};continue
   data=json.loads(reportpath.read_text());summary['profiles'][profile]={'status':'completed' if not data.get('runtimeError') else 'failed','exit_code':result.returncode,'lighthouseVersion':data['lighthouseVersion'],'browser':identity.get('Browser'),'scores':{k:round(v['score']*100) if v['score'] is not None else None for k,v in data['categories'].items()},'warnings':data.get('runWarnings'),'runtimeError':data.get('runtimeError'),'formFactor':data['configSettings'].get('formFactor'),'screenEmulation':data['configSettings'].get('screenEmulation'),'findings':[{'id':k,'title':v['title'],'score':v.get('score'),'displayValue':v.get('displayValue'),'details':v.get('details')} for k,v in data['audits'].items() if v.get('score') is not None and v['score']<1]}
  finally:
   browser.close();(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({**summary,'profiles':{k:{x:y for x,y in v.items() if x!='findings'} for k,v in summary['profiles'].items()}},indent=2))
raise SystemExit(1 if any(x['status']!='completed' for x in summary['profiles'].values()) else 0)
