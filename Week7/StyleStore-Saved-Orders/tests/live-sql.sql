-- REAL PostgreSQL acceptance. Invoke only through live-storage.mjs, which validates
-- two existing QA UUIDs before replacing __OWNER_A__ and __OWNER_B__.
-- Every DDL/DML test, including the controlled fault trigger, is rolled back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '10s';
SET LOCAL client_min_messages = notice;
DO $guard$
DECLARE t text; role_name text; f record;
BEGIN
  IF current_database() <> 'postgres' THEN
    -- Supabase's approved application database is postgres, not another project DB.
    RAISE EXCEPTION 'SS_QA_ASSERT:sql_database_target';
  END IF;
  IF '__OWNER_A__'::uuid = '__OWNER_B__'::uuid OR
    (SELECT count(*) FROM auth.users WHERE id IN ('__OWNER_A__'::uuid,'__OWNER_B__'::uuid)) <> 2 THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:existing_distinct_qa_owners';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='ss_private' AND c.relkind IN ('r','p')) <> 3 THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:approved_private_tables';
  END IF;
  FOREACH t IN ARRAY ARRAY['products','orders','order_items'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='ss_private' AND c.relname=t AND c.relkind='r' AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'SS_QA_ASSERT:private_table_rls';
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_schema_privilege(role_name,'ss_private','USAGE') OR
        has_table_privilege(role_name,'ss_private.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'SS_QA_ASSERT:no_browser_private_grants';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_constraint WHERE connamespace='ss_private'::regnamespace AND contype='f') <> 3 OR
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ss_private.orders'::regclass AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c') OR
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ss_private.order_items'::regclass AND confrelid='ss_private.orders'::regclass AND contype='f' AND confdeltype='c') OR
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ss_private.order_items'::regclass AND confrelid='ss_private.products'::regclass AND contype='f' AND confdeltype='r') THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:three_real_foreign_keys';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('ss_private.orders_owner_idx') AND indisvalid AND indisready
      AND pg_get_indexdef(indexrelid) LIKE '%(owner_id, updated_at DESC, id)%') OR
    NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('ss_private.order_items_order_idx') AND indisvalid AND indisready
      AND pg_get_indexdef(indexrelid) LIKE '%(order_id)%') OR
    NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('ss_private.order_items_product_idx') AND indisvalid AND indisready
      AND pg_get_indexdef(indexrelid) LIKE '%(product_id)%') OR
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ss_private.order_items'::regclass AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (order_id, product_id)') THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:lookup_and_unique_indexes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='ss_private.products'::regclass AND polname='products_read'
      AND 'authenticated'::regrole::oid=ANY(polroles) AND polqual IS NOT NULL) OR
    NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='ss_private.orders'::regclass AND polname='orders_owner'
      AND 'authenticated'::regrole::oid=ANY(polroles) AND polqual IS NOT NULL AND polwithcheck IS NOT NULL) OR
    NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='ss_private.order_items'::regclass AND polname='items_owner'
      AND 'authenticated'::regrole::oid=ANY(polroles) AND polqual IS NOT NULL AND polwithcheck IS NOT NULL) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:owner_rls_policies';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.ss_orders_api(text,uuid,uuid,jsonb)')
      AND prosecdef AND 'search_path=""'=ANY(proconfig)) OR
    NOT has_function_privilege('authenticated','public.ss_orders_api(text,uuid,uuid,jsonb)','EXECUTE') OR
    has_function_privilege('anon','public.ss_orders_api(text,uuid,uuid,jsonb)','EXECUTE') OR
    EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=to_regprocedure('public.ss_orders_api(text,uuid,uuid,jsonb)') AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:rpc_definer_path_and_grants';
  END IF;
  FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='ss_private'::regnamespace LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SS_QA_ASSERT:no_private_function_grants';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM ss_private.products) <> 4 OR
    NOT EXISTS (SELECT 1 FROM ss_private.products WHERE id='retro-sneakers' AND unit_price_cents=8500) OR
    NOT EXISTS (SELECT 1 FROM ss_private.products WHERE id='classic-tee' AND unit_price_cents=2800) OR
    NOT EXISTS (SELECT 1 FROM ss_private.products WHERE id='everyday-hoodie' AND unit_price_cents=6400) OR
    NOT EXISTS (SELECT 1 FROM ss_private.products WHERE id='city-backpack' AND unit_price_cents=5200) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:approved_catalog';
  END IF;
  IF EXISTS (SELECT 1 FROM ss_private.orders WHERE owner_id IN ('__OWNER_A__'::uuid,'__OWNER_B__'::uuid)) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:qa_sql_owners_initially_empty';
  END IF;
