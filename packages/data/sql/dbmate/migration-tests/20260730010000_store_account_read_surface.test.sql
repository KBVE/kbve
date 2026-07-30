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
    v_name  TEXT;
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

    -- 2. Every receipt is populated. Deliberately NOT an exact-title assertion:
    --    this file runs under two different orderings. test-migration.sh runs
    --    SEED before `dbmate up`, so the seeded receipt is BACKFILLED from the
    --    (already renamed) catalog. ci-dbmate-validate runs SEED against a
    --    fully-migrated database, so the same receipt is SNAPSHOTTED at buy time
    --    and keeps the pre-rename title. Both are correct for their ordering;
    --    the snapshot guarantee itself is proven below on a receipt this file
    --    writes after up, which is order-independent.
    SELECT pu.product_title INTO v_title
      FROM store.purchase pu
     WHERE pu.product_slug = 'snapshot-probe-digital'
     ORDER BY pu.purchase_id DESC LIMIT 1;
    IF v_title IS NULL OR length(v_title) = 0 THEN
        RAISE EXCEPTION 'fail: receipt title empty after migration';
    END IF;
    IF v_title NOT IN ('Digital BEFORE rename', 'Digital AFTER rename') THEN
        RAISE EXCEPTION 'fail: unexpected receipt title (got %)', v_title;
    END IF;

    -- 3. The order path always snapshotted (service_buy_physical writes the
    --    columns inline), so this holds under either ordering.
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

    -- 8. Only ONE keyset index remains on store.purchase: the two-column one
    --    is a prefix of the three-column one and must not survive alongside it.
    IF (SELECT count(*) FROM pg_indexes
         WHERE schemaname = 'store' AND tablename = 'purchase'
           AND indexdef LIKE '%account_id, created_at DESC%') <> 1 THEN
        RAISE EXCEPTION 'fail: redundant purchase keyset index left behind';
    END IF;

    -- 9. Ownership. store.* objects belong to the store_api_owner NOLOGIN role
    --    (20260709180000); service_role has no direct reach into store.purchase,
    --    so a proxy recreated under service_role cannot read through and the
    --    dashboard 500s — the PR #12033 shape. Asserted for the proxy this
    --    migration ADDs and, critically, for the one it DROPs and recreates:
    --    a wrong owner there is a regression of a function that already worked.
    FOR v_name IN
        SELECT unnest(ARRAY[
            'public.proxy_store_my_purchases_readonly(integer,timestamptz,bigint)',
            'public.proxy_store_my_orders_readonly(integer,timestamptz,bigint)',
            'store.purchase_fill_snapshot()'
        ])
    LOOP
        IF (SELECT pg_get_userbyid(proowner) FROM pg_proc
             WHERE oid = v_name::regprocedure) <> 'store_api_owner' THEN
            RAISE EXCEPTION 'fail: % is not owned by store_api_owner (owner %)',
                v_name,
                (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_name::regprocedure);
        END IF;
    END LOOP;

    -- 10. The fill trigger must be SECURITY DEFINER, or its resolution of
    --     store.product rides on the inserting role's grants and RLS — a
    --     no-row SELECT INTO leaves the snapshots NULL and re-raises 23502.
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'store.purchase_fill_snapshot()'::regprocedure) THEN
        RAISE EXCEPTION 'fail: purchase_fill_snapshot is not SECURITY DEFINER';
    END IF;
END;
$$;

-- The actual snapshot guarantee, on a receipt written by the NEW service_buy:
-- buy, then rename the product, and the receipt must not move.
DO $$
DECLARE
    v_account UUID;
    v_title   TEXT;
