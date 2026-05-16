-- ============================================================
-- REFERRAL SCHEMA — Per-user referral links, click log, reward policy
--
-- Surface
--   /referral/@<handle>/             → user's default target
--   /referral/@<handle>/<target>/    → specific target from the catalog
--
-- Source of truth (proto):
--   packages/data/proto/referral/referral.proto
--
-- Applied migrations:
--   - 20260515220000_wallet_source_kind_referral.sql
--       Adds 'referral' to wallet.source_kind. Lives in its own
--       migration because ALTER TYPE ... ADD VALUE is allowed inside a
--       transaction in Postgres 12+ but the new value cannot be used in
--       the same transaction it was added in.
--   - 20260515221756_referral_schema_init.sql
--       Schema, tables, RPCs.
--
-- Privacy: raw IPs are never persisted. The Phase 2 axum handler hashes
-- the visitor IP via HMAC-SHA256(REFERRAL_HASH_SECRET, ip) and the
-- /24 IPv4 (or /48 IPv6) subnet prefix before calling record_click.
--
-- Depends on:
--   - auth.users (Supabase)
--   - wallet.account, wallet.balance, wallet.ledger
--   - wallet.service_credit() — reward path
--   - wallet.source_kind enum carries 'referral'
--   - pgcrypto / gen_random_uuid()
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS referral;

-- Service-only for Phase 1. authenticated users hit the axum handler
-- (service_role); they never touch this schema directly.
GRANT USAGE ON SCHEMA referral TO service_role;

-- ============================================================
-- TABLES
-- ============================================================

-- Catalog of redirect destinations. Admin-curated.
CREATE TABLE IF NOT EXISTS referral.target (
    slug         TEXT PRIMARY KEY
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    -- Coarse safety net: require http(s)://, forbid whitespace / control
    -- chars. Application code does proper URL validation.
    url          TEXT NOT NULL
                   CHECK (url ~ '^https?://[^[:space:][:cntrl:]]+$'),
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalog rows ARE re-applied on re-run (DO UPDATE) so URL fixes and
-- title bumps land without a separate migration.
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

-- Which targets each user can refer to + the primary target for short
-- URLs. active = FALSE disables a row without losing history.
CREATE TABLE IF NOT EXISTS referral.user_target (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_slug  TEXT NOT NULL REFERENCES referral.target(slug) ON DELETE CASCADE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    enabled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at  TIMESTAMPTZ,
    PRIMARY KEY (user_id, target_slug)
);
-- One active default per user.
CREATE UNIQUE INDEX IF NOT EXISTS user_target_one_default
    ON referral.user_target (user_id)
    WHERE is_default AND active;

-- Append-only click log. One row per HTTP hit.
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
    ledger_id     BIGINT REFERENCES wallet.ledger(id) ON DELETE SET NULL,
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
    'TRUE iff this click was the first inside the policy dedup window
     for the (referrer, target, ip_hash) tuple.';
COMMENT ON COLUMN referral.click.credited IS
    'TRUE iff wallet.service_credit actually ran for this click
     (qualified AND credits_per_click > 0).';
COMMENT ON COLUMN referral.click.ledger_id IS
    'wallet.ledger.id of the credit. NULL when credited = FALSE.';

-- Single-row reward economics. Updating the row retunes live.
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

COMMENT ON TABLE referral.target IS
    'Curated redirect destinations. Admin-only writes (no RLS policy
     grants — only SECURITY DEFINER functions touch this table).';
COMMENT ON TABLE referral.user_target IS
    'Per-user opt-in into the catalog plus the single is_default row
     that the short /referral/@<handle>/ URL resolves to.';
COMMENT ON TABLE referral.click IS
    'Append-only click log. Hashed-only IP + subnet, truncated headers.';
COMMENT ON TABLE referral.reward_policy IS
    'Single-row config. UPDATE row id=1 to retune economics live.';

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Direct table access from PostgREST is denied. All reads / writes
-- go through SECURITY DEFINER functions in referral_rpcs.sql.
-- ============================================================
ALTER TABLE referral.target          ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.user_target     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.click           ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral.reward_policy   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES    IN SCHEMA referral FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA referral FROM PUBLIC, anon, authenticated;
