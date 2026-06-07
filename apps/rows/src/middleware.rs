use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

pub const CUSTOMER_GUID_HEADER: &str = "x-customerguid";

/// Mirrors C# StoreCustomerGUIDMiddleware: skips `/health`, otherwise demands a valid GUID.
pub async fn require_customer_guid(req: Request, next: Next) -> Response {
    if req.uri().path() == "/health" {
        return next.run(req).await;
    }

    let guid = req
        .headers()
        .get(CUSTOMER_GUID_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());

    match guid {
        Some(_) => next.run(req).await,
        None => (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({
                "success": false,
                "errorMessage": "Missing or invalid X-CustomerGUID header"
            })),
        )
            .into_response(),
    }
}

/// Pulls the raw token out of an `Authorization: Bearer <jwt>` header. Case-insensitive scheme.
pub fn extract_bearer(headers: &axum::http::HeaderMap) -> Option<String> {
    let raw = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())?
        .trim();
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))?;
    let token = token.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

/// Pulls a trusted server-to-server service key out of the `x-service-key` header.
pub fn extract_service_key(headers: &axum::http::HeaderMap) -> Option<String> {
    let key = headers
        .get("x-service-key")
        .and_then(|v| v.to_str().ok())?
        .trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

/// Returns `Uuid::nil()` when the header is missing or malformed so unprotected callers don't panic.
pub fn extract_customer_guid(headers: &axum::http::HeaderMap) -> Uuid {
    headers
        .get(CUSTOMER_GUID_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .unwrap_or_else(|| {
            tracing::error!(
                "extract_customer_guid called without valid header — returning nil UUID"
            );
            Uuid::nil()
        })
}
