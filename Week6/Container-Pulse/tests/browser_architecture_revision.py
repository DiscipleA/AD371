"""Architecture-family parity and uniform SVG scaling; real browser rendering."""
import argparse, json, traceback
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8796/')
parser.add_argument('--output', required=True)
parser.add_argument('--firefox-executable')
parser.add_argument('--smoke', action='store_true')
args = parser.parse_args()
out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
report = {'url': args.url, 'captured_at': datetime.now(timezone.utc).isoformat(), 'cases': [], 'browsers': {}}

def require(value, message):
    if not value: raise AssertionError(message)

def record(engine, name, action):
    try: report['cases'].append({'engine': engine, 'name': name, 'status': 'passed', 'detail': action()})
    except Exception as error: report['cases'].append({'engine': engine, 'name': name, 'status': 'failed', 'detail': str(error), 'trace': traceback.format_exc()[-1800:]})
    finally: (out / 'architecture-results.json').write_text(json.dumps(report, indent=2) + '\n')

GEOMETRY = r'''()=>{
 const svg=document.querySelector('.pulse-map-desktop');
 const r=svg.getBoundingClientRect(),m=svg.getScreenCTM(),texts=[...svg.querySelectorAll('text')];
 const badText=[];
 for(const text of texts){
  const owner=text.closest('[data-map-node]'),box=text.getBBox();
  if(owner){const rect=owner.querySelector(':scope > rect'),x=+rect.getAttribute('x'),y=+rect.getAttribute('y'),w=+rect.getAttribute('width'),h=+rect.getAttribute('height');
   if(box.x<x+4||box.y<y+4||box.x+box.width>x+w-4||box.y+box.height>y+h-4)badText.push({node:owner.dataset.mapNode,text:text.textContent,box:{x:box.x,y:box.y,width:box.width,height:box.height},owner:{x,y,w,h}});
  }
 }
 const signatures=[...svg.querySelectorAll('[data-map-node] > rect,[data-map-edge]')].map(e=>[e.tagName,e.parentElement.dataset.mapNode||e.dataset.mapEdge,...['x','y','width','height','d'].map(k=>e.getAttribute(k))]);
 const nodes=[...svg.querySelectorAll('[data-map-node]')].map(e=>{const r=e.querySelector(':scope > rect');return {x:+r.getAttribute('x'),y:+r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')}});
 const textBoxes=texts.map(text=>({text:text.textContent,box:text.getBBox()}));
 const intersections=[],pathSamples=window.__pulseQaPathSamples||(window.__pulseQaPathSamples=new Map());
 for(const edge of svg.querySelectorAll('[data-map-edge]')){const key=edge.getAttribute('d');
  if(!pathSamples.has(key)){const points=[],length=edge.getTotalLength();for(let distance=0;distance<=length;distance+=2){const p=edge.getPointAtLength(distance);points.push({x:p.x,y:p.y});}pathSamples.set(key,points);}
  for(const p of pathSamples.get(key)){
   const hidden=nodes.some(n=>p.x>n.x&&p.x<n.x+n.w&&p.y>n.y&&p.y<n.y+n.h);if(hidden)continue;
   for(const {text,box:b} of textBoxes){if(p.x>b.x-2&&p.x<b.x+b.width+2&&p.y>b.y-2&&p.y<b.y+b.height+2){intersections.push({edge:edge.dataset.mapEdge,text});break;}}
   if(intersections.some(i=>i.edge===edge.dataset.mapEdge))break;
  }
 }
 return {width:r.width,height:r.height,scaleX:Math.hypot(m.a,m.b),scaleY:Math.hypot(m.c,m.d),dot:m.a*m.c+m.b*m.d,overflow:document.documentElement.scrollWidth-innerWidth,signature:JSON.stringify(signatures),fontProperties:texts.map(e=>{const s=getComputedStyle(e);return[s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing,s.wordSpacing,s.textRendering]}),badText,intersections,nodes:nodes.length,mobilePanels:document.querySelectorAll('.pulse-map-mobile').length};
}'''

