BEGIN;

-- ULID extension (pg_idkit provides ulid_generate())
CREATE EXTENSION IF NOT EXISTS "pg_idkit";

CREATE SCHEMA IF NOT EXISTS profile;
ALTER SCHEMA profile OWNER TO postgres;

GRANT USAGE ON SCHEMA profile TO service_role;
REVOKE ALL ON SCHEMA profile FROM PUBLIC;
REVOKE ALL ON SCHEMA profile FROM anon, authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA profile TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA profile TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA profile TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA profile
    GRANT ALL ON TABLES TO service_role;

-- ===========================================
-- USERNAME TABLE (ULID primary key)
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username (
    ulid TEXT PRIMARY KEY DEFAULT ulid_generate(),

    user_id UUID UNIQUE NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    username TEXT COLLATE "C" NOT NULL,

    CONSTRAINT username_format_chk
        CHECK (username ~ '^[a-z0-9_-]+$'),

    CONSTRAINT username_lowercase_chk
        CHECK (username = lower(username COLLATE "C")),

    -- Username length: 3–63 chars
    CONSTRAINT username_length_chk
        CHECK (char_length(username) BETWEEN 3 AND 63),

    CONSTRAINT username_trim_chk
        CHECK (username = btrim(username))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_username_unique
    ON profile.username (username);

COMMENT ON TABLE profile.username IS
    'Canonical usernames controlled exclusively by backend service-role.';
COMMENT ON COLUMN profile.username.ulid IS
    'ULID primary key containing chronological information.';
COMMENT ON COLUMN profile.username.username IS
    'Lowercase ASCII username, punycode/xn-- future-safe.';
COMMENT ON COLUMN profile.username.user_id IS
    '1:1 mapping to Supabase auth.users.';

-- ===========================================
-- RLS (LOCKED DOWN)
-- ===========================================
ALTER TABLE profile.username ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON profile.username;
DROP POLICY IF EXISTS "user_select_own"    ON profile.username;
DROP POLICY IF EXISTS "user_insert_own"    ON profile.username;
DROP POLICY IF EXISTS "user_update_own"    ON profile.username;

CREATE POLICY "service_role_full_access"
    ON profile.username
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No anon/authenticated policies: they cannot touch this table at all.

-- Explicitly nuke table privileges for non-service roles (existing objects)
REVOKE ALL ON ALL TABLES IN SCHEMA profile
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA profile
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA profile
    FROM PUBLIC, anon, authenticated;

-- Future objects: make sure nobody but service_role gets anything by default
ALTER DEFAULT PRIVILEGES IN SCHEMA profile
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA profile
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA profile
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Look up username by user_id quickly (and speed ON DELETE CASCADE)
CREATE INDEX IF NOT EXISTS idx_profile_username_user_id
    ON profile.username (user_id);


-- ===========================================
-- USERNAME RESERVATION TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username_reservation (
    ulid TEXT PRIMARY KEY DEFAULT ulid_generate(),

    -- Who owns this reservation (Supabase auth user)
    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    -- Username being reserved
    reserved_username TEXT COLLATE "C" NOT NULL,

    -- Soft-state so you can "release" without deleting
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- validation: same rules as profile.username
    CONSTRAINT username_res_format_chk
        CHECK (reserved_username ~ '^[a-z0-9_-]+$'),

    CONSTRAINT username_res_lower_chk
        CHECK (reserved_username = lower(reserved_username COLLATE "C")),

    -- Username length: 3–63 chars
    CONSTRAINT username_res_length_chk
        CHECK (char_length(reserved_username) BETWEEN 3 AND 63),

    CONSTRAINT username_res_trim_chk
        CHECK (reserved_username = btrim(reserved_username))
);

COMMENT ON TABLE profile.username_reservation IS
    'Username reservations controlled exclusively by backend service-role.';
COMMENT ON COLUMN profile.username_reservation.ulid IS
    'ULID primary key, also carries creation time.';
COMMENT ON COLUMN profile.username_reservation.user_id IS
    'Supabase auth.users.id owning this reservation.';
COMMENT ON COLUMN profile.username_reservation.reserved_username IS
    'Username reserved by the owner.';
COMMENT ON COLUMN profile.username_reservation.is_active IS
    'Active reservation flag; allows historical records without delete.';

-- ===========================================
-- UNIQUE CONSTRAINTS / INDEXES
-- ===========================================

-- 1) Only one *active* reservation per username globally
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_username_reservation_active_unique
    ON profile.username_reservation (reserved_username)
    WHERE is_active;

