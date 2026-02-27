-- ============================================================
-- MEME CARD GAME SCHEMA
-- Card stats, decks, deck contents, player stats, battle results
--
-- Depends on: meme_core.sql (meme.memes table)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: meme_card_stats
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_card_stats (
    meme_id         TEXT PRIMARY KEY REFERENCES meme.memes(id) ON DELETE CASCADE,

    -- MemeRarity enum (0-6)
    rarity          SMALLINT NOT NULL DEFAULT 0 CHECK (rarity BETWEEN 0 AND 6),
    -- MemeElement enum (0-8)
    element         SMALLINT NOT NULL DEFAULT 0 CHECK (element BETWEEN 0 AND 8),

    attack          INTEGER NOT NULL DEFAULT 0 CHECK (attack BETWEEN 0 AND 999),
    defense         INTEGER NOT NULL DEFAULT 0 CHECK (defense BETWEEN 0 AND 999),
    hp              INTEGER NOT NULL DEFAULT 1 CHECK (hp BETWEEN 1 AND 9999),
    energy_cost     INTEGER NOT NULL DEFAULT 1 CHECK (energy_cost BETWEEN 0 AND 10),

    -- JSONB array of CardAbility objects
    abilities       JSONB NOT NULL DEFAULT '[]'::jsonb,
    flavor_text     TEXT CHECK (flavor_text IS NULL OR (char_length(flavor_text) <= 300 AND meme.is_safe_text(flavor_text))),

    -- Evolution / leveling
    level           INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    xp              BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
    evolves_from    TEXT REFERENCES meme.memes(id) ON DELETE SET NULL,
    evolves_into    TEXT REFERENCES meme.memes(id) ON DELETE SET NULL
);

COMMENT ON TABLE meme.meme_card_stats IS 'Battle card stats for memes minted into the card game layer';
COMMENT ON COLUMN meme.meme_card_stats.rarity IS 'MemeRarity: 0=unspecified, 1=common, 2=uncommon, 3=rare, 4=epic, 5=legendary, 6=mythic';
COMMENT ON COLUMN meme.meme_card_stats.element IS 'MemeElement: 0=unspecified, 1=dank, 2=wholesome, 3=cursed, 4=deep_fried, 5=surreal, 6=meta, 7=edgy, 8=nostalgic';
COMMENT ON COLUMN meme.meme_card_stats.abilities IS 'JSONB array of CardAbility: {name, description, trigger, effect, value, cooldown, duration}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_rarity
    ON meme.meme_card_stats (rarity);

CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_element
    ON meme.meme_card_stats (element);

CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_evolves_from
    ON meme.meme_card_stats (evolves_from)
    WHERE evolves_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meme_meme_card_stats_evolves_into
    ON meme.meme_card_stats (evolves_into)
    WHERE evolves_into IS NOT NULL;

-- RLS
ALTER TABLE meme.meme_card_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_card_stats;
DROP POLICY IF EXISTS "anon_select_card_stats" ON meme.meme_card_stats;
DROP POLICY IF EXISTS "authenticated_select_card_stats" ON meme.meme_card_stats;

CREATE POLICY "service_role_full_access" ON meme.meme_card_stats
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_card_stats" ON meme.meme_card_stats
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_card_stats" ON meme.meme_card_stats
    FOR SELECT TO authenticated USING (true);

-- Card minting / stat updates are service_role only
GRANT SELECT ON meme.meme_card_stats TO anon, authenticated;

-- ===========================================
-- TABLE: meme_decks
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_decks (
    id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
    owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50 AND meme.is_safe_text(name)),
    is_active   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_decks IS 'Player-built battle decks for the meme card game';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_decks_owner
    ON meme.meme_decks (owner_id);

-- Enforce at most one active deck per player
CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_decks_active
    ON meme.meme_decks (owner_id)
    WHERE is_active = true;

-- Trigger
DROP TRIGGER IF EXISTS trigger_meme_decks_updated_at ON meme.meme_decks;
CREATE TRIGGER trigger_meme_decks_updated_at
    BEFORE UPDATE ON meme.meme_decks
    FOR EACH ROW
    EXECUTE FUNCTION meme.update_updated_at_column();

-- RLS
ALTER TABLE meme.meme_decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_select_own_decks" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_insert_own_deck" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_update_own_deck" ON meme.meme_decks;
DROP POLICY IF EXISTS "authenticated_delete_own_deck" ON meme.meme_decks;

