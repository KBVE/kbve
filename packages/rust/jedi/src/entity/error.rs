use axum::{ response::{ IntoResponse, Response }, http::StatusCode, Json };
use serde::Serialize;
use thiserror::Error;
use std::borrow::Cow;
use tower::BoxError;

#[derive(Debug, Error)]
pub enum JediError {
  #[error("Request timed out")]
  Timeout,

  #[error("Internal error: {0}")] Internal(Cow<'static, str>),

  #[error("Resource not found")]
  NotFound,

  #[error("Bad request: {0}")] BadRequest(String),

  #[error("Unauthorized")]
  Unauthorized,

  #[error("Forbidden")]
  Forbidden,

  #[error("Database error: {0}")] Database(Cow<'static, str>),

  #[error("gRPC error: {0}")] Grpc(String),
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct ErrorResponse {
  error: String,
}

impl IntoResponse for JediError {
  fn into_response(self) -> Response {
    if matches!(self, JediError::Internal(_) | JediError::Database(_)) {
      tracing::error!("Server error occurred: {}", self);
    }

    let status = match &self {
      JediError::Timeout => StatusCode::REQUEST_TIMEOUT,
      JediError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
      JediError::NotFound => StatusCode::NOT_FOUND,
      JediError::BadRequest(_) => StatusCode::BAD_REQUEST,
      JediError::Unauthorized => StatusCode::UNAUTHORIZED,
      JediError::Forbidden => StatusCode::FORBIDDEN,
      JediError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
      JediError::Grpc(_) => StatusCode::BAD_GATEWAY,
    };

    let body = Json(ErrorResponse {
      error: self.to_string(),
    });

    (status, body).into_response()
  }
}

impl From<std::io::Error> for JediError {
  fn from(err: std::io::Error) -> Self {
    JediError::Internal(Cow::Owned(err.to_string()))
  }
}

impl From<tokio_postgres::Error> for JediError {
  fn from(err: tokio_postgres::Error) -> Self {
    JediError::Database(Cow::Owned(err.to_string()))
  }
}

impl From<JediError> for tonic::Status {
  fn from(err: JediError) -> tonic::Status {
    match err {
      JediError::Timeout => tonic::Status::deadline_exceeded(err.to_string()),
      JediError::Internal(_) => tonic::Status::internal(err.to_string()),
      JediError::NotFound => tonic::Status::not_found(err.to_string()),
      JediError::BadRequest(_) => tonic::Status::invalid_argument(err.to_string()),
      JediError::Unauthorized => tonic::Status::unauthenticated(err.to_string()),
      JediError::Forbidden => tonic::Status::permission_denied(err.to_string()),
      JediError::Database(_) => tonic::Status::unavailable(err.to_string()),
      JediError::Grpc(_) => tonic::Status::unknown(err.to_string()),
    }
  }
}

impl From<tonic::Status> for JediError {
  fn from(status: tonic::Status) -> Self {
    JediError::Grpc(status.to_string())
  }
}

impl From<&'static str> for JediError {
  fn from(msg: &'static str) -> Self {
    JediError::Internal(Cow::Borrowed(msg))
  }
}

impl From<BoxError> for JediError {
  fn from(err: BoxError) -> Self {
    if err.is::<tower::timeout::error::Elapsed>() {
      JediError::Timeout
    } else {
      JediError::Internal(Cow::Owned(err.to_string()))
    }
  }
}
