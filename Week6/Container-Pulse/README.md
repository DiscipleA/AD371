# Container Pulse

A React runtime workspace built from the portfolio's Asymmetric Dashboard hierarchy and Container-Relative Notification cards. A lightweight Node application supplies real metadata; Docker Compose runs interchangeable replicas behind a small Nginx gateway.

## 🎯 Project Description

**Check runtime** updates the dominant runtime panel and adds a notification from the same validated response. A bounded sample can encounter different replica hostnames. **Acknowledge** changes only the card's presentation. **Clear** cancels pending work and removes current-page observations.

The original CSS examples contain decorative charts, fixed numbers, and example alerts. This application reuses their visual structure without treating those placeholders as live measurements. It does not implement user accounts, a database, Docker administration in the browser, or multi-host high availability.

## 🏗️ Architecture

```text
Browser: React dashboard + responsive notification cards
                   │
                   │ HTTP /api/runtime
                   ▼
       Nginx · loopback host port 8796
                   │
       dedicated Compose project network
             ┌─────┴─────┐
        app replica   app replica
        same Node image and endpoint contract
```

Each application replica serves:

| Endpoint | Purpose |
|---|---|
| `/` | Standalone seven-section landing page and React workspace |
| `/healthz` | Lightweight application health response |
| `/api/runtime` | Hostname, application-process uptime, Node version, application version |

React owns request state, response validation, counts, observed identities, and notifications. CSS owns layout, container-query adaptation, and checkbox-driven presentation. Compose owns deployment resources and lifecycle; the browser receives no Docker socket or administrator credentials.

**Observation boundaries:** duration is browser-measured request time; uptime is process uptime, not container lifetime. Distinct hostnames are identities encountered on the current page, not a complete inventory of running or healthy replicas. Reload clears application observations and acknowledgments. Local appearance preferences persist only when browser storage permits.

## 🚀 Setup & Run Instructions

### Requirements

- Existing Docker Engine/Desktop with Docker Compose.
- Node.js 22.12+ and npm only for source development/testing.
- Python 3 for optional infrastructure/runtime verification scripts.

The build uses pinned image digests and exact npm dependencies. Images must be available locally or downloadable. Run commands from this project folder.

### Prepare non-secret settings

```sh
cp .env.example .env
```

The local `.env` is deliberately ignored by Git and excluded from the public build. It contains demonstration settings, not credentials. Review the default loopback port before starting; another origin/port must be reflected in any later public integration.

### Build and run

```sh
docker compose --project-name ad371-week6-container-pulse config
docker compose --project-name ad371-week6-container-pulse build
docker compose --project-name ad371-week6-container-pulse up --detach
docker compose --project-name ad371-week6-container-pulse ps
```

Open **http://127.0.0.1:8796/**. If Docker socket access requires administrator authorization on Linux, prefix the Docker commands with `sudo`; do not make the socket world-writable or mount it into the application.

### Scale this application only

```sh
docker compose --project-name ad371-week6-container-pulse up --detach --scale app=3
docker compose --project-name ad371-week6-container-pulse ps

# Restore the default demonstration size.
docker compose --project-name ad371-week6-container-pulse up --detach --scale app=2
```

Allow new containers to become healthy and gateway discovery to settle before sampling. Actual container inspection establishes replica count. Several browser requests may encounter different hostnames, but sampling does not prove complete inventory or strict round-robin order.

### Stop this application only

```sh
docker compose --project-name ad371-week6-container-pulse stop

# Optional removal of this project's containers/network, retaining images.
docker compose --project-name ad371-week6-container-pulse down
```

Do not run global pruning, restart the Docker daemon, or apply lifecycle commands to another assignment. The dedicated project name, image tag, project-scoped network, and loopback port separate this deployment from StyleStore. The projects still share the same Docker host and its finite resources.

### Source development and tests

```sh
npm ci --ignore-scripts --no-bin-links
npm test
npm run build
python3 -B tests/infra_test.py
```

The public `dist/` output contains the showcase shell, compiled React island, local themes, and public configuration. It excludes `.env`, server/infrastructure source, tests, documentation, dependencies, and Git metadata.

`config.js` sets the frontend's `apiBase`; the standalone default (`''` or a safe slash path) is same-origin. A separately approved static integration can set a reviewed absolute HTTPS base. Remote requests use CORS, omit credentials and reject redirects; configuration never comes from URL queries, browser storage or visitor input. Credentials, query/hash delimiters, unsafe path segments, protocol-relative URLs and remote HTTP are rejected. Backend and Compose settings come from the environment file. There are no cloud keys in this application.

