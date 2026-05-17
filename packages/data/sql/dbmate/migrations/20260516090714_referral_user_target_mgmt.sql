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
-- Custom SQLSTATEs raised by Phase 3a (Phase 1 set inherited; RFP01 +
-- RFWA1 are reachable from record_click only and don't fire from
-- these mgmt RPCs, but they stay in the central reference):
--   RFT01  target not found / inactive
--   RFU01  user_target not enabled
--   RFM01  attempted to disable / unset the last active default while
--          no other active target exists to inherit it (forces caller
--          to set a new default first instead of dropping into a state
--          where /referral/@user/ would 404)

-- ---------------------------------------------------------------------------
-- Phase 3a schema hardening on referral.user_target
-- ---------------------------------------------------------------------------

-- updated_at column + auto-bump trigger for admin + cache-invalidation
-- visibility. Backfill existing rows from enabled_at so the column is
-- never NULL.
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
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS user_target_set_updated_at ON referral.user_target;
CREATE TRIGGER user_target_set_updated_at
    BEFORE UPDATE ON referral.user_target
    FOR EACH ROW EXECUTE FUNCTION referral.user_target_touch();

-- Belt-and-suspenders invariant: a row cannot be is_default AND inactive
-- at the same time. The partial unique index on (user_id) WHERE
-- is_default AND active already prevents two defaults; this CHECK
-- closes the loophole where an out-of-band UPDATE leaves a disabled
-- row marked is_default = TRUE. Idempotent rename handles earlier
-- iterations that used the unprefixed name.
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
-- `credited <=> ledger_id IS NOT NULL`. A separate one-sided CHECK
-- would be strictly implied by the existing one — redundant noise.)

-- Hot-path indexes for the stats aggregates in
-- service_list_user_targets / service_get_user_stats. Rename earlier
-- iterations to the schema_table_columns_idx convention.
DROP INDEX IF EXISTS referral.click_referrer_target_idx;
DROP INDEX IF EXISTS referral.click_referrer_credited_ledger_idx;
CREATE INDEX IF NOT EXISTS referral_click_referrer_target_created_idx
    ON referral.click (referrer_id, target_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_click_referrer_credited_ledger_idx
    ON referral.click (referrer_id)
    WHERE credited AND ledger_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- service_list_user_targets — returns every (slug, title, url, active,
-- is_default, enabled_at, disabled_at, updated_at) for the user PLUS
-- lifetime click + credit totals per target. One row per (user, target).
-- Inactive rows included so the UI can offer a "re-enable" affordance.
-- ---------------------------------------------------------------------------
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
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;

    -- Aggregate click stats once over the user's click rows and join
    -- onto user_target. The ledger join is filtered to source_kind =
    -- 'referral' so a future overlap of ledger ids across source kinds
    -- can't double-count credits here.
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

-- ---------------------------------------------------------------------------
-- service_enable_target — opt user_id into target_slug. Either:
--   - inserts a new active row, OR
--   - reactivates an existing inactive row (clears disabled_at), OR
--   - returns the existing active row unchanged when no state change
--     is needed (idempotent fast path, avoids spurious updated_at
--     bumps that would invalidate caches for free).
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

    -- Serialize concurrent enable / set-default attempts so we don't
    -- briefly hold two is_default = TRUE rows for the same user.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    -- FOR UPDATE pins the existing row (if any) for the rest of the tx
    -- so a concurrent disable can't slip in between this read and the
    -- UPDATE below.
    SELECT * INTO v_existing
      FROM referral.user_target
     WHERE user_id = p_user_id AND target_slug = p_target_slug
       FOR UPDATE;

    -- A first-time enable auto-becomes the default so /referral/@<user>/
    -- always has a destination.
    v_should_default := p_set_as_default OR NOT EXISTS (
        SELECT 1
          FROM referral.user_target
         WHERE user_id = p_user_id AND active
    );

    -- Idempotent fast path: row already exists in the desired shape, no
    -- writes needed. Skipping the UPDATE avoids touching updated_at,
    -- which is meaningful for downstream cache invalidation.
    IF v_existing.user_id IS NOT NULL
       AND v_existing.active
       AND v_existing.disabled_at IS NULL
       AND (NOT v_should_default OR v_existing.is_default)
    THEN
        RETURN v_existing;
    END IF;

    IF v_should_default THEN
        UPDATE referral.user_target
           SET is_default = FALSE
         WHERE user_id = p_user_id
           AND is_default
           AND active
           AND target_slug IS DISTINCT FROM p_target_slug;
    END IF;

    IF v_existing.user_id IS NOT NULL THEN
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

COMMENT ON FUNCTION referral.service_enable_target(UUID, TEXT, BOOLEAN) IS
$$Inserts or reactivates a (user, target) row. First enable auto-
promotes to default so /referral/@<user>/ always has a destination.
Idempotent: a no-op call returns the existing row without bumping
updated_at. Service-role only.$$;

-- Return-shape changed from `referral.user_target` to TABLE(...) in
-- this migration iteration; CREATE OR REPLACE cannot change a
-- function's return type, so drop first.
DROP FUNCTION IF EXISTS referral.service_disable_target(UUID, TEXT);

-- ---------------------------------------------------------------------------
-- service_disable_target — mark a user's target row inactive. If the
-- target being disabled was the user's default AND there is another
-- active target, that other target inherits the default. If there is
-- no other active target, raise RFM01 — the caller must pick a new
-- default explicitly (or accept losing the short /referral/@user/ URL).
--
-- Returns a row that includes both the disabled slug AND the promoted
-- slug (NULL when no promotion happened) so the caller can update its
-- UI without a follow-up list call.
-- ---------------------------------------------------------------------------
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
    disabled_at          TIMESTAMPTZ
)
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
    -- RETURNS TABLE column names (target_slug, is_default, active, ...)
    -- shadow same-named table columns inside this function, so every
    -- reference to those columns is explicitly aliased with `ut.`.
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
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
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
         LIMIT 1;

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
           AND ut.active;
    END IF;

    target_slug          := v_row.target_slug;
    promoted_target_slug := v_other_slug;
    is_default           := v_row.is_default;
    active               := v_row.active;
    enabled_at           := v_row.enabled_at;
    disabled_at          := v_row.disabled_at;
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
its slug comes back as promoted_target_slug. Raises RFM01 when no
inheritor exists. Service-role only.$$;

