"""Real-browser acceptance; controlled error fixtures are labeled separately."""
import argparse, json, time, hashlib, traceback
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:8796/')
parser.add_argument('--output',required=True)
parser.add_argument('--firefox-executable')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[1]
report={'url':args.url,'captured_at':datetime.now(timezone.utc).isoformat(),'scope':'Browser requests to the actual application; injected malformed/error/cancellation cases explicitly labeled controlled','cases':[],'browsers':{},'errors':{},'source_sha256':{}}
for path in root.rglob('*'):
 if path.is_file() and not any(x in path.relative_to(root).parts for x in ['node_modules','dist','docs','__pycache__']) and path.name!='.env':report['source_sha256'][str(path.relative_to(root))]=hashlib.sha256(path.read_bytes()).hexdigest()

def record(engine,name,action,kind='actual'):
 try:
  detail=action();report['cases'].append({'engine':engine,'name':name,'kind':kind,'status':'passed','detail':detail})
 except Exception as error:
  report['cases'].append({'engine':engine,'name':name,'kind':kind,'status':'failed','detail':str(error),'trace':traceback.format_exc()[-2400:]})
 finally:(out/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n')

def require(condition,message):
 if not condition:raise AssertionError(message)

def run_engine(p,name):
 options={'headless':True}
 if name=='firefox' and args.firefox_executable:options['executable_path']=args.firefox_executable
 browser=getattr(p,name).launch(**options);report['browsers'][name]=browser.version
 context=browser.new_context(viewport={'width':1920,'height':1080})
 if name=='chromium':context.grant_permissions(['clipboard-read','clipboard-write'])
 page=context.new_page();page.set_default_timeout(12000)
 errors=[];bad_assets=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:bad_assets.append({'url':r.url,'status':r.status}) if r.status>=400 and not '/api/' in r.url else None)
 page.goto(args.url,wait_until='networkidle');page.wait_for_selector('.pulse-dashboard');page.evaluate('document.fonts.ready');page.wait_for_timeout(500)
 dashboard=page.locator('#pulse-root')
 runtime={}
 def check_live():
  with page.expect_response(lambda r:r.url.split('?')[0].endswith('/api/runtime')) as observed:
   page.get_by_role('button',name='Check runtime',exact=True).click()
  response=observed.value;data=response.json();require(response.status==200,'Runtime HTTP not 200');require(data['service']=='container-pulse','Wrong service');require(data['processUptimeSeconds']>=0,'Invalid uptime');runtime.update(data)
  page.wait_for_function('(host)=>document.querySelector("#pulse-root").innerText.includes(host)',arg=data['hostname'])
  require(dashboard.get_by_text(data['hostname'],exact=False).count()>0,'Real responding identity missing');return {'status':response.status,'hostname':data['hostname']}
 record(name,'real runtime request updates React workspace',check_live)
 def ack():
  checkbox=dashboard.get_by_role('checkbox').first;checkbox.check();require(checkbox.is_checked(),'Acknowledgment not checked');checkbox.uncheck();return 'Native acknowledgment toggled; no server mutation.'
 record(name,'notification acknowledgment',ack)
 def batch():
  replies=[]
  def onresponse(r):
   if r.url.split('?')[0].endswith('/api/runtime'):replies.append(r)
  page.on('response',onresponse)
  button=page.get_by_role('button',name='Sample 6 checks',exact=True)
  button.click();page.wait_for_function('()=>!document.querySelector("#pulse-root button").disabled');page.wait_for_timeout(300)
  page.remove_listener('response',onresponse)
  require(len(replies)==6,f'Expected six actual requests, got {len(replies)}')
  require(all(r.status==200 for r in replies),'Batch contained unsuccessful reply');return {'responses':len(replies),'hostnames':sorted({r.json()['hostname'] for r in replies})}
 record(name,'bounded actual sample batch',batch)
 def clear():
  page.get_by_role('button',name='Clear',exact=True).click();page.wait_for_timeout(100);require(dashboard.get_by_role('checkbox').count()==0,'Notifications remain');require(runtime.get('hostname','impossible') not in dashboard.inner_text(),'Old runtime remained after clear');return 'Cleared observations and notifications.'
 record(name,'clear current-page observations',clear)
 def offline():
  context.set_offline(True)
  try:
   page.get_by_role('button',name='Check runtime',exact=True).click();page.wait_for_function('()=>!document.querySelector("#pulse-root button").disabled');require(runtime.get('hostname','impossible') not in dashboard.inner_text(),'Offline request fabricated/retained successful runtime');require(dashboard.get_by_role('checkbox').count()>0,'Failure notification missing')
  finally:context.set_offline(False)
  return 'Actual offline failure recorded without fabricated metadata.'
 record(name,'offline failure',offline)
 record(name,'online retry after offline failure',check_live)
 def malformed():
  page.get_by_role('button',name='Clear',exact=True).click()
  page.route('**/api/runtime',lambda route:route.fulfill(status=200,content_type='application/json',body='{"service":"wrong","hostname":"fabricated"}'))
  try:
   page.get_by_role('button',name='Check runtime',exact=True).click();page.wait_for_function('()=>!document.querySelector("#pulse-root button").disabled');require('fabricated' not in dashboard.inner_text(),'Malformed hostname reached UI');require(dashboard.get_by_role('checkbox').count()>0,'Malformed-response notice missing')
  finally:page.unroute('**/api/runtime')
  return 'Controlled malformed HTTP200 rejected.'
 record(name,'malformed success-body rejection',malformed,'controlled fixture')
 def cancel():
  page.get_by_role('button',name='Clear',exact=True).click();held=[]
  page.route('**/api/runtime',lambda route:held.append(route))
  try:
   page.get_by_role('button',name='Check runtime',exact=True).click();page.wait_for_timeout(150);require(len(held)==1,'No pending request to cancel');page.get_by_role('button',name='Clear',exact=True).click()
   try:held[0].fulfill(status=200,content_type='application/json',body=json.dumps(runtime))
   except Exception:pass
   page.wait_for_timeout(250);require(dashboard.get_by_role('checkbox').count()==0,'Late result restored a notification');require(runtime.get('hostname','impossible') not in dashboard.inner_text(),'Late result restored runtime')
  finally:page.unroute('**/api/runtime')
  return 'Clear cancelled a controlled delayed response.'
 record(name,'clear suppresses stale responses',cancel,'controlled fixture')
 record(name,'real recovery after controlled cases',check_live)
 def copy_prompts():
  results=[]
  for stage in ['Review','Plan','Build','Verify']:
   code=page.locator('#pulse'+stage+'Prompt');details=code.locator('xpath=ancestor::details');
   if details.count() and details.get_attribute('open') is None:details.locator('summary').click()
   button=page.locator('[data-copy-target="pulse'+stage+'Prompt"]');button.scroll_into_view_if_needed();button.click()
   if name=='chromium':
    actual=page.evaluate('navigator.clipboard.readText()');require(actual==code.text_content(),'Incomplete clipboard for '+stage)
   else:
    require(button.inner_text() in ['Copied!','Copied','Selected','Copy '+stage] or 'cop' in button.inner_text().lower(),'Unexpected clipboard state')
   results.append(stage)
  return results
 record(name,'all reusable prompt controls',copy_prompts)
 def keyboard():
  page.get_by_role('button',name='Clear',exact=True).click()
  for menu in ['.portfolio-theme-menu','.portfolio-menu']:
   toggle=page.locator(menu+' > button');toggle.focus();page.keyboard.press('Enter');require(toggle.get_attribute('aria-expanded')=='true','Keyboard menu did not open');page.keyboard.press('Escape');require(toggle.get_attribute('aria-expanded')=='false','Escape did not close menu')
  page.locator('body').click(position={'x':3,'y':3})
  visited=[]
  for i in range(22):
   page.keyboard.press('Tab');active=page.evaluate('()=>{const e=document.activeElement;return {tag:e.tagName,text:e.innerText?.slice(0,60),closed:!!e.closest("[inert]")}}');require(not active['closed'],'Focus entered a collapsed menu');visited.append(active)
  return {'sequential_stops':len(visited)}
 record(name,'keyboard menu, Escape, closed-panel Tab exclusion',keyboard)
 themes=['standard','playful-pop','raggedy-granite','glossy-marble','luminous-midnight','gothic-stickerboard','baroque-plexiglas']
 for theme in themes:
  for mode in ['light','dark']:
   page.evaluate('async prefs=>{await window.portfolioTheme.applyKnownPreferences(prefs); await document.fonts.ready}',{'styleTheme':theme,'mode':mode,'persist':False});page.wait_for_timeout(350)
   for width in [1920,1151,1150,1149,768,390,320]:
    def geometry(w=width,t=theme,m=mode):
     page.set_viewport_size({'width':w,'height':1080 if w>768 else 900});page.wait_for_timeout(100)
     d=page.evaluate('''()=>{const map=document.querySelector('.pulse-map-desktop');const r=map.getBoundingClientRect(),m=map.getScreenCTM();return {overflow:document.documentElement.scrollWidth-innerWidth, theme:document.documentElement.dataset.styleTheme, mode:document.documentElement.dataset.theme, mapVisible:r.width>0, scaleX:Math.hypot(m.a,m.b),scaleY:Math.hypot(m.c,m.d),text:[...map.querySelectorAll('text')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right}))}}''')
     require(d['overflow']<=1,f'Horizontal overflow {d["overflow"]}');require(d['theme']==t and d['mode']==m,'Wrong rendered appearance')
     if d['mapVisible']:
      require(abs(d['scaleX']-d['scaleY'])<0.0001,'Map does not scale as one composition')
      if w==1920:require(all(x['height']>=12 for x in d['text']),'Unreadable full-width map label')
      require(all(x['x']>=0 and x['right']<=w for x in d['text']),'Map label extends beyond viewport')
     return {'width':w,'theme':t,'mode':m,'overflow':d['overflow']}
    record(name,f'layout {theme}/{mode}/{width}',geometry,'rendered layout')
 page.evaluate('async()=>{await window.portfolioTheme.applyKnownPreferences({styleTheme:"gothic-stickerboard",mode:"light",persist:false});await document.fonts.ready}')
 for width,label in [(1920,'desktop'),(390,'mobile')]:
  page.set_viewport_size({'width':width,'height':1080 if width==1920 else 844});page.wait_for_timeout(350);page.screenshot(path=str(out/f'{name}-{label}-full.png'),full_page=True)
  for selector,part in [('#final-result','working'),('#system-architecture','architecture')]:
   element=page.locator(selector);element.scroll_into_view_if_needed();page.wait_for_timeout(100);page.screenshot(path=str(out/f'{name}-{label}-{part}.png'))
 report['errors'][name]={'uncaught':errors,'unexpected_asset_http_errors':bad_assets}
 record(name,'no uncaught JavaScript or unexpected static HTTP failures',lambda:require(not errors and not bad_assets,json.dumps(report['errors'][name])))
 context.close();browser.close()

try:
 with sync_playwright() as p:
  for engine in ['chromium','firefox']:
   try:run_engine(p,engine)
   except Exception as e:report['cases'].append({'engine':engine,'name':'engine execution','status':'failed','detail':str(e),'trace':traceback.format_exc()[-3000:]})
finally:
 report['totals']={status:sum(c['status']==status for c in report['cases']) for status in ['passed','failed']}
 (out/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'totals':report['totals'],'failures':[c for c in report['cases'] if c['status']=='failed']},indent=2))
raise SystemExit(1 if report['totals']['failed'] else 0)
