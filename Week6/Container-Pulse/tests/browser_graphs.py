"""Section 6 graphs and spacing. Real browser observations; no generated telemetry."""
import argparse, json, traceback
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8796/')
parser.add_argument('--output', required=True)
parser.add_argument('--firefox-executable')
parser.add_argument('--spacing-only', action='store_true')
parser.add_argument('--compact-only', action='store_true')
args = parser.parse_args()
out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
report = {'url': args.url, 'captured_at': datetime.now(timezone.utc).isoformat(), 'browsers': {}, 'cases': []}

def require(value, message):
    if not value: raise AssertionError(message)

def record(engine, name, action):
    try:
        detail = action()
        report['cases'].append({'engine': engine, 'name': name, 'status': 'passed', 'detail': detail})
    except Exception as error:
        report['cases'].append({'engine': engine, 'name': name, 'status': 'failed', 'detail': str(error), 'trace': traceback.format_exc()[-1800:]})
    finally:
        (out / 'graphs-results.json').write_text(json.dumps(report, indent=2) + '\n')

def spacing(page):
    data = page.evaluate('''()=>{const a=document.querySelector('#final-result .result-stage').getBoundingClientRect(), b=document.querySelector('#final-result .result-explanation').getBoundingClientRect();return {gap:b.top-a.bottom,overflow:document.documentElement.scrollWidth-innerWidth}}''')
    require(data['gap'] >= 24, f"Dashboard-to-cards gap is {data['gap']}px; expected at least 24px")
    require(data['overflow'] <= 1, f"Horizontal overflow: {data['overflow']}px")
    return data

