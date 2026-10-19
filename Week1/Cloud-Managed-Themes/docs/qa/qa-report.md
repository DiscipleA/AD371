# Cloud-Managed Themes — Live Website QA

**Target:** https://chernichenkodmitriy.com/showcases/cloud-managed-themes/
**Tested commit:** `4cef72a7136d72f5e44d902c89d7465f49702b05`
**Completed (UTC):** 2026-10-19T04:33:08.350691+00:00

> **Verdict: QA completed with findings.** Normal live functionality works in Chromium and Firefox, but the full checklist is **not all green**. Accessibility defects, a favicon404, and a controlled metadata-race test remain unresolved. No production changes were made.

## Lighthouse — real live-origin audits

| Device profile | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| Desktop | 98 | 96 | 100 | 100 |
| Mobile | 80 | 96 | 100 | 100 |

- [Open desktop Lighthouse report](lighthouse/lighthouse-desktop.report.html)
- [Open mobile Lighthouse report](lighthouse/lighthouse-mobile.report.html)

Lighthouse 13.5.0; real requested/final URL is the target above. Both runs completed without runtime errors or Lighthouse run warnings. Mobile uses simulated mobile/network/CPU throttling. Scores are a single lab observation, not a guarantee.

## Rubric coverage

| Category | Executed evidence | Result |
|---|---|---|
| Functional | Real Supabase GET200; seven cards; native theme/mode controls; document/API reload persistence; reset; empty/no-match/long/markup-like search; exact copying; repeated requests | Normal live flows passed in both engines; controlled held-metadata test still fails |
| Responsive UI | Chromium 70 and Firefox 56 theme/mode/viewport cases; exact 1920×1080, 768×1024, 390×844, 320×900 plus Chromium1440×1000 | 126 combinations passed page-overflow checks; representative screenshots inspected |
| Cross-browser | Chromium 148.0.7778.96 and system Firefox 158.0 via real Gecko/WebDriver BiDi | Both engines exercised; engine-specific favicon404 recorded |
| Console/assets | Browser error listeners, Firefox BiDi log/network events, direct favicon request | No uncaught JS errors; Firefox favicon404 means asset criterion is not fully passed |
| Accessibility | Native Tab/Enter/Escape, search label, WCAG2/2.1 A/AA axe checks in both engines, Lighthouse accessibility | Three automated accessibility violation types remain |
| Performance | Mobile and desktop Lighthouse; real navigation | Desktop98, mobile80; mobile main-thread/TBT work remains an optimization opportunity |

## Findings

### QA-01 — Process-step numbers miss minimum text contrast
**Severity/category:** Medium / Accessibility

Seven .process-number labels in the default Gothic Stickerboard light theme measure approximately 4.4:1, below the 4.5:1 requirement for their text size. Lighthouse and axe identify the same elements.

**Reproduce:** Open the live page in a fresh profile using cloud defaults. Inspect 01–07 in the process strip or the color-contrast audit.

**Recommendation:** Make a narrowly scoped contrast adjustment in the owning theme/page styles, then rerun the audits. No adjustment was made in this QA.

**Evidence:** [lighthouse/lighthouse-desktop.report.json](lighthouse/lighthouse-desktop.report.json), [lighthouse/lighthouse-mobile.report.json](lighthouse/lighthouse-mobile.report.json), [axe-chromium.json](axe-chromium.json), [axe-firefox.json](axe-firefox.json)

### QA-02 — Selected theme button text differs from its accessible name
**Severity/category:** Medium / Accessibility

The active Gothic Stickerboard button visibly says Selected but its aria-label is Preview Gothic Stickerboard. The visible label is not included in the accessible name, which affects speech-input users.

**Reproduce:** Use cloud defaults, inspect the active theme card, and compare its visible Selected text with its aria-label.

**Recommendation:** Keep the accessible name consistent with the visible label and selected state; retain the theme identity and aria-pressed behavior.

**Evidence:** [lighthouse/lighthouse-desktop.report.json](lighthouse/lighthouse-desktop.report.json), [axe-chromium.json](axe-chromium.json), [axe-firefox.json](axe-firefox.json)

### QA-03 — Scrollable build-prompt code panel is not keyboard-focusable
**Severity/category:** Medium / Accessibility

The .ai-build-prompt > .code-panel > pre region is scrollable but has no focusable content or focus target. Both engines report scrollable-region-focusable.

**Reproduce:** Open the build-prompt disclosure. Use keyboard-only navigation and try to reach/scroll the overflowing prompt content.

