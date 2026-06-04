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
-- v2 adds a second claim: owned_guilds — Discord guild snowflakes the
-- user owns. The dashboard reads it from the JWT and skips the live
-- Discord /users/@me/guilds call that currently blanks the agents page
-- with "Discord session expired" whenever the cached provider_token
-- ages out.
--
-- Architecture (after 6 review rounds on PR #11488)
--   1. profile.discord_bootstrap_cache — text[] storage, capped at 50
--      (matches the JWT mint cap; anything more is dead weight)
--   2. profile.discord_owned_guilds_are_valid(text[]) — IMMUTABLE
--      shape validator (rejects NULLs, non-snowflakes, oversized)
--   3. profile.service_upsert_discord_bootstrap_cache(...) — the
--      ONLY sanctioned write path. Service_role has no direct
--      INSERT/UPDATE/DELETE on the cache. The RPC centralises:
--        - Input validation with clean error messages
--        - Canonicalisation (dedup + first-seen + NULL/regex filter
--          + cap 50)
--        - Future-timestamp rejection >30s
--        - Account relinking (DELETE old row with same provider_id)
--        - Advisory locking on (user_id, provider_id) to serialise
--          concurrent OAuth refreshes
--        - updated_at maintenance
--      Owner pinned to postgres explicitly so SECURITY DEFINER
--      behaviour is stable across local/CI/prod environments.
--   4. profile.get_discord_owned_guilds_claim(uuid, timestamptz) —
--      SQL helper that fetches the claim. STABLE + COST 20 so the
--      planner can inline + cost-estimate around the call. Hook
--      delegates here instead of carrying a CTE.
--   5. public.custom_access_token_hook(jsonb) — slim PL/pgSQL hook,
--      defers guild lookup to the helper, applies the JWT claim.
--
-- The hook does NO external calls and never blocks. The helper does
-- one PK lookup, freshness check, defensive NULL+regex filter,
-- jsonb_agg. No external work.
-- ============================================================

-- ------------------------------------------------------------
-- Validator (text[] variant; round 5 #5 NULL bypass fix preserved)
-- ------------------------------------------------------------
-- Round 6 #6: validator EXECUTE revoked from service_role +
-- supabase_auth_admin. CHECK constraints run as table owner
-- regardless of caller, so direct EXECUTE rights aren't needed.
-- Round 6 #14: cardinality() instead of COALESCE(array_length).
CREATE OR REPLACE FUNCTION profile.discord_owned_guilds_are_valid(p_guilds text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT CASE
        WHEN cardinality(p_guilds) > 50 THEN false
        ELSE NOT EXISTS (
            SELECT 1
            FROM unnest(p_guilds) AS g
            WHERE g IS NULL OR g !~ '^[0-9]{17,20}$'
        )
    END;
$$;

COMMENT ON FUNCTION profile.discord_owned_guilds_are_valid(text[]) IS
    'IMMUTABLE shape validator for profile.discord_bootstrap_cache.owned_guilds. Rejects NULL elements, non-snowflake strings, and arrays > 50. Empty arrays valid. Called from a table CHECK; no direct EXECUTE grants needed.';

REVOKE EXECUTE ON FUNCTION profile.discord_owned_guilds_are_valid(text[])
    FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

-- ------------------------------------------------------------
-- Cache table
-- ------------------------------------------------------------
-- Round 6 #14: cardinality() in CHECK.
-- Round 6 #15: cap 100 -> 50. JWT-bound, more is dead weight.
CREATE TABLE profile.discord_bootstrap_cache (
    user_id              uuid PRIMARY KEY,
    discord_provider_id  text NOT NULL
                              CHECK (discord_provider_id ~ '^[0-9]{17,20}$'),
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
        CHECK (cardinality(owned_guilds) <= 50),
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
    'Per-user Discord bootstrap cache. Populated exclusively via profile.service_upsert_discord_bootstrap_cache RPC; service_role has SELECT only (no direct INSERT/UPDATE/DELETE) so all writes are funnelled through the RPC for centralised validation, canonicalisation, advisory-lock serialisation, and account-relink handling. SELECT is granted to service_role specifically for dashboard freshness peeks; the RPC''s ON CONFLICT path is satisfied by the SECURITY DEFINER owner (postgres) and does not require caller SELECT. supabase_auth_admin has SELECT for custom_access_token_hook at JWT mint.';

REVOKE ALL ON TABLE profile.discord_bootstrap_cache
    FROM PUBLIC, anon, authenticated;

GRANT USAGE  ON SCHEMA profile                         TO supabase_auth_admin;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache TO supabase_auth_admin;
-- Round 8 #4: corrected justification. The RPC runs SECURITY
-- DEFINER as postgres, so ON CONFLICT visibility is satisfied by
-- the RPC owner's privileges — service_role SELECT is NOT needed
-- for the upsert path. The real reason service_role keeps SELECT
-- is dashboard freshness peeks (e.g. P5.8c surfacing "last
-- refreshed N minutes ago" without going through another RPC
-- layer). Writes still flow only through the SECURITY DEFINER RPC.
GRANT SELECT ON TABLE profile.discord_bootstrap_cache TO service_role;

ALTER TABLE profile.discord_bootstrap_cache ENABLE ROW LEVEL SECURITY;

-- Round 6 #7: policy is SELECT-only (was FOR ALL). Matches actual
-- grants and prevents future privilege drift where someone re-adds
-- UPDATE and a stale FOR ALL policy silently permits it.
DROP POLICY IF EXISTS "service_role_full_access" ON profile.discord_bootstrap_cache;
DROP POLICY IF EXISTS "service_role_select"      ON profile.discord_bootstrap_cache;
CREATE POLICY "service_role_select"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR SELECT
    TO service_role
    USING (true);

DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.discord_bootstrap_cache;
CREATE POLICY "supabase_auth_admin_select"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR SELECT
    TO supabase_auth_admin
    USING (true);

-- ------------------------------------------------------------
-- Service-role write RPC (the only sanctioned write surface)
-- ------------------------------------------------------------
-- Round 6 #4 + #5: advisory locks on (user_id, provider_id) in
-- fixed order to serialise concurrent OAuth refreshes for the same
-- account and avoid races between DELETE (relinking) and INSERT
-- (upsert). Lock order is invariant (user_id first, then
-- provider_id) so any caller doing both takes them in the same
-- sequence -> no deadlocks.
--
-- Round 6 #9: owner pinned to postgres explicitly so SECURITY
-- DEFINER behaviour is stable across env/migrating-role variance.
--
-- Round 6 #10: error messages trimmed of function-name prefixes —
-- expected validation failures, not internal-state leaks.
--
-- Round 6 #11: explicit NULL handling for p_refreshed_at so a
-- caller passing NULL doesn't bypass the future/floor checks and
-- hit the table NOT NULL violation downstream.
CREATE OR REPLACE FUNCTION profile.service_upsert_discord_bootstrap_cache(
    p_user_id              uuid,
    p_discord_provider_id  text,
    p_owned_guilds         text[]      DEFAULT ARRAY[]::text[],
    p_refreshed_at         timestamptz DEFAULT NULL
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
    -- Round 7 #7: USING ERRCODE = '22023' (invalid_parameter_value)
    -- on all validation failures so service callers (axum-kbve etc.)
    -- can match on a stable SQLSTATE instead of message text.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id required' USING ERRCODE = '22023';
    END IF;
    IF p_discord_provider_id IS NULL OR p_discord_provider_id !~ '^[0-9]{17,20}$' THEN
        RAISE EXCEPTION 'invalid discord_provider_id' USING ERRCODE = '22023';
    END IF;

    IF p_refreshed_at IS NULL THEN
        p_refreshed_at := v_now;
    END IF;
    IF p_refreshed_at > v_now + interval '30 seconds' THEN
        RAISE EXCEPTION 'refreshed_at too far in future (got %, max %)',
            p_refreshed_at, v_now + interval '30 seconds'
            USING ERRCODE = '22023';
    END IF;
    IF p_refreshed_at < '2025-01-01'::timestamptz THEN
        RAISE EXCEPTION 'refreshed_at below floor (got %, min 2025-01-01)',
            p_refreshed_at
            USING ERRCODE = '22023';
    END IF;

    -- Round 7 #4: single coarse advisory lock for the entire relink
    -- namespace. The previous per-key locks on (user_id, provider_id)
    -- closed the same-account race but left a rare cross-swap race
    -- open: concurrent calls A→Y / B→X each locked their own keys
    -- but neither held the other side's lock before DELETE'ing the
    -- target provider row. A single namespace lock serialises ALL
    -- relinks. This is acceptable because the RPC runs at OAuth /
    -- session-refresh rates, not per-request application traffic.
    -- If write volume grows enough that this serialisation point
    -- shows up in metrics, the alternative is deterministic row-
    -- level locking across affected rows:
    --   SELECT 1 FROM profile.discord_bootstrap_cache
    --   WHERE user_id = p_user_id
    --      OR discord_provider_id = p_discord_provider_id
    --   ORDER BY user_id
    --   FOR UPDATE;
    -- Row locks alone don't cover the "row does not yet exist" case
    -- that the advisory lock handles, so the migration would need
    -- to combine both — keep the simple coarse lock until metrics
    -- justify the complexity.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('profile.discord_bootstrap_cache.relink', 0)
    );

    -- Canonicalise: NULL + non-snowflake elements filtered; duplicates
    -- collapsed by first-seen order; capped at 50 (matches table CHECK
    -- and JWT mint cap).
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
           LIMIT 50
      ) AS s;

    -- Account relinking: drop stale row carrying same provider_id
    -- under a different user_id so the upsert below can succeed
    -- against the discord_provider_id UNIQUE constraint without
    -- raising a raw unique_violation.
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

ALTER FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz)
    OWNER TO postgres;

COMMENT ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz) IS
    'Service-role upsert for profile.discord_bootstrap_cache. Validates inputs (raises SQLSTATE 22023 on invalid params), canonicalises owned_guilds (dedup + first-seen + cap 50), enforces future-timestamp guard + 2025 floor, handles account relinking, takes a single coarse advisory lock on the relink namespace to serialise concurrent writes (closes cross-swap race), maintains updated_at. Owner pinned to postgres for stable SECURITY DEFINER behaviour. Only sanctioned write path — service_role has no direct INSERT/UPDATE/DELETE on the cache.';

REVOKE EXECUTE ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz)
    TO service_role;