END;
$guard$;

-- Serialize this isolated integrity run without deleting or modifying unknown rows.
LOCK TABLE ss_private.orders, ss_private.order_items IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE ss_qa_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM ss_private.orders) AS orders,
       (SELECT count(*) FROM ss_private.order_items) AS items;
CREATE FUNCTION pg_temp.ss_expect(r jsonb, expected integer, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF (r->>'status')::integer IS DISTINCT FROM expected OR
      (expected >= 400 AND r->'data' IS DISTINCT FROM 'null'::jsonb) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:%', label;
  END IF;
END;
$$;

DO $integrity$
DECLARE o uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO ss_private.order_items(order_id,product_id,quantity) VALUES(o,'classic-tee',1);
    RAISE EXCEPTION 'SS_QA_ASSERT:orphan_order_fk_not_enforced';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO ss_private.orders(id,owner_id,label) VALUES(o,'__OWNER_A__','QA cascade');
  BEGIN
    INSERT INTO ss_private.order_items(order_id,product_id,quantity) VALUES(o,'qa-nonexistent-product',1);
    RAISE EXCEPTION 'SS_QA_ASSERT:product_fk_not_enforced';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO ss_private.order_items(order_id,product_id,quantity) VALUES(o,'classic-tee',1);
  BEGIN
    INSERT INTO ss_private.order_items(order_id,product_id,quantity) VALUES(o,'classic-tee',1);
    RAISE EXCEPTION 'SS_QA_ASSERT:item_unique_not_enforced';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE ss_private.products SET unit_price_cents=1 WHERE id='classic-tee';
    RAISE EXCEPTION 'SS_QA_ASSERT:catalog_update_not_rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM ss_private.products WHERE id='classic-tee';
    RAISE EXCEPTION 'SS_QA_ASSERT:catalog_delete_not_rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM ss_private.orders WHERE id=o;
  IF EXISTS (SELECT 1 FROM ss_private.order_items WHERE order_id=o) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:actual_parent_delete_cascade';
  END IF;
END;
$integrity$;

DO $rpc$
DECLARE r jsonb; o uuid; i uuid; b jsonb; q jsonb; op text; n integer;
  base jsonb := '{"label":"QA storage","items":[{"productId":"retro-sneakers","quantity":1}]}'::jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM pg_temp.ss_expect(public.ss_orders_api('listOrders'),401,'rpc_no_auth');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','__OWNER_A__','role','anon')::text,true);
  PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>base),401,'rpc_wrong_auth_role');
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  PERFORM pg_temp.ss_expect(public.ss_orders_api('listOrders'),401,'rpc_missing_subject');
  PERFORM set_config('request.jwt.claims','{"sub":"__OWNER_A__","role":"authenticated"}',true);
  PERFORM pg_temp.ss_expect(public.ss_orders_api('unknown'),400,'rpc_unknown_operation');
  PERFORM pg_temp.ss_expect(public.ss_orders_api(NULL),400,'rpc_null_operation');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('getOrder'),400,'rpc_required_order_id');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('listOrders',gen_random_uuid()),400,'rpc_unexpected_order_id');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('listOrders',p_body=>'{}'),400,'rpc_forbidden_read_body');
  FOR b IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
      'null'::jsonb, '[]'::jsonb, '{}'::jsonb,
      base||'{"ownerId":"__OWNER_B__"}'::jsonb, base||'{"unitPriceCents":1}'::jsonb,
      base||jsonb_build_object('label',''), base||jsonb_build_object('label','   '),
      base||jsonb_build_object('label',repeat('a',81)), base||jsonb_build_object('label',E'x\ny'),
      base||jsonb_build_object('label',repeat('a',8200)), base||'{"items":[]}'::jsonb,
      base||'{"items":null}'::jsonb,
      base||'{"items":[{"productId":"classic-tee","quantity":1},{"productId":"classic-tee","quantity":1}]}'::jsonb,
      base||jsonb_build_object('items',(base->'items')||(base->'items')||(base->'items')||(base->'items')||(base->'items'))
    )) LOOP
    PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>b),400,'rpc_create_input_boundaries');
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements('[0,10,-1,1.5,"1",true,null,{},[]]'::jsonb) LOOP
    b := jsonb_build_object('label','QA invalid quantity','items',jsonb_build_array(jsonb_build_object('productId','classic-tee','quantity',q)));
    PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>b),400,'rpc_quantity_types_and_range');
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements('[{"productId":"absent","quantity":1},{"productId":{"$ne":null},"quantity":1},{"productId":"classic-tee","quantity":1,"name":"forged"},{"productId":"classic-tee","quantity":1,"unitPriceCents":1}]'::jsonb) LOOP
    PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>jsonb_build_object('label','QA invalid item','items',jsonb_build_array(b))),400,'rpc_item_shape_catalog_prices');
  END LOOP;
  r := public.ss_orders_api('createOrder',p_body=>base||jsonb_build_object('label',repeat('a',80)));
  PERFORM pg_temp.ss_expect(r,201,'rpc_create_maximum_label');
  o := (r#>>'{data,id}')::uuid; i := (r#>>'{data,items,0,id}')::uuid;
  IF r#>>'{data,totalCents}' <> '8500' OR r#>>'{data,items,0,unitPriceCents}' <> '8500' OR
      r->'data' ?| ARRAY['ownerId','owner_id'] THEN RAISE EXCEPTION 'SS_QA_ASSERT:rpc_canonical_result'; END IF;
  PERFORM pg_temp.ss_expect(public.ss_orders_api('getOrder',o),200,'rpc_get');
  r := public.ss_orders_api('listOrders');
  PERFORM pg_temp.ss_expect(r,200,'rpc_list');
  IF jsonb_array_length(r->'data') <> 1 THEN RAISE EXCEPTION 'SS_QA_ASSERT:rpc_owner_list'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"__OWNER_B__","role":"authenticated"}',true);
  r := public.ss_orders_api('listOrders');
  IF r->'data' <> '[]'::jsonb THEN RAISE EXCEPTION 'SS_QA_ASSERT:rpc_other_owner_list'; END IF;
  FOREACH op IN ARRAY ARRAY['getOrder','renameOrder','deleteOrder','addItem','updateItem','deleteItem'] LOOP
    b := CASE op WHEN 'renameOrder' THEN '{"label":"stolen"}'::jsonb WHEN 'addItem' THEN '{"productId":"classic-tee","quantity":1}'::jsonb
      WHEN 'updateItem' THEN '{"quantity":9}'::jsonb ELSE NULL END;
    PERFORM pg_temp.ss_expect(public.ss_orders_api(op,o,CASE WHEN op IN ('updateItem','deleteItem') THEN i ELSE NULL END,b),404,'rpc_other_owner_denial');
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"sub":"__OWNER_A__","role":"authenticated"}',true);
  r := public.ss_orders_api('renameOrder',o,p_body=>'{"label":"  QA renamed  "}');
  PERFORM pg_temp.ss_expect(r,200,'rpc_rename');
  IF r#>>'{data,label}' <> 'QA renamed' THEN RAISE EXCEPTION 'SS_QA_ASSERT:rpc_label_trim'; END IF;
  PERFORM pg_temp.ss_expect(public.ss_orders_api('renameOrder',o,p_body=>'{"label":"valid","ownerId":"__OWNER_B__"}'),400,'rpc_rename_extra_fields');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('addItem',o,p_body=>'{"productId":"retro-sneakers","quantity":1}'),409,'rpc_duplicate_item');
  r := public.ss_orders_api('addItem',o,p_body=>'{"productId":"classic-tee","quantity":9}');
  PERFORM pg_temp.ss_expect(r,201,'rpc_add_item');
  IF r#>>'{data,totalCents}' <> '33700' THEN RAISE EXCEPTION 'SS_QA_ASSERT:rpc_joined_total'; END IF;
  PERFORM pg_temp.ss_expect(public.ss_orders_api('updateItem',o,i,'{"quantity":9}'),200,'rpc_update_item_maximum');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('updateItem',o,i,'{"quantity":1}'),200,'rpc_update_item_minimum');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('updateItem',o,i,'{"quantity":0}'),400,'rpc_update_quantity_boundary');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('updateItem',o,i,'{"quantity":1,"productId":"classic-tee"}'),400,'rpc_update_extra_fields');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('updateItem',o,gen_random_uuid(),'{"quantity":1}'),404,'rpc_missing_item');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('deleteItem',o,i),200,'rpc_delete_item');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('deleteItem',o,i),404,'rpc_delete_missing_item');
  PERFORM pg_temp.ss_expect(public.ss_orders_api('deleteOrder',o),200,'rpc_delete_order');
  IF EXISTS (SELECT 1 FROM ss_private.orders WHERE id=o) OR EXISTS (SELECT 1 FROM ss_private.order_items WHERE order_id=o) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:rpc_delete_persisted_cascade';
  END IF;
  FOR n IN 1..10 LOOP
    PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>base),201,'rpc_quota_first_ten');
  END LOOP;
  PERFORM pg_temp.ss_expect(public.ss_orders_api('createOrder',p_body=>base),409,'rpc_quota_eleventh');
  -- These are exclusively the records created above; the guard required no QA rows.
  -- Rollback is the actual cleanup, not an owner-wide DELETE.
