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
-- through wallet.ledger. Both ledgers carry a per-currency ledger reference
-- pair (wallet_credits_ledger_id, wallet_khash_ledger_id) because a single
-- charge can debit BOTH currencies; storing one column would discard the
-- second debit on a dual-currency purchase.
--
-- Idempotency is enforced both at the mc layer (UNIQUE(idempotency_key))
-- AND at the wallet layer (per-currency-derived UUID via
-- mc._derive_idem_key) so retrying a dual-currency charge cannot collide
-- on the wallet side.
--
-- Schema exposure: every public-callable RPC is fronted by a
-- public.proxy_* wrapper because PostgREST only sees the public schema.
-- The mc schema stays private; service_role and authenticated callers
-- route through the proxies. Pattern matches mc_public_proxies.sql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-affirm schema + grants so this migration is independently runnable
-- against a fresh database. mc was already created in mc_schema_init but
-- IF NOT EXISTS keeps the statement safe to replay.
CREATE SCHEMA IF NOT EXISTS mc;
GRANT USAGE ON SCHEMA mc TO service_role;
REVOKE ALL ON SCHEMA mc FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- mc._derive_idem_key — deterministic per-currency idempotency key
-- ===========================================================================
--
-- wallet.service_debit treats (account, idempotency_key) as the uniqueness
-- scope for replay collapsing. A single mc.lot purchase or build can debit
-- BOTH credits AND khash; reusing the same key for both calls would either
-- silently no-op the second debit or surface a fingerprint mismatch
-- depending on how wallet handles it. Derive a stable per-currency UUID
-- from the caller-supplied key so retry semantics still work, but each
-- currency has its own slot.
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc._derive_idem_key(p_key UUID, p_tag TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT substr(encode(public.digest(p_key::text || ':' || p_tag, 'md5'), 'hex'), 1, 32)::uuid;
$$;

ALTER FUNCTION mc._derive_idem_key(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc._derive_idem_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc._derive_idem_key(UUID, TEXT) TO service_role;


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
        CHECK (category IN ('house', 'castle', 'tower', 'farm', 'shop', 'utility', 'monument')),
    -- Reject path-traversal + force schematics into the mod jar's
    -- schematics/ dir. Loader on the Java side concats this onto a class
    -- loader resource path, so anything escaping the dir is a footgun.
    CONSTRAINT mc_schematic_resource_path_chk
        CHECK (resource_path !~ '(^/|\.\.)' AND
               resource_path ~ '^schematics/[A-Za-z0-9_./-]+\.(nbt|schem)$')
);

-- Partial index lines up with proxy_list_schematics' WHERE enabled + ORDER
-- BY category, tier, name path. Unfiltered rows are extremely cold.
CREATE INDEX idx_mc_schematic_enabled_category_tier_name
    ON mc.schematic (category, tier, name)
    WHERE enabled;
CREATE INDEX idx_mc_schematic_tier ON mc.schematic (tier);

ALTER TABLE mc.schematic ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.schematic FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.schematic IS
    'Build catalog. Dashboard reads enabled rows via proxy_list_schematics. Each row references a serialized structure blob in the Fabric mod jar by resource_path.';


-- ===========================================================================
-- mc.lot — parcel registry
-- ===========================================================================
CREATE TABLE mc.lot (
    lot_id          TEXT PRIMARY KEY,
    world           TEXT NOT NULL DEFAULT 'minecraft:overworld',
    chunk_x_range   int4range NOT NULL,
    chunk_z_range   int4range NOT NULL,
    -- Stored generated columns so chunk-count guards in RPCs (and any
    -- future "lots ordered by size" queries) don't recompute on every read.
    chunk_width     INTEGER GENERATED ALWAYS AS
        (upper(chunk_x_range) - lower(chunk_x_range)) STORED,
    chunk_depth     INTEGER GENERATED ALWAYS AS
        (upper(chunk_z_range) - lower(chunk_z_range)) STORED,
    chunk_area      INTEGER GENERATED ALWAYS AS
        ((upper(chunk_x_range) - lower(chunk_x_range))
       * (upper(chunk_z_range) - lower(chunk_z_range))) STORED,
    anchor_y        SMALLINT NOT NULL,
    owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    current_schematic_id TEXT REFERENCES mc.schematic(schematic_id),
    -- 0 = vacant, 1 = owned, 2 = built, 3 = under_build, 4 = demolishing
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
    -- Vanilla dim ids look like 'minecraft:overworld' or
    -- 'kbve:survival_ext'. Enforce the namespaced format to keep typos and
    -- arbitrary text from sneaking into the world column.
    CONSTRAINT mc_lot_world_chk
        CHECK (world ~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$'),
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
-- Covering order for service_list_lots / proxy_list_lots:
-- ORDER BY world, lower(chunk_x_range), lower(chunk_z_range).
CREATE INDEX idx_mc_lot_world_chunk_order
    ON mc.lot (world, lower(chunk_x_range), lower(chunk_z_range));
-- Same order with state in the leading position so state-filtered listings
-- skip irrelevant rows entirely.
CREATE INDEX idx_mc_lot_world_state_chunk_order
    ON mc.lot (world, state, lower(chunk_x_range), lower(chunk_z_range));

ALTER TABLE mc.lot ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot FORCE ROW LEVEL SECURITY;

-- Trigger touches updated_at only when something other than updated_at
-- itself changed; cuts write amplification on no-op UPDATEs.
CREATE OR REPLACE FUNCTION mc.trg_lot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mc_lot_updated_at
    BEFORE UPDATE ON mc.lot
    FOR EACH ROW
    EXECUTE FUNCTION mc.trg_lot_updated_at();

COMMENT ON TABLE mc.lot IS
    'Parcel registry. Chunk-aligned rectangular regions guarded by a GIST EXCLUDE constraint that forbids overlap within a world.';
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
    -- One ledger id per currency. A dual-currency purchase fills both;
    -- single-currency purchases leave the other NULL.
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_purchase_price_chk
        CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_lot_purchase_idem_uq UNIQUE (idempotency_key)
);

CREATE INDEX idx_mc_lot_purchase_lot   ON mc.lot_purchase (lot_id);
CREATE INDEX idx_mc_lot_purchase_buyer ON mc.lot_purchase (buyer_user_id);

-- Phase-0 invariant: each lot can be bought exactly once. Resale comes
-- with an explicit ownership-epoch column in a follow-up migration.
CREATE UNIQUE INDEX uq_mc_lot_purchase_one_per_lot
    ON mc.lot_purchase (lot_id);

ALTER TABLE mc.lot_purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot_purchase FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_purchase IS
    'Append-only ownership ledger. Per-currency wallet_*_ledger_id columns back-reference wallet.ledger so dual-currency purchases retain both debit references.';


-- ===========================================================================
-- mc.lot_build_log — build/demolish audit + work queue
-- ===========================================================================
CREATE TABLE mc.lot_build_log (
    build_id        TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- 0 = build, 1 = demolish
    action_kind     SMALLINT NOT NULL,
    schematic_id    TEXT REFERENCES mc.schematic(schematic_id),
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    -- One ledger id per currency. Mirrors mc.lot_purchase.
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    -- 0 = queued, 1 = applied, 2 = failed, 3 = claimed (worker holding it)
    apply_state     SMALLINT NOT NULL DEFAULT 0,
    apply_error     TEXT,
    claimed_at      TIMESTAMPTZ,
    claimed_by      TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at      TIMESTAMPTZ,

    CONSTRAINT mc_lot_build_log_action_chk
        CHECK (action_kind IN (0, 1)),
    CONSTRAINT mc_lot_build_log_apply_state_chk
        CHECK (apply_state BETWEEN 0 AND 3),
    CONSTRAINT mc_lot_build_log_build_has_schematic_chk
        CHECK ((action_kind = 0 AND schematic_id IS NOT NULL)
            OR (action_kind = 1)),
    CONSTRAINT mc_lot_build_log_apply_error_len_chk
        CHECK (apply_error IS NULL OR length(apply_error) <= 2048),
    CONSTRAINT mc_lot_build_log_claimed_consistency_chk
        CHECK ((apply_state = 3 AND claimed_at IS NOT NULL)
            OR (apply_state <> 3)),
    CONSTRAINT mc_lot_build_log_idem_uq UNIQUE (idempotency_key)
);

CREATE INDEX idx_mc_lot_build_log_lot     ON mc.lot_build_log (lot_id);
CREATE INDEX idx_mc_lot_build_log_actor   ON mc.lot_build_log (actor_user_id);
CREATE INDEX idx_mc_lot_build_log_pending ON mc.lot_build_log (queued_at) WHERE apply_state = 0;
-- Stuck-job reclaim: find rows whose worker died after claiming.
CREATE INDEX idx_mc_lot_build_log_claimed_stale
    ON mc.lot_build_log (claimed_at)
    WHERE apply_state = 3;

-- At most one outstanding job (queued OR claimed) per lot. Stronger than
-- the lot.state guard because it survives RPC bugs / direct admin writes.
CREATE UNIQUE INDEX uq_mc_lot_build_log_one_active_per_lot
    ON mc.lot_build_log (lot_id)
    WHERE apply_state IN (0, 3);

ALTER TABLE mc.lot_build_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot_build_log FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_build_log IS
    'Append-only audit of build/demolish events and concurrent work queue. action_kind: 0=build, 1=demolish. apply_state: 0=queued, 1=applied, 2=failed, 3=claimed.';


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
    chunk_area      INTEGER,
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
ROWS 256
AS $$
    SELECT l.lot_id,
           l.world,
           lower(l.chunk_x_range)     AS chunk_x_min,
           upper(l.chunk_x_range) - 1 AS chunk_x_max,
           lower(l.chunk_z_range)     AS chunk_z_min,
           upper(l.chunk_z_range) - 1 AS chunk_z_max,
           l.chunk_area,
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
ROWS 64
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
-- mc.service_claim_pending_builds — concurrency-safe work claim
-- ===========================================================================
--
-- Replaces a plain SELECT of queued rows. Uses FOR UPDATE SKIP LOCKED so
-- multiple MC workers polling at the same time each get a distinct slice,
-- and flips apply_state from 0 → 3 (claimed) in the same statement so a
-- worker death leaves a recoverable claim instead of a lost job.
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_claim_pending_builds(
    p_worker_id TEXT,
    p_limit INTEGER DEFAULT 32
)
RETURNS TABLE (
    build_id        TEXT,
    lot_id          TEXT,
    actor_user_id   UUID,
    action_kind     SMALLINT,
    schematic_id    TEXT,
    queued_at       TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
ROWS 32
AS $$
    UPDATE mc.lot_build_log b
       SET apply_state = 3,
           claimed_at  = clock_timestamp(),
           claimed_by  = p_worker_id
     WHERE b.build_id IN (
        SELECT inner_b.build_id
          FROM mc.lot_build_log inner_b
         WHERE inner_b.apply_state = 0
         ORDER BY inner_b.queued_at
         FOR UPDATE SKIP LOCKED
         LIMIT GREATEST(1, LEAST(p_limit, 256))
     )
    RETURNING b.build_id, b.lot_id, b.actor_user_id,
              b.action_kind, b.schematic_id, b.queued_at;
$$;

ALTER FUNCTION mc.service_claim_pending_builds(TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_claim_pending_builds(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_claim_pending_builds(TEXT, INTEGER)
    TO service_role;


-- ===========================================================================
-- mc.service_requeue_stale_claims — recover orphaned worker claims
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_requeue_stale_claims(
    p_older_than_seconds INTEGER DEFAULT 300
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH stale AS (
        UPDATE mc.lot_build_log
           SET apply_state = 0,
               claimed_at = NULL,
               claimed_by = NULL
         WHERE apply_state = 3
           AND claimed_at IS NOT NULL
           AND claimed_at < clock_timestamp() - make_interval(secs => GREATEST(1, p_older_than_seconds))
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER FROM stale;
$$;

ALTER FUNCTION mc.service_requeue_stale_claims(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_requeue_stale_claims(INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_requeue_stale_claims(INTEGER)
    TO service_role;


-- ===========================================================================
-- mc.service_mark_build_applied — MC mod ACK on success
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_mark_build_applied(p_build_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
DECLARE
    v_lot_id        TEXT;
    v_action_kind   SMALLINT;
    v_schematic_id  TEXT;
    v_rowcount      INTEGER;
BEGIN
    UPDATE mc.lot_build_log
       SET apply_state = 1,
           applied_at = clock_timestamp(),
           claimed_at = NULL,
           claimed_by = NULL
     WHERE build_id = p_build_id
       AND apply_state IN (0, 3)
    RETURNING lot_id, action_kind, schematic_id
        INTO v_lot_id, v_action_kind, v_schematic_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_action_kind = 0 THEN
        UPDATE mc.lot
           SET state = 2,
               current_schematic_id = v_schematic_id
         WHERE lot_id = v_lot_id
           AND state = 3;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'lot % not in under_build state at ACK time', v_lot_id
                USING ERRCODE = '22023';
        END IF;
    ELSIF v_action_kind = 1 THEN
        UPDATE mc.lot
           SET state = 1,
               current_schematic_id = NULL
         WHERE lot_id = v_lot_id
           AND state = 4;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'lot % not in demolishing state at ACK time', v_lot_id
                USING ERRCODE = '22023';
        END IF;
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
COST 100
AS $$
DECLARE
    v_lot_id TEXT;
BEGIN
    UPDATE mc.lot_build_log
       SET apply_state = 2,
           apply_error = left(p_error, 2048),
           applied_at = clock_timestamp(),
           claimed_at = NULL,
           claimed_by = NULL
     WHERE build_id = p_build_id
       AND apply_state IN (0, 3)
    RETURNING lot_id INTO v_lot_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE mc.lot
       SET state = CASE WHEN current_schematic_id IS NULL THEN 1 ELSE 2 END
     WHERE lot_id = v_lot_id
       AND state IN (3, 4);

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
COST 100
AS $$
DECLARE
    v_existing_purchase_id TEXT;
    v_existing_lot         TEXT;
    v_existing_buyer       UUID;
    v_lot_state            SMALLINT;
    v_price_credits        BIGINT;
    v_price_khash          BIGINT;
    v_account_id           UUID;
    v_credits_ledger_id    BIGINT;
    v_khash_ledger_id      BIGINT;
    v_purchase_id          TEXT;
BEGIN
    -- Idempotent replay: existing key must match the original parameters,
    -- otherwise the caller is reusing a key for a different request.
    SELECT purchase_id, lot_id, buyer_user_id
      INTO v_existing_purchase_id, v_existing_lot, v_existing_buyer
      FROM mc.lot_purchase
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_lot <> p_lot_id OR v_existing_buyer <> p_user_id THEN
            RAISE EXCEPTION 'idempotency_key % already used for a different lot/buyer',
                p_idempotency_key USING ERRCODE = '22023';
        END IF;
        RETURN v_existing_purchase_id;
    END IF;

    SELECT state, price_credits, price_khash
      INTO v_lot_state, v_price_credits, v_price_khash
      FROM mc.lot
     WHERE lot_id = p_lot_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot_state <> 0 THEN
        RAISE EXCEPTION 'lot % is not vacant (state=%)', p_lot_id, v_lot_state
            USING ERRCODE = '22023';
    END IF;

    v_account_id := mc._user_account_id(p_user_id);
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'user % has no wallet account', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_price_credits > 0 THEN
        v_credits_ledger_id := wallet.service_debit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_price_credits,
            'purchase'::wallet.source_kind,
            'mc.lot.purchase:' || p_lot_id,
            'mc.lot',
            NULL,
            mc._derive_idem_key(p_idempotency_key, 'credits')
        );
    END IF;
    IF v_price_khash > 0 THEN
        v_khash_ledger_id := wallet.service_debit(
            v_account_id,
            'khash'::wallet.currency_kind,
            v_price_khash,
            'purchase'::wallet.source_kind,
            'mc.lot.purchase:' || p_lot_id,
            'mc.lot',
            NULL,
            mc._derive_idem_key(p_idempotency_key, 'khash')
        );
    END IF;

    INSERT INTO mc.lot_purchase (
        lot_id, buyer_user_id, price_credits, price_khash,
        wallet_credits_ledger_id, wallet_khash_ledger_id,
        idempotency_key
    ) VALUES (
        p_lot_id, p_user_id, v_price_credits, v_price_khash,
        v_credits_ledger_id, v_khash_ledger_id,
        p_idempotency_key
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
COST 100
AS $$
DECLARE
    v_existing_build_id    TEXT;
    v_existing_lot         TEXT;
    v_existing_schematic   TEXT;
    v_existing_actor       UUID;
    v_lot_owner            UUID;
    v_lot_state            SMALLINT;
    v_lot_anchor_y         SMALLINT;
    v_lot_chunk_area       INTEGER;
    v_lot_dx_blocks        INTEGER;
    v_lot_dz_blocks        INTEGER;
    v_sch_dims_x           SMALLINT;
    v_sch_dims_y           SMALLINT;
    v_sch_dims_z           SMALLINT;
    v_sch_price_credits    BIGINT;
    v_sch_price_khash      BIGINT;
    v_sch_enabled          BOOLEAN;
    v_account_id           UUID;
    v_credits_ledger_id    BIGINT;
    v_khash_ledger_id      BIGINT;
    v_build_id             TEXT;
BEGIN
    SELECT build_id, lot_id, schematic_id, actor_user_id
      INTO v_existing_build_id, v_existing_lot, v_existing_schematic, v_existing_actor
      FROM mc.lot_build_log
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_lot <> p_lot_id
           OR v_existing_schematic IS DISTINCT FROM p_schematic_id
           OR v_existing_actor <> p_user_id THEN
            RAISE EXCEPTION 'idempotency_key % already used for a different build request',
                p_idempotency_key USING ERRCODE = '22023';
        END IF;
        RETURN v_existing_build_id;
    END IF;

    SELECT owner_user_id, state, anchor_y,
           chunk_area,
           (upper(chunk_x_range) - lower(chunk_x_range)) * 16,
           (upper(chunk_z_range) - lower(chunk_z_range)) * 16
      INTO v_lot_owner, v_lot_state, v_lot_anchor_y,
           v_lot_chunk_area,
           v_lot_dx_blocks,
           v_lot_dz_blocks
      FROM mc.lot
     WHERE lot_id = p_lot_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot_owner IS NULL OR v_lot_owner <> p_user_id THEN
        RAISE EXCEPTION 'user % does not own lot %', p_user_id, p_lot_id
            USING ERRCODE = '42501';
    END IF;
    IF v_lot_state NOT IN (1, 2) THEN
        RAISE EXCEPTION 'lot % is not in a buildable state (state=%)',
            p_lot_id, v_lot_state USING ERRCODE = '22023';
    END IF;

    SELECT dims_x, dims_y, dims_z,
           price_credits, price_khash, enabled
      INTO v_sch_dims_x, v_sch_dims_y, v_sch_dims_z,
           v_sch_price_credits, v_sch_price_khash, v_sch_enabled
      FROM mc.schematic
     WHERE schematic_id = p_schematic_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'schematic % does not exist', p_schematic_id
            USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_sch_enabled THEN
        RAISE EXCEPTION 'schematic % is disabled', p_schematic_id
            USING ERRCODE = '22023';
    END IF;

    IF v_sch_dims_x > v_lot_dx_blocks OR v_sch_dims_z > v_lot_dz_blocks THEN
        RAISE EXCEPTION 'schematic % (%x%) does not fit lot % (%x%)',
            p_schematic_id, v_sch_dims_x, v_sch_dims_z,
            p_lot_id, v_lot_dx_blocks, v_lot_dz_blocks
            USING ERRCODE = '22023';
    END IF;
    IF v_lot_anchor_y + v_sch_dims_y > 319 THEN
        RAISE EXCEPTION 'schematic % at anchor_y=% exceeds world height',
            p_schematic_id, v_lot_anchor_y USING ERRCODE = '22023';
    END IF;

    -- Phase-0 chunk-count guard. Lifted in a follow-up migration once the
    -- tick-chunked paste pipeline is proven stable.
    IF v_lot_chunk_area > 64 THEN
        RAISE EXCEPTION 'lot % exceeds phase-0 build cap (chunks=%, max=64)',
            p_lot_id, v_lot_chunk_area USING ERRCODE = '22023';
    END IF;

    v_account_id := mc._user_account_id(p_user_id);
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'user % has no wallet account', p_user_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_sch_price_credits > 0 THEN
        v_credits_ledger_id := wallet.service_debit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_sch_price_credits,
            'purchase'::wallet.source_kind,
            'mc.lot.build:' || p_lot_id || ':' || p_schematic_id,
            'mc.lot_build_log',
            NULL,
            mc._derive_idem_key(p_idempotency_key, 'credits')
        );
    END IF;
    IF v_sch_price_khash > 0 THEN
        v_khash_ledger_id := wallet.service_debit(
            v_account_id,
            'khash'::wallet.currency_kind,
            v_sch_price_khash,
            'purchase'::wallet.source_kind,
            'mc.lot.build:' || p_lot_id || ':' || p_schematic_id,
            'mc.lot_build_log',
            NULL,
            mc._derive_idem_key(p_idempotency_key, 'khash')
        );
    END IF;

    INSERT INTO mc.lot_build_log (
        lot_id, actor_user_id, action_kind, schematic_id,
        price_credits, price_khash,
        wallet_credits_ledger_id, wallet_khash_ledger_id,
        idempotency_key
    ) VALUES (
        p_lot_id, p_user_id, 0, p_schematic_id,
        v_sch_price_credits, v_sch_price_khash,
        v_credits_ledger_id, v_khash_ledger_id,
        p_idempotency_key
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
COST 100
AS $$
DECLARE
    v_existing_build_id    TEXT;
    v_existing_lot         TEXT;
    v_existing_actor       UUID;
    v_existing_action      SMALLINT;
    v_lot_owner            UUID;
    v_lot_state            SMALLINT;
    v_build_id             TEXT;
BEGIN
    SELECT build_id, lot_id, actor_user_id, action_kind
      INTO v_existing_build_id, v_existing_lot, v_existing_actor, v_existing_action
      FROM mc.lot_build_log
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_lot <> p_lot_id
           OR v_existing_actor <> p_user_id
           OR v_existing_action <> 1 THEN
            RAISE EXCEPTION 'idempotency_key % already used for a different request',
                p_idempotency_key USING ERRCODE = '22023';
        END IF;
        RETURN v_existing_build_id;
    END IF;

    SELECT owner_user_id, state
      INTO v_lot_owner, v_lot_state
      FROM mc.lot
     WHERE lot_id = p_lot_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lot % does not exist', p_lot_id USING ERRCODE = 'P0002';
    END IF;
    IF v_lot_owner IS NULL OR v_lot_owner <> p_user_id THEN
        RAISE EXCEPTION 'user % does not own lot %', p_user_id, p_lot_id
            USING ERRCODE = '42501';
    END IF;
    IF v_lot_state <> 2 THEN
        RAISE EXCEPTION 'lot % has nothing to demolish (state=%)',
            p_lot_id, v_lot_state USING ERRCODE = '22023';
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
-- mc.proxy_* RPCs (auth.uid()-bound; called by the public.proxy_* layer)
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
    chunk_area      INTEGER,
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
ROWS 256
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
           l.chunk_area,
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
    FROM PUBLIC, anon, authenticated;
-- Only the public wrapper (running as service_role) calls into this layer.
-- authenticated is intentionally excluded — direct PostgREST access to the
-- mc schema is impossible anyway, but tightening the grant means a future
-- exposure mistake doesn't accidentally expose this entry point.
GRANT EXECUTE ON FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER)
    TO service_role;


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
ROWS 64
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
REVOKE ALL ON FUNCTION mc.proxy_list_schematics(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_list_schematics(TEXT) TO service_role;


CREATE OR REPLACE FUNCTION mc.proxy_purchase_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 100
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
REVOKE ALL ON FUNCTION mc.proxy_purchase_lot(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_purchase_lot(TEXT) TO service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 100
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
REVOKE ALL ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_demolish_lot(p_lot_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 100
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
REVOKE ALL ON FUNCTION mc.proxy_queue_demolish_lot(TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_demolish_lot(TEXT) TO service_role;


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
    chunk_area      INTEGER,
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
ROWS 256
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
ROWS 64
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
COST 100
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
COST 100
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
COST 100
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
DROP FUNCTION IF EXISTS mc.service_requeue_stale_claims(INTEGER);
DROP FUNCTION IF EXISTS mc.service_claim_pending_builds(TEXT, INTEGER);
DROP FUNCTION IF EXISTS mc.service_list_schematics(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc._user_account_id(UUID);
DROP FUNCTION IF EXISTS mc._derive_idem_key(UUID, TEXT);

DROP TABLE IF EXISTS mc.lot_build_log;
DROP TABLE IF EXISTS mc.lot_purchase;

DROP TRIGGER IF EXISTS trg_mc_lot_updated_at ON mc.lot;
DROP TABLE IF EXISTS mc.lot;
DROP FUNCTION IF EXISTS mc.trg_lot_updated_at();

DROP TABLE IF EXISTS mc.schematic;

NOTIFY pgrst, 'reload schema';
