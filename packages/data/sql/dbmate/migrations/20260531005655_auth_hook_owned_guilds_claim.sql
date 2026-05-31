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
-- Source of truth is profile.discord_bootstrap_cache, populated by the
-- discord-bootstrap edge fn (P5.8b) which calls Discord once after
-- OAuth and upserts here with service_role.
--
-- The hook does NO external calls and never blocks. It reads one row
-- by PK, validates + dedupes guild IDs, applies a freshness window
-- (rejects rows older than 7 days OR more than 30 seconds in the
-- future), wraps in jsonb, and embeds as a JWT claim.
--
-- Storage uses text[] not jsonb (GPT round-4 #1) — Discord snowflakes
-- are flat strings; jsonb traversal in the JWT mint hot path was
-- overkill. Validator, hook CTE, and constraints all operate on
-- native arrays; only the final claim is wrapped in to_jsonb().
-- ============================================================

-- ------------------------------------------------------------
-- Validator function (text[] variant — GPT round-4 #1)
-- ------------------------------------------------------------
-- IMMUTABLE STRICT so it can sit in a CHECK constraint and the planner
-- can prove cache-safety. STRICT documents NULL-input intent (the
-- column is NOT NULL anyway).
--
-- CASE preserves the short-circuit safety we got in pass 3. text[]
-- removes the need for jsonb_typeof (the type system already
-- guarantees array shape).
CREATE OR REPLACE FUNCTION profile.discord_owned_guilds_are_valid(p_guilds text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT CASE
        WHEN array_length(p_guilds, 1) IS NULL THEN true
        WHEN array_length(p_guilds, 1) > 100 THEN false
        ELSE NOT EXISTS (
            SELECT 1
            FROM unnest(p_guilds) AS g
            WHERE g !~ '^[0-9]{17,20}$'
        )
    END;
$$;

COMMENT ON FUNCTION profile.discord_owned_guilds_are_valid(text[]) IS
    'IMMUTABLE shape validator for profile.discord_bootstrap_cache.owned_guilds. Accepts empty arrays as valid (array_length on empty returns NULL). Backs both a CHECK constraint and serves as the canonical write-path invariant.';

REVOKE EXECUTE ON FUNCTION profile.discord_owned_guilds_are_valid(text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.discord_owned_guilds_are_valid(text[])
    TO service_role, supabase_auth_admin;

-- ------------------------------------------------------------
-- Cache table (no IF NOT EXISTS; all constraints inline)
-- ------------------------------------------------------------
-- Changes from round 3 of the review fold-in:
--   GPT #1   owned_guilds is text[] (was jsonb)
--   GPT #4   discord_provider_id is UNIQUE (mirrors auth.identities'
--            (provider, provider_id) integrity)
--   GPT #9   refreshed_at floor CHECK against absurd historical
--            timestamps (combined with created_at/updated_at floor)
--   GPT #17  created_at + updated_at columns for row-lifecycle audit
--            (distinct from refreshed_at which tracks Discord-data
--            freshness)
CREATE TABLE profile.discord_bootstrap_cache (
    user_id              uuid PRIMARY KEY,
    discord_provider_id  text NOT NULL
                              CHECK (discord_provider_id ~ '^[0-9]{15,25}$'),
    owned_guilds         text[] NOT NULL DEFAULT ARRAY[]::text[],
    refreshed_at         timestamptz NOT NULL DEFAULT NOW(),
    created_at           timestamptz NOT NULL DEFAULT NOW(),
    updated_at           timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT discord_bootstrap_cache_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE,
    CONSTRAINT discord_bootstrap_cache_discord_provider_id_unique
        UNIQUE (discord_provider_id),
    CONSTRAINT discord_bootstrap_cache_owned_guilds_size_cap
        CHECK (
            array_length(owned_guilds, 1) IS NULL
            OR array_length(owned_guilds, 1) <= 100
        ),
    CONSTRAINT discord_bootstrap_cache_owned_guilds_valid
        CHECK (profile.discord_owned_guilds_are_valid(owned_guilds)),
    CONSTRAINT discord_bootstrap_cache_timestamps_floor
        CHECK (
            refreshed_at >= '2025-01-01'::timestamptz
            AND created_at >= '2025-01-01'::timestamptz
            AND updated_at >= '2025-01-01'::timestamptz
        )
);

COMMENT ON TABLE profile.discord_bootstrap_cache IS
    'Per-user Discord bootstrap cache. Populated by the discord-bootstrap edge fn after OAuth. Read by custom_access_token_hook at JWT mint to embed owned_guilds claim. service_role has CRUD; supabase_auth_admin has SELECT for the hook. refreshed_at tracks Discord-data freshness; created_at/updated_at track row lifecycle.';

REVOKE ALL ON TABLE profile.discord_bootstrap_cache
    FROM PUBLIC, anon, authenticated;

GRANT USAGE  ON SCHEMA profile                         TO supabase_auth_admin;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache TO supabase_auth_admin;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE profile.discord_bootstrap_cache
    TO service_role;

ALTER TABLE profile.discord_bootstrap_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON profile.discord_bootstrap_cache;
CREATE POLICY "service_role_full_access"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (
        profile.discord_owned_guilds_are_valid(owned_guilds)
        AND discord_provider_id ~ '^[0-9]{15,25}$'
    );

DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.discord_bootstrap_cache;
CREATE POLICY "supabase_auth_admin_select"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR SELECT
    TO supabase_auth_admin
    USING (true);

-- ------------------------------------------------------------
-- Hook v2
-- ------------------------------------------------------------
-- Round 4 changes folded in:
--   GPT #1   unnest(text[]) instead of jsonb_array_elements_text
--            in the src CTE; only the final claim is wrapped via
--            to_jsonb(array_agg(...)).
--   GPT #8   Future-timestamp tolerance tightened from 5 minutes
--            to 30 seconds. 5min was over-conservative for in-cluster
--            clock skew and gave an attacker a meaningful trust
--            extension window. 30s covers real Deno/Postgres skew.
--   GPT #11  v_now local timestamptz variable to make the freshness
--            window edits safer and avoid repeated function calls.
--   GPT #12  STABLE (was VOLATILE in round 2). Function reads but
--            never mutates → STABLE is the documented semantics for
--            read-only functions. Round 2 reviewer pushed VOLATILE on
--            pure safety; round 4 correctly flagged STABLE as
--            technically accurate. Flipping back.
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
    v_now          timestamptz := statement_timestamp();
BEGIN
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

    SELECT u.username
      INTO v_username
      FROM profile.username AS u
     WHERE u.user_id = v_user_id;

    IF v_username IS NOT NULL THEN
        v_claims := jsonb_set(v_claims, '{kbve_username}', to_jsonb(v_username), true);
    ELSE
        v_claims := v_claims - 'kbve_username';
    END IF;

    -- owned_guilds: PK lookup, freshness-gated, future-ts guarded.
    -- text[] removes the jsonb_typeof / jsonb_array_elements_text
    -- overhead; only the final claim is wrapped via to_jsonb.
    WITH src AS (
        SELECT c.owned_guilds AS arr
          FROM profile.discord_bootstrap_cache AS c
         WHERE c.user_id      = v_user_id
           AND c.refreshed_at <= v_now + interval '30 seconds'
           AND c.refreshed_at >= v_now - interval '7 days'
    ),
    valid AS (
        SELECT g, MIN(ord) AS ord
          FROM src,
               LATERAL unnest(src.arr) WITH ORDINALITY AS e(g, ord)
         WHERE g ~ '^[0-9]{17,20}$'
         GROUP BY g
         ORDER BY MIN(ord)
         LIMIT 50
    )
    SELECT COALESCE(to_jsonb(array_agg(g ORDER BY ord)), '[]'::jsonb)
      INTO v_owned_guilds
      FROM valid;

    -- Soft size cap on the final JWT claim. Should be unreachable in
    -- practice given the 50-element LIMIT (50 × 22 + 49 × 2 + 2 = 1200
    -- canonical bytes); 1600 leaves ~400 chars headroom.
    IF length(v_owned_guilds::text) > 1600 THEN
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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and profile.discord_bootstrap_cache.owned_guilds (text[] storage, cap 50, deterministic order, dedup, 7-day freshness + 30-second future-timestamp guard, soft 1600-char size cap) as owned_guilds JWT claim. No external calls — reads pre-cached state populated by the discord-bootstrap edge fn.';

-- ------------------------------------------------------------
-- Privilege + plumbing assertions
-- ------------------------------------------------------------
DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;
    PERFORM 'profile.discord_owned_guilds_are_valid(text[])'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public.';
    END IF;
    IF NOT has_schema_privilege('supabase_auth_admin', 'profile', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema profile.';
    END IF;
    IF NOT has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on public.custom_access_token_hook(jsonb).';
    END IF;
    IF NOT has_function_privilege('service_role', 'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must hold EXECUTE on profile.discord_owned_guilds_are_valid(text[]).';
    END IF;
    IF NOT has_function_privilege('supabase_auth_admin', 'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on profile.discord_owned_guilds_are_valid(text[]).';
    END IF;
    IF has_function_privilege('anon',          'public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated','public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('public',     'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'public.custom_access_token_hook(jsonb) must not be executable by anon/authenticated/public.';
    END IF;
    IF has_function_privilege('anon',          'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE')
       OR has_function_privilege('authenticated','profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'validator must not be executable by anon/authenticated.';
    END IF;
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.username', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.username.';
    END IF;
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.discord_bootstrap_cache.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'service_role must hold SELECT on profile.discord_bootstrap_cache for upsert ON CONFLICT visibility.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'INSERT') THEN
        RAISE EXCEPTION 'service_role must hold INSERT on profile.discord_bootstrap_cache for the bootstrap edge fn.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role must hold UPDATE on profile.discord_bootstrap_cache for upsert DO UPDATE.';
    END IF;
    IF has_table_privilege('anon', 'profile.discord_bootstrap_cache', 'SELECT')
       OR has_table_privilege('authenticated', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'anon/authenticated must NOT have SELECT on profile.discord_bootstrap_cache.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Behavioural smoke checks (SQL-only — no writes to auth.users)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_out  jsonb;
BEGIN
    -- 1: empty event / no user_id -> claims preserved, privileged
    -- claims absent.
    v_out := public.custom_access_token_hook(
        jsonb_build_object('claims', jsonb_build_object('role','authenticated'))
    );
    IF v_out->'claims'->>'role' <> 'authenticated' THEN
        RAISE EXCEPTION 'smoke 1: role claim lost in %', v_out;
    END IF;
    IF v_out->'claims' ? 'owned_guilds' THEN
        RAISE EXCEPTION 'smoke 1: invalid user_id must NOT emit owned_guilds, got %', v_out->'claims';
    END IF;

    -- 2: malformed user_id with attacker-supplied owned_guilds claim
    -- -> claim stripped.
    v_out := public.custom_access_token_hook(
        jsonb_build_object(
            'user_id', 'not-a-uuid',
            'claims', jsonb_build_object(
                'role','authenticated',
                'owned_guilds', jsonb_build_array('attacker')
            )
        )
    );
    IF v_out->'claims' ? 'owned_guilds' THEN
        RAISE EXCEPTION 'smoke 2: malformed user_id must strip attacker-supplied owned_guilds, got %', v_out->'claims';
    END IF;

    -- 3: non-object claims -> rebuilt as object, hook still emits
    -- owned_guilds [].
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

    -- 4: valid user_id, no cache row -> owned_guilds [].
    v_out := public.custom_access_token_hook(
        jsonb_build_object(
            'user_id', '00000000-0000-0000-0000-000000000000',
            'claims',  jsonb_build_object('role','authenticated')
        )
    );
    IF jsonb_typeof(v_out->'claims'->'owned_guilds') <> 'array' THEN
        RAISE EXCEPTION 'smoke 4: owned_guilds must be a jsonb array, got %',
            jsonb_typeof(v_out->'claims'->'owned_guilds');
    END IF;
    IF jsonb_array_length(v_out->'claims'->'owned_guilds') <> 0 THEN
        RAISE EXCEPTION 'smoke 4: no cache row, expected empty owned_guilds, got %',
            v_out->'claims'->'owned_guilds';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Validator smoke (text[] variant)
-- ------------------------------------------------------------
DO $$
BEGIN
    -- STRICT: SQL NULL input returns NULL.
    IF profile.discord_owned_guilds_are_valid(NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'validator: STRICT must return NULL for NULL input';
    END IF;
    -- Empty array is valid (array_length on empty returns NULL).
    IF NOT profile.discord_owned_guilds_are_valid(ARRAY[]::text[]) THEN
        RAISE EXCEPTION 'validator: rejected empty array';
    END IF;
    -- Valid 2-snowflake array.
    IF NOT profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111','222222222222222222']) THEN
        RAISE EXCEPTION 'validator: rejected valid 2-snowflake array';
    END IF;
    -- Malformed element.
    IF profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111','garbage']) THEN
        RAISE EXCEPTION 'validator: accepted malformed element';
    END IF;
    -- Too-short snowflake.
    IF profile.discord_owned_guilds_are_valid(ARRAY['123']) THEN
        RAISE EXCEPTION 'validator: accepted too-short snowflake';
    END IF;
    -- Too-long snowflake (21 digits).
    IF profile.discord_owned_guilds_are_valid(ARRAY['123456789012345678901']) THEN
        RAISE EXCEPTION 'validator: accepted too-long snowflake';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- migrate:down transaction:false

-- transaction:false: matches the up section.

BEGIN;

-- Restore the v1 hook body. Preserves the hardening from v2:
--   - Object typecheck of event->'claims' before jsonb_set
--   - Invalid / missing user_id strips kbve_username from inbound
--     claims before returning
--   - Explicitly strips owned_guilds from inbound claims so a
--     rollback during a sign-in flow can't leak v2 state into a v1
--     JWT
--
-- v1's owned_guilds production logic itself is removed (this is the
-- whole point of the down migration); only the security posture is
-- carried forward.
--
-- Function is REPLACE'd, not DROPPED — GoTrue is configured to call
-- it and a missing function would break all sign-in.
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
    v_claims :=
        CASE
            WHEN jsonb_typeof(event->'claims') = 'object'
                THEN event->'claims'
            ELSE '{}'::jsonb
        END;

    v_claims := v_claims - 'owned_guilds';

    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_set(event, '{claims}', v_claims - 'kbve_username', true);
    END;

    IF v_user_id IS NULL THEN
        RETURN jsonb_set(event, '{claims}', v_claims - 'kbve_username', true);
    END IF;

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

-- DROP TABLE cascades policies. Validator goes last. text[] overload
-- is dropped explicitly since v1 didn't define any version.
DROP TABLE     IF EXISTS profile.discord_bootstrap_cache;
DROP FUNCTION  IF EXISTS profile.discord_owned_guilds_are_valid(text[]);

COMMIT;
