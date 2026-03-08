-- ============================================================
-- STAFF SCHEMA — Bitwise permission system
--
-- Permissions are stored as a single INTEGER and checked with
-- bitwise AND:  (permissions & REQUIRED_FLAG) != 0
--
-- Source of truth: packages/data/proto/kbve/staff.proto
--
-- Permission layout (from proto, zero-indexed bit positions):
--   Bits  0–7   Core role flags     (STAFF=0x1, MODERATOR=0x2, ADMIN=0x4)
--   Bits  8–15  Features       (DASHBOARD_VIEW=0x100, etc.)
--   Bits 16–23  Admin ops      (STAFF_GRANT=0x10000, etc.)
--   Bits 24–29  Reserved
--   Bit  30     Superadmin     (0x40000000, bypasses all checks)
--
-- NOTE: INTEGER is signed 32-bit. Bit 31 (0x80000000) would be negative,
-- so we cap at bit 30 for the highest usable flag. The CHECK constraint
-- (permissions >= 0) enforces this invariant.
--
-- Tables: members, audit_log
-- Functions: 12 (3 trigger, 1 internal, 3 service, 3 proxy, 2 public RPC)
--
-- Depends on: auth.users (Supabase), public.gen_ulid()
--
-- To add the first superadmin after deployment (service_role only):
--   SELECT staff.service_grant('<user-uuid>', x'40000001'::int, NULL);
--
-- NOTE: NULL actor_id is a privileged bypass for bootstrap only.
-- Only service_role can call service functions. Ensure only tightly
-- controlled backend code uses the NULL actor path.
-- ============================================================

BEGIN;

-- ===========================================
-- SCHEMA + PERMISSIONS
-- ===========================================

CREATE SCHEMA IF NOT EXISTS staff;
ALTER SCHEMA staff OWNER TO postgres;

GRANT USAGE ON SCHEMA staff TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA staff TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA staff TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA staff TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA staff TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA staff GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staff GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staff GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA staff GRANT ALL ON ROUTINES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA staff GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA staff GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA staff GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA staff GRANT ALL ON ROUTINES TO service_role;

-- Authenticated users can call proxy functions (self-check)
GRANT USAGE ON SCHEMA staff TO authenticated;

-- Revoke direct table/sequence access from non-service roles
REVOKE ALL ON ALL TABLES IN SCHEMA staff FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA staff FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staff FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA staff
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA staff
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA staff
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ===========================================
-- PERMISSION CONSTANTS (used in functions)
-- ===========================================
-- Defined inline to match proto — no separate table needed.
--
--   0x00000001  STAFF              0x00000100  DASHBOARD_VIEW
--   0x00000002  MODERATOR          0x00000200  DASHBOARD_MANAGE
--   0x00000004  ADMIN              0x00000400  USER_VIEW
--                                  0x00000800  USER_MANAGE
--                                  0x00001000  CONTENT_MODERATE
--                                  0x00002000  CONTENT_DELETE
--
--   0x00010000  STAFF_GRANT        0x00080000  AUDIT_VIEW
--   0x00020000  STAFF_REVOKE       0x00040000  SYSTEM_CONFIG
--
--   0x40000000  SUPERADMIN (bit 30, bypasses all checks)

-- ===========================================
-- TABLE: staff.members
-- ===========================================

