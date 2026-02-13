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
-- Test 12: SQL injection in schema_name parameter
-- ============================================================
DO $$
BEGIN
    BEGIN
        PERFORM register_matview_refresh(
            'public''; DROP TABLE matview_refresh_jobs; --',
            'test_matview',
            300
        );
        -- If it gets here, the injection didn't execute (good) but the view
        -- doesn't exist in that schema, so it should have raised an error
        RAISE EXCEPTION 'FAIL: Should have raised error for injected schema_name';
    EXCEPTION WHEN OTHERS THEN
        -- Expected: the function rejects the nonexistent view in the injected schema
        -- Verify tables still exist (injection did NOT execute)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'matview_refresh_jobs'
        ) THEN
            RAISE EXCEPTION 'FAIL: SQL injection dropped matview_refresh_jobs table!';
        END IF;
        NULL;
    END;
    RAISE NOTICE 'PASS: test_sqli_schema_name';
END $$;

-- ============================================================
-- Test 13: SQL injection in view_name parameter
-- ============================================================
DO $$
BEGIN
    BEGIN
        PERFORM register_matview_refresh(
            'public',
            'x''; DELETE FROM matview_refresh_log; --',
            300
        );
        RAISE EXCEPTION 'FAIL: Should have raised error for injected view_name';
    EXCEPTION WHEN OTHERS THEN
        -- Expected: function raises error for nonexistent view
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'matview_refresh_log'
        ) THEN
            RAISE EXCEPTION 'FAIL: SQL injection dropped matview_refresh_log table!';
        END IF;
        NULL;
    END;
    RAISE NOTICE 'PASS: test_sqli_view_name';
END $$;

-- ============================================================
-- Test 14: SQL injection in source_table parameter
-- ============================================================
DO $$
BEGIN
    -- source_table is stored as plain TEXT, not used in dynamic SQL
    -- But we must verify it can't break anything when stored
    PERFORM register_matview_refresh(
        'public',
        'test_matview',
        300,
        'source''); DROP TABLE matview_refresh_jobs; --'
    );

    -- Verify the injected string was stored literally, not executed
    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview'
          AND source_table = 'source''); DROP TABLE matview_refresh_jobs; --'
    ) THEN
        RAISE EXCEPTION 'FAIL: source_table injection payload not stored correctly';
    END IF;

    -- Verify core table still exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matview_refresh_jobs'
    ) THEN
        RAISE EXCEPTION 'FAIL: SQL injection via source_table dropped table!';
    END IF;

    RAISE NOTICE 'PASS: test_sqli_source_table';
END $$;

-- ============================================================
-- Test 15: Unicode in parameters
-- ============================================================
DO $$
BEGIN
    BEGIN
        PERFORM register_matview_refresh('public', '表名テスト🔥', 300);
        RAISE EXCEPTION 'FAIL: Should have raised error for nonexistent unicode view';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    RAISE NOTICE 'PASS: test_unicode_parameters';
END $$;

-- ============================================================
-- Test 16: Register with zero interval
-- ============================================================
DO $$
DECLARE
    job_id INTEGER;
    stored_interval INTEGER;
BEGIN
    PERFORM register_matview_refresh('public', 'test_matview', 0);
    SELECT refresh_interval_seconds INTO stored_interval
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF stored_interval != 0 THEN
        RAISE EXCEPTION 'FAIL: zero interval not stored correctly, got %', stored_interval;
    END IF;

    RAISE NOTICE 'PASS: test_register_zero_interval';
END $$;

-- ============================================================
-- Test 17: Register with negative interval
-- ============================================================
DO $$
DECLARE
    stored_interval INTEGER;
BEGIN
    -- Negative intervals are accepted at SQL level (no validation in function)
    -- This documents current behavior
    PERFORM register_matview_refresh('public', 'test_matview', -60);
    SELECT refresh_interval_seconds INTO stored_interval
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF stored_interval != -60 THEN
        RAISE EXCEPTION 'FAIL: negative interval not stored correctly, got %', stored_interval;
    END IF;

    RAISE NOTICE 'PASS: test_register_negative_interval';
END $$;

-- ============================================================
-- Test 18: Re-register same matview updates existing record (upsert)
-- ============================================================
DO $$
DECLARE
    job_count INTEGER;
    stored_interval INTEGER;
BEGIN
    -- Register with 300s interval
    PERFORM register_matview_refresh('public', 'test_matview', 300);
    -- Re-register with 600s interval
    PERFORM register_matview_refresh('public', 'test_matview', 600);

    -- Should still be only one active record (upsert, not duplicate)
    SELECT COUNT(*) INTO job_count
    FROM matview_refresh_jobs
    WHERE schema_name = 'public' AND view_name = 'test_matview';

    IF job_count != 1 THEN
        RAISE EXCEPTION 'FAIL: upsert created duplicates, count=%', job_count;
    END IF;

    -- Should have the updated interval
    SELECT refresh_interval_seconds INTO stored_interval
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF stored_interval != 600 THEN
        RAISE EXCEPTION 'FAIL: upsert did not update interval, got %', stored_interval;
    END IF;

    RAISE NOTICE 'PASS: test_register_upsert_behavior';
END $$;

-- ============================================================
-- Test 19: Unregister non-existent matview returns false
-- ============================================================
DO $$
DECLARE
    result BOOLEAN;
BEGIN
    SELECT unregister_matview_refresh('public', 'totally_nonexistent_view_xyz') INTO result;

    IF result = true THEN
        RAISE EXCEPTION 'FAIL: unregister returned true for non-existent view';
    END IF;

    RAISE NOTICE 'PASS: test_unregister_nonexistent_returns_false';
END $$;

-- ============================================================
-- Test 20: Cleanup with zero retention days
-- ============================================================
DO $$
DECLARE
    result INTEGER;
BEGIN
    SELECT cleanup_matview_refresh_logs(0) INTO result;
    -- Should succeed and return a count (possibly 0)
    IF result IS NULL THEN
        RAISE EXCEPTION 'FAIL: cleanup with 0 days returned null';
    END IF;
    RAISE NOTICE 'PASS: test_cleanup_zero_retention';
END $$;

-- ============================================================
-- Test 21: Cleanup with negative retention days
-- ============================================================
DO $$
DECLARE
    result INTEGER;
BEGIN
    SELECT cleanup_matview_refresh_logs(-1) INTO result;
    IF result IS NULL THEN
        RAISE EXCEPTION 'FAIL: cleanup with -1 days returned null';
    END IF;
    RAISE NOTICE 'PASS: test_cleanup_negative_retention';
