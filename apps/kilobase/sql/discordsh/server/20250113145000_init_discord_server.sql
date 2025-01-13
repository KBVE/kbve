-- Start the transaction
BEGIN;

-- 1. Create Discord Servers Table (updated_at retained here)
CREATE TABLE IF NOT EXISTS public.discord_servers (
    server_id BIGINT PRIMARY KEY,              -- Unique server ID
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Supabase Auth user linking
    lang INT DEFAULT 0,                        -- Bitmask for languages
    status INT DEFAULT 0,                      -- Bitmask for public, nsfw, vip, etc.
    invite TEXT NOT NULL,                      -- Server invite link
    name TEXT NOT NULL,                        -- Server name
    summary TEXT NOT NULL,                     -- Brief summary of the server
    description TEXT,                          -- Optional server description
    website TEXT,                             -- Website URL (optional)
    logo TEXT,                              -- Logo URL
    banner TEXT,                             -- Banner URL (optional)
    video TEXT,                              -- Video link for promo
    categories INT DEFAULT 0,                -- Bitmask for categories (up to 50)
    updated_at BIGINT NOT NULL               -- Timestamp for last server update
);

ALTER TABLE public.discord_servers ENABLE ROW LEVEL SECURITY;

-- 2. Create Discord Server Bumps Table (1:1 Relationship Enforced)
CREATE TABLE IF NOT EXISTS public.discord_server_bumps (
    server_id BIGINT PRIMARY KEY REFERENCES public.discord_servers(server_id) ON DELETE CASCADE,
    bumps INT DEFAULT 0,                        -- Number of bumps
    bump_at BIGINT NOT NULL                     -- Timestamp for the last bump action
);

ALTER TABLE public.discord_server_bumps ENABLE ROW LEVEL SECURITY;


-- 3. Create Discord Server Premium Table (1:1 Relationship Enforced)
CREATE TABLE IF NOT EXISTS public.discord_server_premium (
    server_id BIGINT PRIMARY KEY REFERENCES public.discord_servers(server_id) ON DELETE CASCADE, 
    vip INT DEFAULT 0,                             -- Bitmask for premium features (e.g., VIP status)
    invoice TEXT,                                  -- Invoice reference for premium transactions
    invoice_at BIGINT                             -- Last time the server was invoiced (UNIX timestamp)
);

ALTER TABLE public.discord_server_premium ENABLE ROW LEVEL SECURITY;

-- 4. Create Discord Server Tags Table (with Tag Limit Enforced)
CREATE TABLE IF NOT EXISTS public.discord_server_tags (
    server_id BIGINT REFERENCES public.discord_servers(server_id) ON DELETE CASCADE,
    tag_id BIGINT REFERENCES public.discord_tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, tag_id)
);

ALTER TABLE public.discord_server_tags ENABLE ROW LEVEL SECURITY;


-- 5. Create Trigger Function to Enforce a 10-Tag Limit per Server
CREATE OR REPLACE FUNCTION enforce_tag_limit()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the server already has 10 tags before allowing the insert
    IF (SELECT COUNT(*) FROM public.discord_server_tags WHERE server_id = NEW.server_id) >= 10 THEN
        RAISE EXCEPTION 'A server cannot have more than 10 tags.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach Trigger to the Tags Table
CREATE TRIGGER trigger_enforce_tag_limit
BEFORE INSERT ON public.discord_server_tags
FOR EACH ROW
EXECUTE FUNCTION enforce_tag_limit();

-- 7. Performance Index
CREATE INDEX idx_discord_server_tags_tag_id ON public.discord_server_tags(tag_id);
CREATE INDEX idx_discord_server_bumps_bump_at ON public.discord_server_bumps(bump_at);

COMMIT;