# StyleStore Network Lab

A small App Engineering Showcase connecting a React sneaker storefront to a real Docker Compose network lab. Nginx distributes stateless quote requests between two identical Node.js replicas; the interface identifies the responding server and keeps a compact record of observations from the current page session.

## 🏗️ Project Description

The storefront adapts the portfolio's **Retro Sneakers adaptive card** and **StyleStore header/order summary** into React components. The original CSS showcases and the existing Resume are preserved.

```text
              Browser / React storefront
                           |
                           | HTTP 127.0.0.1:80 (only published host port)
                           v
+---------- public_subnet: 172.30.51.0/24 -----------+
|                     Nginx :80                      |
+----------------------------------------------------+
                           | Nginx's second network interface
+---------- private_subnet: 172.30.52.0/24 ----------+
|                   internal: true                   |
|                         |                          |
|                    round-robin                     |
|                   /           \                    |
|           store-a:3000     store-b:3000            |
|       same Node API; no published host ports       |
+----------------------------------------------------+
```

These are the default CIDR ranges in `compose.yaml`; `PUBLIC_SUBNET_CIDR` and `PRIVATE_SUBNET_CIDR` can override them. Container addresses are assigned dynamically, so upstreams use service names rather than the current IPs. `public_subnet` is a Docker bridge, not a cloud VPC or an automatically Internet-accessible endpoint.

Nginx is the only service attached to both networks and the only service with a published host port. Both replicas use the same application image and differ only in their server identifier. Docker service names—not fixed container addresses—identify upstreams.

**Scope:** one product, a quantity, and a read-only server-calculated quote. This is not a payment system, production storefront, server administration console, or multi-host high-availability platform. Both replicas share one Docker host, so loss of that host still takes down the lab.

## 🚀 Setup & Run Instructions

**Prerequisites:** Docker Engine/Desktop with Docker Compose. Node.js 22.12+ and npm are needed only for source development/tests; the container build handles its own frontend compilation.

From this supplied project folder:

```sh
docker compose config
docker compose build
docker compose up --detach
docker compose ps
```

Alternatively, `docker compose up --build --detach` combines building and starting. Build/start commands are intended to run from this folder, which contains the Compose project definition.

Open **http://127.0.0.1/**. On Linux, use `sudo docker …` if your account cannot access the Docker socket. Membership in the Docker group grants root-equivalent control and is not required by this project. Do not expose the Docker socket or grant browser access to it.

The default host binding is **127.0.0.1:80**. If that port is already occupied, select another explicitly and update any development proxy settings accordingly:

```sh
HOST_PORT=8786 docker compose up --build --detach
```

The committed Compose file defines separate configurable subnet ranges. Check them for conflicts with your host/VPN/other Docker networks before starting. Do not delete unrelated networks to make space.

### Lifecycle commands

```sh
# Stop the topology but retain its containers and networks.
docker compose stop

# Start the existing stopped containers.
docker compose start

# Remove this project's containers and networks after use.
docker compose down
```

`down` retains the built images; no named data volumes are defined. It does not stop the separately managed Cloudflare connector. Stopping/removing the lab interrupts its public API, so do not run these shutdown commands during a live demonstration. Do not use global Docker pruning or remove unrelated projects.

### Frontend development

```sh
npm ci --ignore-scripts --no-bin-links
npm run build
npm run dev
```

The development page uses **http://127.0.0.1:8785/** and proxies API requests to the real Nginx lab on **127.0.0.1:80**. Without the Docker lab, the page reports unavailable requests; it does not substitute fake replicas. Do not publish or tunnel the development server.

The production frontend is built into `dist/`, with the HTML shell, local theme packages and compiled React island. Infrastructure, source tests, documentation and dependencies are excluded from that public output.

## 🔀 Working System

- **Get quote:** send a real request for the selected quantity; update the order summary only after validating the response.
- **Send 10 requests:** issue a bounded sequence of quote requests and count the verified responding replicas.
- **Check health:** query each replica separately through Nginx. Health probes do not count as quote traffic and do not fall back to another replica.
- **Clear:** cancel current browser work and remove page-session observations. It does not restart services or alter the network.

Quantity, observations and counters live in page memory; reload clears them. Backend replicas hold no shopping session or cart database. The last responding replica is not a health verdict. Request duration is measured by the browser, not an internal Nginx or network trace. Displayed counters cover this page's validated quote responses—not all server traffic.

### Failure and recovery demonstration

In a separate trusted terminal, stop just one replica:

```sh
docker compose stop store-a
```

Send more quote requests and check both health results. Nginx uses bounded retry/passive-failure settings; record the actual outcomes rather than assuming a perfectly seamless transition. Restore the replica and verify that it receives requests again:

```sh
docker compose start store-a
```

