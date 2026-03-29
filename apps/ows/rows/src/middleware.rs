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
///
/// # Edge cases
/// - Nil UUID (all zeros) will query DB and return empty results — safe but wasteful
/// - Malformed UUIDs are logged and fall back to nil
///
/// TODO(auth): Replace with Supabase JWT validation for production:
///   1. Parse Authorization: Bearer <jwt> header
///   2. Validate JWT signature against Supabase JWT secret
///   3. Extract customer_guid from JWT claims
///   4. Cache validated tokens in sessions map (avoid re-validation per request)
///
/// TODO(rate-limit): Add per-GUID rate limiting:
///   - Track request count per customer_guid per minute
///   - Return 429 Too Many Requests when exceeded
///   - Separate limits for read (100/min) vs write (20/min) operations
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

// TODO(service-key): Add SERVICE_KEY middleware for system endpoints:
//   - Reads SERVICE_KEY from env var (separate from OWS_API_KEY)
//   - Dashboard sends Authorization: Bearer <service-key>
//   - Validates against stored hash (not plaintext compare)
//   - Required for /api/System/* endpoints (RestartFleet, VerifyDeployment, etc.)
//
// TODO(ip-allowlist): Add IP allowlist for admin endpoints:
//   - ADMIN_ALLOWED_IPS env var (comma-separated CIDRs)
//   - Check X-Forwarded-For / X-Real-IP against allowlist
//   - Return 403 for non-allowed IPs on /api/System/* routes
