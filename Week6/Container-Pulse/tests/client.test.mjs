import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntime, requestRuntime } from '../src/client.mjs';
import { createDashboardStore } from '../src/model.mjs';

// Controlled HTTP transports below are test fixtures, never live runtime evidence.
const metadata = Object.freeze({ service: 'container-pulse', hostname: 'replica-a', processUptimeSeconds: 42.25, nodeVersion: 'v22.23.2', appVersion: '1.0.0' });
const jsonResponse = (body = metadata, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const observed = (hostname = 'replica-a') => ({ ok: true, status: 200, durationMs: 12.5, metadata: { ...metadata, hostname } });

test('validates and projects the exact safe runtime metadata', () => {
  assert.deepEqual(validateRuntime({ ...metadata, ignored: '<script>' }), metadata);
  assert.notEqual(validateRuntime(metadata), metadata);
});

test('rejects arrays, missing fields, unsafe text and invalid numerical/version fields', () => {
  const invalid = [null, [], 'runtime', {}, { ...metadata, service: 'other' },
    ...['', ' ', 'a'.repeat(129), '<img>', 'host\nname', 'https://evil.test', 'name with spaces'].map(hostname => ({ ...metadata, hostname })),
    ...[-1, Infinity, NaN, '3', null].map(processUptimeSeconds => ({ ...metadata, processUptimeSeconds })),
    ...['22.1.0', 'vno', 'v22.1.0<script>', null].map(nodeVersion => ({ ...metadata, nodeVersion })),
    ...['', ' ', '<script>', 'a'.repeat(129), null].map(appVersion => ({ ...metadata, appVersion }))];
  for (const body of invalid) assert.equal(validateRuntime(body), null, JSON.stringify(body));
  assert.ok(validateRuntime({ ...metadata, processUptimeSeconds: 0 }));
});

test('rejects terminal line separators in safe metadata and configured API paths', async () => {
  for (const suffix of ['\n', '\r', '\u2028', '\u2029']) {
    for (const field of ['hostname', 'appVersion', 'nodeVersion']) {
      assert.equal(validateRuntime({ ...metadata, [field]: metadata[field] + suffix }), null, `${field} must reject a terminal separator`);
    }
    let called = false;
    const result = await requestRuntime({ apiBase: '/lab' + suffix, fetchImpl: async () => { called = true; return jsonResponse(); } });
    assert.equal(result.kind, 'configuration');
    assert.equal(called, false);
  }
});

test('uses same-origin runtime path, no-store and actual HTTP status/browser timing', async () => {
  let request;
  const times = [100, 127.5];
  const result = await requestRuntime({ fetchImpl: async (url, options) => { request = { url, options }; return jsonResponse(metadata, 201); }, now: () => times.shift() });
  assert.equal(request.url, '/api/runtime');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(result, { ok: true, status: 201, durationMs: 27.5, metadata });
});

test('supports a safe configured same-origin apiBase and rejects unsafe paths', async () => {
  let called = '';
  const fetchImpl = async url => { called = url; return jsonResponse(); };
  assert.equal((await requestRuntime({ apiBase: '/lab/', fetchImpl })).ok, true);
  assert.equal(called, '/lab/api/runtime');
  for (const apiBase of ['http://outside.test', '//outside.test', '/\\outside.test', '/lab?x=1', '/lab#x', '/a/../b', '/%2f%2fevil']) {
    called = '';
    const result = await requestRuntime({ apiBase, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'configuration');
    assert.equal(called, '');
  }
});

test('default empty and slash bases preserve same-origin transport', async () => {
  for (const apiBase of ['', '/', '/lab', '/lab/']) {
    let request;
    const result = await requestRuntime({ apiBase, fetchImpl: async (url, options) => { request = { url, options }; return jsonResponse(); } });
    assert.equal(result.ok, true);
    assert.equal(request.url, apiBase.startsWith('/lab') ? '/lab/api/runtime' : '/api/runtime');
    assert.equal(request.options.mode, 'same-origin');
    assert.equal(request.options.credentials, 'same-origin');
  }
});

test('reviewed static HTTPS config uses CORS without browser credentials or extra headers', async () => {
  const priorWindow = globalThis.window;
  try {
    for (const apiBase of ['https://container-pulse-lab.chernichenkodmitriy.com', 'https://runtime.example.test/', 'https://runtime.example.test:8443/lab/']) {
      globalThis.window = { ContainerPulseConfig: Object.freeze({ apiBase }), location: { search: '?apiBase=https://untrusted.test' }, localStorage: { getItem() { throw Error('storage must not be consulted'); } } };
      let request;
      const result = await requestRuntime({ fetchImpl: async (url, options) => { request = { url, options }; return jsonResponse(); } });
      assert.equal(result.ok, true);
      assert.equal(request.url, apiBase.replace(/\/$/, '') + '/api/runtime');
      assert.equal(request.options.mode, 'cors');
      assert.equal(request.options.credentials, 'omit');
      assert.equal(request.options.redirect, 'error');
      assert.equal(request.options.cache, 'no-store');
      assert.deepEqual(request.options.headers, { Accept: 'application/json' });
      assert.equal(request.options.method, 'GET');
      assert.equal(Object.keys(request.options).sort().join(','), 'cache,credentials,headers,method,mode,redirect,signal');
    }
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test('rejects malformed and credential-bearing absolute API bases before any request', async () => {
  const invalid = [null, 42, {}, 'https://', 'https:///outside.test', 'https://user:secret@outside.test',
    'https://user@outside.test', 'https://outside.test?', 'https://outside.test#',
    'https://outside.test/?x=1', 'https://outside.test/#x', 'https://outside.test/a/../b',
    'https://outside.test/a/./b', 'https://outside.test/%2e%2e', 'https://outside.test//lab',
    'https://outside.test/\\lab', 'https://outside.test:99999', 'https://outside.test:bad',
    'https://outside.test/a b', ' https://outside.test', 'https://outside.test\n',
    'https://outside.test/\r', 'https://outside.test/\u2028', 'https://outside.test/\u2029',
    '//outside.test', 'javascript:alert(1)', 'http://outside.test', 'https://outside..test'];
  for (const apiBase of invalid) {
    let called = false;
    const result = await requestRuntime({ apiBase, fetchImpl: async () => { called = true; return jsonResponse(); } });
    assert.equal(result.kind, 'configuration', String(apiBase));
    assert.equal(called, false, String(apiBase));
  }
});

test('remote transport preserves status, validation, timeout and cancellation ownership', async () => {
  const apiBase = 'https://container-pulse-lab.chernichenkodmitriy.com';
  const http = await requestRuntime({ apiBase, fetchImpl: async () => new Response('PRIVATE', { status: 503 }) });
  assert.equal(http.kind, 'http'); assert.equal(http.status, 503);
  assert.doesNotMatch(JSON.stringify(http), /PRIVATE/);
  const invalid = await requestRuntime({ apiBase, fetchImpl: async () => jsonResponse({ ...metadata, hostname: '<unsafe>' }, 202) });
  assert.equal(invalid.kind, 'invalid-response'); assert.equal(invalid.status, 202);
  const timeout = await requestRuntime({ apiBase, timeoutMs: 12, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  assert.equal(timeout.kind, 'timeout'); assert.equal(timeout.status, 200);
  const controller = new AbortController(); let transportSignal;
  const pending = requestRuntime({ apiBase, signal: controller.signal, fetchImpl: (_url, options) => { transportSignal = options.signal; return new Promise(() => {}); } });
  controller.abort();
  assert.equal((await pending).kind, 'cancelled'); assert.equal(transportSignal.aborted, true);
  let called = false;
  assert.equal((await requestRuntime({ apiBase, signal: controller.signal, fetchImpl: async () => { called = true; return jsonResponse(); } })).kind, 'cancelled');
  assert.equal(called, false);
});

test('reads the configured browser apiBase at request time without import side effects', async () => {
  const priorWindow = globalThis.window;
  let accessed = false;
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, get() { accessed = true; throw Error('window accessed during import'); } });
    await import('../src/client.mjs?import-safety');
    assert.equal(accessed, false);
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { ContainerPulseConfig: { apiBase: '/pulse' } } });
    let called;
    await requestRuntime({ fetchImpl: async url => { called = url; return jsonResponse(); } });
    assert.equal(called, '/pulse/api/runtime');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: priorWindow });
  }
});

