use crate::error::ApiError;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, header};
use axum::response::Response;
use std::sync::Arc;

// Reverse-proxy /supabase/* -> supabase.kbve.com/* so the SPA always talks to
// its own origin (no browser CORS, no Kong origin allow-list dependency).
// Works the same locally (:5400) and in prod (jobs.kbve.com).
pub async fn handler(State(app): State<Arc<AppState>>, req: Request) -> Result<Response, ApiError> {
    let (parts, body) = req.into_parts();

    let rest = parts
        .uri
        .path()
        .strip_prefix("/supabase")
        .unwrap_or_default();
    let query = parts
        .uri
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let url = format!("{}{}{}", app.supabase_url, rest, query);

    let body_bytes = axum::body::to_bytes(body, 8 * 1024 * 1024)
        .await
        .map_err(|e| ApiError::BadRequest(format!("proxy body: {e}")))?;

    let mut upstream = app
        .http
        .request(parts.method.clone(), &url)
        .body(body_bytes.to_vec());
    upstream = upstream.headers(forward_request_headers(&parts.headers));

    let resp = upstream
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("supabase proxy: {e}")))?;

    let status = resp.status();
    let resp_headers = resp.headers().clone();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| ApiError::Internal(format!("supabase proxy read: {e}")))?;

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
