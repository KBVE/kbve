-- migrate:up

-- Phase 6.0 of the marketplace bootstrap: KBVE inventory layer.
--
-- The KBVE inventory is the canonical ledger of items owned by a
-- wallet account. Once an item is in the inventory, it is NOT in the
-- source game; the game's runtime inventory and the KBVE inventory are
-- mutually exclusive. Games are bridges; the ledger is authoritative.
--
-- Anti-dupe design
--   Every deposit / withdraw flows through a two-phase coordinator
--   (inventory.bridge_request). The game bridge MUST present a signed
--   HMAC receipt referencing a unique game_tx_hash; the receipt is
--   inserted into inventory.bridge_receipt with the hash as primary key
--   so the same physical game-side transaction can never settle twice.
--   The settlement RPC is idempotent against the (game_tx_hash, secret)
--   pair: re-presenting the same receipt returns the same item_id.
--
-- Stackable vs instanced
--   nbt = '{}' rows merge on (owner_account, kind, ref) via a partial
--   unique index. Enchanted / damaged / named items carry a non-empty
--   nbt and always stay one-row-per-item.
--
-- Withdraw timeout
--   Withdraw rows park in state = 'transit_out' until the bridge
--   settles. There is NO auto-rollback — that would risk a dup if the
--   game finished delivery before the bridge could ack. Reconciliation
--   cron (Phase 6.5) flags stuck rows for admin review.
--
-- Listing integration
--   wallet.service_create_listing will (in a follow-up migration) call
--   inventory.service_listing_lock to flip the item to listing_escrow.
--   Cancel / expire call _unlock; sale settlement calls _settle which
--   transfers ownership atomically. The wallet.listing.item_ref JSONB
--   becomes a denormalised projection of the inventory row; the
--   inventory row is the source of truth.

-- ============================================================================
-- SCHEMA + GRANTS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS inventory;
GRANT USAGE ON SCHEMA inventory TO service_role;

-- pgcrypto is already enabled in production for gen_random_uuid() and
-- hmac(); we list it here so local dev stacks pick it up via the init
-- scripts if they haven't already.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE inventory.item_state AS ENUM (
    'held',             -- in KBVE inventory, available to the owner
    'listing_escrow',   -- locked by an active marketplace listing
    'transit_in',       -- VIRTUAL: used only as the from_state in
                        -- inventory.transition rows when a new item
                        -- row is minted (deposit_settle, listing_settle
                        -- buyer-side). No inventory.item row is ever
                        -- stored with this state.
    'transit_out',      -- mid-withdraw; deducted from owner, awaiting bridge ack
    'consumed'          -- terminal: sold to buyer, burned, or withdrawn out
);

CREATE TYPE inventory.bridge_direction AS ENUM ('deposit', 'withdraw');

CREATE TYPE inventory.bridge_status AS ENUM (
    'pending',     -- created, awaiting bridge action
    'in_progress', -- bridge acknowledged (reserved for Phase 6.5 worker;
                   -- no current RPC transitions to this value)
    'settled',     -- completed successfully
    'failed',      -- bridge or verification rejected; terminal
    'cancelled'    -- user / admin abandoned; terminal
);

-- ============================================================================
-- ERROR CODE MAP (custom SQLSTATEs)
-- ============================================================================
-- INV01  bridge_request not found
-- INV02  bridge_request direction mismatch
-- INV03  game_tx_hash collision (different bridge_request)
-- INV04  bridge_request already terminal
-- INV05  bridge_request expired
-- INV06  HMAC verification failed
-- INV07  payload_sha256 mismatch
-- INV08  idempotency_key replay parameter mismatch
-- INV10  inventory.item not found
-- INV11  inventory.item not owned by caller
-- INV12  inventory.item not in held state
-- INV13  inventory.item qty insufficient for withdraw
-- INV14  inventory.item not in transit_out at settle
-- INV15  instanced (non-empty nbt) item must be withdrawn whole
-- INV16  qty overflow on stackable merge (qty + delta > BIGINT max)
-- INV20  listing_lock: item not in held state
-- INV21  listing_unlock: item not in listing_escrow state
-- INV22  listing_settle: item not in listing_escrow state
-- INV23  listing_lock/settle: seller account mismatch
-- INV30  mfa_required (aal2 missing for gated transition)
-- ============================================================================
--
-- LOCK ORDER CONTRACT
--   To keep wallet ↔ inventory integration deadlock-free, when a single
--   transaction needs to row-lock rows in MORE THAN ONE category below,
--   it must lock them in this order, top first:
--
--     1. wallet.listing            (the marketplace coordinator row)
--     2. wallet.account (seller)
--     3. wallet.account (buyer)
--     4. inventory.bridge_request  (the bridge coordinator row)
--     5. inventory.bridge_receipt  (FK target only; never row-locked)
--     6. inventory.item            (held / escrow / transit rows)
--     7. inventory.account_security
--
--   A function that touches only ONE category may lock that category
--   directly without first acquiring any higher-numbered category. For
--   example service_listing_lock locks only inventory.item — that is
--   fine and does NOT violate the order. The order only matters for
--   cross-category transactions like wallet checkout flows that will
--   land in Phase 6.1.
--
-- UPDATED_AT POLICY
--   inventory.* updated_at columns are maintained by the service RPCs in
--   this migration, NOT by a trigger. Every UPDATE path in this file
--   sets updated_at = now() explicitly. If a new mutation path is added
--   later, either: (a) set updated_at in the UPDATE, or (b) replace this
--   policy with a BEFORE UPDATE trigger on each table. Mixing the two
--   silently leaves stale updated_at values; pick one and stick with it.
--
-- ROADMAP (deferred to later phases — explicit so reviewers can track):
--   Phase 6.1 (wallet listing rewire):
--     * service_split_item_for_listing — dedicated partial-row split RPC
--       so callers don't have to misuse withdraw_begin's split path.
--     * Listing ownership FK / validation — prove p_listing_id still
--       belongs to (p_seller_account, p_item_id) at lock/settle time.
--     * high_value_khash_threshold wiring on listing creation (aal2 gate).
--   Phase 6.5 (bridge worker + reconciliation):
--     * Versioned bridge secrets (kid + active_from/retired_at) so
--       rotation does not invalidate in-flight signed receipts.
--     * service_bridge_request_fail / _cancel RPCs (sets status,
--       completed_at; for withdraws also returns item to held).
--     * service_bridge_claim_pending(p_game_id, p_direction, p_limit)
--       using FOR UPDATE SKIP LOCKED, plus attempt_count / last_error /
--       claimed_at / claimed_by / next_attempt_at columns.
--     * Move HMAC verification fully into axum (constant-time);
--       inventory.verify_hmac stays as defense in depth only.
-- ============================================================================

-- ============================================================================
-- TABLE: inventory.bridge_secret
--   Per-game HMAC secret used to verify bridge receipts. Insert via the
--   register RPC; the SHA-256 of the secret is stored, never the secret
--   itself. Bridges sign payloads with the raw secret out-of-band; the
--   axum bridge endpoint compares H(secret) on each request.
-- ============================================================================

CREATE TABLE inventory.bridge_secret (
    game_id      TEXT PRIMARY KEY CHECK (length(game_id) BETWEEN 1 AND 64),
    secret_hash  TEXT NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
    label        TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 128),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at   TIMESTAMPTZ
);

COMMENT ON TABLE inventory.bridge_secret IS
    'Per-game HMAC verification material. secret_hash is sha256(raw_secret); the raw secret never enters the database.';

-- ============================================================================
-- TABLE: inventory.bridge_request
-- ============================================================================

