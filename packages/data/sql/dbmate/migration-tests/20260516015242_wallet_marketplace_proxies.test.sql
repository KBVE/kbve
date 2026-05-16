-- Companion test fixtures for 20260516015242_wallet_marketplace_proxies.
-- Run via: ./test-migration.sh 20260516015242_wallet_marketplace_proxies
--
-- Exercises the auth-mediated public.proxy_market_* surface using
-- SET LOCAL request.jwt.claims to impersonate authenticated callers.
-- Fresh UUIDs per run via the fixture table since wallet.ledger and
-- wallet.audit_log are append-only.

-- SEED
DROP TABLE IF EXISTS public.__market_proxies_fixture;
CREATE TABLE public.__market_proxies_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__market_proxies_fixture (role, user_id) VALUES
    ('seller',  gen_random_uuid()),
    ('bidder',  gen_random_uuid()),
    ('outsider', gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__market_proxies_fixture;

-- Fund the bidder + outsider so any debits succeed.
DO $$
DECLARE
    v_account UUID;
    v_role    TEXT;
BEGIN
    FOR v_role IN SELECT role FROM public.__market_proxies_fixture WHERE role <> 'seller' LOOP
        SELECT id INTO v_account
          FROM wallet.account a
          JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
         WHERE f.role = v_role;
        PERFORM wallet.service_credit(
            v_account,
            'khash'::wallet.currency_kind,
            5000,
            'reward'::wallet.source_kind,
            'proxies-test funding',
            NULL, NULL,
            gen_random_uuid()
        );
    END LOOP;
END;
$$;

-- ASSERT_AFTER_UP

-- 1. Anon-callable: list_active_readonly works without claims.
BEGIN;
RESET request.jwt.claims;
DO $$
BEGIN
    PERFORM * FROM public.proxy_market_list_active_readonly();
END;
$$;
COMMIT;

-- 2. listing_detail_readonly raises P1001 on missing listing.
BEGIN;
RESET request.jwt.claims;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_market_listing_detail_readonly(999999999::BIGINT);
        RAISE EXCEPTION 'fail: missing listing should have raised P1001';
    EXCEPTION WHEN sqlstate 'P1001' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 3. my_listings_readonly raises 28000 for anon.
BEGIN;
RESET request.jwt.claims;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_market_my_listings_readonly();
        RAISE EXCEPTION 'fail: anon my_listings should have raised 28000';
    EXCEPTION WHEN sqlstate '28000' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 4. create_listing via authenticated seller proxies through to service.
BEGIN;
DO $$
DECLARE
    v_seller_uid UUID;
    v_listing_id BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid
      FROM public.__market_proxies_fixture WHERE role = 'seller';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );

    v_listing_id := public.proxy_market_create_listing(
        jsonb_build_object(
            'kind', 'mc_item',
            'id', 'diamond_axe',
            'instance_id', 'proxies-test-create-' || v_seller_uid::text
        ),
        500,
        100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );
    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'fail: proxy_market_create_listing returned NULL';
    END IF;

    -- 5. seller appears in my_listings_readonly.
    IF NOT EXISTS (
        SELECT 1 FROM public.proxy_market_my_listings_readonly()
         WHERE listing_id = v_listing_id
    ) THEN
        RAISE EXCEPTION 'fail: created listing not visible in my_listings';
    END IF;
END;
$$;
COMMIT;

-- 6. place_bid as bidder JWT, balance + listing pointers update.
BEGIN;
DO $$
DECLARE
    v_seller_uid UUID;
    v_bidder_uid UUID;
    v_bidder_acc UUID;
    v_listing_id BIGINT;
    v_bid_id     BIGINT;
    v_bal0       BIGINT;
    v_bal1       BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid FROM public.__market_proxies_fixture WHERE role = 'seller';
    SELECT user_id INTO v_bidder_uid FROM public.__market_proxies_fixture WHERE role = 'bidder';
    SELECT id INTO v_bidder_acc
      FROM wallet.account a
      JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'bidder';

    SELECT id INTO v_listing_id
      FROM wallet.listing
     WHERE seller_account = (
         SELECT id FROM wallet.account a
           JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
          WHERE f.role = 'seller'
     )
       AND item_ref->>'instance_id' = 'proxies-test-create-' || v_seller_uid::text;

    SELECT khash INTO v_bal0 FROM wallet.balance WHERE account_id = v_bidder_acc;

    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_bidder_uid::text)::text,
        true
    );
    v_bid_id := public.proxy_market_place_bid(v_listing_id, 200, gen_random_uuid());

    SELECT khash INTO v_bal1 FROM wallet.balance WHERE account_id = v_bidder_acc;
    IF v_bal1 <> v_bal0 - 200 THEN
        RAISE EXCEPTION 'fail: bidder balance wrong after place_bid (% vs %)', v_bal1, v_bal0 - 200;
    END IF;

    -- 7. bidder appears in my_bids_readonly.
    IF NOT EXISTS (
        SELECT 1 FROM public.proxy_market_my_bids_readonly()
         WHERE bid_id = v_bid_id
    ) THEN
        RAISE EXCEPTION 'fail: placed bid not visible in my_bids';
    END IF;

    -- 8. listing_detail_readonly carries the bid in the bids array.
    IF NOT EXISTS (
        SELECT 1
          FROM jsonb_array_elements(
              (SELECT bids FROM public.proxy_market_listing_detail_readonly(v_listing_id))
          ) elem
         WHERE (elem->>'bid_id')::BIGINT = v_bid_id
    ) THEN
        RAISE EXCEPTION 'fail: bid not in listing_detail bids array';
    END IF;
