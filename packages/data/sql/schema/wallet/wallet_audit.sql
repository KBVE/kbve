-- ============================================================================
-- WALLET AUDIT — administrative action log
--
-- Reference mirror. Ledger covers balance mutation; this records admin/operator
-- intent around coupons, templates, accounts. INSERT-only.
-- ============================================================================

CREATE TABLE wallet.audit_log (
    id            BIGSERIAL PRIMARY KEY,
    -- JWT role when called via PostgREST; falls back to current_user
    -- (function owner under SECURITY DEFINER, or connecting role for direct DB
    -- sessions). Admin RPCs should also write jwt_role/session_user/current_user
    -- into metadata for richer context.
    actor_role    TEXT NOT NULL DEFAULT COALESCE(
        current_setting('request.jwt.claim.role', true),
        current_user
    ),
    actor_user_id UUID,
    action        TEXT NOT NULL,    -- e.g. 'coupon.revoke', 'account.create_system'
    target_type   TEXT NOT NULL,    -- e.g. 'coupon', 'coupon_template', 'account'
    target_id     TEXT NOT NULL,    -- TEXT so we can record BIGINT or UUID
    reason        TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX wallet_audit_log_target_idx ON wallet.audit_log(target_type, target_id);
CREATE INDEX wallet_audit_log_action_idx ON wallet.audit_log(action, created_at DESC);

COMMENT ON TABLE wallet.audit_log IS
    'Administrative action audit. INSERT-only; mirrors ledger immutability for non-balance ops.';

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

-- RLS
ALTER TABLE wallet.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.audit_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON wallet.audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed audit rows for the system accounts created in wallet_core.sql.
INSERT INTO wallet.audit_log (action, target_type, target_id, reason)
VALUES
    ('account.create_system', 'account', '00000000-0000-0000-0000-000000000001', 'seed: KBVE Treasury'),
    ('account.create_system', 'account', '00000000-0000-0000-0000-000000000002', 'seed: Market Escrow');
