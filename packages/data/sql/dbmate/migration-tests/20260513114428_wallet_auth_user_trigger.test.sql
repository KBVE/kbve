-- Companion test fixtures for 20260513114428_wallet_auth_user_trigger.
-- Run via: ./test-migration.sh 20260513114428_wallet_auth_user_trigger
--
-- Sections (parsed by test-migration.sh):
--   SEED              — runs BEFORE dbmate up
--   ASSERT_AFTER_UP   — runs AFTER dbmate up; raises on failure
--   ASSERT_AFTER_DOWN — runs AFTER dbmate rollback; raises on failure
--
-- Asserts are DO blocks that RAISE EXCEPTION when an invariant fails. psql
-- runs with ON_ERROR_STOP=1, so the harness exit code reflects pass/fail.

-- SEED
-- Idempotent: clean any prior-run state first. wallet.account FK is ON
-- DELETE NO ACTION, so we tear down child rows in order before purging
-- auth.users. Local auth.users stub has only (id, created_at).
WITH test_users (id) AS (
    VALUES
        ('11111111-1111-1111-1111-111111111111'::uuid),
        ('22222222-2222-2222-2222-222222222222'::uuid),
        ('44444444-4444-4444-4444-444444444444'::uuid)
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

INSERT INTO auth.users (id)
VALUES
    ('11111111-1111-1111-1111-111111111111'),
    ('22222222-2222-2222-2222-222222222222');

INSERT INTO wallet.account (id, kind, user_id, created_at)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    'user',
    '11111111-1111-1111-1111-111111111111',
    now()
);
INSERT INTO wallet.balance (account_id) VALUES ('33333333-3333-3333-3333-333333333333');

-- ASSERT_AFTER_UP
DO $$
DECLARE
    v_template_active BOOLEAN;
BEGIN
    -- 1. Backfill provisioned the second seeded user.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.account
         WHERE kind = 'user' AND user_id = '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION 'fail: backfill did not provision user 22222222';
    END IF;

    -- 2. Pre-existing wallet account preserved (not duplicated).
    IF (
        SELECT COUNT(*) FROM wallet.account
         WHERE kind = 'user' AND user_id = '11111111-1111-1111-1111-111111111111'
    ) <> 1 THEN
        RAISE EXCEPTION 'fail: pre-existing user has wrong account count';
    END IF;

    -- 3. Backfilled user got balance row.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.balance b
          JOIN wallet.account a ON a.id = b.account_id
         WHERE a.user_id = '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION 'fail: backfilled user missing balance row';
    END IF;

    -- 4. Backfilled user got WELCOME_KHASH coupon (if template is active).
    SELECT EXISTS (
        SELECT 1 FROM wallet.coupon_template
         WHERE code = 'WELCOME_KHASH' AND is_active = TRUE
    ) INTO v_template_active;

    IF v_template_active AND NOT EXISTS (
        SELECT 1 FROM wallet.coupon c
          JOIN wallet.account a ON a.id = c.account_id
          JOIN wallet.coupon_template t ON t.id = c.template_id
         WHERE a.user_id = '22222222-2222-2222-2222-222222222222'
           AND t.code = 'WELCOME_KHASH'
    ) THEN
        RAISE EXCEPTION 'fail: backfilled user missing welcome coupon';
    END IF;

    -- 5. Unique partial index in place.
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'coupon_template_one_active_code_idx'
    ) THEN
        RAISE EXCEPTION 'fail: unique partial index missing';
    END IF;
END;
$$;

-- 5b. New auth.users insert fires the trigger. Separate block: this performs
-- a write, not just an assert.
INSERT INTO auth.users (id)
VALUES ('44444444-4444-4444-4444-444444444444');

DO $$
BEGIN
    -- 6. Trigger provisioned the new user.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.account
         WHERE kind = 'user' AND user_id = '44444444-4444-4444-4444-444444444444'
    ) THEN
        RAISE EXCEPTION 'fail: trigger did not fire on auth.users INSERT';
    END IF;

    -- 7. Trigger-provisioned user has balance row.
    IF NOT EXISTS (
        SELECT 1 FROM wallet.balance b
          JOIN wallet.account a ON a.id = b.account_id
         WHERE a.user_id = '44444444-4444-4444-4444-444444444444'
    ) THEN
        RAISE EXCEPTION 'fail: trigger-provisioned user missing balance row';
    END IF;

    -- 8. Worker is idempotent on re-call.
    PERFORM wallet.ensure_user_account('44444444-4444-4444-4444-444444444444'::uuid);
    IF (
        SELECT COUNT(*) FROM wallet.account
         WHERE kind = 'user' AND user_id = '44444444-4444-4444-4444-444444444444'
    ) <> 1 THEN
        RAISE EXCEPTION 'fail: ensure_user_account is not idempotent';
    END IF;

    -- 9. NULL user_id raises.
    BEGIN
        PERFORM wallet.ensure_user_account(NULL);
        RAISE EXCEPTION 'fail: NULL user_id should have raised';
    EXCEPTION WHEN sqlstate '22023' THEN
        NULL;
    END;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
BEGIN
    -- 1. Trigger no longer exists.
    IF EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'wallet_on_auth_user_created'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'fail: trigger still exists after rollback';
    END IF;

    -- 2. Worker function gone.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'wallet'
           AND p.proname = 'ensure_user_account'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.ensure_user_account still exists after rollback';
    END IF;

    -- 3. Old proxy function restored.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'wallet'
           AND p.proname = 'proxy_ensure_user_account'
    ) THEN
        RAISE EXCEPTION 'fail: wallet.proxy_ensure_user_account missing after rollback';
    END IF;

    -- 4. Backfilled accounts preserved (rollback does NOT delete user data).
    IF NOT EXISTS (
        SELECT 1 FROM wallet.account
         WHERE kind = 'user' AND user_id = '22222222-2222-2222-2222-222222222222'
    ) THEN
        RAISE EXCEPTION 'fail: backfilled user data lost during rollback';
    END IF;

    -- 5. Unique partial index removed.
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'wallet'
           AND indexname = 'coupon_template_one_active_code_idx'
    ) THEN
        RAISE EXCEPTION 'fail: unique partial index still present after rollback';
    END IF;
END;
$$;
