use pgrx::bgworkers::*;
use pgrx::datum::{DatumWithOid, IntoDatum};
use pgrx::prelude::*;
use pgrx::spi::SpiError;
use std::time::Duration;
mod jobs;
mod sql;
use crate::jobs::JobInfo;

pgrx::pg_module_magic!();

// =============================================================================
// BACKGROUND WORKER INITIALIZATION
// =============================================================================

#[pg_guard]
pub extern "C-unwind" fn _PG_init() {
    // Background workers can only be registered during shared_preload_libraries
    // processing. If loaded via CREATE EXTENSION alone, skip bgworker registration
    // so the extension installs cleanly (SQL functions/tables still get created).
    if unsafe { !pgrx::pg_sys::process_shared_preload_libraries_in_progress } {
        return;
    }

    BackgroundWorkerBuilder::new("Smart Matview Refresher")
        .set_function("smart_matview_worker_main")
        .set_library("kilobase")
        .set_argument(42i32.into_datum())
        .enable_spi_access()
        .load();
}

// =============================================================================
// BACKGROUND WORKER MAIN FUNCTION
// =============================================================================

#[pg_guard]
#[unsafe(no_mangle)]
pub extern "C-unwind" fn smart_matview_worker_main(arg: pg_sys::Datum) {
    let max_sleep_secs =
        unsafe { i32::from_polymorphic_datum(arg, false, pg_sys::INT4OID).unwrap_or(30) };

    BackgroundWorker::attach_signal_handlers(SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM);

    BackgroundWorker::connect_worker_to_spi(Some("postgres"), None);

    log!(
        "{} started - max sleep between checks: {} seconds (adaptive sleep enabled)",
        BackgroundWorker::get_name(),
        max_sleep_secs
    );

    if let Err(e) = setup_notification_listener() {
        log!("WARNING: Could not set up notifications: {}", e);
    }

    run_worker_loop(max_sleep_secs);

    log!("{} shutting down", BackgroundWorker::get_name());
}

// =============================================================================
// WORKER HELPER FUNCTIONS
// =============================================================================

fn setup_notification_listener() -> Result<(), pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        Spi::run("LISTEN matview_refresh_config_changed")?;
        Ok(())
    })
}

fn run_worker_loop(max_sleep_secs: i32) {
    let mut cycle_count: u64 = 0;
    let maintenance_interval: u64 = 100;

    while BackgroundWorker::wait_latch(Some(Duration::from_secs(max_sleep_secs as u64))) {
        cycle_count += 1;

        if BackgroundWorker::sighup_received() {
            pgrx::log!("SIGHUP received - checking for configuration changes");
        }

        if let Err(e) = process_refresh_cycle() {
            pgrx::log!("ERROR: Error during refresh cycle: {}", e);
        }

        // Periodic maintenance: log cleanup
        if cycle_count.is_multiple_of(maintenance_interval) {
            if let Err(e) = run_maintenance() {
                pgrx::log!("ERROR: Maintenance cycle failed: {}", e);
            }
        }

        // Adaptive sleep: compute how long until next job is due
        match get_seconds_until_next_job() {
            Ok(Some(secs)) if secs > 0 && secs < max_sleep_secs as i64 => {
                // Next job is due sooner than max_sleep, use shorter wait
                let adaptive_secs = secs.max(1) as u64;
                if BackgroundWorker::wait_latch(Some(Duration::from_secs(adaptive_secs))) {
                    // Woke up early or on time, loop will process
                }
            }
            _ => {
                // No jobs or error, will use max_sleep on next iteration
            }
        }
    }
}

// =============================================================================
// ADAPTIVE SLEEP
// =============================================================================

