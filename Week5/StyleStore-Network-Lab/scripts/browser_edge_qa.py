#!/usr/bin/env python3
"""Real browser edge cases; offline emulation never substitutes synthetic replies."""
from datetime import datetime, timezone
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/qa/browser-edge-results.json'
report = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'url': 'http://127.0.0.1/', 'scope': 'Real browser validation, cancellation, offline/retry and copying. Offline uses browser network blocking, not fake success responses.', 'checks': []}

def check(name, condition):
    report['checks'].append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)

try:
    with sync_playwright() as p:
        for name, executable in [('chromium', '/media/reader/DEVELOP/.cache/runtimes/linux-x64/playwright/chromium-1234/chrome-linux64/chrome'), ('firefox', '/media/reader/DEVELOP/data/cache/scratch/stylestore-week5-20261028/browsers/firefox-1538/firefox/firefox')]:
            browser = getattr(p, name).launch(executable_path=executable, headless=True)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
            if name == 'chromium':
                context.grant_permissions(['clipboard-read', 'clipboard-write'])
            page = context.new_page()
            requests = []
            page.on('request', lambda r: requests.append(r.url) if '/api/quote?' in r.url else None)
            page.goto('http://127.0.0.1/', wait_until='networkidle')
            qty = page.get_by_label('Quantity', exact=True)
            quote = page.get_by_role('button', name='Get quote', exact=True)
            batch = page.get_by_role('button', name='Send 10 requests', exact=True)
            status = page.locator('.ss-status')
            for value in ['', '0', '10', '1.5']:
                qty.fill(value)
                check(f'{name}: invalid quantity {value!r} disables quote', quote.is_disabled())
                before = len(requests)
                batch.click()
                expect(status).to_contain_text('whole-number quantity')
                check(f'{name}: invalid quantity {value!r} emits no quote request', len(requests) == before)
            qty.fill('9')
            quote.click()
            expect(status).to_contain_text('Quote validated')
            check(f'{name}: boundary quantity real total', page.locator('.ss-grand-total dd').inner_text() == '${:.2f}'.format(8500 * 9 / 100))
            qty.fill('2')
            check(f'{name}: quantity change invalidates old total', page.locator('.ss-grand-total dd').inner_text() == '—')
            context.set_offline(True)
            quote.click()
            expect(status).to_contain_text('Lab unavailable')
            check(f'{name}: offline error records failed attempt', page.locator('.ss-count').inner_text() == '1')
            check(f'{name}: offline does not fabricate a quote', page.locator('.ss-grand-total dd').inner_text() == '—')
            context.set_offline(False)
            quote.click()
            expect(status).to_contain_text('Quote validated')
            check(f'{name}: online retry returns actual total', page.locator('.ss-grand-total dd').inner_text() == '${:.2f}'.format(8500 * 2 / 100))
            batch.click()
            check(f'{name}: batch busy gate locks quantity and quote', qty.is_disabled() and quote.is_disabled())
            page.get_by_role('button', name='Clear', exact=True).click()
            after_clear = len(requests)
            page.wait_for_timeout(650)
            check(f'{name}: clear aborts remaining serial batch', len(requests) == after_clear)
            check(f'{name}: clear preserves quantity and removes stale quote', qty.input_value() == '2' and page.locator('.ss-grand-total dd').inner_text() == '—')
            check(f'{name}: clear removes counters/trail', all(el.inner_text().split()[0] == '0' for el in page.locator('.ss-quote-count').all()) and page.locator('.ss-count').inner_text() == '0' and page.locator('.ss-trail tbody tr').count() == 0)
            # Inspect the actual source copy controls and exercise every one.
            buttons = page.locator('[data-copy-target]')
            for i in range(buttons.count()):
                button = buttons.nth(i)
                target = button.get_attribute('data-copy-target')
                details = button.locator('xpath=ancestor::details[1]')
                if details.count() and not details.evaluate('(d) => d.open'):
                    details.locator(':scope > summary').click()
                expected = page.locator('#' + target).text_content()
                button.scroll_into_view_if_needed()
                button.click()
                expect(button).to_have_text(__import__('re').compile('Copied|Select & Copy'))
                if name == 'chromium':
                    actual = page.evaluate('navigator.clipboard.readText()')
                    check(f'{name}: full copy payload {target}', actual == expected)
                elif 'Select' in button.text_content():
                    check(f'{name}: fallback copy selection {target}', page.evaluate('window.getSelection().toString()') == expected)
                else:
                    check(f'{name}: clipboard write completed {target}', button.text_content() == 'Copied')
            browser.close()
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    report['passed'] = sum(c['passed'] for c in report['checks'])
    report['failed'] = sum(not c['passed'] for c in report['checks'])
    OUT.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'report': str(OUT), 'passed': report['passed'], 'failed': report['failed']}))
