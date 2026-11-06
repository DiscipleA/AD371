"""Focused regression: the complete diagram remains present and uniformly scaled."""
from playwright.sync_api import sync_playwright
import argparse, json
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8796/');args=parser.parse_args()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True);page=browser.new_page();page.goto(args.url,wait_until='networkidle');page.evaluate('document.fonts.ready')
    for width in [1920,1151,1150,1149,768,390,320]:
        page.set_viewport_size({'width':width,'height':1080})
        data=page.locator('.pulse-map-desktop').evaluate('''e=>{const r=e.getBoundingClientRect(),m=e.getScreenCTM();return {width:r.width,height:r.height,scaleX:Math.hypot(m.a,m.b),scaleY:Math.hypot(m.c,m.d),nodes:e.querySelectorAll('[data-map-node]').length,mobilePanels:document.querySelectorAll('.pulse-map-mobile').length}}''')
        assert data['width']>0 and data['height']>0,'Architecture SVG disappeared'
        assert data['nodes']>=17 and data['mobilePanels']==0,'Diagram composition was replaced'
        assert abs(data['scaleX']-data['scaleY'])<0.0001,'Diagram was stretched rather than scaled'
        print(json.dumps({'viewport':width,**data}))
    browser.close()
