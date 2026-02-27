-- ============================================================
-- MC CHARACTER — DND-style RPG character sheet per player
--
-- Stores level, experience, and base ability scores
-- (STR, DEX, CON, INT, WIS, CHA) for each player per server.
-- All stats default to 1. Level starts at 1.
--
-- Level formula (quadratic):
--   level = floor(sqrt(experience / 100)) + 1
--   i.e. 0 XP → L1, 100 XP → L2, 400 XP → L3, 900 XP → L4, ...
--   Level N requires 100 * (N-1)^2 total XP.
--
-- Belt-and-suspenders validation:
--   1. Table constraints: stat ranges (1..999), xp >= 0, level >= 1
--   2. Service functions: re-validate before write, atomic add_xp
--   3. Edge functions: input validation before calling RPC
--
-- Called exclusively by the MC server via service_role.
-- Requires: mc schema (created by mc_auth.sql)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: mc.character
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.character (
    -- Composite PK: one character per player per server
    player_uuid TEXT NOT NULL,
    server_id   TEXT NOT NULL,

    -- Optional Supabase link
    user_id UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    -- Level & experience
    level       INTEGER NOT NULL DEFAULT 1,
    experience  BIGINT  NOT NULL DEFAULT 0,

    -- Base ability scores (natural stats, before modifiers)
    strength     INTEGER NOT NULL DEFAULT 1,
    dexterity    INTEGER NOT NULL DEFAULT 1,
    constitution INTEGER NOT NULL DEFAULT 1,
    intelligence INTEGER NOT NULL DEFAULT 1,
    wisdom       INTEGER NOT NULL DEFAULT 1,
    charisma     INTEGER NOT NULL DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (player_uuid, server_id),

    -- MC UUID format: 32 lowercase hex characters (no dashes)
    CONSTRAINT char_player_uuid_format_chk
        CHECK (player_uuid ~ '^[a-f0-9]{32}$'),

    -- Level must be positive
    CONSTRAINT char_level_chk
        CHECK (level >= 1),

    -- Experience must be non-negative
    CONSTRAINT char_experience_chk
        CHECK (experience >= 0),

    -- All stats must be in range [1, 999]
    CONSTRAINT char_strength_chk
        CHECK (strength >= 1 AND strength <= 999),
    CONSTRAINT char_dexterity_chk
        CHECK (dexterity >= 1 AND dexterity <= 999),
    CONSTRAINT char_constitution_chk
        CHECK (constitution >= 1 AND constitution <= 999),
    CONSTRAINT char_intelligence_chk
        CHECK (intelligence >= 1 AND intelligence <= 999),
    CONSTRAINT char_wisdom_chk
        CHECK (wisdom >= 1 AND wisdom <= 999),
    CONSTRAINT char_charisma_chk
        CHECK (charisma >= 1 AND charisma <= 999)
);

-- Lookup by Supabase user
CREATE INDEX IF NOT EXISTS idx_mc_character_user_id
    ON mc.character (user_id)
    WHERE user_id IS NOT NULL;

-- Lookup by server
CREATE INDEX IF NOT EXISTS idx_mc_character_server_id
    ON mc.character (server_id);

COMMENT ON TABLE mc.character IS
    'DND-style RPG character sheet per player per server with base ability scores and XP/level.';
COMMENT ON COLUMN mc.character.level IS
    'Character level, computed from XP: floor(sqrt(xp/100))+1. L1=0xp, L2=100xp, L3=400xp, ...';
COMMENT ON COLUMN mc.character.strength IS
    'STR — physical power, melee damage modifier.';
COMMENT ON COLUMN mc.character.dexterity IS
    'DEX — agility, ranged accuracy, dodge chance.';
COMMENT ON COLUMN mc.character.constitution IS
    'CON — endurance, max HP modifier.';
COMMENT ON COLUMN mc.character.intelligence IS
    'INT — magic power, crafting bonus.';
COMMENT ON COLUMN mc.character.wisdom IS
    'WIS — perception, luck, gathering yield.';
COMMENT ON COLUMN mc.character.charisma IS
    'CHA — trade prices, NPC interaction quality.';

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE mc.character ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.character;

CREATE POLICY "service_role_full_access"
    ON mc.character
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===========================================
-- TRIGGER: auto-update updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION mc.trg_character_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION mc.trg_character_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.trg_character_updated_at()
    TO service_role;
