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
    item_ref            JSONB NOT NULL,
    currency            wallet.currency_kind NOT NULL DEFAULT 'khash',
    buy_now_price       BIGINT,
    min_bid             BIGINT,
    current_bid         BIGINT,
    current_bid_account UUID REFERENCES wallet.account(id) ON DELETE NO ACTION,
    status              wallet.listing_status NOT NULL DEFAULT 'active',
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
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
        (current_bid IS NULL     AND current_bid_account IS NULL)
     OR (current_bid IS NOT NULL AND current_bid_account IS NOT NULL)
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
    CONSTRAINT listing_min_duration_chk CHECK (
        expires_at >= created_at + interval '1 hour'
    ),
    CONSTRAINT listing_max_duration_chk CHECK (
        expires_at <= created_at + interval '30 days'
    )
);

COMMENT ON TABLE wallet.listing IS
    'Marketplace listing. Combines fixed-price (buy_now_price) and auction (min_bid) in one row; either or both can be set. Settlement is materialized in wallet.ledger via Phase 2 RPCs.';

CREATE INDEX wallet_listing_active_expires_idx
    ON wallet.listing (expires_at)
    WHERE status = 'active';
CREATE INDEX wallet_listing_seller_created_idx
    ON wallet.listing (seller_account, created_at DESC, id DESC);
CREATE INDEX wallet_listing_current_bidder_idx
    ON wallet.listing (current_bid_account, status)
    WHERE current_bid_account IS NOT NULL;
CREATE INDEX wallet_listing_status_created_idx
    ON wallet.listing (status, created_at DESC, id DESC);

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

CREATE UNIQUE INDEX wallet_bid_idempotency_uq ON wallet.bid(idempotency_key);
CREATE INDEX wallet_bid_listing_placed_idx
    ON wallet.bid (listing_id, placed_at DESC, id DESC);
CREATE INDEX wallet_bid_bidder_placed_idx
    ON wallet.bid (bidder_account, placed_at DESC, id DESC);
CREATE UNIQUE INDEX wallet_bid_listing_bidder_active_uq
    ON wallet.bid (listing_id, bidder_account)
    WHERE status = 'active';

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

GRANT SELECT, INSERT, UPDATE ON wallet.listing TO service_role;
GRANT USAGE ON SEQUENCE wallet.listing_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE ON wallet.bid TO service_role;
GRANT USAGE ON SEQUENCE wallet.bid_id_seq TO service_role;

-- ============================================================================
-- KBVE Treasury seed (idempotent)
-- ============================================================================

INSERT INTO wallet.account (kind, user_id, guild_id, label, created_at)
SELECT 'treasury', NULL, NULL, 'kbve_treasury', statement_timestamp()
WHERE NOT EXISTS (
    SELECT 1 FROM wallet.account
     WHERE kind = 'treasury' AND label = 'kbve_treasury'
);

INSERT INTO wallet.balance (account_id)
SELECT id FROM wallet.account
 WHERE kind = 'treasury' AND label = 'kbve_treasury'
ON CONFLICT (account_id) DO NOTHING;
