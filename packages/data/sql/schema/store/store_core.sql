-- ============================================================================
-- STORE CORE — schema, order_status enum, catalog/purchase/variant/order/
-- topup_package/topup/pod_webhook_event tables, indexes, table grants, and the
-- order_event append-only + product slug-immutable + variant stock-mode-immutable
-- + topup_package economics-immutable triggers.
--
-- Reference mirror of the collapsed dbmate migrations:
--   ../../dbmate/migrations/20260708120000_store_schema_init.sql
--   ../../dbmate/migrations/20260709165000_wallet_source_kind_topup.sql
--   ../../dbmate/migrations/20260709170000_store_topup_pod.sql
--   ../../dbmate/migrations/20260709180000_store_privilege_hardening.sql
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready. Functions live in
-- store_rpcs.sql (except the order_event mutation-block trigger, the product
-- slug-immutable trigger, and the topup_package economics-immutable trigger,
-- which live here beside the tables they guard, matching the wallet_core
-- convention).
--
-- Ownership (privilege hardening): after 20260709180000 every store table +
-- enum, and every store proxy function in public/private, is OWNED BY the
-- NOLOGIN role store_api_owner. service_role keeps EXECUTE on the RPCs only —
-- no direct table access. The per-object 'OWNER TO service_role' lines below
-- mirror what the init/topup migrations write; the hardening migration then
-- reassigns them all to store_api_owner (see the PRIVILEGE MODEL section at the
-- end of this file).
--
-- Mental model:
--   The store is the PRIMARY (mint) market. A purchase debits credits via
--   wallet.service_debit (source_kind='purchase') and mints an inventory.item
--   (kind='store_product', ref=slug). Ownership lives in inventory — never a
--   separate entitlement table — so a store product is immediately listable
--   and tradeable on the existing wallet marketplace (the SECONDARY market).
--
-- Cross-schema dependency:
--   wallet.source_kind gains the value 'topup' in the wallet enum migration
--   (20260709165000_wallet_source_kind_topup.sql). It is mirrored in
--   wallet_core.sql — not duplicated here — and store.service_apply_topup
--   credits with source_kind='topup'.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS store;
GRANT USAGE ON SCHEMA store TO service_role;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE store.order_status AS ENUM (
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

-- ============================================================================
-- TABLE: store.product — the catalog. One row per thing for sale.
--   A purchase mints inventory.item(kind='store_product', ref=slug).
-- ============================================================================

-- gen_random_uuid() is unqualified on purpose (pg_catalog core, PG13+).
-- asset_ref is PUBLIC by contract (anon-readable) — keep it client-safe.
-- price >= 0: price 0 is a free product; service_buy skips the debit.
CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
    description TEXT,
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    fulfillment TEXT NOT NULL DEFAULT 'digital'
                CHECK (fulfillment IN ('digital', 'physical', 'both')),
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(asset_ref) = 'object'),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

COMMENT ON TABLE store.product IS
    'Store catalog. Fixed-price products. A purchase mints inventory.item(kind=store_product, ref=slug); ownership lives in inventory, not here. asset_ref is public (anon-readable).';

-- slug is the durable product identity: inventory.item.ref, the debit ref_type,
-- and digital replay all key on it. Freeze it after creation so a rename can't
-- orphan entitlements or break an in-flight idempotent replay. BEFORE UPDATE OF
-- slug trigger raises 22023 on any change.
CREATE OR REPLACE FUNCTION store.product_slug_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'store.product.slug is immutable (was %, got %)', OLD.slug, NEW.slug
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION store.product_slug_immutable() OWNER TO service_role;

CREATE TRIGGER store_product_slug_immutable
    BEFORE UPDATE OF slug ON store.product
    FOR EACH ROW EXECUTE FUNCTION store.product_slug_immutable();

-- Hard invariant: at most one owned copy per (account, store product).
-- Backstops the ownership dupe-guard against a concurrent double-mint.
CREATE UNIQUE INDEX inventory_item_store_product_owned_uq
    ON inventory.item (owner_account, ref)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');
-- Read path for proxy_store_my_entitlements_readonly (owner + created_at DESC).
CREATE INDEX inventory_item_store_entitlements_read_idx
    ON inventory.item (owner_account, created_at DESC, id DESC)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- ============================================================================
-- TABLE: store.purchase — durable digital-purchase receipt.
--   One row per (account, idempotency_key): binds a purchase request to its
--   minted item so a replay returns the same item without re-charging, even
--   after the item was later sold / transferred / consumed. Complements (does
--   not replace) the one-owned-copy inventory unique index above.
-- ============================================================================

