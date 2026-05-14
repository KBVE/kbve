-- ============================================================================
-- WALLET RPCs — service-layer mutators + public proxies
--
-- Reference mirror. Depends on wallet_core / wallet_coupons / wallet_audit.
--
-- Service functions (service_role only):
--   service_credit / service_debit / service_transfer
--   service_redeem_coupon / service_revoke_coupon / service_verify_balance
--
-- Public proxies (authenticated, mc-style schema-not-exposed pattern):
--   public.proxy_wallet_get_balance
--   public.proxy_wallet_list_coupons
--   public.proxy_wallet_redeem_coupon
-- ============================================================================

-- ============================================================================
-- service_credit — positive delta. Overflow-checked. Idempotent + replay-mismatch detecting.
-- ============================================================================

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
RETURNS BIGINT
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

    -- Fast-path idempotency check (pre-lock).
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION 'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    PERFORM wallet.lock_account(p_account_id);

    -- Re-check after lock to catch concurrent same-key inserts.
    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION 'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    INSERT INTO wallet.balance (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    IF p_currency = 'credits' THEN
        SELECT credits INTO v_current FROM wallet.balance
         WHERE account_id = p_account_id FOR UPDATE;
    ELSE
        SELECT khash INTO v_current FROM wallet.balance
         WHERE account_id = p_account_id FOR UPDATE;
    END IF;

    IF v_current > wallet.int8_max() - p_amount THEN
        RAISE EXCEPTION 'credit would overflow BIGINT balance for %', p_currency
            USING ERRCODE = '22003';
    END IF;

    IF p_currency = 'credits' THEN
        UPDATE wallet.balance
        SET credits = credits + p_amount, updated_at = v_now
        WHERE account_id = p_account_id RETURNING credits INTO v_after;
    ELSE
        UPDATE wallet.balance
        SET khash = khash + p_amount, updated_at = v_now
        WHERE account_id = p_account_id RETURNING khash INTO v_after;
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

-- ============================================================================
-- service_debit — positive p_amount, becomes negative delta.
-- Raises insufficient_funds (53100) when the balance would go negative.
-- ============================================================================

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

    v_request_fp := wallet.replay_fingerprint(
        p_account_id, p_currency, -p_amount,
        p_source_kind, p_ref_type, p_ref_id);

    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION 'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    PERFORM wallet.lock_account(p_account_id);

    SELECT id, replay_fingerprint INTO v_existing_id, v_existing_fp
    FROM wallet.ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing_fp IS DISTINCT FROM v_request_fp THEN
            RAISE EXCEPTION 'idempotency_key reused with different payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing_id;
    END IF;

    PERFORM 1 FROM wallet.balance WHERE account_id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient funds' USING ERRCODE = '53100';
    END IF;

    BEGIN
        IF p_currency = 'credits' THEN
            UPDATE wallet.balance
            SET credits = credits - p_amount, updated_at = v_now
            WHERE account_id = p_account_id RETURNING credits INTO v_after;
        ELSE
            UPDATE wallet.balance
            SET khash = khash - p_amount, updated_at = v_now
            WHERE account_id = p_account_id RETURNING khash INTO v_after;
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

-- ============================================================================
-- service_transfer — atomic debit + credit. Canonical-order advisory locks.
-- ============================================================================

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

    IF p_from_account < p_to_account THEN
        v_lock_first  := p_from_account;
        v_lock_second := p_to_account;
    ELSE
        v_lock_first  := p_to_account;
        v_lock_second := p_from_account;
    END IF;

    PERFORM wallet.lock_account(v_lock_first);
    PERFORM wallet.lock_account(v_lock_second);

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
-- service_redeem_coupon — coupon-layer idempotent redemption.
-- ============================================================================

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

    SELECT * INTO v_coupon FROM wallet.coupon WHERE id = p_coupon_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'coupon not found' USING ERRCODE = '23503';
    END IF;

    PERFORM wallet.lock_account(v_coupon.account_id);

    SELECT * INTO v_template FROM wallet.coupon_template WHERE id = v_coupon.template_id;

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

    IF v_template.reward_kind = 'credits' OR v_template.reward_kind = 'khash' THEN
        v_amount := (v_template.reward_payload->>'amount')::BIGINT;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'coupon template reward_payload.amount invalid'
                USING ERRCODE = '22023';
        END IF;
        v_ledger_id := wallet.service_credit(
            v_coupon.account_id,
            v_template.reward_kind::TEXT::wallet.currency_kind,
            v_amount, 'coupon', v_template.code,
            'coupon', p_coupon_id, p_idempotency_key
        );
    ELSIF v_template.reward_kind = 'grant_items' THEN
        RAISE EXCEPTION 'grant_items rewards not yet wired (mc.pending_grant pending)'
            USING ERRCODE = '0A000';
    ELSE
        RAISE EXCEPTION 'reward_kind % not implemented', v_template.reward_kind
            USING ERRCODE = '0A000';
    END IF;

    UPDATE wallet.coupon
    SET status = 'redeemed', redeemed_at = v_now,
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
-- service_revoke_coupon — admin path. JWT-role + superuser fallback check.
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

    SELECT status INTO v_status FROM wallet.coupon WHERE id = p_coupon_id FOR UPDATE;
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
    SET status = 'revoked', revoked_at = v_now,
        metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('revoke_reason', p_reason)
    WHERE id = p_coupon_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, reason, metadata)
    VALUES (
        'coupon.revoke', 'coupon', p_coupon_id::TEXT, p_reason,
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
-- service_verify_balance — balance/ledger consistency check.
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
        b.credits,
        COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'credits'), 0)::BIGINT,
        b.khash,
        COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'khash'),   0)::BIGINT,
        (
            b.credits = COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'credits'), 0)
            AND
            b.khash   = COALESCE(SUM(l.delta) FILTER (WHERE l.currency = 'khash'),   0)
        )
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

