# Verification Record — Local v3 Checked; Hosted MongoDB Blocked

Captured November 12, 2026 (America/Los_Angeles, PST). This record separates controlled tests, real database execution and hosted requests. It is **not full two-engine release or submission approval**. Independent specification and code-quality reviews of the final narrow-CSS delta are approved; hosted MongoDB remains blocked.

## Tested snapshot

The v3 runtime contains the Unicode, theme-contrast and narrow-layout repairs. Its JavaScript bundle remains byte-identical to the reviewed Unicode-corrected bundle. The only runtime change from v2 is `styles/storefront.css`.

- [Tested file hashes](tested-snapshot-final-v3.json): 67 runtime, 16 test and 50 built files.
- All 50 production files were fetched from the loopback preview and byte-compared with `dist/`.
- Nine reviewed backend files and 106 protected reference files remain unchanged. Original portfolio/coursework sources were not edited.
- Preview: `http://127.0.0.1:8797/`. Public frontend deployment and Resume integration are not established by localhost results.

## Executed checks

| Scope | Actual result | Boundary |
|---|---|---|
| Current unit/source suites | 81 passed, 0 failed, 0 skipped | Includes the overlapping 53 backend/domain/SQL and 28 frontend/presentation checks; not live database proof. [Log](unit-source-tests-final-v3.log) |
| Final production browser suites | 9 passed, 0 failed, 0 skipped | Chromium 156.0.8078.4 and Firefox 157.0. Functional/Unicode scenarios use labeled Auth/API fixtures; presentation and narrow-layout cases render real built assets. [Log](browser-tests-final-v3.log) |
| Narrow populated controls | 56 cases; 168 label checks; zero failures/errors/external requests | Both browsers, seven themes, both modes, 320/390px, four products, short/80-ASCII/80-emoji input. Actual child containment, unfractured words, 44px controls, quantity editing and removal checked—not merely root overflow. |
| Final page-wide axe | 56 cases, zero detected violations/page errors | Real built styles, no excluded rules/nodes within the stated WCAG tags. **Manual-review incompletes remain**; see below. [Raw report](axe-matrix-final-v3.json) |
| Final visual capture | Eight representative states; zero failed assets, page errors or remote requests | Desktop 1920px, tablet 1000px, phones 390/320px and targeted repaired palettes. These show local drafts, not persistence. [Capture record](visual-evidence.json) |
| Final hosted SQL browser flow | 21 actual Edge responses; zero uncaught errors | No intercepted responses. Observed 200/201 and expected 400/404; create, rename, quantity update, remove item, reload/read, delete/read-back and invalid quantity. [Log](hosted-sql-browser-final-v3.log) |
| Hosted SQL API acceptance | 9 runner-reported tests passed: parent plus eight subtests | Explicit SQL-only partial mode. Covers owner denials, auth/CORS, malformed/boundary input, direct RPC and concurrent quota. **Does not verify hosted MongoDB or cross-engine isolation.** [Log](live-api-sql.log) |
| Direct real storage acceptance | Passed, exit 0 | Actual PostgreSQL and Atlas execution, not browser fixtures. [Log](live-storage.log) |
| Independent source reviews | Backend, Unicode-corrected frontend/JS/server, v2 contrast and final v3 narrow delta approved | Separate scoped specification/security/code-quality reviews; not blanket live-deployment approval. [Record](independent-review.md) |

Repeated runs are not additional unique tests. The nine browser tests and nine API runner tests are different runners; no combined coverage total is claimed.

## Real database integrity

`tests/live-storage.mjs` and `tests/live-sql.sql` exercised genuine databases through operator-supplied private configuration. Credentials are not included in these artifacts or command arguments.

Verified:

- PostgreSQL foreign-key orphan rejection, parent-delete cascade, indexes/RLS/grants/catalog and authenticated direct-RPC CRUD/boundaries/quota.
- Deliberately rejected second-child SQL insertion: failure returned 503, parent and first child rolled back, fault DDL rolled back, baseline restored.
- MongoDB strict validators/indexes, persisted owner-filtered CRUD, atomic `$push`/`$set`/`$pull`, uniqueness and multi-document transaction behavior.
- A monitored complete-order MongoDB read issued exactly one `find`, without collection joins.
- Concurrent 12-create quota exercise: ten commits and two conflicts. A counter increment followed by validator rejection rolled back together.
- Scoped cleanup verified no remaining QA orders and zero owner counts; zero-count counter documents were retained.

“Controlled fault on real storage” means a deliberately introduced failure executed through the genuine driver/database. It does not mean a provider outage was tested. Direct Atlas tests do not prove Edge Function → Atlas connectivity.

## Lighthouse: final v3, default theme

Lighthouse 13.6.0, fresh anonymous headless Chromium 156.0.8078.4, sequential audits with no concurrent browser suite. Target was the exact local preview URL above—not a public deployment. Desktop uses the desktop preset; mobile uses simulated mobile throttling and 4× CPU slowdown. Raw JSON contains complete settings and capture timestamps.

| Run | Performance | Accessibility | Best practices | SEO | FCP / LCP | TBT | CLS |
|---|---:|---:|---:|---:|---|---|---|
| Desktop, 05:03:25 PST | 99 | 100 | 100 | 100 | 0.5s / 0.5s | 80ms | 0.048 |
| Mobile, 05:03:41 PST | 73 | 100 | 100 | 100 | 2.1s / 2.1s | 1,170ms | 0 |
| Same-v3 mobile follow-up, 05:06:20 PST | 80 | 100 | 100 | 100 | 2.1s / 2.1s | 670ms | 0 |

