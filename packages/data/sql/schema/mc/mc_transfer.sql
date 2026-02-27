-- ============================================================
-- MC TRANSFER — Append-only item transfer ledger
--
-- Records every item movement event (player↔player,
-- player↔container, pickup, drop, craft, smelt, trade).
-- Designed for auditability and rollback investigations.
--
-- This is an INSERT-heavy, append-only table.
-- Rows are never updated or deleted by the application.
--
-- Called exclusively by the MC server via service_role.
-- Requires: mc schema (created by mc_auth.sql)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: mc.transfer
-- ===========================================

CREATE TABLE IF NOT EXISTS mc.transfer (
    -- ULID primary key (time-sortable, globally unique)
    transfer_id TEXT PRIMARY KEY,

    -- Transfer metadata
    transfer_type INTEGER NOT NULL DEFAULT 0,   -- McTransferType enum
    server_id     TEXT NOT NULL,
    world         TEXT,

    -- The item that was moved (full McItemStack as JSONB)
    item JSONB NOT NULL,

    -- Source
    source_player_uuid   TEXT,
    source_container_id  TEXT,
    source_slot          INTEGER,

    -- Destination
    dest_player_uuid     TEXT,
    dest_container_id    TEXT,
    dest_slot            INTEGER,

    -- Timestamp from the MC server
    transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- DB insert timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT transfer_type_range_chk
        CHECK (transfer_type >= 0 AND transfer_type <= 9),

    -- At least one source must be set
    CONSTRAINT source_required_chk
        CHECK (source_player_uuid IS NOT NULL OR source_container_id IS NOT NULL),

    -- At least one destination must be set
    CONSTRAINT dest_required_chk
        CHECK (dest_player_uuid IS NOT NULL OR dest_container_id IS NOT NULL)
);

-- Primary query pattern: "all transfers for player X, newest first"
CREATE INDEX IF NOT EXISTS idx_mc_transfer_source_player
    ON mc.transfer (source_player_uuid, transferred_at DESC)
    WHERE source_player_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mc_transfer_dest_player
    ON mc.transfer (dest_player_uuid, transferred_at DESC)
    WHERE dest_player_uuid IS NOT NULL;

-- Server + time range for server-wide audits
CREATE INDEX IF NOT EXISTS idx_mc_transfer_server_time
    ON mc.transfer (server_id, transferred_at DESC);

-- Container audit trail
CREATE INDEX IF NOT EXISTS idx_mc_transfer_source_container
    ON mc.transfer (source_container_id, transferred_at DESC)
    WHERE source_container_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mc_transfer_dest_container
    ON mc.transfer (dest_container_id, transferred_at DESC)
    WHERE dest_container_id IS NOT NULL;

COMMENT ON TABLE mc.transfer IS
    'Append-only item transfer ledger recording all item movements in the MC server.';

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE mc.transfer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON mc.transfer;

