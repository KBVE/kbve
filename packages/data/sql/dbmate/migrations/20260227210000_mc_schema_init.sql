-- migrate:up

-- ============================================================
-- MC SCHEMA — Initial migration
--
-- Creates the full mc schema: auth, player, container,
-- transfer, character, skill tables with all functions,
-- triggers, RLS policies, and permission grants.
--
-- Source of truth: packages/data/sql/schema/mc/mc.sql
-- ============================================================

-- pgcrypto for bcrypt hashing of verification codes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================
-- SCHEMA + PERMISSIONS
-- ===========================================

CREATE SCHEMA IF NOT EXISTS mc;
ALTER SCHEMA mc OWNER TO postgres;

GRANT USAGE ON SCHEMA mc TO service_role;
REVOKE ALL ON SCHEMA mc FROM PUBLIC;
REVOKE ALL ON SCHEMA mc FROM anon, authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA mc TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mc TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA mc TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mc
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ========== TABLE: mc.auth ==========

CREATE TABLE IF NOT EXISTS mc.auth (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,
    mc_uuid TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    verification_code_hash TEXT,
    code_expires_at TIMESTAMPTZ,
    verify_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mc_uuid_format_chk
        CHECK (mc_uuid ~ '^[a-f0-9]{32}$'),
    CONSTRAINT code_expires_chk
        CHECK (verification_code_hash IS NULL OR code_expires_at IS NOT NULL),
    CONSTRAINT verify_attempts_chk
        CHECK (verify_attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_auth_mc_uuid ON mc.auth (mc_uuid);
CREATE INDEX IF NOT EXISTS idx_mc_auth_pending_verification ON mc.auth (mc_uuid) WHERE verification_code_hash IS NOT NULL;

ALTER TABLE mc.auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.auth;
CREATE POLICY "service_role_full_access" ON mc.auth FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES IN SCHEMA mc FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mc FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mc FROM PUBLIC, anon, authenticated;

-- ========== TABLE: mc.player ==========

CREATE TABLE IF NOT EXISTS mc.player (
    player_uuid TEXT NOT NULL,
    server_id   TEXT NOT NULL,
    player_name TEXT NOT NULL,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    pos_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_z       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_yaw     REAL NOT NULL DEFAULT 0,
    pos_pitch   REAL NOT NULL DEFAULT 0,
    world       TEXT NOT NULL DEFAULT 'minecraft:overworld',
    game_mode   INTEGER NOT NULL DEFAULT 0,
    health      REAL NOT NULL DEFAULT 20.0,
    food_level  INTEGER NOT NULL DEFAULT 20,
    saturation  REAL NOT NULL DEFAULT 5.0,
    xp_level    INTEGER NOT NULL DEFAULT 0,
    xp_points   INTEGER NOT NULL DEFAULT 0,
    inventory   JSONB NOT NULL DEFAULT '[]'::JSONB,
    ender_chest JSONB NOT NULL DEFAULT '[]'::JSONB,
    selected_slot INTEGER NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_uuid, server_id),
    CONSTRAINT player_uuid_format_chk CHECK (player_uuid ~ '^[a-f0-9]{32}$'),
    CONSTRAINT health_range_chk CHECK (health >= 0 AND health <= 20),
    CONSTRAINT food_level_range_chk CHECK (food_level >= 0 AND food_level <= 20),
    CONSTRAINT game_mode_range_chk CHECK (game_mode >= 0 AND game_mode <= 3),
    CONSTRAINT selected_slot_range_chk CHECK (selected_slot >= 0 AND selected_slot <= 8)
);

CREATE INDEX IF NOT EXISTS idx_mc_player_user_id ON mc.player (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_player_server_id ON mc.player (server_id);

ALTER TABLE mc.player ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.player;
CREATE POLICY "service_role_full_access" ON mc.player FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: mc.container ==========

CREATE TABLE IF NOT EXISTS mc.container (
    container_id TEXT NOT NULL,
    server_id    TEXT NOT NULL,
    container_type INTEGER NOT NULL DEFAULT 0,
    world          TEXT,
    pos_x          INTEGER,
    pos_y          INTEGER,
    pos_z          INTEGER,
    custom_name    TEXT,
    slots JSONB NOT NULL DEFAULT '[]'::JSONB,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (container_id, server_id),
    CONSTRAINT container_type_range_chk CHECK (container_type >= 0 AND container_type <= 13)
);

CREATE INDEX IF NOT EXISTS idx_mc_container_world_pos ON mc.container (server_id, world, pos_x, pos_y, pos_z) WHERE world IS NOT NULL AND pos_x IS NOT NULL;

ALTER TABLE mc.container ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.container;
CREATE POLICY "service_role_full_access" ON mc.container FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: mc.transfer ==========

CREATE TABLE IF NOT EXISTS mc.transfer (
    transfer_id TEXT PRIMARY KEY,
    transfer_type INTEGER NOT NULL DEFAULT 0,
    server_id     TEXT NOT NULL,
    world         TEXT,
    item JSONB NOT NULL,
    source_player_uuid   TEXT,
    source_container_id  TEXT,
    source_slot          INTEGER,
    dest_player_uuid     TEXT,
    dest_container_id    TEXT,
    dest_slot            INTEGER,
    transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transfer_type_range_chk CHECK (transfer_type >= 0 AND transfer_type <= 9),
    CONSTRAINT source_required_chk CHECK (source_player_uuid IS NOT NULL OR source_container_id IS NOT NULL),
    CONSTRAINT dest_required_chk CHECK (dest_player_uuid IS NOT NULL OR dest_container_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_mc_transfer_source_player ON mc.transfer (source_player_uuid, transferred_at DESC) WHERE source_player_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_transfer_dest_player ON mc.transfer (dest_player_uuid, transferred_at DESC) WHERE dest_player_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_transfer_server_time ON mc.transfer (server_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mc_transfer_source_container ON mc.transfer (source_container_id, transferred_at DESC) WHERE source_container_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_transfer_dest_container ON mc.transfer (dest_container_id, transferred_at DESC) WHERE dest_container_id IS NOT NULL;

ALTER TABLE mc.transfer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.transfer;
CREATE POLICY "service_role_full_access" ON mc.transfer FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: mc.character ==========

CREATE TABLE IF NOT EXISTS mc.character (
    player_uuid TEXT NOT NULL,
    server_id   TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    experience  BIGINT  NOT NULL DEFAULT 0,
    strength     INTEGER NOT NULL DEFAULT 1,
    dexterity    INTEGER NOT NULL DEFAULT 1,
    constitution INTEGER NOT NULL DEFAULT 1,
    intelligence INTEGER NOT NULL DEFAULT 1,
    wisdom       INTEGER NOT NULL DEFAULT 1,
    charisma     INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_uuid, server_id),
    CONSTRAINT char_player_uuid_format_chk CHECK (player_uuid ~ '^[a-f0-9]{32}$'),
    CONSTRAINT char_level_chk CHECK (level >= 1),
    CONSTRAINT char_experience_chk CHECK (experience >= 0),
    CONSTRAINT char_strength_chk CHECK (strength >= 1 AND strength <= 999),
    CONSTRAINT char_dexterity_chk CHECK (dexterity >= 1 AND dexterity <= 999),
    CONSTRAINT char_constitution_chk CHECK (constitution >= 1 AND constitution <= 999),
    CONSTRAINT char_intelligence_chk CHECK (intelligence >= 1 AND intelligence <= 999),
    CONSTRAINT char_wisdom_chk CHECK (wisdom >= 1 AND wisdom <= 999),
    CONSTRAINT char_charisma_chk CHECK (charisma >= 1 AND charisma <= 999)
);

CREATE INDEX IF NOT EXISTS idx_mc_character_user_id ON mc.character (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_character_server_id ON mc.character (server_id);

ALTER TABLE mc.character ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.character;
CREATE POLICY "service_role_full_access" ON mc.character FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TABLE: mc.skill ==========

CREATE TABLE IF NOT EXISTS mc.skill (
    player_uuid TEXT    NOT NULL,
    server_id   TEXT    NOT NULL,
    skill_id    TEXT    NOT NULL,
    category    INTEGER NOT NULL DEFAULT 0,
    level       INTEGER NOT NULL DEFAULT 1,
    experience  BIGINT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (player_uuid, server_id, skill_id),
    CONSTRAINT skill_player_uuid_format_chk CHECK (player_uuid ~ '^[a-f0-9]{32}$'),
    CONSTRAINT skill_id_format_chk CHECK (skill_id ~ '^[a-z0-9_]{1,64}$'),
    CONSTRAINT skill_category_range_chk CHECK (category >= 0 AND category <= 4),
    CONSTRAINT skill_level_chk CHECK (level >= 1),
    CONSTRAINT skill_experience_chk CHECK (experience >= 0)
);

CREATE INDEX IF NOT EXISTS idx_mc_skill_player_server ON mc.skill (player_uuid, server_id);
CREATE INDEX IF NOT EXISTS idx_mc_skill_leaderboard ON mc.skill (server_id, skill_id, level DESC, experience DESC);

ALTER TABLE mc.skill ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON mc.skill;
CREATE POLICY "service_role_full_access" ON mc.skill FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ========== TRIGGERS: updated_at ==========

CREATE OR REPLACE FUNCTION mc.trg_auth_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION mc.trg_player_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION mc.trg_container_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION mc.trg_character_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION mc.trg_skill_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mc_auth_updated_at ON mc.auth;
CREATE TRIGGER trg_mc_auth_updated_at BEFORE UPDATE ON mc.auth FOR EACH ROW EXECUTE FUNCTION mc.trg_auth_updated_at();

DROP TRIGGER IF EXISTS trg_mc_player_updated_at ON mc.player;
CREATE TRIGGER trg_mc_player_updated_at BEFORE UPDATE ON mc.player FOR EACH ROW EXECUTE FUNCTION mc.trg_player_updated_at();

DROP TRIGGER IF EXISTS trg_mc_container_updated_at ON mc.container;
CREATE TRIGGER trg_mc_container_updated_at BEFORE UPDATE ON mc.container FOR EACH ROW EXECUTE FUNCTION mc.trg_container_updated_at();

DROP TRIGGER IF EXISTS trg_mc_character_updated_at ON mc.character;
CREATE TRIGGER trg_mc_character_updated_at BEFORE UPDATE ON mc.character FOR EACH ROW EXECUTE FUNCTION mc.trg_character_updated_at();

DROP TRIGGER IF EXISTS trg_mc_skill_updated_at ON mc.skill;
CREATE TRIGGER trg_mc_skill_updated_at BEFORE UPDATE ON mc.skill FOR EACH ROW EXECUTE FUNCTION mc.trg_skill_updated_at();

-- ========== HELPER FUNCTIONS ==========

CREATE OR REPLACE FUNCTION mc.normalize_mc_uuid(p_input TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_clean TEXT;
BEGIN
    IF p_input IS NULL THEN RAISE EXCEPTION 'MC UUID cannot be NULL' USING ERRCODE = '22004'; END IF;
    v_clean := lower(replace(p_input, '-', ''));
    IF v_clean !~ '^[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Invalid Minecraft UUID format: %', p_input USING ERRCODE = '22023'; END IF;
    RETURN v_clean;
END; $$;

CREATE OR REPLACE FUNCTION mc.xp_to_level(p_xp BIGINT) RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
    IF p_xp < 0 THEN RETURN 1; END IF;
    RETURN floor(sqrt(p_xp::DOUBLE PRECISION / 100.0))::INTEGER + 1;
END; $$;

CREATE OR REPLACE FUNCTION mc.clamp_stat(p_val INTEGER) RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN RETURN GREATEST(1, LEAST(p_val, 999)); END; $$;

CREATE OR REPLACE FUNCTION mc.normalize_skill_id(p_input TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_clean TEXT;
BEGIN
    IF p_input IS NULL OR p_input = '' THEN RAISE EXCEPTION 'skill_id cannot be NULL or empty' USING ERRCODE = '22004'; END IF;
    v_clean := lower(trim(p_input));
    IF v_clean !~ '^[a-z0-9_]{1,64}$' THEN RAISE EXCEPTION 'Invalid skill_id format: %. Must be 1-64 lowercase alphanumeric/underscores.', p_input USING ERRCODE = '22023'; END IF;
    RETURN v_clean;
END; $$;

-- ========== SERVICE FUNCTIONS: mc.auth ==========

CREATE OR REPLACE FUNCTION mc.service_request_link(p_user_id UUID, p_mc_uuid TEXT) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mc_uuid TEXT; v_code INTEGER; v_existing_status INTEGER;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);
    PERFORM pg_advisory_xact_lock(hashtext(v_mc_uuid));
    SELECT status INTO v_existing_status FROM mc.auth WHERE user_id = p_user_id;
    IF v_existing_status IS NOT NULL AND (v_existing_status & 1) = 1 THEN
        RAISE EXCEPTION 'Account already has a verified Minecraft link. Unlink first.' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (SELECT 1 FROM mc.auth WHERE mc_uuid = v_mc_uuid AND user_id <> p_user_id) THEN
        RAISE EXCEPTION 'Minecraft UUID already linked to another account' USING ERRCODE = '23505';
    END IF;
    v_code := floor(random() * 900000 + 100000)::INTEGER;
    INSERT INTO mc.auth (user_id, mc_uuid, status, verification_code_hash, code_expires_at, verify_attempts, locked_until)
    VALUES (p_user_id, v_mc_uuid, 0, crypt(v_code::TEXT, gen_salt('bf')), NOW() + INTERVAL '10 minutes', 0, NULL)
    ON CONFLICT (user_id) DO UPDATE SET
        mc_uuid = EXCLUDED.mc_uuid, status = 0, verification_code_hash = EXCLUDED.verification_code_hash,
        code_expires_at = EXCLUDED.code_expires_at, verify_attempts = 0, locked_until = NULL;
    RETURN v_code;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_verify_link(p_mc_uuid TEXT, p_code INTEGER) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mc_uuid TEXT; v_user_id UUID; v_hash TEXT; v_expires TIMESTAMPTZ; v_attempts INTEGER; v_locked TIMESTAMPTZ;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);
    SELECT user_id, verification_code_hash, code_expires_at, verify_attempts, locked_until
    INTO v_user_id, v_hash, v_expires, v_attempts, v_locked
    FROM mc.auth WHERE mc_uuid = v_mc_uuid AND verification_code_hash IS NOT NULL AND (status & 6) = 0 FOR UPDATE;
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    IF v_locked IS NOT NULL AND v_locked > NOW() THEN RETURN NULL; END IF;
    IF v_expires IS NOT NULL AND v_expires < NOW() THEN
        UPDATE mc.auth SET verification_code_hash = NULL, code_expires_at = NULL, verify_attempts = 0, locked_until = NULL WHERE user_id = v_user_id;
        RETURN NULL;
    END IF;
    IF v_hash = crypt(p_code::TEXT, v_hash) THEN
        UPDATE mc.auth SET status = (status | 1), verification_code_hash = NULL, code_expires_at = NULL, verify_attempts = 0, locked_until = NULL WHERE user_id = v_user_id;
        RETURN v_user_id;
    END IF;
    IF v_attempts + 1 >= 5 THEN
        UPDATE mc.auth SET verify_attempts = verify_attempts + 1, locked_until = NOW() + INTERVAL '15 minutes' WHERE user_id = v_user_id;
    ELSE
        UPDATE mc.auth SET verify_attempts = verify_attempts + 1 WHERE user_id = v_user_id;
    END IF;
    RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_unlink(p_user_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN DELETE FROM mc.auth WHERE user_id = p_user_id; RETURN FOUND; END; $$;

CREATE OR REPLACE FUNCTION mc.service_get_user_by_mc_uuid(p_mc_uuid TEXT) RETURNS TABLE (user_id UUID, mc_uuid TEXT, status INTEGER, is_verified BOOLEAN, created_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_mc_uuid TEXT;
BEGIN
    v_mc_uuid := mc.normalize_mc_uuid(p_mc_uuid);
    RETURN QUERY SELECT a.user_id, a.mc_uuid, a.status, (a.status & 1) = 1, a.created_at FROM mc.auth AS a WHERE a.mc_uuid = v_mc_uuid;
END; $$;

-- ========== PROXY FUNCTIONS: mc.auth ==========

CREATE OR REPLACE FUNCTION mc.proxy_request_link(p_mc_uuid TEXT) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id UUID; v_code INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
    v_code := mc.service_request_link(v_user_id, p_mc_uuid);
    RETURN v_code;
END; $$;

CREATE OR REPLACE FUNCTION mc.proxy_get_link_status() RETURNS TABLE (mc_uuid TEXT, status INTEGER, is_verified BOOLEAN, is_pending BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
    RETURN QUERY SELECT a.mc_uuid, a.status, (a.status & 1) = 1, a.verification_code_hash IS NOT NULL AND a.code_expires_at > NOW() AND (a.locked_until IS NULL OR a.locked_until <= NOW()), a.created_at, a.updated_at FROM mc.auth AS a WHERE a.user_id = v_user_id;
END; $$;

CREATE OR REPLACE FUNCTION mc.proxy_unlink() RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
    RETURN mc.service_unlink(v_user_id);
END; $$;

-- ========== SERVICE FUNCTIONS: mc.player ==========

CREATE OR REPLACE FUNCTION mc.service_save_player(p_snapshot JSONB) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_server_id TEXT; v_position JSONB;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_snapshot->>'player_uuid');
    v_server_id := p_snapshot->>'server_id';
    IF v_server_id IS NULL OR v_server_id = '' THEN RAISE EXCEPTION 'server_id is required in snapshot' USING ERRCODE = '22023'; END IF;
    v_position := p_snapshot->'position';
    INSERT INTO mc.player (player_uuid, server_id, player_name, user_id, pos_x, pos_y, pos_z, pos_yaw, pos_pitch, world, game_mode, health, food_level, saturation, xp_level, xp_points, inventory, ender_chest, selected_slot, captured_at)
    VALUES (v_player_uuid, v_server_id, COALESCE(p_snapshot->>'player_name', ''), CASE WHEN p_snapshot->>'user_id' IS NOT NULL THEN (p_snapshot->>'user_id')::UUID ELSE NULL END, COALESCE((v_position->>'x')::DOUBLE PRECISION, 0), COALESCE((v_position->>'y')::DOUBLE PRECISION, 0), COALESCE((v_position->>'z')::DOUBLE PRECISION, 0), COALESCE((v_position->>'yaw')::REAL, 0), COALESCE((v_position->>'pitch')::REAL, 0), COALESCE(v_position->>'world', 'minecraft:overworld'), COALESCE((p_snapshot->>'game_mode')::INTEGER, 0), COALESCE((p_snapshot->>'health')::REAL, 20.0), COALESCE((p_snapshot->>'food_level')::INTEGER, 20), COALESCE((p_snapshot->>'saturation')::REAL, 5.0), COALESCE((p_snapshot->>'experience_level')::INTEGER, 0), COALESCE((p_snapshot->>'experience_points')::INTEGER, 0), COALESCE(p_snapshot->'inventory'->'slots', '[]'::JSONB), COALESCE(p_snapshot->'ender_chest', '[]'::JSONB), COALESCE((p_snapshot->'inventory'->>'selected_slot')::INTEGER, 0), COALESCE((p_snapshot->>'captured_at')::TIMESTAMPTZ, NOW()))
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET player_name = EXCLUDED.player_name, user_id = EXCLUDED.user_id, pos_x = EXCLUDED.pos_x, pos_y = EXCLUDED.pos_y, pos_z = EXCLUDED.pos_z, pos_yaw = EXCLUDED.pos_yaw, pos_pitch = EXCLUDED.pos_pitch, world = EXCLUDED.world, game_mode = EXCLUDED.game_mode, health = EXCLUDED.health, food_level = EXCLUDED.food_level, saturation = EXCLUDED.saturation, xp_level = EXCLUDED.xp_level, xp_points = EXCLUDED.xp_points, inventory = EXCLUDED.inventory, ender_chest = EXCLUDED.ender_chest, selected_slot = EXCLUDED.selected_slot, captured_at = EXCLUDED.captured_at;
    RETURN v_player_uuid;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_load_player(p_player_uuid TEXT, p_server_id TEXT) RETURNS TABLE (player_uuid TEXT, server_id TEXT, player_name TEXT, user_id UUID, pos_x DOUBLE PRECISION, pos_y DOUBLE PRECISION, pos_z DOUBLE PRECISION, pos_yaw REAL, pos_pitch REAL, world TEXT, game_mode INTEGER, health REAL, food_level INTEGER, saturation REAL, xp_level INTEGER, xp_points INTEGER, inventory JSONB, ender_chest JSONB, selected_slot INTEGER, captured_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    RETURN QUERY SELECT p.player_uuid, p.server_id, p.player_name, p.user_id, p.pos_x, p.pos_y, p.pos_z, p.pos_yaw, p.pos_pitch, p.world, p.game_mode, p.health, p.food_level, p.saturation, p.xp_level, p.xp_points, p.inventory, p.ender_chest, p.selected_slot, p.captured_at FROM mc.player AS p WHERE p.player_uuid = v_player_uuid AND p.server_id = p_server_id;
END; $$;

-- ========== SERVICE FUNCTIONS: mc.container ==========

CREATE OR REPLACE FUNCTION mc.service_save_container(p_container JSONB, p_server_id TEXT) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_container_id TEXT; v_position JSONB;
BEGIN
    v_container_id := p_container->>'container_id';
    IF v_container_id IS NULL OR v_container_id = '' THEN RAISE EXCEPTION 'container_id is required in container' USING ERRCODE = '22023'; END IF;
    IF p_server_id IS NULL OR p_server_id = '' THEN RAISE EXCEPTION 'server_id is required' USING ERRCODE = '22023'; END IF;
    v_position := p_container->'position';
    INSERT INTO mc.container (container_id, server_id, container_type, world, pos_x, pos_y, pos_z, custom_name, slots, captured_at)
    VALUES (v_container_id, p_server_id, COALESCE((p_container->>'type')::INTEGER, 0), COALESCE(p_container->>'world', v_position->>'world'), (v_position->>'x')::INTEGER, (v_position->>'y')::INTEGER, (v_position->>'z')::INTEGER, p_container->>'custom_name', COALESCE(p_container->'slots', '[]'::JSONB), COALESCE((p_container->>'captured_at')::TIMESTAMPTZ, NOW()))
    ON CONFLICT (container_id, server_id) DO UPDATE SET container_type = EXCLUDED.container_type, world = EXCLUDED.world, pos_x = EXCLUDED.pos_x, pos_y = EXCLUDED.pos_y, pos_z = EXCLUDED.pos_z, custom_name = EXCLUDED.custom_name, slots = EXCLUDED.slots, captured_at = EXCLUDED.captured_at;
    RETURN v_container_id;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_load_container(p_container_id TEXT, p_server_id TEXT) RETURNS TABLE (container_id TEXT, server_id TEXT, container_type INTEGER, world TEXT, pos_x INTEGER, pos_y INTEGER, pos_z INTEGER, custom_name TEXT, slots JSONB, captured_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY SELECT c.container_id, c.server_id, c.container_type, c.world, c.pos_x, c.pos_y, c.pos_z, c.custom_name, c.slots, c.captured_at FROM mc.container AS c WHERE c.container_id = p_container_id AND c.server_id = p_server_id;
END; $$;

-- ========== SERVICE FUNCTIONS: mc.transfer ==========

CREATE OR REPLACE FUNCTION mc.service_record_transfers(p_batch JSONB) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count INTEGER;
BEGIN
    IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'array' THEN RAISE EXCEPTION 'p_batch must be a JSONB array' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(p_batch) = 0 THEN RETURN 0; END IF;
    IF jsonb_array_length(p_batch) > 1000 THEN RAISE EXCEPTION 'Batch size exceeds limit of 1000 transfers' USING ERRCODE = '22023'; END IF;
    INSERT INTO mc.transfer (transfer_id, transfer_type, server_id, world, item, source_player_uuid, source_container_id, source_slot, dest_player_uuid, dest_container_id, dest_slot, transferred_at)
    SELECT t->>'transfer_id', COALESCE((t->>'type')::INTEGER, 0), t->>'server_id', t->>'world', COALESCE(t->'item', '{}'::JSONB), t->>'source_player_uuid', t->>'source_container_id', (t->>'source_slot')::INTEGER, t->>'dest_player_uuid', t->>'dest_container_id', (t->>'dest_slot')::INTEGER, COALESCE((t->>'timestamp')::TIMESTAMPTZ, NOW())
    FROM jsonb_array_elements(p_batch) AS t;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_get_transfer_history(p_player_uuid TEXT, p_server_id TEXT DEFAULT NULL, p_since TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0) RETURNS TABLE (transfer_id TEXT, transfer_type INTEGER, server_id TEXT, world TEXT, item JSONB, source_player_uuid TEXT, source_container_id TEXT, source_slot INTEGER, dest_player_uuid TEXT, dest_container_id TEXT, dest_slot INTEGER, transferred_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_since TIMESTAMPTZ; v_limit INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    v_since := CASE WHEN p_since IS NOT NULL THEN p_since::TIMESTAMPTZ ELSE NULL END;
    v_limit := LEAST(GREATEST(p_limit, 1), 500);
    RETURN QUERY SELECT t.transfer_id, t.transfer_type, t.server_id, t.world, t.item, t.source_player_uuid, t.source_container_id, t.source_slot, t.dest_player_uuid, t.dest_container_id, t.dest_slot, t.transferred_at FROM mc.transfer AS t WHERE (t.source_player_uuid = v_player_uuid OR t.dest_player_uuid = v_player_uuid) AND (p_server_id IS NULL OR t.server_id = p_server_id) AND (v_since IS NULL OR t.transferred_at >= v_since) ORDER BY t.transferred_at DESC LIMIT v_limit OFFSET GREATEST(p_offset, 0);
END; $$;

-- ========== SERVICE FUNCTIONS: mc.character ==========

CREATE OR REPLACE FUNCTION mc.service_save_character(p_character JSONB) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_server_id TEXT; v_xp BIGINT; v_level INTEGER; v_stats JSONB;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_character->>'player_uuid');
    v_server_id := p_character->>'server_id';
    IF v_server_id IS NULL OR v_server_id = '' THEN RAISE EXCEPTION 'server_id is required in character' USING ERRCODE = '22023'; END IF;
    v_xp := GREATEST(COALESCE((p_character->>'experience')::BIGINT, 0), 0);
    v_level := mc.xp_to_level(v_xp);
    v_stats := COALESCE(p_character->'base_stats', '{}'::JSONB);
    INSERT INTO mc.character (player_uuid, server_id, user_id, level, experience, strength, dexterity, constitution, intelligence, wisdom, charisma)
    VALUES (v_player_uuid, v_server_id, CASE WHEN p_character->>'user_id' IS NOT NULL THEN (p_character->>'user_id')::UUID ELSE NULL END, v_level, v_xp, mc.clamp_stat(COALESCE((v_stats->>'strength')::INTEGER, 1)), mc.clamp_stat(COALESCE((v_stats->>'dexterity')::INTEGER, 1)), mc.clamp_stat(COALESCE((v_stats->>'constitution')::INTEGER, 1)), mc.clamp_stat(COALESCE((v_stats->>'intelligence')::INTEGER, 1)), mc.clamp_stat(COALESCE((v_stats->>'wisdom')::INTEGER, 1)), mc.clamp_stat(COALESCE((v_stats->>'charisma')::INTEGER, 1)))
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET user_id = EXCLUDED.user_id, level = EXCLUDED.level, experience = EXCLUDED.experience, strength = EXCLUDED.strength, dexterity = EXCLUDED.dexterity, constitution = EXCLUDED.constitution, intelligence = EXCLUDED.intelligence, wisdom = EXCLUDED.wisdom, charisma = EXCLUDED.charisma;
    RETURN v_player_uuid;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_load_character(p_player_uuid TEXT, p_server_id TEXT) RETURNS TABLE (player_uuid TEXT, server_id TEXT, user_id UUID, level INTEGER, experience BIGINT, strength INTEGER, dexterity INTEGER, constitution INTEGER, intelligence INTEGER, wisdom INTEGER, charisma INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    RETURN QUERY SELECT c.player_uuid, c.server_id, c.user_id, c.level, c.experience, c.strength, c.dexterity, c.constitution, c.intelligence, c.wisdom, c.charisma, c.created_at, c.updated_at FROM mc.character AS c WHERE c.player_uuid = v_player_uuid AND c.server_id = p_server_id;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_add_experience(p_player_uuid TEXT, p_server_id TEXT, p_xp_amount BIGINT) RETURNS TABLE (new_level INTEGER, total_experience BIGINT, leveled_up BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_old_level INTEGER; v_new_xp BIGINT; v_new_level INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    IF p_xp_amount <= 0 THEN RAISE EXCEPTION 'xp_amount must be positive' USING ERRCODE = '22023'; END IF;
    IF p_server_id IS NULL OR p_server_id = '' THEN RAISE EXCEPTION 'server_id is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO mc.character (player_uuid, server_id, level, experience) VALUES (v_player_uuid, p_server_id, mc.xp_to_level(p_xp_amount), p_xp_amount)
    ON CONFLICT (player_uuid, server_id) DO UPDATE SET experience = mc.character.experience + p_xp_amount
    RETURNING mc.character.level, mc.character.experience INTO v_old_level, v_new_xp;
    v_new_level := mc.xp_to_level(v_new_xp);
    IF v_new_level <> v_old_level THEN UPDATE mc.character SET level = v_new_level WHERE mc.character.player_uuid = v_player_uuid AND mc.character.server_id = p_server_id; END IF;
    RETURN QUERY SELECT v_new_level, v_new_xp, (v_new_level <> v_old_level);
END; $$;

-- ========== SERVICE FUNCTIONS: mc.skill ==========

CREATE OR REPLACE FUNCTION mc.service_save_skill_tree(p_skill_tree JSONB) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_server_id TEXT; v_skills JSONB; v_count INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_skill_tree->>'player_uuid');
    v_server_id := p_skill_tree->>'server_id';
    IF v_server_id IS NULL OR v_server_id = '' THEN RAISE EXCEPTION 'server_id is required in skill_tree' USING ERRCODE = '22023'; END IF;
    v_skills := p_skill_tree->'skills';
    IF v_skills IS NULL OR jsonb_typeof(v_skills) <> 'array' THEN RAISE EXCEPTION 'skills must be a JSONB array' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(v_skills) = 0 THEN RETURN 0; END IF;
    IF jsonb_array_length(v_skills) > 200 THEN RAISE EXCEPTION 'Skill tree exceeds limit of 200 skills' USING ERRCODE = '22023'; END IF;
    INSERT INTO mc.skill (player_uuid, server_id, skill_id, category, level, experience)
    SELECT v_player_uuid, v_server_id, mc.normalize_skill_id(s->>'skill_id'), LEAST(GREATEST(COALESCE((s->>'category')::INTEGER, 0), 0), 4), mc.xp_to_level(GREATEST(COALESCE((s->>'experience')::BIGINT, 0), 0)), GREATEST(COALESCE((s->>'experience')::BIGINT, 0), 0)
    FROM jsonb_array_elements(v_skills) AS s
    ON CONFLICT (player_uuid, server_id, skill_id) DO UPDATE SET category = EXCLUDED.category, level = EXCLUDED.level, experience = EXCLUDED.experience;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_load_skill_tree(p_player_uuid TEXT, p_server_id TEXT) RETURNS TABLE (skill_id TEXT, category INTEGER, level INTEGER, experience BIGINT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    RETURN QUERY SELECT s.skill_id, s.category, s.level, s.experience, s.created_at, s.updated_at FROM mc.skill AS s WHERE s.player_uuid = v_player_uuid AND s.server_id = p_server_id ORDER BY s.category, s.skill_id;
END; $$;

CREATE OR REPLACE FUNCTION mc.service_add_skill_xp(p_player_uuid TEXT, p_server_id TEXT, p_skill_id TEXT, p_category INTEGER, p_xp_amount BIGINT) RETURNS TABLE (new_level INTEGER, total_experience BIGINT, leveled_up BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_player_uuid TEXT; v_skill_id TEXT; v_category INTEGER; v_old_level INTEGER; v_new_xp BIGINT; v_new_level INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    v_skill_id := mc.normalize_skill_id(p_skill_id);
    v_category := LEAST(GREATEST(COALESCE(p_category, 0), 0), 4);
    IF p_xp_amount <= 0 THEN RAISE EXCEPTION 'xp_amount must be positive' USING ERRCODE = '22023'; END IF;
    IF p_server_id IS NULL OR p_server_id = '' THEN RAISE EXCEPTION 'server_id is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO mc.skill (player_uuid, server_id, skill_id, category, level, experience) VALUES (v_player_uuid, p_server_id, v_skill_id, v_category, mc.xp_to_level(p_xp_amount), p_xp_amount)
    ON CONFLICT (player_uuid, server_id, skill_id) DO UPDATE SET experience = mc.skill.experience + p_xp_amount
    RETURNING mc.skill.level, mc.skill.experience INTO v_old_level, v_new_xp;
    v_new_level := mc.xp_to_level(v_new_xp);
    IF v_new_level <> v_old_level THEN UPDATE mc.skill SET level = v_new_level WHERE mc.skill.player_uuid = v_player_uuid AND mc.skill.server_id = p_server_id AND mc.skill.skill_id = v_skill_id; END IF;
    RETURN QUERY SELECT v_new_level, v_new_xp, (v_new_level <> v_old_level);
END; $$;

-- ========== PERMISSION GRANTS ==========

-- Trigger functions
DO $$ BEGIN
    REVOKE ALL ON FUNCTION mc.trg_auth_updated_at() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.trg_player_updated_at() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.trg_container_updated_at() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.trg_character_updated_at() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.trg_skill_updated_at() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION mc.trg_auth_updated_at() TO service_role;
    GRANT EXECUTE ON FUNCTION mc.trg_player_updated_at() TO service_role;
    GRANT EXECUTE ON FUNCTION mc.trg_container_updated_at() TO service_role;
    GRANT EXECUTE ON FUNCTION mc.trg_character_updated_at() TO service_role;
    GRANT EXECUTE ON FUNCTION mc.trg_skill_updated_at() TO service_role;
END $$;

-- Helper functions
DO $$ BEGIN
    REVOKE ALL ON FUNCTION mc.normalize_mc_uuid(TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.xp_to_level(BIGINT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.clamp_stat(INTEGER) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.normalize_skill_id(TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION mc.normalize_mc_uuid(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.xp_to_level(BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.clamp_stat(INTEGER) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.normalize_skill_id(TEXT) TO service_role;
END $$;

-- Service functions (service_role only)
DO $$ BEGIN
    REVOKE ALL ON FUNCTION mc.service_request_link(UUID, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_verify_link(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_unlink(UUID) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_get_user_by_mc_uuid(TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_save_player(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_load_player(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_save_container(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_load_container(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_record_transfers(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_save_character(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_load_character(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_save_skill_tree(JSONB) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_load_skill_tree(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION mc.service_request_link(UUID, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_verify_link(TEXT, INTEGER) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_unlink(UUID) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_get_user_by_mc_uuid(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_save_player(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_load_player(TEXT, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_save_container(JSONB, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_load_container(TEXT, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_record_transfers(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_save_character(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_load_character(TEXT, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_save_skill_tree(JSONB) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_load_skill_tree(TEXT, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT) TO service_role;
END $$;

-- Proxy functions (authenticated + service_role)
DO $$ BEGIN
    REVOKE ALL ON FUNCTION mc.proxy_request_link(TEXT) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION mc.proxy_get_link_status() FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION mc.proxy_unlink() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION mc.proxy_request_link(TEXT) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION mc.proxy_get_link_status() TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION mc.proxy_unlink() TO authenticated, service_role;
END $$;

-- Ownership (all functions owned by service_role)
DO $$ BEGIN
    ALTER FUNCTION mc.trg_auth_updated_at() OWNER TO service_role;
    ALTER FUNCTION mc.trg_player_updated_at() OWNER TO service_role;
    ALTER FUNCTION mc.trg_container_updated_at() OWNER TO service_role;
    ALTER FUNCTION mc.trg_character_updated_at() OWNER TO service_role;
    ALTER FUNCTION mc.trg_skill_updated_at() OWNER TO service_role;
    ALTER FUNCTION mc.normalize_mc_uuid(TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.xp_to_level(BIGINT) OWNER TO service_role;
    ALTER FUNCTION mc.clamp_stat(INTEGER) OWNER TO service_role;
    ALTER FUNCTION mc.normalize_skill_id(TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_request_link(UUID, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_verify_link(TEXT, INTEGER) OWNER TO service_role;
    ALTER FUNCTION mc.service_unlink(UUID) OWNER TO service_role;
    ALTER FUNCTION mc.service_get_user_by_mc_uuid(TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.proxy_request_link(TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.proxy_get_link_status() OWNER TO service_role;
    ALTER FUNCTION mc.proxy_unlink() OWNER TO service_role;
    ALTER FUNCTION mc.service_save_player(JSONB) OWNER TO service_role;
    ALTER FUNCTION mc.service_load_player(TEXT, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_save_container(JSONB, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_load_container(TEXT, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_record_transfers(JSONB) OWNER TO service_role;
    ALTER FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER) OWNER TO service_role;
    ALTER FUNCTION mc.service_save_character(JSONB) OWNER TO service_role;
    ALTER FUNCTION mc.service_load_character(TEXT, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_add_experience(TEXT, TEXT, BIGINT) OWNER TO service_role;
    ALTER FUNCTION mc.service_save_skill_tree(JSONB) OWNER TO service_role;
    ALTER FUNCTION mc.service_load_skill_tree(TEXT, TEXT) OWNER TO service_role;
    ALTER FUNCTION mc.service_add_skill_xp(TEXT, TEXT, TEXT, INTEGER, BIGINT) OWNER TO service_role;
END $$;

-- migrate:down

-- Drop all tables (CASCADE removes dependent functions, triggers, policies, indexes)
DROP TABLE IF EXISTS mc.skill CASCADE;
DROP TABLE IF EXISTS mc.character CASCADE;
DROP TABLE IF EXISTS mc.transfer CASCADE;
DROP TABLE IF EXISTS mc.container CASCADE;
DROP TABLE IF EXISTS mc.player CASCADE;
DROP TABLE IF EXISTS mc.auth CASCADE;

-- Drop remaining standalone functions (not attached to tables)
DROP FUNCTION IF EXISTS mc.normalize_mc_uuid(TEXT);
DROP FUNCTION IF EXISTS mc.xp_to_level(BIGINT);
DROP FUNCTION IF EXISTS mc.clamp_stat(INTEGER);
DROP FUNCTION IF EXISTS mc.normalize_skill_id(TEXT);

DROP SCHEMA IF EXISTS mc;
