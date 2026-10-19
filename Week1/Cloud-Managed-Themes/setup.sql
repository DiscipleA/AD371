-- AD371: Cloud-Managed Portfolio Themes
-- Run only in the dedicated AD371-Theme-System project.
-- Project ref: iubbxotkeplkecdhuzke
-- Creates ONE public configuration table. No passwords or secrets required.
-- Re-running preserves configuration that you have already edited.

begin;

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

alter table public.portfolio_theme_settings enable row level security;

-- Grants control which operations are possible. RLS controls visible rows.
-- Publishable browser keys must not be able to change site-wide defaults.
revoke all on table public.portfolio_theme_settings from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.portfolio_theme_settings to anon, authenticated;

drop policy if exists "Read public portfolio theme configuration"
  on public.portfolio_theme_settings;

create policy "Read public portfolio theme configuration"
  on public.portfolio_theme_settings
  for select
  to anon, authenticated
  using (id = 'portfolio');

insert into public.portfolio_theme_settings
  (id, default_theme, default_mode, theme_order)
values (
  'portfolio',
  'gothic-stickerboard',
  'light',
  array[
    'standard', 'playful-pop', 'raggedy-granite', 'glossy-marble',
    'luminous-midnight', 'gothic-stickerboard', 'baroque-plexiglas'
  ]::text[]
)
on conflict (id) do nothing;

commit;

-- Verification: one settings row, RLS enabled, reads allowed, writes denied.
-- Expected: rls_enabled=true; anon_can_read=true; authenticated_can_read=true;
-- anon_can_write=false; authenticated_can_write=false.
select
  settings.*,
  (select relrowsecurity from pg_class
   where oid = 'public.portfolio_theme_settings'::regclass) as rls_enabled,
  has_table_privilege('anon', 'public.portfolio_theme_settings', 'SELECT')
    as anon_can_read,
  has_table_privilege('authenticated', 'public.portfolio_theme_settings', 'SELECT')
    as authenticated_can_read,
  (
    has_table_privilege('anon', 'public.portfolio_theme_settings', 'INSERT')
    or has_table_privilege('anon', 'public.portfolio_theme_settings', 'UPDATE')
    or has_table_privilege('anon', 'public.portfolio_theme_settings', 'DELETE')
  ) as anon_can_write,
  (
    has_table_privilege('authenticated', 'public.portfolio_theme_settings', 'INSERT')
    or has_table_privilege('authenticated', 'public.portfolio_theme_settings', 'UPDATE')
    or has_table_privilege('authenticated', 'public.portfolio_theme_settings', 'DELETE')
  ) as authenticated_can_write
from public.portfolio_theme_settings as settings;
