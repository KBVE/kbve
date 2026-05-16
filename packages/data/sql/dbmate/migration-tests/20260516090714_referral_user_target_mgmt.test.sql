-- Companion test for 20260516090714_referral_user_target_mgmt.
-- Run via: ./test-migration.sh 20260516090714_referral_user_target_mgmt

-- SEED
WITH test_users (id) AS (
    VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid)
),
test_accounts AS (
    SELECT a.id FROM wallet.account a JOIN test_users u ON a.user_id = u.id
),
del_user_target AS (
    DELETE FROM referral.user_target
     WHERE user_id IN (SELECT id FROM test_users)
),
del_click AS (
    DELETE FROM referral.click
     WHERE referrer_id IN (SELECT id FROM test_users)
),
del_balance AS (
    DELETE FROM wallet.balance
     WHERE account_id IN (SELECT id FROM test_accounts)
),
del_coupon AS (
    DELETE FROM wallet.coupon
     WHERE account_id IN (SELECT id FROM test_accounts)
),
del_account AS (
    DELETE FROM wallet.account
     WHERE id IN (SELECT id FROM test_accounts)
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM test_users);

INSERT INTO auth.users (id) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd');

-- ASSERT_AFTER_UP

-- service_enable_target inserts and auto-promotes the first target to default.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    row referral.user_target;
BEGIN
    SELECT * INTO row FROM referral.service_enable_target(u, 'rareicon');
    IF NOT row.active THEN
        RAISE EXCEPTION 'fail: enable should activate row';
    END IF;
    IF NOT row.is_default THEN
        RAISE EXCEPTION 'fail: first enable should auto-default';
    END IF;

    -- Second enable WITHOUT set_as_default keeps the existing default.
    SELECT * INTO row FROM referral.service_enable_target(u, 'mc');
    IF row.is_default THEN
        RAISE EXCEPTION 'fail: second enable should not steal default';
    END IF;
END $$;

-- service_set_default_target swaps cleanly.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    row referral.user_target;
    rare_def BOOLEAN;
BEGIN
    SELECT * INTO row FROM referral.service_set_default_target(u, 'mc');
    IF NOT row.is_default THEN
        RAISE EXCEPTION 'fail: set_default should mark target as default';
    END IF;

    -- Old default must have flipped to FALSE.
    SELECT is_default INTO rare_def
      FROM referral.user_target
     WHERE user_id = u AND target_slug = 'rareicon';
    IF rare_def THEN
        RAISE EXCEPTION 'fail: previous default should have been demoted';
    END IF;
END $$;

-- service_set_default_target on a target the user hasn't enabled raises RFU01.
DO $$
DECLARE u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
BEGIN
    BEGIN
        PERFORM * FROM referral.service_set_default_target(u, 'rareicon');
    EXCEPTION WHEN OTHERS THEN
        -- rareicon IS enabled; this should NOT raise. Re-raise to fail.
        RAISE;
    END;

    BEGIN
        PERFORM * FROM referral.service_set_default_target(u, 'nope-not-real');
        RAISE EXCEPTION 'fail: unknown slug should have raised';
    EXCEPTION WHEN SQLSTATE 'RFU01' THEN
        -- expected
    END;
END $$;

-- service_disable_target promotes a remaining active row to default.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    rare_default BOOLEAN;
    mc_active BOOLEAN;
BEGIN
    -- Currently: mc is default, rareicon is active not default. Make
    -- rareicon default again so we can disable it and watch mc inherit.
    PERFORM * FROM referral.service_set_default_target(u, 'rareicon');

    PERFORM * FROM referral.service_disable_target(u, 'rareicon');

    SELECT is_default INTO rare_default
      FROM referral.user_target
     WHERE user_id = u AND target_slug = 'rareicon';
    IF rare_default THEN
        RAISE EXCEPTION 'fail: disabled row should not still be default';
    END IF;

    SELECT is_default INTO mc_active
      FROM referral.user_target
     WHERE user_id = u AND target_slug = 'mc';
    IF NOT mc_active THEN
        RAISE EXCEPTION 'fail: remaining active row should inherit default';
    END IF;
