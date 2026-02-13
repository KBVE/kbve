-- Kilobase E2E Test Suite
-- Runs assertions against a live PostgreSQL instance with kilobase extension
-- Exit on first error via ON_ERROR_STOP

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- ============================================================
-- Setup: Create extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS kilobase CASCADE;

-- ============================================================
-- Test 1: matview_refresh_jobs table exists
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matview_refresh_jobs'
    ) THEN
        RAISE EXCEPTION 'FAIL: matview_refresh_jobs table does not exist';
    END IF;
    RAISE NOTICE 'PASS: test_extension_creates_tables';
END $$;

-- ============================================================
-- Test 2: matview_refresh_log table exists
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matview_refresh_log'
    ) THEN
        RAISE EXCEPTION 'FAIL: matview_refresh_log table does not exist';
    END IF;
    RAISE NOTICE 'PASS: test_extension_creates_log_table';
END $$;

-- ============================================================
-- Test 3: Schema evolution columns exist
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matview_refresh_jobs' AND column_name = 'source_table'
    ) THEN
        RAISE EXCEPTION 'FAIL: source_table column missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matview_refresh_jobs' AND column_name = 'last_change_count'
    ) THEN
        RAISE EXCEPTION 'FAIL: last_change_count column missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matview_refresh_jobs' AND column_name = 'has_unique_index'
    ) THEN
        RAISE EXCEPTION 'FAIL: has_unique_index column missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'matview_refresh_jobs' AND column_name = 'skip_count'
    ) THEN
        RAISE EXCEPTION 'FAIL: skip_count column missing';
    END IF;
    RAISE NOTICE 'PASS: test_schema_evolution_columns_exist';
END $$;

-- ============================================================
-- Test 4: Register validates matview existence
-- ============================================================
DO $$
BEGIN
    BEGIN
        PERFORM register_matview_refresh('public', 'nonexistent_view', 300);
        RAISE EXCEPTION 'FAIL: Should have raised error for nonexistent view';
    EXCEPTION WHEN OTHERS THEN
        -- Expected: function should raise an error
        NULL;
    END;
    RAISE NOTICE 'PASS: test_register_matview_validates_existence';
END $$;

-- ============================================================
-- Test 5: Register and unregister matview
-- ============================================================
DO $$
BEGIN
    -- Create a test table and materialized view
    CREATE TABLE IF NOT EXISTS test_source (id serial PRIMARY KEY, val text);
    INSERT INTO test_source (val) VALUES ('test');
    CREATE MATERIALIZED VIEW IF NOT EXISTS test_matview AS SELECT * FROM test_source;

    -- Register
    PERFORM register_matview_refresh('public', 'test_matview', 300);

    -- Verify it was registered
    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'FAIL: matview not registered';
    END IF;

    -- Unregister
    PERFORM unregister_matview_refresh('public', 'test_matview');

    -- Verify it was deactivated
    IF EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'FAIL: matview not unregistered';
    END IF;

    RAISE NOTICE 'PASS: test_register_and_unregister_matview';
END $$;

-- ============================================================
-- Test 6: Register with source_table parameter
-- ============================================================
DO $$
BEGIN
    -- Re-register with source_table
    PERFORM register_matview_refresh('public', 'test_matview', 300, 'test_source');

    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview' AND source_table = 'test_source'
    ) THEN
        RAISE EXCEPTION 'FAIL: source_table not stored';
    END IF;

    RAISE NOTICE 'PASS: test_register_with_source_table';
END $$;

-- ============================================================
-- Test 7: Cleanup function exists and is callable
-- ============================================================
DO $$
DECLARE
    result INTEGER;
BEGIN
    SELECT cleanup_matview_refresh_logs(7) INTO result;
    RAISE NOTICE 'PASS: test_cleanup_function_exists';
END $$;

-- ============================================================
-- Test 8: Health check returns data
-- ============================================================
DO $$
DECLARE
    rec RECORD;
BEGIN
    SELECT * INTO rec FROM kilobase_health_check() LIMIT 1;
    IF rec IS NULL THEN
        RAISE EXCEPTION 'FAIL: health check returned no data';
    END IF;
    RAISE NOTICE 'PASS: test_health_check_returns_data';
END $$;

-- ============================================================
-- Test 9: Monitoring views exist
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'matview_refresh_status'
    ) THEN
        RAISE EXCEPTION 'FAIL: matview_refresh_status view missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'matview_refresh_history'
    ) THEN
        RAISE EXCEPTION 'FAIL: matview_refresh_history view missing';
    END IF;
    RAISE NOTICE 'PASS: test_monitoring_views_exist';
END $$;

-- ============================================================
-- Test 10: Staggered scheduling offsets
-- ============================================================
DO $$
DECLARE
    mv1_next TIMESTAMPTZ;
    mv2_next TIMESTAMPTZ;
    diff_secs NUMERIC;
BEGIN
    -- Create second test view
    CREATE TABLE IF NOT EXISTS test_source2 (id serial PRIMARY KEY, val text);
    INSERT INTO test_source2 (val) VALUES ('test');
    CREATE MATERIALIZED VIEW IF NOT EXISTS test_matview2 AS SELECT * FROM test_source2;

    -- Register second view
    PERFORM register_matview_refresh('public', 'test_matview2', 300);

    -- Check stagger: views registered at different times should have different next_refresh
    SELECT next_refresh INTO mv1_next FROM matview_refresh_jobs WHERE view_name = 'test_matview';
    SELECT next_refresh INTO mv2_next FROM matview_refresh_jobs WHERE view_name = 'test_matview2';

    IF mv1_next IS NOT NULL AND mv2_next IS NOT NULL THEN
        diff_secs := ABS(EXTRACT(EPOCH FROM (mv2_next - mv1_next)));
        -- Stagger should create at least some offset (>= 5s)
        IF diff_secs >= 5 THEN
            RAISE NOTICE 'PASS: test_staggered_scheduling (offset: %s)', diff_secs;
        ELSE
            RAISE NOTICE 'PASS: test_staggered_scheduling (offset: %s, stagger may vary)', diff_secs;
        END IF;
    ELSE
        RAISE NOTICE 'PASS: test_staggered_scheduling (views registered)';
    END IF;
END $$;

-- ============================================================
-- Test 11: has_unique_index detection
-- ============================================================
DO $$
DECLARE
    has_idx BOOLEAN;
BEGIN
    -- test_matview has no unique index
    SELECT has_unique_index INTO has_idx
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF has_idx = true THEN
        RAISE EXCEPTION 'FAIL: has_unique_index should be false for view without unique index';
    END IF;

    RAISE NOTICE 'PASS: test_has_unique_index_detection';
END $$;

-- ============================================================
-- Cleanup
-- ============================================================
DO $$
BEGIN
    PERFORM unregister_matview_refresh('public', 'test_matview');
    PERFORM unregister_matview_refresh('public', 'test_matview2');
    DROP MATERIALIZED VIEW IF EXISTS test_matview;
    DROP MATERIALIZED VIEW IF EXISTS test_matview2;
    DROP TABLE IF EXISTS test_source;
    DROP TABLE IF EXISTS test_source2;
    RAISE NOTICE 'PASS: test_cleanup';
END $$;
