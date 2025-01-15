-- Start an uninstallation transaction
BEGIN;

-- 1. Remove the Trigger(s)
DROP TRIGGER IF EXISTS trigger_enforce_tag_limit ON public.discord_server_tags;

-- 2. Remove the Trigger Function
DROP FUNCTION IF EXISTS enforce_tag_limit() CASCADE;

-- 3. Remove the Indexes
DROP INDEX IF EXISTS public.idx_discord_server_tags_tag_id;
DROP INDEX IF EXISTS public.idx_discord_server_bumps_bump_at;

-- 4. Drop the Tables in the correct dependency order
--    (Tables referencing discord_servers should be dropped first, followed by discord_servers itself)
DROP TABLE IF EXISTS public.discord_server_tags CASCADE;
DROP TABLE IF EXISTS public.discord_server_premium CASCADE;
DROP TABLE IF EXISTS public.discord_server_bumps CASCADE;
DROP TABLE IF EXISTS public.discord_servers CASCADE;

-- End the uninstallation transaction
COMMIT;
