import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {makeServer} from '../scripts/serve.mjs';
const python=String.raw`
from playwright.sync_api import sync_playwright
import json,sys,time,base64,uuid,os
url=sys.argv[1]
products=[{'id':'retro-sneakers','name':'Retro Sneakers','unitPriceCents':8500,'image':'assets/sneakers.svg'},{'id':'classic-tee','name':'Classic Tee','unitPriceCents':2800,'image':'assets/tee.svg'},{'id':'everyday-hoodie','name':'Everyday Hoodie','unitPriceCents':6400,'image':'assets/hoodie.svg'},{'id':'city-backpack','name':'City Backpack','unitPriceCents':5200,'image':'assets/backpack.svg'}]
byid={p['id']:p for p in products}
uid=str(uuid.uuid4()); now=int(time.time())
enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':now+3600,'iat':now,'is_anonymous':True})+'.fixture-only-signature'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'','is_anonymous':True,'created_at':'2026-11-12T10:00:00Z'}
records={'sql':{},'mongo':{}}; requests=[];fail_save=False
with sync_playwright() as p:
 for engine in ['chromium','firefox']:
  records={'sql':{},'mongo':{}};requests=[]
  browser=getattr(p,engine).launch(headless=True,**({'executable_path':os.environ['SAVED_ORDERS_FIREFOX']} if engine=='firefox' and os.environ.get('SAVED_ORDERS_FIREFOX') else {}));context=browser.new_context(viewport={'width':1440,'height':1080});page=context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  # All remote requests are intercepted. These are browser contract fixtures, not database evidence.
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
  context.route('https://example.supabase.co/**',remote)
  context.route('**/config.js',lambda r:r.fulfill(content_type='text/javascript',body="window.SavedOrdersConfig={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_browser_fixture',functionName:'saved-orders'};"))
  def shell(route):
   response=route.fetch();headers=dict(response.headers);headers['content-security-policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://example.supabase.co; object-src 'none'";route.fulfill(response=response,headers=headers)
  context.route(url+'/',shell)
  page.goto(url);page.wait_for_selector('.saved-orders-app');page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Start a demo session')")
  assert not requests,'auth must never start automatically'
  page.get_by_role('button',name='Add to draft',exact=False).click()
  page.get_by_role('button',name='Start demo session',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('saved orders read')")
  assert '$85.00' in page.locator('.ss-grand-total').inner_text(),'starting auth must preserve existing local draft'
  fail_save=True
  page.get_by_role('button',name='Save order',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('503')")
  assert '$85.00' in page.locator('.ss-grand-total').inner_text()
  assert len(records['sql'])==0
  fail_save=False
  page.get_by_role('button',name='Save order',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Order saved')")
  assert len(records['sql'])==1
  assert page.locator('.ss-summary-badge').inner_text()=='Saved record'
  page.get_by_label('Order label',exact=True).fill('Renamed essentials')
  page.get_by_role('button',name='Rename saved order',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Saved order updated')")
  page.get_by_role('button',name='Classic Tee $28.00',exact=False).click()
  page.get_by_role('button',name='Add to saved order',exact=False).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Saved order updated')")
  assert '$113.00' in page.locator('.ss-grand-total').inner_text()
  page.get_by_label('Quantity for Classic Tee',exact=True).select_option('3')
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Saved order updated')")
  assert '$169.00' in page.locator('.ss-grand-total').inner_text()
  page.get_by_role('button',name='Remove Classic Tee',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Saved order updated')")
  assert '$85.00' in page.locator('.ss-grand-total').inner_text()
  before=requests.count('explicit anonymous auth')
  page.reload();page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('saved order read') || document.querySelector('.ss-status').textContent.includes('saved orders read')")
  assert requests.count('explicit anonymous auth')==before
  page.get_by_role('button',name='Renamed essentials',exact=False).click()
  page.wait_for_function("()=>document.querySelector('.ss-summary-badge').textContent==='Saved record'")
  page.get_by_label('Save in',exact=True).select_option('mongo')
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('MongoDB')")
  assert len(records['mongo'])==0
  assert page.locator('.ss-summary-badge').inner_text()=='Local draft'
  page.get_by_role('button',name='Add to draft',exact=False).click()
  page.get_by_role('button',name='Save order',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Order saved')")
  assert len(records['mongo'])==1 and len(records['sql'])==1
  page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Delete saved order',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Order deleted')")
  assert len(records['mongo'])==0
  page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Sign out',exact=True).click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Signed out')")
  assert len(records['sql'])==1
  assert page.locator('.ss-order-button').count()==0
  assert not errors,errors
  print(json.dumps({'browser':engine,'type':'intercepted browser fixtures, not hosted database tests','flow':'explicit auth; draft preserved; 503; order/item CRUD; reload; independent engines; delete; local sign-out','requests':len(requests),'uncaughtErrors':len(errors)}))
  context.close();browser.close()
`;
test('browser contract fixtures exercise full frontend flow without hosted mutations',{timeout:180000},async()=>{
 const server=await makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const child=spawn('python3',['-c',python,`http://127.0.0.1:${server.address().port}`],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);const code=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});assert.equal(code,0,stderr||stdout);console.log(stdout.trim());}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
