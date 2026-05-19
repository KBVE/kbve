-- ============================================================================
-- INVENTORY CORE — schema, item_state enum, item/transition/account_security
--                  tables, audit-trigger, stack-quantity helpers, JWT helpers,
--                  2FA policy helpers + setter.
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260518091000_inventory_schema_init.sql).
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready.
--
-- Mental model:
--   KBVE inventory is an accounting ledger. Items in inventory.item are NOT
--   present in the source game (mc / rareicon / etc); the game bridges
--   credit and debit this ledger via inventory.bridge_request rows.
--   Stackable rows merge on (owner, kind, ref) via a partial unique index;
--   instanced rows (non-empty nbt) always stay one-row-per-instance.
-- ============================================================================

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS inventory;
GRANT USAGE ON SCHEMA inventory TO service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- ENUM: inventory.item_state
--   Lifecycle states a row in inventory.item can occupy. transit_in is
--   VIRTUAL — used only as the from_state on transition rows when a new
--   item row is minted (deposit_settle, listing_settle buyer-side). No
--   item row is ever stored with state = transit_in.
-- ============================================================================

CREATE TYPE inventory.item_state AS ENUM (
    'held',
    'listing_escrow',
    'transit_in',
    'transit_out',
    'consumed'
);

-- ============================================================================
-- TABLE: inventory.item
--   Canonical KBVE-side inventory row. is_stackable is a GENERATED column
--   derived from nbt = '{}' so the partial unique index, ON CONFLICT
--   predicates, and RPC checks read a single named flag.
-- ============================================================================

CREATE TABLE inventory.item (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_account UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    kind          TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
    ref           TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 128),
    qty           BIGINT NOT NULL CHECK (qty > 0 AND qty <= 9223372036854775000),
    nbt           JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(nbt) = 'object'),
    is_stackable  BOOLEAN GENERATED ALWAYS AS (nbt = '{}'::jsonb) STORED,
    state         inventory.item_state NOT NULL DEFAULT 'held',
    source        TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
    source_ref    JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(source_ref) = 'object'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX inventory_item_stackable_merge_uq
    ON inventory.item (owner_account, kind, ref)
    WHERE is_stackable AND state = 'held';

CREATE INDEX inventory_item_owner_created_active_idx
    ON inventory.item (owner_account, created_at DESC, id DESC)
    WHERE state IN ('held', 'listing_escrow');

CREATE INDEX inventory_item_kind_ref_state_idx
    ON inventory.item (kind, ref, state);

CREATE INDEX inventory_item_inflight_updated_idx
    ON inventory.item (state, updated_at)
    WHERE state IN ('transit_out', 'listing_escrow');

COMMENT ON TABLE inventory.item IS
    'Canonical KBVE inventory. Items in this table are NOT in the source game. Stackable rows merge via the partial unique index when nbt is empty.';

-- ============================================================================
-- TABLE: inventory.transition
--   Append-only audit log. Every state change writes one row. Trigger
--   below blocks UPDATE / DELETE even from the table owner.
-- ============================================================================

CREATE TABLE inventory.transition (
    id          BIGSERIAL PRIMARY KEY,
    item_id     UUID NOT NULL REFERENCES inventory.item(id) ON DELETE NO ACTION,
    from_state  inventory.item_state NOT NULL,
    to_state    inventory.item_state NOT NULL,
    actor       TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 64),
    reason      TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 128),
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(metadata) = 'object'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT transition_no_self_transition_chk CHECK (from_state <> to_state)
);

CREATE INDEX inventory_transition_item_created_idx
    ON inventory.transition (item_id, created_at DESC);

CREATE INDEX inventory_transition_created_idx
    ON inventory.transition (created_at DESC);

COMMENT ON TABLE inventory.transition IS
    'Append-only audit log of every inventory state change. Never modified after insert.';

REVOKE UPDATE, DELETE ON inventory.transition FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION inventory.transition_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'inventory.transition is append-only'
        USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION inventory.transition_block_mutation() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.transition_block_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER transition_no_update_or_delete
BEFORE UPDATE OR DELETE ON inventory.transition
FOR EACH ROW
EXECUTE FUNCTION inventory.transition_block_mutation();

-- ============================================================================
-- TABLE: inventory.account_security
--   Per-account 2FA policy. SQL owns the policy; Supabase owns the
--   verification (JWT aal claim). Mutating any "true" flag requires
--   aal2 to prevent a stolen aal1 session from disabling the gate.
-- ============================================================================

