-- Companion test fixtures for 20260709170000_store_topup_pod.
-- Run via: ./test-migration.sh 20260709170000_store_topup_pod
--
-- Locks in: Stripe top-up replay fingerprint + input validation, and the POD
-- atomic-claim / attach-eligibility invariants.
--
-- SEED seeds auth.users (accounts auto-provision) and funds the POD buyer so
-- the physical purchase succeeds. store schema exists (baseline migrations
-- applied before this one).

-- SEED
DROP TABLE IF EXISTS public.__store_topup_pod_fixture;
CREATE TABLE public.__store_topup_pod_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__store_topup_pod_fixture (role, user_id) VALUES
    ('topup_user', gen_random_uuid()),
    ('pod_buyer',  gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__store_topup_pod_fixture;

DO $$
DECLARE
    v_account UUID;
BEGIN
    SELECT id INTO v_account FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';
    PERFORM wallet.service_credit(
        v_account, 'credits'::wallet.currency_kind, 100000,
        'reward'::wallet.source_kind, 'store-pod-test funding',
        NULL, NULL, gen_random_uuid());
END;
$$;

-- ASSERT_AFTER_UP

-- 1. Top-up applies once, replays idempotently (same event -> same ledger,
--    one row), and a replay with a contradictory payload fails loudly.
DO $$
DECLARE
    v_user UUID := (SELECT user_id FROM public.__store_topup_pod_fixture WHERE role = 'topup_user');
    v_l1   BIGINT;
    v_l2   BIGINT;
    v_n    INT;
BEGIN
    v_l1 := store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 100, 100, 'usd');
    v_l2 := store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 100, 100, 'usd');
    IF v_l1 IS DISTINCT FROM v_l2 THEN
        RAISE EXCEPTION 'fail: topup replay returned a different ledger id';
    END IF;
    SELECT count(*) INTO v_n FROM store.topup WHERE stripe_event_id = 'evt_test_1';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'fail: expected one topup row, got %', v_n;
    END IF;

    -- Same event id, different credits -> fingerprint mismatch (40001).
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_test_1', 'cs_test_1', 999, 100, 'usd');
        RAISE EXCEPTION 'fail: contradictory topup replay was accepted';
    EXCEPTION WHEN sqlstate '40001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 2. Top-up input validation: fiat regex, positive cents, whitespace event id.
DO $$
DECLARE
    v_user UUID := (SELECT user_id FROM public.__store_topup_pod_fixture WHERE role = 'topup_user');
BEGIN
    -- 'dollars' is length 7 -> fails ^[a-z]{3}$ (uppercase 'USD' would just
    -- normalize to 'usd' and be accepted, so test an invalid FORMAT instead).
    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_bad_fiat', 'cs_x', 100, 100, 'dollars');
        RAISE EXCEPTION 'fail: invalid currency_fiat accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    BEGIN
        PERFORM store.service_apply_topup(v_user, 'evt_zero_cents', 'cs_y', 100, 0, 'usd');
        RAISE EXCEPTION 'fail: zero amount_cents accepted';
    EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

    BEGIN
        PERFORM store.service_apply_topup(v_user, '   ', 'cs_z', 100, 100, 'usd');
        RAISE EXCEPTION 'fail: whitespace stripe_event_id accepted';
    EXCEPTION WHEN sqlstate '22004' THEN NULL; END;
END;
$$;

-- POD fixtures: a paid physical order for the claim/attach tests.
INSERT INTO store.product (slug, title, price, currency, fulfillment)
VALUES ('test-pod', 'POD Product', 0, 'credits', 'physical')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO store.product_variant (product_id, sku, price)
SELECT product_id, 'SKU-POD', 10 FROM store.product WHERE slug = 'test-pod'
ON CONFLICT (sku) DO NOTHING;