fn get_seconds_until_next_job() -> Result<Option<i64>, pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|client| {
            let mut result = client.select(
                "SELECT EXTRACT(EPOCH FROM (MIN(next_refresh) - NOW()))::BIGINT as secs
                 FROM matview_refresh_jobs WHERE is_active = true",
                None,
                &[],
            )?;

            if let Some(row) = result.next() {
                return row.get_by_name::<i64, _>("secs");
            }
            Ok(None)
        })
    })
}

// =============================================================================
// MAINTENANCE
// =============================================================================

fn run_maintenance() -> Result<(), pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|client| {
            let result = client.select(
                "SELECT cleanup_matview_refresh_logs(7) as deleted_count",
                None,
                &[],
            )?;

            for row in result {
                let deleted: i32 = row.get_by_name::<i32, _>("deleted_count")?.unwrap_or(0);
                if deleted > 0 {
                    pgrx::log!("Maintenance: cleaned up {} old log entries", deleted);
                }
            }
            Ok(())
        })
    })
}

// =============================================================================
// CHANGE DETECTION
// =============================================================================

fn get_table_change_count(schema: &str, table: &str) -> Result<i64, String> {
    Spi::connect(|client| {
        let mut result = client.select(
            "SELECT (COALESCE(n_tup_ins, 0) + COALESCE(n_tup_upd, 0) + COALESCE(n_tup_del, 0)) as change_count
             FROM pg_stat_user_tables
             WHERE schemaname = $1 AND relname = $2",
            None,
            &[
                unsafe { DatumWithOid::new(schema.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(table.into_datum().unwrap(), pg_sys::TEXTOID) },
            ]
        )?;

        if let Some(row) = result.next() {
            return Ok(row.get_by_name::<i64, _>("change_count")?
                .unwrap_or(0));
        }
        // Table not found in stats — treat as "changed" to trigger refresh
        Ok(-1)
    }).map_err(|e: SpiError| e.to_string())
}

fn update_change_count(job_id: i32, new_count: i64) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "UPDATE matview_refresh_jobs SET last_change_count = $2, skip_count = 0 WHERE id = $1",
            None,
            &[
                unsafe { DatumWithOid::new(job_id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe { DatumWithOid::new(new_count.into_datum().unwrap(), pg_sys::INT8OID) },
            ],
        )?;
        Ok(())
    })
}

fn increment_skip_count(job: &JobInfo) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "UPDATE matview_refresh_jobs
             SET skip_count = skip_count + 1,
                 next_refresh = NOW() + ($2 * INTERVAL '1 second')
             WHERE id = $1",
            None,
            &[
                unsafe { DatumWithOid::new(job.id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe {
                    DatumWithOid::new(job.interval_secs.into_datum().unwrap(), pg_sys::INT4OID)
                },
            ],
        )?;
        Ok(())
    })
}

// =============================================================================
// UNIQUE INDEX CHECK
// =============================================================================

fn check_has_unique_index(schema: &str, view_name: &str) -> Result<bool, String> {
    Spi::connect(|client| {
        let mut result = client.select(
            "SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = $1 AND tablename = $2
                AND indexdef LIKE '%UNIQUE%'
            ) as has_unique",
            None,
            &[
                unsafe { DatumWithOid::new(schema.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(view_name.into_datum().unwrap(), pg_sys::TEXTOID) },
            ],
        )?;

        if let Some(row) = result.next() {
            return Ok(row.get_by_name::<bool, _>("has_unique")?.unwrap_or(false));
        }
        Ok(false)
    })
    .map_err(|e: SpiError| e.to_string())
}

fn update_unique_index_status(job_id: i32, has_unique: bool) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "UPDATE matview_refresh_jobs SET has_unique_index = $2 WHERE id = $1",
            None,
            &[
                unsafe { DatumWithOid::new(job_id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe { DatumWithOid::new(has_unique.into_datum().unwrap(), pg_sys::BOOLOID) },
            ],
        )?;
        Ok(())
    })
}

// =============================================================================
// REFRESH CYCLE
// =============================================================================

