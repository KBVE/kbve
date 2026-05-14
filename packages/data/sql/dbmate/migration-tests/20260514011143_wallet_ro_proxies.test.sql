-- Companion test fixtures for 20260514011143_wallet_ro_proxies.
-- Run via: ./test-migration.sh 20260514011143_wallet_ro_proxies

-- SEED
-- Idempotent cleanup of test rows so re-runs pass on the same DB.
WITH test_users (id) AS (
    VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)
),
test_accounts AS (
    SELECT a.id FROM wallet.account a JOIN test_users u ON a.user_id = u.id
),
del_coupon AS (
    DELETE FROM wallet.coupon WHERE account_id IN (SELECT id FROM test_accounts)
),
del_ledger AS (
    DELETE FROM wallet.ledger WHERE account_id IN (SELECT id FROM test_accounts)
),
del_balance AS (
    DELETE FROM wallet.balance WHERE account_id IN (SELECT id FROM test_accounts)
),
del_account AS (
    DELETE FROM wallet.account WHERE id IN (SELECT id FROM test_accounts)
)
DELETE FROM auth.users WHERE id IN (SELECT id FROM test_users);

-- User A has a wallet account (insert triggers wallet.handle_auth_user_created
-- after PR #10920 lands; we rely on that). User B has none (we delete the
-- account immediately to simulate the missing-account case).
INSERT INTO auth.users (id)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Force a clean slate for user B: trigger may have provisioned it. We tear
-- down so the missing-account path is exercised.
DELETE FROM wallet.coupon WHERE account_id IN (
    SELECT id FROM wallet.account WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
DELETE FROM wallet.balance WHERE account_id IN (
    SELECT id FROM wallet.account WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
DELETE FROM wallet.account WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ASSERT_AFTER_UP

-- 1. user A: balance_readonly returns the row provisioned by the trigger.
-- 2. user A: list_coupons_readonly returns the welcome coupon.
-- Each test runs in its own transaction so SET LOCAL is in scope.
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

DO $$
DECLARE
    v_row RECORD;
    v_count INT;
BEGIN
    SELECT * INTO v_row FROM public.proxy_wallet_get_balance_readonly();
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'fail: balance_readonly returned no row for user A';
    END IF;
    IF v_row.credits IS NULL OR v_row.khash IS NULL THEN
        RAISE EXCEPTION 'fail: balance_readonly returned NULL credits/khash for user A';
    END IF;

    SELECT COUNT(*) INTO v_count FROM public.proxy_wallet_list_coupons_readonly();
    IF v_count < 1 THEN
        RAISE EXCEPTION 'fail: list_coupons_readonly returned 0 rows for user A (expected welcome coupon)';
    END IF;
END;
$$;
COMMIT;

-- 3. user B (no account): both RO functions raise SQLSTATE WLT01.
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_wallet_get_balance_readonly();
        RAISE EXCEPTION 'fail: balance_readonly should have raised WLT01 for user B';
    EXCEPTION WHEN sqlstate 'WLT01' THEN
        NULL;
    END;

    BEGIN
        PERFORM * FROM public.proxy_wallet_list_coupons_readonly();
        RAISE EXCEPTION 'fail: list_coupons_readonly should have raised WLT01 for user B';
    EXCEPTION WHEN sqlstate 'WLT01' THEN
        NULL;
    END;
END;
$$;
COMMIT;

-- 4. Unauthenticated raises SQLSTATE 28000.
BEGIN;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_wallet_get_balance_readonly();
        RAISE EXCEPTION 'fail: balance_readonly should have raised 28000 for anon';
    EXCEPTION WHEN sqlstate '28000' THEN
        NULL;
    END;

    BEGIN
        PERFORM * FROM public.proxy_wallet_list_coupons_readonly();
        RAISE EXCEPTION 'fail: list_coupons_readonly should have raised 28000 for anon';
    EXCEPTION WHEN sqlstate '28000' THEN
        NULL;
    END;
END;
$$;
COMMIT;

-- 4b. Composite index on wallet.coupon present.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'wallet_coupon_account_granted_idx'
    ) THEN
        RAISE EXCEPTION 'fail: wallet_coupon_account_granted_idx missing';
    END IF;
END;
$$;

-- 5. Write-path provisions user B, then 6. readonly returns a row for them.
BEGIN;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

DO $$
DECLARE
    v_row RECORD;
BEGIN
    SELECT * INTO v_row FROM public.proxy_wallet_get_balance();
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'fail: write-path proxy_wallet_get_balance did not provision user B';
    END IF;

    SELECT * INTO v_row FROM public.proxy_wallet_get_balance_readonly();
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'fail: balance_readonly missing user B after write-path provisioning';
    END IF;
END;
$$;
COMMIT;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    -- 1. RO functions removed.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'proxy_wallet_get_balance_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: proxy_wallet_get_balance_readonly still exists after rollback';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'proxy_wallet_list_coupons_readonly'
    ) THEN
        RAISE EXCEPTION 'fail: proxy_wallet_list_coupons_readonly still exists after rollback';
    END IF;

    -- 2. Existing write-path proxies preserved (unchanged by this migration).
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'proxy_wallet_get_balance'
    ) THEN
        RAISE EXCEPTION 'fail: write-path proxy_wallet_get_balance lost during rollback';
    END IF;

    -- 3. Composite coupon index removed by down.
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'wallet_coupon_account_granted_idx'
    ) THEN
        RAISE EXCEPTION 'fail: wallet_coupon_account_granted_idx still present after rollback';
    END IF;
END;
$$;
