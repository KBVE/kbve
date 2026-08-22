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
-- alice and bob share the first 16 characters on purpose: the game name is
-- derived from the KBVE username and truncated to 16, so these two collide and
-- exercise the suffix path.
INSERT INTO profile.username (user_id, username)
VALUES
    ('a0000000-0000-4000-8000-000000000001', 'wowtest-collider-alice'),
    ('a0000000-0000-4000-8000-000000000002', 'wowtest-collider-bob')
ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;

-- ASSERT_AFTER_UP
DO $$
DECLARE
    v_username TEXT;
    v_suggested TEXT;
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
        'public.service_claim_wow_account(uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'fail: authenticated must not execute the service claim RPC';
    END IF;

    -- ---- behaviour: the name is derived, not chosen ----
    -- 'wowtest-collider-alice' uppercases and truncates to the 16 characters
    -- the 3.3.5a login box accepts.
    SELECT username, status, was_created
      INTO v_username, v_status, v_created
      FROM public.service_claim_wow_account(
          'a0000000-0000-4000-8000-000000000001');

    IF v_username <> 'WOWTEST-COLLIDER' OR v_status <> 0 OR NOT v_created THEN
        RAISE EXCEPTION 'fail: fresh claim returned (%, %, %)', v_username, v_status, v_created;
    END IF;

    IF char_length(v_username) > 16 THEN
        RAISE EXCEPTION 'fail: derived name % exceeds the 16-char client limit', v_username;
    END IF;

    -- ---- behaviour: one account per user ----
    -- Re-claiming must return the ORIGINAL row rather than creating a second
    -- one or renaming the first.
    SELECT username, was_created
      INTO v_username, v_created
      FROM public.service_claim_wow_account(
          'a0000000-0000-4000-8000-000000000001');

    IF v_username <> 'WOWTEST-COLLIDER' OR v_created THEN
        RAISE EXCEPTION 'fail: second claim should return the existing row, got (%, %)',
            v_username, v_created;
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM wow.account WHERE user_id = 'a0000000-0000-4000-8000-000000000001';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'fail: user holds % accounts, expected exactly 1', v_count;
    END IF;

    -- ---- behaviour: a collision takes a suffix, it does not fail ----
    -- Bob truncates to the same 16 characters as alice. He must still get an
    -- account, under a distinct name that still fits the client limit.
    SELECT username, was_created
      INTO v_username, v_created
      FROM public.service_claim_wow_account(
          'a0000000-0000-4000-8000-000000000002');

    IF NOT v_created THEN
        RAISE EXCEPTION 'fail: colliding claim was not created';
    END IF;

    IF v_username = 'WOWTEST-COLLIDER' THEN
        RAISE EXCEPTION 'fail: colliding claim reused the taken name';
    END IF;

    IF v_username <> 'WOWTEST-COLLIDE2' THEN
        RAISE EXCEPTION 'fail: expected the suffixed name, got %', v_username;
    END IF;

    IF char_length(v_username) > 16 THEN
        RAISE EXCEPTION 'fail: suffixed name % exceeds 16 chars', v_username;
    END IF;

    -- ---- behaviour: KBVE username gate ----
    BEGIN
        PERFORM public.service_claim_wow_account(
            'a0000000-0000-4000-8000-000000000003');
        RAISE EXCEPTION 'fail: user without a profile.username was allowed to claim';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM LIKE 'fail:%' THEN RAISE; END IF;
    END;

    -- ---- behaviour: the proxy answers as the JWT subject ----
    -- Carol has no KBVE username, so she must get no row at all rather than a
    -- blank one — that is the signal the UI uses to send her to set one first.
    -- Both GUCs: the local kilobase stub reads request.jwt.claim.sub, while
    -- the deployed auth.uid() coalesces that with the request.jwt.claims JSON.
    PERFORM set_config(
        'request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
    PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}',
        true);
    SELECT COUNT(*) INTO v_count FROM public.proxy_get_wow_account();
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'fail: user without a KBVE username got a suggestion row';
    END IF;

    -- Bob has a KBVE username and a claim, so both names come back: what he
    -- holds, and what a fresh derivation would suggest. They differ here
    -- precisely because his first choice collided with alice.
    PERFORM set_config(
        'request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
    PERFORM set_config(
        'request.jwt.claims',
        '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',
        true);
    SELECT username, suggested_username
      INTO v_username, v_suggested
      FROM public.proxy_get_wow_account();

    IF v_username <> 'WOWTEST-COLLIDE2' THEN
        RAISE EXCEPTION 'fail: proxy returned % for bob', v_username;
    END IF;
    IF v_suggested <> 'WOWTEST-COLLIDER' THEN
        RAISE EXCEPTION 'fail: suggestion was %, expected the plain truncation', v_suggested;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

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
    -- Bob's claim from the collision case above is still unprovisioned.
    IF NOT public.service_release_wow_claim(
        'a0000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'fail: release did not free an unprovisioned claim';
    END IF;

    -- Freeing the claim must also free the name for someone else.
    SELECT COUNT(*) INTO v_count
      FROM wow.account WHERE username = 'WOWTEST-COLLIDE2';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'fail: WOWTEST-COLLIDE2 still reserved after release';
    END IF;

    -- ---- behaviour: provisioning cannot resurrect a disabled account ----
    -- status = 2 is how a banned or retired account keeps its username
    -- reserved. A replayed provisioning call must not quietly flip it live
    -- again, which is why service_mark_provisioned is scoped to status = 0.
    PERFORM public.service_claim_wow_account(
        'a0000000-0000-4000-8000-000000000002');
    PERFORM public.service_mark_wow_provisioned(
        'a0000000-0000-4000-8000-000000000002');
    UPDATE wow.account SET status = 2
     WHERE user_id = 'a0000000-0000-4000-8000-000000000002';

    IF public.service_mark_wow_provisioned(
        'a0000000-0000-4000-8000-000000000002') THEN
        RAISE EXCEPTION 'fail: provisioning reactivated a disabled account';
    END IF;

    SELECT status INTO v_status
      FROM wow.account WHERE user_id = 'a0000000-0000-4000-8000-000000000002';
    IF v_status <> 2 THEN
        RAISE EXCEPTION 'fail: disabled account moved to status % ', v_status;
    END IF;

    -- ---- grants: the table itself is unreachable from the browser roles ----
    -- The schema-wide REVOKE ... ON ALL TABLES form only covers tables that
    -- already exist when it runs, so this asserts the outcome rather than
    -- trusting the statement's position in the file.
    IF has_table_privilege('authenticated', 'wow.account', 'SELECT') THEN
        RAISE EXCEPTION 'fail: authenticated can read wow.account directly';
    END IF;

    IF has_table_privilege('anon', 'wow.account', 'SELECT') THEN
        RAISE EXCEPTION 'fail: anon can read wow.account directly';
    END IF;

    IF NOT has_table_privilege('service_role', 'wow.account', 'INSERT') THEN
        RAISE EXCEPTION 'fail: service_role cannot write wow.account';
    END IF;

    -- ---- structure: the reaper index for abandoned claims ----
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'wow' AND indexname = 'idx_wow_account_stale_claim'
    ) THEN
        RAISE EXCEPTION 'fail: idx_wow_account_stale_claim missing';
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