CREATE TABLE inventory.account_security (
    account                      UUID PRIMARY KEY REFERENCES wallet.account(id) ON DELETE NO ACTION,
    require_2fa_for_withdraw     BOOLEAN NOT NULL DEFAULT false,
    require_2fa_for_listing      BOOLEAN NOT NULL DEFAULT false,
    high_value_khash_threshold   BIGINT  NOT NULL DEFAULT 0 CHECK (high_value_khash_threshold >= 0),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory.account_security IS
    '2FA policy per wallet account. Verification (JWT aal claim) lives in Supabase; this table only holds the gate rules and is read by the inventory proxies before any transition.';

-- ============================================================================
-- ACCESS CONTROL
--   Direct table access is service_role only. authenticated callers route
--   through public.proxy_inventory_* SECURITY DEFINER wrappers in
--   inventory_rpcs.sql.
-- ============================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE ON inventory.item             TO service_role;
GRANT  SELECT, INSERT         ON inventory.transition       TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.account_security TO service_role;
GRANT  USAGE ON ALL SEQUENCES IN SCHEMA inventory TO service_role;
-- bridge_secret / bridge_request / bridge_receipt grants live in
-- inventory_bridge.sql alongside the table definitions.

-- ============================================================================
-- STACK QUANTITY CEILING
--   Centralized cap so RPCs and table CHECK stay in sync. 9223372036854775000
--   leaves enough BIGINT headroom for any single merge.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.max_stack_qty()
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT 9223372036854775000::bigint $$;

ALTER FUNCTION inventory.max_stack_qty() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.max_stack_qty() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.max_stack_qty() TO service_role;

-- ============================================================================
-- JWT / CALLER HELPERS
--   auth.uid() -> wallet.account scoping + JWT aal claim read.
--   inventory.caller_account() lives here so the public proxies don't have
--   to repeat the auth.uid() -> account lookup.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.caller_account()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_account UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_account
      FROM wallet.account
     WHERE kind = 'user'
       AND user_id = v_uid;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'wallet account not provisioned for user %', v_uid
            USING ERRCODE = 'INV10';
    END IF;
    RETURN v_account;
END;
$$;

ALTER FUNCTION inventory.caller_account() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.caller_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.caller_account() TO service_role;

-- Read the caller's Supabase JWT AAL claim. plpgsql wrapper catches
-- invalid_text on a malformed setting so a corrupt request.jwt.claims
-- surfaces as "no aal" (deny by default).
CREATE OR REPLACE FUNCTION inventory.caller_jwt_aal()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_raw TEXT := current_setting('request.jwt.claims', true);
BEGIN
    IF v_raw IS NULL OR v_raw = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN v_raw::jsonb ->> 'aal';
    EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN
        RETURN NULL;
    END;
END;
$$;

ALTER FUNCTION inventory.caller_jwt_aal() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.caller_jwt_aal() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.caller_jwt_aal() TO service_role;

-- ============================================================================
-- 2FA POLICY HELPERS + SETTER
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.is_2fa_required_for_withdraw(p_account UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM inventory.account_security
         WHERE account = p_account
           AND require_2fa_for_withdraw
    );
$$;

ALTER FUNCTION inventory.is_2fa_required_for_withdraw(UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.is_2fa_required_for_withdraw(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.is_2fa_required_for_withdraw(UUID) TO service_role;

CREATE OR REPLACE FUNCTION inventory.is_2fa_required_for_listing(p_account UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM inventory.account_security
         WHERE account = p_account
           AND require_2fa_for_listing
    );
$$;

ALTER FUNCTION inventory.is_2fa_required_for_listing(UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.is_2fa_required_for_listing(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.is_2fa_required_for_listing(UUID) TO service_role;

CREATE OR REPLACE FUNCTION inventory.service_set_security_policy(
    p_account                     UUID,
    p_require_2fa_for_withdraw    BOOLEAN,
    p_require_2fa_for_listing     BOOLEAN,
    p_high_value_threshold        BIGINT DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_require_withdraw BOOLEAN := COALESCE(p_require_2fa_for_withdraw, FALSE);
    v_require_listing  BOOLEAN := COALESCE(p_require_2fa_for_listing,  FALSE);
    v_threshold        BIGINT  := COALESCE(p_high_value_threshold, 0);
BEGIN
    IF p_account IS NULL THEN
        RAISE EXCEPTION 'account is required' USING ERRCODE = '22004';
    END IF;
    IF v_threshold < 0 THEN
        RAISE EXCEPTION 'threshold must be non-negative' USING ERRCODE = '22023';
    END IF;

    INSERT INTO inventory.account_security (
        account, require_2fa_for_withdraw, require_2fa_for_listing,
        high_value_khash_threshold
    ) VALUES (
        p_account, v_require_withdraw, v_require_listing, v_threshold
    )
    ON CONFLICT (account) DO UPDATE
        SET require_2fa_for_withdraw   = excluded.require_2fa_for_withdraw,
            require_2fa_for_listing    = excluded.require_2fa_for_listing,
            high_value_khash_threshold = excluded.high_value_khash_threshold,
            updated_at                 = now();
END;
$$;

ALTER FUNCTION inventory.service_set_security_policy(UUID, BOOLEAN, BOOLEAN, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_set_security_policy(UUID, BOOLEAN, BOOLEAN, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_set_security_policy(UUID, BOOLEAN, BOOLEAN, BIGINT) TO service_role;