try:
    with sync_playwright() as p:
        for engine in (['chromium'] if args.spacing_only or args.compact_only else ['chromium', 'firefox']):
            options = {'headless': True}
            if engine == 'firefox' and args.firefox_executable: options['executable_path'] = args.firefox_executable
            browser = getattr(p, engine).launch(**options); report['browsers'][engine] = browser.version
            page = browser.new_page(viewport={'width': 1920, 'height': 1080}); page.set_default_timeout(12000)
            errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url, wait_until='networkidle'); page.wait_for_selector('.pulse-dashboard'); page.evaluate('document.fonts.ready')
            if args.spacing_only:
                record(engine, 'dashboard is separated from explanation cards', lambda: spacing(page))
                browser.close(); continue
            root = page.locator('#pulse-root')
            def compact():
                data = page.evaluate('''()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {height:box('.dashboard-shell').height,feedHeight:box('.card-feed').height,runtimeHeight:box('.card-runtime').height,graphWidth:box('.card-latency').width,gridWidth:box('.dashboard-grid').width,graphBottom:box('.card-latency').bottom,runtimeTop:box('.card-runtime').top,distributionTop:box('.card-status').top,distributionWidth:box('.card-status').width,feedBottom:box('.card-feed').bottom,hasArrow:document.querySelector('.feed-empty')?.innerText.includes('↳')??false}}''')
                require(data['height'] <= 1000, f'Desktop workspace is unnecessarily tall: {data}')
                require(data['feedHeight'] <= 400 and data['runtimeHeight'] <= 450, f'Side cards remain elongated: {data}')
                require(abs(data['graphWidth'] - data['gridWidth']) <= 1 and data['graphBottom'] < data['runtimeTop'], 'Shallow response graph does not span the top')
                require(abs(data['distributionWidth'] - data['gridWidth']) <= 1 and data['distributionTop'] > data['feedBottom'], 'Distribution does not span the bottom')
                require(not data['hasArrow'], 'Decorative arrow remains in empty notifications')
                return data
            record(engine, 'compact paired desktop cards with no decorative arrow', compact)
            if args.compact_only:
                browser.close(); continue
            def empty():
                require(root.locator('[data-check-id]').count() == 0, 'Empty graph invented timed responses')
                require(root.get_by_text('Awaiting measured requests', exact=True).count() == 1, 'Honest empty chart message missing')
                return spacing(page)
            record(engine, 'honest empty graphs and section spacing', empty)
            replies = []
            def response_handler(response):
                if response.url.split('?')[0].endswith('/api/runtime'): replies.append(response)
            page.on('response', response_handler)
            for _ in range(3):
                page.get_by_role('button', name='Sample 6 checks', exact=True).click()
                page.wait_for_function('()=>!document.querySelector("#pulse-root button").disabled')
            page.remove_listener('response', response_handler)
            def graphs():
                require(len(replies) == 18, f'Expected 18 actual runtime responses; saw {len(replies)}')
                require(all(r.status == 200 for r in replies), 'An actual runtime response failed')
                points = root.locator('[data-check-id]')
                require(points.count() == 12, f'Expected 12 retained graph points; saw {points.count()}')
                require([int(x) for x in points.evaluate_all('(nodes)=>nodes.map(e=>e.dataset.checkId)')] == list(range(7, 19)), 'Graph is not in chronological retained-check order')
                expected = Counter(r.json()['hostname'] for r in replies[-12:])
                actual = {row.get_attribute('data-hostname'): int(row.get_attribute('data-response-count')) for row in root.locator('[data-response-count]').all()}
                require(actual == dict(expected), f'Graph distribution {actual} differs from actual replies {dict(expected)}')
                for point in points.all():
                    require(float(point.get_attribute('data-duration-ms')) >= 0, 'Invalid timing reached SVG')
                    require(point.get_attribute('data-outcome') == 'validated', 'Actual success point is not marked validated')
                require(root.locator('.card-stat-a .stat-number').inner_text() == '18', 'Page total was confused with 12-observation graph window')
                return {'actual_responses': len(replies), 'retained_points': points.count(), 'distribution': actual}
            record(engine, 'graphs agree with real responses and bounded observation window', graphs)
            themes = ['standard', 'playful-pop', 'raggedy-granite', 'glossy-marble', 'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas']
            for theme in themes:
                for mode in ['light', 'dark']:
                    page.evaluate('async p=>{await window.portfolioTheme.applyKnownPreferences(p);await document.fonts.ready}', {'styleTheme': theme, 'mode': mode, 'persist': False})
                    for width in [1920, 1151, 1150, 1149, 768, 390, 320]:
                        def layout(w=width):
                            page.set_viewport_size({'width': w, 'height': 1080 if w > 768 else 900}); page.wait_for_timeout(75)
                            result = spacing(page)
                            data = page.evaluate('''()=>{let plot=document.querySelector('.latency-plot').getBoundingClientRect();return {plotWidth:plot.width,plotHeight:plot.height,badLabels:[...document.querySelectorAll('.chart-axis,.chart-caption,.chart-legend,.host-label')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.className),escaped:[...document.querySelectorAll('.dashboard-grid > .dash-card')].filter(e=>{let r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(e=>e.className)}}''')
                            require(data['plotWidth'] > 70 and data['plotHeight'] >= 110, f'Graph became unreadably small: {data}')
                            require(not data['badLabels'], f'Shrunk chart labels: {data["badLabels"]}')
                            require(not data['escaped'], f'Cards escaped viewport: {data["escaped"]}')
                            return {**result, **data, 'width': w, 'theme': theme, 'mode': mode}
                        record(engine, f'populated layout {theme}/{mode}/{width}', layout)
            for mode in ['light', 'dark']:
                page.evaluate('async p=>{await window.portfolioTheme.applyKnownPreferences(p);await document.fonts.ready}', {'styleTheme': 'gothic-stickerboard', 'mode': mode, 'persist': False})
                for width, label in [(1920, 'desktop'), (390, 'mobile')]:
                    page.set_viewport_size({'width': width, 'height': 1080 if width > 768 else 900}); page.wait_for_timeout(200)
                    page.locator('#final-result').screenshot(path=str(out / f'{engine}-{mode}-{label}-section6.png'))
            def clear():
                page.get_by_role('button', name='Clear', exact=True).click()
                require(root.locator('[data-check-id], [data-response-count]').count() == 0, 'Clear left stale plotted points or distribution')
                require(root.get_by_text('Awaiting measured requests', exact=True).count() == 1, 'Clear did not restore empty graph')
                return 'Cleared plotted observations, distribution and notifications.'
            record(engine, 'Clear resets both graphs', clear)
            record(engine, 'no uncaught browser errors', lambda: require(not errors, str(errors)))
            browser.close()
finally:
    report['totals'] = {status: sum(case['status'] == status for case in report['cases']) for status in ['passed', 'failed']}
    (out / 'graphs-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'totals': report['totals'], 'failures': [case for case in report['cases'] if case['status'] == 'failed']}, indent=2))
raise SystemExit(1 if report['totals']['failed'] else 0)
