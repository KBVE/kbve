-- ============================================================
-- FORUM SCHEMA — engagement tables.
--
-- Votes (private, reddit-style), reactions (emoji), auction bid
-- history, poll vote audit trail.
--
-- Votes are PRIVATE: only the voter sees their own row. Aggregate
-- totals (upvote_count / downvote_count / score) on threads +
-- comments are maintained by service_cast_* RPCs.
--
-- Hardening pass:
--   * Vote rows never store 'cleared' — service_cast_* deletes the
--     row instead. CHECK enforces the invariant on disk.
--   * thread_votes / comment_votes / poll_votes / auction_bids /
--     reactions are RPC-only. Mutations REVOKEd from authenticated.
--   * Reactions get a polymorphic parent-exists trigger as belt-and-
--     suspenders behind service_toggle_reaction.
--   * Auction bids gate on (thread_type='auction' AND active AND
--     unlocked) and currency is normalized to lowercase.
--   * Poll votes gate on (thread_type='poll' AND active AND unlocked)
--     and option_indices is bounded + unique.
--   * voter_recent indexes drive "my recent votes" UI without a
--     full scan.
-- ============================================================

BEGIN;

-- ===========================================
-- THREAD_VOTES — reddit-style, private, one row per voter
-- ===========================================

CREATE TABLE forum.thread_votes (
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- service_cast_thread_vote DELETEs on 'cleared' so persisted rows
    -- are always 'up' or 'down'.
    direction   forum.vote_direction NOT NULL CHECK (direction IN ('up', 'down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, voter_id)
);

CREATE INDEX idx_thread_votes_voter_recent
    ON forum.thread_votes (voter_id, updated_at DESC);
CREATE INDEX idx_thread_votes_thread_dir
    ON forum.thread_votes (thread_id, direction);

CREATE TRIGGER thread_votes_updated_at
    BEFORE UPDATE ON forum.thread_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

-- Identity guard. Catches service_role mistakes that try to UPDATE the
-- (thread_id, voter_id) primary key columns instead of upserting.
-- Shared across thread/comment/poll vote tables — TG_TABLE_NAME picks
-- the right column pair.
CREATE OR REPLACE FUNCTION forum.prevent_vote_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'thread_votes' THEN
        IF NEW.thread_id IS DISTINCT FROM OLD.thread_id
        OR NEW.voter_id  IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'thread_votes identity fields are immutable';
        END IF;
    ELSIF TG_TABLE_NAME = 'comment_votes' THEN
        IF NEW.comment_id IS DISTINCT FROM OLD.comment_id
        OR NEW.voter_id   IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'comment_votes identity fields are immutable';
        END IF;
    ELSIF TG_TABLE_NAME = 'poll_votes' THEN
        IF NEW.thread_id IS DISTINCT FROM OLD.thread_id
        OR NEW.voter_id  IS DISTINCT FROM OLD.voter_id THEN
            RAISE EXCEPTION 'poll_votes identity fields are immutable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.prevent_vote_identity_mutation() FROM PUBLIC;

CREATE TRIGGER thread_votes_identity_immutable
    BEFORE UPDATE ON forum.thread_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

ALTER TABLE forum.thread_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY thread_votes_self_read ON forum.thread_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- Writes go through forum.service_cast_thread_vote (service_role).

-- ===========================================
-- COMMENT_VOTES — same shape as thread_votes
-- ===========================================

CREATE TABLE forum.comment_votes (
    comment_id  TEXT NOT NULL REFERENCES forum.comments(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- service_cast_comment_vote DELETEs on 'cleared'.
    direction   forum.vote_direction NOT NULL CHECK (direction IN ('up', 'down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, voter_id)
);

CREATE INDEX idx_comment_votes_voter_recent
    ON forum.comment_votes (voter_id, updated_at DESC);
CREATE INDEX idx_comment_votes_comment_dir
    ON forum.comment_votes (comment_id, direction);

CREATE TRIGGER comment_votes_updated_at
    BEFORE UPDATE ON forum.comment_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

CREATE TRIGGER comment_votes_identity_immutable
    BEFORE UPDATE ON forum.comment_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

ALTER TABLE forum.comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.comment_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY comment_votes_self_read ON forum.comment_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- ===========================================
-- REACTIONS — polymorphic on thread OR comment
-- Item 2: nullable custom_kind dedupe via expression unique index
-- (table-level UNIQUE with NULL columns silently allows duplicates).
-- ===========================================

CREATE TABLE forum.reactions (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    parent_kind     forum.attachment_parent_kind NOT NULL
        CHECK (parent_kind IN ('thread', 'comment')),
    parent_id       TEXT NOT NULL,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            forum.reaction_kind NOT NULL,
    -- Format gate: lowercase emoji shortcodes (party_blob, kbve:wave).
    custom_kind     TEXT CHECK (
        custom_kind IS NULL
        OR custom_kind ~ '^[a-z0-9_:-]{1,50}$'
    ),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enforce: custom_kind is only meaningful when kind = 'custom'.
    CHECK ((kind = 'custom' AND custom_kind IS NOT NULL) OR (kind <> 'custom' AND custom_kind IS NULL))
);

-- Item 2: expression unique index using COALESCE so NULL custom_kind dedupes
-- correctly. A plain table-level UNIQUE would treat each NULL as distinct and
-- let duplicate (parent, user, kind) rows slip through.
CREATE UNIQUE INDEX ux_reactions_once
    ON forum.reactions (
        parent_kind,
        parent_id,
        user_id,
        kind,
        COALESCE(custom_kind, '')
    );

-- Aggregation index for "show emoji counts per parent". Includes
-- custom_kind so GROUP BY (kind, custom_kind) can be index-only.
CREATE INDEX idx_reactions_target_counts
    ON forum.reactions (parent_kind, parent_id, kind, custom_kind);
CREATE INDEX idx_reactions_user
    ON forum.reactions (user_id, created_at DESC);
-- "Did I react to this parent?" UI lookup (per-user reactions on a
-- given target). Distinct from idx_reactions_user (recent activity).
CREATE INDEX idx_reactions_user_parent
    ON forum.reactions (user_id, parent_kind, parent_id, kind, custom_kind);

-- Lowercase + trim so dedupe and UI matching see canonical strings.
CREATE OR REPLACE FUNCTION forum.normalize_reaction_custom_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.custom_kind IS NOT NULL THEN
        NEW.custom_kind := lower(trim(NEW.custom_kind));
        IF NEW.custom_kind = '' THEN
            NEW.custom_kind := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_reaction_custom_kind() FROM PUBLIC;

CREATE TRIGGER reactions_normalize_custom_kind
    BEFORE INSERT OR UPDATE OF custom_kind ON forum.reactions
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_reaction_custom_kind();

ALTER TABLE forum.reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.reactions FORCE ROW LEVEL SECURITY;

CREATE POLICY reactions_public_read ON forum.reactions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through forum.service_toggle_reaction (service_role).
-- No author INSERT/DELETE policy: REVOKE on the table makes the RPC
-- the single mutation surface, and the RPC enforces banned-user +
-- parent-exists + locked-thread checks before writing.

-- Belt-and-suspenders: even service_role inserts must reference a real
-- parent in the matching state. Catches RPC bugs and ad-hoc backfills.
CREATE OR REPLACE FUNCTION forum.assert_reaction_parent_exists()
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
            RAISE EXCEPTION 'reaction parent thread % not visible', NEW.parent_id;
        END IF;
    ELSIF NEW.parent_kind = 'comment' THEN
        IF NOT EXISTS (
            SELECT 1 FROM forum.comments
             WHERE id = NEW.parent_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'reaction parent comment % not active', NEW.parent_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_reaction_parent_exists() FROM PUBLIC;

CREATE TRIGGER reactions_parent_exists
    BEFORE INSERT ON forum.reactions
    FOR EACH ROW EXECUTE FUNCTION forum.assert_reaction_parent_exists();

-- ===========================================
-- AUCTION_BIDS — append-only bid history per auction thread
-- ===========================================

CREATE TABLE forum.auction_bids (
    id          TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    bidder_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount      BIGINT NOT NULL CHECK (amount > 0),
    -- Lowercased + bounded by normalize_auction_bid_currency trigger.
    -- Format gate keeps storage tidy (usd, eur, gp, kbve_credit, etc).
    currency    TEXT NOT NULL CHECK (currency ~ '^[a-z0-9_:-]{1,32}$'),
    retracted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_bids_thread_amount
    ON forum.auction_bids (thread_id, amount DESC);
CREATE INDEX idx_auction_bids_bidder
    ON forum.auction_bids (bidder_id, created_at DESC);
-- "My bids on thread X" without scanning the whole bidder history.
CREATE INDEX idx_auction_bids_bidder_thread
    ON forum.auction_bids (bidder_id, thread_id, created_at DESC);
-- Hot path for "current winning bid": filter retracted out, sort by
-- amount desc + earliest tiebreaker. INCLUDE keeps bidder_id +
-- currency in the leaf so winner display can be index-only.
CREATE INDEX idx_auction_bids_current
    ON forum.auction_bids (thread_id, amount DESC, created_at ASC)
    INCLUDE (bidder_id, currency)
    WHERE retracted = FALSE;

CREATE OR REPLACE FUNCTION forum.normalize_auction_bid_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.currency := lower(trim(NEW.currency));
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.normalize_auction_bid_currency() FROM PUBLIC;

CREATE TRIGGER auction_bids_normalize_currency
    BEFORE INSERT ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.normalize_auction_bid_currency();

CREATE OR REPLACE FUNCTION forum.assert_auction_bid_valid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM forum.threads
         WHERE id = NEW.thread_id
           AND thread_type = 'auction'
           AND status = 'active'
           AND locked = FALSE
    ) THEN
        RAISE EXCEPTION 'bids only allowed on active unlocked auction threads';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_auction_bid_valid() FROM PUBLIC;

CREATE TRIGGER auction_bids_valid
    BEFORE INSERT ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.assert_auction_bid_valid();

-- Append-only at the row layer: only `retracted` may flip after insert.
CREATE OR REPLACE FUNCTION forum.prevent_auction_bid_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.id          IS DISTINCT FROM OLD.id
    OR NEW.thread_id   IS DISTINCT FROM OLD.thread_id
    OR NEW.bidder_id   IS DISTINCT FROM OLD.bidder_id
    OR NEW.amount      IS DISTINCT FROM OLD.amount
    OR NEW.currency    IS DISTINCT FROM OLD.currency
    OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'auction bids are append-only; only retracted may change';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.prevent_auction_bid_mutation() FROM PUBLIC;

CREATE TRIGGER auction_bids_append_only
    BEFORE UPDATE ON forum.auction_bids
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_auction_bid_mutation();

ALTER TABLE forum.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.auction_bids FORCE ROW LEVEL SECURITY;

CREATE POLICY auction_bids_public_read ON forum.auction_bids
    FOR SELECT TO anon, authenticated
    USING (TRUE);

-- Writes through service_place_bid RPC.

-- ===========================================
-- POLL_VOTES — audit trail for non-anonymous polls
-- ===========================================

CREATE TABLE forum.poll_votes (
    id              TEXT PRIMARY KEY DEFAULT public.gen_ulid(),
    thread_id       TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    voter_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_indices  INTEGER[] NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (thread_id, voter_id),
    CONSTRAINT poll_votes_options_not_empty
        CHECK (cardinality(option_indices) > 0),
    CONSTRAINT poll_votes_options_bounded
        CHECK (cardinality(option_indices) <= 20)
);

CREATE INDEX idx_poll_votes_thread ON forum.poll_votes (thread_id);
-- "My recent poll votes" UI lookup, parallel to thread/comment vote indexes.
CREATE INDEX idx_poll_votes_voter_recent
    ON forum.poll_votes (voter_id, updated_at DESC);

CREATE TRIGGER poll_votes_updated_at
    BEFORE UPDATE ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.update_updated_at();

CREATE TRIGGER poll_votes_identity_immutable
    BEFORE UPDATE ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.prevent_vote_identity_mutation();

-- Single pass over the array: collect total count, distinct count,
-- and non-negative count in one unnest scan.
CREATE OR REPLACE FUNCTION forum.assert_poll_vote_options_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_total      INTEGER;
    v_distinct   INTEGER;
    v_non_neg    INTEGER;
BEGIN
    SELECT COUNT(*), COUNT(DISTINCT x), COUNT(*) FILTER (WHERE x >= 0)
      INTO v_total, v_distinct, v_non_neg
      FROM unnest(NEW.option_indices) AS x;

    IF v_non_neg <> v_total THEN
        RAISE EXCEPTION 'poll option indices must be non-negative';
    END IF;
    IF v_distinct <> v_total THEN
        RAISE EXCEPTION 'poll option indices must be unique';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_options_unique() FROM PUBLIC;

CREATE TRIGGER poll_votes_unique_options
    BEFORE INSERT OR UPDATE OF option_indices ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_options_unique();

-- Combined gate: poll thread must be active+unlocked AND every
-- option_index must fall within type_data->'options'. Single thread
-- lookup serves both checks (was two lookups before).
CREATE OR REPLACE FUNCTION forum.assert_poll_vote_valid_full()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_option_count INTEGER;
BEGIN
    SELECT jsonb_array_length(t.type_data->'options')
      INTO v_option_count
      FROM forum.threads t
     WHERE t.id          = NEW.thread_id
       AND t.thread_type = 'poll'
       AND t.status      = 'active'
       AND t.locked      = FALSE;

    IF v_option_count IS NULL OR v_option_count <= 0 THEN
        RAISE EXCEPTION 'poll votes only allowed on active unlocked polls with options';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(NEW.option_indices) AS x
         WHERE x >= v_option_count
    ) THEN
        RAISE EXCEPTION 'poll option index out of range (max %)', v_option_count - 1;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_valid_full() FROM PUBLIC;

CREATE TRIGGER poll_votes_valid_full
    BEFORE INSERT OR UPDATE OF thread_id, option_indices ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_valid_full();

ALTER TABLE forum.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.poll_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY poll_votes_self_read ON forum.poll_votes
    FOR SELECT TO authenticated
    USING (voter_id = (SELECT auth.uid()));

-- ============================================================
-- Grants — engagement is RPC-only on the write side.
--
-- Reads are public for reactions / auction_bids; private (self-row)
-- for thread_votes / comment_votes / poll_votes via RLS.
-- ============================================================

-- Public reads.
GRANT SELECT ON forum.reactions     TO anon, authenticated;
GRANT SELECT ON forum.auction_bids  TO anon, authenticated;

-- Private reads (RLS limits to voter_id = auth.uid()).
GRANT SELECT ON forum.thread_votes  TO authenticated;
GRANT SELECT ON forum.comment_votes TO authenticated;
GRANT SELECT ON forum.poll_votes    TO authenticated;

-- No GRANT INSERT/UPDATE/DELETE on engagement tables to authenticated.
-- All mutations route through service_* RPCs (service_role only).
-- Explicit REVOKE belt-and-suspenders against any future schema-wide
-- GRANT ALL — applied to both authenticated and anon for completeness.
REVOKE INSERT, UPDATE, DELETE ON forum.thread_votes  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.comment_votes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.poll_votes    FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.auction_bids  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON forum.reactions     FROM authenticated, anon;

-- service_role bypasses RLS, but explicit GRANT keeps RPC writes
-- working even if a future schema-wide REVOKE ALL strips defaults.
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.thread_votes  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.comment_votes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.poll_votes    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.auction_bids  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum.reactions     TO service_role;

-- Documentation. Future migrations should not GRANT writes to anon /
-- authenticated; mutations belong inside service_* RPCs.
COMMENT ON TABLE forum.thread_votes  IS
    'Private vote rows. RPC-only mutation surface. Do not grant direct writes to anon/authenticated.';
COMMENT ON TABLE forum.comment_votes IS
    'Private comment vote rows. RPC-only mutation surface. Do not grant direct writes to anon/authenticated.';
COMMENT ON TABLE forum.reactions     IS
    'Publicly readable reactions. RPC-only mutation surface. Parent validity enforced by trigger.';
COMMENT ON TABLE forum.auction_bids  IS
    'Append-only auction bid history. RPC-only mutation surface. Only retracted is mutable post-insert.';
COMMENT ON TABLE forum.poll_votes    IS
    'Private poll vote audit rows. RPC-only mutation surface.';

COMMIT;
