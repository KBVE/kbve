-- ============================================================================
-- INVENTORY BRIDGE — game-bridge coordinator + receipt tables, HMAC verify,
--                    bridge-secret registration RPC.
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260518091000_inventory_schema_init.sql).
-- Hand-authored review surface — do not run directly; promote into a new
-- dbmate migration when ready. Depends on inventory_core.sql.
--
-- Anti-dupe model:
--   * inventory.bridge_request is the two-phase coordinator: begin RPC
--     opens a pending row; settle RPC inserts inventory.bridge_receipt
--     keyed by game_tx_hash (insert-once), THEN mutates inventory.item.
--   * A duplicate game_tx_hash trips the unique constraint before any
--     item state moves, so the same physical game transaction can never
--     credit / debit twice.
--   * HMAC verification on the SQL side is defense in depth only; the
--     axum bridge endpoint is responsible for the constant-time check.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE inventory.bridge_direction AS ENUM ('deposit', 'withdraw');

CREATE TYPE inventory.bridge_status AS ENUM (
    'pending',
    'in_progress',
    'settled',
    'failed',
    'cancelled'
);

-- ============================================================================
-- TABLE: inventory.bridge_secret
--   Per-game HMAC verification material. secret_hash is sha256(raw_secret);
--   the raw secret never enters the database. Rotation is immediate today
--   and invalidates in-flight receipts signed under the old secret —
--   Phase 6.5 will introduce versioned (kid'd) secrets.
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

GRANT SELECT, INSERT, UPDATE ON inventory.bridge_secret TO service_role;

-- ============================================================================
-- TABLE: inventory.bridge_request
--   The two-phase coordinator. begin RPC opens pending; settle RPC moves
--   to settled and writes the linked bridge_receipt. failed / cancelled
--   are terminal states populated by Phase 6.5 RPCs.
--
--   Terminal CHECK: settled requires settled_at + completed_at + receipt;
--   failed / cancelled require completed_at + terminal_reason (no
--   receipt); pending / in_progress must keep all of those NULL.
-- ============================================================================

CREATE TABLE inventory.bridge_request (
    id            BIGSERIAL PRIMARY KEY,
    account       UUID NOT NULL REFERENCES wallet.account(id) ON DELETE NO ACTION,
    direction     inventory.bridge_direction NOT NULL,
    game_id       TEXT NOT NULL REFERENCES inventory.bridge_secret(game_id) ON DELETE NO ACTION,
    kind          TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
    ref           TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 128),
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
    settled_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    terminal_reason     TEXT
                        CHECK (terminal_reason IS NULL
                               OR (length(terminal_reason) BETWEEN 1 AND 64)),
    terminal_metadata   JSONB
                        CHECK (terminal_metadata IS NULL
                               OR jsonb_typeof(terminal_metadata) = 'object'),

    CONSTRAINT bridge_request_expires_window_chk
        CHECK (expires_at > created_at
               AND expires_at <= created_at + interval '24 hours'),

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

CREATE UNIQUE INDEX inventory_bridge_request_account_key_uq
    ON inventory.bridge_request (account, idempotency_key)
    INCLUDE (id, direction, game_id, kind, ref, qty, item_id, status);

CREATE INDEX inventory_bridge_request_status_dir_created_idx
    ON inventory.bridge_request (status, direction, created_at DESC);

CREATE INDEX inventory_bridge_request_stuck_idx
    ON inventory.bridge_request (status, expires_at)
    WHERE status IN ('pending', 'in_progress');

CREATE INDEX inventory_bridge_request_account_pending_idx
    ON inventory.bridge_request (account, created_at DESC, id DESC)
    WHERE status IN ('pending', 'in_progress');

CREATE INDEX inventory_bridge_request_item_idx
    ON inventory.bridge_request (item_id)
    WHERE item_id IS NOT NULL;

CREATE INDEX inventory_bridge_request_pickup_idx
    ON inventory.bridge_request (game_id, direction, created_at)
    WHERE status = 'pending';

CREATE INDEX inventory_bridge_request_game_stuck_idx
    ON inventory.bridge_request (game_id, status, expires_at)
    WHERE status IN ('pending', 'in_progress');

COMMENT ON TABLE inventory.bridge_request IS
    'Two-phase coordinator for deposit + withdraw flows. The receipt_tx_hash links to inventory.bridge_receipt once the bridge settles.';
COMMENT ON COLUMN inventory.bridge_request.item_id IS
    'Resulting inventory row affected by settlement. For deposits this may be a pre-existing row that was bumped via stackable merge; for withdraws it is the (possibly split) transit_out row that was created in begin.';

GRANT SELECT, INSERT, UPDATE ON inventory.bridge_request TO service_role;

-- ============================================================================
-- TABLE: inventory.bridge_receipt
--   Insert-once anti-dupe log. game_tx_hash (sha256 hex of the bridge's
--   transaction identity) is the PK so the same physical game tx can
--   never settle twice. Composite FK (bridge_request_id, game_id) keeps
--   game_id from drifting from the linked request.
-- ============================================================================

CREATE TABLE inventory.bridge_receipt (
    game_tx_hash       TEXT PRIMARY KEY CHECK (game_tx_hash ~ '^[0-9a-f]{64}$'),
    bridge_request_id  BIGINT NOT NULL,
    game_id            TEXT NOT NULL REFERENCES inventory.bridge_secret(game_id) ON DELETE NO ACTION,
    hmac_signature     TEXT NOT NULL CHECK (hmac_signature ~ '^[0-9a-f]{64}$'),
    payload_sha256     TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    verified_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT bridge_receipt_request_game_fk
        FOREIGN KEY (bridge_request_id, game_id)
        REFERENCES inventory.bridge_request(id, game_id)
        ON DELETE NO ACTION
);

CREATE UNIQUE INDEX inventory_bridge_receipt_request_uq
    ON inventory.bridge_receipt (bridge_request_id);

COMMENT ON TABLE inventory.bridge_receipt IS
    'Insert-once HMAC receipt log. game_tx_hash is the primary key so the same physical game transaction can never settle twice.';
COMMENT ON COLUMN inventory.bridge_receipt.game_id IS
    'Denormalized copy of bridge_request.game_id; the composite FK bridge_receipt_request_game_fk guarantees it cannot drift from the linked request.';

GRANT SELECT, INSERT ON inventory.bridge_receipt TO service_role;

-- Tie bridge_request.receipt_tx_hash back to the receipt row that
-- settled it. Both tables must exist before we can declare this FK.
ALTER TABLE inventory.bridge_request
    ADD CONSTRAINT bridge_request_receipt_tx_hash_fk
        FOREIGN KEY (receipt_tx_hash)
        REFERENCES inventory.bridge_receipt(game_tx_hash)
        ON DELETE NO ACTION;

-- ============================================================================
-- HMAC VERIFY HELPER
--   service_role only. Trust model: SQL-side verification is DEFENSE IN
--   DEPTH; the axum bridge endpoint MUST do the constant-time check.
--   PL/pgSQL '=' on TEXT is not constant-time and would leak signature
--   bytes under a timing oracle. SQL check exists so a misconfigured
--   bridge or a service_role call that skips axum cannot smuggle an
--   unsigned receipt in.
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

-- ============================================================================
-- service_register_bridge_secret
--   Register or rotate a per-game HMAC secret. service_role only.
-- ============================================================================

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
