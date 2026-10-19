# 🧪 QA evidence shelf

**Audited website:** <https://chernichenkodmitriy.com/showcases/cloud-managed-themes/>  
**Tested portfolio commit:** `4cef72a7136d72f5e44d902c89d7465f49702b05`  
**Lighthouse capture:** October 19, 2026 UTC / October 18, 2026 Pacific time.

> ⚠️ These are preserved **live-site** audit results. Copying them into the standalone project does not make them a new standalone audit or resolve the findings.

## 🔦 Start here

| Report | Open |
| :--- | :--- |
| 🧪 Full QA findings | [Markdown](qa-report.md) · [Visual dashboard](qa-report.html) |
| 🖥️ Desktop Lighthouse | [HTML](lighthouse/lighthouse-desktop.report.html) · [JSON](lighthouse/lighthouse-desktop.report.json) |
| 📱 Mobile Lighthouse | [HTML](lighthouse/lighthouse-mobile.report.html) · [JSON](lighthouse/lighthouse-mobile.report.json) |
| 🧾 Machine-readable QA summary | [summary.json](summary.json) |

| Profile | Performance | Accessibility | Best Practices | SEO |
| :--- | ---: | ---: | ---: | ---: |
| 🖥️ Desktop | 98 | 96 | 100 | 100 |
| 📱 Mobile | 80 | 96 | 100 | 100 |

**Verdict:** completed with findings—not all green. Three accessibility issues, the Firefox root-favicon 404, and a controlled metadata-race failure remain recorded. See the full report for reproduction details and evidence boundaries.

## 🗃️ Follow the evidence

- [Chromium live checks](chromium-live.json)
- [Firefox exact-viewport checks](firefox-live.json)
- [Firefox focused follow-up](firefox-followup.json)
- [Chromium keyboard follow-up](chromium-keyboard-followup.json)
- [Chromium axe findings](axe-chromium.json) · [Firefox axe findings](axe-firefox.json)
- [Regression suite summary](regressions/summary.json)
- [Failed original attempt and harness diagnosis](attempt-1/harness-diagnosis.md)
- [Firefox second-attempt diagnosis](attempt-2-firefox/harness-diagnosis.md)
- [Deployed-file fingerprints](deployed-fingerprints.json)
- [Original QA source-preservation proof](preservation.json)
- [Copy manifest and checksums](bundle-manifest.json)

## 🏠 Viewing the interactive reports

From the standalone project root:

```bash
python3 -m http.server 8769 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8769/docs/qa/qa-report.html>. Use `python` or the Windows `py` launcher if that is how Python 3 is installed on your machine. GitHub may display HTML as source; local HTTP serving or downloading and opening the HTML provides the interactive report.

## 📦 What was copied—and what was not

Reports, raw result JSON/logs, screenshots, and archived attempt evidence were copied with matching SHA-256 hashes. The original audit folder is retained. Temporary `node_modules`, Firefox profiles, and top-level QA runner scripts were not copied; archived runner snapshots inside attempt folders remain historical evidence, not a configured local test environment.

Raw evidence retains its original timestamps, target URL, commit, and machine paths. Use this folder's **relative links** to browse the copied evidence; those historical machine paths are not portable execution instructions. No source result was rewritten to suggest a pass or a standalone deployment.

The original audit's preservation proof concerns the portfolio source it tested. The separate [documentation baseline](documentation-baseline.json) records this standalone folder before the README/report additions. The application, existing tests, original prompts, SQL, Git metadata, database, and deployment are outside this documentation change.
