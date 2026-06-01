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

-- btree_gist supplies the gist_text_ops opclass needed by the
-- (world WITH =) leg of the EXCLUDE constraint on mc.lot. Left in the
-- default schema (rather than `extensions`) because EXCLUDE opclass
-- resolution uses the live search_path at CREATE TABLE time, and pinning
-- the extension to `extensions` would force every consumer to extend its
-- search_path. pgcrypto sits in extensions because it's only called via
-- explicit extensions.digest(...) — different concern.
CREATE EXTENSION IF NOT EXISTS btree_gist;

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
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
    -- pgcrypto lives in the extensions schema on Supabase/kilobase; the
    -- mc_pgcrypto_qualify migration already established this convention
    -- and granted USAGE on extensions to service_role. SHA-256 truncated
    -- to 128 bits gives a UUID-sized digest with no realistic collision
    -- surface even though the use is non-adversarial.
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
    -- Reject path-traversal + force schematics into the mod jar's
    -- schematics/ dir. Loader on the Java side concats this onto a class
    -- loader resource path, so anything escaping the dir is a footgun.
    CONSTRAINT mc_schematic_resource_path_chk
        CHECK (resource_path !~ '(^/|\.\.)' AND
               resource_path ~ '^schematics/[A-Za-z0-9_./-]+\.(nbt|schem)$')
);

-- Partial index lines up with proxy_list_schematics' WHERE enabled +
-- ORDER BY category, tier, name path. INCLUDE columns let the planner
-- satisfy the catalog listing without touching the heap once the
-- visibility map is warm.
CREATE INDEX idx_mc_schematic_enabled_category_tier_name_cover
    ON mc.schematic (category, tier, name, schematic_id)
    INCLUDE (dims_x, dims_y, dims_z, price_credits, price_khash)
    WHERE enabled;

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
    -- Stored generated columns so chunk-count guards in RPCs, listing
    -- sort orders, and dashboard map queries don't recompute on every
    -- read. *_min / *_max are inclusive (i.e. -1 from the half-open
    -- upper bound) so indexes and queries are in the same coordinate
    -- system the dashboard renders in.
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
    anchor_y        SMALLINT NOT NULL,
    owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    current_schematic_id TEXT REFERENCES mc.schematic(schematic_id),
    -- 0 = vacant, 1 = owned, 2 = built, 3 = under_build, 4 = demolishing
    state           SMALLINT NOT NULL DEFAULT 0,
    price_credits   BIGINT NOT NULL DEFAULT 0,
    price_khash     BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_id_chk         CHECK (lot_id ~ '^[A-Za-z0-9:_-]{3,96}$'),
    CONSTRAINT mc_lot_state_chk      CHECK (state BETWEEN 0 AND 4),
    CONSTRAINT mc_lot_anchor_y_chk   CHECK (anchor_y BETWEEN -64 AND 319),
    CONSTRAINT mc_lot_price_chk      CHECK (price_credits >= 0 AND price_khash >= 0),
    CONSTRAINT mc_lot_x_range_chk    CHECK (NOT isempty(chunk_x_range)
                                             AND lower_inc(chunk_x_range)
                                             AND NOT upper_inc(chunk_x_range)),
    CONSTRAINT mc_lot_z_range_chk    CHECK (NOT isempty(chunk_z_range)
                                             AND lower_inc(chunk_z_range)
                                             AND NOT upper_inc(chunk_z_range)),
    -- Explicit finite-bounds guard so the generated chunk_area columns
    -- and the GIST EXCLUDE never see unbounded ranges. Belt-and-suspenders
    -- with the isempty + bound-inclusion checks above.
    CONSTRAINT mc_lot_x_range_finite_chk
        CHECK (lower(chunk_x_range) IS NOT NULL AND upper(chunk_x_range) IS NOT NULL),
    CONSTRAINT mc_lot_z_range_finite_chk
        CHECK (lower(chunk_z_range) IS NOT NULL AND upper(chunk_z_range) IS NOT NULL),
    -- Vanilla dim ids look like 'minecraft:overworld' or
    -- 'kbve:survival_ext'. Enforce the namespaced format to keep typos and
    -- arbitrary text from sneaking into the world column.
    CONSTRAINT mc_lot_world_chk
        CHECK (world ~ '^[a-z0-9_.-]+:[a-z0-9_/.-]+$'),
    CONSTRAINT mc_lot_owner_state_chk CHECK (
        (state = 0 AND owner_user_id IS NULL)
        OR (state > 0 AND owner_user_id IS NOT NULL)
    ),
    -- Schematic presence per state:
    --   0 vacant       — no schematic (and no owner; see vacant_clean_chk).
    --   1 owned        — no schematic (clean lot, no build yet).
    --   2 built        — schematic NOT NULL.
    --   3 under_build  — schematic free (rebuild flow may carry the
    --                    prior schematic; first build starts NULL).
    --   4 demolishing  — schematic NOT NULL (target row of the clear).
    CONSTRAINT mc_lot_built_has_schematic_chk CHECK (
        CASE state
            WHEN 0 THEN current_schematic_id IS NULL
            WHEN 1 THEN current_schematic_id IS NULL
            WHEN 2 THEN current_schematic_id IS NOT NULL
            WHEN 4 THEN current_schematic_id IS NOT NULL
            ELSE TRUE  -- state=3 unconstrained
        END
    ),
    -- Vacant lots have no owner. state=0 + owner combos slipped through
    -- the broader owner_state_chk because that check allowed state>0
    -- with non-null owner; this is the stricter inverse for state=0.
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

