-- ============================================================================
-- WALLET MARKETPLACE — listings + bids
--
-- Reference mirror. Depends on wallet_core.sql (account, balance, ledger,
-- currency_kind enum) and wallet_audit.sql.
--
-- v1 design notes:
--   - khash-only (CHECK constraint; drop later to allow credits).
--   - A listing can be buy-now, auction, or both. At least one price set.
--   - Listings live 1h–30d.
--   - item_ref is JSONB owned by the mc service; the wallet trusts that
--     exactly one real item is escrowed per active listing.
--   - settlement RPCs (create / bid / cancel / settle / expire-sweep)
--     land in wallet_rpcs.sql + a pg_cron schedule.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE wallet.listing_status AS ENUM (
    'active',
    'sold',
    'cancelled',
    'expired'
);

CREATE TYPE wallet.bid_status AS ENUM (
    'active',
    'outbid',
    'won',
    'refunded',
    'cancelled'
);

-- ============================================================================
-- TABLE: wallet.listing
-- ============================================================================

CREATE TABLE wallet.listing (
    id                  BIGSERIAL PRIMARY KEY,
    seller_account      UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    -- Phase 6.1a: authoritative pointer at the inventory.item row that
    -- is escrowed in this listing. Active listings MUST set item_id;
    -- legacy non-active rows are grandfathered (CHECK is NOT VALID).
    -- item_ref JSONB below stays for back-compat with browse APIs that
    -- haven't migrated yet.
    item_id             UUID REFERENCES inventory.item(id) ON DELETE NO ACTION,
    item_ref            JSONB NOT NULL,
    item_instance_id    TEXT GENERATED ALWAYS AS (item_ref->>'instance_id') STORED,
    currency            wallet.currency_kind NOT NULL DEFAULT 'khash',
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    current_bid_account UUID REFERENCES wallet.account(id) ON DELETE NO ACTION,
    current_bid_id      BIGINT,
    buyer_account       UUID REFERENCES wallet.account(id) ON DELETE NO ACTION,
    status              wallet.listing_status NOT NULL DEFAULT 'active',
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    settled_at          TIMESTAMPTZ,
    idempotency_key     UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    CONSTRAINT listing_khash_only_chk CHECK (currency = 'khash'),
    CONSTRAINT listing_item_ref_shape_chk CHECK (
        jsonb_typeof(item_ref) = 'object' AND item_ref <> '{}'::jsonb
    ),
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
    CONSTRAINT listing_current_bid_state_chk CHECK (
        (current_bid IS NULL     AND current_bid_account IS NULL     AND current_bid_id IS NULL)
     OR (current_bid IS NOT NULL AND current_bid_account IS NOT NULL AND current_bid_id IS NOT NULL)
    ),
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
    CONSTRAINT listing_settled_at_chk CHECK (
        (status =  'active' AND settled_at IS NULL)
     OR (status <> 'active' AND settled_at IS NOT NULL)
    ),
    CONSTRAINT listing_current_bid_not_seller_chk CHECK (
        current_bid_account IS NULL OR current_bid_account <> seller_account
    ),
    CONSTRAINT listing_buyer_not_seller_chk CHECK (
        buyer_account IS NULL OR buyer_account <> seller_account
    ),
    CONSTRAINT listing_buyer_state_chk CHECK (
        (status =  'sold' AND buyer_account IS NOT NULL)
     OR (status <> 'sold' AND buyer_account IS NULL)
    ),
    CONSTRAINT listing_min_duration_chk CHECK (
        expires_at >= created_at + interval '1 hour'
    ),
    CONSTRAINT listing_max_duration_chk CHECK (
        expires_at <= created_at + interval '30 days'
    ),
    -- Active listings MUST reference an inventory.item. Hard cut: the
    -- 6.1a migration cancelled all pre-existing active listings (none
    -- had item_id), so this CHECK lands as plain VALID. Legacy
    -- service_create_listing(UUID, JSONB, ...) callers fail loudly on
    -- INSERT until they migrate to service_create_listing_with_item.
    CONSTRAINT wallet_listing_active_item_id_chk CHECK (
        status <> 'active' OR item_id IS NOT NULL
    )
);

COMMENT ON TABLE wallet.listing IS
    'Marketplace listing. Combines fixed-price (buy_now_price) and auction (min_bid) in one row; either or both can be set. Settlement is materialized in wallet.ledger via Phase 2 RPCs.';

CREATE UNIQUE INDEX wallet_listing_seller_idempotency_uq
    ON wallet.listing (seller_account, idempotency_key);
CREATE INDEX wallet_listing_active_expires_idx
    ON wallet.listing (expires_at)
    WHERE status = 'active';