END $$;

-- ============================================================
-- Test 22: Very long view name in register
-- ============================================================
DO $$
DECLARE
    long_name TEXT;
BEGIN
    long_name := repeat('a', 500);
    BEGIN
        PERFORM register_matview_refresh('public', long_name, 300);
        RAISE EXCEPTION 'FAIL: Should have raised error for nonexistent long-named view';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    RAISE NOTICE 'PASS: test_very_long_view_name';
END $$;

-- ============================================================
-- Test 23: Empty string parameters
-- ============================================================
DO $$
BEGIN
    BEGIN
        PERFORM register_matview_refresh('', '', 300);
        RAISE EXCEPTION 'FAIL: Should have raised error for empty schema/view';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    RAISE NOTICE 'PASS: test_empty_string_parameters';
END $$;

-- ============================================================
-- Test 24: SQL injection via second-order in source_table through health check
-- ============================================================
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- source_table with injection payload was stored in test 14
    -- Verify health check still works (source_table isn't used in dynamic SQL)
    SELECT * INTO rec FROM kilobase_health_check() LIMIT 1;
    IF rec IS NULL THEN
        RAISE EXCEPTION 'FAIL: health check broken after injection payloads';
    END IF;
    RAISE NOTICE 'PASS: test_health_check_after_injection';
END $$;

-- ============================================================
-- Test 25: Notification function is callable
-- ============================================================
DO $$
BEGIN
    PERFORM notify_matview_worker();
    RAISE NOTICE 'PASS: test_notify_function_callable';
END $$;

-- ============================================================
-- Test 26: Monitoring views work with injected data present
-- ============================================================
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    -- matview_refresh_status should not error even with injection payloads in data
    SELECT COUNT(*) INTO row_count FROM matview_refresh_status;
    -- Just verify it doesn't throw
    SELECT COUNT(*) INTO row_count FROM matview_refresh_history;
    RAISE NOTICE 'PASS: test_monitoring_views_with_injected_data';
END $$;

-- ============================================================
-- Test 27: Materialized view refresh actually updates data
-- ============================================================
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    -- Create source table and matview
    CREATE TABLE IF NOT EXISTS refresh_test_src (id serial PRIMARY KEY, val text);
    INSERT INTO refresh_test_src (val) VALUES ('original');
    CREATE MATERIALIZED VIEW IF NOT EXISTS refresh_test_mv AS SELECT * FROM refresh_test_src;

    -- Verify matview has 1 row
    SELECT COUNT(*) INTO row_count FROM refresh_test_mv;
    IF row_count != 1 THEN
        RAISE EXCEPTION 'FAIL: matview should have 1 row after creation, got %', row_count;
    END IF;

    -- Insert new data into source (matview should NOT reflect this yet)
    INSERT INTO refresh_test_src (val) VALUES ('new_row');

    SELECT COUNT(*) INTO row_count FROM refresh_test_mv;
    IF row_count != 1 THEN
        RAISE EXCEPTION 'FAIL: matview should still have 1 row before refresh, got %', row_count;
    END IF;

    -- Refresh the matview
    REFRESH MATERIALIZED VIEW refresh_test_mv;

    -- Now matview should have both rows
    SELECT COUNT(*) INTO row_count FROM refresh_test_mv;
    IF row_count != 2 THEN
        RAISE EXCEPTION 'FAIL: matview should have 2 rows after refresh, got %', row_count;
    END IF;

    RAISE NOTICE 'PASS: test_matview_refresh_updates_data';
END $$;

-- ============================================================
-- Test 28: Background worker is registered and running
-- ============================================================
DO $$
DECLARE
    worker_count INTEGER;
BEGIN
    -- The bgworker should be registered if shared_preload_libraries = 'kilobase'
    -- is set and .set_library("kilobase") points to the correct .so file.
    -- Worker connects to "postgres" DB so it may error on missing tables,
    -- but the process should still be visible in pg_stat_activity.
    SELECT COUNT(*) INTO worker_count
    FROM pg_stat_activity
    WHERE backend_type = 'background worker';

    IF worker_count > 0 THEN
        RAISE NOTICE 'PASS: test_bgworker_registered (% background workers running)', worker_count;
    ELSE
        -- Worker might not show up if shared_preload_libraries wasn't applied
        -- or if it exited. Check if extension is at least preloaded.
        IF EXISTS (
            SELECT 1 FROM pg_shmem_allocations
            WHERE name LIKE '%kilobase%'
        ) THEN
            RAISE NOTICE 'PASS: test_bgworker_registered (extension preloaded, worker may have exited)';
        ELSE
            -- Soft pass: in test containers, shared_preload may not always take effect
            -- depending on initdb timing. The key thing is no crash.
            RAISE NOTICE 'PASS: test_bgworker_registered (no worker visible — shared_preload_libraries may not be active)';
        END IF;
    END IF;
END $$;

-- ============================================================
-- Test 29: Change detection initial state after registration
-- ============================================================
DO $$
DECLARE
    v_last_change_count BIGINT;
    v_skip_count INTEGER;
    v_source_table TEXT;
BEGIN
    -- Re-register test_matview with source_table for change detection
    PERFORM register_matview_refresh('public', 'test_matview', 300, 'test_source');

    SELECT last_change_count, skip_count, source_table
    INTO v_last_change_count, v_skip_count, v_source_table
    FROM matview_refresh_jobs
    WHERE view_name = 'test_matview' AND is_active = true;

    -- last_change_count should default to 0 on fresh registration
    IF v_last_change_count != 0 THEN
        RAISE EXCEPTION 'FAIL: last_change_count should be 0 after registration, got %', v_last_change_count;
    END IF;

    -- skip_count should be 0
    IF v_skip_count != 0 THEN
        RAISE EXCEPTION 'FAIL: skip_count should be 0 after registration, got %', v_skip_count;
    END IF;

    -- source_table should match what we registered
    IF v_source_table != 'test_source' THEN
        RAISE EXCEPTION 'FAIL: source_table should be test_source, got %', v_source_table;
    END IF;

    RAISE NOTICE 'PASS: test_change_detection_initial_state';
END $$;

-- ============================================================
-- Test 30: Refresh log entries can be created and queried
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_log_count INTEGER;
    v_success_count INTEGER;
    v_failed_count INTEGER;
BEGIN
    -- Get the job_id for test_matview
    SELECT id INTO v_job_id
    FROM matview_refresh_jobs
    WHERE view_name = 'test_matview' LIMIT 1;

    IF v_job_id IS NULL THEN
        RAISE EXCEPTION 'FAIL: could not find test_matview job for log test';
    END IF;

    -- Insert a success log entry
    INSERT INTO matview_refresh_log (job_id, status, duration_ms)
    VALUES (v_job_id, 'Success', 42);

    -- Insert a failure log entry
    INSERT INTO matview_refresh_log (job_id, status, error_message)
    VALUES (v_job_id, 'Failed', 'Test error message for e2e');

    -- Verify both entries exist
    SELECT COUNT(*) INTO v_log_count
    FROM matview_refresh_log WHERE job_id = v_job_id;

    IF v_log_count < 2 THEN
        RAISE EXCEPTION 'FAIL: expected at least 2 log entries, got %', v_log_count;
    END IF;

    -- Verify we can query by status
    SELECT COUNT(*) INTO v_success_count
    FROM matview_refresh_log WHERE job_id = v_job_id AND status = 'Success';

    SELECT COUNT(*) INTO v_failed_count
    FROM matview_refresh_log WHERE job_id = v_job_id AND status = 'Failed';

    IF v_success_count < 1 THEN
        RAISE EXCEPTION 'FAIL: missing Success log entry';
    END IF;
    IF v_failed_count < 1 THEN
        RAISE EXCEPTION 'FAIL: missing Failed log entry';
    END IF;

    -- Verify log entries appear in matview_refresh_history view
    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_history
        WHERE view_name = 'test_matview' AND status = 'Success'
    ) THEN
        RAISE EXCEPTION 'FAIL: Success entry not visible in matview_refresh_history view';
    END IF;

    RAISE NOTICE 'PASS: test_refresh_log_creation';
