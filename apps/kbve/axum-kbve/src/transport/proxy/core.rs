
use axum::{
    body::{Body, Bytes},
    extract::{Path, Request},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;
use tracing::{debug, warn};

use crate::auth::{
    extract_bearer_token, get_jwt_cache,
    jwt_cache::{TokenInfo, staff_perm},
};

pub(super) struct ServiceProxy {
    pub(super) name: &'static str,
    pub(super) client: Client,
    pub(super) upstream: String,
    /// If set, injected as `Authorization: Bearer <token>` on upstream requests.
    /// When `None`, no auth header is sent upstream (e.g. Grafana anonymous).
    pub(super) upstream_token: Option<String>,
    pub(super) upstream_headers: Vec<(HeaderName, HeaderValue)>,
    /// When true, strip X-Frame-Options and Content-Security-Policy frame-ancestors
    /// from upstream responses so the proxied service can be embedded in an iframe
    /// (e.g. KASM workspace viewer).
    pub(super) iframe_safe: bool,
    /// When true, stream the response body instead of buffering it.
    /// Required for services with chunked/streaming responses that
    /// can't be fully buffered (e.g. KASM websockify sends responses
    /// that hyper fails to decode when buffered via `.bytes().await`).
    pub(super) streaming: bool,
}

impl ServiceProxy {
    /// Authenticate the incoming request (JWT + DASHBOARD_VIEW) then forward
    /// to the upstream service.
    pub(super) async fn handle(&self, path: Option<Path<String>>, mut req: Request<Body>) -> Response {
        // `&Request<Body>` is not `Send` (Body is !Sync) — clone headers/query
        // before crossing the .await boundary.
        let req_headers = req.headers().clone();
        let raw_query = req.uri().query().map(|q| q.to_string());

        if let Err(resp) =
            require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), self.name).await
        {
            return resp;
        }

        // Client-supplied account scoping is never trusted on this path; only
        // `handle_preauthorized` (fc-billing) may set it.
        req.headers_mut().remove("x-kbve-account-id");
        self.forward_request(path, req, None).await
    }

    /// Read methods require DASHBOARD_VIEW; mutating methods require DASHBOARD_MANAGE.
    pub(super) async fn handle_method_aware(
        &self,
        path: Option<Path<String>>,
        mut req: Request<Body>,
    ) -> Response {
        let req_headers = req.headers().clone();
        let raw_query = req.uri().query().map(|q| q.to_string());

        let mutating = matches!(
            req.method(),
            &Method::POST | &Method::PUT | &Method::PATCH | &Method::DELETE
        );

        let gate = if mutating {
            require_dashboard_manage_with_query(&req_headers, raw_query.as_deref(), self.name)
                .await
                .map(|_| ())
        } else {
            require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), self.name)
                .await
                .map(|_| ())
        };

        if let Err(resp) = gate {
            return resp;
        }

        req.headers_mut().remove("x-kbve-account-id");
        self.forward_request(path, req, None).await
    }

    /// Forward the request without running the DASHBOARD_VIEW gate. Callers
    /// must have already authenticated.
    pub(super) async fn handle_preauthorized(
        &self,
        path: Option<Path<String>>,
        req: Request<Body>,
    ) -> Response {
        self.forward_request(path, req, None).await
    }

    /// Like `handle_preauthorized` but injects an upstream `Authorization`
    /// header value instead of the configured upstream_token. Used for KASM
    /// where the upstream password rotates per pod start.
    pub(super) async fn handle_with_auth(
        &self,
        path: Option<Path<String>>,
        mut req: Request<Body>,
        upstream_auth: String,
    ) -> Response {
        req.headers_mut().remove("x-kbve-account-id");
        self.forward_request(path, req, Some(upstream_auth)).await
    }

    async fn forward_request(
        &self,
        path: Option<Path<String>>,
        req: Request<Body>,
        upstream_auth_override: Option<String>,
    ) -> Response {
        let suffix = path.map(|Path(p)| p).unwrap_or_default();
        let (parts, body) = req.into_parts();

        let mut upstream_url = format!("{}/{}", self.upstream, suffix);
        if let Some(q) = parts.uri.query() {
            upstream_url.push('?');
            upstream_url.push_str(q);
        }

        let method = parts.method;
        let mut headers = parts.headers;

        // RFC 7230 §6.1: hop-by-hop headers must not cross proxy boundaries.
        // accept-encoding is also removed so upstream never compresses — we
        // buffer the body and re-serve raw bytes.
        headers.remove(header::HOST);
        headers.remove(header::AUTHORIZATION);
        headers.remove(header::ACCEPT_ENCODING);
        headers.remove(header::CONNECTION);
        headers.remove(header::COOKIE);
        headers.remove(header::ORIGIN);
        headers.remove(header::REFERER);
        headers.remove("te");
        headers.remove("trailers");
        headers.remove("upgrade");
        headers.remove("proxy-connection");
        headers.remove("x-webauth-user");

        if let Some(val) = upstream_auth_override
            .as_deref()
            .and_then(|s| HeaderValue::from_str(s).ok())
        {
            headers.insert(header::AUTHORIZATION, val);
        } else if let Some(token) = &self.upstream_token {
            if let Ok(val) = HeaderValue::from_str(&format!("Bearer {token}")) {
                headers.insert(header::AUTHORIZATION, val);
            }
        }

        for (name, value) in &self.upstream_headers {
            headers.insert(name.clone(), value.clone());
        }

        let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
            Ok(b) => b,
            Err(_) => {
                return (
                    StatusCode::PAYLOAD_TOO_LARGE,
                    axum::Json(json!({"error": "Request body too large"})),
                )
                    .into_response();
            }
        };

        self.forward(&upstream_url, method, &headers, body_bytes)
            .await
    }

    /// Forward the prepared request to the upstream and relay the response.
    async fn forward(
        &self,
        upstream_url: &str,
        method: axum::http::Method,
        headers: &HeaderMap,
        body_bytes: Bytes,
    ) -> Response {
        debug!(%upstream_url, %method, "proxying to {}", self.name);

        let upstream_req = self
            .client
            .request(method.clone(), upstream_url)
            .headers(reqwest_headers(headers))
            .body(body_bytes);

        let upstream_resp = match upstream_req.send().await {
            Ok(r) => r,
            Err(e) => {
                let reason = if e.is_connect() {
                    "connection failed"
                } else if e.is_timeout() {
                    "connection timed out"
                } else if e.is_request() {
                    "request error"
                } else {
                    "unknown error"
                };
                warn!(
                    %upstream_url, %method, %reason,
                    "{} upstream error: {e}", self.name
                );
                return (
                    StatusCode::BAD_GATEWAY,
                    axum::Json(json!({
                        "error": format!("{} upstream unreachable", self.name),
                        "reason": reason,
                        "detail": format!("{e}"),
                    })),
                )
                    .into_response();
            }
        };

        let upstream_status = upstream_resp.status().as_u16();
        let status =
            StatusCode::from_u16(upstream_status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

        // `append` preserves multi-value headers (Set-Cookie, Vary).
        let mut resp_headers = HeaderMap::new();
        for (k, v) in upstream_resp.headers() {
            if let Ok(name) = axum::http::HeaderName::from_bytes(k.as_str().as_bytes()) {
                if let Ok(val) = HeaderValue::from_bytes(v.as_bytes()) {
                    resp_headers.append(name, val);
                }
            }
        }

        // RFC 7230 §6.1: strip hop-by-hop headers from the upstream response.
        // transfer-encoding — body is buffered; axum will set content-length.
        // connection — forwarding "close" makes hyper close the nginx
        //              keep-alive prematurely ("upstream prematurely closed").
        // content-encoding — reqwest may have decoded the body, so the
        //                    original encoding header would mismatch.
        const HOP_BY_HOP: &[&str] = &[
            "transfer-encoding",
            "connection",
            "keep-alive",
            "content-encoding",
            "upgrade",
            "proxy-connection",
            "te",
            "trailers",
        ];
        for h in HOP_BY_HOP {
            resp_headers.remove(*h);
        }

        // JWT + DASHBOARD_VIEW already gates access, so clickjacking
        // protection is redundant here — strip framing headers so the
        // upstream UI can embed in an iframe.
        if self.iframe_safe {
            resp_headers.remove("x-frame-options");
            resp_headers.remove("content-security-policy");
            resp_headers.remove("content-security-policy-report-only");
        }

        // Buffer error responses so 4xx/5xx bodies propagate intact even
        // when upstream omits Content-Length / Transfer-Encoding.
        if self.streaming && upstream_status < 400 {
            let body = Body::from_stream(upstream_resp.bytes_stream());
            let mut response = Response::builder().status(status);
            if let Some(h) = response.headers_mut() {
                *h = resp_headers;
            }
            return response
                .body(body)
                .unwrap_or_else(|_| {
                    Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(Body::empty())
                        .unwrap()
                })
                .into_response();
        }

        let resp_body = match upstream_resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                warn!("{} upstream body read error: {e}", self.name);
                return (
                    StatusCode::BAD_GATEWAY,
                    axum::Json(json!({"error": "Failed to read upstream response"})),
                )
                    .into_response();
            }
        };

        // Pass JSON 5xx through unchanged so deliberate signals
        // (Retry-After, rate-limit body, etc.) survive. Wrap only when the
        // upstream body is raw HTML/text, where the frontend can't parse it.
        if upstream_status >= 500 {
            let upstream_is_json = resp_headers
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|ct| ct.starts_with("application/json"))
                .unwrap_or(false);

            if !upstream_is_json {
                let body_preview =
                    String::from_utf8_lossy(&resp_body[..resp_body.len().min(512)]).to_string();

                warn!(
                    %upstream_url, upstream_status,
                    "{} upstream returned {}: {}", self.name, upstream_status, body_preview
                );

                return (
                    StatusCode::BAD_GATEWAY,
                    axum::Json(json!({
                        "error": format!("{} upstream error", self.name),
                        "reason": format!("upstream returned {upstream_status}"),
                        "detail": body_preview,
                    })),
                )
                    .into_response();
            }
        }

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
}

