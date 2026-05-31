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
-- NOT auth.identities.identity_data. PR #11488 first review (point #2)
-- pushed back on coupling a JWT-mint hot path to a semi-opaque Supabase-
-- managed table. The cache table gives us:
--   - stable PK lookup (one row per user_id)
--   - no dependency on auth.identities JSON shape
--   - service_role-owned writes, easy to GRANT for the bootstrap edge fn
--   - cheap CASCADE on auth.users delete
--
-- Population is the job of the discord-bootstrap edge fn (P5.8b), which
-- calls Discord once after OAuth and upserts here with service_role.
--
-- The hook itself does NO external calls and never blocks. It reads one
-- row by PK, validates + dedupes guild IDs, applies a freshness window,
-- and embeds the result as a JWT claim.
-- ============================================================

-- ------------------------------------------------------------
-- Cache table
-- ------------------------------------------------------------
-- Hardening reflected in this DDL (PR #11488 second-round review):
--   #3  GRANT only the privileges the edge fn needs (no ALL)
--   #4  Explicit REVOKE ALL from PUBLIC, anon, authenticated
--   #6  Service-role policy WITH CHECK mirrors the shape constraints
--   #7  IMMUTABLE validator fn + CHECK so junk rows never land at rest
--   #14 Named FK constraint for forward maintainability

CREATE TABLE IF NOT EXISTS profile.discord_bootstrap_cache (
    user_id              uuid PRIMARY KEY,
    discord_provider_id  text NOT NULL
                              CHECK (discord_provider_id ~ '^[0-9]{15,25}$'),
    owned_guilds         jsonb NOT NULL DEFAULT '[]'::jsonb,
    refreshed_at         timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT discord_bootstrap_cache_owned_guilds_is_array
        CHECK (jsonb_typeof(owned_guilds) = 'array'),
    CONSTRAINT discord_bootstrap_cache_owned_guilds_size_cap
        CHECK (jsonb_array_length(owned_guilds) <= 100),
    CONSTRAINT discord_bootstrap_cache_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE
);

COMMENT ON TABLE profile.discord_bootstrap_cache IS
    'Per-user Discord bootstrap cache. Populated by the discord-bootstrap edge fn after OAuth. Read by custom_access_token_hook at JWT mint to embed owned_guilds claim. Owned by service_role; supabase_auth_admin has SELECT for the hook.';

REVOKE ALL ON TABLE profile.discord_bootstrap_cache
    FROM PUBLIC, anon, authenticated;

-- #7: validator fn — IMMUTABLE so it can sit in a CHECK constraint and
-- the planner can prove cache-safety. Rejects non-arrays, oversized
-- arrays, and any element that isn't a 17-20 digit Discord snowflake.
CREATE OR REPLACE FUNCTION profile.discord_owned_guilds_are_valid(p_guilds jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT jsonb_typeof(p_guilds) = 'array'
       AND jsonb_array_length(p_guilds) <= 100
       AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(p_guilds) AS e(g)
           WHERE g !~ '^[0-9]{17,20}$'
       );
$$;

COMMENT ON FUNCTION profile.discord_owned_guilds_are_valid(jsonb) IS
    'IMMUTABLE shape validator for profile.discord_bootstrap_cache.owned_guilds. Backs both a CHECK constraint and the service-role RLS WITH CHECK clause.';

ALTER TABLE profile.discord_bootstrap_cache
    ADD CONSTRAINT discord_bootstrap_cache_owned_guilds_valid
    CHECK (profile.discord_owned_guilds_are_valid(owned_guilds));

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

GRANT USAGE  ON SCHEMA profile                         TO supabase_auth_admin;
GRANT SELECT ON TABLE  profile.discord_bootstrap_cache TO supabase_auth_admin;

-- #3: least-privilege grants for service_role. No TRIGGER, REFERENCES,
-- or TRUNCATE — the edge fn only needs CRUD.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE profile.discord_bootstrap_cache
    TO service_role;

-- ------------------------------------------------------------
-- Hook v2
-- ------------------------------------------------------------
-- Hardening reflected in the function body (PR #11488 review fold-ins):
--   #3, #4, #5, #15  CTE rewrite with WITH ORDINALITY + GROUP BY +
--                    explicit ORDER BY in jsonb_agg — deterministic
--                    claim order, duplicates suppressed, first-seen
--                    order preserved.
--   #6               Invalid / missing user_id strips kbve_username +
--                    owned_guilds from inbound claims before returning.
--   #8               Soft size cap raised to 1600 (was 1200). Math:
--                    50 snowflakes × 22 chars + 49 × 2 chars (", ")
--                    + 2 brackets = 1200 exactly — no safety margin.
--                    1600 leaves ~400 chars of headroom for any
--                    canonicalization differences across PG versions.
--   #10              7-day freshness window via statement_timestamp().
--                    Stale rows return [] so the browser triggers the
--                    bootstrap edge fn to refresh, instead of trusting
--                    stale ownership forever.
--   #10/#16          Typecheck event->'claims' as object before
--                    jsonb_set; non-object input rebuilt as {}.
--   #11              VOLATILE — function reads mutable cache state in
--                    a login flow. Performance cost is theoretical
--                    (no set-query memoization opportunity); semantic
--                    clarity wins for auth code.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id      uuid;
    v_username     text;
    v_owned_guilds jsonb;
    v_claims       jsonb;
    v_freshness    interval := interval '7 days';
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

    -- owned_guilds: PK lookup against the cache, gated by freshness.
    WITH src AS (
        SELECT c.owned_guilds AS arr
          FROM profile.discord_bootstrap_cache AS c
         WHERE c.user_id      = v_user_id
           AND c.refreshed_at >= statement_timestamp() - v_freshness
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

    -- Soft size cap. Should be unreachable in practice given the 50-
    -- element LIMIT above, but a malformed cache row with massive
    -- strings would otherwise leak straight into the JWT. Degrade
    -- silently to [] rather than failing the sign-in.
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
    'GoTrue access-token hook v2: embeds profile.username as kbve_username and profile.discord_bootstrap_cache.owned_guilds (cap 50, deterministic order, dedup, 7-day freshness window, soft 1600-char size cap) as owned_guilds. No external calls — reads pre-cached state populated by the discord-bootstrap edge fn.';

-- ------------------------------------------------------------
-- Privilege + plumbing assertions
-- ------------------------------------------------------------
DO $$
BEGIN
    PERFORM 'public.custom_access_token_hook(jsonb)'::regprocedure;
    PERFORM 'profile.discord_owned_guilds_are_valid(jsonb)'::regprocedure;

    IF NOT has_schema_privilege('supabase_auth_admin', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'supabase_auth_admin must hold USAGE on schema public.';
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
    IF has_table_privilege('anon', 'profile.discord_bootstrap_cache', 'SELECT')
       OR has_table_privilege('authenticated', 'profile.discord_bootstrap_cache', 'SELECT') THEN
        RAISE EXCEPTION 'anon/authenticated must NOT have SELECT on profile.discord_bootstrap_cache.';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Behavioural smoke checks (SQL-only — no writes to auth.users)
--
-- Scenarios 1-4 exercise hook behaviour on the existing schema with no
-- inserts anywhere. The LIMIT-1-on-unnest regression that would
-- previously have been tested by Scenario 5 (insert into auth.users +
-- cache row, assert dedup + ordering) is moved to a dedicated pgTAP
-- suite that runs against the kilobase production image in CI. Reasons:
--   - Production image has trigger fan-out we can't safely fire here
--     (wallet_on_auth_user_created, future Supabase audit hooks,
--     pg_net-based webhooks, etc.) even with a sentinel rollback —
--     async side effects don't honour the transaction.
--   - Local dev compose runs vanilla postgres:17-alpine, NOT the
--     kilobase image, so a smoke check inside the migration would
--     pass locally but its parity with prod is not guaranteed.
--   - pgTAP test is reusable, lives outside the migration body, and
--     can run on every CI build instead of only at migration apply.
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
    -- -> claim stripped, attacker cannot smuggle privileged state.
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
-- Validator smoke (table-only, no triggers, no auth.users)
-- ------------------------------------------------------------
DO $$
BEGIN
    -- Valid: array of 17-20 digit snowflakes, ≤100 elements.
    IF NOT profile.discord_owned_guilds_are_valid('["111111111111111111","222222222222222222"]'::jsonb) THEN
        RAISE EXCEPTION 'validator: rejected a valid 2-snowflake array';
    END IF;
    -- Valid: empty array (default).
    IF NOT profile.discord_owned_guilds_are_valid('[]'::jsonb) THEN
        RAISE EXCEPTION 'validator: rejected empty array';
    END IF;
    -- Invalid: non-array.
    IF profile.discord_owned_guilds_are_valid('{"not":"array"}'::jsonb) THEN
        RAISE EXCEPTION 'validator: accepted non-array';
    END IF;
    -- Invalid: malformed element.
    IF profile.discord_owned_guilds_are_valid('["111111111111111111","garbage"]'::jsonb) THEN
        RAISE EXCEPTION 'validator: accepted malformed element';
    END IF;
    -- Invalid: too short snowflake.
    IF profile.discord_owned_guilds_are_valid('["123"]'::jsonb) THEN
        RAISE EXCEPTION 'validator: accepted too-short snowflake';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- migrate:down transaction:false

-- transaction:false: matches the up section.

BEGIN;

-- Restore the v1 hook body. Preserves the hardening from v2:
--   #12 Object typecheck of event->'claims' before jsonb_set
--   #12 Invalid / missing user_id strips kbve_username from inbound
--       claims before returning
--   #13 Explicitly strips owned_guilds from inbound claims so a
--       rollback during a sign-in flow can't leak v2 state into a v1
--       JWT.
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

    -- Strip any v2-era claim before any other work; prevents stale
    -- owned_guilds leaking past a rollback even if the inbound event
    -- already carries one.
    v_claims := v_claims - 'owned_guilds';

    BEGIN
        v_user_id := NULLIF(event->>'user_id', '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_set(
                event,
                '{claims}',
                v_claims - 'kbve_username',
                true
            );
    END;

    IF v_user_id IS NULL THEN
        RETURN jsonb_set(
            event,
            '{claims}',
            v_claims - 'kbve_username',
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

    RETURN jsonb_set(event, '{claims}', v_claims, true);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb)
    OWNER TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

-- Drop the cache table + its validator. ON DELETE CASCADE on user_id
-- keeps cleanup trivial.
DROP TABLE     IF EXISTS profile.discord_bootstrap_cache;
DROP FUNCTION  IF EXISTS profile.discord_owned_guilds_are_valid(jsonb);

COMMIT;
