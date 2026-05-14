-- Companion test fixtures for 20260514113538_wallet_marketplace_schema.
-- Run via: ./test-migration.sh 20260514113538_wallet_marketplace_schema

-- SEED
-- Idempotent cleanup of prior-run rows. We use a single seller + bidder
-- pair to exercise the constraints. Treasury row is seeded by the
-- migration itself and is intentionally NOT cleaned up here.
WITH test_users (id) AS (
    VALUES
        ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid)
),
test_accounts AS (
    SELECT a.id FROM wallet.account a JOIN test_users u ON a.user_id = u.id
),
del_balance AS (
    DELETE FROM wallet.balance WHERE account_id IN (SELECT id FROM test_accounts)
),
del_coupon AS (
    DELETE FROM wallet.coupon WHERE account_id IN (SELECT id FROM test_accounts)
),
del_account AS (
    DELETE FROM wallet.account WHERE id IN (SELECT id FROM test_accounts)
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM test_users);

INSERT INTO auth.users (id) VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

-- ASSERT_AFTER_UP

-- 1. Enums exist with the expected values.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'wallet'
           AND t.typname = 'listing_status'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.listing_status enum missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'wallet'
           AND t.typname = 'bid_status'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.bid_status enum missing';
    END IF;
END;
$$;

-- 2. Treasury account seeded with balance row.
DO $$
DECLARE
    v_treasury_id UUID;
BEGIN
    SELECT id INTO v_treasury_id
      FROM wallet.account
     WHERE kind = 'treasury' AND label = 'kbve_treasury';
    IF v_treasury_id IS NULL THEN
        RAISE EXCEPTION 'fail: kbve_treasury account not seeded';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM wallet.balance WHERE account_id = v_treasury_id
    ) THEN
        RAISE EXCEPTION 'fail: kbve_treasury balance row missing';
    END IF;
END;
$$;

-- 3. Indexes present.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='wallet' AND indexname='wallet_listing_active_expires_idx') THEN
        RAISE EXCEPTION 'fail: wallet_listing_active_expires_idx missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='wallet' AND indexname='wallet_listing_seller_created_idx') THEN
        RAISE EXCEPTION 'fail: wallet_listing_seller_created_idx missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='wallet' AND indexname='wallet_bid_listing_placed_idx') THEN
        RAISE EXCEPTION 'fail: wallet_bid_listing_placed_idx missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='wallet' AND indexname='wallet_bid_listing_bidder_active_uq') THEN
        RAISE EXCEPTION 'fail: wallet_bid_listing_bidder_active_uq missing';
    END IF;
END;
$$;

-- 4. Listing insert succeeds with valid shape (buy_now only).
DO $$
DECLARE
    v_seller UUID;
    v_listing_id BIGINT;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    INSERT INTO wallet.listing (
        seller_account, item_ref, buy_now_price, expires_at
    ) VALUES (
        v_seller,
        '{"item_id": "diamond_sword", "qty": 1}'::jsonb,
        100,
        statement_timestamp() + interval '2 hours'
    ) RETURNING id INTO v_listing_id;
    IF v_listing_id IS NULL THEN
        RAISE EXCEPTION 'fail: listing insert returned no id';
    END IF;
END;
$$;

-- 5. Listing insert succeeds with min_bid only (auction).
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    INSERT INTO wallet.listing (
        seller_account, item_ref, min_bid, expires_at
    ) VALUES (
        v_seller,
        '{"item_id": "netherite_pickaxe", "qty": 1}'::jsonb,
        50,
        statement_timestamp() + interval '12 hours'
    );
END;
$$;

-- 6. Listing reject: no price set (neither buy_now nor min_bid).
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (seller_account, item_ref, expires_at)
        VALUES (v_seller, '{"item_id": "stick"}'::jsonb, statement_timestamp() + interval '2 hours');
        RAISE EXCEPTION 'fail: insert with no price should have failed listing_has_price_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 7. Listing reject: buy_now < min_bid.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, buy_now_price, min_bid, expires_at
        ) VALUES (
            v_seller, '{"item_id": "stick"}'::jsonb, 10, 50,
            statement_timestamp() + interval '2 hours'
        );
        RAISE EXCEPTION 'fail: buy_now < min_bid should have failed listing_buy_now_gte_min_bid_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 8. Listing reject: duration < 1h.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, buy_now_price, expires_at
        ) VALUES (
            v_seller, '{"item_id": "stick"}'::jsonb, 100,
            statement_timestamp() + interval '30 minutes'
        );
        RAISE EXCEPTION 'fail: duration < 1h should have failed listing_min_duration_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 9. Listing reject: duration > 30d.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, buy_now_price, expires_at
        ) VALUES (
            v_seller, '{"item_id": "stick"}'::jsonb, 100,
            statement_timestamp() + interval '31 days'
        );
        RAISE EXCEPTION 'fail: duration > 30d should have failed listing_max_duration_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 10. Listing reject: non-khash currency.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, currency, buy_now_price, expires_at
        ) VALUES (
            v_seller, '{"item_id": "stick"}'::jsonb, 'credits', 100,
            statement_timestamp() + interval '2 hours'
        );
        RAISE EXCEPTION 'fail: credits currency should have failed listing_khash_only_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 11. Listing reject: empty item_ref.
