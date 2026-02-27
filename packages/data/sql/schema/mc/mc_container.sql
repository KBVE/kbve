-- ============================================================
-- MC CONTAINER — Persist container state from MC server
--
-- Stores the latest state of world containers (chests, barrels,
-- shulker boxes, furnaces, etc.) per server.
--
-- Called exclusively by the MC server via service_role.
-- Requires: mc schema (created by mc_auth.sql)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: mc.container
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.container (
    -- Composite PK: one state per container per server
    container_id TEXT NOT NULL,
    server_id    TEXT NOT NULL,

    -- Container metadata
    container_type INTEGER NOT NULL DEFAULT 0,   -- McContainerType enum
    world          TEXT,                          -- Dimension / world name
    pos_x          INTEGER,                      -- Block position X
    pos_y          INTEGER,                      -- Block position Y
    pos_z          INTEGER,                      -- Block position Z
    custom_name    TEXT,                          -- Custom container name if renamed

    -- Slot data as JSONB array of McSlot
    slots JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Timestamps
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (container_id, server_id),

    CONSTRAINT container_type_range_chk
        CHECK (container_type >= 0 AND container_type <= 13)
);

-- Spatial lookup: find containers in a world at or near a position
CREATE INDEX IF NOT EXISTS idx_mc_container_world_pos
    ON mc.container (server_id, world, pos_x, pos_y, pos_z)
    WHERE world IS NOT NULL AND pos_x IS NOT NULL;

COMMENT ON TABLE mc.container IS
    'Latest container state (chests, barrels, etc.) per container per server.';

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE mc.container ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.container;

CREATE POLICY "service_role_full_access"
    ON mc.container
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===========================================
-- TRIGGER: auto-update updated_at
-- ===========================================

CREATE OR REPLACE FUNCTION mc.trg_container_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION mc.trg_container_updated_at()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.trg_container_updated_at()
    TO service_role;
ALTER FUNCTION mc.trg_container_updated_at() OWNER TO service_role;

DROP TRIGGER IF EXISTS trg_mc_container_updated_at ON mc.container;

CREATE TRIGGER trg_mc_container_updated_at
BEFORE UPDATE ON mc.container
FOR EACH ROW
EXECUTE FUNCTION mc.trg_container_updated_at();

-- ===========================================
-- SERVICE FUNCTION: Save container state
--
-- Accepts container JSONB + server_id.
-- Upserts: creates on first save, updates on subsequent.
-- Returns the container_id on success.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_save_container(
    p_container JSONB,
    p_server_id TEXT
)
RETURNS TEXT  -- returns container_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_container_id TEXT;
    v_position     JSONB;
BEGIN
    v_container_id := p_container->>'container_id';

    IF v_container_id IS NULL OR v_container_id = '' THEN
        RAISE EXCEPTION 'container_id is required in container'
            USING ERRCODE = '22023';
    END IF;

    IF p_server_id IS NULL OR p_server_id = '' THEN
        RAISE EXCEPTION 'server_id is required'
            USING ERRCODE = '22023';
    END IF;

    v_position := p_container->'position';

    INSERT INTO mc.container (
        container_id, server_id, container_type,
        world, pos_x, pos_y, pos_z,
        custom_name, slots, captured_at
    )
    VALUES (
        v_container_id,
        p_server_id,
        COALESCE((p_container->>'type')::INTEGER, 0),
        COALESCE(p_container->>'world', v_position->>'world'),
        (v_position->>'x')::INTEGER,
        (v_position->>'y')::INTEGER,
        (v_position->>'z')::INTEGER,
        p_container->>'custom_name',
        COALESCE(p_container->'slots', '[]'::JSONB),
        COALESCE((p_container->>'captured_at')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (container_id, server_id) DO UPDATE SET
        container_type = EXCLUDED.container_type,
        world          = EXCLUDED.world,
        pos_x          = EXCLUDED.pos_x,
        pos_y          = EXCLUDED.pos_y,
        pos_z          = EXCLUDED.pos_z,
        custom_name    = EXCLUDED.custom_name,
        slots          = EXCLUDED.slots,
        captured_at    = EXCLUDED.captured_at;

    RETURN v_container_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_save_container(JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_save_container(JSONB, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_save_container(JSONB, TEXT) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Load container state
--
-- Returns the latest state for a container on a specific server.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_load_container(
    p_container_id TEXT,
    p_server_id    TEXT
)
RETURNS TABLE (
    container_id   TEXT,
    server_id      TEXT,
    container_type INTEGER,
    world          TEXT,
    pos_x          INTEGER,
    pos_y          INTEGER,
    pos_z          INTEGER,
    custom_name    TEXT,
    slots          JSONB,
    captured_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.container_id,
        c.server_id,
        c.container_type,
        c.world,
        c.pos_x,
        c.pos_y,
        c.pos_z,
        c.custom_name,
        c.slots,
        c.captured_at
    FROM mc.container AS c
    WHERE c.container_id = p_container_id
      AND c.server_id = p_server_id;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_load_container(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_load_container(TEXT, TEXT)
    TO service_role;
ALTER FUNCTION mc.service_load_container(TEXT, TEXT) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'container'
    ) THEN
        RAISE EXCEPTION 'mc.container table creation failed';
    END IF;

    PERFORM 'mc.service_save_container(jsonb, text)'::regprocedure;
    PERFORM 'mc.service_load_container(text, text)'::regprocedure;

    IF NOT has_function_privilege('service_role', 'mc.service_save_container(jsonb, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_save_container';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_load_container(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_load_container';
    END IF;

    IF has_function_privilege('anon', 'mc.service_save_container(jsonb, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_save_container';
    END IF;

    IF has_function_privilege('anon', 'mc.service_load_container(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_load_container';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_save_container(jsonb, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_save_container';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_load_container(text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_load_container';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_save_container(jsonb, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_save_container must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_load_container(text, text)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_load_container must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.trg_container_updated_at()'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.trg_container_updated_at must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.container setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
