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

pub async fn reel_proxy_handler(rest: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    if let Err(resp) = require_dashboard_view_with_query(&headers, query.as_deref(), "Reel").await {
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
