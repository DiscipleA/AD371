# Gatekeeper Lab — approved standalone plan

## Authorization and boundaries

User approved Supabase and a standalone build in `/home/reader/Desktop/AD371/Week2/Auth-RBAC-Showcase`. Preserve `/home/reader/Desktop/AD371/Week1`, its `Technical_Interview`, all MasterPrompts, and the live Resume. No Git initialization/staging/commits/pushes, paid resources, account/project mutations or deployment without approval of the exact target. User accepts Supabase Auth as the managed credential backend; do not claim locally implemented password hashing or instructor approval.

## Selected architecture

HTML/CSS/vanilla JavaScript, reference-derived presentation, local visual themes. Supabase Auth handles email/password registration, verification and bcrypt hashing. Browser client uses a pinned, locally vendored Supabase SDK with session persistence disabled, URL session detection disabled, and memory-only tokens. No role picker, privileged keys, copied cloud-theme backend or stored password fields. One `gatekeeper` Edge Function handles `?resource=public|user|admin`, verifies user identity with Supabase Auth, and calls a least-privilege SQL RPC with the caller JWT. SQL independently checks auth identity, an active `auth.sessions` row and an owner-managed role; metadata never grants admin. Public registration produces User by default. Administrative provisioning is trusted SQL only and separately approved.

## API contract

- Config: `window.GatekeeperConfig = Object.freeze({supabaseUrl: '', publishableKey: '', functionName: 'gatekeeper'})` in `config.js`; placeholders mean NOT CONNECTED, never simulation.
- Browser entry: `scripts/showcase.js` (ES module) imports `scripts/auth-client.mjs`; local SDK under `vendor/supabase.js`.
- API: `GET <supabaseUrl>/functions/v1/gatekeeper?resource=public|user|admin`, `apikey` publishable key; optional `Authorization: Bearer <access_token>`; never send token in URL.
- Success JSON: `{resource, message, user?: {id,email,role}, data?: object}`; no tokens/passwords in inspector.
- Errors JSON: `{error: string}`; 400 invalid resource/query, 401 absent/invalid/revoked session, 403 non-admin/origin, 405 method, 503 unavailable dependency. Response headers no-store and nosniff; exact CORS allowlist in environment, not security-by-CORS.
- SQL RPC: `public.gatekeeper_resource(p_resource text)` returns `{status: number, body: object}`. Only authenticated role may execute. Definer function uses empty search_path, fully qualified names, parameterized operations and narrow JSON allowlist. Role storage is private, not exposed through REST. Protected data requires current session and role checks even for direct RPC calls.
- Frontend IDs: `auth-form`, `auth-email`, `auth-password`, `auth-action`, `auth-register`, `auth-login`, `auth-logout`, `auth-message`, `auth-session`, `auth-role`, `request-public`, `request-user`, `request-admin`, `request-status`, `request-output`, `request-message`, `connection-status`. All inputs labeled; no accidental form submission by resource buttons. Keep resource actions available when logged out so 401 can be demonstrated after connection.

## Local file ownership

Frontend implementation owns `index.html`, `styles/auth-rbac-showcase.css`, `theme.js`, `site-navigation.js`, `copy-code.js`, `styles/shared/`, `styles/themes/` and presentation contract tests. Parent owns `config.js`, `scripts/auth-client.mjs`, `scripts/showcase.js`, vendored SDK, documentation, QA tooling and local server. Backend implementer owns `supabase/` and `tests/backend.test.mjs` / `tests/sql-contract.test.mjs`. Do not cross-edit concurrently.

## Presentation

Keep seven direct section cards in reference order: Problem & Scope, Architecture Concepts, System Architecture, AI Prompt, Audit, Working System, Verification. Maintain familiar hero/process strip, copy/disclosure panels, full-width readable cards and local themes. Browser observations show actual responses only; never fake a backend while unconfigured. No public QA report links/internal process essays. Shared portfolio controllers remain authoritative at eventual integration; no Resume path requested yet.

## Requirement mapping (summaries of supplied assignment)

| ID | Mandatory requirement | Implementation / evidence | Initial state |
|---|---|---|---|
| R1 | Functional registration/login/logout | Supabase Auth client, forms, real-session checks | Planned |
| R2 | User and Admin authorization | private role table + SQL guard + Edge Function | Planned |
| R3 | Public, authenticated User, Admin-only resources | resource controls and actual HTTP statuses | Planned |
| R4 | Salted slow password hashing audit | official Supabase bcrypt docs + safe SQL hash-format attestation, no hashes returned | Planned |
| R5 | Server-side role enforcement | independent RPC guard, metadata-escalation/replay tests | Planned |
| R6 | Secret safety, stripped sensitive fields | env-only server settings, publishable browser config, response allowlists | Planned |
| R7 | Generic login failures | same frontend wording for invalid account/password, provider limitations disclosed | Planned |
| R8 | Client/server validation, hostile input | form validation + Auth provider validation + strict resource parsing | Planned |
| R9 | QA AuthN positive/negative checklist | real live tests once provisioned; local fixture tests clearly separate | Not run |
| R10 | QA 200/401/403, console health | browser/network captures and raw API tests | Not run |
| R11 | README setup/env/AI appendix/QA | README + genuine AI-PROMPTS + portable docs/qa | Planned |
| R12 | GitHub, deployment/live URL, video | separately approved external actions; user recording | Pending external action |

## Security audit before backend execution

Review source and SQL for client-assigned roles, unsafe security-definer search_path, PUBLIC execute, leaked secrets, password/hash exposure, invalid JWT acceptance, forbidden direct table grants and stale logout credentials. Fail closed on missing environment, role lookup, expired session or upstream failures. Show no success indicators without actual observed responses. Email verification, minimum password policy and auth rate-limit settings require inspection on the approved project. Do not disable email confirmation for speed.

## Verification sequence

Tests first with RED evidence, then implementation and GREEN. Run backend handler tests, client validation/session/race tests and presentation contracts. These controlled tests are not live Supabase results. After exact-project approval, apply migration/deploy function and verify read-back plus real public/no-token/User/Admin/forged-role/logout-replay paths. Browser smoke and visual screenshots at 1920x1080, 768x1024, 390x844 and 320x900 in Chromium and Firefox where available. Formal full QA/Lighthouse may follow build per user request; mark not-run accurately. Open actual local page for visual review. No checkpoint ZIP requested.

## Official sources

Accessed during this run (local date from system clock): Supabase docs `/guides/auth/password-security`, `/guides/auth/sessions`, `/guides/functions/auth`, `/guides/functions/auth-headers`, `/guides/functions/secrets`, `/guides/database/postgres/row-level-security`, `/reference/javascript/auth-getuser`, `/reference/javascript/auth-signout`, `/guides/auth/rate-limits`. Concrete URLs and verified boundaries will be recorded in README/architecture notes.

## Build checkpoint

Standalone source and core live Auth/RBAC flow are implemented and verified; exact-project consent and temporary test elevation were obtained. The approved Supabase migration and final function version 3 are deployed; the temporary Admin row was removed and default User restored. Node56/server3/Chromium11/Firefox4 checks passed. Source-detailed QA status is in `docs/qa/qa-report.md`; it distinguishes version-2 authenticated flows from final version-3 anonymous smoke. Visual approval, full formal QA/Lighthouse, final-revision authenticated regression, current Resume source inspection/integration, Git publication and student recording remain pending. No checkpoint ZIP requested. The earlier requirement table is the initial plan, not an all-green final verdict.