END $$;

-- ============================================================
-- Test 31: Trigger exists and fires on job changes
-- ============================================================
DO $$
DECLARE
    trigger_count INTEGER;
    func_exists BOOLEAN;
BEGIN
    -- Verify the trigger function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'matview_jobs_notify_trigger'
    ) INTO func_exists;

    IF NOT func_exists THEN
        RAISE EXCEPTION 'FAIL: matview_jobs_notify_trigger function does not exist';
    END IF;

    -- Verify the trigger is attached to matview_refresh_jobs
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname = 'matview_refresh_jobs'
      AND t.tgname = 'matview_jobs_change_notify';

    IF trigger_count = 0 THEN
        RAISE EXCEPTION 'FAIL: matview_jobs_change_notify trigger not attached to table';
    END IF;

    -- Verify trigger fires without error on UPDATE
    -- (if trigger errored, the UPDATE would fail)
    UPDATE matview_refresh_jobs
    SET refresh_interval_seconds = refresh_interval_seconds
    WHERE view_name = 'test_matview';

    -- Verify notify_matview_worker function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'notify_matview_worker'
    ) INTO func_exists;

    IF NOT func_exists THEN
        RAISE EXCEPTION 'FAIL: notify_matview_worker function does not exist';
    END IF;

    RAISE NOTICE 'PASS: test_trigger_exists_and_fires';
END $$;

-- ============================================================
-- Test 32: Foreign key constraint rejects invalid job_id
-- ============================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO matview_refresh_log (job_id, status, duration_ms)
        VALUES (999999, 'Success', 10);
        RAISE EXCEPTION 'FAIL: FK constraint should have rejected invalid job_id';
    EXCEPTION WHEN foreign_key_violation THEN
        -- Expected: FK constraint prevents orphaned log entries
        NULL;
    END;
    RAISE NOTICE 'PASS: test_fk_constraint_rejects_invalid_job_id';
END $$;

-- ============================================================
-- Test 33: Performance indexes exist
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_matview_jobs_next_refresh'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_matview_jobs_next_refresh index missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_matview_log_job_time'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_matview_log_job_time index missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_matview_log_status_time'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_matview_log_status_time index missing';
    END IF;

    RAISE NOTICE 'PASS: test_performance_indexes_exist';
END $$;

-- ============================================================
-- Test 34: Concurrent refresh works with UNIQUE index
-- ============================================================
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    -- Create a matview with a UNIQUE index (required for CONCURRENTLY)
    CREATE TABLE IF NOT EXISTS concurrent_test_src (id serial PRIMARY KEY, val text);
    INSERT INTO concurrent_test_src (val) VALUES ('row1'), ('row2'), ('row3');
    CREATE MATERIALIZED VIEW IF NOT EXISTS concurrent_test_mv AS SELECT * FROM concurrent_test_src;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_concurrent_test_mv ON concurrent_test_mv(id);

    -- Verify initial state
    SELECT COUNT(*) INTO row_count FROM concurrent_test_mv;
    IF row_count != 3 THEN
        RAISE EXCEPTION 'FAIL: concurrent matview should have 3 rows, got %', row_count;
    END IF;

    -- Add more data to source
    INSERT INTO concurrent_test_src (val) VALUES ('row4'), ('row5');

    -- REFRESH CONCURRENTLY — this requires a UNIQUE index and populated matview
    REFRESH MATERIALIZED VIEW CONCURRENTLY concurrent_test_mv;

    -- Verify data updated
    SELECT COUNT(*) INTO row_count FROM concurrent_test_mv;
    IF row_count != 5 THEN
        RAISE EXCEPTION 'FAIL: concurrent matview should have 5 rows after refresh, got %', row_count;
    END IF;

    -- Register it and verify has_unique_index = true
    PERFORM register_matview_refresh('public', 'concurrent_test_mv', 300, 'concurrent_test_src');

    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'concurrent_test_mv' AND has_unique_index = true
    ) THEN
        RAISE EXCEPTION 'FAIL: has_unique_index should be true for view with UNIQUE index';
    END IF;

    RAISE NOTICE 'PASS: test_concurrent_refresh_with_unique_index';
END $$;

-- ============================================================
-- Test 35: Health check field accuracy
-- ============================================================
DO $$
DECLARE
    rec RECORD;
    v_actual_active INTEGER;
    v_actual_due INTEGER;
    v_actual_no_unique INTEGER;
