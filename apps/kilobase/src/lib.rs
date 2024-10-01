//  [V] 15.1.3
//  [IMPORTS]
use pgrx::bgworkers::*;
use pgrx::prelude::*;
// use pgrx::spi::SpiResult;
// use pgrx::spi::SpiTupleTable;
// use pgrx::spi::SpiError;
// use pgrx::spi::SpiHeapTupleData;
// use reqwest::blocking::Client;
use reqwest::Client;
use reqwest::ClientBuilder;
use redis::{ Client as RedisClient, Commands, Connection, RedisResult };
//  *Remove Tokio*
use tokio::runtime::Runtime;
use std::env;
use std::time::Duration;
use jedi::lazyregex::{ extract_url_from_regex_zero_copy };
use serde::{ Deserialize, Serialize };
use ulid::Ulid;
use base62;

::pgrx::pg_module_magic!();

//  [REDIS]

// const REDIS_URL: &str = "redis://redis";
const REDIS_DEFAULT_HOST: &str = "localhost";
const REDIS_DEFAULT_PORT: &str = "6379";

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
  BackgroundWorker::attach_signal_handlers(SignalWakeFlags::SIGHUP | SignalWakeFlags::SIGTERM);
  BackgroundWorker::connect_worker_to_spi(Some("postgres"), None);

  log!("Starting KiloBase BG Worker");

  //  [REDIS] -> Connection
  // let mut redis_connection = match

  while BackgroundWorker::wait_latch(Some(Duration::from_secs(10))) {
    // Select a pending task
    match
      Spi::get_two::<i32, String>(
        "SELECT id, url FROM url_queue WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1"
      )
    {
      Ok((Some(id), Some(url))) => {
        //log!("Processing task with ID: {} and URL: {}", id, url);
        log!("Processing task with ID: {}", id);
        // Checking URL against regex.

        // Update task status to 'processing'
        if
          let Err(err) = Spi::run_with_args(
            "UPDATE url_queue SET status = 'processing' WHERE id = $1",
            Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())])
          )
        {
          log!("Failed to update task {} to 'processing': {}", id, err);
          continue;
        }

        // Process the URL
        match process_url(&url) {
          Ok(data) => {
            log!("Successfully processed URL: {}", url);

            // Archive the processed URL
            let archive_id = generate_base62_ulid();
            if
              let Err(err) = Spi::get_one_with_args::<String>(
                "INSERT INTO url_archive (id, url, data, archived_at) VALUES ($1, $2, $3, NOW()) RETURNING id",
                vec![
                  (PgOid::from(pg_sys::TEXTOID), archive_id.into_datum()),
                  (PgOid::from(pg_sys::TEXTOID), url.clone().into_datum()),
                  (PgOid::from(pg_sys::TEXTOID), data.into_datum())
                ]
              ).map_err(|e| format!("SPI error during archive: {}", e))
            {
              log!("Failed to archive URL {}: {}", url, err);
            }

            // Update task status to 'completed'
            if
              let Err(err) = Spi::run_with_args(
                "UPDATE url_queue SET status = 'completed', processed_at = NOW() WHERE id = $1",
                Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())])
              )
            {
              log!("Failed to update task {} to 'completed': {}", id, err);
            }
          }
          Err(err) => {
            log!("Failed to process URL: {}. Error: {}", url, err);

            // Update task status to 'error'
            if
              let Err(err) = Spi::run_with_args(
                "UPDATE url_queue SET status = 'error' WHERE id = $1",
                Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())])
              )
            {
              log!("Failed to update task {} to 'error': {}", id, err);
            }
          }
        }
      }
      Ok((Some(id), None)) => {
        log!("Task with ID {} has no associated URL, skipping...", id);
      }
      Ok((None, _)) => {
        log!("No pending tasks, sleeping...");
      }
      Err(err) => {
        log!("Error selecting pending task: {}", err);
      }
    }
  }

  log!("Exiting KiloBase BG Worker");
  //  run_background_worker();
}

//  [HELPERS]

//  [REDIS] -> Helper function to create a persistent redis connection.
fn create_redis_connection() -> RedisResult<Connection, redis::RedisError> {
  //  [REDIS] -> ENVs
  let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| REDIS_DEFAULT_HOST.to_string());
  let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| REDIS_DEFAULT_PORT.to_string());
  let redis_auth = env::var("REDIS_AUTH").ok();

  //  [REDIS] -> Connection <String>
  let redis_connection_url = format!("redis://{}:{}", redis_host, redis_port);
  //  let redis_secure_connection_url = format!("rediss://{}:{}", redis_host, redis_port);

  //  [REDIS] -> Create the Redis Client
  let client = Client::open(redis_connection_url)?;

  let mut conn = client.get_connection()?;

  if let Some(password) = redis_auth {
    redis::cmd("AUTH").arg(password).query(&mut conn)?;
  }

  ok(conn)
}

fn generate_base62_ulid() -> String {
  let ulid = Ulid::new();
  let ulid_bytes = ulid.to_bytes();
  let ulid_u128 = u128::from_be_bytes(ulid_bytes);
  base62::encode(ulid_u128)
}

// Async function to make an HTTP request using reqwest with rustls and a custom timeout
async fn process_url_async(url: &str) -> Result<String, String> {
  let client = ClientBuilder::new()
    .use_rustls_tls()
    .timeout(Duration::from_secs(10))
    .build()
    .map_err(|e| format!("Failed to build client: {}", e))?;

  let response = client
    .get(url)
    .send().await
    .map_err(|e| format!("HTTP request failed: {}", e))?;

  if response.status().is_success() {
    let body = response.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    Ok(body)
  } else {
    Err(format!("HTTP request returned non-200 status: {}", response.status()))
  }
}

fn process_url(url: &str) -> Result<String, String> {
  let rt = Runtime::new().unwrap();
  rt.block_on(process_url_async(url))
}
