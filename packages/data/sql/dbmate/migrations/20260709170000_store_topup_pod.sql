-- migrate:up

-- Phase 3: Stripe credit on-ramp. A completed Stripe Checkout Session credits
-- the caller's wallet. Idempotent on the Stripe event id so webhook replays
-- never double-credit. This is the ONLY path that touches Stripe; the store
-- itself only ever spends credits.

DO $$
BEGIN
    IF to_regprocedure(
        'wallet.service_credit(uuid, wallet.currency_kind, bigint, wallet.source_kind, text, text, bigint, uuid)'
    ) IS NULL THEN
        RAISE EXCEPTION 'missing wallet.service_credit';
    END IF;
    -- FK target for store.topup.ledger_id.
    IF to_regclass('wallet.ledger') IS NULL THEN
        RAISE EXCEPTION 'missing wallet.ledger';
    END IF;
END
$$;

-- Server-authoritative credit packs. The webhook forwards only a pack_id (+ the
-- Stripe-charged amount); the credit grant is loaded from HERE, so a compromised
-- or buggy webhook handler cannot mint an arbitrary credit amount — the worst it
-- can do is name a valid pack. amount_cents is the pack's expected fiat price;
-- service_apply_topup rejects a Stripe amount that doesn't match it.
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
-- change; to reprice, mint a versioned pack (e.g. medium-v2).
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

