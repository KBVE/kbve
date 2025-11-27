BEGIN;

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
-- USERNAME TABLE (user_id primary key)
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username (
    -- 1:1 with auth.users; user_id is the natural PK
    user_id UUID PRIMARY KEY
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
COMMENT ON COLUMN profile.username.user_id IS
    'Primary key and 1:1 mapping to Supabase auth.users.id.';
COMMENT ON COLUMN profile.username.username IS
    'Lowercase ASCII username, punycode/xn-- future-safe.';

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

-- ===========================================
-- USERNAME RESERVATION TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username_reservation (
    id bigserial PRIMARY KEY,

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
-- USERNAME BANLIST TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username_banlist (
    id          bigserial PRIMARY KEY,
    pattern     text NOT NULL UNIQUE,   -- regex or literal fragment (unique to prevent duplicates)
    description text,
    is_active   boolean NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE profile.username_banlist IS
    'List of banned username patterns (regex or fragments), enforced in normalize_username().';
COMMENT ON COLUMN profile.username_banlist.pattern IS
    'Regex or literal fragment checked against canonical username.';
COMMENT ON COLUMN profile.username_banlist.is_active IS
    'Soft flag so ban rules can be disabled without deleting rows.';

-- Lock down: service_role only
ALTER TABLE profile.username_banlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON profile.username_banlist;

CREATE POLICY "service_role_full_access"
    ON profile.username_banlist
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE profile.username_banlist
    FROM PUBLIC, anon, authenticated;

-- Optional seed entries (tune this list as you like)
INSERT INTO profile.username_banlist (pattern, description)
VALUES
    ('fuck',         'Generic profanity'),
    ('shit',         'Generic profanity'),
    ('bitch',        'Generic profanity'),
    ('cunt',         'Generic profanity'),
    ('nigg',         'Racial slur fragment'),
    ('admin',        'Reserved administrative term'),
    ('administrator','Reserved administrative term'),
    ('moderator',    'Reserved staff term'),
    ('mod',          'Reserved staff term'),
    ('support',      'Reserved support term'),
    ('staff',        'Reserved staff term')
ON CONFLICT DO NOTHING;  -- in case this is re-run in dev


-- ===========================================
-- INVARIANT TRIGGER: PREVENT RESERVING TAKEN USERNAMES
-- ===========================================
CREATE OR REPLACE FUNCTION profile.trg_username_reservation_before_ins_upd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Serialize operations per username to avoid reservation/claim races
    PERFORM pg_advisory_xact_lock(hashtext(NEW.reserved_username));

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
    -- Serialize operations per username to avoid reservation/claim races
    PERFORM pg_advisory_xact_lock(hashtext(NEW.username));

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
-- HELPER: ENSURE USERNAME IS NOT BANNED
-- ===========================================
CREATE OR REPLACE FUNCTION profile.ensure_username_not_banned(
    p_username text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pattern text;
BEGIN
    -- NULL here is a programming error upstream
    IF p_username IS NULL THEN
        RAISE EXCEPTION
            'ensure_username_not_banned: p_username cannot be NULL'
            USING ERRCODE = '22004';
    END IF;

    -- Find any active pattern that matches the username
    SELECT b.pattern
    INTO v_pattern
    FROM profile.username_banlist AS b
    WHERE b.is_active
      AND p_username ~ b.pattern
    LIMIT 1;

    IF v_pattern IS NOT NULL THEN
        RAISE EXCEPTION
            'Username is not allowed'
            USING
                ERRCODE = '22023',
                DETAIL  = format('Banned pattern matched: "%s"', v_pattern);
    END IF;
END;
$$;

-- Only service_role should call this directly;
-- other roles go through proxy/service functions.
REVOKE ALL ON FUNCTION profile.ensure_username_not_banned(text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION profile.ensure_username_not_banned(text)
    TO service_role;

ALTER FUNCTION profile.ensure_username_not_banned(text)
    OWNER TO service_role;


-- ===========================================
-- HELPER: NORMALIZE + VALIDATE USERNAME (WITH BANLIST)
-- ===========================================
CREATE OR REPLACE FUNCTION profile.normalize_username(
    p_username text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_trimmed    text;
    v_normalized text;
BEGIN
    IF p_username IS NULL THEN
        RAISE EXCEPTION 'Username cannot be NULL'
            USING ERRCODE = '22004';
    END IF;

    v_trimmed := btrim(p_username);

    IF v_trimmed = '' THEN
        RAISE EXCEPTION 'Username cannot be empty or whitespace'
            USING ERRCODE = '22023';
    END IF;

    v_normalized := lower(v_trimmed COLLATE "C");

    -- Length guard
    IF char_length(v_normalized) < 3 OR char_length(v_normalized) > 63 THEN
        RAISE EXCEPTION 'Username length must be between 3 and 63 characters'
            USING ERRCODE = '22023';
    END IF;

    -- Character class guard
    IF v_normalized !~ '^[a-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Username may only contain lowercase letters, digits, underscores, and hyphens'
            USING ERRCODE = '22023';
    END IF;

    -- Reserved prefix guard
    IF v_normalized LIKE 'xn--%' THEN
        RAISE EXCEPTION 'Usernames starting with "xn--" are reserved'
            USING ERRCODE = '22023';
    END IF;

    -- Banlist guard (regex/fragment based)
    PERFORM profile.ensure_username_not_banned(v_normalized);

    RETURN v_normalized;
END;
$$;

REVOKE ALL ON FUNCTION profile.normalize_username(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.normalize_username(text)
    TO service_role;

ALTER FUNCTION profile.normalize_username(text) OWNER TO service_role;


-- ===========================================
-- SERVICE FUNCTION: CREATE USERNAME (SERVICE ROLE ONLY)
-- ===========================================
CREATE OR REPLACE FUNCTION profile.service_add_username(
    p_user_id  uuid,
    p_username text
)
RETURNS profile.username
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row       profile.username;
    v_canonical text;
BEGIN
    -- Normalize + validate input
    v_canonical := profile.normalize_username(p_username);

    -- Lock on canonical username to serialize with trigger checks
    PERFORM pg_advisory_xact_lock(hashtext(v_canonical));

    -- Ensure user doesn't already have a username
    IF EXISTS (
        SELECT 1
        FROM profile.username AS u
        WHERE u.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION
            'User % already has a username',
            p_user_id
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Insert canonicalized username and return the row
    INSERT INTO profile.username (user_id, username)
    VALUES (p_user_id, v_canonical)
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION profile.service_add_username(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_add_username(uuid, text)
    TO service_role;

ALTER FUNCTION profile.service_add_username(uuid, text) OWNER TO service_role;


-- ===========================================
-- PROXY FUNCTION: AUTH USER -> SERVICE FUNCTION
-- ===========================================
CREATE OR REPLACE FUNCTION profile.proxy_add_username(
    p_username text
)
RETURNS profile.username
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id   uuid;
    v_row       profile.username;
    v_canonical text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = '28000';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM profile.username AS u
        WHERE u.user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Username already set for this user'
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Optional belt-and-suspenders normalization prior to delegation
    v_canonical := profile.normalize_username(p_username);

    v_row := profile.service_add_username(v_user_id, v_canonical);
    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION profile.proxy_add_username(text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION profile.proxy_add_username(text)
    TO authenticated, service_role;

ALTER FUNCTION profile.proxy_add_username(text) OWNER TO service_role;


-- ===========================================
-- SERVICE FUNCTION: RESERVE USERNAME (SERVICE ROLE ONLY)
-- ===========================================
CREATE OR REPLACE FUNCTION profile.service_reserve_username(
    p_user_id  uuid,
    p_username text
)
RETURNS profile.username_reservation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row       profile.username_reservation;
    v_canonical text;
BEGIN
    -- Normalize + validate input
    v_canonical := profile.normalize_username(p_username);

    -- Serialize on canonical username to avoid races
    PERFORM pg_advisory_xact_lock(hashtext(v_canonical));

    -- Prevent reserving a username that is already claimed
    IF EXISTS (
        SELECT 1
        FROM profile.username AS u
        WHERE u.username = v_canonical
    ) THEN
        RAISE EXCEPTION
            'Cannot reserve username "%": it is already taken.',
            v_canonical
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Insert active reservation; uniqueness constraints enforce:
    --  - one active reservation per username
    --  - one active reservation per (user, username)
    INSERT INTO profile.username_reservation (user_id, reserved_username, is_active)
    VALUES (p_user_id, v_canonical, TRUE)
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION profile.service_reserve_username(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.service_reserve_username(uuid, text)
    TO service_role;

ALTER FUNCTION profile.service_reserve_username(uuid, text) OWNER TO service_role;


-- ===========================================
-- PROXY FUNCTION: AUTH USER -> SERVICE RESERVATION FUNCTION
-- ===========================================
CREATE OR REPLACE FUNCTION profile.proxy_reserve_username(
    p_username text
)
RETURNS profile.username_reservation
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id   uuid;
    v_row       profile.username_reservation;
    v_canonical text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = '28000';
    END IF;

    -- Normalize early (belt + suspenders)
    v_canonical := profile.normalize_username(p_username);

    -- Optional: you can check here if this user already has an active
    -- reservation for this username; the unique index will also enforce it.
    IF EXISTS (
        SELECT 1
        FROM profile.username_reservation r
        WHERE r.user_id = v_user_id
          AND r.reserved_username = v_canonical
          AND r.is_active
    ) THEN
        RAISE EXCEPTION
            'You already have an active reservation for username "%"',
            v_canonical
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Delegate to the service-level function
    v_row := profile.service_reserve_username(v_user_id, v_canonical);
    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION profile.proxy_reserve_username(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION profile.proxy_reserve_username(text)
    TO service_role;

ALTER FUNCTION profile.proxy_reserve_username(text) OWNER TO service_role;
GRANT ALL ON SEQUENCE profile.username_reservation_id_seq TO service_role;


-- ===========================================
-- ADMIN FUNCTION: GET USERNAME BY USER ID
-- ===========================================
CREATE OR REPLACE FUNCTION profile.get_username_by_id(
    p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_username text;
BEGIN
    -- Reject NULL input early (belt & suspenders)
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION
            'p_user_id cannot be NULL'
            USING ERRCODE = '22004';
    END IF;

    SELECT u.username
    INTO v_username
    FROM profile.username AS u
    WHERE u.user_id = p_user_id;

    -- Return NULL if no match exists (admin-friendly)
    RETURN v_username;
END;
$$;

-- Lock it down: service_role only
REVOKE ALL ON FUNCTION profile.get_username_by_id(uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION profile.get_username_by_id(uuid)
    TO service_role;

ALTER FUNCTION profile.get_username_by_id(uuid)
    OWNER TO service_role;


-- ===========================================
-- ADMIN FUNCTION: GET USER ID BY USERNAME
-- ===========================================
CREATE OR REPLACE FUNCTION profile.get_id_by_username(
    p_username text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_canonical text;
    v_user_id   uuid;
BEGIN
    -- Normalize + validate the username (belt & suspenders)
    v_canonical := profile.normalize_username(p_username);

    -- Look up the user_id for this canonical username
    SELECT u.user_id
    INTO v_user_id
    FROM profile.username AS u
    WHERE u.username = v_canonical;

    -- If not found, just return NULL (you can change this to RAISE if you prefer)
    RETURN v_user_id;
END;
$$;

-- Lock it down: service_role only
REVOKE ALL ON FUNCTION profile.get_id_by_username(text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION profile.get_id_by_username(text)
    TO service_role;

ALTER FUNCTION profile.get_id_by_username(text)
    OWNER TO service_role;


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

    -- Check: normalize_username exists and is restricted to service_role
    PERFORM 'profile.normalize_username(text)'::regprocedure;

    IF NOT has_function_privilege('service_role', 'profile.normalize_username(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: service_role must retain execute on profile.normalize_username(text).';
    END IF;

    IF has_function_privilege('anon', 'profile.normalize_username(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'profile.normalize_username(text)', 'EXECUTE')
       OR has_function_privilege('public', 'profile.normalize_username(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: profile.normalize_username(text) should not be executable by anon/authenticated/public roles.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE oid = 'profile.normalize_username(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'profile: profile.normalize_username(text) must be owned by service_role to satisfy RLS policy expectations.';
    END IF;

    -- Check: service_add_username exists and is restricted to service_role
    PERFORM 'profile.service_add_username(uuid, text)'::regprocedure;

    IF NOT has_function_privilege('service_role', 'profile.service_add_username(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: service_role must retain execute on profile.service_add_username(uuid, text).';
    END IF;

    IF has_function_privilege('anon', 'profile.service_add_username(uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'profile.service_add_username(uuid, text)', 'EXECUTE')
       OR has_function_privilege('public', 'profile.service_add_username(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: profile.service_add_username(uuid, text) should not be executable by anon/authenticated/public roles.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE oid = 'profile.service_add_username(uuid, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'profile: profile.service_add_username(uuid, text) must be owned by service_role to satisfy RLS policy expectations.';
    END IF;

    -- Check: proxy_add_username exists with expected privileges/ownership
    PERFORM 'profile.proxy_add_username(text)'::regprocedure;

    IF NOT has_function_privilege('service_role', 'profile.proxy_add_username(text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'profile.proxy_add_username(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: proxy_add_username(text) must be callable by service_role and authenticated roles.';
    END IF;

    IF has_function_privilege('anon', 'profile.proxy_add_username(text)', 'EXECUTE')
       OR has_function_privilege('public', 'profile.proxy_add_username(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'profile: proxy_add_username(text) should not be executable by anon/public roles.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE oid = 'profile.proxy_add_username(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'profile: profile.proxy_add_username(text) must be owned by service_role to align with RLS policy.';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

---
-- SELECT profile.service_add_username(
--     'auth-user-uuid-here',
--     'h0lybyte'
-- );
---
