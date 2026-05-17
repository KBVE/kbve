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
--   RFT01  target not found / inactive (raised by enable; row is
--          locked FOR SHARE inside the per-user advisory lock so the
--          check + write happen in one critical section)
--   RFU01  user_target row not enabled / not active for the caller
--          (raised by disable + set_default)
--   RFM01  attempted to disable / unset the last active default while
--          no other active target exists to inherit it (forces caller
--          to set a new default first instead of dropping into a state
--          where /referral/@user/ would 404)
--
-- Advisory-lock contract: every mutating RPC below takes
--   pg_advisory_xact_lock(hashtext('referral.user_target'),
--                         hashtext(p_user_id::TEXT))
-- before reading + writing referral.user_target. Direct admin
-- mutations (or any future writer) MUST take the same lock to
-- preserve the "at most one is_default+active row per user" invariant
-- across the demote / promote two-statement swap. The partial unique
-- index on (user_id) WHERE is_default AND active catches violations,
-- but the lock keeps callers from racing into it. The contract is
-- also stamped onto referral.user_target via COMMENT ON TABLE below
-- so it surfaces in `\d+` and pg_catalog introspection.
--
-- Promote-ordering contract (used by service_disable_target when the
-- disabled row was default): the inheritor is picked with
--   ORDER BY enabled_at DESC, target_slug ASC LIMIT 1
-- i.e. the most-recently-enabled active target wins, with target_slug
-- as a deterministic tiebreaker for rows sharing enabled_at. This is
-- a behavioral contract callers can rely on, not an accident of the
-- current implementation. service_enable_target and
-- service_set_default_target return the demoted slug separately, so
-- both sides of the swap are observable by the caller.
--
-- Orphan-row prevention is handled at the schema level, not in this
-- migration: Phase 1 (20260515221756_referral_schema_init) declared
--   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
-- on referral.user_target, so the service-role RPCs below cannot
-- create rows for non-existent users — a bad UUID raises 23503
-- before any state change. The same FK auto-cleans referral state
-- when an auth user is deleted.
--
-- Timestamp policy: every RPC uses statement_timestamp() so a single
-- disable + promote (or enable + demote) round-trip stamps both rows
-- with the same updated_at. Callers that depend on a strict per-row
-- mutation order should not use updated_at as a tiebreaker — use the
-- explicit promoted_target_slug / demoted_target_slug fields that
-- come back in the result row.

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
    -- Only bump on material change. Idempotent self-rewrites (e.g.
    -- `SET active = active`) stay no-ops so downstream cache
    -- invalidation hooks don't fire for writes that didn't move
    -- user-visible state. target_slug / user_id / enabled_at are
    -- immutable after insert (separate trigger below enforces that),
    -- so they aren't part of the material-change tuple.
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

-- Identity / audit immutability: (user_id, target_slug) is the row's
-- identity and enabled_at is its audit anchor. Changing any of them
-- would invalidate historical click + ledger references that key on
-- (user_id, target_slug). Re-activation deliberately keeps enabled_at
-- stable so "first opt-in time" is honest across an enable / disable /
-- re-enable cycle.
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

-- Discoverable via `\d+ referral.user_target` and pg_description: the
-- advisory-lock contract that every writer to this table must follow.
COMMENT ON TABLE referral.user_target IS
$$Per-(user, target) opt-in. At most one row per user has
is_default = TRUE AND active = TRUE (enforced by a partial unique
index). Every mutating writer MUST take
  pg_advisory_xact_lock(hashtext('referral.user_target'),
                        hashtext(user_id::text))
before reading + writing or the demote / promote two-statement swap
can race. Identity columns (user_id, target_slug) and audit anchor
(enabled_at) are immutable after insert (enforced by
referral.user_target_assert_immutable trigger).$$;

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

-- Primary shape targets the per-(referrer_id, target_slug) group-by
-- in service_list_user_targets. service_get_user_stats can scan the
-- leading referrer_id prefix, but that's acceptable-not-ideal because
-- target_slug sits between referrer_id and created_at. If the global
-- rollup ever becomes hot, the natural follow-up index is
--   (referrer_id, created_at DESC)
-- — add it then, not preemptively.
CREATE INDEX IF NOT EXISTS referral_click_referrer_target_created_idx
    ON referral.click (referrer_id, target_slug, created_at DESC);

-- Partial index over credited rows carries (referrer_id, ledger_id)
-- so the wallet.ledger join can use it as the outer side of the join
-- without a heap fetch for ledger_id. An earlier iteration only
-- indexed (referrer_id), forcing a heap probe to recover ledger_id
-- per matching row; widen here while the table is empty so the next
-- iteration doesn't need a separate rebuild migration.
DROP INDEX IF EXISTS referral.referral_click_referrer_credited_ledger_idx;
CREATE INDEX IF NOT EXISTS referral_click_referrer_credited_ledger_idx
    ON referral.click (referrer_id, ledger_id)
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

-- Return-shape changed from `referral.user_target` to TABLE(...) in
-- this iteration so callers learn which other slug got demoted when
-- a new default replaces an old one — no follow-up list call needed.
DROP FUNCTION IF EXISTS referral.service_enable_target(UUID, TEXT, BOOLEAN);

