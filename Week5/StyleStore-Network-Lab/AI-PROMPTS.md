# Public AI Prompt Workflow

This document reproduces only the reusable prompts published in the showcase.

## Review

```text
Review the supplied storefront and Docker network requirements.
Map the browser, Nginx, public_subnet, private_subnet,
and two identical Node replicas. Identify port ownership,
network membership, DNS, state, and failure boundaries.
Compare network claims with official Docker and Nginx docs.
Preserve the reference project and existing presentation.
Return findings and the exact proposed files. Do not edit yet.
```

## Plan

```text
Plan one React sneaker card and a read-only quote API.
Keep two replicas interchangeable and stateless. Publish
only Nginx on loopback port 80. Put both backends only on
an internal private bridge; Nginx alone joins both bridges.
Specify service-name DNS refresh, equal-weight round-robin,
pinned health routes, finite timeouts, and bounded retries.
Write acceptance tests for isolation, balancing, failure,
recreation, input validation, keyboard use, and mobile.
Return the plan and ownership boundaries before building.
```

## Build — focused instruction

```text
Implement the approved network lab specification below.
Write failing tests first. Limit edits to the agreed files.
Build the real Compose services and read-only API; do not
replace the network with an animation or mock replies.
Mount React only in #stylestore-root. Preserve the seven
showcase sections, local themes, navigation, and prompts.
Return changed files, actual test output, and blockers.
Do not publish, change accounts, or alter other projects.
```

## Build — implementation specification

```text
Build a standalone StyleStore Network Lab, not a simulation.

1. Preserve the seven-section App Engineering showcase,
   local navigation, seven theme packages, and light/dark
   appearance. Adapt copied storefront components into a
   React island mounted only at #stylestore-root. Do not
   edit the source portfolio or load a cloud theme service.

2. Use Docker Compose with two distinct bridge networks:
   public_subnet and private_subnet. Set the private network
   internal: true. Only Nginx joins both. Publish Nginx host
   port 80 on loopback by default. Never publish API ports.

3. Run store-a and store-b from the same Node image and API
   code, differing only in a safe server identifier. Attach
   them only to private_subnet. Use service-name discovery,
   supported DNS refresh, and equal-weight round-robin.
   Use explicit timeouts, buffering, and bounded GET retries.

4. Serve one product: retro-sneakers, Retro Sneakers,
   8500 USD cents. GET /api/quote?quantity=N accepts one
   integer quantity from 1 through 9 and returns serverId,
   product, quantity, totalCents, and currency. Calculate
   totals on the server. Reject malformed, duplicate, and
   unknown query fields. No checkout, payment, or storage.

5. Implement /healthz for each API and separately pinned
   /api/health/store-a and /api/health/store-b proxy routes.
   Do not fail over pinned health checks. Add the gateway
   response marker X-Lab-Gateway: nginx. Keep Compose health
   distinct from proxy peer selection and browser evidence.

6. Provide quantity, a quote action, 10 serial real quotes,
   explicit health checks, Clear, and a compact monitor.
   Use public config.js with an empty apiBase for same-origin
   requests; allow a future explicitly configured HTTPS API.
   Validate gateway marker, safe IDs, requested quantity,
   integer-cent totals, and response shape. Bound waits and
   response size; omit credentials and bypass caches.

7. Show idle, busy, success, invalid input, unavailable,
   and malformed-response states honestly. Count only valid
   successful quotes, track failures separately, and keep
   health observations independent. Clear must abort work
   and reject stale results. Never invent fallback replies.
   Keep controls labeled and keyboard/mobile accessible.

8. Write tests first. Exercise real Compose membership,
   private-network isolation, only one published entry,
   DNS recreation, balancing, pinned health, and operator
   stop/restore. Report actual output separately from mocks
   or static checks. Deliver code, configuration, setup,
   tests, and limitations within the approved file scope.
   Do not install host services, manage accounts, deploy,
   publish, or change Git state without separate approval.
```

## Verify

```text
Run source tests, normalized Compose checks, and nginx -t.
With the approved local lab running, inspect actual ports
and network membership. Make real quotes and count valid
replica IDs. Check each pinned health route separately.
As an operator, stop one replica, repeat requests, restore
it, and verify recovery; also test service recreation/DNS.
Check invalid input, unavailable API, abort/stale results,
keyboard controls, all themes/modes, and mobile layouts.
Report real output and blocked checks. Do not fabricate
responses or treat a diagram as proof of connectivity.
```
