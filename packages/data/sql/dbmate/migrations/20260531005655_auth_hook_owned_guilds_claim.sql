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
-- Storage uses text[] (round 4) so the JWT-mint hot path avoids jsonb
-- traversal. The write path goes through a single service RPC
-- (profile.service_upsert_discord_bootstrap_cache) — service_role does
-- NOT have direct INSERT/UPDATE/DELETE on the cache table. The RPC
-- centralises:
--   - input validation (snowflake regex, NULL-element filter)
--   - canonicalisation (dedup + first-seen ordering + cap 100)
--   - account relinking (DELETE old row if discord_provider_id moves
--     between user_ids)
--   - future-timestamp rejection
--   - updated_at maintenance
--
-- The hook itself does NO external calls and never blocks. It reads
-- one row by PK, slices to 50, applies a defensive NULL+regex filter
-- (belt+suspender even though storage is canonical), wraps in jsonb,
-- and embeds as a JWT claim.
-- ============================================================

-- ------------------------------------------------------------
-- Validator function (text[] variant — fixes round-5 #5 NULL bypass)
-- ------------------------------------------------------------
-- Round 5 #4: single COALESCE(array_length, 0) instead of two
-- array_length calls.
-- Round 5 #5: explicit NULL-element check. Without `g IS NULL OR`,
-- `g !~ '...'` returns NULL for NULL inputs and NOT EXISTS never
-- sees the bad row → ARRAY['valid', NULL] would pass validation.
CREATE OR REPLACE FUNCTION profile.discord_owned_guilds_are_valid(p_guilds text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT CASE
        WHEN COALESCE(array_length(p_guilds, 1), 0) > 100 THEN false
        ELSE NOT EXISTS (
            SELECT 1
            FROM unnest(p_guilds) AS g
            WHERE g IS NULL OR g !~ '^[0-9]{17,20}$'
        )
    END;
$$;

COMMENT ON FUNCTION profile.discord_owned_guilds_are_valid(text[]) IS
    'IMMUTABLE shape validator for profile.discord_bootstrap_cache.owned_guilds. Rejects NULL elements, non-snowflake strings (regex ^[0-9]{17,20}$), and arrays larger than 100 elements. Empty arrays are valid.';

REVOKE EXECUTE ON FUNCTION profile.discord_owned_guilds_are_valid(text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.discord_owned_guilds_are_valid(text[])
    TO service_role, supabase_auth_admin;

-- ------------------------------------------------------------
-- Cache table
-- ------------------------------------------------------------
-- Round 5 #9: updated_at >= created_at ordering invariant folded
-- into the timestamps_floor CHECK (now timestamps_ordering_and_floor).
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
    CONSTRAINT discord_bootstrap_cache_timestamps_ordering_and_floor
        CHECK (
            updated_at >= created_at
            AND refreshed_at >= '2025-01-01'::timestamptz
            AND created_at  >= '2025-01-01'::timestamptz
            AND updated_at  >= '2025-01-01'::timestamptz
        )
);

COMMENT ON TABLE profile.discord_bootstrap_cache IS
    'Per-user Discord bootstrap cache. Populated exclusively via profile.service_upsert_discord_bootstrap_cache RPC. Read by custom_access_token_hook at JWT mint to embed owned_guilds claim. service_role has SELECT only; INSERT/UPDATE/DELETE flow through the RPC for centralised validation + canonicalisation. supabase_auth_admin has SELECT for the hook.';

REVOKE ALL ON TABLE profile.discord_bootstrap_cache
    FROM PUBLIC, anon, authenticated;

GRANT USAGE  ON SCHEMA profile                         TO supabase_auth_admin;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache TO supabase_auth_admin;
-- Round 5 #2: service_role keeps SELECT (dashboard freshness peeks +
-- ON CONFLICT visibility for the RPC's INSERT), but loses
-- INSERT/UPDATE/DELETE. All writes go through the RPC.
GRANT SELECT ON TABLE profile.discord_bootstrap_cache TO service_role;

ALTER TABLE profile.discord_bootstrap_cache ENABLE ROW LEVEL SECURITY;

-- Round 5 #3: WITH CHECK simplified to true. The RPC validates
-- inputs explicitly and the table CHECK constraints remain
-- authoritative — RLS WITH CHECK was paying duplicate validation
-- cost for a code path service_role no longer takes directly.
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

-- ------------------------------------------------------------
-- Service-role RPC: the only write path for the cache
-- ------------------------------------------------------------
-- Centralised write surface that handles validation, dedup +
-- canonical ordering, account relinking, future-timestamp guard, and
-- updated_at maintenance. SECURITY DEFINER + owned by the migrating
-- role (effectively superuser) so it can bypass the absent direct
-- INSERT grant for service_role.
--
-- Folds in round-5 #1, #2, #7, #10, #12.
CREATE OR REPLACE FUNCTION profile.service_upsert_discord_bootstrap_cache(
    p_user_id              uuid,
    p_discord_provider_id  text,
    p_owned_guilds         text[]      DEFAULT ARRAY[]::text[],
    p_refreshed_at         timestamptz DEFAULT statement_timestamp()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_canonical text[];
    v_now       timestamptz := statement_timestamp();
BEGIN
    -- Belt 1: input shape validation. Cleaner errors than letting the
    -- table constraints fail later.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'service_upsert_discord_bootstrap_cache: user_id required';
    END IF;
    IF p_discord_provider_id IS NULL OR p_discord_provider_id !~ '^[0-9]{15,25}$' THEN
        RAISE EXCEPTION 'service_upsert_discord_bootstrap_cache: invalid discord_provider_id';
    END IF;

    -- Round 5 #10: reject future-dated writes >30s before they hit
    -- storage. Table CHECK can't express now()+30s (not IMMUTABLE),
    -- so it has to be enforced here.
    IF p_refreshed_at > v_now + interval '30 seconds' THEN
        RAISE EXCEPTION
            'service_upsert_discord_bootstrap_cache: p_refreshed_at too far in future (got %, max %)',
            p_refreshed_at, v_now + interval '30 seconds';
    END IF;
    IF p_refreshed_at < '2025-01-01'::timestamptz THEN
        RAISE EXCEPTION
            'service_upsert_discord_bootstrap_cache: p_refreshed_at below floor (got %, min 2025-01-01)',
            p_refreshed_at;
    END IF;

    -- Round 5 #7: canonicalise. NULL + non-snowflake elements are
    -- filtered; duplicates collapsed by first-seen order; capped at
    -- 100 to match the table CHECK.
    SELECT COALESCE(array_agg(g ORDER BY ord), ARRAY[]::text[])
      INTO v_canonical
      FROM (
          SELECT g, MIN(ord) AS ord
            FROM unnest(COALESCE(p_owned_guilds, ARRAY[]::text[]))
                 WITH ORDINALITY AS e(g, ord)
           WHERE g IS NOT NULL
             AND g ~ '^[0-9]{17,20}$'
           GROUP BY g
           ORDER BY MIN(ord)
           LIMIT 100
      ) AS s;

    -- Round 5 #12: account relinking. If the same Discord provider
    -- id is cached under a different user_id (rare, but possible
    -- when a user re-OAuths under a fresh Supabase identity), drop
    -- the stale row first so the upsert below succeeds against the
    -- discord_provider_id UNIQUE constraint instead of raising a
    -- raw unique_violation to the caller.
    DELETE FROM profile.discord_bootstrap_cache
     WHERE discord_provider_id = p_discord_provider_id
       AND user_id <> p_user_id;

    INSERT INTO profile.discord_bootstrap_cache AS c
        (user_id, discord_provider_id, owned_guilds, refreshed_at, created_at, updated_at)
    VALUES
        (p_user_id, p_discord_provider_id, v_canonical, p_refreshed_at, v_now, v_now)
    ON CONFLICT (user_id) DO UPDATE
       SET discord_provider_id = EXCLUDED.discord_provider_id,
           owned_guilds        = EXCLUDED.owned_guilds,
           refreshed_at        = EXCLUDED.refreshed_at,
           updated_at          = v_now;
END;
$$;

COMMENT ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz) IS
    'Service-role upsert for profile.discord_bootstrap_cache. Validates inputs, canonicalises owned_guilds (dedup + first-seen order + cap 100), enforces future-timestamp guard, handles account relinking, maintains updated_at. The only sanctioned write path — service_role has no direct INSERT/UPDATE/DELETE on the table.';

REVOKE EXECUTE ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz)
    TO service_role;

-- ------------------------------------------------------------
-- Hook v2 (slimmed — round 5 #6, #8)
-- ------------------------------------------------------------
-- Slices to 50 (storage is canonical via the RPC, so no GROUP BY
-- needed) but keeps a defensive NULL + snowflake regex filter as
-- belt+suspender. JWT mint is a security boundary — even if the
-- RPC develops a bug or a superuser does manual DML, the hook
-- still emits only well-formed snowflakes.
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

    WITH src AS (
        SELECT c.owned_guilds AS arr
          FROM profile.discord_bootstrap_cache AS c
         WHERE c.user_id      = v_user_id
           AND c.refreshed_at <= v_now + interval '30 seconds'
           AND c.refreshed_at >= v_now - interval '7 days'
    ),
    guarded AS (
        SELECT g, ord
          FROM src,
               LATERAL unnest(src.arr) WITH ORDINALITY AS e(g, ord)
         WHERE g IS NOT NULL
           AND g ~ '^[0-9]{17,20}$'
         ORDER BY ord
         LIMIT 50
    )
    SELECT COALESCE(to_jsonb(array_agg(g ORDER BY ord)), '[]'::jsonb)
      INTO v_owned_guilds
      FROM guarded;

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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and profile.discord_bootstrap_cache.owned_guilds (canonical text[] storage, slice 50 + defensive NULL/regex filter, 7-day freshness + 30-second future-timestamp guard, soft 1600-char size cap) as owned_guilds JWT claim. No external calls.';

-- ------------------------------------------------------------
-- Privilege + plumbing assertions
-- ------------------------------------------------------------
DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;
    PERFORM 'profile.discord_owned_guilds_are_valid(text[])'::regprocedure;
    PERFORM 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)'::regprocedure;

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
    IF NOT has_function_privilege('service_role', 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must hold EXECUTE on profile.service_upsert_discord_bootstrap_cache for bootstrap writes.';
    END IF;
    IF has_function_privilege('anon', 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_upsert RPC must not be executable by anon/authenticated.';
    END IF;
    IF has_function_privilege('anon',          'public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated','public.custom_access_token_hook(jsonb)', 'EXECUTE')
       OR has_function_privilege('public',     'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'public.custom_access_token_hook(jsonb) must not be executable by anon/authenticated/public.';
    END IF;
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.discord_bootstrap_cache.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'service_role must hold SELECT on profile.discord_bootstrap_cache (dashboard peek + ON CONFLICT visibility).';
    END IF;
    -- Round 5 #2 negative assertions: direct write privileges
    -- intentionally NOT granted. Writes go through the RPC.
    IF has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'INSERT') THEN
        RAISE EXCEPTION 'service_role must NOT have direct INSERT on profile.discord_bootstrap_cache; use service_upsert RPC.';
    END IF;
    IF has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role must NOT have direct UPDATE on profile.discord_bootstrap_cache; use service_upsert RPC.';
    END IF;
    IF has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'DELETE') THEN
        RAISE EXCEPTION 'service_role must NOT have direct DELETE on profile.discord_bootstrap_cache.';
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
-- Validator smoke (with explicit NULL-element regression guard)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF profile.discord_owned_guilds_are_valid(NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'validator: STRICT must return NULL for NULL input';
    END IF;
    IF NOT profile.discord_owned_guilds_are_valid(ARRAY[]::text[]) THEN
        RAISE EXCEPTION 'validator: rejected empty array';
    END IF;
    IF NOT profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111','222222222222222222']) THEN
        RAISE EXCEPTION 'validator: rejected valid 2-snowflake array';
    END IF;
    IF profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111','garbage']) THEN
        RAISE EXCEPTION 'validator: accepted malformed element';
    END IF;
    IF profile.discord_owned_guilds_are_valid(ARRAY['123']) THEN
        RAISE EXCEPTION 'validator: accepted too-short snowflake';
    END IF;
    IF profile.discord_owned_guilds_are_valid(ARRAY['123456789012345678901']) THEN
        RAISE EXCEPTION 'validator: accepted too-long snowflake';
    END IF;
    -- Round 5 #5 regression guard.
    IF profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111', NULL]::text[]) THEN
        RAISE EXCEPTION 'validator: accepted NULL element (round 5 #5 regression)';
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

-- Round 5 #13: explicit drops for new objects this migration added.
-- Order: RPC first (no deps), then table (cascades policies), then
-- validator overload.
DROP FUNCTION  IF EXISTS profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz);
DROP TABLE     IF EXISTS profile.discord_bootstrap_cache;
DROP FUNCTION  IF EXISTS profile.discord_owned_guilds_are_valid(text[]);

COMMIT;