CREATE TABLE inventory.bridge_request (
    id            BIGSERIAL PRIMARY KEY,
    account       UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    direction     inventory.bridge_direction NOT NULL,
    game_id       TEXT NOT NULL REFERENCES inventory.bridge_secret(game_id) ON DELETE NO ACTION,
    kind          TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
    ref           TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 128),
    -- Same operational cap as inventory.item.qty; refuse bridge requests
    -- that would lead to over-cap rows on settle.
    qty           BIGINT NOT NULL CHECK (qty > 0 AND qty <= 9223372036854775000),
    nbt           JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(nbt) = 'object'),
    status        inventory.bridge_status NOT NULL DEFAULT 'pending',
    idempotency_key  UUID NOT NULL,
    item_id          UUID,
    game_ref         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(game_ref) = 'object'),
    receipt_tx_hash  TEXT,
    expires_at       TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- settled_at: when the bridge produced a valid receipt. Only ever
    --   set for status='settled'. Never set for failed/cancelled.
    -- completed_at: when the request reached ANY terminal status (settled,
    --   failed, or cancelled). Lets reconciliation jobs reason about
    --   "how long did this take" without overloading settled_at.
    settled_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    -- Populated by future service_bridge_request_fail / _cancel RPCs.
    -- Free-form short label ("expired", "game_offline", "user_cancel"
    -- etc.) plus structured metadata for whatever the failure path
    -- needs to carry forward. NULL while pending/in_progress.
    terminal_reason     TEXT
                        CHECK (terminal_reason IS NULL
                               OR (length(terminal_reason) BETWEEN 1 AND 64)),
    terminal_metadata   JSONB
                        CHECK (terminal_metadata IS NULL
                               OR jsonb_typeof(terminal_metadata) = 'object'),

    CONSTRAINT bridge_request_expires_window_chk
        CHECK (expires_at > created_at
               AND expires_at <= created_at + interval '24 hours'),

    -- Manual or admin terminal updates (when service_bridge_request_fail
    -- / _cancel land in Phase 6.5) MUST set terminal_reason — otherwise
    -- reconciliation tooling has no signal to triage on. Direct
    -- `UPDATE bridge_request SET status='failed'` is rejected.
    CONSTRAINT bridge_request_terminal_consistency_chk CHECK (
        (status = 'settled'
            AND settled_at IS NOT NULL
            AND completed_at IS NOT NULL
            AND receipt_tx_hash IS NOT NULL
            AND terminal_reason IS NULL)
        OR
        (status IN ('failed', 'cancelled')
            AND settled_at IS NULL
            AND completed_at IS NOT NULL
            AND receipt_tx_hash IS NULL
            AND terminal_reason IS NOT NULL)
        OR
        (status IN ('pending', 'in_progress')
            AND settled_at IS NULL
            AND completed_at IS NULL
            AND receipt_tx_hash IS NULL
            AND terminal_reason IS NULL
            AND terminal_metadata IS NULL)
    ),

    CONSTRAINT bridge_request_id_game_uq UNIQUE (id, game_id)
);

-- Idempotency lookup: every retry of *_begin walks this index, then
-- compares identity fields (direction/game/kind/ref/qty/item). INCLUDE
-- the hot identity columns so the replay path is an index-only scan
-- and skips a heap fetch. nbt is intentionally left off; it's not in
-- the identity tuple often enough to justify the index bloat.
CREATE UNIQUE INDEX inventory_bridge_request_account_key_uq
    ON inventory.bridge_request (account, idempotency_key)
    INCLUDE (id, direction, game_id, kind, ref, qty, item_id, status);

CREATE INDEX inventory_bridge_request_status_dir_created_idx
    ON inventory.bridge_request (status, direction, created_at DESC);

CREATE INDEX inventory_bridge_request_stuck_idx
    ON inventory.bridge_request (status, expires_at)
    WHERE status IN ('pending', 'in_progress');

-- User-facing "my pending transfers" feed. proxy_inventory_list_pending
-- filters by account + status IN (pending, in_progress) and orders by
-- (created_at DESC, id DESC). Partial index moves the status predicate
-- out of the key columns so the planner gets a clean ordered walk.
CREATE INDEX inventory_bridge_request_account_pending_idx
    ON inventory.bridge_request (account, created_at DESC, id DESC)
    WHERE status IN ('pending', 'in_progress');

-- Admin/reconciliation: "what bridge_request touched this item?"
-- Sparse — item_id is NULL until the begin RPC fills it — so partial
-- index avoids indexing NULL entries.
CREATE INDEX inventory_bridge_request_item_idx
    ON inventory.bridge_request (item_id)
    WHERE item_id IS NOT NULL;

-- Bridge-worker pickup. Game plugins poll for pending work scoped to
-- their game_id; partial-index on status=pending keeps this cheap as
-- the table grows.
CREATE INDEX inventory_bridge_request_pickup_idx
    ON inventory.bridge_request (game_id, direction, created_at)
    WHERE status = 'pending';

-- Per-game stuck/expired scan for the Phase 6.5 reconciliation cron.
-- Filtered to the same non-terminal statuses bridge workers care about.
CREATE INDEX inventory_bridge_request_game_stuck_idx
    ON inventory.bridge_request (game_id, status, expires_at)
    WHERE status IN ('pending', 'in_progress');

COMMENT ON TABLE inventory.bridge_request IS
    'Two-phase coordinator for deposit + withdraw flows. The receipt_tx_hash links to inventory.bridge_receipt once the bridge settles.';
COMMENT ON COLUMN inventory.bridge_request.item_id IS
    'Resulting inventory row affected by settlement. For deposits this may be a pre-existing row that was bumped via stackable merge; for withdraws it is the (possibly split) transit_out row that was created in begin.';

-- ============================================================================
-- TABLE: inventory.bridge_receipt
--   The anti-dupe primary primitive. game_tx_hash is the bridge-supplied
--   stable id for the game-side transaction (e.g. mc server tick + slot +
--   player UUID + nonce, hashed). Inserting a row with a duplicate hash
--   raises a unique-violation, which we surface as a 409 conflict from
--   axum. The HMAC verify must succeed BEFORE the row is inserted; we
--   keep the signature alongside the hash so audits can re-verify later.
-- ============================================================================

CREATE TABLE inventory.bridge_receipt (
    -- SHA-256 hex of the bridge-side transaction identity. The bridge
    -- worker picks the hash inputs (e.g. mc tick + slot + player UUID +
    -- nonce) and ships the hex digest; we enforce the digest shape so
    -- "opaque string" cannot be smuggled past anti-dupe later.
    game_tx_hash       TEXT PRIMARY KEY CHECK (game_tx_hash ~ '^[0-9a-f]{64}$'),
    bridge_request_id  BIGINT NOT NULL,
    game_id            TEXT NOT NULL REFERENCES inventory.bridge_secret(game_id) ON DELETE NO ACTION,
    -- SHA-256 HMAC, hex encoded. If a future bridge needs base64, add
    -- an explicit encoding column and relax this check.
    hmac_signature     TEXT NOT NULL CHECK (hmac_signature ~ '^[0-9a-f]{64}$'),
    payload_sha256     TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    verified_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Composite FK: a receipt's (request_id, game_id) MUST match the
    -- linked bridge_request row. Prevents admin tools / future migrations
    -- from inserting a receipt whose game_id drifts from the request's.
    CONSTRAINT bridge_receipt_request_game_fk
        FOREIGN KEY (bridge_request_id, game_id)
        REFERENCES inventory.bridge_request(id, game_id)
        ON DELETE NO ACTION
);

-- One bridge_request settles at most once. The unique constraint
-- encodes the invariant for future tooling; the FOR UPDATE lock on
-- bridge_request + status check already enforce it at runtime.
CREATE UNIQUE INDEX inventory_bridge_receipt_request_uq
    ON inventory.bridge_receipt (bridge_request_id);

COMMENT ON TABLE inventory.bridge_receipt IS
    'Insert-once HMAC receipt log. game_tx_hash is the primary key so the same physical game transaction can never settle twice.';
COMMENT ON COLUMN inventory.bridge_receipt.game_id IS
    'Denormalized copy of bridge_request.game_id; the composite FK bridge_receipt_request_game_fk guarantees it cannot drift from the linked request.';

-- Tie bridge_request.receipt_tx_hash back to the receipt row that
-- settled it. Both tables must exist before we can declare this FK.
ALTER TABLE inventory.bridge_request
    ADD CONSTRAINT bridge_request_receipt_tx_hash_fk
        FOREIGN KEY (receipt_tx_hash)
        REFERENCES inventory.bridge_receipt(game_tx_hash)
        ON DELETE NO ACTION;

-- ============================================================================
-- TABLE: inventory.item
-- ============================================================================