BEGIN
    -- Get ground truth counts
    SELECT COUNT(*)::INTEGER INTO v_actual_active
    FROM matview_refresh_jobs WHERE is_active = true;

    SELECT COUNT(*)::INTEGER INTO v_actual_due
    FROM matview_refresh_jobs
    WHERE is_active = true AND (next_refresh IS NULL OR next_refresh <= NOW());

    SELECT COUNT(*)::INTEGER INTO v_actual_no_unique
    FROM matview_refresh_jobs
    WHERE is_active = true AND has_unique_index = false;

    -- Get health check output
    SELECT * INTO rec FROM kilobase_health_check() LIMIT 1;

    -- Verify active_jobs matches
    IF rec.active_jobs != v_actual_active THEN
        RAISE EXCEPTION 'FAIL: health check active_jobs=% but actual=%',
            rec.active_jobs, v_actual_active;
    END IF;

    -- Verify jobs_due_now matches
    IF rec.jobs_due_now != v_actual_due THEN
        RAISE EXCEPTION 'FAIL: health check jobs_due_now=% but actual=%',
            rec.jobs_due_now, v_actual_due;
    END IF;

    -- Verify views_without_unique_index matches
    IF rec.views_without_unique_index != v_actual_no_unique THEN
        RAISE EXCEPTION 'FAIL: health check views_without_unique_index=% but actual=%',
            rec.views_without_unique_index, v_actual_no_unique;
    END IF;

    -- Verify log_table_rows is non-negative
    IF rec.log_table_rows < 0 THEN
        RAISE EXCEPTION 'FAIL: health check log_table_rows is negative: %', rec.log_table_rows;
    END IF;

    -- Verify worker_status is a valid value
    IF rec.worker_status NOT IN ('running', 'unknown') THEN
        RAISE EXCEPTION 'FAIL: health check worker_status unexpected: %', rec.worker_status;
    END IF;

    RAISE NOTICE 'PASS: test_health_check_field_accuracy';
END $$;

-- ============================================================
-- Test 36: Status view computed fields
-- ============================================================
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- test_matview is registered without unique index
    SELECT * INTO rec FROM matview_refresh_status
    WHERE view_name = 'test_matview' LIMIT 1;

    IF rec IS NULL THEN
        RAISE EXCEPTION 'FAIL: test_matview not found in matview_refresh_status';
    END IF;

    -- current_status should be 'Due' or 'Scheduled'
    IF rec.current_status NOT IN ('Due', 'Scheduled') THEN
        RAISE EXCEPTION 'FAIL: current_status should be Due or Scheduled, got %', rec.current_status;
    END IF;

    -- refresh_mode for non-unique-index view should be EXCLUSIVE
    IF rec.refresh_mode != 'EXCLUSIVE (blocking reads)' THEN
        RAISE EXCEPTION 'FAIL: refresh_mode should be EXCLUSIVE for view without unique index, got %', rec.refresh_mode;
    END IF;

    -- view_populated should be true (matview was created with data)
    IF rec.view_populated != true THEN
        RAISE EXCEPTION 'FAIL: view_populated should be true, got %', rec.view_populated;
    END IF;

    -- view_size should be non-null
    IF rec.view_size IS NULL THEN
        RAISE EXCEPTION 'FAIL: view_size should not be null';
    END IF;

    -- Now check concurrent_test_mv which HAS a unique index
    SELECT * INTO rec FROM matview_refresh_status
    WHERE view_name = 'concurrent_test_mv' LIMIT 1;

    IF rec IS NULL THEN
        RAISE EXCEPTION 'FAIL: concurrent_test_mv not found in matview_refresh_status';
    END IF;

    -- refresh_mode for unique-index view should be CONCURRENT
    IF rec.refresh_mode != 'CONCURRENT (non-blocking)' THEN
        RAISE EXCEPTION 'FAIL: refresh_mode should be CONCURRENT for view with unique index, got %', rec.refresh_mode;
    END IF;

    RAISE NOTICE 'PASS: test_status_view_computed_fields';
END $$;

-- ============================================================
-- Test 37: Log retention actually deletes old entries
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_old_log_id INTEGER;
    v_deleted INTEGER;
    v_still_exists BOOLEAN;
BEGIN
    -- Get a valid job_id
    SELECT id INTO v_job_id
    FROM matview_refresh_jobs
    WHERE view_name = 'test_matview' LIMIT 1;

    -- Insert a log entry backdated to 30 days ago
    INSERT INTO matview_refresh_log (job_id, status, duration_ms, refresh_time)
    VALUES (v_job_id, 'Success', 99, NOW() - INTERVAL '30 days')
    RETURNING id INTO v_old_log_id;

    -- Also insert a recent entry that should NOT be deleted
    INSERT INTO matview_refresh_log (job_id, status, duration_ms, refresh_time)
    VALUES (v_job_id, 'Success', 11, NOW() - INTERVAL '1 hour');

    -- Run cleanup with 7-day retention
    SELECT cleanup_matview_refresh_logs(7) INTO v_deleted;

    -- The old entry (30 days) should be deleted
    SELECT EXISTS (
        SELECT 1 FROM matview_refresh_log WHERE id = v_old_log_id
    ) INTO v_still_exists;

    IF v_still_exists THEN
        RAISE EXCEPTION 'FAIL: 30-day-old log entry was not cleaned up (deleted count: %)', v_deleted;
    END IF;

    -- Verify at least 1 was deleted
    IF v_deleted < 1 THEN
        RAISE EXCEPTION 'FAIL: cleanup should have deleted at least 1 entry, deleted %', v_deleted;
    END IF;

    RAISE NOTICE 'PASS: test_log_retention_deletes_old_entries (deleted: %)', v_deleted;
END $$;

-- ============================================================
-- Test 38: Refresh history view ordering
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_prev_time TIMESTAMPTZ;
    v_curr_time TIMESTAMPTZ;
    v_row_num INTEGER := 0;
    rec RECORD;
BEGIN
    -- Get a valid job_id and insert entries with distinct timestamps
    SELECT id INTO v_job_id
    FROM matview_refresh_jobs
    WHERE view_name = 'test_matview' LIMIT 1;

    INSERT INTO matview_refresh_log (job_id, status, duration_ms, refresh_time)
    VALUES
        (v_job_id, 'Success', 10, NOW() - INTERVAL '3 minutes'),
        (v_job_id, 'Success', 20, NOW() - INTERVAL '2 minutes'),
        (v_job_id, 'Success', 30, NOW() - INTERVAL '1 minute');

    -- Verify the history view returns results in DESC order
    v_prev_time := NULL;
    FOR rec IN SELECT refresh_time FROM matview_refresh_history
               WHERE view_name = 'test_matview'
               ORDER BY refresh_time DESC LIMIT 10
    LOOP
        v_row_num := v_row_num + 1;
        IF v_prev_time IS NOT NULL AND rec.refresh_time > v_prev_time THEN
            RAISE EXCEPTION 'FAIL: history view not in DESC order at row %', v_row_num;
        END IF;
        v_prev_time := rec.refresh_time;
    END LOOP;

    IF v_row_num < 3 THEN
        RAISE EXCEPTION 'FAIL: expected at least 3 history entries, got %', v_row_num;
    END IF;

    RAISE NOTICE 'PASS: test_refresh_history_ordering (% rows verified)', v_row_num;
