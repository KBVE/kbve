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
--
-- Hardening pass:
--   * reports + attachments are RPC-only on the write side.
--     forum.service_create_report / service_resolve_report /
--     service_attach_media / service_delete_attachment own mutations.
--   * notifications: clients only get column-level UPDATE on read_at.
--     No way to mutate body / kind / actor / target from the client.
--   * moderation_actions is append-only end-to-end — even service_role
--     loses UPDATE/DELETE so the audit trail is tamper-resistant.
--   * Polymorphic targets are validated at write time:
--       - reports → forum.assert_target_exists (thread/comment/space/user)
--       - attachments → forum.assert_parent_exists (from core)
--   * Notifications enforce the (target_kind, target_id) pair invariant
--     and split the recipient-inbox index by read state.
--   * Attachments require https URLs and matching kind/mime pairs.
-- ============================================================

BEGIN;

-- ===========================================
-- HELPERS — target existence check (target_kind enum surface)
-- ===========================================

-- Polymorphic existence check for the moderation surface (target_kind).
-- Catches malformed UUIDs in invalid_text_representation so the trigger
-- returns FALSE instead of erroring on bad input.
CREATE OR REPLACE FUNCTION forum.assert_target_exists(
    p_kind forum.target_kind,
    p_id   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_kind = 'thread' THEN
        RETURN EXISTS (SELECT 1 FROM forum.threads  WHERE id = p_id);
    ELSIF p_kind = 'comment' THEN
        RETURN EXISTS (SELECT 1 FROM forum.comments WHERE id = p_id);
    ELSIF p_kind = 'space' THEN
        RETURN EXISTS (SELECT 1 FROM forum.spaces   WHERE id = p_id::UUID);
    ELSIF p_kind = 'user' THEN
        RETURN EXISTS (SELECT 1 FROM auth.users     WHERE id = p_id::UUID);
    END IF;
    RETURN FALSE;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_target_exists(forum.target_kind, TEXT) FROM PUBLIC;

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
-- Mod-queue lookup: "show me unresolved reports against this target".
-- Distinct from idx_reports_target which covers historical lookups too.
CREATE INDEX idx_reports_unresolved_target
    ON forum.reports (target_kind, target_id, created_at DESC)
    WHERE resolved_at IS NULL;
-- RPC-side rate limiting: "how many reports has this user filed in
-- the last N minutes".
CREATE INDEX idx_reports_reporter_recent
    ON forum.reports (reporter_id, created_at DESC);

CREATE OR REPLACE FUNCTION forum.assert_report_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT forum.assert_target_exists(NEW.target_kind, NEW.target_id) THEN
        RAISE EXCEPTION 'report target % % does not exist', NEW.target_kind, NEW.target_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_target_exists() FROM PUBLIC;

CREATE TRIGGER reports_target_exists
    BEFORE INSERT OR UPDATE OF target_kind, target_id ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_target_exists();

-- Stricter than assert_target_exists: blocks reports against threads
-- already in removed/draft/pending/scheduled state and non-active
-- comments. Stops reports from being filed against content that was
-- already actioned.
CREATE OR REPLACE FUNCTION forum.assert_report_target_visible()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.target_kind = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.threads
             WHERE id = NEW.target_id
               AND status NOT IN ('removed', 'draft', 'pending', 'scheduled')
        ) THEN
            RAISE EXCEPTION 'cannot report non-visible thread %', NEW.target_id;
        END IF;
    ELSIF NEW.target_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.target_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'cannot report non-active comment %', NEW.target_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_target_visible() FROM PUBLIC;

CREATE TRIGGER reports_target_visible
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_target_visible();

CREATE OR REPLACE FUNCTION forum.assert_report_not_self_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.target_kind = 'user' AND NEW.target_id = NEW.reporter_id::TEXT THEN
        RAISE EXCEPTION 'users cannot report themselves';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_report_not_self_user() FROM PUBLIC;

CREATE TRIGGER reports_not_self_user
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_report_not_self_user();

-- Defense-in-depth: even though service_create_report checks
-- is_user_banned, the trigger blocks any direct service_role insert
-- that bypasses the RPC guard.
CREATE OR REPLACE FUNCTION forum.assert_reporter_not_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF forum.is_user_banned(NEW.reporter_id) THEN
        RAISE EXCEPTION 'banned users cannot file reports';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_reporter_not_banned() FROM PUBLIC;

CREATE TRIGGER reports_not_banned
    BEFORE INSERT ON forum.reports
    FOR EACH ROW EXECUTE FUNCTION forum.assert_reporter_not_banned();

ALTER TABLE forum.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.reports FORCE ROW LEVEL SECURITY;

CREATE POLICY reports_self_read ON forum.reports
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