try:
    with sync_playwright() as p:
        for engine in (['chromium'] if args.smoke else ['chromium', 'firefox']):
            options={'headless':True}
            if engine=='firefox' and args.firefox_executable: options['executable_path']=args.firefox_executable
            browser=getattr(p,engine).launch(**options);report['browsers'][engine]=browser.version
            context=browser.new_context(viewport={'width':1920,'height':1080})
            if engine=='chromium': context.grant_permissions(['clipboard-read','clipboard-write'])
            page=context.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(args.url,wait_until='networkidle');page.evaluate('document.fonts.ready')
            themes=['gothic-stickerboard'] if args.smoke else ['standard','playful-pop','raggedy-granite','glossy-marble','luminous-midnight','gothic-stickerboard','baroque-plexiglas']
            for theme in themes:
                for mode in (['light'] if args.smoke else ['light','dark']):
                    page.evaluate('async p=>{await window.portfolioTheme.applyKnownPreferences(p);await document.fonts.ready}',{'styleTheme':theme,'mode':mode,'persist':False})
                    signature=None;fonts=None
                    for width in ([1920,390] if args.smoke else [1920,1151,1150,1149,768,390,320]):
                        def geometry(w=width):
                            page.set_viewport_size({'width':w,'height':1080 if w>768 else 900});page.wait_for_timeout(80);d=page.evaluate(GEOMETRY)
                            require(d['nodes']>=17,f'Container build/runtime detail is missing: {d["nodes"]} nodes')
                            require(d['width']>0 and d['height']>0,'Architecture SVG disappeared')
                            require(d['mobilePanels']==0,'Alternate panel layout replaces the map')
                            require(d['overflow']<=1,f'Page overflow: {d["overflow"]}')
                            require(abs(d['scaleX']-d['scaleY'])<0.0001 and abs(d['dot'])<0.0001,'SVG scale is not uniform')
                            require(not d['badText'],f'Text escapes owning nodes: {d["badText"]}')
                            require(not d['intersections'],f'Visible connector crosses label: {d["intersections"]}')
                            if signature is not None: require(d['signature']==signature,'Box/arrow composition changed with viewport')
                            if fonts is not None: require(d['fontProperties']==fonts,'Individual font sizing drifted with viewport')
                            return {k:v for k,v in d.items() if k not in ('signature','fontProperties')}
                        record(engine,f'preserved map {theme}/{mode}/{width}',geometry)
                        if signature is None:
                            d=page.evaluate(GEOMETRY);signature=d['signature'];fonts=d['fontProperties']
            if not args.smoke:
                def copy_and_disclosures():
                    results=[]
                    for target in ['pulseReviewPrompt','pulsePlanPrompt','pulseShortBuildPrompt','pulseBuildPrompt','pulseVerifyPrompt','pulseAuditContract']:
                        code=page.locator('#'+target);details=code.locator('xpath=ancestor::details[1]')
                        if details.count() and details.get_attribute('open') is None:
                            summary=details.locator('summary').first;summary.scroll_into_view_if_needed();summary.click()
                        button=page.locator('[data-copy-target="'+target+'"]');button.scroll_into_view_if_needed();button.click()
                        if engine=='chromium':require(page.evaluate('navigator.clipboard.readText()')==code.text_content(),'Incomplete copied text: '+target)
                        else:
                            page.wait_for_function('id=>{const e=document.querySelector(`[data-copy-target="${id}"]`);return ["Copied","Select & Copy"].includes(e?.textContent)}',arg=target,timeout=3000)
                            label=button.text_content()
                            if label=='Select & Copy':require(page.evaluate('window.getSelection().toString()')==code.text_content(),'Incomplete native selection fallback: '+target)
                            else:require(label=='Copied','Copy handler did not report success: '+target)
                        results.append(target)
                    for selector in ['.ai-step-prompt','.ai-build-prompt']:
                        item=page.locator(selector).first
                        if item.get_attribute('open') is not None:item.locator('summary').click()
                        summary=item.locator('summary');summary.focus();page.keyboard.press('Enter');require(item.get_attribute('open') is not None,'Keyboard disclosure did not open')
                        page.keyboard.press('Enter');require(item.get_attribute('open') is None,'Keyboard disclosure did not close')
                        require(summary.evaluate('(e)=>getComputedStyle(e).display')=='list-item','Native disclosure marker layout was replaced')
                    return results
                record(engine,'six copy targets and native keyboard disclosures',copy_and_disclosures)
                page.evaluate('async()=>{await window.portfolioTheme.applyKnownPreferences({styleTheme:"gothic-stickerboard",mode:"light",persist:false});await document.fonts.ready}')
                for width,label in [(1920,'desktop'),(390,'mobile')]:
                    page.set_viewport_size({'width':width,'height':1080 if width>768 else 900})
                    for selector,part in [('#system-architecture','architecture'),('[aria-labelledby="prompt-title"]','prompt'),('[aria-labelledby="audit-title"]','audit')]:
                        element=page.locator(selector);element.scroll_into_view_if_needed();page.wait_for_timeout(100);element.screenshot(path=str(out/f'{engine}-{label}-{part}.png'),timeout=20000)
                record(engine,'no uncaught application errors',lambda:require(not errors,str(errors)))
            context.close();browser.close()
finally:
    report['totals']={status:sum(c['status']==status for c in report['cases']) for status in ['passed','failed']}
    (out/'architecture-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'totals':report['totals'],'failures':[{k:v for k,v in c.items() if k!='trace'} for c in report['cases'] if c['status']=='failed']},indent=2))
raise SystemExit(1 if report['totals']['failed'] else 0)