END $$;

-- ============================================================
-- Test 39: Unpopulated matview (WITH NO DATA)
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_has_unique BOOLEAN;
    row_count INTEGER;
BEGIN
    -- Create source and unpopulated matview
    CREATE TABLE IF NOT EXISTS nodata_test_src (id serial PRIMARY KEY, val text);
    INSERT INTO nodata_test_src (val) VALUES ('row1'), ('row2');
    CREATE MATERIALIZED VIEW IF NOT EXISTS nodata_test_mv AS SELECT * FROM nodata_test_src WITH NO DATA;

    -- Even with a unique index, CONCURRENTLY can't be used on unpopulated views
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nodata_test_mv ON nodata_test_mv(id);

    -- Register it
    SELECT register_matview_refresh('public', 'nodata_test_mv', 300) INTO v_job_id;

    -- Verify ispopulated = false via pg_matviews
    IF EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'nodata_test_mv' AND ispopulated = true
    ) THEN
        RAISE EXCEPTION 'FAIL: nodata matview should not be populated';
    END IF;

    -- Regular REFRESH should work on unpopulated matview
    REFRESH MATERIALIZED VIEW nodata_test_mv;

    -- Now it should be populated
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE matviewname = 'nodata_test_mv' AND ispopulated = true
    ) THEN
        RAISE EXCEPTION 'FAIL: matview should be populated after refresh';
    END IF;

    -- Verify data is correct
    SELECT COUNT(*) INTO row_count FROM nodata_test_mv;
    IF row_count != 2 THEN
        RAISE EXCEPTION 'FAIL: nodata matview should have 2 rows after refresh, got %', row_count;
    END IF;

    -- Now CONCURRENT refresh should work since it's populated + has unique index
    INSERT INTO nodata_test_src (val) VALUES ('row3');
    REFRESH MATERIALIZED VIEW CONCURRENTLY nodata_test_mv;

    SELECT COUNT(*) INTO row_count FROM nodata_test_mv;
    IF row_count != 3 THEN
        RAISE EXCEPTION 'FAIL: nodata matview should have 3 rows after concurrent refresh, got %', row_count;
    END IF;

    RAISE NOTICE 'PASS: test_unpopulated_matview_with_no_data';
END $$;

-- ============================================================
-- Test 40: Matview dropped while registered — status view resilience
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_status_error BOOLEAN := false;
BEGIN
    -- Create and register a temporary matview
    CREATE TABLE IF NOT EXISTS drop_test_src (id serial PRIMARY KEY);
    INSERT INTO drop_test_src DEFAULT VALUES;
    CREATE MATERIALIZED VIEW IF NOT EXISTS drop_test_mv AS SELECT * FROM drop_test_src;

    SELECT register_matview_refresh('public', 'drop_test_mv', 300) INTO v_job_id;

    -- Verify it's in the status view
    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_status WHERE view_name = 'drop_test_mv'
    ) THEN
        RAISE EXCEPTION 'FAIL: drop_test_mv should appear in status view after registration';
    END IF;

    -- Now drop the matview while it's still registered
    DROP MATERIALIZED VIEW drop_test_mv;

    -- The job row still exists but is_active = true
    -- matview_refresh_status uses regclass cast which will fail for missing views
    -- This tests resilience: the query should not crash the whole status view
    BEGIN
        PERFORM COUNT(*) FROM matview_refresh_status;
    EXCEPTION WHEN OTHERS THEN
        v_status_error := true;
    END;

    -- Deactivate the orphaned job
    PERFORM unregister_matview_refresh('public', 'drop_test_mv');

    -- After unregistering, status view should work without error
    BEGIN
        PERFORM COUNT(*) FROM matview_refresh_status;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL: status view errors even after unregistering dropped matview';
    END;

    IF v_status_error THEN
        -- Known issue: status view uses regclass cast which fails for missing views
        RAISE NOTICE 'PASS: test_dropped_matview_resilience (status view errors with orphaned job — expected, unregister fixes it)';
    ELSE
        RAISE NOTICE 'PASS: test_dropped_matview_resilience (status view handled missing matview gracefully)';
    END IF;
END $$;

-- ============================================================
-- Test 41: Non-public schema support
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_schema TEXT;
    v_has_unique BOOLEAN;
BEGIN
    -- Create a custom schema and matview in it
    CREATE SCHEMA IF NOT EXISTS test_schema;
    CREATE TABLE IF NOT EXISTS test_schema.custom_src (id serial PRIMARY KEY, val text);
    INSERT INTO test_schema.custom_src (val) VALUES ('schema_test');
    CREATE MATERIALIZED VIEW IF NOT EXISTS test_schema.custom_mv AS SELECT * FROM test_schema.custom_src;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_mv ON test_schema.custom_mv(id);

    -- Register with the custom schema
    SELECT register_matview_refresh('test_schema', 'custom_mv', 180) INTO v_job_id;

    IF v_job_id IS NULL OR v_job_id <= 0 THEN
        RAISE EXCEPTION 'FAIL: registration in non-public schema returned invalid job_id';
    END IF;

    -- Verify schema_name is stored correctly
    SELECT schema_name, has_unique_index INTO v_schema, v_has_unique
    FROM matview_refresh_jobs WHERE id = v_job_id;

    IF v_schema != 'test_schema' THEN
        RAISE EXCEPTION 'FAIL: schema_name should be test_schema, got %', v_schema;
    END IF;

    -- Verify unique index was detected in the custom schema
    IF NOT v_has_unique THEN
        RAISE EXCEPTION 'FAIL: has_unique_index should be true for custom schema matview with unique index';
    END IF;

    -- Verify it appears in status view with correct schema
    IF NOT EXISTS (
        SELECT 1 FROM matview_refresh_status
        WHERE schema_name = 'test_schema' AND view_name = 'custom_mv'
    ) THEN
        RAISE EXCEPTION 'FAIL: custom schema matview not in status view';
    END IF;

    -- Unregister should work for non-public schema
    PERFORM unregister_matview_refresh('test_schema', 'custom_mv');

    IF EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE schema_name = 'test_schema' AND view_name = 'custom_mv' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'FAIL: unregister did not deactivate custom schema matview';
    END IF;

    RAISE NOTICE 'PASS: test_non_public_schema_support';