DO $$
DECLARE
    v_seller UUID;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    BEGIN
        INSERT INTO wallet.listing (
            seller_account, item_ref, buy_now_price, expires_at
        ) VALUES (
            v_seller, '{}'::jsonb, 100,
            statement_timestamp() + interval '2 hours'
        );
        RAISE EXCEPTION 'fail: empty item_ref should have failed listing_item_ref_shape_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 12. Bid insert succeeds against an existing listing + bidder.
--     Needs a real ledger row for escrow_ledger_id. We synthesize one by
--     issuing a credit through the service_credit RPC so the FK is satisfied.
DO $$
DECLARE
    v_seller       UUID;
    v_bidder       UUID;
    v_listing_id   BIGINT;
    v_ledger_id    BIGINT;
BEGIN
    SELECT id INTO v_seller FROM wallet.account WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    SELECT id INTO v_bidder FROM wallet.account WHERE user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    -- Fund the bidder so the escrow ledger ref is real.
    SELECT wallet.service_credit(
        v_bidder, 'khash'::wallet.currency_kind, 200,
        'reward'::wallet.source_kind, 'fixture', NULL, NULL, gen_random_uuid()
    ) INTO v_ledger_id;

    SELECT id INTO v_listing_id
      FROM wallet.listing
     WHERE seller_account = v_seller AND item_ref->>'item_id' = 'netherite_pickaxe'
     ORDER BY id DESC LIMIT 1;

    INSERT INTO wallet.bid (
        listing_id, bidder_account, amount, escrow_ledger_id
    ) VALUES (
        v_listing_id, v_bidder, 50, v_ledger_id
    );
END;
$$;

-- 13. Bid reject: amount <= 0.
DO $$
DECLARE
    v_bidder    UUID;
    v_listing_id BIGINT;
    v_ledger_id BIGINT;
BEGIN
    SELECT id INTO v_bidder FROM wallet.account WHERE user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    SELECT id INTO v_listing_id FROM wallet.listing ORDER BY id DESC LIMIT 1;
    SELECT id INTO v_ledger_id FROM wallet.ledger WHERE account_id = v_bidder ORDER BY id DESC LIMIT 1;

    BEGIN
        INSERT INTO wallet.bid (
            listing_id, bidder_account, amount, escrow_ledger_id
        ) VALUES (
            v_listing_id, v_bidder, 0, v_ledger_id
        );
        RAISE EXCEPTION 'fail: bid amount=0 should have failed bid_amount_pos_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 14. Bid lifecycle: cannot have status='active' with refund_ledger_id set.
DO $$
DECLARE
    v_bidder    UUID;
    v_listing_id BIGINT;
    v_ledger_id BIGINT;
BEGIN
    SELECT id INTO v_bidder FROM wallet.account WHERE user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    SELECT id INTO v_listing_id FROM wallet.listing ORDER BY id DESC LIMIT 1;
    SELECT id INTO v_ledger_id FROM wallet.ledger WHERE account_id = v_bidder ORDER BY id DESC LIMIT 1;

    BEGIN
        INSERT INTO wallet.bid (
            listing_id, bidder_account, amount, escrow_ledger_id, refund_ledger_id, status
        ) VALUES (
            v_listing_id, v_bidder, 50, v_ledger_id, v_ledger_id, 'active'
        );
        RAISE EXCEPTION 'fail: active+refund_ledger_id should have failed bid_lifecycle_chk';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    -- 1. Tables removed.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='wallet' AND table_name='listing') THEN
        RAISE EXCEPTION 'fail: wallet.listing still exists after rollback';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='wallet' AND table_name='bid') THEN
        RAISE EXCEPTION 'fail: wallet.bid still exists after rollback';
    END IF;
    -- 2. Enums removed.
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='wallet' AND t.typname='listing_status') THEN
        RAISE EXCEPTION 'fail: wallet.listing_status enum still exists after rollback';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='wallet' AND t.typname='bid_status') THEN
        RAISE EXCEPTION 'fail: wallet.bid_status enum still exists after rollback';
    END IF;
    -- 3. Treasury account intentionally preserved across rollback.
    IF NOT EXISTS (SELECT 1 FROM wallet.account WHERE kind='treasury' AND label='kbve_treasury') THEN
        RAISE EXCEPTION 'fail: kbve_treasury account lost during rollback';
    END IF;
END;
$$;