/// Extract Bearer token from Authorization header, `?access_token=` query,
/// or `kasm_session` / `dashboard_session` cookie.
pub(super) fn extract_auth_token<'a>(headers: &'a HeaderMap, query: Option<&'a str>) -> Option<&'a str> {
    if let Some(h) = headers.get(header::AUTHORIZATION) {
        if let Ok(s) = h.to_str() {
            if let Some(t) = extract_bearer_token(s) {
                return Some(t);
            }
        }
    }
    if let Some(qs) = query {
        for pair in qs.split('&') {
            if let Some(val) = pair.strip_prefix("access_token=") {
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    if let Some(c) = headers.get(header::COOKIE) {
        if let Ok(s) = c.to_str() {
            for pair in s.split(';') {
                let pair = pair.trim();
                if let Some(val) = pair
                    .strip_prefix("kasm_session=")
                    .or_else(|| pair.strip_prefix("dashboard_session="))
                    .or_else(|| pair.strip_prefix("sb-access-token="))
                {
                    if !val.is_empty() {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

pub(crate) async fn require_dashboard_view(
    headers: &HeaderMap,
    service_name: &str,
) -> Result<(), Response> {
    require_dashboard_view_with_query(headers, None, service_name)
        .await
        .map(|_| ())
}

/// Shared JWT + permission gate for proxy routes. Verifies the token, then
/// checks it carries `required_perm`. `perm_label` names the permission in the
/// deny log; `denied_message` is returned to the client on a 403.
pub(super) async fn require_dashboard_permission(
    headers: &HeaderMap,
    query: Option<&str>,
    service_name: &str,
    required_perm: i32,
    perm_label: &str,
    denied_message: &str,
) -> Result<Arc<TokenInfo>, Response> {
    let auth_token = match extract_auth_token(headers, query) {
        Some(t) => t,
        None => {
            warn!(
                "{service_name} proxy access denied — missing Authorization header / access_token"
            );
            return Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({
                    "error": "Missing Authorization header or access_token query param",
                    "hint": "Include 'Authorization: Bearer <token>' header or ?access_token=<token>"
                })),
            )
                .into_response());
        }
    };

    let jwt_cache = match get_jwt_cache() {
        Some(c) => c,
        None => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "JWT validation not configured"})),
            )
                .into_response());
        }
    };

    let token_info = match jwt_cache.verify_and_cache(auth_token).await {
        Ok(info) => info,
        Err(e) => {
            warn!("{service_name} proxy JWT rejected: {e}");
            return Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Invalid or expired token"})),
            )
                .into_response());
        }
    };

    if !token_info.has_permission(required_perm) {
        warn!(
            user_id = %token_info.user_id,
            permissions = format!("0x{:08x}", token_info.staff_permissions),
            "{service_name} proxy access denied — missing {perm_label} permission"
        );
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(json!({
                "error": "Access restricted",
                "message": denied_message
            })),
        )
            .into_response());
    }

    Ok(token_info)
}