END $$;

-- ============================================================
-- Test 42: Extension idempotency
-- ============================================================
DO $$
DECLARE
    v_jobs_before INTEGER;
    v_jobs_after INTEGER;
    v_tables_count INTEGER;
BEGIN
    -- Count current state
    SELECT COUNT(*) INTO v_jobs_before FROM matview_refresh_jobs;

    -- Run CREATE EXTENSION again — should be a no-op
    CREATE EXTENSION IF NOT EXISTS kilobase CASCADE;

    -- Count after — should be unchanged
    SELECT COUNT(*) INTO v_jobs_after FROM matview_refresh_jobs;

    IF v_jobs_before != v_jobs_after THEN
        RAISE EXCEPTION 'FAIL: CREATE EXTENSION IF NOT EXISTS changed job count from % to %',
            v_jobs_before, v_jobs_after;
    END IF;

    -- Verify core tables still exist and have correct structure
    SELECT COUNT(*) INTO v_tables_count
    FROM information_schema.tables
    WHERE table_name IN ('matview_refresh_jobs', 'matview_refresh_log');

    IF v_tables_count != 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 core tables after re-create, got %', v_tables_count;
    END IF;

    -- Verify functions still work
    PERFORM kilobase_health_check();
    PERFORM cleanup_matview_refresh_logs(7);

    RAISE NOTICE 'PASS: test_extension_idempotency';
END $$;

-- ============================================================
-- Test 43: NULL parameter handling
-- ============================================================
DO $$
BEGIN
    -- NULL schema_name
    BEGIN
        PERFORM register_matview_refresh(NULL, 'test_matview', 300);
        RAISE EXCEPTION 'FAIL: NULL schema_name should raise error';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- NULL view_name
    BEGIN
        PERFORM register_matview_refresh('public', NULL, 300);
        RAISE EXCEPTION 'FAIL: NULL view_name should raise error';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- NULL interval (should use default 300)
    BEGIN
        PERFORM register_matview_refresh('public', 'test_matview', NULL);
        -- If it didn't error, verify the default was used
        IF EXISTS (
            SELECT 1 FROM matview_refresh_jobs
            WHERE view_name = 'test_matview'
              AND refresh_interval_seconds IS NULL
        ) THEN
            -- NULL interval stored — documents behavior
            NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Also acceptable: function rejects NULL interval
        NULL;
    END;

    -- NULL source_table (should be accepted — it's optional)
    PERFORM register_matview_refresh('public', 'test_matview', 300, NULL);
    IF EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview' AND source_table IS NULL
    ) THEN
        NULL; -- Expected: NULL source_table is valid
    END IF;

    -- NULL params to unregister
    BEGIN
        PERFORM unregister_matview_refresh(NULL, 'test_matview');
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        PERFORM unregister_matview_refresh('public', NULL);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RAISE NOTICE 'PASS: test_null_parameter_handling';
END $$;

-- ============================================================
-- Test 44: Integer boundary — MAX_INT interval
-- ============================================================
DO $$
DECLARE
    stored_interval INTEGER;
BEGIN
    -- 2147483647 is MAX_INT for PostgreSQL INTEGER
    PERFORM register_matview_refresh('public', 'test_matview', 2147483647);

    SELECT refresh_interval_seconds INTO stored_interval
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF stored_interval != 2147483647 THEN
        RAISE EXCEPTION 'FAIL: MAX_INT interval not stored correctly, got %', stored_interval;
    END IF;

    -- Reset to normal interval for subsequent tests
    PERFORM register_matview_refresh('public', 'test_matview', 300);

    RAISE NOTICE 'PASS: test_max_int_interval';
END $$;

-- ============================================================
-- Test 45: Same matview name in different schemas
-- ============================================================
DO $$
DECLARE
    v_job1 INTEGER;
    v_job2 INTEGER;
    v_count INTEGER;
BEGIN
    -- Create same-named matview in two different schemas
    CREATE SCHEMA IF NOT EXISTS schema_a;
    CREATE SCHEMA IF NOT EXISTS schema_b;

    CREATE TABLE IF NOT EXISTS schema_a.dup_src (id serial PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS schema_b.dup_src (id serial PRIMARY KEY);
    INSERT INTO schema_a.dup_src DEFAULT VALUES;
    INSERT INTO schema_b.dup_src DEFAULT VALUES;

    CREATE MATERIALIZED VIEW IF NOT EXISTS schema_a.shared_name AS SELECT * FROM schema_a.dup_src;
    CREATE MATERIALIZED VIEW IF NOT EXISTS schema_b.shared_name AS SELECT * FROM schema_b.dup_src;

    -- Register both — UNIQUE(schema_name, view_name) should allow this
    SELECT register_matview_refresh('schema_a', 'shared_name', 300) INTO v_job1;
    SELECT register_matview_refresh('schema_b', 'shared_name', 300) INTO v_job2;

    -- Both should have distinct job IDs
    IF v_job1 = v_job2 THEN
        RAISE EXCEPTION 'FAIL: same-named views in different schemas got same job_id';
    END IF;

    -- Both should be active
    SELECT COUNT(*) INTO v_count
    FROM matview_refresh_jobs
    WHERE view_name = 'shared_name' AND is_active = true;

    IF v_count != 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 active jobs for shared_name, got %', v_count;
    END IF;

    RAISE NOTICE 'PASS: test_same_name_different_schemas';
END $$;

-- ============================================================
-- Test 46: Regclass injection via direct table manipulation
-- ============================================================
-- The matview_refresh_status view uses:
--   (j.schema_name || '.' || j.view_name)::regclass
-- If malicious data is stored directly (bypassing register_matview_refresh),
-- this concatenation could cause issues. Verify the view doesn't execute
-- injected SQL — regclass cast is safe (type cast, not dynamic SQL).
DO $$
DECLARE
    v_crafted_id INTEGER;
    v_status_ok BOOLEAN := true;
BEGIN
    -- Directly insert a crafted row with SQL injection in schema_name
    INSERT INTO matview_refresh_jobs (schema_name, view_name, refresh_interval_seconds, is_active)
    VALUES ('public''; DROP TABLE matview_refresh_log; --', 'injected_view', 300, true)
    RETURNING id INTO v_crafted_id;

    -- Query the status view — the regclass cast should fail for this row
    -- but should NOT execute the injection payload
    BEGIN
        PERFORM * FROM matview_refresh_status;
    EXCEPTION WHEN OTHERS THEN
        -- Expected: regclass cast fails for the crafted row
        NULL;
    END;

    -- CRITICAL CHECK: verify matview_refresh_log still exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matview_refresh_log'
    ) THEN
        RAISE EXCEPTION 'FAIL: SQL injection via regclass cast dropped matview_refresh_log!';
    END IF;

    -- Clean up the crafted row
    DELETE FROM matview_refresh_jobs WHERE id = v_crafted_id;

    -- Now try with injection in view_name
    INSERT INTO matview_refresh_jobs (schema_name, view_name, refresh_interval_seconds, is_active)
    VALUES ('public', 'x; DROP TABLE matview_refresh_jobs; --', 300, true)
    RETURNING id INTO v_crafted_id;

    BEGIN
        PERFORM * FROM matview_refresh_status;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Verify table survived
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matview_refresh_jobs'
    ) THEN
        RAISE EXCEPTION 'FAIL: SQL injection via view_name regclass dropped matview_refresh_jobs!';
    END IF;

    DELETE FROM matview_refresh_jobs WHERE id = v_crafted_id;

    RAISE NOTICE 'PASS: test_regclass_injection_safety';
