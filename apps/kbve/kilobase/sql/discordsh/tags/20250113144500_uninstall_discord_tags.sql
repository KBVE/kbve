-- Start the transaction
BEGIN;

-- 1. Revoke Permissions (Ensure no lingering permissions)
REVOKE SELECT ON public.discord_tag_all FROM anon, authenticated;
REVOKE SELECT ON public.discord_tag_safe FROM anon, authenticated;

-- 2. Drop Trigger and Refresh Function (Triggers must be removed before the table)
DROP TRIGGER IF EXISTS trigger_refresh_discord_tags ON public.discord_tags;
DROP FUNCTION IF EXISTS refresh_discord_tags_materialized_views;

-- 3. Drop Materialized Views (Drop views before the base table to avoid dependencies)
DROP MATERIALIZED VIEW IF EXISTS public.discord_tag_all;
DROP MATERIALIZED VIEW IF EXISTS public.discord_tag_safe;

-- 4. Drop Indexes (Cleaned up based on current schema)
DROP INDEX IF EXISTS idx_discord_tags_name;
DROP INDEX IF EXISTS idx_discord_tag_all_name;
DROP INDEX IF EXISTS idx_discord_tag_all_tag_id;
DROP INDEX IF EXISTS idx_discord_tag_safe_name;
DROP INDEX IF EXISTS idx_discord_tag_safe_tag_id;

-- Removed idx_discord_tags_status, idx_discord_tag_all_status, idx_discord_tag_safe_status

-- 5. Disable RLS (Ensure no permission conflicts when deleting the table)
ALTER TABLE public.discord_tags DISABLE ROW LEVEL SECURITY;

-- 6. Drop the Table (Clean up the base table)
DROP TABLE IF EXISTS public.discord_tags;

-- Commit the transaction
COMMIT;
