import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeServer} from '../scripts/serve.mjs';

async function playwright() {
  return process.env.SAVED_ORDERS_QA_MODULES
    ? import(pathToFileURL(resolve(process.env.SAVED_ORDERS_QA_MODULES, 'playwright-core/index.mjs')).href)
    : import('playwright-core');
}

// Test the real production bundle, without injecting markup/CSS, mocking the API,
// starting Auth, or allowing requests to leave the loopback static preview.
for (const engineName of ['chromium', 'firefox']) {
  test(`${engineName}: phone order label and all four draft rows stay readable and contained`, {timeout:240000}, async () => {
    const engines = await playwright();
    const executablePath = process.env[`SAVED_ORDERS_${engineName.toUpperCase()}`];
    let server;
    let url = process.env.SAVED_ORDERS_NARROW_URL;
    if (!url) {
      server = await makeServer();
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${server.address().port}/`;
    }
    assert.equal(new URL(url).hostname, '127.0.0.1', 'Only loopback previews are permitted');
    const failures = [], errors = [], external = [], cases = [];
    let browser;
    try {
      browser = await engines[engineName].launch({headless:true, ...(executablePath ? {executablePath} : {})});
      const context = await browser.newContext({viewport:{width:320,height:1080}});
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url, {waitUntil:'networkidle'});
      await page.locator('.saved-orders-app').waitFor();
      assert.equal(await page.locator('script[src="./assets/stylestore.js"]').count(), 1, 'Production JS must be loaded');
      assert.equal(await page.locator('link[href="./assets/stylestore.css"]').count(), 1, 'Production CSS must be loaded');
      for (const name of ['Retro Sneakers','Classic Tee','Everyday Hoodie','City Backpack']) {
        await page.getByRole('button', {name:`${name} $`, exact:false}).click();
        await page.getByRole('button', {name:'Add to draft', exact:false}).click();
      }
      assert.equal(await page.locator('.ss-summary-item').count(), 4);
      const themes = await page.evaluate(() => PortfolioThemeRegistry.getAll().map(theme => theme.id));
      assert.equal(themes.length, 7);
      for (const theme of themes) for (const mode of ['light','dark']) {
        await page.evaluate(([styleTheme,mode]) => portfolioTheme.applyPreferences({styleTheme,mode}), [theme,mode]);
        await page.waitForFunction(() => document.querySelector('[data-style-theme-stylesheet]').sheet !== null);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        for (const width of [320,390]) {
          await page.setViewportSize({width,height:1080});
          const field = page.getByLabel('Order label', {exact:true});
          for (const value of ['Essentials', 'x'.repeat(80), '😀'.repeat(80)]) {
            await field.fill('');
            await field.focus();
            await page.keyboard.insertText(value);
            assert.equal(await field.inputValue(), value, 'Typing must preserve all 80 ASCII/emoji characters');
            const issues = await page.evaluate(() => {
              const issues = [];
              const box = node => node.getBoundingClientRect();
              const summary = document.querySelector('.ss-summary');
              const form = document.querySelector('.ss-label-form');
              const input = form.querySelector('input');
              const inside = (child, parent, label) => {
                const c = box(child), p = box(parent);
                if (c.left < p.left - 1 || c.right > p.right + 1) issues.push(`${label}: ${c.left.toFixed(2)}..${c.right.toFixed(2)} outside ${p.left.toFixed(2)}..${p.right.toFixed(2)}`);
              };
              inside(input, form, 'Order-label input escapes form');
              inside(input, summary, 'Order-label input escapes summary');
              for (const [name,node] of [['form',form],['summary',summary]]) {
                if (node.scrollWidth > node.clientWidth + 1) issues.push(`${name} scroll overflow: ${node.scrollWidth} > ${node.clientWidth}`);
              }
              if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('Root page overflow');
              const words = node => {
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                  // Native select options have no page-layout text rectangles.
                  if (walker.currentNode.parentElement.closest('select')) continue;
                  for (const match of walker.currentNode.textContent.matchAll(/\S+/g)) {
                    const range = document.createRange();
                    range.setStart(walker.currentNode, match.index);
                    range.setEnd(walker.currentNode, match.index + match[0].length);
                    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
                    const lines = new Set(rects.map(rect => Math.round(rect.top)));
                    if (lines.size !== 1) issues.push(`Fractured word ${JSON.stringify(match[0])} in ${node.textContent}: ${lines.size} lines`);
                    const parent = box(node);
                    if (rects.some(rect => rect.left < parent.left - 1 || rect.right > parent.right + 1)) issues.push(`Word outside its box: ${match[0]}`);
                  }
                }
              };
              for (const row of document.querySelectorAll('.ss-summary-item')) {
                inside(row, summary, 'Summary row');
                words(row.querySelector('.ss-summary-details strong'));
                for (const node of row.querySelectorAll('img,.ss-summary-details,.ss-line-total,label,select,button')) {
                  inside(node, row, `Row ${node.tagName}.${node.className}`);
                  inside(node, summary, `Summary ${node.tagName}.${node.className}`);
                  const style = getComputedStyle(node), rect = box(node);
                  if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden') issues.push('Invisible row content');
                  if (node.matches('button,select') && rect.height < 43.9) issues.push('Touch target shorter than 44px');
                  if (node.matches('label,button,.ss-line-total')) words(node);
                }
                const select = box(row.querySelector('select')), remove = box(row.querySelector('button'));
                if (Math.min(select.right,remove.right) - Math.max(select.left,remove.left) > 1 && Math.min(select.bottom,remove.bottom) - Math.max(select.top,remove.top) > 1) issues.push('Quantity and remove controls overlap');
              }
              return issues;
            });
            if (issues.length) failures.push({theme,mode,width,label:value === 'Essentials' ? 'short' : value.startsWith('x') ? '80 ASCII' : '80 emoji',issues});
          }
          cases.push({theme,mode,width});
        }
      }
      // The layout must still permit actual local quantity edits and removal.
      await page.getByLabel('Quantity for Classic Tee', {exact:true}).selectOption('3');
      assert.equal(await page.getByLabel('Quantity for Classic Tee', {exact:true}).inputValue(), '3');
      await page.getByRole('button', {name:'Remove Classic Tee',exact:true}).click();
      assert.equal(await page.locator('.ss-summary-item').count(), 3);
      assert.equal(await page.locator('.ss-summary-badge').innerText(), 'Local draft');
      assert.equal(cases.length, 28, 'Complete seven-theme/two-mode/two-width matrix');
      console.log(JSON.stringify({browser:engineName,version:browser.version(),cases:cases.length,labelChecks:cases.length*3,failedLabelChecks:failures.length,pageErrors:errors.length,externalRequests:external.length}));
      assert.deepEqual(errors, [], 'No runtime errors');
      assert.deepEqual(external, [], 'No hosted requests');
      assert.deepEqual(failures, [], 'Label boxes, complete words, and usable row controls must fit their actual containers');
      await context.close();
    } finally {
      if (browser) await browser.close();
      if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    }
  });
}
