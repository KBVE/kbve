use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use std::borrow::Cow;
use utoipa::ToSchema;

#[derive(Debug, thiserror::Error)]
pub enum RowsError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("forbidden: {0}")]
    Forbidden(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("conflict: {0}")]
    Conflict(String),
    /// Retryable "try again shortly": maps to HTTP 503 (+ `Retry-After`) / gRPC `unavailable`. Used
    /// by the admission gate to pause new joins — a retryable signal the client backs off on, NOT
    /// `Conflict` (409 / `already_exists`), which clients treat as permanent (F2).
    #[error("unavailable: {0}")]
    Unavailable(String),
    #[error("database: {0}")]
    Database(#[from] sqlx::Error),
    #[error("internal: {0}")]
    Internal(String),
}

impl RowsError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "NOT_FOUND",
            Self::Unauthorized(_) => "UNAUTHORIZED",
            Self::Forbidden(_) => "FORBIDDEN",
            Self::BadRequest(_) => "BAD_REQUEST",
            Self::Conflict(_) => "CONFLICT",
            Self::Unavailable(_) => "UNAVAILABLE",
            Self::Database(_) => "DATABASE_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    pub fn into_tonic(self) -> tonic::Status {
        match &self {
            Self::NotFound(m) => tonic::Status::not_found(m),
            Self::Unauthorized(m) => tonic::Status::unauthenticated(m),
            Self::Forbidden(m) => tonic::Status::permission_denied(m),
            Self::BadRequest(m) => tonic::Status::invalid_argument(m),
            Self::Conflict(m) => tonic::Status::already_exists(m),
            Self::Unavailable(m) => tonic::Status::unavailable(m),
            Self::Database(e) => {
                tracing::error!(error = %e, "database error");
                tonic::Status::internal("database error")
            }
            Self::Internal(m) => tonic::Status::internal(m),
        }
    }

    /// Client-safe message. `sqlx::Error` strings carry SQL + schema detail (table and constraint
    /// names, connection targets), so DB errors are logged server-side and collapsed to a generic
    /// string before leaving the process. The other variants are application-authored.
    fn client_message(&self) -> Cow<'static, str> {
        match self {
            Self::Database(e) => {
                tracing::error!(error = %e, "database error");
                Cow::Borrowed("database error")
            }
            other => Cow::Owned(other.to_string()),
        }
    }
}

#[derive(Serialize)]
struct ApiErrorBody<'a> {
    success: bool,
    code: &'a str,
    #[serde(rename = "errorMessage")]
    error_message: Cow<'a, str>,
}

impl IntoResponse for RowsError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        // Advertise a retry window on the retryable 503 so a compliant client backs off (F2).
        let retry_after = matches!(self, Self::Unavailable(_));
        let body = ApiErrorBody {
            success: false,
            code,
            error_message: self.client_message(),
        };
        let mut response = (status, axum::Json(body)).into_response();
        if retry_after {
            response.headers_mut().insert(
                axum::http::header::RETRY_AFTER,
                axum::http::HeaderValue::from_static("5"),
            );
        }
        response
    }
}

/// OWS-compatible success/error response.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SuccessResponse {
    pub success: bool,
    pub error_message: String,
}

impl SuccessResponse {
    pub fn ok() -> Self {
        Self {
            success: true,
            error_message: String::new(),
        }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            error_message: msg.into(),
        }
    }
}

pub type ApiResult<T> = Result<axum::Json<T>, RowsError>;
