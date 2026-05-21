-- migrate:up

CREATE SCHEMA IF NOT EXISTS inventory;
GRANT USAGE ON SCHEMA inventory TO service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TYPE inventory.item_state AS ENUM (
    'held',             -- in KBVE inventory, available to the owner
    'listing_escrow',   -- locked by an active marketplace listing
    'transit_in',       -- VIRTUAL: used only as the from_state in
    'transit_out',      -- mid-withdraw; deducted from owner, awaiting bridge ack
    'consumed'          -- terminal: sold to buyer, burned, or withdrawn out
);

CREATE TYPE inventory.bridge_direction AS ENUM ('deposit', 'withdraw');

CREATE TYPE inventory.bridge_status AS ENUM (
    'pending',     -- created, awaiting bridge action
    'in_progress', -- bridge acknowledged (reserved for Phase 6.5 worker;
    'settled',     -- completed successfully
    'failed',      -- bridge or verification rejected; terminal
    'cancelled'    -- user / admin abandoned; terminal
);

CREATE TABLE inventory.bridge_secret (
    game_id      TEXT PRIMARY KEY CHECK (length(game_id) BETWEEN 1 AND 64),
    secret_hash  TEXT NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
    label        TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 128),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at   TIMESTAMPTZ
);

COMMENT ON TABLE inventory.bridge_secret IS
    'Per-game HMAC verification material. secret_hash is sha256(raw_secret); the raw secret never enters the database.';

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

ALTER TABLE inventory.bridge_request
    ADD CONSTRAINT bridge_request_receipt_tx_hash_fk
        FOREIGN KEY (receipt_tx_hash)
        REFERENCES inventory.bridge_receipt(game_tx_hash)
        ON DELETE NO ACTION;

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

REVOKE ALL ON ALL TABLES    IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA inventory FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE ON inventory.item             TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.bridge_request   TO service_role;
GRANT  SELECT, INSERT         ON inventory.bridge_receipt   TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.bridge_secret    TO service_role;
GRANT  SELECT, INSERT         ON inventory.transition       TO service_role;
GRANT  SELECT, INSERT, UPDATE ON inventory.account_security TO service_role;
GRANT  USAGE ON ALL SEQUENCES IN SCHEMA inventory TO service_role;

CREATE OR REPLACE FUNCTION inventory.max_stack_qty()
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT 9223372036854775000::bigint $$;

ALTER FUNCTION inventory.max_stack_qty() OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.max_stack_qty() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.max_stack_qty() TO service_role;

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
COMMENT ON FUNCTION inventory.verify_hmac(TEXT, TEXT, TEXT, TEXT) IS
    'HMAC verify against the stored sha256(secret). service_role only — bridge endpoint passes the raw secret from env. NOTE: the final = compare is not constant-time; for stricter timing-attack resistance the bridge endpoint should verify in axum using a CT compare crate before calling this RPC.';

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

    INSERT INTO inventory.bridge_receipt (
        game_tx_hash, bridge_request_id, game_id,
        hmac_signature, payload_sha256
    ) VALUES (
        p_game_tx_hash, v_req.id, v_req.game_id,
        p_hmac_signature, p_payload_sha256
    );

    IF v_req.nbt = '{}'::jsonb THEN
        SELECT id, qty INTO v_merge_existing_id, v_merge_existing_qty
          FROM inventory.item
         WHERE owner_account = v_req.account
           AND kind = v_req.kind
           AND ref = v_req.ref
           AND is_stackable
           AND state = 'held';

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

    SELECT * INTO v_existing
      FROM inventory.bridge_request
     WHERE account = p_account
       AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
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
    IF NOT v_item.is_stackable AND p_qty <> v_item.qty THEN
        RAISE EXCEPTION 'instanced item % must be withdrawn whole (qty=%, requested=%)',
            p_item_id, v_item.qty, p_qty USING ERRCODE = 'INV15';
    END IF;

    IF v_item.qty = p_qty THEN
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
        UPDATE inventory.item
           SET qty = qty - p_qty,
               updated_at = now()
         WHERE id = p_item_id;

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
    IF p_payload_sha256 <> encode(extensions.digest(convert_to(p_payload, 'UTF8'), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'payload_sha256 mismatch for bridge_request %', v_req.id USING ERRCODE = 'INV07';
    END IF;
    IF NOT inventory.verify_hmac(v_req.game_id, p_raw_secret, p_payload, p_hmac_signature) THEN
        RAISE EXCEPTION 'hmac verification failed for bridge_request %', v_req.id USING ERRCODE = 'INV06';
    END IF;

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

    UPDATE inventory.item
       SET state = 'consumed',
           updated_at = now()
     WHERE id = p_item_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (p_item_id, 'listing_escrow', 'consumed', 'wallet',
            'listing_settle_seller_side',
            jsonb_build_object('listing_id', p_listing_id,
                               'buyer_account', p_buyer_account));

    IF v_item.is_stackable THEN
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

DROP FUNCTION IF EXISTS inventory.transition_block_mutation();

DROP TYPE IF EXISTS inventory.bridge_status;
DROP TYPE IF EXISTS inventory.bridge_direction;
DROP TYPE IF EXISTS inventory.item_state;

DROP SCHEMA IF EXISTS inventory CASCADE;

NOTIFY pgrst, 'reload schema';
