#!/usr/bin/env node
/**
 * REAL hosted acceptance tests; never import a server adapter or mock a service.
 * Run deliberately, after deployment (NOT part of an offline test run):
 *   STYLESTORE_PRIVATE_CONFIG=/absolute/private/config.json node --test tests/live-api.mjs
 * Optional STYLESTORE_ALLOWED_ORIGIN is an exact configured UI origin; the default
 * matches supabase/functions/.env.example (http://localhost:8797).
 *
 * Runtime-only private JSON: { supabase_url, supabase_public_key, qa_sessions }.
 * qa_sessions must contain two distinct, unexpired Supabase Auth sessions, each
 * with access_token and user.id. Use dedicated, initially empty QA users. This
 * runner never signs up, refreshes sessions, reads DB credentials, or deletes an
 * order whose UUID it did not receive from one of its own create requests.
 * Only built-in Node modules and this project's read-only trusted catalog import.
 * No write retries: a lost create response is reported as uncertain, not retried.
 * Private input, user IDs, tokens, raw responses and headers are never printed.
 * Coverage is API-visible; it does NOT prove DB metadata, forced SQL rollback,
 * private-table cascade, a one-query Mongo read, or a controlled 503 outage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { CATALOG } from '../shared/catalog.mjs';

// Default acceptance always covers both engines. An explicit operator-only
// subset can verify one configured engine without disguising the other gate.
const ENGINES = (process.env.STYLESTORE_LIVE_ENGINES || 'sql,mongo').split(',').map(value => value.trim());
assert.ok(ENGINES.length > 0 && new Set(ENGINES).size === ENGINES.length && ENGINES.every(value => ['sql','mongo'].includes(value)), 'STYLESTORE_LIVE_ENGINES must select sql, mongo, or sql,mongo without duplicates.');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODES = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 404: 'NOT_FOUND', 409: 'CONFLICT', 503: 'UNAVAILABLE' };
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CONCURRENCY = 4;
const check = (condition, message) => assert.ok(Boolean(condition), message);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const equal = (actual, expected, message) => check(actual === expected, message);
const itemInput = (index = 0, quantity = 1) => ({ productId: CATALOG[index].id, quantity });

// Errors from JSON parsing, filesystem access, URL parsing or fetch are replaced
// rather than rethrown: their messages/cause may contain private values/paths.
async function loadRuntimeConfig() {
  const path = process.env.STYLESTORE_PRIVATE_CONFIG;
  check(typeof path === 'string' && path.length > 0, 'STYLESTORE_PRIVATE_CONFIG must name the runtime private JSON file.');
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Cannot read or parse STYLESTORE_PRIVATE_CONFIG; private details withheld.'); }
  check(isObject(config), 'Runtime config must be a JSON object.');
  let base;
  try { base = new URL(config.supabase_url); }
  catch { throw new Error('Runtime supabase_url must be a valid HTTPS project URL.'); }
  check(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash && base.pathname === '/',
    'Runtime supabase_url must be an HTTPS project origin, without credentials or a path.');
  const key = config.supabase_public_key;
  check(typeof key === 'string' && key.length > 0 && !key.startsWith('sb_secret_'), 'A public Supabase key is required; secret keys are forbidden.');
  if (!key.startsWith('sb_publishable_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new Error('Public key must be publishable or a legacy anon JWT.'); }
    equal(claims?.role, 'anon', 'Only a publishable key or legacy anon key is allowed.');
  }
  check(Array.isArray(config.qa_sessions) && config.qa_sessions.length === 2, 'Exactly two runtime QA sessions are required.');
  const sessions = config.qa_sessions.map(session => {
    check(isObject(session) && typeof session.access_token === 'string' && UUID.test(session.user?.id), 'Each QA session needs access_token and a valid user identity.');
    let claims;
    try { claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new Error('A QA access token is malformed; parent must supply fresh real sessions.'); }
    check(claims?.sub === session.user.id && claims?.role === 'authenticated' && Number.isFinite(claims?.exp), 'QA access tokens must identify their authenticated session users.');
    check(claims.exp * 1000 > Date.now() + 60000, 'QA session is expired or expires within one minute; parent must refresh separately.');
    return { token: session.access_token, userId: session.user.id, expiresAt: claims.exp * 1000 };
  });
  check(sessions[0].userId !== sessions[1].userId, 'Two distinct QA owners are required.');
  const origin = process.env.STYLESTORE_ALLOWED_ORIGIN || 'http://localhost:8797';
  let parsedOrigin;
  try { parsedOrigin = new URL(origin); }
  catch { throw new Error('STYLESTORE_ALLOWED_ORIGIN must be an exact configured HTTP(S) origin.'); }
  check(['http:', 'https:'].includes(parsedOrigin.protocol) && parsedOrigin.origin === origin, 'STYLESTORE_ALLOWED_ORIGIN must be an exact configured HTTP(S) origin.');
  return { base: base.origin, key, sessions, origin };
}

// A bounded worker pool waits for ALL in-flight writes, even after a failure,
// before finally-cleanup can run. It never retries any operation.
async function settlePool(values, action) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = { status: 'fulfilled', value: await action(values[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

function createClient(config, context) {
  async function request(url, { method = 'GET', body, rawBody, owner = 0, invalidAuth = false, origin, preflight = false, contentType = 'application/json', createsIn } = {}) {
    const headers = { apikey: config.key };
    if (owner !== null) {
      const session = config.sessions[owner];
      check(session.expiresAt > Date.now(), 'QA session expired during the run; refresh separately, including before any cleanup rerun.');
      headers.authorization = `Bearer ${invalidAuth ? 'invalid-qa-token' : session.token}`;
    }
    if (origin !== undefined) headers.origin = origin;
    if (preflight) {
      headers['access-control-request-method'] = 'POST';
      headers['access-control-request-headers'] = 'authorization, apikey, content-type';
    }
    const payload = rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) headers['content-type'] = contentType;
    let response, text;
    try {
      response = await fetch(url, { method, headers, body: payload, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const reader = response.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('response limit'); }
            chunks.push(part.value);
          }
        } finally { reader.releaseLock(); }
      }
      text = Buffer.concat(chunks).toString('utf8');
    } catch {
      if (createsIn) context.uncertainCreates++;
      throw new Error(createsIn
        ? 'Hosted create request failed, timed out, redirected, or exceeded response bounds; commit outcome UNKNOWN, no retry. Cleanup can only target returned IDs.'
        : 'Hosted request failed, timed out, redirected, or exceeded response bounds; private diagnostics withheld, no retry.');
    }
    let json = null;
    let parsed = true;
    if (text.length) {
      try { json = JSON.parse(text); }
      catch { parsed = false; }
    }
    if (createsIn && UUID.test(json?.data?.id)) {
      // Register BEFORE envelope/status/assertion checks, including unexpected
      // success from a payload that should have been rejected.
      context.created[createsIn].add(json.data.id);
    } else if (createsIn && response.ok && (response.status === 201 || json?.ok === true || json?.status === 201 || !parsed)) {
      context.uncertainCreates++;
    }
    return {
      status: response.status, json, parsed, empty: text.length === 0,
      corsOrigin: response.headers.get('access-control-allow-origin'),
      corsMethods: response.headers.get('access-control-allow-methods'),
      corsHeaders: response.headers.get('access-control-allow-headers'),
      corsCredentials: response.headers.get('access-control-allow-credentials'),
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      vary: response.headers.get('vary'),
    };
  }
  const api = (engine, path, options = {}) => {
    const { query, ...rest } = options;
    const suffix = query === undefined ? `engine=${engine}` : query;
    return request(`${config.base}/functions/v1/saved-orders${path}${suffix ? `?${suffix}` : ''}`, {
      ...rest, createsIn: rest.method === 'POST' && path === '/orders' ? engine : undefined,
    });
  };
  const rpc = (operation, { orderId = null, itemId = null, body = null, owner = 0 } = {}) => request(`${config.base}/rest/v1/rpc/ss_orders_api`, {
    method: 'POST', owner,
    body: { p_operation: operation, p_order_id: orderId, p_item_id: itemId, p_body: body },
    createsIn: operation === 'createOrder' ? 'sql' : undefined,
  });
  return { api, rpc, request };
}

function expectApi(response, status, engine) {
  equal(response.status, status, `Hosted API must return HTTP ${status} (received ${response.status}).`);
  check(response.parsed && /^application\/json(?:\s*;|$)/i.test(response.contentType || ''), 'Hosted API must return valid JSON with a JSON content type.');
  check((response.cacheControl || '').split(/\s*,\s*/).includes('no-store'), 'Hosted API responses must be no-store.');
  if (status >= 400) {
    check(hasKeys(response.json, ['ok', 'error']) && response.json.ok === false, 'Failure envelope must contain only ok:false and error.');
    check(hasKeys(response.json.error, ['code', 'message']), 'Failure detail must contain only code and message.');
    equal(response.json.error.code, ERROR_CODES[status], 'Failure code must match its HTTP status.');
    check(typeof response.json.error.message === 'string' && response.json.error.message.length > 0, 'Failure needs a safe nonempty message.');
    return null;
  }
  check(hasKeys(response.json, ['ok', 'engine', 'data']) && response.json.ok === true, 'Success envelope must contain only ok:true, engine and data.');
  equal(response.json.engine, engine, 'Response engine must match the selected dataset.');
  return response.json.data;
}

