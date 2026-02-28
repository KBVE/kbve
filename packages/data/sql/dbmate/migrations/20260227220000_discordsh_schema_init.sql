-- migrate:up

-- ============================================================
-- DISCORDSH SCHEMA — Initial migration
--
-- Creates the discordsh schema: servers and votes tables with
-- all functions, triggers, RLS policies, and permission grants.
--
-- Source of truth: packages/data/sql/schema/discordsh/discordsh_core.sql
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

GRANT USAGE ON SCHEMA discordsh TO anon, authenticated;

-- ===========================================
-- FUNCTIONS
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION discordsh.is_safe_text(txt TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF txt IS NULL THEN RETURN true; END IF;
    IF btrim(txt) = '' THEN RETURN false; END IF;
    IF txt ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' THEN RETURN false; END IF;
    IF txt ~ E'[\\u200B\\u200C\\u200D\\u200E\\u200F\\u202A\\u202B\\u202C\\u202D\\u202E\\uFEFF\\u2060\\u2066\\u2067\\u2068\\u2069]' THEN RETURN false; END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

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
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

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
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ===========================================
-- TABLE: servers
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.servers (
    server_id       TEXT PRIMARY KEY CHECK (server_id ~ '^\d{17,20}$'),
    owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND discordsh.is_safe_text(name)),
    summary         TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 200 AND discordsh.is_safe_text(summary)),
    description     TEXT CHECK (description IS NULL OR (char_length(description) <= 2000 AND discordsh.is_safe_text(description))),
    icon_url        TEXT,
    banner_url      TEXT,
    invite_code     TEXT NOT NULL CHECK (invite_code ~ '^[a-zA-Z0-9_-]{2,32}$'),
    categories      SMALLINT[] NOT NULL DEFAULT '{}' CHECK (discordsh.are_valid_categories(categories)),
    tags            TEXT[] NOT NULL DEFAULT '{}' CHECK (discordsh.are_valid_tags(tags)),
    vote_count      BIGINT NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
    member_count    BIGINT NOT NULL DEFAULT 0 CHECK (member_count >= 0),
    is_online       BOOLEAN NOT NULL DEFAULT false,
    status          SMALLINT NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 4),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    bumped_at       TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_votes ON discordsh.servers (vote_count DESC, created_at DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_members ON discordsh.servers (member_count DESC, created_at DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_newest ON discordsh.servers (created_at DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_feed_bumped ON discordsh.servers (bumped_at DESC NULLS LAST) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_categories ON discordsh.servers USING gin (categories) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_tags ON discordsh.servers USING gin (tags) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_discordsh_servers_owner ON discordsh.servers (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_servers_invite_code ON discordsh.servers (invite_code) WHERE status = 1;

-- Triggers
CREATE TRIGGER trigger_servers_updated_at BEFORE UPDATE ON discordsh.servers FOR EACH ROW EXECUTE FUNCTION discordsh.update_updated_at_column();
CREATE TRIGGER trigger_servers_protect_timestamps BEFORE INSERT OR UPDATE ON discordsh.servers FOR EACH ROW EXECUTE FUNCTION discordsh.protect_timestamps();

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

CREATE TRIGGER trigger_servers_protect_columns BEFORE UPDATE ON discordsh.servers FOR EACH ROW EXECUTE FUNCTION discordsh.protect_servers_columns();

-- RLS
ALTER TABLE discordsh.servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON discordsh.servers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_active" ON discordsh.servers FOR SELECT TO anon USING (status = 1);
CREATE POLICY "authenticated_select_active_and_own" ON discordsh.servers FOR SELECT TO authenticated USING (status = 1 OR owner_id = auth.uid());
CREATE POLICY "authenticated_insert_own" ON discordsh.servers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "authenticated_update_own" ON discordsh.servers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_votes_user_server ON discordsh.votes (server_id, user_id);

CREATE TRIGGER trigger_votes_protect_created_at BEFORE INSERT OR UPDATE ON discordsh.votes FOR EACH ROW EXECUTE FUNCTION discordsh.protect_created_at();

-- Vote count triggers
CREATE OR REPLACE FUNCTION discordsh.increment_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discordsh.servers SET vote_count = vote_count + 1 WHERE server_id = NEW.server_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trigger_votes_increment AFTER INSERT ON discordsh.votes FOR EACH ROW EXECUTE FUNCTION discordsh.increment_vote_count();

CREATE OR REPLACE FUNCTION discordsh.decrement_vote_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discordsh.servers SET vote_count = GREATEST(vote_count - 1, 0) WHERE server_id = OLD.server_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trigger_votes_decrement AFTER DELETE ON discordsh.votes FOR EACH ROW EXECUTE FUNCTION discordsh.decrement_vote_count();

-- Vote cooldown function
CREATE OR REPLACE FUNCTION discordsh.cast_vote(p_server_id TEXT, p_user_id UUID)
RETURNS TABLE(success BOOLEAN, vote_id TEXT, message TEXT) AS $$
DECLARE
    v_last_vote TIMESTAMPTZ;
    v_id TEXT;
BEGIN
    SELECT v.created_at INTO v_last_vote
    FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id
    ORDER BY v.created_at DESC LIMIT 1;

    IF v_last_vote IS NOT NULL AND v_last_vote > NOW() - INTERVAL '12 hours' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Vote cooldown active. Try again later.'::TEXT;
        RETURN;
    END IF;

    DELETE FROM discordsh.votes v WHERE v.server_id = p_server_id AND v.user_id = p_user_id;

    INSERT INTO discordsh.votes (server_id, user_id) VALUES (p_server_id, p_user_id) RETURNING id INTO v_id;

    RETURN QUERY SELECT true, v_id, 'Vote recorded.'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- RLS for votes
ALTER TABLE discordsh.votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON discordsh.votes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_votes" ON discordsh.votes FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_votes" ON discordsh.votes FOR SELECT TO authenticated USING (true);
GRANT SELECT ON discordsh.votes TO anon, authenticated;

-- migrate:down

DROP FUNCTION IF EXISTS discordsh.cast_vote(TEXT, UUID);
DROP FUNCTION IF EXISTS discordsh.decrement_vote_count();
DROP FUNCTION IF EXISTS discordsh.increment_vote_count();
DROP TABLE IF EXISTS discordsh.votes;
DROP TABLE IF EXISTS discordsh.servers;
DROP FUNCTION IF EXISTS discordsh.protect_servers_columns();
DROP FUNCTION IF EXISTS discordsh.protect_created_at();
DROP FUNCTION IF EXISTS discordsh.protect_timestamps();
DROP FUNCTION IF EXISTS discordsh.are_valid_categories(SMALLINT[]);
DROP FUNCTION IF EXISTS discordsh.are_valid_tags(TEXT[]);
DROP FUNCTION IF EXISTS discordsh.is_safe_text(TEXT);
DROP FUNCTION IF EXISTS discordsh.update_updated_at_column();
DROP SCHEMA IF EXISTS discordsh;