test('preserves received HTTP status for malformed JSON and invalid metadata', async () => {
  const malformed = await requestRuntime({ fetchImpl: async () => new Response('private body not JSON', { status: 200 }) });
  assert.equal(malformed.status, 200);
  assert.equal(malformed.kind, 'invalid-response');
  const invalid = await requestRuntime({ fetchImpl: async () => jsonResponse({ ...metadata, hostname: '' }, 202) });
  assert.equal(invalid.status, 202);
  assert.equal(invalid.metadata, undefined);
  assert.equal(invalid.kind, 'invalid-response');
  assert.doesNotMatch(JSON.stringify(malformed), /private body/);
});

test('never displays an HTTP error body or invents metadata on network failure', async () => {
  const http = await requestRuntime({ fetchImpl: async () => new Response('SENSITIVE ERROR', { status: 503 }) });
  assert.equal(http.status, 503);
  assert.equal(http.kind, 'http');
  assert.doesNotMatch(JSON.stringify(http), /SENSITIVE/);
  const network = await requestRuntime({ fetchImpl: async () => { throw Error('private network internals'); } });
  assert.equal(network.status, null);
  assert.equal(network.kind, 'network');
  assert.equal(network.metadata, undefined);
  assert.doesNotMatch(JSON.stringify(network), /private network internals/);
});

