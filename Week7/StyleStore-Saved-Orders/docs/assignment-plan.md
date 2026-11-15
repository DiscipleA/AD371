# StyleStore Saved Orders — Technical Specification

## Project Description

A focused polyglot-persistence demonstration: an existing adaptive product-card design and StyleStore order summary become a small React application that saves demonstration orders and line items in either PostgreSQL or MongoDB. The surrounding portfolio remains HTML/CSS/JavaScript.

Status: backend implementation and schema provisioning have passed independent reviews and real PostgreSQL/MongoDB storage checks. Full hosted SQL + MongoDB API acceptance and integrated Chromium/Firefox CRUD passed on November 14, 2026. Final narrow-CSS and local Resume integration specification/code-quality reviews are approved. Local visual approval, manual accessibility assessments and public release/recording remain separate gates; historical standalone mobile measurements and later integrated results are recorded in [the verification record](qa/report.md).

## Feature Boundary

- Four bundled demonstration products: sneakers, T-shirt, hoodie and backpack.
- Select PostgreSQL or MongoDB; each engine has an independent dataset.
- Create, list, retrieve, rename and delete demonstration orders.
- Add, read, update quantity and remove order items.
- Reload and retrieve data to demonstrate real persistence.
- Validate titles, identifiers, quantities, item counts and request sizes server-side.
- No payments, shipping, inventory management, image uploads or automatic cross-engine synchronization.
- Product images are presentation assets, not user uploads. Product identity and pricing are server-owned, not trusted from browser payloads.

## Implemented Execution Boundaries

The browser runs the React island inside the seven-section showcase. The deployed Supabase Edge Function is the unified API and authorization boundary. Both its PostgreSQL and MongoDB paths are verified through actual hosted API requests and the local integrated browser UI. Supabase PostgreSQL provides relational persistence; MongoDB Atlas provides document persistence. MongoDB credentials stay server-side.

Actual November 14 hosted requests verified the two-engine connection through the deployed function; this is execution evidence, not merely a configuration or direct-driver check. No local database server or PC-dependent tunnel is planned for the deployed feature. A local preview is separate from hosted service execution.

Writes are scoped to a Supabase-verified caller using explicit anonymous demo sessions. Browser-supplied owner IDs never establish ownership. The resources are isolated from earlier coursework. Hosted acceptance used existing dedicated QA identities and the exact local Resume origin `http://127.0.0.1:8807`; no new signup was required.

## Data Model

### Relational model

- `products`: immutable demonstration catalog, product primary key, unique SKU, title, server-owned integer unit price and timestamps.
- `orders`: UUID primary key, verified owner, short display label and timestamps.
- `order_items`: UUID primary key, order foreign key, product foreign key, bounded quantity and timestamps; unique order/product membership.
- Parent deletion cascades to order items; deletion of a referenced catalog product is restricted.
- Foreign-key indexes, uniqueness, checks and actual functional dependencies are audited before migration execution.
- Order creation with items is one database transaction. A failed child insertion must roll back the parent and prior child writes.
- Reads join orders, items and products. Totals are computed from trusted integer prices and quantities; no duplicated stored order total.

### Document model

- One order document contains UUID identity, verified ownership, label, timestamps and bounded embedded items.
- Embedded items contain item identity, allowlisted product identity, server-derived display/price snapshot and quantity.
- Read one complete order with one document lookup, without application-side collection joins.
- Use atomic update operators with owner/ID predicates to add, modify or remove an embedded item.
- Database validation, relevant indexes and request validation have separate responsibilities.
- Any embedded catalog snapshot is deliberate query-driven duplication; no cross-engine synchronization or historical repricing guarantee is claimed.

## Requirement-to-Evidence Map

The following are public-safe technical requirements and actual evidence states, not private prompting. Each verified label is bounded by its stated test scope.