CREATE TABLE store.purchase (
    purchase_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES wallet.account(id),
    product_id      UUID NOT NULL REFERENCES store.product(product_id),
    -- FK to the minted entitlement (RESTRICT: inventory items are state-machined,
    -- never hard-deleted) so a receipt can never point at a nonexistent item.
    item_id         UUID NOT NULL REFERENCES inventory.item(id),
    -- price is the amount ACTUALLY charged (0 for a free product or an
    -- already-owned no-op), never the mutable catalog price; ledger_id IS NULL
    -- <=> price = 0.
    price           BIGINT NOT NULL CHECK (price >= 0),
    currency        wallet.currency_kind NOT NULL,
    -- FK to the wallet ledger (RI checks bypass RLS) so a receipt can't record a
    -- fabricated ledger id. NULL when nothing was charged (free / already-owned).
    -- RESTRICT: ledger rows are immutable accounting, never hard-deleted.
    ledger_id       BIGINT REFERENCES wallet.ledger(id) ON DELETE RESTRICT,
    -- What the buy resolved to: a fresh mint vs. a lookup of an already-owned
    -- copy (no debit, no mint). Keeps the receipt honest for accounting.
    result_kind     TEXT NOT NULL DEFAULT 'minted'
                    CHECK (result_kind IN ('minted', 'already_owned')),
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, idempotency_key),
    -- Enforce the accounting the comments describe: an already-owned lookup is
    -- always a zero-charge no-op (no ledger); a mint charges iff price > 0.
    CONSTRAINT store_purchase_accounting_ck CHECK (
        (result_kind = 'already_owned' AND price = 0 AND ledger_id IS NULL)
        OR (result_kind = 'minted' AND (
                (price = 0 AND ledger_id IS NULL)
                OR (price > 0 AND ledger_id IS NOT NULL)
            ))
    )
);
CREATE INDEX store_purchase_account_created_idx
    ON store.purchase (account_id, created_at DESC);
COMMENT ON TABLE store.purchase IS
    'Durable digital purchase receipts. Per (account, idempotency_key) result binding for replay-safe service_buy.';

-- ============================================================================
-- TABLE: store.product_variant — concrete purchasable SKUs of a product.
--   Priced in credits (parent product currency). NULL stock = unlimited.
-- ============================================================================

CREATE TABLE store.product_variant (
    variant_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES store.product(product_id) ON DELETE CASCADE,
    sku         TEXT NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(attributes) = 'object'),
    price       BIGINT NOT NULL CHECK (price >= 0),   -- credits (parent currency)
    stock       BIGINT CHECK (stock IS NULL OR stock >= 0),   -- NULL = unlimited
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Composite target so store.order can carry a (product_id, variant_id) FK:
    -- guarantees an order's variant always belongs to its product, even for
    -- direct/maintenance writes that bypass service_buy_physical.
    CONSTRAINT store_variant_product_variant_uq UNIQUE (product_id, variant_id)
);

-- Serves the detail RPC's (product_id, status='active' ORDER BY created_at)
-- and the catalog variant-count lateral.
CREATE INDEX store_product_variant_active_product_created_idx
    ON store.product_variant (product_id, created_at, variant_id)
    WHERE status = 'active';

COMMENT ON TABLE store.product_variant IS
    'Concrete purchasable SKUs of a store.product. Priced in credits (parent product currency). NULL stock = unlimited.';

-- Refund correctness (stock_reserved restore) depends on the finite/unlimited
-- stock MODE never changing under an outstanding order. service_upsert_variant
-- rejects a mode flip for a clear application error, but enforce it at the table
-- boundary too so a direct owner write / future maintenance function can't
-- silently break the invariant. BEFORE UPDATE OF stock trigger raises 22023 on
-- any finite<->unlimited flip.
CREATE OR REPLACE FUNCTION store.variant_stock_mode_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF (OLD.stock IS NULL) <> (NEW.stock IS NULL) THEN
        RAISE EXCEPTION 'store.product_variant stock mode (finite/unlimited) is immutable'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION store.variant_stock_mode_immutable() OWNER TO service_role;

CREATE TRIGGER store_variant_stock_mode_immutable
    BEFORE UPDATE OF stock ON store.product_variant
    FOR EACH ROW EXECUTE FUNCTION store.variant_stock_mode_immutable();

-- ============================================================================
-- TABLE: store.order — physical/both orders. Born 'paid'.
--   pod_ref carries the print-on-demand provider's external id/status.
-- ============================================================================

