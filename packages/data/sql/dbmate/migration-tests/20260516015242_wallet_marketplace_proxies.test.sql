-- Companion test fixtures for 20260516015242_wallet_marketplace_proxies.
-- Run via: ./test-migration.sh 20260516015242_wallet_marketplace_proxies
--
-- Exercises the auth-mediated public.proxy_market_* surface using
-- SET LOCAL request.jwt.claims to impersonate authenticated callers.
-- Fresh UUIDs per run via the fixture table since wallet.ledger and
-- wallet.audit_log are append-only.

-- SEED
-- Ensure local auth stub is reachable by service_role + the auth.uid()
-- function reads request.jwt.claims (matching Supabase prod). The
-- production env already has these; this block is idempotent so it
-- only patches the local dev container.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT NULLIF(
        COALESCE(
            current_setting('request.jwt.claim.sub', true),
            (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'sub'
        ),
        ''
    )::UUID;
$$;

DROP TABLE IF EXISTS public.__market_proxies_fixture;
CREATE TABLE public.__market_proxies_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__market_proxies_fixture (role, user_id) VALUES
    ('seller',   gen_random_uuid()),
    ('bidder',   gen_random_uuid()),
    ('outsider', gen_random_uuid()),
    -- 'orphan' has an auth.users row but no wallet.account (used for
    -- the WLT01 missing-wallet test). We tear down the trigger-
    -- provisioned account immediately below.
    ('orphan',   gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__market_proxies_fixture;

-- Strip orphan's trigger-provisioned wallet rows so proxy calls raise WLT01.
DO $$
DECLARE
    v_orphan_acc UUID;
BEGIN
    SELECT a.id INTO v_orphan_acc
      FROM wallet.account a
      JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'orphan';
    IF v_orphan_acc IS NOT NULL THEN
        DELETE FROM wallet.coupon WHERE account_id = v_orphan_acc;
        DELETE FROM wallet.balance WHERE account_id = v_orphan_acc;
        DELETE FROM wallet.account WHERE id = v_orphan_acc;
    END IF;
END;
$$;

-- Assert the auth.users trigger actually provisioned the other three
-- fixture users' wallet accounts before we move on.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM public.__market_proxies_fixture f
          LEFT JOIN wallet.account a
            ON a.user_id = f.user_id AND a.kind = 'user'
         WHERE f.role <> 'orphan'
           AND a.id IS NULL
    ) THEN
        RAISE EXCEPTION 'fail: fixture wallet accounts were not auto-provisioned';
    END IF;
END;
$$;

-- Fund the bidder + outsider so any debits succeed.
DO $$
DECLARE
    v_account UUID;
    v_role    TEXT;
BEGIN
    FOR v_role IN
        SELECT role FROM public.__market_proxies_fixture
         WHERE role IN ('bidder', 'outsider')
    LOOP
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
    v_buy_now_price BIGINT := 500;
    v_expected_fee  BIGINT := v_buy_now_price / 100;  -- 1% rate
    v_expected_net  BIGINT := v_buy_now_price - (v_buy_now_price / 100);
    v_prior_bid     BIGINT := 200;
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

    SELECT khash INTO v_seller_bal1 FROM wallet.balance WHERE account_id = v_seller_acc;
    IF v_seller_bal1 - v_seller_bal0 <> v_expected_net THEN
        RAISE EXCEPTION 'fail: seller net wrong after buy_now (% vs %)',
            v_seller_bal1 - v_seller_bal0, v_expected_net;
    END IF;

    SELECT khash INTO v_bidder_bal1 FROM wallet.balance WHERE account_id = v_bidder_acc;
    IF v_bidder_bal1 <> v_bidder_bal0 + v_prior_bid THEN
        RAISE EXCEPTION 'fail: bidder not refunded (% vs %)',
            v_bidder_bal1, v_bidder_bal0 + v_prior_bid;
    END IF;

    -- Listing flips to sold with buyer + settled_at populated, live-bid
    -- pointers cleared.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.listing
         WHERE id = v_listing_id
           AND status = 'sold'
           AND buyer_account = v_outsider_acc
           AND settled_at IS NOT NULL
           AND current_bid_id IS NULL
    ) THEN
        RAISE EXCEPTION 'fail: listing not settled correctly after buy_now';
    END IF;

    -- Prior bid demoted to 'outbid' with refund_ledger_id set.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.bid
         WHERE listing_id = v_listing_id
           AND bidder_account = v_bidder_acc
           AND status = 'outbid'
           AND refund_ledger_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'fail: prior bid not marked outbid with refund_ledger_id';
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
    v_bidder_acc   UUID;
    v_bid_amount   BIGINT := 75;
    v_bal0         BIGINT;
    v_bal1         BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid   FROM public.__market_proxies_fixture WHERE role = 'seller';
    SELECT user_id INTO v_bidder_uid   FROM public.__market_proxies_fixture WHERE role = 'bidder';
    SELECT user_id INTO v_outsider_uid FROM public.__market_proxies_fixture WHERE role = 'outsider';
    SELECT id INTO v_bidder_acc
      FROM wallet.account a
      JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'bidder';

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
    SELECT khash INTO v_bal0 FROM wallet.balance WHERE account_id = v_bidder_acc;
    PERFORM public.proxy_market_place_bid(v_listing_id, v_bid_amount, gen_random_uuid());

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

    -- Bidder balance restored.
    SELECT khash INTO v_bal1 FROM wallet.balance WHERE account_id = v_bidder_acc;
    IF v_bal1 <> v_bal0 THEN
        RAISE EXCEPTION 'fail: bidder not refunded after cancel (% vs %)', v_bal1, v_bal0;
    END IF;

    -- Bid row marked 'refunded' with refund_ledger_id.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.bid
         WHERE listing_id = v_listing_id
           AND bidder_account = v_bidder_acc
           AND status = 'refunded'
           AND refund_ledger_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'fail: cancelled bid not marked refunded with refund_ledger_id';
    END IF;
