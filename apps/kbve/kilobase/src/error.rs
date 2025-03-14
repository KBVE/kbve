use redis::RedisError;
use reqwest::Error as ReqwestError;
use reqwest::StatusCode;
use std::env::VarError;
use thiserror::Error;
use pgrx::spi::SpiError;

#[derive(Debug, Error)]
pub enum RedisConnectionError {
    #[error("Failed to create Redis client: {0}")]
    ClientError(#[from] RedisError),

    #[error("Failed to establish Redis connection: {0}")]
    ConnectionError(String),

    #[error("Environment variable error: {0}")]
    EnvVarError(#[from] VarError),
}

#[derive(Debug, Error)]
pub enum HttpError {
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] ReqwestError),

    #[error("HTTP request returned non-200 status: {0}")]
    StatusError(StatusCode),
}


#[derive(Debug, Error)]
pub enum SpiTransactionError {
    #[error("SPI error: {0}")]
    SpiError(#[from] SpiError),

    #[error("HTTP error: {0}")]
    HttpError(#[from] HttpError),

    #[error("Redis connection error: {0}")]
    RedisError(#[from] RedisConnectionError), 
}