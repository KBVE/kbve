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

async fn require_reel_access(headers: &HeaderMap, query: Option<&str>) -> Result<(), Response> {
    let media_tok = extract_auth_token(headers, query)
        .filter(|t| reel_token::is_media_token(t))
        .or_else(|| media_token_cookie(headers));
    if let Some(tok) = media_tok {
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

pub async fn reel_proxy_handler(rest: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    if let Err(resp) = require_reel_access(&headers, query.as_deref()).await {
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
