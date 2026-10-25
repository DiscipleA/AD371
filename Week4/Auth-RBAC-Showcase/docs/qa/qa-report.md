# Gatekeeper Lab — build verification

## Verdict

**Working standalone showcase with core live Supabase flows verified. Ready for visual review—not submission-ready or fully production-audited.** Formal recording QA, Lighthouse, final authenticated regression on the published revision, Resume integration, Git publication and the student's video remain separate stages.

Frontend: `http://127.0.0.1:8771/`. Backend: approved `AD371-Gatekeeper-Lab`, project `ggewxlydkxjutjiqnkhr`. Week 1, Technical_Interview, MasterPrompts and the live Resume were not modified.

## Core live evidence

The following were actual observations through the signed-in desktop preview and trusted target read-back—not injected responses. The student entered the real password privately. Passwords, tokens, hashes and private email addresses are omitted from this report.

| Supplied checklist / security check | Result | Scope / evidence |
|---|---|---|
| New account registration and email confirmation | **Verified** | Provider read-back: one registered account, one confirmed account |
| Successful login/session | **Verified** | Actual showcase signed in and received its own User resource |
| Invalid-password generic error | **Verified** | One intentionally invalid SQL-like password attempt produced `Invalid email or password.`; no successful login or server crash |
| Logout removes local credentials/session | **Verified** | UI signed out, protected output cleared, current server session row removed, next protected request 401 |
| User accesses User resource | **200** | Own-account resource and role User |
| User denied Admin | **403** | Actual Admin endpoint denial |
| Admin accesses User and Admin resources | **200 / 200** | Student explicitly approved temporary promotion of the same confirmed account; exact target row read back |
| Restore User / revoke Admin immediately | **Verified, then 403** | Temporary role row deleted, default User read back; same signed-in session denied Admin, then User request returned role User |
| Logged-out protected resource | **401** | Actual UI and raw hosted requests |
| Empty input rejected on client/server | **Verified** | Client emitted no request; real Auth login 400 and registration 422 |
| Special / SQL-like input | **Focused checks passed** | Invalid-email client check and real invalid-password rejection; exhaustive input matrix remains for formal QA |
| HTTP 200/401/403 | **Observed live** | Endpoint statuses visible in actual response inspector; a complete recorded DevTools capture is still pending |
| No unhandled JS / broken assets | **Local Chromium checks passed** | Full real-auth console/network capture remains pending; do not infer it solely from visible successful UI |

**Version boundary:** authenticated flows above were exercised on function version 2 before the final configuration-only key-validation hardening. Version 3 is deployed and has fresh Public 200 / logged-out User 401 / logged-out Admin 401 smoke in [live-version3-smoke.json](live-version3-smoke.json). Its SQL guard is unchanged. A fresh complete authenticated regression on the final deployed/frontend revision is explicitly pending formal QA.

**Account state:** temporary Admin elevation was reverted and read back. No permanent Admin account, second account, fresh Admin login, or shared privileged password is claimed. The current browser test session was logged out. Three session rows existed before local-scope logout; two other pre-existing rows remained afterward, consistent with signing out only the current session. This is not evidence that every device/session was revoked. Copied-token replay and revocation propagation remain **not run**.

**Hash audit:** a trusted aggregate query found one password account and one bcrypt-format hash, with one confirmed account. No hash or salt was returned. This format check plus official documentation supports managed bcrypt ownership; it is not a local hashing implementation or a password-strength proof.

## Local execution

| Suite | Real result | Evidence |
|---|---|---|
| Node backend/client/callback/presentation/SQL contracts | **56 passed, 0 failed** | [Output](final-source-tests.log) |
| Python local server tests | **3 passed** | Included with final source-test output; public-path/CSP checks |
| Chromium local browser suite | **11 checks passed** | [Report](browser-local.json), [observed stdout copy](final-browser-pass.log) |
| Firefox/Gecko local smoke | **4 checks passed** | [Report](firefox-local.json), [earlier follow-up output](firefox-focus-followup.log) |

Browser reports record actual executable/version, UTC capture time and source hashes. Earlier 47/48/54-test and 9/10-check runs are historical snapshots, **not additional unique coverage**.

Each engine checked seven inherited theme packages × light/dark × 1920×1080, 768×1024, 390×844 and 320×900 CSS viewports: **56 layout combinations per engine**. Assertions cover sheet loading, overflow and selected control visibility; screenshots are sampled. This is not all-theme contrast/accessibility certification. Real keyboard opening, sequential Tab, Escape focus restoration and closed-menu exclusion passed. Chromium also verified full prompt clipboard equality and no unexpected service requests, local asset errors or uncaught JS in its non-fixture checks.

