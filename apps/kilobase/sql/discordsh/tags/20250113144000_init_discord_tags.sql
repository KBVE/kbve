-- Start the transaction
BEGIN;

-- 1. Create Discord Tags Table (with tag_id as BIGSERIAL primary key)
CREATE TABLE IF NOT EXISTS public.discord_tags (
    tag_id BIGSERIAL PRIMARY KEY,           -- Unique Tag ID for better scalability
    name TEXT NOT NULL UNIQUE CHECK (char_length(name) <= 32), 
    status INT DEFAULT 0 NOT NULL,          -- Bitwise status field for tag management
    CONSTRAINT valid_tag_name CHECK (name ~ '^[a-z0-9-]+$')
);

-- 2. Indexes for Performance
CREATE INDEX idx_discord_tags_name ON public.discord_tags USING btree(name); -- Optimize tag name lookups

-- 3. Enable Row Level Security (RLS) on Base Table
ALTER TABLE public.discord_tags ENABLE ROW LEVEL SECURITY;

-- 4. Restrict Base Table Access (Only Service Role Can Access Directly)
-- No policies for anon or authenticated on the base table, fully restricted access.

-- 5. Materialized View: discord_tag_all (Includes APPROVED + NSFW, excludes BLOCKED + MODERATION)
CREATE MATERIALIZED VIEW public.discord_tag_all AS
SELECT tag_id, name, status 
FROM public.discord_tags
WHERE ((status & 2) != 0  -- APPROVED
       OR (status & 4) != 0)  -- NSFW
AND (status & 8) = 0  -- NOT MODERATION
AND (status & 16) = 0; -- NOT BLOCKED

-- Index on the materialized view for optimized SELECT queries
CREATE INDEX idx_discord_tag_all_name ON public.discord_tag_all(name);
CREATE INDEX idx_discord_tag_all_tag_id ON public.discord_tag_all(tag_id);

-- Grant SELECT to anon and authenticated for the materialized view only
GRANT SELECT ON public.discord_tag_all TO anon, authenticated;

-- 6. Materialized View: discord_tag_safe (Includes APPROVED but NOT NSFW, BLOCKED, or MODERATION)
CREATE MATERIALIZED VIEW public.discord_tag_safe AS
SELECT tag_id, name, status 
FROM public.discord_tags
WHERE (status & 2) != 0  -- APPROVED
AND (status & 4) = 0     -- NOT NSFW
AND (status & 8) = 0     -- NOT MODERATION
AND (status & 16) = 0;   -- NOT BLOCKED

-- Index on the materialized view for optimized SELECT queries
CREATE INDEX idx_discord_tag_safe_name ON public.discord_tag_safe(name);
CREATE INDEX idx_discord_tag_safe_tag_id ON public.discord_tag_safe(tag_id);

-- Grant SELECT to anon and authenticated for the materialized view only
GRANT SELECT ON public.discord_tag_safe TO anon, authenticated;

-- 7. Refresh Materialized Views on Data Change
CREATE OR REPLACE FUNCTION refresh_discord_tags_materialized_views()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW public.discord_tag_all;
    REFRESH MATERIALIZED VIEW public.discord_tag_safe;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Attach Trigger to Automatically Refresh on Data Change
CREATE TRIGGER trigger_refresh_discord_tags
AFTER INSERT OR UPDATE OR DELETE
ON public.discord_tags
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_discord_tags_materialized_views();

-- END

COMMIT;