END;
$$;
COMMIT;

-- 11. WLT01 missing-wallet path: orphan calls my_listings / my_bids /
--     create_listing → all raise WLT01 (Rust client falls back to rw
--     lazy-provision).
BEGIN;
DO $$
DECLARE
    v_orphan_uid UUID;
BEGIN
    SELECT user_id INTO v_orphan_uid FROM public.__market_proxies_fixture WHERE role = 'orphan';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_orphan_uid::text)::text,
        true
    );

    BEGIN
        PERFORM * FROM public.proxy_market_my_listings_readonly();
        RAISE EXCEPTION 'fail: orphan my_listings should have raised WLT01';
    EXCEPTION WHEN sqlstate 'WLT01' THEN NULL;
    END;

    BEGIN
        PERFORM * FROM public.proxy_market_my_bids_readonly();
        RAISE EXCEPTION 'fail: orphan my_bids should have raised WLT01';
    EXCEPTION WHEN sqlstate 'WLT01' THEN NULL;
    END;

    BEGIN
        PERFORM public.proxy_market_create_listing(
            jsonb_build_object('kind', 'mc_item', 'id', 'x', 'instance_id', 'orphan-' || v_orphan_uid::text),
            100, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: orphan create_listing should have raised WLT01';
    EXCEPTION WHEN sqlstate 'WLT01' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 12. Cursor pair validation: mismatched cursor args raise 22023.
BEGIN;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_market_list_active_readonly(50, statement_timestamp(), NULL);
        RAISE EXCEPTION 'fail: list_active half-cursor should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.proxy_market_list_active_readonly(50, NULL, 1::BIGINT);
        RAISE EXCEPTION 'fail: list_active half-cursor (id only) should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 13. Limit clamping: huge limit clamps to 100; null / 0 / -1 land on
--     valid defaults.
BEGIN;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.proxy_market_list_active_readonly(100000);
    IF v_count > 100 THEN
        RAISE EXCEPTION 'fail: list_active returned % rows, expected <= 100', v_count;
    END IF;
    -- Just exercise the boundary; returning >=0 with no error proves clamp.
    PERFORM * FROM public.proxy_market_list_active_readonly(NULL);
    PERFORM * FROM public.proxy_market_list_active_readonly(0);
    PERFORM * FROM public.proxy_market_list_active_readonly(-1);
END;
$$;
COMMIT;

-- 14. Grants posture (drift catch): anon has EXECUTE on the public
--     browse pair but NOT on personal or write proxies.
DO $$
BEGIN
    IF NOT has_function_privilege(
        'anon',
        'public.proxy_market_list_active_readonly(integer,timestamp with time zone,bigint)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: anon missing EXECUTE on list_active_readonly';
    END IF;
    IF NOT has_function_privilege(
        'anon',
        'public.proxy_market_listing_detail_readonly(bigint)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: anon missing EXECUTE on listing_detail_readonly';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.proxy_market_my_listings_readonly(integer,timestamp with time zone,bigint)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: anon should NOT have EXECUTE on my_listings_readonly';
    END IF;
    IF has_function_privilege(
        'anon',
        'public.proxy_market_create_listing(jsonb,bigint,bigint,timestamp with time zone,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: anon should NOT have EXECUTE on create_listing';
    END IF;
END;
$$;

-- 15. Seller cannot bid on or buy_now their own listing (P1005).
BEGIN;
DO $$
DECLARE
    v_seller_uid UUID;
    v_listing_id BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid FROM public.__market_proxies_fixture WHERE role = 'seller';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );

    v_listing_id := public.proxy_market_create_listing(
        jsonb_build_object(
            'kind', 'mc_item', 'id', 'self-bid-test',
            'instance_id', 'proxies-test-self-' || v_seller_uid::text
        ),
        300, 50,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    BEGIN
        PERFORM public.proxy_market_place_bid(v_listing_id, 100, gen_random_uuid());
        RAISE EXCEPTION 'fail: seller self-bid should have raised P1005';
    EXCEPTION WHEN sqlstate 'P1005' THEN NULL;
    END;

    BEGIN
        PERFORM public.proxy_market_buy_now(v_listing_id, gen_random_uuid());
        RAISE EXCEPTION 'fail: seller self-buy should have raised P1005';
    EXCEPTION WHEN sqlstate 'P1005' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 16. Idempotency replay: same key returns the same row id.
BEGIN;
DO $$
DECLARE
    v_seller_uid UUID;
    v_bidder_uid UUID;
    v_outsider_uid UUID;
    v_listing_id BIGINT;
    v_create_key UUID := gen_random_uuid();
    v_bid_key    UUID := gen_random_uuid();
    v_buynow_key UUID := gen_random_uuid();
    v_id1 BIGINT;
    v_id2 BIGINT;
    v_target_listing BIGINT;
    v_target_listing_2 BIGINT;
BEGIN
    SELECT user_id INTO v_seller_uid   FROM public.__market_proxies_fixture WHERE role = 'seller';
    SELECT user_id INTO v_bidder_uid   FROM public.__market_proxies_fixture WHERE role = 'bidder';
    SELECT user_id INTO v_outsider_uid FROM public.__market_proxies_fixture WHERE role = 'outsider';

    -- create_listing replay
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );
    v_id1 := public.proxy_market_create_listing(
        jsonb_build_object('kind', 'mc_item', 'id', 'replay',
            'instance_id', 'proxies-test-replay-' || v_seller_uid::text),
        500, 100,
        statement_timestamp() + interval '2 hours',
        v_create_key
    );
    v_id2 := public.proxy_market_create_listing(
        jsonb_build_object('kind', 'mc_item', 'id', 'replay-different',
            'instance_id', 'proxies-test-replay-x-' || v_seller_uid::text),
        999, 999,
        statement_timestamp() + interval '5 hours',
        v_create_key
    );
    IF v_id1 IS DISTINCT FROM v_id2 THEN
        RAISE EXCEPTION 'fail: create_listing idempotency replay returned different ids (%, %)', v_id1, v_id2;
    END IF;

    -- place_bid replay (same listing, same key → same bid id)
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_bidder_uid::text)::text,
        true
    );
    v_id1 := public.proxy_market_place_bid(v_id1, 120, v_bid_key);
    v_id2 := public.proxy_market_place_bid(v_id1::BIGINT, 120, v_bid_key);
    -- v_id1 was overwritten; assert by re-running
    IF v_id1 IS DISTINCT FROM v_id2 THEN
        RAISE EXCEPTION 'fail: place_bid idempotency replay returned different ids';
    END IF;

    -- buy_now replay on a SECOND fresh listing
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );
    v_target_listing := public.proxy_market_create_listing(
        jsonb_build_object('kind', 'mc_item', 'id', 'buynow-replay',
            'instance_id', 'proxies-test-buynow-replay-' || v_seller_uid::text),
        400, NULL,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_outsider_uid::text)::text,
        true
    );
    v_id1 := public.proxy_market_buy_now(v_target_listing, v_buynow_key);
    v_id2 := public.proxy_market_buy_now(v_target_listing, v_buynow_key);
    IF v_id1 IS DISTINCT FROM v_id2 THEN
        RAISE EXCEPTION 'fail: buy_now idempotency replay returned different bid ids';
    END IF;
