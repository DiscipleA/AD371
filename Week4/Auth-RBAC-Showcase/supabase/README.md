# Gatekeeper Supabase backend

## Status and evidence

The migration and hosted Edge Function have now been applied to the separately approved Gatekeeper project; actual versions, runtime findings and target read-back are recorded in `../docs/qa/backend-readback-summary.md`. Real authenticated User/Admin and replay evidence remains a separate gate. `tests/backend.test.mjs` exercises the real shared handler using controlled external Auth/PostgREST responses; these are **not live Supabase tests**. `tests/sql-contract.test.mjs` checks source contracts, not PostgreSQL behavior. `evidence/red.log` preserves the missing-feature failure run before backend implementation; `evidence/green.log` is historical backend-only evidence. Current follow-up runs and genuine hosted failures/results are under `../docs/qa/`. A passing source contract is not proof of deployed SQL permissions or account authentication.

Run from the standalone project root (Node 22+, no dependencies):

```sh
node --test tests/backend.test.mjs tests/sql-contract.test.mjs
node --check supabase/functions/_shared/gatekeeper.mjs
```

## Security audit BEFORE execution

Review migration, Edge handler, deployment target and account identity independently. Do not apply to Week1, the live Resume, or an unrelated Supabase project. External migration/deployment/account promotion require separate approval of the exact project and account. Never run a database reset against a live or linked project. No deployment or account changes are authorized by this README.

- `config.toml` sets `verify_jwt = false` intentionally so anonymous public GET requests reach the handler. This removes platform JWT enforcement: every protected request must pass `GET /auth/v1/user` with the actual caller bearer and a public project key, then a bearer-scoped `POST /rest/v1/rpc/gatekeeper_resource`. JWT shape checking is only input hygiene, not signature verification. The handler never decodes a caller JWT to trust its claims.
- The protected RPC independently obtains `auth.uid()` and `auth.jwt()->>'session_id'`, validates UUID syntax, and finds that exact session belonging to that exact user in `auth.sessions`. Metadata, role headers, browser state and extra query fields grant nothing. No role parameter, writable API role table, service-role dependency or dynamic SQL exists.
- `gatekeeper_private` is not an exposed Data API schema. Both tables use RLS with no API policies; API roles have no schema/table privileges. An absent private `user_roles` row defaults to `User`. Only approved trusted-owner SQL can promote an existing verified account. There is no automatic first-user admin.
- The RPC deliberately uses `SECURITY DEFINER`, empty `search_path`, qualified relations/functions, and only authenticated execute. Its public callable surface is narrow, **not its owner**: `postgres` has broad privileges including reading `auth.sessions` and `auth.users` and bypasses RLS. The migration author, project SQL owner and any person able to replace the function are trusted. Audit effective grants/ownership, exposed schemas and security-advisor results after applying and after upgrades. Do not blindly suppress a definer warning. A narrower dedicated owner is an independently audited future hardening option, not provisioned here.
- Only the caller's id/email/private role are returned; user data is a fixed own-account scope. Admin reads one private non-PII briefing, never an `auth.users` listing. No hash, password, access token, refresh token, metadata blob or raw upstream error is returned. Edge response fields are explicitly reconstructed, including fixed messages and allowlisted data keys. This does not sanitize an owner's deliberately malicious briefing; the trusted seed/content must stay non-PII.
- Responses set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; exact CORS applies to GET/OPTIONS. No credentials cookie is used. Missing Origin permits CLI/server callers, so CORS is not authorization. Hostile browser origins cannot receive protected responses. Caller bearer still governs all protected access, including direct RPC.
- Each upstream fetch **including JSON consumption** has an 8-second timeout, no redirects and no cache. Protected calls are sequential, so two healthy-but-slow upstream operations can approach 16 seconds total. Dependency failure is a generic 503; no logs contain tokens or upstream bodies. No app rate limiter is implemented: audit Auth rate limits, abuse protection and project limits separately.

## Environment

`functions/gatekeeper/index.ts` is a thin Deno bootstrap importing `../_shared/gatekeeper.mjs`; the shared Web API code is the same module Node tests execute. It uses only Web APIs, not an unpinned SDK dependency.