test('timeout is bounded even if transport ignores abort', async () => {
  let transportSignal;
  const result = await requestRuntime({ timeoutMs: 12, fetchImpl: (_url, { signal }) => { transportSignal = signal; return new Promise(() => {}); } });
  assert.equal(result.kind, 'timeout');
  assert.equal(result.status, null);
  assert.equal(transportSignal.aborted, true);
});

test('timeout includes body parsing and preserves the received HTTP status', async () => {
  const result = await requestRuntime({ timeoutMs: 12, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  assert.equal(result.kind, 'timeout');
  assert.equal(result.status, 200);
});

test('caller cancellation resolves safely even if transport ignores abort', async () => {
  const controller = new AbortController();
  const resultPromise = requestRuntime({ signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  controller.abort();
  const result = await resultPromise;
  assert.equal(result.kind, 'cancelled');
  assert.equal(result.metadata, undefined);
  let called = false;
  const alreadyCancelled = await requestRuntime({ signal: controller.signal, fetchImpl: async () => { called = true; return jsonResponse(); } });
  assert.equal(alreadyCancelled.kind, 'cancelled');
  assert.equal(called, false);
});

test('initial store has no fabricated runtime success and repeated checks are bounded', async () => {
  const pending = deferred(); let count = 0;
  const store = createDashboardStore({ request: () => { count++; return pending.promise; } });
  assert.equal(store.getSnapshot().latest, null);
  assert.equal(store.getSnapshot().successCount, 0);
  assert.deepEqual(store.getSnapshot().notifications, []);
  const first = store.check();
  await store.check();
  assert.equal(count, 1);
  assert.equal(store.getSnapshot().busy, true);
  pending.resolve(observed()); await first;
  assert.equal(store.getSnapshot().successCount, 1);
  assert.equal(store.getSnapshot().latest.hostname, 'replica-a');
});

test('records current-page identities, measured durations and bounded newest-first notifications', async () => {
  let n = 0;
  const store = createDashboardStore({ request: async () => observed(n++ % 2 ? 'replica-b' : 'replica-a') });
  for (let i = 0; i < 15; i++) await store.check();
  const state = store.getSnapshot();
  assert.equal(state.successCount, 15);
  assert.deepEqual(state.identities, ['replica-a', 'replica-b']);
  assert.equal(state.durationMs, 12.5);
  assert.equal(state.notifications.length, 12);
  assert.ok(state.notifications[0].id > state.notifications[11].id);
  assert.equal(state.notifications[0].hostname, 'replica-a');
  assert.equal(state.notifications[0].status, 200);
});

test('failure removes current runtime success and emits an honest visible failure', async () => {
  let fail = false;
  const store = createDashboardStore({ request: async () => fail ? ({ ok: false, kind: 'http', status: 503, durationMs: 18 }) : observed() });
  await store.check(); fail = true; await store.check();
  const state = store.getSnapshot();
  assert.equal(state.latest, null);
  assert.equal(state.phase, 'failed');
  assert.equal(state.successCount, 1);
  assert.equal(state.durationMs, 18);
  assert.equal(state.notifications[0].ok, false);
  assert.equal(state.notifications[0].status, 503);
  assert.doesNotMatch(state.message, /success|live|healthy/i);
});

test('Clear aborts work, resets observations and discards stale success ownership', async () => {
  const pending = deferred(); let signal;
  const store = createDashboardStore({ request: options => { signal = options.signal; return pending.promise; } });
  const inFlight = store.check();
  store.clear();
  assert.equal(signal.aborted, true);
  pending.resolve(observed('late-replica')); await inFlight;
  assert.equal(store.getSnapshot().latest, null);
  assert.equal(store.getSnapshot().phase, 'idle');
  assert.equal(store.getSnapshot().busy, false);
  assert.equal(store.getSnapshot().successCount, 0);
  assert.deepEqual(store.getSnapshot().identities, []);
  assert.deepEqual(store.getSnapshot().notifications, []);
});

test('a stale failure cannot overwrite a newer check after Clear', async () => {
  const old = deferred(); let count = 0;
  const store = createDashboardStore({ request: async () => count++ === 0 ? old.promise : observed('new-replica') });
  const oldCheck = store.check(); store.clear(); await store.check();
  old.resolve({ ok: false, kind: 'network', status: null, durationMs: 20 }); await oldCheck;
  assert.equal(store.getSnapshot().phase, 'success');
  assert.equal(store.getSnapshot().latest.hostname, 'new-replica');
  assert.equal(store.getSnapshot().notifications.length, 1);
  store.clear();
  assert.equal(store.getSnapshot().durationMs, null);
  assert.doesNotMatch(store.getSnapshot().message, /failed/i);
});

test('sample performs only six sequential checks and cannot overlap another run', async () => {
  const first = deferred(); let calls = 0;
  const store = createDashboardStore({ request: async () => ++calls === 1 ? first.promise : observed() });
  const sample = store.sample();
  assert.equal(store.getSnapshot().busy, true, 'sampling must own the pending request');
  await store.check(); await store.sample();
  assert.equal(calls, 1);
  first.resolve(observed()); await sample;
  assert.equal(calls, 6);
  assert.equal(store.getSnapshot().successCount, 6);
  assert.equal(store.getSnapshot().busy, false);
});

test('Clear cancels the remainder of a sample and discards its pending result', async () => {
  const first = deferred(); let calls = 0; let signal;
  const store = createDashboardStore({ request: options => { calls++; signal = options.signal; return first.promise; } });
  const sample = store.sample(); store.clear();
  assert.equal(signal?.aborted, true);
  first.resolve(observed()); await sample;
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().successCount, 0);
  assert.deepEqual(store.getSnapshot().notifications, []);
});

test('subscribers are notified, unsubscribe works and dispose cancels without stale updates', async () => {
  const pending = deferred(); let signal; let notifications = 0;
  const store = createDashboardStore({ request: options => { signal = options.signal; return pending.promise; } });
  const unsubscribe = store.subscribe(() => { notifications++; });
  const work = store.check(); assert.equal(notifications, 1);
  unsubscribe(); store.dispose(); assert.equal(signal.aborted, true);
  pending.resolve(observed()); await work;
  assert.equal(notifications, 1);
  assert.equal(store.getSnapshot().latest, null);
});