-- 2) Avoid duplicate active reservations for the same user+username
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_username_reservation_user_name_active
    ON profile.username_reservation (user_id, reserved_username)
    WHERE is_active;
    
-- Fast lookups of reservations by user
CREATE INDEX IF NOT EXISTS idx_profile_username_reservation_user_id
    ON profile.username_reservation (user_id);

-- ===========================================
-- RLS: SERVICE_ROLE ONLY
-- ===========================================
ALTER TABLE profile.username_reservation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON profile.username_reservation;

CREATE POLICY "service_role_full_access"
    ON profile.username_reservation
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No anon/authenticated policies: they cannot touch this table at all.


-- ===========================================
-- INVARIANT TRIGGER: PREVENT RESERVING TAKEN USERNAMES
-- ===========================================
CREATE OR REPLACE FUNCTION profile.trg_username_reservation_before_ins_upd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.is_active THEN
        IF EXISTS (
            SELECT 1
            FROM profile.username AS u
            WHERE u.username = NEW.reserved_username
        ) THEN
            RAISE EXCEPTION
                'Cannot reserve username "%": it is already taken.',
                NEW.reserved_username
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION profile.trg_username_reservation_before_ins_upd()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_username_reservation_before_ins_upd
ON profile.username_reservation;

CREATE TRIGGER trg_username_reservation_before_ins_upd
BEFORE INSERT OR UPDATE
ON profile.username_reservation
FOR EACH ROW
EXECUTE FUNCTION profile.trg_username_reservation_before_ins_upd();


-- ===========================================
-- INVARIANT TRIGGER: RESERVATION BLOCKS CLAIM BY OTHERS
-- ===========================================
CREATE OR REPLACE FUNCTION profile.trg_username_before_ins_upd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    res_owner UUID;
BEGIN
    -- Is there an active reservation for this username?
    SELECT r.user_id
    INTO res_owner
    FROM profile.username_reservation AS r
    WHERE r.reserved_username = NEW.username
      AND r.is_active
    LIMIT 1;

    IF res_owner IS NOT NULL THEN
        -- Reserved by someone else -> block
        IF res_owner <> NEW.user_id THEN
            RAISE EXCEPTION
                'Username "%" is reserved by another user.',
                NEW.username
                USING ERRCODE = 'unique_violation';
        END IF;

        -- Reserved by the same user -> allow claim and clear reservation
        UPDATE profile.username_reservation
        SET is_active = FALSE
        WHERE user_id = NEW.user_id
          AND reserved_username = NEW.username
          AND is_active;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION profile.trg_username_before_ins_upd()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_username_before_ins_upd
ON profile.username;

CREATE TRIGGER trg_username_before_ins_upd
BEFORE INSERT OR UPDATE OF username
ON profile.username
FOR EACH ROW
EXECUTE FUNCTION profile.trg_username_before_ins_upd();


-- ===========================================
-- MIGRATION-TIME SANITY CHECK (WITH SEARCH_PATH LOCKED)
-- ===========================================
DO $$
DECLARE
    conflict_count BIGINT;
BEGIN
    -- Hard reset search_path inside this block
    PERFORM set_config('search_path', '', true);

    -- Check: no active reservation for an already-claimed username
    SELECT COUNT(*)
    INTO conflict_count
    FROM profile.username_reservation AS r
    JOIN profile.username AS u
      ON u.username = r.reserved_username
    WHERE r.is_active;

    IF conflict_count > 0 THEN
        RAISE EXCEPTION
            'profile: Found % active reservations for usernames that are already claimed. Fix data before applying constraints.',
            conflict_count;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