**Recommendation:** Provide a suitable keyboard-focusable scrolling region with visible focus, then verify actual scrolling. No source change made.

**Evidence:** [axe-chromium.json](axe-chromium.json), [axe-firefox.json](axe-firefox.json)

### QA-04 — Root favicon request returns HTTP404 in Firefox
**Severity/category:** Medium / Network / assets

Firefox BiDi captured real requests to https://chernichenkodmitriy.com/favicon.ico returning 404. A separate direct GET also returned 404. Theme-owned SVG favicon files still load; the early browser-default request is the missing asset.

**Reproduce:** Open the live page in a fresh Firefox profile and inspect Network, or request /favicon.ico directly.

**Recommendation:** Provide a valid root icon or ensure a valid favicon link exists before the browser issues its fallback request. Recheck both engines before claiming zero asset404s.

**Evidence:** [firefox-followup.json](firefox-followup.json)

### QA-05 — Held-metadata/newer-GET regression fails against the live origin
**Severity/category:** Needs investigation / Controlled timing regression

The scenario newer GET wins pending metadata throws Unable to load the installed theme package. It failed in the full regression run and a focused unchanged rerun. This test deliberately intercepts API responses and holds local metadata, so it is not evidence that the normal live Supabase read failed. Root cause is not settled by these runs.

**Reproduce:** Run the saved interaction regression against the live base URL with filter newer GET. The script uses explicitly controlled responses, not live backend data for that scenario.

**Recommendation:** Investigate the metadata hold/retry and 3.5-second loader timeout before marking the full regression suite passed. Do not weaken assertions or change production based on an unconfirmed cause.

**Evidence:** [regressions/interaction_regressions/results.json](regressions/interaction_regressions/results.json), [regressions/interaction-isolated-followup.json](regressions/interaction-isolated-followup.json)

## Harness follow-ups and evidence integrity

- Original custom runs had a screenshot timeout and a Firefox Element Clear event mismatch; original scripts/reports/screenshots are retained in `attempt-1/`. The Firefox clear operation was replaced with actual keyboard Select All/Backspace—not an application fix.
- Firefox native window minimum sizes were discovered; the exact CSS viewport matrix uses supported BiDi `browsingContext.setViewport` and asserts actual `innerWidth`/`innerHeight`.
- WebDriver automatic scrolling initially put targets under the sticky header. Focused follow-up centered controls before native clicks; no forced/JavaScript button activation was used.
- Keyboard follow-ups wait for finite menu transitions and use fresh Chromium contexts. The four-width Chromium follow-up passed; Firefox functional/keyboard follow-up passed. Earlier focus-timing failures remain in raw reports.
- Superseded GET requests deliberately aborted by the concurrency test are recorded separately from unexpected network failures. The real favicon404 is **not** filtered out.
- The controlled held-metadata test also failed alone; it remains unresolved rather than being relabeled as a pass.
- Do not add raw counts from separate attempts: follow-ups overlap earlier scenarios. See `summary.json` and original reports for exact counts.

## Evidence files

- [Chromium live results](chromium-live.json)
- [Firefox exact-viewport results](firefox-live.json)
- [Firefox focused follow-up](firefox-followup.json)
- [Chromium keyboard follow-up](chromium-keyboard-followup.json)
- [Chromium axe details](axe-chromium.json)
- [Firefox axe details](axe-firefox.json)
- [Regression suite summary](regressions/summary.json)
- [Deployed file fingerprints](deployed-fingerprints.json)
- [Source/Git preservation proof](preservation.json)

## Scope and limitations
- Single-run Lighthouse lab results with default simulated throttling; not field Core Web Vitals or guaranteed real-device speed.
- Accessibility automation covers default Gothic Stickerboard/light; theme matrix checks rendering/overflow and is not full accessibility certification of all theme/mode combinations.
- Responsive screenshots are sampled; no page-wide overflow does not prove every internal text label is unclipped.
- No database writes, backend administrative edits, new permission probes, production fixes, source commits, or deployments were performed.
- A real outage is not induced. Explicit offline button behavior is labeled simulation; additional failure regressions use controlled browser fixtures.
- User recording/webcam, video upload, and the unfinished standalone Desktop project are outside this QA run.

**Preservation:** 214 source files unchanged; Git HEAD/status unchanged. All ten representative deployed runtime/source files matched the tested local snapshot. Temporary tooling and evidence are outside the Resume repository.

## For the video

Show the live Working System and Network GET200, then this Lighthouse report and the responsive screenshots. State the actual scores and remaining findings. Do not say every QA item passed. Keep webcam/face visible as required.