CREATE POLICY "service_role_full_access"
    ON mc.transfer
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===========================================
-- SERVICE FUNCTION: Record batch of transfers
--
-- Accepts a JSONB array of transfer objects.
-- Inserts all transfers in a single batch.
-- Returns the count of inserted rows.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_record_transfers(
    p_batch JSONB
)
RETURNS INTEGER  -- count of inserted rows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'array' THEN
        RAISE EXCEPTION 'p_batch must be a JSONB array'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_batch) = 0 THEN
        RETURN 0;
    END IF;

    -- Limit batch size to prevent abuse
    IF jsonb_array_length(p_batch) > 1000 THEN
        RAISE EXCEPTION 'Batch size exceeds limit of 1000 transfers'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO mc.transfer (
        transfer_id, transfer_type, server_id, world,
        item,
        source_player_uuid, source_container_id, source_slot,
        dest_player_uuid, dest_container_id, dest_slot,
        transferred_at
    )
    SELECT
        t->>'transfer_id',
        COALESCE((t->>'type')::INTEGER, 0),
        t->>'server_id',
        t->>'world',
        COALESCE(t->'item', '{}'::JSONB),
        t->>'source_player_uuid',
        t->>'source_container_id',
        (t->>'source_slot')::INTEGER,
        t->>'dest_player_uuid',
        t->>'dest_container_id',
        (t->>'dest_slot')::INTEGER,
        COALESCE((t->>'timestamp')::TIMESTAMPTZ, NOW())
    FROM jsonb_array_elements(p_batch) AS t;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION mc.service_record_transfers(JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_record_transfers(JSONB)
    TO service_role;
ALTER FUNCTION mc.service_record_transfers(JSONB) OWNER TO service_role;

-- ===========================================
-- SERVICE FUNCTION: Get transfer history for a player
--
-- Returns transfers where the player is source or destination.
-- Supports optional server_id filter, time-range filter, and pagination.
-- ===========================================

CREATE OR REPLACE FUNCTION mc.service_get_transfer_history(
    p_player_uuid TEXT,
    p_server_id   TEXT    DEFAULT NULL,
    p_since       TEXT    DEFAULT NULL,
    p_limit       INTEGER DEFAULT 50,
    p_offset      INTEGER DEFAULT 0
)
RETURNS TABLE (
    transfer_id          TEXT,
    transfer_type        INTEGER,
    server_id            TEXT,
    world                TEXT,
    item                 JSONB,
    source_player_uuid   TEXT,
    source_container_id  TEXT,
    source_slot          INTEGER,
    dest_player_uuid     TEXT,
    dest_container_id    TEXT,
    dest_slot            INTEGER,
    transferred_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_player_uuid TEXT;
    v_since       TIMESTAMPTZ;
    v_limit       INTEGER;
BEGIN
    v_player_uuid := mc.normalize_mc_uuid(p_player_uuid);
    v_since := CASE WHEN p_since IS NOT NULL THEN p_since::TIMESTAMPTZ ELSE NULL END;
    v_limit := LEAST(GREATEST(p_limit, 1), 500);  -- clamp 1..500

    RETURN QUERY
    SELECT
        t.transfer_id,
        t.transfer_type,
        t.server_id,
        t.world,
        t.item,
        t.source_player_uuid,
        t.source_container_id,
        t.source_slot,
        t.dest_player_uuid,
        t.dest_container_id,
        t.dest_slot,
        t.transferred_at
    FROM mc.transfer AS t
    WHERE (t.source_player_uuid = v_player_uuid
        OR t.dest_player_uuid = v_player_uuid)
      AND (p_server_id IS NULL OR t.server_id = p_server_id)
      AND (v_since IS NULL OR t.transferred_at >= v_since)
    ORDER BY t.transferred_at DESC
    LIMIT v_limit
    OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    TO service_role;
ALTER FUNCTION mc.service_get_transfer_history(TEXT, TEXT, TEXT, INTEGER, INTEGER) OWNER TO service_role;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    PERFORM set_config('search_path', '', true);

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'mc' AND table_name = 'transfer'
    ) THEN
        RAISE EXCEPTION 'mc.transfer table creation failed';
    END IF;

    PERFORM 'mc.service_record_transfers(jsonb)'::regprocedure;
    PERFORM 'mc.service_get_transfer_history(text, text, text, integer, integer)'::regprocedure;

    IF NOT has_function_privilege('service_role', 'mc.service_record_transfers(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_record_transfers';
    END IF;

    IF NOT has_function_privilege('service_role', 'mc.service_get_transfer_history(text, text, text, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must have execute on mc.service_get_transfer_history';
    END IF;

    IF has_function_privilege('anon', 'mc.service_record_transfers(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_record_transfers';
    END IF;

    IF has_function_privilege('anon', 'mc.service_get_transfer_history(text, text, text, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must NOT have execute on mc.service_get_transfer_history';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_record_transfers(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_record_transfers';
    END IF;

    IF has_function_privilege('authenticated', 'mc.service_get_transfer_history(text, text, text, integer, integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must NOT have execute on mc.service_get_transfer_history';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_record_transfers(jsonb)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_record_transfers must be owned by service_role';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE oid = 'mc.service_get_transfer_history(text, text, text, integer, integer)'::regprocedure
          AND pg_get_userbyid(proowner) <> 'service_role'
    ) THEN
        RAISE EXCEPTION 'mc.service_get_transfer_history must be owned by service_role';
    END IF;

    RAISE NOTICE 'mc.transfer setup and verification completed successfully.';
END;
$$ LANGUAGE plpgsql;

COMMIT;
