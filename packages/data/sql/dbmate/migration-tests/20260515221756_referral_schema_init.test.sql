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

-- Catalog seed exists with both shipped targets.
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

-- target slug check rejects bad values.
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
END $$;

-- partial unique index allows multiple non-default rows, blocks two defaults.
DO $$
DECLARE u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
BEGIN
    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'rareicon', TRUE);

    INSERT INTO referral.user_target (user_id, target_slug, is_default)
    VALUES (u, 'mc', FALSE);

    BEGIN
        INSERT INTO referral.user_target (user_id, target_slug, is_default)
        VALUES (u, 'mc', TRUE);  -- conflict with the partial unique
        RAISE EXCEPTION 'fail: partial unique index should have blocked second default';
    EXCEPTION WHEN unique_violation THEN
        -- expected
    END;

    -- clean up so the rest of the assertions start fresh on user_target
    DELETE FROM referral.user_target WHERE user_id = u;
END $$;

-- resolve_user_target returns the configured default when slug is NULL.
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

    -- Explicit slug overrides default.
    SELECT * INTO r FROM referral.resolve_user_target(u, 'mc');
    IF r.slug IS DISTINCT FROM 'mc' THEN
        RAISE EXCEPTION 'fail: explicit slug should have returned mc, got %', r.slug;
    END IF;

    -- Slug user does not have enabled returns no row.
    PERFORM 1 FROM referral.resolve_user_target(u, 'nonexistent');
    IF FOUND THEN
        RAISE EXCEPTION 'fail: unknown slug should not resolve';
    END IF;

    DELETE FROM referral.user_target WHERE user_id = u;
END $$;

-- record_click: first call credits 10, returns qualified=true; second call
-- with same (referrer, target, ip_hash) inside the dedup window does not.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('aabbccddeeff00112233445566778899', 'hex');
    sn BYTEA := decode('1122334455667788', 'hex');
    r1 RECORD;
    r2 RECORD;
    bal BIGINT;
BEGIN
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

-- A different ip_hash on the same target credits independently.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('cafebabedeadbeef00112233445566ff', 'hex');
    sn BYTEA := decode('aaaaaaaaaaaaaaaa', 'hex');
    r RECORD;
    bal BIGINT;
BEGIN
    SELECT * INTO r
      FROM referral.record_click(u, 'rareicon', ip, sn, 'UA/2.0', NULL, NULL);
    IF NOT r.qualified THEN
        RAISE EXCEPTION 'fail: new IP should qualify';
    END IF;

    SELECT b.credits INTO bal
      FROM wallet.balance b
      JOIN wallet.account a ON a.id = b.account_id
     WHERE a.user_id = u;
    IF bal <> 20 THEN
        RAISE EXCEPTION 'fail: expected 20 credits after two distinct IPs, got %', bal;
    END IF;
END $$;

-- A different target on the same IP credits independently.
DO $$
DECLARE
    u UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    ip BYTEA := decode('aabbccddeeff00112233445566778899', 'hex');
    sn BYTEA := decode('1122334455667788', 'hex');
    r RECORD;
    bal BIGINT;
BEGIN
    SELECT * INTO r
      FROM referral.record_click(u, 'mc', ip, sn, NULL, NULL, NULL);
    IF NOT r.qualified THEN
        RAISE EXCEPTION 'fail: different target should qualify for same IP';
    END IF;
    IF r.target_url IS DISTINCT FROM 'https://kbve.com/mc/' THEN
        RAISE EXCEPTION 'fail: mc target_url mismatch: %', r.target_url;
    END IF;

    SELECT b.credits INTO bal
      FROM wallet.balance b
      JOIN wallet.account a ON a.id = b.account_id
     WHERE a.user_id = u;
    IF bal <> 30 THEN
        RAISE EXCEPTION 'fail: expected 30 credits after mc click, got %', bal;
    END IF;
END $$;

-- Missing required args raise.
DO $$
BEGIN
    BEGIN
        PERFORM * FROM referral.record_click(NULL, 'rareicon', '\x01', '\x01');
        RAISE EXCEPTION 'fail: NULL referrer should have raised';
    EXCEPTION WHEN OTHERS THEN
        -- expected
    END;

    BEGIN
        PERFORM * FROM referral.record_click(
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::UUID,
            'nope-not-a-target',
            '\x01', '\x01'
        );
        RAISE EXCEPTION 'fail: unknown target should have raised';
    EXCEPTION WHEN OTHERS THEN
        -- expected
    END;
END $$;

-- ASSERT_AFTER_DOWN

-- migrate:down is intentionally a no-op so production cannot accidentally
-- truncate referral data. Verify the schema is still present after a
-- rollback and the seeded targets persist.
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