The lower mobile run is retained, not replaced by the better score. Mobile main-thread blocking is a measured prototype limitation. The follow-up reported a slow-CPU calibration warning; the first mobile run and desktop did not. CPU/load variation was observed, but is not proven to explain all score differences. No runtime optimization or score manipulation was performed between these two mobile runs.

- Desktop: [HTML](lighthouse-final-v3-desktop.report.html), [JSON](lighthouse-final-v3-desktop.report.json).
- Mobile: [HTML](lighthouse-final-v3-mobile.report.html), [JSON](lighthouse-final-v3-mobile.report.json).
- Mobile follow-up: [HTML](lighthouse-final-v3-mobile-followup.report.html), [JSON](lighthouse-final-v3-mobile-followup.report.json).

Earlier reports belong to earlier snapshots and remain historical. Default-theme Lighthouse accessibility 100 is not all-theme or full accessibility certification.

## Corrections and open findings

1. **Unicode — corrected:** frontend UTF-16 length checks rejected valid astral labels. Code-point counting and input/response regressions now pass; the fresh frontend specification review approved the correction.
2. **Contrast — corrected for detected violations:** the original 56-case matrix had 16 failing cases. Minimal showcase-local color rules were applied; the original [failed report](axe-matrix-initial-failed.json) is retained. The final v3 report is complete, not the earlier intermediate matrix.
3. **320px containment — corrected:** the input's intrinsic grid width exceeded its form while the summary flex row fractured product words. Bounded tracks/input width and a phone-only two-column item arrangement fixed the reproduced defect. The original [failed screenshot](screenshots/before-narrow-fix/gothic-stickerboard-light-320-working.png) is retained; final screenshots and direct child-bound tests confirm the repair.
4. **Accessibility manual review — open:** all 56 axe cases retain `aria-prohibited-attr` and `color-contrast` incompletes concerning generic-container labeling and gradients. Zero automated violations is not a claim that these assessments are complete or that WCAG is certified.
5. **Mobile performance — measured limitation:** the two same-snapshot runs above show remaining blocking time. This is not silently promoted to a pass at an invented score threshold.
6. **Verifier correction:** the initial hosted SQL script expected plural “orders” for one record. Matching singular/plural corrected the verifier; it was not an application repair.
7. **Legacy favicon fallback — missing:** direct `GET /favicon.ico` returns 404. The page's declared SVG favicon returns 200 `image/svg+xml`, and normal browser suites recorded no failed asset requests. The legacy root fallback is a known standalone limitation, not a hidden successful check.

Narrow-layout [RED](narrow-layout-red.log) and [GREEN](narrow-layout-green.log) runner logs are retained alongside the before/after screenshots.

## Reproducing local checks

Validated tooling: Node 22.23.2; Playwright client 1.64.0; `@axe-core/playwright` 4.14.0; Lighthouse 13.6.0; MongoDB driver 7.8.0 for direct storage checks. QA packages/browsers are external to the application dependency tree. Browser fixture runners also require Python Playwright.

```sh
node --test tests/*.test.mjs

# Point these at the operator's existing compatible external QA installation.
export SAVED_ORDERS_QA_MODULES=/absolute/path/to/qa/node_modules
export SAVED_ORDERS_CHROMIUM=/absolute/path/to/chromium-executable
export SAVED_ORDERS_FIREFOX=/absolute/path/to/firefox-executable
node --test --test-concurrency=1 tests/*.browser.mjs
```

`SAVED_ORDERS_CONTRAST_REPORT` optionally writes an axe JSON report. Do not set `SAVED_ORDERS_CONTRAST_SOURCE` for built-artifact acceptance, or `SAVED_ORDERS_CONTRAST_AFFECTED` when claiming the full 56-case matrix. The portable workspace's verified Chromium headless-shell binary avoided full-browser profile-lock problems. Lighthouse was run separately, never concurrently with browser suites. Live API/storage runners have separate private-configuration prerequisites documented in the README and their source; they are not part of the offline command.

## Screenshots

- [1920px working system](screenshots/gothic-stickerboard-light-1920-working.png).
- [1000px working system](screenshots/gothic-stickerboard-light-1000-working.png).
- [390px working system](screenshots/gothic-stickerboard-light-390-working.png).
- [Corrected 320px working system](screenshots/gothic-stickerboard-light-320-working.png).
- [Phone fixed-composition architecture](screenshots/gothic-stickerboard-light-390-architecture.png).
- [Actual hosted SQL record](screenshots/hosted-sql-working-system.png).

Document-coordinate crops were taken after scrolling to the document top, avoiding a fixed-navigation overlay artifact from tall-element screenshots. Desktop and phone architecture retain the same SVG topology; explanatory caption/disclosure text stays normal page text.

## Remaining gates

- **Blocked/pending external action:** install the private `MONGODB_URI` in the isolated function project. Fresh secret-name read-back did not list that name; non-sensitive database/origin settings are present.
- **Not run:** successful hosted Edge Function → Atlas CRUD and complete two-engine `tests/live-api.mjs` acceptance, including dataset isolation. A local Atlas connection is not a substitute.
- **Pending:** standalone visual approval. Final v3 source-review gates are closed; known findings above remain disclosed.
- **Not performed:** Resume integration, Git publication, public frontend deployment, recording/upload or academic submission. These require the applicable separate approval and verification.
