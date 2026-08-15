use pgrx::bgworkers::*;
use pgrx::datum::{DatumWithOid, IntoDatum};
use pgrx::guc::{GucContext, GucFlags, GucRegistry, GucSetting};
use pgrx::prelude::*;
use pgrx::spi::SpiError;
use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
mod durable;
mod jobs;
mod sql;
use crate::jobs::JobInfo;

pgrx::pg_module_magic!();

// =============================================================================
// CONFIGURATION
// =============================================================================

pub const DEFAULT_DATABASE: &str = "postgres";

static KILOBASE_DATABASE: GucSetting<Option<CString>> =
    GucSetting::<Option<CString>>::new(Some(c"postgres"));

static KILOBASE_MAX_SLEEP_SECONDS: GucSetting<i32> = GucSetting::<i32>::new(30);

// =============================================================================
// BACKGROUND WORKER INITIALIZATION
// =============================================================================

#[pg_guard]
pub extern "C-unwind" fn _PG_init() {
    // Registered unconditionally so `SHOW kilobase.database` works in ordinary
    // backends, not only when the library is preloaded.
    GucRegistry::define_string_guc(
        c"kilobase.database",
        c"Database the Smart Matview Refresher connects to.",
        c"The background worker can only see tables in one database. This must \
          name the database where `CREATE EXTENSION kilobase` was run, otherwise \
          the worker idles.",
        &KILOBASE_DATABASE,
        GucContext::Postmaster,
        GucFlags::default(),
    );

    GucRegistry::define_int_guc(
        c"kilobase.max_sleep_seconds",
        c"Longest the Smart Matview Refresher sleeps between checks.",
        c"Upper bound only. When a job is due sooner the worker shortens the \
          wait to match it.",
        &KILOBASE_MAX_SLEEP_SECONDS,
        1,
        3600,
        GucContext::Sighup,
        GucFlags::default(),
    );

    // Background workers can only be registered during shared_preload_libraries
    // processing. If loaded via CREATE EXTENSION alone, skip bgworker registration
    // so the extension installs cleanly (SQL functions/tables still get created).
    if unsafe { !pgrx::pg_sys::process_shared_preload_libraries_in_progress } {
        return;
    }

    BackgroundWorkerBuilder::new("Smart Matview Refresher")
        .set_function("smart_matview_worker_main")
        .set_library("kilobase")
        .enable_spi_access()
        .load();
}

// =============================================================================
// BACKGROUND WORKER MAIN FUNCTION
// =============================================================================

#[pg_guard]
#[unsafe(no_mangle)]
pub extern "C-unwind" fn smart_matview_worker_main(_arg: pg_sys::Datum) {
    BackgroundWorker::attach_signal_handlers(SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM);

    let database = resolve_database_name(KILOBASE_DATABASE.get());
    BackgroundWorker::connect_worker_to_spi(Some(&database), None);

    log!(
        "{} started - database: {}, max sleep between checks: {} seconds (adaptive sleep enabled)",
        BackgroundWorker::get_name(),
        database,
        KILOBASE_MAX_SLEEP_SECONDS.get()
    );

    run_worker_loop(&database);

    log!("{} shutting down", BackgroundWorker::get_name());
}

// =============================================================================
// WORKER HELPER FUNCTIONS
// =============================================================================

/// Resolve the configured database name, falling back to [`DEFAULT_DATABASE`]
/// when the GUC is unset or holds bytes that are not valid UTF-8.
pub fn resolve_database_name(configured: Option<CString>) -> String {
    configured
        .and_then(|value| value.into_string().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_DATABASE.to_string())
}

static SCHEMA_MISSING_LOGGED: AtomicBool = AtomicBool::new(false);

/// True when this database actually carries the extension's tables.
///
/// The worker is attached to a single database, so if `CREATE EXTENSION
/// kilobase` was run elsewhere its queries would raise `relation ... does not
/// exist`. In a background worker that ERROR unwinds past the caller's
/// `Result` handling and terminates the process, so the tables have to be
/// probed with `to_regclass`, which returns NULL instead of raising.
fn extension_tables_ready() -> bool {
    BackgroundWorker::transaction(|| {
        Spi::connect(|client| {
            let mut result = match client.select(
                "SELECT to_regclass('matview_refresh_jobs') IS NOT NULL
                    AND to_regclass('matview_refresh_log') IS NOT NULL AS ready",
                None,
                &[],
            ) {
                Ok(result) => result,
                Err(_) => return false,
            };

            match result.next() {
                Some(row) => row
                    .get_by_name::<bool, _>("ready")
                    .ok()
                    .flatten()
                    .unwrap_or(false),
                None => false,
            }
        })
    })
}

