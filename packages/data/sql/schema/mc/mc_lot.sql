-- ============================================================
-- MC LOT SYSTEM — Digital real-estate for the survival backend.
--
-- This file mirrors the dbmate migration
-- 20260526223407_mc_lot_system.sql and exists as the canonical
-- source of truth for the lot/schematic schema. Update both when
-- changing the schema.
--
-- Tables:
--   mc.schematic        — build catalog (id, dims, price, resource path)
--   mc.lot              — parcel registry (chunk_x_range, chunk_z_range,
--                         owner, current_schematic_id, state, price,
--                         generated chunk_width/depth/area)
--   mc.lot_purchase     — append-only ownership ledger (per-currency
--                         wallet ledger references; one-purchase-per-lot
--                         unique index)
--   mc.lot_build_log    — append-only build/demolish audit + concurrent
--                         work queue (apply_state 0/1/2/3 + claimed_at/by)
--
-- Concurrency:
--   - mc.service_claim_pending_builds uses FOR UPDATE SKIP LOCKED so
--     multiple MC workers can poll without taking the same job.
--   - uq_mc_lot_build_log_one_active_per_lot WHERE apply_state IN (0,3)
--     enforces "at most one outstanding job per lot" at the DB level.
--
-- Constraints worth highlighting:
--   - mc.lot has a GIST EXCLUDE on (world =, chunk_x_range &&,
--     chunk_z_range &&) so two lots in the same world cannot share
--     a chunk.
--   - resource_path is namespaced and path-traversal-safe.
--   - world ids must match '^[a-z0-9_.-]+:[a-z0-9_/.-]+$'.
--
-- RPC layering:
--   mc.service_*   — service_role only. MC mod + admin tooling.
--   mc.proxy_*     — internal layer called from the public wrappers.
--   public.proxy_* — PostgREST surface. authenticated callers.
--
-- Money flow rides on wallet.service_debit against the user-kind
-- account; mc.lot_purchase / mc.lot_build_log keep their own audit
-- rows. Dual-currency charges go through mc._derive_idem_key so the
-- credits and khash legs each have their own wallet idempotency slot.
-- ============================================================

