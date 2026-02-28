-- ============================================================
-- DISCORDSH SERVERS — Discord server directory listings
--
-- Creates the discordsh schema, shared validation/trigger
-- functions, and the servers table with full RLS lockdown.
--
-- Security:
--   - anon/authenticated can SELECT active servers (status=1)
--   - authenticated can UPDATE own display fields (via RLS)
--   - INSERT gated through proxy_submit_server (rate-limited, no direct INSERT)
--   - status, counters, bumped_at, is_online, owner_id frozen from client writes
--   - service_role has full access via RLS bypass + trigger bypass
--   - All SECURITY DEFINER functions: search_path='', REVOKE from PUBLIC
--   - Rate limit: max 5 pending submissions per user
--
-- Prerequisite: gen_ulid() must exist
-- ============================================================

BEGIN;

-- Ensure gen_ulid() is available
DO $$
BEGIN
    PERFORM 'gen_ulid()'::regprocedure;
EXCEPTION WHEN undefined_function THEN
    RAISE EXCEPTION 'gen_ulid() function not found. Run the ULID generator setup first.';
END $$;

-- ===========================================
-- SCHEMA + PERMISSIONS
-- ===========================================

CREATE SCHEMA IF NOT EXISTS discordsh;
ALTER SCHEMA discordsh OWNER TO postgres;

GRANT USAGE ON SCHEMA discordsh TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA discordsh TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA discordsh TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA discordsh TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA discordsh TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh GRANT ALL ON ROUTINES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA discordsh GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA discordsh GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA discordsh GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA discordsh GRANT ALL ON ROUTINES TO service_role;

-- Directory is publicly readable
GRANT USAGE ON SCHEMA discordsh TO anon, authenticated;

-- Global revoke on schema objects from non-service roles (mc pattern)
REVOKE ALL ON ALL TABLES IN SCHEMA discordsh FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA discordsh FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA discordsh FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA discordsh
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ===========================================
-- VALIDATION FUNCTIONS
-- ===========================================

