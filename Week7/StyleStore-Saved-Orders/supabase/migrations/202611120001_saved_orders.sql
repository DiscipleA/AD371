-- StyleStore Saved Orders. Apply with the Supabase migration role, never from
-- the browser. All user operations go through the single authenticated RPC.
-- SECURITY DEFINER uses an empty search_path and derives identity from auth.uid.
begin;
create schema if not exists ss_private;
revoke all on schema ss_private from public, anon, authenticated;

create table if not exists ss_private.products (
  id text primary key,
  sku text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  unit_price_cents integer not null check (unit_price_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ss_private.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ss_private.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ss_private.orders(id) on delete cascade,
  product_id text not null references ss_private.products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists orders_owner_idx on ss_private.orders(owner_id, updated_at desc, id);
create index if not exists order_items_order_idx on ss_private.order_items(order_id);
create index if not exists order_items_product_idx on ss_private.order_items(product_id);

-- Never replace previously saved order data or modify price snapshots.
insert into ss_private.products(id, sku, name, unit_price_cents) values
  ('retro-sneakers', 'retro-sneakers', 'Retro Sneakers', 8500),
  ('classic-tee', 'classic-tee', 'Classic Tee', 2800),
  ('everyday-hoodie', 'everyday-hoodie', 'Everyday Hoodie', 6400),
  ('city-backpack', 'city-backpack', 'City Backpack', 5200)
on conflict (id) do nothing;

create or replace function ss_private.reject_product_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Catalog is immutable.' using errcode = '23514';
end;
$$;
drop trigger if exists products_immutable on ss_private.products;
create trigger products_immutable before update or delete on ss_private.products
for each row execute function ss_private.reject_product_change();

alter table ss_private.products enable row level security;
alter table ss_private.orders enable row level security;
alter table ss_private.order_items enable row level security;
-- Policies are defense-in-depth, not grants. Private tables have no browser
-- privileges, and ss_private must not be added to the exposed API schemas.
drop policy if exists products_read on ss_private.products;
create policy products_read on ss_private.products for select to authenticated using (auth.uid() is not null);
drop policy if exists orders_owner on ss_private.orders;
create policy orders_owner on ss_private.orders to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists items_owner on ss_private.order_items;
create policy items_owner on ss_private.order_items to authenticated
  using (exists (select 1 from ss_private.orders o where o.id = order_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from ss_private.orders o where o.id = order_id and o.owner_id = auth.uid()));
revoke all on all tables in schema ss_private from public, anon, authenticated;

-- Match ECMAScript String.trim for the Unicode whitespace accepted by the UI.
create or replace function ss_private.clean_label(p_label text) returns text
language sql immutable set search_path = '' as $$
  select btrim(p_label, E' \t\n\r\f\013' || U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
$$;
create or replace function ss_private.valid_quantity(p_value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p_value) = 'number' then
    (p_value #>> '{}')::numeric between 1 and 9
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
  else false end, false);
$$;
create or replace function ss_private.valid_item(p_item jsonb) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(case
    when jsonb_typeof(p_item) is distinct from 'object' then false
    when not (p_item ?& array['productId','quantity'])
      or p_item - array['productId','quantity'] <> '{}'::jsonb then false
    when jsonb_typeof(p_item->'productId') is distinct from 'string' then false
    else ss_private.valid_quantity(p_item->'quantity')
      and exists (select 1 from ss_private.products p where p.id = p_item->>'productId')
  end, false);
$$;
create or replace function ss_private.order_json(p_id uuid, p_owner uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'label', o.label,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'productId', i.product_id, 'name', p.name,
      'unitPriceCents', p.unit_price_cents, 'quantity', i.quantity
    ) order by i.created_at, i.id)
      from ss_private.order_items i join ss_private.products p on p.id = i.product_id
      where i.order_id = o.id), '[]'::jsonb),
    'totalCents', coalesce((select sum(p.unit_price_cents * i.quantity)
      from ss_private.order_items i join ss_private.products p on p.id = i.product_id
      where i.order_id = o.id), 0),
    'createdAt', to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) from ss_private.orders o where o.id = p_id and o.owner_id = p_owner;
$$;

