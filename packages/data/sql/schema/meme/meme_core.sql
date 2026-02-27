-- ============================================================
-- MEME CORE SCHEMA
-- Schema setup, shared trigger functions, meme_templates, memes
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

CREATE SCHEMA IF NOT EXISTS meme;
ALTER SCHEMA meme OWNER TO postgres;

GRANT USAGE ON SCHEMA meme TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA meme TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA meme TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA meme TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA meme TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA meme GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA meme GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA meme GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA meme GRANT ALL ON ROUTINES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA meme GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA meme GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA meme GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA meme GRANT ALL ON ROUTINES TO service_role;

-- Feed is publicly readable, so anon + authenticated need USAGE
GRANT USAGE ON SCHEMA meme TO anon, authenticated;

-- ===========================================
-- SHARED TRIGGER FUNCTION: updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION meme.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- ===========================================
-- SHARED VALIDATION FUNCTIONS
-- ===========================================

-- Rejects whitespace-only text, C0/C1 control chars, zero-width chars, and bidi overrides.
-- Allows tab (\x09), newline (\x0A), carriage return (\x0D) for multi-line fields.
CREATE OR REPLACE FUNCTION meme.is_safe_text(txt TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF txt IS NULL THEN RETURN true; END IF;
    -- Reject whitespace-only (spaces, tabs, newlines)
    IF btrim(txt) = '' THEN RETURN false; END IF;
    -- Reject C0 control chars except tab, newline, carriage return; reject DEL
    IF txt ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' THEN RETURN false; END IF;
    -- Reject zero-width chars (ZWSP, ZWNJ, ZWJ, LRM, RLM) and bidi overrides
    IF txt ~ E'[\\u200B\\u200C\\u200D\\u200E\\u200F\\u202A\\u202B\\u202C\\u202D\\u202E\\uFEFF\\u2060\\u2066\\u2067\\u2068\\u2069]' THEN RETURN false; END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION meme.is_safe_text IS 'Belt-and-suspenders text validation: blocks whitespace-only, control chars, zero-width/bidi abuse';

-- Validates URLs: must start with http(s)://, no whitespace or control chars, max 2048 chars.
CREATE OR REPLACE FUNCTION meme.is_safe_url(url TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF url IS NULL THEN RETURN true; END IF;
    IF char_length(url) > 2048 THEN RETURN false; END IF;
    IF url !~ '^https?://.+' THEN RETURN false; END IF;
    -- Reject whitespace (incl. space) and control chars (not valid in URIs per RFC 3986)
    IF url ~ E'[\\x00-\\x20\\x7F]' THEN RETURN false; END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION meme.is_safe_url IS 'URL validation: https required, no whitespace/control chars, max 2048 chars';

-- Validates tags array: max 20 tags, each 1-50 chars, lowercase alphanumeric + hyphens + underscores.
CREATE OR REPLACE FUNCTION meme.are_valid_tags(tags TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    t TEXT;
BEGIN
    IF tags IS NULL OR array_length(tags, 1) IS NULL THEN RETURN true; END IF;
    IF array_length(tags, 1) > 20 THEN RETURN false; END IF;
    FOREACH t IN ARRAY tags LOOP
        IF t IS NULL OR btrim(t) = '' OR char_length(t) > 50 THEN RETURN false; END IF;
        -- Tags must be lowercase slug-safe: [a-z0-9] start, then [a-z0-9_-]
        IF t !~ '^[a-z0-9][a-z0-9_-]*$' THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION meme.are_valid_tags IS 'Tag array validation: max 20 tags, slug-safe lowercase, 1-50 chars each';

-- ===========================================
-- TABLE: meme_templates
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_templates (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200 AND meme.is_safe_text(name)),
    description     TEXT CHECK (description IS NULL OR (char_length(description) <= 2000 AND meme.is_safe_text(description))),
    image_url       TEXT NOT NULL CHECK (meme.is_safe_url(image_url)),
    thumbnail_url   TEXT CHECK (meme.is_safe_url(thumbnail_url)),
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    slots           JSONB NOT NULL DEFAULT '[]'::jsonb,
    usage_count     BIGINT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    tags            TEXT[] NOT NULL DEFAULT '{}' CHECK (meme.are_valid_tags(tags)),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_templates IS 'Reusable meme base images with defined caption slot positions';
COMMENT ON COLUMN meme.meme_templates.slots IS 'JSONB array of TemplateCaptionSlot: {label, default_x, default_y, default_font_size, placeholder, max_width, max_chars}';
COMMENT ON COLUMN meme.meme_templates.tags IS 'Categorization tags e.g. {reaction, drake}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_name_search
    ON meme.meme_templates USING gin (to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_tags
    ON meme.meme_templates USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_usage
    ON meme.meme_templates (usage_count DESC);

-- Trigger
DROP TRIGGER IF EXISTS trigger_meme_templates_updated_at ON meme.meme_templates;
CREATE TRIGGER trigger_meme_templates_updated_at
    BEFORE UPDATE ON meme.meme_templates
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.meme_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_templates;
DROP POLICY IF EXISTS "anon_select_templates" ON meme.meme_templates;
DROP POLICY IF EXISTS "authenticated_select_templates" ON meme.meme_templates;

CREATE POLICY "service_role_full_access" ON meme.meme_templates
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_templates" ON meme.meme_templates
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_templates" ON meme.meme_templates
    FOR SELECT TO authenticated USING (true);

GRANT SELECT ON meme.meme_templates TO anon, authenticated;

-- ===========================================
-- TABLE: memes
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.memes (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title           TEXT CHECK (title IS NULL OR (char_length(title) <= 200 AND meme.is_safe_text(title))),
    template_id     TEXT REFERENCES meme.meme_templates(id) ON DELETE SET NULL,

    -- Proto enum MemeFormat (0-4)
    format          SMALLINT NOT NULL DEFAULT 0
                    CHECK (format BETWEEN 0 AND 4),
    -- Proto enum MemeStatus (0-7)
    status          SMALLINT NOT NULL DEFAULT 1
                    CHECK (status BETWEEN 0 AND 7),

    -- Asset
    asset_url       TEXT NOT NULL CHECK (meme.is_safe_url(asset_url)),
    thumbnail_url   TEXT CHECK (meme.is_safe_url(thumbnail_url)),
    width           INTEGER CHECK (width > 0),
    height          INTEGER CHECK (height > 0),
    file_size       BIGINT CHECK (file_size > 0),

    -- Captions baked into this meme (for re-rendering / accessibility)
    captions        JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Categorization
    tags            TEXT[] NOT NULL DEFAULT '{}' CHECK (meme.are_valid_tags(tags)),
    source_url      TEXT CHECK (meme.is_safe_url(source_url)),
    alt_text        TEXT CHECK (alt_text IS NULL OR (char_length(alt_text) <= 500 AND meme.is_safe_text(alt_text))),

    -- Denormalized engagement counters
    view_count      BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    reaction_count  BIGINT NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    share_count     BIGINT NOT NULL DEFAULT 0 CHECK (share_count >= 0),
    comment_count   BIGINT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    save_count      BIGINT NOT NULL DEFAULT 0 CHECK (save_count >= 0),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,

    -- Deduplication (perceptual hash, hex-encoded)
    content_hash    TEXT CHECK (content_hash IS NULL OR (char_length(content_hash) <= 128 AND content_hash ~ '^[a-f0-9]+$'))
);

COMMENT ON TABLE meme.memes IS 'Core meme entity - the card in the TikTok-style scrolling feed';
COMMENT ON COLUMN meme.memes.format IS 'MemeFormat: 0=unspecified, 1=image, 2=gif, 3=video, 4=webp_anim';
COMMENT ON COLUMN meme.memes.status IS 'MemeStatus: 0=unspecified, 1=draft, 2=pending, 3=published, 4=rejected, 5=archived, 6=flagged, 7=banned';
COMMENT ON COLUMN meme.memes.captions IS 'JSONB array of MemeCaption: {text, position_x, position_y, font_size, font_family, color, stroke_color, stroke_width, rotation, text_align, max_width}';
COMMENT ON COLUMN meme.memes.content_hash IS 'Perceptual hash for image deduplication';

-- Indexes (feed-optimized)

-- Primary feed query: published memes, newest first
CREATE INDEX IF NOT EXISTS idx_meme_memes_feed_new
    ON meme.memes (status, created_at DESC)
    WHERE status = 3;

-- Hot/trending feed: published memes sorted by engagement
CREATE INDEX IF NOT EXISTS idx_meme_memes_feed_hot
    ON meme.memes (status, reaction_count DESC)
    WHERE status = 3;

-- Author profile page: user's memes by status
CREATE INDEX IF NOT EXISTS idx_meme_memes_author_status
    ON meme.memes (author_id, status, created_at DESC);

-- Tag filtering
CREATE INDEX IF NOT EXISTS idx_meme_memes_tags
    ON meme.memes USING gin (tags);

-- Content hash deduplication lookup
CREATE INDEX IF NOT EXISTS idx_meme_memes_content_hash
    ON meme.memes (content_hash)
    WHERE content_hash IS NOT NULL;

-- Template usage tracking
CREATE INDEX IF NOT EXISTS idx_meme_memes_template
    ON meme.memes (template_id)
    WHERE template_id IS NOT NULL;

-- Trigger
DROP TRIGGER IF EXISTS trigger_memes_updated_at ON meme.memes;
CREATE TRIGGER trigger_memes_updated_at
    BEFORE UPDATE ON meme.memes
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.memes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.memes;
DROP POLICY IF EXISTS "anon_select_published" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_select_published_and_own" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_insert_own" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_update_own" ON meme.memes;

CREATE POLICY "service_role_full_access" ON meme.memes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_published" ON meme.memes
    FOR SELECT TO anon
    USING (status = 3);

CREATE POLICY "authenticated_select_published_and_own" ON meme.memes
    FOR SELECT TO authenticated
    USING (status = 3 OR author_id = auth.uid());

CREATE POLICY "authenticated_insert_own" ON meme.memes
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid() AND status = 1);

CREATE POLICY "authenticated_update_own" ON meme.memes
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

GRANT SELECT ON meme.memes TO anon;
GRANT SELECT, INSERT, UPDATE ON meme.memes TO authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    schema_ok BOOLEAN;
    templates_ok BOOLEAN;
    memes_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'meme') INTO schema_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_templates') INTO templates_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'memes') INTO memes_ok;

    IF NOT schema_ok OR NOT templates_ok OR NOT memes_ok THEN
        RAISE EXCEPTION 'meme_core setup failed - schema: %, templates: %, memes: %', schema_ok, templates_ok, memes_ok;
    END IF;

    RAISE NOTICE 'meme_core.sql: schema, meme_templates, and memes tables verified successfully.';
END $$;

COMMIT;