/// Gate for sensitive proxy routes that need a higher privilege level than
/// plain DASHBOARD_VIEW (e.g. network-enabled firecracker). Requires the
/// same JWT checks plus DASHBOARD_MANAGE permission.
pub(crate) async fn require_dashboard_manage_with_query(
    headers: &HeaderMap,
    query: Option<&str>,
    service_name: &str,
) -> Result<Arc<TokenInfo>, Response> {
    require_dashboard_permission(
        headers,
        query,
        service_name,
        staff_perm::DASHBOARD_MANAGE,
        "DASHBOARD_MANAGE",
        "This feature requires DASHBOARD_MANAGE permission",
    )
    .await
}

pub(super) async fn require_dashboard_view_with_query(
    headers: &HeaderMap,
    query: Option<&str>,
    service_name: &str,
) -> Result<Arc<TokenInfo>, Response> {
    require_dashboard_permission(
        headers,
        query,
        service_name,
        staff_perm::DASHBOARD_VIEW,
        "DASHBOARD_VIEW",
        "You do not have permission to access the dashboard",
    )
    .await
}


pub(super) fn reqwest_headers(headers: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut out = reqwest::header::HeaderMap::new();
    for (k, v) in headers {
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_bytes(v.as_bytes()) {
                // `append` preserves multi-value headers (Accept, Cookie, ...).
                out.append(name, val);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, header};

    fn hdrs(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, HeaderValue::from_static(v));
        }
        h
    }

    #[test]
    fn extract_auth_token_prefers_authorization_header() {
        let h = hdrs(&[(header::AUTHORIZATION.as_str(), "Bearer abc123")]);
        assert_eq!(extract_auth_token(&h, None), Some("abc123"));
    }

    #[test]
    fn extract_auth_token_falls_back_to_query_access_token() {
        let h = HeaderMap::new();
        assert_eq!(
            extract_auth_token(&h, Some("foo=1&access_token=xyz&bar=2")),
            Some("xyz")
        );
    }

    #[test]
    fn extract_auth_token_accepts_kasm_session_cookie() {
        let h = hdrs(&[("cookie", "other=1; kasm_session=ksm-token")]);
        assert_eq!(extract_auth_token(&h, None), Some("ksm-token"));
    }

    #[test]
    fn extract_auth_token_accepts_dashboard_session_cookie() {
        let h = hdrs(&[("cookie", "dashboard_session=dash-token; foo=bar")]);
        assert_eq!(extract_auth_token(&h, None), Some("dash-token"));
    }

    #[test]
    fn extract_auth_token_returns_none_when_missing() {
        let h = HeaderMap::new();
        assert_eq!(extract_auth_token(&h, None), None);
        assert_eq!(extract_auth_token(&h, Some("foo=1")), None);
    }
}