| Variable | Rule |
|---|---|
| `SUPABASE_URL` | Exact approved API origin, HTTPS, no credentials/path/query/fragment; optional trailing slash. HTTP allowed only for localhost, 127.0.0.1 or [::1]. |
| `SUPABASE_PUBLISHABLE_KEY` | Preferred if explicitly supplied; `sb_publishable_...` public key. Never a secret key. |
| `SUPABASE_ANON_KEY` | Legacy public JWT fallback when publishable key is absent. Never a service-role key. |
| `ALLOWED_ORIGINS` | Required comma-separated canonical origins, e.g. `http://localhost:4173,http://127.0.0.1:4173,https://showcase.example`; no wildcard, trailing slash, path or remote HTTP. Every actual browser origin/port must be listed exactly. |

Runtime missing/invalid environment fails closed with 503 even for public requests. Browser config uses only the same approved URL/public key and function name `gatekeeper`; never copy server DB credentials.

Supabase's current environment documentation lists `SUPABASE_URL`, legacy `SUPABASE_ANON_KEY` and a `SUPABASE_PUBLISHABLE_KEYS` **plural JSON dictionary**. After an actual hosted version-1 configuration failure, the bootstrap was updated to pass that dictionary, and the shared handler validates its nonempty `default` publishable key before any fallback. Explicit singular publishable configuration and the legacy anon fallback remain supported; an invalid selected dictionary fails closed even when an anon key coexists. Version 2 returned public HTTP 200. Preserve/read back `verify_jwt=false` after deployment: the connector deployment tool defaults it back to true and does not expose an override field. Reserved `SUPABASE_` names need not be created manually.

### Local serving / dry-run checklist (commands are instructions, NOT executed here)

1. Install/approve Supabase CLI and Docker separately if needed. Inspect their real versions and `--help`; this delivery installs no packages. The minimal `config.toml` is standalone, not permission to replace another project's config.
2. Audit the migration as trusted project owner. On a separately approved disposable local stack, use `supabase start` and `supabase migration up --local` (verify installed CLI help first) to apply reviewed pending migrations; do not start it against unreviewed files. `supabase db diff --local --schema public,gatekeeper_private` compares to a shadow database; it is **not** a pure syntax check and may start containers. `supabase db lint --local --schema public,gatekeeper_private --fail-on warning` provides additional SQL checks with a failing exit code for findings. None was run by Node tests.
3. Make an ignored `supabase/functions/.env` from the approved values (use `.env.example` only as a template). Supabase-provided variables should come from the runtime, not duplicate reserved names blindly. `ALLOWED_ORIGINS` must match the frontend port exactly.
4. `supabase functions serve gatekeeper --env-file supabase/functions/.env` uses this function config. A standard local CLI container may supply an internal HTTP URL such as `http://kong:8000`; strict URL policy intentionally rejects non-loopback HTTP. **Local CLI container networking remains an integration blocker until inspected.** Do not widen it to arbitrary HTTP or assume container localhost reaches the host. Use an audited HTTPS approved endpoint, or a separately reviewed narrowly scoped local-network adaptation; local source tests alone do not resolve this.
5. For a separately approved linked target, inspect `supabase db push --linked --dry-run` before deciding whether to authorize the actual push. Dry-run lists migrations; it does not execute/validate their SQL or prove permission safety. No remote link, push, secret write or deployment is performed by these instructions.
6. Only after exact-target approval, deploy `gatekeeper` with this `config.toml`, read back its `verify_jwt=false` setting, set/read back allowed origins without printing secrets, apply migration and run `admin/attest.sql` as owner. Read back the approved promotion row after an independently approved `admin/promote-admin.sql` execution. The all-zero UUID guard deliberately prevents accidental promotion.

Add actual env files and local state to the project's ignore rules before any future publication; this subdirectory's `.gitignore` already ignores its own env/state files. No Git actions are part of setup here.

## HTTP contract

`GET /functions/v1/gatekeeper?resource=public|user|admin`, optional bearer only in `Authorization` (never URL). Browser may also send a public `apikey`. Incoming apikey is not identity and is never forwarded as trusted config. Handler calls Auth/PostgREST using its validated public environment key plus the same caller bearer.

- `public`: 200 with `{resource,message}`, no JWT or external Auth/RPC request.
- `user`: 200 with `{resource,message,user:{id,email,role},data:{scope:'own-account'}}`.
- `admin`: same minimal user shape plus `data:{briefing}`; requires private Admin role.
- Errors are only `{error:string}`. Invalid query/resource/extra fields: 400; absent/invalid/revoked JWT/session: 401; ordinary User requesting admin or disallowed Origin: 403; unsupported method: 405; missing configuration, failed dependency, invalid trusted response, timeout: 503.
- OPTIONS: exact approved Origin, requested GET, and only authorization/apikey/content-type/x-client-info headers; 204 with controlled CORS. Unknown origins are not echoed. No wildcard.
- RPC transport returns an envelope `{status,body}` as PostgreSQL JSON. The Edge handler maps the envelope to real HTTP 200/400/401/403. A **direct** PostgREST RPC call can return HTTP 200 while its JSON envelope says 401/403; inspecting HTTP alone is insufficient. Permission/JWT failures may instead be transport 401/403. Edge never forwards arbitrary upstream messages.

