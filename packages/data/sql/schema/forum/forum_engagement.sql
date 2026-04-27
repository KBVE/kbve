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

ALTER TABLE forum.thread_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.thread_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY thread_votes_self_read ON forum.thread_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

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

ALTER TABLE forum.comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.comment_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY comment_votes_self_read ON forum.comment_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

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
    custom_kind     TEXT CHECK (custom_kind IS NULL OR char_length(custom_kind) <= 50),
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

CREATE INDEX idx_reactions_target ON forum.reactions (parent_kind, parent_id, kind);
CREATE INDEX idx_reactions_user   ON forum.reactions (user_id, created_at DESC);

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
    currency    TEXT NOT NULL CHECK (char_length(currency) BETWEEN 1 AND 32),
    retracted   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auction_bids_thread_amount
    ON forum.auction_bids (thread_id, amount DESC);
CREATE INDEX idx_auction_bids_bidder
    ON forum.auction_bids (bidder_id, created_at DESC);
-- Hot path for "current winning bid": filter retracted out, sort by
-- amount desc + earliest tiebreaker.
CREATE INDEX idx_auction_bids_current
    ON forum.auction_bids (thread_id, amount DESC, created_at ASC)
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
    UNIQUE (thread_id, voter_id),
    CONSTRAINT poll_votes_options_not_empty
        CHECK (cardinality(option_indices) > 0),
    CONSTRAINT poll_votes_options_bounded
        CHECK (cardinality(option_indices) <= 20)
);

CREATE INDEX idx_poll_votes_thread ON forum.poll_votes (thread_id);

CREATE OR REPLACE FUNCTION forum.assert_poll_vote_options_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM unnest(NEW.option_indices) AS x WHERE x < 0) THEN
        RAISE EXCEPTION 'poll option indices must be non-negative';
    END IF;
    IF (SELECT COUNT(*)          FROM unnest(NEW.option_indices) AS x)
     <> (SELECT COUNT(DISTINCT x) FROM unnest(NEW.option_indices) AS x) THEN
        RAISE EXCEPTION 'poll option indices must be unique';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_options_unique() FROM PUBLIC;

CREATE TRIGGER poll_votes_unique_options
    BEFORE INSERT OR UPDATE OF option_indices ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_options_unique();

CREATE OR REPLACE FUNCTION forum.assert_poll_vote_valid()
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
           AND thread_type = 'poll'
           AND status = 'active'
           AND locked = FALSE
    ) THEN
        RAISE EXCEPTION 'poll votes only allowed on active unlocked poll threads';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION forum.assert_poll_vote_valid() FROM PUBLIC;

CREATE TRIGGER poll_votes_valid
    BEFORE INSERT OR UPDATE OF thread_id ON forum.poll_votes
    FOR EACH ROW EXECUTE FUNCTION forum.assert_poll_vote_valid();

ALTER TABLE forum.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum.poll_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY poll_votes_self_read ON forum.poll_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

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
-- GRANT ALL.
REVOKE INSERT, UPDATE, DELETE ON forum.thread_votes  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.comment_votes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.poll_votes    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.auction_bids  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON forum.reactions     FROM authenticated;

COMMIT;