CREATE INDEX wallet_listing_active_created_idx
    ON wallet.listing (created_at DESC, id DESC)
    WHERE status = 'active';
CREATE INDEX wallet_listing_seller_created_idx
    ON wallet.listing (seller_account, created_at DESC, id DESC);
CREATE INDEX wallet_listing_seller_status_created_idx
    ON wallet.listing (seller_account, status, created_at DESC, id DESC);
CREATE INDEX wallet_listing_buyer_created_idx
    ON wallet.listing (buyer_account, created_at DESC, id DESC)
    WHERE buyer_account IS NOT NULL;
CREATE INDEX wallet_listing_current_bidder_idx
    ON wallet.listing (current_bid_account, status)
    WHERE current_bid_account IS NOT NULL;
CREATE INDEX wallet_listing_status_created_idx
    ON wallet.listing (status, created_at DESC, id DESC);

-- Phase 6.1a: at most one active listing per inventory.item.
CREATE UNIQUE INDEX wallet_listing_active_item_uq
    ON wallet.listing (item_id)
    WHERE status = 'active' AND item_id IS NOT NULL;
CREATE UNIQUE INDEX wallet_listing_active_item_instance_uq
    ON wallet.listing (item_instance_id)
    WHERE status = 'active' AND item_instance_id IS NOT NULL;

-- ============================================================================
-- TABLE: wallet.bid
-- ============================================================================

CREATE TABLE wallet.bid (
    id                BIGSERIAL PRIMARY KEY,
    listing_id        BIGINT NOT NULL REFERENCES wallet.listing(id) ON DELETE NO ACTION,
    bidder_account    UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    amount            BIGINT NOT NULL,
    placed_at         TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    status            wallet.bid_status NOT NULL DEFAULT 'active',
    settled_at        TIMESTAMPTZ,
    escrow_ledger_id  BIGINT NOT NULL REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    refund_ledger_id  BIGINT REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    idempotency_key   UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    CONSTRAINT bid_amount_pos_chk CHECK (amount > 0),
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

CREATE UNIQUE INDEX wallet_bid_bidder_idempotency_uq
    ON wallet.bid (bidder_account, idempotency_key);
CREATE INDEX wallet_bid_listing_placed_idx
    ON wallet.bid (listing_id, placed_at DESC, id DESC);
CREATE INDEX wallet_bid_bidder_placed_idx
    ON wallet.bid (bidder_account, placed_at DESC, id DESC);
-- Exactly one active high bid per listing.
CREATE UNIQUE INDEX wallet_bid_listing_active_uq
    ON wallet.bid (listing_id)
    WHERE status = 'active';

-- ============================================================================
-- Cross-table FK: listing.current_bid_id → wallet.bid(id)
-- ============================================================================

ALTER TABLE wallet.listing
    ADD CONSTRAINT listing_current_bid_id_fk
    FOREIGN KEY (current_bid_id) REFERENCES wallet.bid(id) ON DELETE NO ACTION;

-- ============================================================================
-- updated_at trigger
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
-- ============================================================================

ALTER TABLE wallet.listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.bid     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.listing FORCE  ROW LEVEL SECURITY;
ALTER TABLE wallet.bid     FORCE  ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.listing
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_full_access" ON wallet.bid
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON TABLE wallet.listing FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE wallet.bid     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE wallet.listing_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE wallet.bid_id_seq     FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON wallet.listing TO service_role;
GRANT USAGE ON SEQUENCE wallet.listing_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE ON wallet.bid TO service_role;
GRANT USAGE ON SEQUENCE wallet.bid_id_seq TO service_role;

-- ============================================================================
-- KBVE Treasury seed (idempotent + concurrency-safe)
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS wallet_account_treasury_label_uq
    ON wallet.account (label)
    WHERE kind = 'treasury';

INSERT INTO wallet.account (kind, user_id, guild_id, label, created_at)
VALUES ('treasury', NULL, NULL, 'kbve_treasury', statement_timestamp())
ON CONFLICT (label) WHERE kind = 'treasury' DO NOTHING;

INSERT INTO wallet.balance (account_id)
SELECT id FROM wallet.account
 WHERE kind = 'treasury' AND label = 'kbve_treasury'
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================================
-- MARKETPLACE RPCs (Phase 2)
--
-- Service-layer mutators for the create / bid / buy-now / cancel /
-- settle / expire lifecycle. All SECURITY DEFINER, service_role only,
-- owned by service_role. Phase 3 public proxies wrap these after
-- applying auth.uid() ownership checks.
--
-- Money flow (khash-only in v1):
--   place_bid:  service_debit(bidder, amount) → escrow; on outbid the
--               prior bidder is refunded via service_credit.
--   buy_now:    same debit, then immediate service_settle_listing.
--   cancel:     refund active bid (status='refunded'), mark listing
--               'cancelled'.
--   settle:     mark winning bid 'won' (no refund); service_credit
--               seller with (amount - fee) and treasury with fee.
--   expire:     pg_cron-driven sweep. For each active listing with
--               expires_at <= now(): settle if a current_bid exists,
--               otherwise mark 'expired'.
-- Fee = floor(amount / 100) = 1%.
--
-- Idempotency is enforced via the per-actor (seller/bidder) unique
-- index on idempotency_key. Replays return the existing row id.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.treasury_account_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id
      FROM wallet.account
     WHERE kind = 'treasury' AND label = 'kbve_treasury';
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'kbve_treasury account missing' USING ERRCODE = '23503';
    END IF;
    RETURN v_id;
END;
$$;
ALTER FUNCTION wallet.treasury_account_id() OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.treasury_account_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.treasury_account_id() TO service_role;

-- The full bodies of service_create_listing / service_place_bid /
-- service_buy_now / service_cancel_listing / service_settle_listing /
-- service_expire_listings / refund_active_bid / distribute_settlement
-- live in the dbmate migration 20260515054304_wallet_marketplace_rpcs.
-- service_create_listing_with_item + the inventory hook overrides for
-- settle / cancel / expire live in 20260520114243_wallet_inventory_listing_wire
-- and 20260520124536_wallet_listing_settle_inventory respectively.
-- This mirror documents only signatures + grants for review surface.

-- Signatures (see migrations for bodies):
--   wallet.service_create_listing(UUID, JSONB, currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID)
--                                                                 → BIGINT (listing.id) [legacy; dropped in 6.1c]
--   wallet.service_create_listing_with_item(UUID, UUID, BIGINT, currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID)
--                                                                 → BIGINT (listing.id) [Phase 6.1a authoritative]
--   wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID)           → BIGINT (bid.id)
--   wallet.service_buy_now(BIGINT, UUID, UUID)                     → BIGINT (bid.id)
--   wallet.service_cancel_listing(BIGINT, UUID, TEXT)              → VOID (6.1a: also unlocks inventory item)
--   wallet.service_settle_listing(BIGINT, BIGINT, TEXT)            → VOID (6.1a: also transfers inventory item to buyer)
--   wallet.service_expire_listings(INTEGER)                        → TABLE(total, settled, expired) (6.1a: also unlocks no-bid items)
--   wallet.refund_active_bid(BIGINT, bid_status, TEXT)             → BIGINT (refunded bid id or NULL)
--   wallet.distribute_settlement(BIGINT, UUID, BIGINT, BIGINT)     → (BIGINT fee, BIGINT net, ...)

