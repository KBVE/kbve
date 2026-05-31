-- migrate:up transaction:false

-- transaction:false: this migration manages its own BEGIN/COMMIT below.
-- The outer dbmate transaction collides with the inner COMMIT and surfaces
-- as "pq: unexpected transaction status idle" otherwise. Matches the
-- pattern in 20260510210000_profile_custom_access_token_hook.sql.

BEGIN;

-- ============================================================
-- profile.discord_bootstrap_cache + custom_access_token_hook v2
--
-- v1 of the hook (20260510210000) embedded a single claim: kbve_username.
-- v2 adds a second claim: owned_guilds — an array of Discord guild
-- snowflakes the user owns. The dashboard reads it from the JWT and
-- skips the live Discord /users/@me/guilds call that currently blanks
-- the agents page with "Discord session expired" whenever the cached
-- provider_token ages out.
--
-- Source of truth is our own cache table, profile.discord_bootstrap_cache,
-- NOT auth.identities.identity_data. Reviewer pushback on the first draft
-- (PR #11488 review point #2) was that coupling a JWT-mint hot path to a
-- semi-opaque Supabase-managed table is fragile across Supabase upgrades
-- and harder to RLS / index cleanly. The cache table gives us:
--   - stable PK lookup (one row per user_id)
--   - no dependency on auth.identities JSON shape
--   - service_role-owned writes, easy to GRANT for the bootstrap edge fn
--   - cheap CASCADE on auth.users delete
--   - smoke tests stop touching auth.users entirely
--
-- The hook still reads pre-cached state only. Zero external calls. JWT
-- mint stays synchronous. Population of the cache row is the job of the
-- discord-bootstrap edge fn (P5.8b), which calls Discord and upserts
-- here with service_role.
-- ============================================================

-- ------------------------------------------------------------
-- Cache table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile.discord_bootstrap_cache (
    user_id              uuid PRIMARY KEY
                              REFERENCES auth.users(id) ON DELETE CASCADE,
    discord_provider_id  text NOT NULL
                              CHECK (discord_provider_id ~ '^[0-9]{15,25}$'),
    owned_guilds         jsonb NOT NULL DEFAULT '[]'::jsonb,
    refreshed_at         timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT discord_bootstrap_cache_owned_guilds_is_array
        CHECK (jsonb_typeof(owned_guilds) = 'array'),
    CONSTRAINT discord_bootstrap_cache_owned_guilds_size_cap
        CHECK (jsonb_array_length(owned_guilds) <= 100)
);

COMMENT ON TABLE profile.discord_bootstrap_cache IS
    'Per-user Discord bootstrap cache. Populated by the discord-bootstrap edge fn after OAuth. Read by custom_access_token_hook at JWT mint to embed owned_guilds claim. Owned by service_role; supabase_auth_admin has SELECT for the hook.';

ALTER TABLE profile.discord_bootstrap_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON profile.discord_bootstrap_cache;
CREATE POLICY "service_role_full_access"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.discord_bootstrap_cache;
CREATE POLICY "supabase_auth_admin_select"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR SELECT
    TO supabase_auth_admin
    USING (true);

GRANT USAGE  ON SCHEMA profile                             TO supabase_auth_admin;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache     TO supabase_auth_admin;
GRANT ALL    ON TABLE  profile.discord_bootstrap_cache     TO service_role;

-- ------------------------------------------------------------
-- Hook v2
-- ------------------------------------------------------------
-- Reads from profile.discord_bootstrap_cache via a single PK lookup.
-- Hardening applied (per PR #11488 reviewer points):
--   #3  [0-9] over \d (locale-safe, same cost)
--   #4  WITH ORDINALITY + explicit jsonb_agg ORDER BY (deterministic
--       claim order)
--   #5  GROUP BY g + min(ord) (duplicate snowflakes suppressed,
--       first-seen order preserved)
--   #6  Strip kbve_username + owned_guilds on invalid/missing user_id
--       (defense-in-depth for SECURITY DEFINER)
--   #10 / #16 Typecheck event->'claims' as object before jsonb_set
--   #11 Soft size cap (>1200 chars -> []) so malformed cache rows
--       cannot bloat the JWT
--   #15 CTE rewrite for the owned_guilds extraction
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id      uuid;
    v_username     text;
    v_owned_guilds jsonb;
    v_claims       jsonb;