CREATE TABLE inventory.item (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_account UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    kind          TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
    ref           TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 128),
    -- Upper bound matches inventory.max_stack_qty() so a fresh row can
    -- never be inserted above the ceiling the merge guards enforce.
    -- Keep literal in sync with inventory.max_stack_qty().
    qty           BIGINT NOT NULL CHECK (qty > 0 AND qty <= 9223372036854775000),
    nbt           JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(nbt) = 'object'),
    -- Stored generated column: true iff this row participates in
    -- stack-merge identity. Lets the partial unique index, ON CONFLICT
    -- predicates, and RPC checks read a single named flag instead of
    -- repeating `nbt = '{}'::jsonb` in five places. The expression is
    -- IMMUTABLE w.r.t. nbt, so STORED is safe.
    is_stackable  BOOLEAN GENERATED ALWAYS AS (nbt = '{}'::jsonb) STORED,
    state         inventory.item_state NOT NULL DEFAULT 'held',
    source        TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 64),
    source_ref    JSONB NOT NULL DEFAULT '{}'::jsonb
                  CHECK (jsonb_typeof(source_ref) = 'object'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stackable merge: at most one held row per (owner, kind, ref) when nbt
-- is the empty object. Non-empty nbt always stays one-row-per-instance.
CREATE UNIQUE INDEX inventory_item_stackable_merge_uq
    ON inventory.item (owner_account, kind, ref)
    WHERE is_stackable AND state = 'held';

-- Hot lookup: "all items the caller can act on" = held + listing_escrow,
-- ordered by created_at DESC, id DESC for keyset pagination.
-- state lives in the partial-index predicate (not in the column list),
-- so a multi-state query (held + listing_escrow together) walks the
-- index in true global order without re-sort.
CREATE INDEX inventory_item_owner_created_active_idx
    ON inventory.item (owner_account, created_at DESC, id DESC)
    WHERE state IN ('held', 'listing_escrow');

-- Tail of active items by kind/ref for marketplace cross-references
CREATE INDEX inventory_item_kind_ref_state_idx
    ON inventory.item (kind, ref, state);

-- Reconciliation scan: "items currently in flight to or from the game"
-- (transit_out) and "items locked into an open listing" (listing_escrow).
-- updated_at lets cron flag rows that have been stuck in the state for
-- longer than the configured threshold.
CREATE INDEX inventory_item_inflight_updated_idx
    ON inventory.item (state, updated_at)
    WHERE state IN ('transit_out', 'listing_escrow');

COMMENT ON TABLE inventory.item IS
    'Canonical KBVE inventory. Items in this table are NOT in the source game. Stackable rows merge via the partial unique index when nbt is empty.';

-- ============================================================================
-- TABLE: inventory.transition
--   Append-only audit log. Every state change writes a row. Useful for
--   anti-dupe audits, support tickets, and admin tooling.
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

-- Admin/audit feed: "last N transitions across the whole ledger".
CREATE INDEX inventory_transition_created_idx
    ON inventory.transition (created_at DESC);

COMMENT ON TABLE inventory.transition IS
    'Append-only audit log of every inventory state change. Never modified after insert.';

-- Block UPDATE/DELETE on the audit log; service RPCs only INSERT.
REVOKE UPDATE, DELETE ON inventory.transition FROM PUBLIC, anon, authenticated, service_role;

-- Defense in depth: even table owners get refused by the trigger. Grants
-- alone won't stop the owning role from issuing an UPDATE/DELETE in a
-- one-off ad-hoc session; this trigger makes the audit log immutable
-- regardless of caller.
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
--   Per-account 2FA policy. The SQL layer owns the *policy* (which
--   accounts require 2FA, at what value threshold); the *verification*
--   happens at the JWT layer — Supabase issues JWTs with an `aal` claim
--   (aal1 = single-factor, aal2 = MFA-verified). The user-facing proxy
--   RPCs read request.jwt.claims and refuse the transition when policy
--   requires aal2 but the session is only aal1.
--
--   Anti-theft note: changing the policy ALSO requires aal2 once any
--   field on a row is true. Prevents an attacker on a stolen aal1
--   session from disabling 2FA before draining the inventory.
-- ============================================================================

CREATE TABLE inventory.account_security (
    account                      UUID PRIMARY KEY REFERENCES wallet.account(id) ON DELETE NO ACTION,
    require_2fa_for_withdraw     BOOLEAN NOT NULL DEFAULT false,
    require_2fa_for_listing      BOOLEAN NOT NULL DEFAULT false,
    -- Reserved for Phase 6.1 listing wiring. The column is settable now
    -- so axum + UI can persist the user preference, but no inventory
    -- proxy currently consults it. Once wallet.service_create_listing
    -- is rewired to take an item_id, that proxy will compare the
    -- listing's buy_now_price / item market value against this
    -- threshold and require aal2 when exceeded.
    high_value_khash_threshold   BIGINT  NOT NULL DEFAULT 0 CHECK (high_value_khash_threshold >= 0),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory.account_security IS
    '2FA policy per wallet account. Verification (JWT aal claim) lives in Supabase; this table only holds the gate rules and is read by the inventory proxies before any transition.';

-- ============================================================================
-- ACCESS CONTROL
--   Direct table access is service_role only. authenticated callers go
--   through public.proxy_inventory_* SECURITY DEFINER wrappers which
--   apply auth.uid() -> wallet.account scoping. RLS is intentionally
--   not enabled — no role other than service_role gets any privilege on
--   these tables, so policies on top of zero grants would be noise.
-- ============================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE ON inventory.item             TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.bridge_request   TO service_role;
GRANT  SELECT, INSERT         ON inventory.bridge_receipt   TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.bridge_secret    TO service_role;
GRANT  SELECT, INSERT         ON inventory.transition       TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.account_security TO service_role;
GRANT  USAGE ON ALL SEQUENCES IN SCHEMA inventory TO service_role;

-- ============================================================================
-- STACK QUANTITY CEILING
--   Centralized cap so RPCs and the table CHECK stay in sync. Two
--   transactions worth of merges can still add without overflowing
--   BIGINT (9_223_372_036_854_775_807). Mark IMMUTABLE so it can sit
--   inside CHECK predicates and ON CONFLICT WHERE clauses.
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
-- HMAC VERIFY HELPER
--   Takes the raw secret (the bridge knows it; the table only stores a
--   sha256). The caller is expected to be service_role / the axum bridge
--   endpoint that holds the secret in its env.
--
--   Trust model: SQL-side verification is DEFENSE IN DEPTH, not the
--   primary security boundary. The axum bridge endpoint MUST do its own
--   constant-time HMAC + payload_sha256 + secret-hash compare BEFORE
--   calling service_*_settle. The reason: PL/pgSQL '=' on TEXT is not
--   constant-time and would leak signature bytes under a timing oracle.
--   The SQL check exists so a misconfigured bridge or a service_role
--   call that skips the axum path still cannot smuggle an unsigned
--   receipt in.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.verify_hmac(
    p_game_id      TEXT,
    p_raw_secret   TEXT,
    p_payload      TEXT,
    p_signature    TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_stored_hash TEXT;
    v_expected    TEXT;
BEGIN
    SELECT secret_hash INTO v_stored_hash
      FROM inventory.bridge_secret
     WHERE game_id = p_game_id;

    IF v_stored_hash IS NULL THEN
        RETURN false;
    END IF;

    -- Always hash UTF-8 bytes so the SQL side matches the bridge's
    -- behaviour regardless of Postgres' bytea-encoding setting.
    IF v_stored_hash <> encode(extensions.digest(convert_to(p_raw_secret, 'UTF8'), 'sha256'), 'hex') THEN
        RETURN false;
    END IF;

    v_expected := encode(
        extensions.hmac(
            convert_to(p_payload, 'UTF8'),
            convert_to(p_raw_secret, 'UTF8'),
            'sha256'
        ),
        'hex'
    );

    RETURN v_expected = p_signature;
END;
$$;

ALTER FUNCTION inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT) TO service_role;
COMMENT ON FUNCTION inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT) IS
    'HMAC verify against the stored sha256(secret). service_role only — bridge endpoint passes the raw secret from env. NOTE: the final = compare is not constant-time; for stricter timing-attack resistance the bridge endpoint should verify in axum using a CT compare crate before calling this RPC.';

-- ============================================================================
-- SERVICE RPCs
-- ============================================================================

-- Register / rotate a per-game bridge secret. Idempotent on game_id.
CREATE OR REPLACE FUNCTION inventory.service_register_bridge_secret(
    p_game_id      TEXT,
    p_raw_secret   TEXT,
    p_label        TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Rotation is immediate and invalidates any in-flight receipts
    -- signed with the old secret. For non-breaking rotation, future
    -- work will add versioned secrets (kid, active_from, retired_at)
    -- and require the bridge payload to declare which version it
    -- signed with.
    IF length(COALESCE(p_game_id, '')) < 1 OR length(p_game_id) > 64 THEN
        RAISE EXCEPTION 'game_id length must be 1..64' USING ERRCODE = '22023';
    END IF;
    IF length(COALESCE(p_raw_secret, '')) < 32 THEN
        RAISE EXCEPTION 'bridge secret must be at least 32 chars' USING ERRCODE = '22023';
    END IF;
    IF p_label IS NOT NULL AND length(p_label) > 128 THEN
        RAISE EXCEPTION 'label length must be 1..128' USING ERRCODE = '22023';
    END IF;

    INSERT INTO inventory.bridge_secret (game_id, secret_hash, label)
    VALUES (p_game_id,
            encode(extensions.digest(convert_to(p_raw_secret, 'UTF8'), 'sha256'), 'hex'),
            p_label)
    ON CONFLICT (game_id) DO UPDATE
        SET secret_hash = excluded.secret_hash,
            label       = coalesce(excluded.label, inventory.bridge_secret.label),
            rotated_at  = now();
END;
$$;

ALTER FUNCTION inventory.service_register_bridge_secret(TEXT, TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_register_bridge_secret(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_register_bridge_secret(TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 2FA policy helpers
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- service_deposit_begin
--   Opens a deposit bridge_request and returns its id. The game plugin
--   then atomically removes the item from the player and calls
--   service_deposit_settle with the signed receipt.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory.service_deposit_begin(
    p_account          UUID,
    p_kind             TEXT,
    p_ref              TEXT,
    p_qty              BIGINT,
    p_nbt              JSONB,
    p_game_id          TEXT,
    p_game_ref         JSONB,
    p_idempotency_key  UUID,
    p_ttl              INTERVAL DEFAULT interval '15 minutes'
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id        BIGINT;
    v_existing  inventory.bridge_request%ROWTYPE;
    v_nbt       JSONB := COALESCE(p_nbt, '{}'::jsonb);
    v_game_ref  JSONB := COALESCE(p_game_ref, '{}'::jsonb);
BEGIN
    IF p_account IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    IF length(COALESCE(p_kind, '')) < 1 OR length(p_kind) > 64 THEN
        RAISE EXCEPTION 'kind length must be 1..64' USING ERRCODE = '22023';
    END IF;
    IF length(COALESCE(p_ref, '')) < 1 OR length(p_ref) > 128 THEN
        RAISE EXCEPTION 'ref length must be 1..128' USING ERRCODE = '22023';
    END IF;
    IF length(COALESCE(p_game_id, '')) < 1 OR length(p_game_id) > 64 THEN
        RAISE EXCEPTION 'game_id length must be 1..64' USING ERRCODE = '22023';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_ttl < interval '1 minute' OR p_ttl > interval '24 hours' THEN
        RAISE EXCEPTION 'ttl must be between 1 minute and 24 hours' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_nbt) <> 'object' THEN
        RAISE EXCEPTION 'nbt must be a JSON object' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_game_ref) <> 'object' THEN
        RAISE EXCEPTION 'game_ref must be a JSON object' USING ERRCODE = '22023';
    END IF;

    -- Idempotent replay returns the original row id — but only if the
    -- replay carries identical parameters. Reusing the same key with a
    -- different ref / qty / game / direction is a caller bug and we
    -- refuse it loudly rather than silently aliasing.
    --
    -- game_ref is intentionally NOT part of the identity tuple: it is
    -- non-authoritative source-side metadata (e.g. mc world+pos) that the
    -- bridge may refine between attempts. The authoritative bridge
    -- identity is (account, direction, game_id, kind, ref, qty, nbt) +
    -- the idempotency_key uniqueness. p_ttl is creation-only and is
    -- intentionally ignored on replay — retries must not fail because
    -- the caller chose a different ttl the second time.
    SELECT * INTO v_existing
      FROM inventory.bridge_request
     WHERE account = p_account
       AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.direction <> 'deposit'
           OR v_existing.game_id <> p_game_id
           OR v_existing.kind <> p_kind
           OR v_existing.ref <> p_ref
           OR v_existing.qty <> p_qty
           OR v_existing.nbt <> v_nbt THEN
            RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on bridge_request %',
                p_idempotency_key, v_existing.id USING ERRCODE = 'INV08';
        END IF;
        RETURN v_existing.id;
    END IF;

    INSERT INTO inventory.bridge_request (
        account, direction, game_id, kind, ref, qty, nbt,
        idempotency_key, game_ref, expires_at
    ) VALUES (
        p_account, 'deposit', p_game_id, p_kind, p_ref, p_qty,
        v_nbt,
        p_idempotency_key,
        v_game_ref,
        now() + p_ttl
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

ALTER FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) TO service_role;

-- ---------------------------------------------------------------------
-- service_deposit_settle
--   Verifies HMAC, inserts the receipt insert-once, then inserts the
--   inventory.item row (merging on stackable). Idempotent against
--   game_tx_hash: replaying the same receipt returns the same item_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory.service_deposit_settle(
    p_bridge_request_id BIGINT,
    p_game_tx_hash      TEXT,
    p_raw_secret        TEXT,
    p_hmac_signature    TEXT,
    p_payload_sha256    TEXT,
    p_payload           TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_req       inventory.bridge_request%ROWTYPE;
    v_existing  BIGINT;
    v_existing_item UUID;
    v_item_id   UUID;
    v_merge_existing_id  UUID;
    v_merge_existing_qty BIGINT;
BEGIN
    -- Required input validation.
    IF p_bridge_request_id IS NULL
       OR coalesce(length(p_game_tx_hash), 0) = 0
       OR coalesce(length(p_raw_secret), 0) = 0
       OR coalesce(length(p_hmac_signature), 0) = 0
       OR coalesce(length(p_payload_sha256), 0) = 0
       OR coalesce(length(p_payload), 0) = 0 THEN
        RAISE EXCEPTION 'all settle inputs are required' USING ERRCODE = '22004';
    END IF;
    -- Cheap format gates before doing crypto work: same shape the
    -- bridge_receipt CHECKs enforce, surfaced as a clean 22023 instead
    -- of a raw constraint violation deep in the INSERT.
    IF p_game_tx_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'game_tx_hash must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;
    IF p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'payload_sha256 must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;
    IF p_hmac_signature !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'hmac_signature must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;

    -- Lock the bridge_request row so concurrent settles can't race.
    SELECT * INTO v_req
      FROM inventory.bridge_request
     WHERE id = p_bridge_request_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bridge_request % not found', p_bridge_request_id USING ERRCODE = 'INV01';
    END IF;
    IF v_req.direction <> 'deposit' THEN
        RAISE EXCEPTION 'bridge_request % is not a deposit', p_bridge_request_id USING ERRCODE = 'INV02';
    END IF;

    -- Idempotent replay: pull the item_id via the receipt -> bridge_request
    -- chain so we don't rely on the stale local v_req snapshot.
    SELECT r.bridge_request_id, br.item_id
      INTO v_existing, v_existing_item
      FROM inventory.bridge_receipt r
      JOIN inventory.bridge_request br ON br.id = r.bridge_request_id
     WHERE r.game_tx_hash = p_game_tx_hash;
    IF v_existing IS NOT NULL THEN
        IF v_existing <> v_req.id THEN
            RAISE EXCEPTION 'game_tx_hash % already settles bridge_request %, not %',
                p_game_tx_hash, v_existing, v_req.id USING ERRCODE = 'INV03';
        END IF;
        IF v_existing_item IS NULL THEN
            RAISE EXCEPTION 'bridge_request % settled but item_id missing', v_req.id USING ERRCODE = 'INV04';
        END IF;
        RETURN v_existing_item;
    END IF;

    IF v_req.status IN ('settled', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'bridge_request % already terminal (status=%)', v_req.id, v_req.status USING ERRCODE = 'INV04';
    END IF;
    IF v_req.expires_at < now() THEN
        RAISE EXCEPTION 'bridge_request % expired at %', v_req.id, v_req.expires_at USING ERRCODE = 'INV05';
    END IF;
    IF p_payload_sha256 <> encode(extensions.digest(convert_to(p_payload, 'UTF8'), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'payload_sha256 mismatch for bridge_request %', v_req.id USING ERRCODE = 'INV07';
    END IF;
    IF NOT inventory.verify_hmac(v_req.game_id, p_raw_secret, p_payload, p_hmac_signature) THEN
        RAISE EXCEPTION 'hmac verification failed for bridge_request %', v_req.id USING ERRCODE = 'INV06';
    END IF;

    -- Hard anti-dupe gate: write the receipt FIRST. A duplicate
    -- game_tx_hash trips the unique violation before any inventory
    -- mutation runs, so two concurrent settles for the same physical
    -- game transaction can never both move items.
    INSERT INTO inventory.bridge_receipt (
        game_tx_hash, bridge_request_id, game_id,
        hmac_signature, payload_sha256
    ) VALUES (
        p_game_tx_hash, v_req.id, v_req.game_id,
        p_hmac_signature, p_payload_sha256
    );

    -- Stackable merge via the partial unique index. Atomic insert-or-bump
    -- so concurrent deposits for the same (owner, kind, ref) stack never
    -- race-insert two rows. Non-empty nbt rows fall through to a plain
    -- INSERT — the partial index excludes them so they never collide.
    IF v_req.nbt = '{}'::jsonb THEN
        -- Best-effort audit pre-read (NOT a safety guard — a concurrent
        -- inserter may sneak a row in between this SELECT and the
        -- INSERT, and the real overflow protection lives in the
        -- ON CONFLICT WHERE clause below).
        SELECT id, qty INTO v_merge_existing_id, v_merge_existing_qty
          FROM inventory.item
         WHERE owner_account = v_req.account
           AND kind = v_req.kind
           AND ref = v_req.ref
           AND is_stackable
           AND state = 'held';

        -- Race-safe upsert. The WHERE on DO UPDATE refuses to bump qty
        -- past the ceiling — if the existing row already sits at or
        -- above max - delta, the UPDATE is skipped, RETURNING produces
        -- no row, and we raise INV16. Same predicate catches the
        -- "fresh-insert-then-second-tx-conflict" race the pre-read
        -- cannot see.
        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            v_req.account, v_req.kind, v_req.ref, v_req.qty,
            '{}'::jsonb, 'held', v_req.game_id || '_deposit', v_req.game_ref
        )
        ON CONFLICT (owner_account, kind, ref)
            WHERE is_stackable AND state = 'held'
            DO UPDATE
            SET qty        = inventory.item.qty + excluded.qty,
                updated_at = now()
            WHERE inventory.item.qty <= (inventory.max_stack_qty() - excluded.qty)
        RETURNING id INTO v_item_id;

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'stack merge would overflow qty on deposit (kind=%, ref=%, delta=%)',
                v_req.kind, v_req.ref, v_req.qty USING ERRCODE = 'INV16';
        END IF;
    ELSE
        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            v_req.account, v_req.kind, v_req.ref, v_req.qty,
            v_req.nbt, 'held', v_req.game_id || '_deposit', v_req.game_ref
        )
        RETURNING id INTO v_item_id;
    END IF;

    -- Audit metadata: capture whether this was a fresh row or a merge
    -- into an existing stack so reconciliation tooling can tell qty
    -- bumps apart from genuine new-row inserts.
    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_item_id, 'transit_in', 'held',
            v_req.game_id || '_bridge',
            'deposit_settle',
            jsonb_build_object('bridge_request_id', v_req.id,
                               'game_tx_hash',      p_game_tx_hash,
                               'merged',            (v_merge_existing_id IS NOT NULL
                                                     AND v_merge_existing_id = v_item_id),
                               'qty_added',         v_req.qty,
                               'previous_qty',      v_merge_existing_qty));

    UPDATE inventory.bridge_request
       SET status = 'settled',
           item_id = v_item_id,
           receipt_tx_hash = p_game_tx_hash,
           settled_at = now(),
           completed_at = now()
     WHERE id = v_req.id;

    RETURN v_item_id;
END;
$$;

ALTER FUNCTION inventory.service_deposit_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_deposit_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_deposit_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- service_withdraw_begin
--   Initiates a withdraw: validates ownership, transitions item to
--   transit_out, creates bridge_request. Caller (bridge) then delivers
--   in-game and calls service_withdraw_settle to flip to consumed.
--   Splits stackable rows when qty < current row qty.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory.service_withdraw_begin(
    p_account          UUID,
    p_item_id          UUID,
    p_qty              BIGINT,
    p_game_id          TEXT,
    p_game_ref         JSONB,
    p_idempotency_key  UUID,
    p_ttl              INTERVAL DEFAULT interval '15 minutes'
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item     inventory.item%ROWTYPE;
    v_existing inventory.bridge_request%ROWTYPE;
    v_req_id   BIGINT;
    v_split_id UUID;
    v_game_ref JSONB := COALESCE(p_game_ref, '{}'::jsonb);
BEGIN
    IF p_account IS NULL OR p_item_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, item_id, idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    IF length(COALESCE(p_game_id, '')) < 1 OR length(p_game_id) > 64 THEN
        RAISE EXCEPTION 'game_id length must be 1..64' USING ERRCODE = '22023';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_ttl < interval '1 minute' OR p_ttl > interval '24 hours' THEN
        RAISE EXCEPTION 'ttl must be between 1 minute and 24 hours' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_game_ref) <> 'object' THEN
        RAISE EXCEPTION 'game_ref must be a JSON object' USING ERRCODE = '22023';
    END IF;

    -- Idempotent replay returns the original row id — but only if the
    -- replay carries identical parameters. Reusing a key for a different
    -- item/qty/game is a caller bug; surface INV08 loudly. p_ttl and
    -- p_game_ref are creation-only and intentionally ignored on replay.
    SELECT * INTO v_existing
      FROM inventory.bridge_request
     WHERE account = p_account
       AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        -- Replay proof: if the existing request used the same item_id
        -- directly, trivially match. Otherwise prove the linked item is
        -- the exact split row that withdraw_begin would have produced
        -- for THIS caller: same owner, kind/ref/nbt cloned from parent,
        -- qty equal to the request, still in transit_out, and source_ref
        -- carries the parent split_from pointer.
        IF v_existing.direction <> 'withdraw'
           OR v_existing.game_id <> p_game_id
           OR v_existing.qty <> p_qty
           OR (
                v_existing.item_id IS DISTINCT FROM p_item_id
                AND NOT EXISTS (
                    SELECT 1 FROM inventory.item
                     WHERE id = v_existing.item_id
                       AND owner_account = p_account
                       AND state = 'transit_out'
                       AND qty = p_qty
                       AND kind = v_existing.kind
                       AND ref = v_existing.ref
                       AND nbt = v_existing.nbt
                       AND source_ref ->> 'split_from' = p_item_id::text
                )
           ) THEN
            RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on bridge_request %',
                p_idempotency_key, v_existing.id USING ERRCODE = 'INV08';
        END IF;
        RETURN v_existing.id;
    END IF;

    SELECT * INTO v_item FROM inventory.item WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_item.owner_account <> p_account THEN
        RAISE EXCEPTION 'item % not owned by caller', p_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_item.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)', p_item_id, v_item.state USING ERRCODE = 'INV12';
    END IF;
    IF v_item.qty < p_qty THEN
        RAISE EXCEPTION 'item % has qty %, cannot withdraw %', p_item_id, v_item.qty, p_qty USING ERRCODE = 'INV13';
    END IF;
    -- Non-empty nbt = instanced (enchant / damage / custom name). The
    -- item is one logical unit even if qty > 1; partial withdraw would
    -- silently duplicate the metadata across rows. Refuse it.
    IF NOT v_item.is_stackable AND p_qty <> v_item.qty THEN
        RAISE EXCEPTION 'instanced item % must be withdrawn whole (qty=%, requested=%)',
            p_item_id, v_item.qty, p_qty USING ERRCODE = 'INV15';
    END IF;

    IF v_item.qty = p_qty THEN
        -- Whole row moves to transit_out.
        UPDATE inventory.item
           SET state = 'transit_out',
               updated_at = now()
         WHERE id = p_item_id;
        v_split_id := p_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (p_item_id, 'held', 'transit_out', p_game_id || '_bridge',
                'withdraw_begin',
                jsonb_build_object('qty', p_qty));
    ELSE
        -- Partial withdraw: split. Reduce held qty, create a new
        -- transit_out row with the withdrawn qty. New row carries the
        -- same nbt + source for traceability.
        UPDATE inventory.item
           SET qty = qty - p_qty,
               updated_at = now()
         WHERE id = p_item_id;

        -- Wrap the parent's source_ref instead of merging keys: a
        -- repeated split/merge cycle would otherwise overwrite an
        -- existing `split_from` and lose lineage. parent_source_ref
        -- preserves the chain for support / audit traversal.
        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            v_item.owner_account, v_item.kind, v_item.ref, p_qty,
            v_item.nbt, 'transit_out', v_item.source,
            jsonb_build_object(
                'split_from', v_item.id::text,
                'parent_source_ref', v_item.source_ref
            )
        )
        RETURNING id INTO v_split_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (v_split_id, 'held', 'transit_out', p_game_id || '_bridge',
                'withdraw_begin_split',
                jsonb_build_object('split_from', v_item.id, 'qty', p_qty));
    END IF;

    INSERT INTO inventory.bridge_request (
        account, direction, game_id, kind, ref, qty, nbt,
        idempotency_key, item_id, game_ref, expires_at
    ) VALUES (
        p_account, 'withdraw', p_game_id, v_item.kind, v_item.ref, p_qty,
        v_item.nbt, p_idempotency_key, v_split_id,
        v_game_ref,
        now() + p_ttl
    )
    RETURNING id INTO v_req_id;

    RETURN v_req_id;
END;
$$;

ALTER FUNCTION inventory.service_withdraw_begin(UUID, UUID, BIGINT, TEXT, JSONB, UUID, INTERVAL) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_withdraw_begin(UUID, UUID, BIGINT, TEXT, JSONB, UUID, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_withdraw_begin(UUID, UUID, BIGINT, TEXT, JSONB, UUID, INTERVAL) TO service_role;

-- ---------------------------------------------------------------------
-- service_withdraw_settle
--   Bridge confirms delivery, item -> consumed (terminal). HMAC verified
--   and game_tx_hash insert-once-locked.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory.service_withdraw_settle(
    p_bridge_request_id BIGINT,
    p_game_tx_hash      TEXT,
    p_raw_secret        TEXT,
    p_hmac_signature    TEXT,
    p_payload_sha256    TEXT,
    p_payload           TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_req       inventory.bridge_request%ROWTYPE;
    v_existing  BIGINT;
BEGIN
    IF p_bridge_request_id IS NULL
       OR coalesce(length(p_game_tx_hash), 0) = 0
       OR coalesce(length(p_raw_secret), 0) = 0
       OR coalesce(length(p_hmac_signature), 0) = 0
       OR coalesce(length(p_payload_sha256), 0) = 0
       OR coalesce(length(p_payload), 0) = 0 THEN
        RAISE EXCEPTION 'all settle inputs are required' USING ERRCODE = '22004';
    END IF;
    IF p_game_tx_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'game_tx_hash must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;
    IF p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'payload_sha256 must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;
    IF p_hmac_signature !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'hmac_signature must be 64 lowercase hex chars' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_req FROM inventory.bridge_request WHERE id = p_bridge_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bridge_request % not found', p_bridge_request_id USING ERRCODE = 'INV01';
    END IF;
    IF v_req.direction <> 'withdraw' THEN
        RAISE EXCEPTION 'bridge_request % is not a withdraw', p_bridge_request_id USING ERRCODE = 'INV02';
    END IF;

    SELECT bridge_request_id INTO v_existing
      FROM inventory.bridge_receipt
     WHERE game_tx_hash = p_game_tx_hash;
    IF v_existing IS NOT NULL THEN
        IF v_existing <> v_req.id THEN
            RAISE EXCEPTION 'game_tx_hash % already settles bridge_request %, not %',
                p_game_tx_hash, v_existing, v_req.id USING ERRCODE = 'INV03';
        END IF;
        RETURN;  -- idempotent replay
    END IF;

    IF v_req.status IN ('settled', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'bridge_request % already terminal (status=%)', v_req.id, v_req.status USING ERRCODE = 'INV04';
    END IF;
    -- Expiry is INTENTIONALLY NOT enforced on withdraw_settle. The
    -- source game may have already delivered the item by the time the
    -- bridge ack arrives; refusing the settle would leave the item
    -- duped (in-game + in transit_out). Stuck/expired withdraws are
    -- surfaced by the Phase 6.5 reconciliation cron for admin review.
    IF p_payload_sha256 <> encode(extensions.digest(convert_to(p_payload, 'UTF8'), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'payload_sha256 mismatch for bridge_request %', v_req.id USING ERRCODE = 'INV07';
    END IF;
    IF NOT inventory.verify_hmac(v_req.game_id, p_raw_secret, p_payload, p_hmac_signature) THEN
        RAISE EXCEPTION 'hmac verification failed for bridge_request %', v_req.id USING ERRCODE = 'INV06';
    END IF;

    -- Anti-dupe primitive first: a duplicate game_tx_hash fails before
    -- we flip the item to consumed.
    INSERT INTO inventory.bridge_receipt (
        game_tx_hash, bridge_request_id, game_id,
        hmac_signature, payload_sha256
    ) VALUES (
        p_game_tx_hash, v_req.id, v_req.game_id,
        p_hmac_signature, p_payload_sha256
    );

    UPDATE inventory.item
       SET state = 'consumed',
           updated_at = now()
     WHERE id = v_req.item_id
       AND state = 'transit_out';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % no longer in transit_out', v_req.item_id USING ERRCODE = 'INV14';
    END IF;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_req.item_id, 'transit_out', 'consumed',
            v_req.game_id || '_bridge',
            'withdraw_settle',
            jsonb_build_object('bridge_request_id', v_req.id,
                               'game_tx_hash', p_game_tx_hash));

    UPDATE inventory.bridge_request
       SET status = 'settled',
           receipt_tx_hash = p_game_tx_hash,
           settled_at = now(),
           completed_at = now()
     WHERE id = v_req.id;
END;
$$;

ALTER FUNCTION inventory.service_withdraw_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_withdraw_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_withdraw_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- Listing integration RPCs
-- ---------------------------------------------------------------------
-- service_listing_lock contract: WHOLE-ROW lock.
--   The entire inventory.item row's qty is escrowed; there is no
--   partial-qty listing path here. Callers that want to list a subset of
--   a stackable row (e.g. 16 of 64 iron ingots) must split the row first
--   via a dedicated RPC and pass the new row's id. This keeps the lock
--   path race-free and avoids a split-on-lock branch that would
--   complicate cancel/refund accounting.
CREATE OR REPLACE FUNCTION inventory.service_listing_lock(
    p_seller_account UUID,
    p_item_id        UUID,
    p_listing_id     BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item inventory.item%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM inventory.item WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_item.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller %', p_item_id, p_seller_account USING ERRCODE = 'INV23';
    END IF;
    IF v_item.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state; cannot lock for listing %',
            p_item_id, p_listing_id USING ERRCODE = 'INV20';
    END IF;

    UPDATE inventory.item
       SET state = 'listing_escrow',
           updated_at = now()
     WHERE id = p_item_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (p_item_id, 'held', 'listing_escrow', 'wallet',
            'listing_lock',
            jsonb_build_object('listing_id', p_listing_id,
                               'seller_account', p_seller_account));
END;
$$;

ALTER FUNCTION inventory.service_listing_lock(UUID, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_listing_lock(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_listing_lock(UUID, UUID, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION inventory.service_listing_unlock(
    p_seller_account UUID,
    p_item_id        UUID,
    p_listing_id     BIGINT,
    p_reason         TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item        inventory.item%ROWTYPE;
    v_merge_into  UUID;
    v_merge_qty   BIGINT;
BEGIN
    -- Reason is optional (we default it below) but if the caller bothered
    -- to pass one, enforce the same 1..128 bound the transition table
    -- has so we fail with a clean 22023 instead of a raw constraint
    -- violation deep inside the audit INSERT.
    IF p_reason IS NOT NULL
       AND (length(p_reason) < 1 OR length(p_reason) > 128) THEN
        RAISE EXCEPTION 'reason length must be 1..128' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item FROM inventory.item WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_item.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller %', p_item_id, p_seller_account USING ERRCODE = 'INV23';
    END IF;
    IF v_item.state <> 'listing_escrow' THEN
        RAISE EXCEPTION 'item % not in listing_escrow state; cannot unlock',
            p_item_id USING ERRCODE = 'INV21';
    END IF;

    -- Stackable unlock must respect the partial unique index. If the
    -- seller already holds another empty-nbt row for (kind, ref), flip
    -- the escrow row to 'consumed' and bump qty on the existing held
    -- row instead of returning to 'held' (which would violate the
    -- partial unique constraint).
    IF v_item.is_stackable THEN
        SELECT id, qty INTO v_merge_into, v_merge_qty
          FROM inventory.item
         WHERE owner_account = p_seller_account
           AND kind = v_item.kind
           AND ref = v_item.ref
           AND state = 'held'
           AND is_stackable
         FOR UPDATE;
    END IF;

    IF v_merge_into IS NOT NULL THEN
        IF v_merge_qty > (inventory.max_stack_qty() - v_item.qty) THEN
            RAISE EXCEPTION 'listing unlock would overflow qty on merge target (existing=%, delta=%)',
                v_merge_qty, v_item.qty USING ERRCODE = 'INV16';
        END IF;
        UPDATE inventory.item
           SET qty        = qty + v_item.qty,
               updated_at = now()
         WHERE id = v_merge_into;
        UPDATE inventory.item
           SET state      = 'consumed',
               updated_at = now()
         WHERE id = p_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (p_item_id, 'listing_escrow', 'consumed', 'wallet',
                coalesce(p_reason, 'listing_unlock_merged'),
                jsonb_build_object('listing_id',     p_listing_id,
                                   'seller_account', p_seller_account,
                                   'merged_into',    v_merge_into,
                                   'qty_added',      v_item.qty,
                                   'previous_qty',   v_merge_qty));
    ELSE
        UPDATE inventory.item
           SET state = 'held',
               updated_at = now()
         WHERE id = p_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (p_item_id, 'listing_escrow', 'held', 'wallet',
                coalesce(p_reason, 'listing_unlock'),
                jsonb_build_object('listing_id', p_listing_id,
                                   'seller_account', p_seller_account));
    END IF;
END;
$$;

ALTER FUNCTION inventory.service_listing_unlock(UUID, UUID, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_listing_unlock(UUID, UUID, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_listing_unlock(UUID, UUID, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION inventory.service_listing_settle(
    p_seller_account UUID,
    p_item_id        UUID,
    p_listing_id     BIGINT,
    p_buyer_account  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item     inventory.item%ROWTYPE;
    v_new_id   UUID;
    v_buyer_merge_id  UUID;
    v_buyer_merge_qty BIGINT;
BEGIN
    IF p_buyer_account IS NULL OR p_seller_account IS NULL OR p_item_id IS NULL THEN
        RAISE EXCEPTION 'seller, buyer, item_id are required' USING ERRCODE = '22004';
    END IF;
    IF p_buyer_account = p_seller_account THEN
        RAISE EXCEPTION 'buyer cannot equal seller for listing settle' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_item FROM inventory.item WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_item.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller %', p_item_id, p_seller_account USING ERRCODE = 'INV23';
    END IF;
    IF v_item.state <> 'listing_escrow' THEN
        RAISE EXCEPTION 'item % not in listing_escrow (state=%)', p_item_id, v_item.state USING ERRCODE = 'INV22';
    END IF;

    -- Seller's row becomes consumed (terminal).
    UPDATE inventory.item
       SET state = 'consumed',
           updated_at = now()
     WHERE id = p_item_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (p_item_id, 'listing_escrow', 'consumed', 'wallet',
            'listing_settle_seller_side',
            jsonb_build_object('listing_id', p_listing_id,
                               'buyer_account', p_buyer_account));

    -- Buyer-side: atomic insert-or-bump via the partial unique index so
    -- concurrent settlements + deposits on the same stackable row don't
    -- race-insert duplicates.
    IF v_item.is_stackable THEN
        -- Best-effort audit pre-read; real race-safe overflow guard is
        -- the WHERE on DO UPDATE below.
        SELECT id, qty INTO v_buyer_merge_id, v_buyer_merge_qty
          FROM inventory.item
         WHERE owner_account = p_buyer_account
           AND kind = v_item.kind
           AND ref = v_item.ref
           AND is_stackable
           AND state = 'held';

        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            p_buyer_account, v_item.kind, v_item.ref, v_item.qty, '{}'::jsonb,
            'held', 'market_settle',
            jsonb_build_object('listing_id', p_listing_id,
                               'seller_item_id', v_item.id::text,
                               'seller_account', v_item.owner_account)
        )
        ON CONFLICT (owner_account, kind, ref)
            WHERE is_stackable AND state = 'held'
            DO UPDATE
            SET qty        = inventory.item.qty + excluded.qty,
                updated_at = now()
            WHERE inventory.item.qty <= (inventory.max_stack_qty() - excluded.qty)
        RETURNING id INTO v_new_id;

        IF v_new_id IS NULL THEN
            RAISE EXCEPTION 'listing settle would overflow buyer stack qty (kind=%, ref=%, delta=%)',
                v_item.kind, v_item.ref, v_item.qty USING ERRCODE = 'INV16';
        END IF;
    ELSE
        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            p_buyer_account, v_item.kind, v_item.ref, v_item.qty, v_item.nbt,
            'held', 'market_settle',
            jsonb_build_object('listing_id', p_listing_id,
                               'seller_item_id', v_item.id::text,
                               'seller_account', v_item.owner_account)
        )
        RETURNING id INTO v_new_id;
    END IF;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_new_id, 'transit_in', 'held', 'wallet',
            'listing_settle_buyer_side',
            jsonb_build_object('listing_id',     p_listing_id,
                               'seller_item_id', v_item.id,
                               'merged',         (v_buyer_merge_id IS NOT NULL
                                                  AND v_buyer_merge_id = v_new_id),
                               'qty_added',      v_item.qty,
                               'previous_qty',   v_buyer_merge_qty));

    RETURN v_new_id;
END;
$$;

ALTER FUNCTION inventory.service_listing_settle(UUID, UUID, BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_listing_settle(UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_listing_settle(UUID, UUID, BIGINT, UUID) TO service_role;

-- ============================================================================
-- PUBLIC PROXIES (auth.uid()-scoped reads + user-initiated requests)
-- ============================================================================

-- Internal helper — lives in the inventory schema so the public.* namespace
-- only contains true user-facing RPCs. Called from each public proxy via
-- SECURITY DEFINER chain; never exposed to authenticated directly.
CREATE OR REPLACE FUNCTION inventory.caller_account()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_account UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_account
      FROM wallet.account
     WHERE kind = 'user' AND user_id = v_user_id;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'wallet account missing for user %', v_user_id USING ERRCODE = 'WLT01';
    END IF;
    RETURN v_account;
END;
$$;

ALTER FUNCTION inventory.caller_account() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.caller_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.caller_account() TO service_role;

-- Caller's held + listing_escrow inventory. Returns one row per item.
-- Keyset pagination. p_limit caps page size (default 50, max 200);
-- p_before_created_at + p_before_id are the (created_at, id) tuple of
-- the LAST row from the previous page. Pass NULLs for the first page.
-- Index inventory_item_owner_created_active_idx ((owner, created_at DESC, id DESC) WHERE state IN (...))
-- supports the ordering directly across both states.
CREATE OR REPLACE FUNCTION public.proxy_inventory_list_held(
    p_limit              INT         DEFAULT 50,
    p_before_created_at  TIMESTAMPTZ DEFAULT NULL,
    p_before_id          UUID        DEFAULT NULL
)
RETURNS TABLE (
    item_id    UUID,
    kind       TEXT,
    ref        TEXT,
    qty        BIGINT,
    nbt        JSONB,
    state      TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_account UUID := inventory.caller_account();
    v_limit   INT  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
    -- Keyset cursor must be all-NULL (first page) or fully populated;
    -- a partially supplied cursor row-compares against NULL and silently
    -- returns no rows.
    IF (p_before_created_at IS NULL) IS DISTINCT FROM (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'pagination cursor requires both created_at and id, or neither'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
        SELECT i.id, i.kind, i.ref, i.qty, i.nbt, i.state::text, i.created_at
          FROM inventory.item i
         WHERE i.owner_account = v_account
           AND i.state IN ('held', 'listing_escrow')
           AND (
               p_before_created_at IS NULL
               OR (i.created_at, i.id) < (p_before_created_at, p_before_id)
           )
      ORDER BY i.created_at DESC, i.id DESC
         LIMIT v_limit;
END;
$$;

ALTER FUNCTION public.proxy_inventory_list_held(INT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_inventory_list_held(INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proxy_inventory_list_held(INT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_inventory_list_held(INT, TIMESTAMPTZ, UUID) IS
    'Authenticated RPC. Returns the caller''s actionable inventory rows (state = held or listing_escrow), newest first. Keyset paginated: pass p_before_created_at + p_before_id from the last row of the previous page (NULL for first page). p_limit clamps to 1..200.';

-- Caller's pending bridge requests (deposits + withdraws in flight).
CREATE OR REPLACE FUNCTION public.proxy_inventory_list_pending(
    p_limit              INT         DEFAULT 50,
    p_before_created_at  TIMESTAMPTZ DEFAULT NULL,
    p_before_id          BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    bridge_request_id BIGINT,
    direction         TEXT,
    game_id           TEXT,
    kind              TEXT,
    ref               TEXT,
    qty               BIGINT,
    status            TEXT,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_account UUID := inventory.caller_account();
    v_limit   INT  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
    IF (p_before_created_at IS NULL) IS DISTINCT FROM (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'pagination cursor requires both created_at and id, or neither'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
        SELECT br.id, br.direction::text, br.game_id, br.kind, br.ref, br.qty,
               br.status::text, br.expires_at, br.created_at
          FROM inventory.bridge_request br
         WHERE br.account = v_account
           AND br.status IN ('pending', 'in_progress')
           AND (
               p_before_created_at IS NULL
               OR (br.created_at, br.id) < (p_before_created_at, p_before_id)
           )
      ORDER BY br.created_at DESC, br.id DESC
         LIMIT v_limit;
END;
$$;

ALTER FUNCTION public.proxy_inventory_list_pending(INT, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_inventory_list_pending(INT, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proxy_inventory_list_pending(INT, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_inventory_list_pending(INT, TIMESTAMPTZ, BIGINT) IS
    'Authenticated RPC. Returns the caller''s in-flight bridge requests (status in pending, in_progress) ordered newest first. Keyset paginated via (created_at, id) cursor. p_limit clamps to 1..200.';

-- Read the caller's Supabase JWT AAL claim. aal2 == MFA-verified
-- session, aal1 == single-factor. NULL when no JWT is present (e.g.
-- direct service_role call). plpgsql wrapper catches invalid_text
-- on a malformed setting so a corrupt request.jwt.claims surfaces as
-- "no aal" (deny by default) instead of bubbling a 22P02 to the caller.
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

-- Caller-initiated withdraw request. The user signals intent here; the
-- game bridge picks up the bridge_request, delivers the item in-game,
-- and calls service_withdraw_settle with a signed receipt.
-- 2FA gate: if inventory.account_security.require_2fa_for_withdraw is
-- true for this account, the caller's JWT must carry aal=aal2. The
-- supabase auth layer issues aal2 only after a successful MFA challenge
-- within the session, so the bar is "verified TOTP / passkey in this
-- browser session".
CREATE OR REPLACE FUNCTION public.proxy_inventory_request_withdraw(
    p_item_id          UUID,
    p_qty              BIGINT,
    p_game_id          TEXT,
    p_idempotency_key  UUID
) RETURNS TABLE (
    bridge_request_id BIGINT,
    direction         TEXT,
    game_id           TEXT,
    kind              TEXT,
    ref               TEXT,
    qty               BIGINT,
    status            TEXT,
    expires_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account UUID := inventory.caller_account();
    v_aal     TEXT := inventory.caller_jwt_aal();
    v_req_id  BIGINT;
BEGIN
    IF inventory.is_2fa_required_for_withdraw(v_account)
       AND v_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'mfa_required for withdraw on account %', v_account
            USING ERRCODE = 'INV30';
    END IF;

    v_req_id := inventory.service_withdraw_begin(
        v_account, p_item_id, p_qty, p_game_id,
        jsonb_build_object('initiated_by', 'user',
                           'aal',          v_aal,
                           'jti',          current_setting('request.jwt.claims', true)::jsonb ->> 'jti'),
        p_idempotency_key
    );

    -- Return the full pending row so the UI can render the "transfer
    -- in progress" card without a follow-up proxy_inventory_list_pending
    -- round trip.
    RETURN QUERY
        SELECT br.id, br.direction::text, br.game_id, br.kind, br.ref,
               br.qty, br.status::text, br.expires_at, br.created_at
          FROM inventory.bridge_request br
         WHERE br.id = v_req_id;
END;
$$;

ALTER FUNCTION public.proxy_inventory_request_withdraw(UUID, BIGINT, TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_inventory_request_withdraw(UUID, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proxy_inventory_request_withdraw(UUID, BIGINT, TEXT, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_inventory_request_withdraw(UUID, BIGINT, TEXT, UUID) IS
    'Authenticated RPC. Opens a withdraw bridge_request for the caller''s held item. Raises INV30 mfa_required when account_security.require_2fa_for_withdraw is true and the JWT lacks aal=aal2. Returns the new bridge_request row (id + status + ttl + identity) so the UI can render the pending transfer immediately.';

-- 2FA policy management. Reading the current policy is always allowed
-- (aal1 OK). Writing the policy requires aal2 when ANY 2FA flag is
-- currently enabled or being set to true — this prevents an attacker on
-- a stolen aal1 session from disabling the 2FA gate before draining
-- the inventory.
CREATE OR REPLACE FUNCTION public.proxy_inventory_get_security_policy()
RETURNS TABLE (
    require_2fa_for_withdraw     BOOLEAN,
    require_2fa_for_listing      BOOLEAN,
    high_value_khash_threshold   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
    v_account UUID := inventory.caller_account();
BEGIN
    -- LEFT JOIN against a 1-row VALUES seed: guarantees exactly one row
    -- back even when no account_security row exists, and uses the
    -- account_security primary key index for the matched case.
    RETURN QUERY
        SELECT COALESCE(s.require_2fa_for_withdraw, false),
               COALESCE(s.require_2fa_for_listing,  false),
               COALESCE(s.high_value_khash_threshold, 0::bigint)
          FROM (VALUES (1)) AS seed(one)
     LEFT JOIN inventory.account_security s
            ON s.account = v_account;
END;
$$;

ALTER FUNCTION public.proxy_inventory_get_security_policy() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_inventory_get_security_policy() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proxy_inventory_get_security_policy() TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_inventory_get_security_policy() IS
    'Authenticated RPC. Returns the caller''s 2FA + high-value-threshold policy. Always returns one row even when no account_security row exists yet, with the all-false defaults.';

CREATE OR REPLACE FUNCTION public.proxy_inventory_set_security_policy(
    p_require_2fa_for_withdraw   BOOLEAN,
    p_require_2fa_for_listing    BOOLEAN,
    p_high_value_threshold       BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_account     UUID := inventory.caller_account();
    v_aal         TEXT := inventory.caller_jwt_aal();
    v_currently_protected BOOLEAN := false;
    v_req_withdraw BOOLEAN := COALESCE(p_require_2fa_for_withdraw, false);
    v_req_listing  BOOLEAN := COALESCE(p_require_2fa_for_listing, false);
    v_threshold    BIGINT  := COALESCE(p_high_value_threshold, 0);
BEGIN
    SELECT COALESCE(require_2fa_for_withdraw, false)
        OR COALESCE(require_2fa_for_listing, false)
      INTO v_currently_protected
      FROM inventory.account_security
     WHERE account = v_account;
    v_currently_protected := COALESCE(v_currently_protected, false);

    IF (v_currently_protected OR v_req_withdraw OR v_req_listing)
       AND v_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'mfa_required to change inventory security policy'
            USING ERRCODE = 'INV30';
    END IF;

    PERFORM inventory.service_set_security_policy(
        v_account, v_req_withdraw, v_req_listing, v_threshold
    );
END;
$$;

ALTER FUNCTION public.proxy_inventory_set_security_policy(BOOLEAN, BOOLEAN, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_inventory_set_security_policy(BOOLEAN, BOOLEAN, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proxy_inventory_set_security_policy(BOOLEAN, BOOLEAN, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_inventory_set_security_policy(BOOLEAN, BOOLEAN, BIGINT) IS
    'Authenticated RPC. Upserts the caller''s 2FA policy. Raises INV30 mfa_required (aal=aal2 needed) when any 2FA flag is currently true OR being set to true, so an aal1-only session cannot disable 2FA on a protected account.';

NOTIFY pgrst, 'reload schema';

-- migrate:down
-- This rollback is intentionally destructive — DROP SCHEMA CASCADE at
-- the end wipes any rows in inventory.* including the audit log. Only
-- run this in dev / test, never against a populated prod database.
-- For prod, write a forward-fix migration instead.
--
-- Hard gate: the connection running this rollback MUST set the GUC
-- app.allow_destructive_inventory_down = 'true' (e.g. via PGOPTIONS or
-- a session-level SET) before invoking dbmate rollback. Without it we
-- refuse, so a `dbmate rollback` against prod with the standard URL
-- aborts before touching anything. The local test harness sets this
-- via PGOPTIONS — see packages/data/sql/dbmate/test-migration.sh.
DO $$
BEGIN
    IF current_setting('app.allow_destructive_inventory_down', true)
       IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION
            'refusing destructive inventory rollback: set app.allow_destructive_inventory_down=true to proceed';
    END IF;
END
$$;

DROP FUNCTION IF EXISTS public.proxy_inventory_set_security_policy(BOOLEAN, BOOLEAN, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_inventory_get_security_policy();
DROP FUNCTION IF EXISTS public.proxy_inventory_request_withdraw(UUID, BIGINT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_inventory_list_pending(INT, TIMESTAMPTZ, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_inventory_list_held(INT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS inventory.caller_account();

DROP FUNCTION IF EXISTS inventory.service_listing_settle(UUID, UUID, BIGINT, UUID);
DROP FUNCTION IF EXISTS inventory.service_listing_unlock(UUID, UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS inventory.service_listing_lock(UUID, UUID, BIGINT);
DROP FUNCTION IF EXISTS inventory.service_withdraw_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS inventory.service_withdraw_begin(UUID, UUID, BIGINT, TEXT, JSONB, UUID, INTERVAL);
DROP FUNCTION IF EXISTS inventory.service_deposit_settle(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL);
DROP FUNCTION IF EXISTS inventory.service_set_security_policy(UUID, BOOLEAN, BOOLEAN, BIGINT);
DROP FUNCTION IF EXISTS inventory.is_2fa_required_for_listing(UUID);
DROP FUNCTION IF EXISTS inventory.is_2fa_required_for_withdraw(UUID);
DROP FUNCTION IF EXISTS inventory.caller_jwt_aal();
DROP FUNCTION IF EXISTS inventory.service_register_bridge_secret(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT);

DROP TABLE IF EXISTS inventory.account_security CASCADE;
DROP TABLE IF EXISTS inventory.transition       CASCADE;
DROP TABLE IF EXISTS inventory.item             CASCADE;
DROP TABLE IF EXISTS inventory.bridge_receipt   CASCADE;
DROP TABLE IF EXISTS inventory.bridge_request   CASCADE;
DROP TABLE IF EXISTS inventory.bridge_secret    CASCADE;

-- Trigger function: dropped AFTER the table so the trigger is gone
-- first; otherwise we hit "other objects depend on it".
DROP FUNCTION IF EXISTS inventory.transition_block_mutation();

DROP TYPE IF EXISTS inventory.bridge_status;
DROP TYPE IF EXISTS inventory.bridge_direction;
DROP TYPE IF EXISTS inventory.item_state;

DROP SCHEMA IF EXISTS inventory CASCADE;

-- Tell PostgREST the public API surface shrunk so /rest/v1/* stops
-- advertising the dropped proxy_inventory_* RPCs.
NOTIFY pgrst, 'reload schema';
