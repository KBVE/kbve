-- migrate:up

-- ============================================================================
-- MC LOT SYSTEM — digital real estate for the survival backend
--
-- Phase 0 schema: parcel registry, schematic catalog, ownership ledger, and
-- build-event audit log. Players buy lots in the dashboard, then pick
-- structures from the schematic catalog to place on owned lots. The MC mod
-- side picks up purchase + build events and applies them to the world.
--
-- Lot bounds are stored as int4range pairs (chunk_x_range, chunk_z_range)
-- with a GIST EXCLUDE constraint that forbids any two lots in the same
-- world from overlapping at the chunk grid level. The schema supports
-- 1x1 lots from day one and arbitrarily large lots (200x100 castles, etc)
-- with no further migration — the operational ceiling lives in RPC guards,
-- not table definitions.
--
-- Money flow rides on wallet.service_debit against the user-kind account.
-- mc.lot_purchase and mc.lot_build_log keep their own append-only audit
-- rows so we can reconstruct ownership / build history without joining
-- through wallet.ledger.
--
-- Schema exposure: every public-callable RPC is fronted by a
-- public.proxy_* wrapper because PostgREST only sees the public schema.
-- The mc schema stays private; service_role and authenticated callers
-- route through the proxies. Pattern matches mc_public_proxies.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ===========================================================================
-- mc.schematic — build catalog
-- ===========================================================================
CREATE TABLE mc.schematic (
    schematic_id    TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    tier            SMALLINT NOT NULL DEFAULT 1,
    dims_x          SMALLINT NOT NULL,
    dims_y          SMALLINT NOT NULL,
    dims_z          SMALLINT NOT NULL,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    resource_path   TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mc_schematic_tier_chk   CHECK (tier BETWEEN 1 AND 10),
    CONSTRAINT mc_schematic_dims_chk   CHECK (dims_x > 0 AND dims_y > 0 AND dims_z > 0),
    CONSTRAINT mc_schematic_dims_y_chk CHECK (dims_y <= 384),
    CONSTRAINT mc_schematic_price_chk  CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_schematic_category_chk
        CHECK (category IN ('house', 'castle', 'tower', 'farm', 'shop', 'utility', 'monument'))
);

CREATE INDEX idx_mc_schematic_category_enabled ON mc.schematic (category, enabled);
CREATE INDEX idx_mc_schematic_tier ON mc.schematic (tier);

ALTER TABLE mc.schematic ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.schematic IS
    'Build catalog. Dashboard reads enabled rows via proxy_list_schematics. Each row references a serialized structure blob in the Fabric mod jar by resource_path.';
COMMENT ON COLUMN mc.schematic.dims_x IS 'Width in blocks (X axis).';
COMMENT ON COLUMN mc.schematic.dims_y IS 'Height in blocks. Hard-capped at 384 (world build height).';
COMMENT ON COLUMN mc.schematic.dims_z IS 'Depth in blocks (Z axis).';
COMMENT ON COLUMN mc.schematic.resource_path IS 'Path inside the mod jar, e.g. ''schematics/house_small.nbt''. No leading slash.';


