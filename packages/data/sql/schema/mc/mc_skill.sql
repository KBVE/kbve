-- ============================================================
-- MC SKILL — Per-skill progression (skill tree) per player
--
-- One row per (player_uuid, server_id, skill_id).
-- Reuses mc.xp_to_level() from mc_character.sql for level calc.
--
-- Skill categories:
--   0 = UNKNOWN
--   1 = COMBAT   (swords, archery, defense, unarmed)
--   2 = GATHERING (mining, woodcutting, fishing, farming)
--   3 = CRAFTING  (smithing, alchemy, enchanting, cooking)
--   4 = MAGIC     (fire, ice, healing, summoning)
--
-- Belt-and-suspenders validation:
--   1. Table constraints: category range, xp >= 0, level >= 1,
--      skill_id format
--   2. Service functions: re-validate, clamp, normalize
--   3. Edge functions: input validation before RPC
--
-- Called exclusively by the MC server via service_role.
-- Requires: mc schema + mc.xp_to_level() (from mc_character.sql)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: mc.skill
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.skill (
    -- Composite PK: one row per player per server per skill
    player_uuid TEXT    NOT NULL,
    server_id   TEXT    NOT NULL,
    skill_id    TEXT    NOT NULL,

    -- Skill metadata
    category    INTEGER NOT NULL DEFAULT 0,   -- McSkillCategory enum

    -- Progression
    level       INTEGER NOT NULL DEFAULT 1,
    experience  BIGINT  NOT NULL DEFAULT 0,

    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (player_uuid, server_id, skill_id),

    -- MC UUID format: 32 lowercase hex characters (no dashes)
    CONSTRAINT skill_player_uuid_format_chk
        CHECK (player_uuid ~ '^[a-f0-9]{32}$'),

    -- Skill ID: lowercase alphanumeric + underscores, 1-64 chars
    CONSTRAINT skill_id_format_chk
        CHECK (skill_id ~ '^[a-z0-9_]{1,64}$'),

    -- Category must be in enum range [0, 4]
    CONSTRAINT skill_category_range_chk
        CHECK (category >= 0 AND category <= 4),

    -- Level must be positive
    CONSTRAINT skill_level_chk
        CHECK (level >= 1),

    -- Experience must be non-negative
    CONSTRAINT skill_experience_chk
        CHECK (experience >= 0)
);

-- All skills for a player on a server (skill tree load)
CREATE INDEX IF NOT EXISTS idx_mc_skill_player_server
    ON mc.skill (player_uuid, server_id);

-- Leaderboard: top players in a specific skill on a server
CREATE INDEX IF NOT EXISTS idx_mc_skill_leaderboard
    ON mc.skill (server_id, skill_id, level DESC, experience DESC);

COMMENT ON TABLE mc.skill IS
    'Per-skill progression entries forming a player skill tree. One row per player per server per skill.';

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE mc.skill ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.skill;

CREATE POLICY "service_role_full_access"
    ON mc.skill
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===========================================
-- TRIGGER: auto-update updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION mc.trg_skill_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION mc.trg_skill_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.trg_skill_updated_at()
    TO service_role;
ALTER FUNCTION mc.trg_skill_updated_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_mc_skill_updated_at ON mc.skill;

CREATE TRIGGER trg_mc_skill_updated_at
BEFORE UPDATE ON mc.skill
FOR EACH ROW
EXECUTE FUNCTION mc.trg_skill_updated_at();

-- ===========================================
-- HELPER: Validate and normalize skill_id
-- ===========================================