ALTER FUNCTION mc.trg_character_updated_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_mc_character_updated_at ON mc.character;

CREATE TRIGGER trg_mc_character_updated_at
BEFORE UPDATE ON mc.character
FOR EACH ROW
EXECUTE FUNCTION mc.trg_character_updated_at();

-- ===========================================
-- HELPER: Compute level from total XP
--
-- Formula: level = floor(sqrt(xp / 100)) + 1
-- XP thresholds: L1=0, L2=100, L3=400, L4=900, L5=1600, ...
-- Level N requires 100 * (N-1)^2 total XP.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.xp_to_level(p_xp BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    IF p_xp < 0 THEN
        RETURN 1;
    END IF;
    RETURN floor(sqrt(p_xp::DOUBLE PRECISION / 100.0))::INTEGER + 1;
END;
$$;

REVOKE ALL ON FUNCTION mc.xp_to_level(BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.xp_to_level(BIGINT)
    TO service_role;
ALTER FUNCTION mc.xp_to_level(BIGINT) OWNER TO service_role;

-- ===========================================
-- HELPER: Clamp a stat value to [1, 999]
-- ===========================================

CREATE OR REPLACE FUNCTION mc.clamp_stat(p_val INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    RETURN GREATEST(1, LEAST(p_val, 999));
END;
$$;

REVOKE ALL ON FUNCTION mc.clamp_stat(INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.clamp_stat(INTEGER)
    TO service_role;
ALTER FUNCTION mc.clamp_stat(INTEGER) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Save character sheet
--
-- Accepts full character JSONB. Upserts.
-- Re-validates stats server-side (belt & suspenders).
-- Auto-computes level from experience.
-- Returns player_uuid on success.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_save_character(
    p_character JSONB
)
RETURNS TEXT  -- returns player_uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
    v_server_id   TEXT;
    v_xp          BIGINT;
    v_level       INTEGER;
    v_stats       JSONB;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_character->>'player_uuid');
    v_server_id   := p_character->>'server_id';

    IF v_server_id IS NULL OR v_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required in character'
            USING ERRCODE = '22023';
    END IF;

    -- Validate and clamp XP/level
    v_xp := GREATEST(COALESCE((p_character->>'experience')::BIGINT, 0), 0);
    v_level := mc.xp_to_level(v_xp);

    -- Extract and clamp stats
    v_stats := COALESCE(p_character->'base_stats', '{}'::JSONB);

    INSERT INTO mc.character (
        player_uuid, server_id, user_id,
        level, experience,
        strength, dexterity, constitution,
        intelligence, wisdom, charisma
    )
    VALUES (
        v_player_uuid,
        v_server_id,
        CASE WHEN p_character->>'user_id' IS NOT NULL
             THEN (p_character->>'user_id')::UUID
             ELSE NULL
        END,
        v_level,
        v_xp,
        mc.clamp_stat(COALESCE((v_stats->>'strength')::INTEGER, 1)),
        mc.clamp_stat(COALESCE((v_stats->>'dexterity')::INTEGER, 1)),
        mc.clamp_stat(COALESCE((v_stats->>'constitution')::INTEGER, 1)),
        mc.clamp_stat(COALESCE((v_stats->>'intelligence')::INTEGER, 1)),
        mc.clamp_stat(COALESCE((v_stats->>'wisdom')::INTEGER, 1)),
        mc.clamp_stat(COALESCE((v_stats->>'charisma')::INTEGER, 1))
    )
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET
        user_id      = EXCLUDED.user_id,
        level        = EXCLUDED.level,
        experience   = EXCLUDED.experience,
        strength     = EXCLUDED.strength,
        dexterity    = EXCLUDED.dexterity,
        constitution = EXCLUDED.constitution,
        intelligence = EXCLUDED.intelligence,
        wisdom       = EXCLUDED.wisdom,
        charisma     = EXCLUDED.charisma;

    RETURN v_player_uuid;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_save_character(JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_save_character(JSONB)
    TO service_role;
ALTER FUNCTION mc.service_save_character(JSONB) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Load character sheet
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_load_character(
    p_player_uuid TEXT,
    p_server_id   TEXT
)
RETURNS TABLE (
    player_uuid  TEXT,
    server_id    TEXT,
    user_id      UUID,
    level        INTEGER,
    experience   BIGINT,
    strength     INTEGER,
    dexterity    INTEGER,
    constitution INTEGER,
    intelligence INTEGER,
    wisdom       INTEGER,
    charisma     INTEGER,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);

    RETURN QUERY
    SELECT
        c.player_uuid,
        c.server_id,
        c.user_id,
        c.level,
        c.experience,
        c.strength,
        c.dexterity,
        c.constitution,
        c.intelligence,
        c.wisdom,
        c.charisma,
        c.created_at,
        c.updated_at
    FROM mc.character AS c
    WHERE c.player_uuid = v_player_uuid
      AND c.server_id = p_server_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_load_character(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_load_character(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_load_character(TEXT, TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Add experience (atomic level-up)
--
-- Atomically adds XP and recomputes level.
-- Returns the new level, total XP, and whether level changed.
-- Creates the character row if it doesn't exist (with default stats).
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_add_experience(
    p_player_uuid TEXT,
    p_server_id   TEXT,
    p_xp_amount   BIGINT
)
RETURNS TABLE (
    new_level        INTEGER,
    total_experience BIGINT,
    leveled_up       BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
    v_old_level   INTEGER;
    v_new_xp      BIGINT;
    v_new_level   INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);

    IF p_xp_amount <= 0 THEN
        RAISE EXCEPTION 'xp_amount must be positive'
            USING ERRCODE = '22023';
    END IF;

    IF p_server_id IS NULL OR p_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required'
            USING ERRCODE = '22023';
    END IF;

    -- Upsert: create with defaults if missing, otherwise add XP
    INSERT INTO mc.character (player_uuid, server_id, level, experience)
    VALUES (v_player_uuid, p_server_id, mc.xp_to_level(p_xp_amount), p_xp_amount)
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET
        experience = mc.character.experience + p_xp_amount
    RETURNING
        mc.character.level,
        mc.character.experience
    INTO v_old_level, v_new_xp;

    -- Recompute level from new total XP
    v_new_level := mc.xp_to_level(v_new_xp);

    -- Update level if it changed
    IF v_new_level <> v_old_level THEN
        UPDATE mc.character
        SET level = v_new_level
        WHERE mc.character.player_uuid = v_player_uuid
          AND mc.character.server_id = p_server_id;
    END IF;

    RETURN QUERY SELECT v_new_level, v_new_xp, (v_new_level <> v_old_level);
END;
$$;

REVOKE ALL ON FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT)
    TO service_role;
ALTER FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'character'
    ) THEN
        RAISE EXCEPTION 'mc.character table creation failed';
    END IF;

    -- Functions exist
    PERFORM 'mc.xp_to_level(bigint)'::regprocedure;
    PERFORM 'mc.clamp_stat(integer)'::regprocedure;
    PERFORM 'mc.service_save_character(jsonb)'::regprocedure;
    PERFORM 'mc.service_load_character(text, text)'::regprocedure;
    PERFORM 'mc.service_add_experience(text, text, bigint)'::regprocedure;

    -- service_role CAN execute
    IF NOT has_function_privilege('service_role', 'mc.service_save_character(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_save_character';
    END IF;
    IF NOT has_function_privilege('service_role', 'mc.service_load_character(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_load_character';
    END IF;
    IF NOT has_function_privilege('service_role', 'mc.service_add_experience(text, text, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_add_experience';
    END IF;

    -- anon CANNOT execute
    IF has_function_privilege('anon', 'mc.service_save_character(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_save_character';
    END IF;
    IF has_function_privilege('anon', 'mc.service_load_character(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_load_character';
    END IF;
    IF has_function_privilege('anon', 'mc.service_add_experience(text, text, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_add_experience';
    END IF;
    IF has_function_privilege('anon', 'mc.xp_to_level(bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.xp_to_level';
    END IF;
    IF has_function_privilege('anon', 'mc.clamp_stat(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.clamp_stat';
    END IF;

    -- authenticated CANNOT execute
    IF has_function_privilege('authenticated', 'mc.service_save_character(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_save_character';
    END IF;
    IF has_function_privilege('authenticated', 'mc.service_load_character(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_load_character';
    END IF;
    IF has_function_privilege('authenticated', 'mc.service_add_experience(text, text, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_add_experience';
    END IF;

    -- Ownership checks
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_save_character(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_save_character must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_load_character(text, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_load_character must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_add_experience(text, text, bigint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_add_experience must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.xp_to_level(bigint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.xp_to_level must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.clamp_stat(integer)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.clamp_stat must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.trg_character_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.trg_character_updated_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.character setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