-- ---------------------------------------------------------------------------
-- service_set_default_target — atomic default swap. Errors RFU01 if the
-- requested target is not an active row for the user. Idempotent fast
-- path returns the row unchanged when it's already the default so
-- repeated calls don't churn updated_at.
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
    IF p_target_slug = '' THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.user_target:' || p_user_id::TEXT, 0)
    );

    SELECT * INTO v_row
      FROM referral.user_target
     WHERE user_id = p_user_id
       AND target_slug = p_target_slug
       FOR UPDATE;
    IF NOT FOUND OR NOT v_row.active THEN
        RAISE EXCEPTION 'target % is not active for user %',
                        p_target_slug, p_user_id
            USING ERRCODE = 'RFU01';
    END IF;

    -- Already the default → idempotent no-op. Skipping the writes
    -- avoids touching updated_at and burning advisory-lock waiters
    -- on a do-nothing call.
    IF v_row.is_default THEN
        RETURN v_row;
    END IF;

    -- The partial unique index on (user_id) WHERE is_default AND active
    -- is enforced row-by-row inside a single UPDATE, so demote-then-
    -- promote MUST be two statements in this order: clear any prior
    -- default first, then promote the requested row.
    UPDATE referral.user_target
       SET is_default = FALSE
     WHERE user_id = p_user_id
       AND is_default
       AND active
       AND target_slug IS DISTINCT FROM p_target_slug;

    UPDATE referral.user_target
       SET is_default = TRUE
     WHERE user_id = p_user_id
       AND target_slug = p_target_slug
       AND active
     RETURNING * INTO v_row;

    RETURN v_row;
END;
$fn$;

ALTER FUNCTION referral.service_set_default_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.service_set_default_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.service_set_default_target(UUID, TEXT)
    TO service_role;

COMMENT ON FUNCTION referral.service_set_default_target(UUID, TEXT) IS
$$Atomic default swap (demote-then-promote). Idempotent when the slug
is already the user's default. Raises RFU01 when the slug is not an
active row for the user. Service-role only.$$;

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
LANGUAGE plpgsql
STABLE
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

-- migrate:down

-- Intentionally a no-op. Mgmt RPCs replace earlier ad-hoc UPDATEs;
-- dropping them would orphan callers. Manual rollback only, in this
-- order (run as superuser):
--
--   DROP FUNCTION IF EXISTS referral.service_get_user_stats(UUID);
--   DROP FUNCTION IF EXISTS referral.service_set_default_target(UUID, TEXT);
--   DROP FUNCTION IF EXISTS referral.service_disable_target(UUID, TEXT);
--   DROP FUNCTION IF EXISTS referral.service_enable_target(UUID, TEXT, BOOLEAN);
--   DROP FUNCTION IF EXISTS referral.service_list_user_targets(UUID);
--   DROP INDEX  IF EXISTS referral.referral_click_referrer_credited_ledger_idx;
--   DROP INDEX  IF EXISTS referral.referral_click_referrer_target_created_idx;
--   ALTER TABLE referral.user_target
--     DROP CONSTRAINT IF EXISTS referral_user_target_default_requires_active_ck;
--   DROP TRIGGER  IF EXISTS user_target_set_updated_at ON referral.user_target;
--   DROP FUNCTION IF EXISTS referral.user_target_touch();
--   ALTER TABLE referral.user_target DROP COLUMN IF EXISTS updated_at;

SELECT 1;
