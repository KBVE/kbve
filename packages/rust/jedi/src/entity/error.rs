use axum::{
    response::{IntoResponse, Response},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum JediError {
    #[error("Request timed out")]
    Timeout,

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Resource not found")]
    NotFound,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

impl IntoResponse for JediError {
    fn into_response(self) -> Response {
        let status = match &self {
            JediError::Timeout => StatusCode::REQUEST_TIMEOUT,
            JediError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            JediError::NotFound => StatusCode::NOT_FOUND,
            JediError::BadRequest(_) => StatusCode::BAD_REQUEST,
            JediError::Unauthorized => StatusCode::UNAUTHORIZED,
            JediError::Forbidden => StatusCode::FORBIDDEN,
        };

        let body = Json(ErrorResponse {
            error: self.to_string(),
        });

        (status, body).into_response()
    }
}

impl From<std::io::Error> for JediError {
    fn from(err: std::io::Error) -> Self {
        JediError::Internal(err.to_string())
    }
}