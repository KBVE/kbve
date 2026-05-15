-- migrate:up

-- Phase 1 of the marketplace bootstrap: tables, enums, indexes, RLS, and
-- a seeded KBVE Treasury account. Service-layer RPCs (create_listing,
-- place_bid, settle, expire-sweep cron) land in a follow-up migration.
--
-- Currency:
--   Marketplace transactions are KHASH-ONLY for v1. The currency column
--   exists with a CHECK constraint so a future migration can drop the
--   CHECK to allow credits without re-shaping the table.
--
-- Pricing:
--   A listing can have a buy_now_price, a min_bid (auction floor), or
--   both. At least one of the two is required. When both are present,
--   buy_now_price must be >= min_bid.
--
-- Duration:
--   Listings live 1h–30d. Caller passes expires_at; CHECK constraints
--   enforce the window. settle/expire sweeps in Phase 2 flip status and
--   settled_at when the deadline lapses or a buy-now / auction win
--   resolves.
--
-- Item representation:
--   item_ref is JSONB; the shape is owned by the mc service (game item
--   id, qty, instance hash, etc.). The wallet trusts that exactly one
--   real-world item is escrowed per active listing; mc locks the item
--   in its own inventory schema. Decoupling on JSONB lets the mc shape
--   evolve without breaking wallet migrations.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE wallet.listing_status AS ENUM (
    'active',     -- listing live, accepting bids / buy-now
    'sold',       -- buy-now or auction win settled to buyer
    'cancelled',  -- seller cancelled before settlement
    'expired'     -- deadline passed with no buyer / no bids
);

CREATE TYPE wallet.bid_status AS ENUM (
    'active',     -- bid is current high bid; funds escrowed
    'outbid',     -- a higher bid arrived; funds refunded
    'won',        -- listing settled; bidder is winner
    'refunded',   -- listing cancelled or expired with this as high bid
    'cancelled'   -- bidder withdrew (not used in v1; reserved for future)
);

-- ============================================================================
-- TABLE: wallet.listing
-- ============================================================================

