-- ============================================================
-- profile.discord_bootstrap_cache + validator + RPCs + helper
--
-- Hand-authored mirror of the canonical state established by
-- 20260531005655_auth_hook_owned_guilds_claim.sql (PR #11488).
--
-- Per-user Discord bootstrap cache feeding the JWT mint hook's
-- owned_guilds claim. The cache is populated exclusively via
-- profile.service_upsert_discord_bootstrap_cache (SECURITY DEFINER
-- owned by postgres); service_role has NO direct table privileges.
-- Dashboard freshness peeks go through profile.service_get_..._
-- freshness (also SECURITY DEFINER, owned by postgres) so the
-- guild list never leaves the SECURITY DEFINER boundary.
-- supabase_auth_admin holds SELECT only, used by the hook
-- (see profile_custom_access_token_hook.sql).
--
-- File order within: tables → indexes → policies → functions →
-- grants. Idempotent-safe per the schema/ convention.
-- ============================================================

-- ------------------------------------------------------------
-- Validator (text[] shape validator, CHECK-constraint backed)
-- ------------------------------------------------------------
-- IMMUTABLE STRICT. CASE preserves short-circuit safety; AND
-- chains in SQL don't guarantee short-circuit so jsonb_array_length
-- equivalents could otherwise throw on non-array input.
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
CREATE TABLE IF NOT EXISTS profile.discord_bootstrap_cache (
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
    'Per-user Discord bootstrap cache. All access flows through SECURITY DEFINER RPCs (postgres-owned) — service_role has NO direct table privileges. Writes go through profile.service_upsert_discord_bootstrap_cache (centralised validation + canonicalisation + advisory-lock serialisation + relink handling). Dashboard freshness reads go through profile.service_get_discord_bootstrap_cache_freshness (returns only refreshed_at/updated_at/guild_count for a specific user_id; never exposes the full provider_id + owned_guilds list to broad service-role reads). supabase_auth_admin has SELECT for custom_access_token_hook at JWT mint.';

-- ------------------------------------------------------------
-- Table grants + RLS
-- ------------------------------------------------------------
REVOKE ALL ON TABLE profile.discord_bootstrap_cache
    FROM PUBLIC, anon, authenticated;

GRANT USAGE  ON SCHEMA profile                         TO supabase_auth_admin;
GRANT USAGE  ON SCHEMA profile                         TO service_role;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache TO supabase_auth_admin;
-- service_role has ZERO direct privileges on this table — writes go
-- through service_upsert RPC, reads go through service_get_..._
-- freshness RPC. Both RPCs are SECURITY DEFINER owned by postgres.

-- RLS enabled for caller roles. FORCE ROW LEVEL SECURITY is
-- intentionally NOT used: the postgres-owned SECURITY DEFINER RPCs
-- are the sanctioned access paths; the RPC's INSERT/UPDATE/DELETE
-- bypasses RLS via the owner anyway. Revisit if the RPC owner ever
-- moves off postgres or a non-superuser caller gains direct DML.
ALTER TABLE profile.discord_bootstrap_cache ENABLE ROW LEVEL SECURITY;

-- Exactly one policy: supabase_auth_admin SELECT for the hook.
-- NO service_role policy — drift assertion in the migration locks
-- this in place.
DROP POLICY IF EXISTS "supabase_auth_admin_select" ON profile.discord_bootstrap_cache;
CREATE POLICY "supabase_auth_admin_select"
    ON profile.discord_bootstrap_cache
    AS PERMISSIVE
    FOR SELECT
    TO supabase_auth_admin
    USING (true);

-- ------------------------------------------------------------
-- Service-role write RPC (only sanctioned write surface)
-- ------------------------------------------------------------
-- Owner pinned to postgres for stable SECURITY DEFINER behaviour.
-- Takes a coarse advisory lock on the relink namespace to serialise
-- concurrent OAuth refreshes (closes the cross-swap race between
-- DELETE-relink and INSERT-upsert). Validates inputs (SQLSTATE
-- 22023 on invalid params), canonicalises owned_guilds (dedup +
-- first-seen + NULL/regex filter + cap 50), handles account
-- relinking via DELETE-of-stale-row, maintains updated_at, and
-- RAISE LOGs on filter + relink events for ops observability
-- (raw provider_id intentionally excluded from logs).
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
    v_canonical        text[];
    v_now              timestamptz := statement_timestamp();
    v_input_count      integer     := cardinality(COALESCE(p_owned_guilds, ARRAY[]::text[]));
    v_valid_count      integer;
    v_relinked_user_id uuid;
BEGIN
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

    -- Coarse advisory lock on the relink namespace — see migration
    -- 20260531005655 for the history (per-key locks left a cross-
    -- swap race open in concurrent A→Y / B→X relinks). Acceptable
    -- at OAuth/session-refresh rates; row-level locking is the
    -- alternative if write volume ever justifies it.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('profile.discord_bootstrap_cache.relink', 0)
    );

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

    -- Two distinct log signals: "Discord API sent malformed data"
    -- vs "we deduped/capped duplicates". user_id omitted —
    -- counts alone are the actionable signal.
    SELECT count(*)::integer
      INTO v_valid_count
      FROM unnest(COALESCE(p_owned_guilds, ARRAY[]::text[])) AS e(g)
     WHERE g IS NOT NULL
       AND g ~ '^[0-9]{17,20}$';

    IF v_valid_count <> v_input_count THEN
        RAISE LOG 'service_upsert_discord_bootstrap_cache: filtered % invalid owned_guild entries (of % input)',
            v_input_count - v_valid_count, v_input_count;
    END IF;

    IF v_valid_count <> cardinality(v_canonical) THEN
        RAISE LOG 'service_upsert_discord_bootstrap_cache: deduped/capped % owned_guild entries (% valid -> % stored)',
            v_valid_count - cardinality(v_canonical), v_valid_count, cardinality(v_canonical);
    END IF;

    -- Account relinking. Raw provider_id intentionally excluded
    -- from the log to avoid leaking into pg_log; before/after
    -- user_ids are kept because they are the actionable info for
    -- incident response.
    DELETE FROM profile.discord_bootstrap_cache
     WHERE discord_provider_id = p_discord_provider_id
       AND user_id <> p_user_id
    RETURNING user_id INTO v_relinked_user_id;

    IF v_relinked_user_id IS NOT NULL THEN
        RAISE LOG 'service_upsert_discord_bootstrap_cache: relinked discord provider from user=% to user=%',
            v_relinked_user_id, p_user_id;
    END IF;

    -- ON CONFLICT (user_id) DO UPDATE intentionally allows the
    -- SAME user to swap their discord_provider_id (e.g. user
    -- re-OAuths under a different Discord account but the same
    -- Supabase identity). Symmetric with the cross-user relink
    -- case handled above.
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
-- Narrow read RPC for dashboard freshness peeks
-- ------------------------------------------------------------
-- Returns only the row metadata the dashboard needs to render
-- "last refreshed N minutes ago" — never exposes
-- discord_provider_id or the owned_guilds list. SECURITY DEFINER +
-- owned by postgres so service_role doesn't need direct SELECT on
-- the table.
--
-- LEFT JOIN over a single-row input so a non-NULL p_user_id
-- always yields exactly one row — NULL timestamps + 0 guild_count
-- when no cache row exists. NULL p_user_id returns zero rows
-- (no input row passes the WHERE).
CREATE OR REPLACE FUNCTION profile.service_get_discord_bootstrap_cache_freshness(
    p_user_id uuid
)
RETURNS TABLE (
    refreshed_at timestamptz,
    updated_at   timestamptz,
    created_at   timestamptz,
    guild_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
    SELECT
        c.refreshed_at,
        c.updated_at,
        c.created_at,
        COALESCE(cardinality(c.owned_guilds), 0)::integer AS guild_count
    FROM (SELECT p_user_id AS user_id) AS input
    LEFT JOIN profile.discord_bootstrap_cache AS c
      ON c.user_id = input.user_id
    WHERE input.user_id IS NOT NULL;
$$;

ALTER FUNCTION profile.service_get_discord_bootstrap_cache_freshness(uuid)
    OWNER TO postgres;

COMMENT ON FUNCTION profile.service_get_discord_bootstrap_cache_freshness(uuid) IS
    'Narrow read RPC for dashboard freshness rendering. Returns refreshed_at + updated_at + created_at + guild_count for a single user_id; never exposes discord_provider_id or the owned_guilds list. SECURITY DEFINER + owned by postgres; service_role has EXECUTE only.';

REVOKE EXECUTE ON FUNCTION profile.service_get_discord_bootstrap_cache_freshness(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_get_discord_bootstrap_cache_freshness(uuid)
    TO service_role;

-- ------------------------------------------------------------
-- Hook helper: owned_guilds JWT claim builder
-- ------------------------------------------------------------
-- Extracted out of the hook so Postgres can inline + cost-estimate
-- the call. STABLE + COST 20. INVOKER (default) — when called from
-- the hook (SECURITY DEFINER owned by supabase_auth_admin), the
-- helper runs as supabase_auth_admin, which has SELECT on the cache.
--
-- Storage is canonical via the write RPC, so dedup + GROUP BY
-- aren't needed here. The defensive NULL + regex filter stays
-- because JWT mint is a security boundary — even if the RPC
-- develops a bug or a superuser does manual DML, the hook still
-- emits only well-formed snowflakes.
--
-- 7-day freshness window + 30-second future-timestamp guard.
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
    SELECT COALESCE(jsonb_agg(g ORDER BY ord), '[]'::jsonb)
      FROM (
          SELECT g, ord
            FROM profile.discord_bootstrap_cache AS c,
                 LATERAL unnest(c.owned_guilds) WITH ORDINALITY AS e(g, ord)
           WHERE p_user_id      IS NOT NULL
             AND c.user_id      = p_user_id
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
