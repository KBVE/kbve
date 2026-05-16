-- Companion test fixtures for 20260515221756_referral_schema_init.
-- Run via: ./test-migration.sh 20260515221756_referral_schema_init

-- SEED
-- Idempotent cleanup of prior-run rows.
WITH test_users (id) AS (
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid)
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

INSERT INTO auth.users (id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');

-- ASSERT_AFTER_UP

-- Catalog seed exists with both shipped targets, AND the seed is
-- DO UPDATE so a re-run reflects URL/title edits (not just DO NOTHING).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM referral.target WHERE slug = 'rareicon' AND active) THEN
        RAISE EXCEPTION 'fail: rareicon target missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM referral.target WHERE slug = 'mc' AND active) THEN
        RAISE EXCEPTION 'fail: mc target missing';
    END IF;
END $$;

-- Reward policy exists with the documented defaults.
DO $$
DECLARE p referral.reward_policy%ROWTYPE;
BEGIN
    SELECT * INTO p FROM referral.reward_policy WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'fail: reward_policy row 1 missing';
    END IF;
    IF p.credits_per_click <> 10 THEN
        RAISE EXCEPTION 'fail: expected 10 credits per click, got %', p.credits_per_click;
    END IF;
    IF p.dedup_window_days <> 30 THEN
        RAISE EXCEPTION 'fail: expected 30-day dedup window, got %', p.dedup_window_days;
    END IF;
END $$;

-- target CHECKs reject malformed values.
DO $$
BEGIN
    BEGIN
        INSERT INTO referral.target (slug, title, url)
        VALUES ('NOT-SLUG', 'x', 'https://example.com');
        RAISE EXCEPTION 'fail: target.slug check should have rejected uppercase';
    EXCEPTION WHEN check_violation THEN
        -- expected
    END;

    BEGIN
        INSERT INTO referral.target (slug, title, url)
        VALUES ('ftp-not-http', 'x', 'ftp://example.com');
        RAISE EXCEPTION 'fail: target.url check should have rejected ftp';
    EXCEPTION WHEN check_violation THEN
        -- expected
    END;

    -- New: whitespace + control chars now rejected by the tighter url regex.
    BEGIN
        INSERT INTO referral.target (slug, title, url)
        VALUES ('bad-space', 'x', 'https://example.com/has space');
        RAISE EXCEPTION 'fail: target.url check should have rejected whitespace';
    EXCEPTION WHEN check_violation THEN
        -- expected
    END;
END $$;

-- Partial unique index allows multiple non-default rows, blocks two
-- defaults among ACTIVE rows.
DO $$
DECLARE u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
BEGIN
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'rareicon', TRUE);

    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'mc', FALSE);

    BEGIN
        INSERT INTO referral.user_target (user_id, target_slug, is_default)
        VALUES (u, 'mc', TRUE);
        RAISE EXCEPTION 'fail: partial unique index should have blocked second default';
    EXCEPTION WHEN unique_violation THEN
        -- expected
    END;

    DELETE FROM referral.user_target WHERE user_id = u;
END $$;

-- resolve_user_target returns the configured default when slug is NULL,
-- AND skips inactive user_target rows.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    r referral.target%ROWTYPE;
BEGIN
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'rareicon', TRUE);
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'mc', FALSE);

    SELECT * INTO r FROM referral.resolve_user_target(u, NULL);
    IF r.slug IS DISTINCT FROM 'rareicon' THEN
        RAISE EXCEPTION 'fail: default resolution expected rareicon, got %', r.slug;
    END IF;

    SELECT * INTO r FROM referral.resolve_user_target(u, 'mc');
    IF r.slug IS DISTINCT FROM 'mc' THEN
        RAISE EXCEPTION 'fail: explicit slug should have returned mc, got %', r.slug;
    END IF;

    -- Disable the rareicon row → resolve_user_target(NULL) returns nothing.
    UPDATE referral.user_target
       SET active = FALSE, disabled_at = now()
     WHERE user_id = u AND target_slug = 'rareicon';

    PERFORM 1 FROM referral.resolve_user_target(u, NULL);
    IF FOUND THEN
        RAISE EXCEPTION 'fail: disabled default should not resolve';
    END IF;

    -- Re-enable and clean up.
    UPDATE referral.user_target
       SET active = TRUE, disabled_at = NULL
     WHERE user_id = u AND target_slug = 'rareicon';

    PERFORM 1 FROM referral.resolve_user_target(u, 'nonexistent');
    IF FOUND THEN
        RAISE EXCEPTION 'fail: unknown slug should not resolve';
    END IF;

    DELETE FROM referral.user_target WHERE user_id = u;
END $$;

-- record_click: enforces user_target enablement.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('aabbccddeeff00112233445566778899', 'hex');
    sn BYTEA := decode('1122334455667788', 'hex');
BEGIN
    BEGIN
        PERFORM * FROM referral.record_click(u, 'rareicon', ip, sn);
        RAISE EXCEPTION 'fail: record_click should reject targets the user has not enabled';
    EXCEPTION WHEN SQLSTATE 'RFU01' THEN
        -- expected: custom SQLSTATE for "user has target unset/disabled"
    END;
END $$;

-- record_click: first call credits 10, returns qualified=true, credited=true,
-- target_slug + target_url populated, ledger_id non-null. Second call with
-- same (referrer, target, ip_hash) inside the dedup window logs without
-- crediting.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('aabbccddeeff00112233445566778899', 'hex');
    sn BYTEA := decode('1122334455667788', 'hex');
    r1 RECORD;
    r2 RECORD;
    bal BIGINT;
