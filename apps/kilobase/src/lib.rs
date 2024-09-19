//  [IMPORTS]
use pgrx::bgworkers::*;
use pgrx::prelude::*;
use pgrx::spi::SpiResult;
use pgrx::spi::SpiTupleTable;
use reqwest::blocking::Client;
use std::time::Duration;
use jedi::lazyregex::{
  extract_email_from_regex_zero_copy,
  extract_github_username_from_regex_zero_copy,
};
use serde::{ Deserialize, Serialize };
use ulid::Ulid;
use base62;

::pgrx::pg_module_magic!();

//  [SQL]

extension_sql!(
  "\
    CREATE TABLE IF NOT EXISTS url_queue (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
    );",
  name = "create_url_queue_table",
  bootstrap
);

extension_sql!(
  "\
    CREATE TABLE IF NOT EXISTS url_archive (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        archived_at TIMESTAMPTZ DEFAULT NOW()
    );",
  name = "create_url_archive_table",
  requires = ["create_url_queue_table"]
);

//  [CORE]

#[pg_guard]
pub extern "C" fn _PG_init() {
  BackgroundWorkerBuilder::new("KiloBase BG Worker")
    .set_function("bg_worker_main")
    .set_library("kilobase")
    .enable_spi_access()
    .load();
}

#[pg_guard]
#[no_mangle]
pub extern "C" fn bg_worker_main(_arg: pg_sys::Datum) {
  run_background_worker();
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
      ereport!(PgLogLevel::ERROR, PgSqlErrorCode::ERRCODE_INTERNAL_ERROR, &format!("{}", err_msg));
      ""
    }
  }
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_github_username(url: &str) -> &str {
  match extract_github_username_from_regex_zero_copy(url) {
    Ok(result) => result,
    Err(err_msg) => {
      ereport!(PgLogLevel::ERROR, PgSqlErrorCode::ERRCODE_INTERNAL_ERROR, &format!("{}", err_msg));
      ""
    }
  }
}

//  [HELPERS]

fn generate_base62_ulid() -> String {
  let ulid = Ulid::new();
  let ulid_bytes = ulid.to_bytes();
  let ulid_u128 = u128::from_be_bytes(ulid_bytes);
  base62::encode(ulid_u128)
}

fn run_background_worker() {
  BackgroundWorker::attach_signal_handlers(SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM);
  BackgroundWorker::connect_worker_to_spi(Some("postgres"), None);

  log!("KiloBase BG Worker initialized");

  // Start listening for new URL notifications
  Spi::connect(|client| {
    let query = "LISTEN url_queue_notification;";
    client.select(query, None, None).expect("Failed to execute LISTEN");
    Ok::<(), spi::Error>(())
  }).unwrap();

  loop {
    // Wait for any signal with a latch timeout of None (blocking indefinitely until a signal is received)
    if !BackgroundWorker::wait_latch(None) {
      // SIGTERM was received, we should exit
      break;
    }

    if BackgroundWorker::sighup_received() {
      log!("SIGHUP received");
      // Handle configuration reload if needed
    }

    log!("Received a notification, processing the queue...");
    if let Err(e) = process_queue() {
      log!("Error processing queue: {}", e);
    }
  }

  log!("Exiting KiloBase BG Worker");
}
fn process_queue() -> Result<(), String> {
  Spi::connect(|client| {
      let result: SpiResult<SpiTupleTable> = client.select(
          "SELECT id, url FROM url_queue WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1",
          None,
          None,
      )?;

      if let Ok(Some(row)) = result.get(0) {
          let id = row.get_datum_by_ordinal(1)?.value::<i32>()?;
          let url = row.get_datum_by_ordinal(2)?.value::<String>()?;

          log!("Processing URL: {}", url);

          client.update(
              "UPDATE url_queue SET status = 'processing' WHERE id = $1",
              Some((PgOid::from(pg_sys::INT4OID), id.into_datum())),
          )?;

          match process_url(&url) {
              Ok(data) => {
                  archive_processed_url(&url, &data)?;
                  client.update(
                      "UPDATE url_queue SET status = 'completed', processed_at = NOW() WHERE id = $1",
                      Some((PgOid::from(pg_sys::INT4OID), id.into_datum())),
                  )?;
                  log!("Successfully processed and archived URL: {}", url);
              }
              Err(err) => {
                  client.update(
                      "UPDATE url_queue SET status = 'error' WHERE id = $1",
                      Some((PgOid::from(pg_sys::INT4OID), id.into_datum())),
                  )?;
                  log!("Failed to process URL: {} with error: {}", url, err);
              }
          }
      }

      Ok(())
  }).map_err(|e| format!("SPI error: {}", e))
}

// Function to make an HTTP request and return the result
fn process_url(url: &str) -> Result<String, String> {
  let client = Client::new();

  // Make a blocking HTTP GET request
  let response = client
    .get(url)
    .send()
    .map_err(|e| format!("HTTP request failed: {}", e))?;

  if response.status().is_success() {
    let body = response.text().map_err(|e| format!("Failed to read response body: {}", e))?;
    Ok(body)
  } else {
    Err(format!("HTTP request returned non-200 status: {}", response.status()))
  }
}

// Function to archive the processed URL and its data
fn archive_processed_url(url: &str, data: &str) -> Result<(), String> {
  let id = generate_base62_ulid();
  Spi::connect(|client| {
    client.update(
      "INSERT INTO url_archive (id, url, data, archived_at) VALUES ($1, $2, $3, NOW())",
      Some(
        vec![
          (PgOid::from(pg_sys::TEXTOID), id.into_datum()),
          (PgOid::from(pg_sys::TEXTOID), url.into_datum()),
          (PgOid::from(pg_sys::TEXTOID), data.into_datum())
        ]
      )
    )?;
    Ok(())
  }).map_err(|e| format!("SPI error: {}", e))
}

//  TODO: Unit Tests

#[cfg(any(test, feature = "pg_test"))]
#[pg_schema]
mod tests {
  use pgrx::prelude::*;

  #[pg_test]
  fn test_hello_kilobase() {
    assert_eq!(
      "Hello, kilobase, this is an example query that is being called from rust!",
      crate::hello_kilobase()
    );
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