create or replace function public.ss_orders_api(
  p_operation text,
  p_order_id uuid default null,
  p_item_id uuid default null,
  p_body jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_label text;
  v_order uuid;
  v_item jsonb;
  v_data jsonb;
  v_status integer := 200;
  v_rows integer;
begin
  if v_owner is null or auth.role() is distinct from 'authenticated' then
    return jsonb_build_object('status', 401, 'data', null);
  end if;
  if p_operation is null or p_operation not in
    ('listOrders','getOrder','createOrder','renameOrder','deleteOrder','addItem','updateItem','deleteItem') then
    return jsonb_build_object('status', 400, 'data', null);
  end if;
  if octet_length(p_body::text) > 8192 then
    return jsonb_build_object('status', 400, 'data', null);
  end if;
  if (p_operation in ('listOrders','createOrder') and (p_order_id is not null or p_item_id is not null))
    or (p_operation not in ('listOrders','createOrder') and p_order_id is null)
    or (p_operation in ('updateItem','deleteItem') and p_item_id is null)
    or (p_operation not in ('updateItem','deleteItem') and p_item_id is not null) then
    return jsonb_build_object('status', 400, 'data', null);
  end if;
  -- No caller-controlled owner, id, price, name, or operator is accepted.
  if p_operation in ('createOrder','renameOrder','addItem','updateItem') then
    if jsonb_typeof(p_body) is distinct from 'object' then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
  elsif p_body is not null then
    return jsonb_build_object('status', 400, 'data', null);
  end if;
  if p_operation in ('createOrder','renameOrder') then
    if jsonb_typeof(p_body->'label') is distinct from 'string' then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
    v_label := ss_private.clean_label(p_body->>'label');
    if char_length(v_label) not between 1 and 80 or v_label ~ '[[:cntrl:]]' then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
  end if;
  if p_operation = 'createOrder' then
    if not (p_body ?& array['label','items']) or p_body - array['label','items'] <> '{}'::jsonb
      or jsonb_typeof(p_body->'items') is distinct from 'array' then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
    if jsonb_array_length(p_body->'items') not between 1 and 4 then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
    for v_item in select value from jsonb_array_elements(p_body->'items') loop
      if not ss_private.valid_item(v_item) then
        return jsonb_build_object('status', 400, 'data', null);
      end if;
    end loop;
    if (select count(distinct value->>'productId') from jsonb_array_elements(p_body->'items')) <> jsonb_array_length(p_body->'items') then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
  elsif p_operation = 'renameOrder' then
    if not (p_body ? 'label') or p_body - 'label' <> '{}'::jsonb then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
  elsif p_operation = 'addItem' then
    if not ss_private.valid_item(p_body) then return jsonb_build_object('status', 400, 'data', null); end if;
  elsif p_operation = 'updateItem' then
    if not (p_body ? 'quantity') or p_body - 'quantity' <> '{}'::jsonb or not ss_private.valid_quantity(p_body->'quantity') then
      return jsonb_build_object('status', 400, 'data', null);
    end if;
  end if;

  -- GET paths return without locks or writes.
  if p_operation = 'listOrders' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.doc->'id', 'label', q.doc->'label', 'itemCount', jsonb_array_length(q.doc->'items'),
      'totalCents', q.doc->'totalCents', 'updatedAt', q.doc->'updatedAt'
    ) order by q.updated_at desc, q.id), '[]'::jsonb) into v_data
    from (select o.id, o.updated_at, ss_private.order_json(o.id, v_owner) doc
      from ss_private.orders o where o.owner_id = v_owner order by o.updated_at desc, o.id limit 10) q;
    return jsonb_build_object('status', 200, 'data', v_data);
  elsif p_operation = 'getOrder' then
    v_data := ss_private.order_json(p_order_id, v_owner);
    return jsonb_build_object('status', case when v_data is null then 404 else 200 end, 'data', v_data);
  end if;

  -- Serialize *all* writes for this owner before count/create. Locking an
  -- existing auth.users row avoids the missing-lock-row/upsert race. Both the
  -- count and insert are separate statements under READ COMMITTED, so waiters
  -- see the previous owner's committed changes. No global/table-wide lock.
  perform 1 from auth.users where id = v_owner for update;
  if not found then return jsonb_build_object('status', 401, 'data', null); end if;
  if p_operation = 'createOrder' then
    if (select count(*) from ss_private.orders where owner_id = v_owner) >= 10 then
      return jsonb_build_object('status', 409, 'data', null);
    end if;
    insert into ss_private.orders(owner_id,label) values (v_owner,v_label) returning id into v_order;
    for v_item in select value from jsonb_array_elements(p_body->'items') loop
      insert into ss_private.order_items(order_id,product_id,quantity)
        values (v_order,v_item->>'productId',(v_item->>'quantity')::numeric::integer);
    end loop;
    v_status := 201;
  else
    select id into v_order from ss_private.orders where id = p_order_id and owner_id = v_owner for update;
    if not found then return jsonb_build_object('status', 404, 'data', null); end if;
    if p_operation = 'renameOrder' then
      update ss_private.orders set label = v_label, updated_at = clock_timestamp() where id = v_order;
    elsif p_operation = 'deleteOrder' then
      delete from ss_private.orders where id = v_order;
      return jsonb_build_object('status', 200, 'data', jsonb_build_object('id', v_order, 'deleted', true));
    elsif p_operation = 'addItem' then
      if exists (select 1 from ss_private.order_items where order_id = v_order and product_id = p_body->>'productId')
        or (select count(*) from ss_private.order_items where order_id = v_order) >= 4 then
        return jsonb_build_object('status', 409, 'data', null);
      end if;
      insert into ss_private.order_items(order_id,product_id,quantity)
        values (v_order,p_body->>'productId',(p_body->>'quantity')::numeric::integer);
      update ss_private.orders set updated_at = clock_timestamp() where id = v_order;
      v_status := 201;
    elsif p_operation = 'updateItem' then
      update ss_private.order_items set quantity = (p_body->>'quantity')::numeric::integer, updated_at = clock_timestamp()
        where id = p_item_id and order_id = v_order;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('status', 404, 'data', null); end if;
      update ss_private.orders set updated_at = clock_timestamp() where id = v_order;
    elsif p_operation = 'deleteItem' then
      delete from ss_private.order_items where id = p_item_id and order_id = v_order;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then return jsonb_build_object('status', 404, 'data', null); end if;
      update ss_private.orders set updated_at = clock_timestamp() where id = v_order;
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'data', ss_private.order_json(v_order,v_owner));
exception
  when unique_violation then
    return jsonb_build_object('status', 409, 'data', null);
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status', 400, 'data', null);
  when others then
    -- PL/pgSQL exception blocks roll back every statement above, including a
    -- partially inserted order. Provider diagnostics are intentionally hidden.
    return jsonb_build_object('status', 503, 'data', null);
end;
$$;
revoke all on all functions in schema ss_private from public, anon, authenticated;
revoke all on function public.ss_orders_api(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.ss_orders_api(text, uuid, uuid, jsonb) to authenticated;
commit;
