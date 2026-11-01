import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = async path => {try {return await readFile(new URL(`../${path}`, import.meta.url), 'utf8');} catch (e) {if (e.code === 'ENOENT') return ''; throw e;}};
test('React mounts only the owned island and emits scoped stylesheet', async () => {
  const main = await source('src/main.jsx');
  assert.match(main, /getElementById\(['"]stylestore-root['"]\)/);
  assert.match(main, /import ['"]\.\.\/styles\/storefront\.css['"]/);
  assert.doesNotMatch(main, /getElementById\(['"]root['"]\)/);
});
test('storefront retains source identity, descriptive copy, accessible quantity and API-only totals', async () => {
  const ui = await source('src/Storefront.jsx');
  for (const text of ['StyleStore', 'Retro Sneakers', 'Premium classic athletic footwear', 'Order Summary', 'Get quote', 'adaptive-card', './assets/sneaker.svg']) assert.ok(ui.includes(text), text);
  assert.match(ui, /htmlFor="ss-quantity"/); assert.match(ui, /min="1"/); assert.match(ui, /max="9"/);
  assert.match(ui, /quote\.totalCents/); assert.doesNotMatch(ui, /quantity\s*\*\s*8500|Continue to payment|Full name|Postal code|Search|btn-cart/);
});
test('monitor explains observation semantics and exposes only working controls', async () => {
  const ui = await source('src/NetworkMonitor.jsx');
  for (const text of ['Nginx', 'round-robin', 'Last quote response—not health', 'Send 10 requests', 'Check health', 'Clear', 'HTTP', 'Duration', 'Request', 'Not checked']) assert.ok(ui.includes(text), text);
  assert.doesNotMatch(ui, /aria-live/); // Trail is not a constantly re-announced live region.
  assert.doesNotMatch(ui, /<details[^>]*\bopen=/); // Keep a 20-row batch trail behind native disclosure.
  assert.match(ui, /checkedAt/);
});
test('App subscribes to tested session with concise live status and unmount cleanup', async () => {
  const app = await source('src/App.jsx');
  assert.match(app, /useSyncExternalStore/); assert.match(app, /StyleStoreLabConfig/);
  assert.match(app, /role="status"/); assert.match(app, /aria-live="polite"/); assert.match(app, /dispose\(\)/);
  assert.ok(app.indexOf('<Storefront') < app.indexOf('<NetworkMonitor'));
  assert.doesNotMatch(app, /localStorage|sessionStorage|location\.search|setInterval|dangerouslySetInnerHTML/);
});
test('island CSS consumes inherited themes, source layout and never global body styles', async () => {
  const css = await source('styles/storefront.css');
  assert.match(css, /\.stylestore-lab/); assert.match(css, /var\(--flex-color-/);
  assert.match(css, /container-type:\s*inline-size/); assert.match(css, /@container/);
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:body|html|:root|\*)\s*[{,]/);
  assert.doesNotMatch(css, /https?:\/\/|@import/);
});
