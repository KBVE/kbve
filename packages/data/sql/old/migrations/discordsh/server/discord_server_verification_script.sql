-- Begin verification script
BEGIN;

-- Collect all missing components into an array
SELECT ARRAY(
    SELECT verification_result
    FROM (
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'discord_servers'
            ) THEN 'discord_servers MISSING' END AS verification_result
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'discord_server_bumps'
            ) THEN 'discord_server_bumps MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'discord_server_premium'
            ) THEN 'discord_server_premium MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'discord_server_tags'
            ) THEN 'discord_server_tags MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM pg_proc 
                WHERE proname = 'set_updated_at'
            ) THEN 'set_updated_at function MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM pg_proc 
                WHERE proname = 'enforce_tag_limit'
            ) THEN 'enforce_tag_limit function MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.triggers 
                WHERE event_object_table = 'discord_servers' 
                AND trigger_name = 'trigger_set_updated_at'
            ) THEN 'trigger_set_updated_at MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM information_schema.triggers 
                WHERE event_object_table = 'discord_server_tags' 
                AND trigger_name = 'trigger_enforce_tag_limit'
            ) THEN 'trigger_enforce_tag_limit MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND indexname = 'idx_discord_server_tags_tag_id'
            ) THEN 'idx_discord_server_tags_tag_id MISSING' END
        UNION ALL
        SELECT 
            CASE WHEN NOT EXISTS (
                SELECT FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND indexname = 'idx_discord_server_bumps_bump_at'
            ) THEN 'idx_discord_server_bumps_bump_at MISSING' END
    ) AS verification_results
    WHERE verification_result IS NOT NULL
) AS missing_components;

-- End the verification script
COMMIT;
