# StyleStore Saved Orders

A small polyglot-persistence showcase for orders and related line items. A React island adapts the existing Adaptive Card Widgets product card and Flexbox Interfaces StyleStore header/order summary; the surrounding seven-section showcase remains HTML/CSS/JavaScript.

## What the visitor can do

- Browse four demonstration products: sneakers, T-shirt, hoodie and backpack.
- Build an unsaved local draft, then explicitly start an anonymous demo session to save it.
- Choose PostgreSQL or MongoDB; each engine owns a separate dataset.
- Create, list, open, rename and delete orders; add, change quantity and remove their items.
- Reload and retrieve saved records through the hosted API.

Limits: ten orders per owner per engine, four distinct products per order, quantity 1–9, and a trimmed label of 1–80 Unicode code points. There is no payment, shipping, tax, inventory or automatic cross-engine synchronization. Do not enter personal data.

## Execution boundaries

```text
Static showcase + React island
  ├─ Supabase Auth: explicit anonymous session
  └─ Supabase Edge Function: saved-orders
       ├─ PostgreSQL: authenticated RPC → normalized private tables
       └─ MongoDB Atlas: server-only driver → embedded order documents
```

The page holds an unsaved draft only in memory and stores its anonymous Auth session in this browser. Clearing browser data or signing out loses access to that anonymous identity's orders; signing out does not delete them. The browser receives no database password or MongoDB URI.

The hosted API verifies identity before storage access and derives ownership server-side. SQL changes use a restricted, independently validating RPC. MongoDB item updates are single-document operations; order creation/deletion transactionally maintains an owner counter. The databases are alternatives, not a distributed transaction.

The frontend preview runs locally. The API, PostgreSQL and Atlas run in cloud services; a configured public frontend does not require a local database, Docker or a PC-hosted tunnel. Local Resume integration is complete and verified at `http://127.0.0.1:8807/showcases/stylestore-saved-orders/index.html`; public frontend deployment remains a separate, unperformed release step.

## Current verification state

Real PostgreSQL and Atlas storage tests pass, including constraints, rollback, validator rejection, owner isolation, atomic item changes and concurrent quotas. On November 14, 2026, full hosted SQL + MongoDB API acceptance passed 14 runner-reported tests (one parent plus 13 subtests). Actual integrated Chromium/Firefox CRUD, ownership denial, validation and reload/read-back passed for both engines without API interception. Hosted MongoDB is no longer blocked; this is local frontend integration with hosted services, not public website deployment.

The November 12 standalone v3 revision passed 81 unit/source checks, nine Chromium/Firefox browser tests and 56 automated axe cases with zero detected violations; the unchanged standalone source suite was rerun successfully on November 14. Independent final narrow-delta specification and code-quality reviews are approved. Manual accessibility assessments remain open. Historical standalone desktop Lighthouse performance was 99; same-revision mobile runs measured 73 and 80, with main-thread blocking retained as a limitation rather than hidden. Other Lighthouse categories were 100. The separate November 14 integrated local route measured Lighthouse performance 100 desktop / 96 mobile, with other categories 100; its 112 presentation states and 56 axe cases detected no automated violations, with manual incompletes retained. Local visual approval remains pending; the QA record also preserves the standalone missing legacy root favicon fallback.

See [Data Model Audit](docs/data-model-audit.md) for the 3NF/document-model reasoning and [Verification Record](docs/qa/report.md) for executed evidence, failures and remaining gates. Local build, database tests, hosted connectivity, visual approval, integration, publication and recording are distinct states.

## Local build and preview

Use a Node/npm environment satisfying `package.json` (validated here with Node 22.23.2). Install the lockfile dependencies, then build and serve the production allowlist:

```sh
npm ci --no-bin-links --ignore-scripts
node scripts/build.mjs
node scripts/serve.mjs
```

Open `http://127.0.0.1:8797/`. The server is loopback-only and serves `dist/`, not source, tests, infrastructure or private files. If a portable npm shim is unavailable, use the installation's actual Node executable and npm CLI; do not change source to work around the shim.

`config.js` contains only the approved public Supabase URL, publishable key and function name. The server's Content Security Policy permits that configured Supabase origin. API CORS must separately allow the exact frontend origin; `localhost` and `127.0.0.1` are different origins.

## Backend source and setup

| Source | Responsibility |
|---|---|
| `shared/catalog.mjs` | Fixed, trusted catalog and integer-cent prices |
| `shared/domain.mjs` | Mutation validation, UUID creation and public aggregate normalization |
| `supabase/migrations/202611120001_saved_orders.sql` | Normalized private tables, constraints, RLS/grants, immutable catalog and transactional RPC |
| `supabase/mongo/bootstrap.mjs` | Separate trusted provisioning of strict validators/indexes |
| `supabase/functions/saved-orders/` | Auth verification, bounded requests, unified controller and SQL/Mongo adapters |
| `src/` | React storefront, explicit session controls and verified HTTP/read-back handling |

For a separate deployment, use isolated approved cloud resources, review the migration/bootstrap before execution, enable anonymous Supabase Auth and deploy the function configuration in `supabase/config.toml`. Its platform JWT check is disabled because the handler explicitly verifies the caller with Auth; do not remove that application check.

