import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';

// SSR exercises the real JSX via the installed production compiler, without DOM shims.
const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  root, configFile: false, publicDir: false, logLevel: 'silent',
  oxc: { jsx: { runtime: 'classic' } },
  build: { ssr: `${root}src/App.jsx`, write: false, minify: false,
    rollupOptions: { external: ['react'], output: { format: 'es' } } },
});
const code = bundled.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code
  .replace(/(["'])react\1/g, JSON.stringify(import.meta.resolve('react')));
const { RuntimeDashboard, RuntimeDetails, MetricCard, NotificationCard } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const { createDashboardStore } = await import('../src/model.mjs');
const metadata = { service: 'container-pulse', hostname: 'test-replica-a', processUptimeSeconds: 123.5, nodeVersion: 'v22.23.2', appVersion: '1.0.0' };
const observed = { ok: true, status: 200, durationMs: 17.5, metadata };
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, props));

test('initial dashboard has named regions, three bounded controls and no invented successful runtime', () => {
  const store = createDashboardStore();
  const html = render(RuntimeDashboard, { store });
  for (const className of ['pulse-dashboard', 'dashboard-grid', 'card-runtime', 'card-stat-a', 'card-stat-b', 'card-feed', 'card-status']) assert.ok(html.includes(className), className);
  assert.match(html, /Check runtime/);
  assert.match(html, />Clear</);
  assert.match(html, /Sample 6 checks/);
  assert.equal((html.match(/<button\b/g) || []).length, 3);
  assert.match(html, /No runtime checked yet/);
  assert.match(html, /Not checked/);
  assert.match(html, /No notifications yet/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /test-replica|>Live<|healthy|bar-chart|4,821/);
});

test('pending request disables Check but leaves Clear enabled and advertises only checking', () => {
  const store = createDashboardStore({ request: () => new Promise(() => {}) });
  store.check();
  const html = render(RuntimeDashboard, { store });
  assert.match(html, /<button[^>]*disabled[^>]*>Checking…<\/button>/);
  assert.match(html, /<button(?![^>]*disabled)[^>]*>Clear<\/button>/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /Response validated|>Observed</);
  store.dispose();
});

test('validated request updates dominant metadata, measured metrics and notification together', async () => {
  const store = createDashboardStore({ request: async () => observed });
  await store.check();
  const html = render(RuntimeDashboard, { store });
  for (const value of ['test-replica-a', 'v22.23.2', '1.0.0', 'container-pulse', 'Process uptime', '123.5', '17.5', 'HTTP 200', 'Successful checks', 'Current page observations']) assert.ok(html.includes(value), value);
  assert.match(html, /Observed response/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /Acknowledge check 1/);
  assert.match(html, /not a total replica count/i);
  assert.doesNotMatch(html, /container lifetime|>Live<|healthy/);
});

test('failure rendering removes current success metadata and exposes safe error notification', async () => {
  let fail = false;
  const store = createDashboardStore({ request: async () => fail ? { ok: false, kind: 'invalid-response', status: 200, durationMs: 9 } : observed });
  await store.check(); fail = true; await store.check();
  const html = render(RuntimeDashboard, { store });
  assert.match(html, /Check failed/);
  assert.match(html, /No verified runtime to display/);
  assert.match(html, /HTTP 200/);
  assert.match(html, /did not match the expected contract/);
  assert.doesNotMatch(html, /class="runtime-hostname"[^>]*>test-replica-a/);
  assert.doesNotMatch(html, /Observed response/);
  store.clear();
  const cleared = render(RuntimeDashboard, { store });
  assert.doesNotMatch(cleared, /Check failed|test-replica-a|did not match/);
  assert.match(cleared, /No notifications yet/);
});

test('notification reuses visual/details/actions structure and a native checkbox, with escaped text', () => {
  const html = render(NotificationCard, { event: { id: 7, ok: true, status: 200, durationMs: 3, hostname: '<img src=x onerror=alert(1)>', message: 'Validated response.' } });
  for (const className of ['notification-container', 'notification-card', 'card-visual', 'card-details', 'card-title', 'card-actions', 'action-check', 'acknowledge-toggle']) assert.ok(html.includes(className), className);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  const failed = render(NotificationCard, { event: { id: 8, ok: false, status: 503, durationMs: 4, hostname: null, message: '<img src=x onerror=alert(1)>' } });
  assert.match(failed, /class="card-message"/);
  assert.match(failed, /&lt;img/);
  assert.doesNotMatch(failed, /<img/);
  assert.match(html, /<label[^>]*>[\s\S]*type="checkbox"[\s\S]*Acknowledge[\s\S]*<\/label>/);
});

test('graphs are accessible, honestly empty until checks complete, and clear with observations', async () => {
  const store = createDashboardStore({ request: async () => observed });
  const empty = render(RuntimeDashboard, { store });
  assert.match(empty, /Response time/);
  assert.match(empty, /Response distribution/);
  assert.match(empty, /Awaiting measured requests/);
  assert.doesNotMatch(empty, /data-check-id=/);
  await store.sample();
  const populated = render(RuntimeDashboard, { store });
  assert.equal((populated.match(/data-check-id=/g) || []).length, 6);
  assert.match(populated, /role="img"/);
  assert.match(populated, /Browser response time/);
  assert.match(populated, /data-response-count="6"/);
  assert.match(populated, /17\.5 ms/);
  assert.match(populated, /Most recent 12 completed checks/);
  store.clear();
  const cleared = render(RuntimeDashboard, { store });
  assert.match(cleared, /Awaiting measured requests/);
  assert.doesNotMatch(cleared, /data-check-id=|test-replica-a/);
});

test('failed checks use explicitly marked graph points without adding replica distribution', async () => {
  const store = createDashboardStore({ request: async () => ({ ok: false, status: 503, kind: 'http', durationMs: 9 }) });
  await store.check();
  const html = render(RuntimeDashboard, { store });
  assert.match(html, /data-check-id="1"[^>]*data-outcome="failed"/);
  assert.doesNotMatch(html, /data-response-count=/);
  assert.match(html, /No validated responses yet/);
});

test('standalone components expose meaningful metadata and metrics without fake fallbacks', () => {
  const details = render(RuntimeDetails, { metadata, phase: 'success' });
  assert.match(details, /test-replica-a/);
  assert.match(details, /Process uptime/);
  assert.match(render(RuntimeDetails, { metadata: null, phase: 'failed' }), /No verified runtime/);
  assert.match(render(MetricCard, { label: 'Last check duration', value: '—', note: 'Browser measured', area: 'stat-b' }), /Browser measured/);
});

test('entry mounts the React dashboard at pulse-root and imports only the owned stylesheet', async () => {
  const entry = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8').catch(() => '');
  assert.match(entry, /import React/);
  assert.match(entry, /createRoot/);
  assert.match(entry, /['"]\.\.\/styles\/pulse-dashboard\.css['"]/);
  assert.match(entry, /getElementById\(['"]pulse-root['"]\)/);
  assert.match(entry, /\.render\(/);
});

test('owned CSS preserves named asymmetric maps, theme tokens and parent-relative notification styles', async () => {
  const css = await readFile(new URL('../styles/pulse-dashboard.css', import.meta.url), 'utf8');
  assert.match(css, /\.pulse-dashboard/);
  assert.match(css, /grid-template-areas:\s*"latency latency latency latency latency latency"\s*"runtime runtime stat-a feed feed feed"\s*"runtime runtime stat-b feed feed feed"\s*"status status status status status status"/);
  assert.match(css, /@media\s*\(max-width:\s*1000px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container\s+pulse-notification\s*\(min-width:\s*500px\)/);
  assert.match(css, /\.notification-card:has\(\.acknowledge-toggle:checked\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /var\(--flex-color-/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|html|:root)\s*\{/);
});
