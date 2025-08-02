use pgrx::bgworkers::*;
use pgrx::prelude::*;
use std::time::Duration;

mod sql;
mod jobs;

pgrx::pg_module_magic!();

// =============================================================================
// BACKGROUND WORKER INITIALIZATION
// =============================================================================

#[pg_guard]
pub extern "C-unwind" fn _PG_init() {
    // if unsafe { !pgrx::pg_sys::process_shared_preload_libraries_in_progress } {
    //     pgrx::error!("Extension has to be loaded via shared_preload_libraries.");
    // }

    BackgroundWorkerBuilder::new("Smart Matview Refresher")
        .set_function("smart_matview_worker_main")
        .set_library("bgworker")
        .set_argument(42i32.into_datum())
        .enable_spi_access()
        .load();
}

// =============================================================================
// BACKGROUND WORKER MAIN FUNCTION
// =============================================================================

#[pg_guard]
#[no_mangle]
pub extern "C-unwind" fn smart_matview_worker_main(arg: pg_sys::Datum) {
     let check_interval_secs = unsafe { 
        i32::from_polymorphic_datum(arg, false, pg_sys::INT4OID)
            .unwrap_or(30)
    };
    
    BackgroundWorker::attach_signal_handlers(
        SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM
    );
    
    BackgroundWorker::connect_worker_to_spi(Some("postgres"), None);

    log!(
        "{} started - checking for due refreshes every {} seconds",
        BackgroundWorker::get_name(),
        check_interval_secs
    );

    if let Err(e) = setup_notification_listener() {
        log!("WARNING: Could not set up notifications: {}", e);
    }

    run_worker_loop(check_interval_secs);

    log!("{} shutting down", BackgroundWorker::get_name());
}

// =============================================================================
// WORKER HELPER FUNCTIONS
// =============================================================================

fn setup_notification_listener() -> Result<(), pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|client| {
            client.select("LISTEN matview_refresh_config_changed", None, &[])?;
            Ok(())
        })
    })
}

fn run_worker_loop(check_interval_secs: i32) {
    while BackgroundWorker::wait_latch(Some(Duration::from_secs(check_interval_secs as u64))) {
        if BackgroundWorker::sighup_received() {
            pgrx::log!("SIGHUP received - checking for configuration changes");
        }

        if let Err(e) = process_refresh_cycle() {
            pgrx::log!("ERROR: Error during refresh cycle: {}", e);
        }
    }
}

fn process_refresh_cycle() -> Result<(), pgrx::spi::Error> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|client| {
            let due_jobs = crate::jobs::get_due_refresh_jobs(client)?;
            let mut jobs_processed = 0;

            for job in due_jobs {
                let job_info = crate::jobs::JobInfo::from_tuple(&job)?;
                job_info.process(client)?;
                jobs_processed += 1;
            }

            crate::jobs::log_cycle_completion(jobs_processed);
            Ok(())
        })
    })
}

fn get_due_refresh_jobs<'a>(client: &'a pgrx::spi::SpiClient<'a>) -> Result<pgrx::spi::SpiTupleTable<'a>, pgrx::spi::Error> {
    client.select(
        "SELECT id, schema_name, view_name, refresh_interval_seconds
         FROM matview_refresh_jobs 
         WHERE is_active = true 
           AND (next_refresh IS NULL OR next_refresh <= NOW())
         ORDER BY next_refresh NULLS FIRST
         LIMIT 10",
        None,
        &[]
    )
}



// =============================================================================
// MATERIALIZED VIEW REFRESH LOGIC
// =============================================================================

fn refresh_materialized_view(
    client: &pgrx::SpiClient,
    job: &JobInfo,
) -> Result<i32, String> {
    let start_time = std::time::Instant::now();
    
    let is_populated = check_if_view_populated(client, &job.schema, &job.view_name)?;
    let refresh_strategies = get_refresh_strategies(&job.schema, &job.view_name, is_populated);
    
    execute_refresh_with_fallback(client, job, &refresh_strategies, start_time)
}

fn check_if_view_populated(
    client: &pgrx::SpiClient,
    schema: &str,
    view_name: &str,
) -> Result<bool, String> {
    let result = client.select(
        "SELECT ispopulated FROM pg_matviews WHERE schemaname = $1 AND matviewname = $2",
        None,
        Some(vec![schema.into_datum(), view_name.into_datum()])
    ).map_err(|e| e.to_string())?;

    if let Some(row) = result.first() {
        Ok(row.get_by_name::<bool, _>("ispopulated").unwrap_or(Some(false)).unwrap_or(false))
    } else {
        Ok(false)
    }
}

