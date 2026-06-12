-- Companion test fixtures for 20260601173847_wallet_marketplace_my_ledger_proxy.
-- Run via: ./test-migration.sh 20260601173847_wallet_marketplace_my_ledger_proxy
--
-- Exercises the auth-mediated public.proxy_market_my_ledger_readonly
-- surface using SET LOCAL request.jwt.claims to impersonate
-- authenticated callers. Mirrors the harness shape of
-- 20260516015242_wallet_marketplace_proxies.test.sql.

-- SEED
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

DROP TABLE IF EXISTS public.__ledger_proxy_fixture;
CREATE TABLE public.__ledger_proxy_fixture (
    role    TEXT PRIMARY KEY,
    user_id UUID NOT NULL
);
INSERT INTO public.__ledger_proxy_fixture (role, user_id) VALUES
    ('alice',  gen_random_uuid()),
    ('bob',    gen_random_uuid()),
    ('orphan', gen_random_uuid());

INSERT INTO auth.users (id)
SELECT user_id FROM public.__ledger_proxy_fixture;

-- Strip orphan's trigger-provisioned wallet rows so proxy calls raise WLT01.
DO $$
DECLARE
    v_orphan_acc UUID;
BEGIN
    SELECT a.id INTO v_orphan_acc
      FROM wallet.account a
      JOIN public.__ledger_proxy_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'orphan';
    IF v_orphan_acc IS NOT NULL THEN
        DELETE FROM wallet.coupon  WHERE account_id = v_orphan_acc;
        DELETE FROM wallet.balance WHERE account_id = v_orphan_acc;
        DELETE FROM wallet.account WHERE id = v_orphan_acc;
    END IF;
END;
$$;

-- Write a controlled mix of ledger rows for Alice + a private row for
-- Bob so we can assert cross-account isolation, source-kind filtering,
-- currency filtering, and the (created_at, id) cursor on ties.
--
-- Layout on Alice (khash unless noted):
--   1× reward         (non-market — must be excluded by default)
--   1× coupon         (non-market — must be excluded by default)
--   3× market_buy     (different created_at)
--   1× market_sell    (different created_at)
--   1× market_fee     (different created_at)
--   3× market_buy     (SAME created_at, sequential id — for cursor tie test)
--   1× market_buy     (credits currency — for p_currency filter test)
--
-- Bob: 1× market_buy. Must never appear in Alice's queries.
DO $$
DECLARE
    v_alice UUID;
    v_bob   UUID;
    v_now   TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT id INTO v_alice
      FROM wallet.account a
      JOIN public.__ledger_proxy_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'alice';
    SELECT id INTO v_bob
      FROM wallet.account a
      JOIN public.__ledger_proxy_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'bob';

    -- Non-market rows (Alice).
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        500, 'reward'::wallet.source_kind,
        'ledger-proxy-test reward', NULL, NULL,
        gen_random_uuid());
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        100, 'coupon'::wallet.source_kind,
        'ledger-proxy-test coupon', NULL, NULL,
        gen_random_uuid());

    -- Market rows (Alice) — distinct created_at, written sequentially.
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        50, 'market_buy'::wallet.source_kind,
        'buy a', 'bid', 1001, gen_random_uuid());
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        60, 'market_buy'::wallet.source_kind,
        'buy b', 'bid', 1002, gen_random_uuid());
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        70, 'market_buy'::wallet.source_kind,
        'buy c', 'bid', 1003, gen_random_uuid());
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        200, 'market_sell'::wallet.source_kind,
        'sell a', 'listing', 9001, gen_random_uuid());
    PERFORM wallet.service_credit(
        v_alice, 'khash'::wallet.currency_kind,
        2, 'market_fee'::wallet.source_kind,
        'fee a', 'listing', 9001, gen_random_uuid());

    -- Currency-filter row (Alice, credits) — distinguishable from the khash rows.
    PERFORM wallet.service_credit(
        v_alice, 'credits'::wallet.currency_kind,
        25, 'market_buy'::wallet.source_kind,
        'buy credits', 'bid', 1099, gen_random_uuid());

    -- Bob's row — must never appear in Alice's queries.
    PERFORM wallet.service_credit(
        v_bob, 'khash'::wallet.currency_kind,
        80, 'market_buy'::wallet.source_kind,
        'bob private', 'bid', 7001, gen_random_uuid());
