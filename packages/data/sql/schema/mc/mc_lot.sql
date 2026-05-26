-- ============================================================
-- MC LOT SYSTEM — Digital real-estate for the survival backend.
--
-- This file mirrors the contents of the dbmate migration
-- 20260526223407_mc_lot_system.sql and exists as the canonical
-- source of truth for the lot/schematic schema. Update both when
-- changing the schema.
--
-- Tables:
--   mc.schematic        — build catalog (id, dims, price, resource path)
--   mc.lot              — parcel registry (chunk_x_range, chunk_z_range,
--                         owner, current_schematic_id, state, price)
--   mc.lot_purchase     — append-only ownership ledger
--   mc.lot_build_log    — append-only build/demolish audit
--
-- Constraints worth highlighting:
--   - mc.lot uses a GIST EXCLUDE constraint on
--     (world =, chunk_x_range &&, chunk_z_range &&) so two lots in the
--     same world cannot occupy any overlapping chunk.
--   - chunk_x_range / chunk_z_range are stored as half-open int4range
--     pairs so a 1x1 lot at chunk 5 is [5, 6), and a 13x7 castle
--     bounding box is [20, 33) x [-10, -3).
--   - lot.state is a smallint enum:
--         0 = vacant, 1 = owned, 2 = built,
--         3 = under_build, 4 = demolishing
--
-- RPC layering:
--   mc.service_*  — service_role only, used by MC mod + admin tooling.
--   mc.proxy_*    — authenticated callers; uses auth.uid() for ownership.
--   public.proxy_*— PostgREST wrapper because the mc schema is private.
--
-- Money flow rides on wallet.service_debit against the user-kind
-- account; mc.lot_purchase and mc.lot_build_log keep their own audit
-- rows so we can reconstruct ownership / build history without
-- joining through wallet.ledger.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;


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
    CONSTRAINT mc_schematic_category_chk
        CHECK (category IN ('house', 'castle', 'tower', 'farm', 'shop', 'utility', 'monument'))
);

CREATE INDEX IF NOT EXISTS idx_mc_schematic_category_enabled ON mc.schematic (category, enabled);
CREATE INDEX IF NOT EXISTS idx_mc_schematic_tier ON mc.schematic (tier);


-- ========== TABLE: mc.lot ==========

CREATE TABLE IF NOT EXISTS mc.lot (
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

CREATE INDEX IF NOT EXISTS idx_mc_lot_owner ON mc.lot (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_lot_state ON mc.lot (state);
CREATE INDEX IF NOT EXISTS idx_mc_lot_world_state ON mc.lot (world, state);


-- ========== TABLE: mc.lot_purchase ==========

CREATE TABLE IF NOT EXISTS mc.lot_purchase (
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

CREATE INDEX IF NOT EXISTS idx_mc_lot_purchase_lot   ON mc.lot_purchase (lot_id);
CREATE INDEX IF NOT EXISTS idx_mc_lot_purchase_buyer ON mc.lot_purchase (buyer_user_id);


-- ========== TABLE: mc.lot_build_log ==========

CREATE TABLE IF NOT EXISTS mc.lot_build_log (
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

CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_lot     ON mc.lot_build_log (lot_id);
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_actor   ON mc.lot_build_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_mc_lot_build_log_pending ON mc.lot_build_log (queued_at) WHERE apply_state = 0;


-- RPC bodies live in the migration file (20260526223407_mc_lot_system.sql).
-- This file documents the table layer; the functions are deployed via the
-- migration since they reference wallet.service_debit and auth.uid().