CREATE TABLE store.topup (
    topup_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id        UUID NOT NULL REFERENCES wallet.account(id),
    pack_id           TEXT NOT NULL REFERENCES store.topup_package(pack_id),
    stripe_event_id   TEXT NOT NULL UNIQUE
                      CHECK (stripe_event_id = btrim(stripe_event_id)
                             AND length(stripe_event_id) BETWEEN 1 AND 255),
    -- The Checkout Session is the strongest economic-dedupe identity, so it is
    -- mandatory + globally unique (this function only handles session-completion
    -- top-ups). A future non-session Stripe flow would add a typed identity, not
    -- relax this one.
    stripe_session_id TEXT NOT NULL UNIQUE
                      CHECK (stripe_session_id = btrim(stripe_session_id)
                             AND length(stripe_session_id) BETWEEN 1 AND 255),
    -- Upper bounds are defense-in-depth against a webhook mapping bug crediting
    -- a runaway amount (100M credits ~ $1M; 100M cents = $1M).
    credits_granted   BIGINT NOT NULL
                      CHECK (credits_granted > 0 AND credits_granted <= 100000000),
    amount_cents      BIGINT NOT NULL
                      CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd'
                      CHECK (currency_fiat ~ '^[a-z]{3}$'),
    -- A 'completed' top-up must correspond to a real wallet credit; enforce it
    -- so a direct/faulty insert can't record completion without a ledger row.
    -- FK to the ledger (RI checks bypass RLS) so the id can't be fabricated.
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

COMMENT ON TABLE store.topup IS
    'Stripe credit purchases. Idempotent on stripe_event_id. Credits the wallet via wallet.service_credit(source_kind=topup).';

-- service_apply_topup: resolve the wallet account from the auth user id
-- (carried in Stripe session metadata), idempotently record the topup, and
-- credit the wallet. Returns the ledger id (existing one on replay).
CREATE OR REPLACE FUNCTION store.service_apply_topup(
    p_user_id           UUID,
    p_stripe_event_id   TEXT,
    p_stripe_session_id TEXT,
    p_pack_id           TEXT,
    p_amount_cents      BIGINT,
    p_currency_fiat     TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account       UUID;
    v_row           store.topup%ROWTYPE;
    v_ledger_id     BIGINT;
    v_pack          store.topup_package%ROWTYPE;
    v_credits       BIGINT;
    v_pack_id       TEXT := btrim(COALESCE(p_pack_id, ''));
    v_event_id      TEXT := btrim(p_stripe_event_id);
    v_session_id    TEXT := NULLIF(btrim(p_stripe_session_id), '');
    v_currency_fiat TEXT := lower(btrim(COALESCE(p_currency_fiat, 'usd')));
BEGIN
    IF p_user_id IS NULL OR coalesce(length(v_event_id), 0) = 0
       OR coalesce(length(v_session_id), 0) = 0
       OR coalesce(length(v_pack_id), 0) = 0 THEN
        RAISE EXCEPTION 'user_id, stripe_event_id, stripe_session_id and pack_id are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'amount_cents must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_amount_cents > 100000000 THEN
        RAISE EXCEPTION 'amount_cents exceeds maximum' USING ERRCODE = '22023';
    END IF;
    IF v_currency_fiat !~ '^[a-z]{3}$' THEN
        RAISE EXCEPTION 'currency_fiat must be a 3-letter ISO code' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_account
      FROM wallet.account WHERE kind = 'user' AND user_id = p_user_id;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;

    -- Replay is validated against the IMMUTABLE recorded receipt, BEFORE loading
    -- the (possibly since-deactivated or re-versioned) package — a completed
    -- session must retry successfully even after the pack is deactivated. The
    -- fingerprint compares the recorded pack_id/amount/currency, which (given
    -- pack economics are immutable) pins the credits too. Session-level first:
    -- two distinct Stripe events can reference the same Checkout Session.
    IF v_session_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('store.topup.session:' || v_session_id, 0));
        SELECT * INTO v_row FROM store.topup WHERE stripe_session_id = v_session_id;
        IF FOUND THEN
            IF v_row.account_id <> v_account
               OR v_row.pack_id <> v_pack_id
               OR v_row.amount_cents <> p_amount_cents
               OR v_row.currency_fiat <> v_currency_fiat THEN
                RAISE EXCEPTION 'topup replay payload mismatch for session %', v_session_id
                    USING ERRCODE = '40001';
            END IF;
            RETURN v_row.ledger_id;
        END IF;
    END IF;

    -- Serialize concurrent webhook deliveries for this event so the losing
    -- delivery returns the existing ledger id idempotently instead of hitting
    -- the unique constraint and rolling back.
    PERFORM pg_advisory_xact_lock(hashtextextended('store.topup:' || v_event_id, 0));

    -- Idempotent replay: this Stripe event already applied (re-checked under lock).
    SELECT * INTO v_row FROM store.topup WHERE stripe_event_id = v_event_id;
    IF FOUND THEN
        IF v_row.account_id <> v_account
           OR v_row.pack_id <> v_pack_id
           OR v_row.amount_cents <> p_amount_cents
           OR v_row.currency_fiat <> v_currency_fiat
           OR v_row.stripe_session_id IS DISTINCT FROM v_session_id THEN
            RAISE EXCEPTION 'topup replay payload mismatch for event %', v_event_id
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row.ledger_id;
    END IF;

    -- NEW top-up: only now require an ACTIVE package. Credits are AUTHORITATIVE
    -- from the table (never a caller-supplied amount), the Stripe-charged amount
    -- must equal the pack price, and the currency must equal the pack currency.
    SELECT * INTO v_pack FROM store.topup_package
     WHERE pack_id = v_pack_id AND active;
    IF v_pack.pack_id IS NULL THEN
        RAISE EXCEPTION 'unknown or inactive topup pack %', v_pack_id USING ERRCODE = '22023';
    END IF;
    v_credits := v_pack.credits;
    IF p_amount_cents <> v_pack.amount_cents THEN
        RAISE EXCEPTION 'amount_cents % does not match pack % price %',
            p_amount_cents, v_pack_id, v_pack.amount_cents USING ERRCODE = '22023';
    END IF;
    IF v_currency_fiat <> v_pack.currency_fiat THEN
        RAISE EXCEPTION 'currency % does not match pack % currency %',
            v_currency_fiat, v_pack_id, v_pack.currency_fiat USING ERRCODE = '22023';
    END IF;

    -- Deterministic wallet idempotency key derived from the Checkout SESSION
    -- (the strongest economic identity, now mandatory), so the store receipt and
    -- the wallet ledger dedupe on the same thing: two distinct Stripe events for
    -- one session can't split into two ledger credits even outside the
    -- advisory-lock window.
    v_ledger_id := wallet.service_credit(
        v_account,
        'credits'::wallet.currency_kind,
        v_credits,
        'topup'::wallet.source_kind,
        'stripe credit topup',
        'stripe_session',
        NULL,
        md5('store_topup_session:' || v_session_id)::uuid
    );

    INSERT INTO store.topup (
        account_id, pack_id, stripe_event_id, stripe_session_id,
        credits_granted, amount_cents, currency_fiat, ledger_id
    ) VALUES (
        v_account, v_pack_id, v_event_id, v_session_id,
        v_credits, p_amount_cents, v_currency_fiat, v_ledger_id
    );

    RETURN v_ledger_id;
END;
$$;
ALTER FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Phase 4: print-on-demand fulfillment. A physical order can be submitted to a
-- POD provider (Printful/Printify); its external id + status ride on
-- store.order.pod_ref. Shipment webhooks advance the order to 'shipped'. No
-- new order states — POD slots into the Phase 2 status pipeline.

DO $$
BEGIN
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'missing store.order — apply store_orders first';
    END IF;
END
$$;

ALTER TABLE store.order
    ADD COLUMN IF NOT EXISTS pod_ref JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(pod_ref) = 'object'
               AND octet_length(pod_ref::text) <= 16384),
    -- Promoted from pod_ref JSONB into first-class columns so the external
    -- provider order id can be uniquely constrained (pod_ref keeps any
    -- provider-specific metadata). Bounded + normalized (provider lowercased).
    ADD COLUMN IF NOT EXISTS pod_provider TEXT
        CHECK (pod_provider IS NULL
               OR (pod_provider = lower(btrim(pod_provider))
                   AND length(pod_provider) BETWEEN 1 AND 64)),
    -- Stored already-trimmed (a value differing from its btrim is rejected, not
    -- silently stored with whitespace that would undermine external-id
    -- uniqueness).
    ADD COLUMN IF NOT EXISTS pod_external_order_id TEXT
        CHECK (pod_external_order_id IS NULL
               OR (pod_external_order_id = btrim(pod_external_order_id)
                   AND length(pod_external_order_id) BETWEEN 1 AND 255)),
    ADD COLUMN IF NOT EXISTS pod_status TEXT
        CHECK (pod_status IS NULL
               OR (pod_status = btrim(pod_status)
                   AND length(pod_status) BETWEEN 1 AND 64)),
    -- Claim/submit lifecycle (distinct timestamps):
    --   pod_claimed_at       — a worker leased the order for submission
    --   pod_claim_expires_at — lease bound; an expired lease is reclaimable so a
    --                          crashed worker never strands the order
    --   pod_claim_token      — lease token the claiming worker must present to
    --                          ACK; a stale worker whose lease was reclaimed is
    --                          rejected (no double-write)
    --   pod_claimed_by       — worker identity (observability)
    --   pod_submitted_at     — set ONLY after the provider accepts (ACK); once
    --                          set (with external_order_id) the claim is final
    ADD COLUMN IF NOT EXISTS pod_claimed_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pod_claim_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pod_claim_token      UUID,
    ADD COLUMN IF NOT EXISTS pod_claimed_by       TEXT
        CHECK (pod_claimed_by IS NULL
               OR (pod_claimed_by = btrim(pod_claimed_by)
                   AND length(pod_claimed_by) BETWEEN 1 AND 128)),
    ADD COLUMN IF NOT EXISTS pod_submitted_at     TIMESTAMPTZ;