-- ---------------------------------------------------------------------------
-- service_enable_target — opt user_id into target_slug. Either:
--   - inserts a new active row, OR
--   - reactivates an existing inactive row (clears disabled_at), OR
--   - returns the existing active row unchanged when no state change
--     is needed (idempotent fast path).
-- If `p_set_as_default = TRUE` (or this is the user's first enabled
-- target), the row is marked is_default and any prior default is
-- demoted in the same transaction. demoted_target_slug +
-- demoted_updated_at come back in the result row so the caller can
-- repair local cache state in one round trip.
-- ---------------------------------------------------------------------------
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
    -- RETURNS TABLE column names (target_slug, is_default, active, ...)
    -- shadow same-named table columns inside this function, so every
    -- table-column reference is aliased with `ut.`.
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

    -- Lock first so the target-active check + INSERT/UPDATE all run
    -- inside one per-user critical section. Closes the TOCTOU window
    -- where a concurrent tx could deactivate the target between our
    -- check and our write.
    PERFORM pg_advisory_xact_lock(
        hashtext('referral.user_target'),
        hashtext(p_user_id::TEXT)
    );

    -- FOR SHARE acquires a SHARE row lock on this exact target row;
    -- blocks concurrent UPDATE / DELETE on it (including an admin
    -- flipping referral.target.active = FALSE) until this tx commits.
    -- It does NOT guard against replacement patterns at the
    -- application layer (delete-then-reinsert under the same slug);
    -- those would need higher-level coordination. For the in-process
    -- mgmt RPCs it's sufficient.
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

    -- Idempotent fast path: existing row already in desired shape.
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
        -- Re-activate. enabled_at stays put (immutability trigger
        -- would reject a change anyway), so audit history is honest.
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
updated_at. When the call promotes this slug to default and another
row gets demoted, the demoted slug + updated_at come back as
demoted_target_slug / demoted_updated_at. Service-role only.$$;

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

    -- Explicit two-int form keeps the namespace separate from the
    -- per-user key so future advisory-lock users in other domains
    -- can't accidentally collide on a single-int hash.
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
        -- FOR UPDATE pins the inheritor row for the rest of the
        -- transaction so an admin (or any future writer that skips
        -- the advisory lock) can't deactivate it between the SELECT
        -- and the promote UPDATE below.
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
inheritor is picked deterministically by
  ORDER BY enabled_at DESC, target_slug ASC LIMIT 1
(most-recently-enabled wins; slug breaks enabled_at ties). The
inheritor's slug + updated_at come back as promoted_target_slug /
promoted_updated_at so the caller can refresh local cache in one
round trip. Raises RFM01 when no inheritor exists. Service-role
only.$$;

-- Return-shape change carries demoted info, same reasoning as
-- service_enable_target above.
DROP FUNCTION IF EXISTS referral.service_set_default_target(UUID, TEXT);

-- ---------------------------------------------------------------------------
-- service_set_default_target — atomic default swap. Errors RFU01 if the
-- requested target is not an active row for the user. Idempotent fast
-- path returns the row unchanged when it's already the default so
-- repeated calls don't churn updated_at. Returns the demoted slug +
-- updated_at when a prior default exists, so callers can repair local
-- cache state in one round trip.
-- ---------------------------------------------------------------------------
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
    -- Table-column refs aliased with `ut.` to dodge OUT-param shadowing.
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

    -- Already the default → idempotent no-op. Skipping the writes
    -- avoids touching updated_at and burning advisory-lock waiters
    -- on a do-nothing call.
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

    -- Two-statement demote-then-promote (the partial unique index on
    -- (user_id) WHERE is_default AND active is enforced row-by-row
    -- inside a single UPDATE, so a CASE-based swap would trip it).
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
is already the user's default. Returns the demoted slug +
updated_at as demoted_target_slug / demoted_updated_at so the caller
can repair local cache state in one round trip. Raises RFU01 when the
slug is not an active row for the user. Service-role only.$$;

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
--   -- Indexes live in the same schema as the table they index, so the
--   -- `referral.<name>` qualifier below is the index's schema-qualified
--   -- object name (the name itself just happens to start with `referral_`).
--   -- If a future migration adds (referrer_id, created_at DESC) for the
--   -- global rollup path, drop it here too.
--   DROP INDEX  IF EXISTS referral.referral_click_referrer_credited_ledger_idx;
--   DROP INDEX  IF EXISTS referral.referral_click_referrer_target_created_idx;
--   ALTER TABLE referral.user_target
--     DROP CONSTRAINT IF EXISTS referral_user_target_default_requires_active_ck;
--   DROP TRIGGER  IF EXISTS user_target_assert_immutable ON referral.user_target;
--   DROP FUNCTION IF EXISTS referral.user_target_assert_immutable();
--   DROP TRIGGER  IF EXISTS user_target_set_updated_at ON referral.user_target;
--   DROP FUNCTION IF EXISTS referral.user_target_touch();
--   COMMENT ON TABLE referral.user_target IS NULL;
--   ALTER TABLE referral.user_target DROP COLUMN IF EXISTS updated_at;
--
-- Emergency repair on identity columns (user_id / target_slug /
-- enabled_at): disable the immutability trigger for the session,
-- repair, re-enable. The trigger is `BEFORE UPDATE FOR EACH ROW`, so
-- session-scoped disable is enough — no other writer can sneak
-- through a bad write while it's off, because writers hold the
-- per-user advisory lock.
--
--   BEGIN;
--   ALTER TABLE referral.user_target
--     DISABLE TRIGGER user_target_assert_immutable;
--   -- targeted UPDATE here
--   ALTER TABLE referral.user_target
--     ENABLE TRIGGER user_target_assert_immutable;
--   COMMIT;

SELECT 1;