-- ===========================================================================
-- mc.lot — parcel registry
-- ===========================================================================
CREATE TABLE mc.lot (
    lot_id          TEXT PRIMARY KEY,
    world           TEXT NOT NULL DEFAULT 'minecraft:overworld',
    chunk_x_range   int4range NOT NULL,
    chunk_z_range   int4range NOT NULL,
    anchor_y        SMALLINT NOT NULL,
    owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    current_schematic_id TEXT REFERENCES mc.schematic(schematic_id),
    state           SMALLINT NOT NULL DEFAULT 0,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_state_chk      CHECK (state BETWEEN 0 AND 4),
    CONSTRAINT mc_lot_anchor_y_chk   CHECK (anchor_y BETWEEN -64 AND 319),
    CONSTRAINT mc_lot_price_chk      CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_lot_x_range_chk    CHECK (NOT isempty(chunk_x_range)
                                             AND lower_inc(chunk_x_range)
                                             AND NOT upper_inc(chunk_x_range)),
    CONSTRAINT mc_lot_z_range_chk    CHECK (NOT isempty(chunk_z_range)
                                             AND lower_inc(chunk_z_range)
                                             AND NOT upper_inc(chunk_z_range)),
    CONSTRAINT mc_lot_owner_state_chk CHECK (
        (state = 0 AND owner_user_id IS NULL)
        OR (state > 0 AND owner_user_id IS NOT NULL)
    ),
    CONSTRAINT mc_lot_built_has_schematic_chk CHECK (
        (state = 2 AND current_schematic_id IS NOT NULL)
        OR state <> 2
    ),

    EXCLUDE USING gist (
        world WITH =,
        chunk_x_range WITH &&,
        chunk_z_range WITH &&
    )
);

