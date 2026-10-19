"""Live Firefox/Gecko QA through installed geckodriver and WebDriver BiDi."""
from pathlib import Path
import base64,datetime,json,threading,time,traceback
import requests
import queue
import itertools
from websockets.sync.client import connect
OUT=Path(__file__).resolve().parent
URL='https://chernichenkodmitriy.com/showcases/cloud-managed-themes/'
DRIVER='http://127.0.0.1:4447'
IDS=['standard','playful-pop','raggedy-granite','glossy-marble','luminous-midnight','gothic-stickerboard','baroque-plexiglas']
SHOTS=OUT/'screenshots';SHOTS.mkdir(exist_ok=True)
REPORT={'engine':'Firefox / Gecko','target':URL,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':[],'scope':'Real live requests, isolated temporary Firefox profile. No API fixtures or database writes.'}
ELEMENT='element-6066-11e4-a52e-4f735466cecf'
http=requests.Session();sid=None;ws=None;stop=threading.Event();events={'javascript_errors':[],'console_messages':[],'http_failures':[],'fetch_errors':[],'api_responses':[],'unexpected_writes':[]}

def save():
    REPORT['passed']=sum(c['passed'] for c in REPORT['checks']);REPORT['failed']=sum(not c['passed'] for c in REPORT['checks'])
    (OUT/'firefox-live.json').write_text(json.dumps(REPORT,indent=2)+'\n')
def check(name,fn):
    try:case={'name':name,'passed':True,'detail':fn()}
    except Exception as e:case={'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()}
    REPORT['checks'].append(case);save();print(('PASS ' if case['passed'] else 'FAIL ')+name,flush=True)
bidi_pending={}
bidi_ids=itertools.count(2)
def bidi(method,params):
    ident=next(bidi_ids);response=queue.Queue();bidi_pending[ident]=response
    ws.send(json.dumps({'id':ident,'method':method,'params':params}))
    data=response.get(timeout=15)
    bidi_pending.pop(ident,None)
    if data.get('type')!='success':raise RuntimeError(str(data))
    return data.get('result')
def viewport(width,height):
    context=command('GET','/window')
    bidi('browsingContext.setViewport',{'context':context,'viewport':{'width':width,'height':height}})
    actual=js('return {width:innerWidth,height:innerHeight}')
    assert actual=={'width':width,'height':height},actual

def command(method,path,body=None,timeout=45):
    response=http.request(method,DRIVER+'/session/'+sid+path,json=body,timeout=timeout)
    data=response.json().get('value')
    if response.status_code>=400:raise RuntimeError(str(data)[:1800])
    return data
def js(script,*args):return command('POST','/execute/sync',{'script':script,'args':list(args)})
def async_js(body,*args):
    result=command('POST','/execute/async',{'script':'const done=arguments[arguments.length-1]; Promise.resolve().then(async()=>{'+body+'}).then(done,e=>done({__error:String(e)}));','args':list(args)},timeout=65)
    if isinstance(result,dict) and '__error' in result:raise RuntimeError(result['__error'])
    return result
def wait(script,timeout=20):
    until=time.monotonic()+timeout
    last=None
    while time.monotonic()<until:
        try:
            last=js('return ('+script+');')
            if last:return last
        except Exception as e:last=str(e)
        time.sleep(.15)
    raise AssertionError('Timed out waiting for '+script+'; last='+str(last))
def ready():
    wait('window.portfolioThemeCloud && portfolioThemeCloud.getState().status!=="loading" && window.PortfolioThemeRegistry?.getAll().length===7 && !document.querySelector("#cloud-reload").disabled',25)
def element(selector):return command('POST','/element',{'using':'css selector','value':selector})[ELEMENT]
def click(selector):return command('POST','/element/'+element(selector)+'/click',{})
def keys(selector,text):return command('POST','/element/'+element(selector)+'/value',{'text':text})
def clear(selector):
    # W3C Element Clear can change value without dispatching an input event.
    # Real keyboard deletion exercises the same input path as the user.
    keys(selector,'\ue009a\ue000\ue003')
    wait('document.querySelector('+json.dumps(selector)+').value===""')
def focus(selector):js('document.querySelector(arguments[0]).focus()',selector)
def screenshot(name):
    path=SHOTS/name;path.write_bytes(base64.b64decode(command('GET','/screenshot')));return str(path)
def appearance(style,mode=None):
    wait('document.documentElement.dataset.styleTheme==='+json.dumps(style)+((' && document.documentElement.dataset.theme==='+json.dumps(mode)) if mode else ''))
    wait('(()=>{const l=document.querySelector("[data-style-theme-stylesheet]");return !!l?.sheet && l.dataset.activeStyleTheme===document.documentElement.dataset.styleTheme})()')
def consume_events():
    while not stop.is_set():
        try:data=json.loads(ws.recv(timeout=1))
        except TimeoutError:continue
        except Exception:break
        if 'id' in data:
            waiting=bidi_pending.get(data['id'])
            if waiting:waiting.put(data)
            continue
        method=data.get('method','');p=data.get('params',{})
        if method=='log.entryAdded':
            item={'level':p.get('level'),'type':p.get('type'),'text':p.get('text')}
            if p.get('level') in ['error','warn']:events['console_messages'].append(item)
            if p.get('level')=='error' and p.get('type')=='javascript':events['javascript_errors'].append(item)
        elif method=='network.responseCompleted':
            req=p.get('request',{});resp=p.get('response',{});url=req.get('url','');status=resp.get('status',0);record={'url':url,'status':status,'method':req.get('method')}
            if status>=400:events['http_failures'].append(record)
            if '/rest/v1/portfolio_theme_settings' in url:events['api_responses'].append(record)
            if '.supabase.co/' in url and req.get('method') not in ['GET','OPTIONS']:events['unexpected_writes'].append(record)
        elif method=='network.fetchError':events['fetch_errors'].append({'url':p.get('request',{}).get('url'),'error':p.get('errorText')})

try:
    response=http.post(DRIVER+'/session',json={'capabilities':{'alwaysMatch':{'browserName':'firefox','webSocketUrl':True,'acceptInsecureCerts':False,'moz:firefoxOptions':{'binary':'/snap/firefox/current/usr/lib/firefox/firefox','args':['-headless'],'prefs':{'browser.shell.checkDefaultBrowser':False,'browser.startup.homepage_override.mstone':'ignore','datareporting.policy.dataSubmissionEnabled':False}}}}},timeout=75)
    response.raise_for_status();value=response.json()['value'];sid=value['sessionId'];caps=value['capabilities'];REPORT['browser_version']=caps['browserVersion'];REPORT['profile_is_temporary']=True
    command('POST','/timeouts',{'implicit':0,'pageLoad':45000,'script':60000})
    ws=connect(caps['webSocketUrl'],open_timeout=15);ws.send(json.dumps({'id':1,'method':'session.subscribe','params':{'events':['log.entryAdded','network.responseCompleted','network.fetchError']}}));ack=json.loads(ws.recv(timeout=10));assert ack.get('type')=='success',ack
    thread=threading.Thread(target=consume_events,daemon=True);thread.start()
    viewport(1920,1080)
    def initial():
        command('POST','/url',{'url':URL});ready();s=js('return portfolioThemeCloud.getState()');assert s['status']=='connected' and s['httpStatus']==200 and s['source']=='supabase' and not s['simulation']
        assert js('return document.querySelectorAll("main > section").length')==7 and js('return document.querySelectorAll("#cloud-cards button").length')==7
        REPORT['settings']=s['settings'];screenshot('firefox-desktop-1920.png')
        return {'state':{'status':s['status'],'source':s['source'],'httpStatus':s['httpStatus']},'appearance':js('return portfolioTheme.getCurrentPreferences()'),'viewport':js('return {width:innerWidth,height:innerHeight}')}
    check('Real Firefox live Supabase read and initial seven-theme render',initial)
    def search():
        f='#cloud-filter'
        assert js('return document.querySelector("label[for=cloud-filter]")!==null')
        keys(f,'luminous');assert js('return [...document.querySelectorAll(".cloud-lab__theme-card")].filter(e=>!e.hidden).length')==1
        clear(f);keys(f,'not-a-theme');wait('!document.querySelector("#cloud-empty").hidden')
        clear(f);keys(f,'x'*200);assert js('return document.querySelector("#cloud-filter").value.length')==80
        clear(f);keys(f,'<script>alert(1)</script>');wait('!document.querySelector("#cloud-empty").hidden')
        clear(f);assert js('return [...document.querySelectorAll(".cloud-lab__theme-card")].filter(e=>!e.hidden).length')==7
        return 'Native WebDriver typing exercised empty/no-match/long/markup-like strings and accessible label.'
    check('Search edge cases and accessible label',search)
    def user_preferences():
        button='#cloud-cards [data-style-theme-option="luminous-midnight"]';focus(button);keys(button,'\ue007');appearance('luminous-midnight')
        before=js('return portfolioTheme.getCurrentPreferences()');click('.cloud-lab__actions [data-theme-toggle]');mode='light' if before['mode']=='dark' else 'dark';appearance('luminous-midnight',mode)
        command('POST','/refresh',{});ready();appearance('luminous-midnight',mode)
        click('#cloud-reload');ready();appearance('luminous-midnight',mode)
        return {'keyboard_style':'luminous-midnight','mode':mode,'document_and_configuration_reload_preserved_choice':True}
    check('Keyboard preview, mode, and saved preferences across reload',user_preferences)
    def offline_reset():
        before=len(events['api_responses']);click('#cloud-offline');ready();s=js('return portfolioThemeCloud.getState()');assert s['status']=='fallback' and s['simulation'] and s['source']=='cache'
        assert js('return document.querySelector("#cloud-http").textContent')=='Not requested';assert len(events['api_responses'])==before
        click('#cloud-reload');ready();assert js('return portfolioThemeCloud.getState().status')=='connected'
        click('#cloud-defaults');settings=js('return portfolioThemeCloud.getState().settings');appearance(settings['default_theme'],settings['default_mode'])
        assert js('return localStorage.getItem("resume-theme")===null && localStorage.getItem("resume-style-theme")===null')
        return 'Labeled simulation skipped API, recovered real connection, and reset cleared only test-profile overrides.'
    check('Labeled fallback, real recovery, and cloud-default reset',offline_reset)
    def repeated():
        async_js('await Promise.all([portfolioThemeCloud.reload(),portfolioThemeCloud.reload(),portfolioThemeCloud.reload()]);return true;');ready()
        assert js('return portfolioThemeCloud.getState().status')=='connected';assert js('return document.querySelectorAll("#cloud-cards button").length')==7
        return 'Concurrent configuration reads settle connected without duplicate theme cards.'
    check('Repeated concurrent requests',repeated)
    def keyboard():
        result=[]
        for width,height in [(1920,1080),(390,844),(320,900)]:
            viewport(width,height)
            toggle='.portfolio-menu__toggle';focus(toggle);keys(toggle,'\ue007');wait('document.querySelector(".portfolio-menu").dataset.open==="true"');time.sleep(.25)
            keys(toggle,'\ue004');assert js('return document.activeElement.matches(".portfolio-menu__item")')
            app='[data-showcase-category="application-structures"] > button';focus(app);keys(app,'\ue007');wait('document.querySelector("[data-showcase-category=application-structures]").dataset.open==="true"');time.sleep(.25);keys(app,'\ue004')
            assert js('return document.activeElement.matches("[data-showcase-category=application-structures] a")')
            keys('[data-showcase-category="application-structures"] a','\ue00c');assert js('return document.activeElement.matches(".portfolio-menu__toggle")')
            assert js('return document.querySelector(".portfolio-menu__panel").inert');keys(toggle,'\ue004');assert not js('return !!document.activeElement.closest(".portfolio-menu__panel")')
            result.append({'requested_width':width,'actual_viewport':js('return {width:innerWidth,height:innerHeight}'),'Tab_Enter_Escape_and_inert':True})
        return result
    check('Sequential Tab/Enter/Escape and hidden-menu focus exclusion',keyboard)
    def matrix():
        samples=[]
        for width,height in [(1920,1080),(768,1024),(390,844),(320,900)]:
            viewport(width,height);actual_viewport=js('return {width:innerWidth,height:innerHeight}')
            for style in IDS:
                for mode in ['light','dark']:
                    async_js('await portfolioTheme.applyKnownPreferences('+json.dumps({'styleTheme':style,'mode':mode})+');return true;');appearance(style,mode)
                    assert js('return document.documentElement.scrollWidth<=innerWidth+1'),f'overflow {width}/{style}/{mode}'
                    samples.append({'requested_width':width,'viewport':actual_viewport,'style':style,'mode':mode,'no_page_overflow':True})
            async_js('await portfolioThemeCloud.useCloudDefaults();return true;');ready()
            js('window.scrollTo({top:0,behavior:"instant"})');screenshot('firefox-top-'+str(width)+'.png')
            js('document.querySelector("#final-result").scrollIntoView({behavior:"instant",block:"start"})');screenshot('firefox-working-'+str(width)+'.png')
        return {'combinations':len(samples),'samples':samples}
    check('Seven themes × two modes × four responsive sizes (56 combinations)',matrix)
    def accessibility():
        viewport(1920,1080);async_js('await portfolioThemeCloud.useCloudDefaults();return true;');ready()
        js((OUT/'tooling/node_modules/axe-core/axe.min.js').read_text())
        data=async_js('const r=await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return {testEngine:r.testEngine,passes:r.passes.length,incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))};')
        (OUT/'axe-firefox.json').write_text(json.dumps(data,indent=2)+'\n');REPORT['axe_summary']={'passes':data['passes'],'violations':len(data['violations']),'incomplete':len(data['incomplete'])}
        assert not data['violations'],json.dumps([{'id':v['id'],'impact':v['impact'],'nodes':len(v['nodes'])} for v in data['violations']])
        return REPORT['axe_summary']
    check('Automated Firefox WCAG A/AA scan (not a certification)',accessibility)
    def health():
        REPORT['bidi_events']=events
        assert events['api_responses'],'No API response captured through Firefox BiDi'
        expected_cancellations=[e for e in events['fetch_errors'] if e['error']=='NS_BINDING_ABORTED' and ('/rest/v1/portfolio_theme_settings' in (e['url'] or '') or e['url']=='https://chernichenkodmitriy.com/favicon.ico')]
        unexpected=[e for e in events['fetch_errors'] if e not in expected_cancellations]
        assert not events['javascript_errors'],events['javascript_errors'];assert not events['http_failures'],events['http_failures'];assert not unexpected,unexpected;assert not events['unexpected_writes'],events['unexpected_writes']
        return {'uncaught_errors':0,'HTTP_failures':0,'unexpected_transport_failures':0,'expected_cancellations_during_navigation_or_superseded_GET':expected_cancellations,'unexpected_writes':0,'captured_API_responses':len(events['api_responses']),'console_warning_error_messages':events['console_messages']}
    check('Firefox BiDi console/network health and absence of public writes',health)
except Exception as error:
    REPORT['fatal_error']=str(error);REPORT['fatal_traceback']=traceback.format_exc();print('FATAL',str(error),flush=True)
finally:
    stop.set()
    if ws:
        try:ws.close()
        except Exception:pass
    if sid:
        try:http.delete(DRIVER+'/session/'+sid,timeout=20)
        except Exception:pass
    REPORT['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
print(json.dumps({'passed':REPORT['passed'],'failed':REPORT['failed'],'fatal_error':REPORT.get('fatal_error'),'report':str(OUT/'firefox-live.json')}),flush=True)
raise SystemExit(1 if REPORT['failed'] or REPORT.get('fatal_error') else 0)
