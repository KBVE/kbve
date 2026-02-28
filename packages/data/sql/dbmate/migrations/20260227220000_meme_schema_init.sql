-- migrate:up

-- ============================================================
-- MEME SCHEMA — Initial migration
--
-- Creates the full meme schema: templates, memes, card game,
-- social graph, engagement, and moderation tables with all
-- functions, triggers, RLS policies, and permission grants.
--
-- Source of truth: packages/data/sql/schema/meme/
--   meme_core.sql, meme_cards.sql, meme_social.sql,
--   meme_engagement.sql, meme_moderation.sql
--
-- Depends on: 20260227215000_gen_ulid (gen_ulid function)
-- ============================================================

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
SECURITY DEFINER
SET search_path = '';

-- ===========================================
-- SHARED VALIDATION FUNCTIONS
-- ===========================================

CREATE OR REPLACE FUNCTION meme.is_safe_text(txt TEXT)
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

COMMENT ON FUNCTION meme.is_safe_text IS 'Belt-and-suspenders text validation: blocks whitespace-only, control chars, zero-width/bidi abuse';

CREATE OR REPLACE FUNCTION meme.is_safe_url(url TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF url IS NULL THEN RETURN true; END IF;
    IF char_length(url) > 2048 THEN RETURN false; END IF;
    IF url !~ '^https://.+' THEN RETURN false; END IF;
    IF url ~ E'[\\x00-\\x20\\x7F]' THEN RETURN false; END IF;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION meme.is_safe_url IS 'URL validation: https required, no whitespace/control chars, max 2048 chars';

CREATE OR REPLACE FUNCTION meme.are_valid_tags(tags TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    t TEXT;
BEGIN
    IF tags IS NULL OR array_length(tags, 1) IS NULL THEN RETURN true; END IF;
    IF array_length(tags, 1) > 20 THEN RETURN false; END IF;
    FOREACH t IN ARRAY tags LOOP
        IF t IS NULL OR btrim(t) = '' OR char_length(t) > 50 THEN RETURN false; END IF;
        IF t !~ '^[a-z0-9][a-z0-9_-]*$' THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = '';

COMMENT ON FUNCTION meme.are_valid_tags IS 'Tag array validation: max 20 tags, slug-safe lowercase, 1-50 chars each';

-- ===========================================
-- SHARED PROTECTION: timestamp immutability
-- ===========================================

CREATE OR REPLACE FUNCTION meme.protect_timestamps()
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

COMMENT ON FUNCTION meme.protect_timestamps IS 'Prevents client-supplied created_at; forces server-side NOW(). For tables with both created_at and updated_at.';

CREATE OR REPLACE FUNCTION meme.protect_created_at()
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

COMMENT ON FUNCTION meme.protect_created_at IS 'Prevents client-supplied created_at; forces server-side NOW(). For tables without updated_at.';

-- ===========================================
-- SHARED PROTECTION: meme status state machine
-- ===========================================

CREATE OR REPLACE FUNCTION meme.enforce_meme_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;

    IF current_setting('role') = 'service_role' THEN
        IF (OLD.status, NEW.status) IN (
            (1, 2), (1, 5),
            (2, 3), (2, 4),
            (3, 5), (3, 6), (3, 7),
            (4, 1),
            (6, 3), (6, 7)
        ) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status
            USING ERRCODE = '22023';
    END IF;

    IF (OLD.status, NEW.status) IN (
        (1, 2),
        (1, 5),
        (3, 5),
        (4, 1)
    ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Status transition from % to % not allowed', OLD.status, NEW.status
        USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

COMMENT ON FUNCTION meme.enforce_meme_status_transition IS 'State machine: users can submit/archive/revise; only service_role can publish/reject/flag/ban';

-- ===========================================
-- TABLE: meme_templates
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_templates (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200 AND meme.is_safe_text(name)),
    description     TEXT CHECK (description IS NULL OR (char_length(description) <= 2000 AND meme.is_safe_text(description))),
    image_url       TEXT NOT NULL CHECK (meme.is_safe_url(image_url)),
    thumbnail_url   TEXT CHECK (meme.is_safe_url(thumbnail_url)),
    width           INTEGER NOT NULL CHECK (width > 0),
    height          INTEGER NOT NULL CHECK (height > 0),
    slots           JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(slots) = 'array'),
    usage_count     BIGINT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    tags            TEXT[] NOT NULL DEFAULT '{}' CHECK (meme.are_valid_tags(tags)),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_templates IS 'Reusable meme base images with defined caption slot positions';
COMMENT ON COLUMN meme.meme_templates.slots IS 'JSONB array of TemplateCaptionSlot: {label, default_x, default_y, default_font_size, placeholder, max_width, max_chars}';
COMMENT ON COLUMN meme.meme_templates.tags IS 'Categorization tags e.g. {reaction, drake}';

CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_name_search ON meme.meme_templates USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_tags ON meme.meme_templates USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_meme_meme_templates_usage ON meme.meme_templates (usage_count DESC);

DROP TRIGGER IF EXISTS trigger_meme_templates_updated_at ON meme.meme_templates;
CREATE TRIGGER trigger_meme_templates_updated_at BEFORE UPDATE ON meme.meme_templates FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_meme_templates_protect_timestamps ON meme.meme_templates;
CREATE TRIGGER trigger_meme_templates_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_templates FOR EACH ROW EXECUTE FUNCTION meme.protect_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_meme_templates_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.usage_count := OLD.usage_count;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_templates_protect_columns ON meme.meme_templates;
CREATE TRIGGER trigger_meme_templates_protect_columns BEFORE UPDATE ON meme.meme_templates FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_templates_columns();

ALTER TABLE meme.meme_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_templates;
DROP POLICY IF EXISTS "anon_select_templates" ON meme.meme_templates;
DROP POLICY IF EXISTS "authenticated_select_templates" ON meme.meme_templates;

CREATE POLICY "service_role_full_access" ON meme.meme_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_templates" ON meme.meme_templates FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_templates" ON meme.meme_templates FOR SELECT TO authenticated USING (true);

GRANT SELECT ON meme.meme_templates TO anon, authenticated;

-- ===========================================
-- TABLE: memes
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.memes (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title           TEXT CHECK (title IS NULL OR (char_length(title) <= 200 AND meme.is_safe_text(title))),
    template_id     TEXT REFERENCES meme.meme_templates(id) ON DELETE SET NULL,
    format          SMALLINT NOT NULL DEFAULT 0 CHECK (format BETWEEN 0 AND 4),
    status          SMALLINT NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 7),
    asset_url       TEXT NOT NULL CHECK (meme.is_safe_url(asset_url)),
    thumbnail_url   TEXT CHECK (meme.is_safe_url(thumbnail_url)),
    width           INTEGER CHECK (width > 0),
    height          INTEGER CHECK (height > 0),
    file_size       BIGINT CHECK (file_size > 0),
    captions        JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(captions) = 'array'),
    tags            TEXT[] NOT NULL DEFAULT '{}' CHECK (meme.are_valid_tags(tags)),
    source_url      TEXT CHECK (meme.is_safe_url(source_url)),
    alt_text        TEXT CHECK (alt_text IS NULL OR (char_length(alt_text) <= 500 AND meme.is_safe_text(alt_text))),
    view_count      BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    reaction_count  BIGINT NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    share_count     BIGINT NOT NULL DEFAULT 0 CHECK (share_count >= 0),
    comment_count   BIGINT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    save_count      BIGINT NOT NULL DEFAULT 0 CHECK (save_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    content_hash    TEXT CHECK (content_hash IS NULL OR (char_length(content_hash) <= 128 AND content_hash ~ '^[a-f0-9]+$'))
);

COMMENT ON TABLE meme.memes IS 'Core meme entity - the card in the TikTok-style scrolling feed';
COMMENT ON COLUMN meme.memes.format IS 'MemeFormat: 0=unspecified, 1=image, 2=gif, 3=video, 4=webp_anim';
COMMENT ON COLUMN meme.memes.status IS 'MemeStatus: 0=unspecified, 1=draft, 2=pending, 3=published, 4=rejected, 5=archived, 6=flagged, 7=banned';
COMMENT ON COLUMN meme.memes.captions IS 'JSONB array of MemeCaption: {text, position_x, position_y, font_size, font_family, color, stroke_color, stroke_width, rotation, text_align, max_width}';
COMMENT ON COLUMN meme.memes.content_hash IS 'Perceptual hash for image deduplication';

CREATE INDEX IF NOT EXISTS idx_meme_memes_feed_new ON meme.memes (status, created_at DESC) WHERE status = 3;
CREATE INDEX IF NOT EXISTS idx_meme_memes_feed_hot ON meme.memes (status, reaction_count DESC) WHERE status = 3;
CREATE INDEX IF NOT EXISTS idx_meme_memes_author_status ON meme.memes (author_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_memes_tags ON meme.memes USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_meme_memes_content_hash ON meme.memes (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meme_memes_template ON meme.memes (template_id) WHERE template_id IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_memes_updated_at ON meme.memes;
CREATE TRIGGER trigger_memes_updated_at BEFORE UPDATE ON meme.memes FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_memes_protect_timestamps ON meme.memes;
CREATE TRIGGER trigger_memes_protect_timestamps BEFORE INSERT OR UPDATE ON meme.memes FOR EACH ROW EXECUTE FUNCTION meme.protect_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_memes_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.author_id      := OLD.author_id;
    NEW.view_count     := OLD.view_count;
    NEW.reaction_count := OLD.reaction_count;
    NEW.share_count    := OLD.share_count;
    NEW.comment_count  := OLD.comment_count;
    NEW.save_count     := OLD.save_count;
    NEW.published_at   := OLD.published_at;
    NEW.content_hash   := OLD.content_hash;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_memes_protect_columns ON meme.memes;
CREATE TRIGGER trigger_memes_protect_columns BEFORE UPDATE ON meme.memes FOR EACH ROW EXECUTE FUNCTION meme.protect_memes_columns();

DROP TRIGGER IF EXISTS trigger_memes_status_transition ON meme.memes;
CREATE TRIGGER trigger_memes_status_transition BEFORE UPDATE ON meme.memes FOR EACH ROW EXECUTE FUNCTION meme.enforce_meme_status_transition();

ALTER TABLE meme.memes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.memes;
DROP POLICY IF EXISTS "anon_select_published" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_select_published_and_own" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_insert_own" ON meme.memes;
DROP POLICY IF EXISTS "authenticated_update_own" ON meme.memes;

CREATE POLICY "service_role_full_access" ON meme.memes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_published" ON meme.memes FOR SELECT TO anon USING (status = 3);
CREATE POLICY "authenticated_select_published_and_own" ON meme.memes FOR SELECT TO authenticated USING (status = 3 OR author_id = auth.uid());
CREATE POLICY "authenticated_insert_own" ON meme.memes FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND status = 1);
CREATE POLICY "authenticated_update_own" ON meme.memes FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

GRANT SELECT ON meme.memes TO anon;
GRANT SELECT, INSERT, UPDATE ON meme.memes TO authenticated;

-- ===========================================
-- TABLE: meme_card_stats
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_card_stats (
    meme_id         TEXT PRIMARY KEY REFERENCES meme.memes(id) ON DELETE CASCADE,
    rarity          SMALLINT NOT NULL DEFAULT 0 CHECK (rarity BETWEEN 0 AND 6),
    element         SMALLINT NOT NULL DEFAULT 0 CHECK (element BETWEEN 0 AND 8),
    attack          INTEGER NOT NULL DEFAULT 0 CHECK (attack BETWEEN 0 AND 999),
    defense         INTEGER NOT NULL DEFAULT 0 CHECK (defense BETWEEN 0 AND 999),
    hp              INTEGER NOT NULL DEFAULT 1 CHECK (hp BETWEEN 1 AND 9999),
    energy_cost     INTEGER NOT NULL DEFAULT 1 CHECK (energy_cost BETWEEN 0 AND 10),
    abilities       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(abilities) = 'array'),
    flavor_text     TEXT CHECK (flavor_text IS NULL OR (char_length(flavor_text) <= 300 AND meme.is_safe_text(flavor_text))),
    level           INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    xp              BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
    evolves_from    TEXT REFERENCES meme.memes(id) ON DELETE SET NULL,
    evolves_into    TEXT REFERENCES meme.memes(id) ON DELETE SET NULL
);

COMMENT ON TABLE meme.meme_card_stats IS 'Battle card stats for memes minted into the card game layer';
COMMENT ON COLUMN meme.meme_card_stats.rarity IS 'MemeRarity: 0=unspecified, 1=common, 2=uncommon, 3=rare, 4=epic, 5=legendary, 6=mythic';
COMMENT ON COLUMN meme.meme_card_stats.element IS 'MemeElement: 0=unspecified, 1=dank, 2=wholesome, 3=cursed, 4=deep_fried, 5=surreal, 6=meta, 7=edgy, 8=nostalgic';
COMMENT ON COLUMN meme.meme_card_stats.abilities IS 'JSONB array of CardAbility: {name, description, trigger, effect, value, cooldown, duration}';

CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_rarity ON meme.meme_card_stats (rarity);
CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_element ON meme.meme_card_stats (element);
CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_evolves_from ON meme.meme_card_stats (evolves_from) WHERE evolves_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_evolves_into ON meme.meme_card_stats (evolves_into) WHERE evolves_into IS NOT NULL;

ALTER TABLE meme.meme_card_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_card_stats;
DROP POLICY IF EXISTS "anon_select_card_stats" ON meme.meme_card_stats;
DROP POLICY IF EXISTS "authenticated_select_card_stats" ON meme.meme_card_stats;

CREATE POLICY "service_role_full_access" ON meme.meme_card_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_card_stats" ON meme.meme_card_stats FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_card_stats" ON meme.meme_card_stats FOR SELECT TO authenticated USING (true);

GRANT SELECT ON meme.meme_card_stats TO anon, authenticated;

-- ===========================================
-- TABLE: meme_decks
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_decks (
    id          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50 AND meme.is_safe_text(name)),
    is_active   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_decks IS 'Player-built battle decks for the meme card game';

CREATE INDEX IF NOT EXISTS idx_meme_meme_decks_owner ON meme.meme_decks (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_decks_active ON meme.meme_decks (owner_id) WHERE is_active = true;

DROP TRIGGER IF EXISTS trigger_meme_decks_updated_at ON meme.meme_decks;
CREATE TRIGGER trigger_meme_decks_updated_at BEFORE UPDATE ON meme.meme_decks FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_meme_decks_protect_timestamps ON meme.meme_decks;
CREATE TRIGGER trigger_meme_decks_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_decks FOR EACH ROW EXECUTE FUNCTION meme.protect_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_meme_decks_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.owner_id := OLD.owner_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_decks_protect_columns ON meme.meme_decks;
CREATE TRIGGER trigger_meme_decks_protect_columns BEFORE UPDATE ON meme.meme_decks FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_decks_columns();

ALTER TABLE meme.meme_decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_select_own_decks" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_insert_own_deck" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_update_own_deck" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_delete_own_deck" ON meme.meme_decks;

CREATE POLICY "service_role_full_access" ON meme.meme_decks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_decks" ON meme.meme_decks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "authenticated_insert_own_deck" ON meme.meme_decks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "authenticated_update_own_deck" ON meme.meme_decks FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "authenticated_delete_own_deck" ON meme.meme_decks FOR DELETE TO authenticated USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_decks TO authenticated;

-- ===========================================
-- TABLE: meme_deck_cards
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_deck_cards (
    deck_id     TEXT NOT NULL REFERENCES meme.meme_decks(id) ON DELETE CASCADE,
    card_id     TEXT NOT NULL REFERENCES meme.meme_card_stats(meme_id) ON DELETE CASCADE,
    position    SMALLINT,
    PRIMARY KEY (deck_id, card_id)
);

COMMENT ON TABLE meme.meme_deck_cards IS 'Join table: cards in a battle deck';

CREATE INDEX IF NOT EXISTS idx_meme_meme_deck_cards_card ON meme.meme_deck_cards (card_id);

ALTER TABLE meme.meme_deck_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_select_own_deck_cards" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards;

CREATE POLICY "service_role_full_access" ON meme.meme_deck_cards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_deck_cards" ON meme.meme_deck_cards FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM meme.meme_decks d WHERE d.id = deck_id AND d.owner_id = auth.uid()));
CREATE POLICY "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM meme.meme_decks d WHERE d.id = deck_id AND d.owner_id = auth.uid()));
CREATE POLICY "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM meme.meme_decks d WHERE d.id = deck_id AND d.owner_id = auth.uid()));

GRANT SELECT, INSERT, DELETE ON meme.meme_deck_cards TO authenticated;

-- ===========================================
-- TABLE: meme_player_stats
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_player_stats (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_battles   INTEGER NOT NULL DEFAULT 0 CHECK (total_battles >= 0),
    wins            INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses          INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    draws           INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
    elo_rating      INTEGER NOT NULL DEFAULT 1000,
    cards_owned     INTEGER NOT NULL DEFAULT 0 CHECK (cards_owned >= 0),
    highest_streak  INTEGER NOT NULL DEFAULT 0 CHECK (highest_streak >= 0),
    rank_title      TEXT CHECK (rank_title IS NULL OR (char_length(rank_title) <= 50 AND meme.is_safe_text(rank_title)))
);

COMMENT ON TABLE meme.meme_player_stats IS 'Card game player statistics and ELO ratings';

CREATE INDEX IF NOT EXISTS idx_meme_meme_player_stats_elo ON meme.meme_player_stats (elo_rating DESC);

ALTER TABLE meme.meme_player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_player_stats;
DROP POLICY IF EXISTS "anon_select_player_stats" ON meme.meme_player_stats;
DROP POLICY IF EXISTS "authenticated_select_player_stats" ON meme.meme_player_stats;

CREATE POLICY "service_role_full_access" ON meme.meme_player_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_player_stats" ON meme.meme_player_stats FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_player_stats" ON meme.meme_player_stats FOR SELECT TO authenticated USING (true);

GRANT SELECT ON meme.meme_player_stats TO anon, authenticated;

-- ===========================================
-- TABLE: battle_results
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.battle_results (
    battle_id       TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    player_a_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_b_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status          SMALLINT NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 5),
    winner_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_turns     INTEGER NOT NULL DEFAULT 0 CHECK (total_turns >= 0),
    actions         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(actions) = 'array'),
    elo_delta_a     INTEGER NOT NULL DEFAULT 0,
    elo_delta_b     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

COMMENT ON TABLE meme.battle_results IS 'Card game match results with full action replay log';
COMMENT ON COLUMN meme.battle_results.status IS 'BattleStatus: 0=unspecified, 1=waiting, 2=in_progress, 3=completed, 4=abandoned, 5=draw';
COMMENT ON COLUMN meme.battle_results.actions IS 'JSONB array of BattleAction: {turn, player_id, card_id, target_card_id, ability_name, damage_dealt, healing_done, effect_applied}';

CREATE INDEX IF NOT EXISTS idx_meme_battle_results_player_a ON meme.battle_results (player_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_battle_results_player_b ON meme.battle_results (player_b_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_battle_results_active ON meme.battle_results (status, created_at ASC) WHERE status IN (1, 2);

DROP TRIGGER IF EXISTS trigger_battle_results_protect_timestamps ON meme.battle_results;
CREATE TRIGGER trigger_battle_results_protect_timestamps BEFORE INSERT OR UPDATE ON meme.battle_results FOR EACH ROW EXECUTE FUNCTION meme.protect_created_at();

ALTER TABLE meme.battle_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.battle_results;
DROP POLICY IF EXISTS "authenticated_select_own_battles" ON meme.battle_results;
DROP POLICY IF EXISTS "anon_select_completed_battles" ON meme.battle_results;

CREATE POLICY "service_role_full_access" ON meme.battle_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_battles" ON meme.battle_results FOR SELECT TO authenticated USING (player_a_id = auth.uid() OR player_b_id = auth.uid());
CREATE POLICY "anon_select_completed_battles" ON meme.battle_results FOR SELECT TO anon USING (status = 3);

GRANT SELECT ON meme.battle_results TO anon, authenticated;

-- ===========================================
-- TABLE: meme_user_profiles
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_user_profiles (
    user_id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name                TEXT CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 50 AND meme.is_safe_text(display_name))),
    avatar_url                  TEXT CHECK (meme.is_safe_url(avatar_url)),
    bio                         TEXT CHECK (bio IS NULL OR (char_length(bio) <= 500 AND meme.is_safe_text(bio))),
    total_memes                 BIGINT NOT NULL DEFAULT 0 CHECK (total_memes >= 0),
    total_reactions_received    BIGINT NOT NULL DEFAULT 0 CHECK (total_reactions_received >= 0),
    total_views_received        BIGINT NOT NULL DEFAULT 0 CHECK (total_views_received >= 0),
    follower_count              INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
    following_count             INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
    joined_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_user_profiles IS 'Meme.sh user profile with aggregated engagement stats';

CREATE INDEX IF NOT EXISTS idx_meme_meme_user_profiles_display_name ON meme.meme_user_profiles (display_name) WHERE display_name IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_meme_user_profiles_updated_at ON meme.meme_user_profiles;
CREATE TRIGGER trigger_meme_user_profiles_updated_at BEFORE UPDATE ON meme.meme_user_profiles FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

CREATE OR REPLACE FUNCTION meme.protect_meme_user_profiles_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.joined_at := NOW();
        NEW.updated_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.joined_at := OLD.joined_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_user_profiles_protect_timestamps ON meme.meme_user_profiles;
CREATE TRIGGER trigger_meme_user_profiles_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_user_profiles FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_user_profiles_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_meme_user_profiles_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.user_id                  := OLD.user_id;
    NEW.total_memes              := OLD.total_memes;
    NEW.total_reactions_received := OLD.total_reactions_received;
    NEW.total_views_received     := OLD.total_views_received;
    NEW.follower_count           := OLD.follower_count;
    NEW.following_count          := OLD.following_count;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_user_profiles_protect_columns ON meme.meme_user_profiles;
CREATE TRIGGER trigger_meme_user_profiles_protect_columns BEFORE UPDATE ON meme.meme_user_profiles FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_user_profiles_columns();

ALTER TABLE meme.meme_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "anon_select_profiles" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "authenticated_select_profiles" ON meme.meme_user_profiles;
DROP POLICY IF EXISTS "authenticated_update_own_profile" ON meme.meme_user_profiles;

CREATE POLICY "service_role_full_access" ON meme.meme_user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_profiles" ON meme.meme_user_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_profiles" ON meme.meme_user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_update_own_profile" ON meme.meme_user_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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

CREATE INDEX IF NOT EXISTS idx_meme_meme_follows_following ON meme.meme_follows (following_id);

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
CREATE TRIGGER trigger_meme_follows_counter AFTER INSERT OR DELETE ON meme.meme_follows FOR EACH ROW EXECUTE FUNCTION meme.trg_meme_follows_counter();

DROP TRIGGER IF EXISTS trigger_meme_follows_protect_timestamps ON meme.meme_follows;
CREATE TRIGGER trigger_meme_follows_protect_timestamps BEFORE INSERT ON meme.meme_follows FOR EACH ROW EXECUTE FUNCTION meme.protect_created_at();

ALTER TABLE meme.meme_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_follows;
DROP POLICY IF EXISTS "anon_select_follows" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_select_follows" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_insert_own_follow" ON meme.meme_follows;
DROP POLICY IF EXISTS "authenticated_delete_own_follow" ON meme.meme_follows;

CREATE POLICY "service_role_full_access" ON meme.meme_follows FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_follows" ON meme.meme_follows FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_follows" ON meme.meme_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_own_follow" ON meme.meme_follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "authenticated_delete_own_follow" ON meme.meme_follows FOR DELETE TO authenticated USING (follower_id = auth.uid());

GRANT SELECT ON meme.meme_follows TO anon;
GRANT SELECT, INSERT, DELETE ON meme.meme_follows TO authenticated;

-- ===========================================
-- TABLE: meme_collections
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_collections (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100 AND meme.is_safe_text(name)),
    description     TEXT CHECK (description IS NULL OR (char_length(description) <= 1000 AND meme.is_safe_text(description))),
    cover_meme_id   TEXT REFERENCES meme.memes(id) ON DELETE SET NULL,
    is_public       BOOLEAN NOT NULL DEFAULT false,
    meme_count      INTEGER NOT NULL DEFAULT 0 CHECK (meme_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_collections IS 'User-curated meme collections / folders';

CREATE INDEX IF NOT EXISTS idx_meme_meme_collections_owner ON meme.meme_collections (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_meme_collections_public ON meme.meme_collections (is_public, created_at DESC) WHERE is_public = true;

DROP TRIGGER IF EXISTS trigger_meme_collections_updated_at ON meme.meme_collections;
CREATE TRIGGER trigger_meme_collections_updated_at BEFORE UPDATE ON meme.meme_collections FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_meme_collections_protect_timestamps ON meme.meme_collections;
CREATE TRIGGER trigger_meme_collections_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_collections FOR EACH ROW EXECUTE FUNCTION meme.protect_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_meme_collections_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.owner_id   := OLD.owner_id;
    NEW.meme_count := OLD.meme_count;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_collections_protect_columns ON meme.meme_collections;
CREATE TRIGGER trigger_meme_collections_protect_columns BEFORE UPDATE ON meme.meme_collections FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_collections_columns();

ALTER TABLE meme.meme_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_collections;
DROP POLICY IF EXISTS "anon_select_public_collections" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_select_public_and_own" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_insert_own_collection" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_update_own_collection" ON meme.meme_collections;
DROP POLICY IF EXISTS "authenticated_delete_own_collection" ON meme.meme_collections;

CREATE POLICY "service_role_full_access" ON meme.meme_collections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_public_collections" ON meme.meme_collections FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "authenticated_select_public_and_own" ON meme.meme_collections FOR SELECT TO authenticated USING (is_public = true OR owner_id = auth.uid());
CREATE POLICY "authenticated_insert_own_collection" ON meme.meme_collections FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "authenticated_update_own_collection" ON meme.meme_collections FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "authenticated_delete_own_collection" ON meme.meme_collections FOR DELETE TO authenticated USING (owner_id = auth.uid());

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_saves_unique ON meme.meme_saves (meme_id, user_id, COALESCE(collection_id, '__default__'));
CREATE INDEX IF NOT EXISTS idx_meme_meme_saves_user ON meme.meme_saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meme_meme_saves_collection ON meme.meme_saves (collection_id, created_at DESC) WHERE collection_id IS NOT NULL;

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
CREATE TRIGGER trigger_meme_saves_counter AFTER INSERT OR DELETE ON meme.meme_saves FOR EACH ROW EXECUTE FUNCTION meme.trg_meme_saves_counter();

DROP TRIGGER IF EXISTS trigger_meme_saves_protect_timestamps ON meme.meme_saves;
CREATE TRIGGER trigger_meme_saves_protect_timestamps BEFORE INSERT ON meme.meme_saves FOR EACH ROW EXECUTE FUNCTION meme.protect_created_at();

ALTER TABLE meme.meme_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_select_own_saves" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_insert_own_save" ON meme.meme_saves;
DROP POLICY IF EXISTS "authenticated_delete_own_save" ON meme.meme_saves;

CREATE POLICY "service_role_full_access" ON meme.meme_saves FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_saves" ON meme.meme_saves FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated_insert_own_save" ON meme.meme_saves FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated_delete_own_save" ON meme.meme_saves FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON meme.meme_saves TO authenticated;

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

CREATE INDEX IF NOT EXISTS idx_meme_meme_reactions_meme ON meme.meme_reactions (meme_id);
CREATE INDEX IF NOT EXISTS idx_meme_meme_reactions_user ON meme.meme_reactions (user_id);

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
CREATE TRIGGER trigger_meme_reactions_counter AFTER INSERT OR DELETE ON meme.meme_reactions FOR EACH ROW EXECUTE FUNCTION meme.trg_meme_reactions_counter();

DROP TRIGGER IF EXISTS trigger_meme_reactions_protect_timestamps ON meme.meme_reactions;
CREATE TRIGGER trigger_meme_reactions_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_reactions FOR EACH ROW EXECUTE FUNCTION meme.protect_created_at();

ALTER TABLE meme.meme_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_reactions;
DROP POLICY IF EXISTS "anon_select_reactions" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_select_reactions" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_insert_own_reaction" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_update_own_reaction" ON meme.meme_reactions;
DROP POLICY IF EXISTS "authenticated_delete_own_reaction" ON meme.meme_reactions;

CREATE POLICY "service_role_full_access" ON meme.meme_reactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_reactions" ON meme.meme_reactions FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_reactions" ON meme.meme_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_own_reaction" ON meme.meme_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated_update_own_reaction" ON meme.meme_reactions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "authenticated_delete_own_reaction" ON meme.meme_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON meme.meme_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_reactions TO authenticated;

-- ===========================================
-- TABLE: meme_comments
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_comments (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    meme_id         TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500 AND meme.is_safe_text(body)),
    parent_id       TEXT REFERENCES meme.meme_comments(id) ON DELETE CASCADE,
    reaction_count  BIGINT NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    reply_count     INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_comments IS 'Threaded comments on memes with denormalized reply/reaction counters';
COMMENT ON COLUMN meme.meme_comments.parent_id IS 'NULL for top-level comments; ULID of parent for threaded replies';

CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_meme_toplevel ON meme.meme_comments (meme_id, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_parent ON meme.meme_comments (parent_id, created_at ASC) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meme_meme_comments_author ON meme.meme_comments (author_id);

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
CREATE TRIGGER trigger_meme_comments_counter AFTER INSERT OR DELETE ON meme.meme_comments FOR EACH ROW EXECUTE FUNCTION meme.trg_meme_comments_counter();

DROP TRIGGER IF EXISTS trigger_meme_comments_updated_at ON meme.meme_comments;
CREATE TRIGGER trigger_meme_comments_updated_at BEFORE UPDATE ON meme.meme_comments FOR EACH ROW EXECUTE FUNCTION meme.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_meme_comments_protect_timestamps ON meme.meme_comments;
CREATE TRIGGER trigger_meme_comments_protect_timestamps BEFORE INSERT OR UPDATE ON meme.meme_comments FOR EACH ROW EXECUTE FUNCTION meme.protect_timestamps();

CREATE OR REPLACE FUNCTION meme.protect_meme_comments_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('role') = 'service_role' THEN RETURN NEW; END IF;
    NEW.meme_id        := OLD.meme_id;
    NEW.author_id      := OLD.author_id;
    NEW.parent_id      := OLD.parent_id;
    NEW.reaction_count := OLD.reaction_count;
    NEW.reply_count    := OLD.reply_count;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_meme_comments_protect_columns ON meme.meme_comments;
CREATE TRIGGER trigger_meme_comments_protect_columns BEFORE UPDATE ON meme.meme_comments FOR EACH ROW EXECUTE FUNCTION meme.protect_meme_comments_columns();

ALTER TABLE meme.meme_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_comments;
DROP POLICY IF EXISTS "anon_select_comments" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_select_comments" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_insert_own_comment" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_update_own_comment" ON meme.meme_comments;
DROP POLICY IF EXISTS "authenticated_delete_own_comment" ON meme.meme_comments;

CREATE POLICY "service_role_full_access" ON meme.meme_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_comments" ON meme.meme_comments FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_select_comments" ON meme.meme_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_own_comment" ON meme.meme_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "authenticated_update_own_comment" ON meme.meme_comments FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "authenticated_delete_own_comment" ON meme.meme_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

GRANT SELECT ON meme.meme_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON meme.meme_comments TO authenticated;

-- ===========================================
-- TABLE: meme_reports
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_reports (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    meme_id         TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason          SMALLINT NOT NULL CHECK (reason BETWEEN 1 AND 7),
    detail          TEXT CHECK (detail IS NULL OR (char_length(detail) <= 2000 AND meme.is_safe_text(detail))),
    resolved        BOOLEAN NOT NULL DEFAULT false,
    resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_note TEXT CHECK (resolution_note IS NULL OR (char_length(resolution_note) <= 2000 AND meme.is_safe_text(resolution_note))),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_reports IS 'User-submitted content moderation reports on memes';
COMMENT ON COLUMN meme.meme_reports.reason IS 'ReportReason: 1=spam, 2=nsfw, 3=hate_speech, 4=harassment, 5=copyright, 6=misinformation, 7=other';

CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_reports_one_open ON meme.meme_reports (meme_id, reporter_id) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_unresolved ON meme.meme_reports (created_at ASC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_meme ON meme.meme_reports (meme_id) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_reporter ON meme.meme_reports (reporter_id);

DROP TRIGGER IF EXISTS trigger_meme_reports_protect_timestamps ON meme.meme_reports;
CREATE TRIGGER trigger_meme_reports_protect_timestamps BEFORE INSERT ON meme.meme_reports FOR EACH ROW EXECUTE FUNCTION meme.protect_created_at();

ALTER TABLE meme.meme_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_reports;
DROP POLICY IF EXISTS "authenticated_insert_own_report" ON meme.meme_reports;
DROP POLICY IF EXISTS "authenticated_select_own_reports" ON meme.meme_reports;

CREATE POLICY "service_role_full_access" ON meme.meme_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_insert_own_report" ON meme.meme_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "authenticated_select_own_reports" ON meme.meme_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

GRANT SELECT, INSERT ON meme.meme_reports TO authenticated;

-- migrate:down

-- Drop tables in reverse dependency order (CASCADE handles triggers, policies, indexes)
DROP TABLE IF EXISTS meme.meme_reports CASCADE;
DROP TABLE IF EXISTS meme.meme_comments CASCADE;
DROP TABLE IF EXISTS meme.meme_reactions CASCADE;
DROP TABLE IF EXISTS meme.meme_saves CASCADE;
DROP TABLE IF EXISTS meme.meme_collections CASCADE;
DROP TABLE IF EXISTS meme.meme_follows CASCADE;
DROP TABLE IF EXISTS meme.meme_user_profiles CASCADE;
DROP TABLE IF EXISTS meme.battle_results CASCADE;
DROP TABLE IF EXISTS meme.meme_player_stats CASCADE;
DROP TABLE IF EXISTS meme.meme_deck_cards CASCADE;
DROP TABLE IF EXISTS meme.meme_decks CASCADE;
DROP TABLE IF EXISTS meme.meme_card_stats CASCADE;
DROP TABLE IF EXISTS meme.memes CASCADE;
DROP TABLE IF EXISTS meme.meme_templates CASCADE;

-- Drop standalone functions
DROP FUNCTION IF EXISTS meme.update_updated_at_column();
DROP FUNCTION IF EXISTS meme.is_safe_text(TEXT);
DROP FUNCTION IF EXISTS meme.is_safe_url(TEXT);
DROP FUNCTION IF EXISTS meme.are_valid_tags(TEXT[]);
DROP FUNCTION IF EXISTS meme.protect_timestamps();
DROP FUNCTION IF EXISTS meme.protect_created_at();
DROP FUNCTION IF EXISTS meme.enforce_meme_status_transition();
DROP FUNCTION IF EXISTS meme.protect_meme_templates_columns();
DROP FUNCTION IF EXISTS meme.protect_memes_columns();
DROP FUNCTION IF EXISTS meme.protect_meme_decks_columns();
DROP FUNCTION IF EXISTS meme.protect_meme_user_profiles_timestamps();
DROP FUNCTION IF EXISTS meme.protect_meme_user_profiles_columns();
DROP FUNCTION IF EXISTS meme.trg_meme_follows_counter();
DROP FUNCTION IF EXISTS meme.protect_meme_collections_columns();
DROP FUNCTION IF EXISTS meme.trg_meme_saves_counter();
DROP FUNCTION IF EXISTS meme.trg_meme_reactions_counter();
DROP FUNCTION IF EXISTS meme.trg_meme_comments_counter();
DROP FUNCTION IF EXISTS meme.protect_meme_comments_columns();

DROP SCHEMA IF EXISTS meme CASCADE;
