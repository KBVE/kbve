use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use std::borrow::Cow;
use tokio_postgres::error::SqlState;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
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
    #[error("unprocessable: {0}")]
    Unprocessable(String),
    #[error("database: {0}")]
    Database(#[from] jedi::entity::error::JediError),
    #[error("internal: {0}")]
    Internal(String),
}

impl ApiError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Unprocessable(_) => StatusCode::UNPROCESSABLE_ENTITY,
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
            Self::Unprocessable(_) => "UNPROCESSABLE",
            Self::Database(_) => "DATABASE_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

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

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        let body = ApiErrorBody {
            success: false,
            code,
            error_message: self.client_message(),
        };
        (status, axum::Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<axum::Json<T>, ApiError>;

/// Map a postgres error to an ApiError. The full DB error (SQLSTATE, constraint,
/// detail) is logged server-side; the client gets a stable reason derived from
/// the SQLSTATE class and, for known constraints, a friendly message — never the
/// raw DB text or the offending values (which carry user data). Add a constraint
/// arm here when a new constraint should read as something other than its class
/// default.
pub fn pg_err(e: tokio_postgres::Error) -> ApiError {
    let Some(db) = e.as_db_error() else {
        // Connection/protocol failure — no SQLSTATE to classify.
        tracing::error!(error = %e, "postgres error (no db detail)");
        return ApiError::Internal("database error".into());
    };

    let sqlstate = db.code();
    let constraint = db.constraint().unwrap_or("");
    tracing::error!(
        sqlstate = sqlstate.code(),
        constraint = constraint,
        table = db.table().unwrap_or(""),
        detail = db.detail().unwrap_or(""),
        message = db.message(),
        "postgres query error",
    );

    // Constraint-specific friendly messages (preferred over the class default).
    match constraint {
        "jobboard_member_applications_one_pending_uq" => {
            return ApiError::Conflict("you already have a pending application".into());
        }
        "member_applications_user_id_fkey" => {
            return ApiError::Unprocessable(
                "your account is not provisioned on this service yet".into(),
            );
        }
        "member_application_verticals_vertical_id_fkey" => {
            return ApiError::Unprocessable("a selected vertical does not exist".into());
        }
        "member_applications_profile_draft_valid_ck"
        | "talent_profiles_links_valid_ck"
        | "talent_profiles_bio_len_ck"
        | "talent_profiles_location_len_ck" => {
            return ApiError::BadRequest("profile details failed validation".into());
        }
        _ => {}
    }

    // SQLSTATE-class defaults for anything not named above.
    match *sqlstate {
        SqlState::UNIQUE_VIOLATION => ApiError::Conflict("that record already exists".into()),
        SqlState::FOREIGN_KEY_VIOLATION => {
            ApiError::Unprocessable("a referenced record was not found".into())
        }
        SqlState::CHECK_VIOLATION => {
            ApiError::BadRequest("a field failed a validation rule".into())
        }
        SqlState::NOT_NULL_VIOLATION => ApiError::BadRequest("a required field was missing".into()),
        SqlState::STRING_DATA_RIGHT_TRUNCATION => {
            ApiError::BadRequest("a field was too long".into())
        }
        SqlState::INSUFFICIENT_PRIVILEGE => ApiError::Forbidden("not permitted".into()),
        _ => ApiError::Internal("database error".into()),
    }
}