CREATE TABLE wallet.listing (
    id                  BIGSERIAL PRIMARY KEY,
    seller_account      UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    item_ref            JSONB NOT NULL,
    -- Stable per-item instance id extracted from item_ref. NULL if the
    -- mc service omits it (e.g. legacy listings); the partial unique
    -- index below skips those rows. Prevents the same physical item
    -- from appearing in two active listings.
    item_instance_id    TEXT GENERATED ALWAYS AS (item_ref->>'instance_id') STORED,
    currency            wallet.currency_kind NOT NULL DEFAULT 'khash',
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    current_bid_account UUID REFERENCES wallet.account(id) ON DELETE NO ACTION,
    -- current_bid_id ties the denormalized current_bid + current_bid_account
    -- to the real wallet.bid row. Phase 2 place_bid keeps the three in
    -- lockstep; the CHECK below enforces all-or-none.
    current_bid_id      BIGINT,
    -- buyer_account is set on settlement (sold). Decoupled from
    -- current_bid_account so buy-now purchasers can be recorded
    -- without faking a bid row.
    buyer_account       UUID REFERENCES wallet.account(id) ON DELETE NO ACTION,
    status              wallet.listing_status NOT NULL DEFAULT 'active',
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    settled_at          TIMESTAMPTZ,
    idempotency_key     UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    -- v1 is khash-only. Drop this CHECK in a future migration to allow
    -- credits.
    CONSTRAINT listing_khash_only_chk CHECK (currency = 'khash'),

    -- item_ref must be a non-empty JSON object.
    CONSTRAINT listing_item_ref_shape_chk CHECK (
        jsonb_typeof(item_ref) = 'object' AND item_ref <> '{}'::jsonb
    ),

    -- Pricing invariants.
    CONSTRAINT listing_has_price_chk CHECK (
        buy_now_price IS NOT NULL OR min_bid IS NOT NULL
    ),
    CONSTRAINT listing_buy_now_pos_chk CHECK (
        buy_now_price IS NULL OR buy_now_price > 0
    ),
    CONSTRAINT listing_min_bid_pos_chk CHECK (
        min_bid IS NULL OR min_bid > 0
    ),
    CONSTRAINT listing_buy_now_gte_min_bid_chk CHECK (
        buy_now_price IS NULL OR min_bid IS NULL OR buy_now_price >= min_bid
    ),

    -- current_bid + current_bid_account + current_bid_id move together.
    CONSTRAINT listing_current_bid_state_chk CHECK (
        (current_bid IS NULL     AND current_bid_account IS NULL     AND current_bid_id IS NULL)
     OR (current_bid IS NOT NULL AND current_bid_account IS NOT NULL AND current_bid_id IS NOT NULL)
    ),

    -- Non-active listings must not retain live-bid pointers. wallet.bid
    -- is the historical source of truth. Final states (sold/cancelled/
    -- expired) keep buyer_account but clear current_bid* so state is
    -- unambiguous.
    CONSTRAINT listing_active_bid_fields_chk CHECK (
        status =  'active'
     OR (current_bid IS NULL AND current_bid_account IS NULL AND current_bid_id IS NULL)
    ),
    CONSTRAINT listing_current_bid_pos_chk CHECK (
        current_bid IS NULL OR current_bid > 0
    ),
    CONSTRAINT listing_current_bid_gte_min_chk CHECK (
        current_bid IS NULL OR min_bid IS NULL OR current_bid >= min_bid
    ),

    -- Status / settled_at invariants.
    CONSTRAINT listing_settled_at_chk CHECK (
        (status =  'active' AND settled_at IS NULL)
     OR (status <> 'active' AND settled_at IS NOT NULL)
    ),

    -- Seller never bids on or buys their own listing.
    CONSTRAINT listing_current_bid_not_seller_chk CHECK (
        current_bid_account IS NULL OR current_bid_account <> seller_account
    ),
    CONSTRAINT listing_buyer_not_seller_chk CHECK (
        buyer_account IS NULL OR buyer_account <> seller_account
    ),

    -- buyer_account set iff sold.
    CONSTRAINT listing_buyer_state_chk CHECK (
        (status =  'sold' AND buyer_account IS NOT NULL)
     OR (status <> 'sold' AND buyer_account IS NULL)
    ),

    -- Duration window. expires_at is caller-supplied; we enforce
    -- 1h <= duration <= 30d at insert time.
    CONSTRAINT listing_min_duration_chk CHECK (
        expires_at >= created_at + interval '1 hour'
    ),
    CONSTRAINT listing_max_duration_chk CHECK (
        expires_at <= created_at + interval '30 days'
    )
);

COMMENT ON TABLE wallet.listing IS
    'Marketplace listing. Combines fixed-price (buy_now_price) and auction (min_bid) in one row; either or both can be set. Settlement is materialized in wallet.ledger via Phase 2 RPCs.';

-- Idempotency is scoped per actor so a key reused across users does
-- not cause spurious 409s. Server-generated UUIDs would not need this,
-- but client-provided keys (likely in Phase 4) get safer semantics.
CREATE UNIQUE INDEX wallet_listing_seller_idempotency_uq
    ON wallet.listing (seller_account, idempotency_key);

CREATE INDEX wallet_listing_active_expires_idx
    ON wallet.listing (expires_at)
    WHERE status = 'active';

-- Browse index: active listings sorted newest-first for /mc/market home.
CREATE INDEX wallet_listing_active_created_idx
    ON wallet.listing (created_at DESC, id DESC)
    WHERE status = 'active';

CREATE INDEX wallet_listing_seller_created_idx
    ON wallet.listing (seller_account, created_at DESC, id DESC);

-- Seller dashboards filtered by status.
CREATE INDEX wallet_listing_seller_status_created_idx
    ON wallet.listing (seller_account, status, created_at DESC, id DESC);

-- Buyer dashboards / "my purchases".
CREATE INDEX wallet_listing_buyer_created_idx
    ON wallet.listing (buyer_account, created_at DESC, id DESC)
    WHERE buyer_account IS NOT NULL;

CREATE INDEX wallet_listing_current_bidder_idx
    ON wallet.listing (current_bid_account, status)
    WHERE current_bid_account IS NOT NULL;