-- Writes through forum.service_create_report (service_role).
-- No author INSERT policy: the table-level REVOKE makes the RPC the
-- single mutation surface, and the RPC enforces banned-user +
-- target-exists + not-self-report invariants.

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
    -- Groups multi-step moderation actions (e.g. "ban + remove all
    -- posts + clear reports") into one audit chain.
    correlation_id  TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) <= 64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_target
    ON forum.moderation_actions (target_kind, target_id, created_at DESC);
CREATE INDEX idx_moderation_actions_moderator
    ON forum.moderation_actions (moderator_id, created_at DESC);
CREATE INDEX idx_moderation_actions_kind
    ON forum.moderation_actions (kind, created_at DESC);
-- Search by metadata (e.g. {"ban_kind": "shadow"}). jsonb_path_ops is
-- the smaller / faster GIN op class for @> containment.
CREATE INDEX idx_moderation_actions_metadata_gin
    ON forum.moderation_actions USING GIN (metadata_json jsonb_path_ops)
    WHERE metadata_json IS NOT NULL;
-- Group lookup for a multi-step moderation chain.
CREATE INDEX idx_moderation_actions_correlation
    ON forum.moderation_actions (correlation_id, created_at)
    WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION forum.assert_mod_action_target_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT forum.assert_target_exists(NEW.target_kind, NEW.target_id) THEN
        RAISE EXCEPTION 'moderation action target % % does not exist',
            NEW.target_kind, NEW.target_id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_mod_action_target_exists() FROM PUBLIC;

CREATE TRIGGER moderation_actions_target_exists
    BEFORE INSERT ON forum.moderation_actions
    FOR EACH ROW EXECUTE FUNCTION forum.assert_mod_action_target_exists();

ALTER TABLE forum.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.moderation_actions FORCE ROW LEVEL SECURITY;

-- Public read of mod log — transparency by default.
CREATE POLICY moderation_actions_public_read ON forum.moderation_actions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Append-only end-to-end. Even service_role drops UPDATE / DELETE so
-- the audit trail is tamper-resistant. Inserts route through
-- forum.service_record_moderation_action.

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
    -- Optional TTL. Cleanup job sweeps expired rows.
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- target_kind and target_id must be set together or both NULL.
    CONSTRAINT notifications_target_pair
        CHECK (
            (target_kind IS NULL AND target_id IS NULL)
            OR
            (target_kind IS NOT NULL AND target_id IS NOT NULL)
        )
);

CREATE INDEX idx_notifications_recipient
    ON forum.notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread
    ON forum.notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;
-- Inbox toggle: list by read state then time.
CREATE INDEX idx_notifications_recipient_read
    ON forum.notifications (recipient_id, read_at, created_at DESC);
-- Cleanup sweep: delete read notifications older than N days.
CREATE INDEX idx_notifications_old_read
    ON forum.notifications (created_at)
    WHERE read_at IS NOT NULL;
-- TTL sweep.
CREATE INDEX idx_notifications_expiry
    ON forum.notifications (expires_at)
    WHERE expires_at IS NOT NULL;
-- Anti-spam dedupe: collapse identical unread notifications. NULL
-- columns (actor / target) get sentinel values so COALESCE matches —
-- a plain partial UNIQUE would treat each NULL as distinct.
CREATE UNIQUE INDEX ux_notifications_dedupe_unread
    ON forum.notifications (
        recipient_id,
        kind,
        COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(target_kind::TEXT, ''),
        COALESCE(target_id, '')
    )
    WHERE read_at IS NULL;

ALTER TABLE forum.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_self_read ON forum.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

-- Mark-as-read only. RLS row gate + column-level GRANT (in the grants
-- block below) means clients can flip read_at on their own rows but
-- not touch body / kind / actor / target.
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
    url                 TEXT NOT NULL CHECK (
        char_length(url) <= 2048
        AND url ~* '^https://'
    ),
    mime_type           TEXT CHECK (mime_type IS NULL OR char_length(mime_type) <= 128),
    -- 50 MiB upper bound. Tune per product; image hosts can lower
    -- via column-level CHECK on a per-uploader_role basis later.
    size_bytes          BIGINT CHECK (
        size_bytes IS NULL
        OR (size_bytes >= 0 AND size_bytes <= 50 * 1024 * 1024)
    ),
    width               INTEGER CHECK (width IS NULL OR width > 0),
    height              INTEGER CHECK (height IS NULL OR height > 0),
    duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    alt_text            TEXT CHECK (alt_text IS NULL OR char_length(alt_text) <= 500),
    title               TEXT CHECK (title IS NULL OR char_length(title) <= 300),
    preview_image_url   TEXT CHECK (
        preview_image_url IS NULL
        OR (char_length(preview_image_url) <= 2048 AND preview_image_url ~* '^https://')
    ),
    language            TEXT CHECK (language IS NULL OR char_length(language) <= 32),
    uploader_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    -- Keep mime_type aligned with the high-level kind. Skip for file /
    -- code (any) and link (mime is irrelevant — usually NULL).
    CONSTRAINT attachments_kind_mime_consistent CHECK (
        mime_type IS NULL
        OR kind IN ('file', 'code')
        OR (kind = 'image' AND mime_type LIKE 'image/%')
        OR (kind = 'video' AND mime_type LIKE 'video/%')
        OR (kind = 'audio' AND mime_type LIKE 'audio/%')
        OR (kind = 'link')
    )
);

