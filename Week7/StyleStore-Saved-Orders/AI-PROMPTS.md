# Public AI Prompt Workflow — StyleStore Saved Orders

Reusable showcase prompts — not historical submissions. These five blocks reproduce the [published AI Prompt section](https://chernichenkodmitriy.com/showcases/stylestore-saved-orders/#prompt-title) exactly. They are reusable technical guidance, not a chat export or a record of actual submitted prompts.

## 1. Review

```text
Review a small saved-orders application and its persistence boundary.
Identify browser drafts, anonymous authentication, API authorization,
server-owned catalog prices, SQL parent/child relationships, and
MongoDB embedded documents. Check claims against official sources.
Preserve the presentation and original source components.
Return findings and missing facts before proposing changes.
```

## 2. Plan

```text
Plan the smallest complete order and item CRUD flow.
Use four known products and quantities 1–9. Define public browser
configuration, an explicitly started anonymous session, one verified
API, and alternative owner-scoped SQL and MongoDB adapters.
Specify request/response shapes, failure states and stale-work guards.
Write tests for input limits, persistence, isolation and browser use.
Return file ownership and acceptance criteria before implementation.
```

## 3. Build

```text
Implement the complete reusable specification below.
Write failing tests first. Keep the React storefront in its own island.
Use real authenticated HTTP and genuine database records.
Preserve the seven-section shell, local themes and native disclosures.
Do not replace an unavailable backend with synthetic success.
Return changed files, actual checks and unresolved blockers.
Do not publish or change external accounts without separate approval.
```

### Full implementation specification

```text
Build a standalone StyleStore Saved Orders showcase.

1. Deliver a seven-section HTML shell with an isolated React storefront.
   Preserve source-derived header, adaptive product card, order summary,
   local theme packages, native prompt disclosures and copy controls.
   Do not modify the source portfolio or load cloud theme preferences.

2. Bundle four illustrated products: Retro Sneakers (8500 USD cents),
   Classic Tee (2800), Everyday Hoodie (6400), City Backpack (5200).
   Local drafts are page-memory estimates, never database records.
   Limit each product to one line with integer quantity 1–9.

3. Use Supabase JS anonymous Auth only after Start demo session.
   Recover the dedicated saved-orders-auth session after reload.
   Public config.js contains supabaseUrl, publishableKey and the
   saved-orders function name. Never include privileged credentials.
   Explain anonymous access loss before local sign-out.

4. Expose /catalog, /orders, /orders/:id, /orders/:id/items and
   /orders/:id/items/:itemId beneath one verified Edge Function.
   Use GET/POST/PATCH/DELETE as applicable with ?engine=sql|mongo.
   Validate the bearer token, derive owner identity server-side,
   validate labels of 1–80 characters and known product IDs, and
   calculate integer-cent totals from a trusted server catalog.

5. Implement PostgreSQL orders and order_items with foreign keys,
   owner policies and transactional RPC mutations. Implement MongoDB
   order documents with embedded items and atomic owner-filtered
   item changes. Create/delete also maintain an owner cap document
   transactionally; enforce ten saved orders per owner per engine.
   The selector chooses one engine per request. No syncing,
   dual writes or distributed transaction may be implied.

6. Provide draft building, order save/list/read/rename/delete and
   persisted item add/update/remove. Verify a write with a new read.
   Validate returned IDs, engine, item values and computed totals.
   Retain drafts on failure; never fabricate successful responses.
   Cancel superseded work, reject stale replies and never retry writes
   automatically. After an ambiguous write, refresh before repeating.

7. Label idle, unconfigured, unavailable, busy and verified outcomes.
   Keep tokens out of logs and optional JSON disclosures. Maintain
   visible focus, native labels and responsive card/summary stacking.
   Draw one accessible, uniformly scaling architecture SVG with the
   same viewBox and geometry at every viewport; no mobile replacement.

8. Write tests first and actually run the production build and browser.
   Check CRUD, ownership, limits, races, prompt clipboard, theme modes
   and 1920/1000/390/320px layouts. Distinguish unit fixtures from real
   database observations. Deliver only approved frontend/backend,
   configuration and tests; report unavailable dependencies honestly.
   Exclude payments, inventory, shipping, publication and unrelated
   account changes. Never include private conversations or secrets.
```

## 4. Verify

```text
Run unit tests, a production build and browser checks.
Separate test fixtures from live database evidence. Verify actual
create/read/update/delete for orders and items in each engine,
including reload, owner isolation and invalid requests.
Test cancelled and malformed replies, failed saves and duplicate clicks.
Check prompt copying, keyboard use, local themes and mobile layout.
Report real results and blocked checks without fabricating records.
```
