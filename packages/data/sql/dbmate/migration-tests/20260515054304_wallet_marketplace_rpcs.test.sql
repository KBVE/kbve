-- Companion test fixtures for 20260515054304_wallet_marketplace_rpcs.
-- Run via: ./test-migration.sh 20260515054304_wallet_marketplace_rpcs
--
-- Covers the full create / bid / buy-now / cancel / settle / expire
-- flow. Uses fresh UUIDs each run (stashed in a fixture table) because
-- wallet.ledger and wallet.audit_log are append-only.

-- SEED
DROP TABLE IF EXISTS public.__marketplace_rpcs_fixture;
CREATE TABLE public.__marketplace_rpcs_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__marketplace_rpcs_fixture (role, user_id) VALUES
    ('seller',  gen_random_uuid()),
    ('bidderA', gen_random_uuid()),
    ('bidderB', gen_random_uuid()),
    ('buyer',   gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__marketplace_rpcs_fixture;

-- Fund the bidders + buyer with khash so debits succeed.
DO $$
DECLARE
    v_account UUID;
    v_role    TEXT;
BEGIN
    FOR v_role IN SELECT role FROM public.__marketplace_rpcs_fixture WHERE role <> 'seller' LOOP
        SELECT id INTO v_account
          FROM wallet.account a
          JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id
         WHERE f.role = v_role;
        PERFORM wallet.service_credit(
            v_account,
            'khash'::wallet.currency_kind,
            5000,
            'reward'::wallet.source_kind,
            'rpcs-test funding',
            NULL, NULL,
            gen_random_uuid()
        );
    END LOOP;
END;
$$;

-- ASSERT_AFTER_UP

-- 1. service_create_listing inserts + replays.
DO $$
DECLARE
    v_seller UUID;
    v_key    UUID := gen_random_uuid();
    v_id1    BIGINT;
    v_id2    BIGINT;
BEGIN
    SELECT id INTO v_seller FROM wallet.account a
      JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'seller';

    v_id1 := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'netherite_sword', 'instance_id', 'rpcs-test-1-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500,
        100,
        statement_timestamp() + interval '2 hours',
        v_key
    );
    IF v_id1 IS NULL THEN
        RAISE EXCEPTION 'fail: service_create_listing returned NULL';
    END IF;

    -- Replay returns the same id.
    v_id2 := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'different', 'instance_id', 'rpcs-test-replay-' || v_seller::text),
        'khash'::wallet.currency_kind,
        999, 999,
        statement_timestamp() + interval '5 hours',
        v_key
    );
    IF v_id2 <> v_id1 THEN
        RAISE EXCEPTION 'fail: replay returned different id (%, %)', v_id1, v_id2;
    END IF;
END;
$$;

-- 2. service_place_bid happy path + outbid + refund.
DO $$
DECLARE
    v_seller   UUID;
    v_bidderA  UUID;
    v_bidderB  UUID;
    v_listing  BIGINT;
    v_balA0    BIGINT;
    v_balA1    BIGINT;
    v_balA2    BIGINT;
    v_balB1    BIGINT;
    v_bidA_id  BIGINT;
    v_bidB_id  BIGINT;
    v_lst_row  wallet.listing%ROWTYPE;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';
    SELECT id INTO v_bidderB FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderB';

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'axe', 'instance_id', 'rpcs-test-bid-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    SELECT khash INTO v_balA0 FROM wallet.balance WHERE account_id = v_bidderA;

    v_bidA_id := wallet.service_place_bid(v_listing, v_bidderA, 150, gen_random_uuid());
    SELECT khash INTO v_balA1 FROM wallet.balance WHERE account_id = v_bidderA;
    IF v_balA1 <> v_balA0 - 150 THEN
        RAISE EXCEPTION 'fail: bidderA balance after first bid: % expected %', v_balA1, v_balA0 - 150;
    END IF;

    -- Listing current_bid* updated.
    SELECT * INTO v_lst_row FROM wallet.listing WHERE id = v_listing;
    IF v_lst_row.current_bid IS DISTINCT FROM 150
       OR v_lst_row.current_bid_account IS DISTINCT FROM v_bidderA
       OR v_lst_row.current_bid_id IS DISTINCT FROM v_bidA_id THEN
        RAISE EXCEPTION 'fail: listing live-bid pointers wrong after first bid';
    END IF;

    -- bidderB outbids → bidderA refunded.
    v_bidB_id := wallet.service_place_bid(v_listing, v_bidderB, 200, gen_random_uuid());
    SELECT khash INTO v_balA2 FROM wallet.balance WHERE account_id = v_bidderA;
    IF v_balA2 <> v_balA0 THEN
        RAISE EXCEPTION 'fail: bidderA not fully refunded after outbid: % expected %', v_balA2, v_balA0;
    END IF;
    SELECT khash INTO v_balB1 FROM wallet.balance WHERE account_id = v_bidderB;
    -- Confirm bidderB debited.
    IF v_balB1 <> 5000 - 200 THEN
        RAISE EXCEPTION 'fail: bidderB balance after bid: % expected %', v_balB1, 5000 - 200;
    END IF;

    -- Prior bid demoted to outbid with refund_ledger_id.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.bid WHERE id = v_bidA_id
           AND status = 'outbid' AND refund_ledger_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'fail: prior bid not transitioned to outbid';
    END IF;