fn process_refresh_cycle() -> Result<(), pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        // Get due jobs with change-detection fields
        let job_infos: Vec<JobInfo> = Spi::connect(|client| {
            let result = client.select(
                "SELECT id, schema_name, view_name, refresh_interval_seconds,
                        source_table, last_change_count, has_unique_index
                 FROM matview_refresh_jobs
                 WHERE is_active = true
                   AND (next_refresh IS NULL OR next_refresh <= NOW())
                 ORDER BY next_refresh NULLS FIRST
                 LIMIT 10",
                None,
                &[],
            )?;

            let mut jobs = Vec::new();
            for job_row in result {
                let job_info = crate::jobs::JobInfo::from_tuple(&job_row)?;
                jobs.push(job_info);
            }
            Ok::<Vec<JobInfo>, pgrx::spi::Error>(jobs)
        })?;

        let mut jobs_processed = 0;
        let mut jobs_skipped = 0;

        for job_info in job_infos {
            match process_single_job(&job_info)? {
                JobOutcome::Refreshed => jobs_processed += 1,
                JobOutcome::Skipped => jobs_skipped += 1,
            }
        }

        crate::jobs::log_cycle_completion(jobs_processed, jobs_skipped);
        Ok(())
    })
}

enum JobOutcome {
    Refreshed,
    Skipped,
}

fn process_single_job(job: &JobInfo) -> Result<JobOutcome, pgrx::spi::Error> {
    // Change detection: skip refresh if source table data hasn't changed
    if let Some(ref source_table) = job.source_table {
        match get_table_change_count(&job.schema, source_table) {
            Ok(current_count) if current_count >= 0 && current_count == job.last_change_count => {
                log!(
                    "SKIP: {}.{} — no changes in source table '{}' (count: {})",
                    job.schema,
                    job.view_name,
                    source_table,
                    current_count
                );
                increment_skip_count(job)?;
                return Ok(JobOutcome::Skipped);
            }
            Ok(_) => { /* data changed, proceed with refresh */ }
            Err(e) => {
                log!(
                    "WARNING: Could not check change count for {}.{}: {} — proceeding with refresh",
                    job.schema,
                    source_table,
                    e
                );
            }
        }
    }

    // Check UNIQUE index status for this refresh
    let has_unique = match check_has_unique_index(&job.schema, &job.view_name) {
        Ok(val) => {
            if val != job.has_unique_index {
                let _ = update_unique_index_status(job.id, val);
            }
            val
        }
        Err(e) => {
            log!(
                "WARNING: Could not check unique index for {}.{}: {}",
                job.schema,
                job.view_name,
                e
            );
            job.has_unique_index
        }
    };

    if !has_unique {
        log!(
            "WARNING: {}.{} lacks a UNIQUE index — using ACCESS EXCLUSIVE lock (blocking reads). \
              Add a UNIQUE index to enable CONCURRENT refresh.",
            job.schema,
            job.view_name
        );
    }

    log!(
        "Processing refresh for {}.{} (job_id: {}, concurrent: {})",
        job.schema,
        job.view_name,
        job.id,
        has_unique
    );

    let refresh_result = refresh_materialized_view_standalone(job, has_unique);
    update_next_refresh_standalone(job)?;

    match refresh_result {
        Ok(duration_ms) => {
            log!(
                "SUCCESS: Refreshed {}.{} in {}ms",
                job.schema,
                job.view_name,
                duration_ms
            );
            log_refresh_success_standalone(job.id, duration_ms)?;

            // Update change count after successful refresh
            if let Some(ref source_table) = job.source_table {
                if let Ok(new_count) = get_table_change_count(&job.schema, source_table) {
                    let _ = update_change_count(job.id, new_count);
                }
            }
        }
        Err(error_msg) => {
            log!(
                "ERROR: Failed to refresh {}.{}: {}",
                job.schema,
                job.view_name,
                error_msg
            );
            log_refresh_failure_standalone(job.id, &error_msg)?;
        }
    }

    Ok(JobOutcome::Refreshed)
}

