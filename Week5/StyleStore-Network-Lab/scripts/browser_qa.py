#!/usr/bin/env python3
"""Local browser QA. Live infrastructure and deliberately injected fixtures stay separate."""
import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1/')
parser.add_argument('--output', required=True)
parser.add_argument('--chromium', default='/media/reader/DEVELOP/.cache/runtimes/linux-x64/playwright/chromium-1234/chrome-linux64/chrome')
parser.add_argument('--firefox', required=True)
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
report = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'url': args.url, 'scope': 'Local live Nginx/Node UI. Not public deployment QA.', 'engines': [], 'checks': []}


def check(name, condition, detail=None, scope='live'):
    entry = {'name': name, 'passed': bool(condition), 'scope': scope}
    if detail is not None:
        entry['detail'] = detail
    report['checks'].append(entry)
    if not condition:
        raise AssertionError(f'{name}: {detail}')


def save():
    report['passed'] = sum(c['passed'] for c in report['checks'])
    report['failed'] = sum(not c['passed'] for c in report['checks'])
    (out / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n')


try:
    with sync_playwright() as p:
        for engine_name, executable in [('chromium', args.chromium), ('firefox', args.firefox)]:
            engine = getattr(p, engine_name)
            browser = engine.launch(executable_path=executable, headless=True)
            report['engines'].append({'engine': engine_name, 'version': browser.version, 'executable': executable})
            context = browser.new_context(viewport={'width': 1920, 'height': 1080}, reduced_motion='reduce')
            if engine_name == 'chromium':
                context.grant_permissions(['clipboard-read', 'clipboard-write'])
            page = context.new_page()
            errors, failed_assets = [], []
            # Observe real browser fetch responses while their streams still exist.
            # No fixtures, generated replies, modified bodies, or endpoint changes.
            page.add_init_script('''(() => {
              window.__styleStoreQaQuotes = [];
              const originalFetch = window.fetch.bind(window);
              window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                if (response.url.includes('/api/quote?')) {
                  const record = {url:response.url,status:response.status,gateway:response.headers.get('x-lab-gateway'),data:null};
                  window.__styleStoreQaQuotes.push(record);
                  response.clone().json().then(data => {record.data=data;}).catch(() => {record.readError=true;});
                }
                return response;
              };
            })();''')
            def quotes():
                return page.evaluate('window.__styleStoreQaQuotes')
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda r: failed_assets.append({'url': r.url, 'status': r.status}) if r.status >= 400 and '/api/' not in r.url and '/healthz' not in r.url else None)

            response = page.goto(args.url, wait_until='networkidle')
            check(f'{engine_name}: correct served page', response.status == 200 and 'StyleStore' in page.title(), page.title())
            page.locator('.stylestore-lab').wait_for()
            check(f'{engine_name}: no automatic quote requests', len(quotes()) == 0)
            check(f'{engine_name}: seven content sections', page.locator('main#main-content > section.section-card').count() == 7)
            check(f'{engine_name}: every concept links to an official resource', page.locator('[data-architecture-section="concepts"] a.concept-card[href^="https://"]').count() == page.locator('[data-architecture-section="concepts"] .concept-card').count() == 6)
            quote = page.get_by_role('button', name='Get quote', exact=True)
            quote.scroll_into_view_if_needed()
            with page.expect_response(lambda r: '/api/quote?' in r.url):
                quote.click()
            expect(page.locator('.ss-status')).to_contain_text('Quote validated', timeout=10000)
            expect(quote).to_be_enabled(timeout=10000)
            page.wait_for_function('() => window.__styleStoreQaQuotes.length === 1 && window.__styleStoreQaQuotes[0].data !== null')
            check(f'{engine_name}: quote uses actual gateway response', len(quotes()) == 1 and quotes()[0]['status'] == 200 and quotes()[0]['gateway'] == 'nginx')
            body = quotes()[0]['data']
            check(f'{engine_name}: actual quote identity and total', body['serverId'] in ['store-a', 'store-b'] and body['quantity'] == 1 and body['totalCents'] == 8500, body)
            batch = page.get_by_role('button', name=re.compile(r'^Send\s*10\s*requests$', re.I))
            batch.click()
            expect(page.locator('.ss-status')).to_contain_text('Batch complete', timeout=45000)
            expect(batch).to_be_enabled(timeout=45000)
            page.wait_for_function('() => window.__styleStoreQaQuotes.length === 11 && window.__styleStoreQaQuotes.every(r => r.data !== null)')
            bodies = [r['data'] for r in quotes() if r['status'] == 200]
            check(f'{engine_name}: ten-request batch really sends ten requests', len(quotes()) == 11, len(quotes()))
            check(f'{engine_name}: both actual replicas observed', {b['serverId'] for b in bodies} == {'store-a', 'store-b'}, [b['serverId'] for b in bodies])
            for server_id in ['store-a', 'store-b']:
                observed = sum(body['serverId'] == server_id for body in bodies)
                displayed = int(page.locator(f'.ss-replica[aria-label="{server_id} observations"] .ss-quote-count').inner_text().split()[0])
                check(f'{engine_name}: {server_id} counter equals actual responses', displayed == observed, {'displayed': displayed, 'actual': observed})
            page.get_by_role('button', name=re.compile(r'^Check\s*health$', re.I)).click()
            expect(page.locator('.ss-status')).to_contain_text('Health check complete', timeout=10000)
            expect(page.get_by_role('button', name='Check health', exact=True)).to_be_enabled(timeout=10000)
            check(f'{engine_name}: health probes do not increment quote requests', len(quotes()) == 11)
            check(f'{engine_name}: health shows both observations', page.locator('.ss-health--healthy').count() == 2, page.locator('.stylestore-lab').inner_text()[-3500:])
            page.locator('.ss-trail > summary').click()
            check(f'{engine_name}: request trail contains the actual quote attempts', page.locator('.ss-trail tbody tr').count() == 11)
            page.screenshot(path=str(out / f'{engine_name}-working-observed.png'), full_page=True)
            page.get_by_role('button', name='Clear', exact=True).click()
            check(f'{engine_name}: clear does not send another quote', len(quotes()) == 11)
            check(f'{engine_name}: clear resets observations rather than faking traffic', page.locator('.ss-trail tbody tr').count() == 0 and page.locator('.ss-health--unknown').count() == 2 and all(value.inner_text().split()[0] == '0' for value in page.locator('.ss-quote-count').all()))

            # Real appearance controller exercises all installed packages/modes.
            themes = page.evaluate('window.portfolioTheme.getThemes().map(t => t.id)')
            layout_states = 0
            for theme in themes:
                for mode in ['light', 'dark']:
                    page.evaluate('(p) => window.portfolioTheme.applyPreferences(p)', {'styleTheme': theme, 'mode': mode})
                    page.wait_for_function("() => Boolean(document.querySelector('[data-style-theme-stylesheet]')?.sheet?.cssRules?.length)")
                    page.evaluate('() => document.fonts.ready.then(() => true)')
                    for width, height in [(1920, 1080), (1001, 900), (768, 1024), (390, 844), (320, 900)]:
                        page.set_viewport_size({'width': width, 'height': height})
                        # Let finite inherited menu/layout transitions finish before
                        # measuring the settled viewport; do not relax geometry.
                        page.wait_for_timeout(250)
                        geometry = page.evaluate('''() => ({width: innerWidth, scroll: document.documentElement.scrollWidth, mode:document.documentElement.dataset.theme, theme:document.documentElement.dataset.styleTheme, buttons:[...document.querySelectorAll('.stylestore-lab button')].map(b=>({text:b.textContent.trim(),width:b.getBoundingClientRect().width}))})''')
                        check(f'{engine_name}: {theme}/{mode}/{width} no page overflow', geometry['scroll'] <= width + 1, geometry)
                        layout_states += 1
                        if theme == 'standard' and mode == 'light' and width in [1920, 390, 320]:
                            page.screenshot(path=str(out / f'{engine_name}-{width}-page.png'), full_page=True)
            report['engines'][-1]['layout_states'] = layout_states
            page.set_viewport_size({'width': 390, 'height': 844})
            page.evaluate("() => window.portfolioTheme.applyPreferences({styleTheme:'standard',mode:'light'})")
            menu = page.get_by_role('button', name=re.compile(r'^Menu(?:\s|$)'))
            menu.focus()
            menu.press('Enter')
            page.wait_for_timeout(250)
            check(f'{engine_name}: keyboard opens section menu', menu.get_attribute('aria-expanded') == 'true')
            page.keyboard.press('Escape')
            check(f'{engine_name}: Escape restores menu focus', menu.get_attribute('aria-expanded') == 'false' and menu.evaluate('(b)=>b===document.activeElement'))
            page.keyboard.press('Tab')
            check(f'{engine_name}: closed menu excludes descendant Tab focus', not page.evaluate("document.activeElement.closest('.portfolio-menu__panel,.portfolio-theme-menu__panel') !== null"))
            check(f'{engine_name}: no uncaught runtime errors', not errors, errors)
            check(f'{engine_name}: no failed static assets', not failed_assets, failed_assets)
            browser.close()
            save()
except Exception as error:
    report['error'] = str(error)
    save()
    raise
save()
print(json.dumps({'report': str(out / 'browser-results.json'), 'passed': report['passed'], 'failed': report['failed']}))
