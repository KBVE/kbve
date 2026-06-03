-- migrate:up

-- mc lot system — digital real estate for the survival backend.
-- Tables: mc.schematic (catalog), mc.lot (parcels, GIST EXCLUDE on
-- (world, chunk_x_range, chunk_z_range) prevents overlap),
-- mc.lot_purchase (ownership ledger), mc.lot_build_log (build audit
-- + concurrent work queue).
-- Money flows through wallet.service_debit; dual-currency charges
-- use mc._derive_idem_key to avoid wallet-side idempotency collision.
-- RPC layering: mc.service_* (service_role), mc.proxy_* (auth.uid()),
-- public.proxy_* (PostgREST surface).

-- btree_gist supplies gist_text_ops for the EXCLUDE constraint. Kept
-- in default schema; pinning to `extensions` breaks opclass resolution
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS mc;
GRANT USAGE ON SCHEMA mc TO service_role;
REVOKE ALL ON SCHEMA mc FROM PUBLIC, anon, authenticated;


-- State domains: centralize enum bounds so RPCs/CHECKs don't drift
-- from each other when ranges expand. Storage stays SMALLINT.
CREATE DOMAIN mc.lot_state AS SMALLINT
    CHECK (VALUE BETWEEN 0 AND 4);
CREATE DOMAIN mc.build_action_kind AS SMALLINT
    CHECK (VALUE IN (0, 1));
CREATE DOMAIN mc.build_apply_state AS SMALLINT
    CHECK (VALUE BETWEEN 0 AND 3);
ALTER DOMAIN mc.lot_state OWNER TO postgres;
ALTER DOMAIN mc.build_action_kind OWNER TO postgres;
ALTER DOMAIN mc.build_apply_state OWNER TO postgres;


-- mc._derive_idem_key — wallet.service_debit treats (account,
-- idempotency_key) as the uniqueness scope; dual-currency charges
-- need a stable per-currency UUID so credits + khash don't collide.
CREATE OR REPLACE FUNCTION mc._derive_idem_key(p_key UUID, p_tag TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
    -- pgcrypto lives in extensions schema on Supabase. SHA-256 truncated
    -- to 128 bits = UUID-sized digest.
    SELECT substr(encode(extensions.digest(p_key::text || ':' || p_tag, 'sha256'), 'hex'), 1, 32)::uuid;
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
    CONSTRAINT mc_schematic_id_chk
        CHECK (schematic_id ~ '^[A-Za-z0-9:_/-]{3,128}$'),
    CONSTRAINT mc_schematic_category_chk
        CHECK (category IN ('house', 'castle', 'tower', 'farm', 'shop', 'utility', 'monument')),
    -- Reject path traversal; lock to schematics/ dir in mod jar.
    CONSTRAINT mc_schematic_resource_path_chk
        CHECK (resource_path !~ '(^/|\.\.)' AND
               resource_path ~ '^schematics/[A-Za-z0-9_./-]+\.(nbt|schem)$')
);

-- Index-only path for proxy_list_schematics: WHERE enabled ORDER BY
-- category, tier, name.
CREATE INDEX idx_mc_schematic_enabled_category_tier_name_cover
    ON mc.schematic (category, tier, name, schematic_id)
    INCLUDE (dims_x, dims_y, dims_z, price_credits, price_khash)
    WHERE enabled;

ALTER TABLE mc.schematic OWNER TO postgres;
ALTER TABLE mc.schematic ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.schematic FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.schematic IS
    'Build catalog. RPC-only — RLS forced with no policies; all access via SECURITY DEFINER RPCs.';


