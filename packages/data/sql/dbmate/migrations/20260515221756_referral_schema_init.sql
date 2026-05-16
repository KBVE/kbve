-- migrate:up

-- Referral system Phase 1 — schema + click-recording RPC.
--
-- Depends on:
--   wallet schema + wallet.service_credit (20260511104220_wallet_schema_init)
--   wallet.source_kind = 'referral' (20260515220000_wallet_source_kind_referral)
--   pgcrypto for gen_random_uuid()
--
-- Custom SQLSTATEs raised by record_click for the Phase 2 axum handler:
--   RFP01 = referral.reward_policy row missing
--   RFT01 = referral target not found / inactive
--   RFU01 = referrer does not have target enabled in user_target
--
-- Surface (consumed in Phase 2 by axum-kbve):
--   /referral/@<handle>/             → user's default target
--   /referral/@<handle>/<target>/    → specific target from the catalog
--
-- Privacy: raw IPs are NEVER stored. The Phase 2 axum handler hashes the
-- visitor IP with HMAC-SHA256(REFERRAL_HASH_SECRET, ip) and the /24 IPv4
-- (or /48 IPv6) subnet prefix, then passes both digests. We only see
-- opaque bytea.

-- Belt-and-suspenders: gen_random_uuid lives in pgcrypto on older
-- Postgres, and is in core from 13+. Either way, this is a no-op on
-- modern clusters.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS referral;

-- Schema usage is service-only for Phase 1. authenticated users go
-- through the axum handler (service_role) -- they never touch this
-- schema directly. Grant authenticated later when a client-side RPC
-- needs it.
GRANT USAGE ON SCHEMA referral TO service_role;

