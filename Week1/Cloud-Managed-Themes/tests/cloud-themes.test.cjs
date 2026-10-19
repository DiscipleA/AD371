'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
let core;
try { core = require('../theme-cloud.js'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const api = () => { assert.ok(core, 'Implementation missing'); return core; };
const ids = ['standard', 'playful-pop', 'raggedy-granite', 'glossy-marble', 'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'];
const record = () => ({ id: 'portfolio', default_theme: 'luminous-midnight', default_mode: 'dark', theme_order: [...ids].reverse() });
const connection = { projectUrl: 'https://iubbxotkeplkecdhuzke.supabase.co', publishableKey: 'sb_publishable_testfixture' };

test('installed theme allowlist stays complete', () => assert.deepEqual(api().THEME_IDS, ids));
test('valid database record is normalized', () => assert.deepEqual(api().normalizeSettings(record()), record()));
test('untrusted executable theme ID is rejected', () => assert.throws(() => api().normalizeSettings({ ...record(), default_theme: '../remote.js' }), /theme/i));
test('unknown mode is rejected', () => assert.throws(() => api().normalizeSettings({ ...record(), default_mode: 'automatic' }), /mode/i));
test('duplicate or missing theme order is rejected', () => assert.throws(() => api().normalizeSettings({ ...record(), theme_order: Array(7).fill('standard') }), /order/i));
test('unknown order ID is rejected', () => assert.throws(() => api().normalizeSettings({ ...record(), theme_order: [...ids.slice(1), 'foreign-theme'] }), /order/i));
test('null settings is rejected', () => assert.throws(() => api().normalizeSettings(null), /configuration/i));
test('wrong configuration identity is rejected', () => assert.throws(() => api().normalizeSettings({ ...record(), id: 'another-site' }), /configuration/i));
test('new visitor receives cloud defaults', () => assert.deepEqual(api().resolvePreferences(record(), {}), { mode: 'dark', styleTheme: 'luminous-midnight' }));
test('saved choices override cloud defaults', () => assert.deepEqual(api().resolvePreferences(record(), { mode: 'light', styleTheme: 'baroque-plexiglas' }), { mode: 'light', styleTheme: 'baroque-plexiglas' }));
test('saved mode is independent from cloud family', () => assert.deepEqual(api().resolvePreferences(record(), { mode: 'light' }), { mode: 'light', styleTheme: 'luminous-midnight' }));
test('saved family is independent from cloud mode', () => assert.deepEqual(api().resolvePreferences(record(), { styleTheme: 'standard' }), { mode: 'dark', styleTheme: 'standard' }));
test('invalid saved values fall back', () => assert.deepEqual(api().resolvePreferences(record(), { mode: 'bad', styleTheme: 'bad' }), { mode: 'dark', styleTheme: 'luminous-midnight' }));
test('secret key is never accepted for browser requests', async () => await assert.rejects(api().readRemote(async () => { throw Error('must not call'); }, { ...connection, publishableKey: 'sb_secret_never_use' }), /publishable/i));
test('untrusted endpoint is rejected before fetch', async () => await assert.rejects(api().readRemote(async () => { throw Error('must not call'); }, { ...connection, projectUrl: 'https://evil.example' }), /project URL/i));
test('API fetch uses read-only GET, apikey header, and exact table', async () => {
  let call;
  const result = await api().readRemote(async (url, options) => {
    call = { url, options };
    return { ok: true, status: 200, json: async () => [record()] };
  }, connection);
  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.settings, record());
  assert.match(call.url, /\/rest\/v1\/portfolio_theme_settings\?/);
  assert.equal(call.options.method, 'GET');
  assert.equal(call.options.headers.apikey, connection.publishableKey);
  assert.equal(call.options.headers.Authorization, undefined);
});
test('HTTP failure cannot claim connection success', async () => await assert.rejects(api().readRemote(async () => ({ ok: false, status: 503 }), connection), /503/));
test('empty result is rejected rather than fabricated', async () => await assert.rejects(api().readRemote(async () => ({ ok: true, status: 200, json: async () => [] }), connection), /one configuration/i));
test('duplicate configuration rows are rejected', async () => await assert.rejects(api().readRemote(async () => ({ ok: true, status: 200, json: async () => [record(), record()] }), connection), /one configuration/i));
test('network failure is propagated for fallback handling', async () => await assert.rejects(api().readRemote(async () => { throw Error('offline'); }, connection), /offline/));
