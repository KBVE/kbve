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
use axum::http::HeaderMap;
use axum::Json;

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

async fn require_reel_access(headers: &HeaderMap, query: Option<&str>) -> Result<(), Response> {
    if let Some(tok) = extract_auth_token(headers, query) {
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
        Some(token) => Json(json!({"token": token, "exp": reel_token::DEFAULT_TTL_SECS})).into_response(),
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
