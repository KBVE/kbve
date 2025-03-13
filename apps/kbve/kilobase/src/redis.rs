use redis::{Client as RedisClient, Commands, Connection, RedisResult};
use std::env;
use pgrx::prelude::*;
use crate::error::RedisConnectionError;
use crate::http::process_url;

pub fn create_redis_connection() -> Result<Connection, RedisConnectionError> {
    let redis_host = env::var("REDIS_HOST").unwrap_or_else(|_| "redis".to_string());
    let redis_port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    let redis_auth = env::var("REDIS_PASSWORD").ok();

    let redis_url = if let Some(password) = redis_auth {
        format!("redis://:{}@{}:{}", password, redis_host, redis_port)
    } else {
        format!("redis://{}:{}", redis_host, redis_port)
    };

    log!("Attempting Redis connection to {}", redis_url);

    let client = RedisClient::open(redis_url.clone())?;

    let conn = client
        .get_connection()
        .map_err(|e| RedisConnectionError::ConnectionError(e.to_string()))?;

    log!("Successfully connected to Redis at {}", redis_url);
    Ok(conn)
}


pub fn dequeue_url(conn: &mut Connection) -> Result<String, RedisConnectionError> {
    conn.rpop("url_queue", None)
        .map_err(|e| {
            log!("Failed to dequeue URL from Redis: {}", e);
            RedisConnectionError::ConnectionError(e.to_string())
        })
}

pub fn process_url_with_redis(url: &str, conn: &mut Connection) -> Result<String, RedisConnectionError> {
    conn.set_ex::<_, _, ()>(format!("processing:{}", url), "1", 3600)
        .map_err(|e| RedisConnectionError::ConnectionError(format!("Redis error: {}", e)))?;

    let result = process_url(url);

    conn.del::<_, ()>(format!("processing:{}", url))
        .map_err(|e| RedisConnectionError::ConnectionError(format!("Redis cleanup error: {}", e)))?;

    result.map_err(|e| RedisConnectionError::ConnectionError(format!("Processing failed: {}", e)))
}