-- ===========================================================================
-- mc.lot — parcel registry
-- ===========================================================================
CREATE TABLE mc.lot (
    lot_id          TEXT PRIMARY KEY,
    world           TEXT NOT NULL DEFAULT 'minecraft:overworld',
    chunk_x_range   int4range NOT NULL,
    chunk_z_range   int4range NOT NULL,
    -- Stored generated columns for chunk-count guards, index ORDER BY,
    -- and map queries. *_min / *_max are inclusive (upper-1).
    chunk_x_min     INTEGER GENERATED ALWAYS AS (lower(chunk_x_range)) STORED,
    chunk_x_max     INTEGER GENERATED ALWAYS AS (upper(chunk_x_range) - 1) STORED,
    chunk_z_min     INTEGER GENERATED ALWAYS AS (lower(chunk_z_range)) STORED,
    chunk_z_max     INTEGER GENERATED ALWAYS AS (upper(chunk_z_range) - 1) STORED,
    chunk_width     INTEGER GENERATED ALWAYS AS
        (upper(chunk_x_range) - lower(chunk_x_range)) STORED,
    chunk_depth     INTEGER GENERATED ALWAYS AS
        (upper(chunk_z_range) - lower(chunk_z_range)) STORED,
    chunk_area      INTEGER GENERATED ALWAYS AS
        ((upper(chunk_x_range) - lower(chunk_x_range))
       * (upper(chunk_z_range) - lower(chunk_z_range))) STORED,
    -- Block-space mirrors so map/worker reads skip chunk*16 client-side.
    block_x_min     INTEGER GENERATED ALWAYS AS (lower(chunk_x_range) * 16) STORED,
    block_x_max     INTEGER GENERATED ALWAYS AS (upper(chunk_x_range) * 16 - 1) STORED,
    block_z_min     INTEGER GENERATED ALWAYS AS (lower(chunk_z_range) * 16) STORED,
    block_z_max     INTEGER GENERATED ALWAYS AS (upper(chunk_z_range) * 16 - 1) STORED,
    anchor_y        SMALLINT NOT NULL,
    -- RESTRICT not SET NULL: owner_state_chk requires owner with
    -- state>0; user-delete must flow through a release-lots RPC.
    owner_user_id   UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    current_schematic_id TEXT REFERENCES mc.schematic(schematic_id),
    -- 0 = vacant, 1 = owned, 2 = built, 3 = under_build, 4 = demolishing
    state           mc.lot_state NOT NULL DEFAULT 0,
    -- Bitfield for non-lifecycle attributes (admin_reserved, featured,
    -- no_demolish, no_transfer, market_visible…). Phase-0 leaves bits
    -- undefined; flags=0 = normal lot.
    flags           INTEGER NOT NULL DEFAULT 0,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_id_chk         CHECK (lot_id ~ '^[A-Za-z0-9:_-]{3,96}$'),
    CONSTRAINT mc_lot_flags_chk      CHECK (flags >= 0),
    CONSTRAINT mc_lot_anchor_y_chk   CHECK (anchor_y BETWEEN -64 AND 319),
    CONSTRAINT mc_lot_price_chk      CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_lot_x_range_chk    CHECK (NOT isempty(chunk_x_range)
                                             AND lower_inc(chunk_x_range)
                                             AND NOT upper_inc(chunk_x_range)),
    CONSTRAINT mc_lot_z_range_chk    CHECK (NOT isempty(chunk_z_range)
                                             AND lower_inc(chunk_z_range)
                                             AND NOT upper_inc(chunk_z_range)),
    CONSTRAINT mc_lot_x_range_finite_chk
        CHECK (lower(chunk_x_range) IS NOT NULL AND upper(chunk_x_range) IS NOT NULL),
    CONSTRAINT mc_lot_z_range_finite_chk
        CHECK (lower(chunk_z_range) IS NOT NULL AND upper(chunk_z_range) IS NOT NULL),
    -- 512 chunks = 8192 blocks per axis; 262144 area = 4km^2. Table
    -- floor; phase-0 RPC cap is 64 chunks.
    CONSTRAINT mc_lot_chunk_width_max_chk
        CHECK ((upper(chunk_x_range) - lower(chunk_x_range)) <= 512),
    CONSTRAINT mc_lot_chunk_depth_max_chk
        CHECK ((upper(chunk_z_range) - lower(chunk_z_range)) <= 512),
    CONSTRAINT mc_lot_chunk_area_max_chk
        CHECK ((upper(chunk_x_range) - lower(chunk_x_range))
             * (upper(chunk_z_range) - lower(chunk_z_range)) <= 262144),
    -- Vanilla namespaced dim id: 'minecraft:overworld' etc.
    CONSTRAINT mc_lot_world_chk
        CHECK (world ~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$'),
    CONSTRAINT mc_lot_owner_state_chk CHECK (
        (state = 0 AND owner_user_id IS NULL)
        OR (state > 0 AND owner_user_id IS NOT NULL)
    ),
    -- 0/1: no schematic. 2/4: schematic NOT NULL. 3: free (rebuild).
    CONSTRAINT mc_lot_built_has_schematic_chk CHECK (
        CASE state
            WHEN 0 THEN current_schematic_id IS NULL
            WHEN 1 THEN current_schematic_id IS NULL
            WHEN 2 THEN current_schematic_id IS NOT NULL
            WHEN 4 THEN current_schematic_id IS NOT NULL
            ELSE TRUE  -- state=3 unconstrained
        END
    ),
    -- state=0 inverse of owner_state_chk: no owner, no schematic.
    CONSTRAINT mc_lot_vacant_clean_chk CHECK (
        state <> 0
        OR (owner_user_id IS NULL AND current_schematic_id IS NULL)
    ),

    CONSTRAINT mc_lot_no_overlap_excl EXCLUDE USING gist (
        world WITH =,
        chunk_x_range WITH &&,
        chunk_z_range WITH &&
    )
);

-- Generated chunk_min columns + trailing lot_id for keyset pagination.
-- Bare 'WHERE owner_user_id = $1' lookups are covered by the leading
-- column of idx_mc_lot_owner_world_chunk_cursor; no separate non-cursor
-- owner index needed.
CREATE INDEX idx_mc_lot_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX idx_mc_lot_world_state_chunk_cursor
    ON mc.lot (world, state, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX idx_mc_lot_owner_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    WHERE owner_user_id IS NOT NULL;
-- Marketplace map: vacant lots, index-only via INCLUDE.
CREATE INDEX idx_mc_lot_vacant_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (chunk_x_max, chunk_z_max, chunk_area, anchor_y,
             price_credits, price_khash)
    WHERE state = 0;
-- "My lots" (state IN (1,2)), index-only.
CREATE INDEX idx_mc_lot_owner_active_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (state, current_schematic_id, chunk_x_max, chunk_z_max,
             chunk_area, anchor_y, price_credits, price_khash)
    WHERE owner_user_id IS NOT NULL AND state IN (1, 2);
-- Transitional poll view (state IN (3,4)).
CREATE INDEX idx_mc_lot_owner_transitional_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (state, current_schematic_id, chunk_x_max, chunk_z_max,
             chunk_area, anchor_y, price_credits, price_khash)
    WHERE owner_user_id IS NOT NULL AND state IN (3, 4);

ALTER TABLE mc.lot OWNER TO postgres;
ALTER TABLE mc.lot ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot FORCE ROW LEVEL SECURITY;

-- Per-column DISTINCT check skips generated cols; NOW() for txn-stable.
CREATE OR REPLACE FUNCTION mc.trg_lot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.owner_user_id        IS DISTINCT FROM OLD.owner_user_id
       OR NEW.current_schematic_id IS DISTINCT FROM OLD.current_schematic_id
       OR NEW.state                IS DISTINCT FROM OLD.state
       OR NEW.flags                IS DISTINCT FROM OLD.flags
       OR NEW.price_credits        IS DISTINCT FROM OLD.price_credits
       OR NEW.price_khash          IS DISTINCT FROM OLD.price_khash
       OR NEW.world                IS DISTINCT FROM OLD.world
       OR NEW.chunk_x_range        IS DISTINCT FROM OLD.chunk_x_range
       OR NEW.chunk_z_range        IS DISTINCT FROM OLD.chunk_z_range
       OR NEW.anchor_y             IS DISTINCT FROM OLD.anchor_y
    THEN
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
    'Parcel registry. Chunk-aligned regions; GIST EXCLUDE forbids overlap. RPC-only — RLS forced with no policies.';
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
    -- Per-currency back-ref. NOT a FK to wallet.ledger; that path's NO
    -- ACTION semantics would block wallet retention/archival.
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_purchase_price_chk
        CHECK (price_credits >= 0 AND price_khash >= 0),
    -- Ledger ref NOT NULL iff that currency was charged.
    CONSTRAINT mc_lot_purchase_credits_ledger_chk CHECK (
        (price_credits = 0 AND wallet_credits_ledger_id IS NULL)
        OR (price_credits > 0 AND wallet_credits_ledger_id IS NOT NULL)
    ),
    CONSTRAINT mc_lot_purchase_khash_ledger_chk CHECK (
        (price_khash = 0 AND wallet_khash_ledger_id IS NULL)
        OR (price_khash > 0 AND wallet_khash_ledger_id IS NOT NULL)
    ),
    CONSTRAINT mc_lot_purchase_idem_uq UNIQUE (idempotency_key)
);

-- "My purchases" newest-first, index-only (ledger ids omitted on purpose).
CREATE INDEX idx_mc_lot_purchase_buyer_created
    ON mc.lot_purchase (buyer_user_id, created_at DESC, purchase_id DESC)
    INCLUDE (lot_id, price_credits, price_khash);

-- Phase-0 invariant: one purchase per lot. Doubles as lookup index.
CREATE UNIQUE INDEX uq_mc_lot_purchase_one_per_lot
    ON mc.lot_purchase (lot_id);

ALTER TABLE mc.lot_purchase OWNER TO postgres;
ALTER TABLE mc.lot_purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot_purchase FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_purchase IS
    'Append-only ownership ledger. Per-currency back-refs to wallet.ledger. RPC-only — RLS forced with no policies.';


-- ===========================================================================
-- mc.lot_build_log — build/demolish audit + work queue
-- ===========================================================================
CREATE TABLE mc.lot_build_log (
    build_id        TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- 0 = build, 1 = demolish
    action_kind     mc.build_action_kind NOT NULL,
    schematic_id    TEXT REFERENCES mc.schematic(schematic_id),
    -- Pre-queue snapshot of the lot. failure recovery / retry uses
    -- these instead of the current_schematic_id heuristic so concurrent
    -- successful builds in between don't get rolled back accidentally.
    lot_state_before    mc.lot_state,
    schematic_id_before TEXT REFERENCES mc.schematic(schematic_id),
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    -- 0 = queued, 1 = applied, 2 = failed, 3 = claimed (worker holding it)
    apply_state     mc.build_apply_state NOT NULL DEFAULT 0,
    apply_error     TEXT,
    claimed_at      TIMESTAMPTZ,
    claimed_by      TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at      TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    -- Incremented on claim; cap excludes poison from SKIP LOCKED scan.
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,

    CONSTRAINT mc_lot_build_log_build_has_schematic_chk
        CHECK ((action_kind = 0 AND schematic_id IS NOT NULL)
            OR (action_kind = 1)),
    CONSTRAINT mc_lot_build_log_apply_error_len_chk
        CHECK (apply_error IS NULL OR length(apply_error) <= 2048),
    CONSTRAINT mc_lot_build_log_attempt_count_chk
        CHECK (attempt_count >= 0 AND attempt_count <= 100),
    CONSTRAINT mc_lot_build_log_claimed_by_len_chk
        CHECK (claimed_by IS NULL OR length(claimed_by) <= 128),
    CONSTRAINT mc_lot_build_log_credits_ledger_chk CHECK (
        (price_credits = 0 AND wallet_credits_ledger_id IS NULL)
        OR (price_credits > 0 AND wallet_credits_ledger_id IS NOT NULL)
    ),
    CONSTRAINT mc_lot_build_log_khash_ledger_chk CHECK (
        (price_khash = 0 AND wallet_khash_ledger_id IS NULL)
        OR (price_khash > 0 AND wallet_khash_ledger_id IS NOT NULL)
    ),
    -- Demolish is free in phase 0 — table-level lock so future RPC
    -- changes can't silently start charging.
    CONSTRAINT mc_lot_build_log_demolish_free_chk CHECK (
        action_kind <> 1
        OR (schematic_id IS NULL
            AND price_credits = 0
            AND price_khash = 0
            AND wallet_credits_ledger_id IS NULL
            AND wallet_khash_ledger_id IS NULL)
    ),
    -- Queueable jobs only start from owned (1) or built (2).
    CONSTRAINT mc_lot_build_log_snapshot_state_chk CHECK (
        lot_state_before IS NULL OR lot_state_before IN (1, 2)
    ),
    -- Demolish snapshots must be built (or legacy NULL).
    CONSTRAINT mc_lot_build_log_demolish_snapshot_chk CHECK (
        action_kind <> 1
        OR lot_state_before IS NULL
        OR lot_state_before = 2
    ),
    -- Claimed state must carry full worker identity; non-claimed states
    -- must not.
    CONSTRAINT mc_lot_build_log_claimed_consistency_chk
        CHECK (
            (apply_state = 3 AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL)
            OR (apply_state <> 3 AND claimed_at IS NULL AND claimed_by IS NULL)
        ),
    CONSTRAINT mc_lot_build_log_idem_uq UNIQUE (idempotency_key)
);

-- Per-lot history.
CREATE INDEX idx_mc_lot_build_log_lot_queued
    ON mc.lot_build_log (lot_id, queued_at DESC, build_id DESC);
-- "My build history" — index-only via INCLUDE.
CREATE INDEX idx_mc_lot_build_log_actor_queued
    ON mc.lot_build_log (actor_user_id, queued_at DESC, build_id DESC)
    INCLUDE (lot_id, action_kind, schematic_id, apply_state,
             failed_at, applied_at, attempt_count);
-- Worker claim path. attempt_count predicate mirrors claim WHERE so
-- exhausted rows drop out of the index. INCLUDE'd columns cut heap
-- fetches for the picked/claimed pipeline.
CREATE INDEX idx_mc_lot_build_log_pending_claim
    ON mc.lot_build_log (queued_at, build_id)
    INCLUDE (lot_id, actor_user_id, action_kind, schematic_id)
    WHERE apply_state = 0 AND attempt_count < 5;
-- Stale-claim janitor scan.
CREATE INDEX idx_mc_lot_build_log_claimed_stale
    ON mc.lot_build_log (claimed_at, build_id)
    WHERE apply_state = 3 AND claimed_at IS NOT NULL;
-- Failed-job admin listing.
CREATE INDEX idx_mc_lot_build_log_failed_recent
    ON mc.lot_build_log (failed_at DESC, build_id DESC)
    WHERE apply_state = 2;
-- Reverse FK lookup: "which build jobs referenced schematic X?"
CREATE INDEX idx_mc_lot_build_log_schematic
    ON mc.lot_build_log (schematic_id)
    WHERE schematic_id IS NOT NULL;

-- One outstanding job per lot. Survives RPC bugs / direct writes.
CREATE UNIQUE INDEX uq_mc_lot_build_log_one_active_per_lot
    ON mc.lot_build_log (lot_id)
    WHERE apply_state IN (0, 3);

-- Reverse FK lookup for mc.lot.current_schematic_id.
CREATE INDEX idx_mc_lot_current_schematic
    ON mc.lot (current_schematic_id)
    WHERE current_schematic_id IS NOT NULL;

-- apply_state + attempt_count participate in partial indexes so most
-- transitions aren't HOT-eligible. fillfactor still cuts page splits;
-- phase-3 queue/audit split is the real high-throughput fix.
ALTER TABLE mc.lot_build_log SET (
    fillfactor = 80,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_threshold = 500
);

-- mc.lot state cycles 0->1->3->2->4->1; tighter than catalog default.
ALTER TABLE mc.lot SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 500,
    autovacuum_analyze_threshold = 250
);