BEGIN
    -- #10 / #16: claims must be a json object before we set into it.
    v_claims :=
        CASE
            WHEN jsonb_typeof(event->'claims') = 'object'
                THEN event->'claims'
            ELSE '{}'::jsonb
        END;

    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            -- #6: malformed user_id -> strip any pre-existing privileged
            -- claims and return early. Caller cannot smuggle claims via a
            -- garbage user_id.
            RETURN jsonb_set(
                event,
                '{claims}',
                v_claims - 'kbve_username' - 'owned_guilds',
                true
            );
    END;

    IF v_user_id IS NULL THEN
        RETURN jsonb_set(
            event,
            '{claims}',
            v_claims - 'kbve_username' - 'owned_guilds',
            true
        );
    END IF;

    -- kbve_username (unchanged from v1)
    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    -- owned_guilds: single PK lookup against the cache table.
    WITH src AS (
        SELECT c.owned_guilds AS arr
          FROM profile.discord_bootstrap_cache AS c
         WHERE c.user_id = v_user_id
           AND jsonb_typeof(c.owned_guilds) = 'array'
    ),
    valid AS (
        SELECT g, MIN(ord) AS ord
          FROM src,
               LATERAL jsonb_array_elements_text(src.arr) WITH ORDINALITY AS e(g, ord)
         WHERE g ~ '^[0-9]{17,20}$'
         GROUP BY g
         ORDER BY MIN(ord)
         LIMIT 50
    )
    SELECT COALESCE(jsonb_agg(g ORDER BY ord), '[]'::jsonb)
      INTO v_owned_guilds
      FROM valid;

    -- #11: soft size cap. The 50-snowflake LIMIT above should make this
    -- unreachable in practice (~1.5 KB worst case) but a malformed cache
    -- row with massive strings would otherwise leak straight into the
    -- JWT. Degrade silently to [] rather than failing the sign-in.
    IF length(v_owned_guilds::text) > 1200 THEN
        v_owned_guilds := '[]'::jsonb;
    END IF;

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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and profile.discord_bootstrap_cache.owned_guilds (cap 50, deterministic order, dedup, soft size cap) as owned_guilds. No external calls — reads pre-cached state populated by the discord-bootstrap edge fn.';

-- ------------------------------------------------------------
-- Privilege + plumbing assertions
-- ------------------------------------------------------------
DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public for the hook to resolve.';
    END IF;
    IF NOT has_schema_privilege('supabase_auth_admin', 'profile', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema profile.';
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
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.username.';
    END IF;
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.discord_bootstrap_cache.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'INSERT') THEN
        RAISE EXCEPTION 'service_role must hold INSERT on profile.discord_bootstrap_cache for the bootstrap edge fn.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Behavioural smoke checks (no auth.users writes — runs entirely
-- against the cache table + a synthetic user_id that has no rows
-- anywhere).
-- ------------------------------------------------------------
DO $$
DECLARE
    v_in      jsonb;
    v_out     jsonb;
    v_guilds  jsonb;