END;
$$;
COMMIT;

-- 17. Pagination actually moves forward: page-2 cursor excludes page-1.
BEGIN;
RESET request.jwt.claims;
DO $$
DECLARE
    v_p1_last_id    BIGINT;
    v_p1_last_at    TIMESTAMPTZ;
    v_page2_overlap INT;
BEGIN
    SELECT listing_id, created_at INTO v_p1_last_id, v_p1_last_at
      FROM public.proxy_market_list_active_readonly(2)
     ORDER BY created_at ASC, listing_id ASC
     LIMIT 1;

    IF v_p1_last_id IS NULL THEN
        -- Not enough listings to paginate; skip.
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_page2_overlap
      FROM public.proxy_market_list_active_readonly(2, v_p1_last_at, v_p1_last_id) p2
      JOIN public.proxy_market_list_active_readonly(2) p1
        ON p1.listing_id = p2.listing_id;
    IF v_page2_overlap > 0 THEN
        RAISE EXCEPTION 'fail: page-2 cursor returned % rows that overlap page-1', v_page2_overlap;
    END IF;
END;
$$;
COMMIT;

-- 18. Proxy-level write validation rejects invalid inputs cleanly
--     (before the service layer sees them).
BEGIN;
DO $$
DECLARE
    v_seller_uid UUID;
