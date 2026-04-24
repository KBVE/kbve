-- ============================================================
-- FORUM SCHEMA — engagement tables.
--
-- Votes (private, reddit-style), reactions (emoji), auction bid
-- history, poll vote audit trail.
--
-- Votes are PRIVATE: only the voter sees their own row. Aggregate
-- totals (upvote_count / downvote_count / score) on threads +
-- comments are maintained by trigger from service_cast_* RPCs.
-- ============================================================

BEGIN;

-- ===========================================
-- THREAD_VOTES — reddit-style, private, one row per voter
-- ===========================================

CREATE TABLE forum.thread_votes (
    thread_id   TEXT NOT NULL REFERENCES forum.threads(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    direction   forum.vote_direction NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (thread_id, voter_id)
);

CREATE INDEX idx_thread_votes_voter ON forum.thread_votes (voter_id);
CREATE INDEX idx_thread_votes_thread_dir
    ON forum.thread_votes (thread_id, direction)
    WHERE direction <> 'cleared';

ALTER TABLE forum.thread_votes ENABLE ROW LEVEL SECURITY;

-- Private-by-default: only the voter sees their own row. Aggregate counts
-- are exposed via forum.threads.{score, upvote_count, downvote_count}.
CREATE POLICY thread_votes_self_read ON forum.thread_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

-- Writes go through forum.service_cast_thread_vote RPC (service_role).
-- No end-user INSERT/UPDATE/DELETE policies.

-- ===========================================
-- COMMENT_VOTES — same shape as thread_votes
-- ===========================================

CREATE TABLE forum.comment_votes (
    comment_id  TEXT NOT NULL REFERENCES forum.comments(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    direction   forum.vote_direction NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, voter_id)
);

CREATE INDEX idx_comment_votes_voter ON forum.comment_votes (voter_id);
CREATE INDEX idx_comment_votes_comment_dir
    ON forum.comment_votes (comment_id, direction)
    WHERE direction <> 'cleared';

ALTER TABLE forum.comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY comment_votes_self_read ON forum.comment_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

-- ===========================================
-- REACTIONS — polymorphic on thread OR comment
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
    -- Dedup: one reaction row per (user, target, kind, optional custom_kind).
    -- Toggling off = row delete; toggling to a different kind = update.
    UNIQUE (parent_kind, parent_id, user_id, kind, custom_kind),
    -- Enforce: custom_kind is only meaningful when kind = 'custom'.
    CHECK ((kind = 'custom' AND custom_kind IS NOT NULL) OR (kind <> 'custom' AND custom_kind IS NULL))
);

CREATE INDEX idx_reactions_target ON forum.reactions (parent_kind, parent_id, kind);
CREATE INDEX idx_reactions_user   ON forum.reactions (user_id, created_at DESC);

ALTER TABLE forum.reactions ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can see reaction totals + who reacted (twitter-style,
-- unlike votes). If a space wants private reactions, add a space-level flag
-- later and gate this policy on it.
CREATE POLICY reactions_public_read ON forum.reactions
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY reactions_self_insert ON forum.reactions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY reactions_self_delete ON forum.reactions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

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

ALTER TABLE forum.auction_bids ENABLE ROW LEVEL SECURITY;

-- Public: bid history is transparent for auctions.
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
    UNIQUE (thread_id, voter_id)
);

CREATE INDEX idx_poll_votes_thread ON forum.poll_votes (thread_id);

ALTER TABLE forum.poll_votes ENABLE ROW LEVEL SECURITY;

-- Poll visibility depends on the owning poll's `anonymous` flag. Enforce at
-- RPC layer (reads through forum.service_fetch_poll_results). Default here
-- is private-by-voter.
CREATE POLICY poll_votes_self_read ON forum.poll_votes
    FOR SELECT TO authenticated
    USING (voter_id = auth.uid());

COMMIT;
