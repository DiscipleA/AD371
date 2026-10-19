"""Read-only browser smoke/regression checks; requires an existing Playwright install.
Serve the project first. Never sends public writes. Screenshots/reports are opt-in.
"""
import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

IDS = ['standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
       'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8769/')
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    results = []
    def passed(name, **details):
        results.append({'check': name, 'status': 'PASS', **details})
        print('PASS:', name, json.dumps(details) if details else '')
    with sync_playwright() as pw:
        launch = {'headless': True, 'args': ['--no-sandbox']}
        if os.getenv('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']
        browser = pw.chromium.launch(**launch)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000},
                                      permissions=['clipboard-read', 'clipboard-write'], reduced_motion='reduce')
        page = context.new_page()
        errors, assets, writes, api = [], [], [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: assets.append({'url': r.url, 'status': r.status})
                if r.url.startswith(args.url.rstrip('/')) and r.status >= 400 else None)
        page.on('request', lambda r: writes.append(r.method) if '.supabase.co/' in r.url and r.method != 'GET' else None)
        page.on('response', lambda r: api.append(r.status) if '.supabase.co/rest/v1/' in r.url else None)
        def ready(p):
            p.wait_for_function("window.portfolioThemeCloud && ['connected','fallback'].includes(portfolioThemeCloud.getState().status)")
            p.wait_for_function('window.PortfolioThemeRegistry.getAll().length === 7')
            p.wait_for_function('!document.querySelector("#cloud-reload").disabled')
        def appearance(p, style, mode=None):
            p.wait_for_function('(s) => document.documentElement.dataset.styleTheme === s', arg=style)
            if mode:
                p.wait_for_function('(m) => document.documentElement.dataset.theme === m', arg=mode)
            p.wait_for_function("[...document.querySelectorAll('[data-style-theme-stylesheet]')].some(l => l.sheet && l.dataset.activeStyleTheme === document.documentElement.dataset.styleTheme)")
        def choose(p, style):
            p.locator('#cloud-cards [data-style-theme-option="'+style+'"]').click()
            appearance(p, style)
        page.goto(args.url, wait_until='networkidle')
        ready(page)
        state = page.evaluate('portfolioThemeCloud.getState()')
        assert state['status'] == 'connected', 'Real API read failed: '+state['error']
        assert state['httpStatus'] == 200 and 200 in api
        passed('real Supabase read', http=state['httpStatus'], source=state['source'], settings=state['settings'])
        assert page.locator('main > [data-architecture-section]').count() == 7
        assert page.locator('#cloud-cards button').count() == 7
        # Every internal URL resolves to a real file or an existing section.
        for href in page.locator('a[href]').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("href"))'):
            if href.startswith('#'):
                assert page.locator('[id="'+href[1:]+'"]').count(), href
            elif not href.startswith(('http:', 'https:')):
                response = context.request.get(args.url+href)
                assert response.ok, href
        passed('seven-section presentation and local links')
        for width in [1440, 390, 320]:
            page.set_viewport_size({'width': width, 'height': 1000})
            for style in IDS:
                choose(page, style)
                for mode in ['light', 'dark']:
                    current = page.evaluate('document.documentElement.dataset.theme')
                    if current != mode:
                        page.locator('.cloud-lab__actions [data-theme-toggle]').click()
                    appearance(page, style, mode)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow {style} {mode} {width}'
                    assert page.locator('#cloud-cards [data-style-theme-option="'+style+'"]').get_attribute('aria-pressed') == 'true'
            passed('7 themes × 2 modes', viewport=width, combinations=14)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#cloud-filter').fill('luminous')
        expect(page.locator('#cloud-cards article:visible')).to_have_count(1)
        page.locator('#cloud-filter').fill('no-such-design')
        expect(page.locator('#cloud-empty')).to_be_visible()
        page.locator('#cloud-filter').fill('')
        expect(page.locator('#cloud-cards article:visible')).to_have_count(7)
        page.locator('#cloud-filter').fill('x'*100)
        assert len(page.locator('#cloud-filter').input_value()) == 80
        page.locator('#cloud-filter').fill('')
        passed('search, empty state, clear and 80-character limit')
        choose(page, 'luminous-midnight')
        if page.evaluate('document.documentElement.dataset.theme') != 'dark':
            page.locator('.cloud-lab__actions [data-theme-toggle]').click()
        page.reload(wait_until='networkidle'); ready(page); appearance(page, 'luminous-midnight', 'dark')
        page.locator('#cloud-reload').click(); ready(page); appearance(page, 'luminous-midnight', 'dark')
        passed('saved style and mode survive document/API reload')
        requests_before = len(api)
        page.locator('#cloud-offline').click(); ready(page)
        expect(page.locator('#cloud-status')).to_have_text('Offline simulation')
        expect(page.locator('#cloud-http')).to_have_text('Not requested')
        assert len(api) == requests_before
        assert page.evaluate('portfolioThemeCloud.getState().source') == 'cache'
        appearance(page, 'luminous-midnight', 'dark')
        passed('labeled offline simulation skips network and uses validated cache')
        page.locator('#cloud-defaults').click()
        appearance(page, state['settings']['default_theme'], state['settings']['default_mode'])
        assert page.evaluate("localStorage.getItem('resume-theme') === null && localStorage.getItem('resume-style-theme') === null")
        page.locator('#cloud-reload').click(); ready(page)
        passed('reset clears saved overrides and restores configured defaults')
        button = page.locator('[data-copy-target="cloudWorkingPrompt"]')
        button.click()
        expect(button).to_have_text('Copied')
        assert page.evaluate('navigator.clipboard.readText()') == page.locator('#cloudWorkingPrompt').text_content()
        page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async()=>{throw Error('blocked')}}})")
        audit_button = page.locator('[data-copy-target="cloudAuditCode"]')
        audit_button.click()
        expect(audit_button).to_have_text('Select & Copy')
        assert page.evaluate('getSelection().toString()') == page.locator('#cloudAuditCode').text_content()
        passed('real clipboard copy and denied-clipboard selection fallback')
        for width in [1440, 390, 320]:
            page.set_viewport_size({'width': width, 'height': 1000})
            page.mouse.move(0, 900)
            # Use real keyboard activation; no programmatic click shortcut.
            themes = page.locator('.portfolio-theme-menu__toggle')
            themes.focus(); page.keyboard.press('Enter')
            expect(themes).to_have_attribute('aria-expanded','true')
            # Let finite menu visibility transitions settle before sequential Tab.
            page.wait_for_timeout(250)
            expect(themes).to_be_focused()
            page.keyboard.press('Tab')
            assert page.evaluate("document.activeElement.matches('[data-theme-toggle]')"), page.evaluate('document.activeElement.outerHTML')
            page.keyboard.press('Tab'); page.keyboard.press('Enter')
            appearance(page, page.evaluate('PortfolioThemeRegistry.getAll()[0].id'))
            themes.focus(); page.keyboard.press('Enter'); page.keyboard.press('Escape')
            expect(themes).to_be_focused()
            assert page.locator('.portfolio-theme-menu__panel').evaluate('(n)=>n.inert')
            menu = page.locator('.portfolio-menu__toggle')
            menu.focus(); page.keyboard.press('Enter')
            expect(menu).to_have_attribute('aria-expanded','true')
            page.wait_for_timeout(250)
            expect(menu).to_be_focused()
            page.keyboard.press('Tab')
            assert page.evaluate("document.activeElement.matches('.portfolio-menu__item')"), page.evaluate('document.activeElement.outerHTML')
            page.keyboard.press('Escape'); expect(menu).to_be_focused()
            assert page.locator('.portfolio-menu__panel').evaluate('(n)=>n.inert')
            page.keyboard.press('Tab')
            assert not page.evaluate("document.activeElement.closest('.portfolio-menu__panel, .portfolio-theme-menu__panel') !== null")
            passed('keyboard menus, Escape/focus restoration and inert closed panels', viewport=width)
        # Actual transport failure, not the explicit simulation button, in a fresh context.
        offline = browser.new_context(reduced_motion='reduce')
        offline.route('**/rest/v1/portfolio_theme_settings*', lambda route: route.abort('internetdisconnected'))
        op = offline.new_page(); op.goto(args.url, wait_until='networkidle'); ready(op)
        assert op.evaluate('portfolioThemeCloud.getState().source') == 'local'
        assert op.evaluate('portfolioThemeCloud.getState().status') == 'fallback'
        choose(op, 'standard')
        passed('controlled failed GET uses bundled defaults and retains local controls')
        offline.close()
        restricted = browser.new_context(reduced_motion='reduce')
        restricted.add_init_script("for(const m of ['getItem','setItem','removeItem']) Storage.prototype[m]=()=>{throw new DOMException('Blocked','SecurityError')}")
        rp = restricted.new_page(); rp.goto(args.url, wait_until='networkidle'); ready(rp)
        choose(rp, 'standard')
        rp.locator('.cloud-lab__actions [data-theme-toggle]').click()
        chosen_mode = rp.evaluate('document.documentElement.dataset.theme')
        rp.locator('#cloud-reload').click(); ready(rp); appearance(rp, 'standard', chosen_mode)
        rp.locator('#cloud-defaults').click()
        rsettings = rp.evaluate('portfolioThemeCloud.getState().settings')
        appearance(rp, rsettings['default_theme'], rsettings['default_mode'])
        passed('blocked storage retains current-page choices across API reload and permits reset')
        restricted.close()
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.set_viewport_size({'width':1440,'height':1000})
            choose(page, 'gothic-stickerboard')
            if page.evaluate('document.documentElement.dataset.theme') != 'light':
                page.locator('.cloud-lab__actions [data-theme-toggle]').click()
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(args.screenshots/'desktop.png'), full_page=True)
            page.locator('#final-result').scroll_into_view_if_needed()
            page.screenshot(path=str(args.screenshots/'desktop-working.png'))
            page.set_viewport_size({'width':390,'height':1000})
            page.locator('#final-result').scroll_into_view_if_needed()
            page.screenshot(path=str(args.screenshots/'mobile-working.png'))
            page.set_viewport_size({'width':320,'height':1000})
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(args.screenshots/'mobile-320.png'))
        assert not errors, errors
        assert not assets, assets
        assert not writes, writes
        passed('no uncaught page errors, local HTTP asset failures or public writes')
        browser.close()
        firefox_path = os.getenv('PLAYWRIGHT_FIREFOX_EXECUTABLE') or pw.firefox.executable_path
        print('Firefox binary:', firefox_path, '(not run; smoke suite targets Chromium)')
    if args.report:
        args.report.write_text(json.dumps(results, indent=2))
    print(f'Completed {len(results)} browser checks.')

if __name__ == '__main__':
    main()
