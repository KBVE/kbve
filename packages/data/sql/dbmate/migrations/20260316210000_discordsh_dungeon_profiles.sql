-- migrate:up

-- ============================================================
-- DISCORDSH DUNGEON PROFILES — Player persistence for dungeon game
--
-- Tables: dungeon_profiles, dungeon_runs
-- Functions: 3 service (load, upsert, leaderboard),
--            4 trigger (updated_at, protect_timestamps, protect_ended_at, append_only)
--
-- Depends on: 20260228000000_discordsh_schema_init (discordsh schema)
--
-- Source of truth:
--   packages/data/sql/schema/discordsh/discordsh_dungeon_profiles.sql
-- ============================================================

-- ===========================================
-- TABLE: discordsh.dungeon_profiles
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.dungeon_profiles (
    discord_id              BIGINT PRIMARY KEY
                            CHECK (discord_id > 0),
    discord_name            TEXT NOT NULL
                            CHECK (char_length(discord_name) BETWEEN 1 AND 100),

    -- Class: maps to DungeonClass proto enum (1=warrior, 2=rogue, 3=cleric)
    class_id                SMALLINT NOT NULL DEFAULT 1
                            CHECK (class_id BETWEEN 1 AND 3),

    -- Progression
    level                   SMALLINT NOT NULL DEFAULT 1
                            CHECK (level >= 1),
    xp                      INT NOT NULL DEFAULT 0
                            CHECK (xp >= 0),
    xp_to_next              INT NOT NULL DEFAULT 100
                            CHECK (xp_to_next > 0),

    -- Economy
    gold                    INT NOT NULL DEFAULT 0
                            CHECK (gold >= 0),

    -- Lifetime stats (monotonically increasing)
    lifetime_kills          INT NOT NULL DEFAULT 0 CHECK (lifetime_kills >= 0),
    lifetime_gold_earned    INT NOT NULL DEFAULT 0 CHECK (lifetime_gold_earned >= 0),
    lifetime_rooms_cleared  INT NOT NULL DEFAULT 0 CHECK (lifetime_rooms_cleared >= 0),
    lifetime_bosses_defeated INT NOT NULL DEFAULT 0 CHECK (lifetime_bosses_defeated >= 0),
    lifetime_deaths         INT NOT NULL DEFAULT 0 CHECK (lifetime_deaths >= 0),
    lifetime_victories      INT NOT NULL DEFAULT 0 CHECK (lifetime_victories >= 0),
    lifetime_escapes        INT NOT NULL DEFAULT 0 CHECK (lifetime_escapes >= 0),

    -- Equipment (gear IDs or NULL, length-bounded)
    weapon                  TEXT
                            CHECK (weapon IS NULL OR char_length(weapon) BETWEEN 1 AND 100),
    armor_gear              TEXT
                            CHECK (armor_gear IS NULL OR char_length(armor_gear) BETWEEN 1 AND 100),

    -- Inventory: JSONB array of {item_id, qty} objects — shape-validated
    inventory               JSONB NOT NULL DEFAULT '[]'::JSONB
                            CHECK (
                                jsonb_typeof(inventory) = 'array'
                                AND NOT jsonb_path_exists(
                                    inventory,
                                    '$[*] ? (
                                        type() != "object" ||
                                        !exists(@.item_id) ||
                                        !exists(@.qty) ||
                                        @.item_id.type() != "string" ||
                                        @.qty.type() != "number" ||
                                        @.qty < 1
                                    )'
                                )
                            ),

    -- Completed quest slugs
    completed_quests        TEXT[] NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ
);

COMMENT ON TABLE discordsh.dungeon_profiles IS
    'Persistent dungeon player profiles — one per Discord user, keyed on snowflake ID';
COMMENT ON COLUMN discordsh.dungeon_profiles.discord_id IS
    'Discord snowflake (u64 stored as BIGINT)';
COMMENT ON COLUMN discordsh.dungeon_profiles.class_id IS
    'DungeonClass proto enum: 1=warrior, 2=rogue, 3=cleric';
