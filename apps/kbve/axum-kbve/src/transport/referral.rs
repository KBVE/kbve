//! Phase 2 referral HTTP surface.
//!
//! `GET /api/v1/referral/{handle}` and `GET /api/v1/referral/{handle}/{slug}`
//! resolve `@handle` to a user_id via the profile service, hash the
//! visitor's IP + subnet with HMAC-SHA256, call `referral.record_click`,
//! and 302 to the returned `target_url`.
//!
//! The astro `/referral/[...slug].astro` page is a thin wrapper that
//! forwards requests here. Phase 1's DB schema and SECURITY DEFINER
//! functions are the only thing the handler talks to on the SQL side.

use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use kbve::referral::{RecordClickInput, ReferralError};
use serde_json::json;
use sha2::Sha256;
use std::env;
use std::net::IpAddr;
use std::str::FromStr;
use tokio::sync::OnceCell;
use uuid::Uuid;

use crate::db::{get_profile_service, get_referral_client};

type HmacSha256 = Hmac<Sha256>;

/// Stores the resolved HMAC secret (read once from env). A missing secret
/// is fatal for the route — we refuse to fabricate placeholder bytes that
/// would be predictable across deploys.
static HASH_SECRET: OnceCell<Option<Vec<u8>>> = OnceCell::const_new();

async fn hash_secret() -> Option<&'static [u8]> {
    HASH_SECRET
        .get_or_init(|| async {
            match env::var("REFERRAL_HASH_SECRET") {
                Ok(s) if !s.is_empty() => Some(s.into_bytes()),
                _ => {
                    tracing::warn!("REFERRAL_HASH_SECRET unset — /api/v1/referral/* will 503");
                    None
                }
            }
        })
        .await
        .as_deref()
}

fn hmac_sha256(secret: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Reduce an IP to a privacy-friendly aggregate. IPv4 → /24, IPv6 → /48.
/// Returns the canonical text representation of the prefix so the hash
/// is stable across writes.
fn subnet_prefix(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2])
        }
        IpAddr::V6(v6) => {
            let segs = v6.segments();
            // /48 = first 3 hex groups
            format!("{:x}:{:x}:{:x}::/48", segs[0], segs[1], segs[2])
        }
    }
}

fn extract_client_ip(headers: &HeaderMap) -> Option<IpAddr> {
    // Prefer Cloudflare's CF-Connecting-IP, fall back to the leftmost
    // X-Forwarded-For entry. Both are set by trusted hops in our
    // ingress path (Cloudflare → ingress-nginx → axum-kbve); without
    // them we have no useful client IP since axum binds 0.0.0.0.
    for name in ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] {
        if let Some(v) = headers.get(name).and_then(|h| h.to_str().ok()) {
            let first = v.split(',').next().unwrap_or("").trim();
            if let Ok(ip) = IpAddr::from_str(first) {
                return Some(ip);
            }
        }
    }
    None
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|h| h.to_str().ok())
}

/// `GET /api/v1/referral/{handle}` — resolves the user's default target.
#[utoipa::path(
    get,
    path = "/api/v1/referral/{handle}",
    tag = "referral",
    params(
        ("handle" = String, Path, description = "@username or username")
    ),
    responses(
        (status = 302, description = "Redirect to the resolved target"),
        (status = 404, description = "Handle or target not found"),
        (status = 503, description = "Referral service unavailable"),
    ),
)]
pub(crate) async fn redirect_default(Path(handle): Path<String>, headers: HeaderMap) -> Response {
    handle_referral(headers, handle, None).await
}

