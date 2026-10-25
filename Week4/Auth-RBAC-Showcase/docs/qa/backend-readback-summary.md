# Backend read-back summary

This is a human-readable summary of actual connector/dashboard/HTTP tool results, **not a fabricated raw provider response**. The target is only `ggewxlydkxjutjiqnkhr` / `AD371-Gatekeeper-Lab`.

## Schema and guard

- Migration executed against the approved project and was read back through PostgreSQL catalogs.
- `gatekeeper_private.user_roles` and `gatekeeper_private.admin_briefing` both exist with RLS enabled. One non-PII briefing row exists.
- `public.gatekeeper_resource(text)` is owned by `postgres`, is SECURITY DEFINER and has `search_path=""`.
- PostgreSQL-computed MD5 of its body after removing SQL line comments and whitespace: `b4bfebc21141be8eb439ea3b4dc98132`.
- Independently computed local migration body under the same normalization produced exactly `b4bfebc21141be8eb439ea3b4dc98132`. This is a source-matching check, not a cryptographic security attestation.
- `authenticated`: private schema usage false; private role-table access false; RPC execute true.
- `anon` and `service_role`: private schema usage false; private role-table access false; RPC execute false.
- At the initial attestation there were zero Auth users. Hash-format/user-role/live-session evidence cannot be inferred from an empty table.

## Environment and function

- `ALLOWED_ORIGINS` secret read-back exposes a digest, not its value. Observed digest: `f3221188ab1b2e0d4040b4f535079bbd453e660a70922b458c514622c0cd481e`.
- Tool-computed SHA-256 of the intended exact value `http://127.0.0.1:8771` matched that digest.
- Function ID: `e6065b3b-afef-4412-8783-3f4fad93be9e`; slug `gatekeeper`; status ACTIVE; current version 3.
- Observed deployment bundle digest: `b6a2225014090254d632b3329e71f19eaf45d196a234d92943257bb225e02900`. Supabase's bundle digest is not claimed to equal the raw source-file SHA-256.
- All three deployments initially defaulted the legacy gateway to `verify_jwt=true` because the connector deploy schema does not expose that setting. After each deployment, the exact function's setting was changed in the dashboard, saved, then read back through LIST_FUNCTIONS as **false**. Protected-request Auth and SQL checks remain mandatory in source.
- Version 1 lacked the current hosted public-key dictionary configuration and failed closed with 503. Original failed evidence: `attempts/hosted-env-initial503.json`. Added a RED regression test, then supported `SUPABASE_PUBLISHABLE_KEYS.default` with the same strict public-key validation. Version 2 public request returned 200.
- GET_FUNCTION_BODY failed twice with gateway errors. Code upload/deployment metadata and actual endpoint behavior were verified; **remote raw-source byte equality is not claimed**. The local deploy bundle is generated from the same shared module that tests execute.

## Real HTTP smoke

`live-anonymous-api-followup.json` contains actual hosted HTTP output. Public returned 200; logged-out User/Admin 401; invalid resource 400; forbidden browser origin 403; unsupported method 405; exact allowed preflight 204; anonymous direct RPC 401; unexposed private schema 406; empty login 400; empty registration 422. None of those are mocked responses. An origin-based 403 is **not** evidence of a signed-in User being denied Admin.

## Core authenticated follow-up and remaining evidence

The student registered, confirmed email and logged in privately. Actual version-2 requests verified User 200, User→Admin 403, approved temporary Admin 200 for both resources, restoration to default User and immediate Admin 403 in the same session. Logout cleared the UI, removed the current session row, and the next User request returned 401; two unrelated earlier session rows were retained by local-scope logout. An invalid SQL-like password produced generic UI failure. A trusted aggregate verified one bcrypt-format password record without exposing any hash. The current version 3 adds only the reviewed public-key configuration hardening; fresh version-3 anonymous smoke is in `live-version3-smoke.json`. Full final-version authenticated regression, direct authenticated RPC, copied-token replay/expiry and comprehensive formal QA remain pending. See `qa-report.md` for exact scope. No account passwords, JWTs, privileged keys or private profiles are stored with these reports.