-- ------------------------------------------------------------
-- SQL helper: guild claim lookup (round 6 #1, #18)
-- ------------------------------------------------------------
-- Extracted out of the hook so Postgres can inline + cost-estimate
-- the call. STABLE + COST 20. INVOKER (default) — when called from
-- the hook (SECURITY DEFINER owned by supabase_auth_admin), the
-- helper runs as supabase_auth_admin, which has SELECT on the cache.
--
-- Storage is canonical via the RPC, so dedup + GROUP BY aren't
-- needed here. The defensive NULL + regex filter stays because
-- JWT mint is a security boundary — even if the RPC develops a bug
-- or a superuser does manual DML, the hook still emits only
-- well-formed snowflakes.
CREATE OR REPLACE FUNCTION profile.get_discord_owned_guilds_claim(
    p_user_id uuid,
    p_now     timestamptz DEFAULT statement_timestamp()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
COST 20
AS $$
    SELECT COALESCE(to_jsonb(array_agg(g ORDER BY ord)), '[]'::jsonb)
      FROM (
          SELECT g, ord
            FROM profile.discord_bootstrap_cache AS c,
                 LATERAL unnest(c.owned_guilds) WITH ORDINALITY AS e(g, ord)
           WHERE c.user_id      = p_user_id
             AND c.refreshed_at <= p_now + interval '30 seconds'
             AND c.refreshed_at >= p_now - interval '7 days'
             AND g IS NOT NULL
             AND g ~ '^[0-9]{17,20}$'
           ORDER BY ord
           LIMIT 50
      ) AS s;
$$;

COMMENT ON FUNCTION profile.get_discord_owned_guilds_claim(uuid, timestamptz) IS
    'Returns the owned_guilds JWT claim for a user as a jsonb array (max 50 snowflakes, first-seen order, NULL + non-snowflake elements filtered). Reads profile.discord_bootstrap_cache; applies 7-day freshness window + 30-second future-timestamp guard. STABLE + COST 20 so the planner can inline / cost-estimate when called from custom_access_token_hook.';

REVOKE EXECUTE ON FUNCTION profile.get_discord_owned_guilds_claim(uuid, timestamptz)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.get_discord_owned_guilds_claim(uuid, timestamptz)
    TO supabase_auth_admin;

-- ------------------------------------------------------------
-- Hook v2 (slimmed — round 6 #1 delegates guild lookup to helper)
-- ------------------------------------------------------------
-- Round 6 #3 + #15: storage cap 50 makes the runtime length check
-- unreachable; dropped from hook.
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
    -- Round 7 #3: defensive top-level guard. GoTrue always passes an
    -- object, but jsonb_set on NULL / scalar input misbehaves, so
    -- coerce malformed payloads to {} before any work. Catches
    -- manual-invocation footguns + future GoTrue-payload changes.
    IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
        event := '{}'::jsonb;
    END IF;

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

    -- Round 7 #2: explicit strip before set, matching the invalid-
    -- user branches above. Visually documents that any inbound
    -- caller-supplied owned_guilds claim is never trusted —
    -- jsonb_set would overwrite anyway, but the explicit strip
    -- makes the security boundary obvious.
    v_claims := v_claims - 'owned_guilds';
    v_owned_guilds := profile.get_discord_owned_guilds_claim(v_user_id, v_now);
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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and delegates owned_guilds lookup to profile.get_discord_owned_guilds_claim. No external calls. Slim PL/pgSQL orchestration; guild work happens in the SQL helper for planner inlining.';

-- ------------------------------------------------------------
-- Privilege + plumbing assertions
-- ------------------------------------------------------------
DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;
    PERFORM 'profile.discord_owned_guilds_are_valid(text[])'::regprocedure;
    PERFORM 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)'::regprocedure;
    PERFORM 'profile.get_discord_owned_guilds_claim(uuid,timestamptz)'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public.';
    END IF;
    IF NOT has_schema_privilege('supabase_auth_admin', 'profile', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema profile.';
    END IF;
    IF NOT has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on public.custom_access_token_hook(jsonb).';
    END IF;
    IF NOT has_function_privilege('supabase_auth_admin', 'profile.get_discord_owned_guilds_claim(uuid,timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold EXECUTE on profile.get_discord_owned_guilds_claim for the hook to delegate.';
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
    -- Round 6 #6: validator EXECUTE intentionally revoked from
    -- everyone. CHECK constraint runs the function as table owner.
    IF has_function_privilege('service_role',       'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE')
       OR has_function_privilege('supabase_auth_admin', 'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE')
       OR has_function_privilege('anon',            'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE')
       OR has_function_privilege('authenticated',   'profile.discord_owned_guilds_are_valid(text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'validator EXECUTE must be revoked from all roles; CHECK constraint runs it under table owner.';
    END IF;
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.discord_bootstrap_cache.';
    END IF;
    -- Round 7 #1: assert the v1 grant survives. profile.username
    -- SELECT was granted by 20260510210000; this assertion catches
    -- future privilege drift that would silently break the
    -- kbve_username arm of the hook.
    IF NOT has_table_privilege('supabase_auth_admin', 'profile.username', 'SELECT') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold SELECT on profile.username for custom_access_token_hook.';
    END IF;
    IF NOT has_table_privilege('service_role', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'service_role must hold SELECT on profile.discord_bootstrap_cache for dashboard freshness peeks.';
    END IF;
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
    -- Round 6 #9: RPC owner must be postgres for stable
    -- SECURITY DEFINER behaviour.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'profile.service_upsert_discord_bootstrap_cache(uuid,text,text[],timestamptz)'::regprocedure
          AND r.rolname = 'postgres'
    ) THEN
        RAISE EXCEPTION 'profile.service_upsert_discord_bootstrap_cache must be owned by postgres.';
    END IF;
    -- Round 8 #6: hook owner must be supabase_auth_admin. The SQL
    -- helper get_discord_owned_guilds_claim is INVOKER and relies on
    -- being called under the hook's SECURITY DEFINER owner — if the
    -- hook owner drifts, the helper would run as a different role
    -- without SELECT on the cache and silently emit empty claims.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.oid = 'public.custom_access_token_hook(jsonb)'::regprocedure
          AND r.rolname = 'supabase_auth_admin'
    ) THEN
        RAISE EXCEPTION 'public.custom_access_token_hook must be owned by supabase_auth_admin.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Hook behavioural smoke checks (SQL-only — no writes to auth.users)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_out  jsonb;
BEGIN
    v_out := public.custom_access_token_hook(
        jsonb_build_object('claims', jsonb_build_object('role','authenticated'))
    );
    IF v_out->'claims'->>'role' <> 'authenticated' THEN
        RAISE EXCEPTION 'smoke 1: role claim lost in %', v_out;
    END IF;
    IF v_out->'claims' ? 'owned_guilds' THEN
        RAISE EXCEPTION 'smoke 1: invalid user_id must NOT emit owned_guilds, got %', v_out->'claims';
    END IF;

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

    -- Round 8 #5: scalar-event regression guard for the round-7
    -- top-level event-object guard. A NULL or scalar event must
    -- coerce to {} and emit an object-shaped response.
    v_out := public.custom_access_token_hook('"not-an-object"'::jsonb);
    IF jsonb_typeof(v_out) <> 'object' THEN
        RAISE EXCEPTION 'smoke 5: scalar event must coerce to object, got %', v_out;
    END IF;
    IF jsonb_typeof(v_out->'claims') <> 'object' THEN
        RAISE EXCEPTION 'smoke 5: claims must be object after scalar coerce, got %', v_out;
    END IF;

    v_out := public.custom_access_token_hook(NULL);
    IF jsonb_typeof(v_out) <> 'object' THEN
        RAISE EXCEPTION 'smoke 6: NULL event must coerce to object, got %', v_out;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Validator smoke (NULL-element regression guard preserved)
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
    IF profile.discord_owned_guilds_are_valid(ARRAY['111111111111111111', NULL]::text[]) THEN
        RAISE EXCEPTION 'validator: accepted NULL element (round 5 #5 regression)';
    END IF;
    -- Round 6 #15: 51-element array exceeds new cap.
    IF profile.discord_owned_guilds_are_valid(
        ARRAY(
            SELECT LPAD(i::text, 18, '1')
            FROM generate_series(1, 51) AS gs(i)
        )::text[]
    ) THEN
        RAISE EXCEPTION 'validator: accepted 51-element array (cap is 50)';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- migrate:down transaction:false

BEGIN;

-- Restore the v1 hook body. Preserves hardening from v2:
--   - Object typecheck of event->'claims' before jsonb_set
--   - Invalid / missing user_id strips kbve_username from inbound
--     claims before returning
--   - Explicitly strips owned_guilds from inbound claims so a
--     rollback during a sign-in flow can't leak v2 state into a v1
--     JWT
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
    -- Round 8 #1: top-level event guard mirrors v2 hardening so the
    -- restored v1 hook doesn't regress against malformed/manual
    -- invocations after rollback.
    IF event IS NULL OR jsonb_typeof(event) <> 'object' THEN
        event := '{}'::jsonb;
    END IF;

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

-- Drop in dependency order: helper (called by nothing in down), RPC
-- (writes to table), table (cascades policies), validator.
DROP FUNCTION  IF EXISTS profile.get_discord_owned_guilds_claim(uuid, timestamptz);
DROP FUNCTION  IF EXISTS profile.service_upsert_discord_bootstrap_cache(uuid, text, text[], timestamptz);
DROP TABLE     IF EXISTS profile.discord_bootstrap_cache;
DROP FUNCTION  IF EXISTS profile.discord_owned_guilds_are_valid(text[]);

-- Round 7 #6: intentionally do NOT revoke USAGE on schema profile
-- from supabase_auth_admin here. That grant was first established by
-- 20260510210000 (v1 hook reads profile.username) and is required
-- for the restored v1 hook to keep functioning after rollback.
-- Revoking would break sign-in on every account that has a
-- profile.username row.

COMMIT;
