# Cloud-Managed Themes

An App Engineering Showcase demonstrating remotely managed appearance settings with local rendering. A Supabase PostgreSQL record supplies theme defaults and menu order; the browser validates the configuration, respects visitor preferences, and applies installed CSS packages.

**Live portfolio edition:** [Cloud-Managed Themes](https://chernichenkodmitriy.com/showcases/cloud-managed-themes/). This folder is the standalone edition; the live site is maintained separately.

## 🏗️ Architecture and Data Flow

```text
Static host → Browser → Supabase Data API / PostgREST → PostgreSQL
                ↑                                     │
                └──────── Configuration JSON ──────────┘
                ↓
       Validate settings → Resolve preferences → Render local theme
```

1. **Read configuration:** the browser requests the `portfolio` row from `public.portfolio_theme_settings`. The selected fields are `id`, `default_theme`, `default_mode`, and `theme_order`.
2. **Validate data:** the theme must match an installed identifier, the mode must be light or dark, and the order must contain all seven supported themes exactly once. Remote data cannot supply arbitrary stylesheet URLs or executable code.
3. **Resolve preferences:** explicit visitor choices override the corresponding cloud defaults independently. Selecting a theme does not force a mode change, and changing mode does not replace the selected theme. Preferences persist when browser storage permits; otherwise current-page choices remain available.
4. **Render locally:** `theme.js` and `styles/themes/` own CSS, fonts, assets, and appearance. Supabase distributes configuration—not theme files or rendering logic.
5. **Manage asynchronous work:** reloads cancel superseded requests, enforce a six-second timeout, and reject stale results. Preference resolution is repeated when explicit choices change during metadata loading. An unavailable renderer leaves the current valid appearance in place.
6. **Handle failure:** invalid responses, timeouts, and connection errors fall back to validated settings cached for the same project, then bundled defaults. The interface distinguishes connected, loading, and fallback states rather than reporting fallback as a successful cloud read.

The Working System displays observed HTTP status, request duration, configuration, and source. The architecture diagram explains responsibilities; it is not internal database telemetry.

### SQL domain and schema

The domain is one site-wide appearance configuration, not visitor profiles. This is the complete table DDL from [setup.sql](setup.sql); the linked script also contains grants, RLS, seed and verification SQL.

```sql
create table if not exists public.portfolio_theme_settings (
  id text primary key check (id = 'portfolio'),
  default_theme text not null check (default_theme in (
    'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
    'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'
  )),
  default_mode text not null check (default_mode in ('light', 'dark')),
  theme_order text[] not null check (
    cardinality(theme_order) = 7
    and theme_order @> array[
      'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
      'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'
    ]::text[]
    and theme_order <@ array[
      'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
      'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'
    ]::text[]
  )
);
```

```text
public.portfolio_theme_settings (singleton; no foreign keys)
  PK id = 'portfolio'
     default_theme, default_mode, theme_order[7]
```

There are no related entity tables or ER edges. Browser preferences/cache are local state, not SQL relations. MongoDB/document modeling is N/A: no NoSQL store exists.

## 🔐 Permissions and Configuration Ownership

The browser uses a **publishable client key**. SQL grants and row-level security permit browser roles to read the public configuration row, but not insert, update, or delete settings. Only an authorized project administrator changes site-wide defaults.

[setup.sql](setup.sql) defines the table, validation constraints, read policy, and permission checks. Rerunning its seed preserves an existing configuration record. Review the target project before executing it; do not apply it to an unrelated database.

Visitor choices affect their browser, not the database or other visitors. **Use cloud defaults** clears current-page overrides and attempts to remove saved choices. If storage removal is blocked, previously saved preferences can return after reload. The offline simulation skips the network request deliberately; it does not disconnect or modify Supabase.

This project does not implement visitor accounts, cross-device preference synchronization, remote CSS delivery, or a public administration interface. Never place secret/service-role keys or database passwords in browser code or Git.

## ⚙️ Setup and Configuration

**Requirements:** Python 3 and a modern browser. No npm installation, build step, or custom application server is required. Node.js is needed only for JavaScript tests.

From this folder:

```sh
python3 -m http.server 8769 --bind 127.0.0.1
```

Open **http://127.0.0.1:8769/**. On Windows, use `py -3` instead of `python3`. Use HTTP rather than opening `index.html` through `file://`.

The frontend reads `theme-cloud-config.js`; environment variables and `.env` files are not loaded:

```js
window.PortfolioThemeCloudConnection = Object.freeze({
  projectUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY'
});
```

Retain the supplied public connection settings to use the existing demonstration. A working fallback does not prove that the database connection is available.

### Provision a separate hosted database (operator only)

1. Create an isolated Supabase project with PostgreSQL/Data API and open its SQL Editor as the trusted project owner. No local database or Docker is required for this hosted path.
2. Review and run the **entire** [setup.sql](setup.sql) in that project, not just the DDL excerpt. It creates the table, permits only reads for browser roles and seeds `portfolio` with Gothic Stickerboard/light and the seven-theme order. `ON CONFLICT DO NOTHING` preserves an existing row; this is not a destructive reset/migration tool.
3. Inspect the script's final SELECT: one row, RLS enabled, read privileges true and write privileges false for `anon`/`authenticated`. Do not expose a SQL-owner connection to the browser.
4. Set `projectUrl` and `publishableKey` in `theme-cloud-config.js` to that project's public values, serve the frontend as above, and observe a real configuration GET. No visitor write/seed interface is provided.

## 🧪 Verification and Project Files

```sh
python3 -B tests/contract.py
node --test tests/cloud-themes.test.cjs
```

These checks cover standalone structure and configuration logic. [Included QA records](docs/qa/qa-report.md) and [the evidence index](docs/qa/README.md) document historical live-portfolio testing, not a fresh audit of this standalone copy. Consult their dates, findings, and limitations before citing results.

| File or directory | Responsibility |
|---|---|
| `index.html`, `styles/` | Seven-section explanation, architecture diagram, and local theme packages |
| `theme-cloud.js` | Configuration validation, fetching, preferences, cache, and fallback |
| `theme.js` | Local appearance and light/dark rendering |
| `showcase.js`, `site-navigation.js` | Working-system controls, search, status, and navigation |
| `theme-cloud-config.js`, `setup.sql` | Public connection settings and database permissions |
| `tests/`, `docs/qa/` | Verification sources and historical evidence |

## QA Test Summary

This checklist summarizes the [historical live-portfolio QA record](docs/qa/qa-report.md), not a fresh test of this standalone copy. Checked means the inspection was executed and documented—not that every result passed.

- [x] **SQL configuration read:** actual Supabase GET 200, preference resolution, reload/reset and local theme rendering were exercised in Chromium and Firefox.
- [x] **Validation and failure checks:** configuration/search boundaries, fallback and controlled timing regressions were exercised; the held-metadata regression remains a recorded finding ([results](docs/qa/regressions/summary.json)).
- [x] **Automated browser console/network inspection:** no uncaught JavaScript errors were recorded; the Firefox root-favicon 404 remains a finding ([Chromium](docs/qa/chromium-live.json), [Firefox](docs/qa/firefox-live.json)).
- [x] **Terminal/tool execution:** Lighthouse CLI audits and regression-runner results are retained in the linked QA record.

**Inspection method:** recorded browser network/console events and terminal/CLI output provide the inspection evidence; no separate manual DevTools GUI session is claimed or required as an additional completion gate here.

**Storage scope:** this is a read-only SQL-configuration feature. Public SQL create/update/delete and NoSQL CRUD are not implemented and are not claimed as tested. The linked snapshot retains its accessibility and timing findings.

## 🤖 AI Assistance

Hermes Agent assisted implementation, tests and documentation. The [public AI prompt workflow](AI-PROMPTS.md) contains only the reusable **Review → Plan → Build → Verify** prompts published in the showcase. Exact submitted prompts/conversations remain private; reusable prompts are not historical-submission evidence.

Source review supports constrained configuration, local rendering and a read-only SQL boundary. No database-model correction is established by the QA record; its unresolved timing/accessibility findings are not presented as fixes. Historical live Lighthouse scores were performance **98 desktop / 80 mobile**, accessibility **96**, best practices/SEO **100** ([record](docs/qa/qa-report.md)).

## 🎥 Demonstration & Submission Links

| Item | State |
|---|---|
| Public frontend | Live portfolio edition linked above; maintained separately |
| Standalone source / video | No separate public repository or uploaded video URL established in this README |

A concise demonstration can show a real configuration read, independent theme/mode preferences, labeled offline simulation and the dated QA findings. Keep request credentials out of expanded headers; publication/submission are separate steps.

## 💡 Reflection

Keeping remote configuration separate from local theme code limits what database content can change. A successful fallback is useful resilience, but is not proof of a connected database or a passed timing regression.