CREATE POLICY "service_role_full_access" ON meme.meme_decks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_own_decks" ON meme.meme_decks
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY "authenticated_insert_own_deck" ON meme.meme_decks
    FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated_update_own_deck" ON meme.meme_decks
    FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "authenticated_delete_own_deck" ON meme.meme_decks
    FOR DELETE TO authenticated
    USING (owner_id = auth.uid());

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_deck_cards_card
    ON meme.meme_deck_cards (card_id);

-- RLS
ALTER TABLE meme.meme_deck_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_select_own_deck_cards" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards;
DROP POLICY IF EXISTS "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards;

CREATE POLICY "service_role_full_access" ON meme.meme_deck_cards
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_own_deck_cards" ON meme.meme_deck_cards
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));

CREATE POLICY "authenticated_insert_own_deck_cards" ON meme.meme_deck_cards
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));

CREATE POLICY "authenticated_delete_own_deck_cards" ON meme.meme_deck_cards
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM meme.meme_decks d
        WHERE d.id = deck_id AND d.owner_id = auth.uid()
    ));

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_meme_player_stats_elo
    ON meme.meme_player_stats (elo_rating DESC);

-- RLS
ALTER TABLE meme.meme_player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_player_stats;
DROP POLICY IF EXISTS "anon_select_player_stats" ON meme.meme_player_stats;
DROP POLICY IF EXISTS "authenticated_select_player_stats" ON meme.meme_player_stats;

CREATE POLICY "service_role_full_access" ON meme.meme_player_stats
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_player_stats" ON meme.meme_player_stats
    FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_select_player_stats" ON meme.meme_player_stats
    FOR SELECT TO authenticated USING (true);

-- All writes are service_role only (game server updates stats)
GRANT SELECT ON meme.meme_player_stats TO anon, authenticated;

-- ===========================================
-- TABLE: battle_results
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.battle_results (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    player_a_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_b_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- BattleStatus enum (0-5)
    status          SMALLINT NOT NULL DEFAULT 1 CHECK (status BETWEEN 0 AND 5),

    winner_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_turns     INTEGER NOT NULL DEFAULT 0 CHECK (total_turns >= 0),

    -- Full action log for replays
    actions         JSONB NOT NULL DEFAULT '[]'::jsonb,

    elo_delta_a     INTEGER NOT NULL DEFAULT 0,
    elo_delta_b     INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

COMMENT ON TABLE meme.battle_results IS 'Card game match results with full action replay log';
COMMENT ON COLUMN meme.battle_results.status IS 'BattleStatus: 0=unspecified, 1=waiting, 2=in_progress, 3=completed, 4=abandoned, 5=draw';
COMMENT ON COLUMN meme.battle_results.actions IS 'JSONB array of BattleAction: {turn, player_id, card_id, target_card_id, ability_name, damage_dealt, healing_done, effect_applied}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meme_battle_results_player_a
    ON meme.battle_results (player_a_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meme_battle_results_player_b
    ON meme.battle_results (player_b_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meme_battle_results_active
    ON meme.battle_results (status, created_at ASC)
    WHERE status IN (1, 2);

-- RLS
ALTER TABLE meme.battle_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.battle_results;
DROP POLICY IF EXISTS "authenticated_select_own_battles" ON meme.battle_results;
DROP POLICY IF EXISTS "anon_select_completed_battles" ON meme.battle_results;

CREATE POLICY "service_role_full_access" ON meme.battle_results
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_own_battles" ON meme.battle_results
    FOR SELECT TO authenticated
    USING (player_a_id = auth.uid() OR player_b_id = auth.uid());

CREATE POLICY "anon_select_completed_battles" ON meme.battle_results
    FOR SELECT TO anon
    USING (status = 3);

-- All writes are service_role only (game server manages battles)
GRANT SELECT ON meme.battle_results TO anon, authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    card_stats_ok BOOLEAN;
    decks_ok BOOLEAN;
    deck_cards_ok BOOLEAN;
    player_stats_ok BOOLEAN;
    battles_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_card_stats') INTO card_stats_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_decks') INTO decks_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_deck_cards') INTO deck_cards_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_player_stats') INTO player_stats_ok;
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'battle_results') INTO battles_ok;

    IF NOT card_stats_ok OR NOT decks_ok OR NOT deck_cards_ok OR NOT player_stats_ok OR NOT battles_ok THEN
        RAISE EXCEPTION 'meme_cards setup failed - card_stats: %, decks: %, deck_cards: %, player_stats: %, battles: %',
            card_stats_ok, decks_ok, deck_cards_ok, player_stats_ok, battles_ok;
    END IF;

    RAISE NOTICE 'meme_cards.sql: meme_card_stats, meme_decks, meme_deck_cards, meme_player_stats, and battle_results verified successfully.';
END $$;

COMMIT;