-- btree_gist supplies the gist_text_ops opclass needed by the EXCLUDE
-- constraint on mc.lot. Left in the default schema; EXCLUDE opclass
-- lookup runs at CREATE TABLE time and uses live search_path.
-- pgcrypto sits in `extensions` (mc_schema_init); mc._derive_idem_key
-- calls extensions.digest explicitly.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
    CREATE DOMAIN mc.lot_state AS SMALLINT CHECK (VALUE BETWEEN 0 AND 4);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE DOMAIN mc.build_action_kind AS SMALLINT CHECK (VALUE IN (0, 1));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE DOMAIN mc.build_apply_state AS SMALLINT CHECK (VALUE BETWEEN 0 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ========== TABLE: mc.schematic ==========

CREATE TABLE IF NOT EXISTS mc.schematic (
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
    CONSTRAINT mc_schematic_resource_path_chk
        CHECK (resource_path !~ '(^/|\.\.)' AND
               resource_path ~ '^schematics/[A-Za-z0-9_./-]+\.(nbt|schem)$')
);

CREATE INDEX IF NOT EXISTS idx_mc_schematic_enabled_category_tier_name_cover
    ON mc.schematic (category, tier, name, schematic_id)
    INCLUDE (dims_x, dims_y, dims_z, price_credits, price_khash)
    WHERE enabled;


-- ========== TABLE: mc.lot ==========

CREATE TABLE IF NOT EXISTS mc.lot (
    lot_id          TEXT PRIMARY KEY,
    world           TEXT NOT NULL DEFAULT 'minecraft:overworld',
    chunk_x_range   int4range NOT NULL,
    chunk_z_range   int4range NOT NULL,
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
    block_x_min     INTEGER GENERATED ALWAYS AS (lower(chunk_x_range) * 16) STORED,
    block_x_max     INTEGER GENERATED ALWAYS AS (upper(chunk_x_range) * 16 - 1) STORED,
    block_z_min     INTEGER GENERATED ALWAYS AS (lower(chunk_z_range) * 16) STORED,
    block_z_max     INTEGER GENERATED ALWAYS AS (upper(chunk_z_range) * 16 - 1) STORED,
    anchor_y        SMALLINT NOT NULL,
    -- ON DELETE RESTRICT: owner_state_chk requires state>0 to carry a
    -- non-null owner, so SET NULL would induce CHECK violations on user
    -- deletion. Force the deletion path through an explicit release-lots
    -- RPC that resets state, owner, and schematic together.
    owner_user_id   UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    current_schematic_id TEXT REFERENCES mc.schematic(schematic_id),
    state           mc.lot_state NOT NULL DEFAULT 0,
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
    CONSTRAINT mc_lot_chunk_width_max_chk
        CHECK ((upper(chunk_x_range) - lower(chunk_x_range)) <= 512),
    CONSTRAINT mc_lot_chunk_depth_max_chk
        CHECK ((upper(chunk_z_range) - lower(chunk_z_range)) <= 512),
    CONSTRAINT mc_lot_chunk_area_max_chk
        CHECK ((upper(chunk_x_range) - lower(chunk_x_range))
             * (upper(chunk_z_range) - lower(chunk_z_range)) <= 262144),
    CONSTRAINT mc_lot_world_chk
        CHECK (world ~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$'),
    CONSTRAINT mc_lot_owner_state_chk CHECK (
        (state = 0 AND owner_user_id IS NULL)
        OR (state > 0 AND owner_user_id IS NOT NULL)
    ),
    CONSTRAINT mc_lot_built_has_schematic_chk CHECK (
        CASE state
            WHEN 0 THEN current_schematic_id IS NULL
            WHEN 1 THEN current_schematic_id IS NULL
            WHEN 2 THEN current_schematic_id IS NOT NULL
            WHEN 4 THEN current_schematic_id IS NOT NULL
            ELSE TRUE
        END
    ),
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

CREATE INDEX IF NOT EXISTS idx_mc_lot_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX IF NOT EXISTS idx_mc_lot_world_state_chunk_cursor
    ON mc.lot (world, state, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX IF NOT EXISTS idx_mc_lot_owner_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_lot_vacant_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (chunk_x_max, chunk_z_max, chunk_area, anchor_y,
             price_credits, price_khash)
    WHERE state = 0;
CREATE INDEX IF NOT EXISTS idx_mc_lot_owner_active_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (state, current_schematic_id, chunk_x_max, chunk_z_max,
             chunk_area, anchor_y, price_credits, price_khash)
    WHERE owner_user_id IS NOT NULL AND state IN (1, 2);
CREATE INDEX IF NOT EXISTS idx_mc_lot_owner_transitional_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (state, current_schematic_id, chunk_x_max, chunk_z_max,
             chunk_area, anchor_y, price_credits, price_khash)
    WHERE owner_user_id IS NOT NULL AND state IN (3, 4);
CREATE INDEX IF NOT EXISTS idx_mc_lot_current_schematic
    ON mc.lot (current_schematic_id) WHERE current_schematic_id IS NOT NULL;


-- ========== TABLE: mc.lot_purchase ==========

CREATE TABLE IF NOT EXISTS mc.lot_purchase (
    purchase_id     TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    buyer_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_purchase_price_chk
        CHECK (price_credits >= 0 AND price_khash >= 0),
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

CREATE INDEX IF NOT EXISTS idx_mc_lot_purchase_buyer_created
    ON mc.lot_purchase (buyer_user_id, created_at DESC, purchase_id DESC)
    INCLUDE (lot_id, price_credits, price_khash);
-- Unique on (lot_id) covers both the phase-0 'one purchase per lot'
-- invariant and the lookup-by-lot path; no separate non-unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mc_lot_purchase_one_per_lot
    ON mc.lot_purchase (lot_id);


-- ========== TABLE: mc.lot_build_log ==========

CREATE TABLE IF NOT EXISTS mc.lot_build_log (
    build_id        TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    lot_id          TEXT NOT NULL REFERENCES mc.lot(lot_id) ON DELETE CASCADE,
    actor_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_kind     mc.build_action_kind NOT NULL,
    schematic_id    TEXT REFERENCES mc.schematic(schematic_id),
    lot_state_before    mc.lot_state,
    schematic_id_before TEXT REFERENCES mc.schematic(schematic_id),
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    apply_state     mc.build_apply_state NOT NULL DEFAULT 0,
    apply_error     TEXT,
    claimed_at      TIMESTAMPTZ,
    claimed_by      TEXT,
    queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at      TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    -- NOTE: 'failed_at' replaces the prior use of applied_at for failure
    -- timestamps; mark_build_failed writes failed_at and NULLs applied_at.

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
    CONSTRAINT mc_lot_build_log_demolish_free_chk CHECK (
        action_kind <> 1
        OR (schematic_id IS NULL
            AND price_credits = 0
            AND price_khash = 0
            AND wallet_credits_ledger_id IS NULL
            AND wallet_khash_ledger_id IS NULL)
    ),
    CONSTRAINT mc_lot_build_log_snapshot_state_chk CHECK (
        lot_state_before IS NULL OR lot_state_before IN (1, 2)
    ),
    CONSTRAINT mc_lot_build_log_demolish_snapshot_chk CHECK (
        action_kind <> 1
        OR lot_state_before IS NULL
        OR lot_state_before = 2
    ),
    CONSTRAINT mc_lot_build_log_claimed_consistency_chk
        CHECK (
            (apply_state = 3 AND claimed_at IS NOT NULL AND claimed_by IS NOT NULL)
            OR (apply_state <> 3 AND claimed_at IS NULL AND claimed_by IS NULL)
        ),
    CONSTRAINT mc_lot_build_log_idem_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_lot_queued
    ON mc.lot_build_log (lot_id, queued_at DESC, build_id DESC);
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_actor_queued
    ON mc.lot_build_log (actor_user_id, queued_at DESC, build_id DESC)
    INCLUDE (lot_id, action_kind, schematic_id, apply_state,
             failed_at, applied_at, attempt_count);
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_pending_claim
    ON mc.lot_build_log (queued_at, build_id)
    INCLUDE (lot_id, actor_user_id, action_kind, schematic_id)
    WHERE apply_state = 0 AND attempt_count < 5;
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_claimed_stale
    ON mc.lot_build_log (claimed_at, build_id)
    WHERE apply_state = 3 AND claimed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_failed_recent
    ON mc.lot_build_log (failed_at DESC, build_id DESC)
    WHERE apply_state = 2;
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_schematic
    ON mc.lot_build_log (schematic_id) WHERE schematic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mc_lot_build_log_one_active_per_lot
    ON mc.lot_build_log (lot_id) WHERE apply_state IN (0, 3);

ALTER TABLE mc.lot_build_log SET (
    fillfactor = 80,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_threshold = 500
);

ALTER TABLE mc.lot SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 500,
    autovacuum_analyze_threshold = 250
);

CREATE STATISTICS IF NOT EXISTS st_mc_lot_world_state
    ON world, state
    FROM mc.lot;
CREATE STATISTICS IF NOT EXISTS st_mc_lot_owner_state
    ON owner_user_id, state
    FROM mc.lot;
CREATE STATISTICS IF NOT EXISTS st_mc_build_log_state_attempt
    ON apply_state, attempt_count
    FROM mc.lot_build_log;


COMMENT ON COLUMN mc.lot_build_log.action_kind IS '0=build, 1=demolish';
COMMENT ON COLUMN mc.lot_build_log.apply_state IS
    '0=queued, 1=applied, 2=failed, 3=claimed (worker holding the row)';


-- RPC bodies live in the migration file (20260526223407_mc_lot_system.sql).
-- This file documents the table layer; the functions are deployed via the
-- migration since they reference wallet.service_debit and auth.uid().
