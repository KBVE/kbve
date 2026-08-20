-- Companion test fixtures for 20260820051500_wow_schema_init.
-- Run via: ./test-migration.sh 20260820051500_wow_schema_init
--
-- The invariant that matters most here is "one game account per KBVE user".
-- It is enforced by a primary key on user_id plus an early return inside
-- wow.service_claim_account, and a regression in either would not surface as
-- an error — it would silently let a user hold two accounts. So the asserts
-- below exercise the RPC behaviour, not just the presence of objects.

-- SEED
INSERT INTO auth.users (id, email)
VALUES
    ('a0000000-0000-4000-8000-000000000001', 'wowtest-alice@kbve.com'),
    ('a0000000-0000-4000-8000-000000000002', 'wowtest-bob@kbve.com'),
    ('a0000000-0000-4000-8000-000000000003', 'wowtest-carol@kbve.com')
ON CONFLICT (id) DO NOTHING;

-- carol deliberately gets no profile.username row: she is the fixture for the
-- "must set a KBVE username first" gate.
INSERT INTO profile.username (user_id, username)
VALUES
    ('a0000000-0000-4000-8000-000000000001', 'wowtest-alice'),
    ('a0000000-0000-4000-8000-000000000002', 'wowtest-bob')
ON CONFLICT (user_id) DO NOTHING;

-- ASSERT_AFTER_UP
DO $$
DECLARE
    v_username TEXT;
    v_status INTEGER;
    v_created BOOLEAN;
    v_count INTEGER;
BEGIN
    -- ---- structure ----
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'wow'
    ) THEN
        RAISE EXCEPTION 'fail: wow schema missing after up';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'wow' AND table_name = 'account'
    ) THEN
        RAISE EXCEPTION 'fail: wow.account missing after up';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'wow' AND tablename = 'account' AND rowsecurity
    ) THEN
        RAISE EXCEPTION 'fail: RLS not enabled on wow.account';
    END IF;

    -- The browser reaches this through PostgREST, which only sees `public`.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'proxy_get_wow_account'
    ) THEN
        RAISE EXCEPTION 'fail: public.proxy_get_wow_account missing — browser RPC would 404';
    END IF;

    -- ---- grants ----
    IF has_schema_privilege('anon', 'wow', 'USAGE') THEN
        RAISE EXCEPTION 'fail: anon must not have USAGE on wow schema';
    END IF;

    IF has_schema_privilege('authenticated', 'wow', 'USAGE') THEN
        RAISE EXCEPTION 'fail: authenticated must not have USAGE on wow schema';
    END IF;

    IF has_function_privilege('anon', 'public.proxy_get_wow_account()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: anon must not execute proxy_get_wow_account';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.service_claim_wow_account(uuid, text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: authenticated must not execute the service claim RPC';
    END IF;

    -- ---- behaviour: a fresh claim ----
    SELECT username, status, was_created
      INTO v_username, v_status, v_created
      FROM public.service_claim_wow_account(
          'a0000000-0000-4000-8000-000000000001', 'WOWALICE');

    IF v_username <> 'WOWALICE' OR v_status <> 0 OR NOT v_created THEN
        RAISE EXCEPTION 'fail: fresh claim returned (%, %, %)', v_username, v_status, v_created;
    END IF;

    -- ---- behaviour: one account per user ----
    -- Re-claiming under a different name must return the ORIGINAL row rather
    -- than creating a second one or renaming the first.
    SELECT username, was_created
      INTO v_username, v_created
      FROM public.service_claim_wow_account(
          'a0000000-0000-4000-8000-000000000001', 'DIFFERENTNAME');

    IF v_username <> 'WOWALICE' OR v_created THEN
        RAISE EXCEPTION 'fail: second claim should return existing WOWALICE, got (%, %)',
            v_username, v_created;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM wow.account WHERE user_id = 'a0000000-0000-4000-8000-000000000001';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: user holds % accounts, expected exactly 1', v_count;
    END IF;

    -- ---- behaviour: username uniqueness across users ----
    BEGIN
        PERFORM public.service_claim_wow_account(
            'a0000000-0000-4000-8000-000000000002', 'WOWALICE');
        RAISE EXCEPTION 'fail: bob was allowed to claim a taken username';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    -- ---- behaviour: KBVE username gate ----
    BEGIN
        PERFORM public.service_claim_wow_account(
            'a0000000-0000-4000-8000-000000000003', 'WOWCAROL');
        RAISE EXCEPTION 'fail: user without a profile.username was allowed to claim';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'fail:%' THEN RAISE; END IF;
    END;

    -- ---- behaviour: username format ----
    BEGIN
        PERFORM public.service_claim_wow_account(
            'a0000000-0000-4000-8000-000000000002', 'bad name!');
        RAISE EXCEPTION 'fail: invalid username format was accepted';
    EXCEPTION
        WHEN invalid_parameter_value THEN NULL;
    END;

    -- ---- behaviour: provisioning flips status and stamps the time ----
    IF NOT public.service_mark_wow_provisioned(
        'a0000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'fail: service_mark_wow_provisioned returned false';
    END IF;

    SELECT status INTO v_status
      FROM wow.account WHERE user_id = 'a0000000-0000-4000-8000-000000000001';
    IF v_status <> 1 THEN
        RAISE EXCEPTION 'fail: status is % after provisioning, expected 1', v_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM wow.account
        WHERE user_id = 'a0000000-0000-4000-8000-000000000001'
          AND provisioned_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'fail: provisioned_at not stamped';
    END IF;

    -- ---- behaviour: a live account is never released ----
    -- service_release_wow_claim exists to free a claim whose MySQL insert
    -- failed. Letting it drop a provisioned row would orphan a real game
    -- account, so it must refuse.
    IF public.service_release_wow_claim(
        'a0000000-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'fail: release deleted a provisioned account';
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM wow.account WHERE user_id = 'a0000000-0000-4000-8000-000000000001';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: provisioned account disappeared after release attempt';
    END IF;

    -- ---- behaviour: an unprovisioned claim IS released ----
    PERFORM public.service_claim_wow_account(
        'a0000000-0000-4000-8000-000000000002', 'WOWBOB');
    IF NOT public.service_release_wow_claim(
        'a0000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'fail: release did not free an unprovisioned claim';
    END IF;

    -- Freeing the claim must also free the name for someone else.
    SELECT COUNT(*) INTO v_count FROM wow.account WHERE username = 'WOWBOB';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'fail: WOWBOB still reserved after release';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'wow'
    ) THEN
        RAISE EXCEPTION 'fail: wow schema still present after down';
    END IF;

    -- The public wrappers live outside the wow schema, so dropping the schema
    -- does not remove them; the down migration has to do it explicitly or they
    -- linger as broken functions pointing at nothing.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'proxy_get_wow_account',
              'service_claim_wow_account',
              'service_mark_wow_provisioned',
              'service_release_wow_claim'
          )
    ) THEN
        RAISE EXCEPTION 'fail: public wow wrappers still present after down';
    END IF;
END;
$$;
