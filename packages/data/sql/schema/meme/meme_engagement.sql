-- ============================================================
-- MEME ENGAGEMENT SCHEMA
-- Reactions and threaded comments on memes
--
-- Depends on: meme_core.sql (meme.memes table)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: meme_reactions
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_reactions (
    meme_id     TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction    SMALLINT NOT NULL CHECK (reaction BETWEEN 1 AND 6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (meme_id, user_id)
);

COMMENT ON TABLE meme.meme_reactions IS 'Quick-tap reactions on memes - one reaction per user per meme';
COMMENT ON COLUMN meme.meme_reactions.reaction IS 'ReactionType: 1=like, 2=dislike, 3=fire, 4=skull, 5=cry, 6=cap';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_reactions_meme
    ON meme.meme_reactions (meme_id);

CREATE INDEX IF NOT EXISTS idx_meme_meme_reactions_user
    ON meme.meme_reactions (user_id);

-- Counter trigger: memes.reaction_count
CREATE OR REPLACE FUNCTION meme.trg_meme_reactions_counter()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE meme.memes SET reaction_count = reaction_count + 1 WHERE id = NEW.meme_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE meme.memes SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.meme_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_reactions_counter ON meme.meme_reactions;
CREATE TRIGGER trigger_meme_reactions_counter
    AFTER INSERT OR DELETE ON meme.meme_reactions
    FOR EACH ROW
    EXECUTE FUNCTION meme.trg_meme_reactions_counter();

-- RLS
ALTER TABLE meme.meme_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_reactions;
DROP POLICY IF EXISTS "anon_select_reactions" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_select_reactions" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_insert_own_reaction" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_update_own_reaction" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_delete_own_reaction" ON meme.meme_reactions;

CREATE POLICY "service_role_full_access" ON meme.meme_reactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_reactions" ON meme.meme_reactions
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_reactions" ON meme.meme_reactions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_own_reaction" ON meme.meme_reactions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_update_own_reaction" ON meme.meme_reactions
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_delete_own_reaction" ON meme.meme_reactions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT ON meme.meme_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_reactions TO authenticated;

-- ===========================================
-- TABLE: meme_comments
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_comments (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    meme_id         TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    parent_id       TEXT REFERENCES meme.meme_comments(id) ON DELETE CASCADE,
    reaction_count  BIGINT NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    reply_count     INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_comments IS 'Threaded comments on memes with denormalized reply/reaction counters';
COMMENT ON COLUMN meme.meme_comments.parent_id IS 'NULL for top-level comments; ULID of parent for threaded replies';

-- Indexes

-- Top-level comments for a meme, newest first
CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_meme_toplevel
    ON meme.meme_comments (meme_id, created_at DESC)
    WHERE parent_id IS NULL;

-- Threaded replies under a parent comment
CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_parent
    ON meme.meme_comments (parent_id, created_at ASC)
    WHERE parent_id IS NOT NULL;

-- Author lookup
CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_author
    ON meme.meme_comments (author_id);

-- Counter trigger: memes.comment_count + parent reply_count
CREATE OR REPLACE FUNCTION meme.trg_meme_comments_counter()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE meme.memes SET comment_count = comment_count + 1 WHERE id = NEW.meme_id;
        IF NEW.parent_id IS NOT NULL THEN
            UPDATE meme.meme_comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE meme.memes SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.meme_id;
        IF OLD.parent_id IS NOT NULL THEN
            UPDATE meme.meme_comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_comments_counter ON meme.meme_comments;
CREATE TRIGGER trigger_meme_comments_counter
    AFTER INSERT OR DELETE ON meme.meme_comments
    FOR EACH ROW
    EXECUTE FUNCTION meme.trg_meme_comments_counter();

-- Updated_at trigger
DROP TRIGGER IF EXISTS trigger_meme_comments_updated_at ON meme.meme_comments;
CREATE TRIGGER trigger_meme_comments_updated_at
    BEFORE UPDATE ON meme.meme_comments
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.meme_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_comments;
DROP POLICY IF EXISTS "anon_select_comments" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_select_comments" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_insert_own_comment" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_update_own_comment" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_delete_own_comment" ON meme.meme_comments;

CREATE POLICY "service_role_full_access" ON meme.meme_comments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_comments" ON meme.meme_comments
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_comments" ON meme.meme_comments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_own_comment" ON meme.meme_comments
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "authenticated_update_own_comment" ON meme.meme_comments
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "authenticated_delete_own_comment" ON meme.meme_comments
    FOR DELETE TO authenticated
    USING (author_id = auth.uid());

GRANT SELECT ON meme.meme_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_comments TO authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    reactions_ok BOOLEAN;
    comments_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_reactions') INTO reactions_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_comments') INTO comments_ok;

    IF NOT reactions_ok OR NOT comments_ok THEN
        RAISE EXCEPTION 'meme_engagement setup failed - reactions: %, comments: %', reactions_ok, comments_ok;
    END IF;

    RAISE NOTICE 'meme_engagement.sql: meme_reactions and meme_comments verified successfully.';
END $$;

COMMIT;