BEGIN
    SELECT id INTO v_account FROM wallet.account
     WHERE kind = 'user' AND user_id = '00000000-0000-4000-8000-0000000ded01';

    INSERT INTO store.product (slug, title, description, price, currency, asset_ref)
    VALUES ('snapshot-probe-postup', 'Post-up BEFORE rename', NULL, 5, 'credits', '{}'::jsonb)
    ON CONFLICT (slug) DO NOTHING;

    -- This block ends by renaming the product, and ON CONFLICT DO NOTHING keeps
    -- the renamed row, so without an explicit reset a second run against the
    -- same database buys under 'Post-up AFTER rename' and the assertion below
    -- fires on state a previous run left behind rather than on a real defect.
    -- Dropping the receipt lets service_buy write a fresh one (via the
    -- already-owned path, which snapshots identically).
    UPDATE store.product SET title = 'Post-up BEFORE rename'
     WHERE slug = 'snapshot-probe-postup';
    DELETE FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key = '00000000-0000-4000-8000-0000000dec06'::uuid;

    PERFORM store.service_buy(
        v_account, 'snapshot-probe-postup',
        '00000000-0000-4000-8000-0000000dec06'::uuid);

    UPDATE store.product SET title = 'Post-up AFTER rename'
     WHERE slug = 'snapshot-probe-postup';

    SELECT product_title INTO v_title
      FROM store.purchase
     WHERE account_id = v_account AND product_slug = 'snapshot-probe-postup';

    IF v_title IS DISTINCT FROM 'Post-up BEFORE rename' THEN
        RAISE EXCEPTION
            'fail: receipt written by the new service_buy followed the rename (got %)', v_title;
    END IF;
END;
$$;

-- A replay of the same (account, idempotency_key) must return the SAME item and
-- must not write a second receipt or charge again — the path that now verifies
-- the ON CONFLICT instead of ignoring it.
DO $$
DECLARE
    v_account  UUID;
    v_first    UUID;
    v_second   UUID;
    v_receipts INT;
    v_credits  BIGINT;
    v_after    BIGINT;
BEGIN
    SELECT id INTO v_account FROM wallet.account
     WHERE kind = 'user' AND user_id = '00000000-0000-4000-8000-0000000ded01';

    SELECT item_id INTO v_first FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key = '00000000-0000-4000-8000-0000000dec02'::uuid;

    SELECT credits INTO v_credits FROM wallet.balance WHERE account_id = v_account;

    v_second := store.service_buy(
        v_account, 'snapshot-probe-digital',
        '00000000-0000-4000-8000-0000000dec02'::uuid);

    IF v_second IS DISTINCT FROM v_first THEN
        RAISE EXCEPTION 'fail: replay returned a different item (% vs %)', v_second, v_first;
    END IF;

    SELECT count(*) INTO v_receipts FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key = '00000000-0000-4000-8000-0000000dec02'::uuid;
    IF v_receipts <> 1 THEN
        RAISE EXCEPTION 'fail: replay wrote % receipts for one key', v_receipts;
    END IF;

    SELECT credits INTO v_after FROM wallet.balance WHERE account_id = v_account;
    IF v_after <> v_credits THEN
        RAISE EXCEPTION 'fail: replay re-charged the account (% -> %)', v_credits, v_after;
    END IF;
END;
$$;

-- The fill trigger: simulate a writer from BEFORE the deploy by inserting a
-- receipt with the snapshot columns omitted. Without the trigger this is the
-- 23502 that would fail an in-flight buy.
DO $$
DECLARE
    v_account UUID;
    v_product UUID;
    v_item    UUID;
    v_slug    TEXT;
    v_title   TEXT;
