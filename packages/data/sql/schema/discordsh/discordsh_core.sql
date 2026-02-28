-- ============================================================
-- DISCORDSH CORE SCHEMA
-- Schema setup, trigger functions, servers table, votes table
--
-- Prerequisite: gen_ulid() must exist (packages/data/sql/old/functions/utils/gen_ulid.sql)
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
-- SCHEMA SETUP
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

-- ===========================================
-- SHARED TRIGGER FUNCTION: updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

-- ===========================================
-- SHARED VALIDATION FUNCTIONS
-- ===========================================

-- Rejects whitespace-only text, C0/C1 control chars, zero-width chars, and bidi overrides.
CREATE OR REPLACE FUNCTION discordsh.is_safe_text(txt TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF txt IS NULL THEN RETURN true; END IF;
    IF btrim(txt) = '' THEN RETURN false; END IF;
    IF txt ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' THEN RETURN false; END IF;
    IF txt ~ E'[\\u200B\\u200C\\u200D\\u200E\\u200F\\u202A\\u202B\\u202C\\u202D\\u202E\\uFEFF\\u2060\\u2066\\u2067\\u2068\\u2069]' THEN RETURN false; END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

-- Validates tags array: max 10 tags, each 1-50 chars, lowercase slug-safe.
CREATE OR REPLACE FUNCTION discordsh.are_valid_tags(tags TEXT[])
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

-- Validates categories array: max 3 categories, values 1-12 (ServerCategory enum).
CREATE OR REPLACE FUNCTION discordsh.are_valid_categories(cats SMALLINT[])
RETURNS BOOLEAN AS $$
DECLARE
    c SMALLINT;
BEGIN
    IF cats IS NULL OR array_length(cats, 1) IS NULL THEN RETURN false; END IF;
    IF array_length(cats, 1) > 3 THEN RETURN false; END IF;
    FOREACH c IN ARRAY cats LOOP
        IF c < 1 OR c > 12 THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION discordsh.are_valid_categories IS 'Category array validation: max 3 categories, values 1-12 mapping to ServerCategory proto enum';

-- ===========================================
-- SHARED PROTECTION: timestamp immutability
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.protect_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := NOW();
        NEW.updated_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

CREATE OR REPLACE FUNCTION discordsh.protect_created_at()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

-- ===========================================
-- TABLE: servers
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
    icon_url        TEXT,
    banner_url      TEXT,

    -- Invite code (alphanumeric, 2-32 chars)
    invite_code     TEXT NOT NULL
                    CHECK (invite_code ~ '^[a-zA-Z0-9_-]{2,32}$'),

    -- Categorization
    -- SMALLINT[] maps to ServerCategory proto enum values (1-12)
    categories      SMALLINT[] NOT NULL DEFAULT '{}'
                    CHECK (discordsh.are_valid_categories(categories)),
    tags            TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (discordsh.are_valid_tags(tags)),

    -- Denormalized counters (managed by triggers)
    vote_count      BIGINT NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
    member_count    BIGINT NOT NULL DEFAULT 0 CHECK (member_count >= 0),
    is_online       BOOLEAN NOT NULL DEFAULT false,

    -- Proto enum ServerStatus (0-4)
    status          SMALLINT NOT NULL DEFAULT 1
                    CHECK (status BETWEEN 0 AND 4),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    bumped_at       TIMESTAMPTZ
);

COMMENT ON TABLE discordsh.servers IS 'Discord server directory listings';
COMMENT ON COLUMN discordsh.servers.server_id IS 'Discord snowflake ID (17-20 digit string)';
COMMENT ON COLUMN discordsh.servers.categories IS 'ServerCategory enum values: 1=gaming, 2=anime, 3=music, 4=tech, 5=art, 6=education, 7=social, 8=programming, 9=memes, 10=crypto, 11=roleplay, 12=nsfw';
COMMENT ON COLUMN discordsh.servers.status IS 'ServerStatus: 0=unspecified, 1=active, 2=pending, 3=hidden, 4=banned';

-- Indexes

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

-- Triggers

DROP TRIGGER IF EXISTS trigger_servers_updated_at ON discordsh.servers;
CREATE TRIGGER trigger_servers_updated_at
    BEFORE UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_servers_protect_timestamps ON discordsh.servers;
CREATE TRIGGER trigger_servers_protect_timestamps
    BEFORE INSERT OR UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_timestamps();

-- Counter + immutable column protection
CREATE OR REPLACE FUNCTION discordsh.protect_servers_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.vote_count  := OLD.vote_count;
    NEW.member_count := OLD.member_count;
    NEW.bumped_at   := OLD.bumped_at;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_servers_protect_columns ON discordsh.servers;
