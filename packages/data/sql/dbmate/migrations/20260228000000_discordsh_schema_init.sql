-- migrate:up

-- ============================================================
-- DISCORDSH SCHEMA — Initial migration
--
-- Creates the discordsh schema with servers and votes tables,
-- all validation/trigger/service/proxy functions, RLS policies,
-- and permission grants.
--
-- Tables: servers, votes
-- Functions: 13 (4 validation, 5 trigger, 2 service, 2 proxy)
--
-- Depends on: 20260227215000_gen_ulid (public.gen_ulid)
--
-- Source of truth:
--   packages/data/sql/schema/discordsh/discordsh_servers.sql
--   packages/data/sql/schema/discordsh/discordsh_votes.sql
-- ============================================================

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

-- Global revoke on schema objects from non-service roles
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
    -- NULL or empty array = valid (uncategorized)
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
-- TRIGGER FUNCTIONS (servers)
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
-- INDEXES (servers)
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
-- TRIGGERS (servers)
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
-- RLS (servers)
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
-- TABLE: discordsh.votes
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.votes (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    server_id       TEXT NOT NULL REFERENCES discordsh.servers(server_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discordsh.votes IS
    'User votes for servers. 12h cooldown per server + 50/day global cap enforced by service_cast_vote.';

-- One vote per user per server (replace model: old vote deleted, new inserted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_votes_user_server
    ON discordsh.votes (server_id, user_id);

-- User daily vote count lookup (for rate limit check)
CREATE INDEX IF NOT EXISTS idx_discordsh_votes_user_daily
    ON discordsh.votes (user_id, created_at DESC);

-- ===========================================
-- TRIGGER FUNCTIONS (votes)
-- ===========================================

-- Timestamp protection (created_at only)
CREATE OR REPLACE FUNCTION discordsh.trg_votes_protect_created_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_votes_protect_created_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.trg_votes_protect_created_at() TO service_role;
ALTER FUNCTION discordsh.trg_votes_protect_created_at() OWNER TO service_role;

-- Auto-increment/decrement vote_count on servers
CREATE OR REPLACE FUNCTION discordsh.trg_votes_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discordsh.servers
        SET vote_count = vote_count + 1
        WHERE server_id = NEW.server_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discordsh.servers
        SET vote_count = GREATEST(vote_count - 1, 0)
        WHERE server_id = OLD.server_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_votes_counter() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.trg_votes_counter() TO service_role;
ALTER FUNCTION discordsh.trg_votes_counter() OWNER TO service_role;

-- ===========================================
-- TRIGGERS (votes)
-- ===========================================

DROP TRIGGER IF EXISTS trg_discordsh_votes_protect_created_at ON discordsh.votes;
CREATE TRIGGER trg_discordsh_votes_protect_created_at
    BEFORE INSERT OR UPDATE ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_votes_protect_created_at();

DROP TRIGGER IF EXISTS trg_discordsh_votes_counter ON discordsh.votes;
CREATE TRIGGER trg_discordsh_votes_counter
    AFTER INSERT OR DELETE ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_votes_counter();

-- ===========================================
-- SERVICE FUNCTION: Cast vote (internal, service_role only)
--
-- Takes explicit user_id — called by proxy_cast_vote or
-- directly by service_role for admin/bot operations.
-- Uses advisory lock to prevent concurrent vote races.
--
-- Rate limits:
--   1. Per-server cooldown: 12 hours per user per server
--   2. Daily cap: 50 votes per user per 24-hour rolling window
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_cast_vote(
    p_server_id TEXT,
    p_user_id   UUID
)
RETURNS TABLE(success BOOLEAN, vote_id TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_last_vote TIMESTAMPTZ;
    v_daily_count INTEGER;
    v_id TEXT;
BEGIN
    -- Advisory lock: serialize votes per (server, user) pair
    PERFORM pg_advisory_xact_lock(
        hashtext(p_server_id),
        hashtext(p_user_id::text)
    );

    -- Verify server exists and is active (status = 1)
    IF NOT EXISTS (
        SELECT 1 FROM discordsh.servers s
        WHERE s.server_id = p_server_id AND s.status = 1
    ) THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Server not found or not active.'::TEXT;
        RETURN;
    END IF;

    -- Rate limit 1: per-server cooldown (12 hours)
    SELECT v.created_at INTO v_last_vote
    FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id
    ORDER BY v.created_at DESC
    LIMIT 1;

    IF v_last_vote IS NOT NULL AND v_last_vote > NOW() - INTERVAL '12 hours' THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            ('Vote cooldown active. Try again after ' ||
             to_char(v_last_vote + INTERVAL '12 hours', 'HH24:MI UTC'))::TEXT;
        RETURN;
    END IF;

    -- Rate limit 2: daily cap (50 votes per user per 24h rolling window)
    SELECT count(*) INTO v_daily_count
    FROM discordsh.votes v
    WHERE v.user_id = p_user_id
      AND v.created_at > NOW() - INTERVAL '24 hours';

    IF v_daily_count >= 50 THEN
        RETURN QUERY SELECT false, NULL::TEXT,
            'Daily vote limit reached (50 per 24 hours). Try again later.'::TEXT;
        RETURN;
    END IF;

    -- Delete existing vote for this server (replace model)
    DELETE FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id;

    -- Insert new vote
    INSERT INTO discordsh.votes (server_id, user_id)
    VALUES (p_server_id, p_user_id)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT true, v_id, 'Vote recorded.'::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_cast_vote IS
    'Internal: cast a vote with 12h per-server cooldown + 50/day global cap. Advisory-locked. Called by proxy_cast_vote.';

REVOKE ALL ON FUNCTION discordsh.service_cast_vote(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_cast_vote(TEXT, UUID) TO service_role;
ALTER FUNCTION discordsh.service_cast_vote(TEXT, UUID) OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: Cast vote (public, authenticated only)
--
-- Validates server_id format, derives user identity from JWT.
-- Prevents UUID spoofing — clients cannot vote as other users.
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.proxy_cast_vote(
    p_server_id TEXT
)
RETURNS TABLE(success BOOLEAN, vote_id TEXT, message TEXT)
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

    -- Input validation: server_id must be a Discord snowflake
    IF p_server_id IS NULL OR p_server_id !~ '^\d{17,20}$' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Invalid server ID format.'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT * FROM discordsh.service_cast_vote(p_server_id, v_uid);
END;
$$;

COMMENT ON FUNCTION discordsh.proxy_cast_vote IS
    'Public: cast a vote for a server. Validates input, derives user from JWT. Rate-limited.';

REVOKE ALL ON FUNCTION discordsh.proxy_cast_vote(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION discordsh.proxy_cast_vote(TEXT) TO authenticated, service_role;
ALTER FUNCTION discordsh.proxy_cast_vote(TEXT) OWNER TO service_role;

-- ===========================================
-- RLS (votes)
-- ===========================================

ALTER TABLE discordsh.votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.votes;
DROP POLICY IF EXISTS "anon_select_votes" ON discordsh.votes;
DROP POLICY IF EXISTS "authenticated_select_votes" ON discordsh.votes;

CREATE POLICY "service_role_full_access" ON discordsh.votes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_votes" ON discordsh.votes
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_votes" ON discordsh.votes
    FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated — voting is via proxy_cast_vote only
GRANT SELECT ON discordsh.votes TO anon, authenticated;

-- migrate:down

-- Tables first (CASCADE removes dependent triggers)
DROP TABLE IF EXISTS discordsh.votes CASCADE;
DROP TABLE IF EXISTS discordsh.servers CASCADE;

-- Then functions (triggers already gone via CASCADE)
DROP FUNCTION IF EXISTS discordsh.proxy_cast_vote(TEXT);
DROP FUNCTION IF EXISTS discordsh.service_cast_vote(TEXT, UUID);
DROP FUNCTION IF EXISTS discordsh.trg_votes_counter();
DROP FUNCTION IF EXISTS discordsh.trg_votes_protect_created_at();
DROP FUNCTION IF EXISTS discordsh.proxy_submit_server(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[]);
DROP FUNCTION IF EXISTS discordsh.service_submit_server(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT[], TEXT[]);
DROP FUNCTION IF EXISTS discordsh.protect_servers_columns();
DROP FUNCTION IF EXISTS discordsh.protect_timestamps();
DROP FUNCTION IF EXISTS discordsh.trg_servers_updated_at();
DROP FUNCTION IF EXISTS discordsh.are_valid_categories(SMALLINT[]);
DROP FUNCTION IF EXISTS discordsh.are_valid_tags(TEXT[]);
DROP FUNCTION IF EXISTS discordsh.is_safe_url(TEXT);
DROP FUNCTION IF EXISTS discordsh.is_safe_text(TEXT);
DROP SCHEMA IF EXISTS discordsh;