END;
$rpc$;

-- Exercise the real authenticated SQL role, rather than just its JWT claim.
SET LOCAL ROLE authenticated;
DO $actual_role$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"__OWNER_A__","role":"authenticated"}',true);
  r := public.ss_orders_api('listOrders');
  IF r->>'status' <> '200' OR jsonb_array_length(r->'data') <> 10 THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:authenticated_role_rpc_execute';
  END IF;
  BEGIN
    PERFORM 1 FROM ss_private.orders LIMIT 1;
    RAISE EXCEPTION 'SS_QA_ASSERT:authenticated_role_private_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$actual_role$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon_role$
BEGIN
  BEGIN
    PERFORM public.ss_orders_api('listOrders');
    RAISE EXCEPTION 'SS_QA_ASSERT:anon_role_rpc_execute';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$anon_role$;
RESET ROLE;

-- CONTROLLED fault, REAL PostgreSQL execution: the second child fails after the
-- first child and parent INSERTs. The RPC must roll its entire subtransaction back.
-- This function/trigger must not preexist; CREATE (not OR REPLACE) is intentional.
CREATE FUNCTION ss_private.ss_qa_storage_reject_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.product_id='classic-tee' THEN
    RAISE EXCEPTION 'controlled QA child insertion rejection' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ss_qa_storage_reject_item BEFORE INSERT ON ss_private.order_items
