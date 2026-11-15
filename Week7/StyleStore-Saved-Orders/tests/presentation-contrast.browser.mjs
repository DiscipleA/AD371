import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeServer} from '../scripts/serve.mjs';

// Optional external QA dependencies/browsers keep this test independent of the
// application bundle. No rules or nodes are excluded from the page-wide audit.
async function qaImport(name, entry) {
  if (process.env.SAVED_ORDERS_QA_MODULES) {
    return import(pathToFileURL(resolve(process.env.SAVED_ORDERS_QA_MODULES, name, entry)).href);
  }
  return import(name);
}
const affected = new Set(['raggedy-granite/light', 'raggedy-granite/dark', 'gothic-stickerboard/dark', 'baroque-plexiglas/light']);
const samples = ['.narrative-panel p', '.concept-card p', '.concept-source', '.audit-layout .code-label', '.audit-item p', '.result-note p', '.section-index', '.eyebrow', '.ss-header-utility > :first-child', '.ss-eyebrow', '.ss-quote-disclaimer'];

test('page-wide WCAG audit: inherited theme colors retain contrast in Chromium and Firefox', {timeout:900000}, async () => {
  const {chromium, firefox} = await qaImport('playwright-core', 'index.mjs');
  const {default: AxeBuilder} = await qaImport('@axe-core/playwright', 'dist/index.mjs');
  let server;
  let url = process.env.SAVED_ORDERS_CONTRAST_URL;
  if (!url) {
    server = await makeServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  }
  const cases = [], errors = [];
  try {
    for (const [name, engine, executablePath] of [
      ['chromium', chromium, process.env.SAVED_ORDERS_CHROMIUM],
      ['firefox', firefox, process.env.SAVED_ORDERS_FIREFOX]
    ]) {
      const browser = await engine.launch({headless:true, ...(executablePath ? {executablePath} : {})});
      try {
        const context = await browser.newContext({viewport:{width:1920,height:1080}});
        // Exercise pending project-owned CSS before rebuilding dist; the final
        // verification omits this flag and audits the actual built stylesheet.
        if (process.env.SAVED_ORDERS_CONTRAST_SOURCE === '1') {
          await context.route('**/styles/saved-orders-showcase.css', route => route.fulfill({
            contentType:'text/css', path:new URL('../styles/saved-orders-showcase.css', import.meta.url).pathname
          }));
        }
        const page = await context.newPage();
        page.on('pageerror', error => errors.push({browser:name,message:error.message}));
        await page.goto(url, {waitUntil:'networkidle'});
        await page.locator('.saved-orders-app').waitFor();
        const themes = await page.evaluate(() => PortfolioThemeRegistry.getAll().map(theme => theme.id));
        for (const theme of themes) for (const mode of ['light','dark']) {
          if (process.env.SAVED_ORDERS_CONTRAST_AFFECTED === '1' && !affected.has(`${theme}/${mode}`)) continue;
          await page.evaluate(([styleTheme,mode]) => portfolioTheme.applyPreferences({styleTheme,mode}), [theme,mode]);
          await page.waitForFunction(() => document.querySelector('[data-style-theme-stylesheet]').sheet !== null);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(350);
          for (const width of [1920,390]) {
            await page.setViewportSize({width,height:1080});
            const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
            const computed = await page.evaluate(selectors => selectors.map(selector => {
              const el = document.querySelector(selector);
              if (!el) return {selector,missing:true};
              const style = getComputedStyle(el);
              const surfaces = [];
              for (let ancestor=el; ancestor; ancestor=ancestor.parentElement) {
                const s=getComputedStyle(ancestor);
                if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none') {
                  surfaces.push({element:ancestor.className || ancestor.tagName,background:s.backgroundColor,image:s.backgroundImage});
                }
              }
              return {selector,color:style.color,fontSize:style.fontSize,fontWeight:style.fontWeight,surfaces};
            }), samples);
            const compact = rule => ({id:rule.id,impact:rule.impact,nodes:rule.nodes.map(({target,failureSummary}) => ({target,failureSummary}))});
            const row = {browser:name,version:browser.version(),axeVersion:result.testEngine.version,theme,mode,width,violations:result.violations.map(compact),incomplete:result.incomplete.map(compact),computed};
            cases.push(row);
            console.log(`${name} ${theme} ${mode} ${width}: ${row.violations.length ? 'FAIL' : 'PASS'}`);
          }
        }
        await context.close();
      } finally { await browser.close(); }
    }
    const failed = cases.filter(row => row.violations.length);
    const expected = process.env.SAVED_ORDERS_CONTRAST_AFFECTED === '1' ? 16 : 56;
    if (process.env.SAVED_ORDERS_CONTRAST_REPORT) {
      await writeFile(process.env.SAVED_ORDERS_CONTRAST_REPORT, JSON.stringify({complete:true,url,capturedAt:new Date().toISOString(),sourceStyles:process.env.SAVED_ORDERS_CONTRAST_SOURCE === '1',cases,errors}, null, 2)+'\n');
    }
    console.log(JSON.stringify({cases:cases.length,failedCases:failed.length,pageErrors:errors.length}));
    assert.equal(cases.length, expected, 'Complete browser/theme/mode/width matrix required');
    assert.deepEqual(errors, [], 'No runtime page errors');
    assert.deepEqual(failed.map(({browser,theme,mode,width,violations}) => ({browser,theme,mode,width,violations})), [], 'Every page-wide WCAG audit must pass');
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
});
