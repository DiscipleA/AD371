"""Local presentation and controlled client tests. Fixtures are NOT live Supabase evidence."""
import asyncio, base64, datetime, hashlib, json, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/qa'
URL='http://127.0.0.1:8771/'
THEMES=['standard','playful-pop','raggedy-granite','glossy-marble','luminous-midnight','gothic-stickerboard','baroque-plexiglas']
VIEWPORTS=[(1920,1080),(768,1024),(390,844),(320,900)]
REPORT={'scope':'Local source presentation + explicitly controlled client API responses, NOT live Supabase backend results','target':URL,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':[]}

def record(name,passed,detail=None):
 REPORT['checks'].append({'name':name,'passed':passed,'detail':detail})
 print(('PASS ' if passed else 'FAIL ')+name,flush=True)
async def main():
 OUT.mkdir(exist_ok=True);(OUT/'screenshots').mkdir(exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  REPORT['browser']={'engine':'Chromium','version':browser.version,'binary':p.chromium.executable_path}
  context=await browser.new_context(viewport={'width':1920,'height':1080},permissions=['clipboard-read','clipboard-write'])
  page=await context.new_page();errors=[];assets=[];remote=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('response',lambda response: assets.append({'url':response.url,'status':response.status}) if response.status>=400 and response.url.startswith(URL) else None)
  page.on('request',lambda request:remote.append(request.url) if '.supabase.co' in request.url else None)
  await page.goto(URL+'?code=controlled-callback#access_token=controlled-token&refresh_token=controlled-refresh')
  await page.wait_for_function("() => document.querySelector('#connection-status').textContent.includes('Configured')")
  assert page.url==URL,page.url
  assert not await page.evaluate("Object.keys(localStorage).some(k=>k.includes('auth-token')||k.includes('gatekeeper-memory-auth'))")
  record('Callback credentials removed from URL without importing or persisting a session',True)
  assert await page.locator('#request-public').is_enabled(),'Configured resource buttons must be enabled'
  record('Configured client enables resource controls',True)
  assert await page.locator('main > section').count()==7
  record('Seven direct section cards',True)
  await page.locator('#auth-login').click()
  assert 'Enter your email and password' in await page.locator('#auth-message').inner_text()
  assert not remote,remote
  record('Empty input rejected before network request',True)
  await page.locator('#auth-email').fill("' OR 1=1 --")
  await page.locator('#auth-password').fill('not-a-real-password')
  await page.locator('#auth-login').click()
  assert 'valid email' in await page.locator('#auth-message').inner_text()
  assert not remote
  record('SQL-like invalid email rejected without execution',True)
  await page.locator('#auth-email').fill('')
  await page.locator('#auth-password').fill('')
  await page.reload()
  await page.wait_for_function("() => document.querySelector('#connection-status').textContent.includes('Configured')")
  count=0
  for width,height in VIEWPORTS:
   await page.set_viewport_size({'width':width,'height':height})
   for theme in THEMES:
    for mode in ['light','dark']:
     await page.evaluate("async ([styleTheme,mode])=>{await portfolioTheme.applyKnownPreferences({styleTheme,mode});}",[theme,mode])
     await page.wait_for_function("()=>{const l=document.querySelector('[data-style-theme-stylesheet]');return !!l?.sheet}")
     await page.wait_for_timeout(50)
     dims=await page.evaluate("({viewport:innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth})")
     assert max(dims['body'],dims['doc'])<=width+1,(theme,mode,dims)
     assert await page.locator('#auth-email').is_visible()
     count+=1
   await page.evaluate("async ()=>{await portfolioTheme.applyKnownPreferences({styleTheme:'gothic-stickerboard',mode:'light'});}")
   await page.screenshot(path=str(OUT/f'screenshots/chromium-{width}-page.png'),full_page=True)
   await page.locator('#final-result').scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'screenshots/chromium-{width}-working.png'))
  record('All installed theme/mode/viewport layout combinations',True,{'combinations':count,'themes':THEMES,'modes':['light','dark'],'viewports':VIEWPORTS,'note':'Overflow and visibility assertions; screenshots sampled, not an all-theme accessibility certification.'})
  await page.set_viewport_size({'width':390,'height':844})
  await page.evaluate('scrollTo(0,0)')
  await page.locator('.portfolio-theme-menu__toggle').focus()
  await page.keyboard.press('Enter');await page.wait_for_timeout(200)
  assert await page.locator('.portfolio-theme-menu__panel').evaluate('(e)=>!e.inert')
  await page.keyboard.press('Tab')
  assert await page.evaluate("document.activeElement.hasAttribute('data-theme-toggle')")
  await page.keyboard.press('Escape')
  assert await page.locator('.portfolio-theme-menu__panel').evaluate('(e)=>e.inert')
  assert await page.evaluate("document.activeElement.classList.contains('portfolio-theme-menu__toggle')")
  await page.keyboard.press('Tab')
  assert await page.evaluate("!document.activeElement.closest('.portfolio-theme-menu__panel')")
  record('Real keyboard opens menu, Escape restores focus, closed descendants excluded',True)
  await page.locator('[data-implementation-spec] summary').click()
  await page.locator('[data-implementation-spec] summary').click()
  copy=page.locator('[data-copy-target="gkBuildPrompt"]')
  await copy.click()
  expected=await page.locator('#gkBuildPrompt').text_content()
  actual=await page.evaluate('navigator.clipboard.readText()')
  assert actual==expected
  record('Copy button copies complete build prompt',True)
  assert not errors,errors
  assert not assets,assets
  assert not remote,remote
  record('No uncaught JS, broken local assets, or unexpected service requests',True)
  await context.close()

  # Explicitly controlled HTTP fixture: tests browser orchestration, not hosted security.
  context=await browser.new_context(viewport={'width':1280,'height':900})
  page=await context.new_page()
  uid='11111111-1111-4111-8111-111111111111'
  def enc(obj):return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
  token=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'sub':uid,'role':'authenticated','exp':int(time.time())+900,'iat':int(time.time()),'session_id':'22222222-2222-4222-8222-222222222222'})+'.controlled-test-signature'
  user={'id':uid,'aud':'authenticated','role':'authenticated','email':'fixture@example.test','app_metadata':{'provider':'email'},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
  calls=[];fixture_state={'role':'User'}
  async def fixture(route):
   request=route.request;calls.append({'method':request.method,'path':request.url.split('.supabase.co')[-1]})
   headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'}
   if request.method=='OPTIONS':return await route.fulfill(status=204,headers=headers)
   if '/auth/v1/token' in request.url:
    body=request.post_data_json
    if body['password']=='wrong-password':return await route.fulfill(status=400,headers=headers,json={'error':'invalid_grant','error_description':'Unknown internal reason'})
    return await route.fulfill(status=200,headers=headers,json={'access_token':token,'token_type':'bearer','expires_in':900,'refresh_token':'controlled-refresh','user':user})
   if '/auth/v1/logout' in request.url:return await route.fulfill(status=204,headers=headers)
   if '/auth/v1/user' in request.url:return await route.fulfill(status=200,headers=headers,json=user)
   if '/functions/v1/gatekeeper' in request.url:
    resource=request.url.split('resource=')[-1]
    if resource=='public':return await route.fulfill(status=200,headers=headers,json={'resource':'public','message':'CONTROLLED FIXTURE public resource'})
    if not request.headers.get('authorization'):return await route.fulfill(status=401,headers=headers,json={'error':'Unauthorized'})
    if resource=='admin' and fixture_state['role']!='Admin':return await route.fulfill(status=403,headers=headers,json={'error':'Forbidden'})
    return await route.fulfill(status=200,headers=headers,json={'resource':resource,'message':'CONTROLLED FIXTURE resource','user':{'id':uid,'email':user['email'],'role':fixture_state['role']},'data':{'briefing':'Controlled admin briefing'} if resource=='admin' else {'scope':'own-account'},'access_token':'must-not-display'})
   return await route.fulfill(status=500,headers=headers,json={'error':'Unhandled fixture route'})
  await page.route('https://ggewxlydkxjutjiqnkhr.supabase.co/**',fixture)
  await page.goto(URL);await page.wait_for_function("() => document.querySelector('#connection-status').textContent.includes('Configured')")
  await page.locator('#request-user').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 401'")
  await page.locator('#auth-email').fill(user['email']);await page.locator('#auth-password').fill('wrong-password');await page.locator('#auth-login').click()
  await page.wait_for_function("() => document.querySelector('#auth-message').textContent==='Invalid email or password.'")
  await page.locator('#auth-password').fill('correct-test-password');await page.locator('#auth-login').click()
  await page.wait_for_function("() => document.querySelector('#auth-session').textContent.includes('fixture@example.test')")
  await page.locator('#request-user').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 200'")
  assert await page.locator('#auth-role').inner_text()=='User'
  assert 'must-not-display' not in await page.locator('#request-output').inner_text()
  assert not await page.evaluate("Object.keys(localStorage).some(k=>k.includes('auth-token')||k.includes('gatekeeper-memory-auth'))")
  await page.locator('#request-admin').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 403'")
  fixture_state['role']='Admin'
  await page.locator('#request-admin').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 200'")
  assert await page.locator('#auth-role').inner_text()=='Admin'
  fixture_state['role']='User'
  await page.locator('#request-admin').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 403'")
  assert await page.locator('#auth-role').inner_text()!='Admin','Stale Admin role must not survive a current Admin denial'
  record('CONTROLLED demotion clears stale Admin display after 403',True)
  await page.locator('#auth-logout').click();await page.wait_for_function("() => document.querySelector('#auth-session').textContent==='Signed out'")
  assert 'fixture@example.test' not in await page.locator('#request-output').inner_text()
  await page.locator('#request-user').click();await page.wait_for_function("() => document.querySelector('#request-status').textContent==='HTTP 401'")
  record('CONTROLLED client flow: 401, generic invalid login, login, User 200, Admin 403, logout, 401',True,{'scope':'Mocked Auth/Edge responses test orchestration only, not server security','calls':calls})
  await context.close();await browser.close()

if __name__=='__main__':
 try:asyncio.run(main())
 except Exception as error:
  record('Browser suite completion',False,str(error));raise
 finally:
  REPORT['passed']=sum(x['passed'] for x in REPORT['checks']);REPORT['failed']=sum(not x['passed'] for x in REPORT['checks'])
  REPORT['source_hashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'index.html',ROOT/'scripts/auth-client.mjs',ROOT/'scripts/showcase.js',ROOT/'config.js',ROOT/'styles/auth-rbac-showcase.css']}
  OUT.mkdir(exist_ok=True);(OUT/'browser-local.json').write_text(json.dumps(REPORT,indent=2)+'\n')