BEGIN
    SELECT id INTO v_account FROM wallet.account
     WHERE kind = 'user' AND user_id = '00000000-0000-4000-8000-0000000ded01';
    SELECT product_id INTO v_product FROM store.product WHERE slug = 'snapshot-probe-digital';
    SELECT item_id INTO v_item FROM store.purchase
     WHERE account_id = v_account AND product_slug = 'snapshot-probe-digital' LIMIT 1;

    -- price 0 + ledger_id NULL keeps store_purchase_accounting_ck satisfied.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, price, currency, ledger_id,
        result_kind, idempotency_key
    ) VALUES (
        v_account, v_product, v_item, 0, 'credits', NULL,
        'minted', '00000000-0000-4000-8000-0000000dec07'::uuid
    );

    SELECT product_slug, product_title INTO v_slug, v_title
      FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key = '00000000-0000-4000-8000-0000000dec07'::uuid;

    IF v_slug IS NULL OR v_title IS NULL THEN
        RAISE EXCEPTION 'fail: fill trigger left snapshots NULL (slug %, title %)', v_slug, v_title;
    END IF;
    IF v_slug <> 'snapshot-probe-digital' THEN
        RAISE EXCEPTION 'fail: fill trigger wrote the wrong slug (%)', v_slug;
    END IF;

    -- And it must never overwrite a supplied snapshot.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, product_slug, product_title,
        price, currency, ledger_id, result_kind, idempotency_key
    ) VALUES (
        v_account, v_product, v_item, 'explicit-slug', 'Explicit Title',
        0, 'credits', NULL, 'minted', '00000000-0000-4000-8000-0000000dec08'::uuid
    );
    SELECT product_title INTO v_title FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key = '00000000-0000-4000-8000-0000000dec08'::uuid;
    IF v_title <> 'Explicit Title' THEN
        RAISE EXCEPTION 'fail: fill trigger overwrote a supplied snapshot (%)', v_title;
    END IF;

    DELETE FROM store.purchase
     WHERE account_id = v_account
       AND idempotency_key IN ('00000000-0000-4000-8000-0000000dec07'::uuid,
                               '00000000-0000-4000-8000-0000000dec08'::uuid);
END;
$$;

-- Behaviour of the read proxies themselves, exercised as the caller would:
-- auth.uid() resolves from request.jwt.claims, so set_config impersonates.
DO $$
DECLARE
    v_user      UUID := '00000000-0000-4000-8000-0000000ded01';
    v_other     UUID := '00000000-0000-4000-8000-0000000ded02';
    v_account   UUID;
    v_rows      INT;
    v_page1     BIGINT[];
    v_page2     BIGINT[];
    v_cur_at    TIMESTAMPTZ;
    v_cur_id    BIGINT;
    v_own_ids   BIGINT[];
    v_own_count INT;