-- Extended stats for correlated columns (state distribution skewed).
CREATE STATISTICS st_mc_lot_world_state
    ON world, state
    FROM mc.lot;
CREATE STATISTICS st_mc_lot_owner_state
    ON owner_user_id, state
    FROM mc.lot;
CREATE STATISTICS st_mc_build_log_state_attempt
    ON apply_state, attempt_count
    FROM mc.lot_build_log;

ALTER TABLE mc.lot_build_log OWNER TO postgres;
ALTER TABLE mc.lot_build_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot_build_log FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_build_log IS
    'Audit + work queue. action_kind: 0=build, 1=demolish. apply_state: 0=queued, 1=applied, 2=failed, 3=claimed. RPC-only — RLS forced.';
COMMENT ON COLUMN mc.lot_build_log.action_kind IS '0=build, 1=demolish';
COMMENT ON COLUMN mc.lot_build_log.apply_state IS
    '0=queued, 1=applied, 2=failed, 3=claimed (worker holding the row)';


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
    -- wallet.account partial unique (kind='user', user_id) enforces
    -- single match; no LIMIT 1 so duplicates raise instead of hide.
    SELECT a.id
    FROM wallet.account a
    WHERE a.kind = 'user' AND a.user_id = p_user_id;
$$;

ALTER FUNCTION mc._user_account_id(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc._user_account_id(UUID) FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- mc.service_list_lots
-- ===========================================================================
-- Cursor pagination via trailing p_after_* args; NULL = legacy LIMIT/OFFSET.
CREATE OR REPLACE FUNCTION mc.service_list_lots(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_owner_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0,
    p_after_world TEXT DEFAULT NULL,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
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
           l.chunk_x_min,
           l.chunk_x_max,
           l.chunk_z_min,
           l.chunk_z_max,
           l.block_x_min,
           l.block_x_max,
           l.block_z_min,
           l.block_z_max,
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
      -- Cursor all-or-none. Tuple comparison against any NULL would
      -- silently return no rows; require the full cursor or none.
      AND (
          p_after_lot_id IS NULL
          OR (
              p_after_world   IS NOT NULL
              AND p_after_chunk_x IS NOT NULL
              AND p_after_chunk_z IS NOT NULL
              AND (l.world, l.chunk_x_min, l.chunk_z_min, l.lot_id)
                  > (p_after_world, p_after_chunk_x, p_after_chunk_z, p_after_lot_id)
          )
      )
    ORDER BY l.world, l.chunk_x_min, l.chunk_z_min, l.lot_id
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 256), 1024))
    -- OFFSET preserved only for the non-cursor path; cursor callers
    -- should pass 0. Capped at 100000 so a pathological admin call
    -- can't request a multi-million-row deep scan.
    OFFSET CASE
        WHEN p_after_lot_id IS NULL THEN LEAST(GREATEST(0, COALESCE(p_offset, 0)), 100000)
        ELSE 0
    END;
$$;

ALTER FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER,
                                    TEXT, INTEGER, INTEGER, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER,
                                            TEXT, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER,
                                               TEXT, INTEGER, INTEGER, TEXT)
    TO service_role;


-- ===========================================================================
-- mc.service_get_lot — primary-key lookup
-- ===========================================================================
-- Dedicated PK fetch for detail views, worker diagnostics, and admin
-- repair flows; cheaper than threading a single-row case through
-- service_list_lots' optional-filter predicate.
CREATE OR REPLACE FUNCTION mc.service_get_lot(p_lot_id TEXT)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
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
ROWS 1
AS $$
    SELECT l.lot_id, l.world,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max,
           l.chunk_area, l.anchor_y,
           l.owner_user_id, l.current_schematic_id,
           l.state, l.price_credits, l.price_khash,
           l.created_at, l.updated_at
    FROM mc.lot l
    WHERE l.lot_id = p_lot_id;
$$;

ALTER FUNCTION mc.service_get_lot(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_get_lot(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_get_lot(TEXT) TO service_role;


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
-- SKIP LOCKED claim; flips 0 → 3 atomically so worker death leaves a
-- recoverable claim, not a lost job.
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
    queued_at       TIMESTAMPTZ,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    anchor_y        SMALLINT,
    resource_path   TEXT,
    dims_x          SMALLINT,
    dims_y          SMALLINT,
    dims_z          SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
ROWS 32
AS $$
BEGIN
    IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
        RAISE EXCEPTION 'worker_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF length(p_worker_id) > 128 THEN
        RAISE EXCEPTION 'worker_id too long (max 128)' USING ERRCODE = '22001';
    END IF;

    -- Final ORDER BY because UPDATE...RETURNING is unordered; workers
    -- process the batch in queued order. p_limit=0 is dry-poll.
    RETURN QUERY
    WITH picked AS (
        SELECT build_id
          FROM mc.lot_build_log
         WHERE apply_state = 0
           -- Exhausted jobs stay dormant; admin unsticks via retry RPC.
           AND attempt_count < 5
         ORDER BY queued_at, build_id
         LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 32), 256))
         FOR UPDATE SKIP LOCKED
    ),
    nowish AS (SELECT clock_timestamp() AS ts),
    claimed AS (
        UPDATE mc.lot_build_log b
           SET apply_state     = 3,
               claimed_at      = nowish.ts,
               claimed_by      = p_worker_id,
               attempt_count   = b.attempt_count + 1,
               last_attempt_at = nowish.ts
          FROM picked, nowish
         WHERE b.build_id = picked.build_id
        RETURNING b.build_id, b.lot_id, b.actor_user_id,
                  b.action_kind, b.schematic_id, b.queued_at
    )
    -- Denormalize lot + schematic so workers skip follow-up reads.
    SELECT c.build_id, c.lot_id, c.actor_user_id, c.action_kind,
           c.schematic_id, c.queued_at,
           l.world, l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max, l.anchor_y,
           s.resource_path, s.dims_x, s.dims_y, s.dims_z
      FROM claimed c
      JOIN mc.lot l ON l.lot_id = c.lot_id
      LEFT JOIN mc.schematic s ON s.schematic_id = c.schematic_id
     ORDER BY c.queued_at, c.build_id;
END;
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
    p_older_than_seconds INTEGER DEFAULT 300,
    p_limit INTEGER DEFAULT 128
)
RETURNS TABLE (
    requeued_count  INTEGER,
    exhausted_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    -- Under-cap stale claims requeue; at-cap stale claims fail and
    -- release the lot — prevents poisoned rows from blocking via
    -- the partial one-active-per-lot unique slot.
    WITH picked AS (
        SELECT build_id, lot_id, action_kind, attempt_count,
               lot_state_before, schematic_id_before
          FROM mc.lot_build_log
         WHERE apply_state = 3
           AND claimed_at IS NOT NULL
           AND claimed_at < clock_timestamp()
                          - make_interval(secs =>
                              LEAST(GREATEST(1, COALESCE(p_older_than_seconds, 300)), 86400))
         ORDER BY claimed_at, build_id
         LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 128), 512))
         FOR UPDATE SKIP LOCKED
    ),
    requeued AS (
        UPDATE mc.lot_build_log b
           SET apply_state = 0,
               claimed_at = NULL,
               claimed_by = NULL
          FROM picked p
         WHERE b.build_id = p.build_id
           AND p.attempt_count < 5
        RETURNING 1
    ),
    exhausted AS (
        UPDATE mc.lot_build_log b
           SET apply_state = 2,
               apply_error = 'retry budget exhausted after stale claim recovery',
               failed_at = clock_timestamp(),
               claimed_at = NULL,
               claimed_by = NULL
          FROM picked p
         WHERE b.build_id = p.build_id
           AND p.attempt_count >= 5
        RETURNING b.lot_id, b.action_kind, b.lot_state_before, b.schematic_id_before
    ),
    -- Snapshot-based release: restore state AND schematic together
    -- when the snapshot exists; else fall back to the legacy heuristic.
    released AS (
        UPDATE mc.lot l
           SET state = CASE
                  WHEN e.lot_state_before IS NOT NULL THEN e.lot_state_before
                  WHEN e.action_kind = 1 THEN 2
                  WHEN l.current_schematic_id IS NULL THEN 1
                  ELSE 2
               END,
               current_schematic_id = CASE
                  WHEN e.lot_state_before IS NULL THEN l.current_schematic_id
                  WHEN e.lot_state_before IN (0, 1) THEN NULL
                  WHEN e.lot_state_before IN (2, 4) THEN e.schematic_id_before
                  ELSE l.current_schematic_id
               END
          FROM exhausted e
         WHERE l.lot_id = e.lot_id
           AND l.state IN (3, 4)
        RETURNING 1
    )
    SELECT
        (SELECT COUNT(*)::INTEGER FROM requeued),
        (SELECT COUNT(*)::INTEGER FROM exhausted);
$$;

