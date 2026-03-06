use std::sync::OnceLock;

use axum::{
    body::Body,
    extract::{Path, Request},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::{debug, warn};

use crate::auth::{extract_bearer_token, get_jwt_cache};

// ---------------------------------------------------------------------------
// GrafanaProxy singleton
// ---------------------------------------------------------------------------

struct GrafanaProxy {
    client: Client,
    upstream: String,
}

static GRAFANA_PROXY: OnceLock<GrafanaProxy> = OnceLock::new();

pub fn init_grafana_proxy() -> bool {
    let upstream = match std::env::var("GRAFANA_UPSTREAM_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to build reqwest client for grafana proxy");

    GRAFANA_PROXY.set(GrafanaProxy { client, upstream }).is_ok()
}

fn get_grafana_proxy() -> Option<&'static GrafanaProxy> {
    GRAFANA_PROXY.get()
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub async fn grafana_proxy_handler(
    path: Option<Path<String>>,
    req: Request<Body>,
) -> impl IntoResponse {
    // --- JWT auth gate ---
    let auth_header = match req.headers().get(header::AUTHORIZATION) {
        Some(h) => match h.to_str() {
            Ok(s) => s.to_string(),
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    axum::Json(json!({"error": "Invalid Authorization header encoding"})),
                )
                    .into_response();
            }
        },
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({
                    "error": "Missing Authorization header",
                    "hint": "Include 'Authorization: Bearer <token>' header"
                })),
            )
                .into_response();
        }
    };

    let token = match extract_bearer_token(&auth_header) {
        Some(t) => t.to_string(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Invalid Authorization header format"})),
            )
                .into_response();
        }
    };

    let jwt_cache = match get_jwt_cache() {
        Some(c) => c,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "JWT validation not configured"})),
            )
                .into_response();
        }
    };

    if let Err(e) = jwt_cache.verify_and_cache(&token).await {
        warn!("Grafana proxy JWT rejected: {e}");
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(json!({"error": "Invalid or expired token"})),
        )
            .into_response();
    }

    // --- Proxy ---
    let proxy = match get_grafana_proxy() {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Grafana proxy not configured"})),
            )
                .into_response();
        }
    };

    let suffix = path.map(|Path(p)| p).unwrap_or_default();
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let upstream_url = format!("{}/{}{}", proxy.upstream, suffix, query);

    let method = req.method().clone();
    let mut headers = req.headers().clone();
    headers.remove(header::HOST);
    headers.remove(header::AUTHORIZATION);

    let body_bytes = match axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                axum::Json(json!({"error": "Request body too large"})),
            )
                .into_response();
        }
    };

    debug!(%upstream_url, %method, "proxying to grafana");

    let upstream_req = proxy
        .client
        .request(method, &upstream_url)
        .headers(reqwest_headers(&headers))
        .body(body_bytes);

    let upstream_resp = match upstream_req.send().await {
        Ok(r) => r,
        Err(e) => {
            warn!("Grafana upstream error: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": "Grafana upstream unreachable"})),
            )
                .into_response();
        }
    };

    let status = StatusCode::from_u16(upstream_resp.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut resp_headers = HeaderMap::new();
    for (k, v) in upstream_resp.headers() {
        if let Ok(name) = axum::http::HeaderName::from_bytes(k.as_str().as_bytes()) {
            if let Ok(val) = HeaderValue::from_bytes(v.as_bytes()) {
                resp_headers.insert(name, val);
            }
        }
    }

    let resp_body = match upstream_resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            warn!("Grafana upstream body read error: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": "Failed to read upstream response"})),
            )
                .into_response();
        }
    };

    let mut response = Response::builder().status(status);
    if let Some(h) = response.headers_mut() {
        *h = resp_headers;
    }
    response
        .body(Body::from(resp_body))
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::empty())
                .unwrap()
        })
        .into_response()
}

// Convert axum HeaderMap to reqwest HeaderMap
fn reqwest_headers(headers: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut out = reqwest::header::HeaderMap::new();
    for (k, v) in headers {
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_bytes(v.as_bytes()) {
                out.insert(name, val);
            }
        }
    }
    out
}