/// `GET /api/v1/referral/{handle}/{slug}` — explicit target slug variant.
#[utoipa::path(
    get,
    path = "/api/v1/referral/{handle}/{slug}",
    tag = "referral",
    params(
        ("handle" = String, Path, description = "@username or username"),
        ("slug"   = String, Path, description = "target slug from the catalog")
    ),
    responses(
        (status = 302, description = "Redirect to the resolved target"),
        (status = 404, description = "Handle or target not found"),
        (status = 503, description = "Referral service unavailable"),
    ),
)]
pub(crate) async fn redirect_slug(
    Path((handle, slug)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    handle_referral(headers, handle, Some(slug)).await
}

async fn handle_referral(headers: HeaderMap, handle: String, slug: Option<String>) -> Response {
    let secret = match hash_secret().await {
        Some(s) => s,
        None => return service_unavailable("REFERRAL_HASH_SECRET unset"),
    };

    let referral = match get_referral_client() {
        Some(c) => c,
        None => return service_unavailable("referral client uninitialized"),
    };

    let profile = match get_profile_service() {
        Some(p) => p,
        None => return service_unavailable("profile service uninitialized"),
    };

    let normalized_handle = handle.trim_start_matches('@').trim().to_lowercase();
    if normalized_handle.is_empty() {
        return not_found("handle is required");
    }

    let user_id_str = match profile.get_id_by_username(&normalized_handle).await {
        Ok(Some(id)) => id,
        Ok(None) => return not_found("handle not found"),
        Err(e) => {
            tracing::warn!(handle = %normalized_handle, error = %e, "handle lookup failed");
            return server_error("handle lookup failed");
        }
    };

    let referrer_id = match Uuid::parse_str(&user_id_str) {
        Ok(id) => id,
        Err(_) => return server_error("handle resolved to invalid UUID"),
    };

    let target_slug_input = slug
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let resolved = match referral
        .resolve_user_target(referrer_id, target_slug_input.as_deref())
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return not_found("no matching referral target"),
        Err(e) => {
            tracing::warn!(error = %e, "resolve_user_target failed");
            return server_error("resolve_user_target failed");
        }
    };

    let client_ip = extract_client_ip(&headers);
    let ip_string = match client_ip {
        Some(ip) => ip.to_string(),
        None => {
            // No upstream IP header → we cannot dedup or credit safely.
            // Still redirect (don't lock out the visitor), but log the gap.
            tracing::warn!(
                handle = %normalized_handle,
                target = %resolved.slug,
                "no client IP header — redirecting without recording click"
            );
            return redirect_to(&resolved.url);
        }
    };

    let ip_hash = hmac_sha256(secret, ip_string.as_bytes());
    let subnet_hash = hmac_sha256(
        secret,
        client_ip.map(subnet_prefix).unwrap_or_default().as_bytes(),
    );

    let input = RecordClickInput {
        referrer_id,
        target_slug: resolved.slug.clone(),
        ip_hash,
        subnet_hash,
        user_agent: header_str(&headers, header::USER_AGENT.as_str()).map(String::from),
        referer: header_str(&headers, header::REFERER.as_str()).map(String::from),
        accept_lang: header_str(&headers, header::ACCEPT_LANGUAGE.as_str()).map(String::from),
    };

    match referral.record_click(&input).await {
        Ok(outcome) => redirect_to(&outcome.target_url),
        Err(ReferralError::TargetNotFound) => not_found("target inactive"),
        Err(ReferralError::TargetNotEnabled) => not_found("target not enabled for handle"),
        Err(ReferralError::InvalidArgument(msg)) => {
            tracing::warn!(error = %msg, "record_click invalid arg");
            bad_request("invalid arguments")
        }
        Err(e) => {
            tracing::error!(error = %e, "record_click failed");
            // We still send the user to the destination so a transient
            // wallet/DB failure does not blackhole the link. Credit will
            // just be skipped for this click.
            redirect_to(&resolved.url)
        }
    }
}

fn redirect_to(url: &str) -> Response {
    let mut response = Response::new(axum::body::Body::empty());
    *response.status_mut() = StatusCode::FOUND;
    if let Ok(value) = header::HeaderValue::from_str(url) {
        response.headers_mut().insert(header::LOCATION, value);
    }
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
}

fn not_found(msg: &str) -> Response {
    (StatusCode::NOT_FOUND, axum::Json(json!({ "error": msg }))).into_response()
}

fn bad_request(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, axum::Json(json!({ "error": msg }))).into_response()
}

fn service_unavailable(msg: &str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        axum::Json(json!({ "error": msg })),
    )
        .into_response()
}

fn server_error(msg: &str) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        axum::Json(json!({ "error": msg })),
    )
        .into_response()
}
