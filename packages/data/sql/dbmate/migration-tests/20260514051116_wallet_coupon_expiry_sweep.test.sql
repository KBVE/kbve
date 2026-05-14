-- Companion test fixtures for 20260514051116_wallet_coupon_expiry_sweep.
-- Run via: ./test-migration.sh 20260514051116_wallet_coupon_expiry_sweep

-- SEED
-- Idempotent cleanup of prior-run rows (coupons + balance + account + user
-- + the three test-only templates we add below).
WITH test_users (id) AS (
    VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid)
),
test_accounts AS (
    SELECT a.id FROM wallet.account a JOIN test_users u ON a.user_id = u.id
),
del_coupon AS (
    DELETE FROM wallet.coupon WHERE account_id IN (SELECT id FROM test_accounts)
),
del_balance AS (
    DELETE FROM wallet.balance WHERE account_id IN (SELECT id FROM test_accounts)
),
del_account AS (
    DELETE FROM wallet.account WHERE id IN (SELECT id FROM test_accounts)
),
del_user AS (
    DELETE FROM auth.users WHERE id IN (SELECT id FROM test_users)
)
DELETE FROM wallet.coupon_template
 WHERE code IN ('TEST_SWEEP_EXPIRED', 'TEST_SWEEP_ACTIVE', 'TEST_SWEEP_NOEXP');

-- wallet.audit_log is append-only (trigger blocks DELETE), so prior
-- sweep rows from earlier test runs stay; assertions below use id
-- baselines instead of absolute counts.

INSERT INTO auth.users (id) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Wipe the trigger-provisioned welcome coupon so our test coupons are the
-- only ones for this account.
DELETE FROM wallet.coupon
 WHERE account_id IN (
     SELECT id FROM wallet.account WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
 );

-- Three distinct templates so the (account_id, template_id) unique
-- constraint doesn't block our three test coupons.
INSERT INTO wallet.coupon_template (code, label, reward_kind, reward_payload) VALUES
    ('TEST_SWEEP_EXPIRED', 'sweep test expired', 'khash', '{"amount": 1}'::jsonb),
    ('TEST_SWEEP_ACTIVE',  'sweep test active',  'khash', '{"amount": 1}'::jsonb),
    ('TEST_SWEEP_NOEXP',   'sweep test no exp',  'khash', '{"amount": 1}'::jsonb);

-- Three coupons against the trigger-provisioned account: one already
-- expired (deadline in past), one near-future (still active), one with
-- no deadline (must NOT be touched by sweep).
WITH a AS (
    SELECT id FROM wallet.account WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
),
tpl AS (
    SELECT code, id FROM wallet.coupon_template
     WHERE code IN ('TEST_SWEEP_EXPIRED', 'TEST_SWEEP_ACTIVE', 'TEST_SWEEP_NOEXP')
)
INSERT INTO wallet.coupon (account_id, template_id, granted_at, expires_at)
SELECT a.id, tpl.id, now() - interval '2 days', now() - interval '1 hour'
  FROM a, tpl WHERE tpl.code = 'TEST_SWEEP_EXPIRED'
UNION ALL
SELECT a.id, tpl.id, now() - interval '1 day',  now() + interval '1 day'
  FROM a, tpl WHERE tpl.code = 'TEST_SWEEP_ACTIVE'
UNION ALL
SELECT a.id, tpl.id, now() - interval '3 days', NULL
  FROM a, tpl WHERE tpl.code = 'TEST_SWEEP_NOEXP';

-- ASSERT_AFTER_UP

-- 1. Index exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'wallet_coupon_unredeemed_expires_idx'
    ) THEN
        RAISE EXCEPTION 'fail: wallet_coupon_unredeemed_expires_idx missing';
    END IF;
END;
$$;

-- 2. Sweep flips the one expired row. Returns count = 1 (BIGINT).
DO $$
DECLARE
    v_count BIGINT;
    v_expired_count INT;
    v_unredeemed_count INT;