END;
$$;

-- Equal-created_at fixture rows for Alice. Direct INSERT into
-- wallet.ledger so all three rows share the same timestamp. Trigger
-- on the table blocks UPDATE / DELETE only — INSERT is allowed.
DO $$
DECLARE
    v_alice  UUID;
    v_after  BIGINT;
    v_ts     TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT id INTO v_alice
      FROM wallet.account a
      JOIN public.__ledger_proxy_fixture f ON f.user_id = a.user_id
     WHERE f.role = 'alice';
    SELECT khash INTO v_after
      FROM wallet.balance
     WHERE account_id = v_alice;

    INSERT INTO wallet.ledger (
        account_id, currency, delta, balance_after,
        source_kind, reason, ref_type, ref_id,
        idempotency_key, replay_fingerprint, created_at
    )
    SELECT
        v_alice,
        'khash'::wallet.currency_kind,
        1,
        v_after,
        'market_buy'::wallet.source_kind,
        'tie-' || n::text,
        'bid',
        2000 + n,
        gen_random_uuid(),
        wallet.replay_fingerprint(
            v_alice, 'khash'::wallet.currency_kind, 1,
            'market_buy'::wallet.source_kind, 'bid', 2000 + n
        ),
        v_ts
      FROM generate_series(1, 3) AS n;
END;
$$;

-- ASSERT_AFTER_UP

-- 1. Anon (no JWT) raises 28000.
BEGIN;
RESET request.jwt.claims;
DO $$
BEGIN
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly();
        RAISE EXCEPTION 'fail: anon my_ledger should have raised 28000';
    EXCEPTION WHEN sqlstate '28000' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 2. Authenticated orphan (no wallet) raises WLT01.
BEGIN;
DO $$
DECLARE
    v_orphan_uid UUID;
BEGIN
    SELECT user_id INTO v_orphan_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'orphan';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_orphan_uid::text)::text,
        true
    );
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly();
        RAISE EXCEPTION 'fail: orphan my_ledger should have raised WLT01';
    EXCEPTION WHEN sqlstate 'WLT01' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 3. Default source_kinds excludes non-market rows. Caller-scoped:
--    every returned row belongs to Alice, none to Bob.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
    v_market    INTEGER;
    v_non_market INTEGER;
    v_bob_leak   INTEGER;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    SELECT COUNT(*) INTO v_market
      FROM public.proxy_market_my_ledger_readonly();
    SELECT COUNT(*) INTO v_non_market
      FROM public.proxy_market_my_ledger_readonly()
     WHERE source_kind NOT IN (
         'market_buy'::wallet.source_kind,
         'market_sell'::wallet.source_kind,
         'market_fee'::wallet.source_kind
     );
    SELECT COUNT(*) INTO v_bob_leak
      FROM public.proxy_market_my_ledger_readonly()
     WHERE reason = 'bob private';

    IF v_market = 0 THEN
        RAISE EXCEPTION 'fail: default call returned zero rows for alice';
    END IF;
    IF v_non_market <> 0 THEN
        RAISE EXCEPTION 'fail: default call leaked % non-market rows', v_non_market;
    END IF;
    IF v_bob_leak <> 0 THEN
        RAISE EXCEPTION 'fail: alice query returned % bob rows', v_bob_leak;
    END IF;
END;
$$;
COMMIT;

