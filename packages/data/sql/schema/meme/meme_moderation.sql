-- ============================================================
-- MEME MODERATION SCHEMA
-- Content reports and moderation workflow
--
-- Depends on: meme_core.sql (meme.memes table)
-- ============================================================

BEGIN;

-- ===========================================
-- TABLE: meme_reports
-- ===========================================

CREATE TABLE IF NOT EXISTS meme.meme_reports (
    id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
    meme_id         TEXT NOT NULL REFERENCES meme.memes(id) ON DELETE CASCADE,
    reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- ReportReason enum (1-7)
    reason          SMALLINT NOT NULL CHECK (reason BETWEEN 1 AND 7),
    detail          TEXT,

    resolved        BOOLEAN NOT NULL DEFAULT false,
    resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_note TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

COMMENT ON TABLE meme.meme_reports IS 'User-submitted content moderation reports on memes';
COMMENT ON COLUMN meme.meme_reports.reason IS 'ReportReason: 1=spam, 2=nsfw, 3=hate_speech, 4=harassment, 5=copyright, 6=misinformation, 7=other';

-- Indexes

-- One open report per user per meme
CREATE UNIQUE INDEX IF NOT EXISTS idx_meme_meme_reports_one_open
    ON meme.meme_reports (meme_id, reporter_id)
    WHERE resolved = false;

-- Moderation queue: unresolved reports, oldest first
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_unresolved
    ON meme.meme_reports (created_at ASC)
    WHERE resolved = false;

-- Reports per meme (for escalation thresholds)
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_meme
    ON meme.meme_reports (meme_id)
    WHERE resolved = false;

-- Reporter history
CREATE INDEX IF NOT EXISTS idx_meme_meme_reports_reporter
    ON meme.meme_reports (reporter_id);

-- RLS
ALTER TABLE meme.meme_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON meme.meme_reports;
DROP POLICY IF EXISTS "authenticated_insert_own_report" ON meme.meme_reports;
DROP POLICY IF EXISTS "authenticated_select_own_reports" ON meme.meme_reports;

CREATE POLICY "service_role_full_access" ON meme.meme_reports
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_insert_own_report" ON meme.meme_reports
    FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "authenticated_select_own_reports" ON meme.meme_reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

-- No anon access, no UPDATE/DELETE for authenticated (moderation is service_role only)
GRANT SELECT, INSERT ON meme.meme_reports TO authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    reports_ok BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'meme' AND table_name = 'meme_reports') INTO reports_ok;

    IF NOT reports_ok THEN
        RAISE EXCEPTION 'meme_moderation setup failed - reports: %', reports_ok;
    END IF;

    RAISE NOTICE 'meme_moderation.sql: meme_reports verified successfully.';
END $$;

COMMIT;
