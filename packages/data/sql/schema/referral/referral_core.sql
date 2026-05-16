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
-- Applied migration:
--   packages/data/sql/dbmate/migrations/20260515221756_referral_schema_init.sql
--
-- Privacy stance: raw IPs are never persisted. The axum referral handler
-- hashes the visitor IP via HMAC-SHA256(REFERRAL_HASH_SECRET, ip) and the
-- /24 IPv4 (or /48 IPv6) subnet prefix before calling record_click. Both
-- digests are stored as opaque bytea — useful for dedup + fraud signals,
-- useless for re-identification.
--
-- Depends on:
--   - auth.users (Supabase)
--   - wallet.account, wallet.balance
--   - wallet.service_credit() — for the reward path
--   - wallet.source_kind enum carries the 'referral' value
--   - pgcrypto / gen_random_uuid() for idempotency keys
-- ============================================================

CREATE SCHEMA IF NOT EXISTS referral;
GRANT USAGE ON SCHEMA referral TO authenticated, service_role;

-- ============================================================
-- TABLES
-- ============================================================

-- Catalog of redirect destinations. Admin-curated, small table.
CREATE TABLE IF NOT EXISTS referral.target (
    slug         TEXT PRIMARY KEY
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    url          TEXT NOT NULL CHECK (url ~ '^https?://'),
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Which targets each user can refer to + the primary target for short URLs.
CREATE TABLE IF NOT EXISTS referral.user_target (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_slug  TEXT NOT NULL REFERENCES referral.target(slug) ON DELETE CASCADE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_slug)
);
-- One default target per user. Partial unique index so non-default rows
-- don't compete for the slot.
CREATE UNIQUE INDEX IF NOT EXISTS user_target_one_default
    ON referral.user_target (user_id)
    WHERE is_default;

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
    'TRUE iff this click triggered a reward credit (no earlier qualified
     row within the policy dedup window for the same referrer + target +
     ip_hash).';
COMMENT ON COLUMN referral.click.ledger_id IS
    'wallet.ledger.id of the credit, when credited=true. NULL otherwise.';

-- Single-row reward policy. Updating this row is the only way to change
-- the economics without a redeploy.
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
    'Curated redirect destinations. Admin-only writes (no RLS policy grants).';
COMMENT ON TABLE referral.user_target IS
    'Per-user opt-in of which catalog entries a user can refer to, plus the
     single is_default row that the short /referral/@<handle>/ URL resolves to.';
COMMENT ON TABLE referral.click IS
    'Append-only click log. Hashed-only IP / subnet, truncated headers.';
COMMENT ON TABLE referral.reward_policy IS
    'Single-row config: credits_per_click + dedup_window_days. UPDATE row id=1
     to retune economics live (next click picks it up).';