-- 4. p_source_kinds := NULL widens to the caller's full ledger
--    (reward + coupon now visible) but still does not leak Bob.
BEGIN;
DO $$
DECLARE
    v_alice_uid  UUID;
    v_has_reward INTEGER;
    v_has_coupon INTEGER;
    v_bob_leak   INTEGER;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    SELECT COUNT(*) INTO v_has_reward
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE source_kind = 'reward'::wallet.source_kind;
    SELECT COUNT(*) INTO v_has_coupon
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE source_kind = 'coupon'::wallet.source_kind;
    SELECT COUNT(*) INTO v_bob_leak
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE reason = 'bob private';

    IF v_has_reward = 0 THEN
        RAISE EXCEPTION 'fail: NULL source_kinds did not include reward row';
    END IF;
    IF v_has_coupon = 0 THEN
        RAISE EXCEPTION 'fail: NULL source_kinds did not include coupon row';
    END IF;
    IF v_bob_leak <> 0 THEN
        RAISE EXCEPTION 'fail: widened query leaked % bob rows', v_bob_leak;
    END IF;
END;
$$;
COMMIT;

-- 5. Empty p_source_kinds raises 22023.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly(
            50, NULL, NULL,
            ARRAY[]::wallet.source_kind[],
            NULL
        );
        RAISE EXCEPTION 'fail: empty source_kinds should have raised 22023';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 6. Half cursor (one of the pair NULL) raises 22023.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly(
            50, statement_timestamp(), NULL
        );
        RAISE EXCEPTION 'fail: half cursor (no id) should have raised 22023';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly(
            50, NULL, 1::BIGINT
        );
        RAISE EXCEPTION 'fail: half cursor (id only) should have raised 22023';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 7. Non-positive p_before_id raises 22023.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly(
            50, statement_timestamp(), 0::BIGINT
        );
        RAISE EXCEPTION 'fail: zero before_id should have raised 22023';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
    BEGIN
        PERFORM * FROM public.proxy_market_my_ledger_readonly(
            50, statement_timestamp(), (-1)::BIGINT
        );
        RAISE EXCEPTION 'fail: negative before_id should have raised 22023';
    EXCEPTION WHEN sqlstate '22023' THEN NULL;
    END;
END;
$$;
COMMIT;

-- 8. Equal created_at: the (created_at, id) cursor strictly advances
--    through the tied rows without dup or gap.
BEGIN;
DO $$
DECLARE
    v_alice_uid     UUID;
    v_tie_ts        TIMESTAMPTZ;
    v_first_id      BIGINT;
    v_second_id     BIGINT;
    v_third_id      BIGINT;
    v_after_first   BIGINT;
    v_after_second  BIGINT;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    -- The three direct-INSERT rows share a created_at and run reason='tie-N'.
    SELECT MIN(l.created_at) INTO v_tie_ts
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL) l
     WHERE l.reason LIKE 'tie-%';
    IF v_tie_ts IS NULL THEN
        RAISE EXCEPTION 'fail: tied rows missing from ledger';
    END IF;

    -- Pull the three tied ids in id DESC order; the proxy must surface them
    -- in that same order at the top of the tie band.
    SELECT ledger_id INTO v_first_id
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE reason LIKE 'tie-%'
     ORDER BY ledger_id DESC
     LIMIT 1 OFFSET 0;
    SELECT ledger_id INTO v_second_id
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE reason LIKE 'tie-%'
     ORDER BY ledger_id DESC
     LIMIT 1 OFFSET 1;
    SELECT ledger_id INTO v_third_id
      FROM public.proxy_market_my_ledger_readonly(50, NULL, NULL, NULL, NULL)
     WHERE reason LIKE 'tie-%'
     ORDER BY ledger_id DESC
     LIMIT 1 OFFSET 2;

    -- Cursor positioned at first tied row → second tied row appears next.
    SELECT ledger_id INTO v_after_first
      FROM public.proxy_market_my_ledger_readonly(1, v_tie_ts, v_first_id, NULL, NULL)
     LIMIT 1;
    IF v_after_first IS DISTINCT FROM v_second_id THEN
        RAISE EXCEPTION 'fail: cursor after tied id % expected % got %',
            v_first_id, v_second_id, v_after_first;
    END IF;

    -- Cursor positioned at second tied row → third tied row appears next.
    SELECT ledger_id INTO v_after_second
      FROM public.proxy_market_my_ledger_readonly(1, v_tie_ts, v_second_id, NULL, NULL)
     LIMIT 1;
    IF v_after_second IS DISTINCT FROM v_third_id THEN
        RAISE EXCEPTION 'fail: cursor after tied id % expected % got %',
            v_second_id, v_third_id, v_after_second;
    END IF;