The controlled browser case tests 401, generic login failure, login, User 200, Admin 403, simulated trusted promotion/demotion, stale-role display clearing, logout and 401. It validates browser orchestration only. Injected Auth/PostgREST handler tests do not prove hosted permissions. SQL source contracts do not execute PostgreSQL; the real deployed SQL was separately applied/read back and its no-claims/invalid-resource branches were exercised through trusted SQL.

## Hosted read-back

[Backend read-back summary](backend-readback-summary.md) documents RLS, private grants, empty definer search path, owner, normalized SQL body match, exact origin digest, function ID/version and gateway setting. The function is ACTIVE with `verify_jwt=false`; protected requests still require independent Auth + SQL checks. Source-body download through the connector failed twice; raw remote-source byte equality is **not claimed**.

[Live anonymous/input/permission checks](live-anonymous-api-followup.json) passed 11 focused checks: Public 200, logged-out User/Admin 401, invalid resource 400, forbidden origin 403, POST 405, approved preflight 204, anonymous RPC 401, unexposed private schema 406, empty login 400 and empty registration 422. An origin-based 403 is not substituted for the separately observed signed-in User/Admin denial.

Auth configuration read back: email confirmation required; unverified and anonymous sign-in disabled; minimum password length 12; JWT lifetime 900 seconds; refresh rotation enabled; exact loopback site/redirect URL. Default email restrictions remain; custom SMTP, CAPTCHA and app-specific distributed throttling are not implemented.

## Genuine findings and corrections

1. Configured resource controls stayed disabled: reproduced in Chromium, enabled only after successful client construction, regression passed.
2. Safe response filtering omitted the valid own-account scope: [RED](client-scope-red.log), narrowly corrected without forwarding arbitrary data.
3. Client initially trusted HTTP 200 even for malformed/wrong-resource data: [RED](malformed-response-red.log), added resource/identity/data checks and preserved actual status on invalid JSON. Follow-up review found array/empty-data cases; [RED](review-followup-red.log), corrected with resource-specific contracts. Independent narrow re-review approved both fixes.
4. Hosted version 1 failed closed with 503 because it did not read the current public-key dictionary: [original actual failures](attempts/hosted-env-initial503.json), [RED](hosted-env-red.log). Added validated dictionary support. Review found empty-default + legacy-fallback masking; added a failing test and rejected invalid selected dictionaries before fallback. Version 3 contains the final fix.
5. New CSP correctly forbids unsafe eval. A Playwright string predicate failed: [failed report](attempts/csp-harness-browser-local.json), [output](attempts/csp-harness-local-browser-run.log). Changed harness predicates to functions; **did not relax CSP**.
6. Firefox initially tested focus before the finite opening transition completed: [failed attempt](attempts/firefox-focus-initial.json). Waited for the transition, reran the same assertion and passed without changing application code.
7. Live role demotion denied Admin correctly but left stale Admin display text until a User refresh. [Reproduced RED](role-display-red.log); clear the stale label on an actual Admin 403. The current browser regression passes.
8. Confirmation on a phone succeeded at Supabase before redirecting to unavailable phone-local `127.0.0.1`. Verified confirmation in the database rather than resending or disabling verification; desktop login then succeeded. Local-vs-phone setup guidance is in README.

Original backend test-first evidence remains under `../../supabase/evidence/`. Source/spec review passed; security review approved the original candidate, then a focused review found and verified corrections. Review approval covers its inspected source, not every external runtime behavior.

## Remaining checks / external actions

- Final complete authenticated regression, direct authenticated RPC, metadata tampering/forged-token matrix, copied-token replay/expiry/races and outage scenarios: **not run fully live**.
- Full real-auth Chromium/Firefox console/network, accessibility/contrast review and Lighthouse desktop/mobile: **not complete / not run**. No scores copied or invented.
- Local visual approval: **pending student**.
- Current exact Resume source inspection/integration and published-origin Auth/CORS updates: **pending separate approval**.
- GitHub/public source, frontend deployment, live revision identity and applicable live QA: **pending authorized publication**.
- Student recording/upload and final submission links: **pending student**.

## Evidence integrity

[Preservation](preservation.json) compares protected sources against the pre-edit baseline. Browser report hash maps and `source-snapshot.json` identify source snapshots; recheck before reusing reports. Never sum overlapping attempts, copy Week 1 scores as Week 2 evidence, or include passwords, Authorization headers, private profiles, raw HARs, session tokens or privileged keys in deliverables.
