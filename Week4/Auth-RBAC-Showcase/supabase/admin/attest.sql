-- READ-ONLY owner audit AFTER approved migration application. Not run here.
-- Never expose this script as an RPC. Does not return password/hash/session values.
begin transaction read only;
select p.proname, p.prosecdef as security_definer, p.proconfig as settings,
       pg_catalog.pg_get_userbyid(p.proowner) as trusted_owner
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'gatekeeper_resource';

select role_name,
       pg_catalog.has_function_privilege(role_name, 'public.gatekeeper_resource(text)', 'EXECUTE') as rpc_execute,
       pg_catalog.has_schema_privilege(role_name, 'gatekeeper_private', 'USAGE') as private_schema_usage,
       pg_catalog.has_table_privilege(role_name, 'gatekeeper_private.user_roles', 'SELECT') as role_read,
       pg_catalog.has_table_privilege(role_name, 'gatekeeper_private.user_roles', 'INSERT,UPDATE,DELETE') as role_write,
       pg_catalog.has_table_privilege(role_name, 'gatekeeper_private.admin_briefing', 'SELECT') as briefing_read
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);
-- Expected: only authenticated rpc_execute true; all listed private privileges false.
-- PostgreSQL owners retain implicit privileges independent of this API-role check.

select n.nspname, c.relname, c.relrowsecurity as rls_enabled,
       (select pg_catalog.count(1) from pg_catalog.pg_policy as pol where pol.polrelid = c.oid) as api_policy_count
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'gatekeeper_private' and c.relkind = 'r';
-- Expected: two RLS-enabled tables, zero policies. Also inspect exposed API schemas.

-- Optional exact-account hash FORMAT check only. Replace placeholder after approval.
-- No hash, email, salt, cost string or account listing leaves the database.
select pg_catalog.count(1) = 1 as approved_account_exists,
       coalesce(pg_catalog.bool_and(u.encrypted_password ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'), false) as bcrypt_format_only
from auth.users as u
where u.id = '00000000-0000-0000-0000-000000000000'::uuid;
-- This checks shape, NOT cryptographic correctness, cost adequacy or non-reuse of salts.
rollback;
