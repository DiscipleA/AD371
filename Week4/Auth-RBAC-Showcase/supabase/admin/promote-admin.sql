-- MANUAL TRUSTED-OWNER OPERATION. Never run from browser, Edge Function or RPC.
-- Obtain separate project/account approval, audit this script and replace ONLY
-- the UUID below with an existing, verified account's exact auth.users.id.
-- The all-zero placeholder is intentionally rejected; this file is not a migration.
begin;
do $promotion$
declare
  v_target uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_target = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the placeholder only after explicit account approval';
  end if;
  if not exists (select 1 from auth.users as u where u.id = v_target and u.email_confirmed_at is not null) then
    raise exception 'Approved verified auth.users account not found';
  end if;
  insert into gatekeeper_private.user_roles (id, role) values (v_target, 'Admin')
    on conflict (id) do update set role = excluded.role;
  if not exists (select 1 from gatekeeper_private.user_roles as r where r.id = v_target and r.role = 'Admin') then
    raise exception 'Promotion verification failed';
  end if;
end;
$promotion$;
commit;
-- Read back exactly the approved row through trusted SQL after execution.
-- Demotion: an approved owner deletes that row or sets role = 'User'; no API route.
