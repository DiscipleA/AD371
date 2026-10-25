# 🤖 Genuine AI prompt log

## Tool and authorship

Implementation assistance: **Hermes Agent by Nous Research**, using the session-reported **gpt-6.1-sol** model through the **openai-codex** provider. Two Hermes subagents were delegated non-overlapping backend and presentation tasks; the parent implements browser authentication orchestration and integrates/reviews their output. No claim is made that the student manually wrote or independently security-certified the generated code. Actual student input is scope selection, Supabase backend selection, account consent, and later visual review/recording.

This log preserves the actual significant user prompts available in this conversation. It is not a reconstructed fictional security exercise. Suggested prompts on the website are reusable teaching copy, **not** historical submissions. The supplied assignment, including its sample initial prompt, is retained separately in [docs/assignment.md](docs/assignment.md); a sample embedded in the assignment was not separately submitted as an execution prompt.

## Master-prompt intake — exact user prompt

```text
Follow master prompt in this folder --> "/home/reader/Desktop/AD371/MasterPrompts"
```

The controlling local file was `App-Engineering-Showcase-Master-Prompt-v1.0.md`. It was read, not rewritten. It requires assignment-first analysis, seven familiar showcase sections, independent standalone work, actual verification, and separate authorization for integration/publication.

## Assignment intake

Exact assignment text and the accompanying presentation/sequencing instructions are retained in [docs/assignment.md](docs/assignment.md). No rubric attachment beyond the pasted text was provided.

## Hosting/framework discussion — exact user prompts

```text
You mention SQLite, but the site will be part of the resume already launched on cloudflare..., does cloudflare provides host to SQLite?
```

```text
You mention Express so does the assignment require us to build in Express, because my resume is in HTML, and the assignemnt, too
```

```text
What if we use supabase?
```

```text
is it simple enough to get it done in less than three hours, and what will you need from me?
```

## Initial implementation authorization — exact user prompt

```text
ok, proceed, and lets make this happen with the supabase because the assignment didn't specify that equest backend code, route guards, and an audit of password hashing need to be as part of the applicationg, so we can just show that off in supabase as part of our back end. Just don't forget to implements as much as possible on our end, but the main concern is security, which fits well with supabase handling it.
```

## Separate backend target consent — exact recorded selection

Question asked:

```text
May I configure the separate Supabase project and, after reviewing the code, apply only its Gatekeeper schema, authorization function, and security settings? You’ll enter the database password privately in the preview; no paid upgrades.
```

Student selected:

```text
Create a separate AD371-Gatekeeper-Lab project on the Free plan; leave all existing projects untouched
```

## What was produced correctly / what changed

- Initial architecture options suggested Express and SQLite as optional implementations. They were not assignment requirements. The student prioritized the existing HTML portfolio and proposed Supabase; the approved design retains HTML/CSS/vanilla JavaScript and delegates credentials to Supabase Auth.
- The assistant explicitly corrected its earlier compliance confidence: managed password hashing is not locally implemented hashing, and student acceptance of Supabase does not prove instructor approval. No fake bcrypt implementation or invented manual student patch is claimed.
- Intended project-owned safeguards: memory-only client sessions; no admin-role signup; identity verification through Auth; independent SQL session and trusted-role checks; private role storage; limited response fields; generic login UI errors; fail-closed upstream handling; strict CORS; no privileged browser keys.
- Before client code existed, its nine behavior tests failed with `Auth client implementation is missing`. After implementation, the same nine tests passed. These are controlled local tests—not live Supabase results.

Further genuine review findings and corrections:

- The initial client trusted HTTP 200 even for malformed/wrong-resource data. Added a failing test and resource-specific success validation. A follow-up review found empty/array protected data still passed; the failing regression was preserved and the contract tightened. Independent focused review approved the correction.
- Hosted function version 1 failed closed with 503 because current hosted public keys use a plural dictionary not forwarded by the initial bootstrap. Added a RED test, supported the documented dictionary, then corrected a reviewer-reproduced empty-default/legacy-fallback gap. Final deployed version is 3; no identity/role checks were removed.
- Managed email confirmation can return provider auth parameters in a callback URL. Added test-first early URL cleanup without importing or storing a session. Ordinary section anchors remain intact.
- Live demotion denied Admin correctly but left stale Admin text in the role display. Reproduced it in a controlled browser regression, then clear the stale label after an actual Admin 403. Server authorization was not bypassed.
- A CSP-related Playwright failure and a Firefox transition-timing failure were harness issues; their failed evidence was retained, and the harness was corrected without weakening CSP or focus assertions.

No arbitrary quota of AI vulnerabilities is invented. No unavailable historical model output is reconstructed as a verbatim initial draft. Corrections were agent-assisted, not falsely attributed to manual student coding.

## Temporary role-test consent — exact recorded selection

Question asked:

```text
May I temporarily grant your confirmed Gatekeeper account the application’s Admin role, verify Admin access, then restore it to User? This affects only this new lab’s role table—not your Supabase dashboard permissions or Resume.
```

Student selected:

```text
Yes—temporarily grant app Admin, test both resources, then restore User
```

The exact existing confirmed account was checked before promotion. Admin access passed, then the temporary role row was removed and default User read back. A live request immediately lost Admin access in the same signed-in session. This does not claim a permanent Admin account or a second Admin login.

## Evidence boundary

Generated source and its review history are actual AI output. Tests exercising an injected Auth/PostgREST response are clearly controlled unit tests; they do not certify the deployed backend. Live results, browser evidence, external account changes, and remaining blockers belong in `docs/qa/qa-report.md` once exercised. Privileged keys, passwords, session tokens, private browser profiles and authentication logs must never be appended here.
