# StyleStore Network Lab — approved local build

## Scope and authorization

The student approved Option B: adapt copies of the Adaptive Card Widgets Retro Sneakers card and Flexbox Interfaces StyleStore header/order summary into a React storefront with a compact network monitor. Build an actual Docker Compose lab: Nginx dual-homed across public_subnet and private_subnet, two identical Node backend replicas exclusively on the internal private network, no backend host ports, service-name discovery, round-robin, health endpoints, bounded retries and a real stop/restore demonstration. Work in this previously empty Week5 project. Preserve all Week1/Week4/MasterPrompts and `/home/reader/Desktop/Shocases/Resume`, including dirty/untracked/deleted files. No Git operations, Resume writes, public endpoint, tunnel, paid resource, account mutation or deployment at this phase. Local visual approval precedes Resume integration. Docker Engine/Compose system installation was separately explicitly approved via the confirmation form; no docker-group membership change is authorized.

## Requirement mapping (summary of student-supplied assignment)

| ID | Requirement | Implementation / actual verification |
|---|---|---|
| R1 | Two isolated network subnets | Two bridge networks with distinct configurable IPAM CIDRs; private is internal; inspect live membership and public-only negative connection test |
| R2 | Dual-homed reverse-proxy load balancer | Only nginx belongs to both networks; only nginx publishes host port 80 by default, bound to loopback; Docker inspect confirms |
| R3 | Two backend replicas exclusively private | store-a and store-b run identical Node image with distinct SERVER_ID; neither has ports; real requests identify both |
| R4 | Each replica identifier and /healthz | Validated JSON from quote and health; dedicated per-replica health paths through Nginx do not use fallback |
| R5 | Round-robin and stateless requests | Equal-weight default upstream; no ip_hash/least_conn; batch quotes and count responding IDs |
| R6 | Names rather than static container IPs | Docker service-name upstream with Docker resolver and supported dynamic DNS; verify recreation recovery |
| R7 | Timeouts, buffering and retries | Small bounded GET requests; explicit proxy_next_upstream and retry timeout/tries; stop A, run quotes, restart A and verify return |
| R8 | Networking/security audit before running infrastructure | Static contracts first; inspect normalized Compose and nginx -t before starting lab |
| R9 | Compose, proxy config, minimal backend, run/test instructions | Versioned local project files and professional README; no fabricated initial AI defects |

## App and HTTP contract

- React mounts only `#stylestore-root` in Working System. New app does not migrate the HTML portfolio.
- One product `retro-sneakers`, fixed unit price 8500 integer USD cents. Quantity integer 1..9. No payment, user account, purchase, server session or database. Browser quantity is page-memory only.
- GET `/api/quote?quantity=N` returns `{serverId:'store-a'|'store-b',product:{id:'retro-sneakers',name:'Retro Sneakers',unitPriceCents:8500},quantity:N,totalCents:8500*N,currency:'USD'}`. Invalid/duplicate/unknown query fields fail 400; unsupported methods 405. Server calculates totals; frontend validates payload against requested quantity before counting success.
- GET `/healthz` returns `{status:'ok',serverId}`. Nginx exposes `/api/health/store-a` and `/api/health/store-b` pinned separately; health traffic does not contribute quote counters. No public management endpoints, Docker socket, arbitrary URLs or container IP display.
- Nginx adds `X-Lab-Gateway: nginx` for observed proxied responses; Node adds X-Store-Id; JSON remains the authority for responding replica. Client checks gateway marker, shape, safe identifiers, requested quantity and integer totals. A header supports configured-path observation, not independent security attestation.
- Every API request uses cache no-store, finite client timeout, bounded response size and no credentials. Only approved configurable origins may read cross-origin API. Same-origin is the default. No endpoint inference from hostname, querystring or local storage. `window.StyleStoreLabConfig = Object.freeze({apiBase:''})` controls base; root relative API routes work standalone; an HTTPS configured external base enables future separate hosting.
- Busy action disables quote, batch and health buttons until complete; Clear aborts active work and invalidates stale results. A single quote updates order summary and session-only quote trail; batch runs 10 serial actual quote requests with a bounded delay; never creates fake A/B responses. Quote counters count only validated successful quote responses, with failed attempts tracked separately. Clear preserves selected quantity but removes quote, history, counters, gateway observation and health observations.
- Live status only follows valid observed responses; initial idle is 'Not checked', transport errors 'Lab unavailable', malformed/non-gateway replies fail explicitly. Health unknown until individually checked; last responding node is not a live health inference. Recent requests include status and browser-observed duration, safe server ID or failure, bounded list. Do not expose raw response bodies or internal errors.

## Presentation and source ownership

Use the seven sections in order: Problem & Scope; Architecture Concepts; System Architecture; AI Prompt; Audit; Working System; Verification. Match Gatekeeper/Cloud-Managed Themes chrome, seven existing theme packages and modes. Copy theme infrastructure into this standalone only, replace appearance storage keys with `ssn-theme` and `ssn-style-theme` and do not copy cloud integration. Keep legacy flexbox compatibility hook needed by themes. Every concept card includes a precise relevant official source anchor and safe new-tab behavior. Diagram: restrained full-width connected technical map, accurate public/private boundaries and responsive stacked text equivalent, deeper native disclosure. React storefront above compact monitor, no separate admin dashboard.

Parent owns package/build/dependency setup, backend/infra integration, shell/assets copying, docs and final QA. Frontend implementer owns only `src/App.jsx`, `src/Storefront.jsx`, `src/NetworkMonitor.jsx`, `src/client.mjs`, `src/main.jsx`, `styles/storefront.css`, `tests/client.test.mjs`, `tests/ui-contract.test.mjs`. Backend implementer owns only `server/`, `infra/`, `compose.yaml`, `Dockerfile`, `.dockerignore`, `tests/server.test.mjs`, `tests/infra_test.py`, `scripts/verify-containers.py`. Shell implementer owns only `index.html`, `styles/network-showcase.css`, `tests/showcase_test.py`, `assets/sneaker.svg`. Do not cross-edit ownership without coordination.

## Toolchain and execution

Registry checked during preflight: React/ReactDOM 19.3.1, Vite 8.3.5, current Node 22.23.2 satisfies Vite engine. Prefer Vite built-in JSX transform with automatic React JSX and no plugin unless required; pinned package lock. Local dependencies belong to this ext filesystem project. No global npm changes. Pin Docker base tags after registry verification and record image digests in actual evidence. Parent will run targeted RED before implementation, then all source tests, actual Compose config/nginx validation, real isolation/balancing/stop/restore/recreation tests, Chromium+Firefox UI, responsive/theme/breakpoint checks, screenshots, browser errors and scoped independent spec/code reviews. Real Lighthouse reports if tooling permits; label blocked/not-run checks honestly. Keep failed attempts separate. UI-only fixtures do not prove live infrastructure.

## Current state

Preflight and protected hashes saved outside the projects. Docker absent at intake; installation approved and administrator dialog started. No application result, container test, deployment, integration or visual approval is yet claimed. This is an execution plan, not assignment completion evidence.
