use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

/// Header key matching C# OWS middleware
pub const CUSTOMER_GUID_HEADER: &str = "x-customerguid";

/// Extract and validate X-CustomerGUID header.
/// Skips auth for /health endpoint (matches C# StoreCustomerGUIDMiddleware).
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

/// Extract X-CustomerGUID from request headers.
/// Returns Uuid::nil() if not present — callers behind require_customer_guid
/// middleware are guaranteed a valid GUID, but this avoids panics if called
/// from unprotected routes.
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