COMMENT ON COLUMN discordsh.dungeon_profiles.inventory IS
    'JSONB array: [{item_id: string, qty: int}, ...] — shape-validated via CHECK';

REVOKE ALL ON discordsh.dungeon_profiles FROM PUBLIC, anon, authenticated;

-- ===========================================
-- TABLE: discordsh.dungeon_runs
-- ===========================================

CREATE TABLE IF NOT EXISTS discordsh.dungeon_runs (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discord_id              BIGINT NOT NULL
                            REFERENCES discordsh.dungeon_profiles(discord_id) ON DELETE CASCADE,

    -- Outcome: maps to DungeonOutcome proto enum (1=victory, 2=defeated, 3=escaped, 4=expired)
    outcome                 SMALLINT NOT NULL
                            CHECK (outcome BETWEEN 1 AND 4),

    -- Session stats
    rooms_cleared           INT NOT NULL DEFAULT 0 CHECK (rooms_cleared >= 0),
    kills                   INT NOT NULL DEFAULT 0 CHECK (kills >= 0),
    gold_earned             INT NOT NULL DEFAULT 0 CHECK (gold_earned >= 0),
    gold_lost               INT NOT NULL DEFAULT 0 CHECK (gold_lost >= 0),
    bosses_defeated         INT NOT NULL DEFAULT 0 CHECK (bosses_defeated >= 0),
    xp_earned               INT NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
    level_at_end            SMALLINT NOT NULL DEFAULT 1 CHECK (level_at_end >= 1),

    -- Wall time of session (seconds)
    duration_secs           INT CHECK (duration_secs IS NULL OR duration_secs >= 0),

    -- When the run ended
    ended_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE discordsh.dungeon_runs IS
    'Append-only dungeon session history — one row per completed run. UPDATE/DELETE blocked by trigger.';
COMMENT ON COLUMN discordsh.dungeon_runs.outcome IS
    'DungeonOutcome proto enum: 1=victory, 2=defeated, 3=escaped, 4=expired';

REVOKE ALL ON discordsh.dungeon_runs FROM PUBLIC, anon, authenticated;

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_runs_history
    ON discordsh.dungeon_runs (discord_id, ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_lb_xp
    ON discordsh.dungeon_profiles (level DESC, xp DESC, discord_id ASC);

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_lb_kills
    ON discordsh.dungeon_profiles (lifetime_kills DESC, discord_id ASC);

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_lb_bosses
    ON discordsh.dungeon_profiles (lifetime_bosses_defeated DESC, discord_id ASC);

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_lb_rooms
    ON discordsh.dungeon_profiles (lifetime_rooms_cleared DESC, discord_id ASC);

CREATE INDEX IF NOT EXISTS idx_discordsh_dungeon_profiles_lb_gold
    ON discordsh.dungeon_profiles (lifetime_gold_earned DESC, discord_id ASC);

-- ===========================================
-- TRIGGER: auto-update updated_at on profiles
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.trg_dungeon_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_dungeon_profiles_updated_at() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION discordsh.trg_dungeon_profiles_updated_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_profiles_updated_at ON discordsh.dungeon_profiles;
CREATE TRIGGER trg_discordsh_dungeon_profiles_updated_at
    BEFORE UPDATE ON discordsh.dungeon_profiles
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_dungeon_profiles_updated_at();

-- ===========================================
-- TRIGGER: protect timestamps on profiles
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.trg_dungeon_profiles_protect_timestamps()
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

REVOKE ALL ON FUNCTION discordsh.trg_dungeon_profiles_protect_timestamps() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION discordsh.trg_dungeon_profiles_protect_timestamps() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_profiles_protect_timestamps ON discordsh.dungeon_profiles;
CREATE TRIGGER trg_discordsh_dungeon_profiles_protect_timestamps
    BEFORE INSERT OR UPDATE ON discordsh.dungeon_profiles
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_dungeon_profiles_protect_timestamps();

-- ===========================================
-- TRIGGER: protect ended_at on runs
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.trg_dungeon_runs_protect_ended_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.ended_at := NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.ended_at := OLD.ended_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_dungeon_runs_protect_ended_at() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION discordsh.trg_dungeon_runs_protect_ended_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_runs_protect_ended_at ON discordsh.dungeon_runs;
CREATE TRIGGER trg_discordsh_dungeon_runs_protect_ended_at
    BEFORE INSERT OR UPDATE ON discordsh.dungeon_runs
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_dungeon_runs_protect_ended_at();

-- ===========================================
-- TRIGGER: append-only enforcement on runs
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.trg_dungeon_runs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'discordsh.dungeon_runs is append-only'
        USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION discordsh.trg_dungeon_runs_append_only() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION discordsh.trg_dungeon_runs_append_only() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_runs_append_only ON discordsh.dungeon_runs;
CREATE TRIGGER trg_discordsh_dungeon_runs_append_only
    BEFORE UPDATE OR DELETE ON discordsh.dungeon_runs
    FOR EACH ROW
    EXECUTE FUNCTION discordsh.trg_dungeon_runs_append_only();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE discordsh.dungeon_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discordsh.dungeon_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.dungeon_profiles;
CREATE POLICY "service_role_full_access" ON discordsh.dungeon_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_access" ON discordsh.dungeon_runs;
CREATE POLICY "service_role_full_access" ON discordsh.dungeon_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- SERVICE FUNCTION: Load profile
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_load_profile(
    p_discord_id BIGINT
)
RETURNS TABLE(
    discord_id BIGINT,
    discord_name TEXT,
    class_id SMALLINT,
    level SMALLINT,
    xp INT,
    xp_to_next INT,
    gold INT,
    lifetime_kills INT,
    lifetime_gold_earned INT,
    lifetime_rooms_cleared INT,
    lifetime_bosses_defeated INT,
    lifetime_deaths INT,
    lifetime_victories INT,
    lifetime_escapes INT,
    weapon TEXT,
    armor_gear TEXT,
    inventory JSONB,
    completed_quests TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.discord_id,
        p.discord_name,
        p.class_id,
        p.level,
        p.xp,
        p.xp_to_next,
        p.gold,
        p.lifetime_kills,
        p.lifetime_gold_earned,
        p.lifetime_rooms_cleared,
        p.lifetime_bosses_defeated,
        p.lifetime_deaths,
        p.lifetime_victories,
        p.lifetime_escapes,
        p.weapon,
        p.armor_gear,
        p.inventory,
        p.completed_quests,
        p.created_at,
        p.updated_at
    FROM discordsh.dungeon_profiles p
    WHERE p.discord_id = p_discord_id;
END;
$$;

COMMENT ON FUNCTION discordsh.service_load_profile IS
    'Load a dungeon profile by Discord snowflake ID. Returns empty if not found.';

REVOKE ALL ON FUNCTION discordsh.service_load_profile(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_load_profile(BIGINT) TO service_role;
ALTER FUNCTION discordsh.service_load_profile(BIGINT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Upsert profile + insert run
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_upsert_profile(
    p_discord_id            BIGINT,
    p_discord_name          TEXT,
    p_class_id              SMALLINT,
    p_level                 SMALLINT,
    p_xp                    INT,
    p_xp_to_next            INT,
    p_gold                  INT,
    p_lifetime_kills        INT,
    p_lifetime_gold_earned  INT,
    p_lifetime_rooms_cleared INT,
    p_lifetime_bosses_defeated INT,
    p_lifetime_deaths       INT,
    p_lifetime_victories    INT,
    p_lifetime_escapes      INT,
    p_weapon                TEXT DEFAULT NULL,
    p_armor_gear            TEXT DEFAULT NULL,
    p_inventory             JSONB DEFAULT '[]'::JSONB,
    p_completed_quests      TEXT[] DEFAULT '{}',
    p_run_outcome           SMALLINT DEFAULT NULL,
    p_run_rooms_cleared     INT DEFAULT 0,
    p_run_kills             INT DEFAULT 0,
    p_run_gold_earned       INT DEFAULT 0,
    p_run_gold_lost         INT DEFAULT 0,
    p_run_bosses_defeated   INT DEFAULT 0,
    p_run_xp_earned         INT DEFAULT 0,
    p_run_level_at_end      SMALLINT DEFAULT 1,
    p_run_duration_secs     INT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Advisory lock: serialize saves per player using discord_id directly
    PERFORM pg_advisory_xact_lock(p_discord_id);

    -- Upsert profile
    INSERT INTO discordsh.dungeon_profiles (
        discord_id, discord_name, class_id, level, xp, xp_to_next, gold,
        lifetime_kills, lifetime_gold_earned, lifetime_rooms_cleared,
        lifetime_bosses_defeated, lifetime_deaths, lifetime_victories,
        lifetime_escapes, weapon, armor_gear, inventory, completed_quests
    )
    VALUES (
        p_discord_id, p_discord_name, p_class_id, p_level, p_xp, p_xp_to_next, p_gold,
        p_lifetime_kills, p_lifetime_gold_earned, p_lifetime_rooms_cleared,
        p_lifetime_bosses_defeated, p_lifetime_deaths, p_lifetime_victories,
        p_lifetime_escapes, p_weapon, p_armor_gear, p_inventory, p_completed_quests
    )
    ON CONFLICT (discord_id) DO UPDATE SET
        discord_name            = EXCLUDED.discord_name,
        class_id                = EXCLUDED.class_id,
        level                   = EXCLUDED.level,
        xp                      = EXCLUDED.xp,
        xp_to_next              = EXCLUDED.xp_to_next,
        gold                    = EXCLUDED.gold,
        lifetime_kills          = EXCLUDED.lifetime_kills,
        lifetime_gold_earned    = EXCLUDED.lifetime_gold_earned,
        lifetime_rooms_cleared  = EXCLUDED.lifetime_rooms_cleared,
        lifetime_bosses_defeated = EXCLUDED.lifetime_bosses_defeated,
        lifetime_deaths         = EXCLUDED.lifetime_deaths,
        lifetime_victories      = EXCLUDED.lifetime_victories,
        lifetime_escapes        = EXCLUDED.lifetime_escapes,
        weapon                  = EXCLUDED.weapon,
        armor_gear              = EXCLUDED.armor_gear,
        inventory               = EXCLUDED.inventory,
        completed_quests        = EXCLUDED.completed_quests;

    -- Insert run log (if outcome provided)
    IF p_run_outcome IS NOT NULL THEN
        INSERT INTO discordsh.dungeon_runs (
            discord_id, outcome, rooms_cleared, kills,
            gold_earned, gold_lost, bosses_defeated,
            xp_earned, level_at_end, duration_secs
        )
        VALUES (
            p_discord_id, p_run_outcome, p_run_rooms_cleared, p_run_kills,
            p_run_gold_earned, p_run_gold_lost, p_run_bosses_defeated,
            p_run_xp_earned, p_run_level_at_end, p_run_duration_secs
        );
    END IF;

    RETURN QUERY SELECT true, 'Profile saved.'::TEXT;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$;

COMMENT ON FUNCTION discordsh.service_upsert_profile IS
    'Atomic upsert of dungeon profile + run log. Advisory-locked per discord_id. Bot-only.';

REVOKE ALL ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) TO service_role;
ALTER FUNCTION discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Leaderboard
-- ===========================================

CREATE OR REPLACE FUNCTION discordsh.service_leaderboard(
    p_category  SMALLINT,
    p_limit     INT DEFAULT 10
)
RETURNS TABLE(
    rank        BIGINT,
    discord_id  BIGINT,
    discord_name TEXT,
    level       SMALLINT,
    value       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Reject invalid categories
    IF p_category NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'Invalid leaderboard category: %', p_category
            USING ERRCODE = '22023';
    END IF;

    -- Clamp limit to 1-50
    IF p_limit < 1 THEN p_limit := 1; END IF;
    IF p_limit > 50 THEN p_limit := 50; END IF;

    -- Per-category queries for index-friendly execution plans
    IF p_category = 1 THEN
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY p.level DESC, p.xp DESC, p.discord_id ASC) AS rank,
            p.discord_id,
            p.discord_name,
            p.level,
            p.xp::BIGINT AS value
        FROM discordsh.dungeon_profiles p
        ORDER BY p.level DESC, p.xp DESC, p.discord_id ASC
        LIMIT p_limit;

    ELSIF p_category = 2 THEN
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY p.lifetime_kills DESC, p.discord_id ASC) AS rank,
            p.discord_id,
            p.discord_name,
            p.level,
            p.lifetime_kills::BIGINT AS value
        FROM discordsh.dungeon_profiles p
        ORDER BY p.lifetime_kills DESC, p.discord_id ASC
        LIMIT p_limit;

    ELSIF p_category = 3 THEN
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY p.lifetime_bosses_defeated DESC, p.discord_id ASC) AS rank,
            p.discord_id,
            p.discord_name,
            p.level,
            p.lifetime_bosses_defeated::BIGINT AS value
        FROM discordsh.dungeon_profiles p
        ORDER BY p.lifetime_bosses_defeated DESC, p.discord_id ASC
        LIMIT p_limit;

    ELSIF p_category = 4 THEN
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY p.lifetime_rooms_cleared DESC, p.discord_id ASC) AS rank,
            p.discord_id,
            p.discord_name,
            p.level,
            p.lifetime_rooms_cleared::BIGINT AS value
        FROM discordsh.dungeon_profiles p
        ORDER BY p.lifetime_rooms_cleared DESC, p.discord_id ASC
        LIMIT p_limit;

    ELSIF p_category = 5 THEN
        RETURN QUERY
        SELECT
            ROW_NUMBER() OVER (ORDER BY p.lifetime_gold_earned DESC, p.discord_id ASC) AS rank,
            p.discord_id,
            p.discord_name,
            p.level,
            p.lifetime_gold_earned::BIGINT AS value
        FROM discordsh.dungeon_profiles p
        ORDER BY p.lifetime_gold_earned DESC, p.discord_id ASC
        LIMIT p_limit;
    END IF;
END;
$$;

COMMENT ON FUNCTION discordsh.service_leaderboard IS
    'Top N players by category: 1=xp, 2=kills, 3=bosses, 4=rooms, 5=gold. Index-friendly per-category queries. Bot-only.';

REVOKE ALL ON FUNCTION discordsh.service_leaderboard(SMALLINT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discordsh.service_leaderboard(SMALLINT, INT) TO service_role;
ALTER FUNCTION discordsh.service_leaderboard(SMALLINT, INT) OWNER TO service_role;

-- migrate:down

DROP FUNCTION IF EXISTS discordsh.service_leaderboard(SMALLINT, INT);
DROP FUNCTION IF EXISTS discordsh.service_upsert_profile(
    BIGINT, TEXT, SMALLINT, SMALLINT, INT, INT, INT,
    INT, INT, INT, INT, INT, INT, INT,
    TEXT, TEXT, JSONB, TEXT[],
    SMALLINT, INT, INT, INT, INT, INT, INT, SMALLINT, INT
);
DROP FUNCTION IF EXISTS discordsh.service_load_profile(BIGINT);

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_runs_append_only ON discordsh.dungeon_runs;
DROP FUNCTION IF EXISTS discordsh.trg_dungeon_runs_append_only();

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_runs_protect_ended_at ON discordsh.dungeon_runs;
DROP FUNCTION IF EXISTS discordsh.trg_dungeon_runs_protect_ended_at();

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_profiles_protect_timestamps ON discordsh.dungeon_profiles;
DROP FUNCTION IF EXISTS discordsh.trg_dungeon_profiles_protect_timestamps();

DROP TRIGGER IF EXISTS trg_discordsh_dungeon_profiles_updated_at ON discordsh.dungeon_profiles;
DROP FUNCTION IF EXISTS discordsh.trg_dungeon_profiles_updated_at();

DROP TABLE IF EXISTS discordsh.dungeon_runs;
DROP TABLE IF EXISTS discordsh.dungeon_profiles;