-- pg_cron schedule (registered when extension is present):
--   jobname:  marketplace-expire-listings
--   schedule: '*/15 * * * *'
--   command:  SELECT wallet.service_expire_listings();

-- ============================================================================
-- MARKETPLACE PUBLIC PROXIES (Phase 3)
--
-- PostgREST-exposed wrappers that apply auth.uid()-based ownership
-- checks before delegating to the Phase 2 SECURITY DEFINER service
-- RPCs. These are the only marketplace functions callable by
-- `authenticated` JWTs. Read-side proxies + browse are anon-callable.
--
-- All bodies live in migration 20260516015242_wallet_marketplace_proxies.
-- This mirror documents signatures + grants for the review surface.
--
-- Signatures:
--   public.proxy_market_caller_account()
--       → UUID (INTERNAL helper, service_role only)
--
--   public.proxy_market_list_active_readonly(INTEGER, TIMESTAMPTZ, BIGINT)
--       → TABLE(...)  anon + authenticated + service_role
--   public.proxy_market_listing_detail_readonly(BIGINT)
--       → TABLE(...)  anon + authenticated + service_role
--   public.proxy_market_my_listings_readonly(INTEGER, TIMESTAMPTZ, BIGINT)
--       → TABLE(...)  authenticated + service_role
--   public.proxy_market_my_bids_readonly(INTEGER, TIMESTAMPTZ, BIGINT)
--       → TABLE(...)  authenticated + service_role
--
--   public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID)
--       → BIGINT     authenticated + service_role
--   public.proxy_market_place_bid(BIGINT, BIGINT, UUID)
--       → BIGINT     authenticated + service_role
--   public.proxy_market_buy_now(BIGINT, UUID)
--       → BIGINT     authenticated + service_role
--   public.proxy_market_cancel_listing(BIGINT, TEXT)
--       → VOID       authenticated + service_role
--
-- All proxies are SECURITY DEFINER, OWNER service_role, search_path
-- '. Reads STABLE. The migration ends with NOTIFY pgrst, 'reload
-- schema' so PostgREST picks the new functions up immediately.
