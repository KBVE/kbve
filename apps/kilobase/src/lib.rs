use pgrx::bgworkers::*;
use pgrx::prelude::*;
use reqwest::blocking::Client;
use jedi::lazyregex::{extract_email_from_regex_zero_copy, extract_github_username_from_regex_zero_copy};
use std::time::Duration;
use std::ffi::CString;
::pgrx::pg_module_magic!();

// TODO : Part A - Remove unsafe code by migrating over to a table that uses some queue system.
// TODO : Part B - Refactor and clean up the core of the lib.rs after migrating to safe-rust code.

fn example_task(arg: i32) -> Result<(), String> {
    log!("Executing HTTP task with arg: {}", arg);
    let client = Client::new();
    let response = client
        .get("https://jsonplaceholder.typicode.com/todos/1")
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    if response.status().is_success() {
        let body = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;
        log!("HTTP response body: {}", body);
        Ok(())
    } else {
        Err(format!("HTTP request returned non-200 status: {}", response.status()))
    }
}

#[pg_guard]
pub extern "C" fn _PG_init() {
    
    let url = "https://jsonplaceholder.typicode.com/todos/1";
    let url_datum = string_to_datum(url);
    
    BackgroundWorkerBuilder::new("KiloBase BG Worker")
            .set_function("bg_worker_main")
            .set_library("kilobase")
            .set_argument(url_datum)
            .enable_spi_access()
            .load();
}

fn string_to_datum(s: &str) -> pg_sys::Datum {
    let cstr = CString::new(s).expect("Failed to create CString");
    unsafe { pg_sys::cstring_to_text(cstr.as_ptr()) as pg_sys::Datum }
}

#[pg_guard]
#[no_mangle]
pub extern "C" fn bg_worker_main(arg: pg_sys::Datum) {
    let url = datum_to_string(arg); // Convert the Datum back to a string

    run_background_worker(url, example_task);
}

fn datum_to_string(arg: pg_sys::Datum) -> String {
    unsafe {
        let cstr = pg_sys::text_to_cstring(arg as *mut pg_sys::text);
        CString::from_raw(cstr).to_string_lossy().into_owned()
    }
}
fn example_task(url: String) -> Result<(), String> {
    log!("Executing HTTP task with URL: {}", url);

    let client = Client::new();
    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if response.status().is_success() {
        let body = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;
        log!("HTTP response body: {}", body);
        Ok(())
    } else {
        Err(format!("HTTP request returned non-200 status: {}", response.status()))
    }
}

fn run_background_worker(url: String, task: fn(String) -> Result<(), String>) {
    BackgroundWorker::attach_signal_handlers(SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM);
    BackgroundWorker::connect_worker_to_spi(Some("postgres"), None);
    // BackgroundWorker::connect_worker_to_spi(Some("supabase"), None);
    log!("Initialize {} - URL={}", BackgroundWorker::get_name(), url);

    while BackgroundWorker::wait_latch(Some(Duration::from_secs(10))) {
        if BackgroundWorker::sighup_received() {
            
        }

        if let Err(e) = task(url.clone()) {
            log!("Error during task execution: {}", e);
            continue;
        }
    }

    log!("Exiting {} ", BackgroundWorker::get_name());
}

#[pg_extern]
fn hello_kilobase() -> &'static str {
    "Hello, kilobase, this is an example query that is being called from rust!"
}

#[pg_extern]
fn bust_selling_propane() -> &'static str {
    "Bust is selling the best propane"
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_email(email: &str) -> &str {
    match extract_email_from_regex_zero_copy(email) {
        Ok(result) => result,
        Err(err_msg) => {
            ereport!(
                PgLogLevel::ERROR,
                PgSqlErrorCode::ERRCODE_INTERNAL_ERROR,
                &format!("{}", err_msg)
            );
            ""
        }
    }
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_github_username(url: &str) -> &str {
    match extract_github_username_from_regex_zero_copy(url) {
        Ok(result) => result,
        Err(err_msg) => {
            ereport!(
                PgLogLevel::ERROR,
                PgSqlErrorCode::ERRCODE_INTERNAL_ERROR,
                &format!("{}", err_msg)
            );
            ""
        }
    }
}

#[cfg(any(test, feature = "pg_test"))]
#[pg_schema]
mod tests {
    use pgrx::prelude::*;

    #[pg_test]
    fn test_hello_kilobase() {
        assert_eq!("Hello, kilobase, this is an example query that is being called from rust!", crate::hello_kilobase());
    }

}

/// This module is required by `cargo pgrx test` invocations.
/// It must be visible at the root of your extension crate.
#[cfg(test)]
pub mod pg_test {
    pub fn setup(_options: Vec<&str>) {
        // perform one-off initialization when the pg_test framework starts
    }

    #[must_use]
    pub fn postgresql_conf_options() -> Vec<&'static str> {
        // return any postgresql.conf settings that are required for your tests
        vec![]
    }
}