CREATE INDEX idx_attachments_parent
    ON forum.attachments (parent_kind, parent_id, sort_order);
CREATE INDEX idx_attachments_uploader
    ON forum.attachments (uploader_id, created_at DESC);
CREATE INDEX idx_attachments_kind
    ON forum.attachments (kind);
-- One URL per parent. Stops accidental double-uploads + lets the RPC
-- treat (parent, url) as a natural key.
CREATE UNIQUE INDEX ux_attachments_dedupe
    ON forum.attachments (parent_kind, parent_id, url);

CREATE OR REPLACE FUNCTION forum.normalize_attachment_language()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.language IS NOT NULL THEN
        NEW.language := lower(trim(NEW.language));
        IF NEW.language = '' THEN
            NEW.language := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_attachment_language() FROM PUBLIC;

CREATE TRIGGER attachments_normalize_language
    BEFORE INSERT OR UPDATE OF language ON forum.attachments
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_attachment_language();

-- Stricter than core forum.assert_parent_exists: thread / comment
-- parents must be in a visible state. Stops attachments from being
-- attached to removed or draft content.
CREATE OR REPLACE FUNCTION forum.assert_attachment_parent_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.parent_kind = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.threads
             WHERE id = NEW.parent_id
               AND status NOT IN ('removed', 'draft', 'pending', 'scheduled')
        ) THEN
            RAISE EXCEPTION 'attachment parent thread % not visible', NEW.parent_id;
        END IF;
    ELSIF NEW.parent_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.parent_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'attachment parent comment % not active', NEW.parent_id;
        END IF;
    ELSE
        IF NOT forum.assert_parent_exists(NEW.parent_kind, NEW.parent_id) THEN
            RAISE EXCEPTION 'attachment parent % % does not exist',
                NEW.parent_kind, NEW.parent_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_attachment_parent_exists() FROM PUBLIC;

CREATE TRIGGER attachments_parent_exists
    BEFORE INSERT OR UPDATE OF parent_kind, parent_id ON forum.attachments
    FOR EACH ROW EXECUTE FUNCTION forum.assert_attachment_parent_exists();

ALTER TABLE forum.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY attachments_public_read ON forum.attachments
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through forum.service_attach_media / service_delete_attachment
-- (service_role). Table-level REVOKE makes the RPC the single mutation
-- surface; RPC enforces banned-user + uploader-owns-parent gates.

-- ============================================================
-- Grants — moderation surface is RPC-only on the write side.
--
-- Reports + attachments + notifications mutations route through
-- service_* RPCs. Notifications get a column-level GRANT so users can
-- mark-as-read but cannot rewrite kind / actor / target / body.
-- moderation_actions is append-only end-to-end: even service_role
-- loses UPDATE / DELETE.
-- ============================================================

-- Public reads.
GRANT SELECT ON forum.moderation_actions TO anon, authenticated;
GRANT SELECT ON forum.attachments        TO anon, authenticated;

-- Authenticated reads.
GRANT SELECT ON forum.reports       TO authenticated;
GRANT SELECT ON forum.notifications TO authenticated;

-- Notifications: only read_at is user-mutable. Column-level GRANT keeps
-- the policy honest — RLS row-gates and grants column-gates.
REVOKE UPDATE           ON forum.notifications FROM authenticated;
GRANT  UPDATE (read_at) ON forum.notifications TO   authenticated;

-- RPC-only writes everywhere else.
REVOKE INSERT, UPDATE, DELETE ON forum.reports     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.attachments FROM authenticated;

-- moderation_actions is append-only end-to-end. service_role only
-- gets SELECT + INSERT — no UPDATE / DELETE on the audit log.
REVOKE INSERT, UPDATE, DELETE ON forum.moderation_actions FROM authenticated;
REVOKE UPDATE, DELETE         ON forum.moderation_actions FROM service_role;

-- service_role explicit grants so RPC mutations survive any future
-- schema-wide REVOKE ALL cleanup.
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.reports       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.attachments   TO service_role;
GRANT SELECT, INSERT                 ON forum.moderation_actions TO service_role;

COMMIT;
