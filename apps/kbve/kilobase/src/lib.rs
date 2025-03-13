use pgrx::bgworkers::*;
use pgrx::prelude::*;
// use pgrx::spi::SpiResult;
use pgrx::spi::SpiError;
use pgrx::spi::SpiTupleTable;
// use pgrx::spi::SpiHeapTupleData;
// use reqwest::blocking::Client;
use reqwest::Client;
use reqwest::ClientBuilder;
// use tokio::runtime::Runtime;
use base62;
use jedi::lazyregex::extract_url_from_regex_zero_copy;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use ulid::Ulid;

::pgrx::pg_module_magic!();


extension_sql!(
    "\
    DROP TABLE IF EXISTS url_queue CASCADE;

    CREATE TABLE IF NOT EXISTS url_queue (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        retry_count INT DEFAULT 0,
        priority INT DEFAULT 0,
        status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'pending', 'processing', 'completed', 'error')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
    );",
    name = "create_url_queue_table",
    bootstrap
);

extension_sql!(
    "\
    DROP TABLE IF EXISTS url_archive CASCADE;

    CREATE TABLE IF NOT EXISTS url_archive (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        archived_at TIMESTAMPTZ DEFAULT NOW()
    );",
    name = "create_url_archive_table",
    requires = ["create_url_queue_table"]
);

// * Mod *
mod error;
mod http;
mod redis;
mod spi;

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

    let mut redis_connection = match crate::redis::create_redis_connection() {
        Ok(connection) => connection,
        Err(err) => {
            log!("Failed to establish Redis connection: {}", err);
            return;
        }
    };

    while BackgroundWorker::wait_latch(Some(Duration::from_secs(10))) {
        if BackgroundWorker::sighup_received() {
            log!("SIGHUP received, reloading configuration if needed");
        }

        match spi::process_next_task(&mut redis_connection) {
            Ok(()) => log!("Task processed successfully"),
            Err(e) => log!("Transaction failed while processing task: {}", e),
        }
    }

    log!("Exiting KiloBase BG Worker");
}
