-- ============================================================
-- REFERRAL USER-TARGET MANAGEMENT RPCs (Phase 3a)
--
-- All SECURITY DEFINER, search_path = '', owned by postgres, EXECUTE
-- granted to service_role only. The axum-kbve `/api/v1/referral/me/*`
-- routes are the only callers; they resolve the caller's user_id from
-- the JWT `sub` claim and pass it as p_user_id.
--
-- Applied migration:
--   packages/data/sql/dbmate/migrations/
--     20260516090714_referral_user_target_mgmt.sql
--
-- Custom SQLSTATE additions (Phase 1/2 set already documented in
-- referral_rpcs.sql):
--   RFM01 = attempted to disable / unset the last active default while
--           no other active target exists to inherit it
-- ============================================================

-- ------------------------------------------------------------
-- service_list_user_targets(user_id)
--
-- One row per (user, target) including inactive rows so the UI can
-- offer a "re-enable" affordance. Joins to wallet.ledger for the
-- credits_total rollup.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_list_user_targets(
    p_user_id UUID
)
RETURNS TABLE (
    target_slug    TEXT,
    title          TEXT,
    url            TEXT,
    is_default     BOOLEAN,
    active         BOOLEAN,
    enabled_at     TIMESTAMPTZ,
    disabled_at    TIMESTAMPTZ,
    clicks_total   BIGINT,
    clicks_credited BIGINT,
    credits_total  BIGINT,
    last_click_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT
        ut.target_slug,
        t.title,
        t.url,
        ut.is_default,
        ut.active,
        ut.enabled_at,
        ut.disabled_at,
        COALESCE(stats.clicks_total, 0)    AS clicks_total,
        COALESCE(stats.clicks_credited, 0) AS clicks_credited,
        COALESCE(stats.credits_total, 0)   AS credits_total,
        stats.last_click_at
    FROM referral.user_target ut
    JOIN referral.target t ON t.slug = ut.target_slug
    LEFT JOIN LATERAL (
        SELECT
            count(*)::BIGINT                                  AS clicks_total,
            count(*) FILTER (WHERE c.credited)::BIGINT        AS clicks_credited,
            COALESCE(SUM(l.delta) FILTER (
                WHERE c.credited AND l.id IS NOT NULL
            ), 0)::BIGINT                                     AS credits_total,
            MAX(c.created_at)                                 AS last_click_at
        FROM referral.click c
        LEFT JOIN wallet.ledger l ON l.id = c.ledger_id
        WHERE c.referrer_id = p_user_id
          AND c.target_slug = ut.target_slug
    ) stats ON TRUE
    WHERE ut.user_id = p_user_id
    ORDER BY ut.is_default DESC, ut.active DESC, ut.enabled_at DESC;
$fn$;

ALTER FUNCTION referral.service_list_user_targets(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_list_user_targets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_list_user_targets(UUID)
    TO service_role;

-- ------------------------------------------------------------
-- service_enable_target(user_id, target_slug, set_as_default)
--
-- Inserts a new row OR re-activates an inactive one. First enable
-- auto-promotes to default so /referral/@<user>/ always has a
-- destination. Concurrent enable / set-default attempts serialize on
-- a per-user advisory lock to prevent two is_default rows briefly
-- existing for the same user.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_enable_target(
    p_user_id        UUID,
    p_target_slug    TEXT,
    p_set_as_default BOOLEAN DEFAULT FALSE
)
RETURNS referral.user_target
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_target          referral.target%ROWTYPE;
    v_existing        referral.user_target%ROWTYPE;
    v_now             TIMESTAMPTZ := statement_timestamp();
    v_should_default  BOOLEAN;
    v_row             referral.user_target;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    p_target_slug := lower(btrim(p_target_slug));
    IF p_target_slug = '' THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_target
      FROM referral.target
     WHERE slug = p_target_slug AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'RFT01';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    SELECT * INTO v_existing
      FROM referral.user_target
     WHERE user_id = p_user_id AND target_slug = p_target_slug;

    v_should_default := p_set_as_default OR NOT EXISTS (
        SELECT 1
          FROM referral.user_target
         WHERE user_id = p_user_id AND active
    );

    IF v_should_default THEN
        UPDATE referral.user_target
           SET is_default = FALSE
         WHERE user_id = p_user_id
           AND is_default
           AND target_slug IS DISTINCT FROM p_target_slug;
    END IF;

    IF FOUND OR v_existing.user_id IS NOT NULL THEN
        UPDATE referral.user_target
           SET active       = TRUE,
               is_default   = CASE WHEN v_should_default THEN TRUE ELSE is_default END,
               disabled_at  = NULL
         WHERE user_id = p_user_id AND target_slug = p_target_slug
         RETURNING * INTO v_row;
    ELSE
        INSERT INTO referral.user_target (
            user_id, target_slug, is_default, active, enabled_at
        ) VALUES (
            p_user_id, p_target_slug, v_should_default, TRUE, v_now
        )
        RETURNING * INTO v_row;
    END IF;

    RETURN v_row;
END;
$fn$;

ALTER FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    TO service_role;

-- ------------------------------------------------------------
-- service_disable_target(user_id, target_slug)
--
-- Marks the row inactive. If it was the default, the most-recently
-- enabled remaining active row inherits the default. If no other
-- active row exists, raises RFM01 so the caller picks a new default
-- explicitly instead of silently breaking /referral/@<user>/.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_disable_target(
    p_user_id      UUID,
    p_target_slug  TEXT
)
RETURNS referral.user_target
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_existing   referral.user_target%ROWTYPE;
    v_other_slug TEXT;
    v_now        TIMESTAMPTZ := statement_timestamp();
    v_row        referral.user_target;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    p_target_slug := lower(btrim(p_target_slug));

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    SELECT * INTO v_existing
      FROM referral.user_target
     WHERE user_id = p_user_id AND target_slug = p_target_slug;
    IF NOT FOUND OR NOT v_existing.active THEN
        RAISE EXCEPTION 'target % is not active for user %',
                        p_target_slug, p_user_id
            USING ERRCODE = 'RFU01';
    END IF;

    IF v_existing.is_default THEN
        SELECT ut.target_slug INTO v_other_slug
          FROM referral.user_target ut
         WHERE ut.user_id    = p_user_id
           AND ut.active
           AND ut.target_slug IS DISTINCT FROM p_target_slug
         ORDER BY ut.enabled_at DESC
         LIMIT 1;

        IF v_other_slug IS NULL THEN
            RAISE EXCEPTION 'cannot disable last active default for user %', p_user_id
                USING ERRCODE = 'RFM01';
        END IF;
    END IF;

    UPDATE referral.user_target
       SET active      = FALSE,
           is_default  = FALSE,
           disabled_at = v_now
     WHERE user_id = p_user_id AND target_slug = p_target_slug
     RETURNING * INTO v_row;

    IF v_other_slug IS NOT NULL THEN
        UPDATE referral.user_target
           SET is_default = TRUE
         WHERE user_id = p_user_id AND target_slug = v_other_slug;
    END IF;

    RETURN v_row;
END;
$fn$;

ALTER FUNCTION referral.service_disable_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_disable_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_disable_target(UUID, TEXT)
    TO service_role;

-- ------------------------------------------------------------
-- service_set_default_target(user_id, target_slug)
--
-- Atomic default swap. Two-statement demote-then-promote because the
-- partial unique index (user_id) WHERE is_default AND active is
-- enforced row-by-row inside a single UPDATE — a one-statement
-- CASE-based swap would briefly hold two defaults and trip the index.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_set_default_target(
    p_user_id      UUID,
    p_target_slug  TEXT
)
RETURNS referral.user_target
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row referral.user_target;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    p_target_slug := lower(btrim(p_target_slug));

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    IF NOT EXISTS (
        SELECT 1 FROM referral.user_target
         WHERE user_id = p_user_id
           AND target_slug = p_target_slug
           AND active
    ) THEN
        RAISE EXCEPTION 'target % is not active for user %',
                        p_target_slug, p_user_id
            USING ERRCODE = 'RFU01';
    END IF;

    UPDATE referral.user_target
       SET is_default = FALSE
     WHERE user_id = p_user_id
       AND is_default
       AND target_slug IS DISTINCT FROM p_target_slug;

    UPDATE referral.user_target
       SET is_default = TRUE
     WHERE user_id = p_user_id
       AND target_slug = p_target_slug
       AND active
       AND NOT is_default;

    SELECT * INTO v_row
      FROM referral.user_target
     WHERE user_id = p_user_id AND target_slug = p_target_slug;

    RETURN v_row;
END;
$fn$;

ALTER FUNCTION referral.service_set_default_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_set_default_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_set_default_target(UUID, TEXT)
    TO service_role;

-- ------------------------------------------------------------
-- service_get_user_stats(user_id)
--
-- Lifetime rollup across all targets. Cheap counter query used by the
-- profile widget.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_get_user_stats(
    p_user_id UUID
)
RETURNS TABLE (
    clicks_total    BIGINT,
    clicks_credited BIGINT,
    credits_total   BIGINT,
    last_click_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT
        count(*)::BIGINT                                  AS clicks_total,
        count(*) FILTER (WHERE c.credited)::BIGINT        AS clicks_credited,
        COALESCE(SUM(l.delta) FILTER (
            WHERE c.credited AND l.id IS NOT NULL
        ), 0)::BIGINT                                     AS credits_total,
        MAX(c.created_at)                                 AS last_click_at
    FROM referral.click c
    LEFT JOIN wallet.ledger l ON l.id = c.ledger_id
    WHERE c.referrer_id = p_user_id;
$fn$;

ALTER FUNCTION referral.service_get_user_stats(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_get_user_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_get_user_stats(UUID)
    TO service_role;
