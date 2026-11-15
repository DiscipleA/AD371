#!/usr/bin/env node
/**
 * DELIBERATE REAL hosted storage acceptance; not part of the offline test suite.
 * Node 22 built-ins plus the project's actual adapters and an externally installed
 * driver. No configuration is read until main() executes.
 *
 * STYLESTORE_PRIVATE_CONFIG: private runtime JSON containing pg_host, pg_user,
 * pg_port, pg_database, supabase_db_password, mongo_app_uri, mongodb_db,
 * qa_sessions:[{user:{id}}, {user:{id}}]. Never commit that file.
 * STYLESTORE_MONGO_DRIVER: absolute path to mongodb/lib/index.js.
 * PSQL_BIN: optional executable path/name, default psql. SQL is sent on stdin:
 * snap-packaged psql cannot necessarily read the project's Desktop path.
 *
 * Requires two dedicated, initially empty, existing QA owners. No auth users are
 * created/deleted. SQL changes use one BEGIN/ROLLBACK. Mongo cleanup only targets
 * this process's preallocated order IDs AND their exact owner, via the real
 * adapter. Zero-count cap documents are retained per the application contract.
 * No raw driver errors, psql output, credentials, user IDs, or URIs are printed.
 * Controlled failures are explicitly labeled; they are NOT an outage simulation.
 */
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMongoAdapter } from '../supabase/functions/saved-orders/mongo.mjs';
import { createLazyMongo } from '../supabase/functions/saved-orders/runtime.mjs';
import { ORDERS_VALIDATOR, CAPS_VALIDATOR } from '../supabase/mongo/bootstrap.mjs';
import { CATALOG } from '../shared/catalog.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TX = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000, timeoutMS: 15000 };
const OPT = { maxTimeMS: 10000 };
class SafeFailure extends Error {}
function check(condition, message) { if (!condition) throw new SafeFailure(message); }
function equal(actual, expected, message) { check(actual === expected, message); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function same(actual, expected, message) { equal(JSON.stringify(canonical(actual)), JSON.stringify(canonical(expected)), message); }
const item = (index = 0, quantity = 1) => ({ productId: CATALOG[index].id, quantity });
const body = label => ({ label, items: [item()] });

async function loadConfig() {
  const path = process.env.STYLESTORE_PRIVATE_CONFIG;
  const driver = process.env.STYLESTORE_MONGO_DRIVER;
  check(typeof path === 'string' && isAbsolute(path), 'STYLESTORE_PRIVATE_CONFIG must name an absolute runtime private JSON path.');
  check(typeof driver === 'string' && isAbsolute(driver) && driver.endsWith('/mongodb/lib/index.js'),
    'STYLESTORE_MONGO_DRIVER must name an absolute mongodb/lib/index.js path.');
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new SafeFailure('Runtime private JSON could not be read/parsed; details withheld.'); }
  check(config && typeof config === 'object' && !Array.isArray(config), 'Runtime config must be an object.');
  for (const key of ['pg_host', 'pg_user', 'pg_database', 'supabase_db_password', 'mongo_app_uri', 'mongodb_db']) {
    check(typeof config[key] === 'string' && config[key].length > 0 && !/[\r\n\0]/.test(config[key]), 'Required runtime storage fields are absent or malformed.');
  }
  check(/^\d{1,5}$/.test(String(config.pg_port)) && Number(config.pg_port) > 0 && Number(config.pg_port) <= 65535,
    'Runtime PostgreSQL port is invalid.');
  equal(config.pg_database, 'postgres', 'Only the approved Supabase postgres database is allowed.');
  equal(config.mongodb_db, 'stylestore_saved_orders', 'Only the isolated stylestore_saved_orders Mongo database is allowed.');
  check(/^mongodb(?:\+srv)?:\/\//.test(config.mongo_app_uri), 'Runtime Mongo URI has an invalid scheme.');
  check(Array.isArray(config.qa_sessions) && config.qa_sessions.length === 2, 'Exactly two existing QA sessions are required.');
  const owners = config.qa_sessions.map(session => session?.user?.id);
  check(owners.every(owner => UUID.test(owner)) && owners[0] !== owners[1], 'Two valid, distinct QA owner UUIDs are required.');
  // Do not retain or inspect access tokens. They are irrelevant to direct storage.
  return { pgHost: config.pg_host, pgUser: config.pg_user, pgPort: String(config.pg_port), pgDatabase: config.pg_database,
    pgPassword: config.supabase_db_password, mongoUri: config.mongo_app_uri, mongoDatabase: config.mongodb_db, driver, owners };
}

function runPsql(config, source) {
  const env = { ...process.env };
  delete env.LD_PRELOAD;
  // Inherited PGOPTIONS/service/passfile settings must not redirect this target,
  // disable TLS, introduce SQL logging, or read a different private config file.
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env, { PGHOST: config.pgHost, PGUSER: config.pgUser, PGPORT: config.pgPort, PGDATABASE: config.pgDatabase,
    PGPASSWORD: config.pgPassword, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'stylestore-storage-qa' });
  let result;
  try {
    result = spawnSync(process.env.PSQL_BIN || 'psql', ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
      { input: source, encoding: 'utf8', env, timeout: 180000, maxBuffer: 2 * 1024 * 1024, shell: false });
  } catch { throw new SafeFailure('PostgreSQL client could not start; private details withheld.'); }
  if (result.error || result.status !== 0) {
    // SQL error CONTEXT can contain the substituted owner IDs or full query.
    // Sanitize UUIDs, then extract ONLY an assertion tag written by this file.
    // Never emit stderr/stdout (even sanitized), an executable path, or a query.
    const sanitized = String(result.stderr || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[uuid]');
    const tag = sanitized.match(/SS_QA_ASSERT:([a-z_]{1,80})\b/)?.[1];
    throw new SafeFailure(`PostgreSQL acceptance failed${tag ? ` (${tag})` : ''}; private diagnostics withheld.`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

const SQL_SNAPSHOT = `
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
  'database',current_database(),
  'orders',(SELECT count(*) FROM ss_private.orders),
  'items',(SELECT count(*) FROM ss_private.order_items),
  'orderDigest',(SELECT md5(coalesce(string_agg(to_jsonb(o)::text,E'\\n' ORDER BY o.id),'')) FROM ss_private.orders o),
  'itemDigest',(SELECT md5(coalesce(string_agg(to_jsonb(i)::text,E'\\n' ORDER BY i.id),'')) FROM ss_private.order_items i),
  'catalogDigest',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,E'\\n' ORDER BY p.id),'')) FROM ss_private.products p),
  'qaFaultObjects',(SELECT count(*) FROM pg_proc p WHERE p.pronamespace='ss_private'::regnamespace AND p.proname='ss_qa_storage_reject_item')
     +(SELECT count(*) FROM pg_trigger WHERE tgrelid='ss_private.order_items'::regclass AND tgname='ss_qa_storage_reject_item')
);
ROLLBACK;
`;
function sqlSnapshot(config) {
  let parsed;
  try { parsed = JSON.parse(runPsql(config, SQL_SNAPSHOT).stdout.trim()); }
  catch (error) { if (error instanceof SafeFailure) throw error; throw new SafeFailure('PostgreSQL read-only baseline was not valid JSON.'); }
  equal(parsed.database, config.pgDatabase, 'PostgreSQL connection resolved to an unapproved database.');
  equal(parsed.qaFaultObjects, 0, 'Preexisting QA fault objects require manual review; nothing may be replaced.');
  return parsed;
}
async function runSql(config) {
  let template;
  try { template = await readFile(new URL('./live-sql.sql', import.meta.url), 'utf8'); }
  catch { throw new SafeFailure('Cannot read the SQL acceptance template.'); }
  check(template.includes('__OWNER_A__') && template.includes('__OWNER_B__'), 'SQL owner placeholders are missing.');
  const source = template.replaceAll('__OWNER_A__', config.owners[0]).replaceAll('__OWNER_B__', config.owners[1]);
  const before = sqlSnapshot(config);
  let failure;
  try {
    const result = runPsql(config, source);
    check(/^NOTICE:\s+SS_QA_SQL_PASSED\s*$/m.test(result.stderr), 'PostgreSQL did not emit its acceptance sentinel.');
  } catch (error) { failure = error; }
  // Check after ROLLBACK, in a new connection, even if the assertion run failed.
  const after = sqlSnapshot(config);
  same(after, before, 'PostgreSQL post-ROLLBACK counts/digests or fault objects changed; investigate without deleting unknown data.');
  if (failure) throw failure;
  console.log('PASS REAL SQL: FK rejection/cascade, indexes/RLS/grants/catalog, direct RPC auth/CRUD/boundaries/quota; post-ROLLBACK baseline unchanged.');
  console.log('PASS CONTROLLED fault on REAL SQL: second-child trigger rejection returned 503; parent and first child rolled back; fault DDL rolled back.');
}

async function expectStatus(action, status, message) {
  try { const result = await action(); equal(result.status, status, message); return result; }
  catch (error) {
    if (error instanceof SafeFailure) throw error;
    equal(error?.status, status, message);
    check(status >= 400, message);
    return null;
  }
}
async function expectMongoCode(action, code, message) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  equal(caught?.code, code, message);
}
async function transaction(client, action) {
  const session = client.startSession();
  try { return await session.withTransaction(() => action(session), TX); }
  finally { await session.endSession(); }
}
async function rejectedInsert(client, orders, document, expectedCode, message) {
  await expectMongoCode(() => transaction(client, async session => {
    await orders.insertOne(document, { ...OPT, session });
    // Abort even if a broken validator/index accepted the document. Never leave
    // a successful malformed direct write or a quota-inconsistent record behind.
    throw new SafeFailure('A direct insert unexpectedly succeeded; its transaction was aborted.');
  }), expectedCode, message);
}

async function verifyMongoSchema(db) {
  equal(db.databaseName, 'stylestore_saved_orders', 'Mongo resolved to an unapproved database.');
  const collections = await db.listCollections({}, { nameOnly: false, ...OPT }).toArray();
  for (const [name, validator] of [['orders', ORDERS_VALIDATOR], ['ss_owner_caps', CAPS_VALIDATOR]]) {
    const info = collections.find(entry => entry.name === name);
    check(info?.type === 'collection', 'Approved Mongo collections are missing or are views.');
    equal(info.options?.validationLevel, 'strict', 'Mongo validators must use strict validation.');
    equal(info.options?.validationAction, 'error', 'Mongo validators must reject invalid writes.');
    same(info.options?.validator, validator, 'Mongo validator differs from the approved bootstrap; refusing writes.');
  }
  const indexes = await db.collection('orders').listIndexes(OPT).toArray();
  for (const [name, key, unique] of [
    ['orders_id_unique', { id: 1 }, true], ['orders_owner_id_unique', { ownerId: 1, id: 1 }, true],
    ['orders_owner_updated', { ownerId: 1, updatedAt: -1, id: 1 }, false],
  ]) {
    const index = indexes.find(entry => entry.name === name);
    check(Boolean(index) && Boolean(index.unique) === unique && !index.sparse && !index.partialFilterExpression && !index.hidden,
      'Required Mongo indexes must be active, complete, and have approved uniqueness.');
    // Field order matters in compound indexes; unlike validators, do not sort.
    equal(JSON.stringify(index.key), JSON.stringify(key), 'A Mongo index has the wrong field order.');
  }
  const capIndexes = await db.collection('ss_owner_caps').listIndexes(OPT).toArray();
  check(capIndexes.some(index => index.name === '_id_' && JSON.stringify(index.key) === '{"_id":1}'), 'Mongo cap primary index is missing.');
}

async function runMongo(config) {
  let client, db, orders, caps, schemaApproved = false, cleanupReady = false;
  const tracked = new Map();
  const commands = [];
  let initialOrderCount;
  const owners = config.owners;
  let failure, cleanupFailure = false;
  try {
    let module;
    try { module = await import(pathToFileURL(config.driver).href); }
    catch { throw new SafeFailure('External Mongo driver could not be imported; private path withheld.'); }
    const MongoClient = module.MongoClient || module.default?.MongoClient;
    check(typeof MongoClient === 'function', 'External module does not export MongoClient.');
    // This is the REAL driver, not a fake. Capture its instance for unconditional
    // finally-close, including when a later prerequisite/connection fails.
    class CapturedMongoClient extends MongoClient {
      constructor(uri, options) {
        super(uri, { ...options, monitorCommands: true }); client = this;
        this.on('commandStarted', event => {
          if (event.databaseName === config.mongoDatabase) commands.push(event.commandName);
        });
      }
    }
    const getMongo = createLazyMongo({ MongoClient: CapturedMongoClient, uri: config.mongoUri, database: config.mongoDatabase });
    ({ db } = await getMongo());
    equal((await getMongo()).client, client, 'The actual lazy Mongo provider must reuse its connection.');
    await verifyMongoSchema(db);
    schemaApproved = true;
    orders = db.collection('orders'); caps = db.collection('ss_owner_caps');
    initialOrderCount = await orders.countDocuments({}, OPT);
    for (const owner of owners) {
      equal(await orders.countDocuments({ ownerId: owner }, OPT), 0, 'Mongo QA owners must start empty; unknown records are never deleted.');
      const cap = await caps.findOne({ _id: owner }, OPT);
      check(cap === null || cap.count === 0, 'An existing QA counter is inconsistent; refusing to reconcile unknown data.');
    }
    cleanupReady = true;
    const adapter = createMongoAdapter({ getMongo });
    const execute = (op, ownerId = owners[0], extra = {}) => adapter.execute({ op, ownerId, ...extra });
    async function create(ownerId, label) {
      const id = randomUUID();
      equal(await orders.countDocuments({ id }, OPT), 0, 'A preallocated QA ID already exists; refusing to touch it.');
      tracked.set(id, ownerId); // Track BEFORE the write, including uncertain outcomes.
      let first = true;
      const creator = createMongoAdapter({ getMongo, uuid: () => {
        if (first) { first = false; return id; }
        return randomUUID();
      } });
      return creator.execute({ op: 'createOrder', ownerId, body: body(label) });
    }
    const created = await create(owners[0], 'QA real Mongo storage');
    equal(created.status, 201, 'Mongo real create must return 201.');
    const id = created.data.id, firstItem = created.data.items[0].id;
    check(tracked.get(id) === owners[0], 'Mongo returned an unexpected generated order ID.');
    let raw = await orders.findOne({ id, ownerId: owners[0] }, OPT);
    check(raw && raw.label === 'QA real Mongo storage' && raw.items.length === 1, 'Mongo create was not persisted as an embedded order.');
    equal(raw.items[0].unitPriceCents, CATALOG[0].unitPriceCents, 'Persisted Mongo price is not canonical.');
    equal((await caps.findOne({ _id: owners[0] }, OPT))?.count, 1, 'Mongo create did not atomically reserve its counter.');
    check(!Object.hasOwn(created.data, 'ownerId') && !Object.hasOwn(created.data, '_id'), 'Mongo adapter leaks private storage fields.');
    const beforeRead = commands.length;
    await expectStatus(() => execute('getOrder', owners[0], { orderId: id }), 200, 'Mongo persisted get failed.');
    same(commands.slice(beforeRead), ['find'], 'Real Mongo aggregate read must issue exactly one find command without collection joins.');
    const list = await execute('listOrders');
    equal(list.data.length, 1, 'Mongo owner list does not reflect persisted create.');
    same((await execute('listOrders', owners[1])).data, [], 'Mongo list leaked another owner.');
    for (const [op, extra] of [
      ['getOrder', {}], ['renameOrder', { body: { label: 'stolen' } }], ['deleteOrder', {}],
      ['addItem', { body: item(1) }], ['updateItem', { itemId: firstItem, body: { quantity: 9 } }],
      ['deleteItem', { itemId: firstItem }],
    ]) await expectStatus(() => execute(op, owners[1], { orderId: id, ...extra }), 404, 'Mongo owner-qualified operation must reject another owner.');
    raw = await orders.findOne({ id, ownerId: owners[0] }, OPT);
    equal(raw.label, 'QA real Mongo storage', 'Denied Mongo rename changed persisted state.');
    equal(raw.items[0].quantity, 1, 'Denied Mongo item write changed persisted state.');

    await expectStatus(() => execute('renameOrder', owners[0], { orderId: id, body: { label: '  QA atomic rename  ' } }), 200, 'Mongo atomic label set failed.');
    equal((await orders.findOne({ id, ownerId: owners[0] }, OPT))?.label, 'QA atomic rename', 'Mongo label set/trim was not persisted.');
    // Several real simultaneous pushes of one product: exactly one may win.
    const pushes = await Promise.allSettled(Array.from({ length: 4 }, () => execute('addItem', owners[0], { orderId: id, body: item(1, 2) })));
    equal(pushes.filter(result => result.status === 'fulfilled' && result.value.status === 201).length, 1, 'Mongo atomic push must have exactly one winner.');
    equal(pushes.filter(result => result.status === 'rejected' && result.reason?.status === 409).length, 3, 'Mongo duplicate concurrent pushes must conflict.');
    raw = await orders.findOne({ id, ownerId: owners[0] }, OPT);
    equal(raw.items.filter(entry => entry.productId === CATALOG[1].id).length, 1, 'Mongo persisted duplicate product despite atomic filter.');
    const secondItem = raw.items.find(entry => entry.productId === CATALOG[1].id).id;
    await expectStatus(() => execute('updateItem', owners[0], { orderId: id, itemId: secondItem, body: { quantity: 9 } }), 200, 'Mongo array-filter quantity set failed.');
    raw = await orders.findOne({ id, ownerId: owners[0] }, OPT);
    equal(raw.items.find(entry => entry.id === secondItem)?.quantity, 9, 'Mongo positional set was not persisted.');
    equal(raw.items.find(entry => entry.id === firstItem)?.quantity, 1, 'Mongo positional set changed the wrong embedded item.');
    const aggregate = await orders.aggregate([
      { $match: { id, ownerId: owners[0] } },
      { $project: { _id: 0, itemCount: { $size: '$items' }, total: { $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.quantity', '$$i.unitPriceCents'] } } } } } },
    ], OPT).toArray();
    same(aggregate, [{ itemCount: 2, total: CATALOG[0].unitPriceCents + 9 * CATALOG[1].unitPriceCents }], 'Real Mongo aggregation disagrees with stored line totals.');
    const fetched = await execute('getOrder', owners[0], { orderId: id });
    equal(fetched.data.totalCents, aggregate[0].total, 'Mongo adapter total disagrees with real database aggregate.');
    await expectStatus(() => execute('deleteItem', owners[0], { orderId: id, itemId: secondItem }), 200, 'Mongo atomic pull failed.');
    raw = await orders.findOne({ id, ownerId: owners[0] }, OPT);
    equal(raw.items.length, 1, 'Mongo embedded pull did not persist.');
    equal(raw.items[0].id, firstItem, 'Mongo embedded pull removed the wrong item.');
    await expectStatus(() => execute('deleteItem', owners[0], { orderId: id, itemId: secondItem }), 404, 'Mongo deleting an absent embedded item must return 404.');

    // REAL direct database validator/index enforcement. All direct probes are
    // enclosed in transactions and explicitly abort even on unexpected success.
    const fresh = () => { const copy = structuredClone(raw); delete copy._id; copy.id = randomUUID(); return copy; };
    const invalidDocuments = [];
    let invalid = fresh(); invalid.items[0].quantity = 10; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items[0].quantity = 1.5; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items[0].unitPriceCents = 1; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items[0].name = 'forged'; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items[0].productId = 'absent'; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items.push({ ...invalid.items[0], id: randomUUID() }); invalidDocuments.push(invalid);
    invalid = fresh(); invalid.items = Array.from({ length: 5 }, () => ({ ...invalid.items[0], id: randomUUID() })); invalidDocuments.push(invalid);
    invalid = fresh(); invalid.label = ' untrimmed '; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.label = 'a'.repeat(81); invalidDocuments.push(invalid);
    invalid = fresh(); invalid.label = 'control\ncharacter'; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.ownerId = 'not-a-uuid'; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.createdAt = 'not-an-iso-timestamp'; invalidDocuments.push(invalid);
    invalid = fresh(); invalid.unapprovedField = true; invalidDocuments.push(invalid);
    for (const document of invalidDocuments) {
      await rejectedInsert(client, orders, document, 121, 'Real Mongo validator did not reject a malformed direct insert with code 121.');
      equal(await orders.countDocuments({ id: document.id, ownerId: owners[0] }, OPT), 0, 'A rejected Mongo validator probe persisted a record.');
    }
    const duplicate = structuredClone(raw); delete duplicate._id;
    await rejectedInsert(client, orders, duplicate, 11000, 'Real Mongo unique index did not reject a duplicate order ID.');
    await expectMongoCode(() => transaction(client, async session => {
      await caps.updateOne({ _id: owners[0] }, { $set: { count: 11 } }, { ...OPT, session });
      throw new SafeFailure('Counter validator unexpectedly accepted count 11; transaction aborted.');
    }), 121, 'Real Mongo counter validator did not reject count 11 with code 121.');

    // CONTROLLED invalid child document, REAL multi-document transaction: reserve
    // a cap slot first, then hit actual strict validator rejection on insert.
    // This proves driver/database rollback, not an adapter 503/outage response.
    const countBefore = await orders.countDocuments({ ownerId: owners[0] }, OPT);
    const capBefore = (await caps.findOne({ _id: owners[0] }, OPT)).count;
    const rejected = fresh(); rejected.items[0].quantity = 10;
    let reservationReached = false;
    await expectMongoCode(() => transaction(client, async session => {
      const changed = await caps.updateOne({ _id: owners[0], count: capBefore }, { $inc: { count: 1 } }, { ...OPT, session });
      equal(changed.matchedCount, 1, 'Controlled Mongo rollback probe did not reserve a real counter slot.');
      reservationReached = true;
      await orders.insertOne(rejected, { ...OPT, session });
      throw new SafeFailure('Controlled invalid insert unexpectedly succeeded; transaction aborted.');
    }), 121, 'Controlled Mongo transaction did not reach a real validator rejection.');
    check(reservationReached, 'Mongo controlled rollback did not execute its first write.');
    equal((await caps.findOne({ _id: owners[0] }, OPT)).count, capBefore, 'Mongo aborted transaction leaked a cap reservation.');
    equal(await orders.countDocuments({ ownerId: owners[0] }, OPT), countBefore, 'Mongo aborted transaction changed order count.');
    equal(await orders.countDocuments({ id: rejected.id }, OPT), 0, 'Mongo aborted transaction left its rejected order behind.');
    await expectStatus(() => execute('deleteOrder', owners[0], { orderId: id }), 200, 'Mongo transactional delete failed.');
    equal(await orders.countDocuments({ id, ownerId: owners[0] }, OPT), 0, 'Mongo transactional delete did not remove its record.');
    equal((await caps.findOne({ _id: owners[0] }, OPT)).count, 0, 'Mongo transactional delete failed to release quota.');

    // Twelve REAL overlapping create transactions must yield exactly 10 commits.
    // allSettled drains every writer before any finally-cleanup can begin.
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => create(owners[0], `QA quota ${index}`)));
    equal(attempts.filter(result => result.status === 'fulfilled' && result.value.status === 201).length, 10, 'Mongo concurrent quota must admit exactly ten orders.');
    equal(attempts.filter(result => result.status === 'rejected' && result.reason?.status === 409).length, 2, 'Mongo concurrent quota must reject exactly two conflicts.');
    equal(await orders.countDocuments({ ownerId: owners[0] }, OPT), 10, 'Mongo concurrent quota persisted the wrong number of orders.');
    equal((await caps.findOne({ _id: owners[0] }, OPT)).count, 10, 'Mongo concurrent quota counter differs from persisted orders.');
    equal((await execute('listOrders')).data.length, 10, 'Mongo quota list must return all ten committed QA orders.');
    // Exercise a second actual owner/counter, not merely its denied operations.
    const other = await create(owners[1], 'QA second owner');
    equal(other.status, 201, 'Mongo second owner create failed.');
    equal((await caps.findOne({ _id: owners[1] }, OPT)).count, 1, 'Mongo second owner has an incorrect independent quota counter.');
    await expectStatus(() => execute('getOrder', owners[0], { orderId: other.data.id }), 404, 'Mongo reverse owner isolation failed.');
  } catch (error) { failure = error; }
  finally {
    if (schemaApproved && cleanupReady) {
      // Never delete by owner alone, never reset a counter, never drop a collection.
      // The adapter pairs each scoped delete with its cap decrement transaction.
      const cleanupAdapter = createMongoAdapter({ getMongo: async () => ({ client, db }) });
      for (const [id, ownerId] of tracked) {
        try {
          const persisted = await orders.findOne({ id, ownerId }, OPT);
          if (!persisted) continue;
          const result = await cleanupAdapter.execute({ op: 'deleteOrder', ownerId, orderId: id });
          equal(result.status, 200, 'Scoped Mongo cleanup did not return success.');
          equal(await orders.countDocuments({ id, ownerId }, OPT), 0, 'Scoped Mongo cleanup left its exact target behind.');
        } catch { cleanupFailure = true; }
      }
      try {
        for (const ownerId of owners) {
          equal(await orders.countDocuments({ ownerId }, OPT), 0, 'Mongo QA owner has residual records; no unknown records were deleted.');
          const cap = await caps.findOne({ _id: ownerId }, OPT);
          check(cap === null || cap.count === 0, 'Mongo cleanup left a nonzero quota counter.');
        }
        equal(await orders.countDocuments({}, OPT), initialOrderCount, 'Mongo post-cleanup order count differs from baseline.');
        for (const [id, ownerId] of tracked) equal(await orders.countDocuments({ id, ownerId }, OPT), 0, 'Mongo tracked QA record survived cleanup.');
      } catch { cleanupFailure = true; }
    }
    if (client) { try { await client.close(); } catch { cleanupFailure = true; } }
  }
  if (cleanupFailure) throw new SafeFailure('Mongo cleanup/close verification failed; only tracked QA IDs were attempted, no unknown data deleted. Review privately before rerunning.');
  if (failure) throw failure;
  console.log('PASS REAL Mongo: approved strict validators/indexes, persisted owner-filtered CRUD/aggregation, monitored single-find aggregate read, concurrent atomic push/set/pull, unique rejection, transactions and 12-create quota (10 commits/2 conflicts).');
  console.log('PASS CONTROLLED fault on REAL Mongo: cap increment plus validator-rejected insert rolled back together; scoped adapter cleanup verified empty QA orders and zero counters (zero-count cap documents retained).');
}

async function main() {
  const config = await loadConfig();
  await runSql(config);
  await runMongo(config);
}
main().catch(error => {
  // NEVER pass an external Error/cause to console: the driver, filesystem, and
  // assertion payloads can contain connection details, private IDs or documents.
  console.error(error instanceof SafeFailure ? `FAIL: ${error.message}` : 'FAIL: Storage acceptance failed; raw provider/private diagnostics withheld.');
  process.exitCode = 1;
});
