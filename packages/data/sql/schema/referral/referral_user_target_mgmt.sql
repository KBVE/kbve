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
-- Phase 3a schema hardening on referral.user_target
-- ------------------------------------------------------------

-- updated_at column + auto-bump trigger. Backfill from
-- COALESCE(disabled_at, enabled_at, now()) so the column is never NULL.
ALTER TABLE referral.user_target
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE referral.user_target
   SET updated_at = COALESCE(updated_at, disabled_at, enabled_at, now())
 WHERE updated_at IS NULL;

ALTER TABLE referral.user_target
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION referral.user_target_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    -- Only bump on material change. target_slug / user_id / enabled_at
    -- are immutable after insert (separate trigger enforces this) so
    -- they aren't part of the material-change tuple.
    IF ROW(NEW.active, NEW.is_default, NEW.disabled_at)
       IS DISTINCT FROM
       ROW(OLD.active, OLD.is_default, OLD.disabled_at)
    THEN
        NEW.updated_at := statement_timestamp();
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS user_target_set_updated_at ON referral.user_target;
CREATE TRIGGER user_target_set_updated_at
    BEFORE UPDATE ON referral.user_target
    FOR EACH ROW EXECUTE FUNCTION referral.user_target_touch();

-- Identity / audit immutability. (user_id, target_slug) is the row's
-- identity; enabled_at is the audit anchor that survives a disable +
-- re-enable cycle. Changing any of them would silently invalidate
-- historical click + ledger references.
CREATE OR REPLACE FUNCTION referral.user_target_assert_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'user_target.user_id is immutable after insert'
            USING ERRCODE = '22023';
    END IF;
    IF NEW.target_slug IS DISTINCT FROM OLD.target_slug THEN
        RAISE EXCEPTION 'user_target.target_slug is immutable after insert'
            USING ERRCODE = '22023';
    END IF;
    IF NEW.enabled_at IS DISTINCT FROM OLD.enabled_at THEN
        RAISE EXCEPTION 'user_target.enabled_at is immutable after insert'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS user_target_assert_immutable ON referral.user_target;
CREATE TRIGGER user_target_assert_immutable
    BEFORE UPDATE ON referral.user_target
    FOR EACH ROW EXECUTE FUNCTION referral.user_target_assert_immutable();

-- Belt-and-suspenders: a row cannot be is_default AND inactive at the
-- same time. The partial unique index on (user_id) WHERE is_default
-- AND active prevents two defaults; this CHECK closes the gap where
-- an out-of-band UPDATE leaves a disabled row marked is_default = TRUE.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'referral.user_target'::regclass
           AND conname = 'user_target_default_requires_active'
    ) THEN
        ALTER TABLE referral.user_target
            RENAME CONSTRAINT user_target_default_requires_active
            TO referral_user_target_default_requires_active_ck;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'referral.user_target'::regclass
           AND conname = 'referral_user_target_default_requires_active_ck'
    ) THEN
        ALTER TABLE referral.user_target
            ADD CONSTRAINT referral_user_target_default_requires_active_ck
            CHECK (active OR NOT is_default);
    END IF;
END $$;

-- (No `credited → ledger_id` CHECK added here: Phase 1's
-- click_credit_ledger_chk already enforces the stronger biconditional
-- `credited <=> ledger_id IS NOT NULL`.)

