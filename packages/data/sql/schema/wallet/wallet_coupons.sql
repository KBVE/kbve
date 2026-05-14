-- ============================================================================
-- WALLET COUPONS — template catalog + per-account coupon instances
--
-- Reference mirror. Depends on wallet_core.sql (schema, enums, account table,
-- ledger.id for the redeem_ledger_id FK).
-- ============================================================================

-- ============================================================================
-- TABLE: wallet.coupon_template
-- ============================================================================

CREATE TABLE wallet.coupon_template (
    id                  BIGSERIAL PRIMARY KEY,
    code                TEXT NOT NULL UNIQUE,
    label               TEXT NOT NULL,
    reward_kind         wallet.reward_kind NOT NULL,
    reward_payload      JSONB NOT NULL,
    default_expires_in  INTERVAL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),

    CONSTRAINT coupon_template_payload_shape_chk CHECK (
        jsonb_typeof(reward_payload) = 'object'
    ),

    -- Currency rewards must declare a positive integer amount. Regex check
    -- guards against fractional JSON numbers (1.5) that would otherwise pass
    -- jsonb_typeof='number' and then fail on the BIGINT cast.
    CONSTRAINT coupon_template_currency_amount_chk CHECK (
        reward_kind NOT IN ('credits', 'khash')
        OR (
            reward_payload ? 'amount'
            AND jsonb_typeof(reward_payload->'amount') = 'number'
            AND (reward_payload->>'amount') ~ '^[0-9]+$'
            AND (reward_payload->>'amount')::NUMERIC <= 9223372036854775807
            AND (reward_payload->>'amount')::BIGINT > 0
        )
    )
);

COMMENT ON TABLE wallet.coupon_template IS
    'Coupon catalog. Reward fields are immutable after creation (trigger).';

CREATE OR REPLACE FUNCTION wallet.trg_coupon_template_reward_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.code IS DISTINCT FROM NEW.code
       OR OLD.reward_kind IS DISTINCT FROM NEW.reward_kind
       OR OLD.reward_payload IS DISTINCT FROM NEW.reward_payload THEN
        RAISE EXCEPTION 'coupon template reward fields are immutable (code/reward_kind/reward_payload)'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wallet.trg_coupon_template_reward_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.trg_coupon_template_reward_immutable() TO service_role;
ALTER FUNCTION wallet.trg_coupon_template_reward_immutable() OWNER TO service_role;

CREATE TRIGGER trg_wallet_coupon_template_reward_immutable
    BEFORE UPDATE ON wallet.coupon_template
    FOR EACH ROW EXECUTE FUNCTION wallet.trg_coupon_template_reward_immutable();

-- One ACTIVE template per code. The unconditional UNIQUE on code prevents
-- two active rows from sharing a code; this partial unique additionally
-- prevents a second active row from being inserted when an inactive row
-- exists with the same code. Required so wallet.ensure_user_account's
-- WELCOME_KHASH lookup is unambiguous.
CREATE UNIQUE INDEX coupon_template_one_active_code_idx
    ON wallet.coupon_template (code)
    WHERE is_active = TRUE;

-- ============================================================================
-- TABLE: wallet.coupon — per-account instance
-- ============================================================================

CREATE TABLE wallet.coupon (
    id                      BIGSERIAL PRIMARY KEY,
    account_id              UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    template_id             BIGINT NOT NULL REFERENCES wallet.coupon_template(id),
    status                  wallet.coupon_status NOT NULL DEFAULT 'unredeemed',
    granted_at              TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at              TIMESTAMPTZ,
    redeemed_at             TIMESTAMPTZ,
    revoked_at              TIMESTAMPTZ,
    redeem_idempotency_key  UUID,
    redeem_ledger_id        BIGINT REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    metadata                JSONB,
    idempotency_key         UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    CONSTRAINT coupon_redeemed_at_chk CHECK (
        (status =  'redeemed' AND redeemed_at IS NOT NULL)
     OR (status <> 'redeemed')
    ),
    CONSTRAINT coupon_revoked_at_chk CHECK (
        (status =  'revoked' AND revoked_at IS NOT NULL)
     OR (status <> 'revoked')
    ),
    CONSTRAINT coupon_expired_not_redeemed_chk CHECK (
        NOT (status = 'expired' AND redeemed_at IS NOT NULL)
    ),
    CONSTRAINT coupon_redeemed_state_chk CHECK (
        (status =  'redeemed'
            AND redeemed_at IS NOT NULL
            AND redeem_idempotency_key IS NOT NULL
            AND redeem_ledger_id IS NOT NULL)
     OR (status <> 'redeemed'
            AND redeem_idempotency_key IS NULL
            AND redeem_ledger_id IS NULL)
    )
);

CREATE UNIQUE INDEX wallet_coupon_idempotency_uq ON wallet.coupon(idempotency_key);
CREATE UNIQUE INDEX wallet_coupon_account_template_uq
    ON wallet.coupon(account_id, template_id);
CREATE INDEX wallet_coupon_account_status_idx
    ON wallet.coupon(account_id, status);
CREATE INDEX wallet_coupon_template_idx
    ON wallet.coupon(template_id);
-- Composite (account_id, granted_at DESC, id DESC) matches the
-- proxy_wallet_list_coupons_readonly filter + keyset cursor shape.
CREATE INDEX wallet_coupon_account_granted_idx
    ON wallet.coupon(account_id, granted_at DESC, id DESC);

COMMENT ON TABLE wallet.coupon IS
    'Per-account coupon instance. redeem_idempotency_key + redeem_ledger_id support idempotent retries.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE wallet.coupon_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon_template FORCE  ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon          FORCE  ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.coupon_template
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.coupon
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- COUPON TEMPLATE SEEDS
-- ============================================================================

INSERT INTO wallet.coupon_template (code, label, reward_kind, reward_payload, default_expires_in)
VALUES (
    'WELCOME_KHASH',
    'Claim 1000 KHash',
    'khash',
    '{"amount": 1000}'::jsonb,
    INTERVAL '90 days'
)
ON CONFLICT (code) DO NOTHING;