CREATE TABLE IF NOT EXISTS staff.members (
    user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    permissions      INTEGER NOT NULL DEFAULT 0
                         CHECK (permissions >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_granted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE staff.members IS
    'Staff membership with bitwise permission flags. See proto kbve.staff.StaffPermission.';
COMMENT ON COLUMN staff.members.permissions IS
    'Bitwise OR of StaffPermission flags. 0 = no permissions (inactive entry).';
COMMENT ON COLUMN staff.members.last_granted_by IS
    'UUID of the actor who last granted permissions to this member. Updated on each grant, not on revoke.';

ALTER TABLE staff.members ENABLE ROW LEVEL SECURITY;

-- NOTE: RLS here is belt-and-suspenders. The real access control is through
-- SECURITY DEFINER proxy functions + EXECUTE grants. Authenticated users
-- never hit these tables directly — all reads/writes go through functions.
-- Table-level RLS is a defence-in-depth layer, not the primary control plane.
DROP POLICY IF EXISTS "service_role_full_access" ON staff.members;
CREATE POLICY "service_role_full_access" ON staff.members
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- TABLE: staff.audit_log
-- ===========================================

CREATE TABLE IF NOT EXISTS staff.audit_log (
    id           TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    target_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL CHECK (action IN ('grant', 'revoke', 'remove', 'create')),
    requested_perms INTEGER NOT NULL DEFAULT 0,
    old_perms    INTEGER NOT NULL DEFAULT 0,
    new_perms    INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE staff.audit_log IS
    'Immutable log of all staff permission changes. Append-only — UPDATE and DELETE are blocked by triggers.';

ALTER TABLE staff.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON staff.audit_log;
CREATE POLICY "service_role_full_access" ON staff.audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No direct table access for authenticated — all reads go through
-- SECURITY DEFINER proxy functions. RLS is belt-and-suspenders.

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_target
    ON staff.audit_log (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
    ON staff.audit_log (actor_id, created_at DESC);

-- ===========================================
-- TRIGGERS (idempotent: DROP IF EXISTS before CREATE)
-- ===========================================

-- Audit log is append-only: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION staff.audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'staff.audit_log is append-only — UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

ALTER FUNCTION staff.audit_log_immutable() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON staff.audit_log;
CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON staff.audit_log
    FOR EACH ROW EXECUTE FUNCTION staff.audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON staff.audit_log;
CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON staff.audit_log
    FOR EACH ROW EXECUTE FUNCTION staff.audit_log_immutable();

-- Protect created_at from updates
CREATE OR REPLACE FUNCTION staff.protect_created_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

ALTER FUNCTION staff.protect_created_at() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_protect_created_at ON staff.members;
CREATE TRIGGER trg_protect_created_at
    BEFORE UPDATE ON staff.members
    FOR EACH ROW EXECUTE FUNCTION staff.protect_created_at();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION staff.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

ALTER FUNCTION staff.update_updated_at() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_update_updated_at ON staff.members;
CREATE TRIGGER trg_update_updated_at
    BEFORE UPDATE ON staff.members
    FOR EACH ROW EXECUTE FUNCTION staff.update_updated_at();

-- ===========================================
-- INTERNAL HELPER
-- ===========================================

-- Check if actor has required permission (or is superadmin).
-- Used by service functions to enforce privilege escalation checks.
-- p_actor_id = NULL means service_role direct call (always allowed).
CREATE OR REPLACE FUNCTION staff._check_actor_permission(
    p_actor_id    UUID,
    p_required    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_actor_perms INTEGER;
BEGIN
    -- service_role direct calls have no actor — always allowed
    IF p_actor_id IS NULL THEN
        RETURN;
    END IF;

    SELECT permissions INTO v_actor_perms
    FROM staff.members
    WHERE user_id = p_actor_id;

    IF v_actor_perms IS NULL THEN
        RAISE EXCEPTION 'Actor % is not a staff member', p_actor_id;
    END IF;

    -- Superadmin bypasses all checks
    IF (v_actor_perms & x'40000000'::int) != 0 THEN
        RETURN;
    END IF;

    -- Check required permission
    IF (v_actor_perms & p_required) = 0 THEN
        RAISE EXCEPTION 'Actor % lacks required permission 0x%',
            p_actor_id, pg_catalog.to_hex(p_required);
    END IF;
END;
$$;

ALTER FUNCTION staff._check_actor_permission(UUID, INTEGER) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff._check_actor_permission(UUID, INTEGER)
        FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION staff._check_actor_permission(UUID, INTEGER)
        TO service_role;
END $$;

-- ===========================================
-- SERVICE FUNCTIONS (service_role only)
-- ===========================================

-- Grant permissions to a user (OR's flags into existing).
-- Privilege escalation guard: actor cannot grant flags they don't hold
-- (unless superadmin or service_role direct call).
-- Uses FOR UPDATE row locking to prevent lost updates under concurrency.
CREATE OR REPLACE FUNCTION staff.service_grant(
    p_user_id    UUID,
    p_perms      INTEGER,
    p_actor_id   UUID DEFAULT NULL
)
RETURNS INTEGER  -- new permissions after grant
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_old_perms   INTEGER;
    v_new_perms   INTEGER;
    v_actor_perms INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;
    IF p_perms IS NULL OR p_perms = 0 THEN
        RAISE EXCEPTION 'permissions must be non-zero';
    END IF;
    IF p_perms < 0 THEN
        RAISE EXCEPTION 'permissions must be a positive bitmask';
    END IF;

    -- Verify actor has STAFF_GRANT permission
    PERFORM staff._check_actor_permission(p_actor_id, x'00010000'::int);

    -- Privilege escalation guard: actor can't grant flags they don't hold
    IF p_actor_id IS NOT NULL THEN
        SELECT permissions INTO v_actor_perms
        FROM staff.members WHERE user_id = p_actor_id;

        -- Skip guard for superadmin
        IF (v_actor_perms & x'40000000'::int) = 0 THEN
            IF (p_perms & ~v_actor_perms) != 0 THEN
                RAISE EXCEPTION 'Cannot grant permissions you do not hold (requested=0x%, yours=0x%)',
                    pg_catalog.to_hex(p_perms), pg_catalog.to_hex(v_actor_perms);
            END IF;
        END IF;
    END IF;

    -- Advisory lock serializes all operations on this target user, even when
    -- the row doesn't exist yet. This prevents the first-insert audit race
    -- where two concurrent grants both log old_perms=0 / action='create'.
    -- Uses two-key lock derived from UUID halves (64-bit total) instead of
    -- hashtext() which is only 32-bit and collision-prone.
    -- The lock is automatically released at transaction end.
    PERFORM pg_advisory_xact_lock(
        ('x' || substr(replace(p_user_id::text, '-', ''), 1, 8))::bit(32)::int,
        ('x' || substr(replace(p_user_id::text, '-', ''), 9, 8))::bit(32)::int
    );

    -- Lock existing row (belt-and-suspenders with advisory lock above).
    SELECT permissions INTO v_old_perms
    FROM staff.members WHERE user_id = p_user_id FOR UPDATE;

    IF v_old_perms IS NULL THEN
        -- New member
        v_old_perms := 0;
        v_new_perms := p_perms;

        -- ON CONFLICT handles the rare race where two concurrent grants
        -- both see no existing row: one INSERT wins, the other falls through
        -- to the UPDATE path which atomically OR's using the actual row value.
        INSERT INTO staff.members (user_id, permissions, last_granted_by)
        VALUES (p_user_id, v_new_perms, p_actor_id)
        ON CONFLICT (user_id) DO UPDATE
            SET permissions      = staff.members.permissions | EXCLUDED.permissions,
                last_granted_by  = COALESCE(EXCLUDED.last_granted_by, staff.members.last_granted_by)
        RETURNING permissions INTO v_new_perms;
    ELSE
        -- Existing member: row is locked, safe to compute
        v_new_perms := v_old_perms | p_perms;

        UPDATE staff.members
        SET permissions      = v_new_perms,
            last_granted_by  = COALESCE(p_actor_id, staff.members.last_granted_by)
        WHERE user_id = p_user_id;
    END IF;

    -- Audit log
    INSERT INTO staff.audit_log (target_id, actor_id, action, requested_perms, old_perms, new_perms)
    VALUES (p_user_id, p_actor_id,
            CASE WHEN v_old_perms = 0 THEN 'create' ELSE 'grant' END,
            p_perms, v_old_perms, v_new_perms);

    RETURN v_new_perms;
END;
$$;

ALTER FUNCTION staff.service_grant(UUID, INTEGER, UUID) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.service_grant(UUID, INTEGER, UUID)
        FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION staff.service_grant(UUID, INTEGER, UUID)
        TO service_role;
END $$;

-- Revoke permissions from a user (AND NOT's flags from existing).
-- Scope guard: actor cannot revoke flags they don't hold (unless superadmin).
-- Actor cannot revoke/remove a superadmin unless actor is also superadmin.
-- Uses FOR UPDATE row locking to prevent lost updates under concurrency.
CREATE OR REPLACE FUNCTION staff.service_revoke(
    p_user_id    UUID,
    p_perms      INTEGER,
    p_actor_id   UUID DEFAULT NULL
)
RETURNS INTEGER  -- new permissions after revoke
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_old_perms   INTEGER;
    v_new_perms   INTEGER;
    v_actor_perms INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;
    IF p_perms IS NULL OR p_perms = 0 THEN
        RAISE EXCEPTION 'permissions must be non-zero';
    END IF;
    IF p_perms < 0 THEN
        RAISE EXCEPTION 'permissions must be a positive bitmask';
    END IF;

    -- Verify actor has STAFF_REVOKE permission
    PERFORM staff._check_actor_permission(p_actor_id, x'00020000'::int);

    -- Self-revoke guard: cannot revoke your own SUPERADMIN
    IF p_actor_id IS NOT NULL AND p_actor_id = p_user_id THEN
        IF (p_perms & x'40000000'::int) != 0 THEN
            RAISE EXCEPTION 'Cannot revoke your own SUPERADMIN flag';
        END IF;
    END IF;

    -- Lock target row to prevent concurrent lost updates
    SELECT permissions INTO v_old_perms
    FROM staff.members WHERE user_id = p_user_id FOR UPDATE;

    IF v_old_perms IS NULL THEN
        RAISE EXCEPTION 'User % is not a staff member', p_user_id;
    END IF;

    -- Scope guard: actor cannot revoke bits they don't hold (unless superadmin)
    IF p_actor_id IS NOT NULL THEN
        SELECT permissions INTO v_actor_perms
        FROM staff.members WHERE user_id = p_actor_id;

        IF (v_actor_perms & x'40000000'::int) = 0 THEN
            -- Cannot revoke flags you don't hold
            IF (p_perms & ~v_actor_perms) != 0 THEN
                RAISE EXCEPTION 'Cannot revoke permissions you do not hold (requested=0x%, yours=0x%)',
                    pg_catalog.to_hex(p_perms), pg_catalog.to_hex(v_actor_perms);
            END IF;
            -- Cannot touch a superadmin target
            IF (v_old_perms & x'40000000'::int) != 0 THEN
                RAISE EXCEPTION 'Cannot revoke permissions from a superadmin — requires SUPERADMIN';
            END IF;
        END IF;
    END IF;

    v_new_perms := v_old_perms & ~p_perms;

    -- INVARIANT: zero-permission rows are deleted, not tombstoned.
    -- "Not staff" is represented by absence, not permissions = 0.
    -- This is consistent with proxy_* functions treating absence as non-staff.
    IF v_new_perms = 0 THEN
        -- Skip the pointless UPDATE → delete directly (avoids extra trigger
        -- churn and WAL writes on a row that is about to be removed).
        DELETE FROM staff.members WHERE user_id = p_user_id;
    ELSE
        UPDATE staff.members
        SET permissions = v_new_perms
        WHERE user_id = p_user_id;
    END IF;

    -- Audit log
    INSERT INTO staff.audit_log (target_id, actor_id, action, requested_perms, old_perms, new_perms)
    VALUES (p_user_id, p_actor_id, 'revoke', p_perms, v_old_perms, v_new_perms);

    RETURN v_new_perms;
END;
$$;

ALTER FUNCTION staff.service_revoke(UUID, INTEGER, UUID) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.service_revoke(UUID, INTEGER, UUID)
        FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION staff.service_revoke(UUID, INTEGER, UUID)
        TO service_role;
END $$;

-- Remove a staff member entirely.
-- Scope guard: actor cannot remove a target whose permissions exceed their own.
-- Uses FOR UPDATE row locking to prevent concurrent state changes.
CREATE OR REPLACE FUNCTION staff.service_remove(
    p_user_id    UUID,
    p_actor_id   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_old_perms   INTEGER;
    v_actor_perms INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    -- Verify actor has STAFF_REVOKE permission
    PERFORM staff._check_actor_permission(p_actor_id, x'00020000'::int);

    -- Cannot remove yourself
    IF p_actor_id IS NOT NULL AND p_actor_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot remove yourself from staff';
    END IF;

    -- Lock target row to prevent concurrent state changes
    SELECT permissions INTO v_old_perms
    FROM staff.members WHERE user_id = p_user_id FOR UPDATE;

    IF v_old_perms IS NULL THEN
        RETURN;  -- Idempotent: not a staff member, nothing to do
    END IF;

    -- Scope guard: actor cannot remove target with perms above their own
    IF p_actor_id IS NOT NULL THEN
        SELECT permissions INTO v_actor_perms
        FROM staff.members WHERE user_id = p_actor_id;

        IF (v_actor_perms & x'40000000'::int) = 0 THEN
            -- Cannot remove a target who holds flags the actor lacks
            IF (v_old_perms & ~v_actor_perms) != 0 THEN
                RAISE EXCEPTION 'Cannot remove staff member with permissions above your own';
            END IF;
            -- Cannot remove a superadmin
            IF (v_old_perms & x'40000000'::int) != 0 THEN
                RAISE EXCEPTION 'Cannot remove a superadmin — requires SUPERADMIN';
            END IF;
        END IF;
    END IF;

    DELETE FROM staff.members WHERE user_id = p_user_id;

    -- Audit log
    INSERT INTO staff.audit_log (target_id, actor_id, action, requested_perms, old_perms, new_perms)
    VALUES (p_user_id, p_actor_id, 'remove', v_old_perms, v_old_perms, 0);
END;
$$;

ALTER FUNCTION staff.service_remove(UUID, UUID) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.service_remove(UUID, UUID)
        FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION staff.service_remove(UUID, UUID)
        TO service_role;
END $$;

-- ===========================================
-- PROXY FUNCTIONS (authenticated, self-check)
-- ===========================================

-- Returns the calling user's staff status and permission mask.
CREATE OR REPLACE FUNCTION staff.proxy_check_staff()
RETURNS TABLE (is_staff BOOLEAN, permissions INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID;
    v_perms   INTEGER;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        is_staff    := false;
        permissions := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT m.permissions INTO v_perms
    FROM staff.members m
    WHERE m.user_id = v_user_id;

    IF v_perms IS NOT NULL AND v_perms > 0 THEN
        is_staff    := true;
        permissions := v_perms;
    ELSE
        is_staff    := false;
        permissions := 0;
    END IF;

    RETURN NEXT;
    RETURN;
END;
$$;

ALTER FUNCTION staff.proxy_check_staff() OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.proxy_check_staff() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION staff.proxy_check_staff() TO authenticated;
END $$;

-- Check if the calling user holds ALL bits in the given flag mask.
-- For single-flag checks (the common case), "any" and "all" are equivalent.
-- For composite masks, this requires ALL bits present — use multiple calls
-- or proxy_check_staff() if you need "any of these flags" semantics.
CREATE OR REPLACE FUNCTION staff.proxy_has_permission(p_flag INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID;
    v_perms   INTEGER;
BEGIN
    -- Reject NULL, zero, and negative masks — prevents silent authorization
    -- (e.g. p_flag=0 would make (v_perms & 0) = 0, which is always true).
    IF p_flag IS NULL OR p_flag <= 0 THEN
        RETURN false;
    END IF;

    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT permissions INTO v_perms
    FROM staff.members
    WHERE user_id = v_user_id;

    IF v_perms IS NULL THEN
        RETURN false;
    END IF;

    -- Superadmin bypasses
    IF (v_perms & x'40000000'::int) != 0 THEN
        RETURN true;
    END IF;

    -- Require ALL bits in p_flag to be present
    RETURN (v_perms & p_flag) = p_flag;
END;
$$;

ALTER FUNCTION staff.proxy_has_permission(INTEGER) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.proxy_has_permission(INTEGER) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION staff.proxy_has_permission(INTEGER) TO authenticated;
END $$;

-- Read audit log entries (requires AUDIT_VIEW or SUPERADMIN).
-- Returns the most recent N entries, optionally filtered by target.
CREATE OR REPLACE FUNCTION staff.proxy_audit_log(
    p_limit      INTEGER DEFAULT 50,
    p_target_id  UUID DEFAULT NULL
)
RETURNS TABLE (
    id TEXT, target_id UUID, actor_id UUID,
    action TEXT, requested_perms INTEGER, old_perms INTEGER,
    new_perms INTEGER, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID;
    v_perms   INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT m.permissions INTO v_perms
    FROM staff.members m WHERE m.user_id = v_user_id;

    IF v_perms IS NULL THEN
        RAISE EXCEPTION 'Not a staff member';
    END IF;

    -- Require AUDIT_VIEW or SUPERADMIN
    IF (v_perms & x'00080000'::int) = 0
       AND (v_perms & x'40000000'::int) = 0 THEN
        RAISE EXCEPTION 'Missing AUDIT_VIEW permission';
    END IF;

    -- Clamp limit
    IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 50; END IF;
    IF p_limit > 500 THEN p_limit := 500; END IF;

    RETURN QUERY
        SELECT a.id, a.target_id, a.actor_id,
               a.action, a.requested_perms, a.old_perms,
               a.new_perms, a.created_at
        FROM staff.audit_log a
        WHERE (p_target_id IS NULL OR a.target_id = p_target_id)
        ORDER BY a.created_at DESC
        LIMIT p_limit;
END;
$$;

ALTER FUNCTION staff.proxy_audit_log(INTEGER, UUID) OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION staff.proxy_audit_log(INTEGER, UUID) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION staff.proxy_audit_log(INTEGER, UUID) TO authenticated;
END $$;

-- ===========================================
-- PUBLIC RPC (PostgREST accessible)
-- ===========================================

-- Returns true if the calling user is a staff member (any permission set).
-- Used by the Rust backend JWT cache for the Grafana proxy gate.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM staff.members
        WHERE user_id = v_user_id AND permissions > 0
    );
END;
$$;

ALTER FUNCTION public.is_staff() OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
END $$;

-- Returns the caller's permission bitmask (0 if not staff).
-- Useful for frontend permission checks without multiple RPC calls.
CREATE OR REPLACE FUNCTION public.staff_permissions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID;
    v_perms   INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT permissions INTO v_perms
    FROM staff.members
    WHERE user_id = v_user_id;

    RETURN COALESCE(v_perms, 0);
END;
$$;

ALTER FUNCTION public.staff_permissions() OWNER TO postgres;

DO $$ BEGIN
    REVOKE ALL ON FUNCTION public.staff_permissions() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.staff_permissions() TO authenticated;
END $$;

COMMIT;
