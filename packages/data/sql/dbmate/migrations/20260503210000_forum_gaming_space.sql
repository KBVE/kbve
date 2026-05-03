-- migrate:up

-- ============================================================
-- FORUM — seed the `gaming` umbrella space.
--
-- Per the hybrid spaces+tags strategy: one umbrella space for all
-- general gaming chat, with per-game filtering carried by tags
-- (#rareicon, #minecraft, #osrs, etc.). Promote a tag to its own
-- space later if it sustains its own community.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING so re-running the
-- migration on an env where the row already exists is safe.
-- ============================================================

INSERT INTO forum.spaces (
    slug,
    name,
    description,
    allowed_types,
    sort_order
) VALUES (
    'gaming',
    'Gaming',
    'General gaming chat — any game, any platform. Use tags like #rareicon, #minecraft, #osrs to filter, or browse /forum/tags for the full list.',
    ARRAY['discussion', 'question', 'guide', 'lfg', 'showcase', 'poll', 'megathread']::forum.thread_type[],
    50
)
ON CONFLICT (slug) DO NOTHING;

-- migrate:down

DELETE FROM forum.spaces WHERE slug = 'gaming';
