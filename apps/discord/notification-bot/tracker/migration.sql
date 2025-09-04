-- Complete migration for tracker schema
-- Run this file to set up the entire tracker schema and cluster_management table

-- Step 1: Create the tracker schema with proper permissions
\i schema.sql

-- Step 2: Create the cluster_management table
\i tables/cluster_management.sql

-- Step 3: Verify setup
DO $$
DECLARE
    schema_exists BOOLEAN;
    table_exists BOOLEAN;
BEGIN
    -- Check if schema exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata 
        WHERE schema_name = 'tracker'
    ) INTO schema_exists;
    
    -- Check if table exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'tracker' 
        AND table_name = 'cluster_management'
    ) INTO table_exists;
    
    -- Report results
    IF schema_exists AND table_exists THEN
        RAISE NOTICE 'SUCCESS: Tracker schema and cluster_management table created successfully';
    ELSE
        RAISE EXCEPTION 'FAILED: Schema exists: %, Table exists: %', schema_exists, table_exists;
    END IF;
END $$;

-- Step 4: Test the helper functions
SELECT 'Testing cleanup function...' AS test;
SELECT tracker.cleanup_stale_assignments() AS cleaned_assignments;

SELECT 'Testing next shard function...' AS test;
SELECT tracker.get_next_available_shard('test-cluster') AS next_shard;

-- Step 5: Insert a test record to verify permissions
INSERT INTO tracker.cluster_management (
    instance_id, 
    cluster_name, 
    shard_id, 
    total_shards,
    hostname
) VALUES (
    'migration-test', 
    'test-cluster', 
    0, 
    2,
    'test-host'
) ON CONFLICT (cluster_name, shard_id) DO NOTHING;

SELECT 'Test record inserted successfully' AS result;

-- Clean up test record
DELETE FROM tracker.cluster_management WHERE instance_id = 'migration-test';

SELECT 'Migration completed successfully!' AS final_result;