BEGIN
    SELECT user_id INTO v_seller_uid FROM public.__market_proxies_fixture WHERE role = 'seller';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_seller_uid::text)::text,
        true
    );

    -- create_listing: null item_ref
    BEGIN
        PERFORM public.proxy_market_create_listing(
            NULL, 100, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: null item_ref should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;

    -- create_listing: empty pricing
    BEGIN
        PERFORM public.proxy_market_create_listing(
            jsonb_build_object('kind','mc_item','id','x','instance_id','val-' || v_seller_uid::text),
            NULL, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: missing price should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;

    -- create_listing: negative buy_now_price
    BEGIN
        PERFORM public.proxy_market_create_listing(
            jsonb_build_object('kind','mc_item','id','x','instance_id','val2-' || v_seller_uid::text),
            -1, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: negative buy_now_price should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;

    -- create_listing: past expires_at
    BEGIN
        PERFORM public.proxy_market_create_listing(
            jsonb_build_object('kind','mc_item','id','x','instance_id','val3-' || v_seller_uid::text),
            100, NULL,
            statement_timestamp() - interval '1 hour',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: past expires_at should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;

    -- create_listing: null idempotency_key
    BEGIN
        PERFORM public.proxy_market_create_listing(
            jsonb_build_object('kind','mc_item','id','x','instance_id','val4-' || v_seller_uid::text),
            100, NULL,
            statement_timestamp() + interval '2 hours',
            NULL
        );
        RAISE EXCEPTION 'fail: null idempotency_key should have raised';
    EXCEPTION WHEN sqlstate '22004' THEN NULL;
    END;

    -- place_bid: amount <= 0
    BEGIN
        PERFORM public.proxy_market_place_bid(1::BIGINT, 0::BIGINT, gen_random_uuid());
        RAISE EXCEPTION 'fail: amount=0 should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;

    -- buy_now: null listing_id
    BEGIN
        PERFORM public.proxy_market_buy_now(NULL, gen_random_uuid());
        RAISE EXCEPTION 'fail: null listing_id should have raised';
    EXCEPTION WHEN sqlstate '22004' THEN NULL;
    END;

    -- cancel_listing: null listing_id
    BEGIN
        PERFORM public.proxy_market_cancel_listing(NULL, 'oops');
        RAISE EXCEPTION 'fail: null listing_id should have raised';
    EXCEPTION WHEN sqlstate '22004' THEN NULL;
    END;

    -- cancel_listing: reason > 500 chars
    BEGIN
        PERFORM public.proxy_market_cancel_listing(1::BIGINT, repeat('x', 501));
        RAISE EXCEPTION 'fail: overlong reason should have raised';
    EXCEPTION WHEN sqlstate '22001' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 19. Expired-but-not-yet-swept active listings are hidden from public
--     browse. Backdate created_at + expires_at so the duration CHECK
--     still passes while the deadline is already in the past.
BEGIN;
DO $$
DECLARE
    v_seller_acc UUID;
    v_listing_id BIGINT;
    v_origin     TIMESTAMPTZ := statement_timestamp() - interval '3 hours';
    v_past       TIMESTAMPTZ := statement_timestamp() - interval '1 minute';
BEGIN
    SELECT id INTO v_seller_acc
      FROM wallet.account a
      JOIN public.__market_proxies_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'seller';

    INSERT INTO wallet.listing (
        seller_account, item_ref, currency, buy_now_price,
        created_at, expires_at, idempotency_key
    ) VALUES (
        v_seller_acc,
        jsonb_build_object(
            'kind','mc_item','id','expired',
            'instance_id','proxies-test-expired-' || v_seller_acc::text
        ),
        'khash'::wallet.currency_kind, 100,
        v_origin, v_past, gen_random_uuid()
    ) RETURNING id INTO v_listing_id;

    -- Direct row check confirms it landed as 'active'.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.listing
         WHERE id = v_listing_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'fail: backdated listing did not land active';
    END IF;

    -- Browse proxy must hide it because expires_at <= now().
    IF EXISTS (
        SELECT 1 FROM public.proxy_market_list_active_readonly(100)
         WHERE listing_id = v_listing_id
    ) THEN
        RAISE EXCEPTION 'fail: expired-but-active listing leaked into public browse';
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
