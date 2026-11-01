import test from 'node:test';
import assert from 'node:assert/strict';

// Unit transport injection only: these Responses do not demonstrate live Nginx.
const lib = await import('../src/client.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const quote = (quantity = 1, serverId = 'store-a') => ({serverId, product: {id: 'retro-sneakers', name: 'Retro Sneakers', unitPriceCents: 8500}, quantity, totalCents: 8500 * quantity, currency: 'USD'});
const response = (data = quote(), options = {}) => new Response(JSON.stringify(data), {status: 200, headers: {'Content-Type': 'application/json', 'X-Lab-Gateway': 'nginx'}, ...options});
function client(fetchImpl, options = {}) {
  assert.equal(typeof lib.createClient, 'function', 'createClient contract is implemented');
  return lib.createClient({fetchImpl, ...options});
}
function session(fetchImpl, options = {}) {
  assert.equal(typeof lib.createLabSession, 'function', 'createLabSession contract is implemented');
  return lib.createLabSession({client: client(fetchImpl, options), batchDelayMs: 1});
}
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const tick = () => new Promise(r => setTimeout(r, 0));
const rejectsCode = (promise, code, status = null) => assert.rejects(promise, error => error instanceof lib.LabError && error.code === code && error.status === status);

test('configuration defaults to same origin and accepts HTTPS / loopback only', () => {
  assert.equal(typeof lib.validateApiBase, 'function');
  assert.equal(lib.validateApiBase(undefined), '');
  assert.equal(lib.validateApiBase(''), '');
  assert.equal(lib.validateApiBase('https://lab.example/'), 'https://lab.example');
  for (const url of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080']) assert.equal(lib.validateApiBase(url), url);
  for (const url of [null, 42, '/proxy', '//lab.example', 'http://lab.example', 'https://user:pass@lab.example', 'https://lab.example/path', 'https://lab.example?x=1', 'https://lab.example#x', 'javascript:alert(1)', ' https://lab.example', 'http://localhost.attacker.example']) assert.throws(() => lib.validateApiBase(url), error => error.code === 'config');
});
test('requests use exact routes, bounded timeout, omit credentials and bypass cache', async () => {
  const calls = [];
  const api = client(async (url, options) => {calls.push({url, options}); return response(quote(3));}, {apiBase: 'https://lab.example/'});
  const result = await api.quote(3);
  assert.deepEqual(result.data, quote(3));
  assert.equal(result.status, 200);
  assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
  assert.equal(calls[0].url, 'https://lab.example/api/quote?quantity=3');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(lib.REQUEST_TIMEOUT_MS, 6000);
  assert.equal(lib.MAX_RESPONSE_BYTES, 16384);
});
test('all valid quantities and replica IDs are accepted', async () => {
  for (const id of ['store-a', 'store-b']) for (let q = 1; q <= 9; q++) assert.deepEqual((await client(async () => response(quote(q, id))).quote(q)).data, quote(q, id));
});
test('invalid quantities never reach transport', async () => {
  let calls = 0;
  const api = client(async () => {calls++; return response();});
  for (const q of [0, 10, 1.5, NaN, Infinity, '2', null]) await rejectsCode(api.quote(q), 'quantity');
  assert.equal(calls, 0);
});
for (const [name, mutate] of [
  ['unknown server', d => {d.serverId = 'store-c';}],
  ['injected server', d => {d.serverId = '<img onerror=alert(1)>'; }],
  ['wrong product ID', d => {d.product.id = 'other';}],
  ['wrong name', d => {d.product.name = 'Other';}],
  ['wrong price', d => {d.product.unitPriceCents = 1;}],
  ['string price', d => {d.product.unitPriceCents = '8500';}],
  ['wrong quantity', d => {d.quantity = 2;}],
  ['string quantity', d => {d.quantity = '1';}],
  ['wrong total', d => {d.totalCents = 0;}],
  ['fractional total', d => {d.totalCents = 8500.5;}],
  ['string total', d => {d.totalCents = '8500';}],
  ['wrong currency', d => {d.currency = 'EUR';}],
  ['missing product', d => {delete d.product;}],
]) test(`rejects ${name} before success`, async () => {const data = quote(); mutate(data); await rejectsCode(client(async () => response(data)).quote(1), 'payload', 200);});
for (const data of [null, [], 'HTML', 42, {}]) test(`rejects non-contract JSON ${JSON.stringify(data)}`, async () => rejectsCode(client(async () => response(data)).quote(1), 'payload', 200));
test('requires gateway marker', async () => {
  for (const marker of [undefined, 'other', 'NGINX']) await rejectsCode(client(async () => response(quote(), {headers: {'Content-Type': 'application/json', ...(marker ? {'X-Lab-Gateway': marker} : {})}})).quote(1), 'gateway', 200);
});
test('non-200 retains actual HTTP status without leaking body', async () => {
  for (const status of [201, 400, 502, 503]) {
    try {await client(async () => new Response('<secret>private error</secret>', {status})).quote(1); assert.fail('must reject');}
    catch (error) {assert.equal(error.code, 'http'); assert.equal(error.status, status); assert.ok(!error.message.includes('private'));}
  }
});
test('HTML, missing content-type and malformed JSON are rejected with status 200', async () => {
  for (const type of ['text/html', 'text/plain', '']) await rejectsCode(client(async () => new Response('<html>secret</html>', {headers: {'Content-Type': type, 'X-Lab-Gateway': 'nginx'}})).quote(1), 'content', 200);
  await rejectsCode(client(async () => new Response('{', {headers: {'Content-Type': 'application/json', 'X-Lab-Gateway': 'nginx'}})).quote(1), 'json', 200);
});
test('declared and streamed oversized bodies are bounded at 16 KiB', async () => {
  await rejectsCode(client(async () => response(quote(), {headers: {'Content-Type': 'application/json', 'X-Lab-Gateway': 'nginx', 'Content-Length': '16385'}})).quote(1), 'size', 200);
  let canceled = false;
  const stream = new ReadableStream({start(c) {c.enqueue(new Uint8Array(10000)); c.enqueue(new Uint8Array(10000));}, cancel() {canceled = true;}});
  await rejectsCode(client(async () => new Response(stream, {headers: {'Content-Type': 'application/json', 'X-Lab-Gateway': 'nginx'}})).quote(1), 'size', 200);
  assert.equal(canceled, true);
});
test('transport failure has safe typed text', async () => {
  try {await client(async () => {throw new Error('secret internal stack');}).quote(1); assert.fail('must reject');}
  catch (error) {assert.equal(error.code, 'network'); assert.equal(error.status, null); assert.ok(!error.message.includes('secret'));}
});
test('finite deadline settles even when transport ignores AbortSignal', async () => {
  await rejectsCode(client(() => new Promise(() => {}), {timeoutMs: 15}).quote(1), 'timeout');
});
test('finite deadline covers body reads and preserves received HTTP status', async () => {
  let canceled = false;
  const stream = new ReadableStream({cancel() {canceled = true;}});
  await rejectsCode(client(async () => new Response(stream, {headers: {'Content-Type': 'application/json', 'X-Lab-Gateway': 'nginx'}}), {timeoutMs: 15}).quote(1), 'timeout', 200);
  assert.equal(canceled, true);
});
test('external abort is honored even by uncooperative transport', async () => {
  const controller = new AbortController();
  const pending = client(() => new Promise(() => {})).quote(1, {signal: controller.signal});
  controller.abort();
  await rejectsCode(pending, 'aborted');
});
test('pre-abort never calls transport', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  await rejectsCode(client(async () => {calls++; return response();}).quote(1, {signal: controller.signal}), 'aborted');
  assert.equal(calls, 0);
});
test('pinned health requires correct server, status and gateway', async () => {
  for (const id of ['store-a', 'store-b']) {
    let path;
    const result = await client(async url => {path = url; return response({status: 'ok', serverId: id});}).health(id);
    assert.equal(path, `/api/health/${id}`); assert.equal(result.data.serverId, id);
  }
  for (const data of [{status: 'no', serverId: 'store-a'}, {status: 'ok', serverId: 'store-b'}, []]) await rejectsCode(client(async () => response(data)).health('store-a'), 'payload', 200);
  await rejectsCode(client(async () => response({status: 'ok', serverId: 'store-a'}, {headers: {'Content-Type': 'application/json'}})).health('store-a'), 'gateway', 200);
  await rejectsCode(client(async () => response()).health('../other'), 'replica');
});
test('idle session makes no automatic requests and health starts unknown', () => {
  let calls = 0; const lab = session(async () => {calls++; return response();});
  assert.equal(calls, 0); assert.equal(lab.getSnapshot().message, 'Not checked');
  assert.equal(lab.getSnapshot().health['store-a'].state, 'unknown');
  assert.equal(lab.getSnapshot().health['store-b'].state, 'unknown');
  assert.deepEqual(lab.getSnapshot().counts, {'store-a': 0, 'store-b': 0});
});
test('synchronous busy gate prevents rapid double submits and blocks quantity edits', async () => {
  const d = deferred(); let calls = 0;
  const lab = session(() => {calls++; return d.promise;});
  const first = lab.runQuotes(); const second = lab.runQuotes(); const health = lab.checkHealth();
  lab.setQuantity('3');
  assert.equal(lab.getSnapshot().quantity, '1'); assert.equal(lab.getSnapshot().busy, true);
  d.resolve(response()); await Promise.all([first, second, health]);
  assert.equal(calls, 1); assert.equal(lab.getSnapshot().counts['store-a'], 1);
});
test('only validated successful quotes count; failed HTTP keeps status in trail', async () => {
  let n = 0; const lab = session(async () => ++n === 1 ? response() : response({...quote(), totalCents: 0}));
  await lab.runQuotes(); await lab.runQuotes();
  const state = lab.getSnapshot();
  assert.deepEqual(state.counts, {'store-a': 1, 'store-b': 0}); assert.equal(state.failed, 1);
  assert.equal(state.quote, null); assert.equal(state.gatewayObserved, true);
  assert.equal(state.trail[0].status, 200); assert.equal(state.trail[0].serverId, null);
  assert.equal(state.lastServer, 'store-a');
  assert.equal(state.health['store-a'].state, 'unknown');
});
test('quantity change invalidates old quote without inventing a new total', async () => {
  const lab = session(async () => response()); await lab.runQuotes(); lab.setQuantity('2');
  assert.equal(lab.getSnapshot().quantity, '2'); assert.equal(lab.getSnapshot().quote, null);
  lab.setQuantity(''); await lab.runQuotes(); assert.equal(lab.getSnapshot().trail.length, 1);
});
test('batch sends ten serial requests, continues failures and caps recent trail at twenty', async () => {
  let active = 0, maxActive = 0, calls = 0;
  const lab = session(async () => {active++; maxActive = Math.max(maxActive, active); await tick(); active--; calls++; return calls % 4 === 0 ? response({}, {status: 503}) : response(quote(1, calls % 2 ? 'store-a' : 'store-b'));});
  await lab.runQuotes(10); await lab.runQuotes(10); await lab.runQuotes();
  const state = lab.getSnapshot();
  assert.equal(calls, 21); assert.equal(maxActive, 1); assert.equal(state.trail.length, 20);
  assert.equal(state.failed, 5); assert.equal(state.counts['store-a'] + state.counts['store-b'], 16);
  assert.equal(state.trail[0].number, 21); assert.equal(state.trail[0].requestId, 'quote-0021');
  assert.ok(state.trail.every(entry => Number.isFinite(entry.durationMs)));
});
test('health checks are independent observations with timestamps, never quote counts', async () => {
  const lab = session(async url => url.endsWith('store-a') ? response({status: 'ok', serverId: 'store-a'}) : response({}, {status: 502}));
  const work = lab.checkHealth(); assert.equal(lab.getSnapshot().health['store-a'].state, 'checking'); await work;
  const state = lab.getSnapshot();
  assert.equal(state.health['store-a'].state, 'healthy'); assert.equal(state.health['store-b'].state, 'unavailable');
  assert.ok(state.health['store-a'].checkedAt); assert.ok(state.health['store-b'].checkedAt);
  assert.deepEqual(state.counts, {'store-a': 0, 'store-b': 0}); assert.equal(state.failed, 0); assert.equal(state.trail.length, 0);
});
test('Clear resets observations, preserves quantity and invalidates ignored late completion', async () => {
  const d = deferred(); let calls = 0; const lab = session(() => ++calls === 1 ? Promise.resolve(response(quote(2))) : d.promise);
  lab.setQuantity('2'); await lab.runQuotes(); const old = lab.runQuotes(10); lab.clear(); d.resolve(response(quote(2))); await old; await tick();
  const state = lab.getSnapshot();
  assert.equal(state.quantity, '2'); assert.equal(state.quote, null); assert.equal(state.busy, false);
  assert.equal(state.gatewayObserved, false); assert.equal(state.lastServer, null); assert.equal(state.failed, 0);
  assert.deepEqual(state.counts, {'store-a': 0, 'store-b': 0}); assert.equal(state.trail.length, 0);
  assert.equal(state.health['store-a'].state, 'unknown'); assert.equal(state.message, 'Not checked'); assert.equal(calls, 2);
});
test('Clear cancels batch during inter-request delay', async () => {
  let calls = 0; const lab = session(async () => {calls++; return response();});
  const unsubscribe = lab.subscribe(() => {if (lab.getSnapshot().trail.length === 1) lab.clear();});
  await lab.runQuotes(10); unsubscribe(); assert.equal(calls, 1); assert.equal(lab.getSnapshot().trail.length, 0);
});
test('dispose aborts work and prevents late notifications', async () => {
  const d = deferred(); const lab = session(() => d.promise); let updates = 0;
  lab.subscribe(() => {updates++;}); const work = lab.runQuotes(); const before = updates; lab.dispose(); d.resolve(response()); await work;
  assert.equal(updates, before); assert.equal(lab.getSnapshot().quote, null);
});
test('invalid configuration is surfaced without any transport activity', async () => {
  let calls = 0;
  assert.equal(typeof lib.createLabSession, 'function');
  const lab = lib.createLabSession({apiBase: 'http://unsafe.example', fetchImpl: async () => {calls++; return response();}});
  assert.match(lab.getSnapshot().configError, /Configuration error/); await lab.runQuotes(); await lab.checkHealth();
  assert.equal(calls, 0); assert.equal(lab.getSnapshot().busy, false);
});
