use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::{Body},
    extract::{Path, Request},
    http::{StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;

use super::core::*;

static VIBESHINE: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_vibeshine_proxy() -> bool {
    let upstream = std::env::var("VIBESHINE_UPSTREAM_URL")
        .unwrap_or_else(|_| "https://10.10.0.3:47990".into());
    let token = std::env::var("VIBESHINE_API_TOKEN").ok();

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        // Vibeshine serves a self-signed cert on the wg tunnel; traffic never
        // leaves the encrypted tunnel so certificate identity adds nothing.
        .danger_accept_invalid_certs(true)
        .http1_only()
        .build()
        .expect("failed to build reqwest client for vibeshine proxy");

    VIBESHINE
        .set(ServiceProxy {
            name: "Vibeshine",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: token,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn vibeshine_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match VIBESHINE.get() {
        Some(proxy) => proxy.handle_method_aware(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Vibeshine proxy not configured"})),
        )
            .into_response(),
    }
}

pub async fn vibeshine_status_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "Vibeshine").await {
        return resp;
    }

    let Some(proxy) = VIBESHINE.get() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Vibeshine proxy not configured"})),
        )
            .into_response();
    };

    let started = std::time::Instant::now();
    let result = proxy
        .client
        .get(format!("{}/", proxy.upstream))
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    match result {
        Ok(resp) => axum::Json(json!({
            "reachable": true,
            "upstream_status": resp.status().as_u16(),
            "latency_ms": started.elapsed().as_millis() as u64,
        }))
        .into_response(),
        Err(e) => axum::Json(json!({
            "reachable": false,
            "error": e.to_string(),
        }))
        .into_response(),
    }
}

static VIBESHINE_WEBRTC: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_vibeshine_webrtc_proxy() -> bool {
    let upstream = std::env::var("VIBESHINE_UPSTREAM_URL")
        .unwrap_or_else(|_| "https://10.10.0.3:47990".into());
    let token = std::env::var("VIBESHINE_WEBRTC_TOKEN").ok();

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        // No overall timeout — /api/webrtc/.../ice/stream is long-lived SSE.
        .danger_accept_invalid_certs(true)
        .http1_only()
        .build()
        .expect("failed to build reqwest client for vibeshine webrtc proxy");

    VIBESHINE_WEBRTC
        .set(ServiceProxy {
            name: "Vibeshine-WebRTC",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: token,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: true,
        })
        .is_ok()
}

pub async fn vibeshine_webrtc_handler(Path(rest): Path<String>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "Vibeshine-WebRTC").await
    {
        return resp;
    }

    match VIBESHINE_WEBRTC.get() {
        Some(proxy) => {
            let upstream_path = format!("api/webrtc/{rest}");
            proxy
                .handle_preauthorized(Some(Path(upstream_path)), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Vibeshine WebRTC proxy not configured"})),
        )
            .into_response(),
    }
}