CREATE TABLE store.order (
    order_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id       UUID NOT NULL REFERENCES wallet.account(id),
    product_id       UUID NOT NULL REFERENCES store.product(product_id),
    variant_id       UUID,
    qty              BIGINT NOT NULL DEFAULT 1 CHECK (qty > 0),
    -- Immutable purchase snapshots. An order is a receipt: money + presentation
    -- fields are captured at buy time and never follow later catalog edits
    -- (rename / retire / reprice / currency change). Refunds use order.currency,
    -- never the live product row.
    currency         wallet.currency_kind NOT NULL DEFAULT 'credits',
    unit_price       BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    -- Snapshot fields service_buy_physical always supplies -> NOT NULL.
    product_slug     TEXT NOT NULL,
    product_title    TEXT NOT NULL,
    variant_sku      TEXT NOT NULL,
    variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(variant_attributes) = 'object'),
    -- Snapshot of the product's fulfillment mode at buy time. POD eligibility
    -- reads THIS, never the live product row — a later catalog edit must not
    -- make an already-paid order ineligible for fulfillment.
    fulfillment      TEXT NOT NULL DEFAULT 'physical'
                     CHECK (fulfillment IN ('physical', 'both')),
    -- True only when this order decremented finite variant stock. A refund
    -- restores stock only when this is set, so a later NULL<->finite stock-mode
    -- change on the variant can't mis-restore (or fail to restore) inventory.
    stock_reserved   BOOLEAN NOT NULL DEFAULT false,
    credits_amount   BIGINT NOT NULL CHECK (credits_amount >= 0),
    -- FK to the wallet ledger (RI checks bypass RLS); NULL for a zero-amount order.
    -- RESTRICT: ledger rows are immutable accounting, never hard-deleted.
    ledger_id        BIGINT REFERENCES wallet.ledger(id) ON DELETE RESTRICT,
    -- Typed refund-credit ledger id (set by service_refund_order), so a refund is
    -- auditable from a column, not JSON extraction.
    refund_ledger_id BIGINT REFERENCES wallet.ledger(id) ON DELETE RESTRICT,
    -- FK so refund correctness (revoking the minted twin) can't hinge on a
    -- dangling id. RESTRICT: inventory items are state-machined, not deleted.
    twin_item_id     UUID REFERENCES inventory.item(id) ON DELETE RESTRICT,
    status           store.order_status NOT NULL DEFAULT 'paid',
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(shipping_address) = 'object'
                            AND octet_length(shipping_address::text) <= 16384),
    tracking         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(tracking) = 'object'
                            AND octet_length(tracking::text) <= 16384),
    -- Print-on-demand (Phase 4). pod_provider/pod_external_order_id are promoted
    -- from pod_ref into first-class columns so the external provider order id can
    -- be uniquely constrained; pod_ref keeps any provider-specific metadata.
    -- Claim/submit lifecycle (distinct timestamps + a lease token):
    --   pod_claimed_at       — a worker leased the order for submission
    --   pod_claim_expires_at — lease bound; an expired lease is reclaimable so a
    --                          crashed worker never strands the order
    --   pod_claim_token      — lease token the claiming worker must present to
    --                          ACK; a reclaimed stale worker is rejected
    --   pod_claimed_by       — worker identity (observability)
    --   pod_submitted_at     — set ONLY after the provider accepts (ACK); once
    --                          set (with external_order_id) the claim is final
    pod_ref          JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(pod_ref) = 'object'
                            AND octet_length(pod_ref::text) <= 16384),
    -- pod_external_order_id / pod_status are stored ALREADY-trimmed (a value
    -- differing from its btrim is rejected, not silently stored with whitespace
    -- that would undermine external-id uniqueness).
    pod_provider          TEXT
                     CHECK (pod_provider IS NULL
                            OR (pod_provider = lower(btrim(pod_provider))
                                AND length(pod_provider) BETWEEN 1 AND 64)),
    pod_external_order_id TEXT
                     CHECK (pod_external_order_id IS NULL
                            OR (pod_external_order_id = btrim(pod_external_order_id)
                                AND length(pod_external_order_id) BETWEEN 1 AND 255)),
    pod_status            TEXT
                     CHECK (pod_status IS NULL
                            OR (pod_status = btrim(pod_status)
                                AND length(pod_status) BETWEEN 1 AND 64)),
    pod_claimed_at        TIMESTAMPTZ,
    pod_claim_expires_at  TIMESTAMPTZ,
    pod_claim_token       UUID,
    pod_claimed_by        TEXT
                     CHECK (pod_claimed_by IS NULL
                            OR (pod_claimed_by = btrim(pod_claimed_by)
                                AND length(pod_claimed_by) BETWEEN 1 AND 128)),
    pod_submitted_at      TIMESTAMPTZ,
    -- Dedupe identity is (account, idempotency_key): the advisory lock and the
    -- replay query are both account-scoped, so uniqueness must be too. A global
    -- unique key would turn a UUID collision across two accounts into a raw
    -- 23505 rollback instead of the account-scoped replay path.
    idempotency_key  UUID NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT store_order_account_key_uq UNIQUE (account_id, idempotency_key),
    -- Money integrity: a debit ledger exists iff money moved, and the captured
    -- total equals unit_price * qty (numeric cast avoids bigint overflow in the
    -- check itself).
    CONSTRAINT store_order_ledger_ck CHECK (
        (credits_amount = 0 AND ledger_id IS NULL)
        OR (credits_amount > 0 AND ledger_id IS NOT NULL)
    ),
    CONSTRAINT store_order_amount_ck CHECK (
        credits_amount::numeric = unit_price::numeric * qty::numeric
    ),
    -- A refunded order with money captured must carry its refund ledger id.
    CONSTRAINT store_order_refund_ledger_ck CHECK (
        status <> 'refunded' OR credits_amount = 0 OR refund_ledger_id IS NOT NULL
    ),
    -- Variant must belong to product_id (NULL variant allowed — PG skips the
    -- composite FK when any referencing column is NULL).
    CONSTRAINT store_order_product_variant_fk
        FOREIGN KEY (product_id, variant_id)
        REFERENCES store.product_variant (product_id, variant_id),
    -- POD lifecycle invariants: reject contradictory column combinations from
    -- maintenance / privileged writes. provider identity, external id and the
    -- submit stamp are a paired TRIPLE: all absent (unsubmitted) or all present
    -- (ACKed). A lease keeps token+expiry together (both cleared on ACK,
    -- claimed_at retained for audit) with expiry after the claim. claimed_by
    -- implies a claim; and a retained claimed_at must correspond to either an
    -- active lease (token) or a completed submission.
    CONSTRAINT store_order_pod_identity_ck
        CHECK ((pod_provider IS NULL AND pod_external_order_id IS NULL AND pod_submitted_at IS NULL)
            OR (pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL AND pod_submitted_at IS NOT NULL)),
    CONSTRAINT store_order_pod_lease_ck
        CHECK ((pod_claim_token IS NULL) = (pod_claim_expires_at IS NULL)),
    CONSTRAINT store_order_pod_claim_time_ck
        CHECK (pod_claim_expires_at IS NULL
               OR (pod_claimed_at IS NOT NULL AND pod_claim_expires_at > pod_claimed_at)),
    CONSTRAINT store_order_pod_claimed_by_ck
        CHECK (pod_claimed_by IS NULL OR pod_claimed_at IS NOT NULL),
    CONSTRAINT store_order_pod_claimed_at_ck
        CHECK (pod_claimed_at IS NULL OR pod_claim_token IS NOT NULL OR pod_submitted_at IS NOT NULL)
);