END;
$$;

-- 3. service_place_bid rejects: seller bidding own listing, below min_bid,
--    not exceeding current_bid, expired.
DO $$
DECLARE
    v_seller   UUID;
    v_bidderA  UUID;
    v_listing  BIGINT;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'shield', 'instance_id', 'rpcs-test-reject-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    -- Self-bid blocked.
    BEGIN
        PERFORM wallet.service_place_bid(v_listing, v_seller, 200, gen_random_uuid());
        RAISE EXCEPTION 'fail: seller self-bid should have raised';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    -- Below min_bid blocked.
    BEGIN
        PERFORM wallet.service_place_bid(v_listing, v_bidderA, 50, gen_random_uuid());
        RAISE EXCEPTION 'fail: bid below min_bid should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    -- Place a real bid then attempt a non-monotonic bid.
    PERFORM wallet.service_place_bid(v_listing, v_bidderA, 150, gen_random_uuid());
    BEGIN
        PERFORM wallet.service_place_bid(v_listing, v_bidderA, 140, gen_random_uuid());
        RAISE EXCEPTION 'fail: non-monotonic bid should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;

-- 4. service_place_bid short-circuits to settle when amount >= buy_now_price.
DO $$
DECLARE
    v_seller         UUID;
    v_bidderA        UUID;
    v_listing        BIGINT;
    v_treasury       UUID;
    v_treasury_bal0  BIGINT;
    v_treasury_bal1  BIGINT;
    v_seller_bal0    BIGINT;
    v_seller_bal1    BIGINT;
    v_lst_row        wallet.listing%ROWTYPE;
    v_bid_id         BIGINT;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';
    SELECT wallet.treasury_account_id() INTO v_treasury;

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'crown', 'instance_id', 'rpcs-test-shortcircuit-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    SELECT khash INTO v_treasury_bal0 FROM wallet.balance WHERE account_id = v_treasury;
    SELECT khash INTO v_seller_bal0   FROM wallet.balance WHERE account_id = v_seller;

    -- 500 == buy_now 500 → short-circuit. Bids strictly above
    -- buy_now_price are rejected (use buy_now instead).
    v_bid_id := wallet.service_place_bid(v_listing, v_bidderA, 500, gen_random_uuid());

    SELECT * INTO v_lst_row FROM wallet.listing WHERE id = v_listing;
    IF v_lst_row.status <> 'sold' OR v_lst_row.buyer_account IS DISTINCT FROM v_bidderA THEN
        RAISE EXCEPTION 'fail: short-circuit settle did not flip listing to sold';
    END IF;
    IF v_lst_row.current_bid_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: settled listing still carries current_bid_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM wallet.bid WHERE id = v_bid_id AND status = 'won') THEN
        RAISE EXCEPTION 'fail: winning bid not marked won';
    END IF;

    SELECT khash INTO v_treasury_bal1 FROM wallet.balance WHERE account_id = v_treasury;
    SELECT khash INTO v_seller_bal1   FROM wallet.balance WHERE account_id = v_seller;
    -- fee = 500/100 = 5, seller gets 495.
    IF v_treasury_bal1 - v_treasury_bal0 <> 5 THEN
        RAISE EXCEPTION 'fail: treasury fee wrong: % expected 5', v_treasury_bal1 - v_treasury_bal0;
    END IF;
    IF v_seller_bal1 - v_seller_bal0 <> 495 THEN
        RAISE EXCEPTION 'fail: seller net wrong: % expected 495', v_seller_bal1 - v_seller_bal0;
    END IF;
