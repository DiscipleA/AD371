import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static source-contract checks only: NOT PostgreSQL execution or live authorization proof.
const root = new URL('../supabase/',import.meta.url);
const load = path => readFile(new URL(path,root),'utf8');
const sqlPath = 'migrations/202610230001_gatekeeper.sql';

test('private roles are owner-managed, RLS-enabled and hidden from API roles',async()=>{
  const sql=await load(sqlPath);
  assert.match(sql,/create schema gatekeeper_private/i);
  assert.match(sql,/revoke all on schema gatekeeper_private from public, anon, authenticated/i);
  assert.match(sql,/create table gatekeeper_private\.user_roles/i);
  assert.match(sql,/id uuid primary key references auth\.users\(id\) on delete cascade/i);
  assert.match(sql,/check \(role in \('User', 'Admin'\)\)/i);
  assert.match(sql,/alter table gatekeeper_private\.user_roles enable row level security/i);
  assert.match(sql,/revoke all on all tables in schema gatekeeper_private from public, anon, authenticated/i);
  assert.doesNotMatch(sql,/create policy|grant\s+(select|insert|update|delete|all)\s+.*\s+to\s+(anon|authenticated)/i);
});
test('definer uses empty search_path and authenticated-only execute',async()=>{
  const sql=await load(sqlPath);
  assert.match(sql,/security definer\s+set search_path = ''/i);
  assert.match(sql,/revoke all on function public\.gatekeeper_resource\(text\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.gatekeeper_resource\(text\) to authenticated/i);
  assert.match(sql,/alter function public\.gatekeeper_resource\(text\) owner to postgres/i);
  assert.doesNotMatch(sql,/\bexecute\s+format\b|\bexecute\s+['"]|raw_user_meta_data|raw_app_meta_data|encrypted_password/i);
});
test('SQL independently checks identity, valid session UUID and session ownership before protected reads',async()=>{
  const sql=await load(sqlPath);
  assert.match(sql,/auth\.uid\(\)/i); assert.match(sql,/auth\.jwt\(\)\s*->>\s*'session_id'/i);
  assert.match(sql,/from auth\.sessions as s\s+where s\.id = v_session_id and s\.user_id = v_uid/i);
  assert.match(sql,/v_session_text !~\*/i);
  assert.match(sql,/'status', 401/g);
  assert.ok(sql.indexOf('from auth.sessions') < sql.indexOf('from gatekeeper_private.user_roles'));
  assert.ok(sql.indexOf('from auth.sessions') < sql.indexOf('from gatekeeper_private.admin_briefing'));
});
test('resource authorization is default User and private role only; own-user query is scoped',async()=>{
  const sql=await load(sqlPath);
  assert.match(sql,/coalesce\(\(select r\.role from gatekeeper_private\.user_roles as r where r\.id = v_uid\), 'User'\)/i);
  assert.match(sql,/p_resource is null or p_resource not in \('user', 'admin'\)/i);
  assert.match(sql,/p_resource = 'admin' and v_role <> 'Admin'/i);
  assert.match(sql,/'status', 403/i); assert.match(sql,/'status', 400/i);
  assert.match(sql,/from auth\.users as u where u\.id = v_uid/i);
  assert.doesNotMatch(sql,/select\s+\*|jsonb?_agg\([^)]*u\b|row_to_json|to_jsonb\(u\)/i);
});
test('admin promotion is guarded, SQL-only, not in automatic migrations',async()=>{
  const script=await load('admin/promote-admin.sql');
  assert.match(script,/00000000-0000-0000-0000-000000000000/);
  assert.match(script,/raise exception/i); assert.match(script,/auth\.users/i);
  assert.match(script,/insert into gatekeeper_private\.user_roles/i);
  assert.doesNotMatch(await load(sqlPath),/insert into gatekeeper_private\.user_roles/i);
});
test('edge bootstrap is thin, imports real shared handler and default timeout is eight seconds',async()=>{
  assert.match(await load('config.toml'),/\[functions\.gatekeeper\]\s+verify_jwt = false/);
  const index=await load('functions/gatekeeper/index.ts');
  assert.match(index,/\.\.\/_shared\/gatekeeper\.mjs/); assert.match(index,/Deno\.serve\(createHandler/);
  assert.match(await load('functions/_shared/gatekeeper.mjs'),/timeoutMs = 8_000/);
});
test('service_role default grants are explicitly revoked, not inherited',async()=>{
  const sql=await load(sqlPath);
  assert.match(sql,/revoke all on schema gatekeeper_private from public, anon, authenticated, service_role/i);
  assert.match(sql,/revoke all on all tables in schema gatekeeper_private from public, anon, authenticated, service_role/i);
  assert.match(sql,/revoke all on function public\.gatekeeper_resource\(text\) from public, anon, authenticated, service_role/i);
});
test('setup documents live revocation limits, owner boundary and mock evidence scope',async()=>{
  const readme=await load('README.md');
  for (const term of [/not live/i,/propagation/i,/auth\.sessions/i,/postgres/i,/ALLOWED_ORIGINS/,/SUPABASE_PUBLISHABLE_KEY/,/supabase functions serve/,/supabase db diff/,/session_id/,/cache/i,/audit/i]) assert.match(readme,term);
});