CREATE TRIGGER trigger_servers_protect_columns
    BEFORE UPDATE ON discordsh.servers
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_servers_columns();

-- RLS
ALTER TABLE discordsh.servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.servers;
DROP POLICY IF EXISTS "anon_select_active" ON discordsh.servers;
DROP POLICY IF EXISTS "authenticated_select_active_and_own" ON discordsh.servers;
DROP POLICY IF EXISTS "authenticated_insert_own" ON discordsh.servers;
DROP POLICY IF EXISTS "authenticated_update_own" ON discordsh.servers;

CREATE POLICY "service_role_full_access" ON discordsh.servers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_active" ON discordsh.servers
    FOR SELECT TO anon
    USING (status = 1);

CREATE POLICY "authenticated_select_active_and_own" ON discordsh.servers
    FOR SELECT TO authenticated
    USING (status = 1 OR owner_id = auth.uid());

CREATE POLICY "authenticated_insert_own" ON discordsh.servers
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated_update_own" ON discordsh.servers
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

GRANT SELECT ON discordsh.servers TO anon;
GRANT SELECT, INSERT, UPDATE ON discordsh.servers TO authenticated;

-- ===========================================
-- TABLE: votes
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.votes (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    server_id       TEXT NOT NULL REFERENCES discordsh.servers(server_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discordsh.votes IS 'User votes for servers. 12h cooldown per user per server enforced by function.';

-- Unique constraint: one vote per user per server within cooldown window
-- (actual cooldown enforced by the vote function, this prevents exact duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_votes_user_server
    ON discordsh.votes (server_id, user_id);

-- Timestamp protection
DROP TRIGGER IF EXISTS trigger_votes_protect_created_at ON discordsh.votes;
CREATE TRIGGER trigger_votes_protect_created_at
    BEFORE INSERT OR UPDATE ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.protect_created_at();

-- Auto-increment vote_count on servers when a vote is inserted
CREATE OR REPLACE FUNCTION discordsh.increment_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discordsh.servers
    SET vote_count = vote_count + 1
    WHERE server_id = NEW.server_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_votes_increment ON discordsh.votes;
CREATE TRIGGER trigger_votes_increment
    AFTER INSERT ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.increment_vote_count();

-- Auto-decrement vote_count on vote deletion
CREATE OR REPLACE FUNCTION discordsh.decrement_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discordsh.servers
    SET vote_count = GREATEST(vote_count - 1, 0)
    WHERE server_id = OLD.server_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_votes_decrement ON discordsh.votes;
CREATE TRIGGER trigger_votes_decrement
    AFTER DELETE ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.decrement_vote_count();

-- Vote cooldown function: 12 hours per user per server
CREATE OR REPLACE FUNCTION discordsh.cast_vote(p_server_id TEXT, p_user_id UUID)
RETURNS TABLE(success BOOLEAN, vote_id TEXT, message TEXT) AS $$
DECLARE
    v_last_vote TIMESTAMPTZ;
    v_id TEXT;
BEGIN
    -- Check cooldown
    SELECT v.created_at INTO v_last_vote
    FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id
    ORDER BY v.created_at DESC
    LIMIT 1;

    IF v_last_vote IS NOT NULL AND v_last_vote > NOW() - INTERVAL '12 hours' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Vote cooldown active. Try again later.'::TEXT;
        RETURN;
    END IF;

    -- Delete any existing vote (replace model)
    DELETE FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id;

    -- Insert new vote
    INSERT INTO discordsh.votes (server_id, user_id)
    VALUES (p_server_id, p_user_id)
    RETURNING id INTO v_id;

    RETURN QUERY SELECT true, v_id, 'Vote recorded.'::TEXT;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

COMMENT ON FUNCTION discordsh.cast_vote IS 'Cast a vote for a server with 12h cooldown per user per server';

-- RLS for votes
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

GRANT SELECT ON discordsh.votes TO anon, authenticated;
-- Votes are cast via the cast_vote function (SECURITY DEFINER), not direct INSERT

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    schema_ok BOOLEAN;
    servers_ok BOOLEAN;
    votes_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'discordsh') INTO schema_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'discordsh' AND table_name = 'servers') INTO servers_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'discordsh' AND table_name = 'votes') INTO votes_ok;

    IF NOT schema_ok OR NOT servers_ok OR NOT votes_ok THEN
        RAISE EXCEPTION 'discordsh_core setup failed - schema: %, servers: %, votes: %', schema_ok, servers_ok, votes_ok;
    END IF;

    RAISE NOTICE 'discordsh_core.sql: schema, servers, and votes tables verified successfully.';
END $$;

COMMIT;
