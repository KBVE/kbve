-- migrate:up

-- ============================================================================
-- WALLET SCHEMA — Multi-currency, multi-owner ledger + coupon system
--
-- Currencies (non-convertible, hard-walled at the schema level):
--   credits   — premium, USD-pegged ($1 = 100,000 credits), BIGINT whole units
--   khash     — activity reward, no peg, BIGINT whole units
--
-- Ownership abstraction:
--   wallet.account is the wallet entity. Backed by user/guild/treasury/escrow/system.
--   Balance + ledger + coupons all key on account_id, not user_id, so guilds,
--   treasuries, and system accounts are first-class.
--
-- Ledger:
--   Immutable append-only journal. Every balance mutation writes a ledger row
--   with caller-supplied idempotency_key (UNIQUE). Replays return the same row.
--   replay_fingerprint hashes the full semantic payload (account, currency,
--   signed_delta, source_kind, ref_type, ref_id) so a key reused with a
--   different payload raises 40001 instead of silently no-opping.
--
-- Concurrency safety:
--   - pg_advisory_xact_lock on every account before any balance op
--   - canonical-order advisory locks on transfers (deadlock-free)
--   - FOR UPDATE on balance rows
--   - statement_timestamp() used consistently (single instant per tx)
--
-- Overflow safety:
--   - BIGINT overflow guards before every credit (balance + amount <= INT8_MAX).
--   - Postgres would error on overflow but we raise a clean domain error first.
--
-- Coupon idempotency:
--   - wallet.coupon stores the redeem_idempotency_key + redeem_ledger_id of
--     the successful redemption. Retries with the same key replay the same
--     result instead of seeing 'coupon is not redeemable'.
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
    'reward',       -- activity reward (daily login, quest, etc.)
    'purchase',     -- future Stripe / credit purchase
    'refund',       -- reversal of a purchase
    'admin',        -- staff grant / adjustment
    'coupon',       -- coupon redemption
    'market_buy',   -- marketplace purchase (buyer debit)
    'market_sell',  -- marketplace sale (seller credit)
    'market_fee',   -- treasury skim on a market trade
    'transfer'      -- generic transfer between accounts
);

CREATE TYPE wallet.reward_kind AS ENUM (
    'credits',
    'khash',
    'grant_items',  -- inserts into mc.pending_grant; payload {items:[{id,count}]}.
                    -- Dispatcher in service_redeem_coupon raises 0A000 until the
                    -- mc.pending_grant migration ships. WELCOME_KHASH does not
                    -- use this branch.
    'wallet_promo'  -- reserved; future flag-style rewards (e.g. 2x earn window)
);

CREATE TYPE wallet.coupon_status AS ENUM (
    'unredeemed', 'redeemed', 'expired', 'revoked'
);

-- ============================================================================
-- CONSTANTS
-- ============================================================================

-- INT8 maximum (9_223_372_036_854_775_807). Used in overflow checks. Defined as
-- a function (not constant) so we can reference it inside SET search_path = ''
-- function bodies without hardcoding everywhere.
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