-- Now that we have stored chunk_x_min / chunk_z_min generated columns,
-- prefer them over expression indexes on lower(chunk_*_range) so plans
-- pick the index directly without rewriting the predicate. The trailing
-- lot_id makes every ordering deterministic and unlocks keyset
-- pagination in a later migration without touching these indexes.
CREATE INDEX idx_mc_lot_owner ON mc.lot (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX idx_mc_lot_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX idx_mc_lot_world_state_chunk_cursor
    ON mc.lot (world, state, chunk_x_min, chunk_z_min, lot_id);
CREATE INDEX idx_mc_lot_owner_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    WHERE owner_user_id IS NOT NULL;
-- Hottest dashboard read path: "what vacant lots can I buy in <world>?"
-- Partial + INCLUDE so the marketplace map renders without heap hops.
CREATE INDEX idx_mc_lot_vacant_world_chunk_cursor
    ON mc.lot (world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (chunk_x_max, chunk_z_max, chunk_area, anchor_y,
             price_credits, price_khash)
    WHERE state = 0;
-- "My lots" page is dominated by owned + built rows; vacant/under-build
-- are rare. INCLUDE the columns the dashboard renders (including
-- prices, which surface as "sell-for" hints on owned-but-not-built
-- rows) so the index can answer index-only.
CREATE INDEX idx_mc_lot_owner_active_world_chunk_cursor
    ON mc.lot (owner_user_id, world, chunk_x_min, chunk_z_min, lot_id)
    INCLUDE (state, current_schematic_id, chunk_x_max, chunk_z_max,
             chunk_area, anchor_y, price_credits, price_khash)
    WHERE owner_user_id IS NOT NULL AND state IN (1, 2);

ALTER TABLE mc.lot ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot FORCE ROW LEVEL SECURITY;

-- Trigger touches updated_at only when one of the mutable business
-- columns changed; cuts write amplification on no-op UPDATEs and avoids
-- a whole-row IS DISTINCT FROM comparison that would touch every
-- generated chunk_* column too. NOW() (transaction-stable) is the right
-- clock for an audit-style column.
CREATE OR REPLACE FUNCTION mc.trg_lot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.owner_user_id        IS DISTINCT FROM OLD.owner_user_id
       OR NEW.current_schematic_id IS DISTINCT FROM OLD.current_schematic_id
       OR NEW.state                IS DISTINCT FROM OLD.state
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
    -- NOTE: deliberately NOT declared as a FOREIGN KEY to wallet.ledger.
    -- mc and wallet are owned by different teams' migration timelines
    -- and wallet.ledger uses ON DELETE NO ACTION semantics that would
    -- block valid retention/archival flows over there. The reverse
    -- direction (wallet.ledger.ref_type = 'mc.lot' / .ref_id) is how the
    -- audit trail is reconstructed; back-reference here is informational.
    wallet_credits_ledger_id BIGINT,
    wallet_khash_ledger_id   BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mc_lot_purchase_price_chk
        CHECK (price_credits >= 0 AND price_khash >= 0),
    -- Per-currency ledger reference must be present iff that currency
    -- was actually charged. Prevents dirty audit rows that would force
    -- defensive null-checking downstream.
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

-- Dashboard "my purchase history" sorts newest first; composite avoids
-- a sort step.
CREATE INDEX idx_mc_lot_purchase_buyer_created
    ON mc.lot_purchase (buyer_user_id, created_at DESC, purchase_id DESC);

-- Phase-0 invariant: each lot can be bought exactly once. Resale comes
-- with an explicit ownership-epoch column in a follow-up migration.
-- This unique index also covers the lookup-by-lot path; no separate
-- non-unique idx_mc_lot_purchase_lot needed (would just be write
-- amplification).
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
    -- Demolish is always free in phase 0: action_kind=1 cannot carry a
    -- schematic, price, or ledger ref. Locking this in at the table
    -- level so a future RPC change can't silently break the invariant.
    CONSTRAINT mc_lot_build_log_demolish_free_chk CHECK (
        action_kind <> 1
        OR (schematic_id IS NULL
            AND price_credits = 0
            AND price_khash = 0
            AND wallet_credits_ledger_id IS NULL
            AND wallet_khash_ledger_id IS NULL)
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

CREATE INDEX idx_mc_lot_build_log_lot     ON mc.lot_build_log (lot_id);
-- User history: newest-first composite drops the sort step.
CREATE INDEX idx_mc_lot_build_log_actor_queued
    ON mc.lot_build_log (actor_user_id, queued_at DESC, build_id DESC);
-- Queue + worker claim path: include build_id so the claim ORDER BY
-- (queued_at, build_id) is satisfied by index walk alone.
CREATE INDEX idx_mc_lot_build_log_pending_claim
    ON mc.lot_build_log (queued_at, build_id)
    WHERE apply_state = 0;
-- Stuck-job reclaim. build_id keeps janitor scans deterministic and
-- supports a LIMIT-batched requeue.
CREATE INDEX idx_mc_lot_build_log_claimed_stale
    ON mc.lot_build_log (claimed_at, build_id)
    WHERE apply_state = 3;
-- Reverse FK lookup: "which build jobs referenced schematic X?"
CREATE INDEX idx_mc_lot_build_log_schematic
    ON mc.lot_build_log (schematic_id)
    WHERE schematic_id IS NOT NULL;

-- At most one outstanding job (queued OR claimed) per lot. Stronger than
-- the lot.state guard because it survives RPC bugs / direct admin writes.
CREATE UNIQUE INDEX uq_mc_lot_build_log_one_active_per_lot
    ON mc.lot_build_log (lot_id)
    WHERE apply_state IN (0, 3);

-- Reverse FK lookup for mc.lot.current_schematic_id.
CREATE INDEX idx_mc_lot_current_schematic
    ON mc.lot (current_schematic_id)
    WHERE current_schematic_id IS NOT NULL;

-- Queue table sees state-update churn (queued -> claimed -> applied);
-- HOT updates rely on free space inside the page. fillfactor 80 leaves
-- room for in-page row replacement so we avoid index bloat from page
-- splits. The audit/append-mostly tables stay at the default 100.
ALTER TABLE mc.lot_build_log SET (
    fillfactor = 80,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_threshold = 500
);

-- mc.lot churns too: state cycles 0 -> 1 -> 3 -> 2 -> 4 -> 1, and the
-- updated_at trigger writes on every meaningful column change. Less
-- aggressive than lot_build_log but tighter than the catalog default.
ALTER TABLE mc.lot SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 500,
    autovacuum_analyze_threshold = 250
);

ALTER TABLE mc.lot_build_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc.lot_build_log FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE mc.lot_build_log IS
    'Append-only audit of build/demolish events and concurrent work queue. action_kind: 0=build, 1=demolish. apply_state: 0=queued, 1=applied, 2=failed, 3=claimed.';
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
    -- wallet.account has a partial unique index (kind='user', user_id)
    -- so at most one row matches; LIMIT 1 was previously defensive but
    -- masked corruption. Plain scalar subquery surfaces duplicates as a
    -- "more than one row" runtime error instead.
    SELECT a.id
    FROM wallet.account a
    WHERE a.kind = 'user' AND a.user_id = p_user_id;
$$;

ALTER FUNCTION mc._user_account_id(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION mc._user_account_id(UUID) FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- mc.service_list_lots
-- ===========================================================================
-- Cursor pagination via four trailing p_after_* args. Default-NULL keeps
-- the legacy LIMIT/OFFSET shape for callers that don't pass a cursor;
-- callers that DO pass (world, chunk_x_min, chunk_z_min, lot_id) of the
-- last row from the prior page get a clean index walk via
-- idx_mc_lot_world_chunk_cursor.
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

    -- Pick + claim split into two CTEs:
    --   picked  — SKIP LOCKED scan of queued rows ordered for fairness;
    --             cap p_limit at [0, 256] so the dry-poll case (p_limit=0)
    --             is legitimate.
    --   claimed — UPDATE ... FROM picked is the more index-friendly
    --             shape than the older WHERE build_id IN (...) form.
    -- UPDATE ... RETURNING has no ordering guarantee, so the final SELECT
    -- re-sorts the batch so workers process in queued order.
    RETURN QUERY
    WITH picked AS (
        SELECT build_id
          FROM mc.lot_build_log
         WHERE apply_state = 0
         ORDER BY queued_at, build_id
         LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 32), 256))
         FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE mc.lot_build_log b
           SET apply_state = 3,
               claimed_at  = clock_timestamp(),
               claimed_by  = p_worker_id
          FROM picked
         WHERE b.build_id = picked.build_id
        RETURNING b.build_id, b.lot_id, b.actor_user_id,
                  b.action_kind, b.schematic_id, b.queued_at
    )
    SELECT *
      FROM claimed
     ORDER BY queued_at, build_id;
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
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    -- Batch + SKIP LOCKED so a janitor run never blocks on rows another
    -- requeue is touching, and the write surface stays bounded per call.
    WITH picked AS (
        SELECT build_id
          FROM mc.lot_build_log
         WHERE apply_state = 3
           AND claimed_at IS NOT NULL
           -- Clamp to [1s, 1d] so an accidental huge input can't push the
           -- threshold so far back it matches nothing (or wraps planner
           -- estimates).
           AND claimed_at < clock_timestamp()
                          - make_interval(secs =>
                              LEAST(GREATEST(1, COALESCE(p_older_than_seconds, 300)), 86400))
         ORDER BY claimed_at, build_id
         LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 128), 512))
         FOR UPDATE SKIP LOCKED
    ),
    stale AS (
        UPDATE mc.lot_build_log b
           SET apply_state = 0,
               claimed_at = NULL,
               claimed_by = NULL
          FROM picked
         WHERE b.build_id = picked.build_id
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER FROM stale;
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

    -- Only the worker that holds the claim may ACK it. Prevents a stale
    -- or wrong worker from finalizing another worker's job.
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
    v_lot_id   TEXT;
    v_rowcount INTEGER;
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
           -- Always carry SOME diagnostic string so operators reading
           -- the row aren't left guessing on null/blank input.
           apply_error = left(
               COALESCE(NULLIF(btrim(p_error), ''), 'worker reported failure'),
               2048),
           applied_at = clock_timestamp(),
           claimed_at = NULL,
           claimed_by = NULL
     WHERE build_id = p_build_id
       AND apply_state = 3
       AND claimed_by = p_worker_id
    RETURNING lot_id INTO v_lot_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    UPDATE mc.lot
       SET state = CASE WHEN current_schematic_id IS NULL THEN 1 ELSE 2 END
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

    -- Serialize concurrent retries on the same idempotency_key. Without
    -- the lock two identical requests can both miss the existing-key
    -- check, then one inserts cleanly and the other tries the lot-state
    -- path and surfaces a confusing "lot not vacant" error instead of
    -- collapsing to the original purchase row.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

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

    -- Serialize concurrent retries on the same idempotency_key. See the
    -- matching note in service_purchase_lot.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

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
           chunk_width * 16,
           chunk_depth * 16
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

    -- The partial uq_mc_lot_build_log_one_active_per_lot index turns a
    -- concurrent second queue attempt into a unique_violation. Translate
    -- to a clearer domain error.
    BEGIN
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
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'lot % already has an active queued/claimed job', p_lot_id
            USING ERRCODE = '23505';
    END;

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
    IF p_lot_id IS NULL OR btrim(p_lot_id) = '' THEN
        RAISE EXCEPTION 'lot_id cannot be empty' USING ERRCODE = '22004';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key cannot be null' USING ERRCODE = '22004';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

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

    BEGIN
        INSERT INTO mc.lot_build_log (
            lot_id, actor_user_id, action_kind, schematic_id, idempotency_key
        ) VALUES (
            p_lot_id, p_user_id, 1, NULL, p_idempotency_key
        )
        RETURNING build_id INTO v_build_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'lot % already has an active queued/claimed job', p_lot_id
            USING ERRCODE = '23505';
    END;

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
    -- LANGUAGE sql so the planner sees the body directly instead of going
    -- through a plpgsql RETURN QUERY layer. auth.uid() is called once via
    -- the CROSS JOIN so the equality survives function inlining cleanly.
    -- Keyset pagination via trailing p_after_* args: when supplied, the
    -- (world, chunk_x_min, chunk_z_min, lot_id) tuple comparison walks
    -- idx_mc_lot_world_chunk_cursor directly.
    WITH me AS (SELECT auth.uid() AS uid)
    SELECT l.lot_id,
           l.world,
           l.chunk_x_min,
           l.chunk_x_max,
           l.chunk_z_min,
           l.chunk_z_max,
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
    SELECT * FROM mc.proxy_list_lots(
        p_world, p_state, p_only_mine, p_limit, p_offset,
        p_after_world, p_after_chunk_x, p_after_chunk_z, p_after_lot_id);
$$;

ALTER FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                      TEXT, INTEGER, INTEGER, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                              TEXT, INTEGER, INTEGER, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_list_lots(TEXT, SMALLINT, BOOLEAN, INTEGER, INTEGER,
                                                 TEXT, INTEGER, INTEGER, TEXT)
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
    queued_at       TIMESTAMPTZ
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
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
COST 100
AS $$
    SELECT mc.service_requeue_stale_claims(p_older_than_seconds, p_limit);
$$;

ALTER FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER)
    TO service_role;