END;
$$;

-- 4b. Bid strictly above buy_now_price is rejected.
DO $$
DECLARE
    v_seller   UUID;
    v_bidderA  UUID;
    v_listing  BIGINT;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'lance', 'instance_id', 'rpcs-test-overpay-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );
    BEGIN
        PERFORM wallet.service_place_bid(v_listing, v_bidderA, 501, gen_random_uuid());
        RAISE EXCEPTION 'fail: bid above buy_now_price should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;

-- 4c. service_create_listing rejects invalid inputs.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    BEGIN
        PERFORM wallet.service_create_listing(
            v_seller,
            jsonb_build_object('item_id', 'x', 'instance_id', 'rpcs-test-currency-' || v_seller::text),
            'credits'::wallet.currency_kind, 100, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: credits currency should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM wallet.service_create_listing(
            v_seller, '{}'::jsonb,
            'khash'::wallet.currency_kind, 100, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: empty item_ref should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM wallet.service_create_listing(
            v_seller,
            jsonb_build_object('item_id', 'x', 'instance_id', 'rpcs-test-past-' || v_seller::text),
            'khash'::wallet.currency_kind, 100, NULL,
            statement_timestamp() - interval '1 hour',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: past expires_at should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM wallet.service_create_listing(
            v_seller,
            jsonb_build_object('item_id', 'x', 'instance_id', 'rpcs-test-noprice-' || v_seller::text),
            'khash'::wallet.currency_kind, NULL, NULL,
            statement_timestamp() + interval '2 hours',
            gen_random_uuid()
        );
        RAISE EXCEPTION 'fail: no price should have raised';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;

-- 5. service_buy_now: refunds active bid, settles immediately, fee flows.
DO $$
DECLARE
    v_seller         UUID;
    v_bidderA        UUID;
    v_buyer          UUID;
    v_listing        BIGINT;
    v_balA0          BIGINT;
    v_balA1          BIGINT;
    v_balA2          BIGINT;
    v_treasury       UUID;
    v_treasury_bal0  BIGINT;
    v_treasury_bal1  BIGINT;
    v_seller_bal0    BIGINT;
    v_seller_bal1    BIGINT;
    v_lst_row        wallet.listing%ROWTYPE;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';
    SELECT id INTO v_buyer   FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'buyer';
    SELECT wallet.treasury_account_id() INTO v_treasury;

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'gem', 'instance_id', 'rpcs-test-buynow-' || v_seller::text),
        'khash'::wallet.currency_kind,
        400, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    SELECT khash INTO v_balA0 FROM wallet.balance WHERE account_id = v_bidderA;
    PERFORM wallet.service_place_bid(v_listing, v_bidderA, 120, gen_random_uuid());
    SELECT khash INTO v_balA1 FROM wallet.balance WHERE account_id = v_bidderA;
    IF v_balA1 <> v_balA0 - 120 THEN
        RAISE EXCEPTION 'fail: bidderA pre-buy-now balance wrong';
    END IF;

    SELECT khash INTO v_treasury_bal0 FROM wallet.balance WHERE account_id = v_treasury;
    SELECT khash INTO v_seller_bal0   FROM wallet.balance WHERE account_id = v_seller;

    PERFORM wallet.service_buy_now(v_listing, v_buyer, gen_random_uuid());

    -- bidderA refunded.
    SELECT khash INTO v_balA2 FROM wallet.balance WHERE account_id = v_bidderA;
    IF v_balA2 <> v_balA0 THEN
        RAISE EXCEPTION 'fail: bidderA not refunded by buy_now';
    END IF;

    -- treasury + seller increments.
    SELECT khash INTO v_treasury_bal1 FROM wallet.balance WHERE account_id = v_treasury;
    SELECT khash INTO v_seller_bal1   FROM wallet.balance WHERE account_id = v_seller;
    -- fee = 400/100 = 4, net = 396.
    IF v_treasury_bal1 - v_treasury_bal0 <> 4 THEN
        RAISE EXCEPTION 'fail: treasury fee wrong on buy_now';
    END IF;
    IF v_seller_bal1 - v_seller_bal0 <> 396 THEN
        RAISE EXCEPTION 'fail: seller net wrong on buy_now';
    END IF;

    SELECT * INTO v_lst_row FROM wallet.listing WHERE id = v_listing;
    IF v_lst_row.status <> 'sold' OR v_lst_row.buyer_account IS DISTINCT FROM v_buyer THEN
        RAISE EXCEPTION 'fail: buy_now did not flip listing to sold';
    END IF;
END;
$$;

-- 6. service_cancel_listing: refunds active bid, marks cancelled,
--    rejects non-seller.
DO $$
DECLARE
    v_seller   UUID;
    v_bidderA  UUID;
    v_buyer    UUID;
    v_listing  BIGINT;
    v_balA0    BIGINT;
    v_balA1    BIGINT;
    v_lst_row  wallet.listing%ROWTYPE;
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';
    SELECT id INTO v_buyer   FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'buyer';

    v_listing := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'helm', 'instance_id', 'rpcs-test-cancel-' || v_seller::text),
        'khash'::wallet.currency_kind,
        NULL, 50,  -- auction only
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );

    SELECT khash INTO v_balA0 FROM wallet.balance WHERE account_id = v_bidderA;
    PERFORM wallet.service_place_bid(v_listing, v_bidderA, 75, gen_random_uuid());

    -- Non-seller cancel rejected.
    BEGIN
        PERFORM wallet.service_cancel_listing(v_listing, v_buyer, 'malicious', gen_random_uuid());
        RAISE EXCEPTION 'fail: non-seller cancel should have raised';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    PERFORM wallet.service_cancel_listing(v_listing, v_seller, 'changed mind', gen_random_uuid());

    SELECT * INTO v_lst_row FROM wallet.listing WHERE id = v_listing;
    IF v_lst_row.status <> 'cancelled' OR v_lst_row.current_bid_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: cancel did not flip listing or clear live-bid pointers';
    END IF;

    SELECT khash INTO v_balA1 FROM wallet.balance WHERE account_id = v_bidderA;
    IF v_balA1 <> v_balA0 THEN
        RAISE EXCEPTION 'fail: bidderA not refunded on cancel: % vs %', v_balA1, v_balA0;
    END IF;

    -- Idempotent: re-cancel returns without error.
    PERFORM wallet.service_cancel_listing(v_listing, v_seller, 'replay', gen_random_uuid());