CREATE INDEX store_order_account_created_idx
    ON store.order (account_id, created_at DESC, order_id DESC);
CREATE INDEX store_order_open_idx
    ON store.order (status, updated_at)
    WHERE status IN ('paid', 'processing');
-- Serves the staff queue: filter by status, ORDER BY order_id DESC.
CREATE INDEX store_order_status_order_id_idx
    ON store.order (status, order_id DESC);
-- One local order per external POD order — a provider id can't be attached to
-- two orders.
CREATE UNIQUE INDEX store_order_pod_external_uq
    ON store.order (pod_provider, pod_external_order_id)
    WHERE pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL;
-- Supports a POD reaper/queue scanning for claimable (never-submitted, expired-
-- or un-leased) physical orders by claim expiry.
CREATE INDEX store_order_pod_claimable_idx
    ON store.order (pod_claim_expires_at, order_id)
    WHERE fulfillment IN ('physical', 'both')
      AND status IN ('paid', 'processing')
      AND pod_submitted_at IS NULL;

COMMENT ON TABLE store.order IS
    'Physical/both store orders. Born paid (debit precedes insert in one txn). advance_order moves forward; refund credits back + restores stock + revokes twin.';

-- ============================================================================
-- TABLE: store.order_event — append-only order state journal.
--   BEFORE UPDATE/DELETE trigger blocks mutation.
-- ============================================================================

