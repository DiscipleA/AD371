"""Live production Chromium QA. Isolated profile; no database writes or source changes."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json,datetime,traceback
OUT=Path(__file__).resolve().parent
URL='https://chernichenkodmitriy.com/showcases/cloud-managed-themes/'
BASE='https://chernichenkodmitriy.com'
IDS=['standard','playful-pop','raggedy-granite','glossy-marble','luminous-midnight','gothic-stickerboard','baroque-plexiglas']
SHOTS=OUT/'screenshots';SHOTS.mkdir(exist_ok=True)
REPORT={'engine':'Chromium','target':URL,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':[],'scope':'Live remote website; no mocked responses in this script; isolated browser storage.'}

def save():
    REPORT['passed']=sum(c['passed'] for c in REPORT['checks']);REPORT['failed']=sum(not c['passed'] for c in REPORT['checks'])
    (OUT/'chromium-live.json').write_text(json.dumps(REPORT,indent=2)+'\n')
def check(name,fn):
    try:
        detail=fn();case={'name':name,'passed':True,'detail':detail}
    except Exception as e:
        case={'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()}
    REPORT['checks'].append(case);save();print(('PASS ' if case['passed'] else 'FAIL ')+name,flush=True)

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    REPORT['browser_version']=browser.version
    context=browser.new_context(viewport={'width':1920,'height':1080},reduced_motion='reduce',permissions=['clipboard-read','clipboard-write'])
    page=context.new_page();page.set_default_timeout(12000)
    errors=[];console=[];bad=[];api=[];writes=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console.append({'level':m.type,'text':m.text}) if m.type in ['error','warning'] else None)
    page.on('response',lambda r:bad.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.on('response',lambda r:api.append({'url':r.url,'status':r.status,'method':r.request.method}) if '/rest/v1/portfolio_theme_settings' in r.url else None)
    page.on('request',lambda r:writes.append({'url':r.url,'method':r.method}) if '.supabase.co/' in r.url and r.method not in ['GET','OPTIONS'] else None)
    def ready():
        page.wait_for_function('window.portfolioThemeCloud && portfolioThemeCloud.getState().status !== "loading"',timeout=20000)
        page.wait_for_function('PortfolioThemeRegistry.getAll().length===7')
        page.wait_for_function('!document.querySelector("#cloud-reload").disabled')
    def appearance(style,mode=None):
        page.wait_for_function('(s)=>document.documentElement.dataset.styleTheme===s',arg=style)
        if mode:page.wait_for_function('(m)=>document.documentElement.dataset.theme===m',arg=mode)
        page.wait_for_function('(()=>{const l=document.querySelector("[data-style-theme-stylesheet]");return !!l?.sheet && l.dataset.activeStyleTheme===document.documentElement.dataset.styleTheme})()')
    def initial():
        response=page.goto(URL,wait_until='networkidle');ready();s=page.evaluate('portfolioThemeCloud.getState()')
        assert response.status==200 and s['source']=='supabase' and s['httpStatus']==200 and not s['simulation']
        assert page.locator('main > section').count()==7
        assert page.locator('#cloud-cards button').count()==7
        assert page.locator('[data-showcase-category="application-structures"] > button').text_content()=='App Engineering Showcases'
        page.screenshot(path=str(SHOTS/'chromium-desktop-1920.png'),animations='disabled')
        REPORT['settings']=s['settings'];REPORT['live_api_response']=api.copy()
        return {'source':s['source'],'http':s['httpStatus'],'settings':s['settings'],'initial_appearance':page.evaluate('portfolioTheme.getCurrentPreferences()'),'navigation_ms':page.evaluate('performance.getEntriesByType("navigation")[0].duration')}
    check('Real production HTTP200 configuration and seven-section/seven-theme rendering',initial)
    def search():
        f=page.locator('#cloud-filter');assert f.get_attribute('maxlength')=='80';assert page.locator('label[for="cloud-filter"]').count()==1
        f.fill('luminous');expect(page.locator('.cloud-lab__theme-card:visible')).to_have_count(1)
        f.fill('not-a-theme');expect(page.locator('#cloud-empty')).to_be_visible()
        f.fill('');expect(page.locator('.cloud-lab__theme-card:visible')).to_have_count(7)
        f.fill('x'*200);assert len(f.input_value())==80
        f.fill('<script>alert(1)</script>');expect(page.locator('#cloud-empty')).to_be_visible()
        f.fill('');return 'Empty, no-match, long (80-char cap), and markup-like strings handled without executing markup.'
    check('Search labels and empty/long/unexpected input',search)
    def keyboard_theme():
        button=page.locator('#cloud-cards [data-style-theme-option="luminous-midnight"]');button.focus();button.press('Enter');appearance('luminous-midnight')
        assert button.evaluate('e=>document.activeElement===e')
        current=page.evaluate('portfolioTheme.getCurrentPreferences()');page.locator('.cloud-lab__actions [data-theme-toggle]').click()
        expect_mode='light' if current['mode']=='dark' else 'dark';appearance('luminous-midnight',expect_mode)
        page.reload(wait_until='networkidle');ready();appearance('luminous-midnight',expect_mode)
        page.locator('#cloud-reload').click();ready();appearance('luminous-midnight',expect_mode)
        return {'style':'luminous-midnight','mode':expect_mode,'document_and_API_reload_preserved_choice':True}
    check('Keyboard theme selection, mode control, and persistence across reloads',keyboard_theme)
    def fallback():
        before=len(api);page.locator('#cloud-offline').click();ready();s=page.evaluate('portfolioThemeCloud.getState()')
        assert s['simulation'] and s['source']=='cache' and s['status']=='fallback'
        assert page.locator('#cloud-http').inner_text()=='Not requested' and len(api)==before
        page.locator('#cloud-reload').click();ready();assert page.evaluate('portfolioThemeCloud.getState().status')=='connected'
        return 'Explicitly labeled simulation reused validated cache without a request; real reload recovered HTTP200.'
    check('Labeled offline fallback and live recovery',fallback)
    def reset():
        page.locator('#cloud-defaults').click();s=page.evaluate('portfolioThemeCloud.getState().settings');appearance(s['default_theme'],s['default_mode'])
        assert page.evaluate('localStorage.getItem("resume-theme")===null && localStorage.getItem("resume-style-theme")===null')
        return {'applied_defaults':s,'saved_overrides_removed':True}
    check('Cloud-default reset removes isolated browser overrides',reset)
    def repeated():
        page.evaluate('async()=>{await Promise.all([portfolioThemeCloud.reload(),portfolioThemeCloud.reload(),portfolioThemeCloud.reload()])}');ready()
        assert page.evaluate('portfolioThemeCloud.getState().status')=='connected' and page.locator('#cloud-cards button').count()==7
        return 'Three concurrent reads finish connected with one seven-card set; no public writes.'
    check('Repeated concurrent configuration requests',repeated)
    def menu_keyboard():
        results=[]
        for width in [1920,390,320]:
            page.set_viewport_size({'width':width,'height':1080 if width==1920 else 900});page.mouse.move(0,800)
            t=page.locator('.portfolio-menu__toggle');t.focus();t.press('Enter');expect(t).to_have_attribute('aria-expanded','true');page.wait_for_timeout(250)
            page.keyboard.press('Tab');assert page.evaluate('document.activeElement.matches(".portfolio-menu__item")')
            app=page.locator('[data-showcase-category="application-structures"] > button');app.focus();app.press('Enter');page.wait_for_timeout(250);page.keyboard.press('Tab')
            assert page.evaluate('document.activeElement.matches("[data-showcase-category=application-structures] a")')
            page.keyboard.press('Escape');expect(t).to_be_focused();assert page.locator('.portfolio-menu__panel').evaluate('e=>e.inert')
            page.keyboard.press('Tab');assert not page.evaluate('!!document.activeElement.closest(".portfolio-menu__panel")')
            results.append({'width':width,'closed_panels_inert':True,'real_Tab_Enter_Escape':True})
        return results
    check('Sequential keyboard navigation and closed-menu focus exclusion',menu_keyboard)
    def copied():
        results=[]
        for key in ['aiReviewPrompt','aiPlanPrompt','aiVerifyPrompt','cloudWorkingPrompt','cloudAuditCode']:
            code=page.locator('#'+key);details=code.locator('xpath=ancestor::details[1]')
            if details.count() and details.get_attribute('open') is None:details.locator('summary').first.click()
            button=page.locator('[data-copy-target="'+key+'"]');button.click();expect(button).to_have_text('Copied');assert page.evaluate('navigator.clipboard.readText()')==code.text_content();results.append(key)
        return {'exact_clipboard_targets':results}
    check('All five copyable prompts/SQL targets copy exact text',copied)
    def matrix():
        samples=[]
        for width,height in [(1920,1080),(1440,1000),(768,1024),(390,844),(320,900)]:
            page.set_viewport_size({'width':width,'height':height})
            for style in IDS:
                for mode in ['light','dark']:
                    page.evaluate('(p)=>portfolioTheme.applyKnownPreferences(p)',{'styleTheme':style,'mode':mode});appearance(style,mode)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'Page overflow: {width}/{style}/{mode}'
                    assert page.locator('#cloud-filter').is_visible()
                    samples.append({'width':width,'height':height,'theme':style,'mode':mode,'no_page_overflow':True})
            page.evaluate('portfolioThemeCloud.useCloudDefaults()');ready()
            page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(SHOTS/f'chromium-top-{width}.png'),animations='disabled')
            page.locator('#final-result').scroll_into_view_if_needed();page.screenshot(path=str(SHOTS/f'chromium-working-{width}.png'),animations='disabled')
        return {'combinations':len(samples),'samples':samples}
    check('Seven themes × two modes × five responsive sizes (70 combinations)',matrix)
    def links():
        page.set_viewport_size({'width':1920,'height':1080});page.evaluate('portfolioThemeCloud.useCloudDefaults()');ready()
        local=page.locator('a[href]').evaluate_all('(a)=>[...new Set(a.map(e=>e.href).filter(u=>u.startsWith(location.origin)))]');found=[]
        for url in local:
            if '#' in url:
                anchor=url.split('#',1)[1]
                if url.split('#')[0].rstrip('/')==URL.rstrip('/'):
                    assert page.locator('[id="'+anchor+'"]').count(),anchor
                    continue
            response=context.request.get(url);assert response.ok,(url,response.status);found.append({'url':url,'status':response.status})
        return found
    check('Existing internal navigation and document links resolve',links)
    def accessibility():
        page.set_viewport_size({'width':1920,'height':1080});page.evaluate('portfolioThemeCloud.useCloudDefaults()');ready()
        page.add_script_tag(path=str(OUT/'tooling/node_modules/axe-core/axe.min.js'))
        result=page.evaluate('async()=>{const r=await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return {url:r.url,testEngine:r.testEngine,passes:r.passes.length,incomplete:r.incomplete.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),violations:r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,description:v.description,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))}}')
        (OUT/'axe-chromium.json').write_text(json.dumps(result,indent=2)+'\n');REPORT['axe_summary']={'passes':result['passes'],'violations':len(result['violations']),'incomplete':len(result['incomplete'])}
        assert not result['violations'],json.dumps([{'id':v['id'],'impact':v['impact'],'nodes':len(v['nodes'])} for v in result['violations']])
        return REPORT['axe_summary']
    check('Automated WCAG 2/2.1 A/AA axe scan (not a certification)',accessibility)
    def health():
        REPORT['console_messages']=console;REPORT['uncaught_errors']=errors;REPORT['http_failures']=bad;REPORT['unexpected_supabase_writes']=writes;REPORT['api_requests']=api
        assert not errors,errors;assert not bad,bad;assert not writes,writes
        return {'uncaught_errors':0,'HTTP_failures':0,'unexpected_writes':0,'console_warning_error_messages':console}
    check('Live console/runtime/assets and no database write requests',health)
    context.close();browser.close()
REPORT['completed_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
print(json.dumps({'passed':REPORT['passed'],'failed':REPORT['failed'],'report':str(OUT/'chromium-live.json')}),flush=True)
raise SystemExit(1 if REPORT['failed'] else 0)