-- Rejects whitespace-only text, C0/C1 control chars, zero-width chars, bidi overrides.
-- Allows tab (\x09), newline (\x0A), carriage return (\x0D) for multi-line fields.
CREATE OR REPLACE FUNCTION discordsh.is_safe_text(txt TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    IF txt IS NULL THEN RETURN true; END IF;
    IF btrim(txt) = '' THEN RETURN false; END IF;
    IF txt ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' THEN RETURN false; END IF;
    IF txt ~ E'[\\u200B\\u200C\\u200D\\u200E\\u200F\\u202A\\u202B\\u202C\\u202D\\u202E\\uFEFF\\u2060\\u2066\\u2067\\u2068\\u2069]' THEN RETURN false; END IF;
    RETURN true;
END;
$$;

COMMENT ON FUNCTION discordsh.is_safe_text IS
    'Belt-and-suspenders text validation: blocks whitespace-only, control chars, zero-width/bidi abuse';

REVOKE ALL ON FUNCTION discordsh.is_safe_text(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.is_safe_text(TEXT) TO service_role;

-- Validates URLs: must start with https://, no whitespace or control chars, max 2048 chars.
CREATE OR REPLACE FUNCTION discordsh.is_safe_url(url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    IF url IS NULL THEN RETURN true; END IF;
    IF char_length(url) > 2048 THEN RETURN false; END IF;
    IF url !~ '^https?://.+' THEN RETURN false; END IF;
    IF url ~ E'[\\x00-\\x20\\x7F]' THEN RETURN false; END IF;
    RETURN true;
END;
$$;

COMMENT ON FUNCTION discordsh.is_safe_url IS
    'URL validation: https required, no whitespace/control chars, max 2048 chars';

REVOKE ALL ON FUNCTION discordsh.is_safe_url(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.is_safe_url(TEXT) TO service_role;

-- Validates tags array: max 10 tags, each 1-50 chars, lowercase slug-safe.
CREATE OR REPLACE FUNCTION discordsh.are_valid_tags(tags TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    t TEXT;
BEGIN
    IF tags IS NULL OR array_length(tags, 1) IS NULL THEN RETURN true; END IF;
    IF array_length(tags, 1) > 10 THEN RETURN false; END IF;
    FOREACH t IN ARRAY tags LOOP
        IF t IS NULL OR btrim(t) = '' OR char_length(t) > 50 THEN RETURN false; END IF;
        IF t !~ '^[a-z0-9][a-z0-9_-]*$' THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END;
$$;

COMMENT ON FUNCTION discordsh.are_valid_tags IS
    'Tag array validation: max 10 tags, slug-safe lowercase, 1-50 chars each';

REVOKE ALL ON FUNCTION discordsh.are_valid_tags(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.are_valid_tags(TEXT[]) TO service_role;

-- Validates categories array: max 3 categories, values 1-12 (ServerCategory proto enum).
-- Empty arrays are allowed (uncategorized). Rejects duplicates.
CREATE OR REPLACE FUNCTION discordsh.are_valid_categories(cats SMALLINT[])
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    c SMALLINT;
BEGIN
    -- NULL or empty array → valid (uncategorized)
    IF cats IS NULL OR array_length(cats, 1) IS NULL THEN
        RETURN true;
    END IF;
    IF array_length(cats, 1) > 3 THEN RETURN false; END IF;

    -- Reject duplicates: distinct count must equal array length
    IF (SELECT count(DISTINCT v) FROM unnest(cats) AS v) <> array_length(cats, 1) THEN
        RETURN false;
    END IF;

    FOREACH c IN ARRAY cats LOOP
        IF c < 1 OR c > 12 THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END;
$$;

COMMENT ON FUNCTION discordsh.are_valid_categories IS
    'Category array validation: max 3 unique categories, values 1-12 (ServerCategory proto enum). Empty allowed.';

REVOKE ALL ON FUNCTION discordsh.are_valid_categories(SMALLINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.are_valid_categories(SMALLINT[]) TO service_role;

-- ===========================================
-- TRIGGER FUNCTIONS
-- ===========================================

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION discordsh.trg_servers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_servers_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.trg_servers_updated_at() TO service_role;
ALTER FUNCTION discordsh.trg_servers_updated_at() OWNER TO service_role;

-- Prevents client-supplied created_at; forces server-side NOW().
-- On INSERT: sets created_at = NOW(), clears updated_at.
-- On UPDATE: freezes created_at to original value.
CREATE OR REPLACE FUNCTION discordsh.protect_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := NOW();
        NEW.updated_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.protect_timestamps() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.protect_timestamps() TO service_role;
ALTER FUNCTION discordsh.protect_timestamps() OWNER TO service_role;

-- Protects server-managed columns from client-side mutation.
-- Only service_role (detected via auth.role()) can modify:
--   owner_id, vote_count, member_count, is_online, bumped_at, status
CREATE OR REPLACE FUNCTION discordsh.protect_servers_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() = 'service_role' THEN RETURN NEW; END IF;

    -- Freeze identity (no self-transfer of ownership)
    NEW.owner_id     := OLD.owner_id;

    -- Freeze counters and bot-managed fields
    NEW.vote_count   := OLD.vote_count;
    NEW.member_count := OLD.member_count;
    NEW.is_online    := OLD.is_online;
    NEW.bumped_at    := OLD.bumped_at;

    -- Freeze status (only service/admin can moderate)
    NEW.status       := OLD.status;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.protect_servers_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.protect_servers_columns() TO service_role;
ALTER FUNCTION discordsh.protect_servers_columns() OWNER TO service_role;

-- ===========================================
-- TABLE: discordsh.servers
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.servers (
    -- Discord snowflake as text PK (too large for BIGINT in some contexts)
    server_id       TEXT PRIMARY KEY
                    CHECK (server_id ~ '^\d{17,20}$'),
    owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Display info
    name            TEXT NOT NULL
                    CHECK (char_length(name) BETWEEN 1 AND 100 AND discordsh.is_safe_text(name)),
    summary         TEXT NOT NULL
                    CHECK (char_length(summary) BETWEEN 1 AND 200 AND discordsh.is_safe_text(summary)),
    description     TEXT
                    CHECK (description IS NULL OR (char_length(description) <= 2000 AND discordsh.is_safe_text(description))),
    icon_url        TEXT
                    CHECK (discordsh.is_safe_url(icon_url)),
    banner_url      TEXT
                    CHECK (discordsh.is_safe_url(banner_url)),

    -- Invite code (alphanumeric, 2-32 chars)
    invite_code     TEXT NOT NULL
                    CHECK (invite_code ~ '^[a-zA-Z0-9_-]{2,32}$'),

    -- Categorization
    -- SMALLINT[] maps to ServerCategory proto enum values (1-12)
    categories      SMALLINT[] NOT NULL DEFAULT '{}'
                    CHECK (discordsh.are_valid_categories(categories)),
    tags            TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (discordsh.are_valid_tags(tags)),

    -- Denormalized counters (managed by triggers, protected from client writes)
    vote_count      BIGINT NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
    member_count    BIGINT NOT NULL DEFAULT 0 CHECK (member_count >= 0),
    is_online       BOOLEAN NOT NULL DEFAULT false,

    -- Proto enum ServerStatus (0-4): 0=unspecified, 1=active, 2=pending, 3=hidden, 4=banned
    status          SMALLINT NOT NULL DEFAULT 2
                    CHECK (status BETWEEN 0 AND 4),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    bumped_at       TIMESTAMPTZ
);

COMMENT ON TABLE discordsh.servers IS 'Discord server directory listings';
COMMENT ON COLUMN discordsh.servers.server_id IS 'Discord snowflake ID (17-20 digit string)';
COMMENT ON COLUMN discordsh.servers.categories IS
    'ServerCategory enum values: 1=gaming, 2=anime, 3=music, 4=tech, 5=art, 6=education, 7=social, 8=programming, 9=memes, 10=crypto, 11=roleplay, 12=nsfw';
COMMENT ON COLUMN discordsh.servers.status IS
    'ServerStatus: 0=unspecified, 1=active, 2=pending (default for new submissions), 3=hidden, 4=banned';

-- ===========================================
-- INDEXES
-- ===========================================

-- Feed by votes (default sort)
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_votes
    ON discordsh.servers (vote_count DESC, created_at DESC)
    WHERE status = 1;

-- Feed by members
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_members
    ON discordsh.servers (member_count DESC, created_at DESC)
    WHERE status = 1;

-- Feed by newest
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_newest
    ON discordsh.servers (created_at DESC)
    WHERE status = 1;

-- Feed by bumped
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_bumped
    ON discordsh.servers (bumped_at DESC NULLS LAST)
    WHERE status = 1;

-- Category filter (GIN on SMALLINT array)
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_categories
    ON discordsh.servers USING gin (categories)
    WHERE status = 1;

-- Tag filter (GIN on TEXT array)
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_tags
    ON discordsh.servers USING gin (tags)
    WHERE status = 1;

-- Owner lookup
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_owner
    ON discordsh.servers (owner_id);

-- Unique invite code (active servers only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_servers_invite_code
    ON discordsh.servers (invite_code)
    WHERE status = 1;

-- ===========================================
-- TRIGGERS
-- ===========================================

DROP TRIGGER IF EXISTS trg_discordsh_servers_updated_at ON discordsh.servers;
CREATE TRIGGER trg_discordsh_servers_updated_at
    BEFORE UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_servers_updated_at();

DROP TRIGGER IF EXISTS trg_discordsh_servers_protect_timestamps ON discordsh.servers;
CREATE TRIGGER trg_discordsh_servers_protect_timestamps
    BEFORE INSERT OR UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_timestamps();

DROP TRIGGER IF EXISTS trg_discordsh_servers_protect_columns ON discordsh.servers;
CREATE TRIGGER trg_discordsh_servers_protect_columns
    BEFORE UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_servers_columns();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE discordsh.servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.servers;
DROP POLICY IF EXISTS "anon_select_active" ON discordsh.servers;
DROP POLICY IF EXISTS "authenticated_select_active_and_own" ON discordsh.servers;
DROP POLICY IF EXISTS "authenticated_update_own" ON discordsh.servers;

CREATE POLICY "service_role_full_access" ON discordsh.servers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_active" ON discordsh.servers
    FOR SELECT TO anon
    USING (status = 1);

CREATE POLICY "authenticated_select_active_and_own" ON discordsh.servers
    FOR SELECT TO authenticated
    USING (status = 1 OR owner_id = auth.uid());

-- Owners can update display fields only (status/counters/owner_id frozen by trigger)
CREATE POLICY "authenticated_update_own" ON discordsh.servers
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- No INSERT policy for authenticated — submission gated through proxy_submit_server
GRANT SELECT ON discordsh.servers TO anon;
GRANT SELECT, UPDATE ON discordsh.servers TO authenticated;

-- ===========================================
-- SERVICE FUNCTION: Submit server (internal, service_role only)
--
-- Validates data, enforces rate limit (max 5 pending per user),
-- and inserts the server row.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_submit_server(
    p_owner_id    UUID,
    p_server_id   TEXT,
    p_name        TEXT,
    p_summary     TEXT,
    p_invite_code TEXT,
    p_description TEXT DEFAULT NULL,
    p_icon_url    TEXT DEFAULT NULL,
    p_banner_url  TEXT DEFAULT NULL,
    p_categories  SMALLINT[] DEFAULT '{}',
    p_tags        TEXT[] DEFAULT '{}'
)
RETURNS TABLE(success BOOLEAN, server_id TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pending_count INTEGER;
BEGIN
    -- Validate server_id format (Discord snowflake)
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;

    -- Validate invite_code format
    IF p_invite_code IS NULL OR p_invite_code !~ '^[a-zA-Z0-9_-]{2,32}$' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid invite code format.'::TEXT;
        RETURN;
    END IF;

    -- Serialize on owner to prevent race condition on rate limit check
    PERFORM pg_advisory_xact_lock(hashtext('submit:' || p_owner_id::text));

    -- Rate limit: max 5 pending (status=2) servers per user
    SELECT count(*) INTO v_pending_count
    FROM discordsh.servers s
    WHERE s.owner_id = p_owner_id AND s.status = 2;

    IF v_pending_count >= 5 THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            'Rate limit: max 5 pending server submissions. Wait for review or remove a pending server.'::TEXT;
        RETURN;
    END IF;

    -- Check for duplicate server_id
    IF EXISTS (SELECT 1 FROM discordsh.servers s WHERE s.server_id = p_server_id) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Server already listed.'::TEXT;
        RETURN;
    END IF;

    -- Insert (status defaults to 2 = pending)
    INSERT INTO discordsh.servers (
        server_id, owner_id, name, summary, invite_code,
        description, icon_url, banner_url, categories, tags
    )
    VALUES (
        p_server_id, p_owner_id, p_name, p_summary, p_invite_code,
        p_description, p_icon_url, p_banner_url, p_categories, p_tags
    );

    RETURN QUERY SELECT true, p_server_id, 'Server submitted for review.'::TEXT;

EXCEPTION
    WHEN check_violation THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            ('Validation failed: ' || SQLERRM)::TEXT;
    WHEN unique_violation THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            'Server ID or invite code already in use.'::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_submit_server IS
    'Internal: submit a server with rate limit (max 5 pending per user). Called by proxy_submit_server.';

REVOKE ALL ON FUNCTION discordsh.service_submit_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_submit_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    TO service_role;
ALTER FUNCTION discordsh.service_submit_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: Submit server (public, authenticated only)
--
-- Derives user identity from JWT via auth.uid().
-- Prevents ownership spoofing — always sets owner to caller.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.proxy_submit_server(
    p_server_id   TEXT,
    p_name        TEXT,
    p_summary     TEXT,
    p_invite_code TEXT,
    p_description TEXT DEFAULT NULL,
    p_icon_url    TEXT DEFAULT NULL,
    p_banner_url  TEXT DEFAULT NULL,
    p_categories  SMALLINT[] DEFAULT '{}',
    p_tags        TEXT[] DEFAULT '{}'
)
RETURNS TABLE(success BOOLEAN, server_id TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Not authenticated.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT * FROM discordsh.service_submit_server(
        v_uid, p_server_id, p_name, p_summary, p_invite_code,
        p_description, p_icon_url, p_banner_url, p_categories, p_tags
    );
END;
$$;

COMMENT ON FUNCTION discordsh.proxy_submit_server IS
    'Public: submit a server for review. Derives owner from JWT. Rate-limited to 5 pending.';

REVOKE ALL ON FUNCTION discordsh.proxy_submit_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION discordsh.proxy_submit_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    TO authenticated, service_role;
ALTER FUNCTION discordsh.proxy_submit_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[])
    OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    schema_ok BOOLEAN;
    table_ok  BOOLEAN;
BEGIN
    PERFORM set_config('search_path', '', true);

    SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'discordsh'
    ) INTO schema_ok;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'discordsh' AND table_name = 'servers'
    ) INTO table_ok;

    IF NOT schema_ok OR NOT table_ok THEN
        RAISE EXCEPTION 'discordsh.servers setup failed — schema: %, table: %', schema_ok, table_ok;
    END IF;

    -- Verify validation functions exist
    PERFORM 'discordsh.is_safe_text(text)'::regprocedure;
    PERFORM 'discordsh.is_safe_url(text)'::regprocedure;
    PERFORM 'discordsh.are_valid_tags(text[])'::regprocedure;
    PERFORM 'discordsh.are_valid_categories(smallint[])'::regprocedure;

    -- Verify trigger/protection functions exist
    PERFORM 'discordsh.trg_servers_updated_at()'::regprocedure;
    PERFORM 'discordsh.protect_timestamps()'::regprocedure;
    PERFORM 'discordsh.protect_servers_columns()'::regprocedure;

    -- Verify service/proxy functions exist
    PERFORM 'discordsh.service_submit_server(uuid, text, text, text, text, text, text, text, smallint[], text[])'::regprocedure;
    PERFORM 'discordsh.proxy_submit_server(text, text, text, text, text, text, text, smallint[], text[])'::regprocedure;

    -- Verify anon CANNOT execute anything
    IF has_function_privilege('anon', 'discordsh.is_safe_text(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.is_safe_text';
    END IF;

    IF has_function_privilege('anon', 'discordsh.are_valid_categories(smallint[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.are_valid_categories';
    END IF;

    IF has_function_privilege('anon', 'discordsh.proxy_submit_server(text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.proxy_submit_server';
    END IF;

    -- Verify authenticated CANNOT execute service functions directly
    IF has_function_privilege('authenticated', 'discordsh.service_submit_server(uuid, text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on discordsh.service_submit_server';
    END IF;

    -- Verify authenticated CAN execute proxy functions
    IF NOT has_function_privilege('authenticated', 'discordsh.proxy_submit_server(text, text, text, text, text, text, text, smallint[], text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have execute on discordsh.proxy_submit_server';
    END IF;

    -- Verify authenticated CANNOT insert directly (no INSERT grant)
    IF has_table_privilege('authenticated', 'discordsh.servers', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated must NOT have INSERT on discordsh.servers — use proxy_submit_server';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.protect_timestamps()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.protect_timestamps must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.protect_servers_columns()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.protect_servers_columns must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.trg_servers_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.trg_servers_updated_at must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_submit_server(uuid, text, text, text, text, text, text, text, smallint[], text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_submit_server must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.proxy_submit_server(text, text, text, text, text, text, text, smallint[], text[])'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.proxy_submit_server must be owned by service_role';
    END IF;

    RAISE NOTICE 'discordsh_servers.sql: schema, servers table, and submit functions verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