COMMENT ON FUNCTION public.proxy_service_requeue_stale_claims(INTEGER, INTEGER) IS
    'Service-role-only PostgREST bridge for janitor recovery of orphaned worker claims older than p_older_than_seconds. Batched + SKIP LOCKED with p_limit (max 512). Returns the count of jobs requeued in this call.';


-- ===========================================================================
-- HOT-PATH LIST RPCs — dedicated wrappers for the two most common reads
-- ===========================================================================
-- The generic list_lots() uses optional OR predicates, which can make the
-- planner pick the broad cursor index instead of the narrower partial
-- indexes (idx_mc_lot_vacant_*, idx_mc_lot_owner_active_*). These two
-- wrappers hard-code the state predicate so the partial indexes are the
-- only viable plan. Same cursor convention (chunk_x, chunk_z, lot_id),
-- but world is fixed by p_world so it isn't part of the cursor tuple.

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
    -- Cursor all-or-none. world is already pinned via p_world so it
    -- doesn't enter the cursor tuple; the three remaining cursor args
    -- must agree on null-ness.
    IF (p_after_lot_id IS NULL) <> (p_after_chunk_x IS NULL OR p_after_chunk_z IS NULL)
       OR (p_after_lot_id IS NOT NULL
           AND (p_after_chunk_x IS NULL OR p_after_chunk_z IS NULL)) THEN
        RAISE EXCEPTION 'cursor must include after_chunk_x, after_chunk_z, and after_lot_id together'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT l.lot_id,
           l.chunk_x_min, l.chunk_x_max,
           l.chunk_z_min, l.chunk_z_max,
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
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 256), 1024));
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
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 256), 1024));
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


NOTIFY pgrst, 'reload schema';


-- migrate:down

-- Compatibility drops for any earlier in-flight signature on a dev DB
-- where the first published migration shipped without p_worker_id.
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_failed(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.proxy_service_mark_build_applied(TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_failed(TEXT, TEXT);
DROP FUNCTION IF EXISTS mc.service_mark_build_applied(TEXT);

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
DROP FUNCTION IF EXISTS mc.service_requeue_stale_claims(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS mc.service_requeue_stale_claims(INTEGER);
DROP FUNCTION IF EXISTS mc.service_claim_pending_builds(TEXT, INTEGER);
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

NOTIFY pgrst, 'reload schema';
