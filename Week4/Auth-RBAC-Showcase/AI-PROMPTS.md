# AI Prompt Workflow — Gatekeeper Lab

Prompts from the showcase’s AI Prompt section, arranged as a Review → Plan → Build → Verify development workflow.

## 1. Review

```text
Review the supplied standalone HTML/CSS/JavaScript application.
Map the browser, Supabase Auth, Edge Function, SQL RPC,
and private roles table. Distinguish AuthN from AuthZ.
Identify credential, token, role, and secret ownership.
Preserve the seven-section layout and all local themes.
Do not edit the reference project or live portfolio.
List risks and files to change. Do not implement yet.
```

## 2. Plan

```text
Plan registration, login, logout, and three resources:
Public, User, and Admin. Use Supabase Auth for credentials
and salted bcrypt hashing; do not implement local hashing.
Keep browser sessions in memory, not persistent storage.
Define 200, 401, 403, and upstream failure responses.
Our Edge Function and SQL RPC must enforce authorization.
Only trusted administration can assign an Admin role.
Specify validation, email verification, token expiry,
logout/replay checks, and tests before implementation.
Do not provision or deploy without exact-target approval.
```

## 3. Build

```text
Build Gatekeeper Lab as standalone HTML, CSS, and vanilla JS.

1. Preserve the seven-section presentation, local navigation,
   seven installed theme packages, and independent light/dark
   mode. Use local appearance keys gk-style-theme and gk-theme.
   Do not copy the reference cloud-theme feature or alter it.

2. Use locally vendored Supabase JS for Auth. Register with
   email and password, require email verification, and keep
   registration to at least 12 characters and at most 72 UTF-8
   bytes. Login must accept existing valid credentials without
   imposing the new-registration minimum. Hashing is delegated
   to Supabase Auth's salted bcrypt, not browser code.

3. Disable session persistence and URL session detection.
   Keep access/refresh tokens only in page memory; reloading
   signs out locally. Never save passwords or expose tokens
   in HTML, logs, URLs, or the response inspector. Use only a
   publishable browser key, never server secrets.

4. Implement our gatekeeper Edge Function for public, user,
   and admin resources. Validate the caller with Supabase Auth.
   Invoke a narrow SQL RPC using the caller's identity. SQL
   independently checks identity, an active auth session,
   and the current role from a private owner-managed table.
   New accounts are Users; metadata cannot grant Admin.
   Revoke browser access to role tables. Restrict RPC grants,
   use an empty definer search_path and qualified SQL names.

5. Return genuine status and allowed JSON: Public can succeed
   without login; protected resources require an active session
   (401), and Admin additionally requires Admin role (403).
   Fail closed on dependency failures. Use strict resource
   validation, no-store responses, and an exact CORS allowlist;
   CORS does not replace identity or permission checks.

6. Provide labeled email/password fields, separate Register
   and Log in actions, logout, signed-out and role displays,
   and Public/User/Admin request buttons. No role dropdown.
   Disable network controls until configured. Show the selected
   endpoint, actual HTTP result, and safe JSON, not pretend
   success badges. Reject stale concurrent results and clear
   protected output on session change. Use generic login errors.

7. Write tests first. Check positive and negative AuthN/AuthZ,
   hostile input, byte limits, forged roles, expiry, direct RPC,
   logout replay, races, offline failures, secret redaction,
   keyboard access, themes, and mobile layouts. Separate local
   controlled tests from observed live responses and pending
   checks. No account changes, deployment, or Git actions
   without separate approval of the exact target.
```

## 4. Verify

```text
Run local tests and report their real output separately
from live Supabase checks. With an explicitly approved,
configured backend, test Public while signed out; User
and Admin without a token; User access after login;
User denied Admin; provisioned Admin allowed Admin;
forged metadata, direct RPC, expiry, and logout replay.
Test invalid email, blank and hostile input, Unicode
password byte limits, duplicate submissions, and failure.
Check keyboard controls, copying, all seven theme packages,
light/dark modes, and narrow layouts in real browsers.
Never show tokens, passwords, hashes, or privileged keys.
Report blocked checks. Never invent successful evidence.
```
