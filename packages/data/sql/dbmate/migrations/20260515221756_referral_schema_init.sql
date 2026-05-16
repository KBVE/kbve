-- migrate:up

-- Referral system Phase 1 — schema + click-recording RPC.
--
-- Surface
--   /referral/@<handle>/             → user's default target
--   /referral/@<handle>/<target>/    → specific target from the catalog
--
-- Phase 1 (this migration) lays the rails:
--   - referral.target          — admin-curated catalog of redirect destinations
--   - referral.user_target     — which targets each user can refer to + their
--                                primary (one row per user marked is_default)
--   - referral.click           — append-only click log; one row per HTTP hit
--   - referral.reward_policy   — single-row config (credits per click + dedup
--                                window). Bumping the row is the only way to
--                                change reward economics without a redeploy.
--   - referral.record_click(...) — SECURITY DEFINER RPC the axum handler calls
--                                  to log a click and, when qualified under
--                                  the policy's dedup window, credit the
--                                  referrer's wallet.
--   - referral.resolve_user_target(...) — pick the (slug, url) for a click.
--
-- Phase 2 will add the axum-kbve route + astro page rewrite. Phase 2 only
-- consumes the surface defined here.
--
-- Privacy: raw IPs are NEVER stored. The axum handler hashes the visitor IP
-- via HMAC-SHA256(REFERRAL_HASH_SECRET, ip) and the /24 IPv4 (or /48 IPv6)
-- subnet prefix, then passes both digests. We only see opaque bytea.

-- Extend the wallet source_kind enum with the 'referral' tag. service_credit
-- requires the value to exist before any referral row inserts a ledger entry.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so this
-- statement must execute before the rest of the file is in a txn (dbmate
-- runs each .sql top-to-bottom under one tx by default; pgcrypto pattern is
-- to use the IF NOT EXISTS clause to make the ADD idempotent + tx-safe).
ALTER TYPE wallet.source_kind ADD VALUE IF NOT EXISTS 'referral';

CREATE SCHEMA IF NOT EXISTS referral;
GRANT USAGE ON SCHEMA referral TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- target catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.target (
    slug         TEXT PRIMARY KEY
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    url          TEXT NOT NULL CHECK (url ~ '^https?://'),
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE referral.target IS
    'Curated redirect destinations. Admin-only writes (no RLS policy grants).';

INSERT INTO referral.target (slug, title, url, description) VALUES
    ('rareicon',
     'RareIcon on Steam',
     'https://store.steampowered.com/app/2238370/RareIcon/',
     'Bullet-hell roguelite — Chip vs DaemonCorps.'),
    ('mc',
     'KBVE Minecraft',
     'https://kbve.com/mc/',
     'KBVE Minecraft server hub.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- per-user target opt-in + default
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral.user_target (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_slug  TEXT NOT NULL REFERENCES referral.target(slug) ON DELETE CASCADE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_slug)
);
-- A user has at most one default target. Partial unique index, not a
-- table-level constraint, so non-default rows don't fight for the slot.
CREATE UNIQUE INDEX IF NOT EXISTS user_target_one_default
    ON referral.user_target (user_id)
    WHERE is_default;

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
    ledger_id     BIGINT,
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
    'TRUE iff this click triggered a reward credit (no earlier qualified row
     within the policy dedup window for the same referrer+target+ip_hash).';
COMMENT ON COLUMN referral.click.ledger_id IS
    'wallet.ledger.id of the credit, when credited=true. NULL otherwise.';

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

-- ---------------------------------------------------------------------------
-- internal helper: resolve the wallet.account.id for a referrer's user_id.
-- Lazy-provisions the account + balance if the user has never been seen by
-- the wallet before. Mirrors the pattern in wallet.proxy_ensure_user_account
-- but is callable from the service path (no auth.uid()).
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
-- record_click — the entry point for the axum-kbve referral handler.
--
-- Resolves the target, checks the dedup window, optionally credits the
-- referrer's wallet, and writes one row to referral.click. Returns enough
-- for the handler to log + redirect.
--
-- Atomicity: the wallet credit + the click insert run in the same
-- transaction. If wallet.service_credit raises, the click row is rolled
-- back with it — credited / ledger_id never lie.
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
    click_id    BIGINT,
    qualified   BOOLEAN,
    credited    BOOLEAN,
    ledger_id   BIGINT,
    target_url  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_policy        referral.reward_policy%ROWTYPE;
    v_target        referral.target%ROWTYPE;
    v_existing_id   BIGINT;
    v_qualifies     BOOLEAN := FALSE;
    v_account_id    UUID;
    v_ledger_id     BIGINT;
    v_click_id      BIGINT;
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

    SELECT * INTO v_policy FROM referral.reward_policy WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reward policy missing' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_target
      FROM referral.target
     WHERE slug = p_target_slug AND active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target % not found or inactive', p_target_slug
            USING ERRCODE = 'P0002';
    END IF;

    -- Has a qualified click for this (referrer, target, IP) landed inside
    -- the dedup window? If yes, this click logs but does not credit.
    -- Table alias keeps PL/pgSQL OUT params (qualified, credited) from
    -- shadowing the column name.
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

    IF v_qualifies THEN
        v_account_id := referral.ensure_referrer_account(p_referrer_id);

        v_ledger_id := wallet.service_credit(
            v_account_id,
            'credits'::wallet.currency_kind,
            v_policy.credits_per_click,
            'referral'::wallet.source_kind,
            'referral_click',
            'referral_click',
            NULL::BIGINT,
            gen_random_uuid()
        );
    END IF;

    INSERT INTO referral.click (
        referrer_id, target_slug, ip_hash, subnet_hash,
        user_agent, referer, accept_lang,
        qualified, credited, ledger_id
    ) VALUES (
        p_referrer_id, p_target_slug, p_ip_hash, p_subnet_hash,
        NULLIF(left(p_user_agent, 256), ''),
        NULLIF(left(p_referer, 512), ''),
        NULLIF(left(p_accept_lang, 64), ''),
        v_qualifies, v_qualifies, v_ledger_id
    )
    RETURNING id INTO v_click_id;

    RETURN QUERY
    SELECT v_click_id,
           v_qualifies,
           v_qualifies,
           v_ledger_id,
           v_target.url;
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
    'Phase 1 referral entrypoint. axum-kbve handler calls this with a hashed
     IP + subnet and request metadata. Returns the resolved target URL plus
     whether the click qualified for a reward credit. Credit + log row are
     transactional.';

-- ---------------------------------------------------------------------------
-- resolve_user_target — picks (slug, title, url) for a click. Used by the
-- axum handler when the URL omits an explicit target (defaults to the row
-- marked is_default for the user) or to verify the user actually has that
-- target enabled when one is supplied.
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

-- Intentionally a no-op. Dropping referral.click loses click history and
-- referral.target drops the catalog out from under live links. Take the
-- cleanup path out of dbmate — write a dedicated script if we ever truly
-- need to tear this down.
SELECT 1;