Configure server-only `MONGODB_URI`, `MONGODB_DB` and exact `ALLOWED_ORIGINS`. Use a database-scoped application user rather than a provisioning administrator. Keep every credential outside the project, static output and archives. The environment example contains placeholders, not deployment credentials. Apply the same exact frontend origin in CORS and the operator tests.

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

## QA Test Summary

This checklist summarizes the [recorded hosted two-engine and storage verification](docs/qa/report.md). It documents completed execution, not a fresh production-origin test after the latest frontend release.

- [x] **SQL CRUD:** PostgreSQL order/item create, list/read, rename/update, removal and delete/read-back were exercised through the hosted API and integrated Chromium/Firefox flows.
- [x] **NoSQL CRUD:** Atlas order/item CRUD and reload/read-back were exercised through the actual MongoDB adapter and hosted API; the two engines' datasets were checked independently ([browser evidence](docs/qa/hosted-two-engine-20261114/integrated-live-browser.json)).
- [x] **Constraint/integrity tests:** input/Unicode/quantity/product boundaries, ownership, quotas, SQL foreign keys/cascade/rollback and MongoDB validators/atomic updates/transactions were exercised ([direct-storage output](docs/qa/live-storage.log)).
- [x] **Terminal inspection:** the full hosted API runner recorded 14 passed tests, zero failures; its sanitized output and cleanup results are retained ([API log](docs/qa/hosted-two-engine-20261114/live-api-both.log)).
- [x] **Automated browser console/network inspection:** actual hosted 200/201 and expected 400/404 responses, reload persistence and zero page errors were recorded without API interception.
- [ ] **Manual DevTools inspection:** a separate completed manual Network/Console review is not explicitly documented; automated inspection is not presented as manual work.

**Remaining scope:** confirm current live saves/reads in both engines before recording. Manual accessibility assessments and the dated performance limitations in the QA record remain separate from these completed database checks.

## Verification commands

Offline unit/source checks:

```sh
node --test tests/*.test.mjs
```

Browser checks require compatible Playwright Chromium/Firefox installations; the contrast/narrow suites also use external JavaScript QA modules. Functional/Unicode cases use explicitly intercepted Auth/API fixtures and do not prove hosted persistence; presentation/narrow cases render real production assets and local drafts. Run `node --test --test-concurrency=1 tests/*.browser.mjs` after configuring the QA dependency/browser paths described in the QA record. Do not run browser suites concurrently with Lighthouse performance audits.

Deliberate operator-only live checks, after configuration:

- `tests/live-api.mjs`: real HTTPS CRUD, owner denials, input boundaries, engine isolation and concurrent quotas. Set `STYLESTORE_PRIVATE_CONFIG` and the exact preview origin: `STYLESTORE_ALLOWED_ORIGIN=http://127.0.0.1:8797` for the standalone preview, or `http://127.0.0.1:8807` for the verified local Resume integration.
- `tests/live-storage.mjs` plus `tests/live-sql.sql`: actual database constraints, direct-RPC validation, forced rollback, MongoDB validators/atomic operations and scoped cleanup. Also set `STYLESTORE_MONGO_DRIVER` to the external driver's `mongodb/lib/index.js`, and `PSQL_BIN` if needed.

The live runners require two dedicated existing QA owners that start empty. Private configuration is runtime-only. They never delete unknown orders, sign up users or publish code. Inspect their prerequisites before invoking them; an unavailable cloud dependency is a blocked/failed check, not a pass.

## AI assistance and release boundary

AI assisted implementation, test design and documentation. Independent reviews and real execution were used to check the result; automated checks do not certify accessibility or guarantee assignment grading. The showcase's prompt blocks are reusable public technical prompts, not private conversation records.

Previous coursework and the original CSS showcases remain reference sources, not writable dependencies. This AD371 directory is the standalone coursework deliverable and remains separate from the Resume portfolio repository. Its frontend has also been integrated into the publicly deployed Resume portfolio and has passed independent integration source reviews. That portfolio publication does not establish a separate publication of this standalone coursework repository, and it does not imply academic submission.

## Demonstration and submission links

| Item | Current state |
|---|---|
| Recording | Not created or uploaded; the student records the genuine working system. |
| Public frontend URL | Live portfolio integration: https://chernichenkodmitriy.com/showcases/stylestore-saved-orders/ |
| Standalone source publication | This AD371 coursework directory is separate from the Resume repository; no separate public source-repository URL is claimed here. |
| Resume integration | Publicly deployed at the URL above. Portfolio publication is separate from submission of this coursework deliverable. |

The public frontend deployment has been verified. Recording and academic submission remain separate steps. Before recording, confirm a real save and read in each database engine; the recent presentation checks do not constitute a fresh authenticated production database run.

Keep private account pages, browser storage, bearer-token headers and credentials out of the recording. The Network request list can demonstrate statuses without expanding sensitive request headers. No recording duration or public link is invented here.

## Reflection

Embedding makes a complete MongoDB order easy to read in one lookup, while normalized SQL keeps product facts separate and enforces relationships with foreign keys. A per-owner quota still needs a transactional counter in the document model; embedding does not make every invariant single-document. The most useful corrections came from independent contract tests and actual narrow-screen screenshots, not from assuming a successful render proved correctness.
