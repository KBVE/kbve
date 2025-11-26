BEGIN;

-- ===========================================
-- USERNAME BANLIST TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS profile.username_banlist (
    id          bigserial PRIMARY KEY,
    pattern     text NOT NULL,          -- regex or literal fragment
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
-- UPDATE NORMALIZE FUNCTION TO USE BANLIST
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

    -- NEW: banlist guard (regex/fragment based)
    PERFORM profile.ensure_username_not_banned(v_normalized);

    RETURN v_normalized;
END;
$$;

-- Re-assert permissions/ownership just to be explicit (CREATE OR REPLACE keeps them, but belt & suspenders)
REVOKE ALL ON FUNCTION profile.normalize_username(text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION profile.normalize_username(text)
    TO service_role;

ALTER FUNCTION profile.normalize_username(text)
    OWNER TO service_role;

COMMIT;