## 🔐 Container Reality Check

- Dependency manifests precede installation and source copying.
- Build tools stay in the build stage; only runtime artifacts are copied forward.
- Node and Nginx use explicit non-root users with read-only runtime files and reduced capabilities.
- App replicas have CPU/memory budgets, health checks, and a restart policy.
- Health status and process restart policy are distinct: unhealthy status alone does not cause Compose to restart a still-running process.
- The gateway is the only host-published service. No fixed replica `container_name` or per-replica host port prevents scaling.
- API responses allowlist metadata rather than exposing arbitrary environment variables.

These are implementation properties to verify, not a blanket production-security certification. See [the requirement map](docs/assignment-plan.md) and [QA status](docs/qa/report.md) for observed evidence and outstanding checks.

## 🧪 Verification

Source/unit tests and actual container execution are separate evidence. The optional runtime runner builds, starts, and scales **only this project**, then restores two replicas. It requires an explicit mutation flag and should not run during an uninterrupted recording:

```sh
python3 -B scripts/verify-containers.py --allow-mutations
```

Run it under the same Docker-authorized user as the Docker commands above. Inspect its help before adding optional output arguments. Do not interpret an unexecuted runner or a passing source-contract test as real Docker evidence.

SIGTERM and Ctrl-C trigger controlled failure and bounded restoration to two healthy replicas, followed by protected-container/Week5 checks. Repeated SIGTERM/Ctrl-C cannot interrupt that cleanup; restoration can still fail if Docker is unavailable. SIGKILL cannot be caught and cannot trigger restoration.

[QA status and evidence](docs/qa/report.md) identify actual results, failed attempts, local browser coverage, Lighthouse scope, and remaining gates. No historical Week 5 scores or test counts certify this application.

## 📁 Project Files

| Location | Responsibility |
|---|---|
| `src/` | React components, validated client, and page-memory state |
| `styles/pulse-dashboard.css` | Adapted asymmetric layout and notification-card appearance |
| `index.html`, `styles/pulse-showcase.css` | Seven-section explanation and architecture diagram |
| `styles/themes/`, `theme.js`, `site-navigation.js` | Local appearance and standalone navigation |
| `server/` | Read-only runtime API and restricted static serving |
| `Dockerfile`, `compose.yaml`, `infra/` | Multi-stage image, replicas, limits, probes, gateway |
| `.env.example` | Non-secret configuration template |
| `tests/`, `scripts/` | Source tests, build tooling, and scoped acceptance |

The inherited `flexbox-interfaces-page` and architecture compatibility classes are intentional theme hooks; they do not change original portfolio pages.

## 📚 Official References

- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker cache optimization](https://docs.docker.com/build/cache/optimize/)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Compose service configuration](https://docs.docker.com/reference/compose-file/services/)
- [Nginx upstream service resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [React in an existing project](https://react.dev/learn/add-react-to-an-existing-project)
- [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)

## 🤖 AI Assistance

AI assisted implementation, tests, and documentation. [AI-PROMPTS.md](AI-PROMPTS.md) contains only the public showcase's reusable Review → Plan → Build → Verify prompts, not historical submissions or private conversations.

## Deployment Boundary

This folder is the standalone application. In the approved split-host profile, the static Resume serves the compiled frontend and `https://container-pulse-lab.chernichenkodmitriy.com` tunnels only `/api/runtime` and `/healthz` to the loopback gateway. Static hosting does not run Compose. The architecture map describes the standalone container topology, not this delivery layer.

The gateway allows browser reads only from `https://chernichenkodmitriy.com`, `https://wild-resume-deployment.dmitriy-chernichenko.workers.dev` and `http://127.0.0.1:8788`. It emits the exact allowed origin and `Vary: Origin` on successes and errors; unknown origins receive no CORS permission. No wildcard, credentials permission or browser header/body forwarding is added. GET/HEAD remain supported and other methods remain denied. The standalone self-only CSP is unchanged; the portfolio owns its frontend policy.

Source tests and a refreshed bundle do not prove live browser connectivity. Verify the running gateway/tunnel and browser-enforced CORS separately; Node fetch does not enforce browser CORS. Runtime changes, publication and recording/submission remain separately authorized operations.
