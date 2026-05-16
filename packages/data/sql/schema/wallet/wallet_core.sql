-- ============================================================================
-- WALLET CORE — schema, enums, account/balance/ledger tables, helpers, seeds
--
-- Reference mirror of the dbmate migration. Hand-authored review surface — do
-- not run directly against the database; promote changes into a new dbmate
-- migration under ../../dbmate/migrations/ when ready.
--
-- Currencies (non-convertible, hard-walled):
--   credits  — premium, USD-pegged ($1 = 100,000 credits), BIGINT whole units
--   khash    — activity reward, no peg, BIGINT whole units
--
-- Ownership abstraction:
--   wallet.account is the wallet entity. user / guild / treasury / escrow / system.
--   Balance, ledger, coupons all key on account_id.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS wallet;
ALTER SCHEMA wallet OWNER TO postgres;

GRANT USAGE ON SCHEMA wallet TO service_role;
REVOKE ALL ON SCHEMA wallet FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    GRANT ALL ON FUNCTIONS TO service_role;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE wallet.currency_kind AS ENUM ('credits', 'khash');

CREATE TYPE wallet.account_kind AS ENUM (
    'user', 'guild', 'treasury', 'escrow', 'system'
);

CREATE TYPE wallet.source_kind AS ENUM (
    'reward', 'purchase', 'refund', 'admin', 'coupon',
    'market_buy', 'market_sell', 'market_fee', 'transfer',
    'referral',
    'firecracker_session'
);

CREATE TYPE wallet.reward_kind AS ENUM (
    'credits', 'khash', 'grant_items', 'wallet_promo'
);

CREATE TYPE wallet.coupon_status AS ENUM (
    'unredeemed', 'redeemed', 'expired', 'revoked'
);

-- ============================================================================
-- CONSTANTS
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.int8_max()
RETURNS BIGINT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT 9223372036854775807::BIGINT;
$$;
REVOKE ALL ON FUNCTION wallet.int8_max() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.int8_max() TO service_role;
ALTER FUNCTION wallet.int8_max() OWNER TO service_role;

-- ============================================================================
-- TABLE: wallet.account
-- ============================================================================

CREATE TABLE wallet.account (
    id          UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    kind        wallet.account_kind NOT NULL,
    user_id     UUID NULL REFERENCES auth.users(id) ON DELETE NO ACTION,
    guild_id    UUID NULL,
    label       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),

    CONSTRAINT account_kind_owner_chk CHECK (
        (kind = 'user'  AND user_id  IS NOT NULL AND guild_id IS NULL) OR
        (kind = 'guild' AND guild_id IS NOT NULL AND user_id  IS NULL) OR
        (kind IN ('treasury', 'escrow', 'system')
            AND user_id IS NULL AND guild_id IS NULL)
    )
);

CREATE UNIQUE INDEX wallet_account_user_uq  ON wallet.account(user_id)  WHERE kind = 'user';
CREATE UNIQUE INDEX wallet_account_guild_uq ON wallet.account(guild_id) WHERE kind = 'guild';
CREATE INDEX wallet_account_kind_idx ON wallet.account(kind);

COMMENT ON TABLE wallet.account IS
    'Wallet ownership entity. One row per user/guild/system account. Balance/ledger key on id.';

-- ============================================================================
-- TABLE: wallet.balance — current state
-- ============================================================================

CREATE TABLE wallet.balance (
    account_id  UUID PRIMARY KEY REFERENCES wallet.account(id) ON DELETE NO ACTION,
    credits     BIGINT NOT NULL DEFAULT 0,
    khash       BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT balance_credits_nonneg_chk CHECK (credits >= 0),
    CONSTRAINT balance_khash_nonneg_chk   CHECK (khash   >= 0)
);

COMMENT ON TABLE wallet.balance IS
    'Materialized current balance per account. Source of truth is wallet.ledger.';

-- ============================================================================
-- TABLE: wallet.ledger — immutable journal
-- ============================================================================

CREATE TABLE wallet.ledger (
    id                  BIGSERIAL PRIMARY KEY,
    account_id          UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    currency            wallet.currency_kind NOT NULL,
    delta               BIGINT NOT NULL,
    balance_after       BIGINT NOT NULL CHECK (balance_after >= 0),
    source_kind         wallet.source_kind NOT NULL,
    reason              TEXT,
    ref_type            TEXT,
    ref_id              BIGINT,
    idempotency_key     UUID NOT NULL,
    replay_fingerprint  BYTEA NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),

    CONSTRAINT ledger_delta_nonzero_chk CHECK (delta <> 0)
);