CREATE TABLE store.order_event (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES store.order(order_id) ON DELETE CASCADE,
    from_status store.order_status,
    to_status   store.order_status NOT NULL,
    actor       TEXT NOT NULL,
    note        TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX store_order_event_order_idx ON store.order_event (order_id, created_at);

CREATE OR REPLACE FUNCTION store.order_event_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'store.order_event is append-only' USING ERRCODE = '0A000';
END;
$$;
ALTER FUNCTION store.order_event_block_mutation() OWNER TO service_role;

CREATE TRIGGER store_order_event_no_update
    BEFORE UPDATE OR DELETE ON store.order_event
    FOR EACH ROW EXECUTE FUNCTION store.order_event_block_mutation();

-- ============================================================================
-- TABLE: store.topup_package — server-authoritative Stripe credit packs.
--   service_apply_topup derives the credit grant from HERE by pack_id; the
--   webhook forwards only a pack_id (+ the Stripe-charged amount) and never a
--   credit amount, so a compromised/buggy handler can at most name a valid pack.
--   amount_cents is the pack's expected fiat price; service_apply_topup rejects
--   a Stripe amount that doesn't match it.
-- ============================================================================

CREATE TABLE store.topup_package (
    pack_id       TEXT PRIMARY KEY
                  CHECK (pack_id = btrim(pack_id) AND length(pack_id) BETWEEN 1 AND 64),
    credits       BIGINT NOT NULL CHECK (credits > 0 AND credits <= 100000000),
    amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    -- Binds the expected fiat currency so "100 cents" can't be satisfied by a
    -- different currency (USD vs EUR vs JPY). service_apply_topup verifies the
    -- Stripe currency equals this.
    currency_fiat TEXT NOT NULL DEFAULT 'usd'
                  CHECK (currency_fiat = lower(btrim(currency_fiat))
                         AND currency_fiat ~ '^[a-z]{3}$'),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Composite target so a topup receipt can carry a FK proving its recorded
    -- economics equal this pack's (economics are immutable per pack_id).
    CONSTRAINT store_topup_package_economics_uq
        UNIQUE (pack_id, credits, amount_cents, currency_fiat)
);
COMMENT ON TABLE store.topup_package IS
    'Server-authoritative Stripe credit packs. service_apply_topup derives the credit grant + expected currency from this table by pack_id; the webhook never supplies a credit amount.';

-- Economic fields (credits/amount/currency) are immutable per pack_id: a durable
-- identifier must not change meaning under recorded receipts. Only `active` may
-- change; to reprice, mint a versioned pack (e.g. medium-v2). BEFORE UPDATE
-- trigger raises 22023 on any economics change.
CREATE OR REPLACE FUNCTION store.topup_package_economics_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.pack_id      <> OLD.pack_id
       OR NEW.credits      <> OLD.credits
       OR NEW.amount_cents <> OLD.amount_cents
       OR NEW.currency_fiat <> OLD.currency_fiat THEN
        RAISE EXCEPTION 'store.topup_package economics are immutable (create a versioned pack_id)'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION store.topup_package_economics_immutable() OWNER TO service_role;
CREATE TRIGGER store_topup_package_economics_immutable
    BEFORE UPDATE ON store.topup_package
    FOR EACH ROW EXECUTE FUNCTION store.topup_package_economics_immutable();

-- Seed matches the axum checkout PACKS (small/medium/large). Checkout creation
-- still lists these in Stripe; the grant authority lives here.
INSERT INTO store.topup_package (pack_id, credits, amount_cents, currency_fiat) VALUES
    ('small',  100,  100,  'usd'),
    ('medium', 550,  500,  'usd'),
    ('large',  1200, 1000, 'usd')
ON CONFLICT (pack_id) DO NOTHING;

-- ============================================================================
-- TABLE: store.topup — Stripe credit purchases (the credit on-ramp).
--   Idempotent on stripe_event_id; credits via wallet.service_credit('topup').
-- ============================================================================

-- Upper bounds are defense-in-depth against a webhook mapping bug crediting
-- a runaway amount (100M credits ~ $1M; 100M cents = $1M).
CREATE TABLE store.topup (
    topup_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id        UUID NOT NULL REFERENCES wallet.account(id),
    -- The pack named at checkout; the credit grant authority lives in
    -- store.topup_package, not in the webhook payload.
    pack_id           TEXT NOT NULL REFERENCES store.topup_package(pack_id),
    stripe_event_id   TEXT NOT NULL UNIQUE   -- idempotency on the webhook
                      CHECK (stripe_event_id = btrim(stripe_event_id)
                             AND length(stripe_event_id) BETWEEN 1 AND 255),
    -- The Checkout Session is the strongest economic-dedupe identity, so it is
    -- mandatory + globally unique (this function only handles session-completion
    -- top-ups). A future non-session Stripe flow would add a typed identity, not
    -- relax this one.
    stripe_session_id TEXT NOT NULL UNIQUE
                      CHECK (stripe_session_id = btrim(stripe_session_id)
                             AND length(stripe_session_id) BETWEEN 1 AND 255),
    credits_granted   BIGINT NOT NULL
                      CHECK (credits_granted > 0 AND credits_granted <= 100000000),
    amount_cents      BIGINT NOT NULL
                      CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd'
                      CHECK (currency_fiat ~ '^[a-z]{3}$'),
    -- A 'completed' top-up must correspond to a real wallet credit; enforce it
    -- so a direct/faulty insert can't record completion without a ledger row.
    -- FK to the ledger (RI checks bypass RLS) so the id can't be fabricated.
    -- RESTRICT: ledger rows are immutable accounting, never hard-deleted.
    ledger_id         BIGINT NOT NULL REFERENCES wallet.ledger(id) ON DELETE RESTRICT,
    -- Only 'completed' exists: there is no topup-refund flow (no refund ledger /
    -- timestamp / balance-reversal invariant), so a 'refunded' status would be
    -- unbacked. Add it together with that machinery when refunds are built.
    status            TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Composite FK proving the recorded economics equal the referenced pack's
    -- (which are immutable), so a direct/maintenance write can't create a receipt
    -- whose credits/amount/currency contradict its pack.
    CONSTRAINT store_topup_package_economics_fk
        FOREIGN KEY (pack_id, credits_granted, amount_cents, currency_fiat)
        REFERENCES store.topup_package (pack_id, credits, amount_cents, currency_fiat)
        ON DELETE RESTRICT
);

CREATE INDEX store_topup_account_idx ON store.topup (account_id, created_at DESC);

-- stripe_session_id is now NOT NULL UNIQUE (a plain column constraint), so the
-- old partial `store_topup_stripe_session_uq` unique index is dropped — the
-- Checkout Session still can't credit twice, enforced by the column UNIQUE.

COMMENT ON TABLE store.topup IS
    'Stripe credit purchases. Idempotent on stripe_event_id. Credits the wallet via wallet.service_credit(source_kind=topup).';

-- ============================================================================
-- TABLE: store.pod_webhook_event — durable, append-only POD webhook receipts.
--   Provider-event dedupe identity (provider, provider_event_id) for auditing
--   delivery, detecting contradictory replays, and investigating provider
--   disputes. order_id is nullable (an event may arrive before/without a
--   resolvable local order); external_order_id keeps the provider reference so
--   an orphan event is still reconcilable.
--   PRIVACY: the caller stores an ALLOWLISTED, PII-reduced payload (event id,
--   type, status, tracking numbers) — NOT the raw provider body with recipient
--   name/address — because RLS does not protect backups/exports. The webhook
--   SIGNATURE is still verified in the transport before service_apply_pod_shipment
--   is called. Reuses store.order_event_block_mutation as its BEFORE UPDATE/DELETE
--   guard.
-- ============================================================================

CREATE TABLE store.pod_webhook_event (
    event_pk          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider          TEXT NOT NULL
                      CHECK (provider = lower(btrim(provider)) AND length(provider) BETWEEN 1 AND 64),
    provider_event_id TEXT NOT NULL
                      CHECK (provider_event_id = btrim(provider_event_id)
                             AND length(provider_event_id) BETWEEN 1 AND 255),
    -- order_id is resolved INTERNALLY from (provider, external_order_id) by the
    -- apply function (the caller never supplies it), so it can never disagree
    -- with the provider identity. NULL only for an orphan (no matching order).
    order_id          BIGINT REFERENCES store.order(order_id),
    external_order_id TEXT
                      CHECK (external_order_id IS NULL
                             OR (external_order_id = btrim(external_order_id)
                                 AND length(external_order_id) BETWEEN 1 AND 255)),
    tracking          JSONB NOT NULL DEFAULT '{}'::jsonb
                      CHECK (jsonb_typeof(tracking) = 'object'
                             AND octet_length(tracking::text) <= 16384),
    -- Outcome recorded AT INSERT (append-only friendly): the effect the event
    -- had given the order's state when it arrived.
    outcome           TEXT NOT NULL DEFAULT 'orphan'
                      CHECK (outcome IN ('applied', 'orphan', 'noop_terminal')),
    applied_order_status store.order_status,
    payload           JSONB NOT NULL DEFAULT '{}'::jsonb
                      CHECK (jsonb_typeof(payload) = 'object'
                             AND octet_length(payload::text) <= 65536),
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_event_id),
    -- Every receipt carries at least one routing identity.
    CONSTRAINT store_pod_webhook_identity_ck
        CHECK (order_id IS NOT NULL OR external_order_id IS NOT NULL)
);
CREATE INDEX store_pod_webhook_event_order_idx ON store.pod_webhook_event (order_id, received_at);
-- Reconciliation queue for orphan events (arrived without a resolvable order).
CREATE INDEX store_pod_webhook_orphan_external_idx
    ON store.pod_webhook_event (provider, external_order_id, received_at)
    WHERE order_id IS NULL AND external_order_id IS NOT NULL;