END;
$$;
COMMIT;

-- 9. p_currency filter is applied AND stays caller-scoped.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
    v_credits   INTEGER;
    v_khash     INTEGER;
    v_cross     INTEGER;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    SELECT COUNT(*) INTO v_credits
      FROM public.proxy_market_my_ledger_readonly(
          50, NULL, NULL, NULL, 'credits'::wallet.currency_kind);
    SELECT COUNT(*) INTO v_khash
      FROM public.proxy_market_my_ledger_readonly(
          50, NULL, NULL, NULL, 'khash'::wallet.currency_kind);
    SELECT COUNT(*) INTO v_cross
      FROM public.proxy_market_my_ledger_readonly(
          50, NULL, NULL, NULL, 'credits'::wallet.currency_kind)
     WHERE currency <> 'credits'::wallet.currency_kind;

    IF v_credits = 0 THEN
        RAISE EXCEPTION 'fail: credits filter returned zero rows';
    END IF;
    IF v_khash = 0 THEN
        RAISE EXCEPTION 'fail: khash filter returned zero rows';
    END IF;
    IF v_cross <> 0 THEN
        RAISE EXCEPTION 'fail: credits filter returned % non-credits rows', v_cross;
    END IF;
END;
$$;
COMMIT;

-- 10. Custom p_source_kinds narrows further (market_sell only) without
--     widening past the caller's account.
BEGIN;
DO $$
DECLARE
    v_alice_uid UUID;
    v_sell_only INTEGER;
    v_off_kind  INTEGER;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    SELECT COUNT(*) INTO v_sell_only
      FROM public.proxy_market_my_ledger_readonly(
          50, NULL, NULL,
          ARRAY['market_sell'::wallet.source_kind],
          NULL);
    SELECT COUNT(*) INTO v_off_kind
      FROM public.proxy_market_my_ledger_readonly(
          50, NULL, NULL,
          ARRAY['market_sell'::wallet.source_kind],
          NULL)
     WHERE source_kind <> 'market_sell'::wallet.source_kind;

    IF v_sell_only = 0 THEN
        RAISE EXCEPTION 'fail: market_sell filter returned zero rows';
    END IF;
    IF v_off_kind <> 0 THEN
        RAISE EXCEPTION 'fail: narrow filter leaked % off-kind rows', v_off_kind;
    END IF;
END;
$$;
COMMIT;

-- 11. Limit is clamped (not rejected) — matches sibling proxies.
BEGIN;
DO $$
DECLARE
    v_alice_uid    UUID;
    v_clamped_high INTEGER;
    v_clamped_low  INTEGER;
BEGIN
    SELECT user_id INTO v_alice_uid
      FROM public.__ledger_proxy_fixture WHERE role = 'alice';
    PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role', 'authenticated', 'sub', v_alice_uid::text)::text,
        true
    );

    SELECT COUNT(*) INTO v_clamped_high
      FROM public.proxy_market_my_ledger_readonly(99999, NULL, NULL, NULL, NULL);
    SELECT COUNT(*) INTO v_clamped_low
      FROM public.proxy_market_my_ledger_readonly(0, NULL, NULL, NULL, NULL);

    IF v_clamped_high > 100 THEN
        RAISE EXCEPTION 'fail: limit clamp upper bound exceeded (% rows)', v_clamped_high;
    END IF;
    IF v_clamped_low <> 1 THEN
        RAISE EXCEPTION 'fail: limit 0 should have clamped to 1 (got % rows)', v_clamped_low;
    END IF;
END;
$$;
COMMIT;
