-- migrate:up

-- ============================================================
-- AUTHZ — PostgREST-exposed bitwise permission predicates.
--
-- Source of truth: packages/data/sql/schema/authz/authz.sql
--                  packages/data/proto/kbve/staff.proto
--
-- The `staff` schema holds the membership table + grant/revoke
-- machinery but is intentionally NOT exposed through PostgREST.
-- `forum.is_staff(uuid)` was the only REST-callable predicate and
-- only answers "any non-zero permission?". The kbve-gate sidecar
-- (and apps/metrics) need per-rank checks to gate upstreams at
-- different privilege levels (e.g. Supabase Studio = SUPERADMIN).
--
-- This migration adds a dedicated `authz` schema of parametric,
-- service-callable predicates over staff.members. They take an
-- explicit p_user_id (the gate calls them as service_role, where
-- auth.uid() is NULL), mirror the bitwise semantics already used by
-- staff._check_actor_permission / staff.proxy_has_permission, and
-- apply the SUPERADMIN (0x40000000) bypass for rank checks.
--
-- Semantics: pure flags + superadmin bypass. Flags are independent
-- bits, not ordered ranks — is_admin tests the ADMIN bit, it does
-- NOT imply is_moderator. SUPERADMIN passes every rank/has_* check.
--
--   STAFF      = 0x00000001   ADMIN      = 0x00000004
--   MODERATOR  = 0x00000002   SUPERADMIN = 0x40000000
--
-- Gate wiring: GATE_STAFF_SCHEMA=authz + GATE_STAFF_RPC=<predicate>.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS authz;
ALTER SCHEMA authz OWNER TO postgres;

-- Explicit reset: deny everything (incl. any stale CREATE), then grant
-- USAGE to service_role only. These explicit-UUID predicates are
-- backend-only (kbve-gate / metrics call them as service_role). Browser
-- self-checks already exist via staff.proxy_has_permission() /
-- public.is_staff() (auth.uid()-based), so authenticated does NOT get
-- access here — that would expose a per-UUID rank-enumeration oracle.
REVOKE ALL ON SCHEMA authz FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA authz TO service_role;

-- Internal: resolve a user's permission mask (0 when not a member).
-- SECURITY DEFINER so the public predicates can read staff.members
-- regardless of the caller's grants. Not granted to anon/authenticated;
-- the definer predicates below call it as the owner (postgres).
CREATE OR REPLACE FUNCTION authz._perms(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
    v_perms INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN 0;
    END IF;
    SELECT permissions INTO v_perms
    FROM staff.members
    WHERE user_id = p_user_id;
    RETURN COALESCE(v_perms, 0);
END;
$$;

ALTER FUNCTION authz._perms(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION authz._perms(UUID) FROM PUBLIC, anon, authenticated;

-- TRUE if the user holds any non-zero permission bit.
CREATE OR REPLACE FUNCTION authz.is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
BEGIN
    RETURN authz._perms(p_user_id) <> 0;
END;
$$;

-- TRUE if the user holds MODERATOR (or SUPERADMIN bypass).
CREATE OR REPLACE FUNCTION authz.is_moderator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
    v_perms INTEGER := authz._perms(p_user_id);
BEGIN
    RETURN (v_perms & x'40000000'::int) <> 0
        OR (v_perms & x'00000002'::int) <> 0;
END;
$$;

-- TRUE if the user holds ADMIN (or SUPERADMIN bypass).
CREATE OR REPLACE FUNCTION authz.is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
    v_perms INTEGER := authz._perms(p_user_id);
BEGIN
    RETURN (v_perms & x'40000000'::int) <> 0
        OR (v_perms & x'00000004'::int) <> 0;
END;
$$;

-- TRUE only if the user holds the SUPERADMIN bit (no bypass — it IS the bit).
CREATE OR REPLACE FUNCTION authz.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
BEGIN
    RETURN (authz._perms(p_user_id) & x'40000000'::int) <> 0;
END;
$$;

-- TRUE if the user holds ALL bits in p_mask (or SUPERADMIN bypass).
-- Rejects NULL/<=0 masks to prevent (perms & 0)=0 silent-allow.
CREATE OR REPLACE FUNCTION authz.has_permission(p_user_id UUID, p_mask INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
    v_perms INTEGER;
BEGIN
    IF p_mask IS NULL OR p_mask <= 0 THEN
        RETURN FALSE;
    END IF;
    v_perms := authz._perms(p_user_id);
    IF (v_perms & x'40000000'::int) <> 0 THEN
        RETURN TRUE;
    END IF;
    RETURN (v_perms & p_mask) = p_mask;
END;
$$;

-- TRUE if the user holds ANY bit in p_mask (or SUPERADMIN bypass).
CREATE OR REPLACE FUNCTION authz.has_any_permission(p_user_id UUID, p_mask INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
    v_perms INTEGER;
BEGIN
    IF p_mask IS NULL OR p_mask <= 0 THEN
        RETURN FALSE;
    END IF;
    v_perms := authz._perms(p_user_id);
    IF (v_perms & x'40000000'::int) <> 0 THEN
        RETURN TRUE;
    END IF;
    RETURN (v_perms & p_mask) <> 0;
END;
$$;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'authz.is_staff(UUID)',
        'authz.is_moderator(UUID)',
        'authz.is_admin(UUID)',
        'authz.is_superadmin(UUID)',
        'authz.has_permission(UUID, INTEGER)',
        'authz.has_any_permission(UUID, INTEGER)'
    ] LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', fn);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END LOOP;
END $$;

COMMENT ON SCHEMA authz IS
    'PostgREST-exposed bitwise permission predicates over staff.members. Pure flags + SUPERADMIN bypass.';
COMMENT ON FUNCTION authz.is_superadmin(UUID) IS
    'TRUE only if the user holds the SUPERADMIN (0x40000000) bit. Used to gate Supabase Studio via kbve-gate.';

-- migrate:down

DROP SCHEMA IF EXISTS authz CASCADE;
