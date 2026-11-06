# Container Pulse — release verification

Verified November 6, 2026. This public summary contains technical results, not private conversations, account details, credentials or internal execution prompts.

## Deployed delivery

The Resume entry opens the deployed [Container Pulse showcase](https://chernichenkodmitriy.com/showcases/container-pulse/). The production and platform-hosted pages were both exercised against the real HTTPS runtime API. Static hosting serves the compiled frontend; the local Docker application and named connector must remain running to supply runtime observations.

Resume release commit: `06d2d43e640bdccbe1af28ea0c64aaec4f8050e9`. The connected hosting build reported Ready for this release. This does not claim uninterrupted availability, automatic connector startup, recording completion or academic submission.

## Executed checks

| Boundary | Actual result |
|---|---|
| Canonical Node source tests | 89 passed; zero failures or skips |
| Python infrastructure/safety tests | 23 passed |
| Resume source tests | 79 passed; zero failures or skips |
| Actual Docker lifecycle | Healthy 2 → 3 → 2; restored two app replicas and one healthy gateway |
| Existing Week 5 deployment | Container state and HTTP response identity unchanged |
| Docker-served build identity | 46 files matched the fresh build; 92 GET/HEAD checks |
| Public CORS and tunnel restrictions | 16 checks passed, including allowed/denied origins and error responses |
| Loopback Resume frontend → public API | 4 real browser flows passed |
| Production and platform frontend → public API | 8 real browser flows passed |
| Production asset identity | 32 checks across both hostnames |
| Private-path denial | 20 checks across both hostnames returned 403/404 |

Anonymous Chromium 156.0.8078.4 and Firefox 157.0 exercised 1920px and 390px layouts, real runtime reads, six-check sampling, a retained history bounded to twelve observations, local acknowledgment, Clear, actual offline failure and successful recovery. All five displayed public prompt controls were exercised. Chromium compared complete clipboard contents; Firefox checked the supported clipboard/selection result. No synthetic success responses or fulfilled API fixtures were used in these flows.

Both hostnames exposed the new Resume card and opened the showcase through its actual link. Public HTML, JS and CSS matched the reviewed bytes; no hosting-added script removal was necessary in this readback. No missing same-origin assets or uncaught page errors were observed in the real runtime flows.

## Lighthouse on the deployed site

Lighthouse CLI 13.6.0 used isolated Chromium through loopback CDP, mobile first, then desktop. These are emulated profiles, not physical-device or branded Chrome DevTools tests.

| Profile | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| Mobile | 71 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

Neither audit had a runtime error. The authored `/index.html` URL redirects to the canonical trailing-slash route; the original audit preserves this warning. Mobile also reported a slower-than-expected test CPU. Scores and throttling were not adjusted to remove warnings. These results do not certify every theme, device, accessibility criterion or future network condition.

## Broader diagram matrix — partial, not a full pass

The separate four-showcase resize/appearance matrix completed 461 of 560 intended unique cases: 309 raw passes and 152 retained raw failures. All 280 Chromium cases ran; 181 of 280 Firefox cases ran. The remaining 99 are Firefox Container Pulse (70) and StyleStore (29). Calibration attempts are separate and are not added to those totals.

A controlled standalone SVG reproduced the normalized-screen-bound assumption behind 144 Firefox failures while local node/text/path geometry remained invariant. Eight Chromium Raggedy Granite clip assertions were separately diagnosed with transformed corner coordinates and actual screenshots: the figure remained intact at all five widths. Those original raw assertions remain failed rather than being relabeled green. No additional product presentation defect was confirmed in the executed cases; unexecuted cases remain unverified.

The two narrowly corrected legacy-map defects passed their original targeted checks: the Gatekeeper hosting connector clears its trust-boundary heading without changing endpoints or topology, and StyleStore uses diagram-local geometric text rendering. This is not an all-browser/all-theme matrix certification.

## Boundaries and reproducibility

Use the source tests and explicit opt-in project-only container verifier documented in the [README](../../README.md). Detailed original diagnostics and earlier failed attempts are retained separately, not included in this public summary. Source specification and scoped quality/security reviews passed, but are not a blanket production-security certification.

Metadata describes observations from the current page. Hostname sampling does not prove replica inventory; process uptime is not container uptime, and browser duration is not CPU/RAM utilization. No browser Docker administration, accounts, database or separate notification service is implemented. Disruptive restart/failover testing, Safari, physical-device testing, continuous availability and the remaining visual cases are not certified here.
