use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::Body,
    extract::{Path, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;

use super::core::*;
use super::reel_token;
use axum::Json;
use axum::http::HeaderMap;

static REEL: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_reel_proxy() -> bool {
    let upstream = std::env::var("REEL_UPSTREAM_URL")
        .unwrap_or_else(|_| "http://reel.reel.svc.cluster.local:8080".into());
    let token = std::env::var("REEL_API_TOKEN").ok();

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .http1_only()
        .build()
        .expect("failed to build reqwest client for reel proxy");

    REEL.set(ServiceProxy {
        name: "Reel",
        client,
        upstream: upstream.trim_end_matches('/').to_string(),
        upstream_token: token,
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: true,
    })
    .is_ok()
}

/// Pull a media token out of the `reel_media_token` cookie. Native `<video>`
/// HLS (iOS Safari — no MSE, so hls.js can't run) can't send an Authorization
/// header, and relative child-playlist/segment URLs drop the query-string
/// token, so the browser-sent cookie is the only credential those requests
/// carry.
fn media_token_cookie(headers: &HeaderMap) -> Option<&str> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|pair| {
        pair.trim()
            .strip_prefix("reel_media_token=")
            .filter(|v| !v.is_empty())
    })
}

/// Reel's `/billing/*` routes are a private channel between reel and this
/// gateway — they mark a fetch as paid. Reaching them from the edge would let
/// any signed-in user settle their own fetch for zero credits, so the proxy
/// refuses to forward them at all. 404, not 403: the edge should not even
/// confirm the route exists.
pub(crate) fn is_gateway_only_path(rest: &str) -> bool {
    rest.split('/').any(|seg| seg == "billing")
}

/// Adding a torrent must go through `reel_add_handler`, which stamps the payer
/// so the fetch gets billed. Only the exact path `/api/v1/reel/torrents` is
/// routed there, so a POST to any spelling that lands on the wildcard instead
/// (`torrents/`, `torrents//`) would reach reel's add route unbilled. Reel
/// happens to 404 those today; this makes it independent of upstream routing.
pub(crate) fn bypasses_billed_add(rest: &str, method: &axum::http::Method) -> bool {
    method == axum::http::Method::POST && rest.trim_end_matches('/') == "torrents"
}

/// A media token is minted for playback and rides in a cookie and query string,
/// where it is exposed to anything that can read a URL. It may only read.
/// Adding, deleting, transcoding and touching all require a real session.
pub(crate) fn media_token_allows(method: &axum::http::Method) -> bool {
    matches!(*method, axum::http::Method::GET | axum::http::Method::HEAD)
}

async fn require_reel_access(
    headers: &HeaderMap,
    query: Option<&str>,
    method: &axum::http::Method,
) -> Result<(), Response> {
    let media_tok = extract_auth_token(headers, query)
        .filter(|t| reel_token::is_media_token(t))
        .or_else(|| media_token_cookie(headers));
    if let Some(tok) = media_tok.filter(|_| media_token_allows(method)) {
        if reel_token::is_media_token(tok) {
            return match reel_token::verify_media_token(tok, reel_token::now_unix()) {
                Some(_) => Ok(()),
                None => Err((
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": "Invalid or expired media token"})),
                )
                    .into_response()),
            };
        }
    }
    require_dashboard_view_with_query(headers, query, "Reel")
        .await
        .map(|_| ())
}

pub async fn reel_media_token_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let info = match require_dashboard_view_with_query(&headers, None, "Reel").await {
        Ok(i) => i,
        Err(resp) => return resp,
    };
    match reel_token::mint_media_token(
        &info.user_id,
        reel_token::DEFAULT_TTL_SECS,
        reel_token::now_unix(),
    ) {
        Some(token) => {
            Json(json!({"token": token, "exp": reel_token::DEFAULT_TTL_SECS})).into_response()
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "media token signing not configured"})),
        )
            .into_response(),
    }
}

