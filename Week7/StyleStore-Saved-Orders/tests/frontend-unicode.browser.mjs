import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {makeServer} from '../scripts/serve.mjs';

const python=String.raw`
from playwright.sync_api import sync_playwright, expect
import base64,json,os,sys,time,uuid
url,engine,scenario=sys.argv[1:]
label80='😀'*80
renamed80='🚀'*80
uid=str(uuid.uuid4()); oid=str(uuid.uuid4()); now=int(time.time())
enc=lambda value:base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'aud':'authenticated','role':'authenticated','exp':now+3600,'iat':now,'is_anonymous':True})+'.fixture-only-signature'
user={'id':uid,'aud':'authenticated','role':'authenticated','email':'','is_anonymous':True,'created_at':'2026-11-12T10:00:00Z'}
product={'id':'retro-sneakers','name':'Retro Sneakers','unitPriceCents':8500,'image':'assets/sneakers.svg'}
products=[product,{'id':'classic-tee','name':'Classic Tee','unitPriceCents':2800,'image':'assets/tee.svg'},{'id':'everyday-hoodie','name':'Everyday Hoodie','unitPriceCents':6400,'image':'assets/hoodie.svg'},{'id':'city-backpack','name':'City Backpack','unitPriceCents':5200,'image':'assets/backpack.svg'}]
record={'id':oid,'label':label80,'items':[{'id':str(uuid.uuid4()),'productId':product['id'],'name':product['name'],'unitPriceCents':8500,'quantity':1}],'totalCents':8500,'createdAt':'2026-11-12T10:00:00Z','updatedAt':'2026-11-12T10:00:00Z'}
records={oid:record} if scenario=='responses' else {}
requests=[]; errors=[]; unexpected=[]; checks=0
with sync_playwright() as p:
 options={'executable_path':os.environ['SAVED_ORDERS_FIREFOX']} if engine=='firefox' and os.environ.get('SAVED_ORDERS_FIREFOX') else {}
 browser=getattr(p,engine).launch(headless=True,**options)
 context=browser.new_context(viewport={'width':1440,'height':1080});page=context.new_page()
 page.on('pageerror',lambda error:errors.append(str(error)))
 # Block every non-local request unless an explicit fixture below handles it.
 def guard(route):
  if route.request.url.startswith(url+'/'):route.continue_()
  else:unexpected.append(route.request.url);route.abort()
 context.route('**/*',guard)
 def remote(route):
  req=route.request; path=req.url.split('example.supabase.co')[-1]; body=req.post_data_json if req.post_data else {};method=req.method
  requests.append(method+' '+path)
  if '/auth/v1/signup' in path:
   route.fulfill(status=200,json={'access_token':token,'refresh_token':'fixture-refresh-token','token_type':'bearer','expires_in':3600,'expires_at':now+3600,'user':user});return
  if '/auth/' in path:route.fulfill(status=200,json={'user':user});return
  assert req.headers.get('apikey')=='sb_publishable_browser_fixture'
  assert req.headers.get('authorization')=='Bearer '+token
  tail=path.split('?')[0].split('/saved-orders')[-1]
  if tail=='/catalog':data=products
  elif tail=='/orders' and method=='GET':data=[{'id':r['id'],'label':r['label'],'itemCount':1,'totalCents':8500,'updatedAt':r['updatedAt']} for r in records.values()]
  elif tail=='/orders' and method=='POST':
   assert body['label']==label80, 'Save must preserve all 80 emoji in the request'
   assert body['items']==[{'productId':'retro-sneakers','quantity':1}]
   records[oid]=record;data=record
  elif tail=='/orders/'+oid:
   data=records[oid]
   if method=='PATCH':
    assert body['label']==renamed80, 'Rename must preserve all 80 emoji in the request'
    data['label']=body['label']
   else:assert method=='GET'
  else:raise AssertionError('Unexpected fixture route: '+method+' '+path)
  route.fulfill(status=201 if method=='POST' else 200,json={'ok':True,'engine':'sql','data':data})
 context.route('https://example.supabase.co/**',remote)
 context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body="window.SavedOrdersConfig={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_browser_fixture',functionName:'saved-orders'};"))
 def shell(route):
  response=route.fetch();headers=dict(response.headers);headers['content-security-policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://example.supabase.co; object-src 'none'";route.fulfill(response=response,headers=headers)
 context.route(url+'/',shell)
 page.goto(url);page.wait_for_function("()=>document.querySelector('.ss-status')?.textContent.includes('Start a demo session')")
 assert not requests, 'Auth must remain explicitly user initiated'
 page.get_by_role('button',name='Add to draft',exact=False).click()
 page.get_by_role('button',name='Start demo session',exact=True).click()
 page.wait_for_function("()=>/saved orders? read|Malformed/.test(document.querySelector('.ss-status').textContent)")
 field=page.get_by_label('Order label',exact=True)
 if scenario=='responses':
  assert page.locator('.ss-order-button').count()==1, '80-emoji list response rejected: '+page.locator('.ss-status').inner_text()
  expect(page.locator('.ss-order-button strong')).to_have_text(label80);checks+=1
  page.locator('.ss-order-button').click()
  expect(page.locator('.ss-summary-badge')).to_have_text('Saved record')
  expect(field).to_have_value(label80);checks+=1
 else:
  save=page.get_by_role('button',name='Save order',exact=True)
  for value,valid in [(label80,True),('😀'*41,True),('😀'*81,False),('x'*80,True),('x'*81,False),('',False),('   ',False),('  '+label80+'  ',True)]:
   field.fill('');field.focus()
   if value:page.keyboard.insert_text(value)
   assert field.input_value()==value, 'Input must not silently truncate Unicode or over-limit labels'
   expect(save).to_be_enabled() if valid else expect(save).to_be_disabled();checks+=1
  field.fill('');field.focus();page.keyboard.insert_text(label80)
  expect(save).to_be_enabled();save.click()
  expect(page.locator('.ss-summary-badge')).to_have_text('Saved record')
  expect(field).to_have_value(label80);assert records[oid]['label']==label80;checks+=1
  rename=page.get_by_role('button',name='Rename saved order',exact=True)
  for value,valid in [(renamed80,True),('🚀'*81,False),('x'*80,True),('x'*81,False)]:
   field.fill('');field.focus();page.keyboard.insert_text(value)
   assert field.input_value()==value, 'Rename input must not silently truncate'
   expect(rename).to_be_enabled() if valid else expect(rename).to_be_disabled();checks+=1
  field.fill('');field.focus();page.keyboard.insert_text(renamed80);rename.click()
  page.wait_for_function("()=>document.querySelector('.ss-status').textContent.includes('Saved order updated')")
  assert records[oid]['label']==renamed80;checks+=1
  expect(page.locator('.ss-order-button strong')).to_have_text(renamed80)
  page.get_by_role('button',name='New local draft',exact=True).click()
  page.get_by_role('button',name='Refresh orders',exact=True).click()
  page.wait_for_function("()=>/saved orders? read/.test(document.querySelector('.ss-status').textContent)")
  page.locator('.ss-order-button').click();expect(page.locator('.ss-summary-badge')).to_have_text('Saved record')
  expect(field).to_have_value(renamed80);checks+=1
 assert not errors,errors
 assert not unexpected,unexpected
 print(json.dumps({'browser':engine,'scenario':scenario,'type':'intercepted Auth/API fixtures; no hosted mutations','checks':checks,'requests':len(requests),'uncaughtErrors':len(errors),'unexpectedExternalRequests':len(unexpected)}))
 context.close();browser.close()
`;

for(const browser of ['chromium','firefox']) for(const scenario of ['editor','responses']) {
  test(`${browser}: Unicode label ${scenario} uses the 1–80 code-point contract`,{timeout:120000},async()=>{
    const server=await makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const child=spawn('python3',['-c',python,`http://127.0.0.1:${server.address().port}`,browser,scenario],{stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
      const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
      assert.equal(code,0,stderr||stdout);console.log(stdout.trim());
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
}
