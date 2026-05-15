use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use std::borrow::Cow;
use utoipa::ToSchema;

#[derive(Debug, thiserror::Error)]
pub enum RowsError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("database: {0}")]
    Database(#[from] sqlx::Error),
    #[error("internal: {0}")]
    Internal(String),
}

impl RowsError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "NOT_FOUND",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::BadRequest(_) => "BAD_REQUEST",
            Self::Conflict(_) => "CONFLICT",
            Self::Database(_) => "DATABASE_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    pub fn into_tonic(self) -> tonic::Status {
        match &self {
            Self::NotFound(m) => tonic::Status::not_found(m),
            Self::Unauthorized => tonic::Status::unauthenticated("unauthorized"),
            Self::BadRequest(m) => tonic::Status::invalid_argument(m),
            Self::Conflict(m) => tonic::Status::already_exists(m),
            Self::Database(e) => tonic::Status::internal(e.to_string()),
            Self::Internal(m) => tonic::Status::internal(m),
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
        let body = ApiErrorBody {
            success: false,
            code: self.code(),
            error_message: Cow::Owned(self.to_string()),
        };
        (status, axum::Json(body)).into_response()
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

/// Handler return type — axum serializes Json<T> directly (single pass),
/// errors go through RowsError::into_response (typed ApiErrorBody).
pub type ApiResult<T> = Result<axum::Json<T>, RowsError>;

// ─── Edge Case Notes ─────────────────────────────────────────
//
// TODO(error-context): Add request context to errors:
//   - Include request_id, customer_guid, endpoint path in error responses
//   - Makes debugging from client-side logs easier
//   - Example: {"code": "NOT_FOUND", "request_id": "abc123", "path": "/api/Users/GetAllCharacters"}
//
// TODO(error-telemetry): Forward errors to observability stack:
//   - 5xx errors → Vector → ClickHouse for alerting
//   - Track error rates per endpoint for SLO monitoring
//   - Circuit breaker state changes → alert on Agones degradation
//
// TODO(retry-header): Add Retry-After header on transient errors:
//   - 503 (Agones allocation in progress) → Retry-After: 5
//   - 429 (rate limited) → Retry-After: <seconds until reset>
//   - Helps UE5 HTTP client implement exponential backoff
//
// TODO(timeout-variant): Add RowsError::Timeout for explicit timeout handling:
//   - Distinguish between "server busy" (503) and "operation timed out" (504)
//   - Allocation timeout → RowsError::Timeout("Allocation timed out after 60s")
//   - DB query timeout → RowsError::Timeout("Query timed out after 30s")
