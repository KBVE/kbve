use crate::error::ApiError;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, header};
use axum::response::Response;
use std::sync::Arc;

// Reverse-proxy first-party-origin paths to KBVE upstreams so the SPA always
// talks to its own origin (no browser CORS, no Kong origin allow-list
// dependency). Same behaviour locally (:5400) and in prod (jobs.kbve.com).

pub async fn supabase(
    State(app): State<Arc<AppState>>,
    req: Request,
) -> Result<Response, ApiError> {
    forward(&app, &app.supabase_url, "/supabase", req).await
}

pub async fn kbve_api(
    State(app): State<Arc<AppState>>,
    req: Request,
) -> Result<Response, ApiError> {
    forward(&app, &app.kbve_api_url, "/kbveapi", req).await
}

async fn forward(
    app: &AppState,
    upstream: &str,
    prefix: &str,
    req: Request,
) -> Result<Response, ApiError> {
    let (parts, body) = req.into_parts();

    let rest = parts.uri.path().strip_prefix(prefix).unwrap_or_default();
    let query = parts
        .uri
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let url = format!("{upstream}{rest}{query}");

    let body_bytes = axum::body::to_bytes(body, 8 * 1024 * 1024)
        .await
        .map_err(|e| ApiError::BadRequest(format!("proxy body: {e}")))?;

    let resp = app
        .http
        .request(parts.method.clone(), &url)
        .headers(forward_request_headers(&parts.headers))
        .body(body_bytes.to_vec())
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("proxy {prefix}: {e}")))?;

    let status = resp.status();
    let resp_headers = resp.headers().clone();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| ApiError::Internal(format!("proxy read: {e}")))?;

    let mut out = Response::builder().status(status);
    for (name, value) in resp_headers.iter() {
        if is_hop_by_hop(name) {
            continue;
        }
        out = out.header(name, value);
    }
    out.body(Body::from(bytes))
        .map_err(|e| ApiError::Internal(format!("proxy response: {e}")))
}

fn forward_request_headers(src: &HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (name, value) in src.iter() {
        if name == header::HOST || is_hop_by_hop(name) {
            continue;
        }
        out.insert(name.clone(), value.clone());
    }
    out
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
    )
}