END;
$$;

-- 7. service_expire_listings — auction with no bids → 'expired',
--    auction with bid → 'sold' via settle.
DO $$
DECLARE
    v_seller        UUID;
    v_bidderA       UUID;
    v_treasury      UUID;
    v_treasury_bal0 BIGINT;
    v_treasury_bal1 BIGINT;
    v_listing_no    BIGINT;
    v_listing_yes   BIGINT;
    v_swept         BIGINT;
    v_lst_no        wallet.listing%ROWTYPE;
    v_lst_yes       wallet.listing%ROWTYPE;
    v_past          TIMESTAMPTZ := statement_timestamp() - interval '1 hour';
    v_origin        TIMESTAMPTZ := statement_timestamp() - interval '3 hours';
BEGIN
    SELECT id INTO v_seller  FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'seller';
    SELECT id INTO v_bidderA FROM wallet.account a JOIN public.__marketplace_rpcs_fixture f ON f.user_id = a.user_id WHERE f.role = 'bidderA';
    SELECT wallet.treasury_account_id() INTO v_treasury;

    -- Insert a listing directly with backdated created_at / expires_at
    -- so the CHECK (expires_at >= created_at + 1h) still passes but the
    -- deadline is already in the past.
    INSERT INTO wallet.listing (
        seller_account, item_ref, currency, min_bid,
        created_at, expires_at, idempotency_key
    ) VALUES (
        v_seller,
        jsonb_build_object('item_id', 'flute', 'instance_id', 'rpcs-test-expire-no-' || v_seller::text),
        'khash'::wallet.currency_kind, 50,
        v_origin, v_past, gen_random_uuid()
    ) RETURNING id INTO v_listing_no;

    -- Same shape, but seed an active bid first via service_place_bid.
    -- service_place_bid checks expires_at > now() so we must use a
    -- fresh listing window then backdate AFTER the bid lands.
    v_listing_yes := wallet.service_create_listing(
        v_seller,
        jsonb_build_object('item_id', 'horn', 'instance_id', 'rpcs-test-expire-yes-' || v_seller::text),
        'khash'::wallet.currency_kind,
        500, 100,
        statement_timestamp() + interval '2 hours',
        gen_random_uuid()
    );
    PERFORM wallet.service_place_bid(v_listing_yes, v_bidderA, 200, gen_random_uuid());
    -- Now backdate the deadline.
    UPDATE wallet.listing
       SET created_at = v_origin, expires_at = v_past
     WHERE id = v_listing_yes;

    SELECT khash INTO v_treasury_bal0 FROM wallet.balance WHERE account_id = v_treasury;

    v_swept := wallet.service_expire_listings();
    IF v_swept < 2 THEN
        RAISE EXCEPTION 'fail: expire sweep returned % (expected >= 2)', v_swept;
    END IF;

    SELECT * INTO v_lst_no  FROM wallet.listing WHERE id = v_listing_no;
    SELECT * INTO v_lst_yes FROM wallet.listing WHERE id = v_listing_yes;

    IF v_lst_no.status <> 'expired' THEN
        RAISE EXCEPTION 'fail: no-bid listing should be expired, got %', v_lst_no.status;
    END IF;
    IF v_lst_yes.status <> 'sold' OR v_lst_yes.buyer_account IS DISTINCT FROM v_bidderA THEN
        RAISE EXCEPTION 'fail: bid listing should be sold to bidderA, got %', v_lst_yes.status;
    END IF;

    -- Treasury fee from the auction-expire settle: 200/100 = 2.
    SELECT khash INTO v_treasury_bal1 FROM wallet.balance WHERE account_id = v_treasury;
    IF v_treasury_bal1 - v_treasury_bal0 < 2 THEN
        RAISE EXCEPTION 'fail: treasury fee not collected on expire-settle: delta=%',
            v_treasury_bal1 - v_treasury_bal0;
    END IF;
END;
$$;

-- 8. pg_cron schedule registered when extension is present.
DO $$
DECLARE
    v_has_pgcron BOOLEAN;
    v_has_job    BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_pgcron;
    IF v_has_pgcron THEN
        SELECT EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'marketplace-expire-listings'
        ) INTO v_has_job;
        IF NOT v_has_job THEN
            RAISE EXCEPTION 'fail: pg_cron present but marketplace-expire-listings not registered';
        END IF;
    ELSE
        RAISE NOTICE 'pg_cron not installed locally; skipping schedule registration assertion';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    -- All RPCs dropped.
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'wallet' AND p.proname IN (
        'service_create_listing',
        'service_place_bid',
        'service_buy_now',
        'service_cancel_listing',
        'service_settle_listing',
        'service_expire_listings',
        'refund_active_bid',
        'distribute_settlement',
        'treasury_account_id'
    )) THEN
        RAISE EXCEPTION 'fail: marketplace RPC still present after rollback';
    END IF;
END;
$$;
