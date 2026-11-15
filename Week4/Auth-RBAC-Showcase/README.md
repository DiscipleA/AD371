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
- [ ] **Manual DevTools inspection / full real-auth capture:** not documented complete. A full authenticated regression on the final function revision also remains pending in the QA record.

**Storage scope:** SQL supports identity/role authorization; general-purpose SQL/NoSQL CRUD is not this showcase's feature. No MongoDB verification is claimed.

## 🤖 AI Assistance

AI assisted implementation, tests and documentation. The [public AI prompt workflow](AI-PROMPTS.md) contains only the reusable **Review → Plan → Build → Verify** prompts published in the showcase.
