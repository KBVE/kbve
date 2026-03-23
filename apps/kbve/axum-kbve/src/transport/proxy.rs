use std::sync::OnceLock;

use axum::{
    body::{Body, Bytes},
    extract::{Path, Request},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tracing::{debug, warn};

use crate::auth::{extract_bearer_token, get_jwt_cache, jwt_cache::staff_perm};

// ---------------------------------------------------------------------------
// ServiceProxy — generic reverse proxy with optional upstream auth
// ---------------------------------------------------------------------------

struct ServiceProxy {
    name: &'static str,
    client: Client,
    upstream: String,
    /// If set, injected as `Authorization: Bearer <token>` on upstream requests.
    /// When `None`, no auth header is sent upstream (e.g. Grafana anonymous).
    upstream_token: Option<String>,
}

impl ServiceProxy {
    /// Authenticate the incoming request (JWT + DASHBOARD_VIEW) then forward
    /// to the upstream service.
    async fn handle(&self, path: Option<Path<String>>, req: Request<Body>) -> Response {
        // Extract headers before the async auth gate — `&Request<Body>` is not
        // `Send` (Body is !Sync), so we must not hold a reference to `req`
        // across an .await boundary.
        let req_headers = req.headers().clone();

        // --- JWT + staff gate ---
        if let Err(resp) = require_dashboard_view(&req_headers, self.name).await {
            return resp;
        }

        let suffix = path.map(|Path(p)| p).unwrap_or_default();
        let query = req
            .uri()
            .query()
            .map(|q| format!("?{q}"))
            .unwrap_or_default();
        let upstream_url = format!("{}/{}{}", self.upstream, suffix, query);

        let method = req.method().clone();
        let mut headers = req_headers;

        // Strip hop-by-hop and content-negotiation headers before forwarding
        // upstream. These must not cross proxy boundaries per RFC 7230 §6.1.
        // accept-encoding is removed so upstream never compresses — we buffer
        // the full body and re-serve it, so we need the raw bytes.
        headers.remove(header::HOST);
        headers.remove(header::AUTHORIZATION);
        headers.remove(header::ACCEPT_ENCODING);
        headers.remove(header::CONNECTION);
        headers.remove("te");
        headers.remove("trailers");
        headers.remove("upgrade");
        headers.remove("proxy-connection");

        // Inject upstream auth token if configured
        if let Some(token) = &self.upstream_token {
            if let Ok(val) = HeaderValue::from_str(&format!("Bearer {token}")) {
                headers.insert(header::AUTHORIZATION, val);
            }
        }

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

        // Collect headers before consuming the body.
        // Use `append` to preserve multi-value headers (e.g. Set-Cookie, Vary).
        let mut resp_headers = HeaderMap::new();
        for (k, v) in upstream_resp.headers() {
            if let Ok(name) = axum::http::HeaderName::from_bytes(k.as_str().as_bytes()) {
                if let Ok(val) = HeaderValue::from_bytes(v.as_bytes()) {
                    resp_headers.append(name, val);
                }
            }
        }

        // Strip hop-by-hop headers from the upstream response — they must not
        // be forwarded to the downstream client (RFC 7230 §6.1). In particular:
        //   transfer-encoding — body is already fully buffered; axum sets the
        //                        correct content-length automatically.
        //   connection        — forwarding "close" would make hyper close the
        //                        nginx keep-alive connection prematurely, which
        //                        nginx logs as "upstream prematurely closed".
        //   content-encoding  — reqwest may have decoded the body; forwarding
        //                        the original encoding header would mismatch.
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

        // When upstream returns a server error (5xx), wrap in our standard
        // format so the frontend always gets a parseable {"reason", "detail"}
        // response instead of raw upstream HTML/text.
        if upstream_status >= 500 {
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

// ---------------------------------------------------------------------------
// Shared JWT + staff permission gate
// ---------------------------------------------------------------------------

async fn require_dashboard_view(headers: &HeaderMap, service_name: &str) -> Result<(), Response> {
    let auth_header = match headers.get(header::AUTHORIZATION) {
        Some(h) => match h.to_str() {
            Ok(s) => s.to_string(),
            Err(_) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    axum::Json(json!({"error": "Invalid Authorization header encoding"})),
                )
                    .into_response());
            }
        },
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({
                    "error": "Missing Authorization header",
                    "hint": "Include 'Authorization: Bearer <token>' header"
                })),
            )
                .into_response());
        }
    };

    let token = match extract_bearer_token(&auth_header) {
        Some(t) => t.to_string(),
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Invalid Authorization header format"})),
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

    let token_info = match jwt_cache.verify_and_cache(&token).await {
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

    if !token_info.has_permission(staff_perm::DASHBOARD_VIEW) {
        warn!(
            user_id = %token_info.user_id,
            permissions = format!("0x{:08x}", token_info.staff_permissions),
            "{service_name} proxy access denied — missing DASHBOARD_VIEW permission"
        );
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(json!({
                "error": "Access restricted",
                "message": "You do not have permission to access the dashboard"
            })),
        )
            .into_response());
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Grafana proxy singleton
// ---------------------------------------------------------------------------

static GRAFANA: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_grafana_proxy() -> bool {
    let upstream = match std::env::var("GRAFANA_UPSTREAM_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client for grafana proxy");

    GRAFANA
        .set(ServiceProxy {
            name: "Grafana",
            client,
            upstream,
            upstream_token: None,
        })
        .is_ok()
}

pub async fn grafana_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match GRAFANA.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Grafana proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// ArgoCD proxy singleton
// ---------------------------------------------------------------------------

static ARGO: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_argo_proxy() -> bool {
    let upstream = match std::env::var("ARGOCD_UPSTREAM_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let auth_token = match std::env::var("ARGOCD_AUTH_TOKEN") {
        Ok(t) => t,
        Err(_) => return false,
    };

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120));

    if let Ok(ca_path) = std::env::var("ARGOCD_CA_CERT_PATH") {
        match std::fs::read(&ca_path) {
            Ok(pem) => match reqwest::Certificate::from_pem(&pem) {
                Ok(cert) => {
                    builder = builder.add_root_certificate(cert);
                    debug!("loaded ArgoCD CA certificate from {ca_path}");
                }
                Err(e) => {
                    warn!("failed to parse ArgoCD CA cert at {ca_path}: {e}");
                    return false;
                }
            },
            Err(e) => {
                warn!("failed to read ArgoCD CA cert at {ca_path}: {e}");
                return false;
            }
        }
    }

    let client = builder
        .build()
        .expect("failed to build reqwest client for argo proxy");

    ARGO.set(ServiceProxy {
        name: "ArgoCD",
        client,
        upstream,
        upstream_token: Some(auth_token),
    })
    .is_ok()
}