END;
$$;
COMMIT;

-- 9. buy_now via outsider JWT settles + bidder is refunded.
BEGIN;
DO $$
DECLARE
    v_outsider_uid UUID;
    v_outsider_acc UUID;
    v_bidder_acc   UUID;
    v_seller_uid   UUID;
    v_seller_acc   UUID;
    v_listing_id   BIGINT;
    v_seller_bal0  BIGINT;
    v_seller_bal1  BIGINT;
    v_bidder_bal0  BIGINT;
    v_bidder_bal1  BIGINT;
BEGIN
    SELECT user_id INTO v_outsider_uid FROM public.__market_proxies_fixture WHERE role = 'outsider';
    SELECT user_id INTO v_seller_uid   FROM public.__market_proxies_fixture WHERE role = 'seller';
    SELECT id INTO v_outsider_acc FROM wallet.account a JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id WHERE f.role = 'outsider';
    SELECT id INTO v_bidder_acc   FROM wallet.account a JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidder';
    SELECT id INTO v_seller_acc   FROM wallet.account a JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';

    SELECT id INTO v_listing_id
      FROM wallet.listing
     WHERE seller_account = v_seller_acc
       AND item_ref->>'instance_id' = 'proxies-test-create-' || v_seller_uid::text;

    SELECT khash INTO v_seller_bal0 FROM wallet.balance WHERE account_id = v_seller_acc;
    SELECT khash INTO v_bidder_bal0 FROM wallet.balance WHERE account_id = v_bidder_acc;

    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_outsider_uid::text)::text,
        true
    );
    PERFORM public.proxy_market_buy_now(v_listing_id, gen_random_uuid());

    -- seller receives buy_now - fee = 500 - 5 = 495
    SELECT khash INTO v_seller_bal1 FROM wallet.balance WHERE account_id = v_seller_acc;
    IF v_seller_bal1 - v_seller_bal0 <> 495 THEN
        RAISE EXCEPTION 'fail: seller net wrong after buy_now (% vs 495)', v_seller_bal1 - v_seller_bal0;
    END IF;

    -- prior bidder refunded their 200
    SELECT khash INTO v_bidder_bal1 FROM wallet.balance WHERE account_id = v_bidder_acc;
    IF v_bidder_bal1 <> v_bidder_bal0 + 200 THEN
        RAISE EXCEPTION 'fail: bidder not refunded (% vs %)', v_bidder_bal1, v_bidder_bal0 + 200;
    END IF;
END;
$$;
COMMIT;

-- 10. cancel_listing on a new auction-only listing refunds the active bidder
--     and rejects non-seller cancel.
BEGIN;
DO $$
DECLARE
    v_seller_uid   UUID;
    v_bidder_uid   UUID;
    v_outsider_uid UUID;
    v_listing_id   BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid   FROM public.__market_proxies_fixture WHERE role = 'seller';
    SELECT user_id INTO v_bidder_uid   FROM public.__market_proxies_fixture WHERE role = 'bidder';
    SELECT user_id INTO v_outsider_uid FROM public.__market_proxies_fixture WHERE role = 'outsider';

    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );
    v_listing_id := public.proxy_market_create_listing(
        jsonb_build_object(
            'kind', 'mc_item',
            'id', 'shovel',
            'instance_id', 'proxies-test-cancel-' || v_seller_uid::text
        ),
        NULL, 50,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_bidder_uid::text)::text,
        true
    );
    PERFORM public.proxy_market_place_bid(v_listing_id, 75, gen_random_uuid());

    -- outsider cannot cancel.
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_outsider_uid::text)::text,
        true
    );
    BEGIN
        PERFORM public.proxy_market_cancel_listing(v_listing_id, 'malicious');
        RAISE EXCEPTION 'fail: non-seller cancel should have raised';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- seller cancels.
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );
    PERFORM public.proxy_market_cancel_listing(v_listing_id, 'changed mind');

    IF NOT EXISTS (
        SELECT 1 FROM wallet.listing
         WHERE id = v_listing_id AND status = 'cancelled'
    ) THEN
        RAISE EXCEPTION 'fail: listing not flipped to cancelled';
    END IF;
END;
$$;
COMMIT;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'proxy_market_%'
    ) THEN
        RAISE EXCEPTION 'fail: proxy_market_* still present after rollback';
    END IF;
END;
$$;
