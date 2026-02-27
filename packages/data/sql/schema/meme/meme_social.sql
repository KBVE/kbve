-- ============================================================
-- MEME SOCIAL SCHEMA
-- User profiles, follows, collections, saves
--
-- Depends on: meme_core.sql (meme.memes table)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: meme_user_profiles
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_user_profiles (
    user_id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name                TEXT,
    avatar_url                  TEXT,
    bio                         TEXT CHECK (bio IS NULL OR char_length(bio) <= 500),

    -- Aggregate stats (denormalized)
    total_memes                 BIGINT NOT NULL DEFAULT 0 CHECK (total_memes >= 0),
    total_reactions_received    BIGINT NOT NULL DEFAULT 0 CHECK (total_reactions_received >= 0),
    total_views_received        BIGINT NOT NULL DEFAULT 0 CHECK (total_views_received >= 0),
    follower_count              INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
    following_count             INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),

    joined_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_user_profiles IS 'Meme.sh user profile with aggregated engagement stats';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_user_profiles_display_name
    ON meme.meme_user_profiles (display_name)
    WHERE display_name IS NOT NULL;

-- Trigger
DROP TRIGGER IF EXISTS trigger_meme_user_profiles_updated_at ON meme.meme_user_profiles;
CREATE TRIGGER trigger_meme_user_profiles_updated_at
    BEFORE UPDATE ON meme.meme_user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.meme_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "anon_select_profiles" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "authenticated_select_profiles" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "authenticated_update_own_profile" ON meme.meme_user_profiles;

CREATE POLICY "service_role_full_access" ON meme.meme_user_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_profiles" ON meme.meme_user_profiles
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_profiles" ON meme.meme_user_profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Profile INSERT is service_role only (auto-created on first login)
GRANT SELECT ON meme.meme_user_profiles TO anon;
GRANT SELECT, UPDATE ON meme.meme_user_profiles TO authenticated;

