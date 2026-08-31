//! One error type for handlers, so failures can be told apart.
//!
//! The `spellbook_*` macros this replaces answered every failure with 401.
//! A malformed field, an exhausted connection pool, a missing row and a
//! broken query all came back as "Unauthorized", which leaves a client no way
//! to tell "your token is bad" from "the database is down" -- and leaves
//! monitoring counting an outage as an authentication problem. The macro that
//! did it for pool failures said so in its own comment.
//!
//! The other reason those were macros is that each one ended in `return`, and
//! a function cannot return on behalf of its caller. That is what `?` is for.
//! It also reads better: `?` is a visible marker that the function may exit
//! here, where `spellbook_email!(x)` looks like an ordinary call.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

/// A handler failure, carrying the status it should answer with.
#[derive(Debug)]
pub enum ApiError {
    /// A field did not survive validation. The field is named so a client can
    /// point at the right input rather than re-submitting blind.
    Field {
        field: &'static str,
        message: String,
    },
    /// The caller is not who they say they are.
    Unauthorized(&'static str),
    /// The caller is known, but not allowed to do this.
    Forbidden(&'static str),
    /// No such row.
    NotFound(&'static str),
    /// The query failed. Deliberately opaque to the client: a database error
    /// message is an information leak, and there is nothing a caller can do
    /// about it anyway. Log the detail, return the code.
    Database,
    /// The service is up but a dependency is not -- an exhausted pool, mostly.
    /// Distinct from Database so a retry is signalled as worth making.
    Unavailable(&'static str),
}

impl core::fmt::Display for ApiError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            ApiError::Field { field, message } => write!(f, "{field}: {message}"),
            ApiError::Unauthorized(m) => write!(f, "unauthorized: {m}"),
            ApiError::Forbidden(m) => write!(f, "forbidden: {m}"),
            ApiError::NotFound(m) => write!(f, "not found: {m}"),
            ApiError::Database => write!(f, "database error"),
            ApiError::Unavailable(m) => write!(f, "unavailable: {m}"),
        }
    }
}

impl core::error::Error for ApiError {}

impl ApiError {
    pub fn status(&self) -> StatusCode {
        match self {
            // A malformed field is the caller's mistake to fix, not a reason
            // to re-authenticate. 401 tells a client to retry with credentials
            // it already sent, which is the wrong instruction.
            ApiError::Field { .. } => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden(_) => StatusCode::FORBIDDEN,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Database => StatusCode::INTERNAL_SERVER_ERROR,
            ApiError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let body = match &self {
            ApiError::Field { field, message } => serde_json::json!({
                "error": "invalid_field",
                "field": field,
                "message": message,
            }),
            ApiError::Database => serde_json::json!({ "error": "database_error" }),
            other => serde_json::json!({ "error": other.to_string() }),
        };
        (status, Json(body)).into_response()
    }
}

/// `holy`'s per-field validation errors answer as a field rejection.
impl From<holy::FieldError> for ApiError {
    fn from(error: holy::FieldError) -> Self {
        ApiError::Field {
            field: error.field,
            message: error.message.to_string(),
        }
    }
}

/// Names the field a `Result` belongs to, so it can be `?`-ed.
///
/// The sanitise helpers return `Result<_, &str>` and say what is wrong but not
/// what it is wrong about. This attaches that at the call site, where the field
/// name is known:
///
/// ```ignore
/// let email = sanitize_email(&claims.email).field("email")?;
/// ```
pub trait FieldContext<T> {
    fn field(self, name: &'static str) -> Result<T, ApiError>;
}

impl<T, E: core::fmt::Display> FieldContext<T> for Result<T, E> {
    fn field(self, name: &'static str) -> Result<T, ApiError> {
        self.map_err(|error| ApiError::Field {
            field: name,
            message: error.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The point of the type: these used to all be 401.
    #[test]
    fn failures_answer_with_different_statuses() {
        let field = ApiError::Field {
            field: "email",
            message: "bad".into(),
        };
        assert_eq!(field.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            ApiError::Unauthorized("nope").status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            ApiError::Database.status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            ApiError::Unavailable("pool").status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }

    #[test]
    fn field_context_names_the_field() {
        let result: Result<(), &str> = Err("Invalid email format");
        let error = result.field("email").unwrap_err();
        match error {
            ApiError::Field { field, message } => {
                assert_eq!(field, "email");
                assert_eq!(message, "Invalid email format");
            }
            other => panic!("expected a field error, got {other:?}"),
        }
    }

    #[test]
    fn holy_field_errors_convert() {
        let error: ApiError = holy::FieldError {
            field: "username",
            rule: "username",
            message: "must be 6 to 255 letters and digits",
        }
        .into();
        assert_eq!(error.status(), StatusCode::BAD_REQUEST);
    }
}