-- POD lifecycle invariants: reject contradictory column combinations from
-- maintenance / privileged writes. provider<->external are paired; a lease keeps
-- token+expiry together (both cleared on ACK, claimed_at retained for audit)
-- with expiry after the claim; a submission requires the full provider identity.
ALTER TABLE store.order
    -- provider identity, external id and the submit stamp are a paired triple:
    -- all absent (unsubmitted) or all present (ACKed). A lease keeps token+expiry
    -- together (both cleared on ACK) with expiry after the claim. claimed_by
    -- implies a claim; and a retained claimed_at must correspond to either an
    -- active lease (token) or a completed submission.
    ADD CONSTRAINT store_order_pod_identity_ck
        CHECK ((pod_provider IS NULL AND pod_external_order_id IS NULL AND pod_submitted_at IS NULL)
            OR (pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL AND pod_submitted_at IS NOT NULL)),
    ADD CONSTRAINT store_order_pod_lease_ck
        CHECK ((pod_claim_token IS NULL) = (pod_claim_expires_at IS NULL)),
    ADD CONSTRAINT store_order_pod_claim_time_ck
        CHECK (pod_claim_expires_at IS NULL
               OR (pod_claimed_at IS NOT NULL AND pod_claim_expires_at > pod_claimed_at)),
    ADD CONSTRAINT store_order_pod_claimed_by_ck
        CHECK (pod_claimed_by IS NULL OR pod_claimed_at IS NOT NULL),
    ADD CONSTRAINT store_order_pod_claimed_at_ck
        CHECK (pod_claimed_at IS NULL OR pod_claim_token IS NOT NULL OR pod_submitted_at IS NOT NULL);

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

