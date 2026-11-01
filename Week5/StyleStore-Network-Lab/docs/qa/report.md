# StyleStore Network Lab — local acceptance

**Verdict: working local container lab, ready for student visual review. Independent specification and code-quality/security reviews passed with no blocking findings.** This is not Resume integration, public deployment, academic submission, or production-security certification.

## Actual execution

| Area | Result | Evidence |
|---|---|---|
| Node backend/client/session/build contracts | 62 passed, 0 failed | [Final output](source-tests-acceptance.log) |
| Compose/Nginx source contracts | 14 passed | [Output](infra-acceptance.log) |
| Presentation/accessibility source contracts | 20 passed | [Output](native-card-label-green.log) |
| Chromium + Firefox live-browser suite | 180 checks passed, 0 failed | [Machine report](browser-stable/browser-results.json) |
| Browser edge cases | 46 checks passed, 0 failed | [Machine report](browser-edge-results.json) |
| Real Docker acceptance | All eight recorded groups passed | [Runtime report](containers-acceptance.json) |

Do not add these overlapping attempts as unique test coverage. Controlled client tests use explicit transport fixtures; the container/browser acceptance uses actual Nginx and Node requests. The browser suite observes original fetch replies by cloning response streams; it does not generate replies or change endpoints. Offline edge cases deliberately block browser networking without fabricating successful responses.

## Real infrastructure observations

- Two distinct bridge subnets; only Nginx joins both. The private bridge is internal. Only Nginx publishes loopback host port 80; neither backend publishes a host port. Both replicas use the identical built image.
- The recorded ten-request quote batch returned five replies from each replica. This observation is not a promise of perfect alternation under all traffic.
- A disposable public-network-only probe reached the gateway as its positive control and failed to connect to either private backend directly.
- With store-a stopped, its pinned health route failed while store-b stayed healthy; all ten quote requests succeeded through store-b. Store-a was restored.
- Recreating store-a with a genuinely changed IP recovered through service-name DNS. Scoped test helpers were removed and both stores were restored healthy.
- Invalid quantities, duplicate/unknown parameters, unsupported methods, private paths, safe error statuses, CORS preflight allowlisting, gateway markers and no-store headers were exercised.

[Runtime output](container-run-acceptance.log) and [image identities](image-readback-acceptance.txt) retain the actual run. Docker-host administrators remain privileged; bridge isolation does not exclude them. Both replicas share a host and gateway, so this is not multi-machine high availability.

## Browser, layout and accessibility

Chromium 151.0.7922.34 and Firefox 153.0 exercised the real quote/batch/health/clear flow. Displayed replica counters matched observed successful quote responses; health traffic did not increment quote counts. Empty/out-of-range/fractional quantities emitted no quote requests. Quantity changes invalidated stale quotes; offline failure, online retry, cancellation and Clear were exercised. Every prompt/contract copy control was tested; Chromium compared the complete clipboard text, while Firefox verified successful writes or the complete selection fallback.

Each engine checked seven theme packages, both modes, and settled widths 1920, 1001, 768, 390 and 320 CSS pixels: 70 layout states per engine. Keyboard menu opening/Escape/closed-panel focus exclusion passed. No uncaught errors or failed static assets were recorded by the final suite. Responsive/theme tests are not all-theme contrast certification; physical-device and Safari tests were not run.

## Lighthouse — exact local URL

Audited URL: `http://127.0.0.1/`. Lighthouse CLI 13.6.0 used separate anonymous Chromium instances through loopback CDP, not branded Chrome DevTools or a physical phone. Scores reflect the default Gothic Stickerboard light appearance and this local machine, not the deployed Resume.

| Profile | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| Mobile emulation | 86 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

- [Mobile HTML](lighthouse-acceptance/mobile.report.html) · [Original JSON](lighthouse-acceptance/mobile.report.json)
- [Desktop HTML](lighthouse-acceptance/desktop.report.html) · [Original JSON](lighthouse-acceptance/desktop.report.json)
- [Metadata, warnings and diagnostic list](lighthouse-acceptance/summary.json)

The final audits have no runtime error or run warning; lower mobile performance remains a real finding. Unminified/unused assets and loading diagnostics are retained rather than hidden. Automated accessibility scores do not establish full WCAG conformance.

## Genuine findings and follow-ups

1. Initial production library output retained React's Node environment expression; the browser reported `process is not defined` and did not mount React. [Original smoke](browser-initial-smoke.json), [RED](react-production-mode-red.log), [GREEN](react-production-mode-green.log). Build-time production definition corrected the browser bundle; final real rendering passed.
2. Desktop backend-node edges coincided with the private-zone boundary. [RED](diagram-boundary-red.log), [GREEN](diagram-boundary-green.log). Nodes/text/connectors were inset without changing topology.
3. Initial Lighthouse found low-contrast process numbers and concept-card name/label mismatches. [First raw audits](lighthouse/summary.json), [RED](accessibility-red.log), [native-name RED](native-card-label-red.log), [GREEN](native-card-label-green.log). Scoped theme-text color and native anchor names with descriptive new-tab titles resolved the recorded final audits without changing original theme packages.
4. Browser attempt 1 tried reading disposed response streams; attempt 2 assumed a menu accessible name without its CSS caret. Original reports/logs remain in their attempt folders. The harness now observes original cloned responses and the actual menu label.
5. A short-settle Firefox 320px theme-switch run recorded transient 8px overflow. A fresh settled reproduction had no overflow; the final harness explicitly waits for stylesheet/font readiness and finite inherited transitions, retaining the same geometry assertion. The failed [attempt](browser-acceptance/browser-results.json) is preserved rather than recast as a passing run.

## Preservation and remaining gates

528 protected pre-existing files across Week1, Week4, MasterPrompts and Resume were hash-compared without changes. Existing Git modifications/untracked files/deletions were preserved. Docker installation was separately approved; account group permissions were not changed. No Git commit/push, Resume edit, tunnel, cloud resource, public endpoint or deployment occurred.

[Independent review record](independent-review.md): specification and code-quality/security reviews passed. Two nonblocking follow-ups remain documented there: legacy prepaint preference keys and machine-specific optional QA-tool paths. They were not silently changed after the reviewed source freeze.

Remaining: student visual approval, separately approved integration into the current Resume, a decision on public lab hosting/tunnel and exact endpoint permissions, deployed revision verification/QA, and any recording/submission requirements beyond the supplied assignment excerpt.