CREATE UNIQUE INDEX wallet_ledger_idempotency_uq
    ON wallet.ledger(idempotency_key);
CREATE INDEX wallet_ledger_account_currency_idx
    ON wallet.ledger(account_id, currency, created_at DESC);
CREATE INDEX wallet_ledger_ref_idx
    ON wallet.ledger(ref_type, ref_id) WHERE ref_id IS NOT NULL;

COMMENT ON TABLE wallet.ledger IS
    'Immutable journal. INSERT-only. idempotency_key UNIQUE; replay_fingerprint catches mismatched replays.';

CREATE OR REPLACE FUNCTION wallet.trg_ledger_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'wallet.ledger is append-only; % blocked', TG_OP
        USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION wallet.trg_ledger_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.trg_ledger_immutable() TO service_role;
ALTER FUNCTION wallet.trg_ledger_immutable() OWNER TO service_role;

CREATE TRIGGER trg_wallet_ledger_no_update
    BEFORE UPDATE OR DELETE ON wallet.ledger
    FOR EACH ROW EXECUTE FUNCTION wallet.trg_ledger_immutable();

-- ============================================================================
-- RLS — service_role only, FORCED
-- ============================================================================

ALTER TABLE wallet.account ENABLE  ROW LEVEL SECURITY;
ALTER TABLE wallet.balance ENABLE  ROW LEVEL SECURITY;
ALTER TABLE wallet.ledger  ENABLE  ROW LEVEL SECURITY;
ALTER TABLE wallet.account FORCE   ROW LEVEL SECURITY;
ALTER TABLE wallet.balance FORCE   ROW LEVEL SECURITY;
ALTER TABLE wallet.ledger  FORCE   ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.account
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.balance
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- INTERNAL HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.lock_account(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id cannot be null' USING ERRCODE = '22004';
    END IF;
    PERFORM pg_advisory_xact_lock(
        hashtextextended('wallet.account:' || p_account_id::TEXT, 0)
    );
END;
$$;
REVOKE ALL ON FUNCTION wallet.lock_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.lock_account(UUID) TO service_role;
ALTER FUNCTION wallet.lock_account(UUID) OWNER TO service_role;

CREATE OR REPLACE FUNCTION wallet.replay_fingerprint(
    p_account_id   UUID,
    p_currency     wallet.currency_kind,
    p_signed_delta BIGINT,
    p_source_kind  wallet.source_kind,
    p_ref_type     TEXT,
    p_ref_id       BIGINT
)
RETURNS BYTEA
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT extensions.digest(
        jsonb_build_object(
            'account_id',  p_account_id,
            'currency',    p_currency,
            'delta',       p_signed_delta,
            'source_kind', p_source_kind,
            'ref_type',    p_ref_type,
            'ref_id',      p_ref_id
        )::TEXT,
        'sha256'
    );
$$;
REVOKE ALL ON FUNCTION wallet.replay_fingerprint(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, BIGINT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.replay_fingerprint(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, BIGINT)
    TO service_role;
ALTER FUNCTION wallet.replay_fingerprint(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, BIGINT)
    OWNER TO service_role;

-- ============================================================================
-- SYSTEM ACCOUNT SEEDS — pinned UUIDs for stable referencing
-- ============================================================================

INSERT INTO wallet.account (id, kind, label)
VALUES ('00000000-0000-0000-0000-000000000001', 'treasury', 'KBVE Treasury')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet.balance (account_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO wallet.account (id, kind, label)
VALUES ('00000000-0000-0000-0000-000000000002', 'escrow', 'Market Escrow')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet.balance (account_id)
VALUES ('00000000-0000-0000-0000-000000000002')
ON CONFLICT (account_id) DO NOTHING;

CREATE OR REPLACE FUNCTION wallet.treasury_account_id()
RETURNS UUID LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT '00000000-0000-0000-0000-000000000001'::UUID;
$$;
REVOKE ALL ON FUNCTION wallet.treasury_account_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.treasury_account_id() TO service_role;
ALTER FUNCTION wallet.treasury_account_id() OWNER TO service_role;

CREATE OR REPLACE FUNCTION wallet.market_escrow_account_id()
RETURNS UUID LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT '00000000-0000-0000-0000-000000000002'::UUID;
$$;
REVOKE ALL ON FUNCTION wallet.market_escrow_account_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.market_escrow_account_id() TO service_role;
ALTER FUNCTION wallet.market_escrow_account_id() OWNER TO service_role;
