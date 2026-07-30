-- Companion test fixtures for 20260730010000_store_account_read_surface.
-- Run via: ./test-migration.sh 20260730010000_store_account_read_surface
--
-- The property under test is the one the migration exists for: a receipt is a
-- SNAPSHOT. Renaming a product must not rewrite what an existing purchase or
-- order says was bought.

-- SEED

-- A digital product, a physical variant of a second product, one account, and
-- one buy down each path. service_buy / service_buy_physical are used rather
-- than hand-inserted rows so the write paths themselves are covered.
DO $$
DECLARE
    v_user       UUID := '00000000-0000-4000-8000-0000000ded01';
    v_account    UUID;
    v_variant    UUID;
    v_product    UUID;
BEGIN
    INSERT INTO auth.users (id) VALUES (v_user)
    ON CONFLICT (id) DO NOTHING;

    v_account := wallet.ensure_user_account(v_user);

    PERFORM wallet.service_credit(
        v_account, 'credits', 10000, 'admin', 'snapshot probe funding',
        'test', NULL, '00000000-0000-4000-8000-0000000dec01'::uuid);

    -- Digital.
    INSERT INTO store.product (slug, title, description, price, currency, asset_ref)
    VALUES ('snapshot-probe-digital', 'Digital BEFORE rename', NULL, 10, 'credits', '{}'::jsonb)
    ON CONFLICT (slug) DO NOTHING;

    PERFORM store.service_buy(
        v_account, 'snapshot-probe-digital',
        '00000000-0000-4000-8000-0000000dec02'::uuid);

    -- Physical.
    INSERT INTO store.product (slug, title, description, price, currency, fulfillment, asset_ref)
    VALUES ('snapshot-probe-physical', 'Physical BEFORE rename', NULL, 25, 'credits', 'physical', '{}'::jsonb)
    ON CONFLICT (slug) DO NOTHING
    RETURNING product_id INTO v_product;
    IF v_product IS NULL THEN
        SELECT product_id INTO v_product FROM store.product WHERE slug = 'snapshot-probe-physical';
    END IF;

    v_variant := store.service_upsert_variant(
        v_product, 'SNAP-SKU', '{}'::jsonb, 25, NULL, 'active');

    PERFORM store.service_buy_physical(
        v_account, v_variant, 1,
        jsonb_build_object('name', 'Probe', 'line1', '1 Test St', 'city', 'Testville',
                           'postal_code', '00000', 'country', 'US'),
        '00000000-0000-4000-8000-0000000dec03'::uuid);

    -- The rename that must NOT propagate into either receipt.
    UPDATE store.product SET title = 'Digital AFTER rename'
     WHERE slug = 'snapshot-probe-digital';
    UPDATE store.product SET title = 'Physical AFTER rename'
     WHERE slug = 'snapshot-probe-physical';
END;
$$;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_title TEXT;
    v_cols  INT;
BEGIN
    -- 1. Snapshot columns exist and are NOT NULL.
    SELECT count(*) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'store' AND table_name = 'purchase'
       AND column_name IN ('product_slug', 'product_title')
       AND is_nullable = 'NO';
    IF v_cols <> 2 THEN
        RAISE EXCEPTION 'fail: store.purchase snapshot columns missing or nullable (got %)', v_cols;
    END IF;

    -- 2. service_buy captured the pre-rename title on the receipt.
    SELECT pu.product_title INTO v_title
      FROM store.purchase pu
     WHERE pu.product_slug = 'snapshot-probe-digital'
     ORDER BY pu.purchase_id DESC LIMIT 1;
    IF v_title IS DISTINCT FROM 'Digital BEFORE rename' THEN
        RAISE EXCEPTION 'fail: digital receipt followed the catalog rename (got %)', v_title;
    END IF;

    -- 3. The order path already snapshotted; confirm it still does.
    SELECT o.product_title INTO v_title
      FROM store.order o
     WHERE o.product_slug = 'snapshot-probe-physical'
     ORDER BY o.order_id DESC LIMIT 1;
    IF v_title IS DISTINCT FROM 'Physical BEFORE rename' THEN
        RAISE EXCEPTION 'fail: order receipt followed the catalog rename (got %)', v_title;
    END IF;

    -- 4. The keyset index carries the purchase_id tiebreak the cursor needs.
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'store' AND tablename = 'purchase'
           AND indexdef LIKE '%account_id, created_at DESC, purchase_id DESC%'
    ) THEN
        RAISE EXCEPTION 'fail: purchase keyset index lacks the purchase_id tiebreak';
    END IF;

    -- 5. Both proxies exist, are caller-scoped, and are anon-denied.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'proxy_store_my_purchases_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: proxy_store_my_purchases_readonly missing';
    END IF;
    IF has_function_privilege('anon',
        'public.proxy_store_my_purchases_readonly(integer,timestamptz,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: anon can execute the purchases proxy';
    END IF;
    IF NOT has_function_privilege('authenticated',
        'public.proxy_store_my_purchases_readonly(integer,timestamptz,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: authenticated cannot execute the purchases proxy';
    END IF;

    -- 6. The order proxy returns the snapshot columns after the DROP + CREATE.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines r
         WHERE r.specific_schema = 'public'
           AND r.routine_name = 'proxy_store_my_orders_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: order proxy did not survive the DROP + CREATE';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.parameters
         WHERE specific_schema = 'public'
           AND parameter_mode = 'OUT'
           AND parameter_name = 'product_title'
           AND specific_name IN (
                SELECT specific_name FROM information_schema.routines
                 WHERE specific_schema = 'public'
                   AND routine_name = 'proxy_store_my_orders_readonly')
    ) THEN
        RAISE EXCEPTION 'fail: order proxy does not return product_title';
    END IF;

    -- 7. A comment documents the snapshot contract.
    IF obj_description(
        'public.proxy_store_my_orders_readonly(integer,timestamptz,bigint)'::regprocedure,
        'pg_proc') IS NULL THEN
        RAISE EXCEPTION 'fail: order proxy has no comment';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    -- Snapshot columns are gone again.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'store' AND table_name = 'purchase'
           AND column_name IN ('product_slug', 'product_title')
    ) THEN
        RAISE EXCEPTION 'fail: store.purchase snapshot columns survived rollback';
    END IF;

    -- The purchases proxy is gone.
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'proxy_store_my_purchases_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: purchases proxy survived rollback';
    END IF;

    -- The order proxy is back, WITHOUT the snapshot columns, and still callable
    -- by authenticated — a rollback must not strip the pre-existing surface.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines
         WHERE specific_schema = 'public'
           AND routine_name = 'proxy_store_my_orders_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: order proxy missing after rollback';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.parameters
         WHERE specific_schema = 'public'
           AND parameter_mode = 'OUT'
           AND parameter_name = 'product_title'
           AND specific_name IN (
                SELECT specific_name FROM information_schema.routines
                 WHERE specific_schema = 'public'
                   AND routine_name = 'proxy_store_my_orders_readonly')
    ) THEN
        RAISE EXCEPTION 'fail: order proxy still returns product_title after rollback';
    END IF;
    IF NOT has_function_privilege('authenticated',
        'public.proxy_store_my_orders_readonly(integer,timestamptz,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: authenticated lost EXECUTE on the order proxy after rollback';
    END IF;
END;
$$;