pub async fn argo_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match ARGO.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "ArgoCD proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// ClickHouse logs proxy singleton
// ---------------------------------------------------------------------------

static CLICKHOUSE_LOGS: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_clickhouse_logs_proxy() -> bool {
    let supabase_url = match std::env::var("SUPABASE_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };
    let upstream = format!("{supabase_url}/functions/v1/logs");

    let service_role_key = match std::env::var("SUPABASE_SERVICE_ROLE_KEY") {
        Ok(k) => k,
        Err(_) => return false,
    };

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for clickhouse logs proxy");

    CLICKHOUSE_LOGS
        .set(ServiceProxy {
            name: "ClickHouse Logs",
            client,
            upstream,
            upstream_token: Some(service_role_key),
        })
        .is_ok()
}

pub async fn clickhouse_logs_proxy_handler(
    path: Option<Path<String>>,
    req: Request<Body>,
) -> Response {
    match CLICKHOUSE_LOGS.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "ClickHouse logs proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Forgejo proxy singleton
// ---------------------------------------------------------------------------

static FORGEJO: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_forgejo_proxy() -> bool {
    let upstream = match std::env::var("FORGEJO_UPSTREAM_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let auth_token = match std::env::var("FORGEJO_AUTH_TOKEN") {
        Ok(t) => t,
        Err(_) => return false,
    };

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client for forgejo proxy");

    FORGEJO
        .set(ServiceProxy {
            name: "Forgejo",
            client,
            upstream,
            upstream_token: Some(auth_token),
        })
        .is_ok()
}

pub async fn forgejo_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match FORGEJO.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Forgejo proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// KubeVirt proxy singleton (Kubernetes API for VM control)
// ---------------------------------------------------------------------------

static KUBEVIRT: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_kubevirt_proxy() -> bool {
    let upstream = match std::env::var("KUBEVIRT_API_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let auth_token = match std::env::var("KUBEVIRT_TOKEN") {
        Ok(t) => t,
        Err(_) => {
            // Fall back to in-cluster service account token
            match std::fs::read_to_string("/var/run/secrets/kubernetes.io/serviceaccount/token") {
                Ok(t) => t.trim().to_string(),
                Err(_) => return false,
            }
        }
    };

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30));

    // Load CA cert for K8s API TLS verification
    if let Ok(ca_path) = std::env::var("KUBEVIRT_CA_CERT_PATH") {
        match std::fs::read(&ca_path) {
            Ok(pem) => match reqwest::Certificate::from_pem(&pem) {
                Ok(cert) => {
                    builder = builder.add_root_certificate(cert);
                    debug!("loaded KubeVirt CA certificate from {ca_path}");
                }
                Err(e) => {
                    warn!("failed to parse KubeVirt CA cert at {ca_path}: {e}");
                    return false;
                }
            },
            Err(e) => {
                warn!("failed to read KubeVirt CA cert at {ca_path}: {e}");
                return false;
            }
        }
    } else {
        // Fall back to in-cluster CA
        let ca_path = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
        if let Ok(pem) = std::fs::read(ca_path) {
            if let Ok(cert) = reqwest::Certificate::from_pem(&pem) {
                builder = builder.add_root_certificate(cert);
                debug!("loaded in-cluster CA certificate from {ca_path}");
            }
        }
    }

    let client = builder
        .build()
        .expect("failed to build reqwest client for kubevirt proxy");

    KUBEVIRT
        .set(ServiceProxy {
            name: "KubeVirt",
            client,
            upstream,
            upstream_token: Some(auth_token),
        })
        .is_ok()
}

pub async fn kubevirt_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match KUBEVIRT.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "KubeVirt proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Edge Functions proxy singleton (Supabase → internal Kong)
// ---------------------------------------------------------------------------

static EDGE: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_edge_proxy() -> bool {
    let supabase_url = match std::env::var("SUPABASE_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };
    // Proxy to the Supabase functions base — callers append /health, /meme, etc.
    let upstream = format!("{supabase_url}/functions/v1");

    let service_role_key = match std::env::var("SUPABASE_SERVICE_ROLE_KEY") {
        Ok(k) => k,
        Err(_) => return false,
    };

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client for edge proxy");

    EDGE.set(ServiceProxy {
        name: "Edge",
        client,
        upstream,
        upstream_token: Some(service_role_key),
    })
    .is_ok()
}

pub async fn edge_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match EDGE.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Edge proxy not configured"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Convert axum HeaderMap to reqwest HeaderMap
// ---------------------------------------------------------------------------

fn reqwest_headers(headers: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut out = reqwest::header::HeaderMap::new();
    for (k, v) in headers {
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_bytes(v.as_bytes()) {
                // Use append to preserve multi-value headers (Accept, Cookie, etc.)
                out.append(name, val);
            }
        }
    }
    out
}