-- ===========================================
-- TABLE: meme_follows
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_follows (
    follower_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

COMMENT ON TABLE meme.meme_follows IS 'User follow relationships for meme.sh social graph';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_follows_following
    ON meme.meme_follows (following_id);

-- Counter trigger: meme_user_profiles.follower_count / following_count
CREATE OR REPLACE FUNCTION meme.trg_meme_follows_counter()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE meme.meme_user_profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
        UPDATE meme.meme_user_profiles SET follower_count = follower_count + 1 WHERE user_id = NEW.following_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE meme.meme_user_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = OLD.follower_id;
        UPDATE meme.meme_user_profiles SET follower_count = GREATEST(follower_count - 1, 0) WHERE user_id = OLD.following_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_follows_counter ON meme.meme_follows;
CREATE TRIGGER trigger_meme_follows_counter
    AFTER INSERT OR DELETE ON meme.meme_follows
    FOR EACH ROW
    EXECUTE FUNCTION meme.trg_meme_follows_counter();

-- RLS
ALTER TABLE meme.meme_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_follows;
DROP POLICY IF EXISTS "anon_select_follows" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_select_follows" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_insert_own_follow" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_delete_own_follow" ON meme.meme_follows;

CREATE POLICY "service_role_full_access" ON meme.meme_follows
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_follows" ON meme.meme_follows
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_follows" ON meme.meme_follows
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_own_follow" ON meme.meme_follows
    FOR INSERT TO authenticated
    WITH CHECK (follower_id = auth.uid());

CREATE POLICY "authenticated_delete_own_follow" ON meme.meme_follows
    FOR DELETE TO authenticated
    USING (follower_id = auth.uid());

GRANT SELECT ON meme.meme_follows TO anon;
GRANT SELECT, INSERT, DELETE ON meme.meme_follows TO authenticated;

-- ===========================================
-- TABLE: meme_collections
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_collections (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description     TEXT,
    cover_meme_id   TEXT REFERENCES meme.memes(id) ON DELETE SET NULL,
    is_public       BOOLEAN NOT NULL DEFAULT false,
    meme_count      INTEGER NOT NULL DEFAULT 0 CHECK (meme_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_collections IS 'User-curated meme collections / folders';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_collections_owner
    ON meme.meme_collections (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meme_meme_collections_public
    ON meme.meme_collections (is_public, created_at DESC)
    WHERE is_public = true;

-- Trigger
DROP TRIGGER IF EXISTS trigger_meme_collections_updated_at ON meme.meme_collections;
CREATE TRIGGER trigger_meme_collections_updated_at
    BEFORE UPDATE ON meme.meme_collections
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.meme_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_collections;
DROP POLICY IF EXISTS "anon_select_public_collections" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_select_public_and_own" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_insert_own_collection" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_update_own_collection" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_delete_own_collection" ON meme.meme_collections;

CREATE POLICY "service_role_full_access" ON meme.meme_collections
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_public_collections" ON meme.meme_collections
    FOR SELECT TO anon USING (is_public = true);

CREATE POLICY "authenticated_select_public_and_own" ON meme.meme_collections
    FOR SELECT TO authenticated
    USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "authenticated_insert_own_collection" ON meme.meme_collections
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated_update_own_collection" ON meme.meme_collections
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated_delete_own_collection" ON meme.meme_collections
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

GRANT SELECT ON meme.meme_collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_collections TO authenticated;

-- ===========================================
-- TABLE: meme_saves
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_saves (
    meme_id         TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    collection_id   TEXT REFERENCES meme.meme_collections(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meme.meme_saves IS 'Meme bookmarks/saves - NULL collection_id = default "Saved" bucket';

-- One save per meme per user per collection (NULL collection = default saves)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_saves_unique
    ON meme.meme_saves (meme_id, user_id, COALESCE(collection_id, '__default__'));

-- User's saved memes
CREATE INDEX IF NOT EXISTS idx_meme_meme_saves_user
    ON meme.meme_saves (user_id, created_at DESC);

-- Collection contents
CREATE INDEX IF NOT EXISTS idx_meme_meme_saves_collection
    ON meme.meme_saves (collection_id, created_at DESC)
    WHERE collection_id IS NOT NULL;

-- Counter trigger: memes.save_count + collections.meme_count
CREATE OR REPLACE FUNCTION meme.trg_meme_saves_counter()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE meme.memes SET save_count = save_count + 1 WHERE id = NEW.meme_id;
        IF NEW.collection_id IS NOT NULL THEN
            UPDATE meme.meme_collections SET meme_count = meme_count + 1 WHERE id = NEW.collection_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE meme.memes SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.meme_id;
        IF OLD.collection_id IS NOT NULL THEN
            UPDATE meme.meme_collections SET meme_count = GREATEST(meme_count - 1, 0) WHERE id = OLD.collection_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_saves_counter ON meme.meme_saves;
CREATE TRIGGER trigger_meme_saves_counter
    AFTER INSERT OR DELETE ON meme.meme_saves
    FOR EACH ROW
    EXECUTE FUNCTION meme.trg_meme_saves_counter();

-- RLS
ALTER TABLE meme.meme_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_select_own_saves" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_insert_own_save" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_delete_own_save" ON meme.meme_saves;

CREATE POLICY "service_role_full_access" ON meme.meme_saves
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_own_saves" ON meme.meme_saves
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "authenticated_insert_own_save" ON meme.meme_saves
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_delete_own_save" ON meme.meme_saves
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON meme.meme_saves TO authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    profiles_ok BOOLEAN;
    follows_ok BOOLEAN;
    collections_ok BOOLEAN;
    saves_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_user_profiles') INTO profiles_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_follows') INTO follows_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_collections') INTO collections_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_saves') INTO saves_ok;

    IF NOT profiles_ok OR NOT follows_ok OR NOT collections_ok OR NOT saves_ok THEN
        RAISE EXCEPTION 'meme_social setup failed - profiles: %, follows: %, collections: %, saves: %',
            profiles_ok, follows_ok, collections_ok, saves_ok;
    END IF;

    RAISE NOTICE 'meme_social.sql: meme_user_profiles, meme_follows, meme_collections, and meme_saves verified successfully.';
END $$;

COMMIT;
