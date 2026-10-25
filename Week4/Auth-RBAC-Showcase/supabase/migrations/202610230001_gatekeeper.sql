-- AUDIT BEFORE EXECUTION. Not executed by the local Node test suite.
-- Run only on an explicitly approved Supabase project as its trusted postgres owner.
begin;

create schema gatekeeper_private;
revoke all on schema gatekeeper_private from public, anon, authenticated, service_role;
alter default privileges in schema gatekeeper_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema gatekeeper_private revoke execute on functions from public, anon, authenticated, service_role;

create table gatekeeper_private.user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('User', 'Admin'))
);
alter table gatekeeper_private.user_roles enable row level security;
-- No API policies. The trusted function owner is deliberately the sole reader.

create table gatekeeper_private.admin_briefing (
  singleton boolean primary key default true check (singleton),
  briefing text not null check (pg_catalog.length(briefing) between 1 and 1000)
);
alter table gatekeeper_private.admin_briefing enable row level security;
insert into gatekeeper_private.admin_briefing (singleton, briefing) values
  (true, 'Protected operational briefing: review access grants regularly and verify logout revocation before release.');
revoke all on all tables in schema gatekeeper_private from public, anon, authenticated, service_role;

create function public.gatekeeper_resource(p_resource text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $gatekeeper$
declare
  v_uid uuid;
  v_session_text text;
  v_session_id uuid;
  v_role text;
  v_email text;
  v_data jsonb;
  v_briefing text;
begin
  if p_resource is null or p_resource not in ('user', 'admin') then
    return pg_catalog.jsonb_build_object('status', 400, 'body', pg_catalog.jsonb_build_object('error', 'Invalid request.'));
  end if;

  -- PostgREST validates the JWT; do not accept caller-supplied UUID or role parameters.
  v_uid := auth.uid();
  v_session_text := auth.jwt() ->> 'session_id';
  if v_uid is null or v_session_text is null or
     v_session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return pg_catalog.jsonb_build_object('status', 401, 'body', pg_catalog.jsonb_build_object('error', 'Authentication required.'));
  end if;
  v_session_id := v_session_text::uuid;
  if not exists (
    select 1 from auth.sessions as s
    where s.id = v_session_id and s.user_id = v_uid
  ) then
    return pg_catalog.jsonb_build_object('status', 401, 'body', pg_catalog.jsonb_build_object('error', 'Authentication required.'));
  end if;

  -- Absence is an ordinary User. No JWT/app/user metadata is a role authority.
  v_role := coalesce((select r.role from gatekeeper_private.user_roles as r where r.id = v_uid), 'User');
  if p_resource = 'admin' and v_role <> 'Admin' then
    return pg_catalog.jsonb_build_object('status', 403, 'body', pg_catalog.jsonb_build_object('error', 'Access denied.'));
  end if;
  select u.email into v_email from auth.users as u where u.id = v_uid;
  if v_email is null then
    return pg_catalog.jsonb_build_object('status', 401, 'body', pg_catalog.jsonb_build_object('error', 'Authentication required.'));
  end if;

  if p_resource = 'admin' then
    select b.briefing into v_briefing from gatekeeper_private.admin_briefing as b where b.singleton = true;
    if v_briefing is null then
      raise exception 'Gatekeeper protected resource unavailable';
    end if;
    v_data := pg_catalog.jsonb_build_object('briefing', v_briefing);
  else
    v_data := pg_catalog.jsonb_build_object('scope', 'own-account');
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 200,
    'body', pg_catalog.jsonb_build_object(
      'resource', p_resource,
      'message', case when p_resource = 'admin' then 'Admin resource authorized.' else 'User resource authorized.' end,
      'user', pg_catalog.jsonb_build_object('id', v_uid, 'email', v_email, 'role', v_role),
      'data', v_data
    )
  );
end;
$gatekeeper$;

-- postgres can read auth.sessions/auth.users; this function exposes only a narrow API.
-- This is an explicit privileged-owner trust boundary, not a claim that postgres
-- itself is least-privileged. Re-audit owner grants after every project upgrade.
alter function public.gatekeeper_resource(text) owner to postgres;
revoke all on function public.gatekeeper_resource(text) from public, anon, authenticated, service_role;
grant execute on function public.gatekeeper_resource(text) to authenticated;
comment on function public.gatekeeper_resource(text) is
  'Caller-scoped resource gate; checks live session ownership and private role; no metadata grants.';

commit;