## Logout, revocation and required LIVE verification

Supabase normally permits already-issued access tokens until JWT expiry after sign-out. The extra session-row lookup implements the documented stronger gate **after the affected row is removed**. It cannot make an unsupported immediate-revocation guarantee: Auth response propagation/cache, database transaction snapshots, requests already in flight and failed/offline logout all matter. No gatekeeper session/role cache is used, and no-store is required at proxies too. A snapshot taken before revocation can finish afterward; serialize logout and subsequent tests. Local-only UI token deletion is not confirmed server logout. Record provider errors rather than reporting success.

Session-row presence is not proof that configured inactivity/time-box limits have been reached: Supabase documents deferred session cleanup for those policies. This implementation verifies row ownership/presence and PostgREST token validity, not all paid-plan timeout policies. Audit project settings and actual session schema/access; missing table/permission must remain a failure, never a bypass.

Required real target tests (all pending; use disposable approved User/Admin accounts and never save bearer/passwords in logs):

1. Public without bearer 200; user/admin without bearer 401; invalid query 400; POST 405; approved/hostile preflights and origins.
2. Confirmed normal login: User resource 200, Admin 403. Change user metadata and request headers/query to Admin: still denied. Query extra fields must be rejected, not interpreted.
3. Owner-approved promotion: Admin resource 200. Verify exact role row read-back; demote via trusted owner SQL and verify same still-valid JWT immediately loses Admin authorization. Never trust stale UI role text.
4. Forged/expired/altered JWT 401 before RPC; another user's session_id must not satisfy the ownership check. Direct RPC User/Admin outcomes must match its envelope; anonymous execute and private-table reads/writes must fail. Test malformed session_id safely.
5. Copy a token **in memory only**, perform real successful `signOut({scope:'local'})` for that session, then replay it against both Edge and direct RPC. Require 401/envelope401 after auth.sessions row removal, record propagation delay, verify unrelated sessions behave per signout scope. Check upstream/cache behavior; do not call the controlled revoked-session fixture a real logout test.
6. Auth/RPC outage and missing grants =>503, not protected success. Inspect response/console/network logs for no token/hash/other-user leakage. Do not publish request headers, JWTs or DB connection strings as evidence.
7. Verify email confirmation, password policy, rate limits and generic login-failure behavior on the approved Auth configuration. Managed bcrypt is not locally implemented or locally attested.

## Official primary references reviewed

Source lookup was performed during this build (system local date October 22, 2026). The extraction backend failed, so direct HTTPS retrieval verified all eight primary sources with HTTP 200; `evidence/source-review.json` records provenance, term matches and short excerpts. The failed extraction evidence is retained separately. Recheck against the exact deployed versions; no dependency/API version was invented.

- Supabase `https://supabase.com/docs/guides/auth/sessions`: JWT `session_id`, auth.sessions correlation, signout row removal and deferred inactivity/time-box cleanup.
- Supabase `https://supabase.com/docs/reference/javascript/auth-getuser`: network-authenticated user lookup, unlike trusting locally stored session data.
- Supabase source `https://raw.githubusercontent.com/supabase/auth-js/master/src/GoTrueClient.ts`: explicit-token `_getUser` uses GET `${this.url}/user` with the JWT.
- Supabase `https://supabase.com/docs/guides/functions/auth-headers`: platform verify_jwt switch and responsibility for authorization when disabled.
- Supabase `https://supabase.com/docs/guides/database/functions`: security-definer owner authority, empty search_path and explicit function execute revocations.
- Supabase `https://supabase.com/docs/guides/functions/secrets`: injected runtime keys, plural publishable dictionary and local env-file serving.
- Supabase `https://supabase.com/docs/reference/cli/supabase-db-diff`: database push dry-run and shadow-database diff behavior.
- Supabase `https://supabase.com/docs/guides/auth/password-security`: managed bcrypt hashes with random salts in auth.users.encrypted_password; optional trusted-only format attestation returns booleans, never hashes.
