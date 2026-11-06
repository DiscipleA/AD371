# Container Pulse — implementation requirements

## Scope

A standalone seven-section App Engineering Showcase combining a React runtime dashboard with responsive notification cards. The presentation adapts isolated copies of the existing Asymmetric Dashboard and Container-Relative Notification components. Original coursework and portfolio sources remain unchanged.

The application is a single stateless Node service with interchangeable replicas—not one service per visual component. React owns observations and acknowledgments. Docker Compose owns deployment configuration and lifecycle.

## Requirement-to-evidence mapping

| ID | Requirement summary | Implementation | Verification |
|---|---|---|---|
| R1 | Lightweight pinned image | Digest-pinned Node Alpine build/runtime stages | Registry manifest and real image inspection |
| R2 | Multi-stage minimal runtime | Build React separately; copy only public assets and server | Build output, image filesystem, no build dependency tree |
| R3 | Dependency-first caching | Manifest/lockfile before installation and source | Dockerfile inspection and source-only rebuild |
| R4 | Non-root least privilege | Explicit non-root users, capability drop, read-only runtime | Running identity, image/container configuration |
| R5 | Landing page and health endpoint | Standalone page and `/healthz` | Real GET/HEAD requests |
| R6 | Runtime metadata endpoint | `/api/runtime`: hostname, process uptime, runtime/app versions | Live schema validation; no environment dump |
| R7 | Multi-replica Compose service | Two default app replicas, scalable service-name gateway | Actual two → three → two readiness and responding identities |
| R8 | CPU and memory limits | Explicit app/gateway limits | Inspect applied container limits |
| R9 | Health and restart configuration | Endpoint probes and process restart policy | Inspect configured and observed health state; do not equate unhealthy with process exit |
| R10 | Environment file | Local non-secret `.env` and committed `.env.example` | Compose resolution and runtime application version |
| R11 | Build/run/scale instructions | Exact project-scoped README commands | Exercise commands against this project only |
| R12 | Container reality audit | Layer order, identity, pinned base, resources/probes | Source tests plus actual container observations |
| R13 | Preserve existing assignments | Dedicated name/image/network/port; no shared external networks | Protected-source fingerprints and other-container before/after snapshots |
| R14 | React component reuse | Dashboard hierarchy and container-relative notification cards | Component tests, browser actions, responsive/theme checks |

## Application behavior

- Check runtime performs a real read and updates both runtime details and a notification.
- A bounded sample performs several reads without unlimited load or automatic polling.
- Clear aborts current work and clears page-memory observations; stale results must not reappear.
- Acknowledgment affects only the current page. It does not call Docker or modify server state.
- Counts and distinct hostnames are observations, not complete cluster inventory or health.
- Failure states must not retain a live-success claim or substitute example metadata.

## Isolation contract

- Compose project: `ad371-week6-container-pulse`.
- App image tag: `ad371-week6-container-pulse-app:local`.
- Gateway binding: `127.0.0.1:8796`; backend port is not host-published.
- Use project-scoped networks without fixed global network/container names or manually allocated subnets.
- No Docker daemon restart, socket permission/group changes, global cleanup, or changes to other Compose projects.
- Scale only this project's app service; restore two ready replicas after acceptance.

## Presentation and publication boundaries

Use Problem & Scope; Architecture Concepts; System Architecture; AI Prompt; Audit; Working System; Verification. Retain local themes and the established diagram style. Concept cards link to relevant official documentation.

README and AI documentation contain only public reusable showcase prompts and technical explanations. Actual prompting, conversations, account details, approvals, private planning, and per-session model/tool records are excluded.

Standalone build, real Docker acceptance, independent source review, visual approval, portfolio integration, public API connectivity, Git publication, and academic submission are distinct states. Public hosting and portfolio integration are not part of this standalone build.
