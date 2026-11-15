# Gatekeeper Lab

An App Engineering Showcase demonstrating managed authentication and server-enforced role-based access control. HTML, CSS, and JavaScript provide the frontend; Supabase supplies identity management, an Edge Function, and PostgreSQL authorization. No frontend build or self-hosted application server is required.

**Live portfolio edition:** [Gatekeeper Lab](https://chernichenkodmitriy.com/showcases/auth-rbac/). This folder is the standalone edition; the live site is maintained separately.

## 🏗️ Architecture and Request Flow

```text
Static host → Browser
                ├─ HTTPS credentials → Supabase Auth → In-memory session
                └─ Resource request → Gatekeeper Edge Function
                                       ├─ Public → Open response
                                       └─ User / Admin → Auth verification
                                                          → Guarded SQL RPC
                                                          → Session and role checks
                                                          → Authorized response
```

1. **Identity:** registration and email confirmation establish an account. Supabase Auth verifies credentials and manages salted bcrypt hashing; the showcase never stores or implements password hashes.
2. **Session:** the vendored client refreshes tokens while the page is active. Authentication stays in memory, not persistent browser storage. Reloading clears the page's login state without itself revoking the server session. Callback URL tokens are not imported.
3. **API boundary:** the browser requests `GET /functions/v1/gatekeeper?resource=public|user|admin`. Protected requests carry the caller's bearer token. A publishable key identifies project configuration, not a user.
4. **Authorization:** the Edge Function verifies protected callers through Auth, then invokes `gatekeeper_resource` with the same token. SQL independently checks `auth.uid()`, session ownership in `auth.sessions`, and the private role before returning data.
5. **Presentation:** the client validates response fields and displays the actual HTTP outcome. Local themes and light/dark mode do not affect permissions.

| Resource | Access | Successful response |
|---|---|---|
| Public | No login required | Public message |
| User | Valid authenticated session | Caller identity and own-account scope |
| Admin | Valid session and owner-assigned Admin role | Protected, non-sensitive briefing |

Missing or invalid authentication returns **401**; insufficient permission returns **403**; dependency/configuration failures return **503**. The Edge Function maps SQL's status envelope to HTTP codes. Direct RPC callers must inspect the envelope as well as transport status.

### SQL domain and relationships

Managed Auth owns identities/sessions; application SQL owns a private optional role and one protected briefing. These are the complete application table declarations from [the migration](supabase/migrations/202610230001_gatekeeper.sql), not the complete permissions/RPC installation:

```sql
create table gatekeeper_private.user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('User', 'Admin'))
);

create table gatekeeper_private.admin_briefing (
  singleton boolean primary key default true check (singleton),
  briefing text not null check (pg_catalog.length(briefing) between 1 and 1000)
);
```

```text
auth.users (managed)
  id [PK] 1 ───── 0..1 gatekeeper_private.user_roles.id [PK, FK]
          └───── 0..* auth.sessions.user_id (managed; RPC ownership lookup)

gatekeeper_private.admin_briefing
  singleton [PK; true only]   briefing
  (independent singleton; no foreign key)
```

Deleting an Auth user cascades to its application role row. Missing roles resolve to User, never Admin. The migration does not recreate provider-owned Auth tables. MongoDB/document modeling is N/A: no NoSQL store exists.

## 🔐 Security Responsibilities

- **Server-owned roles:** an absent role record defaults to User. Signup metadata and browser state cannot assign Admin; promotion requires trusted-owner SQL.
- **Private data:** role and briefing tables have RLS enabled and no browser-role table access. The authenticated RPC uses `SECURITY DEFINER`, an empty search path, and qualified relations. Its database owner remains trusted.
- **Public routing:** `verify_jwt=false` allows the Public route to reach the handler; protected routes still require Auth verification and SQL authorization.
- **Constrained inputs and outputs:** registration requires at least 12 characters; password input is limited to 72 UTF-8 bytes. Responses allowlist safe fields and exclude hashes, tokens, and raw provider errors.
- **Session-scoped logout:** the app requests `signOut({ scope: 'local' })`. The SQL guard checks session-row presence, but propagation, failed requests, and copied-token replay require separate verification. Immediate universal revocation is not claimed.
- **Defense in depth:** exact CORS origins, timeouts, no-store responses, and local-server CSP support the boundary. CORS is not authorization; production abuse protection and security certification are outside this educational scope.

## ⚙️ Setup and Configuration

**Requirements:** Python 3 and a modern browser; Node.js 22+ only for JavaScript tests. The Supabase client is included under `vendor/`; no npm installation is necessary.

From this folder:

```sh
python3 -B scripts/serve.py --port 8771
```

Open **http://127.0.0.1:8771/**. On Windows, use `py -3` instead of `python3`. Use HTTP, not `file://`; the server restricts public paths and directory access.

The frontend reads `config.js`, not `.env`:

```js
window.GatekeeperConfig = Object.freeze({
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY',
  functionName: 'gatekeeper'
});
```

Retain the supplied public settings for the existing demonstration. For a separate backend, follow [the backend guide](supabase/README.md): review the migration, deploy the function, set exact `ALLOWED_ORIGINS`, and configure Auth confirmation/redirect URLs. A different frontend port is a different origin. Never put service-role keys, database passwords, or user credentials in frontend files or Git.

### Provision a separate hosted backend (operator only)

The hosted path requires an isolated Supabase project, trusted SQL-owner access and an authenticated Supabase CLI for function deployment; it does not require a local Docker database. From this supplied folder:

1. In the approved project's SQL Editor, review and run [202610230001_gatekeeper.sql](supabase/migrations/202610230001_gatekeeper.sql) once. It creates the private tables/RPC and seeds the non-PII briefing. This migration uses `CREATE SCHEMA`/`CREATE TABLE` without `IF NOT EXISTS`: do not replay it against an already migrated project. It does not seed an account or an Admin.
2. Run [admin/attest.sql](supabase/admin/attest.sql) as owner for the RLS/grants/function checks. Its optional all-zero account placeholder is intentionally not a real user; do not infer account verification from it. Keep `gatekeeper_private` out of exposed Data API schemas.
3. Enable required email confirmation, a minimum 12-character password and the exact frontend site/redirect URL (`http://127.0.0.1:8771` for this server). Confirm email before login. A phone following a loopback redirect cannot reach the desktop server; confirmation and desktop login are separate events.
4. Set the hosted function's `ALLOWED_ORIGINS` to the exact frontend origin and use provider-injected URL/public-key settings as explained in [the backend guide](supabase/README.md#environment). Never replace these with a service-role key. With an authenticated CLI exposing the documented `--remote` selector, deployment is:

   ```sh
   supabase functions deploy --help
   supabase functions deploy gatekeeper --remote='<YOUR_PROJECT_REF>' --no-verify-jwt --use-api
   ```

   Check the installed CLI help and target before execution; older CLI releases may expose `--project-ref` instead of `--remote`. Use the selector actually supported, never an implicit linked target. `--use-api` bundles server-side without Docker ([CLI reference](https://supabase.com/docs/reference/cli/supabase-functions-deploy)).
5. Read back `verify_jwt=false`, public 200 and unauthenticated protected 401; configure the frontend's public values, then follow the [live-verification checklist](supabase/README.md#logout-revocation-and-required-live-verification). Admin promotion is optional, separately authorized owner work via [the guarded template](supabase/admin/promote-admin.sql), never signup metadata. Do not seed passwords or role grants into browser configuration.

The backend guide also describes an optional disposable local stack, but its strict internal-HTTP networking blocker remains unresolved. The hosted recipe above does not claim that local Edge/Auth integration is working.

## 🧪 Verification and Project Files

```sh
node --test tests/backend.test.mjs tests/sql-contract.test.mjs tests/client.test.mjs tests/callback.test.mjs tests/presentation.test.mjs
python3 -B tests/server_test.py
```

Controlled tests verify handler, client, SQL-source, presentation, and server contracts—not live account permissions. [Included QA records](docs/qa/qa-report.md) describe historical snapshots and limitations, not a current all-green security certification.

| Location | Responsibility |
|---|---|
| `index.html`, `styles/` | Seven-section explanation, responsive diagrams, and local themes |
| `scripts/` | Auth client, working-system controls, callback cleanup, and local server |
| `supabase/` | Migration, Edge handler, configuration, and trusted-owner tools |
| `tests/`, `docs/` | Verification sources, assignment, and supporting records |

## QA Test Summary

Recorded checks are documented in the [QA report](docs/qa/qa-report.md). Checked means executed/documented for the stated snapshot, not a new run or a security certification.

- [x] **Hosted authentication/RBAC:** registration/confirmation, login, User 200, Admin denial 403, temporary role grant/revocation and logout/protected 401 were observed on function version 2; version 3 has separate anonymous smoke evidence.
- [x] **Constraints and permission boundaries:** empty/invalid input, resource/method/origin rejection, private-schema access and independent authorization checks were exercised ([hosted follow-up](docs/qa/live-anonymous-api-followup.json)).
- [x] **Terminal inspection:** 56 Node checks and three Python server checks passed in the recorded run ([actual output](docs/qa/final-source-tests.log)).
- [x] **Automated browser console/network inspection:** local Chromium/Firefox checks captured errors/assets and controlled Auth scenarios; fixtures are distinguished from actual hosted permission evidence ([browser record](docs/qa/browser-local.json)).

**Inspection method:** recorded automated network/console observations and terminal output are inspection evidence, not a claimed manual DevTools GUI session. The genuine remaining gate is a full authenticated regression/console-network capture on the final function revision, plus copied-token replay/propagation checks—not an extra GUI requirement.

**Storage scope:** SQL supports identity/role authorization; general-purpose SQL/NoSQL CRUD is not this showcase's feature. No MongoDB verification is claimed.

## 🤖 AI Assistance

Hermes Agent assisted implementation, tests and documentation. The [public AI prompt workflow](AI-PROMPTS.md) contains only the reusable **Review → Plan → Build → Verify** prompts published in the showcase. Exact submitted prompts/conversations remain private; reusable prompts are not historical-submission evidence.

Review/read-back supports server-owned roles, session ownership checks and restricted private tables. Genuine corrections included the hosted public-key dictionary failure (503), malformed response validation and stale Admin display after demotion ([findings](docs/qa/qa-report.md#genuine-findings-and-corrections)). These are configuration/client corrections, not invented schema-normalization defects or claims of unaided manual authorship.

## 🎥 Demonstration & Submission Links

| Item | State |
|---|---|
| Public frontend | Live portfolio edition linked above; maintained separately |
| Standalone source / video | No separate public repository or uploaded video URL established here |
| Lighthouse | No completed Lighthouse scores established by the linked QA snapshot |

Show Public, signed-in User, Admin denial and logout outcomes without exposing tokens/passwords. Distinguish the version-2 authenticated evidence from version-3 anonymous smoke; do not present the pending final authenticated/replay checks as completed.

## 💡 Reflection

Identity verification and private SQL authorization are separate defenses. Temporary elevation/demotion read-back is stronger evidence than a UI role label, but it does not replace final-version authenticated and token-replay testing.
