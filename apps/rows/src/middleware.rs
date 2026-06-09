use crate::rest::HandlerState;
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

pub const CUSTOMER_GUID_HEADER: &str = "x-customerguid";

/// Demands a valid `x-customerguid` header that matches THIS process's tenant
/// (`config.customer_guid`). The DB is shared across tenants and scoped only by the
/// `customerguid` column, so a client-supplied header that differs from the process
/// tenant would otherwise read/write another tenant's rows. `/health` is exempt.
pub async fn require_customer_guid(
    State(hs): State<HandlerState>,
    req: Request,
    next: Next,
) -> Response {
    if req.uri().path() == "/health" {
        return next.run(req).await;
    }

    let guid = req
        .headers()
        .get(CUSTOMER_GUID_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok());

    match guid {
        Some(g) if g == hs.app.config.customer_guid => next.run(req).await,
        Some(g) => {
            tracing::warn!(
                request_guid = %g,
                tenant_guid = %hs.app.config.customer_guid,
                tenant = %hs.app.config.tenant_slug,
                "Rejected cross-tenant request: x-customerguid does not match process tenant"
            );
            (
                StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({
                    "success": false,
                    "errorMessage": "X-CustomerGUID does not match this server's tenant"
                })),
            )
                .into_response()
        }
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
