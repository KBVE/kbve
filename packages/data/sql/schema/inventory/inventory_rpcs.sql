-- ============================================================================
-- INVENTORY RPCs — deposit + withdraw + listing service functions, plus
--                  public.proxy_inventory_* (PostgREST surface).
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260518091000_inventory_schema_init.sql).
-- Hand-authored review surface — do not run directly; promote changes
-- into a new dbmate migration when ready. Depends on inventory_core.sql
-- and inventory_bridge.sql.
--
-- service_* functions are service_role only (axum bridge endpoint calls).
-- public.proxy_inventory_* are SECURITY DEFINER wrappers that scope by
-- auth.uid() -> wallet.account and enforce the 2FA gate.
-- ============================================================================

-- ============================================================================
-- service_deposit_begin
--   Opens a deposit bridge_request and returns its id. The game plugin
--   then atomically removes the item from the player and calls
--   service_deposit_settle with the signed receipt.
-- ============================================================================

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

    -- Idempotent replay: identity tuple is (account, direction, game_id,
    -- kind, ref, qty, nbt) + idempotency_key uniqueness. game_ref and
    -- p_ttl are creation-only and ignored on replay.
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
        v_nbt, p_idempotency_key, v_game_ref, now() + p_ttl
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

ALTER FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_deposit_begin(UUID, TEXT, TEXT, BIGINT, JSONB, TEXT, JSONB, UUID, INTERVAL) TO service_role;

-- ============================================================================
-- service_deposit_settle
--   Verifies HMAC, inserts the receipt (insert-once), then mints / merges
--   the inventory.item row. Idempotent on game_tx_hash: replaying the
--   same receipt returns the same item_id.
-- ============================================================================

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

    -- Idempotent replay via the receipt -> bridge_request chain.
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
    -- mutation runs.
    INSERT INTO inventory.bridge_receipt (
        game_tx_hash, bridge_request_id, game_id,
        hmac_signature, payload_sha256
    ) VALUES (
        p_game_tx_hash, v_req.id, v_req.game_id,
        p_hmac_signature, p_payload_sha256
    );

    IF v_req.nbt = '{}'::jsonb THEN
        -- Best-effort audit pre-read (not a safety guard).
        SELECT id, qty INTO v_merge_existing_id, v_merge_existing_qty
          FROM inventory.item
         WHERE owner_account = v_req.account
           AND kind = v_req.kind
           AND ref = v_req.ref
           AND is_stackable
           AND state = 'held';

        -- Race-safe upsert. WHERE on DO UPDATE caps qty at the ceiling;
        -- skipped update -> RETURNING null -> INV16.
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

-- ============================================================================
-- service_withdraw_begin
--   Validates ownership, transitions item to transit_out (splitting if
--   qty < row qty), creates bridge_request. Bridge then delivers in-game
--   and calls service_withdraw_settle.
-- ============================================================================

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

    -- Idempotent replay: identity tuple is (account, direction, game_id,
    -- qty) + idempotency_key uniqueness + a split-row provenance proof
    -- when item_id changed because the original was partial-split.
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

-- ============================================================================
-- service_withdraw_settle
--   Bridge confirms delivery; item -> consumed (terminal). HMAC verified
--   + game_tx_hash insert-once locked. Expiry NOT enforced here — game
--   may have already delivered, refusing would dupe. Phase 6.5 cron
--   handles stuck rows.
-- ============================================================================

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
        RETURN;
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

-- ============================================================================
-- LISTING INTEGRATION RPCs
--   service_listing_lock contract: WHOLE-ROW lock. Callers that want to
--   list a subset of a stackable row must split first (dedicated split
--   RPC lands in Phase 6.1).
-- ============================================================================

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

    -- Stackable unlock must respect the partial unique index. If the
    -- seller already holds another empty-nbt row for (kind, ref), flip
    -- the escrow row to consumed and bump qty on the existing held row.
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

-- ============================================================================
-- PUBLIC PROXIES — PostgREST surface, auth.uid()-scoped reads + writes.
-- ============================================================================

-- Caller's actionable inventory: held + listing_escrow rows, newest first.
-- Keyset paginated: pass (p_before_created_at, p_before_id) from the last
-- row of the previous page (both NULL for first page). p_limit clamped 1..200.
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

-- Caller-initiated withdraw. 2FA gate: if require_2fa_for_withdraw is
-- true on account_security, the JWT must carry aal=aal2 or INV30.
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

-- 2FA policy read. Always returns one row; defaults to all-false when
-- no account_security row exists yet.
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

-- 2FA policy write. Requires aal2 when any flag is currently true OR
-- being set to true, so an aal1 session cannot disable the gate.
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

-- ============================================================================
-- service_split_for_listing (Phase 6.1a)
--   Atomic split: HELD stackable → smaller HELD source + new
--   listing_escrow row. Used by wallet.service_create_listing_with_item
--   when listing a partial stack. New row leaves the held-stackable
--   partial unique index immediately (state = 'listing_escrow'),
--   preserving the (owner, kind, ref) one-row invariant for held rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.service_split_for_listing(
    p_seller_account UUID,
    p_src_item_id    UUID,
    p_qty            BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src    inventory.item%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF p_seller_account IS NULL OR p_src_item_id IS NULL THEN
        RAISE EXCEPTION 'seller_account, src_item_id are required' USING ERRCODE = '22004';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src FROM inventory.item WHERE id = p_src_item_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_src_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_src.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller', p_src_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_src.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)',
            p_src_item_id, v_src.state USING ERRCODE = 'INV12';
    END IF;
    IF NOT v_src.is_stackable THEN
        RAISE EXCEPTION 'item % is instanced; cannot split', p_src_item_id
            USING ERRCODE = 'INV15';
    END IF;
    IF v_src.qty <= p_qty THEN
        RAISE EXCEPTION 'split qty % must be strictly less than source qty %',
            p_qty, v_src.qty USING ERRCODE = 'INV13';
    END IF;

    -- Status-guarded UPDATE. Row already locked FOR UPDATE above;
    -- WHERE-recheck + RETURNING is defensive.
    DECLARE
        v_updated_src_id UUID;
    BEGIN
        UPDATE inventory.item
           SET qty = qty - p_qty, updated_at = now()
         WHERE id = p_src_item_id
           AND owner_account = p_seller_account
           AND state = 'held'
           AND is_stackable
           AND qty > p_qty
        RETURNING id INTO v_updated_src_id;
        IF v_updated_src_id IS NULL THEN
            RAISE EXCEPTION 'split source % invariant violated between lock and update', p_src_item_id
                USING ERRCODE = 'INV12';
        END IF;
    END;

    INSERT INTO inventory.item (
        owner_account, kind, ref, qty, nbt, state, source, source_ref
    ) VALUES (
        v_src.owner_account, v_src.kind, v_src.ref, p_qty,
        v_src.nbt, 'listing_escrow', v_src.source,
        jsonb_build_object(
            'split_from',        v_src.id::text,
            'parent_source_ref', v_src.source_ref
        )
    )
    RETURNING id INTO v_new_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_new_id, 'transit_in', 'listing_escrow', 'wallet',
            'split_for_listing',
            jsonb_build_object(
                'split_from',       v_src.id::text,
                'seller_account',   p_seller_account,
                'qty',              p_qty,
                'previous_src_qty', v_src.qty,
                'new_src_qty',      v_src.qty - p_qty
            ));

    RETURN v_new_id;
END;
$$;

ALTER FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';
