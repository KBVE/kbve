-- ============================================================
-- DISCORDSH VOTES — User votes for directory server listings
--
-- 12-hour cooldown per user per server, enforced in SQL.
-- Vote count on servers table is denormalized via triggers.
--
-- Function convention (matches mc schema pattern):
--   service_cast_vote(server_id, user_id) — internal, service_role only
--   proxy_cast_vote(server_id)            — public, derives user from auth.uid()
--
-- Security:
--   - Advisory lock prevents concurrent vote race conditions
--   - service_cast_vote validates server exists and is active
--   - proxy_cast_vote derives identity from JWT (no UUID spoofing)
--   - All trigger functions: REVOKE from PUBLIC, owned by service_role
--   - Votes table: anon/authenticated can SELECT, voting via proxy only
--
-- Depends on: discordsh_servers.sql (discordsh.servers table)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: discordsh.votes
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.votes (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    server_id       TEXT NOT NULL REFERENCES discordsh.servers(server_id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discordsh.votes IS
    'User votes for servers. 12h cooldown per user per server enforced by service_cast_vote.';

-- One vote per user per server (replace model: old vote deleted, new inserted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_discordsh_votes_user_server
    ON discordsh.votes (server_id, user_id);

-- ===========================================
-- TRIGGER: timestamp protection (created_at only)
-- ===========================================

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

DROP TRIGGER IF EXISTS trg_discordsh_votes_protect_created_at ON discordsh.votes;
CREATE TRIGGER trg_discordsh_votes_protect_created_at
    BEFORE INSERT OR UPDATE ON discordsh.votes
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_votes_protect_created_at();

-- ===========================================
-- TRIGGER: auto-increment vote_count on servers
-- ===========================================

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

    -- Check cooldown (12 hours)
    SELECT v.created_at INTO v_last_vote
    FROM discordsh.votes v
    WHERE v.server_id = p_server_id AND v.user_id = p_user_id
    ORDER BY v.created_at DESC
    LIMIT 1;

    IF v_last_vote IS NOT NULL AND v_last_vote > NOW() - INTERVAL '12 hours' THEN
        RETURN QUERY SELECT false, NULL::TEXT, 'Vote cooldown active. Try again later.'::TEXT;
        RETURN;
    END IF;

    -- Delete existing vote (replace model)
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
    'Internal: cast a vote with 12h cooldown. Uses advisory lock for race safety. Called by proxy_cast_vote.';

REVOKE ALL ON FUNCTION discordsh.service_cast_vote(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_cast_vote(TEXT, UUID) TO service_role;
ALTER FUNCTION discordsh.service_cast_vote(TEXT, UUID) OWNER TO service_role;

-- ===========================================
-- PROXY FUNCTION: Cast vote (public, authenticated only)
--
-- Derives user identity from JWT via auth.uid().
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

    RETURN QUERY
    SELECT * FROM discordsh.service_cast_vote(p_server_id, v_uid);
END;
$$;

COMMENT ON FUNCTION discordsh.proxy_cast_vote IS
    'Public: cast a vote for a server. Derives user from JWT. 12h cooldown enforced.';

REVOKE ALL ON FUNCTION discordsh.proxy_cast_vote(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION discordsh.proxy_cast_vote(TEXT) TO authenticated, service_role;
ALTER FUNCTION discordsh.proxy_cast_vote(TEXT) OWNER TO service_role;

-- ===========================================
-- RLS
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

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'discordsh' AND table_name = 'votes'
    ) THEN
        RAISE EXCEPTION 'discordsh.votes table creation failed';
    END IF;

    -- Verify functions exist
    PERFORM 'discordsh.service_cast_vote(text, uuid)'::regprocedure;
    PERFORM 'discordsh.proxy_cast_vote(text)'::regprocedure;
    PERFORM 'discordsh.trg_votes_protect_created_at()'::regprocedure;
    PERFORM 'discordsh.trg_votes_counter()'::regprocedure;

    -- Verify service_role can execute service function
    IF NOT has_function_privilege('service_role', 'discordsh.service_cast_vote(text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on discordsh.service_cast_vote';
    END IF;

    -- Verify anon CANNOT execute any vote functions
    IF has_function_privilege('anon', 'discordsh.service_cast_vote(text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.service_cast_vote';
    END IF;

    IF has_function_privilege('anon', 'discordsh.proxy_cast_vote(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on discordsh.proxy_cast_vote';
    END IF;

    -- Verify authenticated CANNOT execute service function directly
    IF has_function_privilege('authenticated', 'discordsh.service_cast_vote(text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on discordsh.service_cast_vote';
    END IF;

    -- Verify authenticated CAN execute proxy function
    IF NOT has_function_privilege('authenticated', 'discordsh.proxy_cast_vote(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must have execute on discordsh.proxy_cast_vote';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.service_cast_vote(text, uuid)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.service_cast_vote must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.proxy_cast_vote(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.proxy_cast_vote must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.trg_votes_counter()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.trg_votes_counter must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'discordsh.trg_votes_protect_created_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'discordsh.trg_votes_protect_created_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'discordsh_votes.sql: votes table, service_cast_vote, and proxy_cast_vote verified successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
