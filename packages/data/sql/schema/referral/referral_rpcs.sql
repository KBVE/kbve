-- ============================================================
-- REFERRAL RPCs
--
-- All functions are SECURITY DEFINER with search_path = '', owned by
-- postgres (so they retain access to wallet.* + auth.* regardless of
-- the caller's role), and granted EXECUTE only to service_role.
--
-- Public callers never touch these directly. The axum-kbve referral
-- handler holds a service_role JWT and is the only consumer for
-- Phase 1.
--
-- Custom SQLSTATEs. Keep this list in sync with the Phase 2 axum error
-- mapper so users see the right 4xx code:
--   RFP01  = referral.reward_policy row missing
--   RFT01  = referral target not found / inactive
--   RFU01  = referrer does not have target enabled in user_target
--   RFWA1  = ensure_referrer_account failed to provision a wallet account
--
-- service_role intentionally holds USAGE on the schema + EXECUTE on
-- these functions only. It does NOT have direct table privileges; the
-- definer-owned functions are the only callable surface.
-- ============================================================

-- ------------------------------------------------------------
-- ensure_referrer_account(user_id) → wallet.account.id
--
-- Lazy wallet account provisioning so a brand-new user's first referral
-- click can still be credited. Mirrors wallet.proxy_ensure_user_account
-- but is callable from the service path (no auth.uid() dependency) and
-- skips welcome-coupon issuance.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.ensure_referrer_account(
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_account_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.ensure_referrer_account:' || p_user_id::TEXT, 0)
    );

    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = p_user_id;
    IF FOUND THEN
        RETURN v_account_id;
    END IF;

    -- ON CONFLICT target relies on the wallet partial unique index on
    -- wallet.account (user_id) WHERE kind = 'user'.
    INSERT INTO wallet.account (kind, user_id, created_at)
    VALUES ('user', p_user_id, now())
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
          FROM wallet.account
         WHERE kind = 'user' AND user_id = p_user_id;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'failed to provision wallet account for user %',
                        p_user_id
            USING ERRCODE = 'RFWA1';
    END IF;

    INSERT INTO wallet.balance (account_id)
    VALUES (v_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    RETURN v_account_id;
END;
$fn$;

ALTER FUNCTION referral.ensure_referrer_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.ensure_referrer_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.ensure_referrer_account(UUID)
    TO service_role;

-- ------------------------------------------------------------
-- record_click — entry point for the Phase 2 axum-kbve handler.
--
-- Order of operations:
--   1. Validate inputs.
--   2. Take xact-scoped advisory lock on (referrer, target, ip_hash) so
--      two concurrent calls cannot both pass the dedup check and both
--      credit.
--   3. Verify referrer has the target enabled (defense in depth).
--   4. Run dedup-window check.
--   5. INSERT the click uncredited.
--   6. If qualified AND credits_per_click > 0:
--        - call wallet.service_credit with a deterministic idempotency
--          key derived from the freshly-inserted click_id (retries are
--          idempotent at the wallet level too);
--        - UPDATE the click row with credited=true + ledger_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.record_click(
    p_referrer_id  UUID,
    p_target_slug  TEXT,
    p_ip_hash      BYTEA,
    p_subnet_hash  BYTEA,
    p_user_agent   TEXT DEFAULT NULL,
    p_referer      TEXT DEFAULT NULL,
    p_accept_lang  TEXT DEFAULT NULL
)
RETURNS TABLE (
    click_id     BIGINT,
    target_slug  TEXT,
    target_url   TEXT,
    qualified    BOOLEAN,
    credited     BOOLEAN,
    ledger_id    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_now          TIMESTAMPTZ := statement_timestamp();
    v_policy       referral.reward_policy%ROWTYPE;
    v_target       referral.target%ROWTYPE;
    v_existing_id  BIGINT;
    v_qualifies    BOOLEAN := FALSE;
    v_account_id   UUID;
    v_ledger_id    BIGINT;
    v_click_id     BIGINT;
    v_idem_key     UUID;
    v_credited     BOOLEAN := FALSE;
BEGIN
    IF p_referrer_id IS NULL THEN
        RAISE EXCEPTION 'referrer_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    p_target_slug := lower(btrim(p_target_slug));
    IF p_target_slug = '' THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    IF p_ip_hash IS NULL OR octet_length(p_ip_hash) <> 32 THEN
        RAISE EXCEPTION 'ip_hash must be a 32-byte HMAC-SHA256 digest'
            USING ERRCODE = '22023';
    END IF;
    IF p_subnet_hash IS NULL OR octet_length(p_subnet_hash) <> 32 THEN
        RAISE EXCEPTION 'subnet_hash must be a 32-byte HMAC-SHA256 digest'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'referral.click:'
            || p_referrer_id::TEXT
            || ':' || p_target_slug
            || ':' || encode(p_ip_hash, 'hex'),
            0
        )
    );

    SELECT * INTO v_policy FROM referral.reward_policy WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reward policy missing' USING ERRCODE = 'RFP01';
    END IF;

    SELECT * INTO v_target
      FROM referral.target
     WHERE slug = p_target_slug AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'RFT01';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM referral.user_target ut
         WHERE ut.user_id      = p_referrer_id
           AND ut.target_slug  = p_target_slug
           AND ut.active
    ) THEN
        RAISE EXCEPTION 'referrer % has target % disabled or unset',
                        p_referrer_id, p_target_slug
            USING ERRCODE = 'RFU01';
    END IF;

    SELECT c.id INTO v_existing_id
      FROM referral.click c
     WHERE c.referrer_id = p_referrer_id
       AND c.target_slug = p_target_slug
       AND c.ip_hash     = p_ip_hash
       AND c.qualified
       AND c.created_at  >= v_now - make_interval(days => v_policy.dedup_window_days)
     ORDER BY c.created_at DESC
     LIMIT 1;

    v_qualifies := v_existing_id IS NULL;

    -- Insert click row first so the ledger entry can carry
    -- ref_id = click_id, and so a wallet credit failure rolls the row
    -- back with it (atomic strict mode — no orphan click rows pointing
    -- at a missing ledger entry). Cross-RPC retry guards live higher up
    -- (advisory lock + dedup window).
    INSERT INTO referral.click (
        referrer_id, target_slug, ip_hash, subnet_hash,
        user_agent, referer, accept_lang,
        qualified, credited, ledger_id
    ) VALUES (
        p_referrer_id, p_target_slug, p_ip_hash, p_subnet_hash,
        NULLIF(left(p_user_agent, 256), ''),
        NULLIF(left(p_referer, 512), ''),
        NULLIF(left(p_accept_lang, 64), ''),
        v_qualifies, FALSE, NULL
    )
    RETURNING id INTO v_click_id;

    IF v_qualifies AND v_policy.credits_per_click > 0 THEN
        v_account_id := referral.ensure_referrer_account(p_referrer_id);

        v_idem_key := (md5('referral.click:' || v_click_id::TEXT))::UUID;

        -- wallet.service_credit invariant assumed: idempotent on
        -- p_idempotency_key — re-calling with the same UUID returns the
        -- prior ledger_id instead of inserting a second row.
        v_ledger_id := wallet.service_credit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_policy.credits_per_click,
            'referral'::wallet.source_kind,
            'referral_click',
            'referral_click',
            v_click_id,
            v_idem_key
        );

        UPDATE referral.click
           SET credited  = TRUE,
               ledger_id = v_ledger_id
         WHERE id = v_click_id;

        v_credited := TRUE;
    END IF;

    RETURN QUERY
    SELECT v_click_id,
           v_target.slug,
           v_target.url,
           v_qualifies,
           v_credited,
           v_ledger_id;
END;
$fn$;

ALTER FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) TO service_role;

-- ------------------------------------------------------------
-- resolve_user_target(user_id, slug?)
--
-- Picks (slug, title, url) for a click. Only ACTIVE user_target rows
-- AND active catalog rows participate.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.resolve_user_target(
    p_user_id      UUID,
    p_target_slug  TEXT DEFAULT NULL
)
RETURNS TABLE (slug TEXT, title TEXT, url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT t.slug, t.title, t.url
      FROM referral.user_target ut
      JOIN referral.target t ON t.slug = ut.target_slug
     WHERE ut.user_id = p_user_id
       AND ut.active
       AND t.active
       AND (
           (p_target_slug IS NOT NULL AND ut.target_slug = p_target_slug)
        OR (p_target_slug IS NULL AND ut.is_default)
       )
     ORDER BY ut.is_default DESC, ut.enabled_at DESC, ut.target_slug
     LIMIT 1;
$fn$;

ALTER FUNCTION referral.resolve_user_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.resolve_user_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.resolve_user_target(UUID, TEXT)
    TO service_role;