CREATE OR REPLACE FUNCTION mc.normalize_skill_id(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    IF p_input IS NULL OR p_input = '' THEN
        RAISE EXCEPTION 'skill_id cannot be NULL or empty'
            USING ERRCODE = '22004';
    END IF;

    v_clean := lower(trim(p_input));

    IF v_clean !~ '^[a-z0-9_]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid skill_id format: %. Must be 1-64 lowercase alphanumeric/underscores.', p_input
            USING ERRCODE = '22023';
    END IF;

    RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION mc.normalize_skill_id(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.normalize_skill_id(TEXT)
    TO service_role;
ALTER FUNCTION mc.normalize_skill_id(TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Save skill tree (bulk upsert)
--
-- Accepts JSONB with player_uuid, server_id, and skills array.
-- Upserts each skill, recomputing level from XP.
-- Returns count of skills saved.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_save_skill_tree(
    p_skill_tree JSONB
)
RETURNS INTEGER  -- count of skills upserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
    v_server_id   TEXT;
    v_skills      JSONB;
    v_count       INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_skill_tree->>'player_uuid');
    v_server_id   := p_skill_tree->>'server_id';

    IF v_server_id IS NULL OR v_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required in skill_tree'
            USING ERRCODE = '22023';
    END IF;

    v_skills := p_skill_tree->'skills';

    IF v_skills IS NULL OR jsonb_typeof(v_skills) <> 'array' THEN
        RAISE EXCEPTION 'skills must be a JSONB array'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_skills) = 0 THEN
        RETURN 0;
    END IF;

    -- Limit batch size
    IF jsonb_array_length(v_skills) > 200 THEN
        RAISE EXCEPTION 'Skill tree exceeds limit of 200 skills'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO mc.skill (
        player_uuid, server_id, skill_id, category, level, experience
    )
    SELECT
        v_player_uuid,
        v_server_id,
        mc.normalize_skill_id(s->>'skill_id'),
        LEAST(GREATEST(COALESCE((s->>'category')::INTEGER, 0), 0), 4),
        mc.xp_to_level(GREATEST(COALESCE((s->>'experience')::BIGINT, 0), 0)),
        GREATEST(COALESCE((s->>'experience')::BIGINT, 0), 0)
    FROM jsonb_array_elements(v_skills) AS s
    ON CONFLICT (player_uuid, server_id, skill_id) DO UPDATE SET
        category   = EXCLUDED.category,
        level      = EXCLUDED.level,
        experience = EXCLUDED.experience;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_save_skill_tree(JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_save_skill_tree(JSONB)
    TO service_role;
ALTER FUNCTION mc.service_save_skill_tree(JSONB) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Load skill tree
--
-- Returns all skills for a player on a server.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_load_skill_tree(
    p_player_uuid TEXT,
    p_server_id   TEXT
)
RETURNS TABLE (
    skill_id    TEXT,
    category    INTEGER,
    level       INTEGER,
    experience  BIGINT,
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ
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
        s.skill_id,
        s.category,
        s.level,
        s.experience,
        s.created_at,
        s.updated_at
    FROM mc.skill AS s
    WHERE s.player_uuid = v_player_uuid
      AND s.server_id = p_server_id
    ORDER BY s.category, s.skill_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_load_skill_tree(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_load_skill_tree(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_load_skill_tree(TEXT, TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Add XP to a specific skill
--
-- Atomic XP add + level recompute.
-- Creates the skill row if it doesn't exist (with given category).
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_add_skill_xp(
    p_player_uuid TEXT,
    p_server_id   TEXT,
    p_skill_id    TEXT,
    p_category    INTEGER,
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
    v_skill_id    TEXT;
    v_category    INTEGER;
    v_old_level   INTEGER;
    v_new_xp      BIGINT;
    v_new_level   INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    v_skill_id    := mc.normalize_skill_id(p_skill_id);
    v_category    := LEAST(GREATEST(COALESCE(p_category, 0), 0), 4);

    IF p_xp_amount <= 0 THEN
        RAISE EXCEPTION 'xp_amount must be positive'
            USING ERRCODE = '22023';
    END IF;

    IF p_server_id IS NULL OR p_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required'
            USING ERRCODE = '22023';
    END IF;

    -- Upsert: create with defaults if missing, otherwise add XP
    INSERT INTO mc.skill (player_uuid, server_id, skill_id, category, level, experience)
    VALUES (v_player_uuid, p_server_id, v_skill_id, v_category,
            mc.xp_to_level(p_xp_amount), p_xp_amount)
    ON CONFLICT (player_uuid, server_id, skill_id) DO UPDATE SET
        experience = mc.skill.experience + p_xp_amount
    RETURNING
        mc.skill.level,
        mc.skill.experience
    INTO v_old_level, v_new_xp;

    -- Recompute level from new total XP
    v_new_level := mc.xp_to_level(v_new_xp);

    -- Update level if it changed
    IF v_new_level <> v_old_level THEN
        UPDATE mc.skill
        SET level = v_new_level
        WHERE mc.skill.player_uuid = v_player_uuid
          AND mc.skill.server_id = p_server_id
          AND mc.skill.skill_id = v_skill_id;
    END IF;

    RETURN QUERY SELECT v_new_level, v_new_xp, (v_new_level <> v_old_level);
END;
$$;

REVOKE ALL ON FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT)
    TO service_role;
ALTER FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'skill'
    ) THEN
        RAISE EXCEPTION 'mc.skill table creation failed';
    END IF;

    -- Functions exist
    PERFORM 'mc.normalize_skill_id(text)'::regprocedure;
    PERFORM 'mc.service_save_skill_tree(jsonb)'::regprocedure;
    PERFORM 'mc.service_load_skill_tree(text, text)'::regprocedure;
    PERFORM 'mc.service_add_skill_xp(text, text, text, integer, bigint)'::regprocedure;

    -- service_role CAN execute
    IF NOT has_function_privilege('service_role', 'mc.service_save_skill_tree(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_save_skill_tree';
    END IF;
    IF NOT has_function_privilege('service_role', 'mc.service_load_skill_tree(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_load_skill_tree';
    END IF;
    IF NOT has_function_privilege('service_role', 'mc.service_add_skill_xp(text, text, text, integer, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_add_skill_xp';
    END IF;

    -- anon CANNOT execute
    IF has_function_privilege('anon', 'mc.service_save_skill_tree(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_save_skill_tree';
    END IF;
    IF has_function_privilege('anon', 'mc.service_load_skill_tree(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_load_skill_tree';
    END IF;
    IF has_function_privilege('anon', 'mc.service_add_skill_xp(text, text, text, integer, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_add_skill_xp';
    END IF;
    IF has_function_privilege('anon', 'mc.normalize_skill_id(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.normalize_skill_id';
    END IF;

    -- authenticated CANNOT execute
    IF has_function_privilege('authenticated', 'mc.service_save_skill_tree(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_save_skill_tree';
    END IF;
    IF has_function_privilege('authenticated', 'mc.service_load_skill_tree(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_load_skill_tree';
    END IF;
    IF has_function_privilege('authenticated', 'mc.service_add_skill_xp(text, text, text, integer, bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_add_skill_xp';
    END IF;

    -- Ownership checks
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_save_skill_tree(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_save_skill_tree must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_load_skill_tree(text, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_load_skill_tree must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_add_skill_xp(text, text, text, integer, bigint)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_add_skill_xp must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.normalize_skill_id(text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.normalize_skill_id must be owned by service_role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.trg_skill_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.trg_skill_updated_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.skill setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