CREATE INDEX wallet_listing_status_created_idx
    ON wallet.listing (status, created_at DESC, id DESC);

-- Prevents the same physical item from being in two active listings.
-- Skips rows where the mc service omits instance_id.
CREATE UNIQUE INDEX wallet_listing_active_item_instance_uq
    ON wallet.listing (item_instance_id)
    WHERE status = 'active' AND item_instance_id IS NOT NULL;

-- ============================================================================
-- TABLE: wallet.bid — per-listing bid history
--
-- Phase 2 contract for place_bid:
--   - SELECT ... FOR UPDATE on the listing row first
--   - Reject if bidder_account = listing.seller_account (no self-bid;
--     CHECK can't reference another table)
--   - Reject if listing status != 'active' or expires_at has passed
--   - Reject if amount < min_bid or amount <= current_bid
--   - Demote any prior active bid to 'outbid' (refund_ledger_id set)
--   - Insert the new bid in 'active'; set listing.current_bid*
--   - If amount >= buy_now_price, short-circuit to settle (status='sold')
-- ============================================================================

CREATE TABLE wallet.bid (
    id                BIGSERIAL PRIMARY KEY,
    listing_id        BIGINT NOT NULL REFERENCES wallet.listing(id) ON DELETE NO ACTION,
    bidder_account    UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    amount            BIGINT NOT NULL,
    placed_at         TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    status            wallet.bid_status NOT NULL DEFAULT 'active',
    settled_at        TIMESTAMPTZ,
    -- Ledger entry that debited the bidder's account into escrow.
    escrow_ledger_id  BIGINT NOT NULL REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    -- Ledger entry that returned funds to the bidder (set when status
    -- transitions to outbid / refunded / cancelled). NULL while active
    -- and after a 'won' transition (funds went to seller, not refunded).
    refund_ledger_id  BIGINT REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    idempotency_key   UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    CONSTRAINT bid_amount_pos_chk CHECK (amount > 0),

    -- Lifecycle invariants. Active bids have no settled_at and no
    -- refund_ledger_id. Outbid/refunded/cancelled have both. Won has
    -- settled_at but no refund (the escrow goes to the seller, not back).
    CONSTRAINT bid_lifecycle_chk CHECK (
        (status =  'active'
            AND settled_at      IS NULL
            AND refund_ledger_id IS NULL)
     OR (status IN ('outbid', 'refunded', 'cancelled')
            AND settled_at      IS NOT NULL
            AND refund_ledger_id IS NOT NULL)
     OR (status =  'won'
            AND settled_at      IS NOT NULL
            AND refund_ledger_id IS NULL)
    )
);

COMMENT ON TABLE wallet.bid IS
    'Per-listing bid history. escrow_ledger_id is mandatory: every bid must reference the debit that escrowed the funds. refund_ledger_id is set on outbid/refunded/cancelled transitions.';

-- Actor-scoped idempotency (same rationale as the listing variant).
CREATE UNIQUE INDEX wallet_bid_bidder_idempotency_uq
    ON wallet.bid (bidder_account, idempotency_key);

CREATE INDEX wallet_bid_listing_placed_idx
    ON wallet.bid (listing_id, placed_at DESC, id DESC);

CREATE INDEX wallet_bid_bidder_placed_idx
    ON wallet.bid (bidder_account, placed_at DESC, id DESC);

-- Exactly one ACTIVE bid per listing. Listing.current_bid_account is
-- single-valued, so the bid table mirrors that invariant: any new bid
-- demotes the prior 'active' row to 'outbid' (with refund_ledger_id)
-- in the same RPC transaction. Combined with the lifecycle CHECK on
-- wallet.bid, this prevents two active high bids from existing for a
-- single listing even under concurrent place_bid calls.
CREATE UNIQUE INDEX wallet_bid_listing_active_uq
    ON wallet.bid (listing_id)
    WHERE status = 'active';

-- ============================================================================
-- FK back-link: listing.current_bid_id → wallet.bid(id)
--
-- Added after both tables exist (wallet.bid references wallet.listing,
-- so the FK on listing.current_bid_id must be declared post-create).
-- ON DELETE NO ACTION mirrors the rest of the wallet schema; bid rows
-- are never deleted, only state-transitioned.
-- ============================================================================

ALTER TABLE wallet.listing
    ADD CONSTRAINT listing_current_bid_id_fk
    FOREIGN KEY (current_bid_id) REFERENCES wallet.bid(id) ON DELETE NO ACTION;

-- ============================================================================
-- TRIGGER: updated_at touch
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.trg_listing_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wallet.trg_listing_touch_updated_at() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION wallet.trg_listing_touch_updated_at() OWNER TO service_role;

CREATE TRIGGER trg_wallet_listing_touch_updated_at
    BEFORE UPDATE ON wallet.listing
    FOR EACH ROW EXECUTE FUNCTION wallet.trg_listing_touch_updated_at();

-- ============================================================================
-- RLS
--
-- FORCE ROW LEVEL SECURITY means every caller (including table owner)
-- must pass a policy. The market RPCs in Phase 2 are SECURITY DEFINER
-- and MUST be owned by service_role so they inherit the
-- service_role_full_access policy below. A function owned by anyone
-- else (or by a role without an explicit policy / BYPASSRLS) will
-- silently get zero rows back from these tables.
-- ============================================================================

ALTER TABLE wallet.listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.bid     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.listing FORCE  ROW LEVEL SECURITY;
ALTER TABLE wallet.bid     FORCE  ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.listing
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access" ON wallet.bid
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- No direct authenticated access. All reads/writes flow through the
-- public.proxy_market_* SECURITY DEFINER functions added in Phase 3.

REVOKE ALL ON TABLE wallet.listing FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE wallet.bid     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE wallet.listing_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE wallet.bid_id_seq     FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON wallet.listing TO service_role;
GRANT USAGE ON SEQUENCE wallet.listing_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE ON wallet.bid TO service_role;
GRANT USAGE ON SEQUENCE wallet.bid_id_seq TO service_role;

-- ============================================================================
-- KBVE Treasury account
--
-- Seed a known treasury account so Phase 2's settle_listing RPC can
-- transfer the 1% marketplace fee deterministically. Lookup is by
-- label='kbve_treasury' so we don't have to encode a UUID constant.
--
-- Concurrency: a partial unique index on (label) WHERE kind='treasury'
-- backs an ON CONFLICT DO NOTHING insert so the seed is safe under
-- concurrent migration retries and against future "create treasury for
-- X" callers that might race on the same label.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS wallet_account_treasury_label_uq
    ON wallet.account (label)
    WHERE kind = 'treasury';

INSERT INTO wallet.account (kind, user_id, guild_id, label, created_at)
VALUES ('treasury', NULL, NULL, 'kbve_treasury', statement_timestamp())
ON CONFLICT (label) WHERE kind = 'treasury' DO NOTHING;

-- Treasury balance row.
INSERT INTO wallet.balance (account_id)
SELECT id FROM wallet.account
 WHERE kind = 'treasury' AND label = 'kbve_treasury'
ON CONFLICT (account_id) DO NOTHING;

-- migrate:down

-- Drop the cross-table FK first so DROP TABLE on wallet.bid succeeds
-- (wallet.listing.current_bid_id references wallet.bid(id)).
ALTER TABLE IF EXISTS wallet.listing
    DROP CONSTRAINT IF EXISTS listing_current_bid_id_fk;

DROP TRIGGER IF EXISTS trg_wallet_listing_touch_updated_at ON wallet.listing;
DROP FUNCTION IF EXISTS wallet.trg_listing_touch_updated_at();
DROP TABLE IF EXISTS wallet.bid;
DROP TABLE IF EXISTS wallet.listing;
DROP TYPE  IF EXISTS wallet.bid_status;
DROP TYPE  IF EXISTS wallet.listing_status;
DROP INDEX IF EXISTS wallet.wallet_account_treasury_label_uq;

-- Intentionally does NOT delete the seeded kbve_treasury wallet.account
-- or its balance row, since rolling back this migration must not erase
-- funds. Phase 2 migrations will rely on those rows already existing.