BEGIN
    -- Scenario 1: empty event / no user_id -> claims object preserved,
    -- privileged claims stripped, no exception.
    v_out := public.custom_access_token_hook(
        jsonb_build_object('claims', jsonb_build_object('role','authenticated'))
    );
    IF v_out->'claims'->>'role' <> 'authenticated' THEN
        RAISE EXCEPTION 'smoke 1: role claim lost in %', v_out;
    END IF;
    IF v_out->'claims' ? 'owned_guilds' THEN
        RAISE EXCEPTION 'smoke 1: invalid user_id must NOT emit owned_guilds, got %', v_out->'claims';
    END IF;

    -- Scenario 2: invalid user_id text -> same behaviour as scenario 1.
    v_out := public.custom_access_token_hook(
        jsonb_build_object(
            'user_id', 'not-a-uuid',
            'claims', jsonb_build_object('role','authenticated','owned_guilds',jsonb_build_array('attacker'))
        )
    );
    IF v_out->'claims' ? 'owned_guilds' THEN
        RAISE EXCEPTION 'smoke 2: malformed user_id must strip attacker-supplied owned_guilds, got %', v_out->'claims';
    END IF;

    -- Scenario 3: non-object claims -> rebuilt as object, hook still emits owned_guilds [].
    v_out := public.custom_access_token_hook(
        jsonb_build_object(
            'user_id', '00000000-0000-0000-0000-000000000000',
            'claims', '"not-an-object"'::jsonb
        )
    );
    IF jsonb_typeof(v_out->'claims') <> 'object' THEN
        RAISE EXCEPTION 'smoke 3: claims must be rebuilt as object, got % from %',
            jsonb_typeof(v_out->'claims'), v_out;
    END IF;
    IF jsonb_array_length(v_out->'claims'->'owned_guilds') <> 0 THEN
        RAISE EXCEPTION 'smoke 3: no cache row yet, owned_guilds must be empty, got %',
            v_out->'claims'->'owned_guilds';
    END IF;

    -- Scenario 4: valid user_id, no cache row -> owned_guilds [].
    v_in := jsonb_build_object(
        'user_id', '00000000-0000-0000-0000-000000000000',
        'claims',  jsonb_build_object('role','authenticated')
    );
    v_out := public.custom_access_token_hook(v_in);
    IF jsonb_typeof(v_out->'claims'->'owned_guilds') <> 'array' THEN
        RAISE EXCEPTION 'smoke 4: owned_guilds must be a jsonb array, got %',
            jsonb_typeof(v_out->'claims'->'owned_guilds');
    END IF;
    IF jsonb_array_length(v_out->'claims'->'owned_guilds') <> 0 THEN
        RAISE EXCEPTION 'smoke 4: no cache row, expected empty owned_guilds, got %',
            v_out->'claims'->'owned_guilds';
    END IF;

    -- Scenario 5: cache row with 3 valid + 1 malformed + 1 duplicate
    -- snowflake. Wrap in an EXCEPTION subtransaction with a sentinel
    -- rollback so the synthetic auth.users + cache rows are undone
    -- atomically. No writes to auth.identities involved.
    BEGIN
        INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-fffe00000001');
        INSERT INTO profile.discord_bootstrap_cache
            (user_id, discord_provider_id, owned_guilds)
        VALUES (
            '00000000-0000-0000-0000-fffe00000001',
            '999000111222333444',
            jsonb_build_array(
                '111111111111111111',
                '222222222222222222',
                '333333333333333333',
                '111111111111111111', -- duplicate
                'not-a-snowflake'
            )
        );

        v_out := public.custom_access_token_hook(jsonb_build_object(
            'user_id', '00000000-0000-0000-0000-fffe00000001',
            'claims',  jsonb_build_object('role','authenticated')
        ));
        v_guilds := v_out->'claims'->'owned_guilds';

        IF jsonb_array_length(v_guilds) <> 3 THEN
            RAISE EXCEPTION
                'smoke 5: expected 3 unique valid snowflakes (LIMIT-1 / dedup regression?), got % from %',
                jsonb_array_length(v_guilds), v_guilds;
        END IF;
        IF NOT (v_guilds @> '["111111111111111111","222222222222222222","333333333333333333"]'::jsonb) THEN
            RAISE EXCEPTION 'smoke 5: expected snowflakes missing from %', v_guilds;
        END IF;
        IF v_guilds @> '["not-a-snowflake"]'::jsonb THEN
            RAISE EXCEPTION 'smoke 5: malformed snowflake leaked into %', v_guilds;
        END IF;
        -- Determinism: first-seen order preserved.
        IF v_guilds->>0 <> '111111111111111111' THEN
            RAISE EXCEPTION 'smoke 5: first-seen order not preserved, got %', v_guilds;
        END IF;

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

-- Restore the v1 hook body (kbve_username only). Deliberately do NOT
-- drop the function — GoTrue is configured to call it; a missing
-- function would break all sign-in.
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

-- Drop the cache table last so the function above no longer references
-- it. ON DELETE CASCADE on user_id means the table goes away cleanly
-- without orphaning anything.
DROP TABLE IF EXISTS profile.discord_bootstrap_cache;

COMMIT;
