-- migrate:up

-- Split provisioning logic into a JWT-free worker so it can be called from
-- triggers and admin scripts as well as from the JWT-aware proxy. The proxy
-- (auth.uid()) becomes a thin wrapper, so production behavior of the
-- /me/* RPC paths is preserved.

-- Preflight: fail loudly on duplicate active rows so the unique-index create
-- below cannot silently corrupt deploys. Operator must deactivate duplicates
-- first.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM wallet.coupon_template
         WHERE is_active = TRUE
         GROUP BY code
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'duplicate active coupon_template.code rows exist; deactivate duplicates before creating unique index';
    END IF;
END;
$$;

-- Enforce one active template per code so wallet.ensure_user_account can
-- look up WELCOME_KHASH unambiguously.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_template_one_active_code_idx
    ON wallet.coupon_template (code)
    WHERE is_active = TRUE;

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
      FROM wallet.account
     WHERE kind = 'user' AND user_id = p_user_id;

    IF v_account_id IS NOT NULL THEN
        RETURN v_account_id;
    END IF;

    INSERT INTO wallet.account (kind, user_id, label, created_at)
    VALUES ('user', p_user_id, NULL, v_now)
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
          FROM wallet.account
         WHERE kind = 'user' AND user_id = p_user_id;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'failed to provision wallet account for user %', p_user_id
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO wallet.balance (account_id)
    VALUES (v_account_id)
    ON CONFLICT (account_id) DO NOTHING;

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

REVOKE ALL ON FUNCTION wallet.ensure_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.ensure_user_account(UUID) TO service_role;
ALTER FUNCTION wallet.ensure_user_account(UUID) OWNER TO service_role;

COMMENT ON FUNCTION wallet.ensure_user_account(UUID) IS
    'Idempotently provisions a wallet account, balance row, and optional welcome coupon for a given auth user. Intended for service_role, triggers, and admin repair jobs.';

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

-- Trigger function: fires after each auth.users INSERT and provisions the
-- wallet account + welcome coupon. Wrapped in EXCEPTION so wallet failure
-- never blocks user signup; the JWT-aware proxy remains as a fallback in
-- /me/* paths to repair any user whose trigger run was lost.
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

-- Backfill existing users so /me/balance + /me/coupons can move toward
-- pure reads. ensure_user_account is idempotent; logs a final count for
-- ops visibility. If auth.users grows large enough that this becomes
-- slow at deploy time, extract into a batched admin job.
DO $$
DECLARE
    v_user      RECORD;
    v_attempted INTEGER := 0;
    v_failed    INTEGER := 0;
BEGIN
    FOR v_user IN SELECT id FROM auth.users LOOP
        v_attempted := v_attempted + 1;
        BEGIN
            PERFORM wallet.ensure_user_account(v_user.id);
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            RAISE WARNING 'wallet backfill failed for user %: %', v_user.id, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE 'wallet backfill: % attempted, % failed', v_attempted, v_failed;
END;
$$;

-- migrate:down

-- Intentionally does not delete backfilled wallet accounts, balances, or
-- coupons. Rollback restores lazy-only provisioning; user-owned state
-- created during the up migration is preserved.

DROP TRIGGER IF EXISTS wallet_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS wallet.handle_auth_user_created();
DROP FUNCTION IF EXISTS wallet.ensure_user_account(UUID);
DROP INDEX IF EXISTS wallet.coupon_template_one_active_code_idx;

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

    PERFORM pg_advisory_xact_lock(
        hashtextextended('wallet.proxy_ensure_user_account:' || v_user_id::TEXT, 0)
    );

    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = v_user_id;

    IF v_account_id IS NOT NULL THEN
        RETURN v_account_id;
    END IF;

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
