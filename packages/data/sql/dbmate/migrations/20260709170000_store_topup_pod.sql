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
    stripe_session_id TEXT
                      CHECK (stripe_session_id IS NULL
                             OR (stripe_session_id = btrim(stripe_session_id)
                                 AND length(stripe_session_id) BETWEEN 1 AND 255)),
    -- Upper bounds are defense-in-depth against a webhook mapping bug crediting
    -- a runaway amount (100M credits ~ $1M; 100M cents = $1M).
    credits_granted   BIGINT NOT NULL
                      CHECK (credits_granted > 0 AND credits_granted <= 100000000),
    amount_cents      BIGINT NOT NULL
                      CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd'
                      CHECK (currency_fiat ~ '^[a-z]{3}$'),
    ledger_id         BIGINT,
    status            TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed', 'refunded')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_topup_account_idx ON store.topup (account_id, created_at DESC);

-- A Checkout Session must never credit twice, even across distinct event ids.
CREATE UNIQUE INDEX store_topup_stripe_session_uq
    ON store.topup (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;

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
       OR p_credits IS NULL OR p_credits <= 0 THEN
        RAISE EXCEPTION 'user_id, stripe_event_id and positive credits are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'amount_cents must be positive' USING ERRCODE = '22023';
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
           OR v_row.currency_fiat <> v_currency_fiat THEN
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
        CHECK (jsonb_typeof(pod_ref) = 'object'),
    -- Promoted from pod_ref JSONB into first-class columns so the external
    -- provider order id can be uniquely constrained (pod_ref keeps any
    -- provider-specific metadata). pod_submitted_at doubles as the claim marker.
    ADD COLUMN IF NOT EXISTS pod_provider         TEXT,
    ADD COLUMN IF NOT EXISTS pod_external_order_id TEXT,
    ADD COLUMN IF NOT EXISTS pod_status           TEXT,
    ADD COLUMN IF NOT EXISTS pod_submitted_at     TIMESTAMPTZ;

-- One local order per external POD order — a provider id can't be attached to
-- two orders.
CREATE UNIQUE INDEX store_order_pod_external_uq
    ON store.order (pod_provider, pod_external_order_id)
    WHERE pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL;

-- Attach / update the POD reference (external order id, provider, status).
CREATE OR REPLACE FUNCTION store.service_attach_pod_ref(
    p_order_id BIGINT,
    p_pod_ref  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new      JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_order    store.order%ROWTYPE;
    v_provider TEXT := NULLIF(btrim(v_new->>'provider'), '');
    v_ext_id   TEXT := NULLIF(btrim(v_new->>'external_order_id'), '');
    v_pstatus  TEXT := NULLIF(btrim(v_new->>'status'), '');
BEGIN
    IF jsonb_typeof(v_new) <> 'object' THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object' USING ERRCODE = '22023';
    END IF;
    IF octet_length(v_new::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref too large' USING ERRCODE = '22023';
    END IF;

    -- Only a physical/both order still in the fulfillment pipeline may carry a
    -- POD reference — never a digital, cancelled, or refunded order.
    SELECT o.* INTO v_order
      FROM store.order o
      JOIN store.product p ON p.product_id = o.product_id
     WHERE o.order_id = p_order_id
       AND p.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped')
     FOR UPDATE OF o;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for a POD reference', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- Idempotent: POD adapters/webhooks retry the same payload. Only write +
    -- log an event when pod_ref actually changes.
    UPDATE store.order
       SET pod_ref               = v_new,
           pod_provider          = COALESCE(v_provider, pod_provider),
           pod_external_order_id = COALESCE(v_ext_id, pod_external_order_id),
           pod_status            = COALESCE(v_pstatus, pod_status),
           updated_at            = now()
     WHERE order_id = p_order_id AND pod_ref IS DISTINCT FROM v_new;
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_order.status, v_order.status, 'pod', 'pod_ref attached', v_new);
    END IF;
END;
$$;
ALTER FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) TO service_role;

-- Order payload the POD adapter needs to place a fulfillment order. Only a
-- fulfillable physical/both order in paid|processing is eligible; anything
-- else raises so a bad adapter call can't submit an invalid order.
-- Atomically CLAIM an order for POD submission. Locks the order, verifies
-- eligibility, rejects an already-claimed order, then stamps the claim
-- (pod_submitted_at) so a crash/retry cannot submit the same order to the
-- provider twice. Returns the submission payload incl. a deterministic
-- submission_key the adapter must pass as the provider's idempotency key.
-- VOLATILE (writes the claim) — call on a write connection.
CREATE OR REPLACE FUNCTION store.service_order_for_pod(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_order   store.order%ROWTYPE;
    v_product store.product%ROWTYPE;
    v_variant store.product_variant%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;

    SELECT * INTO v_product FROM store.product WHERE product_id = v_order.product_id;
    IF v_order.status NOT IN ('paid', 'processing')
       OR v_product.fulfillment NOT IN ('physical', 'both') THEN
        RAISE EXCEPTION 'order % not eligible for POD fulfillment', p_order_id
            USING ERRCODE = 'P1001';
    END IF;
    IF v_order.pod_submitted_at IS NOT NULL THEN
        RAISE EXCEPTION 'order % already claimed for POD fulfillment', p_order_id
            USING ERRCODE = '55006';
    END IF;

    SELECT * INTO v_variant FROM store.product_variant WHERE variant_id = v_order.variant_id;

    UPDATE store.order
       SET pod_status = 'claimed', pod_submitted_at = now(), updated_at = now()
     WHERE order_id = p_order_id;

    RETURN jsonb_build_object(
        'order_id',         v_order.order_id,
        'qty',              v_order.qty,
        'status',           v_order.status,
        'shipping_address', v_order.shipping_address,
        'pod_ref',          v_order.pod_ref,
        'sku',              COALESCE(v_variant.sku, v_order.variant_sku),
        'attributes',       COALESCE(v_variant.attributes, v_order.variant_attributes),
        'product_slug',     COALESCE(v_product.slug, v_order.product_slug),
        'product_title',    COALESCE(v_product.title, v_order.product_title),
        'submission_key',   md5('store_pod:' || v_order.order_id::text)
    );
END;
$$;
ALTER FUNCTION store.service_order_for_pod(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_order_for_pod(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_order_for_pod(BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_order_for_pod(BIGINT);
DROP FUNCTION IF EXISTS store.service_attach_pod_ref(BIGINT, JSONB);
DROP INDEX IF EXISTS store.store_order_pod_external_uq;
ALTER TABLE store.order
    DROP COLUMN IF EXISTS pod_ref,
    DROP COLUMN IF EXISTS pod_provider,
    DROP COLUMN IF EXISTS pod_external_order_id,
    DROP COLUMN IF EXISTS pod_status,
    DROP COLUMN IF EXISTS pod_submitted_at;

NOTIFY pgrst, 'reload schema';

DROP FUNCTION IF EXISTS store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT);
DROP TABLE IF EXISTS store.topup;

NOTIFY pgrst, 'reload schema';
