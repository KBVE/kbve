use thiserror::Error;
use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use solana_client::client_error::ClientError;
use tracing::error;
use std::sync::Arc;
use std::error::Error;
use std::borrow::Cow;
use serde::Serialize;
use std::io;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Solana RPC error: {0}")]
    SolanaClientError(#[from] ClientError),

    #[error("Invalid input: {0}")]
    InvalidInput(Cow<'static, str>),

    #[error("Unexpected error: {0}")]
    Unexpected(Cow<'static, str>),

    #[error("I/O error: {0}")]
    IoError(#[from] io::Error),

    #[error("Custom error: {0}")]
    Custom(Arc<dyn Error + Send + Sync>),
}

#[derive(Serialize)]
struct ErrorResponse<'a> {
    error: &'a str,
    code: &'static str,
    status: u16,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::SolanaClientError(err) => (StatusCode::BAD_REQUEST, "SOLANA_RPC_ERROR", err.to_string()),
            AppError::InvalidInput(msg) => (StatusCode::UNPROCESSABLE_ENTITY, "INVALID_INPUT", msg.as_ref().to_string()),
            AppError::Unexpected(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "UNEXPECTED_ERROR", msg.as_ref().to_string()),
            AppError::IoError(err) => (StatusCode::INTERNAL_SERVER_ERROR, "IO_ERROR", err.to_string()),
            AppError::Custom(err) => (StatusCode::INTERNAL_SERVER_ERROR, "CUSTOM_ERROR", err.to_string()),
        };

        let response = ErrorResponse { error: &message, code, status: status.as_u16() };
        (status, Json(response)).into_response()
    }
}
