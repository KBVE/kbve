use thiserror::Error;
use axum::{http::StatusCode, response::{IntoResponse, Response}};
use solana_client::client_error::ClientError;

#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Solana RPC error: {0}")]
    SolanaClientError(#[from] ClientError),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Unexpected error: {0}")]
    Unexpected(String),
}


impl IntoResponse for AppError {
  fn into_response(self) -> Response {
      let (status, message) = match self {
          AppError::SolanaClientError(err) => (StatusCode::BAD_REQUEST, err.to_string()),
          AppError::InvalidInput(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg),
          AppError::Unexpected(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
      };

      (status, message).into_response()
  }
}
