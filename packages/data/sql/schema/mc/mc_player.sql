-- ============================================================
-- MC PLAYER — Persist player state snapshots from MC server
--
-- Stores the latest full snapshot per player per server.
-- Complex nested data (inventory, ender chest) stored as JSONB;
-- scalar state (health, food, xp, position) as typed columns
-- for queryability.
--
-- Called exclusively by the MC server via service_role.
-- Requires: mc schema (created by mc_auth.sql)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: mc.player
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.player (
    -- Composite PK: one snapshot per player per server
    player_uuid TEXT NOT NULL,
    server_id   TEXT NOT NULL,

    -- Identity
    player_name TEXT NOT NULL,
    user_id     UUID                      -- Supabase user_id if linked (nullable)
                    REFERENCES auth.users(id)
                    ON DELETE SET NULL,

    -- Position
    pos_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_yaw     REAL NOT NULL DEFAULT 0,
    pos_pitch   REAL NOT NULL DEFAULT 0,
    world       TEXT NOT NULL DEFAULT 'minecraft:overworld',

    -- State
    game_mode   INTEGER NOT NULL DEFAULT 0,    -- McGameMode enum
    health      REAL NOT NULL DEFAULT 20.0,
    food_level  INTEGER NOT NULL DEFAULT 20,
    saturation  REAL NOT NULL DEFAULT 5.0,
    xp_level    INTEGER NOT NULL DEFAULT 0,
    xp_points   INTEGER NOT NULL DEFAULT 0,

    -- Complex nested data as JSONB
    inventory   JSONB NOT NULL DEFAULT '[]'::JSONB,   -- McSlot array
    ender_chest JSONB NOT NULL DEFAULT '[]'::JSONB,   -- McSlot array
    selected_slot INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (player_uuid, server_id),

    -- MC UUID format: 32 lowercase hex characters (no dashes)
    CONSTRAINT player_uuid_format_chk
        CHECK (player_uuid ~ '^[a-f0-9]{32}$'),

    CONSTRAINT health_range_chk
        CHECK (health >= 0 AND health <= 20),

    CONSTRAINT food_level_range_chk
        CHECK (food_level >= 0 AND food_level <= 20),

    CONSTRAINT game_mode_range_chk
        CHECK (game_mode >= 0 AND game_mode <= 3),

    CONSTRAINT selected_slot_range_chk
        CHECK (selected_slot >= 0 AND selected_slot <= 8)
);

-- Fast lookup by user_id for "which servers has this user played on?"
CREATE INDEX IF NOT EXISTS idx_mc_player_user_id
    ON mc.player (user_id)
    WHERE user_id IS NOT NULL;

-- Fast lookup by server for "all players on server X"
CREATE INDEX IF NOT EXISTS idx_mc_player_server_id
    ON mc.player (server_id);

COMMENT ON TABLE mc.player IS
    'Latest player state snapshot per player per server, persisted from MC server.';

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE mc.player ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.player;

CREATE POLICY "service_role_full_access"
    ON mc.player
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===========================================
-- TRIGGER: auto-update updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION mc.trg_player_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION mc.trg_player_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.trg_player_updated_at()
    TO service_role;
ALTER FUNCTION mc.trg_player_updated_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_mc_player_updated_at ON mc.player;

CREATE TRIGGER trg_mc_player_updated_at
BEFORE UPDATE ON mc.player
FOR EACH ROW
EXECUTE FUNCTION mc.trg_player_updated_at();

