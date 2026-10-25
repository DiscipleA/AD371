# AI Prompt Workflow — Cloud-Managed Themes

Prompts from the showcase’s AI Prompt section, arranged as a Review → Plan → Build → Verify development workflow.

## 1. Review

```text
Review the attached application files before editing.
Identify the theme controller, local theme packages,
navigation, and the working showcase.

Explain which parts run in the browser and which
settings could come from a remote service.
List the files that must remain unchanged.
Do not write code yet.
```

## 2. Plan

```text
Using the review above, plan a read-only Supabase
connection for theme defaults and menu order.

Show Static host delivery, a direct browser GET,
PostgREST, PostgreSQL, SELECT grants, and RLS.
Keep CSS and assets in the local theme packages.
Explain visitor preferences, validation, timeout,
and cache or bundled fallback. No browser writes.
Return a focused plan before implementation.
```

## 3. Build

```text
Add read-only cloud configuration to this static
application without replacing its local rendering
system.

1. Preserve local rendering. Theme packages and
   standalone navigation remain usable independently
   of the configuration request. Do not add other
   portfolio pages.

2. Verify the architecture. PostgreSQL stores one
   public settings record; the Supabase Data API
   exposes permitted reads through PostgREST. The
   record controls the default theme, color mode,
   and menu order, not CSS or assets.

3. Restrict access. Use a publishable browser key
   with SELECT grants and a row-level SELECT policy.
   Browser roles cannot insert, update, or delete
   settings. Keep database passwords and privileged
   keys out of the frontend.

4. Reuse the renderer. Validate remote values
   against installed local theme IDs. The shared
   theme controller applies local CSS and assets;
   remote configuration cannot execute code or
   supply arbitrary asset paths.

5. Handle failure and preferences. Render
   immediately. Use validated cache or bundled
   settings when a request fails. Override defaults
   only in dimensions the visitor explicitly
   selects, including choices made while requests or
   metadata loads are pending. Save choices when
   browser storage is available; otherwise keep them
   for the current page session.

6. Verify observable behavior. Show actual request
   status, duration, and returned settings. Label
   offline simulation. Exercise reads, permission
   checks, independent preferences, malformed data,
   failure recovery, keyboard access, responsive
   layouts, and Chromium/Firefox behavior. Keep
   executed results separate from explanatory
   diagrams and pending deployment checks.
```

## 4. Verify

```text
Test the implementation against its requirements.
Check a real read when reachable, independent
style/mode choices, reload, reset, offline fallback,
restricted storage, search, and keyboard access.
Check installed themes and narrow layouts.

Separate live observations from controlled tests.
Report failures and blocked checks honestly.
Fix only demonstrated defects; preserve the layout.
Never invent a successful response or test result.
```
