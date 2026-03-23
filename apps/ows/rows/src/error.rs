use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use std::borrow::Cow;

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
#[derive(Serialize)]
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

/// Serialize a value to Json response. Returns error JSON on failure instead of panicking.
/// Uses to_value (single pass through serde) — safe replacement for .unwrap().
pub fn json_or_500<T: Serialize>(val: &T) -> axum::Json<serde_json::Value> {
    match serde_json::to_value(val) {
        Ok(v) => axum::Json(v),
        Err(e) => {
            tracing::error!(error = %e, "JSON serialization failed");
            axum::Json(serde_json::Value::Object({
                let mut m = serde_json::Map::with_capacity(2);
                m.insert("success".into(), false.into());
                m.insert("errorMessage".into(), "Internal serialization error".into());
                m
            }))
        }
    }
}