-- ============================================================================
-- AUTHENTICATED USER PROXIES (public.*)
-- ============================================================================

-- JWT-free worker — takes user_id explicitly so it can be called from
-- triggers and admin repair scripts as well as from the JWT-aware proxy.
-- Idempotent. Provisions account + balance row + welcome coupon.
CREATE OR REPLACE FUNCTION wallet.ensure_user_account(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account_id   UUID;
    v_template_id  BIGINT;
    v_default_exp  INTERVAL;
    v_now          TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('wallet.ensure_user_account:' || p_user_id::TEXT, 0)
    );

    SELECT id INTO v_account_id
    FROM wallet.account WHERE kind = 'user' AND user_id = p_user_id;
    IF v_account_id IS NOT NULL THEN
        RETURN v_account_id;
    END IF;

    INSERT INTO wallet.account (kind, user_id, label, created_at)
    VALUES ('user', p_user_id, NULL, v_now)
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
        FROM wallet.account WHERE kind = 'user' AND user_id = p_user_id;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'failed to provision wallet account for user %', p_user_id
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO wallet.balance (account_id) VALUES (v_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    SELECT id, default_expires_in INTO v_template_id, v_default_exp
    FROM wallet.coupon_template WHERE code = 'WELCOME_KHASH' AND is_active = TRUE;

    IF v_template_id IS NOT NULL THEN
        INSERT INTO wallet.coupon (account_id, template_id, expires_at)
        VALUES (
            v_account_id, v_template_id,
            CASE WHEN v_default_exp IS NOT NULL THEN v_now + v_default_exp ELSE NULL END
        )
        ON CONFLICT (account_id, template_id) DO NOTHING;
    END IF;

    RETURN v_account_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.ensure_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.ensure_user_account(UUID) TO service_role;
ALTER FUNCTION wallet.ensure_user_account(UUID) OWNER TO service_role;

COMMENT ON FUNCTION wallet.ensure_user_account(UUID) IS
    'Idempotently provisions a wallet account, balance row, and optional welcome coupon for a given auth user. Intended for service_role, triggers, and admin repair jobs.';

-- Thin auth.uid() wrapper around the worker. Existing RPC contract for
-- the /me/* PostgREST surface is preserved.
CREATE OR REPLACE FUNCTION wallet.proxy_ensure_user_account()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
    END IF;
    RETURN wallet.ensure_user_account(v_user_id);
END;
$$;
REVOKE ALL ON FUNCTION wallet.proxy_ensure_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wallet.proxy_ensure_user_account() TO authenticated, service_role;
ALTER FUNCTION wallet.proxy_ensure_user_account() OWNER TO service_role;

COMMENT ON FUNCTION wallet.proxy_ensure_user_account() IS
    'Authenticated RPC wrapper around wallet.ensure_user_account(auth.uid()).';

-- Trigger function: fires after each auth.users INSERT and provisions
-- the wallet account + welcome coupon. Wrapped in EXCEPTION so wallet
-- failure never blocks signup; the JWT-aware proxy remains as a fallback
-- in /me/* paths to repair any user whose trigger run was lost.
CREATE OR REPLACE FUNCTION wallet.handle_auth_user_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    BEGIN
        PERFORM wallet.ensure_user_account(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'wallet.handle_auth_user_created failed for user %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION wallet.handle_auth_user_created() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION wallet.handle_auth_user_created() OWNER TO service_role;

DROP TRIGGER IF EXISTS wallet_on_auth_user_created ON auth.users;
CREATE TRIGGER wallet_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION wallet.handle_auth_user_created();

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
    FROM wallet.balance b WHERE b.account_id = v_account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_get_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_get_balance() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_get_balance() OWNER TO service_role;

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
    SELECT c.id, t.code, t.label, t.reward_kind, t.reward_payload,
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
    FROM wallet.coupon WHERE id = p_coupon_id;
    IF NOT FOUND OR NOT v_owner_ok THEN
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
-- READ-ONLY PROXIES (public.*_readonly)
-- ============================================================================
-- Replica-safe variants for the CNPG supabase-cluster-pooler-ro endpoint.
-- Do NOT call wallet.proxy_ensure_user_account; the Rust WalletClient
-- falls back to the rw write-path proxy on SQLSTATE WLT01.
--
-- Error contract:
--   WLT01 'wallet_account_missing'   — caller has no wallet account row
--   WLT01 'wallet_balance_missing'   — account exists, balance row missing
--   WLT02 'wallet_account_duplicate' — broken wallet_account_user_uq invariant
--
-- WLT01 triggers RW fallback; WLT02 surfaces as 500 (data corruption).
-- SECURITY DEFINER intentionally scopes access by auth.uid(); RLS is not
-- the authorization boundary for these proxy functions.

CREATE OR REPLACE FUNCTION public.proxy_wallet_get_balance_readonly()
RETURNS TABLE (
    account_id  UUID,
    credits     BIGINT,
    khash       BIGINT,
    updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    BEGIN
        SELECT a.id INTO STRICT v_account_id
          FROM wallet.account a
         WHERE a.kind = 'user' AND a.user_id = v_user_id;
    EXCEPTION
        WHEN no_data_found THEN
            RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
        WHEN too_many_rows THEN
            RAISE EXCEPTION 'wallet_account_duplicate' USING ERRCODE = 'WLT02';
    END;

    RETURN QUERY
    SELECT b.account_id, b.credits, b.khash, b.updated_at
      FROM wallet.balance b
     WHERE b.account_id = v_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'wallet_balance_missing' USING ERRCODE = 'WLT01';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_get_balance_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_get_balance_readonly() TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_get_balance_readonly() OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_get_balance_readonly() IS
    'Read-only balance fetch. Raises SQLSTATE WLT01 (wallet_account_missing or wallet_balance_missing) when repair is needed; WLT02 (wallet_account_duplicate) on a broken uniqueness invariant.';

-- Paged coupon list. Keyset cursor on (granted_at DESC, id DESC) matches
-- wallet_coupon_account_granted_idx. All args have defaults so no-arg
-- callers (current Rust client) work unchanged.
CREATE OR REPLACE FUNCTION public.proxy_wallet_list_coupons_readonly(
    p_limit             INTEGER DEFAULT 50,
    p_before_granted_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT DEFAULT NULL
)
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
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
    v_limit      INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    BEGIN
        SELECT a.id INTO STRICT v_account_id
          FROM wallet.account a
         WHERE a.kind = 'user' AND a.user_id = v_user_id;
    EXCEPTION
        WHEN no_data_found THEN
            RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
        WHEN too_many_rows THEN
            RAISE EXCEPTION 'wallet_account_duplicate' USING ERRCODE = 'WLT02';
    END;

    RETURN QUERY
    SELECT
        c.id, t.code, t.label, t.reward_kind, t.reward_payload,
        c.status, c.granted_at, c.expires_at, c.redeemed_at
      FROM wallet.coupon c
      JOIN wallet.coupon_template t ON t.id = c.template_id
     WHERE c.account_id = v_account_id
       AND (
           p_before_granted_at IS NULL
           OR c.granted_at < p_before_granted_at
           OR (c.granted_at = p_before_granted_at AND c.id < p_before_id)
       )
     ORDER BY c.granted_at DESC, c.id DESC
     LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
ALTER FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;

COMMENT ON FUNCTION public.proxy_wallet_list_coupons_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'Read-only paged coupon list. Keyset pagination on (granted_at DESC, id DESC). Limit clamped to [1, 100], default 50. Raises SQLSTATE WLT01 (wallet_account_missing) when the caller has no wallet account; the client falls back to the rw pool.';

-- PostgREST schema cache refresh after the public.* surface lands.
NOTIFY pgrst, 'reload schema';
