-- migrate:up transaction:false

-- transaction:false: this migration manages its own BEGIN/COMMIT below.
-- The outer dbmate transaction collides with the inner COMMIT and surfaces
-- as "pq: unexpected transaction status idle" otherwise. Matches the
-- pattern in 20260510210000_profile_custom_access_token_hook.sql.

BEGIN;

-- ============================================================
-- GoTrue Custom Access Token Hook: extend with owned_guilds
--
-- Builds on 20260510210000_profile_custom_access_token_hook.sql by adding
-- a second claim `owned_guilds` populated from the user's Discord
-- identity row in auth.identities.
--
-- Source of truth: auth.identities.identity_data->'owned_guilds' as a
-- jsonb array of Discord guild snowflake strings (text). This column is
-- populated by the edge function `discord-bootstrap` (P5.8b) using the
-- user's provider_token. The hook itself does NO external calls — it
-- just reads pre-cached state, so JWT mint stays synchronous and fast.
--
-- Soft-failure semantics: when no Discord identity exists, or the
-- column is missing/malformed, the hook emits an empty array. Browsers
-- treat empty as "not bootstrapped yet" and call the bootstrap edge fn
-- once before flipping the dashboard to authenticated state.
--
-- Cap: array_length capped at 50 inside the hook to bound JWT size.
-- Discord platform allows up to 100 owned guilds for phone-verified
-- accounts; the 0.01% above 50 fall through to the live Discord API
-- path on the edge fn side.
-- ============================================================

-- supabase_auth_admin already owns the auth schema, so explicit grants
-- on auth.identities are redundant — but we assert them in the health
-- block below so future grant revocations surface as a migration error
-- rather than a silent claim drop.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id       uuid;
    v_username      text;
    v_owned_guilds  jsonb;
    v_claims        jsonb;
BEGIN
    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN event;
    END;

    IF v_user_id IS NULL THEN
        RETURN event;
    END IF;

    v_claims := COALESCE(event->'claims', '{}'::jsonb);

    -- kbve_username (existing behaviour)
    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    -- owned_guilds from Discord identity (capped at 50 snowflakes).
    -- The inner SELECT picks the latest discord identity row for this user
    -- and pins it via LIMIT 1; the outer LATERAL then unnests its
    -- owned_guilds array. Inlining the unnest into the same SELECT would
    -- collapse "LIMIT 1 on identity rows" with "LIMIT 1 on array elements"
    -- and silently drop all but the first guild.
    SELECT COALESCE(
             (
                 SELECT jsonb_agg(g)
                   FROM (
                       SELECT g
                         FROM (
                             SELECT i.identity_data->'owned_guilds' AS arr
                               FROM auth.identities AS i
                              WHERE i.user_id  = v_user_id
                                AND i.provider = 'discord'
                                AND jsonb_typeof(i.identity_data->'owned_guilds') = 'array'
                              ORDER BY i.updated_at DESC NULLS LAST, i.id DESC
                              LIMIT 1
                         ) AS latest,
                         LATERAL jsonb_array_elements_text(latest.arr) AS g
                        WHERE g ~ '^\d{17,20}$'
                        LIMIT 50
                   ) AS s
             ),
             '[]'::jsonb
           )
      INTO v_owned_guilds;

    v_claims := jsonb_set(v_claims, '{owned_guilds}', v_owned_guilds, true);

    RETURN jsonb_set(event, '{claims}', v_claims, true);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb)
    OWNER TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
    'GoTrue access-token hook: embeds profile.username as kbve_username and the Discord identity owned_guilds array (cap 50) as owned_guilds. No external calls — reads pre-cached state populated by the discord-bootstrap edge fn.';

DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public for the hook to resolve.';
    END IF;

    IF NOT has_schema_privilege('supabase_auth_admin', 'profile', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema profile.';
    END IF;

    IF NOT has_schema_privilege('supabase_auth_admin', 'auth', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema auth for the hook to read identities.';
    END IF;

    IF NOT has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on public.custom_access_token_hook(jsonb).';
    END IF;

    IF has_function_privilege('anon',          'public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated','public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('public',     'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'public.custom_access_token_hook(jsonb) must not be executable by anon/authenticated/public.';
    END IF;

    IF NOT has_table_privilege('supabase_auth_admin', 'profile.username', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.username for the hook to read usernames.';
    END IF;

    IF NOT has_table_privilege('supabase_auth_admin', 'auth.identities', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on auth.identities for the hook to read owned_guilds.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Behavioural smoke check
-- ------------------------------------------------------------
-- Verifies the hook returns an `owned_guilds` array (empty when no
-- Discord identity is present) and preserves the rest of the event.
-- Runs against a synthetic user_id with no rows in auth.identities or
-- profile.username, so the expected output is the input event with an
-- empty owned_guilds claim appended.

-- Scenario 1: synthetic user with no Discord identity yields empty array.
-- Scenario 2: synthetic user with Discord identity carrying 3 valid + 1
-- malformed snowflake yields exactly the 3 valid ones (regression guard
-- for the LIMIT-1-on-unnest bug — see comment above the SELECT).

DO $$
DECLARE
    v_synthetic_user uuid := '00000000-0000-0000-0000-fffe00000001';
    v_in             jsonb;
    v_out            jsonb;
    v_guilds         jsonb;
BEGIN
    -- Scenario 1
    v_in := jsonb_build_object(
        'user_id', '00000000-0000-0000-0000-000000000000',
        'claims',  jsonb_build_object('role', 'authenticated')
    );
    v_out := public.custom_access_token_hook(v_in);

    IF v_out->'claims'->'owned_guilds' IS NULL THEN
        RAISE EXCEPTION 'hook smoke 1: owned_guilds claim missing from output: %', v_out;
    END IF;
    IF jsonb_typeof(v_out->'claims'->'owned_guilds') <> 'array' THEN
        RAISE EXCEPTION 'hook smoke 1: owned_guilds must be a jsonb array, got %',
            jsonb_typeof(v_out->'claims'->'owned_guilds');
    END IF;
    IF jsonb_array_length(v_out->'claims'->'owned_guilds') <> 0 THEN
        RAISE EXCEPTION 'hook smoke 1: empty Discord identity must yield empty owned_guilds, got %',
            v_out->'claims'->'owned_guilds';
    END IF;
    IF v_out->'claims'->>'role' <> 'authenticated' THEN
        RAISE EXCEPTION 'hook smoke 1: existing claims must be preserved, role lost from %', v_out;
    END IF;

    -- Scenario 2 — run inside a PL/pgSQL EXCEPTION subtransaction so the
    -- synthetic INSERT into auth.users (and any trigger-spawned rows like
    -- the wallet/account auto-provision) are rolled back atomically. We
    -- complete the assertions, then RAISE a sentinel exception to force
    -- the subtransaction to roll back; the outer handler swallows that
    -- specific sentinel and re-raises everything else.
    BEGIN
        INSERT INTO auth.users (id) VALUES (v_synthetic_user);
        INSERT INTO auth.identities (user_id, provider, provider_id, identity_data)
        VALUES (
            v_synthetic_user,
            'discord',
            'smoke-' || v_synthetic_user::text,
            jsonb_build_object(
                'owned_guilds',
                jsonb_build_array(
                    '111111111111111111',
                    '222222222222222222',
                    '333333333333333333',
                    'not-a-snowflake'
                )
            )
        );

        v_in := jsonb_build_object(
            'user_id', v_synthetic_user,
            'claims',  jsonb_build_object('role', 'authenticated')
        );
        v_out    := public.custom_access_token_hook(v_in);
        v_guilds := v_out->'claims'->'owned_guilds';

        IF jsonb_array_length(v_guilds) <> 3 THEN
            RAISE EXCEPTION
                'hook smoke 2: expected 3 valid snowflakes (LIMIT-1-on-unnest regression?), got % from %',
                jsonb_array_length(v_guilds), v_guilds;
        END IF;
        IF NOT (v_guilds @> '["111111111111111111","222222222222222222","333333333333333333"]'::jsonb) THEN
            RAISE EXCEPTION 'hook smoke 2: expected snowflakes missing from %', v_guilds;
        END IF;
        IF v_guilds @> '["not-a-snowflake"]'::jsonb THEN
            RAISE EXCEPTION 'hook smoke 2: malformed snowflake leaked into %', v_guilds;
        END IF;

        -- Sentinel: forces subtransaction rollback so synthetic rows do
        -- not leak past this migration. Caught immediately below.
        RAISE EXCEPTION 'hook_smoke_sentinel_rollback';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM <> 'hook_smoke_sentinel_rollback' THEN
                RAISE;
            END IF;
    END;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- migrate:down transaction:false

-- transaction:false: matches the up section.

BEGIN;

-- Restore the v1 hook body (kbve_username only). We deliberately do not
-- DROP the function, since GoTrue is configured to call it and a missing
-- function would break sign-in. We just revert to the pre-owned_guilds
-- behaviour.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id  uuid;
    v_username text;
    v_claims   jsonb;
BEGIN
    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN event;
    END;

    IF v_user_id IS NULL THEN
        RETURN event;
    END IF;

    v_claims := COALESCE(event->'claims', '{}'::jsonb);

    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    RETURN jsonb_set(event, '{claims}', v_claims, true);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb)
    OWNER TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

COMMIT;