FOR EACH ROW EXECUTE FUNCTION ss_private.ss_qa_storage_reject_item();
DO $rollback_test$
DECLARE before_orders bigint; before_items bigint; r jsonb;
BEGIN
  SELECT count(*) INTO before_orders FROM ss_private.orders;
  SELECT count(*) INTO before_items FROM ss_private.order_items;
  PERFORM set_config('request.jwt.claims','{"sub":"__OWNER_B__","role":"authenticated"}',true);
  r := public.ss_orders_api('createOrder',p_body=>'{"label":"QA forced rollback","items":[{"productId":"retro-sneakers","quantity":1},{"productId":"classic-tee","quantity":1}]}');
  PERFORM pg_temp.ss_expect(r,503,'rpc_real_partial_insert_rollback_status');
  IF (SELECT count(*) FROM ss_private.orders) <> before_orders OR
     (SELECT count(*) FROM ss_private.order_items) <> before_items OR
     EXISTS (SELECT 1 FROM ss_private.orders WHERE owner_id='__OWNER_B__') THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:rpc_real_partial_insert_rollback_counts';
  END IF;
  IF (SELECT count(*) FROM ss_private.orders) <> (SELECT orders+10 FROM ss_qa_baseline) OR
     (SELECT count(*) FROM ss_private.order_items) <> (SELECT items+10 FROM ss_qa_baseline) THEN
    RAISE EXCEPTION 'SS_QA_ASSERT:sql_expected_in_transaction_delta';
  END IF;
  RAISE NOTICE 'SS_QA_SQL_PASSED';
END;
$rollback_test$;
ROLLBACK;
