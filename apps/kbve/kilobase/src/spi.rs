use crate::error::RedisConnectionError;
use crate::error::SpiTransactionError;
use crate::redis::process_url_with_redis;
use base62;
use pgrx::bgworkers::*;
use pgrx::prelude::*;
use pgrx::spi::{Spi, SpiClient, SpiError};
use ulid::Ulid;

pub fn generate_base62_ulid() -> String {
    let ulid = Ulid::new();
    let ulid_bytes = ulid.to_bytes();
    let ulid_u128 = u128::from_be_bytes(ulid_bytes);
    base62::encode(ulid_u128)
}

pub fn process_next_task(
    redis_connection: &mut redis::Connection,
) -> Result<(), SpiTransactionError> {
    let (id, url, retry_count) = match get_next_task()? {
        Some(task) => task,
        None => {
            log!("No idle tasks available");
            return Ok(());
        }
    };

    log!("Processing task ID: {} for URL: {}", id, &url);

    let redis_result = process_url_with_redis(&url, redis_connection).map_err(|e| e.to_string());

    update_task_status(id, url, redis_result, retry_count)?;

    Ok(())
}

fn get_next_task() -> Result<Option<(i32, String, i32)>, SpiTransactionError> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|mut client| {
            
            let query = "
                SELECT id, url, retry_count
                FROM url_queue
                WHERE status = 'idle'
                ORDER BY priority DESC, created_at ASC
                LIMIT 1;
            ";

            let tuple_table = client.select(query, Some(1), None)?;

            for tuple in tuple_table {
                let id = tuple.get_by_name::<i32, &str>("id")?.ok_or_else(|| {
                    SpiTransactionError::SpiError(SpiError::CursorNotFound(
                        "Missing id value".to_string(),
                    ))
                })?;

                let url = tuple.get_by_name::<String, &str>("url")?.ok_or_else(|| {
                    SpiTransactionError::SpiError(SpiError::CursorNotFound(
                        "Missing url value".to_string(),
                    ))
                })?;

                let retry_count = tuple.get_by_name::<i32, &str>("retry_count")?.unwrap_or(0);

                return Ok(Some((id, url, retry_count)));
            }
            Ok(None)
        })
    })
}

fn update_task_status(
    id: i32,
    url: String,
    redis_result: Result<String, String>,
    retry_count: i32,
) -> Result<(), SpiTransactionError> {
    BackgroundWorker::transaction(|| {
        Spi::connect(|mut client| {
            match redis_result {
                Ok(data) => {
                    let archive_id = generate_base62_ulid();
                    client.update(
                        "INSERT INTO url_archive (id, url, data, archived_at) VALUES ($1, $2, $3, NOW())",
                        None,
                        Some(vec![
                            (PgOid::from(pg_sys::TEXTOID), archive_id.into_datum()),
                            (PgOid::from(pg_sys::TEXTOID), url.clone().into_datum()),
                            (PgOid::from(pg_sys::TEXTOID), data.into_datum()),
                        ]),
                    )?;

                    client.update(
                        "UPDATE url_queue SET status = 'completed', processed_at = NOW() WHERE id = $1",
                        None,
                        Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
                    )?;
                    log!("Successfully archived and completed task {}", id);
                }
                Err(err_msg) => {
                    if retry_count < 3 {
                        client.update(
                            "UPDATE url_queue SET status = 'idle', retry_count = retry_count + 1 WHERE id = $1",
                            None,
                            Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
                        )?;
                        log!("Retrying task {} (attempt {})", id, retry_count + 1);
                    } else {
                        client.update(
                            "UPDATE url_queue SET status = 'error' WHERE id = $1",
                            None,
                            Some(vec![(PgOid::from(pg_sys::INT4OID), id.into_datum())]),
                        )?;
                        log!(
                            "Processing permanently failed for task {} after {} attempts: {}",
                            id,
                            retry_count,
                            err_msg
                        );
                    }
                }
            }
            Ok(())
        })
    })
}
