-- ============================================================
-- FORUM SCHEMA — moderation + notifications + attachments.
--
-- Reports (user-filed), ModerationAction (append-only audit log),
-- Notifications (per-recipient inbox), Attachments (polymorphic
-- media linkage).
--
-- Item 1: reports / moderation_actions / notifications use the
-- `forum.target_kind` enum (thread/comment/space/user). Attachments
-- keep `forum.attachment_parent_kind` so the two surfaces evolve
-- independently.
--
-- Item 2: reports use a partial unique INDEX on (reporter, target)
-- WHERE resolved_at IS NULL — table-level UNIQUE with NULL columns
-- silently allows duplicates.
-- ============================================================

BEGIN;

-- ===========================================
-- REPORTS — user flags bad content / users
-- ===========================================

CREATE TABLE forum.reports (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_kind     forum.target_kind NOT NULL,
    target_id       TEXT NOT NULL,
    reason          forum.report_reason NOT NULL,
    reason_detail   TEXT CHECK (reason_detail IS NULL OR char_length(reason_detail) <= 2000),
    resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 2000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item 2: one open report per (reporter, target). Partial unique index
-- avoids the NULL-comparison gotcha — once resolved_at is set, the row
-- exits the index and a re-report is allowed.
CREATE UNIQUE INDEX ux_reports_open_once
    ON forum.reports (reporter_id, target_kind, target_id)
    WHERE resolved_at IS NULL;

CREATE INDEX idx_reports_unresolved
    ON forum.reports (created_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_reports_target
    ON forum.reports (target_kind, target_id);
CREATE INDEX idx_reports_reason
    ON forum.reports (reason, created_at DESC)
    WHERE resolved_at IS NULL;

ALTER TABLE forum.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.reports FORCE ROW LEVEL SECURITY;

CREATE POLICY reports_self_read ON forum.reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

CREATE POLICY reports_self_insert ON forum.reports
    FOR INSERT TO authenticated
    WITH CHECK (reporter_id = auth.uid());

-- Updates + resolution through service_resolve_report RPC.

-- ===========================================
-- MODERATION_ACTIONS — append-only audit log
-- ===========================================

CREATE TABLE forum.moderation_actions (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    moderator_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    kind            forum.moderation_action_kind NOT NULL,
    target_kind     forum.target_kind NOT NULL,
    target_id       TEXT NOT NULL,
    reason          TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000),
    metadata_json   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_target
    ON forum.moderation_actions (target_kind, target_id, created_at DESC);
CREATE INDEX idx_moderation_actions_moderator
    ON forum.moderation_actions (moderator_id, created_at DESC);
CREATE INDEX idx_moderation_actions_kind
    ON forum.moderation_actions (kind, created_at DESC);

ALTER TABLE forum.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.moderation_actions FORCE ROW LEVEL SECURITY;

-- Public read of mod log — transparency by default.
CREATE POLICY moderation_actions_public_read ON forum.moderation_actions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes only via service_role RPC.

-- ===========================================
-- NOTIFICATIONS — per-recipient inbox
-- ===========================================

CREATE TABLE forum.notifications (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    recipient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            forum.notification_kind NOT NULL,
    actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_kind     forum.target_kind,
    target_id       TEXT,
    body            TEXT CHECK (body IS NULL OR char_length(body) <= 500),
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient
    ON forum.notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread
    ON forum.notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;

ALTER TABLE forum.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_self_read ON forum.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

CREATE POLICY notifications_self_update ON forum.notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

-- Deletes only through service_role.

-- ===========================================
-- ATTACHMENTS — polymorphic media / link / file on any parent
-- ===========================================

CREATE TABLE forum.attachments (
    id                  TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    parent_kind         forum.attachment_parent_kind NOT NULL,
    parent_id           TEXT NOT NULL,
    kind                forum.attachment_kind NOT NULL,
    url                 TEXT NOT NULL CHECK (char_length(url) <= 2048),
    mime_type           TEXT CHECK (mime_type IS NULL OR char_length(mime_type) <= 128),
    size_bytes          BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
    width               INTEGER CHECK (width IS NULL OR width > 0),
    height              INTEGER CHECK (height IS NULL OR height > 0),
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    alt_text            TEXT CHECK (alt_text IS NULL OR char_length(alt_text) <= 500),
    title               TEXT CHECK (title IS NULL OR char_length(title) <= 300),
    preview_image_url   TEXT CHECK (preview_image_url IS NULL OR char_length(preview_image_url) <= 2048),
    language            TEXT CHECK (language IS NULL OR char_length(language) <= 32),
    uploader_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_attachments_parent
    ON forum.attachments (parent_kind, parent_id, sort_order);
CREATE INDEX idx_attachments_uploader
    ON forum.attachments (uploader_id, created_at DESC);
CREATE INDEX idx_attachments_kind
    ON forum.attachments (kind);

ALTER TABLE forum.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY attachments_public_read ON forum.attachments
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY attachments_uploader_insert ON forum.attachments
    FOR INSERT TO authenticated
    WITH CHECK (uploader_id = auth.uid());

CREATE POLICY attachments_uploader_delete ON forum.attachments
    FOR DELETE TO authenticated
    USING (uploader_id = auth.uid());

-- Item 8 — client grants for moderation/inbox/attachment surfaces.
GRANT SELECT                    ON forum.moderation_actions TO anon, authenticated;
GRANT SELECT, UPDATE            ON forum.notifications      TO authenticated;
GRANT SELECT                    ON forum.attachments        TO anon, authenticated;
GRANT INSERT, DELETE            ON forum.attachments        TO authenticated;
GRANT SELECT, INSERT            ON forum.reports            TO authenticated;

COMMIT;
