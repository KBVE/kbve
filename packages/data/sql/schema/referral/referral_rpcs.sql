-- ============================================================
-- REFERRAL RPCs
--
-- All functions are SECURITY DEFINER with search_path locked, owned by
-- postgres (so they retain access to wallet.* + auth.* regardless of the
-- caller's role), and granted EXECUTE only to service_role.
--
-- Public callers never touch these directly. The axum-kbve referral
-- handler holds a service_role JWT and is the only consumer.
-- ============================================================

-- ------------------------------------------------------------
-- ensure_referrer_account(user_id) → wallet.account.id
--
-- Lazy wallet account provisioning so a brand-new user's first referral
-- click can still be credited. Mirrors wallet.proxy_ensure_user_account
-- but is callable from the service path (no auth.uid() dependency) and
-- skips the welcome-coupon issuance — referral credits don't need to
-- bootstrap onboarding flow.
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

    INSERT INTO wallet.account (kind, user_id, created_at)
    VALUES ('user', p_user_id, now())
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
          FROM wallet.account
         WHERE kind = 'user' AND user_id = p_user_id;
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
-- record_click(referrer_id, target_slug, ip_hash, subnet_hash,
--              ua, referer, accept_lang)
--
-- Entry point for the axum-kbve referral handler. Resolves the target,
-- checks the dedup window, optionally credits the referrer's wallet,
-- and writes one row to referral.click. Returns enough for the handler
-- to log + redirect.
--
-- Atomicity: the wallet credit and click insert run inside the same
-- transaction. If wallet.service_credit raises, the click row rolls
-- back with it — credited / ledger_id never lie about wallet state.
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
    click_id    BIGINT,
    qualified   BOOLEAN,
    credited    BOOLEAN,
    ledger_id   BIGINT,
    target_url  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_policy        referral.reward_policy%ROWTYPE;
    v_target        referral.target%ROWTYPE;
    v_existing_id   BIGINT;
    v_qualifies     BOOLEAN := FALSE;
    v_account_id    UUID;
    v_ledger_id     BIGINT;
    v_click_id      BIGINT;
BEGIN
    IF p_referrer_id IS NULL THEN
        RAISE EXCEPTION 'referrer_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    IF p_ip_hash IS NULL OR octet_length(p_ip_hash) = 0 THEN
        RAISE EXCEPTION 'ip_hash is required' USING ERRCODE = '22023';
    END IF;
    IF p_subnet_hash IS NULL OR octet_length(p_subnet_hash) = 0 THEN
        RAISE EXCEPTION 'subnet_hash is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_policy FROM referral.reward_policy WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reward policy missing' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_target
      FROM referral.target
     WHERE slug = p_target_slug AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'P0002';
    END IF;

    -- Any qualified click for this (referrer, target, IP) inside the
    -- dedup window? Aliased to keep PL/pgSQL OUT params from shadowing
    -- the column name.
    SELECT c.id INTO v_existing_id
      FROM referral.click c
     WHERE c.referrer_id = p_referrer_id
       AND c.target_slug = p_target_slug
       AND c.ip_hash     = p_ip_hash
       AND c.qualified
       AND c.created_at  >= now() - make_interval(days => v_policy.dedup_window_days)
     ORDER BY c.created_at DESC
     LIMIT 1;

    v_qualifies := v_existing_id IS NULL;

    IF v_qualifies THEN
        v_account_id := referral.ensure_referrer_account(p_referrer_id);

        v_ledger_id := wallet.service_credit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_policy.credits_per_click,
            'referral'::wallet.source_kind,
            'referral_click',
            'referral_click',
            NULL::BIGINT,
            gen_random_uuid()
        );
    END IF;

    INSERT INTO referral.click (
        referrer_id, target_slug, ip_hash, subnet_hash,
        user_agent, referer, accept_lang,
        qualified, credited, ledger_id
    ) VALUES (
        p_referrer_id, p_target_slug, p_ip_hash, p_subnet_hash,
        NULLIF(left(p_user_agent, 256), ''),
        NULLIF(left(p_referer, 512), ''),
        NULLIF(left(p_accept_lang, 64), ''),
        v_qualifies, v_qualifies, v_ledger_id
    )
    RETURNING id INTO v_click_id;

    RETURN QUERY
    SELECT v_click_id,
           v_qualifies,
           v_qualifies,
           v_ledger_id,
           v_target.url;
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
-- Picks (slug, title, url) for a click. Used by the axum handler when
-- the URL omits an explicit target (returns the user's is_default row)
-- or to verify the user has the supplied target enabled.
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
       AND t.active
       AND (
           (p_target_slug IS NOT NULL AND ut.target_slug = p_target_slug)
        OR (p_target_slug IS NULL AND ut.is_default)
       )
     LIMIT 1;
$fn$;

ALTER FUNCTION referral.resolve_user_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.resolve_user_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.resolve_user_target(UUID, TEXT)
    TO service_role;