function expectRpc(response, status) {
  // Authenticated RPC validation errors are HTTP 200 JSON {status:400,data:null},
  // NOT HTTP 400; migration revokes anon EXECUTE, so no-auth is checked separately.
  equal(response.status, 200, `Authenticated RPC transport must return HTTP 200 (received ${response.status}).`);
  check(response.parsed && hasKeys(response.json, ['status', 'data']), 'RPC must return its status/data contract.');
  equal(response.json.status, status, `RPC logical status must be ${status}.`);
  if (status >= 400) equal(response.json.data, null, 'Denied RPC must not expose order data.');
  return response.json.data;
}

function expectOrder(order, label, expectedItems, context, { fresh = false } = {}) {
  check(hasKeys(order, ['id', 'label', 'items', 'totalCents', 'createdAt', 'updatedAt']), 'Aggregate must expose only public order fields.');
  check(UUID.test(order.id), 'Order ID must be a generated UUID.');
  equal(order.label, label, 'Aggregate label must match its normalized value.');
  check(Array.isArray(order.items) && order.items.length === expectedItems.length, 'Aggregate must contain the expected number of items.');
  check(Number.isFinite(Date.parse(order.createdAt)) && Number.isFinite(Date.parse(order.updatedAt)), 'Aggregate timestamps must be parseable.');
  check(Date.parse(order.updatedAt) >= Date.parse(order.createdAt), 'Updated timestamp must not precede creation.');
  const expected = new Map(expectedItems.map(item => [item.productId, item.quantity]));
  const localIds = new Set([order.id]);
  let total = 0;
  for (const item of order.items) {
    check(hasKeys(item, ['id', 'productId', 'name', 'unitPriceCents', 'quantity']), 'Item must expose only public trusted fields.');
    const product = CATALOG.find(entry => entry.id === item.productId);
    check(product && expected.has(item.productId), 'Item must refer to an expected catalog product.');
    check(UUID.test(item.id) && !localIds.has(item.id), 'Order and item UUIDs must be distinct.');
    localIds.add(item.id);
    equal(item.name, product.name, 'Item display name must come from the trusted catalog.');
    equal(item.unitPriceCents, product.unitPriceCents, 'Item price must come from the trusted integer-cent catalog.');
    equal(item.quantity, expected.get(item.productId), 'Item quantity must match the last successful mutation.');
    check(Number.isSafeInteger(item.unitPriceCents) && Number.isSafeInteger(item.quantity), 'Prices and quantities must be integers.');
    total += product.unitPriceCents * item.quantity;
    expected.delete(item.productId);
  }
  equal(expected.size, 0, 'No expected product may be omitted or duplicated.');
  equal(order.totalCents, total, 'Aggregate total must equal trusted unit-price cents times quantity.');
  if (fresh) {
    for (const id of localIds) {
      check(!context.seenIds.has(id), 'Fresh order/item IDs must be unique across this run and both engines.');
      context.seenIds.add(id);
    }
  }
  return order;
}

