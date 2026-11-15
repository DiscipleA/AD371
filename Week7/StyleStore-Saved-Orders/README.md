# StyleStore Saved Orders

A small polyglot-persistence showcase for orders and related line items. A React island adapts the existing Adaptive Card Widgets product card and Flexbox Interfaces StyleStore header/order summary; the surrounding seven-section showcase remains HTML/CSS/JavaScript.

**Live portfolio edition:** [StyleStore Saved Orders](https://chernichenkodmitriy.com/showcases/stylestore-saved-orders/). This AD371 folder is the separate standalone coursework deliverable.

[AI prompts](AI-PROMPTS.md) · [QA checklist](#qa-test-summary) · [Detailed verification](docs/qa/report.md)

## 🎯 Project Description

- Browse four demonstration products: sneakers, T-shirt, hoodie and backpack.
- Build an unsaved local draft, then explicitly start an anonymous demo session to save it.
- Choose PostgreSQL or MongoDB; each engine owns a separate dataset.
- Create, list, open, rename and delete orders; add, change quantity and remove their items.
- Reload and retrieve saved records through the hosted API.

Limits: ten orders per owner per engine, four distinct products per order, quantity 1–9, and a trimmed label of 1–80 Unicode code points. There is no payment, shipping, tax, inventory or automatic cross-engine synchronization. Do not enter personal data.

## 🏗️ Architecture

```text
Static showcase + React island
  ├─ Supabase Auth: explicit anonymous session
  └─ Supabase Edge Function: saved-orders
       ├─ PostgreSQL: authenticated RPC → normalized private tables
       └─ MongoDB Atlas: server-only driver → embedded order documents
```

The page holds an unsaved draft only in memory and stores its anonymous Auth session in this browser. Clearing browser data or signing out loses access to that anonymous identity's orders; signing out does not delete them. The browser receives no database password or MongoDB URI.

The hosted API verifies identity before storage access and derives ownership server-side. SQL changes use a restricted, independently validating RPC. MongoDB item updates are single-document operations; order creation/deletion transactionally maintains an owner counter. The databases are alternatives, not a distributed transaction.

The frontend preview runs locally. The API, PostgreSQL and Atlas run in cloud services; a configured public frontend does not require a local database, Docker or a PC-hosted tunnel. The standalone frontend can be previewed locally; a separate integrated frontend is publicly available in the Resume portfolio at the live URL above. Portfolio publication is distinct from publication/submission of this standalone coursework directory.

### SQL model: normalized relationships

The relational model separates catalog facts, owned orders and item membership. These are the **complete three table declarations**, excerpted from [the migration](supabase/migrations/202611120001_saved_orders.sql); apply the full linked file for indexes, catalog seed/immutability, RLS/grants and the validating transactional RPC.

```sql
create table if not exists ss_private.products (
  id text primary key,
  sku text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  unit_price_cents integer not null check (unit_price_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ss_private.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ss_private.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ss_private.orders(id) on delete cascade,
  product_id text not null references ss_private.products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id)
);
```

```text
auth.users (managed)
  id [PK] 1 ───── 0..* ss_private.orders
                       id [PK], owner_id [FK], label, timestamps
                       1
                       │ ON DELETE CASCADE
                       0..*
                     ss_private.order_items
                       id [PK], order_id [FK], product_id [FK], quantity
                       UNIQUE(order_id, product_id)
                       0..*
                       │ ON DELETE RESTRICT (product deletion)
                       1
                     ss_private.products
                       id [PK], sku [UNIQUE], name, unit_price_cents, timestamps
```

Owner deletion cascades to orders and their items. The [model audit](docs/data-model-audit.md) explains 1NF → 2NF → 3NF: quantities depend on an order/product membership, product facts are stored once, and totals are calculated rather than independently persisted. The RPC enforces trimmed labels, ownership, the four-product bound and the ten-order quota in addition to table constraints.

### MongoDB model: embedded aggregate and quota counter

The actual `orders` collection embeds bounded items with trusted catalog name/price snapshots. A separate `ss_owner_caps` collection tracks each owner's ten-order quota. These **illustrative JSON documents** match the stored field names; UUIDs, label and timestamps below are invented examples, not real owners, exported records or seed data. MongoDB adds its BSON ObjectId `_id` to an order on insertion; that automatic field is omitted here.

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "ownerId": "22222222-2222-4222-8222-222222222222",
  "label": "Illustrative practice order",
  "items": [{
    "id": "33333333-3333-4333-8333-333333333333",
    "productId": "retro-sneakers",
    "name": "Retro Sneakers",
    "unitPriceCents": 8500,
    "quantity": 2
  }],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Illustrative corresponding `ss_owner_caps` document:

```json
{ "_id": "22222222-2222-4222-8222-222222222222", "count": 1 }
```

The [bootstrap](supabase/mongo/bootstrap.mjs) applies strict/error validators: UUID/ISO-string fields, trimmed 1–80-character labels, 0–4 items with unique item/product IDs, trusted product/name/price combinations and integer quantities 1–9. API creation requires 1–4 items; subsequent removal may leave zero. Indexes are unique `id`, unique `(ownerId,id)` and `(ownerId,updatedAt DESC,id)` for listing; quota `_id` is unique by MongoDB's built-in index.

The [adapter](supabase/functions/saved-orders/mongo.mjs) reads a complete order with `findOne({ownerId,id:orderId})`; it does not join item/product collections. Duplication is deliberate for the bounded aggregate read, not a normalization error. Quantity/add/remove are single-document atomic updates. Order create/delete and counter changes share a replica-set transaction; never import orders or discard counters without offline reconciliation. MongoDB has no cross-database foreign key to Supabase Auth: identity is verified before owner-qualified access. Public response `totalCents` is calculated, and internal `ownerId`/`_id` are not returned as order fields.

## 🚀 Setup & Run Instructions

Use Node.js **22.12+** and npm, satisfying `package.json` (the recorded QA environment used Node 22.23.2). Install the lockfile dependencies, then build and serve the production allowlist:

```sh
npm ci --no-bin-links --ignore-scripts
node scripts/build.mjs
node scripts/serve.mjs
```

Open `http://127.0.0.1:8797/`. The server is loopback-only and serves `dist/`, not source, tests, infrastructure or private files. If a portable npm shim is unavailable, use the installation's actual Node executable and npm CLI; do not change source to work around the shim.

`config.js` contains only the approved public Supabase URL, publishable key and function name; connection settings are read from this file, not from a frontend `.env` interface. The server's Content Security Policy permits that configured Supabase origin. API CORS must separately allow the exact frontend origin; `localhost` and `127.0.0.1` are different origins.

## 🔐 Backend Configuration & API

For a separate deployment, use isolated approved cloud resources, review the migration/bootstrap before execution, enable anonymous Supabase Auth and deploy the function configuration in `supabase/config.toml`. Its platform JWT check is disabled because the handler explicitly verifies the caller with Auth; do not remove that application check.

Configure server-only `MONGODB_URI`, `MONGODB_DB` and exact `ALLOWED_ORIGINS`. Use a database-scoped application user rather than a provisioning administrator. Keep every credential outside the project, static output and archives. The environment example contains placeholders, not deployment credentials. Apply the same exact frontend origin in CORS and the operator tests.

### Provision a separate hosted deployment (operator only)

These are instructions for new, isolated approved resources, not commands executed by this documentation update. Prerequisites: Supabase project/SQL-owner access, authenticated Supabase CLI, an Atlas replica-set deployment reachable from the Edge runtime, and a trusted Node operator environment with the MongoDB **7.8.0** driver already available outside the frontend dependency tree. No local database or Docker is required for this hosted path.

1. **SQL migration and seed:** in the target project's SQL Editor, review/run the entire [202611120001_saved_orders.sql](supabase/migrations/202611120001_saved_orders.sql). It creates `ss_private`, tables/indexes/policies and `public.ss_orders_api`, and seeds the four catalog products with `ON CONFLICT DO NOTHING`. It creates no orders or Auth users. Keep `ss_private` unexposed and read back RLS, restricted table grants and authenticated-only RPC execution. Do not use a database reset or treat the table excerpt as a complete install.
2. **Atlas provisioning:** create an isolated application database (`stylestore` is the runtime default). Allow network access from the intended runtime under an approved Atlas access policy and create separate provisioning and database-scoped runtime users. In a trusted private shell, supply administrative `MONGODB_URI`, explicit `MONGODB_DB` and the absolute path `STYLESTORE_MONGO_DRIVER` to the existing driver's `mongodb/lib/index.js`; do not put values in source, command arguments, shell history or browser configuration. From this project root invoke the exported bootstrap explicitly:

   ```sh
   node --input-type=module <<'NODE'
   import { pathToFileURL } from 'node:url';
   import { isAbsolute } from 'node:path';
   import { initializeMongo } from './supabase/mongo/bootstrap.mjs';
   for (const name of ['MONGODB_URI', 'MONGODB_DB', 'STYLESTORE_MONGO_DRIVER']) {
     if (!process.env[name]) throw new Error(`Missing private operator setting: ${name}`);
   }
   if (!isAbsolute(process.env.STYLESTORE_MONGO_DRIVER)) throw new Error('Driver path must be absolute.');
   const { MongoClient } = await import(pathToFileURL(process.env.STYLESTORE_MONGO_DRIVER).href);
   const client = new MongoClient(process.env.MONGODB_URI);
   try {
     await client.connect();
     await initializeMongo(client.db(process.env.MONGODB_DB));
   } finally { await client.close(); }
   NODE
   ```

   `node supabase/mongo/bootstrap.mjs` alone **does not provision anything**: it exports functions, with no CLI connection/call. The invocation above creates/updates validators and indexes, not sample orders/counters. Read back collection validators/indexes before enabling traffic; existing invalid data/index conflicts require operator resolution, and preexisting orders require audited counter reconciliation. Never seed the illustrative JSON directly.
3. **Auth/function settings:** enable anonymous sign-in in Supabase Auth. Configure the hosted function's server-only `MONGODB_URI` using the **runtime readWrite user scoped to this database**, `MONGODB_DB`, and exact `ALLOWED_ORIGINS` including `http://127.0.0.1:8797` for this preview. Use [supabase/functions/.env.example](supabase/functions/.env.example) only as a placeholder reference: the hosted runtime supplies its URL/public keys, and the frontend does not consume this file. Set server secrets through the approved private provider workflow, not a public file or literal credentials in a command.
4. **Deploy:** from the project root, with an authenticated CLI exposing the documented `--remote` target selector:

   ```sh
   supabase functions deploy --help
   supabase functions deploy saved-orders --remote='<YOUR_PROJECT_REF>' --no-verify-jwt --use-api
   ```

   Confirm the installed CLI help and explicit project selector before execution (older versions may expose `--project-ref`). `--use-api` bundles server-side without local Docker ([CLI reference](https://supabase.com/docs/reference/cli/supabase-functions-deploy)). Read back `verify_jwt=false` and retain the handler's Auth verification on every non-OPTIONS request; disabling the platform check is not anonymous database access.
5. **Frontend/read-back:** set this project's public URL/key/function name in `config.js`, build and serve as above, explicitly start a demo session and verify a real save/reload/read/delete separately in each engine. Keep all private provisioning settings outside source/static output. The operator-only live runners below require dedicated QA owners and are not part of frontend startup.

### Unified API

Append `?engine=sql` or `?engine=mongo` to the function's feature routes. Supply the public API key and a real caller bearer token.

| Method | Route | Result |
|---|---|---|
| GET | `/catalog` | Trusted four-product catalog |
| GET / POST | `/orders` | List summaries / create an order with items |
| GET / PATCH / DELETE | `/orders/:id` | Read / rename / delete an owned order |
| POST | `/orders/:id/items` | Add a distinct catalog product |
| PATCH / DELETE | `/orders/:id/items/:itemId` | Change quantity / remove an item |

Success uses `{ok:true,engine,data}` with HTTP 200/201. Invalid input, missing authentication, missing/foreign-owned records, conflicts and storage failures use sanitized 400/401/404/409/503 responses. SQL RPC validation outcomes use their own logical status envelope inside an authenticated REST response; they are not the Edge Function's HTTP contract.

## 🧪 QA & Lighthouse

The following results describe their dated standalone/local-integration snapshots; they are not a new test run of the latest public frontend.

Real PostgreSQL and Atlas storage tests pass, including constraints, rollback, validator rejection, owner isolation, atomic item changes and concurrent quotas. On November 14, 2026, full hosted SQL + MongoDB API acceptance passed 14 runner-reported tests (one parent plus 13 subtests). Actual integrated Chromium/Firefox CRUD, ownership denial, validation and reload/read-back passed for both engines without API interception. Hosted MongoDB is no longer blocked; these acceptance results used a local frontend with hosted services, not a fresh production-origin test of the public portfolio frontend.

The November 12 standalone v3 revision passed 81 unit/source checks, nine Chromium/Firefox browser tests and 56 automated axe cases with zero detected violations; the unchanged standalone source suite was rerun successfully on November 14. Independent final narrow-delta specification and code-quality reviews are approved. Manual accessibility assessments remain open. Historical standalone desktop Lighthouse performance was 99; same-revision mobile runs measured 73 and 80, with main-thread blocking retained as a limitation rather than hidden. Other Lighthouse categories were 100. The separate November 14 integrated local route measured Lighthouse performance 100 desktop / 96 mobile, with other categories 100; its 112 presentation states and 56 axe cases detected no automated violations, with manual incompletes retained. The recorded standalone snapshot retained local visual approval as pending; the QA record also preserves the standalone missing legacy root favicon fallback.

See [Data Model Audit](docs/data-model-audit.md) for the 3NF/document-model reasoning and [Verification Record](docs/qa/report.md) for executed evidence, failures and remaining gates. Local build, database tests, hosted connectivity, visual approval, integration, publication and recording are distinct states.

## QA Test Summary

This checklist summarizes the [recorded hosted two-engine and storage verification](docs/qa/report.md). It documents completed execution, not a fresh production-origin test after the latest frontend release.

- [x] **SQL CRUD:** PostgreSQL order/item create, list/read, rename/update, removal and delete/read-back were exercised through the hosted API and integrated Chromium/Firefox flows.
- [x] **NoSQL CRUD:** Atlas order/item CRUD and reload/read-back were exercised through the actual MongoDB adapter and hosted API; the two engines' datasets were checked independently ([browser evidence](docs/qa/hosted-two-engine-20261114/integrated-live-browser.json)).
- [x] **Constraint/integrity tests:** input/Unicode/quantity/product boundaries, ownership, quotas, SQL foreign keys/cascade/rollback and MongoDB validators/atomic updates/transactions were exercised ([direct-storage output](docs/qa/live-storage.log)).
- [x] **Terminal inspection:** the full hosted API runner recorded 14 passed tests, zero failures; its sanitized output and cleanup results are retained ([API log](docs/qa/hosted-two-engine-20261114/live-api-both.log)).
- [x] **Automated browser console/network inspection:** actual hosted 200/201 and expected 400/404 responses, reload persistence and zero page errors were recorded without API interception.
- [x] **Manual Firefox Network inspection:** the locally recorded demonstration shows readable request-list statuses 200/201/204/304 and `orders?engine=sql`/catalog paths around **10:50–12:20**, without expanded sensitive headers. It also shows saved-record/deletion inspection in Supabase and Atlas. This is additional manual evidence, not a replay of all CRUD/constraint tests. A split Console shows a failed external Cloudflare beacon warning; this recording is **not** a clean-console/no-asset-warning claim.

**Inspection method:** the earlier automated browser/terminal records remain the evidence for complete CRUD and constraint coverage. The local video adds the actual manual Network observation above; it does not establish constraint injection or all four CRUD operations by itself.

**Remaining scope:** the demonstration is recorded locally; its public video URL is pending upload. Manual accessibility assessments and the dated performance/legacy-favicon limitations remain separate from the completed database checks. The historical API/browser logs do not become a fresh production-origin acceptance run because a recording exists.

### Verification commands

Offline unit/source checks:

```sh
node --test tests/*.test.mjs
```

Browser checks require compatible Playwright Chromium/Firefox installations; the contrast/narrow suites also use external JavaScript QA modules. Functional/Unicode cases use explicitly intercepted Auth/API fixtures and do not prove hosted persistence; presentation/narrow cases render real production assets and local drafts. Run `node --test --test-concurrency=1 tests/*.browser.mjs` after configuring the QA dependency/browser paths described in the QA record. Do not run browser suites concurrently with Lighthouse performance audits.

Deliberate operator-only live checks, after configuration:

- `tests/live-api.mjs`: real HTTPS CRUD, owner denials, input boundaries, engine isolation and concurrent quotas. Set `STYLESTORE_PRIVATE_CONFIG` and the exact preview origin: `STYLESTORE_ALLOWED_ORIGIN=http://127.0.0.1:8797` for the standalone preview, or `http://127.0.0.1:8807` for the verified local Resume integration.
- `tests/live-storage.mjs` plus `tests/live-sql.sql`: actual database constraints, direct-RPC validation, forced rollback, MongoDB validators/atomic operations and scoped cleanup. Also set `STYLESTORE_MONGO_DRIVER` to the external driver's `mongodb/lib/index.js`, and `PSQL_BIN` if needed.

The live runners require two dedicated existing QA owners that start empty. Private configuration is runtime-only. They never delete unknown orders, sign up users or publish code. Inspect their prerequisites before invoking them; an unavailable cloud dependency is a blocked/failed check, not a pass.

## 📁 Project Files

| Source | Responsibility |
|---|---|
| `shared/catalog.mjs` | Fixed, trusted catalog and integer-cent prices |
| `shared/domain.mjs` | Mutation validation, UUID creation and public aggregate normalization |
| `supabase/migrations/202611120001_saved_orders.sql` | Normalized private tables, constraints, RLS/grants, immutable catalog and transactional RPC |
| `supabase/mongo/bootstrap.mjs` | Separate trusted provisioning of strict validators/indexes |
| `supabase/functions/saved-orders/` | Auth verification, bounded requests, unified controller and SQL/Mongo adapters |
| `src/` | React storefront, explicit session controls and verified HTTP/read-back handling |

`AI-PROMPTS.md` contains the public reusable prompt workflow; `docs/qa/` retains the dated reports and execution evidence.

## 📚 Architecture References

- [Draft state](https://react.dev/learn/state-as-a-snapshot)
- [Identity and ownership](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Trusted validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Relational integrity](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Embedded orders](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
- [Verified read-back](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

## 🤖 AI Assistance

Hermes Agent assisted implementation, test design and documentation. Independent reviews and real execution checked the result; automated checks do not certify accessibility or guarantee grading. The [public AI prompt workflow](AI-PROMPTS.md) reproduces the five reusable prompts from the [published AI Prompt section](https://chernichenkodmitriy.com/showcases/stylestore-saved-orders/#prompt-title): Review → Plan → Build → Verify plus the implementation specification. Exact submitted prompts/conversations remain private; these are not historical-submission evidence.

The [model audit](docs/data-model-audit.md) and real storage evidence support SQL normalization/relationships and MongoDB embedding/atomicity; no schema-modeling defect was established. Documented corrections were frontend Unicode code-point handling, detected theme contrast and 320px input/item containment, plus a singular/plural verifier expectation—not invented database redesigns or student-only manual patches ([review record](docs/qa/independent-review.md), [findings](docs/qa/report.md#historical-corrections-and-retained-findings)).

## Deployment Boundary

Previous coursework and the original CSS showcases remain reference sources, not writable dependencies. This AD371 directory is the standalone coursework deliverable and remains separate from the Resume portfolio repository. Its frontend has also been integrated into the publicly deployed Resume portfolio and has passed independent integration source reviews. That portfolio publication does not establish a separate publication of this standalone coursework repository, and it does not imply academic submission.

## 🎥 Demonstration & Submission Links

| Item | Current state |
|---|---|
| Recording | Created locally; public video URL pending upload. Manual Network observation is scoped in the QA checklist above. |
| Public frontend URL | Live portfolio integration: https://chernichenkodmitriy.com/showcases/stylestore-saved-orders/ |
| Standalone source publication | This AD371 coursework directory is separate from the Resume repository; no separate public source-repository URL is claimed here. |
| Resume integration | Publicly deployed at the URL above. Portfolio publication is separate from submission of this coursework deliverable. |

The public frontend deployment has been verified separately from the dated local-integration acceptance. The local recording now shows Supabase/Atlas saved records and deletion plus Firefox Network inspection; upload and academic submission remain separate steps. Earlier logs, not the presentation alone, substantiate complete CRUD/constraints.

Keep private account pages, browser storage, bearer-token headers and credentials out of the recording. The Network request list can demonstrate statuses without expanding sensitive request headers. No recording duration or public link is invented here.

## 💡 Reflection

Embedding makes a complete MongoDB order easy to read in one lookup, while normalized SQL keeps product facts separate and enforces relationships with foreign keys. A per-owner quota still needs a transactional counter in the document model; embedding does not make every invariant single-document. The most useful corrections came from independent contract tests and actual narrow-screen screenshots, not from assuming a successful render proved correctness.