BEGIN
    SELECT wallet.sweep_expired_coupons() INTO v_count;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: sweep returned % (expected 1)', v_count;
    END IF;

    SELECT COUNT(*) INTO v_expired_count
      FROM wallet.coupon c
      JOIN wallet.account a ON a.id = c.account_id
     WHERE a.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
       AND c.status = 'expired';
    IF v_expired_count <> 1 THEN
        RAISE EXCEPTION 'fail: expired status count = % (expected 1)', v_expired_count;
    END IF;

    SELECT COUNT(*) INTO v_unredeemed_count
      FROM wallet.coupon c
      JOIN wallet.account a ON a.id = c.account_id
     WHERE a.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
       AND c.status = 'unredeemed';
    IF v_unredeemed_count <> 2 THEN
        RAISE EXCEPTION 'fail: unredeemed remaining = % (expected 2)', v_unredeemed_count;
    END IF;
END;
$$;

-- 3. Audit row written by the sweep we just ran, carrying both count
--    and cutoff_expires_at. Latest sweep_expired row corresponds to
--    this assertion's run (we just executed it).
DO $$
DECLARE
    v_count    BIGINT;
    v_has_cut  BOOLEAN;
BEGIN
    SELECT (metadata->>'count')::BIGINT, (metadata ? 'cutoff_expires_at')
      INTO v_count, v_has_cut
      FROM wallet.audit_log
     WHERE action = 'coupon.sweep_expired'
     ORDER BY id DESC
     LIMIT 1;
    IF v_count IS DISTINCT FROM 1 OR v_has_cut IS NOT TRUE THEN
        RAISE EXCEPTION 'fail: latest sweep audit row has count=% / cutoff_present=% (expected 1 / true)', v_count, v_has_cut;
    END IF;
END;
$$;

-- 4. Second sweep is a no-op (returns 0). Idempotency check.
DO $$
DECLARE
    v_count BIGINT;
BEGIN
    SELECT wallet.sweep_expired_coupons() INTO v_count;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'fail: re-run sweep returned % (expected 0)', v_count;
    END IF;
END;
$$;

-- 4b. pg_cron schedule registered when the extension is present. Local
-- dev containers don't ship pg_cron so this just asserts the migration
-- registered the job iff the extension exists.
DO $$
DECLARE
    v_has_pgcron BOOLEAN;
    v_has_job    BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_pgcron;
    IF v_has_pgcron THEN
        SELECT EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'wallet-sweep-expired-coupons'
        ) INTO v_has_job;
        IF NOT v_has_job THEN
            RAISE EXCEPTION 'fail: pg_cron present but wallet-sweep-expired-coupons not registered';
        END IF;
    ELSE
        RAISE NOTICE 'pg_cron not installed locally; skipping schedule registration assertion';
    END IF;
END;
$$;

-- 5. Empty sweep does NOT write an audit row. Use max(id) as baseline.
DO $$
DECLARE
    v_max_before BIGINT;
    v_max_after  BIGINT;
BEGIN
    SELECT COALESCE(MAX(id), 0) INTO v_max_before
      FROM wallet.audit_log WHERE action = 'coupon.sweep_expired';
    PERFORM wallet.sweep_expired_coupons();
    SELECT COALESCE(MAX(id), 0) INTO v_max_after
      FROM wallet.audit_log WHERE action = 'coupon.sweep_expired';
    IF v_max_after <> v_max_before THEN
        RAISE EXCEPTION 'fail: empty sweep appended audit row (%->%)',
            v_max_before, v_max_after;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    -- 1. Function removed.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'wallet' AND p.proname = 'sweep_expired_coupons'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.sweep_expired_coupons still exists after rollback';
    END IF;

    -- 2. Partial index removed.
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'wallet_coupon_unredeemed_expires_idx'
    ) THEN
        RAISE EXCEPTION 'fail: wallet_coupon_unredeemed_expires_idx still exists after rollback';
    END IF;

    -- 3. Coupons we flipped to expired stay flipped (down does not undo data).
    IF NOT EXISTS (
        SELECT 1 FROM wallet.coupon c
          JOIN wallet.account a ON a.id = c.account_id
         WHERE a.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
           AND c.status = 'expired'
    ) THEN
        RAISE EXCEPTION 'fail: expired coupons lost during rollback';
    END IF;
END;
$$;
