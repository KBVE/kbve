use pgrx::bgworkers::*;
use pgrx::prelude::*;
use pgrx::spi::SpiError;
use pgrx::datum::{DatumWithOid, IntoDatum};
use std::time::Duration;
mod sql;
mod jobs;
use crate::jobs::JobInfo;

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
#[unsafe(no_mangle)]
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
        Spi::run("LISTEN matview_refresh_config_changed")?;
        Ok(())
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
        // Get due jobs and extract data
        let job_infos: Vec<JobInfo> = Spi::connect(|client| {
            let result = client.select(
                "SELECT id, schema_name, view_name, refresh_interval_seconds
                 FROM matview_refresh_jobs 
                 WHERE is_active = true 
                   AND (next_refresh IS NULL OR next_refresh <= NOW())
                 ORDER BY next_refresh NULLS FIRST 
                 LIMIT 10",
                None,
                &[]
            )?;
            
            let mut jobs = Vec::new();
            for job_row in result {
                let job_info = crate::jobs::JobInfo::from_tuple(&job_row)?;
                jobs.push(job_info);
            }
            Ok::<Vec<JobInfo>, pgrx::spi::Error>(jobs)
        })?;
        
        let mut jobs_processed = 0;
        
        // Process each job
        for job_info in job_infos {
            // Process the job (refresh view and update timestamps)
            process_single_job(&job_info)?;
            jobs_processed += 1;
        }

        crate::jobs::log_cycle_completion(jobs_processed);
        Ok(())
    })
}

fn process_single_job(job: &JobInfo) -> Result<(), pgrx::spi::Error> {
    log!("Processing refresh for {}.{} (job_id: {})", 
         job.schema, job.view_name, job.id);

    let refresh_result = refresh_materialized_view_standalone(job);
    update_next_refresh_standalone(job)?;

    match refresh_result {
        Ok(duration_ms) => {
            log!("SUCCESS: Refreshed {}.{} in {}ms", 
                 job.schema, job.view_name, duration_ms);
            log_refresh_success_standalone(job.id, duration_ms)?;
        }
        Err(error_msg) => {
            log!("ERROR: Failed to refresh {}.{}: {}", 
                 job.schema, job.view_name, error_msg);
            log_refresh_failure_standalone(job.id, &error_msg)?;
        }
    }

    Ok(())
}

fn refresh_materialized_view_standalone(job: &JobInfo) -> Result<i32, String> {
    let start_time = std::time::Instant::now();
    
    // Check if view is populated
    let is_populated = Spi::connect(|client| {
        let result = client.select(
            "SELECT ispopulated FROM pg_matviews WHERE schemaname = $1 AND matviewname = $2",
            None,
            &[
                unsafe { DatumWithOid::new(job.schema.clone().into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(job.view_name.clone().into_datum().unwrap(), pg_sys::TEXTOID) },
            ]
        )?;

        for row in result {
            return Ok(row.get_by_name::<bool, _>("ispopulated").unwrap_or(Some(false)).unwrap_or(false));
        }
        Ok(false)
    }).map_err(|e: SpiError| e.to_string())?;
    
    let refresh_strategies = get_refresh_strategies(&job.schema, &job.view_name, is_populated);
    
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
                    pgrx::log!("WARNING: Concurrent refresh failed for {}.{}, trying regular refresh", 
                              job.schema, job.view_name);
                }
            }
        }
    }

    Err(last_error)
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
                unsafe { DatumWithOid::new(job.interval_secs.into_datum().unwrap(), pg_sys::INT4OID) },
            ]
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

fn log_refresh_failure_standalone(job_id: i32, error_message: &str) -> Result<(), pgrx::spi::Error> {
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
) -> Result<i32, SpiError> {
    Spi::connect(|client| {
        let result = client.select(
            "SELECT register_matview_refresh($1, $2, $3)",
            None,
            &[
                unsafe { DatumWithOid::new(schema_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(view_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(interval_seconds.into_datum().unwrap(), pg_sys::INT4OID) },
            ]
        )?;
        
        for row in result {
            return Ok(row.get::<i32>(1).unwrap_or(Some(0)).unwrap_or(0));
        }
        Ok(0)
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
) -> Result<bool, SpiError> {
    Spi::connect(|client| {
        let result = client.select(
            "SELECT unregister_matview_refresh($1, $2)",
            None,
            &[
                unsafe { DatumWithOid::new(schema_name.into_datum().unwrap(), pg_sys::TEXTOID) },
                unsafe { DatumWithOid::new(view_name.into_datum().unwrap(), pg_sys::TEXTOID) },
            ]
        )?;
        Ok(!result.is_empty())
    })
}