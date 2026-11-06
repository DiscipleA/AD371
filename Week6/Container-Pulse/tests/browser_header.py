"""Regression for standalone branding plus theme controls at narrow widths."""
from playwright.sync_api import sync_playwright
import argparse,json
parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8797/');args=parser.parse_args()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':390,'height':844});page.goto(args.url,wait_until='networkidle');page.evaluate('document.fonts.ready');page.wait_for_timeout(400)
 observed=page.evaluate('()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brand:document.querySelector(".portfolio-banner__profile").textContent,wrap:getComputedStyle(document.querySelector(".portfolio-banner__inner")).flexWrap})')
 print(json.dumps(observed));browser.close();assert observed['scrollWidth']<=observed['width']+1,'Standalone header overflows at 390px'
