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
END
$$;

CREATE TABLE store.topup (
    topup_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id        UUID NOT NULL REFERENCES wallet.account(id),
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
    ledger_id         BIGINT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed', 'refunded')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
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
    p_credits           BIGINT,
    p_amount_cents      BIGINT,
    p_currency_fiat     TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account       UUID;
    v_row           store.topup%ROWTYPE;
    v_ledger_id     BIGINT;
    v_event_id      TEXT := btrim(p_stripe_event_id);
    v_session_id    TEXT := NULLIF(btrim(p_stripe_session_id), '');
    v_currency_fiat TEXT := lower(btrim(COALESCE(p_currency_fiat, 'usd')));
BEGIN
    IF p_user_id IS NULL OR coalesce(length(v_event_id), 0) = 0
       OR coalesce(length(v_session_id), 0) = 0
       OR p_credits IS NULL OR p_credits <= 0 THEN
        RAISE EXCEPTION 'user_id, stripe_event_id, stripe_session_id and positive credits are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'amount_cents must be positive' USING ERRCODE = '22023';
    END IF;
    -- Enforce the runaway-amount caps BEFORE crediting the wallet, so an
    -- over-bound value returns a deliberate 22023 instead of doing wasted
    -- wallet work that then rolls back on the table CHECK.
    IF p_credits > 100000000 THEN
        RAISE EXCEPTION 'credits exceeds maximum' USING ERRCODE = '22023';
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

    -- Session-level idempotency first: two distinct Stripe events can reference
    -- the same Checkout Session (the thing that must not be credited twice).
    -- On replay, validate the recorded row's immutable fingerprint — a
    -- duplicate carrying contradictory account/credits/fiat data fails loudly
    -- rather than being accepted as a successful replay.
    IF v_session_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('store.topup.session:' || v_session_id, 0));
        SELECT * INTO v_row FROM store.topup WHERE stripe_session_id = v_session_id;
        IF FOUND THEN
            IF v_row.account_id <> v_account
               OR v_row.credits_granted <> p_credits
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

    -- Idempotent replay: this Stripe event already applied (re-checked under
    -- lock), with the same fingerprint validation.
    SELECT * INTO v_row FROM store.topup WHERE stripe_event_id = v_event_id;
    IF FOUND THEN
        IF v_row.account_id <> v_account
           OR v_row.credits_granted <> p_credits
           OR v_row.amount_cents <> p_amount_cents
           OR v_row.currency_fiat <> v_currency_fiat
           OR v_row.stripe_session_id IS DISTINCT FROM v_session_id THEN
            RAISE EXCEPTION 'topup replay payload mismatch for event %', v_event_id
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row.ledger_id;
    END IF;

    -- Deterministic wallet idempotency key derived from the Stripe event, so
    -- the wallet ledger itself dedupes a topup even if this proc is retried
    -- outside the advisory-lock window.
    v_ledger_id := wallet.service_credit(
        v_account,
        'credits'::wallet.currency_kind,
        p_credits,
        'topup'::wallet.source_kind,
        'stripe credit topup',
        'stripe_session',
        NULL,
        md5('store_topup:' || v_event_id)::uuid
    );

    INSERT INTO store.topup (
        account_id, stripe_event_id, stripe_session_id,
        credits_granted, amount_cents, currency_fiat, ledger_id
    ) VALUES (
        v_account, v_event_id, v_session_id,
        p_credits, p_amount_cents, v_currency_fiat, v_ledger_id
    );

    RETURN v_ledger_id;
END;
$$;
ALTER FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) TO service_role;

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
    ADD COLUMN IF NOT EXISTS pod_external_order_id TEXT
        CHECK (pod_external_order_id IS NULL
               OR length(btrim(pod_external_order_id)) BETWEEN 1 AND 255),
    ADD COLUMN IF NOT EXISTS pod_status TEXT
        CHECK (pod_status IS NULL OR length(btrim(pod_status)) BETWEEN 1 AND 64),
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
    ADD COLUMN IF NOT EXISTS pod_claimed_by       TEXT,
    ADD COLUMN IF NOT EXISTS pod_submitted_at     TIMESTAMPTZ;

-- One local order per external POD order — a provider id can't be attached to
-- two orders.
CREATE UNIQUE INDEX store_order_pod_external_uq
    ON store.order (pod_provider, pod_external_order_id)
    WHERE pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL;

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
    UPDATE store.order
       SET pod_ref               = v_merged,
           pod_provider          = v_provider,
           pod_external_order_id = v_ext_id,
           pod_status            = COALESCE(v_pstatus, pod_status, 'submitted'),
           pod_submitted_at      = COALESCE(pod_submitted_at, now()),
           updated_at            = now()
     WHERE order_id = p_order_id
       AND (pod_ref               IS DISTINCT FROM v_merged
         OR pod_provider          IS DISTINCT FROM v_provider
         OR pod_external_order_id IS DISTINCT FROM v_ext_id
         OR pod_status            IS DISTINCT FROM COALESCE(v_pstatus, pod_status, 'submitted')
         OR pod_submitted_at      IS NULL);
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

    SELECT o.* INTO v_order
      FROM store.order o
     WHERE o.order_id = p_order_id
       AND o.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped')
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
    v_product store.product%ROWTYPE;
    v_variant store.product_variant%ROWTYPE;
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

    SELECT * INTO v_product FROM store.product WHERE product_id = v_order.product_id;
    SELECT * INTO v_variant FROM store.product_variant WHERE variant_id = v_order.variant_id;

    UPDATE store.order
       SET pod_status           = 'claimed',
           pod_claimed_at       = now(),
           pod_claim_expires_at = now() + interval '15 minutes',
           pod_claim_token      = v_token,
           pod_claimed_by       = NULLIF(btrim(p_claimed_by), ''),
           updated_at           = now()
     WHERE order_id = p_order_id;

    -- Fulfillment payload prefers the immutable order snapshots over the live
    -- catalog, so a rename / SKU change after checkout can't alter what is sent
    -- to the provider.
    RETURN jsonb_build_object(
        'order_id',         v_order.order_id,
        'qty',              v_order.qty,
        'status',           v_order.status,
        'shipping_address', v_order.shipping_address,
        'pod_ref',          v_order.pod_ref,
        'sku',              COALESCE(v_order.variant_sku, v_variant.sku),
        'attributes',       COALESCE(NULLIF(v_order.variant_attributes, '{}'::jsonb), v_variant.attributes),
        'product_slug',     COALESCE(v_order.product_slug, v_product.slug),
        'product_title',    COALESCE(v_order.product_title, v_product.title),
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

DROP FUNCTION IF EXISTS store.service_order_for_pod(BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_update_pod_status(BIGINT, JSONB);
DROP FUNCTION IF EXISTS store.service_ack_pod_submission(BIGINT, UUID, JSONB);
DROP INDEX IF EXISTS store.store_order_pod_external_uq;
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

DROP FUNCTION IF EXISTS store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT);
DROP TABLE IF EXISTS store.topup;

NOTIFY pgrst, 'reload schema';
