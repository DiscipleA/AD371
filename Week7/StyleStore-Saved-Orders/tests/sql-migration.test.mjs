import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATALOG } from '../shared/catalog.mjs';
const source=await readFile(new URL('../supabase/migrations/202611120001_saved_orders.sql',import.meta.url),'utf8').catch(()=> '');
test('SQL source: normalized private schema, foreign keys, uniqueness, constraints and indexes exist',()=>{
  assert.ok(source.length>1000,'complete migration exists');
  for(const table of ['products','orders','order_items']) assert.match(source,new RegExp(`create table if not exists ss_private\\.${table}\\b`,'i'));
  assert.match(source,/owner_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(source,/order_id uuid not null references ss_private\.orders\(id\) on delete cascade/i);
  assert.match(source,/product_id text not null references ss_private\.products\(id\) on delete restrict/i);
  assert.match(source,/unique\s*\(order_id,\s*product_id\)/i);assert.match(source,/quantity between 1 and 9/i);
  for(const index of ['orders_owner_idx','order_items_order_idx','order_items_product_idx'])assert.ok(source.includes(index));
});
test('SQL source: defense-in-depth RLS, no direct browser privileges, auth-derived owner and empty search_path',()=>{
  assert.ok(source.length>0);
  for(const table of ['products','orders','order_items'])assert.match(source,new RegExp(`alter table ss_private\\.${table} enable row level security`,'i'));
  assert.match(source,/revoke all on all tables in schema ss_private from public, anon, authenticated/i);
  assert.match(source,/security definer\s+set search_path = ''/i);assert.match(source,/v_owner uuid := auth\.uid\(\)/i);assert.match(source,/auth\.role\(\) is distinct from 'authenticated'/i);
  assert.match(source,/revoke all on function public\.ss_orders_api\(text, uuid, uuid, jsonb\) from public, anon/i);
  assert.match(source,/grant execute on function public\.ss_orders_api\(text, uuid, uuid, jsonb\) to authenticated/i);
  const rpc = source.slice(source.indexOf('create or replace function public.ss_orders_api'));
  assert.doesNotMatch(rpc,/p_owner|owner_id\s*:=\s*p_/i);
});
test('SQL source: every mutation owner-locks before cap test; reads return before lock',()=>{
  assert.ok(source.length>0);const lock=source.indexOf('from auth.users where id = v_owner for update');
  assert.ok(lock>0);assert.ok(source.indexOf("p_operation = 'listOrders'")<lock);assert.ok(source.indexOf("p_operation = 'getOrder'")<lock);
  assert.ok(source.indexOf('count(*) from ss_private.orders where owner_id = v_owner',lock)>lock);
  assert.match(source,/>= 10/);assert.match(source,/>= 4/);
});
test('SQL source: RPC independently validates body size, fields, Unicode labels, quantities and duplicates',()=>{
  assert.match(source,/octet_length\(p_body::text\) > 8192/i);assert.match(source,/jsonb_typeof/);assert.match(source,/jsonb_array_length/);
  assert.match(source,/char_length\(v_label\) not between 1 and 80/i);assert.match(source,/count\(distinct/);assert.match(source,/ss_private\.valid_item/);
  for(const op of ['createOrder','renameOrder','deleteOrder','addItem','updateItem','deleteItem'])assert.ok(source.includes(`'${op}'`));
  assert.match(source,/exception\s+when unique_violation then/i);assert.match(source,/when others then[\s\S]*'status', 503/);
});
test('SQL source: catalog seed agrees with trusted JS prices, is idempotent and immutable',()=>{
  for(const p of CATALOG)assert.ok(source.includes(`('${p.id}', '${p.id}', '${p.name}', ${p.unitPriceCents})`));
  assert.match(source,/on conflict \(id\) do nothing/i);assert.match(source,/before update or delete on ss_private\.products/i);
  assert.doesNotMatch(source,/truncate|drop table/i);
});
test('SQL source: order JSON aggregates join immutable catalog and all owner reads are qualified',()=>{
  assert.match(source,/join ss_private\.products p on p\.id = i\.product_id/i);
  assert.match(source,/'unitPriceCents', p\.unit_price_cents/);assert.match(source,/'totalCents'/);
  assert.match(source,/where o\.id = p_id and o\.owner_id = p_owner/i);
});