-- Hot-path indexes for the stats aggregates in
-- service_list_user_targets / service_get_user_stats.
DROP INDEX IF EXISTS referral.click_referrer_target_idx;
DROP INDEX IF EXISTS referral.click_referrer_credited_ledger_idx;
CREATE INDEX IF NOT EXISTS referral_click_referrer_target_created_idx
    ON referral.click (referrer_id, target_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_click_referrer_credited_ledger_idx
    ON referral.click (referrer_id)
    WHERE credited AND ledger_id IS NOT NULL;

-- ------------------------------------------------------------
-- service_list_user_targets(user_id)
--
-- One row per (user, target) including inactive rows so the UI can
-- offer a "re-enable" affordance. Joins to wallet.ledger for the
-- credits_total rollup, filtered to source_kind = 'referral'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_list_user_targets(
    p_user_id UUID
)
RETURNS TABLE (
    target_slug     TEXT,
    title           TEXT,
    url             TEXT,
    is_default      BOOLEAN,
    active          BOOLEAN,
    enabled_at      TIMESTAMPTZ,
    disabled_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    clicks_total    BIGINT,
    clicks_credited BIGINT,
    credits_total   BIGINT,
    last_click_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;

    RETURN QUERY
    WITH stats AS (
        SELECT
            c.target_slug AS target_slug,
            count(*)::BIGINT                                  AS clicks_total,
            count(*) FILTER (WHERE c.credited)::BIGINT        AS clicks_credited,
            COALESCE(SUM(l.delta) FILTER (
                WHERE c.credited AND l.id IS NOT NULL
            ), 0)::BIGINT                                     AS credits_total,
            MAX(c.created_at)                                 AS last_click_at
        FROM referral.click c
        LEFT JOIN wallet.ledger l
               ON l.id = c.ledger_id
              AND l.source_kind = 'referral'
        WHERE c.referrer_id = p_user_id
        GROUP BY c.target_slug
    )
    SELECT
        ut.target_slug,
        t.title,
        t.url,
        ut.is_default,
        ut.active,
        ut.enabled_at,
        ut.disabled_at,
        ut.updated_at,
        COALESCE(s.clicks_total, 0)    AS clicks_total,
        COALESCE(s.clicks_credited, 0) AS clicks_credited,
        COALESCE(s.credits_total, 0)   AS credits_total,
        s.last_click_at
    FROM referral.user_target ut
    JOIN referral.target t ON t.slug = ut.target_slug
    LEFT JOIN stats s ON s.target_slug = ut.target_slug
    WHERE ut.user_id = p_user_id
    ORDER BY ut.is_default DESC, ut.active DESC, ut.enabled_at DESC,
             ut.target_slug;
END;
$fn$;

ALTER FUNCTION referral.service_list_user_targets(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_list_user_targets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_list_user_targets(UUID)
    TO service_role;

COMMENT ON FUNCTION referral.service_list_user_targets(UUID) IS
$$Returns one row per (user, target) including inactive rows, with
lifetime click + credit aggregates. Ledger join filters source_kind =
'referral'. Service-role only.$$;

-- Return shape changed to TABLE(...) so callers learn the demoted slug.
DROP FUNCTION IF EXISTS referral.service_enable_target(UUID, TEXT, BOOLEAN);

-- ------------------------------------------------------------
-- service_enable_target(user_id, target_slug, set_as_default)
--
-- Inserts a new row, re-activates an inactive one, OR returns the
-- existing row unchanged (idempotent fast path — skips updated_at
-- bump on no-op calls). First enable auto-promotes to default so
-- /referral/@<user>/ always has a destination. When promotion demotes
-- another row, the demoted slug + updated_at come back so the caller
-- can repair cache state in one round trip.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_enable_target(
    p_user_id        UUID,
    p_target_slug    TEXT,
    p_set_as_default BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    target_slug          TEXT,
    demoted_target_slug  TEXT,
    is_default           BOOLEAN,
    active               BOOLEAN,
    enabled_at           TIMESTAMPTZ,
    disabled_at          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ,
    demoted_updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_target              referral.target%ROWTYPE;
    v_existing            referral.user_target%ROWTYPE;
    v_now                 TIMESTAMPTZ := statement_timestamp();
    v_should_default      BOOLEAN;
    v_row                 referral.user_target;
    v_demoted_slug        TEXT;
    v_demoted_updated_at  TIMESTAMPTZ;
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

    -- Lock first so target-active check + write share one critical
    -- section; FOR SHARE pins the target row against deactivation.
    PERFORM pg_advisory_xact_lock(
        hashtext('referral.user_target'),
        hashtext(p_user_id::TEXT)
    );

    SELECT t.* INTO v_target
      FROM referral.target t
     WHERE t.slug = p_target_slug AND t.active
       FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'RFT01';
    END IF;

    SELECT ut.* INTO v_existing
      FROM referral.user_target ut
     WHERE ut.user_id = p_user_id AND ut.target_slug = p_target_slug
       FOR UPDATE;

    v_should_default := p_set_as_default OR NOT EXISTS (
        SELECT 1
          FROM referral.user_target ut2
         WHERE ut2.user_id = p_user_id AND ut2.active
    );

    IF v_existing.user_id IS NOT NULL
       AND v_existing.active
       AND v_existing.disabled_at IS NULL
       AND (NOT v_should_default OR v_existing.is_default)
    THEN
        target_slug          := v_existing.target_slug;
        demoted_target_slug  := NULL;
        is_default           := v_existing.is_default;
        active               := v_existing.active;
        enabled_at           := v_existing.enabled_at;
        disabled_at          := v_existing.disabled_at;
        updated_at           := v_existing.updated_at;
        demoted_updated_at   := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_should_default THEN
        UPDATE referral.user_target AS ut
           SET is_default = FALSE
         WHERE ut.user_id = p_user_id
           AND ut.is_default
           AND ut.active
           AND ut.target_slug IS DISTINCT FROM p_target_slug
         RETURNING ut.target_slug, ut.updated_at
              INTO v_demoted_slug, v_demoted_updated_at;
    END IF;

    IF v_existing.user_id IS NOT NULL THEN
        UPDATE referral.user_target AS ut
           SET active      = TRUE,
               is_default  = CASE WHEN v_should_default THEN TRUE ELSE ut.is_default END,
               disabled_at = NULL
         WHERE ut.user_id = p_user_id AND ut.target_slug = p_target_slug
         RETURNING ut.* INTO v_row;
    ELSE
        INSERT INTO referral.user_target (
            user_id, target_slug, is_default, active, enabled_at
        ) VALUES (
            p_user_id, p_target_slug, v_should_default, TRUE, v_now
        )
        RETURNING referral.user_target.* INTO v_row;
    END IF;

    target_slug          := v_row.target_slug;
    demoted_target_slug  := v_demoted_slug;
    is_default           := v_row.is_default;
    active               := v_row.active;
    enabled_at           := v_row.enabled_at;
    disabled_at          := v_row.disabled_at;
    updated_at           := v_row.updated_at;
    demoted_updated_at   := v_demoted_updated_at;
    RETURN NEXT;
END;
$fn$;

ALTER FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN)
    TO service_role;

COMMENT ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN) IS
$$Inserts or reactivates a (user, target) row. First enable auto-
promotes to default so /referral/@<user>/ always has a destination.
Idempotent: a no-op call returns the existing row without bumping
updated_at. When the call promotes this slug to default and demotes
another, the demoted slug + updated_at come back as
demoted_target_slug / demoted_updated_at. Service-role only.$$;

-- Return shape changed across iterations; drop before recreate.
DROP FUNCTION IF EXISTS referral.service_disable_target(UUID, TEXT);

-- ------------------------------------------------------------
-- service_disable_target(user_id, target_slug)
--
-- Marks the row inactive. If it was the default, the most-recently
-- enabled remaining active row inherits the default. If no other
-- active row exists, raises RFM01 so the caller picks a new default
-- explicitly instead of silently breaking /referral/@<user>/.
--
-- Returns disabled-row fields PLUS promoted_target_slug (NULL when no
-- promotion happened) so the UI can refresh without a follow-up list.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_disable_target(
    p_user_id      UUID,
    p_target_slug  TEXT
)
RETURNS TABLE (
    target_slug          TEXT,
    promoted_target_slug TEXT,
    is_default           BOOLEAN,
    active               BOOLEAN,
    enabled_at           TIMESTAMPTZ,
    disabled_at          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ,
    promoted_updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_existing            referral.user_target%ROWTYPE;
    v_other_slug          TEXT;
    v_now                 TIMESTAMPTZ := statement_timestamp();
    v_row                 referral.user_target;
    v_promoted_updated_at TIMESTAMPTZ;
BEGIN
    -- RETURNS TABLE column names shadow same-named table columns
    -- inside this function, so every reference is aliased with `ut.`.
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

    PERFORM pg_advisory_xact_lock(
        hashtext('referral.user_target'),
        hashtext(p_user_id::TEXT)
    );

    SELECT ut.* INTO v_existing
      FROM referral.user_target ut
     WHERE ut.user_id = p_user_id AND ut.target_slug = p_target_slug
       FOR UPDATE;
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
         ORDER BY ut.enabled_at DESC, ut.target_slug ASC
         LIMIT 1
           FOR UPDATE;

        IF v_other_slug IS NULL THEN
            RAISE EXCEPTION 'cannot disable last active default for user %', p_user_id
                USING ERRCODE = 'RFM01';
        END IF;
    END IF;

    UPDATE referral.user_target AS ut
       SET active      = FALSE,
           is_default  = FALSE,
           disabled_at = v_now
     WHERE ut.user_id = p_user_id AND ut.target_slug = p_target_slug
     RETURNING ut.* INTO v_row;

    IF v_other_slug IS NOT NULL THEN
        UPDATE referral.user_target AS ut
           SET is_default = TRUE
         WHERE ut.user_id = p_user_id
           AND ut.target_slug = v_other_slug
           AND ut.active
         RETURNING ut.updated_at INTO v_promoted_updated_at;
    END IF;

    target_slug          := v_row.target_slug;
    promoted_target_slug := v_other_slug;
    is_default           := v_row.is_default;
    active               := v_row.active;
    enabled_at           := v_row.enabled_at;
    disabled_at          := v_row.disabled_at;
    updated_at           := v_row.updated_at;
    promoted_updated_at  := v_promoted_updated_at;
    RETURN NEXT;
END;
$fn$;

ALTER FUNCTION referral.service_disable_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_disable_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_disable_target(UUID, TEXT)
    TO service_role;

COMMENT ON FUNCTION referral.service_disable_target(UUID, TEXT) IS
$$Marks the (user, target) row inactive. If the row was default, the
most-recently enabled remaining active row inherits the default and
its slug + updated_at come back as promoted_target_slug /
promoted_updated_at. Caller gets enough state to refresh local cache
in one round trip. Raises RFM01 when no inheritor exists.
Service-role only.$$;

-- Return shape changed to TABLE(...) for parity with enable.
DROP FUNCTION IF EXISTS referral.service_set_default_target(UUID, TEXT);

-- ------------------------------------------------------------
-- service_set_default_target(user_id, target_slug)
--
-- Atomic default swap. Two-statement demote-then-promote because the
-- partial unique index (user_id) WHERE is_default AND active is
-- enforced row-by-row inside a single UPDATE — a one-statement
-- CASE-based swap would briefly hold two defaults and trip the index.
-- Idempotent when the slug is already the user's default. Returns
-- the demoted slug + updated_at so callers can repair cache state in
-- one round trip.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.service_set_default_target(
    p_user_id      UUID,
    p_target_slug  TEXT
)
RETURNS TABLE (
    target_slug          TEXT,
    demoted_target_slug  TEXT,
    is_default           BOOLEAN,
    active               BOOLEAN,
    enabled_at           TIMESTAMPTZ,
    disabled_at          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ,
    demoted_updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_row                 referral.user_target;
    v_demoted_slug        TEXT;
    v_demoted_updated_at  TIMESTAMPTZ;
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

    PERFORM pg_advisory_xact_lock(
        hashtext('referral.user_target'),
        hashtext(p_user_id::TEXT)
    );

    SELECT ut.* INTO v_row
      FROM referral.user_target ut
     WHERE ut.user_id = p_user_id
       AND ut.target_slug = p_target_slug
       FOR UPDATE;
    IF NOT FOUND OR NOT v_row.active THEN
        RAISE EXCEPTION 'target % is not active for user %',
                        p_target_slug, p_user_id
            USING ERRCODE = 'RFU01';
    END IF;

    IF v_row.is_default THEN
        target_slug          := v_row.target_slug;
        demoted_target_slug  := NULL;
        is_default           := v_row.is_default;
        active               := v_row.active;
        enabled_at           := v_row.enabled_at;
        disabled_at          := v_row.disabled_at;
        updated_at           := v_row.updated_at;
        demoted_updated_at   := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    UPDATE referral.user_target AS ut
       SET is_default = FALSE
     WHERE ut.user_id = p_user_id
       AND ut.is_default
       AND ut.active
       AND ut.target_slug IS DISTINCT FROM p_target_slug
     RETURNING ut.target_slug, ut.updated_at
          INTO v_demoted_slug, v_demoted_updated_at;

    UPDATE referral.user_target AS ut
       SET is_default = TRUE
     WHERE ut.user_id = p_user_id
       AND ut.target_slug = p_target_slug
       AND ut.active
     RETURNING ut.* INTO v_row;

    target_slug          := v_row.target_slug;
    demoted_target_slug  := v_demoted_slug;
    is_default           := v_row.is_default;
    active               := v_row.active;
    enabled_at           := v_row.enabled_at;
    disabled_at          := v_row.disabled_at;
    updated_at           := v_row.updated_at;
    demoted_updated_at   := v_demoted_updated_at;
    RETURN NEXT;
END;
$fn$;

ALTER FUNCTION referral.service_set_default_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_set_default_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_set_default_target(UUID, TEXT)
    TO service_role;

COMMENT ON FUNCTION referral.service_set_default_target(UUID, TEXT) IS
$$Atomic default swap (demote-then-promote). Idempotent when the slug
is already the user's default. Returns the demoted slug + updated_at
as demoted_target_slug / demoted_updated_at. Raises RFU01 when the
slug is not an active row for the user. Service-role only.$$;

-- ------------------------------------------------------------
-- service_get_user_stats(user_id)
--
-- Lifetime rollup across all targets. Cheap counter query used by the
-- profile widget. Ledger join filters source_kind = 'referral'.
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;

    RETURN QUERY
    SELECT
        count(*)::BIGINT                                  AS clicks_total,
        count(*) FILTER (WHERE c.credited)::BIGINT        AS clicks_credited,
        COALESCE(SUM(l.delta) FILTER (
            WHERE c.credited AND l.id IS NOT NULL
        ), 0)::BIGINT                                     AS credits_total,
        MAX(c.created_at)                                 AS last_click_at
    FROM referral.click c
    LEFT JOIN wallet.ledger l
           ON l.id = c.ledger_id
          AND l.source_kind = 'referral'
    WHERE c.referrer_id = p_user_id;
END;
$fn$;

ALTER FUNCTION referral.service_get_user_stats(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_get_user_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_get_user_stats(UUID)
    TO service_role;

COMMENT ON FUNCTION referral.service_get_user_stats(UUID) IS
$$Lifetime click + credit rollup across all targets for one user.
Ledger join filters source_kind = 'referral'. Service-role only.$$;
