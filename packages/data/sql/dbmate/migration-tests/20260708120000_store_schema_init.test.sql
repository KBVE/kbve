-- Companion test fixtures for 20260708120000_store_schema_init.
-- Run via: ./test-migration.sh 20260708120000_store_schema_init
--
-- Locks in the pre-prod hardening invariants for the digital/physical buy +
-- refund paths: durable key idempotency, digital-twin refund isolation,
-- currency snapshot on refund, shipping-address-required, replay fingerprint,
-- and the product/variant composite FK.
--
-- SEED runs before store schema exists, so it only touches auth.users +
-- wallet (both pre-existing). Accounts auto-provision from the auth.users
-- insert trigger; fund them so debits succeed.

-- SEED
DROP TABLE IF EXISTS public.__store_init_fixture;
CREATE TABLE public.__store_init_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__store_init_fixture (role, user_id) VALUES
    ('owner_both', gen_random_uuid()),   -- owns digital first, then buys physical
    ('fresh_phys', gen_random_uuid()),   -- buys physical fresh -> twin minted
    ('digi_buyer', gen_random_uuid()),   -- digital idempotency
    ('refund_cur', gen_random_uuid()),   -- currency snapshot on refund
    ('jwt_buyer',  gen_random_uuid());   -- JWT/owner proxy smoke test

INSERT INTO auth.users (id)
SELECT user_id FROM public.__store_init_fixture;

DO $$
DECLARE
    v_account UUID;
    v_role    TEXT;
BEGIN
    FOR v_role IN SELECT role FROM public.__store_init_fixture LOOP
        SELECT id INTO v_account
          FROM wallet.account a
          JOIN public.__store_init_fixture f ON f.user_id = a.user_id
         WHERE f.role = v_role;
        PERFORM wallet.service_credit(
            v_account, 'credits'::wallet.currency_kind, 100000,
            'reward'::wallet.source_kind, 'store-init-test funding',
            NULL, NULL, gen_random_uuid());
    END LOOP;
END;
$$;

-- ASSERT_AFTER_UP

-- Catalog fixtures (store schema now exists).
INSERT INTO store.product (slug, title, price, currency, fulfillment)
VALUES
    ('test-both',  'Both Product',     0, 'credits', 'both'),
    ('test-phys',  'Physical Product', 0, 'credits', 'physical'),
    ('test-dig-a', 'Digital A',        5, 'credits', 'digital'),
    ('test-dig-b', 'Digital B',        5, 'credits', 'digital')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO store.product_variant (product_id, sku, price)
SELECT product_id, 'SKU-BOTH', 10 FROM store.product WHERE slug = 'test-both'
ON CONFLICT (sku) DO NOTHING;
INSERT INTO store.product_variant (product_id, sku, price)
SELECT product_id, 'SKU-PHYS', 10 FROM store.product WHERE slug = 'test-phys'
ON CONFLICT (sku) DO NOTHING;

-- 1. Digital purchase is durably idempotent by key, and cross-product key
--    reuse is rejected.
DO $$
DECLARE
    v_acct UUID;
    v_key  UUID := gen_random_uuid();
    v_i1   UUID;
    v_i2   UUID;
    v_n    INT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'digi_buyer';

    v_i1 := store.service_buy(v_acct, 'test-dig-a', v_key);
    v_i2 := store.service_buy(v_acct, 'test-dig-a', v_key);
    IF v_i1 IS DISTINCT FROM v_i2 THEN
        RAISE EXCEPTION 'fail: digital replay returned a different item';
    END IF;

    SELECT count(*) INTO v_n FROM store.purchase
     WHERE account_id = v_acct AND idempotency_key = v_key;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fail: expected exactly one purchase receipt, got %', v_n;
    END IF;

    -- Same key, different product -> loud 40001.
    BEGIN
        PERFORM store.service_buy(v_acct, 'test-dig-b', v_key);
        RAISE EXCEPTION 'fail: cross-product key reuse was accepted';
    EXCEPTION WHEN sqlstate '40001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 2. Digital-twin refund isolation: a buyer who ALREADY owns the digital copy
