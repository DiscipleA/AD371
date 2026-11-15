import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
// Fixture auth/CRUD reused from frontend.browser.mjs. No hosted requests escape interception.
const python=String.raw`from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
import threading,mimetypes,json,sys,time,base64,uuid,os,re
root=Path(sys.argv[1]).resolve(); shell_path=sys.argv[2]; output=Path(sys.argv[3]); output.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('SAVED_ORDERS_CONTRAST_PHASE','GREEN')
class PublicOnly(BaseHTTPRequestHandler):
 def do_GET(self):
  path=unquote(urlparse(self.path).path).lstrip('/')
  allowed=(path==shell_path or path in ['theme.js','site-navigation.js','copy-code.js'] or (path.startswith(('styles/','assets/','showcases/stylestore-saved-orders/assets/')) and Path(path).suffix in ['.css','.js','.svg','.woff','.woff2','.png','.jpg','.webp','.ico']))
  file=(root/path).resolve()
  if not allowed or not file.is_relative_to(root) or not file.is_file():self.send_error(404);return
  data=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),PublicOnly);threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}';url=origin+'/'+shell_path
products=[{'id':'retro-sneakers','name':'Retro Sneakers','unitPriceCents':8500,'image':'assets/sneakers.svg'},{'id':'classic-tee','name':'Classic Tee','unitPriceCents':2800,'image':'assets/tee.svg'},{'id':'everyday-hoodie','name':'Everyday Hoodie','unitPriceCents':6400,'image':'assets/hoodie.svg'},{'id':'city-backpack','name':'City Backpack','unitPriceCents':5200,'image':'assets/backpack.svg'}]
byid={p['id']:p for p in products}
uid=str(uuid.uuid4()); now=int(time.time())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':now+3600,'iat':now,'is_anonymous':True})+'.fixture-only-signature'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'','is_anonymous':True,'created_at':'2026-11-12T10:00:00Z'}
records={'sql':{},'mongo':{}}; requests=[];fail_save=False
def remote(route):
 global fail_save
 req=route.request; path=req.url.split('example.supabase.co')[-1]; body=req.post_data_json if req.post_data else {}; method=req.method
 if '/auth/v1/signup' in path:
  requests.append('explicit anonymous auth')
  route.fulfill(status=200,json={'access_token':token,'refresh_token':'fixture-refresh-token','token_type':'bearer','expires_in':3600,'expires_at':now+3600,'user':user});return
 if '/auth/v1/logout' in path:route.fulfill(status=204);return
 if '/auth/' in path:route.fulfill(status=200,json={'user':user});return
 assert req.headers.get('apikey')=='sb_publishable_browser_fixture'
 assert req.headers.get('authorization','').startswith('Bearer ')
 path,query=path.split('?');model=query.split('=')[-1];tail=path.split('/saved-orders')[-1]; parts=tail.strip('/').split('/');store=records[model]
 requests.append(method+' '+model+' '+tail)
 if parts[0]=='catalog':route.fulfill(status=200,json={'ok':True,'engine':model,'data':products});return
 def line(raw):
  product=byid[raw['productId']]
  return {'id':str(uuid.uuid4()),'productId':product['id'],'name':product['name'],'unitPriceCents':product['unitPriceCents'],'quantity':raw['quantity']}
 status=200
 if len(parts)==1:
  if method=='GET': data=[{'id':o['id'],'label':o['label'],'itemCount':sum(i['quantity'] for i in o['items']),'totalCents':o['totalCents'],'updatedAt':o['updatedAt']} for o in store.values()]
  else:
   if fail_save:route.fulfill(status=503,json={'ok':False,'error':{'code':'UNAVAILABLE','message':'Controlled browser fixture unavailable'}});return
   oid=str(uuid.uuid4());data={'id':oid,'label':body['label'],'items':[line(i) for i in body['items']],'totalCents':0,'createdAt':'2026-11-12T10:00:00Z','updatedAt':'2026-11-12T10:00:00Z'};data['totalCents']=sum(i['unitPriceCents']*i['quantity'] for i in data['items']);store[oid]=data;status=201
 else:
  oid=parts[1];data=store[oid]
  if len(parts)==2:
   if method=='DELETE':del store[oid];data={'id':oid,'deleted':True}
   elif method=='PATCH':data['label']=body['label']
  elif len(parts)==3:
   data['items'].append(line(body));status=201
  else:
   if method=='DELETE':data['items']=[i for i in data['items'] if i['id']!=parts[3]]
   else:
    for item in data['items']:
     if item['id']==parts[3]:item['quantity']=body['quantity']
  if 'items' in data:data['totalCents']=sum(i['unitPriceCents']*i['quantity'] for i in data['items'])
 route.fulfill(status=status,json={'ok':True,'engine':model,'data':data})

results=[]; violations=[]; denied=[];errors=[]
measure=r"""panel=>{
 const rgba=color=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
 const blend=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3])).concat(1);
 const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const sample=el=>{const s=getComputedStyle(el);let bg=[255,255,255,1];const chain=[];for(let n=el;n;n=n.parentElement)chain.unshift(n);for(const n of chain)bg=blend(rgba(getComputedStyle(n).backgroundColor),bg);const fg=blend(rgba(s.color),bg),a=luminance(fg),b=luminance(bg);const r=el.getBoundingClientRect();return {text:el.textContent,color:s.color,background:s.backgroundColor,effectiveBackground:bg,backgroundImage:s.backgroundImage,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fontSize:s.fontSize,padding:s.padding,whiteSpace:s.whiteSpace,overflowWrap:s.overflowWrap,overflowY:s.overflowY,client:[el.clientWidth,el.clientHeight],scroll:[el.scrollWidth,el.scrollHeight],bounds:[r.x,r.y,r.width,r.height],outline:[s.outlineStyle,s.outlineWidth,s.outlineColor],focused:el===document.activeElement,focusVisible:el.matches(':focus-visible')};};
 const matched=el=>{const rules=[];const walk=(list,href)=>{for(const rule of list){if(rule.selectorText){try{if(el.matches(rule.selectorText)&&(rule.style.color||rule.style.background||rule.style.backgroundColor))rules.push({sheet:href,selector:rule.selectorText,color:rule.style.color,background:rule.style.background,important:[rule.style.getPropertyPriority('color'),rule.style.getPropertyPriority('background')]});}catch{}}else if(rule.cssRules)walk(rule.cssRules,href);}};for(const sheet of document.styleSheets)try{walk(sheet.cssRules,sheet.href);}catch{}return rules;};
 const pre=panel.querySelector('pre'),summary=panel.querySelector('summary');summary.focus();const summaryFocus=sample(summary);pre.focus();return {summary:sample(summary),summaryFocus,json:sample(pre),hint:sample(panel.querySelector('.ss-field-hint')),nested:[...pre.querySelectorAll('code')].map(sample),matchedPre:matched(pre),open:panel.open,pageOverflow:document.documentElement.scrollWidth>innerWidth};
}"""
with sync_playwright() as p:
 for engine in ['chromium','firefox']:
  launch={'headless':True}
  if engine=='firefox' and os.environ.get('SAVED_ORDERS_FIREFOX'):launch['executable_path']=os.environ['SAVED_ORDERS_FIREFOX']
  browser=getattr(p,engine).launch(**launch);context=browser.new_context(viewport={'width':1440,'height':1080},reduced_motion='reduce');page=context.new_page()
  records={'sql':{},'mongo':{}};requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def isolated(route):
   req=route.request
   if req.url.startswith('https://example.supabase.co/'):remote(route);return
   if not req.url.startswith(origin+'/'):denied.append(req.url);route.abort();return
   if req.url.endswith('/config.js'):route.fulfill(content_type='text/javascript',body="window.SavedOrdersConfig={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_browser_fixture',functionName:'saved-orders'};");return
   if req.url==url:
    response=route.fetch();body=response.text();body=re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data:; font-src \'self\'; connect-src \'self\' https://example.supabase.co; object-src \'none\'">',body,flags=re.I)
    route.fulfill(response=response,body=body);return
   assert req.method=='GET',('unexpected local write',req.url,req.method)
   route.continue_()
  context.route('**/*',isolated)
  page.goto(url);page.wait_for_function("()=>document.querySelector('.ss-status')?.textContent.includes('Start a demo session')")
  assert not requests,'explicit fixture session only'
  assert page.locator('.ss-response').count()==0,'must exercise conditional panel, not fabricate DOM'
  page.get_by_role('button',name='Add to draft',exact=False).click()
  page.get_by_role('button',name='Start demo session',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('saved orders read')")
  themes=page.evaluate('PortfolioThemeRegistry.getAll().map(t=>t.id)');assert len(themes)==7,themes
  for state in ['POST','GET','PATCH','DELETE']:
   if state=='POST':
    page.get_by_role('button',name='Save order',exact=True).click();message='Order saved'
   elif state=='GET':
    page.get_by_role('button',name='Refresh orders',exact=True).click();message='saved order read'
   elif state=='PATCH':
    # Keep label within the same 80-code-point domain limit as production.
    page.get_by_label('Order label',exact=True).fill('Controlled fixture — '+('LongLabel'*6))
    page.get_by_role('button',name='Rename saved order',exact=True).click();message='Saved order updated'
   else:
    page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Delete saved order',exact=True).click();message='Order deleted'
   page.wait_for_function('(message)=>document.querySelector(".ss-status").textContent.includes(message)',arg=message)
   panel=page.locator('.ss-response');panel.locator('summary').click() if not panel.evaluate('(el)=>el.open') else None
   assert f'· {state} ' in panel.locator('summary').inner_text(),panel.inner_text()
   payload=json.loads(panel.locator('pre').inner_text());assert payload['engine']=='sql'
   assert payload['status']==(201 if state=='POST' else 200),payload
   if state=='DELETE':assert payload['data']['deleted'] is True
   elif state=='GET':assert len(payload['data'])==1
   else:assert payload['data']['items'][0]['name']=='Retro Sneakers'
   for theme in themes:
    for mode in ['light','dark']:
     page.evaluate('([styleTheme,mode])=>portfolioTheme.applyPreferences({styleTheme,mode})',[theme,mode])
     page.wait_for_function('(theme)=>document.querySelector("[data-style-theme-stylesheet]").dataset.activeStyleTheme===theme && document.querySelector("[data-style-theme-stylesheet]").sheet!==null',arg=theme)
     page.evaluate('document.fonts.ready');page.wait_for_timeout(40)
     for width in [1440,320]:
      page.set_viewport_size({'width':width,'height':1080});panel.scroll_into_view_if_needed()
      panel.locator('pre').focus();page.keyboard.press('Tab');page.keyboard.press('Shift+Tab')
      row={'browser':engine,'version':browser.version,'theme':theme,'mode':mode,'width':width,'state':state,**panel.evaluate(measure)}
      for key in ['summary','json','hint']:
       if row[key]['contrast']<4.5:violations.append({k:row[k] for k in ['browser','theme','mode','width','state']}|{'part':key,'ratio':row[key]['contrast'],'color':row[key]['color'],'bg':row[key]['background']})
      for nested in row['nested']:assert nested['contrast']>=4.5,nested
      assert row['open'] and not row['pageOverflow'],row
      assert row['json']['client'][0]>=60 and row['json']['scroll'][0]<=row['json']['client'][0]+1,row
      assert row['json']['whiteSpace']=='pre-wrap' and row['json']['overflowWrap']=='anywhere',row
      assert row['summaryFocus']['focused'] and row['summaryFocus']['focusVisible'] and row['summaryFocus']['outline'][0]!='none',row
      assert row['json']['focused'] and row['json']['focusVisible'] and row['json']['outline'][0]!='none',row
      if row['json']['scroll'][1]>row['json']['client'][1]:
       panel.locator('pre').evaluate('(el)=>el.scrollTop=el.scrollHeight');assert panel.locator('pre').evaluate('(el)=>el.scrollTop>0')
       panel.locator('pre').evaluate('(el)=>el.scrollTop=0')
      if theme=='gothic-stickerboard' and mode=='light' and state in ['POST','DELETE']:
       panel.screenshot(path=str(output/f'{phase}-{engine}-{state}-{width}.png'))
      results.append(row)
  assert not records['sql'] and not records['mongo'],'fixture records remain in memory only'
  context.close();browser.close()
server.shutdown();server.server_close()
report={'type':'intercepted in-memory frontend fixtures; NOT real DB/Auth proof; no external requests released','phase':phase,'cases':len(results),'violations':violations,'deniedExternal':denied,'errors':errors,'results':results}
(output/f'{phase}.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='results'}))
assert not errors,errors
assert not denied,denied
assert not violations,f'{len(violations)} populated response contrast failures; see {output}/{phase}.json'
`;
test('populated response contrast: CRUD × seven themes × both modes × Chromium/Firefox × desktop/mobile',{timeout:540000},async()=>{
 const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const root=process.env.SAVED_ORDERS_CONTRAST_ROOT||resolve(source,'dist');
 const shell=process.env.SAVED_ORDERS_CONTRAST_SHELL||'index.html';
 const output=process.env.SAVED_ORDERS_CONTRAST_OUTPUT||resolve(process.env.TMPDIR||'.','saved-orders-response-contrast');
 const child=spawn('python3',['-c',python,root,shell,output],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
 const code=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});console.log(stdout.trim());assert.equal(code,0,stderr||stdout);
});