-- 3. POD lease is atomic: the first lease stamps pod_claimed_at + a token, and
--    a second lease of the still-leased order is rejected (55006).
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_claim JSONB;
    v_at    TIMESTAMPTZ;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(
        v_acct, v_var, 1,
        jsonb_build_object('name','P','line1','9 St','city','C','postal_code','9','country','US'),
        gen_random_uuid());

    v_claim := store.service_order_for_pod(v_order, 'worker-1');
    IF (v_claim->>'claim_token') IS NULL THEN
        RAISE EXCEPTION 'fail: lease did not return a claim_token';
    END IF;
    SELECT pod_claimed_at INTO v_at FROM store.order WHERE order_id = v_order;
    IF v_at IS NULL THEN
        RAISE EXCEPTION 'fail: lease did not stamp pod_claimed_at';
    END IF;

    BEGIN
        PERFORM store.service_order_for_pod(v_order, 'worker-2');
        RAISE EXCEPTION 'fail: order was leased for POD twice';
    EXCEPTION WHEN sqlstate '55006' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 4. ack_pod_submission rejects an ineligible (refunded) order.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(
        v_acct, v_var, 1,
        jsonb_build_object('name','R','line1','8 St','city','C','postal_code','8','country','US'),
        gen_random_uuid());
    PERFORM store.service_refund_order(v_order, 'test');

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, gen_random_uuid(),
            jsonb_build_object('provider','printful','external_order_id','EXT-R'));
        RAISE EXCEPTION 'fail: ack accepted for a refunded order';
    EXCEPTION WHEN sqlstate 'P1001' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 5. External POD order id is unique across local orders (lease + ack each).
DO $$
DECLARE
    v_acct UUID;
    v_var  UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_o1   BIGINT;
    v_o2   BIGINT;
    v_t1   UUID;
    v_t2   UUID;
    v_ref  JSONB := jsonb_build_object('provider','printful','external_order_id','EXT-1');
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_o1 := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','U1','line1','7 St','city','C','postal_code','7','country','US'),
        gen_random_uuid());
    v_o2 := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','U2','line1','6 St','city','C','postal_code','6','country','US'),
        gen_random_uuid());

    v_t1 := (store.service_order_for_pod(v_o1, 'w')->>'claim_token')::uuid;
    v_t2 := (store.service_order_for_pod(v_o2, 'w')->>'claim_token')::uuid;
    PERFORM store.service_ack_pod_submission(v_o1, v_t1, v_ref);
    BEGIN
        PERFORM store.service_ack_pod_submission(v_o2, v_t2, v_ref);
        RAISE EXCEPTION 'fail: same external POD id acked on two orders';
    EXCEPTION WHEN unique_violation THEN
        NULL;  -- expected
    END;
END;
$$;

-- 6. ack requires the current lease token: a stale/wrong token is rejected.
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','T','line1','5 St','city','C','postal_code','5','country','US'),
        gen_random_uuid());
    PERFORM store.service_order_for_pod(v_order, 'worker-1');

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, gen_random_uuid(),
            jsonb_build_object('provider','printful','external_order_id','EXT-2'));
        RAISE EXCEPTION 'fail: ack accepted a stale claim token';
    EXCEPTION WHEN sqlstate '55006' THEN
        NULL;  -- expected
    END;
END;
$$;

-- 7. ack requires a complete provider identity (provider + external_order_id).
DO $$
DECLARE
    v_acct  UUID;
    v_var   UUID := (SELECT variant_id FROM store.product_variant WHERE sku = 'SKU-POD');
    v_order BIGINT;
    v_tok   UUID;
BEGIN
    SELECT id INTO v_acct FROM wallet.account a
      JOIN public.__store_topup_pod_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'pod_buyer';

    v_order := store.service_buy_physical(v_acct, v_var, 1,
        jsonb_build_object('name','I','line1','4 St','city','C','postal_code','4','country','US'),
        gen_random_uuid());
    v_tok := (store.service_order_for_pod(v_order, 'w')->>'claim_token')::uuid;

    BEGIN
        PERFORM store.service_ack_pod_submission(v_order, v_tok,
            jsonb_build_object('provider','printful'));
        RAISE EXCEPTION 'fail: ack accepted without external_order_id';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;  -- expected
    END;
END;
$$;

-- ASSERT_AFTER_DOWN

-- Down drops the topup table + POD columns; store.order itself survives.
DO $$
BEGIN
    IF to_regclass('store.topup') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: store.topup survived rollback';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'store' AND table_name = 'order'
                  AND column_name = 'pod_ref') THEN
        RAISE EXCEPTION 'fail: store.order.pod_ref survived rollback';
    END IF;
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'fail: store.order was dropped by topup_pod rollback';
    END IF;
END;
$$;