-- ---------------------------------------------------------------------------
-- target catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.target (
    slug         TEXT PRIMARY KEY
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    -- Tight URL check: require http(s)://, forbid whitespace and control
    -- chars. Application code does proper URL validation; this is just a
    -- coarse safety net at the DB.
    url          TEXT NOT NULL
                   CHECK (url ~ '^https?://[^[:space:][:cntrl:]]+$'),
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE referral.target IS
    'Curated redirect destinations. Admin-only writes (no RLS policy grants).';

-- Catalog rows ARE re-applied on re-run so URL fixes / title bumps land
-- without manual SQL. Slug stays the primary key so links never break.
INSERT INTO referral.target (slug, title, url, description) VALUES
    ('rareicon',
     'RareIcon on Steam',
     'https://store.steampowered.com/app/2238370/RareIcon/',
     'Bullet-hell roguelite — Chip vs DaemonCorps.'),
    ('mc',
     'KBVE Minecraft',
     'https://kbve.com/mc/',
     'KBVE Minecraft server hub.')
ON CONFLICT (slug) DO UPDATE
    SET title       = EXCLUDED.title,
        url         = EXCLUDED.url,
        description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- per-user target opt-in + default
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.user_target (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_slug  TEXT NOT NULL REFERENCES referral.target(slug) ON DELETE CASCADE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    -- active = TRUE is the live state; flipping to FALSE keeps history
    -- without losing the (user_id, target_slug) row. record_click +
    -- resolve_user_target both honor this.
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    enabled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at  TIMESTAMPTZ,
    PRIMARY KEY (user_id, target_slug),
    -- Active rows must have NULL disabled_at; inactive rows must have a
    -- timestamp. Keeps the audit invariant that "disabled_at marks the
    -- moment the row stopped being live" honest.
    CONSTRAINT user_target_active_disabled_chk
        CHECK (
            (active AND disabled_at IS NULL)
         OR (NOT active AND disabled_at IS NOT NULL)
        )
);
-- One default target per user, only counted among active rows.
CREATE UNIQUE INDEX IF NOT EXISTS user_target_one_default
    ON referral.user_target (user_id)
    WHERE is_default AND active;

-- ---------------------------------------------------------------------------
-- click log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.click (
    id            BIGSERIAL PRIMARY KEY,
    referrer_id   UUID NOT NULL REFERENCES auth.users(id),
    target_slug   TEXT NOT NULL REFERENCES referral.target(slug),
    ip_hash       BYTEA NOT NULL,
    subnet_hash   BYTEA NOT NULL,
    user_agent    TEXT,
    referer       TEXT,
    accept_lang   TEXT,
    qualified     BOOLEAN NOT NULL DEFAULT FALSE,
    credited      BOOLEAN NOT NULL DEFAULT FALSE,
    -- FK so the ledger row a click points at must exist. ON DELETE
    -- RESTRICT because credited = TRUE implies a real ledger row;
    -- SET NULL would let a stray ledger DELETE silently drift the
    -- invariant. wallet.ledger is append-only in practice, so RESTRICT
    -- is the safe default.
    ledger_id     BIGINT REFERENCES wallet.ledger(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS click_created_at ON referral.click (created_at);
-- Hot lookup path for the dedup check inside record_click().
CREATE INDEX IF NOT EXISTS click_dedup_idx
    ON referral.click (referrer_id, target_slug, ip_hash, created_at DESC)
    WHERE qualified;
COMMENT ON COLUMN referral.click.ip_hash IS
    'HMAC-SHA256(server_secret, ip) — never store raw IP.';
COMMENT ON COLUMN referral.click.subnet_hash IS
    'HMAC-SHA256(server_secret, /24 IPv4 or /48 IPv6 prefix).';
COMMENT ON COLUMN referral.click.qualified IS
    'TRUE iff this click was the first inside the policy dedup window for
     the (referrer, target, ip_hash) tuple. credited may still be FALSE
     when credits_per_click = 0.';
COMMENT ON COLUMN referral.click.credited IS
    'TRUE iff wallet.service_credit actually ran for this click (qualified
     AND credits_per_click > 0). ledger_id is populated iff credited.';
COMMENT ON COLUMN referral.click.ledger_id IS
    'wallet.ledger.id of the credit. NULL when credited = FALSE.';

-- ---------------------------------------------------------------------------
-- reward policy — single row, easy to bump without a redeploy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.reward_policy (
    id                  SMALLINT PRIMARY KEY CHECK (id = 1),
    credits_per_click   BIGINT NOT NULL DEFAULT 10
                        CHECK (credits_per_click >= 0),
    dedup_window_days   INTEGER NOT NULL DEFAULT 30
                        CHECK (dedup_window_days BETWEEN 1 AND 365),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO referral.reward_policy (id, credits_per_click, dedup_window_days)
VALUES (1, 10, 30)
ON CONFLICT (id) DO NOTHING;

-- Auto-bump updated_at on policy changes so audits don't have to trust
-- that the admin remembered to set it manually.
CREATE OR REPLACE FUNCTION referral.reward_policy_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS reward_policy_set_updated_at ON referral.reward_policy;
CREATE TRIGGER reward_policy_set_updated_at
    BEFORE UPDATE ON referral.reward_policy
    FOR EACH ROW EXECUTE FUNCTION referral.reward_policy_touch();

-- ---------------------------------------------------------------------------
-- Lock down direct table access. Only the SECURITY DEFINER functions
-- below should read or write these tables. PostgREST never sees rows
-- because RLS is on and no policy grants are issued.
--
-- service_role intentionally has schema USAGE + function EXECUTE only
-- (granted below). It does NOT get direct table SELECT/INSERT etc.
-- Every callable path is a SECURITY DEFINER function owned by postgres
-- so the wallet writes carry the correct privileges.
-- ---------------------------------------------------------------------------
ALTER TABLE referral.target          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.user_target     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.click           ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.reward_policy   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES    IN SCHEMA referral FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA referral FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ensure_referrer_account — lazy wallet account provisioning for a brand
-- new user's first referral credit. Mirrors wallet.proxy_ensure_user_account
-- but is callable from the service path (no auth.uid() dependency).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.ensure_referrer_account(
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_account_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22004';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('referral.ensure_referrer_account:' || p_user_id::TEXT, 0)
    );

    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = p_user_id;
    IF FOUND THEN
        RETURN v_account_id;
    END IF;

    INSERT INTO wallet.account (kind, user_id, created_at)
    VALUES ('user', p_user_id, now())
    ON CONFLICT (user_id) WHERE kind = 'user' DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
          FROM wallet.account
         WHERE kind = 'user' AND user_id = p_user_id;
    END IF;

    INSERT INTO wallet.balance (account_id)
    VALUES (v_account_id)
    ON CONFLICT (account_id) DO NOTHING;

    RETURN v_account_id;
END;
$fn$;

ALTER FUNCTION referral.ensure_referrer_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.ensure_referrer_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.ensure_referrer_account(UUID)
    TO service_role;

-- ---------------------------------------------------------------------------
-- record_click — entry point for the axum-kbve referral handler.
--
-- Order of operations is deliberate:
--   1. Validate inputs.
--   2. Take a transaction-scoped advisory lock on
--      (referrer_id, target_slug, ip_hash) so two concurrent clicks for
--      the same tuple cannot both pass the dedup check and both credit.
--   3. Verify referrer has the target enabled (defense in depth — the
--      handler is supposed to call resolve_user_target first, but if a
--      future caller forgets we still cannot credit a target the user
--      has not opted into).
--   4. Run the dedup-window check.
--   5. Insert the click row uncredited.
--   6. If qualified AND credits_per_click > 0:
--        - call wallet.service_credit with a deterministic idempotency
--          key derived from the freshly-inserted click_id;
--        - UPDATE the click row with credited = TRUE + ledger_id.
--      Deterministic idem key makes wallet-level retries idempotent and
--      keeps the ledger row pointed at a real referral.click.id via
--      ref_id.
--
-- Custom SQLSTATEs (RF...) let the axum handler distinguish referral
-- errors from generic PL/pgSQL data-not-found paths.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.record_click(
    p_referrer_id  UUID,
    p_target_slug  TEXT,
    p_ip_hash      BYTEA,
    p_subnet_hash  BYTEA,
    p_user_agent   TEXT DEFAULT NULL,
    p_referer      TEXT DEFAULT NULL,
    p_accept_lang  TEXT DEFAULT NULL
)
RETURNS TABLE (
    click_id     BIGINT,
    target_slug  TEXT,
    target_url   TEXT,
    qualified    BOOLEAN,
    credited     BOOLEAN,
    ledger_id    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_policy       referral.reward_policy%ROWTYPE;
    v_target       referral.target%ROWTYPE;
    v_existing_id  BIGINT;
    v_qualifies    BOOLEAN := FALSE;
    v_account_id   UUID;
    v_ledger_id    BIGINT;
    v_click_id     BIGINT;
    v_idem_key     UUID;
    v_credited     BOOLEAN := FALSE;
BEGIN
    IF p_referrer_id IS NULL THEN
        RAISE EXCEPTION 'referrer_id is required' USING ERRCODE = '22023';
    END IF;
    IF p_target_slug IS NULL THEN
        RAISE EXCEPTION 'target_slug is required' USING ERRCODE = '22023';
    END IF;
    IF p_ip_hash IS NULL OR octet_length(p_ip_hash) = 0 THEN
        RAISE EXCEPTION 'ip_hash is required' USING ERRCODE = '22023';
    END IF;
    IF p_subnet_hash IS NULL OR octet_length(p_subnet_hash) = 0 THEN
        RAISE EXCEPTION 'subnet_hash is required' USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent clicks for the same dedup tuple so the
    -- read-before-write dedup check is race-free.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'referral.click:'
            || p_referrer_id::TEXT
            || ':' || p_target_slug
            || ':' || encode(p_ip_hash, 'hex'),
            0
        )
    );

    SELECT * INTO v_policy FROM referral.reward_policy WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reward policy missing' USING ERRCODE = 'RFP01';
    END IF;

    SELECT * INTO v_target
      FROM referral.target
     WHERE slug = p_target_slug AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'RFT01';
    END IF;

    -- Referrer must have this target enabled. The handler already
    -- resolves via resolve_user_target, but defense in depth.
    IF NOT EXISTS (
        SELECT 1
          FROM referral.user_target ut
         WHERE ut.user_id      = p_referrer_id
           AND ut.target_slug  = p_target_slug
           AND ut.active
    ) THEN
        RAISE EXCEPTION 'referrer % has target % disabled or unset',
                        p_referrer_id, p_target_slug
            USING ERRCODE = 'RFU01';
    END IF;

    -- Has a qualified click for this (referrer, target, IP) landed inside
    -- the dedup window? If yes, this click logs but does not credit.
    SELECT c.id INTO v_existing_id
      FROM referral.click c
     WHERE c.referrer_id = p_referrer_id
       AND c.target_slug = p_target_slug
       AND c.ip_hash     = p_ip_hash
       AND c.qualified
       AND c.created_at  >= now() - make_interval(days => v_policy.dedup_window_days)
     ORDER BY c.created_at DESC
     LIMIT 1;

    v_qualifies := v_existing_id IS NULL;

    -- Insert the click row first so the ledger entry can carry
    -- ref_id = click_id for cross-table traceability AND so a wallet
    -- credit failure rolls the row back with it (atomic strict mode —
    -- no orphan click rows pointing at a missing ledger entry).
    --
    -- Cross-request retry guards live higher up: the advisory lock +
    -- dedup window prevent the second logical click from re-entering
    -- this branch. The wallet idempotency key here is just a stable
    -- value per *successful* credit, not a cross-RPC replay shield.
    INSERT INTO referral.click (
        referrer_id, target_slug, ip_hash, subnet_hash,
        user_agent, referer, accept_lang,
        qualified, credited, ledger_id
    ) VALUES (
        p_referrer_id, p_target_slug, p_ip_hash, p_subnet_hash,
        NULLIF(left(p_user_agent, 256), ''),
        NULLIF(left(p_referer, 512), ''),
        NULLIF(left(p_accept_lang, 64), ''),
        v_qualifies, FALSE, NULL
    )
    RETURNING id INTO v_click_id;

    IF v_qualifies AND v_policy.credits_per_click > 0 THEN
        v_account_id := referral.ensure_referrer_account(p_referrer_id);

        -- md5 of click_id yields a stable 16-byte digest the UUID type
        -- accepts unmodified. Wallet.service_credit treats matching
        -- idempotency keys as replays and returns the prior ledger_id.
        v_idem_key := (md5('referral.click:' || v_click_id::TEXT))::UUID;

        v_ledger_id := wallet.service_credit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_policy.credits_per_click,
            'referral'::wallet.source_kind,
            'referral_click',
            'referral_click',
            v_click_id,
            v_idem_key
        );

        UPDATE referral.click
           SET credited  = TRUE,
               ledger_id = v_ledger_id
         WHERE id = v_click_id;

        v_credited := TRUE;
    END IF;

    RETURN QUERY
    SELECT v_click_id,
           v_target.slug,
           v_target.url,
           v_qualifies,
           v_credited,
           v_ledger_id;
END;
$fn$;

ALTER FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION referral.record_click(
    UUID, TEXT, BYTEA, BYTEA, TEXT, TEXT, TEXT
) IS
    'Phase 1 referral entrypoint. axum-kbve handler calls this with a
     hashed IP + subnet and request metadata. Returns the resolved target
     URL + slug plus whether the click qualified for a reward credit.
     Click insert + wallet credit run inside the same transaction.';

-- ---------------------------------------------------------------------------
-- resolve_user_target — pick (slug, title, url) for a click. Used by the
-- axum handler when the URL omits an explicit target.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION referral.resolve_user_target(
    p_user_id      UUID,
    p_target_slug  TEXT DEFAULT NULL
)
RETURNS TABLE (slug TEXT, title TEXT, url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
    SELECT t.slug, t.title, t.url
      FROM referral.user_target ut
      JOIN referral.target t ON t.slug = ut.target_slug
     WHERE ut.user_id = p_user_id
       AND ut.active
       AND t.active
       AND (
           (p_target_slug IS NOT NULL AND ut.target_slug = p_target_slug)
        OR (p_target_slug IS NULL AND ut.is_default)
       )
     LIMIT 1;
$fn$;

ALTER FUNCTION referral.resolve_user_target(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION referral.resolve_user_target(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION referral.resolve_user_target(UUID, TEXT)
    TO service_role;

-- migrate:down

-- Intentionally a no-op. Tear-down order if ever needed (do it
-- out-of-band):
--   1. REVOKE EXECUTE ON FUNCTION referral.* FROM service_role;
--   2. DROP FUNCTION referral.record_click(...), .resolve_user_target(...),
--      .ensure_referrer_account(...);
--   3. DROP TABLE referral.click, .user_target, .reward_policy, .target;
--   4. DROP SCHEMA referral;
--   5. Leave wallet.source_kind = 'referral' in place — Postgres has no
--      DROP VALUE and removing it would orphan existing ledger rows.
SELECT 1;