BEGIN
    -- A second account with its own receipt, to prove caller scoping.
    INSERT INTO auth.users (id) VALUES (v_other) ON CONFLICT (id) DO NOTHING;
    PERFORM wallet.ensure_user_account(v_other);
    PERFORM wallet.service_credit(
        (SELECT id FROM wallet.account WHERE kind='user' AND user_id=v_other),
        'credits', 500, 'admin', 'scoping probe', 'test', NULL,
        '00000000-0000-4000-8000-0000000dec04'::uuid);
    PERFORM store.service_buy(
        (SELECT id FROM wallet.account WHERE kind='user' AND user_id=v_other),
        'snapshot-probe-digital',
        '00000000-0000-4000-8000-0000000dec05'::uuid);

    -- auth.uid() coalesces request.jwt.claim.sub then request.jwt.claims->>'sub'.
    -- Set BOTH, as store_schema_init.test.sql does: the local image's auth.uid()
    -- is not guaranteed to read the JSON form.
    PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_user::text)::text, true);

    -- Everything that needs store-schema access happens BEFORE dropping role:
    -- authenticated deliberately has no access to store.* (only EXECUTE on the
    -- proxies), which is the boundary being tested. Force the created_at tie the
    -- pagination check needs, and capture the caller's own receipt ids to compare
    -- the proxy output against.
    SELECT id INTO v_account FROM wallet.account WHERE kind='user' AND user_id=v_user;
    UPDATE store.purchase SET created_at = '2026-07-30T00:00:00Z'
     WHERE account_id = v_account;
    SELECT array_agg(purchase_id), count(*) INTO v_own_ids, v_own_count
      FROM store.purchase WHERE account_id = v_account;

    -- Drop to the real caller role. RESET ROLE at the end; the DO block is one
    -- transaction, so SET LOCAL ROLE is scoped to it either way.
    SET LOCAL ROLE authenticated;

    -- 1. Caller sees ONLY its own receipts.
    SELECT count(*) INTO v_rows
      FROM public.proxy_store_my_purchases_readonly(100, NULL, NULL);
    IF v_rows = 0 THEN
        RAISE EXCEPTION 'fail: caller sees none of its own receipts';
    END IF;
    -- Compared against ids captured before the role switch: authenticated has no
    -- access to store.* at all, which is itself the boundary under test.
    IF EXISTS (
        SELECT 1 FROM public.proxy_store_my_purchases_readonly(100, NULL, NULL) p
         WHERE NOT (p.purchase_id = ANY (v_own_ids))
    ) THEN
        RAISE EXCEPTION 'fail: purchases proxy leaked another account''s receipts';
    END IF;
    IF v_rows <> v_own_count THEN
        RAISE EXCEPTION 'fail: proxy returned % rows for an account with % receipts',
            v_rows, v_own_count;
    END IF;

    -- 2. p_limit is clamped to 1..100, not trusted.
    SELECT count(*) INTO v_rows
      FROM public.proxy_store_my_purchases_readonly(0, NULL, NULL);
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'fail: p_limit 0 did not clamp to 1 (got % rows)', v_rows;
    END IF;
    SELECT count(*) INTO v_rows
      FROM public.proxy_store_my_purchases_readonly(100000, NULL, NULL);
    IF v_rows > 100 THEN
        RAISE EXCEPTION 'fail: p_limit above 100 was not clamped (got % rows)', v_rows;
    END IF;

    -- 3. A half-specified cursor is rejected with 22023, not silently ignored.
    BEGIN
        PERFORM * FROM public.proxy_store_my_purchases_readonly(50, now(), NULL);
        RAISE EXCEPTION 'fail: half cursor (id NULL) was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.proxy_store_my_purchases_readonly(50, NULL, 1::bigint);
        RAISE EXCEPTION 'fail: half cursor (created_at NULL) was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    -- 4. Keyset pagination over receipts that SHARE created_at loses nothing and
    --    repeats nothing — the case the purchase_id tiebreak exists for.
    --    This account has TWO receipts: the seeded digital buy and the post-up
    --    buy above. (service_buy_physical writes store."order" only, never
    --    store.purchase, so the physical buy contributes nothing here.) Force
    --    them onto the same timestamp to exercise the tiebreak.
    SELECT array_agg(purchase_id ORDER BY purchase_id DESC) INTO v_page1
      FROM public.proxy_store_my_purchases_readonly(1, NULL, NULL);
    SELECT p.created_at, p.purchase_id INTO v_cur_at, v_cur_id
      FROM public.proxy_store_my_purchases_readonly(1, NULL, NULL) p;
    SELECT array_agg(purchase_id ORDER BY purchase_id DESC) INTO v_page2
      FROM public.proxy_store_my_purchases_readonly(1, v_cur_at, v_cur_id);

    IF v_page1 IS NULL THEN
        RAISE EXCEPTION 'fail: first page empty';
    END IF;
    IF v_page2 IS NULL THEN
        RAISE EXCEPTION 'fail: second page empty despite more tied receipts';
    END IF;
    IF v_page1 && v_page2 THEN
        RAISE EXCEPTION 'fail: pages overlap across equal created_at (% and %)',
            v_page1, v_page2;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    -- 5. With no claims at all the proxy refuses rather than returning rows.
    BEGIN
        PERFORM * FROM public.proxy_store_my_purchases_readonly(50, NULL, NULL);
        RAISE EXCEPTION 'fail: unauthenticated call returned instead of raising';
    EXCEPTION WHEN SQLSTATE '28000' THEN NULL;
    END;

    RESET ROLE;
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

    -- The fill trigger and its function are gone.
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname = 'store_purchase_fill_snapshot' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'fail: fill trigger survived rollback';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'store' AND p.proname = 'purchase_fill_snapshot') THEN
        RAISE EXCEPTION 'fail: fill trigger function survived rollback';
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
