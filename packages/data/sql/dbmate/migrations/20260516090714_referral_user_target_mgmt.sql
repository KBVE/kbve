-- migrate:up

-- Referral Phase 3a — self-service management RPCs.
--
-- Phase 1 (20260515221756) shipped record_click + resolve_user_target.
-- Phase 2 (axum-kbve referral handler) consumes them for the redirect
-- path. Phase 3a adds the missing CRUD for users to actually manage
-- which targets they refer to.
--
-- Functions added (all SECURITY DEFINER, search_path locked, owned by
-- postgres, granted EXECUTE only to service_role):
--
--   referral.service_list_user_targets(user_id)
--   referral.service_enable_target(user_id, target_slug, set_as_default)
--   referral.service_disable_target(user_id, target_slug)
--   referral.service_set_default_target(user_id, target_slug)
--   referral.service_get_user_stats(user_id)
--
-- Custom SQLSTATEs (extends the Phase 1 set):
--   RFP01  reward_policy missing
--   RFT01  target not found / inactive
--   RFU01  user_target not enabled
--   RFWA1  wallet account provisioning failed
--   RFM01  attempted to disable / unset the last default while no
--          other active target exists to inherit it (forces caller to
--          set a new default first instead of dropping into a state
--          where /referral/@user/ would 404)

-- ---------------------------------------------------------------------------
-- service_list_user_targets — returns every (slug, title, url, active,
-- is_default, enabled_at, disabled_at) for the user PLUS lifetime click
-- + credit totals per target. One row per (user, target). Inactive rows
-- included so the UI can offer a "re-enable" affordance.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- service_enable_target — opt user_id into target_slug. Either:
--   - inserts a new active row, OR
--   - reactivates an existing inactive row (clears disabled_at).
-- If `p_set_as_default = TRUE` (or this is the user's first enabled
-- target), the row is also marked is_default and any other default for
-- that user is demoted in the same transaction.
-- ---------------------------------------------------------------------------
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
    v_target     referral.target%ROWTYPE;
    v_existing   referral.user_target%ROWTYPE;
    v_now        TIMESTAMPTZ := statement_timestamp();
    v_should_default BOOLEAN;
    v_row        referral.user_target;
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

    -- Serialize concurrent enable / set-default attempts so we don't
    -- briefly hold two is_default = TRUE rows for the same user.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    SELECT * INTO v_existing
      FROM referral.user_target
     WHERE user_id = p_user_id AND target_slug = p_target_slug;

    -- A first-time enable auto-becomes the default so /referral/@<user>/
    -- always has a destination.
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
        -- Row exists. Re-activate (clears disabled_at), keep enabled_at
        -- stable so audit history is honest about original opt-in time.
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

-- ---------------------------------------------------------------------------
-- service_disable_target — mark a user's target row inactive. If the
-- target being disabled was the user's default AND there is another
-- active target, that other target inherits the default. If there is
-- no other active target, raise RFM01 — the caller must pick a new
-- default explicitly (or accept losing the short /referral/@user/ URL).
-- ---------------------------------------------------------------------------
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

    -- If this row is the default, find another active row to promote.
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

-- ---------------------------------------------------------------------------
-- service_set_default_target — atomic default swap. Errors RFU01 if the
-- requested target is not an active row for the user.
-- ---------------------------------------------------------------------------
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

    -- The partial unique index on (user_id) WHERE is_default AND active
    -- is enforced row-by-row inside a single UPDATE, so demote-then-
    -- promote MUST be two statements in this order: clear any prior
    -- default first, then promote the requested row.
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

-- ---------------------------------------------------------------------------
-- service_get_user_stats — lifetime click counters across all targets.
-- Cheap rollup used by the profile widget to show "N clicks / X credits".
-- ---------------------------------------------------------------------------
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

-- migrate:down

-- Intentionally a no-op. Mgmt RPCs replace earlier ad-hoc UPDATEs;
-- dropping them would orphan callers. Manual rollback only.
SELECT 1;