--    then buys the physical variant must NOT have that entitlement revoked on
--    refund (twin_item_id stays NULL).
DO $$
DECLARE
    v_acct    UUID;
    v_digital UUID;
    v_order   BIGINT;
    v_twin    UUID;
    v_state   TEXT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'owner_both';

    -- Owns the digital copy first (free product, service_buy).
    v_digital := store.service_buy(v_acct, 'test-both', gen_random_uuid());

    -- Buys the physical variant of the same product.
    v_order := store.service_buy_physical(
        v_acct,
        (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-BOTH'),
        1, jsonb_build_object('name','A','line1','1 St','city','X','postal_code','1','country','US'),
        gen_random_uuid());

    SELECT twin_item_id INTO v_twin FROM store.order WHERE order_id = v_order;
    IF v_twin IS NOT NULL THEN
        RAISE EXCEPTION 'fail: twin_item_id set for an already-owned digital copy';
    END IF;

    -- Refund the physical order; the pre-existing digital item must survive.
    PERFORM store.service_refund_order(v_order, 'test refund');
    SELECT state INTO v_state FROM inventory.item WHERE id = v_digital;
    IF v_state <> 'held' THEN
        RAISE EXCEPTION 'fail: refund revoked a pre-existing entitlement (state=%)', v_state;
    END IF;
END;
$$;

-- 3. Twin minted by THIS order IS revoked on refund.
DO $$
DECLARE
    v_acct  UUID;
    v_order BIGINT;
    v_twin  UUID;
    v_state TEXT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'fresh_phys';

    v_order := store.service_buy_physical(
        v_acct,
        (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-BOTH'),
        1, jsonb_build_object('name','B','line1','2 St','city','Y','postal_code','2','country','US'),
        gen_random_uuid());

    SELECT twin_item_id INTO v_twin FROM store.order WHERE order_id = v_order;
    IF v_twin IS NULL THEN
        RAISE EXCEPTION 'fail: fresh both-buy did not mint + record a twin';
    END IF;

    PERFORM store.service_refund_order(v_order, 'test refund');
    SELECT state INTO v_state FROM inventory.item WHERE id = v_twin;
    IF v_state <> 'consumed' THEN
        RAISE EXCEPTION 'fail: minted twin not revoked on refund (state=%)', v_state;
    END IF;
END;
$$;

-- 4. Refund uses the order's currency snapshot, not the mutable product row.
DO $$
DECLARE
    v_acct    UUID;
    v_order   BIGINT;
    v_ordcur  wallet.currency_kind;
    v_before  BIGINT;
    v_after   BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'refund_cur';

    v_order := store.service_buy_physical(
        v_acct,
        (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-PHYS'),
        1, jsonb_build_object('name','C','line1','3 St','city','Z','postal_code','3','country','US'),
        gen_random_uuid());

    -- Admin flips the product currency AFTER purchase.
    UPDATE store.product SET currency = 'khash'
     WHERE slug = 'test-phys';

    SELECT currency INTO v_ordcur FROM store.order WHERE order_id = v_order;
    IF v_ordcur <> 'credits' THEN
        RAISE EXCEPTION 'fail: order currency snapshot changed to %', v_ordcur;
    END IF;

    SELECT credits INTO v_before FROM wallet.balance WHERE account_id = v_acct;
    PERFORM store.service_refund_order(v_order, 'test refund');
    SELECT credits INTO v_after FROM wallet.balance WHERE account_id = v_acct;
    IF v_after <> v_before + 10 THEN
        RAISE EXCEPTION 'fail: refund not credited in credits (before=% after=%)', v_before, v_after;
    END IF;

    UPDATE store.product SET currency = 'credits' WHERE slug = 'test-phys';
END;
$$;

-- 5. Physical order requires a shipping address before charging.
DO $$
DECLARE
    v_acct UUID;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'fresh_phys';
    BEGIN
        PERFORM store.service_buy_physical(
            v_acct,
            (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-PHYS'),
            1, '{}'::jsonb, gen_random_uuid());
        RAISE EXCEPTION 'fail: empty shipping_address produced a paid order';
    EXCEPTION WHEN sqlstate '23514' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 6. Replay fingerprint: same key, different qty -> 40001.
DO $$
DECLARE
    v_acct UUID;
    v_key  UUID := gen_random_uuid();
    v_var  UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-PHYS');
    v_ship JSONB := jsonb_build_object('name','D','line1','4 St','city','Q','postal_code','4','country','US');
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'refund_cur';
    PERFORM store.service_buy_physical(v_acct, v_var, 1, v_ship, v_key);
    BEGIN
        PERFORM store.service_buy_physical(v_acct, v_var, 2, v_ship, v_key);
        RAISE EXCEPTION 'fail: replay with different qty was accepted';
    EXCEPTION WHEN sqlstate '40001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 7. Composite FK: an order whose variant belongs to a different product is
--    rejected at the schema level.
DO $$
DECLARE
    v_acct UUID;
    v_prod UUID := (SELECT product_id FROM store.product WHERE slug = 'test-phys');
    v_var  UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-BOTH');
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'digi_buyer';
    BEGIN
        INSERT INTO store.order (account_id, product_id, variant_id, qty,
                                 product_slug, product_title, variant_sku,
                                 credits_amount, shipping_address, idempotency_key)
        VALUES (v_acct, v_prod, v_var, 1, 'x', 'x', 'x', 0,
                jsonb_build_object('name','E'), gen_random_uuid());
        RAISE EXCEPTION 'fail: order with cross-product variant was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;  -- expected
    END;
END;
$$;

-- 8. product slug is immutable after creation.
DO $$
BEGIN
    BEGIN
        UPDATE store.product SET slug = 'test-dig-a-renamed' WHERE slug = 'test-dig-a';
        RAISE EXCEPTION 'fail: product slug was mutated';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 9. order money integrity: a debit ledger must exist iff money moved.
DO $$
DECLARE
    v_acct UUID := (SELECT id FROM wallet.account a
                      JOIN public.__store_init_fixture f ON f.user_id = a.user_id
                     WHERE f.role = 'digi_buyer');
    v_prod UUID := (SELECT product_id FROM store.product WHERE slug = 'test-both');
    v_var  UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-BOTH');
BEGIN
    BEGIN
        INSERT INTO store.order (account_id, product_id, variant_id, qty,
                                 unit_price, product_slug, product_title, variant_sku,
                                 credits_amount, ledger_id, shipping_address, idempotency_key)
        VALUES (v_acct, v_prod, v_var, 1, 10, 'x', 'x', 'x', 10, NULL,
                jsonb_build_object('name','E'), gen_random_uuid());
        RAISE EXCEPTION 'fail: paid order with null ledger was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;  -- expected
    END;
END;
$$;

-- 10. variant stock mode (finite<->unlimited) is immutable.
DO $$
DECLARE
    v_prod UUID := (SELECT product_id FROM store.product WHERE slug = 'test-both');
BEGIN
    -- SKU-BOTH was created with unlimited stock (NULL); flipping to finite fails.
    BEGIN
        PERFORM store.service_upsert_variant(v_prod, 'SKU-BOTH', '{}'::jsonb, 10, 5, 'active');
        RAISE EXCEPTION 'fail: stock mode flip (unlimited->finite) was accepted';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 11. JWT/owner smoke test: exercise the FULL authenticated proxy chain under
--     the real `authenticated` role + the store_api_owner definer — auth.uid()
--     -> private.proxy_store_caller_account -> service_buy, plus wallet.account
--     RLS, inventory mint, and sequence access. The direct-service tests above
--     never touch this path (that is exactly how the missing auth grant slipped
--     past earlier CI), so validate it end to end.
DO $$
DECLARE
    v_user  UUID := (SELECT user_id FROM public.__store_init_fixture WHERE role = 'jwt_buyer');
    v_item  UUID;
    v_cat   INT;
    v_order BIGINT;
    -- Resolve the variant id AS SUPERUSER before dropping to authenticated:
    -- authenticated has no USAGE on schema store, so it can only reach the store
    -- through the SECURITY DEFINER proxies, never a direct table read.
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-PHYS');
BEGIN
    -- Session-scoped (is_local=false) so the claims survive the nested proxy
    -- calls under psql autocommit; set both GUC forms auth.uid() may read.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_user::text, 'role', 'authenticated')::text, false);
    PERFORM set_config('request.jwt.claim.sub', v_user::text, false);
    SET ROLE authenticated;

    -- authenticated-facing catalog read
    SELECT count(*) INTO v_cat FROM public.proxy_store_catalog_readonly();
    IF v_cat < 1 THEN
        RAISE EXCEPTION 'fail: authenticated catalog read returned nothing';
    END IF;

    -- authenticated digital purchase through the proxy chain
    v_item := public.proxy_store_buy('test-dig-a', gen_random_uuid());
    IF v_item IS NULL THEN
        RAISE EXCEPTION 'fail: authenticated proxy_store_buy returned null';
    END IF;

    -- caller-scoped entitlements include the freshly bought item
    PERFORM 1 FROM public.proxy_store_my_entitlements_readonly() WHERE item_id = v_item;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'fail: purchased item not in authenticated entitlements';
    END IF;

    -- authenticated physical purchase through the proxy chain
    v_order := public.proxy_store_buy_physical(
        v_var,
        1, jsonb_build_object('name','J','line1','1 St','city','C','postal_code','1','country','US'),
        gen_random_uuid());
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'fail: authenticated proxy_store_buy_physical returned null';
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', false);
    PERFORM set_config('request.jwt.claim.sub', '', false);
END;
$$;

-- ASSERT_AFTER_DOWN

-- Down drops the whole store schema.
DO $$
BEGIN
    IF to_regclass('store.product') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: store.product survived rollback';
    END IF;
    IF to_regclass('store.purchase') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: store.purchase survived rollback';
    END IF;
END;
$$;