fn refresh_materialized_view_standalone(
    job: &JobInfo,
    has_unique_index: bool,
) -> Result<i32, String> {
    let start_time = std::time::Instant::now();

    // Check if view is populated
    let is_populated = Spi::connect(|client| {
        let mut result = client.select(
            "SELECT ispopulated FROM pg_matviews WHERE schemaname = $1 AND matviewname = $2",
            None,
            &[
                unsafe {
                    DatumWithOid::new(job.schema.clone().into_datum().unwrap(), pg_sys::TEXTOID)
                },
                unsafe {
                    DatumWithOid::new(job.view_name.clone().into_datum().unwrap(), pg_sys::TEXTOID)
                },
            ],
        )?;

        if let Some(row) = result.next() {
            return Ok(row
                .get_by_name::<bool, _>("ispopulated")
                .unwrap_or(Some(false))
                .unwrap_or(false));
        }
        Ok(false)
    })
    .map_err(|e: SpiError| e.to_string())?;

    let refresh_strategies =
        get_refresh_strategies(&job.schema, &job.view_name, is_populated, has_unique_index);

    // Try refresh strategies
    let mut last_error = String::new();

    for (attempt, refresh_sql) in refresh_strategies.iter().enumerate() {
        let result = Spi::run(refresh_sql);
        match result {
            Ok(_) => {
                let duration_ms = start_time.elapsed().as_millis() as i32;
                return Ok(duration_ms);
            }
            Err(e) => {
                last_error = e.to_string();
                if attempt == 0 && refresh_strategies.len() > 1 {
                    pgrx::log!(
                        "WARNING: Concurrent refresh failed for {}.{}, trying regular refresh",
                        job.schema,
                        job.view_name
                    );
                }
            }
        }
    }

    Err(last_error)
}

/// Quote a SQL identifier to prevent injection (double-quote and escape internal quotes)
fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

fn get_refresh_strategies(
    schema: &str,
    view_name: &str,
    is_populated: bool,
    has_unique_index: bool,
) -> Vec<String> {
    let qualified = format!("{}.{}", quote_ident(schema), quote_ident(view_name));
    if is_populated && has_unique_index {
        // Safe to try CONCURRENT — view is populated and has UNIQUE index
        vec![
            format!("REFRESH MATERIALIZED VIEW CONCURRENTLY {}", qualified),
            format!("REFRESH MATERIALIZED VIEW {}", qualified),
        ]
    } else {
        // No UNIQUE index or not populated — skip CONCURRENT to avoid unnecessary error
        vec![format!("REFRESH MATERIALIZED VIEW {}", qualified)]
    }
}

fn update_next_refresh_standalone(job: &JobInfo) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "UPDATE matview_refresh_jobs
             SET last_refresh = NOW(),
                 next_refresh = NOW() + ($2 * INTERVAL '1 second')
             WHERE id = $1",
            None,
            &[
                unsafe { DatumWithOid::new(job.id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe {
                    DatumWithOid::new(job.interval_secs.into_datum().unwrap(), pg_sys::INT4OID)
                },
            ],
        )?;
        Ok(())
    })
}

fn log_refresh_success_standalone(job_id: i32, duration_ms: i32) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "INSERT INTO matview_refresh_log (job_id, status, duration_ms) VALUES ($1, 'Success', $2)",
            None,
            &[
                unsafe { DatumWithOid::new(job_id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe { DatumWithOid::new(duration_ms.into_datum().unwrap(), pg_sys::INT4OID) },
            ]
        )?;
        Ok(())
    })
}

