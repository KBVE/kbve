-- ============================================================
-- AUTHZ SCHEMA — PostgREST-exposed bitwise permission predicates
--
-- Parametric, service-callable predicates over staff.members for
-- gating upstreams (kbve-gate, apps/metrics) at different privilege
-- levels. They take an explicit p_user_id because callers hit them
-- as service_role, where auth.uid() is NULL.
--
-- Semantics: PURE FLAGS + SUPERADMIN bypass. Flags are independent
-- bits, not ordered ranks — is_admin tests the ADMIN bit and does
-- NOT imply is_moderator. SUPERADMIN (0x40000000) passes every
-- rank / has_* check.
--
--   STAFF      = 0x00000001   ADMIN      = 0x00000004
--   MODERATOR  = 0x00000002   SUPERADMIN = 0x40000000
--
-- Source of truth: packages/data/proto/kbve/staff.proto
-- Applied via:     packages/data/sql/dbmate/migrations/20260623000000_authz_gate_predicates.sql
-- Depends on:      staff.members
--
-- Gate wiring: GATE_STAFF_SCHEMA=authz + GATE_STAFF_RPC=<predicate>.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS authz;
ALTER SCHEMA authz OWNER TO postgres;

-- Backend-only: service_role (kbve-gate / metrics) calls these explicit-UUID
-- predicates. authenticated is intentionally excluded — browser self-checks
-- use staff.proxy_has_permission() / public.is_staff() (auth.uid()-based).
REVOKE ALL ON SCHEMA authz FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA authz TO service_role;

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

CREATE OR REPLACE FUNCTION authz.is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
BEGIN
    RETURN authz._perms(p_user_id) <> 0;
END;
$$;

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

CREATE OR REPLACE FUNCTION authz.is_superadmin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
BEGIN
    RETURN (authz._perms(p_user_id) & x'40000000'::int) <> 0;
END;
$$;

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

COMMIT;