/// `POST /api/v1/reel/torrents` — the one reel route that is not a blind
/// passthrough. Every fetch is billed, staff included, so the gateway resolves
/// the caller's wallet account and stamps it onto the request body before reel
/// sees it. Reel has no identity of its own; a body that arrives with its own
/// `account_id` is overwritten, never trusted.
pub async fn reel_add_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let info = match require_dashboard_view_with_query(&headers, query.as_deref(), "Reel").await {
        Ok(i) => i,
        Err(resp) => return resp,
    };
    let user_id = match uuid::Uuid::parse_str(&info.user_id) {
        Ok(u) => u,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Session has no usable account"})),
            )
                .into_response();
        }
    };
    let wallet = match crate::db::get_wallet_client() {
        Some(w) => w,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Wallet unavailable; cannot bill this fetch"})),
            )
                .into_response();
        }
    };
    // service_account_for_user provisions on first use, so a brand new staff
    // member can fetch without a manual wallet setup step.
    let account_id = match wallet.service_account_for_user(user_id).await {
        Ok(a) => a,
        Err(e) => {
            tracing::warn!(error = %e, "reel add: account resolve failed");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Could not resolve a wallet account for this session"})),
            )
                .into_response();
        }
    };

    let (parts, body) = req.into_parts();
    let bytes = match axum::body::to_bytes(body, 64 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Unreadable request body"})),
            )
                .into_response();
        }
    };
    let mut payload: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Body must be JSON"})),
            )
                .into_response();
        }
    };
    match payload.as_object_mut() {
        Some(obj) => {
            obj.insert(
                "account_id".into(),
                serde_json::Value::String(account_id.to_string()),
            );
        }
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Body must be a JSON object"})),
            )
                .into_response();
        }
    }
    let stamped = match serde_json::to_vec(&payload) {
        Ok(v) => v,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let mut parts = parts;
    parts.headers.remove(axum::http::header::CONTENT_LENGTH);
    let rebuilt = Request::from_parts(parts, Body::from(stamped));

    match REEL.get() {
        Some(proxy) => {
            proxy
                .handle_preauthorized(Some(Path("torrents".to_string())), rebuilt)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Reel proxy not configured"})),
        )
            .into_response(),
    }
}

pub async fn reel_proxy_handler(rest: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let path = rest.as_ref().map(|p| p.0.as_str()).unwrap_or_default();
    if is_gateway_only_path(path) || bypasses_billed_add(path, req.method()) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if let Err(resp) = require_reel_access(&headers, query.as_deref(), req.method()).await {
        return resp;
    }

    match REEL.get() {
        Some(proxy) => proxy.handle_preauthorized(rest, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Reel proxy not configured"})),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {

    use axum::http::Method;

    #[test]
    fn billing_routes_are_never_proxied_from_the_edge() {
        assert!(is_gateway_only_path("billing/queue"));
        assert!(is_gateway_only_path("torrents/abc123/billing/settle"));
        assert!(is_gateway_only_path("torrents/abc123/billing/refunded"));
    }

    #[test]
    fn playback_routes_still_pass() {
        for p in [
            "torrents",
            "torrents/abc123/stream",
            "torrents/abc123/manifest.m3u8",
            "torrents/abc123/files",
            "torrents/abc123/files/0",
            "torrents/abc123/archive.zip",
            "status",
            "stats",
        ] {
            assert!(!is_gateway_only_path(p), "{p} must still proxy");
        }
    }

    #[test]
    fn a_name_containing_billing_is_not_a_billing_route() {
        assert!(
            !is_gateway_only_path("torrents/abc/files/0/billing-statement.pdf"),
            "match whole segments, not substrings"
        );
    }

    #[test]
    fn no_unbilled_spelling_of_the_add_route() {
        for p in ["torrents/", "torrents//"] {
            assert!(
                bypasses_billed_add(p, &Method::POST),
                "{p} would reach reel's add without a payer stamp"
            );
        }
        assert!(
            !bypasses_billed_add("torrents", &Method::GET),
            "listing is not adding"
        );
        assert!(!bypasses_billed_add("torrents/abc/touch", &Method::POST));
    }

    #[test]
    fn media_tokens_may_only_read() {
        assert!(media_token_allows(&Method::GET));
        assert!(media_token_allows(&Method::HEAD));
        for m in [Method::POST, Method::DELETE, Method::PUT, Method::PATCH] {
            assert!(
                !media_token_allows(&m),
                "{m} must require a real session, not a URL-borne token"
            );
        }
    }
    use super::*;
    use axum::http::header::COOKIE;

    fn with_cookie(v: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(COOKIE, v.parse().unwrap());
        h
    }

    #[test]
    fn media_token_cookie_extracts_value() {
        assert_eq!(
            media_token_cookie(&with_cookie("reel_media_token=abc.def.ghi")),
            Some("abc.def.ghi")
        );
        assert_eq!(
            media_token_cookie(&with_cookie(
                "dashboard_session=x; reel_media_token=tok123; other=y"
            )),
            Some("tok123")
        );
    }

    #[test]
    fn media_token_cookie_none_when_absent_or_empty() {
        assert_eq!(
            media_token_cookie(&with_cookie("dashboard_session=x")),
            None
        );
        assert_eq!(media_token_cookie(&with_cookie("reel_media_token=")), None);
        assert_eq!(media_token_cookie(&HeaderMap::new()), None);
    }
}