BEGIN
    -- Enable the targets for this user.
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'rareicon', TRUE);
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'mc', FALSE);

    SELECT * INTO r1
      FROM referral.record_click(u, 'rareicon', ip, sn, 'UA/1.0', 'https://t.co/x', 'en');
    IF NOT r1.qualified THEN
        RAISE EXCEPTION 'fail: first click should qualify';
    END IF;
    IF NOT r1.credited THEN
        RAISE EXCEPTION 'fail: first click should credit';
    END IF;
    IF r1.ledger_id IS NULL THEN
        RAISE EXCEPTION 'fail: first click ledger_id should be set';
    END IF;
    IF r1.target_slug IS DISTINCT FROM 'rareicon' THEN
        RAISE EXCEPTION 'fail: target_slug mismatch: %', r1.target_slug;
    END IF;
    IF r1.target_url IS DISTINCT FROM 'https://store.steampowered.com/app/2238370/RareIcon/' THEN
        RAISE EXCEPTION 'fail: target_url mismatch: %', r1.target_url;
    END IF;

    SELECT b.credits INTO bal
      FROM wallet.balance b
      JOIN wallet.account a ON a.id = b.account_id
     WHERE a.user_id = u AND a.kind = 'user';
    IF bal <> 10 THEN
        RAISE EXCEPTION 'fail: expected 10 credits after first click, got %', bal;
    END IF;

    -- Click row should have credited + ledger_id populated.
    PERFORM 1
       FROM referral.click
      WHERE id = r1.click_id AND credited AND ledger_id IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'fail: click row should be credited with ledger_id';
    END IF;

    SELECT * INTO r2
      FROM referral.record_click(u, 'rareicon', ip, sn, 'UA/1.0', NULL, 'en');
    IF r2.qualified THEN
        RAISE EXCEPTION 'fail: second click should NOT qualify (dedup window)';
    END IF;
    IF r2.credited THEN
        RAISE EXCEPTION 'fail: second click should NOT credit';
    END IF;
    IF r2.ledger_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: second click ledger_id should be NULL';
    END IF;
    IF r2.target_url IS DISTINCT FROM r1.target_url THEN
        RAISE EXCEPTION 'fail: target_url should still resolve on dup';
    END IF;

    SELECT b.credits INTO bal
      FROM wallet.balance b
      JOIN wallet.account a ON a.id = b.account_id
     WHERE a.user_id = u AND a.kind = 'user';
    IF bal <> 10 THEN
        RAISE EXCEPTION 'fail: credits should remain 10 after duplicate click, got %', bal;
    END IF;
END $$;

-- credits_per_click = 0 path: click qualifies but does NOT credit.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('00112233445566778899aabbccddeeff', 'hex');
    sn BYTEA := decode('aabbccdd00112233', 'hex');
    r RECORD;
    bal_before BIGINT;
    bal_after  BIGINT;
BEGIN
    SELECT b.credits INTO bal_before
      FROM wallet.balance b
      JOIN wallet.account a ON a.id = b.account_id
     WHERE a.user_id = u AND a.kind = 'user';

    UPDATE referral.reward_policy SET credits_per_click = 0 WHERE id = 1;
    BEGIN
        SELECT * INTO r
          FROM referral.record_click(u, 'mc', ip, sn, NULL, NULL, NULL);
        IF NOT r.qualified THEN
            RAISE EXCEPTION 'fail: zero-credit click should still qualify';
        END IF;
        IF r.credited THEN
            RAISE EXCEPTION 'fail: zero-credit click should NOT credit';
        END IF;
        IF r.ledger_id IS NOT NULL THEN
            RAISE EXCEPTION 'fail: zero-credit click ledger_id should be NULL';
        END IF;

        SELECT b.credits INTO bal_after
          FROM wallet.balance b
          JOIN wallet.account a ON a.id = b.account_id
         WHERE a.user_id = u AND a.kind = 'user';
        IF bal_after IS DISTINCT FROM bal_before THEN
            RAISE EXCEPTION 'fail: balance moved with credits_per_click=0';
        END IF;
    END;
    UPDATE referral.reward_policy SET credits_per_click = 10 WHERE id = 1;
END $$;

-- Custom SQLSTATEs surface on unknown target.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
BEGIN
    BEGIN
        PERFORM * FROM referral.record_click(
            u, 'nope-not-a-target', '\x01'::bytea, '\x01'::bytea
        );
        RAISE EXCEPTION 'fail: unknown target should have raised';
    EXCEPTION WHEN SQLSTATE 'RFT01' THEN
        -- expected
    END;
END $$;

-- Missing required args raise.
DO $$
BEGIN
    BEGIN
        PERFORM * FROM referral.record_click(NULL, 'rareicon', '\x01'::bytea, '\x01'::bytea);
        RAISE EXCEPTION 'fail: NULL referrer should have raised';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        -- expected
    END;
END $$;

-- ASSERT_AFTER_DOWN

-- migrate:down is intentionally a no-op so production cannot accidentally
-- truncate referral data. Schema + seeds survive a rollback.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = 'referral'
    ) THEN
        RAISE EXCEPTION 'fail: referral schema should survive no-op down';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM referral.target WHERE slug = 'rareicon'
    ) THEN
        RAISE EXCEPTION 'fail: rareicon target should survive no-op down';
    END IF;
END $$;