-- ON DELETE NO ACTION on user_id: hard-deleting a user with wallet rows MUST
-- go through an anonymize/transfer flow first. We never silently lose audit.
CREATE TABLE wallet.account (
    id          UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    kind        wallet.account_kind NOT NULL,
    user_id     UUID NULL REFERENCES auth.users(id) ON DELETE NO ACTION,
    guild_id    UUID NULL,  -- FK to guild.guild(id) reserved; table lands later
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
    'Wallet ownership entity. One row per user / guild / system account. Balance and ledger key on account.id. user_id is NO ACTION because the ledger preserves audit beyond user lifetime.';

-- ============================================================================
-- TABLE: wallet.balance — current state (denormalized from ledger for fast read)
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
    'Materialized current balance per account. Source of truth is wallet.ledger; balance can be rebuilt from ledger sum.';

-- ============================================================================
-- TABLE: wallet.ledger — immutable journal
-- ============================================================================

-- ON DELETE NO ACTION on account_id: account cannot be deleted while ledger
-- rows remain. The BEFORE DELETE trigger on the ledger itself also blocks
-- direct deletion. Audit trail is law.
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
    -- Replay-mismatch detection: stored hash of the full semantic payload
    -- (account, currency, signed_delta, source_kind, ref_type, ref_id).
    -- service_credit / service_debit verify this matches before returning the
    -- prior ledger_id on replay. `reason` is excluded — cosmetic message changes
    -- should not break idempotent replays.
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
    'Immutable journal of balance mutations. INSERT-only. idempotency_key UNIQUE prevents double-credit. replay_fingerprint catches caller bugs reusing a key with different payload.';

-- Block UPDATE / DELETE on ledger — the row is law.
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
-- TABLE: wallet.coupon_template — catalog of redeemables
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

    -- Currency rewards must declare a positive integer amount.
    -- Regex check guards against fractional JSON numbers (1.5) that would
    -- otherwise pass jsonb_typeof='number' and then fail on the BIGINT cast.
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
    'Coupon catalog. One row per template; instances live in wallet.coupon. reward fields are immutable after creation (trigger).';

-- Freeze reward_kind / reward_payload / code after creation so the meaning of
-- already-granted coupons cannot drift. is_active is still mutable so a
-- template can be disabled without rewriting instances.
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

-- ============================================================================
-- TABLE: wallet.coupon — per-account instance
-- ============================================================================

-- redeem_idempotency_key + redeem_ledger_id let us replay a successful
-- redemption when the caller retries with the same key (otherwise the second
-- call would see status=redeemed and raise).
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
    -- Set after successful redemption so retries can return the original
    -- ledger_id. Nullable until then. References ledger.id; immutable via
    -- the ledger DELETE trigger.
    redeem_ledger_id        BIGINT REFERENCES wallet.ledger(id) ON DELETE NO ACTION,
    metadata                JSONB,
    idempotency_key         UUID NOT NULL DEFAULT extensions.gen_random_uuid(),

    -- Status / timestamp invariants.
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
    -- Redeemed coupons MUST carry the full replay record. Non-redeemed coupons
    -- MUST NOT carry replay metadata. One constraint covers both directions.
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
-- One coupon instance per (account, template). Repeatable coupons land via a
-- future template flag (e.g. max_redemptions_per_account) when the schema needs it.
CREATE UNIQUE INDEX wallet_coupon_account_template_uq
    ON wallet.coupon(account_id, template_id);
CREATE INDEX wallet_coupon_account_status_idx
    ON wallet.coupon(account_id, status);
CREATE INDEX wallet_coupon_template_idx
    ON wallet.coupon(template_id);

COMMENT ON TABLE wallet.coupon IS
    'Per-account coupon instance. status = unredeemed/redeemed/expired/revoked. redeem_idempotency_key + redeem_ledger_id support idempotent retries.';

-- ============================================================================
-- TABLE: wallet.audit_log — administrative actions
--
-- Ledger covers balance mutation. This table records admin/operator intent
-- around coupons, templates, accounts, and other privileged actions.
-- INSERT-only; same immutability story as the ledger.
-- ============================================================================

CREATE TABLE wallet.audit_log (
    id           BIGSERIAL PRIMARY KEY,
    -- Records the caller's JWT role when called via PostgREST; falls back to
    -- current_user (function owner under SECURITY DEFINER, or the connecting
    -- role for direct DB sessions). Admin functions should still write the
    -- richer context (jwt_role, session_user, current_user) into metadata.
    actor_role   TEXT NOT NULL DEFAULT COALESCE(
        current_setting('request.jwt.claim.role', true),
        current_user
    ),
    actor_user_id UUID,                       -- caller's auth.uid() when known
    action       TEXT NOT NULL,               -- e.g. 'coupon.revoke', 'account.create_system'
    target_type  TEXT NOT NULL,               -- e.g. 'coupon', 'coupon_template', 'account'
    target_id    TEXT NOT NULL,               -- TEXT so we can record BIGINT or UUID
    reason       TEXT,
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX wallet_audit_log_target_idx ON wallet.audit_log(target_type, target_id);
CREATE INDEX wallet_audit_log_action_idx ON wallet.audit_log(action, created_at DESC);

COMMENT ON TABLE wallet.audit_log IS
    'Administrative action audit. INSERT-only; mirrors ledger immutability for non-balance operations (coupon revoke, template toggle, system account creation).';

CREATE OR REPLACE FUNCTION wallet.trg_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'wallet.audit_log is append-only; % blocked', TG_OP
        USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION wallet.trg_audit_log_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.trg_audit_log_immutable() TO service_role;
ALTER FUNCTION wallet.trg_audit_log_immutable() OWNER TO service_role;

CREATE TRIGGER trg_wallet_audit_log_no_update
    BEFORE UPDATE OR DELETE ON wallet.audit_log
    FOR EACH ROW EXECUTE FUNCTION wallet.trg_audit_log_immutable();

-- ============================================================================
-- RLS — locked down + FORCED; service_role only
-- ============================================================================

ALTER TABLE wallet.account          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.balance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon_template  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.audit_log        ENABLE ROW LEVEL SECURITY;

-- FORCE RLS so even table owners go through policies (no accidental bypass).
ALTER TABLE wallet.account          FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet.balance          FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet.ledger           FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon_template  FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet.coupon           FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet.audit_log        FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.account
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.balance
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.coupon_template
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.coupon
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON wallet.audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES    IN SCHEMA wallet FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA wallet FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wallet FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    REVOKE ALL ON TABLES    FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- SYSTEM ACCOUNT SEEDS
-- ============================================================================

-- KBVE_TREASURY — auction fees land here; pinned UUID for stable referencing.
INSERT INTO wallet.account (id, kind, label)
VALUES ('00000000-0000-0000-0000-000000000001', 'treasury', 'KBVE Treasury')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet.balance (account_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO wallet.audit_log (action, target_type, target_id, reason)
VALUES ('account.create_system', 'account', '00000000-0000-0000-0000-000000000001', 'seed: KBVE Treasury');

-- MARKET_ESCROW — items in flight; reserved for future market RPCs.
INSERT INTO wallet.account (id, kind, label)
VALUES ('00000000-0000-0000-0000-000000000002', 'escrow', 'Market Escrow')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet.balance (account_id)
VALUES ('00000000-0000-0000-0000-000000000002')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO wallet.audit_log (action, target_type, target_id, reason)
VALUES ('account.create_system', 'account', '00000000-0000-0000-0000-000000000002', 'seed: Market Escrow');

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

-- ============================================================================
-- INTERNAL HELPERS
-- ============================================================================

-- Take a per-account advisory transaction lock. Hashed with namespace 0 so the
-- key space doesn't collide with other modules using advisory locks.
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

-- Deterministic fingerprint over the full semantic payload for replay-mismatch
-- detection. `reason` is intentionally excluded (cosmetic, shouldn't break replays).
-- signed_delta = +amount for credits, -amount for debits.
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
-- SERVICE FUNCTIONS: balance mutation
-- ============================================================================

-- Credit: positive delta. Inserts ledger row, bumps balance. Idempotent.
-- Overflow-checked. Replay-mismatch raises serialization_failure (40001).
CREATE OR REPLACE FUNCTION wallet.service_credit(
    p_account_id      UUID,
    p_currency        wallet.currency_kind,
    p_amount          BIGINT,
    p_source_kind     wallet.source_kind,
    p_reason          TEXT,
    p_ref_type        TEXT,
    p_ref_id          BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT  -- ledger.id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now           TIMESTAMPTZ := statement_timestamp();
    v_existing_id   BIGINT;
    v_existing_fp   BYTEA;
    v_request_fp    BYTEA;
    v_after         BIGINT;
    v_ledger_id     BIGINT;
    v_current       BIGINT;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_currency IS NULL THEN
        RAISE EXCEPTION 'currency is required' USING ERRCODE = '22004';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'credit amount must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_source_kind IS NULL THEN
        RAISE EXCEPTION 'source_kind is required' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;

    v_request_fp := wallet.replay_fingerprint(
        p_account_id, p_currency, p_amount,
        p_source_kind, p_ref_type, p_ref_id);

    -- Fast-path idempotency check. Cheap pre-lock read.
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION
              'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    PERFORM wallet.lock_account(p_account_id);

    -- Re-check idempotency AFTER lock: another tx with the same key may have
    -- committed between the fast-path check and the lock acquisition. Without
    -- this re-check, the loser would mutate balance, hit the unique violation
    -- on ledger insert, roll back, and surface 23505 instead of replaying.
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION
              'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    -- Lazy balance row materialization, idempotent under concurrent first-credit.
    INSERT INTO wallet.balance (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    -- Lock + read current balance for overflow check.
    IF p_currency = 'credits' THEN
        SELECT credits INTO v_current
          FROM wallet.balance
         WHERE account_id = p_account_id
         FOR UPDATE;
    ELSE
        SELECT khash INTO v_current
          FROM wallet.balance
         WHERE account_id = p_account_id
         FOR UPDATE;
    END IF;

    IF v_current > wallet.int8_max() - p_amount THEN
        RAISE EXCEPTION 'credit would overflow BIGINT balance for %', p_currency
            USING ERRCODE = '22003';
    END IF;

    IF p_currency = 'credits' THEN
        UPDATE wallet.balance
        SET credits = credits + p_amount, updated_at = v_now
        WHERE account_id = p_account_id
        RETURNING credits INTO v_after;
    ELSE
        UPDATE wallet.balance
        SET khash = khash + p_amount, updated_at = v_now
        WHERE account_id = p_account_id
        RETURNING khash INTO v_after;
    END IF;

    INSERT INTO wallet.ledger (
        account_id, currency, delta, balance_after,
        source_kind, reason, ref_type, ref_id,
        idempotency_key, replay_fingerprint, created_at
    )
    VALUES (
        p_account_id, p_currency, p_amount, v_after,
        p_source_kind, p_reason, p_ref_type, p_ref_id,
        p_idempotency_key, v_request_fp, v_now
    )
    RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.service_credit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_credit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    TO service_role;
ALTER FUNCTION wallet.service_credit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    OWNER TO service_role;

-- Debit: positive p_amount, becomes negative delta. Raises insufficient_funds
-- (53100) when the balance would go negative.
CREATE OR REPLACE FUNCTION wallet.service_debit(
    p_account_id      UUID,
    p_currency        wallet.currency_kind,
    p_amount          BIGINT,
    p_source_kind     wallet.source_kind,
    p_reason          TEXT,
    p_ref_type        TEXT,
    p_ref_id          BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now           TIMESTAMPTZ := statement_timestamp();
    v_existing_id   BIGINT;
    v_existing_fp   BYTEA;
    v_request_fp    BYTEA;
    v_after         BIGINT;
    v_ledger_id     BIGINT;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'account_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_currency IS NULL THEN
        RAISE EXCEPTION 'currency is required' USING ERRCODE = '22004';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'debit amount must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_source_kind IS NULL THEN
        RAISE EXCEPTION 'source_kind is required' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;

    -- Signed delta is negative for debit; fingerprint reflects that.
    v_request_fp := wallet.replay_fingerprint(
        p_account_id, p_currency, -p_amount,
        p_source_kind, p_ref_type, p_ref_id);

    -- Fast-path idempotency check (pre-lock).
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION
              'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    PERFORM wallet.lock_account(p_account_id);

    -- Re-check after lock: same reasoning as service_credit.
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION
              'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    -- Debit requires an existing balance row; no implicit create.
    PERFORM 1 FROM wallet.balance WHERE account_id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient funds' USING ERRCODE = '53100';
    END IF;

    BEGIN
        IF p_currency = 'credits' THEN
            UPDATE wallet.balance
            SET credits = credits - p_amount, updated_at = v_now
            WHERE account_id = p_account_id
            RETURNING credits INTO v_after;
        ELSE
            UPDATE wallet.balance
            SET khash = khash - p_amount, updated_at = v_now
            WHERE account_id = p_account_id
            RETURNING khash INTO v_after;
        END IF;
    EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'insufficient funds' USING ERRCODE = '53100';
    END;

    INSERT INTO wallet.ledger (
        account_id, currency, delta, balance_after,
        source_kind, reason, ref_type, ref_id,
        idempotency_key, replay_fingerprint, created_at
    )
    VALUES (
        p_account_id, p_currency, -p_amount, v_after,
        p_source_kind, p_reason, p_ref_type, p_ref_id,
        p_idempotency_key, v_request_fp, v_now
    )
    RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.service_debit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_debit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    TO service_role;
ALTER FUNCTION wallet.service_debit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    OWNER TO service_role;

-- Transfer: atomic debit + credit. Takes advisory locks on both accounts in
-- canonical UUID order to eliminate the A↔B deadlock vector.
-- Idempotency keys for the halves are derived from p_idempotency_key.
CREATE OR REPLACE FUNCTION wallet.service_transfer(
    p_from_account    UUID,
    p_to_account      UUID,
    p_currency        wallet.currency_kind,
    p_amount          BIGINT,
    p_source_kind     wallet.source_kind,
    p_reason          TEXT,
    p_ref_type        TEXT,
    p_ref_id          BIGINT,
    p_idempotency_key UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_lock_first   UUID;
    v_lock_second  UUID;
    v_debit_key    UUID;
    v_credit_key   UUID;
BEGIN
    IF p_from_account IS NULL OR p_to_account IS NULL THEN
        RAISE EXCEPTION 'from and to accounts are required' USING ERRCODE = '22004';
    END IF;
    IF p_from_account = p_to_account THEN
        RAISE EXCEPTION 'from and to accounts must differ' USING ERRCODE = '22023';
    END IF;
    IF p_currency IS NULL THEN
        RAISE EXCEPTION 'currency is required' USING ERRCODE = '22004';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'transfer amount must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_source_kind IS NULL THEN
        RAISE EXCEPTION 'source_kind is required' USING ERRCODE = '22004';
    END IF;
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;

    -- Canonical-order locking: smaller UUID first. Same direction for every
    -- caller means cross-direction transfers serialize cleanly, never deadlock.
    IF p_from_account < p_to_account THEN
        v_lock_first  := p_from_account;
        v_lock_second := p_to_account;
    ELSE
        v_lock_first  := p_to_account;
        v_lock_second := p_from_account;
    END IF;

    PERFORM wallet.lock_account(v_lock_first);
    PERFORM wallet.lock_account(v_lock_second);

    -- Deterministic sub-keys from the operation key.
    v_debit_key  := extensions.uuid_generate_v5(p_idempotency_key, 'debit');
    v_credit_key := extensions.uuid_generate_v5(p_idempotency_key, 'credit');

    PERFORM wallet.service_debit(
        p_from_account, p_currency, p_amount,
        p_source_kind, p_reason, p_ref_type, p_ref_id, v_debit_key);

    PERFORM wallet.service_credit(
        p_to_account, p_currency, p_amount,
        p_source_kind, p_reason, p_ref_type, p_ref_id, v_credit_key);
END;
$$;
REVOKE ALL ON FUNCTION wallet.service_transfer(UUID, UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_transfer(UUID, UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    TO service_role;
ALTER FUNCTION wallet.service_transfer(UUID, UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID)
    OWNER TO service_role;

-- ============================================================================
-- COUPON REDEMPTION
-- ============================================================================

-- Idempotent at the coupon layer: if the coupon is already redeemed with the
-- same idempotency_key, replay returns the original ledger_id instead of
-- raising 'coupon is not redeemable'.
CREATE OR REPLACE FUNCTION wallet.service_redeem_coupon(
    p_coupon_id       BIGINT,
    p_idempotency_key UUID
)
RETURNS TABLE (
    success        BOOLEAN,
    reward_kind    wallet.reward_kind,
    reward_payload JSONB,
    ledger_id      BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_coupon     RECORD;
    v_template   RECORD;
    v_now        TIMESTAMPTZ := statement_timestamp();
    v_amount     BIGINT;
    v_ledger_id  BIGINT;
BEGIN
    IF p_coupon_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'coupon_id and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    SELECT * INTO v_coupon
    FROM wallet.coupon
    WHERE id = p_coupon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'coupon not found' USING ERRCODE = '23503';
    END IF;

    PERFORM wallet.lock_account(v_coupon.account_id);

    SELECT * INTO v_template
    FROM wallet.coupon_template
    WHERE id = v_coupon.template_id;

    -- Idempotent replay: same coupon, same key, already-redeemed → return
    -- original ledger_id. Cheaper + safer than re-running the credit path.
    IF v_coupon.status = 'redeemed'
       AND v_coupon.redeem_idempotency_key = p_idempotency_key THEN
        RETURN QUERY
        SELECT TRUE, v_template.reward_kind, v_template.reward_payload, v_coupon.redeem_ledger_id;
        RETURN;
    END IF;

    IF v_coupon.status <> 'unredeemed' THEN
        RAISE EXCEPTION 'coupon is not redeemable (status=%)', v_coupon.status
            USING ERRCODE = '42501';
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < v_now THEN
        UPDATE wallet.coupon SET status = 'expired' WHERE id = p_coupon_id;
        RAISE EXCEPTION 'coupon expired' USING ERRCODE = '42501';
    END IF;

    IF NOT v_template.is_active THEN
        RAISE EXCEPTION 'coupon template is inactive' USING ERRCODE = '42501';
    END IF;

    -- Dispatch by reward_kind.
    IF v_template.reward_kind = 'credits' OR v_template.reward_kind = 'khash' THEN
        v_amount := (v_template.reward_payload->>'amount')::BIGINT;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'coupon template reward_payload.amount invalid'
                USING ERRCODE = '22023';
        END IF;
        v_ledger_id := wallet.service_credit(
            v_coupon.account_id,
            v_template.reward_kind::TEXT::wallet.currency_kind,
            v_amount,
            'coupon',
            v_template.code,
            'coupon',
            p_coupon_id,
            p_idempotency_key
        );
    ELSIF v_template.reward_kind = 'grant_items' THEN
        -- mc.pending_grant lands in a future migration; placeholder until then.
        -- Welcome coupon does not use this branch.
        RAISE EXCEPTION 'grant_items rewards not yet wired (mc.pending_grant pending)'
            USING ERRCODE = '0A000';
    ELSE
        RAISE EXCEPTION 'reward_kind % not implemented', v_template.reward_kind
            USING ERRCODE = '0A000';
    END IF;

    UPDATE wallet.coupon
    SET status = 'redeemed',
        redeemed_at = v_now,
        redeem_idempotency_key = p_idempotency_key,
        redeem_ledger_id = v_ledger_id
    WHERE id = p_coupon_id;

    RETURN QUERY SELECT TRUE, v_template.reward_kind, v_template.reward_payload, v_ledger_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.service_redeem_coupon(BIGINT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_redeem_coupon(BIGINT, UUID)
    TO service_role;
ALTER FUNCTION wallet.service_redeem_coupon(BIGINT, UUID) OWNER TO service_role;

-- ============================================================================
-- ADMIN: revoke a coupon (sets status='revoked')
--
-- Service-only. Idempotent: revoking an already-revoked coupon returns FALSE,
-- never raises. Cannot revoke a redeemed coupon — funds are out the door.
-- Belt-and-suspenders: explicit session_user check rejects accidental
-- non-service_role callers even if EXECUTE is mistakenly granted later.
-- Writes a row to wallet.audit_log.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_revoke_coupon(
    p_coupon_id BIGINT,
    p_reason    TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now      TIMESTAMPTZ := statement_timestamp();
    v_status   wallet.coupon_status;
    v_jwt_role TEXT;
    v_claims   TEXT;
    v_session  TEXT := session_user;
BEGIN
    -- Belt-and-suspenders: this function has no proxy wrapper and must only be
    -- called by service_role JWT sessions OR by a superuser session running
    -- against psql directly (operator scripts). SECURITY DEFINER makes
    -- current_user the function owner so we can't use that.
    --
    -- PostgREST sometimes exposes the role as request.jwt.claim.role and
    -- sometimes only as the full request.jwt.claims JSON blob; try both
    -- with a defensive JSON parse (won't throw if absent or malformed).
    v_jwt_role := current_setting('request.jwt.claim.role', true);
    IF v_jwt_role IS NULL OR v_jwt_role = '' THEN
        v_claims := current_setting('request.jwt.claims', true);
        IF v_claims IS NOT NULL AND v_claims <> '' THEN
            BEGIN
                v_jwt_role := v_claims::jsonb->>'role';
            EXCEPTION WHEN others THEN
                v_jwt_role := NULL;
            END;
        END IF;
    END IF;

    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND v_session IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'service_role required (jwt_role=%, session=%)',
            COALESCE(v_jwt_role, '<none>'), v_session
            USING ERRCODE = '42501';
    END IF;

    IF p_coupon_id IS NULL THEN
        RAISE EXCEPTION 'coupon_id is required' USING ERRCODE = '22004';
    END IF;

    SELECT status INTO v_status
    FROM wallet.coupon
    WHERE id = p_coupon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'coupon not found' USING ERRCODE = '23503';
    END IF;

    IF v_status = 'redeemed' THEN
        RAISE EXCEPTION 'cannot revoke a redeemed coupon' USING ERRCODE = '42501';
    END IF;

    IF v_status = 'revoked' THEN
        RETURN FALSE;
    END IF;

    UPDATE wallet.coupon
    SET status = 'revoked',
        revoked_at = v_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('revoke_reason', p_reason)
    WHERE id = p_coupon_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, reason, metadata)
    VALUES (
        'coupon.revoke',
        'coupon',
        p_coupon_id::TEXT,
        p_reason,
        jsonb_build_object(
            'jwt_role',     v_jwt_role,
            'session_user', v_session,
            'current_user', current_user
        )
    );

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION wallet.service_revoke_coupon(BIGINT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_revoke_coupon(BIGINT, TEXT)
    TO service_role;
ALTER FUNCTION wallet.service_revoke_coupon(BIGINT, TEXT) OWNER TO service_role;

-- ============================================================================
-- ADMIN: balance verification
--
-- Per-account consistency check. Compares stored wallet.balance against the
-- summed ledger deltas for each currency. ok = TRUE means the two agree.
-- Use this in a periodic job, after suspected corruption, or before a backfill.
-- Service-only.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_verify_balance(p_account_id UUID)
RETURNS TABLE (
    account_id      UUID,
    stored_credits  BIGINT,
    ledger_credits  BIGINT,
    stored_khash    BIGINT,
    ledger_khash    BIGINT,
    ok              BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT
        b.account_id,
        b.credits  AS stored_credits,
        COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'credits'), 0)::BIGINT AS ledger_credits,
        b.khash    AS stored_khash,
        COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'khash'),   0)::BIGINT AS ledger_khash,
        (
            b.credits = COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'credits'), 0)
            AND
            b.khash   = COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'khash'),   0)
        ) AS ok
    FROM wallet.balance b
    LEFT JOIN wallet.ledger l ON l.account_id = b.account_id
    WHERE b.account_id = p_account_id
    GROUP BY b.account_id, b.credits, b.khash;
$$;
REVOKE ALL ON FUNCTION wallet.service_verify_balance(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_verify_balance(UUID)
    TO service_role;
ALTER FUNCTION wallet.service_verify_balance(UUID) OWNER TO service_role;
COMMENT ON FUNCTION wallet.service_verify_balance(UUID) IS
    'Compares wallet.balance against ledger sums for one account. ok=TRUE means consistent; FALSE means drift. Run periodically or after suspected corruption.';

-- ============================================================================
-- AUTHENTICATED USER PROXIES
-- ============================================================================

-- Returns the calling user's account_id, creating the row + balance + welcome
-- coupon on first call. Race-safe under concurrent first-calls.
CREATE OR REPLACE FUNCTION wallet.proxy_ensure_user_account()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id      UUID := auth.uid();
    v_account_id   UUID;
    v_template_id  BIGINT;
    v_default_exp  INTERVAL;
    v_now          TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;

    -- Serialize concurrent first-calls per user. Cheap, scoped.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('wallet.proxy_ensure_user_account:' || v_user_id::TEXT, 0)
    );

    SELECT id INTO v_account_id
    FROM wallet.account
    WHERE kind = 'user' AND user_id = v_user_id;

    IF v_account_id IS NOT NULL THEN
        RETURN v_account_id;
    END IF;

    -- Race-safe insert. The partial unique index enforces one account per user.
    INSERT INTO wallet.account (kind, user_id, label, created_at)
    VALUES ('user', v_user_id, NULL, v_now)
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
        FROM wallet.account
        WHERE kind = 'user' AND user_id = v_user_id;
    END IF;

    INSERT INTO wallet.balance (account_id)
    VALUES (v_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    -- Grant the WELCOME_KHASH coupon if the template is still active.
    -- Uses ON CONFLICT against the (account_id, template_id) unique index for
    -- belt-and-suspenders idempotency even if the advisory lock is bypassed.
    SELECT id, default_expires_in
      INTO v_template_id, v_default_exp
      FROM wallet.coupon_template
     WHERE code = 'WELCOME_KHASH' AND is_active = TRUE;

    IF v_template_id IS NOT NULL THEN
        INSERT INTO wallet.coupon (account_id, template_id, expires_at)
        VALUES (
            v_account_id,
            v_template_id,
            CASE WHEN v_default_exp IS NOT NULL
                 THEN v_now + v_default_exp
                 ELSE NULL END
        )
        ON CONFLICT (account_id, template_id) DO NOTHING;
    END IF;

    RETURN v_account_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.proxy_ensure_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wallet.proxy_ensure_user_account() TO authenticated, service_role;
ALTER FUNCTION wallet.proxy_ensure_user_account() OWNER TO service_role;

-- Public read of own balance. Lazily provisions account + welcome coupon.
CREATE OR REPLACE FUNCTION public.proxy_wallet_get_balance()
RETURNS TABLE (
    account_id  UUID,
    credits     BIGINT,
    khash       BIGINT,
    updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account_id UUID;
BEGIN
    v_account_id := wallet.proxy_ensure_user_account();
    RETURN QUERY
    SELECT b.account_id, b.credits, b.khash, b.updated_at
    FROM wallet.balance b
    WHERE b.account_id = v_account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_get_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_get_balance() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_get_balance() OWNER TO service_role;

-- Public list of own coupons.
CREATE OR REPLACE FUNCTION public.proxy_wallet_list_coupons()
RETURNS TABLE (
    coupon_id      BIGINT,
    template_code  TEXT,
    template_label TEXT,
    reward_kind    wallet.reward_kind,
    reward_payload JSONB,
    status         wallet.coupon_status,
    granted_at     TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    redeemed_at    TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account_id UUID;
BEGIN
    v_account_id := wallet.proxy_ensure_user_account();
    RETURN QUERY
    SELECT
        c.id, t.code, t.label, t.reward_kind, t.reward_payload,
        c.status, c.granted_at, c.expires_at, c.redeemed_at
    FROM wallet.coupon c
    JOIN wallet.coupon_template t ON t.id = c.template_id
    WHERE c.account_id = v_account_id
    ORDER BY c.granted_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_list_coupons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_list_coupons() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_list_coupons() OWNER TO service_role;

-- Public redeem: caller must own the coupon. Auth-checked, idempotent.
CREATE OR REPLACE FUNCTION public.proxy_wallet_redeem_coupon(
    p_coupon_id       BIGINT,
    p_idempotency_key UUID
)
RETURNS TABLE (
    success        BOOLEAN,
    reward_kind    wallet.reward_kind,
    reward_payload JSONB,
    ledger_id      BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
    v_owner_ok   BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;
    IF p_coupon_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'coupon_id and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    v_account_id := wallet.proxy_ensure_user_account();

    SELECT (account_id = v_account_id) INTO v_owner_ok
    FROM wallet.coupon
    WHERE id = p_coupon_id;

    IF NOT FOUND OR NOT v_owner_ok THEN
        -- Single error for missing-and-not-yours to block ID enumeration.
        RAISE EXCEPTION 'coupon not found' USING ERRCODE = '23503';
    END IF;

    RETURN QUERY
    SELECT * FROM wallet.service_redeem_coupon(p_coupon_id, p_idempotency_key);
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_redeem_coupon(BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_redeem_coupon(BIGINT, UUID) TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_redeem_coupon(BIGINT, UUID) OWNER TO service_role;

-- ============================================================================
-- POSTGREST schema cache refresh
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- migrate:down

NOTIFY pgrst, 'reload schema';

-- Drop user-facing wrappers and service functions first.
DROP FUNCTION IF EXISTS public.proxy_wallet_redeem_coupon(BIGINT, UUID);
DROP FUNCTION IF EXISTS public.proxy_wallet_list_coupons();
DROP FUNCTION IF EXISTS public.proxy_wallet_get_balance();
DROP FUNCTION IF EXISTS wallet.proxy_ensure_user_account();
DROP FUNCTION IF EXISTS wallet.service_verify_balance(UUID);
DROP FUNCTION IF EXISTS wallet.service_revoke_coupon(BIGINT, TEXT);
DROP FUNCTION IF EXISTS wallet.service_redeem_coupon(BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.service_transfer(UUID, UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.service_debit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.service_credit(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, TEXT, BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.replay_fingerprint(UUID, wallet.currency_kind, BIGINT, wallet.source_kind, TEXT, BIGINT);
DROP FUNCTION IF EXISTS wallet.lock_account(UUID);
DROP FUNCTION IF EXISTS wallet.market_escrow_account_id();
DROP FUNCTION IF EXISTS wallet.treasury_account_id();
DROP FUNCTION IF EXISTS wallet.int8_max();

-- Tables before trigger functions — DROP TABLE cascades to the triggers, which
-- removes their dependency on the trigger functions. If we drop the functions
-- first while the triggers still exist, Postgres refuses without CASCADE.
DROP TABLE IF EXISTS wallet.audit_log;
DROP TABLE IF EXISTS wallet.coupon;
DROP TABLE IF EXISTS wallet.coupon_template;
DROP TABLE IF EXISTS wallet.ledger;
DROP TABLE IF EXISTS wallet.balance;
DROP TABLE IF EXISTS wallet.account;

-- Trigger functions now have no dependents.
DROP FUNCTION IF EXISTS wallet.trg_coupon_template_reward_immutable();
DROP FUNCTION IF EXISTS wallet.trg_audit_log_immutable();
DROP FUNCTION IF EXISTS wallet.trg_ledger_immutable();

DROP TYPE IF EXISTS wallet.coupon_status;
DROP TYPE IF EXISTS wallet.reward_kind;
DROP TYPE IF EXISTS wallet.source_kind;
DROP TYPE IF EXISTS wallet.account_kind;
DROP TYPE IF EXISTS wallet.currency_kind;

DROP SCHEMA IF EXISTS wallet CASCADE;
