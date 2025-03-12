use pgrx::bgworkers::*;
use pgrx::prelude::*;
// use pgrx::spi::SpiResult;
// use pgrx::spi::SpiTupleTable;
// use pgrx::spi::SpiError;
// use pgrx::spi::SpiHeapTupleData;
// use reqwest::blocking::Client;
use redis::{Client as RedisClient, Commands, Connection, RedisResult};
use reqwest::Client;
use reqwest::ClientBuilder;
//  *Remove Tokio*
use base62;
use jedi::lazyregex::extract_url_from_regex_zero_copy;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;
use tokio::runtime::Runtime;
use ulid::Ulid;

::pgrx::pg_module_magic!();

// const REDIS_URL: &str = "redis://redis";
const REDIS_DEFAULT_HOST: &str = "localhost";
const REDIS_DEFAULT_PORT: &str = "6379";

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
    let redis_connection = match create_redis_connection() {
        Ok(connection) => connection,
        Err(err) => error!("Failed to establish Redis connection: {}", err),
    };

    while BackgroundWorker::wait_latch(Some(Duration::from_secs(10))) {
        if BackgroundWorker::sighup_received() {
            log!("SIGHUP received, reloading configuration if needed");
        }

        let result: Result<Option<(i32, String)>, SpiError> = Spi::connect(|mut client: spi::SpiClient<'_>| {
            let query: &str = "SELECT id, url FROM url_queue WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1";
            let tuple_table: spi::SpiTupleTable<'_> = client.select(query, Some(1), None)?;
        
            for tuple in tuple_table {
                let id: i32 = tuple.get_by_name::<i32, &str>("id")?.ok_or("Missing ID")?;
                let url: String = tuple.get_by_name::<String, &str>("url")?.ok_or("Missing URL")?;
        
                client.update(
                    "UPDATE url_queue SET status = 'processing' WHERE id = $1",
                    None,
                    Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
                )?;
        
                return Ok(Some((id, url)));
            }
            Ok(None)
        });

        match result {
            Ok(Some((id, url))) => {
                log!("Processing task ID: {} for URL: {}", id, &url);
                match process_url_with_redis(&url, &mut redis_connection) {
                    Ok(data) => {
                        if let Err(e) = archive_and_complete(&id, &url, &data) {
                            error!("Failed to archive/complete task {}: {}", id, e);
                        }
                    }
                    Err(e) => {
                        if let Err(update_err) = mark_error(id) {
                            error!("Failed to mark task {} as error: {}", id, update_err);
                        }
                        error!("Processing failed for task {}: {}", id, e);
                    }
                }
            }
            Ok(None) => log!("No pending tasks, sleeping..."),
            Err(e) => error!("SPI error while fetching tasks: {}", e),
        }
    }

    log!("Exiting KiloBase BG Worker");
}

//  [HELPERS]

fn create_redis_connection() -> RedisResult<Connection> {
    let redis_host: String = env::var("REDIS_HOST").unwrap_or_else(|_| "redis".to_string());
    let redis_port: String = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let redis_auth: Option<String> = env::var("REDIS_PASSWORD").ok();

    let redis_url: String = if let Some(password) = redis_auth {
        format!("redis://:{}@{}:{}", password, redis_host, redis_port)
    } else {
        format!("redis://{}:{}", redis_host, redis_port)
    };

    log!("Attempting Redis connection to {}", redis_url);

    let client = RedisClient::open(redis_url.clone()).map_err(|e| {
        error!("Redis connection error: {}", e);
    })?;

    let conn = client.get_connection().map_err(|e| {
        error!("Redis connection retrieval failed: {}", e);
    })?;
    log!("Successfully connected to Redis at {}", redis_url);
    Ok(conn)
}

fn dequeue_url(conn: &mut Connection) -> Option<String> {
    let result: Result<String, _> = conn.rpop("url_queue", None);
    match result {
        Ok(url) => Some(url),
        Err(err) => {
            log!("Failed to dequeue URL from Redis: {}", err);
            None
        }
    }
}
fn process_url_with_redis(url: &str, conn: &mut Connection) -> Result<String, String> {
    conn.set_ex(format!("processing:{}", url), "1", 3600)
        .map_err(|e| format!("Redis error: {}", e))?;

    let result = process_url(url);

    conn.del(format!("processing:{}", url))
        .map_err(|e| format!("Redis cleanup error: {}", e))?;

    result
}

fn archive_and_complete(id: &i32, url: &str, data: &str) -> Result<(), String> {
    Spi::connect(|mut client| {
        let archive_id = generate_base62_ulid();
        client
            .update(
                "INSERT INTO url_archive (id, url, data, archived_at) VALUES ($1, $2, $3, NOW())",
                None,
                Some(vec![
                    (PgOid::from(pg_sys::TEXTOID), archive_id.into_datum()),
                    (PgOid::from(pg_sys::TEXTOID), url.into_datum()),
                    (PgOid::from(pg_sys::TEXTOID), data.into_datum()),
                ]),
            )
            .map_err(|e| format!("Archive insert failed: {}", e))?;
        client
            .update(
                "UPDATE url_queue SET status = 'completed', processed_at = NOW() WHERE id = $1",
                None,
                Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
            )
            .map_err(|e| format!("Queue update failed: {}", e))?;

        log!("Successfully processed and archived task {}", id);
        Ok(())
    })
    .map_err(|e| format!("SPI error: {}", e))
}

fn mark_error(id: i32) -> Result<(), String> {
    Spi::run_with_args(
        "UPDATE url_queue SET status = 'error' WHERE id = $1",
        Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
    )
    .map_err(|e| format!("Failed to mark error: {}", e))
}

fn generate_base62_ulid() -> String {
    let ulid = Ulid::new();
    let ulid_bytes = ulid.to_bytes();
    let ulid_u128 = u128::from_be_bytes(ulid_bytes);
    base62::encode(ulid_u128)
}

async fn process_url_async(url: &str) -> Result<String, String> {
    let client = ClientBuilder::new()
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if response.status().is_success() {
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;
        Ok(body)
    } else {
        Err(format!(
            "HTTP request returned non-200 status: {}",
            response.status()
        ))
    }
}

fn process_url(url: &str) -> Result<String, String> {
    let rt = Runtime::new().unwrap();
    rt.block_on(process_url_async(url))
}