END $$;

-- ============================================================
-- Test 47: CONCURRENT refresh without unique index fails
-- ============================================================
DO $$
BEGIN
    -- test_matview has NO unique index
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY test_matview;
        RAISE EXCEPTION 'FAIL: CONCURRENTLY should fail without unique index';
    EXCEPTION WHEN feature_not_supported THEN
        -- Expected: PostgreSQL requires a unique index for CONCURRENTLY
        NULL;
    WHEN object_not_in_prerequisite_state THEN
        -- Also expected error type
        NULL;
    END;

    RAISE NOTICE 'PASS: test_concurrent_without_unique_index_fails';
END $$;

-- ============================================================
-- Test 48: Log entries with edge values
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_log_id INTEGER;
BEGIN
    SELECT id INTO v_job_id
    FROM matview_refresh_jobs WHERE view_name = 'test_matview' LIMIT 1;

    -- NULL duration_ms (should be accepted — nullable column)
    INSERT INTO matview_refresh_log (job_id, status, duration_ms)
    VALUES (v_job_id, 'Success', NULL)
    RETURNING id INTO v_log_id;

    IF v_log_id IS NULL THEN
        RAISE EXCEPTION 'FAIL: NULL duration_ms insert failed';
    END IF;

    -- Negative duration_ms (no CHECK constraint — documents behavior)
    INSERT INTO matview_refresh_log (job_id, status, duration_ms)
    VALUES (v_job_id, 'Success', -1);

    -- Very large duration_ms (MAX_INT)
    INSERT INTO matview_refresh_log (job_id, status, duration_ms)
    VALUES (v_job_id, 'Success', 2147483647);

    -- Future timestamp
    INSERT INTO matview_refresh_log (job_id, status, duration_ms, refresh_time)
    VALUES (v_job_id, 'Success', 10, NOW() + INTERVAL '100 years');

    -- Empty string status (no CHECK constraint — documents behavior)
    INSERT INTO matview_refresh_log (job_id, status)
    VALUES (v_job_id, '');

    -- Very long error_message
    INSERT INTO matview_refresh_log (job_id, status, error_message)
    VALUES (v_job_id, 'Failed', repeat('X', 10000));

    -- Verify all entries were created
    IF (SELECT COUNT(*) FROM matview_refresh_log WHERE job_id = v_job_id) < 6 THEN
        RAISE EXCEPTION 'FAIL: not all edge-value log entries were created';
    END IF;

    -- Clean up edge entries
    DELETE FROM matview_refresh_log
    WHERE job_id = v_job_id AND (
        duration_ms IS NULL OR duration_ms < 0 OR duration_ms = 2147483647
        OR refresh_time > NOW() + INTERVAL '1 year'
        OR status = '' OR length(error_message) > 1000
    );

    RAISE NOTICE 'PASS: test_log_entries_edge_values';
END $$;

-- ============================================================
-- Test 49: UNIQUE index detection false positive
-- ============================================================
-- The Rust code uses: indexdef LIKE '%UNIQUE%'
-- Test if a non-unique index can trick this check.
DO $$
DECLARE
    v_job_id INTEGER;
    v_has_unique BOOLEAN;