END $$;

-- Disabling the last active default raises RFM01.
DO $$
DECLARE u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
BEGIN
    BEGIN
        PERFORM * FROM referral.service_disable_target(u, 'mc');
        RAISE EXCEPTION 'fail: disabling last active should have raised RFM01';
    EXCEPTION WHEN SQLSTATE 'RFM01' THEN
        -- expected
    END;
END $$;

-- Re-enable an inactive row: clears disabled_at, keeps enabled_at.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    before_enabled_at TIMESTAMPTZ;
    after_row referral.user_target;
BEGIN
    SELECT enabled_at INTO before_enabled_at
      FROM referral.user_target
     WHERE user_id = u AND target_slug = 'rareicon';

    SELECT * INTO after_row
      FROM referral.service_enable_target(u, 'rareicon');

    IF NOT after_row.active THEN
        RAISE EXCEPTION 'fail: re-enable should activate';
    END IF;
    IF after_row.disabled_at IS NOT NULL THEN
        RAISE EXCEPTION 'fail: re-enable should clear disabled_at';
    END IF;
    IF after_row.enabled_at <> before_enabled_at THEN
        RAISE EXCEPTION 'fail: enabled_at should stay stable across re-enable';
    END IF;
END $$;

-- service_list_user_targets returns active + inactive rows with stats.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    cnt INT;
BEGIN
    -- Make sure both targets are active for a clean count.
    PERFORM * FROM referral.service_enable_target(u, 'rareicon');
    PERFORM * FROM referral.service_enable_target(u, 'mc');

    SELECT count(*)::INT INTO cnt FROM referral.service_list_user_targets(u);
    IF cnt < 2 THEN
        RAISE EXCEPTION 'fail: list should return at least 2 rows for this user, got %', cnt;
    END IF;
END $$;

-- service_get_user_stats sums clicks + credits across targets.
DO $$
DECLARE
    u UUID := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    ip BYTEA := decode(repeat('a1', 32), 'hex');
    sn BYTEA := decode(repeat('b2', 32), 'hex');
    r RECORD;
BEGIN
    -- Record one qualified click via the Phase 1 RPC.
    PERFORM * FROM referral.record_click(u, 'rareicon', ip, sn, NULL, NULL, NULL);

    SELECT * INTO r FROM referral.service_get_user_stats(u);
    IF r.clicks_total < 1 THEN
        RAISE EXCEPTION 'fail: stats should reflect at least 1 click';
    END IF;
    IF r.clicks_credited < 1 THEN
        RAISE EXCEPTION 'fail: stats should reflect at least 1 credit';
    END IF;
    IF r.credits_total < 10 THEN
        RAISE EXCEPTION 'fail: stats credits_total should be >= 10, got %', r.credits_total;
    END IF;
END $$;

-- Input guards.
DO $$
BEGIN
    BEGIN
        PERFORM * FROM referral.service_enable_target(NULL, 'rareicon');
        RAISE EXCEPTION 'fail: NULL user_id should have raised';
    EXCEPTION WHEN SQLSTATE '22004' THEN
        -- expected
    END;

    BEGIN
        PERFORM * FROM referral.service_enable_target(
            'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID, 'NOT_A_TARGET'
        );
        RAISE EXCEPTION 'fail: unknown target should have raised RFT01';
    EXCEPTION WHEN SQLSTATE 'RFT01' THEN
        -- expected
    END;
END $$;

-- ASSERT_AFTER_DOWN

-- migrate:down is intentionally a no-op. Verify the schema + functions
-- survive a rollback.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc
          JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
         WHERE pg_namespace.nspname = 'referral'
           AND proname = 'service_set_default_target'
    ) THEN
        RAISE EXCEPTION 'fail: service_set_default_target should survive no-op down';
    END IF;
END $$;
