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

Retain the supplied public connection settings to use the existing demonstration. For a separate project, review and apply `setup.sql` in that project, then replace both public configuration values. A working fallback does not prove that the database connection is available.

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

## 🤖 AI Assistance

AI assisted architecture, implementation, and documentation. [AI-PROMPTS.md](AI-PROMPTS.md) contains the showcase’s **Review → Plan → Build → Verify** prompt workflow.
