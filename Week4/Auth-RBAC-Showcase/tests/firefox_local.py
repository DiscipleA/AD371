"""Real Firefox/Gecko local presentation smoke. No fixtures or remote account actions."""
import base64,datetime,hashlib,json,time,urllib.request,urllib.error
from pathlib import Path
from websockets.sync.client import connect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/qa';URL='http://127.0.0.1:8771/'
DRIVER='http://127.0.0.1:4449';SID=None;WS=None
REPORT={'target':URL,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Real isolated Firefox local presentation and validation smoke. No backend requests, no fixture success data, no account mutations.','checks':[]}
def request(method,url,data=None):
 body=None if data is None else json.dumps(data).encode()
 req=urllib.request.Request(url,data=body,method=method,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode()[:1500])
def command(method,path,data=None):return request(method,DRIVER+'/session/'+SID+path,data)['value']
def js(source,*args):return command('POST','/execute/sync',{'script':source,'args':list(args)})
def wait(source):
 end=time.monotonic()+20
 while time.monotonic()<end:
  if js('return ('+source+')'):return
  time.sleep(.1)
 raise AssertionError('Timeout: '+source)
def element(selector):return command('POST','/element',{'using':'css selector','value':selector})['element-6066-11e4-a52e-4f735466cecf']
def click(selector):return command('POST','/element/'+element(selector)+'/click',{})
def check(name,detail=None):REPORT['checks'].append({'name':name,'passed':True,'detail':detail});print('PASS '+name,flush=True)
def viewport(width,height):
 context=command('GET','/window');WS.send(json.dumps({'id':1,'method':'browsingContext.setViewport','params':{'context':context,'viewport':{'width':width,'height':height}}}));result=json.loads(WS.recv(timeout=20));assert result.get('type')=='success',result
 assert js('return [innerWidth,innerHeight]')==[width,height]
def screenshot(name):
 (OUT/'screenshots'/name).write_bytes(base64.b64decode(command('GET','/screenshot')))
try:
 value=request('POST',DRIVER+'/session',{'capabilities':{'alwaysMatch':{'browserName':'firefox','webSocketUrl':True,'acceptInsecureCerts':False,'moz:firefoxOptions':{'binary':'/snap/firefox/current/usr/lib/firefox/firefox','args':['-headless'],'prefs':{'browser.shell.checkDefaultBrowser':False,'datareporting.policy.dataSubmissionEnabled':False}}}}})['value']
 SID=value['sessionId'];REPORT['browser']={'engine':'Firefox / Gecko','version':value['capabilities']['browserVersion'],'driver':'geckodriver 0.37.1','binary':'/snap/firefox/current/usr/lib/firefox/firefox','profile':'isolated temporary scratch profile'}
 WS=connect(value['capabilities']['webSocketUrl'],open_timeout=15)
 command('POST','/url',{'url':URL});wait("document.querySelector('#connection-status').textContent.includes('Configured')")
 assert js('return document.querySelectorAll("main > section").length')==7
 assert not js('return document.querySelector("#request-public").disabled')
 check('Firefox loads seven-section configured showcase and enabled controls')
 click('#auth-login');wait("document.querySelector('#auth-message').textContent.includes('Enter your email and password')")
 check('Empty credentials rejected in real Firefox')
 command('POST','/refresh',{});wait("document.querySelector('#connection-status').textContent.includes('Configured')")
 themes=js('return portfolioTheme.getThemes().map(t=>t.id)');assert len(themes)==7
 combos=0
 for width,height in [(1920,1080),(768,1024),(390,844),(320,900)]:
  viewport(width,height)
  for theme in themes:
   for mode in ['light','dark']:
    js('portfolioTheme.applyPreferences({styleTheme:arguments[0],mode:arguments[1]});',theme,mode)
    wait("(()=>{const l=document.querySelector('[data-style-theme-stylesheet]');return !!l?.sheet&&l.dataset.activeStyleTheme===document.documentElement.dataset.styleTheme})()")
    assert js('return Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)<=innerWidth+1'),(theme,mode,width)
    combos+=1
  js("portfolioTheme.applyPreferences({styleTheme:'gothic-stickerboard',mode:'light'});scrollTo(0,0)");screenshot(f'firefox-{width}-top.png')
  js("document.querySelector('#final-result').scrollIntoView()");screenshot(f'firefox-{width}-working.png')
 check('All Firefox theme/mode/viewport layout combinations',{'combinations':combos,'themes':themes,'viewports':[[1920,1080],[768,1024],[390,844],[320,900]],'note':'Overflow/sheet assertions and sampled screenshots; not accessibility certification'})
 viewport(390,844)
 js("scrollTo(0,0);document.querySelector('.portfolio-theme-menu__toggle').focus()")
 command('POST','/element/'+element('.portfolio-theme-menu__toggle')+'/value',{'text':'\ue007'})
 wait("!document.querySelector('.portfolio-theme-menu__panel').inert")
 time.sleep(.25)
 before=js('return document.activeElement.outerHTML')
 command('POST','/element/'+element('.portfolio-theme-menu__toggle')+'/value',{'text':'\ue004'})
 after=js('return document.activeElement.outerHTML')
 assert js("return document.activeElement.hasAttribute('data-theme-toggle')"),{'before':before,'after':after}
 command('POST','/element/'+element('[data-theme-toggle]')+'/value',{'text':'\ue00c'})
 wait("document.querySelector('.portfolio-theme-menu__panel').inert")
 assert js("return document.activeElement.classList.contains('portfolio-theme-menu__toggle')")
 check('Firefox real Enter/Tab/Escape menu focus behavior')
except Exception as e:
 REPORT['checks'].append({'name':'Firefox completion','passed':False,'detail':str(e)});print('FAIL',str(e),flush=True);raise
finally:
 if WS:WS.close()
 if SID:
  try:command('DELETE','')
  except Exception:pass
 REPORT['passed']=sum(c['passed'] for c in REPORT['checks']);REPORT['failed']=sum(not c['passed'] for c in REPORT['checks'])
 REPORT['source_hashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'index.html',ROOT/'scripts/auth-client.mjs',ROOT/'scripts/showcase.js',ROOT/'scripts/serve.py',ROOT/'config.js',ROOT/'styles/auth-rbac-showcase.css']}
 OUT.mkdir(exist_ok=True);(OUT/'firefox-local.json').write_text(json.dumps(REPORT,indent=2)+'\n')