| ID | Requirement | Executed evidence | Status |
|---|---|---|---|
| R1 | Same non-trivial domain with related entities in both engines | Real order/item storage through both adapters | Verified (storage) |
| R2 | SQL DDL, primary/foreign keys, timestamps and indexes | Migration review and actual database metadata read-back | Verified |
| R3 | Relational 3NF audit | Functional dependencies and actual schema; `data-model-audit.md` | Verified |
| R4 | SQL CRUD, list and read-by-ID | Real hosted API/browser operations and joined aggregate read-back | Verified |
| R5 | Referential integrity and cascade | Real orphan rejection and parent-delete child cleanup | Verified |
| R6 | Parameterized operations and safe IDs | Reviewed bindings, database UUID checks and actual adversarial hosted HTTP cases for both engines | Verified (both hosted paths) |
| R7 | Query-driven NoSQL embedding | Live validators/indexes; monitored complete-order read issued one `find` | Verified (direct storage) |
| R8 | NoSQL CRUD, list and read-by-ID | Actual Atlas adapter CRUD plus hosted MongoDB API and integrated two-browser CRUD/read-back | Verified (direct storage and hosted) |
| R9 | Atomic embedded update | Real `$push`/`$set`/`$pull` and database read-back | Verified (direct storage) |
| R10 | Transactional integrity | Forced SQL child failure rolled back the full write; Mongo counter/insert rollback and concurrent quota | Verified (real storage) |
| R11 | Unified API/UI and proper HTTP outcomes | Both hosted engines: API acceptance and integrated Chromium/Firefox 200/201/400/404; API auth/CORS/quota negatives | Verified (both hosted paths) |
| R12 | Responsive UI and form boundaries | Final built browser suites; desktop/tablet/390/320px; 168 narrow label checks and actual screenshots | Verified |
| R13 | Console/driver/connection health | Direct drivers and both hosted paths checked; four integrated browser cases have no page/local-asset errors or API interception | Verified within tested scope |
| R14 | Initial-draft audit before execution | Independent backend design/specification/security reviews preceded schema execution | Verified |
| R15 | Connection logic, controllers and minimal frontend | Complete reviewed source and actual SQL/Mongo API + integrated frontend execution | Verified (local integration/hosted API) |

The November 14 [API log](qa/hosted-two-engine-20261114/live-api-both.log) and [integrated browser report](qa/hosted-two-engine-20261114/integrated-live-browser.json) substantiate the hosted rows. R2/R5/R7/R9/R10 schema, single-`find`, atomic-operation and forced-rollback proof remains scoped to the original direct-storage acceptance; the newer API run did not repeat schema provisioning or controlled database faults.

## Showcase Presentation Contract

Preserve these sections, in order:

1. Problem & Scope
2. Architecture Concepts
3. System Architecture
4. AI Prompt
5. Audit
6. Working System
7. Verification

Use the inspected App Engineering source hierarchy, shared local appearance tokens, compact Audit and native disclosure controls. Include relevant official reference links in concept cards. Prompt disclosures begin closed, following the StyleStore reference. Copy controls must copy complete literal text.

Section 03 is one detailed, editable inline SVG. It must explain browser state, verified caller/authorization, unified API dispatch, SQL tables and relationships, document embedding, database operations, persistence and response paths. Show actual ownership/trust boundaries and SQL transaction versus MongoDB document atomicity. Do not depict a distributed transaction or synchronization between engines. Retain identical topology and proportional scaling at every width, with an accessible description and native expanded explanation. Keep detailed configuration out of node labels.

The Working System adapts copies of the Adaptive Card Widgets product component and Flexbox Interfaces StyleStore header/order summary. Existing CSS demonstrations and earlier applications remain unchanged.

## File Ownership

All new application files belong to this standalone project. Proposed areas are `src/`, `styles/`, `assets/`, `supabase/`, `tests/`, `scripts/` and technical documentation under `docs/`.

Preserve the existing course projects, Resume pages and controllers, master prompts, original CSS-showcase sources and existing Git state. Do not import previous network-monitor behavior, quote-only copy, container metrics, credentials or historical QA as this application's functionality/evidence.

## Verification Stages

1. Baseline presentation and component sources; review schema/query design.
2. Verify hosted database connections without claiming application completion.
3. Write and observe failing tests, then implement domain validation and adapter/controller behavior.
4. Exercise real SQL and MongoDB CRUD, constraints, rollback, atomic updates, isolation and denied access.
5. Build and test the actual frontend, requests, persistence after reload, failure/retry states, keyboard controls and clipboard contents.
6. Verify two browser engines, responsive layouts, all inherited theme/mode combinations and fixed-SVG geometry. Run desktop/mobile Lighthouse with raw evidence.
7. Reconcile final source fingerprints and obtain independent specification/security/code-quality review.
8. Obtain local visual approval separately from the now-completed local Resume integration; verify public deployment before any recording walkthrough. Neither loopback preview is public publication.

Controlled fixtures may test error handling but never substitute for live-database evidence. Preserve failures and blocked checks honestly. Local execution, hosted connectivity, integration, publication and recording remain distinct states.

## Public Documentation Boundary

README and reusable prompt documentation must describe actual behavior and real evidence. Only public reusable showcase prompts may be reproduced, accurately labeled as reusable rather than historical submissions. Do not include conversations, actual submitted prompts, account details, credentials, consent exchanges or internal session records. Any historical-prompt evidence requirement remains unresolved rather than being fabricated.
