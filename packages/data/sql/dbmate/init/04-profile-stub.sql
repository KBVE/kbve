-- ============================================================
-- Minimal profile schema stub for local migration testing.
--
-- Production has a full profile schema (managed pre-dbmate, see
-- packages/data/sql/schema/profile/). The forum username gate
-- migration references profile.username; this stub provides just
-- enough for that migration to succeed locally.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS profile;

CREATE TABLE IF NOT EXISTS profile.username (
    user_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE
);