fn run_worker_loop(database: &str) {
    let mut cycle_count: u64 = 0;
    let maintenance_interval: u64 = 100;
    let mut max_sleep_secs = KILOBASE_MAX_SLEEP_SECONDS.get();

    while BackgroundWorker::wait_latch(Some(Duration::from_secs(max_sleep_secs as u64))) {
        cycle_count += 1;

        if BackgroundWorker::sighup_received() {
            max_sleep_secs = KILOBASE_MAX_SLEEP_SECONDS.get();
            pgrx::log!(
                "SIGHUP received - max sleep between checks is now {} seconds",
                max_sleep_secs
            );
        }

        if !extension_tables_ready() {
            if !SCHEMA_MISSING_LOGGED.swap(true, Ordering::Relaxed) {
                log!(
                    "kilobase tables not found in database '{}' - idling. Run \
                     CREATE EXTENSION kilobase there, or point kilobase.database \
                     at the database that has it.",
                    database
                );
            }
            continue;
        }

        if SCHEMA_MISSING_LOGGED.swap(false, Ordering::Relaxed) {
            log!("kilobase tables found in database '{}' - resuming", database);
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
        Spi::connect_mut(|client| {
            let result = client.update(
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
    Spi::connect_mut(|client| {
        client.update(
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
    Spi::connect_mut(|client| {
        client.update(
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
    Spi::connect_mut(|client| {
        client.update(
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
// DURABLE ENTRY POINT
// =============================================================================

const JOB_COLUMNS: &str = "id, schema_name, view_name, refresh_interval_seconds,
                           source_table, last_change_count, has_unique_index";

fn load_job(job_id: i32) -> Result<Option<JobInfo>, pgrx::spi::Error> {
    Spi::connect(|client| {
        let query = format!(
            "SELECT {JOB_COLUMNS} FROM matview_refresh_jobs WHERE id = $1 AND is_active = true"
        );
        let mut result = client.select(
            query.as_str(),
            None,
            &[unsafe { DatumWithOid::new(job_id.into_datum().unwrap(), pg_sys::INT4OID) }],
        )?;

        match result.next() {
            Some(row) => Ok(Some(crate::jobs::JobInfo::from_tuple(&row)?)),
            None => Ok(None),
        }
    })
}

/// Run one registered job on demand, returning true when the view was actually
/// refreshed and false when change detection skipped it.
///
/// This is the seam a scheduler outside the extension drives — notably a
/// pg_durable orchestration, which supplies cron scheduling, checkpointing and
/// retries that the built-in worker loop does not have. The refresh semantics
/// (UNIQUE index detection, CONCURRENT strategy, change detection, logging)
/// stay here rather than being restated in whatever does the scheduling.
#[pg_extern]
pub fn kilobase_refresh_job(job_id: i32) -> bool {
    let job = match load_job(job_id) {
        Ok(Some(job)) => job,
        Ok(None) => error!("no active matview refresh job with id {job_id}"),
        Err(e) => error!("could not load matview refresh job {job_id}: {e}"),
    };

    match process_single_job(&job) {
        Ok(JobOutcome::Refreshed) => true,
        Ok(JobOutcome::Skipped) => false,
        Err(e) => error!("refresh of job {job_id} failed: {e}"),
    }
}

/// Resolve a schema-qualified view to its active job id, for schedulers that
/// know the view but not the surrogate key.
#[pg_extern]
pub fn kilobase_job_id(schema_name: &str, view_name: &str) -> Option<i32> {
    Spi::connect(|client| {
        let mut result = client
            .select(
                "SELECT id FROM matview_refresh_jobs
                 WHERE schema_name = $1 AND view_name = $2 AND is_active = true",
                None,
                &[
                    unsafe { DatumWithOid::new(schema_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                    unsafe { DatumWithOid::new(view_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                ],
            )
            .unwrap_or_else(|e| error!("could not look up job for {schema_name}.{view_name}: {e}"));

        match result.next() {
            Some(row) => row.get_by_name::<i32, _>("id").unwrap_or(None),
            None => None,
        }
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

    let attempts = refresh_attempts(is_populated, has_unique_index);

    let mut last_error = String::new();

    for (attempt, concurrent) in attempts.iter().enumerate() {
        match try_refresh(&job.schema, &job.view_name, *concurrent) {
            Ok(None) => {
                let duration_ms = start_time.elapsed().as_millis() as i32;
                return Ok(duration_ms);
            }
            Ok(Some(message)) => {
                last_error = message;
                if attempt == 0 && attempts.len() > 1 {
                    pgrx::log!(
                        "WARNING: Concurrent refresh failed for {}.{}, trying regular refresh",
                        job.schema,
                        job.view_name
                    );
                }
            }
            Err(e) => {
                last_error = e.to_string();
            }
        }
    }

    Err(last_error)
}

/// Refresh via the PL/pgSQL wrapper, which absorbs the error in a
/// subtransaction. `Ok(None)` is success; `Ok(Some(message))` is a refresh
/// that failed without taking the worker down with it.
fn try_refresh(
    schema: &str,
    view_name: &str,
    concurrent: bool,
) -> Result<Option<String>, pgrx::spi::Error> {
    Spi::connect_mut(|client| {
        let mut result = client.update(
            "SELECT kilobase_try_refresh($1, $2, $3) AS error_message",
            None,
            &[
                unsafe { DatumWithOid::new(schema.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(view_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(concurrent.into_datum().unwrap(), pg_sys::BOOLOID) },
            ],
        )?;

        match result.next() {
            Some(row) => row.get_by_name::<String, _>("error_message"),
            None => Ok(Some("kilobase_try_refresh returned no row".to_string())),
        }
    })
}

/// Which refresh attempts to make, in order, as `concurrent` flags.
///
/// CONCURRENTLY requires both a populated view and a UNIQUE index, so it is
/// only worth attempting when both hold; the plain refresh is kept as a
/// fallback for the case where the index disappears between the check and the
/// refresh.
fn refresh_attempts(is_populated: bool, has_unique_index: bool) -> Vec<bool> {
    if is_populated && has_unique_index {
        vec![true, false]
    } else {
        vec![false]
    }
}

fn update_next_refresh_standalone(job: &JobInfo) -> Result<(), pgrx::spi::Error> {
    Spi::connect_mut(|client| {
        client.update(
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
    Spi::connect_mut(|client| {
        client.update(
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
    Spi::connect_mut(|client| {
        client.update(
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

    // ── refresh_attempts ──
    //
    // Identifier quoting moved into kilobase_try_refresh's format(%I), so the
    // quote_ident/get_refresh_strategies unit tests that used to live here were
    // removed with the functions. Injection through schema and view names is
    // covered end-to-end by test_regclass_injection_safety in the SQL suite.

    #[test]
    fn test_attempts_populated_with_unique_index() {
        // CONCURRENTLY first, plain refresh as fallback
        assert_eq!(refresh_attempts(true, true), vec![true, false]);
    }

    #[test]
    fn test_attempts_populated_without_unique_index() {
        // CONCURRENTLY would always fail without a UNIQUE index
        assert_eq!(refresh_attempts(true, false), vec![false]);
    }

    #[test]
    fn test_attempts_not_populated_with_unique_index() {
        // An unpopulated view cannot be refreshed concurrently even with an index
        assert_eq!(refresh_attempts(false, true), vec![false]);
    }

    #[test]
    fn test_attempts_not_populated_without_unique_index() {
        assert_eq!(refresh_attempts(false, false), vec![false]);
    }

    #[test]
    fn test_attempts_never_empty() {
        // Every combination must yield at least one attempt, otherwise a job
        // would silently report success without refreshing anything.
        for populated in [true, false] {
            for unique in [true, false] {
                assert!(!refresh_attempts(populated, unique).is_empty());
            }
        }
    }

    #[test]
    fn test_attempts_concurrent_only_when_both_hold() {
        for populated in [true, false] {
            for unique in [true, false] {
                let attempts = refresh_attempts(populated, unique);
                if attempts.contains(&true) {
                    assert!(populated && unique);
                }
            }
        }
    }

    #[test]
    fn test_attempts_always_end_with_plain_refresh() {
        for populated in [true, false] {
            for unique in [true, false] {
                let attempts = refresh_attempts(populated, unique);
                assert_eq!(attempts.last(), Some(&false));
            }
        }
    }

    // ── resolve_database_name ──

    fn cstring(value: &str) -> CString {
        CString::new(value).unwrap()
    }

    #[test]
    fn test_resolve_database_name_uses_configured_value() {
        assert_eq!(
            resolve_database_name(Some(cstring("kilobase_test"))),
            "kilobase_test"
        );
    }

    #[test]
    fn test_resolve_database_name_defaults_when_unset() {
        assert_eq!(resolve_database_name(None), DEFAULT_DATABASE);
    }

    #[test]
    fn test_resolve_database_name_defaults_when_empty() {
        assert_eq!(resolve_database_name(Some(cstring(""))), DEFAULT_DATABASE);
    }

    #[test]
    fn test_resolve_database_name_defaults_when_only_whitespace() {
        // A GUC set to "   " must not be handed to connect_worker_to_spi
        assert_eq!(
            resolve_database_name(Some(cstring("   "))),
            DEFAULT_DATABASE
        );
    }

    #[test]
    fn test_resolve_database_name_trims_surrounding_whitespace() {
        assert_eq!(
            resolve_database_name(Some(cstring("  analytics  "))),
            "analytics"
        );
    }

    #[test]
    fn test_resolve_database_name_preserves_internal_characters() {
        assert_eq!(
            resolve_database_name(Some(cstring("my-db_01"))),
            "my-db_01"
        );
    }

    #[test]
    fn test_resolve_database_name_preserves_unicode() {
        assert_eq!(resolve_database_name(Some(cstring("データ"))), "データ");
    }

    #[test]
    fn test_resolve_database_name_defaults_on_invalid_utf8() {
        // CString accepts arbitrary non-NUL bytes; invalid UTF-8 must fall back
        // rather than panic inside the worker's startup path.
        let invalid = CString::new(vec![0xff, 0xfe]).unwrap();
        assert_eq!(resolve_database_name(Some(invalid)), DEFAULT_DATABASE);
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