fn get_refresh_strategies(schema: &str, view_name: &str, is_populated: bool) -> Vec<String> {
    if is_populated {
        vec![
            format!("REFRESH MATERIALIZED VIEW CONCURRENTLY {}.{}", schema, view_name),
            format!("REFRESH MATERIALIZED VIEW {}.{}", schema, view_name),
        ]
    } else {
        vec![format!("REFRESH MATERIALIZED VIEW {}.{}", schema, view_name)]
    }
}

fn execute_refresh_with_fallback(
    client: &pgrx::SpiClient,
    job: &JobInfo,
    refresh_strategies: &[String],
    start_time: std::time::Instant,
) -> Result<i32, String> {
    let mut last_error = String::new();
    
    for (attempt, refresh_sql) in refresh_strategies.iter().enumerate() {
        match client.update(refresh_sql, None, None) {
            Ok(_) => {
                let duration_ms = start_time.elapsed().as_millis() as i32;
                log_refresh_success(client, job.id, duration_ms);
                return Ok(duration_ms);
            }
            Err(e) => {
                last_error = e.to_string();
                if attempt == 0 && refresh_strategies.len() > 1 {
                    pgrx::log!("WARNING: Concurrent refresh failed for {}.{}, trying regular refresh", 
                              job.schema, job.view_name);
                }
            }
        }
    }

    log_refresh_failure(client, job.id, &last_error);
    Err(last_error)
}

fn log_refresh_success(client: &pgrx::SpiClient, job_id: i32, duration_ms: i32) {
    let _ = client.update(
        "INSERT INTO matview_refresh_log (job_id, status, duration_ms) VALUES ($1, $2, $3)",
        None,
        Some(vec![
            job_id.into_datum(),
            "Success".into_datum(),
            duration_ms.into_datum()
        ])
    );
}

fn log_refresh_failure(client: &pgrx::SpiClient, job_id: i32, error_message: &str) {
    let _ = client.update(
        "INSERT INTO matview_refresh_log (job_id, status, error_message) VALUES ($1, $2, $3)",
        None,
        Some(vec![
            job_id.into_datum(),
            "Failed".into_datum(),
            error_message.into_datum()
        ])
    );
}

// =============================================================================
// PUBLIC API FUNCTIONS
// =============================================================================

#[pg_extern]
fn register_matview_for_refresh(
    schema_name: &str, 
    view_name: &str, 
    interval_seconds: i32
) -> i32 {
    match register_matview_internal(schema_name, view_name, interval_seconds) {
        Ok(job_id) => {
            pgrx::log!("SUCCESS: Registered {}.{} for refresh every {} seconds (job_id: {})", 
                      schema_name, view_name, interval_seconds, job_id);
            job_id
        }
        Err(e) => {
            pgrx::log!("ERROR: Failed to register {}.{}: {}", schema_name, view_name, e);
            0
        }
    }
}

fn register_matview_internal(
    schema_name: &str,
    view_name: &str,
    interval_seconds: i32,
) -> Result<i32, pgrx::SpiError> {
    Spi::connect(|client| {
        let result = client.select(
            "SELECT register_matview_refresh($1, $2, $3)",
            None,
            Some(vec![
                schema_name.into_datum(),
                view_name.into_datum(),
                interval_seconds.into_datum()
            ])
        )?;
        
        Ok(result
            .first()
            .and_then(|row| row.get::<i32>(1).unwrap_or(Some(0)))
            .unwrap_or(0))
    })
}

#[pg_extern]
fn unregister_matview_refresh(schema_name: &str, view_name: &str) -> bool {
    match unregister_matview_internal(schema_name, view_name) {
        Ok(success) => {
            if success {
                pgrx::log!("SUCCESS: Unregistered {}.{} from automatic refresh", 
                          schema_name, view_name);
            } else {
                pgrx::log!("WARNING: No registration found for {}.{}", 
                          schema_name, view_name);
            }
            success
        }
        Err(e) => {
            pgrx::log!("ERROR: Failed to unregister {}.{}: {}", schema_name, view_name, e);
            false
        }
    }
}

fn unregister_matview_internal(
    schema_name: &str,
    view_name: &str,
) -> Result<bool, pgrx::SpiError> {
    Spi::connect(|client| {
        let result = client.select(
            "SELECT unregister_matview_refresh($1, $2)",
            None,
            Some(vec![
                schema_name.into_datum(),
                view_name.into_datum()
            ])
        )?;
        Ok(result.len() > 0)
    })
}