fn log_refresh_failure_standalone(
    job_id: i32,
    error_message: &str,
) -> Result<(), pgrx::spi::Error> {
    Spi::connect(|client| {
        client.select(
            "INSERT INTO matview_refresh_log (job_id, status, error_message) VALUES ($1, 'Failed', $2)",
            None,
            &[
                unsafe { DatumWithOid::new(job_id.into_datum().unwrap(), pg_sys::INT4OID) },
                unsafe { DatumWithOid::new(error_message.into_datum().unwrap(), pg_sys::TEXTOID) },
            ]
        )?;
        Ok(())
    })
}

// =============================================================================
// PUBLIC API FUNCTIONS
// =============================================================================
// The public API (register_matview_refresh, unregister_matview_refresh) is
// defined as PL/pgSQL functions in sql.rs via extension_sql!. Those are the
// canonical entry points for users. Rust #[pg_extern] wrappers were removed
// to avoid "function already exists" conflicts during CREATE EXTENSION, since
// pgrx generates CREATE FUNCTION (without OR REPLACE) which collides with
// the PL/pgSQL CREATE OR REPLACE FUNCTION of the same signature.

// =============================================================================
// UNIT TESTS (pure Rust logic — no PostgreSQL required)
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ── quote_ident ──

    #[test]
    fn test_quote_ident_simple() {
        assert_eq!(quote_ident("public"), "\"public\"");
    }

    #[test]
    fn test_quote_ident_with_internal_quotes() {
        // A double-quote inside an identifier must be escaped as ""
        assert_eq!(quote_ident("my\"schema"), "\"my\"\"schema\"");
    }

    #[test]
    fn test_quote_ident_empty() {
        assert_eq!(quote_ident(""), "\"\"");
    }

    // ── get_refresh_strategies ──

    #[test]
    fn test_strategies_populated_with_unique_index() {
        let strategies = get_refresh_strategies("public", "my_view", true, true);
        assert_eq!(strategies.len(), 2);
        assert!(strategies[0].contains("CONCURRENTLY"));
        assert!(!strategies[1].contains("CONCURRENTLY"));
    }

    #[test]
    fn test_strategies_populated_without_unique_index() {
        let strategies = get_refresh_strategies("public", "my_view", true, false);
        assert_eq!(strategies.len(), 1);
        assert!(!strategies[0].contains("CONCURRENTLY"));
    }

    #[test]
    fn test_strategies_not_populated_with_unique_index() {
        // Even with a UNIQUE index, unpopulated views can't use CONCURRENT
        let strategies = get_refresh_strategies("public", "my_view", false, true);
        assert_eq!(strategies.len(), 1);
        assert!(!strategies[0].contains("CONCURRENTLY"));
    }

    #[test]
    fn test_strategies_not_populated_without_unique_index() {
        let strategies = get_refresh_strategies("public", "my_view", false, false);
        assert_eq!(strategies.len(), 1);
        assert!(!strategies[0].contains("CONCURRENTLY"));
    }

    #[test]
    fn test_strategies_use_quoted_identifiers() {
        let strategies = get_refresh_strategies("my schema", "my view", true, true);
        // Should properly quote identifiers with spaces
        assert!(strategies[0].contains("\"my schema\".\"my view\""));
    }

    #[test]
    fn test_strategies_escape_quotes_in_identifiers() {
        let strategies = get_refresh_strategies("sch\"ema", "vi\"ew", true, true);
        // Internal double-quotes must be escaped
        assert!(strategies[0].contains("\"sch\"\"ema\".\"vi\"\"ew\""));
    }

    // ── quote_ident edge cases: SQL injection vectors ──

    #[test]
    fn test_quote_ident_sql_injection_semicolon() {
        // Attacker tries to terminate statement and inject new SQL
        let result = quote_ident("view; DROP TABLE users; --");
        assert_eq!(result, "\"view; DROP TABLE users; --\"");
        assert!(!result.contains(r#""""#)); // no unescaped quotes
    }

    #[test]
    fn test_quote_ident_sql_injection_single_quotes() {
        // Single quotes should pass through — double-quoting handles identifiers
        let result = quote_ident("test' OR '1'='1");
        assert_eq!(result, "\"test' OR '1'='1\"");
    }

    #[test]
    fn test_quote_ident_sql_injection_double_quote_escape() {
        // Attacker tries to break out of double-quoted identifier
        let result = quote_ident(r#"view" ; DROP TABLE users; --"#);
        // Internal " must be escaped as ""
        assert_eq!(result, r#""view"" ; DROP TABLE users; --""#);
    }

    #[test]
    fn test_quote_ident_sql_injection_nested_quotes() {
        // Multiple layers of quote escaping
        let result = quote_ident(r#""""#);
        assert_eq!(result, r#""""""""#); // each " becomes ""
    }

    #[test]
    fn test_quote_ident_unicode() {
        assert_eq!(quote_ident("表名"), "\"表名\"");
    }

    #[test]
    fn test_quote_ident_newlines_and_tabs() {
        let result = quote_ident("view\nname\ttab");
        assert_eq!(result, "\"view\nname\ttab\"");
    }

    #[test]
    fn test_quote_ident_backslash() {
        let result = quote_ident(r"my\schema");
        assert_eq!(result, r#""my\schema""#);
    }

    #[test]
    fn test_quote_ident_null_byte() {
        let result = quote_ident("view\0name");
        assert_eq!(result, "\"view\0name\"");
    }

    #[test]
    fn test_quote_ident_sql_keywords() {
        // SQL reserved words used as identifiers must be safely quoted
        for keyword in &[
            "SELECT", "DROP", "INSERT", "DELETE", "UPDATE", "TABLE", "FROM", "WHERE",
        ] {
            let result = quote_ident(keyword);
            assert_eq!(result, format!("\"{}\"", keyword));
        }
    }

    #[test]
    fn test_quote_ident_long_identifier() {
        let long_name = "a".repeat(1000);
        let result = quote_ident(&long_name);
        assert_eq!(result.len(), 1002); // 1000 chars + 2 surrounding quotes
    }

    // ── get_refresh_strategies: SQL injection via identifiers ──

    #[test]
    fn test_strategies_sql_injection_in_schema() {
        let strategies = get_refresh_strategies(
            "public\"; DROP TABLE matview_refresh_jobs; --",
            "my_view",
            true,
            true,
        );
        // The injected SQL should be safely wrapped inside double quotes
        assert!(strategies[0].starts_with("REFRESH MATERIALIZED VIEW CONCURRENTLY \"public\"\""));
        // Should NOT contain a bare semicolon outside quotes
        let qualified = &strategies[0]["REFRESH MATERIALIZED VIEW CONCURRENTLY ".len()..];
        // The entire thing should be a single quoted identifier pair
        assert!(
            qualified.contains("\"\""),
            "Internal quotes must be escaped"
        );
    }

    #[test]
    fn test_strategies_sql_injection_in_view_name() {
        let strategies = get_refresh_strategies(
            "public",
            "view\"; DELETE FROM matview_refresh_log; --",
            true,
            true,
        );
        // View name with injection attempt should be properly escaped
        assert!(strategies[0].contains("\"view\"\""));
    }

    #[test]
    fn test_strategies_sql_injection_both_params() {
        let strategies =
            get_refresh_strategies("'; DROP TABLE t; --", "\"; DROP TABLE t; --", true, true);
        // Both should be properly quoted — single quotes in schema pass through,
        // double quotes in view_name get escaped
        assert_eq!(strategies.len(), 2);
        assert!(strategies[0].contains("CONCURRENTLY"));
    }

    // ── JobOutcome ──

    #[test]
    fn test_job_outcome_variants_exist() {
        // Ensure both variants are constructable
        let _refreshed = JobOutcome::Refreshed;
        let _skipped = JobOutcome::Skipped;
    }
}

// =============================================================================
// PGRX TEST FRAMEWORK SETUP (required by #[pg_test] macro)
// =============================================================================

#[cfg(test)]
pub mod pg_test {
    pub fn setup(_options: Vec<&str>) {}
    pub fn postgresql_conf_options() -> Vec<&'static str> {
        vec!["shared_preload_libraries = 'kilobase'"]
    }
}

// =============================================================================
// PGRX INTEGRATION TESTS (require PostgreSQL — run with: cargo pgrx test pg17)
// =============================================================================

#[cfg(feature = "pg_test")]
#[pgrx::pg_schema]
mod kilobase_tests {
    use pgrx::prelude::*;

    #[pg_test]
    fn test_extension_creates_tables() {
        // Verify matview_refresh_jobs table exists
        let result = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'matview_refresh_jobs'
            )",
        );
        assert_eq!(result, Ok(Some(true)));
    }

    #[pg_test]
    fn test_extension_creates_log_table() {
        let result = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'matview_refresh_log'
            )",
        );
        assert_eq!(result, Ok(Some(true)));
    }

    #[pg_test]
    fn test_schema_evolution_columns_exist() {
        // Verify new columns were added
        let source_table_exists = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'matview_refresh_jobs' AND column_name = 'source_table'
            )",
        );
        assert_eq!(source_table_exists, Ok(Some(true)));

        let has_unique_exists = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'matview_refresh_jobs' AND column_name = 'has_unique_index'
            )",
        );
        assert_eq!(has_unique_exists, Ok(Some(true)));

        let skip_count_exists = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'matview_refresh_jobs' AND column_name = 'skip_count'
            )",
        );
        assert_eq!(skip_count_exists, Ok(Some(true)));

        let change_count_exists = Spi::get_one::<bool>(
            "SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'matview_refresh_jobs' AND column_name = 'last_change_count'
            )",
        );
        assert_eq!(change_count_exists, Ok(Some(true)));
    }

    #[pg_test]
    fn test_register_matview_validates_existence() {
        // Should fail for non-existent matview
        let result =
            Spi::run("SELECT register_matview_refresh('public', 'nonexistent_view_xyz', 300)");
        assert!(result.is_err());
    }

    #[pg_test]
    fn test_register_and_unregister_matview() {
        // Create a test matview
        Spi::run("CREATE MATERIALIZED VIEW test_mv AS SELECT 1 as id, 'test'::text as name")
            .unwrap();
        Spi::run("CREATE UNIQUE INDEX idx_test_mv_id ON test_mv(id)").unwrap();

        // Register it
        let job_id =
            Spi::get_one::<i32>("SELECT register_matview_refresh('public', 'test_mv', 120)")
                .unwrap()
                .unwrap();
        assert!(job_id > 0);

        // Verify it was registered
        let is_active = Spi::get_one::<bool>(&format!(
            "SELECT is_active FROM matview_refresh_jobs WHERE id = {}",
            job_id
        ))
        .unwrap()
        .unwrap();
        assert!(is_active);

        // Verify UNIQUE index was detected
        let has_unique = Spi::get_one::<bool>(&format!(
            "SELECT has_unique_index FROM matview_refresh_jobs WHERE id = {}",
            job_id
        ))
        .unwrap()
        .unwrap();
        assert!(has_unique);

        // Unregister
        let unregistered =
            Spi::get_one::<bool>("SELECT unregister_matview_refresh('public', 'test_mv')")
                .unwrap()
                .unwrap();
        assert!(unregistered);

        // Verify it's inactive
        let is_active = Spi::get_one::<bool>(&format!(
            "SELECT is_active FROM matview_refresh_jobs WHERE id = {}",
            job_id
        ))
        .unwrap()
        .unwrap();
        assert!(!is_active);

        // Cleanup
        Spi::run("DROP MATERIALIZED VIEW test_mv").unwrap();
    }

    #[pg_test]
    fn test_register_without_unique_index_sets_false() {
        // Create a matview WITHOUT a unique index
        Spi::run("CREATE MATERIALIZED VIEW test_mv_no_unique AS SELECT 1 as id").unwrap();

        let job_id = Spi::get_one::<i32>(
            "SELECT register_matview_refresh('public', 'test_mv_no_unique', 300)",
        )
        .unwrap()
        .unwrap();

        let has_unique = Spi::get_one::<bool>(&format!(
            "SELECT has_unique_index FROM matview_refresh_jobs WHERE id = {}",
            job_id
        ))
        .unwrap()
        .unwrap();
        assert!(!has_unique);

        // Cleanup
        Spi::run("DROP MATERIALIZED VIEW test_mv_no_unique").unwrap();
    }

    #[pg_test]
    fn test_staggered_scheduling() {
        // Create two matviews and register them
        Spi::run("CREATE MATERIALIZED VIEW stagger_mv1 AS SELECT 1 as id").unwrap();
        Spi::run("CREATE MATERIALIZED VIEW stagger_mv2 AS SELECT 2 as id").unwrap();

        Spi::run("SELECT register_matview_refresh('public', 'stagger_mv1', 300)").unwrap();
        Spi::run("SELECT register_matview_refresh('public', 'stagger_mv2', 300)").unwrap();

        // Their next_refresh times should differ (stagger_offset of 10 seconds per job)
        let time_diff = Spi::get_one::<f64>(
            "SELECT EXTRACT(EPOCH FROM (
                (SELECT next_refresh FROM matview_refresh_jobs WHERE view_name = 'stagger_mv2') -
                (SELECT next_refresh FROM matview_refresh_jobs WHERE view_name = 'stagger_mv1')
            ))::FLOAT8",
        )
        .unwrap()
        .unwrap();

        // The difference should be approximately 10 seconds (the stagger offset)
        assert!(
            time_diff.abs() > 5.0,
            "Stagger offset should create at least 5s gap, got {}s",
            time_diff
        );

        // Cleanup
        Spi::run("DROP MATERIALIZED VIEW stagger_mv1").unwrap();
        Spi::run("DROP MATERIALIZED VIEW stagger_mv2").unwrap();
    }

    #[pg_test]
    fn test_register_with_source_table() {
        // Create a source table and a matview based on it
        Spi::run("CREATE TABLE test_source (id SERIAL PRIMARY KEY, val TEXT)").unwrap();
        Spi::run("CREATE MATERIALIZED VIEW test_mv_src AS SELECT * FROM test_source").unwrap();

        let job_id = Spi::get_one::<i32>(
            "SELECT register_matview_refresh('public', 'test_mv_src', 120, 'test_source')",
        )
        .unwrap()
        .unwrap();

        let source = Spi::get_one::<String>(&format!(
            "SELECT source_table FROM matview_refresh_jobs WHERE id = {}",
            job_id
        ))
        .unwrap()
        .unwrap();
        assert_eq!(source, "test_source");

        // Cleanup
        Spi::run("DROP MATERIALIZED VIEW test_mv_src").unwrap();
        Spi::run("DROP TABLE test_source").unwrap();
    }

    #[pg_test]
    fn test_cleanup_function_exists() {
        // Should not error
        let result = Spi::get_one::<i32>("SELECT cleanup_matview_refresh_logs(7)");
        assert!(result.is_ok());
    }

    #[pg_test]
    fn test_health_check_returns_data() {
        let result = Spi::get_one::<i32>("SELECT active_jobs FROM kilobase_health_check()");
        assert!(result.is_ok());
    }

    #[pg_test]
    fn test_monitoring_views_exist() {
        // matview_refresh_status
        let result = Spi::run("SELECT * FROM matview_refresh_status LIMIT 0");
        assert!(result.is_ok());

        // matview_refresh_history
        let result = Spi::run("SELECT * FROM matview_refresh_history LIMIT 0");
        assert!(result.is_ok());
    }
}