-- service_ack_pod_submission — record a CONFIRMED provider submission. Requires
-- the lease token from service_order_for_pod (a worker whose lease was reclaimed
-- is rejected -> no double-write), and a complete provider identity (provider +
-- external_order_id). Sets pod_submitted_at, promotes the identity set-once, and
-- shallow-merges pod_ref. This is the ONLY path that establishes external
-- identity; a status webhook cannot masquerade as an acknowledgement.
CREATE OR REPLACE FUNCTION store.service_ack_pod_submission(
    p_order_id    BIGINT,
    p_claim_token UUID,
    p_pod_ref     JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new      JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_order    store.order%ROWTYPE;
    v_merged   JSONB;
    v_provider TEXT := NULLIF(lower(btrim(v_new->>'provider')), '');
    v_ext_id   TEXT := NULLIF(btrim(v_new->>'external_order_id'), '');
    v_pstatus  TEXT := NULLIF(btrim(v_new->>'status'), '');
BEGIN
    IF jsonb_typeof(v_new) <> 'object' OR octet_length(v_new::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object under 16KB' USING ERRCODE = '22023';
    END IF;
    IF p_claim_token IS NULL THEN
        RAISE EXCEPTION 'claim token is required to acknowledge a POD submission'
            USING ERRCODE = '22004';
    END IF;
    IF v_provider IS NULL OR v_ext_id IS NULL THEN
        RAISE EXCEPTION 'POD acknowledgement requires provider and external_order_id'
            USING ERRCODE = '22023';
    END IF;

    -- Eligibility from the fulfillment SNAPSHOT (not the live product row).
    SELECT o.* INTO v_order
      FROM store.order o
     WHERE o.order_id = p_order_id
       AND o.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped')
     FOR UPDATE OF o;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for a POD acknowledgement', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- The lease token must match the current claim: a stale worker whose lease
    -- expired and was reclaimed by another worker holds an old token and is
    -- rejected here, preventing both workers writing the same order.
    IF v_order.pod_claim_token IS NULL OR v_order.pod_claim_token <> p_claim_token THEN
        RAISE EXCEPTION 'order % POD claim token is stale or missing', p_order_id
            USING ERRCODE = '55006';
    END IF;

    -- Provider identity is set-once (idempotent re-ACK with identical values is
    -- allowed; a different value is rejected).
    IF v_order.pod_provider IS NOT NULL AND v_order.pod_provider <> v_provider THEN
        RAISE EXCEPTION 'order % pod_provider is immutable once set', p_order_id
            USING ERRCODE = '22023';
    END IF;
    IF v_order.pod_external_order_id IS NOT NULL AND v_order.pod_external_order_id <> v_ext_id THEN
        RAISE EXCEPTION 'order % pod_external_order_id is immutable once set', p_order_id
            USING ERRCODE = '22023';
    END IF;

    v_merged := v_order.pod_ref || v_new;
    IF octet_length(v_merged::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref too large after merge' USING ERRCODE = '22023';
    END IF;

    -- Change predicate covers pod_ref AND every promoted column + the submission
    -- stamp, so a repair where the JSON already matches but a promoted column is
    -- stale/null still writes.
    -- ACK finalizes the lease: clear the transient token + expiry so the row no
    -- longer looks actively leased to operational queries (pod_claimed_at /
    -- pod_claimed_by are kept for audit). pod_submitted_at is the durable
    -- "already submitted" guard.
    UPDATE store.order
       SET pod_ref               = v_merged,
           pod_provider          = v_provider,
           pod_external_order_id = v_ext_id,
           pod_status            = COALESCE(v_pstatus, pod_status, 'submitted'),
           pod_submitted_at      = COALESCE(pod_submitted_at, now()),
           pod_claim_token       = NULL,
           pod_claim_expires_at  = NULL,
           updated_at            = now()
     WHERE order_id = p_order_id
       AND (pod_ref               IS DISTINCT FROM v_merged
         OR pod_provider          IS DISTINCT FROM v_provider
         OR pod_external_order_id IS DISTINCT FROM v_ext_id
         OR pod_status            IS DISTINCT FROM COALESCE(v_pstatus, pod_status, 'submitted')
         OR pod_submitted_at      IS NULL
         OR pod_claim_token       IS NOT NULL);
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_order.status, v_order.status, 'pod', 'pod submission acked', v_merged);
    END IF;
END;
$$;
ALTER FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) TO service_role;

-- service_update_pod_status — status/metadata-only updates (e.g. provider
-- webhooks) AFTER an external identity exists. Never establishes or mutates the
-- provider identity; shallow-merges metadata into pod_ref.
CREATE OR REPLACE FUNCTION store.service_update_pod_status(
    p_order_id BIGINT,
    p_pod_ref  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new     JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_order   store.order%ROWTYPE;
    v_merged  JSONB;
    v_pstatus TEXT := NULLIF(btrim(v_new->>'status'), '');
BEGIN
    IF jsonb_typeof(v_new) <> 'object' OR octet_length(v_new::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object under 16KB' USING ERRCODE = '22023';
    END IF;

    -- 'delivered' is included so post-delivery provider events (proof-of-
    -- delivery, corrected tracking) can still update metadata; refunded/cancelled
    -- stay ineligible.
    SELECT o.* INTO v_order
      FROM store.order o
     WHERE o.order_id = p_order_id
       AND o.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
     FOR UPDATE OF o;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for a POD status update', p_order_id
            USING ERRCODE = 'P1001';
    END IF;
    IF v_order.pod_external_order_id IS NULL THEN
        RAISE EXCEPTION 'order % has no POD submission to update', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- Reject any attempt to change the provider identity via this path.
    IF (v_new ? 'provider'
        AND NULLIF(lower(btrim(v_new->>'provider')), '') IS DISTINCT FROM v_order.pod_provider)
       OR (v_new ? 'external_order_id'
           AND NULLIF(btrim(v_new->>'external_order_id'), '') IS DISTINCT FROM v_order.pod_external_order_id) THEN
        RAISE EXCEPTION 'POD provider identity is immutable; update status/metadata only'
            USING ERRCODE = '22023';
    END IF;

    v_merged := v_order.pod_ref || v_new;
    IF octet_length(v_merged::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref too large after merge' USING ERRCODE = '22023';
    END IF;

    UPDATE store.order
       SET pod_ref    = v_merged,
           pod_status = COALESCE(v_pstatus, pod_status),
           updated_at = now()
     WHERE order_id = p_order_id
       AND (pod_ref    IS DISTINCT FROM v_merged
         OR pod_status IS DISTINCT FROM COALESCE(v_pstatus, pod_status));
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_order.status, v_order.status, 'pod', 'pod status updated', v_merged);
    END IF;
END;
$$;
ALTER FUNCTION store.service_update_pod_status(BIGINT, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_update_pod_status(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_update_pod_status(BIGINT, JSONB) TO service_role;

-- Durable, append-only POD webhook receipts. Provider-event dedupe identity
-- (provider, provider_event_id) for auditing delivery, detecting contradictory
-- replays, and investigating provider disputes. order_id is nullable (an event
-- may arrive before/without a resolvable local order); external_order_id keeps
-- the provider reference so an orphan event is still reconcilable.
-- PRIVACY: the caller stores an ALLOWLISTED, PII-reduced payload (event id,
-- type, status, tracking numbers) — NOT the raw provider body with recipient
-- name/address — because RLS does not protect backups/exports. The webhook
-- SIGNATURE is still verified in the transport before this is called.
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

-- Atomically record a POD shipment webhook AND apply its effect in ONE txn. The
-- local order is resolved INTERNALLY from (provider, external_order_id) — the
-- caller never supplies an order id — so a routing bug can't mark the wrong
-- order shipped and the receipt's order id always matches the provider identity.
-- Dedupe is (provider, provider_event_id): a byte-different replay (order /
-- external id / tracking / payload) is a contradiction (40001); an equivalent
-- replay returns false. A newly-recorded event advances a paid|processing order
-- to 'shipped' with tracking so an early event isn't lost; a terminal order is a
-- benign no-op; no matching order is recorded as an orphan for reconciliation.
-- Returns true when newly recorded. VOLATILE — write connection.
CREATE OR REPLACE FUNCTION store.service_apply_pod_shipment(
    p_provider          TEXT,
    p_event_id          TEXT,
    p_external_order_id TEXT,
    p_tracking          JSONB,
    p_payload           JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_provider TEXT := lower(btrim(COALESCE(p_provider, '')));
    v_event_id TEXT := btrim(COALESCE(p_event_id, ''));
    v_ext_id   TEXT := NULLIF(btrim(COALESCE(p_external_order_id, '')), '');
    v_payload  JSONB := COALESCE(p_payload, '{}'::jsonb);
    v_tracking JSONB := COALESCE(p_tracking, '{}'::jsonb);
    v_existing store.pod_webhook_event%ROWTYPE;
    v_order    store.order%ROWTYPE;
    v_order_id BIGINT;
    v_outcome  TEXT;
    v_applied  store.order_status;
    v_pk       BIGINT;
BEGIN
    IF length(v_provider) = 0 OR length(v_event_id) = 0 THEN
        RAISE EXCEPTION 'provider and provider_event_id are required' USING ERRCODE = '22004';
    END IF;
    IF v_ext_id IS NULL THEN
        RAISE EXCEPTION 'external_order_id is required to route a POD shipment' USING ERRCODE = '22004';
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' OR octet_length(v_payload::text) > 65536 THEN
        RAISE EXCEPTION 'payload must be a JSON object under 64KB' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_tracking) <> 'object' OR octet_length(v_tracking::text) > 16384 THEN
        RAISE EXCEPTION 'tracking must be a JSON object under 16KB' USING ERRCODE = '22023';
    END IF;

    -- Resolve + lock the order by its provider identity (never a caller order id).
    SELECT * INTO v_order FROM store.order
     WHERE pod_provider = v_provider AND pod_external_order_id = v_ext_id
     FOR UPDATE;
    v_order_id := v_order.order_id;   -- NULL when no matching order (orphan)

    IF v_order_id IS NULL THEN
        v_outcome := 'orphan';
    ELSIF v_order.status IN ('paid', 'processing') THEN
        v_outcome := 'applied';
        v_applied := 'shipped';
    ELSE
        v_outcome := 'noop_terminal';
        v_applied := v_order.status;
    END IF;

    INSERT INTO store.pod_webhook_event (
        provider, provider_event_id, order_id, external_order_id,
        tracking, outcome, applied_order_status, payload
    )
    VALUES (v_provider, v_event_id, v_order_id, v_ext_id,
            v_tracking, v_outcome, v_applied, v_payload)
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING event_pk INTO v_pk;

    IF v_pk IS NULL THEN
        -- Duplicate event id: a contradictory replay is loud; an equivalent one
        -- is a no-op false. Tracking is part of the fingerprint.
        SELECT * INTO v_existing FROM store.pod_webhook_event
         WHERE provider = v_provider AND provider_event_id = v_event_id;
        IF v_existing.order_id IS DISTINCT FROM v_order_id
           OR v_existing.external_order_id IS DISTINCT FROM v_ext_id
           OR v_existing.tracking IS DISTINCT FROM v_tracking
           OR v_existing.payload IS DISTINCT FROM v_payload THEN
            RAISE EXCEPTION 'contradictory replay of POD event %/%', v_provider, v_event_id
                USING ERRCODE = '40001';
        END IF;
        RETURN false;
    END IF;

    -- Newly recorded: apply the shipment for a paid|processing order (forward
    -- advance, so an early event isn't permanently lost). Terminal/orphan = no-op.
    IF v_outcome = 'applied' THEN
        UPDATE store.order
           SET status = 'shipped',
               tracking = CASE WHEN v_tracking = '{}'::jsonb THEN tracking ELSE v_tracking END,
               updated_at = now()
         WHERE order_id = v_order_id;
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (v_order_id, v_order.status, 'shipped', 'pod', 'POD shipment', v_tracking);
    END IF;

    RETURN true;
END;
$$;
ALTER FUNCTION store.service_apply_pod_shipment(TEXT, TEXT, TEXT, JSONB, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_apply_pod_shipment(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_apply_pod_shipment(TEXT, TEXT, TEXT, JSONB, JSONB) TO service_role;

-- Atomically LEASE an order for POD submission. Locks the order, verifies
-- eligibility (from the fulfillment snapshot), rejects an already-submitted or
-- actively-leased order, then stamps a lease (pod_claimed_at + expiry + a fresh
-- pod_claim_token + worker id). A worker crash before ACK lets the lease expire
-- (15m) so the order is reclaimable — never permanently stranded. The returned
-- claim_token must be presented to service_ack_pod_submission; a reclaimed
-- worker's stale token is rejected there. submission_key is a deterministic
-- provider idempotency key. VOLATILE (writes the lease) — write connection.
CREATE OR REPLACE FUNCTION store.service_order_for_pod(
    p_order_id   BIGINT,
    p_claimed_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_order   store.order%ROWTYPE;
    v_token   UUID := gen_random_uuid();
BEGIN
    SELECT * INTO v_order FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;

    -- Eligibility from the order's fulfillment SNAPSHOT, not the live product,
    -- so a post-checkout catalog edit can't disqualify a paid order.
    IF v_order.status NOT IN ('paid', 'processing')
       OR v_order.fulfillment NOT IN ('physical', 'both') THEN
        RAISE EXCEPTION 'order % not eligible for POD fulfillment', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- Final once the provider accepted (submitted_at + external id). Otherwise
    -- an unexpired lease belongs to another worker; a never-leased or expired
    -- lease is (re)claimable.
    IF v_order.pod_submitted_at IS NOT NULL OR v_order.pod_external_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'order % already submitted to POD provider', p_order_id
            USING ERRCODE = '55006';
    END IF;
    IF v_order.pod_claimed_at IS NOT NULL
       AND v_order.pod_claim_expires_at IS NOT NULL
       AND v_order.pod_claim_expires_at > now() THEN
        RAISE EXCEPTION 'order % already leased for POD fulfillment', p_order_id
            USING ERRCODE = '55006';
    END IF;

    UPDATE store.order
       SET pod_status           = 'claimed',
           pod_claimed_at       = now(),
           pod_claim_expires_at = now() + interval '15 minutes',
           pod_claim_token      = v_token,
           pod_claimed_by       = NULLIF(btrim(p_claimed_by), ''),
           updated_at           = now()
     WHERE order_id = p_order_id;

    -- Payload is built entirely from the order's immutable snapshots (which are
    -- NOT NULL), so it never reads the live catalog: a rename / SKU change after
    -- checkout can't alter what is sent to the provider, and there are no extra
    -- product/variant lookups.
    RETURN jsonb_build_object(
        'order_id',         v_order.order_id,
        'qty',              v_order.qty,
        'status',           v_order.status,
        'shipping_address', v_order.shipping_address,
        'pod_ref',          v_order.pod_ref,
        'sku',              v_order.variant_sku,
        'attributes',       v_order.variant_attributes,
        'product_slug',     v_order.product_slug,
        'product_title',    v_order.product_title,
        'claim_token',      v_token,
        'submission_key',   md5('store_pod:' || v_order.order_id::text)
    );
END;
$$;
ALTER FUNCTION store.service_order_for_pod(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_order_for_pod(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_order_for_pod(BIGINT, TEXT) TO service_role;

-- store.topup was created in this migration; the definer RPCs run as
-- service_role, so grant it (and the new sequence) explicitly.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA store TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store TO service_role;
REVOKE ALL ON store.topup FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_apply_pod_shipment(TEXT, TEXT, TEXT, JSONB, JSONB);
DROP TABLE IF EXISTS store.pod_webhook_event;
DROP FUNCTION IF EXISTS store.service_order_for_pod(BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_update_pod_status(BIGINT, JSONB);
DROP FUNCTION IF EXISTS store.service_ack_pod_submission(BIGINT, UUID, JSONB);
DROP INDEX IF EXISTS store.store_order_pod_external_uq;
DROP INDEX IF EXISTS store.store_order_pod_claimable_idx;
ALTER TABLE store.order
    DROP COLUMN IF EXISTS pod_ref,
    DROP COLUMN IF EXISTS pod_provider,
    DROP COLUMN IF EXISTS pod_external_order_id,
    DROP COLUMN IF EXISTS pod_status,
    DROP COLUMN IF EXISTS pod_claimed_at,
    DROP COLUMN IF EXISTS pod_claim_expires_at,
    DROP COLUMN IF EXISTS pod_claim_token,
    DROP COLUMN IF EXISTS pod_claimed_by,
    DROP COLUMN IF EXISTS pod_submitted_at;

NOTIFY pgrst, 'reload schema';

DROP FUNCTION IF EXISTS store.service_apply_topup(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT);
DROP TABLE IF EXISTS store.topup;
DROP TRIGGER IF EXISTS store_topup_package_economics_immutable ON store.topup_package;
DROP FUNCTION IF EXISTS store.topup_package_economics_immutable();
DROP TABLE IF EXISTS store.topup_package;

NOTIFY pgrst, 'reload schema';
