import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {makeServer} from '../scripts/serve.mjs';
const python=String.raw`
from playwright.sync_api import sync_playwright
import os,json,sys,math
url=sys.argv[1]
shots=os.environ.get('SAVED_ORDERS_SCREENSHOTS','')
if shots: os.makedirs(shots,exist_ok=True)
results=[]
with sync_playwright() as p:
  for engine in ['chromium','firefox']:
    browser=getattr(p,engine).launch(headless=True,**({'executable_path':os.environ['SAVED_ORDERS_FIREFOX']} if engine=='firefox' and os.environ.get('SAVED_ORDERS_FIREFOX') else {}))
    context=browser.new_context(viewport={'width':1920,'height':1080})
    if engine=='chromium': context.grant_permissions(['clipboard-read','clipboard-write'])
    context.route('**/config.js',lambda r:r.fulfill(content_type='text/javascript',body="window.SavedOrdersConfig={supabaseUrl:'',publishableKey:'',functionName:'saved-orders'};"))
    page=context.new_page(); errors=[]; bad=[];remote=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:bad.append(str(response.status)+' '+response.url) if response.status>=400 else None)
    page.on('request',lambda request:remote.append(request.url) if not request.url.startswith(url) else None)
    page.goto(url);page.wait_for_selector('.saved-orders-app')
    assert 'Not configured' in page.locator('.ss-status').inner_text()
    assert page.get_by_role('button',name='Start demo session').is_disabled()
    assert page.get_by_role('button',name='Save order',exact=True).is_disabled()
    assert page.locator('details[open]').count()==1
    assert page.locator('[data-implementation-spec]').evaluate('(el)=>el.open')
    assert page.locator('.ai-step-prompt[open]').count()==0
    window=page.locator('[data-implementation-spec] pre')
    initial=window.evaluate('(el)=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY})')
    assert initial['scroll']>initial['height'] and initial['overflow']=='auto',initial
    window.evaluate('(el)=>el.scrollTop=el.scrollHeight')
    assert window.evaluate('(el)=>el.scrollTop')>0
    assert window.evaluate('(el)=>el.clientHeight')==initial['height']
    page.locator('[data-implementation-spec] > summary').click()
    assert not window.is_visible()
    page.locator('[data-implementation-spec] > summary').click()
    assert window.is_visible()
    assert page.locator('[data-ai-step]').count()==4
    assert page.locator('.portfolio-menu__panel').evaluate('(el)=>el.inert')
    page.locator('.portfolio-menu__toggle').focus();page.keyboard.press('Enter')
    assert page.locator('.portfolio-menu__toggle').get_attribute('aria-expanded')=='true'
    page.wait_for_timeout(350)
    page.keyboard.press('Tab');assert page.evaluate("document.activeElement.matches('.portfolio-menu__item')"),page.evaluate('document.activeElement.outerHTML')
    page.keyboard.press('Escape');assert page.locator('.portfolio-menu__panel').evaluate('(el)=>el.inert')
    assert page.locator('.portfolio-menu__toggle').evaluate('(el)=>el===document.activeElement')
    page.get_by_role('button',name='Add to draft',exact=False).click()
    assert '$85.00' in page.locator('.ss-grand-total').inner_text()
    page.get_by_role('button',name='Classic Tee $28.00',exact=False).click()
    page.get_by_role('button',name='Add to draft',exact=False).click()
    assert '$113.00' in page.locator('.ss-grand-total').inner_text()
    page.get_by_label('Quantity for Classic Tee').select_option('9')
    assert '$337.00' in page.locator('.ss-grand-total').inner_text()
    page.get_by_role('button',name='Remove Classic Tee',exact=True).click()
    page.get_by_label('Save in',exact=True).select_option('mongo')
    assert '$85.00' in page.locator('.ss-grand-total').inner_text()
    assert page.locator('.ss-response').count()==0
    themes=page.evaluate('PortfolioThemeRegistry.getAll().map(t=>t.id)')
    for theme in themes:
      for mode in ['light','dark']:
        page.evaluate('([styleTheme,mode])=>portfolioTheme.applyPreferences({styleTheme,mode})',[theme,mode])
        page.wait_for_function('()=>document.querySelector("[data-style-theme-stylesheet]").sheet !== null')
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(350)
        normalized=None
        for width in [1920,1000,390,320]:
          page.set_viewport_size({'width':width,'height':1080})
          assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(engine,theme,mode,width,'page overflow')
          assert page.locator('.orders-map svg').is_visible()
          geom=page.locator('.orders-map svg').evaluate('''svg=>{
            const s=getComputedStyle(svg);const c=svg.getScreenCTM();
            return {scale:[c.a,c.d],ratio:parseFloat(s.width)/parseFloat(s.height),nodes:[...svg.querySelectorAll('[data-diagram-node]')].map(g=>{const r=g.querySelector('rect').getBBox();return [r.x,r.y,r.width,r.height]}),fonts:[...svg.querySelectorAll('text')].map(t=>{const s=getComputedStyle(t);return [s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing,s.wordSpacing,t.getAttribute('x'),t.getAttribute('y')]}),texts:[...svg.querySelectorAll('text')].map(t=>{const r=t.getBBox();return [r.x,r.y,r.width,r.height]})};
          }''')
          assert abs(geom['scale'][0]-geom['scale'][1])<.0001
          assert abs(geom['ratio']-1440/960)<.001,(engine,theme,mode,width,geom['ratio'])
          if normalized:
            # Font fallback/hinting rounds glyph ink bounds; allow 2.5 CSS pixels,
            # converted to source units. Authored positions and computed fonts stay exact.
            tolerance=2.5/geom['scale'][0]
            for i,(one,two) in enumerate(zip(normalized['texts'],geom['texts'])):assert max(abs(a-b) for a,b in zip(one,two))<tolerance,(engine,theme,mode,width,'text geometry changed',i,one,two,tolerance,normalized['fonts'][i],geom['fonts'][i])
            assert normalized['fonts']==geom['fonts'],(engine,theme,mode,width,'computed font changed')
            assert normalized['nodes']==geom['nodes']
          else: normalized=geom
          if width>=1000:
            tops=page.locator('.working-notes .result-note').evaluate_all('(els)=>els.map(e=>e.offsetTop)')
            assert max(tops)-min(tops)<1
          if theme=='gothic-stickerboard' and mode=='light' and shots:
            page.screenshot(path=f'{shots}/{engine}-{width}-full.png',full_page=True)
        page.set_viewport_size({'width':1920,'height':1080})
        over=page.locator('.orders-map svg').evaluate('''svg=>[...svg.querySelectorAll('[data-diagram-node]')].flatMap(g=>{const box=g.querySelector('rect').getBBox();return [...g.querySelectorAll('text')].filter(t=>{const r=t.getBBox();return r.x<box.x-1||r.x+r.width>box.x+box.width+1||r.y<box.y-1||r.y+r.height>box.y+box.height+1}).map(t=>t.textContent)})''')
        assert not over,(engine,theme,mode,over)
        detail=page.locator('.orders-map svg').evaluate('''svg=>{
          const issues=[];
          for(const g of svg.querySelectorAll('[data-diagram-part]')){
            const b=g.querySelector('rect').getBBox();
            for(const t of g.querySelectorAll('text')){const r=t.getBBox();if(r.x<b.x+4||r.x+r.width>b.x+b.width-4||r.y<b.y+2||r.y+r.height>b.y+b.height-2)issues.push(['part containment',g.dataset.diagramPart,t.textContent]);}
          }
          const texts=[...svg.querySelectorAll('text')];
          for(const t of texts){if(parseFloat(getComputedStyle(t).fontSize)<18)issues.push(['small font',t.textContent]);}
          for(const path of svg.querySelectorAll('.map-flow')){
            const length=path.getTotalLength();
            for(let n=0;n<=length;n+=2){const p=path.getPointAtLength(n);for(const t of texts){const r=t.getBBox();if(p.x>r.x-3&&p.x<r.x+r.width+3&&p.y>r.y-3&&p.y<r.y+r.height+3){issues.push(['edge/text clearance',path.dataset.diagramFlow||path.getAttribute('d'),t.textContent]);break;}}}
          }
          const bottom=Math.max(...[...svg.querySelectorAll(':scope > .map-zone')].map(r=>r.y.baseVal.value+r.height.baseVal.value));
          if(svg.querySelector('[data-diagram-legend]').getBBox().y<bottom+20)issues.push(['legend not outside zones']);
          return issues;
        }''')
        assert not detail,(engine,theme,mode,detail)
        assert page.locator('a.concept-card').count()==6
    if engine=='chromium':
      for button in page.locator('[data-copy-target]').all():
        target=button.get_attribute('data-copy-target')
        page.locator('#'+target).evaluate('(el)=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS")p.open=true;}')
        expected=page.locator('#'+target).text_content()
        button.click();actual=page.evaluate('navigator.clipboard.readText()')
        assert actual==expected,('clipboard',target)
      page.locator('[data-architecture-section="prompt"] details').evaluate_all('(els)=>els.forEach(e=>e.open=e.hasAttribute("data-implementation-spec")))')
    for path in ['/docs/assignment-plan.md','/src/main.jsx','/shared/catalog.mjs','/supabase/config.toml','/package.json','/styles/../config.js','/assets/%2e%2e/config.js']:
      # Path traversal is tested directly in unit tests because a browser normalizes dot segments.
      if '..' not in path and '%2e' not in path:assert context.request.get(url+path).status==404,path
    assert not errors,(engine,errors)
    assert not bad,(engine,bad)
    assert not remote,(engine,'unexpected external requests',remote)
    results.append({'browser':engine,'version':browser.version,'themeModes':len(themes)*2,'widths':[1920,1000,390,320],'errors':len(errors),'assetErrors':len(bad),'unconfigured':'honest','localDraft':'passed','fixedSvg':'passed'})
    context.close();browser.close()
print(json.dumps(results))
`;
test('real Chromium and Firefox: unconfigured browsing, local draft, 112 responsive theme-mode cases, geometry, keyboard and clipboard', {timeout:240000},async()=>{
  const server=await makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}`;
    const child=spawn('python3',['-c',python,url],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
    assert.equal(code,0,stderr||stdout);console.log(stdout.trim());
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