CREATE INDEX idx_mc_lot_owner ON mc.lot (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX idx_mc_lot_state ON mc.lot (state);
CREATE INDEX idx_mc_lot_world_state ON mc.lot (world, state);

ALTER TABLE mc.lot ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION mc.trg_lot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mc_lot_updated_at
    BEFORE UPDATE ON mc.lot
    FOR EACH ROW
    EXECUTE FUNCTION mc.trg_lot_updated_at();

COMMENT ON TABLE mc.lot IS
    'Parcel registry. Chunk-aligned rectangular regions guarded by a GIST EXCLUDE constraint that forbids overlap within a world.';
COMMENT ON COLUMN mc.lot.chunk_x_range IS 'Half-open [min_chunk_x, max_chunk_x). 1x1 lot at chunk 5 = [5,6).';
COMMENT ON COLUMN mc.lot.anchor_y IS 'Foundation Y in blocks. Schematics paste with their Y=0 layer at this absolute Y.';
COMMENT ON COLUMN mc.lot.state IS '0=vacant, 1=owned, 2=built, 3=under_build, 4=demolishing';


-- ===========================================================================
-- mc.lot_purchase — ownership ledger (append-only)
-- ===========================================================================
CREATE TABLE mc.lot_purchase (
    purchase_id     TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    buyer_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    wallet_ledger_id BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_purchase_price_chk
        CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_lot_purchase_idem_uq UNIQUE (idempotency_key)
);

CREATE INDEX idx_mc_lot_purchase_lot   ON mc.lot_purchase (lot_id);
CREATE INDEX idx_mc_lot_purchase_buyer ON mc.lot_purchase (buyer_user_id);

ALTER TABLE mc.lot_purchase ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_purchase IS
    'Append-only ownership ledger. wallet_ledger_id back-references wallet.ledger so the purchase can be tied to its debit row.';


-- ===========================================================================
-- mc.lot_build_log — build/demolish audit (append-only)
-- ===========================================================================
CREATE TABLE mc.lot_build_log (
    build_id        TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_kind     SMALLINT NOT NULL,
    schematic_id    TEXT REFERENCES mc.schematic(schematic_id),
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    wallet_ledger_id BIGINT,
    idempotency_key UUID NOT NULL,
    apply_state     SMALLINT NOT NULL DEFAULT 0,
    apply_error     TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at      TIMESTAMPTZ,

    CONSTRAINT mc_lot_build_log_action_chk
        CHECK (action_kind IN (0, 1)),
    CONSTRAINT mc_lot_build_log_apply_state_chk
        CHECK (apply_state BETWEEN 0 AND 2),
    CONSTRAINT mc_lot_build_log_build_has_schematic_chk
        CHECK ((action_kind = 0 AND schematic_id IS NOT NULL)
            OR (action_kind = 1)),
    CONSTRAINT mc_lot_build_log_idem_uq UNIQUE (idempotency_key)
);

CREATE INDEX idx_mc_lot_build_log_lot     ON mc.lot_build_log (lot_id);
CREATE INDEX idx_mc_lot_build_log_actor   ON mc.lot_build_log (actor_user_id);
CREATE INDEX idx_mc_lot_build_log_pending ON mc.lot_build_log (queued_at) WHERE apply_state = 0;

ALTER TABLE mc.lot_build_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_build_log IS
    'Append-only audit of build/demolish events. action_kind: 0=build, 1=demolish. apply_state: 0=queued, 1=applied, 2=failed.';


-- ===========================================================================
-- mc._user_account_id — user → wallet user-kind account_id
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc._user_account_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT a.id
    FROM wallet.account a
    WHERE a.kind = 'user' AND a.user_id = p_user_id
    LIMIT 1;
$$;

ALTER FUNCTION mc._user_account_id(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc._user_account_id(UUID) FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- mc.service_list_lots
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_list_lots(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_owner_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    anchor_y        SMALLINT,
    owner_user_id   UUID,
    current_schematic_id TEXT,
    state           SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT l.lot_id,
           l.world,
           lower(l.chunk_x_range)     AS chunk_x_min,
           upper(l.chunk_x_range) - 1 AS chunk_x_max,
           lower(l.chunk_z_range)     AS chunk_z_min,
           upper(l.chunk_z_range) - 1 AS chunk_z_max,
           l.anchor_y,
           l.owner_user_id,
           l.current_schematic_id,
           l.state,
           l.price_credits,
           l.price_khash,
           l.created_at,
           l.updated_at
    FROM mc.lot l
    WHERE (p_world         IS NULL OR l.world = p_world)
      AND (p_state         IS NULL OR l.state = p_state)
      AND (p_owner_user_id IS NULL OR l.owner_user_id = p_owner_user_id)
    ORDER BY l.world, lower(l.chunk_x_range), lower(l.chunk_z_range)
    LIMIT GREATEST(0, LEAST(p_limit, 1024))
    OFFSET GREATEST(0, p_offset);
$$;

ALTER FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER)
    TO service_role;


-- ===========================================================================
-- mc.service_list_schematics
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_list_schematics(
    p_category TEXT DEFAULT NULL,
    p_only_enabled BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    schematic_id    TEXT,
    name            TEXT,
    category        TEXT,
    tier            SMALLINT,
    dims_x          SMALLINT,
    dims_y          SMALLINT,
    dims_z          SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT,
    resource_path   TEXT,
    enabled         BOOLEAN,
    created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.schematic_id, s.name, s.category, s.tier,
           s.dims_x, s.dims_y, s.dims_z,
           s.price_credits, s.price_khash,
           s.resource_path, s.enabled, s.created_at
    FROM mc.schematic s
    WHERE (p_category IS NULL OR s.category = p_category)
      AND (NOT p_only_enabled OR s.enabled)
    ORDER BY s.category, s.tier, s.name;
$$;

ALTER FUNCTION mc.service_list_schematics(TEXT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_list_schematics(TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_list_schematics(TEXT, BOOLEAN)
    TO service_role;


-- ===========================================================================
-- mc.service_pending_builds — MC mod work queue
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_pending_builds(p_limit INTEGER DEFAULT 32)
RETURNS TABLE (
    build_id        TEXT,
    lot_id          TEXT,
    actor_user_id   UUID,
    action_kind     SMALLINT,
    schematic_id    TEXT,
    queued_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT b.build_id, b.lot_id, b.actor_user_id,
           b.action_kind, b.schematic_id, b.queued_at
    FROM mc.lot_build_log b
    WHERE b.apply_state = 0
    ORDER BY b.queued_at
    LIMIT GREATEST(1, LEAST(p_limit, 256));
$$;

ALTER FUNCTION mc.service_pending_builds(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_pending_builds(INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_pending_builds(INTEGER)
    TO service_role;


-- ===========================================================================
-- mc.service_mark_build_applied — MC mod ACK on success
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_mark_build_applied(p_build_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot_id        TEXT;
    v_action_kind   SMALLINT;
    v_schematic_id  TEXT;
BEGIN
    UPDATE mc.lot_build_log
       SET apply_state = 1,
           applied_at = NOW()
     WHERE build_id = p_build_id
       AND apply_state = 0
    RETURNING lot_id, action_kind, schematic_id
        INTO v_lot_id, v_action_kind, v_schematic_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_action_kind = 0 THEN
        UPDATE mc.lot
           SET state = 2,
               current_schematic_id = v_schematic_id
         WHERE lot_id = v_lot_id;
    ELSIF v_action_kind = 1 THEN
        UPDATE mc.lot
           SET state = 1,
               current_schematic_id = NULL
         WHERE lot_id = v_lot_id;
    END IF;

    RETURN TRUE;
END;
$$;

ALTER FUNCTION mc.service_mark_build_applied(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_mark_build_applied(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_mark_build_applied(TEXT)
    TO service_role;


-- ===========================================================================
-- mc.service_mark_build_failed — MC mod ACK on failure
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_mark_build_failed(
    p_build_id TEXT,
    p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot_id TEXT;
BEGIN
    UPDATE mc.lot_build_log
       SET apply_state = 2,
           apply_error = p_error,
           applied_at = NOW()
     WHERE build_id = p_build_id
       AND apply_state = 0
    RETURNING lot_id INTO v_lot_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE mc.lot
       SET state = CASE WHEN current_schematic_id IS NULL THEN 1 ELSE 2 END
     WHERE lot_id = v_lot_id;

    RETURN TRUE;
END;
$$;

ALTER FUNCTION mc.service_mark_build_failed(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_mark_build_failed(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_mark_build_failed(TEXT, TEXT)
    TO service_role;


-- ===========================================================================
-- mc.service_purchase_lot — atomic buy
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_purchase_lot(
    p_lot_id TEXT,
    p_user_id UUID,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot           mc.lot%ROWTYPE;
    v_account_id    UUID;
    v_ledger_id     BIGINT;
    v_purchase_id   TEXT;
BEGIN
    SELECT purchase_id INTO v_purchase_id
    FROM mc.lot_purchase
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN v_purchase_id;
    END IF;

    SELECT * INTO v_lot FROM mc.lot WHERE lot_id = p_lot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot.state <> 0 THEN
        RAISE EXCEPTION 'lot % is not vacant (state=%)', p_lot_id, v_lot.state
            USING ERRCODE = '22023';
    END IF;

    v_account_id := mc._user_account_id(p_user_id);
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'user % has no wallet account', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_lot.price_credits > 0 THEN
        v_ledger_id := wallet.service_debit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_lot.price_credits,
            'purchase'::wallet.source_kind,
            'mc.lot.purchase:' || p_lot_id,
            'mc.lot',
            NULL,
            p_idempotency_key
        );
    END IF;
    IF v_lot.price_khash > 0 THEN
        v_ledger_id := wallet.service_debit(
            v_account_id,
            'khash'::wallet.currency_kind,
            v_lot.price_khash,
            'purchase'::wallet.source_kind,
            'mc.lot.purchase:' || p_lot_id,
            'mc.lot',
            NULL,
            p_idempotency_key
        );
    END IF;

    INSERT INTO mc.lot_purchase (
        lot_id, buyer_user_id, price_credits, price_khash,
        wallet_ledger_id, idempotency_key
    ) VALUES (
        p_lot_id, p_user_id, v_lot.price_credits, v_lot.price_khash,
        v_ledger_id, p_idempotency_key
    )
    RETURNING purchase_id INTO v_purchase_id;

    UPDATE mc.lot
       SET state = 1,
           owner_user_id = p_user_id
     WHERE lot_id = p_lot_id;

    RETURN v_purchase_id;
END;
$$;

ALTER FUNCTION mc.service_purchase_lot(TEXT, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_purchase_lot(TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_purchase_lot(TEXT, UUID, UUID)
    TO service_role;


-- ===========================================================================
-- mc.service_queue_build_on_lot — charge + queue build
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT,
    p_user_id UUID,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot               mc.lot%ROWTYPE;
    v_schematic         mc.schematic%ROWTYPE;
    v_account_id        UUID;
    v_ledger_id         BIGINT;
    v_build_id          TEXT;
    v_chunks            INTEGER;
    v_lot_dx_blocks     INTEGER;
    v_lot_dz_blocks     INTEGER;
BEGIN
    SELECT build_id INTO v_build_id
    FROM mc.lot_build_log
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN v_build_id;
    END IF;

    SELECT * INTO v_lot FROM mc.lot WHERE lot_id = p_lot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot.owner_user_id IS NULL OR v_lot.owner_user_id <> p_user_id THEN
        RAISE EXCEPTION 'user % does not own lot %', p_user_id, p_lot_id
            USING ERRCODE = '42501';
    END IF;
    IF v_lot.state NOT IN (1, 2) THEN
        RAISE EXCEPTION 'lot % is not in a buildable state (state=%)',
            p_lot_id, v_lot.state USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_schematic FROM mc.schematic WHERE schematic_id = p_schematic_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schematic % does not exist', p_schematic_id
            USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_schematic.enabled THEN
        RAISE EXCEPTION 'schematic % is disabled', p_schematic_id
            USING ERRCODE = '22023';
    END IF;

    v_lot_dx_blocks := (upper(v_lot.chunk_x_range) - lower(v_lot.chunk_x_range)) * 16;
    v_lot_dz_blocks := (upper(v_lot.chunk_z_range) - lower(v_lot.chunk_z_range)) * 16;
    IF v_schematic.dims_x > v_lot_dx_blocks OR v_schematic.dims_z > v_lot_dz_blocks THEN
        RAISE EXCEPTION 'schematic % (%x%) does not fit lot % (%x%)',
            p_schematic_id, v_schematic.dims_x, v_schematic.dims_z,
            p_lot_id, v_lot_dx_blocks, v_lot_dz_blocks
            USING ERRCODE = '22023';
    END IF;
    IF v_lot.anchor_y + v_schematic.dims_y > 319 THEN
        RAISE EXCEPTION 'schematic % at anchor_y=% exceeds world height',
            p_schematic_id, v_lot.anchor_y USING ERRCODE = '22023';
    END IF;

    -- Phase-0 chunk-count guard. Lifted in a follow-up migration once the
    -- tick-chunked paste pipeline is proven stable.
    v_chunks := (upper(v_lot.chunk_x_range) - lower(v_lot.chunk_x_range))
              * (upper(v_lot.chunk_z_range) - lower(v_lot.chunk_z_range));
    IF v_chunks > 64 THEN
        RAISE EXCEPTION 'lot % exceeds phase-0 build cap (chunks=%, max=64)',
            p_lot_id, v_chunks USING ERRCODE = '22023';
    END IF;

    v_account_id := mc._user_account_id(p_user_id);
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'user % has no wallet account', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_schematic.price_credits > 0 THEN
        v_ledger_id := wallet.service_debit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_schematic.price_credits,
            'purchase'::wallet.source_kind,
            'mc.lot.build:' || p_lot_id || ':' || p_schematic_id,
            'mc.lot_build_log',
            NULL,
            p_idempotency_key
        );
    END IF;
    IF v_schematic.price_khash > 0 THEN
        v_ledger_id := wallet.service_debit(
            v_account_id,
            'khash'::wallet.currency_kind,
            v_schematic.price_khash,
            'purchase'::wallet.source_kind,
            'mc.lot.build:' || p_lot_id || ':' || p_schematic_id,
            'mc.lot_build_log',
            NULL,
            p_idempotency_key
        );
    END IF;

    INSERT INTO mc.lot_build_log (
        lot_id, actor_user_id, action_kind, schematic_id,
        price_credits, price_khash, wallet_ledger_id, idempotency_key
    ) VALUES (
        p_lot_id, p_user_id, 0, p_schematic_id,
        v_schematic.price_credits, v_schematic.price_khash,
        v_ledger_id, p_idempotency_key
    )
    RETURNING build_id INTO v_build_id;

    UPDATE mc.lot SET state = 3 WHERE lot_id = p_lot_id;

    RETURN v_build_id;
END;
$$;

ALTER FUNCTION mc.service_queue_build_on_lot(TEXT, TEXT, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_queue_build_on_lot(TEXT, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_queue_build_on_lot(TEXT, TEXT, UUID, UUID)
    TO service_role;


-- ===========================================================================
-- mc.service_queue_demolish_lot — queue a clear job
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_queue_demolish_lot(
    p_lot_id TEXT,
    p_user_id UUID,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot       mc.lot%ROWTYPE;
    v_build_id  TEXT;
BEGIN
    SELECT build_id INTO v_build_id
    FROM mc.lot_build_log
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN v_build_id;
    END IF;

    SELECT * INTO v_lot FROM mc.lot WHERE lot_id = p_lot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot.owner_user_id IS NULL OR v_lot.owner_user_id <> p_user_id THEN
        RAISE EXCEPTION 'user % does not own lot %', p_user_id, p_lot_id
            USING ERRCODE = '42501';
    END IF;
    IF v_lot.state <> 2 THEN
        RAISE EXCEPTION 'lot % has nothing to demolish (state=%)',
            p_lot_id, v_lot.state USING ERRCODE = '22023';
    END IF;

    INSERT INTO mc.lot_build_log (
        lot_id, actor_user_id, action_kind, schematic_id, idempotency_key
    ) VALUES (
        p_lot_id, p_user_id, 1, NULL, p_idempotency_key
    )
    RETURNING build_id INTO v_build_id;

    UPDATE mc.lot SET state = 4 WHERE lot_id = p_lot_id;

    RETURN v_build_id;
END;
$$;

ALTER FUNCTION mc.service_queue_demolish_lot(TEXT, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_queue_demolish_lot(TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_queue_demolish_lot(TEXT, UUID, UUID)
    TO service_role;


-- ===========================================================================
-- mc.proxy_* RPCs (caller is auth.uid())
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.proxy_list_lots(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_only_mine BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    anchor_y        SMALLINT,
    owner_user_id   UUID,
    is_owned_by_me  BOOLEAN,
    current_schematic_id TEXT,
    state           SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT l.lot_id,
           l.world,
           lower(l.chunk_x_range)     AS chunk_x_min,
           upper(l.chunk_x_range) - 1 AS chunk_x_max,
           lower(l.chunk_z_range)     AS chunk_z_min,
           upper(l.chunk_z_range) - 1 AS chunk_z_max,
           l.anchor_y,
           l.owner_user_id,
           (l.owner_user_id IS NOT NULL AND l.owner_user_id = v_uid) AS is_owned_by_me,
           l.current_schematic_id,
           l.state,
           l.price_credits,
           l.price_khash
    FROM mc.lot l
    WHERE (p_world IS NULL OR l.world = p_world)
      AND (p_state IS NULL OR l.state = p_state)
      AND (NOT p_only_mine OR (v_uid IS NOT NULL AND l.owner_user_id = v_uid))
    ORDER BY l.world, lower(l.chunk_x_range), lower(l.chunk_z_range)
    LIMIT GREATEST(0, LEAST(p_limit, 1024))
    OFFSET GREATEST(0, p_offset);
END;
$$;

ALTER FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION mc.proxy_list_schematics(p_category TEXT DEFAULT NULL)
RETURNS TABLE (
    schematic_id    TEXT,
    name            TEXT,
    category        TEXT,
    tier            SMALLINT,
    dims_x          SMALLINT,
    dims_y          SMALLINT,
    dims_z          SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.schematic_id, s.name, s.category, s.tier,
           s.dims_x, s.dims_y, s.dims_z,
           s.price_credits, s.price_khash
    FROM mc.schematic s
    WHERE (p_category IS NULL OR s.category = p_category)
      AND s.enabled
    ORDER BY s.category, s.tier, s.name;
$$;

ALTER FUNCTION mc.proxy_list_schematics(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_list_schematics(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_list_schematics(TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION mc.proxy_purchase_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_purchase_lot(p_lot_id, v_uid, gen_random_uuid());
END;
$$;

ALTER FUNCTION mc.proxy_purchase_lot(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_purchase_lot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_purchase_lot(TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_queue_build_on_lot(p_lot_id, p_schematic_id, v_uid, gen_random_uuid());
END;
$$;

ALTER FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_demolish_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_queue_demolish_lot(p_lot_id, v_uid, gen_random_uuid());
END;
$$;

ALTER FUNCTION mc.proxy_queue_demolish_lot(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_queue_demolish_lot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_demolish_lot(TEXT) TO authenticated, service_role;


-- ===========================================================================
-- PUBLIC PROXY WRAPPERS — PostgREST sees these
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.proxy_list_lots(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_only_mine BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    anchor_y        SMALLINT,
    owner_user_id   UUID,
    is_owned_by_me  BOOLEAN,
    current_schematic_id TEXT,
    state           SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT * FROM mc.proxy_list_lots(p_world, p_state, p_only_mine, p_limit, p_offset);
$$;

ALTER FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_list_schematics(p_category TEXT DEFAULT NULL)
RETURNS TABLE (
    schematic_id    TEXT,
    name            TEXT,
    category        TEXT,
    tier            SMALLINT,
    dims_x          SMALLINT,
    dims_y          SMALLINT,
    dims_z          SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT * FROM mc.proxy_list_schematics(p_category);
$$;

ALTER FUNCTION public.proxy_list_schematics(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_schematics(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_schematics(TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_purchase_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_purchase_lot(p_lot_id);
END;
$$;

ALTER FUNCTION public.proxy_purchase_lot(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_purchase_lot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_purchase_lot(TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_schematic_id IS NULL OR btrim(p_schematic_id) = '' THEN
        RAISE EXCEPTION 'schematic_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_queue_build_on_lot(p_lot_id, p_schematic_id);
END;
$$;

ALTER FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_queue_demolish_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_queue_demolish_lot(p_lot_id);
END;
$$;

ALTER FUNCTION public.proxy_queue_demolish_lot(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_queue_demolish_lot(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_queue_demolish_lot(TEXT) TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';


-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_queue_demolish_lot(TEXT);
DROP FUNCTION IF EXISTS public.proxy_queue_build_on_lot(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_purchase_lot(TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_schematics(TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER);

DROP FUNCTION IF EXISTS mc.proxy_queue_demolish_lot(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_queue_build_on_lot(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.proxy_purchase_lot(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_list_schematics(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER);

DROP FUNCTION IF EXISTS mc.service_queue_demolish_lot(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_queue_build_on_lot(TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_purchase_lot(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_mark_build_failed(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_applied(TEXT);
DROP FUNCTION IF EXISTS mc.service_pending_builds(INTEGER);
DROP FUNCTION IF EXISTS mc.service_list_schematics(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc._user_account_id(UUID);

DROP TABLE IF EXISTS mc.lot_build_log;
DROP TABLE IF EXISTS mc.lot_purchase;
DROP TABLE IF EXISTS mc.lot;
DROP FUNCTION IF EXISTS mc.trg_lot_updated_at();
DROP TABLE IF EXISTS mc.schematic;

NOTIFY pgrst, 'reload schema';
