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
    stripe_event_id   TEXT NOT NULL UNIQUE,
    stripe_session_id TEXT,
    credits_granted   BIGINT NOT NULL CHECK (credits_granted > 0),
    amount_cents      BIGINT NOT NULL CHECK (amount_cents >= 0),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd',
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
    v_account    UUID;
    v_existing   BIGINT;
    v_ledger_id  BIGINT;
    v_session_id TEXT := NULLIF(btrim(p_stripe_session_id), '');
BEGIN
    IF p_user_id IS NULL OR coalesce(length(p_stripe_event_id), 0) = 0
       OR p_credits IS NULL OR p_credits <= 0 THEN
        RAISE EXCEPTION 'user_id, stripe_event_id and positive credits are required'
            USING ERRCODE = '22004';
    END IF;

    -- Session-level idempotency first: two distinct Stripe events can reference
    -- the same Checkout Session (the thing that must not be credited twice).
    -- Lock + check on the session so the duplicate returns the existing ledger
    -- id instead of doing work and failing on store_topup_stripe_session_uq.
    IF v_session_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('store.topup.session:' || v_session_id, 0));
        SELECT ledger_id INTO v_existing
          FROM store.topup WHERE stripe_session_id = v_session_id;
        IF FOUND THEN
            RETURN v_existing;
        END IF;
    END IF;

    -- Serialize concurrent webhook deliveries for this event so the losing
    -- delivery returns the existing ledger id idempotently instead of hitting
    -- the unique constraint and rolling back.
    PERFORM pg_advisory_xact_lock(hashtextextended('store.topup:' || p_stripe_event_id, 0));

    -- Idempotent replay: this Stripe event already applied (re-checked under lock).
    SELECT ledger_id INTO v_existing
      FROM store.topup WHERE stripe_event_id = p_stripe_event_id;
    IF FOUND THEN
        RETURN v_existing;
    END IF;

    SELECT id INTO v_account
      FROM wallet.account WHERE kind = 'user' AND user_id = p_user_id;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
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
        md5('store_topup:' || p_stripe_event_id)::uuid
    );

    INSERT INTO store.topup (
        account_id, stripe_event_id, stripe_session_id,
        credits_granted, amount_cents, currency_fiat, ledger_id
    ) VALUES (
        v_account, p_stripe_event_id, v_session_id,
        p_credits, COALESCE(p_amount_cents, 0),
        COALESCE(p_currency_fiat, 'usd'), v_ledger_id
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
        CHECK (jsonb_typeof(pod_ref) = 'object');

-- Attach / update the POD reference (external order id, provider, status).
CREATE OR REPLACE FUNCTION store.service_attach_pod_ref(
    p_order_id BIGINT,
    p_pod_ref  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new    JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_status store.order_status;
BEGIN
    IF jsonb_typeof(v_new) <> 'object' THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM store.order WHERE order_id = p_order_id) THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;
    -- Idempotent: POD adapters/webhooks retry the same payload. Only write +
    -- log an event when pod_ref actually changes.
    UPDATE store.order
       SET pod_ref = v_new, updated_at = now()
     WHERE order_id = p_order_id AND pod_ref IS DISTINCT FROM v_new
     RETURNING status INTO v_status;
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_status, v_status, 'pod', 'pod_ref attached', v_new);
    END IF;
END;
$$;
ALTER FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) TO service_role;

-- Order payload the POD adapter needs to place a fulfillment order. Only a
-- fulfillable physical/both order in paid|processing is eligible; anything
-- else raises so a bad adapter call can't submit an invalid order.
CREATE OR REPLACE FUNCTION store.service_order_for_pod(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payload JSONB;
BEGIN
    SELECT jsonb_build_object(
        'order_id',         o.order_id,
        'qty',              o.qty,
        'status',           o.status,
        'shipping_address', o.shipping_address,
        'pod_ref',          o.pod_ref,
        'sku',              v.sku,
        'attributes',       v.attributes,
        'product_slug',     p.slug,
        'product_title',    p.title
    )
      INTO v_payload
      FROM store.order o
      JOIN store.product p ON p.product_id = o.product_id
      LEFT JOIN store.product_variant v ON v.variant_id = o.variant_id
     WHERE o.order_id = p_order_id
       AND o.status IN ('paid', 'processing')
       AND p.fulfillment IN ('physical', 'both');
    IF v_payload IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for POD fulfillment', p_order_id
            USING ERRCODE = 'P1001';
    END IF;
    RETURN v_payload;
END;
$$;
ALTER FUNCTION store.service_order_for_pod(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_order_for_pod(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_order_for_pod(BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_order_for_pod(BIGINT);
DROP FUNCTION IF EXISTS store.service_attach_pod_ref(BIGINT, JSONB);
ALTER TABLE store.order DROP COLUMN IF EXISTS pod_ref;

NOTIFY pgrst, 'reload schema';

DROP FUNCTION IF EXISTS store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT);
DROP TABLE IF EXISTS store.topup;

NOTIFY pgrst, 'reload schema';