-- ===========================================
-- SERVICE FUNCTION: Save player snapshot
--
-- Accepts the full snapshot as JSONB, decomposes into columns.
-- Upserts: creates on first save, updates on subsequent saves.
-- Returns the player_uuid on success.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_save_player(
    p_snapshot JSONB
)
RETURNS TEXT  -- returns player_uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
    v_server_id   TEXT;
    v_position    JSONB;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_snapshot->>'player_uuid');
    v_server_id   := p_snapshot->>'server_id';

    IF v_server_id IS NULL OR v_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required in snapshot'
            USING ERRCODE = '22023';
    END IF;

    v_position := p_snapshot->'position';

    INSERT INTO mc.player (
        player_uuid, server_id, player_name, user_id,
        pos_x, pos_y, pos_z, pos_yaw, pos_pitch, world,
        game_mode, health, food_level, saturation,
        xp_level, xp_points,
        inventory, ender_chest, selected_slot,
        captured_at
    )
    VALUES (
        v_player_uuid,
        v_server_id,
        COALESCE(p_snapshot->>'player_name', ''),
        CASE WHEN p_snapshot->>'user_id' IS NOT NULL
             THEN (p_snapshot->>'user_id')::UUID
             ELSE NULL
        END,
        COALESCE((v_position->>'x')::DOUBLE PRECISION, 0),
        COALESCE((v_position->>'y')::DOUBLE PRECISION, 0),
        COALESCE((v_position->>'z')::DOUBLE PRECISION, 0),
        COALESCE((v_position->>'yaw')::REAL, 0),
        COALESCE((v_position->>'pitch')::REAL, 0),
        COALESCE(v_position->>'world', 'minecraft:overworld'),
        COALESCE((p_snapshot->>'game_mode')::INTEGER, 0),
        COALESCE((p_snapshot->>'health')::REAL, 20.0),
        COALESCE((p_snapshot->>'food_level')::INTEGER, 20),
        COALESCE((p_snapshot->>'saturation')::REAL, 5.0),
        COALESCE((p_snapshot->>'experience_level')::INTEGER, 0),
        COALESCE((p_snapshot->>'experience_points')::INTEGER, 0),
        COALESCE(p_snapshot->'inventory'->'slots', '[]'::JSONB),
        COALESCE(p_snapshot->'ender_chest', '[]'::JSONB),
        COALESCE((p_snapshot->'inventory'->>'selected_slot')::INTEGER, 0),
        COALESCE((p_snapshot->>'captured_at')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET
        player_name   = EXCLUDED.player_name,
        user_id       = EXCLUDED.user_id,
        pos_x         = EXCLUDED.pos_x,
        pos_y         = EXCLUDED.pos_y,
        pos_z         = EXCLUDED.pos_z,
        pos_yaw       = EXCLUDED.pos_yaw,
        pos_pitch     = EXCLUDED.pos_pitch,
        world         = EXCLUDED.world,
        game_mode     = EXCLUDED.game_mode,
        health        = EXCLUDED.health,
        food_level    = EXCLUDED.food_level,
        saturation    = EXCLUDED.saturation,
        xp_level      = EXCLUDED.xp_level,
        xp_points     = EXCLUDED.xp_points,
        inventory     = EXCLUDED.inventory,
        ender_chest   = EXCLUDED.ender_chest,
        selected_slot = EXCLUDED.selected_slot,
        captured_at   = EXCLUDED.captured_at;

    RETURN v_player_uuid;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_save_player(JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_save_player(JSONB)
    TO service_role;
ALTER FUNCTION mc.service_save_player(JSONB) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Load player snapshot
--
-- Returns the latest snapshot for a player on a specific server.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_load_player(
    p_player_uuid TEXT,
    p_server_id   TEXT
)
RETURNS TABLE (
    player_uuid   TEXT,
    server_id     TEXT,
    player_name   TEXT,
    user_id       UUID,
    pos_x         DOUBLE PRECISION,
    pos_y         DOUBLE PRECISION,
    pos_z         DOUBLE PRECISION,
    pos_yaw       REAL,
    pos_pitch     REAL,
    world         TEXT,
    game_mode     INTEGER,
    health        REAL,
    food_level    INTEGER,
    saturation    REAL,
    xp_level      INTEGER,
    xp_points     INTEGER,
    inventory     JSONB,
    ender_chest   JSONB,
    selected_slot INTEGER,
    captured_at   TIMESTAMPTZ
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
        p.player_uuid,
        p.server_id,
        p.player_name,
        p.user_id,
        p.pos_x,
        p.pos_y,
        p.pos_z,
        p.pos_yaw,
        p.pos_pitch,
        p.world,
        p.game_mode,
        p.health,
        p.food_level,
        p.saturation,
        p.xp_level,
        p.xp_points,
        p.inventory,
        p.ender_chest,
        p.selected_slot,
        p.captured_at
    FROM mc.player AS p
    WHERE p.player_uuid = v_player_uuid
      AND p.server_id = p_server_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_load_player(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_load_player(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_load_player(TEXT, TEXT) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    -- Verify table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'player'
    ) THEN
        RAISE EXCEPTION 'mc.player table creation failed';
    END IF;

    -- Verify functions exist
    PERFORM 'mc.service_save_player(jsonb)'::regprocedure;
    PERFORM 'mc.service_load_player(text, text)'::regprocedure;

    -- Verify service_role can execute
    IF NOT has_function_privilege('service_role', 'mc.service_save_player(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_save_player';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_load_player(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_load_player';
    END IF;

    -- Verify anon CANNOT execute
    IF has_function_privilege('anon', 'mc.service_save_player(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_save_player';
    END IF;

    IF has_function_privilege('anon', 'mc.service_load_player(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_load_player';
    END IF;

    -- Verify authenticated CANNOT execute
    IF has_function_privilege('authenticated', 'mc.service_save_player(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_save_player';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_load_player(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_load_player';
    END IF;

    -- Verify ownership
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_save_player(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_save_player must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_load_player(text, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_load_player must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.trg_player_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.trg_player_updated_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.player setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