function expectSummaryList(list, orders) {
  check(Array.isArray(list) && list.length === orders.length, 'Summary list must have exactly the expected tracked orders.');
  const expected = new Map(orders.map(order => [order.id, order]));
  for (const summary of list) {
    check(hasKeys(summary, ['id', 'label', 'itemCount', 'totalCents', 'updatedAt']), 'List must expose summaries, not owner identity or item aggregates.');
    const order = expected.get(summary.id);
    check(order, 'Summary must belong to a known QA order.');
    equal(summary.label, order.label, 'Summary label must match the aggregate.');
    equal(summary.itemCount, order.items.length, 'Summary itemCount must count distinct line items.');
    equal(summary.totalCents, order.totalCents, 'Summary total must match the aggregate.');
    equal(summary.updatedAt, order.updatedAt, 'Summary updatedAt must match the aggregate.');
    expected.delete(summary.id);
  }
  equal(expected.size, 0, 'Summary list may not duplicate or omit a tracked order.');
}

test(`StyleStore REAL hosted API acceptance (dedicated QA users; ${ENGINES.join(' + ')})`, { timeout: 900000 }, async t => {
  t.diagnostic(ENGINES.length === 2 ? 'Full two-engine acceptance selected.' : `PARTIAL acceptance: only ${ENGINES[0]}; the other hosted engine and dataset-isolation gate are NOT verified by this run.`);
  const config = await loadRuntimeConfig();
  const context = { created: { sql: new Set(), mongo: new Set() }, seenIds: new Set(), uncertainCreates: 0 };
  const { api, rpc, request } = createClient(config, context);
  const runId = randomUUID();
  let labelCounter = 0;
  const label = () => `QA ${runId} ${++labelCounter}`;
  const createBody = (items = [itemInput(0, 2), itemInput(1, 1)], title = label()) => ({ label: title, items });
  const get = async (engine, id) => expectApi(await api(engine, `/orders/${id}`), 200, engine);
  const list = async (engine, owner = 0) => expectApi(await api(engine, '/orders', { owner }), 200, engine);
  const create = async (engine, body = createBody()) => {
    const order = expectApi(await api(engine, '/orders', { method: 'POST', body }), 201, engine);
    return expectOrder(order, body.label.trim(), body.items, context, { fresh: true });
  };
  const remove = async (engine, id) => {
    const data = expectApi(await api(engine, `/orders/${id}`, { method: 'DELETE' }), 200, engine);
    check(hasKeys(data, ['id', 'deleted']) && data.id === id && data.deleted === true, 'Delete must acknowledge exactly the target order.');
    expectApi(await api(engine, `/orders/${id}`), 404, engine);
    context.created[engine].delete(id);
  };
  // Stop dependent subtests after a failure, but ALWAYS enter finally-cleanup.
  const subtest = async (name, action) => {
    let failed = false;
    await t.test(name, async () => {
      try { await action(); }
      catch (error) { failed = true; throw error; }
    });
    if (failed) throw new Error('A hosted acceptance subtest failed; remaining dependent checks stopped, cleanup still runs.');
  };

  try {
    await subtest('real authenticated sessions and empty per-owner/per-engine safety baseline', async () => {
      for (let owner = 0; owner < config.sessions.length; owner++) {
        const result = await request(`${config.base}/auth/v1/user`, { owner });
        equal(result.status, 200, 'Real Auth verification failed; parent must refresh sessions separately if expired.');
        check(result.parsed && result.json?.id === config.sessions[owner].userId && result.json?.role === 'authenticated', 'Auth must independently verify each session identity.');
      }
      for (const engine of ENGINES) {
        for (const owner of [0, 1]) {
          const orders = await list(engine, owner);
          check(Array.isArray(orders) && orders.length === 0, 'QA owners must start empty in BOTH engines; existing orders are never deleted by this runner.');
        }
      }
    });

    await subtest('exact-origin unauthenticated preflight 204; near-match origin rejected 400', async () => {
      const response = await api('sql', '/orders', { method: 'OPTIONS', owner: null, origin: config.origin, preflight: true });
      equal(response.status, 204, 'Allowed-origin preflight must return HTTP 204.');
      check(response.empty, 'Preflight must not have a response body.');
      equal(response.corsOrigin, config.origin, 'Preflight must reflect only the exact allowlisted origin.');
      equal(response.corsCredentials, null, 'Preflight must not opt into cookie credentials.');
      const methods = (response.corsMethods || '').split(',').map(value => value.trim());
      const headers = (response.corsHeaders || '').toLowerCase().split(',').map(value => value.trim());
      check(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].every(value => methods.includes(value)), 'Preflight must allow all feature methods.');
      check(['authorization', 'apikey', 'content-type'].every(value => headers.includes(value)), 'Preflight must allow feature request headers.');
      check((response.vary || '').toLowerCase().split(',').map(value => value.trim()).includes('origin'), 'Preflight must vary by Origin.');
      // Origin + slash is intentionally NOT an exact origin (cannot be allowlisted).
      const blocked = await api('sql', '/orders', { method: 'OPTIONS', owner: null, origin: `${config.origin}/`, preflight: true });
      expectApi(blocked, 400, 'sql');
      equal(blocked.corsOrigin, null, 'Disallowed origin must not receive an allow-origin header.');
    });

    for (const engine of ENGINES) {
      await subtest(`${engine}: trusted catalog, auth 401, selectors/IDs/JSON/request-size 400`, async () => {
        const response = await api(engine, '/catalog', { origin: config.origin });
        const catalog = expectApi(response, 200, engine);
        equal(response.corsOrigin, config.origin, 'Authenticated response must reflect exact allowed origin.');
        check(Array.isArray(catalog) && catalog.length === CATALOG.length, 'Hosted catalog must contain the four trusted products.');
        for (const product of CATALOG) {
          const match = catalog.find(value => value.id === product.id);
          check(match && Object.keys(match).length === Object.keys(product).length && Object.keys(product).every(key => match[key] === product[key]), 'Hosted catalog must exactly match the reviewed trusted catalog.');
        }
        for (const path of ['/catalog', '/orders']) {
          expectApi(await api(engine, path, { owner: null }), 401, engine);
          expectApi(await api(engine, path, { invalidAuth: true }), 401, engine);
        }
        for (const query of ['engine=redis', 'engine=', `engine=${engine}&engine=${engine}`, 'engine=sql&engine=mongo', `engine=${engine}&ownerId=not-authority`]) {
          expectApi(await api(engine, '/orders', { query }), 400, engine);
        }
        for (const path of ['/orders/not-a-uuid', `/orders/${randomUUID()}/items/not-a-uuid`]) {
          expectApi(await api(engine, path, { method: path.includes('/items/') ? 'PATCH' : 'GET', ...(path.includes('/items/') ? { body: { quantity: 1 } } : {}) }), 400, engine);
        }
        expectApi(await api(engine, `/orders/${randomUUID()}`), 404, engine);
        expectApi(await api(engine, '/orders', { method: 'POST', rawBody: '{' }), 400, engine);
        // Valid JSON and valid UTF-8, but definitely over the 8192-byte limit.
        expectApi(await api(engine, '/orders', { method: 'POST', rawBody: JSON.stringify({ label: '😀'.repeat(2200), items: [itemInput()] }) }), 400, engine);
        expectApi(await api(engine, '/orders', { method: 'POST', body: createBody(), contentType: 'text/plain' }), 400, engine);
        expectSummaryList(await list(engine), []);
      });

      await subtest(`${engine}: full order/item CRUD, trusted totals, ownership denial and nonmutation`, async () => {
        const inputs = [itemInput(0, 2), itemInput(1, 1)];
        const body = createBody(inputs);
        let order = await create(engine, body);
        const id = order.id;
        const initialIds = new Map(order.items.map(item => [item.productId, item.id]));
        expectOrder(await get(engine, id), body.label, inputs, context);
        expectSummaryList(await list(engine), [order]);
        expectSummaryList(await list(engine, 1), []);
        const itemPath = `/orders/${id}/items/${order.items[0].id}`;
        for (const [path, method, payload] of [
          [`/orders/${id}`, 'GET'], [`/orders/${id}`, 'PATCH', { label: label() }], [`/orders/${id}`, 'DELETE'],
          [`/orders/${id}/items`, 'POST', itemInput(2)], [itemPath, 'PATCH', { quantity: 9 }], [itemPath, 'DELETE'],
        ]) {
          expectApi(await api(engine, path, { method, body: payload, owner: 1 }), 404, engine);
        }
        const unchanged = await get(engine, id);
        check(JSON.stringify(unchanged) === JSON.stringify(order), 'Other-owner denied requests must not change the aggregate.');
        const renamed = label();
        order = expectApi(await api(engine, `/orders/${id}`, { method: 'PATCH', body: { label: `  ${renamed}  ` } }), 200, engine);
        expectOrder(order, renamed, inputs, context);
        const addedInputs = [...inputs, itemInput(2, 3)];
        order = expectApi(await api(engine, `/orders/${id}/items`, { method: 'POST', body: itemInput(2, 3) }), 201, engine);
        expectOrder(order, renamed, addedInputs, context);
        const added = order.items.find(item => item.productId === CATALOG[2].id);
        check(!context.seenIds.has(added.id), 'Added item must receive a fresh UUID.');
        context.seenIds.add(added.id);
        for (const item of order.items.filter(item => initialIds.has(item.productId))) equal(item.id, initialIds.get(item.productId), 'Existing item UUIDs must survive rename/add.');
        expectApi(await api(engine, `/orders/${id}/items`, { method: 'POST', body: itemInput(2) }), 409, engine);
        expectApi(await api(engine, `/orders/${id}/items/${randomUUID()}`, { method: 'PATCH', body: { quantity: 1 } }), 404, engine);
        expectApi(await api(engine, `/orders/${id}/items/${randomUUID()}`, { method: 'DELETE' }), 404, engine);
        const changedInputs = [inputs[0], inputs[1], itemInput(2, 9)];
        order = expectApi(await api(engine, `/orders/${id}/items/${added.id}`, { method: 'PATCH', body: { quantity: 9 } }), 200, engine);
        expectOrder(order, renamed, changedInputs, context);
        equal(order.items.find(item => item.productId === CATALOG[2].id)?.id, added.id, 'Quantity mutation must preserve item UUID.');
        expectOrder(await get(engine, id), renamed, changedInputs, context);
        expectSummaryList(await list(engine), [order]);
        order = expectApi(await api(engine, `/orders/${id}/items/${added.id}`, { method: 'DELETE' }), 200, engine);
        expectOrder(order, renamed, inputs, context);
        expectApi(await api(engine, `/orders/${id}/items/${added.id}`, { method: 'DELETE' }), 404, engine);
        expectOrder(await get(engine, id), renamed, inputs, context);
        await remove(engine, id);
        expectApi(await api(engine, itemPath, { method: 'PATCH', body: { quantity: 1 } }), 404, engine);
        expectApi(await api(engine, `/orders/${id}`, { method: 'DELETE' }), 404, engine);
        expectSummaryList(await list(engine), []);
      });

      await subtest(`${engine}: label/quantity boundaries, operators, duplicate/unknown products and forbidden owner/price fields`, async () => {
        const fixture = await create(engine, createBody([itemInput(0)]));
        const id = fixture.id;
        const itemPath = `/orders/${id}/items/${fixture.items[0].id}`;
        const before = JSON.stringify(await get(engine, id));
        for (const invalidLabel of ['', '   ', '😀'.repeat(81)]) {
          expectApi(await api(engine, '/orders', { method: 'POST', body: createBody([itemInput()], invalidLabel) }), 400, engine);
          expectApi(await api(engine, `/orders/${id}`, { method: 'PATCH', body: { label: invalidLabel } }), 400, engine);
        }
        for (const quantity of [0, 10, 1.5, '2', { $gt: 0 }]) {
          expectApi(await api(engine, '/orders', { method: 'POST', body: createBody([itemInput(0, quantity)]) }), 400, engine);
          expectApi(await api(engine, `/orders/${id}/items`, { method: 'POST', body: itemInput(1, quantity) }), 400, engine);
          expectApi(await api(engine, itemPath, { method: 'PATCH', body: { quantity } }), 400, engine);
        }
        const invalidCreates = [
          createBody([]), createBody(Array.from({ length: 5 }, () => itemInput())),
          createBody([itemInput(), itemInput()]),
          createBody([itemInput(), { productId: 'unknown-qa-product', quantity: 1 }]),
          createBody([{ productId: { $ne: null }, quantity: 1 }]),
          { ...createBody(), ownerId: config.sessions[1].userId },
          { ...createBody(), unitPriceCents: 1 },
          createBody([{ ...itemInput(), unitPriceCents: 1 }]),
          createBody([{ ...itemInput(), ownerId: config.sessions[1].userId }]),
        ];
        for (const body of invalidCreates) expectApi(await api(engine, '/orders', { method: 'POST', body }), 400, engine);
        for (const body of [
          { productId: 'unknown-qa-product', quantity: 1 }, { productId: { $ne: null }, quantity: 1 },
          { ...itemInput(1), ownerId: config.sessions[1].userId }, { ...itemInput(1), unitPriceCents: 1 },
        ]) expectApi(await api(engine, `/orders/${id}/items`, { method: 'POST', body }), 400, engine);
        expectApi(await api(engine, `/orders/${id}`, { method: 'PATCH', body: { label: label(), ownerId: config.sessions[1].userId } }), 400, engine);
        expectApi(await api(engine, itemPath, { method: 'PATCH', body: { quantity: 2, unitPriceCents: 1 } }), 400, engine);
        equal(JSON.stringify(await get(engine, id)), before, 'All rejected mutations must leave the fixture unchanged.');
        expectSummaryList(await list(engine), [fixture]);
        const emojiLabel = '😀'.repeat(80);
        const boundary = await create(engine, createBody([itemInput(3, 9)], emojiLabel));
        expectOrder(await get(engine, boundary.id), emojiLabel, [itemInput(3, 9)], context);
        const renamed = expectApi(await api(engine, `/orders/${id}`, { method: 'PATCH', body: { label: emojiLabel } }), 200, engine);
        expectOrder(renamed, emojiLabel, [itemInput(0)], context);
        await remove(engine, boundary.id);
        await remove(engine, id);
        expectSummaryList(await list(engine), []);
      });
    }

    if (ENGINES.includes('sql')) await subtest('SQL RPC independently revalidates owner/price/quantity inputs and denies anon execution', async () => {
      expectRpc(await rpc('listOrders'), 200);
      const noAuth = await rpc('listOrders', { owner: null });
      check([401, 403].includes(noAuth.status), 'Anon RPC must be denied at the REST privilege boundary (HTTP 401/403).');
      check(noAuth.parsed && noAuth.json?.code === '42501', 'Anon RPC denial must be PostgreSQL insufficient_privilege, matching revoked EXECUTE.');
      for (const body of [
        { ...createBody(), ownerId: config.sessions[1].userId },
        createBody([itemInput(), { ...itemInput(1), unitPriceCents: 1 }]),
        createBody([itemInput(), { productId: 'unknown-qa-product', quantity: 1 }]),
        createBody([itemInput(), itemInput(1, { $gt: 0 })]),
      ]) expectRpc(await rpc('createOrder', { body }), 400);
      expectSummaryList(await list('sql'), []);
      const fixture = await create('sql');
      for (const [operation, options] of [
        ['getOrder', {}], ['renameOrder', { body: { label: label() } }], ['deleteOrder', {}],
        ['addItem', { body: itemInput(2) }],
        ['updateItem', { itemId: fixture.items[0].id, body: { quantity: 2 } }],
        ['deleteItem', { itemId: fixture.items[0].id }],
      ]) expectRpc(await rpc(operation, { orderId: fixture.id, owner: 1, ...options }), 404);
      expectRpc(await rpc('renameOrder', { orderId: fixture.id, body: { label: label(), ownerId: config.sessions[1].userId } }), 400);
      expectRpc(await rpc('addItem', { orderId: fixture.id, body: { ...itemInput(2), unitPriceCents: 1 } }), 400);
      expectRpc(await rpc('updateItem', { orderId: fixture.id, itemId: fixture.items[0].id, body: { quantity: 2, unitPriceCents: 1 } }), 400);
      equal(JSON.stringify(await get('sql', fixture.id)), JSON.stringify(fixture), 'Denied direct RPC calls must leave the API aggregate unchanged.');
      await remove('sql', fixture.id);
    });

    if (ENGINES.length === 2) await subtest('SQL and MongoDB datasets stay independent while both contain live orders', async () => {
      const sql = await create('sql');
      expectApi(await api('mongo', `/orders/${sql.id}`), 404, 'mongo');
      expectSummaryList(await list('mongo'), []);
      const mongo = await create('mongo');
      expectApi(await api('sql', `/orders/${mongo.id}`), 404, 'sql');
      expectSummaryList(await list('sql'), [sql]);
      expectSummaryList(await list('mongo'), [mongo]);
      const renamed = label();
      expectApi(await api('sql', `/orders/${sql.id}`, { method: 'PATCH', body: { label: renamed } }), 200, 'sql');
      equal(JSON.stringify(await get('mongo', mongo.id)), JSON.stringify(mongo), 'SQL mutation must not modify the MongoDB dataset.');
      await remove('sql', sql.id);
      expectOrder(await get('mongo', mongo.id), mongo.label, [itemInput(0, 2), itemInput(1)], context);
      await remove('mongo', mongo.id);
    });

    for (const engine of ENGINES) {
      await subtest(`${engine}: 12 concurrent creates (pool 4) admit exactly 10, deny 2, release quota on delete`, async () => {
        expectSummaryList(await list(engine), []);
        const bodies = Array.from({ length: 12 }, () => createBody([itemInput(1)]));
        const results = await settlePool(bodies, body => api(engine, '/orders', { method: 'POST', body }));
        check(results.every(result => result.status === 'fulfilled'), 'All 12 concurrent requests must complete; every returned create ID is still tracked for cleanup.');
        const responses = results.map(result => result.value);
        equal(responses.filter(response => response.status === 201).length, 10, 'Quota must admit exactly ten of twelve concurrent creates.');
        equal(responses.filter(response => response.status === 409).length, 2, 'Quota must reject exactly two concurrent creates with 409.');
        const admitted = [];
        for (let index = 0; index < responses.length; index++) {
          const response = responses[index];
          if (response.status === 201) admitted.push(expectOrder(expectApi(response, 201, engine), bodies[index].label, bodies[index].items, context, { fresh: true }));
          else expectApi(response, 409, engine);
        }
        expectSummaryList(await list(engine), admitted);
        expectSummaryList(await list(engine, 1), []);
        await remove(engine, admitted[0].id);
        const replacement = await create(engine, createBody([itemInput(2)]));
        expectSummaryList(await list(engine), [...admitted.slice(1), replacement]);
        // Avoid depending on another owner's quota, and leave no fixtures for
        // the next engine. Failure at any point still reaches final cleanup.
        for (const order of [...admitted.slice(1), replacement]) await remove(engine, order.id);
        expectSummaryList(await list(engine), []);
      });
    }
  } finally {
    await t.test('finally: delete ONLY this run\'s returned order IDs; verify each deletion; report unknown outcomes', async cleanupTest => {
      const pending = ENGINES.flatMap(engine => [...context.created[engine]].map(id => ({ engine, id })));
      const results = await settlePool(pending, async ({ engine, id }) => {
        // A previous delete may have committed before its response was lost.
        // Probe both QA principals for this EXACT returned ID: an unexpectedly
        // accepted owner-injection test must not leave an owner-2 fixture behind.
        // Never broaden scope to a list, an unreturned ID, or another account.
        for (const owner of [0, 1]) {
          const response = await api(engine, `/orders/${id}`, { method: 'DELETE', owner });
          if (response.status === 404) expectApi(response, 404, engine);
          else {
            const data = expectApi(response, 200, engine);
            check(hasKeys(data, ['id', 'deleted']) && data.id === id && data.deleted === true, 'Cleanup delete must acknowledge its exact tracked target.');
          }
          expectApi(await api(engine, `/orders/${id}`, { owner }), 404, engine);
        }
        context.created[engine].delete(id);
      });
      const failed = results.filter(result => result.status === 'rejected').length;
      const remaining = ENGINES.reduce((count, engine) => count + context.created[engine].size, 0);
      cleanupTest.diagnostic(`Cleanup: attempted=${pending.length}; verified=${pending.length - failed}; failed=${failed}; tracked_remaining=${remaining}; unknown_create_outcomes=${context.uncertainCreates}.`);
      check(failed === 0 && remaining === 0, 'Cleanup incomplete: some run-owned orders could not be verified absent; private IDs withheld.');
      check(context.uncertainCreates === 0, 'One or more create outcomes are UNKNOWN; no blind retry or deletion of unrecognized orders was attempted.');
    });
  }
});