CREATE TRIGGER store_pod_webhook_event_no_mutate
    BEFORE UPDATE OR DELETE ON store.pod_webhook_event
    FOR EACH ROW EXECUTE FUNCTION store.order_event_block_mutation();

-- ============================================================================
-- TABLE GRANTS — defense-in-depth.
--   store/private tables are reachable only via SECURITY DEFINER proxies
--   (anon/authenticated have no schema USAGE). Explicitly revoke any table
--   access that project-wide DEFAULT PRIVILEGES might otherwise grant.
-- ============================================================================

-- The init/topup migrations grant the definer RPCs' role (service_role at the
-- time) explicit table + sequence access. The privilege-hardening migration
-- (see PRIVILEGE MODEL below) REVOKES this blanket service_role access and
-- replaces it with owner-scoped access under store_api_owner — the grants here
-- mirror the pre-hardening state.
-- No RPC ever DELETEs a store row (append-only events, orders, receipts, top-ups
-- are retained), so DELETE is withheld — the contract is SELECT/INSERT/UPDATE.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA store TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA store   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- PRIVILEGE MODEL — separate the store's function OWNER from the API role.
--   Mirror of 20260709180000_store_privilege_hardening.sql.
--
-- Before hardening the store's SECURITY DEFINER RPCs ran as service_role, which
-- also held direct SELECT/INSERT/UPDATE on every store table — anyone with the
-- Supabase service key could bypass the RPC invariants and write orders /
-- receipts / stock / top-ups / fulfillment directly. Hardening introduces a
-- dedicated NOLOGIN role (store_api_owner) that OWNS the store tables + the
-- definer functions; service_role keeps EXECUTE on the RPCs only, so the sole
-- write path is the RPC that enforces the invariants.
--
--   -- Dedicated owner role (NOLOGIN NOINHERIT), created if absent.
--   CREATE ROLE store_api_owner NOLOGIN NOINHERIT;
--
--   -- Reach its own objects + the cross-schema objects the definer bodies touch.
--   GRANT USAGE ON SCHEMA store, private        TO store_api_owner;
--   GRANT USAGE ON SCHEMA wallet, inventory     TO store_api_owner;
--   -- private.proxy_store_caller_account() resolves auth.uid(); the new owner is
--   -- not service_role, so grant the auth access explicitly (a runtime blocker
--   -- for the authenticated proxy path otherwise).
--   GRANT USAGE ON SCHEMA auth               TO store_api_owner;
--   GRANT EXECUTE ON FUNCTION auth.uid()     TO store_api_owner;
--
--   -- wallet: read accounts + move credits via the wallet's OWN definer funcs
--   -- (EXECUTE only — ledger writes run under the wallet role, not this owner).
--   GRANT SELECT ON wallet.account TO store_api_owner;
--   -- wallet.account is FORCE-RLS + service_role-only policy; the store owner is
--   -- not BYPASSRLS, so it needs an explicit READ policy to resolve accounts.
--   CREATE POLICY "store_api_owner_read" ON wallet.account
--       FOR SELECT TO store_api_owner USING (true);
--   GRANT EXECUTE ON FUNCTION wallet.service_debit(...)  TO store_api_owner;
--   GRANT EXECUTE ON FUNCTION wallet.service_credit(...) TO store_api_owner;
--
--   -- inventory: buy/refund paths mint, read, consume items + append transitions.
--   -- The ONLY column a refund updates is state (+ updated_at), so UPDATE is
--   -- column-scoped rather than whole-row, keeping the owner from touching
--   -- owner_account, qty, nbt, etc. on arbitrary items.
--   GRANT SELECT, INSERT           ON inventory.item      TO store_api_owner;
--   GRANT UPDATE (state, updated_at) ON inventory.item    TO store_api_owner;
--   GRANT SELECT, INSERT        ON inventory.transition  TO store_api_owner;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO store_api_owner;
--
--   -- Reassign ownership of every store table + enum, and every store proxy
--   -- function in public/private, to store_api_owner (a DO loop in the migration)
--   -- so the definer bodies execute AS store_api_owner. Indexes + IDENTITY
--   -- sequences follow their table's owner.
--   ALTER TABLE store.<t>    OWNER TO store_api_owner;   -- all store tables
--   ALTER TYPE  store.order_status OWNER TO store_api_owner;
--   ALTER FUNCTION store.<f>(...)  OWNER TO store_api_owner;   -- all store funcs
--   -- The public/private proxies live in SHARED schemas, so they are reassigned
--   -- by EXACT signature (never by name pattern) — the boundary can't silently
--   -- widen to an unrelated same-prefix function or miss a differently-named one:
--   ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) OWNER TO store_api_owner;
--   ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT)                OWNER TO store_api_owner;
--   ALTER FUNCTION public.proxy_store_my_entitlements_readonly()                   OWNER TO store_api_owner;
--   ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO store_api_owner;
--   ALTER FUNCTION public.proxy_store_buy(TEXT, UUID)                              OWNER TO store_api_owner;
--   ALTER FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID)      OWNER TO store_api_owner;
--   ALTER FUNCTION private.proxy_store_caller_account()                            OWNER TO store_api_owner;
--
--   -- service_role is now EXECUTE-only: strip the blanket table/sequence access
--   -- the init/topup migrations granted (the RPC EXECUTE grants remain).
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA store FROM service_role;
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA store FROM service_role;
--
--   -- Defense-in-depth RLS: ENABLE (not FORCE) on all 8 store tables, including
--   -- topup_package and the PII-bearing pod_webhook_event. With no policies,
--   -- anon/authenticated (which also lack schema USAGE) are denied direct access.
--   -- FORCE is intentionally NOT used — it would subject the table-owning
--   -- store_api_owner to its own policy-less tables and break every definer RPC.
--   -- The owner/EXECUTE split, not RLS, is the real boundary (service_role is
--   -- BYPASSRLS in Supabase regardless).
--   ALTER TABLE store.product         ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.product_variant ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.purchase        ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.order           ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.order_event     ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.topup           ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.topup_package   ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE store.pod_webhook_event ENABLE ROW LEVEL SECURITY;
--
--   -- Future store objects created by store_api_owner default to no PUBLIC/anon/
--   -- authenticated access, so a later table/sequence/function can't silently
--   -- inherit unsafe privileges.
--   ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
--       REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
--       REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
--       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
--   -- Cover the store proxies the owner may create in the SHARED public/private
--   -- schemas too (functions only — a blanket table default there would touch
--   -- unrelated schemas).
--   ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA public
--       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA private
--       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
--
--   -- Also cover the MIGRATION role for the DEDICATED store schema only. NOT for
--   -- public/private (shared): a blanket migration-role default there would strip
--   -- EXECUTE from unrelated future functions. Shared-schema proxies are instead
--   -- protected by the explicit REVOKE ALL ... FROM PUBLIC, anon, authenticated
--   -- after every proxy is created (see schema_init / topup_pod).
--   ALTER DEFAULT PRIVILEGES IN SCHEMA store
--       REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA store
--       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
--
--   -- Self-contained exposure boundary for the DEDICATED store schema. NOT
--   -- private: private is shared (marketplace/wallet helpers), and a blanket
--   -- schema-level REVOKE there could break unrelated invoker-rights functions
--   -- other systems reference. The store's only private object
--   -- (proxy_store_caller_account) is already REVOKEd FROM PUBLIC, anon,
--   -- authenticated at its own definition.
--   REVOKE ALL ON SCHEMA store FROM PUBLIC, anon, authenticated;
--
--   -- On DOWN, the migration-role ALTER DEFAULT PRIVILEGES in the store schema is
--   -- intentionally NOT reversed: it only tightens future-object defaults in the
--   -- dedicated store schema (revoke PUBLIC execute/access), which is safe to
--   -- leave after rollback, and re-granting it would re-open that default. The
--   -- store_api_owner-scoped defaults are cleared by DROP OWNED BY on role drop.
-- ============================================================================