There are deliberately no container-stop or server-administration controls in the website. Use the [lifecycle commands](#lifecycle-commands) to stop or clean up this project after use.

## 🔐 Boundaries and Configuration

`private_subnet` has no backend host-port mappings and is marked internal. The verified cross-network boundary is a public-subnet-only client: it can reach Nginx but cannot directly reach either private backend. `expose` documents a container port; it is not an authorization rule by itself.

**Native Linux host limit:** refusing `http://127.0.0.1:3000/healthz` proves that the backend port is not published on loopback. It does not prove host-to-container-IP isolation: direct host access to a backend's private IP was observed to return HTTP 200. The host/Docker administrator is not excluded by this bridge design. A literal requirement to deny direct container-IP requests from the Docker host needs an additional agreed boundary or configuration; that stronger claim is not marked passed here.

The public frontend reads `config.js`:

```js
window.StyleStoreLabConfig = Object.freeze({
  apiBase: '' // Same-origin Nginx lab; no keys or credentials.
});
```

This standalone configuration remains same-origin and needs no cloud account or tunnel for local use. The separately deployed Resume uses an API-only Cloudflare Tunnel to reach this running lab:

```text
Deployed Resume -> HTTPS Cloudflare API route -> local cloudflared connector
                -> 127.0.0.1:80 -> Nginx -> store-a or store-b
```

The connector is outside Compose. Its API route permits quote and pinned health paths; the frontend uses exact-origin CORS permissions. The computer, Docker lab and connector must remain running for public API access. Publishing static files does not execute containers. Connector credentials are intentionally excluded from these setup instructions and this repository.

The client checks the configured gateway marker and safe response fields before recording success. This validates the expected response contract, not cryptographic proof of a network topology. Infrastructure inspection and direct isolation tests provide separate evidence.

## 🧪 Verification

Node tests use the pinned npm dependencies. The optional Python source checks require Python 3; `infra_test.py` additionally needs the PyYAML version listed in `requirements-qa.txt`. Install it in a project virtual environment rather than modifying system Python. The container-acceptance script uses Python's standard library.

```sh
npm test
python3 -B tests/infra_test.py
python3 -B tests/showcase_test.py
```

These source/unit tests are separate from real infrastructure and browser execution. The [QA report](docs/qa/report.md) records local acceptance and genuine findings; the [assignment plan](docs/assignment-plan.md) maps requirements to evidence. The [official-source record](docs/source-verification.json) documents checked reference titles and destinations.

### Completed QA checklist

The following results are from the **October 29, 2026 UTC local acceptance run**, not a claim of continuous uptime or a new fault test. The original [container acceptance log](docs/qa/container-run-acceptance.log) retains the actual JSON observations.

- [x] **Round-robin distribution:** ten successful HTTP 200 quotes; five replies from `store-a` and five from `store-b`. Perfect alternation is not guaranteed when other traffic interleaves.
- [x] **Failover and recovery:** after stopping `store-a`, all ten quote requests returned HTTP 200 from `store-b`. A's individually pinned health probe returned 504 as expected; B's returned 200. After A restarted, both IDs appeared in a fresh batch.
- [x] **Subnet boundary and port exposure:** only Nginx joined both bridges and published loopback port 80; neither backend had host-port mappings. A temporary public-subnet-only probe reached the gateway as a positive control but could not connect directly to either private backend on port 3000. This is not a claim that native Linux host-to-container-IP access is denied.
- [x] **Health, headers and browser:** both pinned health routes returned 200 while the replicas were healthy. The recorded HTTP checks verified `X-Lab-Gateway: nginx`, `Cache-Control: no-store`, response contracts and CORS behavior. The final healthy-flow Chromium/Firefox suite recorded no uncaught application errors. Intentional stopped-node/offline probes remain expected failures, not error-free observations.

The [original browser results](docs/qa/browser-stable/browser-results.json) retain browser evidence. Browser Connection IDs describe browser-to-origin/edge reuse, not proof of Nginx's private upstream connections. Nginx's `keepalive` and retry settings are inspectable in `infra/nginx.conf`; Compose health checks and Nginx passive peer selection are separate mechanisms.

### Reproduce real container acceptance

```sh
python3 -B scripts/verify-containers.py --docker-command 'sudo docker'
```

This optional acceptance runner **stops, starts and recreates `store-a`**, launches temporary project-scoped probes, and restores both backends in its cleanup path. Run it only during an approved test window, not merely to view the README or while recording an uninterrupted demo. It writes JSON to stdout unless `--output` is explicitly provided. Existing evidence certifies its recorded run; it does not certify every later documentation revision.

| Area | Responsibility |
|---|---|
| `src/`, `styles/storefront.css` | React store, network observations and validated HTTP client |
| `index.html`, `styles/` | Seven-section explanation, architecture map and local theme packages |
| `server/` | Minimal quote/health API and restricted production static serving |
| `compose.yaml`, `Dockerfile`, `infra/` | Container build, network membership and Nginx configuration |
| `tests/`, `scripts/` | Source tests, build tooling and scoped runtime verification |
| `docs/qa/` | Actual results, attempts and limitations for the inspected revision |

## 📚 Architecture References

- [Docker bridge networks](https://docs.docker.com/engine/network/drivers/bridge/)
- [Compose internal networks](https://docs.docker.com/reference/compose-file/networks/#internal)
- [Compose service discovery](https://docs.docker.com/compose/how-tos/networking/)
- [Nginx load balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [Nginx upstream retry behavior](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream)
- [Compose health checks](https://docs.docker.com/reference/compose-file/services/#healthcheck)
- [React in an existing page](https://react.dev/learn/add-react-to-an-existing-project)

## 🤖 AI Assistance

AI assisted implementation, tests and documentation. The [public AI prompt workflow](AI-PROMPTS.md) contains only the reusable **Review → Plan → Build → Verify** prompts published in the showcase.

Verification confirmed private-only backends, a dual-homed Nginx gateway, service-name discovery and bounded retries. Browser testing also identified a missing production environment definition, corrected in `scripts/build.mjs`. See the [recorded QA findings](docs/qa/report.md#genuine-findings-and-follow-ups) for the technical corrections and their evidence.