ALTER FUNCTION mc.service_requeue_stale_claims(INTEGER, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_requeue_stale_claims(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_requeue_stale_claims(INTEGER, INTEGER)
    TO service_role;


-- ===========================================================================
-- mc.service_mark_build_applied — MC mod ACK on success
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_mark_build_applied(
    p_build_id  TEXT,
    p_worker_id TEXT
)
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
    IF p_build_id IS NULL OR btrim(p_build_id) = '' THEN
        RAISE EXCEPTION 'build_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
        RAISE EXCEPTION 'worker_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF length(p_worker_id) > 128 THEN
        RAISE EXCEPTION 'worker_id too long (max 128)' USING ERRCODE = '22001';
    END IF;

    -- Worker-bound ACK: claimed_by must match.
    UPDATE mc.lot_build_log
       SET apply_state = 1,
           applied_at = clock_timestamp(),
           claimed_at = NULL,
           claimed_by = NULL
     WHERE build_id = p_build_id
       AND apply_state = 3
       AND claimed_by = p_worker_id
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

ALTER FUNCTION mc.service_mark_build_applied(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_mark_build_applied(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_mark_build_applied(TEXT, TEXT)
    TO service_role;


-- ===========================================================================
-- mc.service_mark_build_failed — MC mod ACK on failure
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_mark_build_failed(
    p_build_id  TEXT,
    p_worker_id TEXT,
    p_error     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
DECLARE
    v_lot_id               TEXT;
    v_action_kind          SMALLINT;
    v_lot_state_before     SMALLINT;
    v_schematic_id_before  TEXT;
    v_rowcount             INTEGER;
BEGIN
    IF p_build_id IS NULL OR btrim(p_build_id) = '' THEN
        RAISE EXCEPTION 'build_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
        RAISE EXCEPTION 'worker_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF length(p_worker_id) > 128 THEN
        RAISE EXCEPTION 'worker_id too long (max 128)' USING ERRCODE = '22001';
    END IF;

    UPDATE mc.lot_build_log
       SET apply_state = 2,
           apply_error = left(
               COALESCE(NULLIF(btrim(p_error), ''), 'worker reported failure'),
               2048),
           failed_at = clock_timestamp(),
           applied_at = NULL,
           claimed_at = NULL,
           claimed_by = NULL
     WHERE build_id = p_build_id
       AND apply_state = 3
       AND claimed_by = p_worker_id
    RETURNING lot_id, action_kind, lot_state_before, schematic_id_before
        INTO v_lot_id, v_action_kind, v_lot_state_before, v_schematic_id_before;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Restore from snapshot when present (state AND schematic). Fall
    -- back to the legacy schematic heuristic for rows queued before
    -- snapshot columns existed.
    UPDATE mc.lot
       SET state = CASE
              WHEN v_lot_state_before IS NOT NULL THEN v_lot_state_before
              WHEN v_action_kind = 1 THEN 2
              WHEN current_schematic_id IS NULL THEN 1
              ELSE 2
           END,
           current_schematic_id = CASE
              WHEN v_lot_state_before IS NULL THEN current_schematic_id
              WHEN v_lot_state_before IN (0, 1) THEN NULL
              WHEN v_lot_state_before IN (2, 4) THEN v_schematic_id_before
              ELSE current_schematic_id
           END
     WHERE lot_id = v_lot_id
       AND state IN (3, 4);
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'lot % not in active build/demolish state at failure ACK time', v_lot_id
            USING ERRCODE = '22023';
    END IF;

    RETURN TRUE;
END;
$$;

ALTER FUNCTION mc.service_mark_build_failed(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_mark_build_failed(TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_mark_build_failed(TEXT, TEXT, TEXT)
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
    -- service_role callers can hit this directly; mirror the cheap
    -- public-wrapper guards inline so a bad arg surfaces a clear error
    -- before the advisory lock or the lot-row FOR UPDATE.
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key cannot be null' USING ERRCODE = '22004';
    END IF;

    -- Advisory lock: serialize same-key retries before the existing-row
    -- check; namespace by op so cross-op key reuse doesn't deadlock.
    PERFORM pg_advisory_xact_lock(hashtextextended('mc.purchase:' || p_idempotency_key::text, 0));

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

    DECLARE v_rowcount INTEGER;
    BEGIN
        UPDATE mc.lot
           SET state = 1,
               owner_user_id = p_user_id
         WHERE lot_id = p_lot_id
           AND state = 0;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'lot % no longer vacant at purchase commit', p_lot_id
                USING ERRCODE = '22023';
        END IF;
    END;

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
    v_lot_schematic_before TEXT;
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
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_schematic_id IS NULL OR btrim(p_schematic_id) = '' THEN
        RAISE EXCEPTION 'schematic_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key cannot be null' USING ERRCODE = '22004';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('mc.build:' || p_idempotency_key::text, 0));

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

    SELECT owner_user_id, state, current_schematic_id, anchor_y,
           chunk_area,
           block_x_max - block_x_min + 1,
           block_z_max - block_z_min + 1
      INTO v_lot_owner, v_lot_state, v_lot_schematic_before, v_lot_anchor_y,
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

    -- Phase-0 cap; lifted once tick-chunked paste pipeline is stable.
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

    -- Concurrent second queue surfaces as unique_violation on the
    -- partial active-per-lot index; map only that, re-raise others.
    BEGIN
        INSERT INTO mc.lot_build_log (
            lot_id, actor_user_id, action_kind, schematic_id,
            lot_state_before, schematic_id_before,
            price_credits, price_khash,
            wallet_credits_ledger_id, wallet_khash_ledger_id,
            idempotency_key
        ) VALUES (
            p_lot_id, p_user_id, 0, p_schematic_id,
            v_lot_state, v_lot_schematic_before,
            v_sch_price_credits, v_sch_price_khash,
            v_credits_ledger_id, v_khash_ledger_id,
            p_idempotency_key
        )
        RETURNING build_id INTO v_build_id;
    EXCEPTION WHEN unique_violation THEN
        DECLARE
            v_constraint TEXT;
        BEGIN
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint = 'uq_mc_lot_build_log_one_active_per_lot' THEN
                RAISE EXCEPTION 'lot % already has an active queued/claimed job', p_lot_id
                    USING ERRCODE = '23505';
            END IF;
            RAISE;
        END;
    END;

    DECLARE v_rowcount INTEGER;
    BEGIN
        UPDATE mc.lot
           SET state = 3
         WHERE lot_id = p_lot_id
           AND owner_user_id = p_user_id
           AND state IN (1, 2);
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'lot % no longer in a buildable state at queue commit', p_lot_id
                USING ERRCODE = '22023';
        END IF;
    END;

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
    v_lot_schematic_before TEXT;
    v_build_id             TEXT;
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key cannot be null' USING ERRCODE = '22004';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('mc.demolish:' || p_idempotency_key::text, 0));

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

    SELECT owner_user_id, state, current_schematic_id
      INTO v_lot_owner, v_lot_state, v_lot_schematic_before
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

    BEGIN
        INSERT INTO mc.lot_build_log (
            lot_id, actor_user_id, action_kind, schematic_id,
            lot_state_before, schematic_id_before,
            idempotency_key
        ) VALUES (
            p_lot_id, p_user_id, 1, NULL,
            v_lot_state, v_lot_schematic_before,
            p_idempotency_key
        )
        RETURNING build_id INTO v_build_id;
    EXCEPTION WHEN unique_violation THEN
        DECLARE
            v_constraint TEXT;
        BEGIN
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint = 'uq_mc_lot_build_log_one_active_per_lot' THEN
                RAISE EXCEPTION 'lot % already has an active queued/claimed job', p_lot_id
                    USING ERRCODE = '23505';
            END IF;
            RAISE;
        END;
    END;

    DECLARE v_rowcount INTEGER;
    BEGIN
        UPDATE mc.lot
           SET state = 4
         WHERE lot_id = p_lot_id
           AND owner_user_id = p_user_id
           AND state = 2;
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount <> 1 THEN
            RAISE EXCEPTION 'lot % no longer demolishable at queue commit', p_lot_id
                USING ERRCODE = '22023';
        END IF;
    END;

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
    p_offset INTEGER DEFAULT 0,
    p_after_world TEXT DEFAULT NULL,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
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
    WITH me AS (SELECT auth.uid() AS uid)
    SELECT l.lot_id,
           l.world,
           l.chunk_x_min,
           l.chunk_x_max,
           l.chunk_z_min,
           l.chunk_z_max,
           l.block_x_min,
           l.block_x_max,
           l.block_z_min,
           l.block_z_max,
           l.chunk_area,
           l.anchor_y,
           l.owner_user_id,
           (l.owner_user_id IS NOT NULL AND l.owner_user_id = me.uid) AS is_owned_by_me,
           l.current_schematic_id,
           l.state,
           l.price_credits,
           l.price_khash
    FROM mc.lot l, me
    WHERE (p_world IS NULL OR l.world = p_world)
      AND (p_state IS NULL OR l.state = p_state)
      AND (NOT p_only_mine OR (me.uid IS NOT NULL AND l.owner_user_id = me.uid))
      AND (
          p_after_lot_id IS NULL
          OR (
              p_after_world   IS NOT NULL
              AND p_after_chunk_x IS NOT NULL
              AND p_after_chunk_z IS NOT NULL
              AND (l.world, l.chunk_x_min, l.chunk_z_min, l.lot_id)
                  > (p_after_world, p_after_chunk_x, p_after_chunk_z, p_after_lot_id)
          )
      )
    ORDER BY l.world, l.chunk_x_min, l.chunk_z_min, l.lot_id
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 256), 1024))
    OFFSET CASE
        WHEN p_after_lot_id IS NULL THEN LEAST(GREATEST(0, COALESCE(p_offset, 0)), 100000)
        ELSE 0
    END;
$$;

ALTER FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                  TEXT, INTEGER, INTEGER, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                          TEXT, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                             TEXT, INTEGER, INTEGER, TEXT)
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


CREATE OR REPLACE FUNCTION mc.proxy_purchase_lot(
    p_lot_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_purchase_lot(p_lot_id, v_uid, p_idempotency_key);
END;
$$;

ALTER FUNCTION mc.proxy_purchase_lot(TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_purchase_lot(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_purchase_lot(TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_queue_build_on_lot(p_lot_id, p_schematic_id, v_uid, p_idempotency_key);
END;
$$;

ALTER FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_build_on_lot(TEXT, TEXT, UUID) TO service_role;


CREATE OR REPLACE FUNCTION mc.proxy_queue_demolish_lot(
    p_lot_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    RETURN mc.service_queue_demolish_lot(p_lot_id, v_uid, p_idempotency_key);
END;
$$;

ALTER FUNCTION mc.proxy_queue_demolish_lot(TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.proxy_queue_demolish_lot(TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.proxy_queue_demolish_lot(TEXT, UUID) TO service_role;


-- ===========================================================================
-- PUBLIC PROXY WRAPPERS — PostgREST sees these
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.proxy_list_lots(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_only_mine BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0,
    p_after_world TEXT DEFAULT NULL,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
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
BEGIN
    -- Four-field cursor all-or-none; partial cursor would silent-empty.
    IF p_after_lot_id IS NOT NULL
       AND (p_after_world IS NULL
            OR p_after_chunk_x IS NULL
            OR p_after_chunk_z IS NULL) THEN
        RAISE EXCEPTION 'cursor must include after_world, after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NULL
       AND (p_after_world IS NOT NULL
            OR p_after_chunk_x IS NOT NULL
            OR p_after_chunk_z IS NOT NULL) THEN
        RAISE EXCEPTION 'cursor must include after_world, after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT * FROM mc.proxy_list_lots(
        p_world, p_state, p_only_mine, p_limit, p_offset,
        p_after_world, p_after_chunk_x, p_after_chunk_z, p_after_lot_id);
END;
$$;

ALTER FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                      TEXT, INTEGER, INTEGER, TEXT) OWNER TO service_role;
-- service_role only. The raw shape exposes owner_user_id; authenticated
-- callers must use public.proxy_list_lots_public (no raw UUIDs) or one
-- of the hot-path partial RPCs.
REVOKE ALL ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                              TEXT, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                 TEXT, INTEGER, INTEGER, TEXT)
    TO service_role;


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


-- p_idempotency_key is optional. Clients that retry on network failure
-- should pass a stable key so the repeat call collapses to the original
-- purchase row instead of racing into a "lot not vacant" error.
CREATE OR REPLACE FUNCTION public.proxy_purchase_lot(
    p_lot_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_purchase_lot(p_lot_id, p_idempotency_key);
END;
$$;

ALTER FUNCTION public.proxy_purchase_lot(TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_purchase_lot(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_purchase_lot(TEXT, UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_queue_build_on_lot(
    p_lot_id TEXT,
    p_schematic_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_schematic_id IS NULL OR btrim(p_schematic_id) = '' THEN
        RAISE EXCEPTION 'schematic_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_queue_build_on_lot(p_lot_id, p_schematic_id, p_idempotency_key);
END;
$$;

ALTER FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT, UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.proxy_queue_demolish_lot(
    p_lot_id TEXT,
    p_idempotency_key UUID DEFAULT gen_random_uuid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
COST 10
AS $$
BEGIN
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    RETURN mc.proxy_queue_demolish_lot(p_lot_id, p_idempotency_key);
END;
$$;

ALTER FUNCTION public.proxy_queue_demolish_lot(TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_queue_demolish_lot(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_queue_demolish_lot(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.proxy_purchase_lot(TEXT, UUID) IS
    'Authenticated client RPC: charge wallet + flip the vacant lot to owned. Pass a stable p_idempotency_key on retries so network repeats collapse to the original purchase.';
COMMENT ON FUNCTION public.proxy_queue_build_on_lot(TEXT, TEXT, UUID) IS
    'Authenticated client RPC: charge schematic cost + queue a build on a lot the caller owns. Idempotent on p_idempotency_key.';
COMMENT ON FUNCTION public.proxy_queue_demolish_lot(TEXT, UUID) IS
    'Authenticated client RPC: queue a demolish on a built lot the caller owns. Free in phase 0; idempotent on p_idempotency_key.';
COMMENT ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                          TEXT, INTEGER, INTEGER, TEXT) IS
    'Generic lot listing RPC. Prefer the dedicated public.proxy_list_vacant_lots and public.proxy_list_my_active_lots wrappers for dashboard use — those bind hard-coded predicates to the partial INCLUDE indexes. This generic shape stays for admin/compat callers.';
COMMENT ON FUNCTION public.proxy_list_schematics(TEXT) IS
    'Catalog read: enabled schematics, optionally filtered to a category. Sorted by (category, tier, name). Index-only path via idx_mc_schematic_enabled_category_tier_name_cover.';


-- ===========================================================================
-- PUBLIC WORKER WRAPPERS — service_role only, for MC mod through PostgREST
-- ===========================================================================
-- The MC mod authenticates with the Supabase service-role JWT and reaches
-- the DB through PostgREST. PostgREST only sees the public schema, so the
-- mc.service_* worker RPCs need a public-side bridge. authenticated callers
-- are excluded so dashboard clients can't drive the worker queue.

CREATE OR REPLACE FUNCTION public.proxy_service_claim_pending_builds(
    p_worker_id TEXT,
    p_limit INTEGER DEFAULT 32
)
RETURNS TABLE (
    build_id        TEXT,
    lot_id          TEXT,
    actor_user_id   UUID,
    action_kind     SMALLINT,
    schematic_id    TEXT,
    queued_at       TIMESTAMPTZ,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    anchor_y        SMALLINT,
    resource_path   TEXT,
    dims_x          SMALLINT,
    dims_y          SMALLINT,
    dims_z          SMALLINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
ROWS 32
AS $$
    SELECT * FROM mc.service_claim_pending_builds(p_worker_id, p_limit);
$$;

ALTER FUNCTION public.proxy_service_claim_pending_builds(TEXT, INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_claim_pending_builds(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_claim_pending_builds(TEXT, INTEGER)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_claim_pending_builds(TEXT, INTEGER) IS
    'Service-role-only PostgREST bridge for MC worker job claiming. Returns up to p_limit queued build/demolish jobs and marks them apply_state=3 (claimed) atomically via SKIP LOCKED.';


CREATE OR REPLACE FUNCTION public.proxy_service_mark_build_applied(
    p_build_id  TEXT,
    p_worker_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
    SELECT mc.service_mark_build_applied(p_build_id, p_worker_id);
$$;

ALTER FUNCTION public.proxy_service_mark_build_applied(TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_mark_build_applied(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_mark_build_applied(TEXT, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_mark_build_applied(TEXT, TEXT) IS
    'Service-role-only PostgREST bridge for MC worker success ACK. Only the worker that holds the claim (claimed_by match) may finalize the job.';


CREATE OR REPLACE FUNCTION public.proxy_service_mark_build_failed(
    p_build_id  TEXT,
    p_worker_id TEXT,
    p_error     TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
    SELECT mc.service_mark_build_failed(p_build_id, p_worker_id, p_error);
$$;

ALTER FUNCTION public.proxy_service_mark_build_failed(TEXT, TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_mark_build_failed(TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_mark_build_failed(TEXT, TEXT, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_mark_build_failed(TEXT, TEXT, TEXT) IS
    'Service-role-only PostgREST bridge for MC worker failure ACK. Same claim-binding as the success path; apply_error is capped at 2048 chars.';


CREATE OR REPLACE FUNCTION public.proxy_service_requeue_stale_claims(
    p_older_than_seconds INTEGER DEFAULT 300,
    p_limit INTEGER DEFAULT 128
)
RETURNS TABLE (
    requeued_count  INTEGER,
    exhausted_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
    SELECT * FROM mc.service_requeue_stale_claims(p_older_than_seconds, p_limit);
$$;

ALTER FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER) IS
    'Service-role-only PostgREST bridge for janitor recovery of orphaned worker claims older than p_older_than_seconds. Batched + SKIP LOCKED with p_limit (max 512). Returns the count of jobs requeued in this call.';


-- ===========================================================================
-- mc.service_retry_failed_build — admin/janitor retry of a failed job
-- ===========================================================================
-- Moves a row from apply_state=2 (failed) back to 0 (queued). Optionally
-- resets attempt_count so a poisoned build can re-enter the claim
-- pipeline; default keeps the counter (and the row will stay dormant
-- if the cap is already exhausted).
CREATE OR REPLACE FUNCTION mc.service_retry_failed_build(
    p_build_id TEXT,
    p_reset_attempts BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lot_id              TEXT;
    v_action_kind         SMALLINT;
    v_schematic_id        TEXT;
    v_schematic_id_before TEXT;
    v_lot_current_schem   TEXT;
    v_rowcount            INTEGER;
BEGIN
    IF p_build_id IS NULL OR btrim(p_build_id) = '' THEN
        RAISE EXCEPTION 'build_id cannot be empty' USING ERRCODE = '22004';
    END IF;

    SELECT lot_id, action_kind, schematic_id, schematic_id_before
      INTO v_lot_id, v_action_kind, v_schematic_id, v_schematic_id_before
      FROM mc.lot_build_log
     WHERE build_id = p_build_id
       AND apply_state = 2
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Invariant checks: build needs a schematic, demolish doesn't.
    IF v_action_kind = 0 AND v_schematic_id IS NULL THEN
        RAISE EXCEPTION 'build job % is malformed: missing schematic', p_build_id
            USING ERRCODE = '22023';
    END IF;
    IF v_action_kind = 1 AND v_schematic_id IS NOT NULL THEN
        RAISE EXCEPTION 'demolish job % is malformed: schematic must be NULL', p_build_id
            USING ERRCODE = '22023';
    END IF;

    -- Schematic-drift check covers both directions: NULL → set, set →
    -- NULL, and set → different. Skipping the NULL case let an
    -- intermediate successful build between queue and retry slip
    -- through (snapshot=NULL, current_schematic=set).
    SELECT current_schematic_id INTO v_lot_current_schem
      FROM mc.lot WHERE lot_id = v_lot_id;
    IF v_lot_current_schem IS DISTINCT FROM v_schematic_id_before THEN
        RAISE EXCEPTION 'lot % current_schematic changed since job % queued; cannot retry',
            v_lot_id, p_build_id USING ERRCODE = '22023';
    END IF;

    IF v_action_kind = 0 THEN
        UPDATE mc.lot
           SET state = 3
         WHERE lot_id = v_lot_id
           AND state IN (1, 2);
    ELSE
        UPDATE mc.lot
           SET state = 4
         WHERE lot_id = v_lot_id
           AND state = 2;
    END IF;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
        RAISE EXCEPTION 'lot % is not in a retryable state for build %', v_lot_id, p_build_id
            USING ERRCODE = '22023';
    END IF;

    UPDATE mc.lot_build_log
       SET apply_state     = 0,
           apply_error     = NULL,
           failed_at       = NULL,
           applied_at      = NULL,
           claimed_at      = NULL,
           claimed_by      = NULL,
           attempt_count   = CASE WHEN p_reset_attempts THEN 0
                                   ELSE attempt_count END,
           last_attempt_at = NULL
     WHERE build_id = p_build_id
       AND apply_state = 2;

    RETURN TRUE;
END;
$$;

ALTER FUNCTION mc.service_retry_failed_build(TEXT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_retry_failed_build(TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_retry_failed_build(TEXT, BOOLEAN)
    TO service_role;


CREATE OR REPLACE FUNCTION public.proxy_service_retry_failed_build(
    p_build_id TEXT,
    p_reset_attempts BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT mc.service_retry_failed_build(p_build_id, p_reset_attempts);
$$;

ALTER FUNCTION public.proxy_service_retry_failed_build(TEXT, BOOLEAN) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_retry_failed_build(TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_retry_failed_build(TEXT, BOOLEAN)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_retry_failed_build(TEXT, BOOLEAN) IS
    'Service-role-only PostgREST bridge: re-queue a failed build. p_reset_attempts=true clears the retry counter (use for transient infrastructure failures); default keeps it so persistent poison stays excluded.';


-- ===========================================================================
-- mc.service_list_failed_builds — admin/ops listing for failed jobs
-- ===========================================================================
CREATE OR REPLACE FUNCTION mc.service_list_failed_builds(
    p_limit INTEGER DEFAULT 100,
    p_after_failed_at TIMESTAMPTZ DEFAULT NULL,
    p_after_build_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    build_id        TEXT,
    lot_id          TEXT,
    actor_user_id   UUID,
    action_kind     SMALLINT,
    schematic_id    TEXT,
    apply_error     TEXT,
    failed_at       TIMESTAMPTZ,
    attempt_count   INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 100
AS $$
    SELECT b.build_id, b.lot_id, b.actor_user_id, b.action_kind,
           b.schematic_id, b.apply_error, b.failed_at, b.attempt_count
    FROM mc.lot_build_log b
    WHERE b.apply_state = 2
      AND (
          p_after_build_id IS NULL
          OR (
              p_after_failed_at IS NOT NULL
              AND (b.failed_at, b.build_id)
                  < (p_after_failed_at, p_after_build_id)
          )
      )
    ORDER BY b.failed_at DESC, b.build_id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

ALTER FUNCTION mc.service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT)
    TO service_role;


CREATE OR REPLACE FUNCTION public.proxy_service_list_failed_builds(
    p_limit INTEGER DEFAULT 100,
    p_after_failed_at TIMESTAMPTZ DEFAULT NULL,
    p_after_build_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    build_id        TEXT,
    lot_id          TEXT,
    actor_user_id   UUID,
    action_kind     SMALLINT,
    schematic_id    TEXT,
    apply_error     TEXT,
    failed_at       TIMESTAMPTZ,
    attempt_count   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 100
AS $$
BEGIN
    IF p_after_build_id IS NOT NULL AND p_after_failed_at IS NULL THEN
        RAISE EXCEPTION 'cursor must include after_failed_at and after_build_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_build_id IS NULL AND p_after_failed_at IS NOT NULL THEN
        RAISE EXCEPTION 'cursor must include after_failed_at and after_build_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT * FROM mc.service_list_failed_builds(p_limit, p_after_failed_at, p_after_build_id);
END;
$$;

ALTER FUNCTION public.proxy_service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT) IS
    'Service-role-only PostgREST bridge: keyset-paginated list of failed builds for ops dashboards. Uses idx_mc_lot_build_log_failed_recent.';


-- ===========================================================================
-- mc.service_release_user_lots — flow for auth.users delete cascade
-- ===========================================================================
-- owner_user_id is ON DELETE RESTRICT; this RPC is the canonical path to
-- relinquish lots before/during user deletion. By default refuses to
-- touch lots with an active worker job (state IN (3,4)); p_force = TRUE
-- skips that guard (admin escalation).
CREATE OR REPLACE FUNCTION mc.service_release_user_lots(
    p_user_id UUID,
    p_force   BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    lot_id      TEXT,
    prior_state SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null' USING ERRCODE = '22004';
    END IF;

    IF NOT p_force AND EXISTS (
        SELECT 1 FROM mc.lot
         WHERE owner_user_id = p_user_id AND state IN (3, 4)
    ) THEN
        RAISE EXCEPTION 'user % has lots with active jobs; pass p_force = TRUE to override',
            p_user_id USING ERRCODE = '22023';
    END IF;

    -- p_force: cancel any active build/demolish jobs first so worker
    -- ACKs against the now-vacant lots can't violate
    -- mc_lot_owner_state_chk or leave stuck claimed rows.
    IF p_force THEN
        UPDATE mc.lot_build_log b
           SET apply_state = 2,
               apply_error = 'cancelled by forced user lot release',
               failed_at = clock_timestamp(),
               claimed_at = NULL,
               claimed_by = NULL
          FROM mc.lot l
         WHERE b.lot_id = l.lot_id
           AND l.owner_user_id = p_user_id
           AND b.apply_state IN (0, 3);
    END IF;

    -- candidates CTE pins the prior state before the UPDATE so
    -- RETURNING can surface it (UPDATE...RETURNING reads NEW).
    RETURN QUERY
    WITH candidates AS (
        SELECT l.lot_id, l.state::SMALLINT AS prior_state
          FROM mc.lot l
         WHERE l.owner_user_id = p_user_id
    ),
    cleared AS (
        UPDATE mc.lot l
           SET state = 0,
               owner_user_id = NULL,
               current_schematic_id = NULL
          FROM candidates c
         WHERE l.lot_id = c.lot_id
        RETURNING l.lot_id, c.prior_state
    )
    SELECT cleared.lot_id, cleared.prior_state FROM cleared;
END;
$$;

ALTER FUNCTION mc.service_release_user_lots(UUID, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_release_user_lots(UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_release_user_lots(UUID, BOOLEAN)
    TO service_role;


CREATE OR REPLACE FUNCTION public.proxy_service_release_user_lots(
    p_user_id UUID,
    p_force   BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (lot_id TEXT, prior_state SMALLINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT * FROM mc.service_release_user_lots(p_user_id, p_force);
$$;

ALTER FUNCTION public.proxy_service_release_user_lots(UUID, BOOLEAN) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_release_user_lots(UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_release_user_lots(UUID, BOOLEAN)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_release_user_lots(UUID, BOOLEAN) IS
    'Service-role-only: release all lots owned by p_user_id back to vacant. Required before auth.users delete because owner_user_id is ON DELETE RESTRICT.';


-- ===========================================================================
-- mc.service_repair_orphan_transitional — repair stuck under_build/demolishing
-- ===========================================================================
-- Lots in state IN (3, 4) with no active job in mc.lot_build_log can
-- only land that way through admin error, failed migration, or a future
-- bug bypassing the queue lifecycle. This RPC scans for them and snaps
-- them back to a settled state (1 or 2 per current_schematic_id).
CREATE OR REPLACE FUNCTION mc.service_repair_orphan_transitional(
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    lot_id              TEXT,
    prior_state         SMALLINT,
    new_state           SMALLINT,
    latest_build_id     TEXT,
    latest_apply_state  SMALLINT,
    latest_failed_at    TIMESTAMPTZ,
    latest_apply_error  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Candidates first; UPDATE RETURNING sees NEW only, so prior_state
    -- needs to be captured before the write.
    IF p_dry_run THEN
        RETURN QUERY
        SELECT c.lot_id,
               c.prior_state,
               c.new_state,
               c.latest_build_id,
               c.latest_apply_state,
               c.latest_failed_at,
               c.latest_apply_error
          FROM (
            SELECT l.lot_id,
                   l.state::SMALLINT AS prior_state,
                   (CASE WHEN l.current_schematic_id IS NULL THEN 1 ELSE 2 END)::SMALLINT AS new_state,
                   latest.build_id        AS latest_build_id,
                   latest.apply_state::SMALLINT AS latest_apply_state,
                   latest.failed_at       AS latest_failed_at,
                   latest.apply_error     AS latest_apply_error
              FROM mc.lot l
              LEFT JOIN mc.lot_build_log b
                ON b.lot_id = l.lot_id
               AND b.apply_state IN (0, 3)
              LEFT JOIN LATERAL (
                SELECT build_id, apply_state, failed_at, apply_error
                  FROM mc.lot_build_log
                 WHERE lot_id = l.lot_id
                 ORDER BY queued_at DESC, build_id DESC
                 LIMIT 1
              ) latest ON TRUE
             WHERE l.state IN (3, 4)
               AND b.build_id IS NULL
          ) c;
    ELSE
        RETURN QUERY
        WITH candidates AS (
            SELECT l.lot_id,
                   l.state::SMALLINT AS prior_state,
                   (CASE WHEN l.current_schematic_id IS NULL THEN 1 ELSE 2 END)::SMALLINT AS new_state,
                   latest.build_id        AS latest_build_id,
                   latest.apply_state::SMALLINT AS latest_apply_state,
                   latest.failed_at       AS latest_failed_at,
                   latest.apply_error     AS latest_apply_error
              FROM mc.lot l
              LEFT JOIN mc.lot_build_log b
                ON b.lot_id = l.lot_id
               AND b.apply_state IN (0, 3)
              LEFT JOIN LATERAL (
                SELECT build_id, apply_state, failed_at, apply_error
                  FROM mc.lot_build_log
                 WHERE lot_id = l.lot_id
                 ORDER BY queued_at DESC, build_id DESC
                 LIMIT 1
              ) latest ON TRUE
             WHERE l.state IN (3, 4)
               AND b.build_id IS NULL
        ),
        updated AS (
            UPDATE mc.lot l
               SET state = c.new_state
              FROM candidates c
             WHERE l.lot_id = c.lot_id
            RETURNING l.lot_id
        )
        SELECT c.lot_id, c.prior_state, c.new_state,
               c.latest_build_id, c.latest_apply_state,
               c.latest_failed_at, c.latest_apply_error
          FROM candidates c
          JOIN updated u ON u.lot_id = c.lot_id;
    END IF;
END;
$$;

ALTER FUNCTION mc.service_repair_orphan_transitional(BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc.service_repair_orphan_transitional(BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mc.service_repair_orphan_transitional(BOOLEAN)
    TO service_role;


CREATE OR REPLACE FUNCTION public.proxy_service_repair_orphan_transitional(
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    lot_id              TEXT,
    prior_state         SMALLINT,
    new_state           SMALLINT,
    latest_build_id     TEXT,
    latest_apply_state  SMALLINT,
    latest_failed_at    TIMESTAMPTZ,
    latest_apply_error  TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT * FROM mc.service_repair_orphan_transitional(p_dry_run);
$$;

ALTER FUNCTION public.proxy_service_repair_orphan_transitional(BOOLEAN) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_repair_orphan_transitional(BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_repair_orphan_transitional(BOOLEAN)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_repair_orphan_transitional(BOOLEAN) IS
    'Service-role-only: snap state IN (3, 4) lots without an active job back to settled. p_dry_run = TRUE returns the candidate list without writing.';


CREATE OR REPLACE FUNCTION public.proxy_service_get_lot(p_lot_id TEXT)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
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
ROWS 1
AS $$
    SELECT * FROM mc.service_get_lot(p_lot_id);
$$;

ALTER FUNCTION public.proxy_service_get_lot(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_get_lot(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_get_lot(TEXT) TO service_role;
COMMENT ON FUNCTION public.proxy_service_get_lot(TEXT) IS
    'Service-role-only primary-key lookup for a single lot. Use for detail views, worker diagnostics, and admin repair flows.';


-- ===========================================================================
-- HOT-PATH LIST RPCs — dedicated wrappers for the two most common reads
-- ===========================================================================
-- Hard-coded state predicates so partial indexes are the only plan.
-- world fixed by p_world; cursor only carries (chunk_x, chunk_z, lot_id).

CREATE OR REPLACE FUNCTION public.proxy_list_vacant_lots(
    p_world TEXT,
    p_limit INTEGER DEFAULT 256,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    chunk_area      INTEGER,
    anchor_y        SMALLINT,
    price_credits   BIGINT,
    price_khash     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 256
AS $$
BEGIN
    IF p_world IS NULL OR btrim(p_world) = '' THEN
        RAISE EXCEPTION 'world cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_world !~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$' THEN
        RAISE EXCEPTION 'invalid world format' USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NOT NULL
       AND (p_after_chunk_x IS NULL OR p_after_chunk_z IS NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NULL
       AND (p_after_chunk_x IS NOT NULL OR p_after_chunk_z IS NOT NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT l.lot_id,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max,
           l.chunk_area,
           l.anchor_y,
           l.price_credits,
           l.price_khash
    FROM mc.lot l
    WHERE l.state = 0
      AND l.world = p_world
      AND (
          p_after_lot_id IS NULL
          OR (l.chunk_x_min, l.chunk_z_min, l.lot_id)
             > (p_after_chunk_x, p_after_chunk_z, p_after_lot_id)
      )
    ORDER BY l.chunk_x_min, l.chunk_z_min, l.lot_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 256), 1), 1024);
END;
$$;

ALTER FUNCTION public.proxy_list_vacant_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_vacant_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_vacant_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_list_vacant_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT) IS
    'Hot-path: vacant lots in a world for the marketplace map. Hard-codes state=0 so idx_mc_lot_vacant_world_chunk_cursor is the only viable plan. Cursor pagination via (chunk_x, chunk_z, lot_id) of the last row from the prior page.';


CREATE OR REPLACE FUNCTION public.proxy_list_my_active_lots(
    p_world TEXT,
    p_limit INTEGER DEFAULT 256,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    chunk_area      INTEGER,
    anchor_y        SMALLINT,
    state           SMALLINT,
    current_schematic_id TEXT,
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
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_world IS NULL OR btrim(p_world) = '' THEN
        RAISE EXCEPTION 'world cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_world !~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$' THEN
        RAISE EXCEPTION 'invalid world format' USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NOT NULL
       AND (p_after_chunk_x IS NULL OR p_after_chunk_z IS NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NULL
       AND (p_after_chunk_x IS NOT NULL OR p_after_chunk_z IS NOT NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT l.lot_id,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max,
           l.chunk_area,
           l.anchor_y,
           l.state,
           l.current_schematic_id,
           l.price_credits,
           l.price_khash
    FROM mc.lot l
    WHERE l.owner_user_id = v_uid
      AND l.state IN (1, 2)
      AND l.world = p_world
      AND (
          p_after_lot_id IS NULL
          OR (l.chunk_x_min, l.chunk_z_min, l.lot_id)
             > (p_after_chunk_x, p_after_chunk_z, p_after_lot_id)
      )
    ORDER BY l.chunk_x_min, l.chunk_z_min, l.lot_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 256), 1), 1024);
END;
$$;

ALTER FUNCTION public.proxy_list_my_active_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_my_active_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_my_active_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_list_my_active_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT) IS
    'Hot-path: caller-owned active lots (state IN (1, 2)) in a world. Hard-codes owner = auth.uid() and the state set so idx_mc_lot_owner_active_world_chunk_cursor is the only viable plan.';


-- Companion to proxy_list_my_active_lots for in-progress views the
-- dashboard polls while waiting for worker ACK. Hard-codes the
-- transitional state set so the planner pins to
-- idx_mc_lot_owner_transitional_world_chunk_cursor.
CREATE OR REPLACE FUNCTION public.proxy_list_my_transitional_lots(
    p_world TEXT,
    p_limit INTEGER DEFAULT 256,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    chunk_area      INTEGER,
    anchor_y        SMALLINT,
    state           SMALLINT,
    current_schematic_id TEXT,
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
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_world IS NULL OR btrim(p_world) = '' THEN
        RAISE EXCEPTION 'world cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_world !~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$' THEN
        RAISE EXCEPTION 'invalid world format' USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NOT NULL
       AND (p_after_chunk_x IS NULL OR p_after_chunk_z IS NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NULL
       AND (p_after_chunk_x IS NOT NULL OR p_after_chunk_z IS NOT NULL) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT l.lot_id,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max,
           l.chunk_area, l.anchor_y,
           l.state, l.current_schematic_id,
           l.price_credits, l.price_khash
    FROM mc.lot l
    WHERE l.owner_user_id = v_uid
      AND l.state IN (3, 4)
      AND l.world = p_world
      AND (
          p_after_lot_id IS NULL
          OR (l.chunk_x_min, l.chunk_z_min, l.lot_id)
             > (p_after_chunk_x, p_after_chunk_z, p_after_lot_id)
      )
    ORDER BY l.chunk_x_min, l.chunk_z_min, l.lot_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 256), 1), 1024);
END;
$$;

ALTER FUNCTION public.proxy_list_my_transitional_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_my_transitional_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_my_transitional_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_list_my_transitional_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT) IS
    'Hot-path companion to proxy_list_my_active_lots for the in-progress dashboard view (state IN (3, 4)). Pins to idx_mc_lot_owner_transitional_world_chunk_cursor. Surfaces block-space bounds for direct map rendering.';


-- ===========================================================================
-- public.proxy_list_lots_public — generic listing without raw owner UUIDs
-- ===========================================================================
-- Same shape as proxy_list_lots but strips owner_user_id from the
-- output. Use this for authenticated dashboard reads that need a mixed
-- world/state list; the raw UUID column lives in the admin-only generic
-- proxy_list_lots wrapper.
CREATE OR REPLACE FUNCTION public.proxy_list_lots_public(
    p_world TEXT DEFAULT NULL,
    p_state SMALLINT DEFAULT NULL,
    p_only_mine BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 256,
    p_offset INTEGER DEFAULT 0,
    p_after_world TEXT DEFAULT NULL,
    p_after_chunk_x INTEGER DEFAULT NULL,
    p_after_chunk_z INTEGER DEFAULT NULL,
    p_after_lot_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    lot_id          TEXT,
    world           TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    chunk_area      INTEGER,
    anchor_y        SMALLINT,
    is_owned        BOOLEAN,
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
BEGIN
    IF p_after_lot_id IS NOT NULL
       AND (p_after_world IS NULL
            OR p_after_chunk_x IS NULL
            OR p_after_chunk_z IS NULL) THEN
        RAISE EXCEPTION 'cursor must include after_world, after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;
    IF p_after_lot_id IS NULL
       AND (p_after_world IS NOT NULL
            OR p_after_chunk_x IS NOT NULL
            OR p_after_chunk_z IS NOT NULL) THEN
        RAISE EXCEPTION 'cursor must include after_world, after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT r.lot_id, r.world,
           r.chunk_x_min, r.chunk_x_max,
           r.chunk_z_min, r.chunk_z_max,
           r.block_x_min, r.block_x_max,
           r.block_z_min, r.block_z_max,
           r.chunk_area, r.anchor_y,
           (r.owner_user_id IS NOT NULL) AS is_owned,
           r.is_owned_by_me,
           r.current_schematic_id, r.state,
           r.price_credits, r.price_khash
    FROM mc.proxy_list_lots(
        p_world, p_state, p_only_mine, p_limit, p_offset,
        p_after_world, p_after_chunk_x, p_after_chunk_z, p_after_lot_id) r;
END;
$$;

ALTER FUNCTION public.proxy_list_lots_public(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                             TEXT, INTEGER, INTEGER, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_lots_public(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                     TEXT, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_lots_public(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                        TEXT, INTEGER, INTEGER, TEXT)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_list_lots_public(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                  TEXT, INTEGER, INTEGER, TEXT) IS
    'Public-safe generic lot listing. Mirrors proxy_list_lots but replaces owner_user_id with is_owned + is_owned_by_me so the dashboard does not leak ownership UUIDs of other players. Use the dedicated hot-path wrappers (proxy_list_vacant_lots / proxy_list_my_active_lots) when possible — they hit narrower partial indexes.';


-- ===========================================================================
-- public.proxy_list_lots_in_viewport — bounding-box map RPC
-- ===========================================================================
-- Dashboard map panning/zooming asks for lots whose chunk range
-- intersects the visible viewport. The EXCLUDE GiST index on
-- (world, chunk_x_range, chunk_z_range) already indexes the right
-- columns for the && (overlap) operator, so this query is index-fed.
CREATE OR REPLACE FUNCTION public.proxy_list_lots_in_viewport(
    p_world TEXT,
    p_min_chunk_x INTEGER,
    p_max_chunk_x INTEGER,
    p_min_chunk_z INTEGER,
    p_max_chunk_z INTEGER,
    p_state SMALLINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
    lot_id          TEXT,
    chunk_x_min     INTEGER,
    chunk_x_max     INTEGER,
    chunk_z_min     INTEGER,
    chunk_z_max     INTEGER,
    block_x_min     INTEGER,
    block_x_max     INTEGER,
    block_z_min     INTEGER,
    block_z_max     INTEGER,
    chunk_area      INTEGER,
    anchor_y        SMALLINT,
    is_owned        BOOLEAN,
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
ROWS 1000
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF p_world IS NULL OR btrim(p_world) = '' THEN
        RAISE EXCEPTION 'world cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_world !~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$' THEN
        RAISE EXCEPTION 'invalid world format' USING ERRCODE = '22023';
    END IF;
    IF p_min_chunk_x IS NULL OR p_max_chunk_x IS NULL
       OR p_min_chunk_z IS NULL OR p_max_chunk_z IS NULL THEN
        RAISE EXCEPTION 'viewport bounds cannot be null' USING ERRCODE = '22004';
    END IF;
    IF p_max_chunk_x < p_min_chunk_x OR p_max_chunk_z < p_min_chunk_z THEN
        RAISE EXCEPTION 'viewport max must be >= min' USING ERRCODE = '22023';
    END IF;
    -- Guard against int4 overflow on (p_max_chunk_* + 1) when building
    -- the int4range below. INT32_MAX = 2147483647.
    IF p_max_chunk_x >= 2147483647 OR p_max_chunk_z >= 2147483647 THEN
        RAISE EXCEPTION 'viewport max is too large' USING ERRCODE = '22023';
    END IF;
    IF (p_max_chunk_x::bigint - p_min_chunk_x::bigint + 1) > 4096
       OR (p_max_chunk_z::bigint - p_min_chunk_z::bigint + 1) > 4096 THEN
        RAISE EXCEPTION 'viewport too large (max 4096 chunks per axis)'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT l.lot_id,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
           l.block_x_min, l.block_x_max,
           l.block_z_min, l.block_z_max,
           l.chunk_area, l.anchor_y,
           (l.owner_user_id IS NOT NULL) AS is_owned,
           (l.owner_user_id IS NOT NULL AND l.owner_user_id = v_uid) AS is_owned_by_me,
           l.current_schematic_id, l.state,
           l.price_credits, l.price_khash
    FROM mc.lot l
    WHERE l.world = p_world
      AND l.chunk_x_range && int4range(p_min_chunk_x, p_max_chunk_x + 1, '[)')
      AND l.chunk_z_range && int4range(p_min_chunk_z, p_max_chunk_z + 1, '[)')
      AND (p_state IS NULL OR l.state = p_state)
    ORDER BY l.chunk_x_min, l.chunk_z_min, l.lot_id
    -- Cap at 2000: SQL handles more, but PostgREST JSON serialization
    -- and frontend rendering become the actual bottleneck past ~2k rows.
    -- Bulk exports run as service_role through service_list_lots.
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
END;
$$;

ALTER FUNCTION public.proxy_list_lots_in_viewport(TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
                                                  SMALLINT, INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_lots_in_viewport(TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
                                                          SMALLINT, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_lots_in_viewport(TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
                                                             SMALLINT, INTEGER)
    TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_list_lots_in_viewport(TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
                                                       SMALLINT, INTEGER) IS
    'Viewport-bounded lot list for the dashboard map. Returns lots whose chunk range overlaps the (p_min_chunk_x..p_max_chunk_x, p_min_chunk_z..p_max_chunk_z) bbox in p_world. Fed by the GIST EXCLUDE index already created on (world, chunk_x_range, chunk_z_range). Owner UUIDs replaced with is_owned + is_owned_by_me.';


NOTIFY pgrst, 'reload schema';


-- migrate:down

-- Compatibility drops for any earlier in-flight signature on a dev DB
-- where the first published migration shipped without p_worker_id.
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_failed(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_applied(TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_failed(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_applied(TEXT);

DROP FUNCTION IF EXISTS public.proxy_service_repair_orphan_transitional(BOOLEAN);
DROP FUNCTION IF EXISTS public.proxy_service_release_user_lots(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.proxy_service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.proxy_service_retry_failed_build(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.proxy_service_requeue_stale_claims(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.proxy_service_requeue_stale_claims(INTEGER);
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_failed(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_applied(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_service_claim_pending_builds(TEXT, INTEGER);

-- Pre-idempotency-key signatures (covered for dev DBs that briefly held
-- the older single-arg shapes).
DROP FUNCTION IF EXISTS public.proxy_queue_demolish_lot(TEXT);
DROP FUNCTION IF EXISTS public.proxy_queue_build_on_lot(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_purchase_lot(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_queue_demolish_lot(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_queue_build_on_lot(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.proxy_purchase_lot(TEXT);

DROP FUNCTION IF EXISTS public.proxy_queue_demolish_lot(TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_queue_build_on_lot(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_purchase_lot(TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_list_lots_in_viewport(TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
                                                            SMALLINT, INTEGER);
DROP FUNCTION IF EXISTS public.proxy_list_lots_public(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                      TEXT, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_my_transitional_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_my_active_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_vacant_lots(TEXT, INTEGER, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_schematics(TEXT);
DROP FUNCTION IF EXISTS public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                               TEXT, INTEGER, INTEGER, TEXT);

DROP FUNCTION IF EXISTS mc.proxy_queue_demolish_lot(TEXT, UUID);
DROP FUNCTION IF EXISTS mc.proxy_queue_build_on_lot(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS mc.proxy_purchase_lot(TEXT, UUID);
DROP FUNCTION IF EXISTS mc.proxy_list_schematics(TEXT);
DROP FUNCTION IF EXISTS mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                           TEXT, INTEGER, INTEGER, TEXT);

DROP FUNCTION IF EXISTS mc.service_queue_demolish_lot(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_queue_build_on_lot(TEXT, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_purchase_lot(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS mc.service_mark_build_failed(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_applied(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.service_repair_orphan_transitional(BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_release_user_lots(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_list_failed_builds(INTEGER, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS mc.service_retry_failed_build(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_requeue_stale_claims(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc.service_requeue_stale_claims(INTEGER);
DROP FUNCTION IF EXISTS mc.service_claim_pending_builds(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.proxy_service_get_lot(TEXT);
DROP FUNCTION IF EXISTS mc.service_get_lot(TEXT);
DROP FUNCTION IF EXISTS mc.service_list_schematics(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc.service_list_lots(TEXT, SMALLINT, UUID, INTEGER, INTEGER,
                                             TEXT, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS mc._user_account_id(UUID);
DROP FUNCTION IF EXISTS mc._derive_idem_key(UUID, TEXT);

DROP TABLE IF EXISTS mc.lot_build_log;
DROP TABLE IF EXISTS mc.lot_purchase;

DROP TRIGGER IF EXISTS trg_mc_lot_updated_at ON mc.lot;
DROP TABLE IF EXISTS mc.lot;
DROP FUNCTION IF EXISTS mc.trg_lot_updated_at();

DROP TABLE IF EXISTS mc.schematic;

DROP DOMAIN IF EXISTS mc.build_apply_state;
DROP DOMAIN IF EXISTS mc.build_action_kind;
DROP DOMAIN IF EXISTS mc.lot_state;

NOTIFY pgrst, 'reload schema';