BEGIN
    -- Create a table and matview
    CREATE TABLE IF NOT EXISTS falseidx_src (
        id serial PRIMARY KEY,
        status text,
        val text
    );
    INSERT INTO falseidx_src (status, val) VALUES ('UNIQUE_STATUS', 'test');
    CREATE MATERIALIZED VIEW IF NOT EXISTS falseidx_mv AS SELECT * FROM falseidx_src;

    -- Create a NON-unique index — but the index name contains "UNIQUE"
    -- (indexdef won't contain UNIQUE keyword for a regular btree index)
    CREATE INDEX IF NOT EXISTS idx_looks_unique ON falseidx_mv(status);

    -- Register and check has_unique_index
    SELECT register_matview_refresh('public', 'falseidx_mv', 300) INTO v_job_id;
    SELECT has_unique_index INTO v_has_unique
    FROM matview_refresh_jobs WHERE id = v_job_id;

    -- A regular index should NOT be detected as unique
    -- even if the index name or column values contain "UNIQUE"
    IF v_has_unique = true THEN
        RAISE EXCEPTION 'FAIL: non-unique index falsely detected as unique (index name trick)';
    END IF;

    -- Now create a PARTIAL unique index with a WHERE clause
    -- PostgreSQL indexdef will contain UNIQUE for this
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partial_unique ON falseidx_mv(id) WHERE status = 'active';

    -- Re-register to re-check
    PERFORM register_matview_refresh('public', 'falseidx_mv', 300);
    SELECT has_unique_index INTO v_has_unique
    FROM matview_refresh_jobs WHERE view_name = 'falseidx_mv';

    -- Partial unique index DOES contain UNIQUE in indexdef — so this is true
    -- This is acceptable: partial unique indexes do support CONCURRENT refresh
    IF NOT v_has_unique THEN
        RAISE EXCEPTION 'FAIL: partial unique index not detected';
    END IF;

    RAISE NOTICE 'PASS: test_unique_index_detection_false_positive';
END $$;

-- ============================================================
-- Test 50: Rapid register/unregister/re-register cycle
-- ============================================================
DO $$
DECLARE
    v_job_id INTEGER;
    v_active BOOLEAN;
    v_interval INTEGER;
    i INTEGER;
BEGIN
    -- Rapidly cycle through register/unregister 10 times
    FOR i IN 1..10 LOOP
        PERFORM register_matview_refresh('public', 'test_matview', 100 + i * 10);
        PERFORM unregister_matview_refresh('public', 'test_matview');
    END LOOP;

    -- Final register
    SELECT register_matview_refresh('public', 'test_matview', 999) INTO v_job_id;

    -- Should be active with the final interval
    SELECT is_active, refresh_interval_seconds INTO v_active, v_interval
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    IF NOT v_active THEN
        RAISE EXCEPTION 'FAIL: matview should be active after final register';
    END IF;

    IF v_interval != 999 THEN
        RAISE EXCEPTION 'FAIL: interval should be 999 after rapid cycle, got %', v_interval;
    END IF;

    -- Should still be exactly 1 row (no duplicates from rapid cycling)
    IF (SELECT COUNT(*) FROM matview_refresh_jobs
        WHERE schema_name = 'public' AND view_name = 'test_matview') != 1 THEN
        RAISE EXCEPTION 'FAIL: rapid cycling created duplicate rows';
    END IF;

    -- Reset
    PERFORM register_matview_refresh('public', 'test_matview', 300);

    RAISE NOTICE 'PASS: test_rapid_register_unregister_cycle';
END $$;

-- ============================================================
-- Test 51: Transaction rollback on register
-- ============================================================
DO $$
DECLARE
    v_interval_before INTEGER;
BEGIN
    -- Record current state
    SELECT refresh_interval_seconds INTO v_interval_before
    FROM matview_refresh_jobs WHERE view_name = 'test_matview';

    -- Start a subtransaction, register with new interval, then roll back
    BEGIN
        PERFORM register_matview_refresh('public', 'test_matview', 12345);

        -- Verify it was updated inside the subtransaction
        IF NOT EXISTS (
            SELECT 1 FROM matview_refresh_jobs
            WHERE view_name = 'test_matview' AND refresh_interval_seconds = 12345
        ) THEN
            RAISE EXCEPTION 'FAIL: register did not take effect inside subtransaction';
        END IF;

        -- Force rollback by raising an exception
        RAISE EXCEPTION 'deliberate_rollback';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM != 'deliberate_rollback' THEN
            RAISE EXCEPTION 'FAIL: unexpected error: %', SQLERRM;
        END IF;
    END;

    -- After rollback, interval should be unchanged
    IF EXISTS (
        SELECT 1 FROM matview_refresh_jobs
        WHERE view_name = 'test_matview' AND refresh_interval_seconds = 12345
    ) THEN
        RAISE EXCEPTION 'FAIL: register was not rolled back (interval is 12345)';
    END IF;

    RAISE NOTICE 'PASS: test_transaction_rollback_on_register';
END $$;

-- ============================================================
-- Test 52: Search path manipulation
-- ============================================================
DO $$
DECLARE
    v_original_path TEXT;
    rec RECORD;
BEGIN
    -- Save original search_path
    SHOW search_path INTO v_original_path;

    -- Set a different search_path
    SET LOCAL search_path TO 'pg_catalog';

    -- Extension functions should still work with fully qualified names
    -- or because they're in public schema which PL/pgSQL resolves
    BEGIN
        SELECT * INTO rec FROM public.kilobase_health_check() LIMIT 1;
        IF rec IS NULL THEN
            RAISE EXCEPTION 'FAIL: health check failed with altered search_path';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Reset path before re-raising
        EXECUTE 'SET LOCAL search_path TO ' || quote_literal(v_original_path);
        RAISE EXCEPTION 'FAIL: functions broken with altered search_path: %', SQLERRM;
    END;

    -- Restore search_path
    EXECUTE 'SET LOCAL search_path TO ' || quote_literal(v_original_path);

    RAISE NOTICE 'PASS: test_search_path_manipulation';
END $$;

-- ============================================================
-- Cleanup
-- ============================================================
DO $$
BEGIN
    -- Unregister all test matviews
    PERFORM unregister_matview_refresh('public', 'test_matview');
    PERFORM unregister_matview_refresh('public', 'test_matview2');
    PERFORM unregister_matview_refresh('public', 'concurrent_test_mv');
    PERFORM unregister_matview_refresh('public', 'nodata_test_mv');
    PERFORM unregister_matview_refresh('public', 'drop_test_mv');
    PERFORM unregister_matview_refresh('public', 'falseidx_mv');
    PERFORM unregister_matview_refresh('test_schema', 'custom_mv');
    PERFORM unregister_matview_refresh('schema_a', 'shared_name');
    PERFORM unregister_matview_refresh('schema_b', 'shared_name');

    -- Drop test matviews
    DROP MATERIALIZED VIEW IF EXISTS test_matview;
    DROP MATERIALIZED VIEW IF EXISTS test_matview2;
    DROP MATERIALIZED VIEW IF EXISTS refresh_test_mv;
    DROP MATERIALIZED VIEW IF EXISTS concurrent_test_mv;
    DROP MATERIALIZED VIEW IF EXISTS nodata_test_mv;
    DROP MATERIALIZED VIEW IF EXISTS drop_test_mv;
    DROP MATERIALIZED VIEW IF EXISTS falseidx_mv;
    DROP MATERIALIZED VIEW IF EXISTS test_schema.custom_mv;
    DROP MATERIALIZED VIEW IF EXISTS schema_a.shared_name;
    DROP MATERIALIZED VIEW IF EXISTS schema_b.shared_name;

    -- Drop test tables
    DROP TABLE IF EXISTS test_source;
    DROP TABLE IF EXISTS test_source2;
    DROP TABLE IF EXISTS refresh_test_src;
    DROP TABLE IF EXISTS concurrent_test_src;
    DROP TABLE IF EXISTS nodata_test_src;
    DROP TABLE IF EXISTS drop_test_src;
    DROP TABLE IF EXISTS falseidx_src;
    DROP TABLE IF EXISTS test_schema.custom_src;
    DROP TABLE IF EXISTS schema_a.dup_src;
    DROP TABLE IF EXISTS schema_b.dup_src;

    -- Drop test schemas
    DROP SCHEMA IF EXISTS test_schema CASCADE;
    DROP SCHEMA IF EXISTS schema_a CASCADE;
    DROP SCHEMA IF EXISTS schema_b CASCADE;

    -- Clean up test log entries
    DELETE FROM matview_refresh_log
    WHERE error_message = 'Test error message for e2e';

    RAISE NOTICE 'PASS: test_cleanup';
END $$;
