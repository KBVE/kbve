use std::collections::HashMap;
use std::sync::OnceLock;

use axum::{
    body::{Body, Bytes},
    extract::{FromRequestParts, Path, Request},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tracing::{debug, warn};

use crate::auth::{
    extract_bearer_token, get_jwt_cache,
    jwt_cache::{TokenInfo, staff_perm},
};

struct ServiceProxy {
    name: &'static str,
    client: Client,
    upstream: String,
    /// If set, injected as `Authorization: Bearer <token>` on upstream requests.
    /// When `None`, no auth header is sent upstream (e.g. Grafana anonymous).
    upstream_token: Option<String>,
    upstream_headers: Vec<(HeaderName, HeaderValue)>,
    /// When true, strip X-Frame-Options and Content-Security-Policy frame-ancestors
    /// from upstream responses so the proxied service can be embedded in an iframe
    /// (e.g. KASM workspace viewer).
    iframe_safe: bool,
    /// When true, stream the response body instead of buffering it.
    /// Required for services with chunked/streaming responses that
    /// can't be fully buffered (e.g. KASM websockify sends responses
    /// that hyper fails to decode when buffered via `.bytes().await`).
    streaming: bool,
}

impl ServiceProxy {
    /// Authenticate the incoming request (JWT + DASHBOARD_VIEW) then forward
    /// to the upstream service.
    async fn handle(&self, path: Option<Path<String>>, mut req: Request<Body>) -> Response {
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
    async fn handle_method_aware(
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
            require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), self.name).await
        };

        if let Err(resp) = gate {
            return resp;
        }

        req.headers_mut().remove("x-kbve-account-id");
        self.forward_request(path, req, None).await
    }

    /// Forward the request without running the DASHBOARD_VIEW gate. Callers
    /// must have already authenticated.
    async fn handle_preauthorized(
        &self,
        path: Option<Path<String>>,
        req: Request<Body>,
    ) -> Response {
        self.forward_request(path, req, None).await
    }

    /// Like `handle_preauthorized` but injects an upstream `Authorization`
    /// header value instead of the configured upstream_token. Used for KASM
    /// where the upstream password rotates per pod start.
    async fn handle_with_auth(
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
fn extract_auth_token<'a>(headers: &'a HeaderMap, query: Option<&'a str>) -> Option<&'a str> {
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

/// Gate for sensitive proxy routes that need a higher privilege level than
/// plain DASHBOARD_VIEW (e.g. network-enabled firecracker). Requires the
/// same JWT checks plus DASHBOARD_MANAGE permission.
pub(crate) async fn require_dashboard_manage_with_query(
    headers: &HeaderMap,
    query: Option<&str>,
    service_name: &str,
) -> Result<TokenInfo, Response> {
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

    if !token_info.has_permission(staff_perm::DASHBOARD_MANAGE) {
        warn!(
            user_id = %token_info.user_id,
            permissions = format!("0x{:08x}", token_info.staff_permissions),
            "{service_name} proxy access denied — missing DASHBOARD_MANAGE permission"
        );
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(json!({
                "error": "Access restricted",
                "message": "This feature requires DASHBOARD_MANAGE permission"
            })),
        )
            .into_response());
    }

    Ok(token_info)
}

async fn require_dashboard_view_with_query(
    headers: &HeaderMap,
    query: Option<&str>,
    service_name: &str,
) -> Result<TokenInfo, Response> {
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

    Ok(token_info)
}

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
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
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
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: false,
    })
    .is_ok()
}

pub async fn argo_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match ARGO.get() {
        // Method-aware: GET reads require DASHBOARD_VIEW; mutating verbs
        // (sync, refresh-via-POST, delete) require DASHBOARD_MANAGE.
        Some(proxy) => proxy.handle_method_aware(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "ArgoCD proxy not configured"})),
        )
            .into_response(),
    }
}

use jedi::entity::pipe_clickhouse::alerts as ch_alerts;
use jedi::entity::pipe_clickhouse::factorio as ch_factorio;
use jedi::entity::pipe_clickhouse::logs as ch_logs;
use jedi::state::sidecar::ClickHouseConfig;

static CLICKHOUSE_DIRECT: OnceLock<ClickHouseConfig> = OnceLock::new();

pub fn init_clickhouse_direct() -> bool {
    let (config, url_explicit) = ClickHouseConfig::from_env_resolved();

    if !url_explicit {
        warn!(
            "ClickHouse direct route refused — set CLICKHOUSE_ENDPOINT (preferred) or \
             CLICKHOUSE_HOST/PORT in the deployment env."
        );
        return false;
    }

    if config.database == "default" && std::env::var("CLICKHOUSE_DATABASE").is_err() {
        warn!(
            "ClickHouse direct route initialized with database=default — set \
             CLICKHOUSE_DATABASE (e.g. observability) so queries hit the right schema."
        );
    }

    CLICKHOUSE_DIRECT.set(config).is_ok()
}

/// Body schema for `POST /dashboard/clickhouse/proxy`. Mirrors the legacy
/// supabase edge function at `/functions/v1/logs` so the dashboard JS in
/// `clickhouseService.ts` doesn't have to change. Bounds are enforced inside
/// jedi (`pipe_clickhouse::logs`):
/// - `minutes` clamped to `1..=10080`
/// - `limit` clamped to `1..=500`
/// - `search` truncated to 100 chars
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
pub struct ClickHouseLogsRequest {
    /// Either `"query"` (filtered SELECT) or `"stats"` (GROUP BY).
    pub command: String,
    /// Filter by Kubernetes namespace (e.g. `"kbve"`, `"kilobase"`).
    #[serde(default)]
    pub pod_namespace: Option<String>,
    /// Filter by exact pod name.
    #[serde(default)]
    pub pod_name: Option<String>,
    /// Filter by `service` label as emitted by Vector (e.g. `"axum-kbve"`).
    #[serde(default)]
    pub service: Option<String>,
    /// Filter by log level (`"error"`, `"warn"`, `"info"`, ...). Lowercased
    /// before matching.
    #[serde(default)]
    pub level: Option<String>,
    /// `ILIKE %search%` against the message body.
    #[serde(default)]
    pub search: Option<String>,
    /// Lookback window in minutes. Defaults to 60, clamped 1..=10080.
    #[serde(default)]
    pub minutes: Option<u32>,
    /// Max rows returned. Defaults to 100, clamped 1..=500. Stats responses
    /// always return up to 200 rows regardless of this value.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Time-bucket width in seconds for `rows_request_rate`. Defaults to 30,
    /// clamped 5..=3600. Ignored by other commands.
    #[serde(default)]
    pub bucket_seconds: Option<u32>,
    /// Filter by Factorio `server_id` for the `factorio_*` commands. Ignored
    /// by log/alert commands.
    #[serde(default)]
    pub server_id: Option<String>,
}

/// Response shape for the ClickHouse logs route. `rows` is the raw
/// `JSONEachRow` output from ClickHouse — one object per record with keys
/// matching `observability.logs_distributed` columns for `"query"`, or
/// `{ pod_namespace, service, level, cnt }` for `"stats"`.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
pub struct ClickHouseLogsResponse {
    /// One JSON object per row. Shape depends on `command`:
    /// - `"query"` → `{ timestamp, pod_namespace, service, level, message, pod_name, metadata }`
    /// - `"stats"` → `{ pod_namespace, service, level, cnt }`
    /// - `"error_groups"` → `{ pod_namespace, service, signature, cnt, last_seen, sample }`
    #[schema(value_type = Vec<serde_json::Value>)]
    pub rows: Vec<serde_json::Value>,
    pub count: usize,
}

#[utoipa::path(
    post,
    path = "/dashboard/clickhouse/proxy",
    tag = "dashboard",
    request_body = ClickHouseLogsRequest,
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Rows from observability.logs_distributed (query) or aggregated counts (stats)", body = ClickHouseLogsResponse),
        (status = 400, description = "Malformed JSON body or unknown `command`"),
        (status = 401, description = "Missing or invalid Bearer token"),
        (status = 403, description = "Token lacks DASHBOARD_VIEW staff permission"),
        (status = 502, description = "ClickHouse cluster returned an error or was unreachable"),
        (status = 503, description = "ClickHouse direct route not configured (CLICKHOUSE_* env vars unset)")
    )
)]
pub async fn clickhouse_logs_proxy_handler(headers: HeaderMap, body: Bytes) -> Response {
    if let Err(resp) = require_dashboard_view(&headers, "ClickHouse Logs").await {
        return resp;
    }

    let config = match CLICKHOUSE_DIRECT.get() {
        Some(c) => c,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "ClickHouse direct route not configured"})),
            )
                .into_response();
        }
    };

    let req: ClickHouseLogsRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": format!("invalid JSON body: {e}")})),
            )
                .into_response();
        }
    };

    let result = match req.command.as_str() {
        "query" => {
            let params = ch_logs::LogsQueryParams {
                pod_namespace: req.pod_namespace,
                pod_name: req.pod_name,
                service: req.service,
                level: req.level,
                search: req.search,
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_query(config, &params).await
        }
        "stats" => {
            let params = ch_logs::LogsStatsParams {
                minutes: req.minutes,
            };
            ch_logs::run_stats(config, &params).await
        }
        "error_groups" => {
            let params = ch_logs::ErrorGroupsParams {
                pod_namespace: req.pod_namespace,
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_error_groups(config, &params).await
        }
        "rows_request_rate" => {
            let params = ch_logs::RowsRequestRateParams {
                minutes: req.minutes,
                bucket_seconds: req.bucket_seconds,
            };
            ch_logs::run_rows_request_rate(config, &params).await
        }
        "rows_status_histogram" => {
            let params = ch_logs::RowsStatusHistogramParams {
                minutes: req.minutes,
            };
            ch_logs::run_rows_status_histogram(config, &params).await
        }
        "rows_top_endpoints" => {
            let params = ch_logs::RowsTopEndpointsParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_rows_top_endpoints(config, &params).await
        }
        "rows_errors" => {
            let params = ch_logs::RowsErrorsParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_logs::run_rows_errors(config, &params).await
        }
        "alerts_recent" => {
            let params = ch_alerts::AlertsRecentParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_alerts::run_alerts_recent(config, &params).await
        }
        "alerts_firing" => {
            let params = ch_alerts::AlertsFiringParams {
                minutes: req.minutes,
            };
            ch_alerts::run_alerts_firing(config, &params).await
        }
        "alerts_by_severity" => {
            let params = ch_alerts::AlertsBySeverityParams {
                minutes: req.minutes,
            };
            ch_alerts::run_alerts_by_severity(config, &params).await
        }
        "alerts_top" => {
            let params = ch_alerts::AlertsTopParams {
                minutes: req.minutes,
                limit: req.limit,
            };
            ch_alerts::run_alerts_top(config, &params).await
        }
        "factorio_current" | "factorio_snapshots" | "factorio_players" | "factorio_chat"
        | "factorio_rotations" => {
            let params = ch_factorio::FactorioParams {
                server_id: req.server_id,
                minutes: req.minutes,
                limit: req.limit,
            };
            match req.command.as_str() {
                "factorio_current" => ch_factorio::run_current(config, &params).await,
                "factorio_snapshots" => ch_factorio::run_snapshots(config, &params).await,
                "factorio_players" => ch_factorio::run_players(config, &params).await,
                "factorio_chat" => ch_factorio::run_chat(config, &params).await,
                _ => ch_factorio::run_rotations(config, &params).await,
            }
        }
        other => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({
                    "error": format!(
                        "unknown command '{other}', expected one of: \
                         query, stats, error_groups, rows_request_rate, rows_status_histogram, \
                         rows_top_endpoints, rows_errors, \
                         alerts_recent, alerts_firing, alerts_by_severity, alerts_top, \
                         factorio_current, factorio_snapshots, factorio_players, \
                         factorio_chat, factorio_rotations"
                    )
                })),
            )
                .into_response();
        }
    };

    match result {
        Ok(out) => axum::Json(ClickHouseLogsResponse {
            rows: out.rows,
            count: out.count,
        })
        .into_response(),
        Err(e) => {
            warn!("ClickHouse logs query failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("ClickHouse query failed: {e}")})),
            )
                .into_response()
        }
    }
}

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
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn forgejo_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    match FORGEJO.get() {
        Some(proxy) => proxy.handle_method_aware(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Forgejo proxy not configured"})),
        )
            .into_response(),
    }
}

static KUBEVIRT: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_kubevirt_proxy() -> bool {
    let upstream = match std::env::var("KUBEVIRT_API_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };

    let auth_token = match std::env::var("KUBEVIRT_TOKEN") {
        Ok(t) => t,
        Err(_) => {
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
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
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

/// Bridges a browser WebSocket to the KubeVirt VNC subresource so the
/// dashboard can run interactive noVNC sessions.
pub async fn kubevirt_vnc_handler(
    Path(vm_name): Path<String>,
    ws: axum::extract::ws::WebSocketUpgrade,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    // Browser WebSocket API cannot set custom headers, so the auth gate
    // also accepts ?access_token= as a fallback.
    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "KubeVirt-VNC").await
    {
        return resp;
    }

    let kubevirt = match KUBEVIRT.get() {
        Some(k) => k,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "KubeVirt proxy not configured"})),
            )
                .into_response();
        }
    };

    if !vm_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid VM name"})),
        )
            .into_response();
    }

    let upstream_url = format!(
        "{}/apis/subresources.kubevirt.io/v1/namespaces/{}/virtualmachineinstances/{}/vnc",
        kubevirt.upstream, VM_NAMESPACE, vm_name
    );
    let upstream_token = kubevirt.upstream_token.clone();
    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    let viewer_id = query_param(query.as_deref(), "viewer_id");

    ws.protocols(["binary.k8s.io", "base64.binary.k8s.io"])
        .on_upgrade(move |browser_ws| async move {
            if let Err(e) = super::vnc_hub::join_session(
                vm_key,
                upstream_url,
                upstream_token,
                viewer_id,
                browser_ws,
            )
            .await
            {
                warn!("VNC hub error for {vm_name}: {e}");
            }
        })
}

fn query_param(query: Option<&str>, key: &str) -> Option<String> {
    url::form_urlencoded::parse(query?.as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

pub async fn kubevirt_vnc_control_handler(
    Path(vm_name): Path<String>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Control").await
    {
        return resp;
    }

    let body_bytes = match axum::body::to_bytes(req.into_body(), 4096).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "invalid body"})),
            )
                .into_response();
        }
    };
    let payload: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "invalid JSON"})),
            )
                .into_response();
        }
    };

    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let viewer_id = payload
        .get("viewer_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if viewer_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "missing viewer_id"})),
        )
            .into_response();
    }

    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    let ok = match action {
        "take" => super::vnc_hub::request_control(&vm_key, viewer_id),
        "release" => super::vnc_hub::release_control(&vm_key, viewer_id),
        "deny" => super::vnc_hub::deny_control(&vm_key, viewer_id),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "unknown action"})),
            )
                .into_response();
        }
    };

    axum::Json(json!({"ok": ok})).into_response()
}

const VM_NAMESPACE: &str = "angelscript";
const KASM_NAMESPACE: &str = "kasm";

/// GET /dashboard/vm/vnc-info/{name} — returns viewer count for a specific VM
pub async fn kubevirt_vnc_info_handler(
    Path(vm_name): Path<String>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Info").await
    {
        return resp;
    }

    let vm_key = format!("{VM_NAMESPACE}/{vm_name}");
    match super::vnc_hub::get_session_info(&vm_key) {
        Some(info) => axum::Json(info).into_response(),
        None => axum::Json(json!({
            "vm_key": vm_key,
            "viewers": 0,
            "has_primary": false,
            "controller_viewer_id": null,
            "viewers_list": [],
            "pending": null
        }))
        .into_response(),
    }
}

/// GET /dashboard/vm/vnc-sessions — returns all active VNC sessions
pub async fn kubevirt_vnc_sessions_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "VNC-Sessions").await
    {
        return resp;
    }

    let sessions = super::vnc_hub::list_sessions();
    axum::Json(json!({"sessions": sessions})).into_response()
}

static KASM: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_kasm_proxy() -> bool {
    let upstream = std::env::var("KASM_UPSTREAM_URL")
        .unwrap_or_else(|_| "https://kasm-vpn-service.kasm.svc.cluster.local:6901".into());

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        // No overall timeout — KASM streams VNC data that can last hours.
        // The Cilium gateway caps the outer request at 3600s.
        .danger_accept_invalid_certs(true)
        // websockify (KASM's built-in server) doesn't support h2; ALPN
        // negotiation can also cause spurious resets.
        .http1_only();

    let ca_path = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
    if let Ok(pem) = std::fs::read(ca_path) {
        if let Ok(cert) = reqwest::Certificate::from_pem(&pem) {
            builder = builder.add_root_certificate(cert);
        }
    }

    let client = builder
        .build()
        .expect("failed to build reqwest client for kasm proxy");

    KASM.set(ServiceProxy {
        name: "KASM",
        client,
        upstream: upstream.trim_end_matches('/').to_string(),
        upstream_token: None,
        upstream_headers: Vec::new(),
        iframe_safe: true,
        // websockify chunked responses fail when buffered.
        streaming: true,
    })
    .is_ok()
}

/// Cached `kasm-vnc-pw` value.
static KASM_VNC_PW_CACHE: OnceLock<tokio::sync::RwLock<Option<String>>> = OnceLock::new();

fn kasm_pw_cache() -> &'static tokio::sync::RwLock<Option<String>> {
    KASM_VNC_PW_CACHE.get_or_init(|| tokio::sync::RwLock::new(None))
}

/// Fetch and base64-decode the `kasm-vnc-pw` Secret in the `kasm` namespace.
async fn fetch_kasm_vnc_password() -> Result<String, String> {
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD as B64;

    let kubevirt = KUBEVIRT
        .get()
        .ok_or_else(|| "K8s API not configured".to_string())?;

    let url = format!(
        "{}/api/v1/namespaces/{}/secrets/kasm-vnc-pw",
        kubevirt.upstream, KASM_NAMESPACE
    );

    let mut req = kubevirt
        .client
        .get(&url)
        .header("Accept", "application/json");
    if let Some(ref token) = kubevirt.upstream_token {
        req = req.bearer_auth(token);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("K8s API request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Secret fetch returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid Secret response: {e}"))?;

    let b64 = body
        .get("data")
        .and_then(|d| d.get("password"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "kasm-vnc-pw missing `data.password`".to_string())?;

    let bytes = B64
        .decode(b64.as_bytes())
        .map_err(|e| format!("Failed to decode password: {e}"))?;

    let pw = String::from_utf8(bytes).map_err(|e| format!("Password not valid utf-8: {e}"))?;

    if pw.len() < 16 || !pw.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("kasm-vnc-pw value outside expected charset".to_string());
    }

    Ok(pw)
}

async fn cached_kasm_password(force_refresh: bool) -> Result<String, String> {
    let cache = kasm_pw_cache();
    if !force_refresh {
        if let Some(p) = cache.read().await.clone() {
            return Ok(p);
        }
    }
    let pw = fetch_kasm_vnc_password().await?;
    *cache.write().await = Some(pw.clone());
    Ok(pw)
}

/// True if the incoming request is a WebSocket upgrade (RFC 6455).
fn is_websocket_upgrade(headers: &HeaderMap) -> bool {
    fn header_contains(headers: &HeaderMap, name: &str, needle: &str) -> bool {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.split(',').any(|t| t.trim().eq_ignore_ascii_case(needle)))
            .unwrap_or(false)
    }
    header_contains(headers, "connection", "upgrade")
        && header_contains(headers, "upgrade", "websocket")
}

fn build_kasm_basic_auth(password: &str) -> String {
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD as B64;
    let creds = format!("kasm_user:{password}");
    format!("Basic {}", B64.encode(creds.as_bytes()))
}

pub async fn kasm_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let proxy = match KASM.get() {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "KASM proxy not configured"})),
            )
                .into_response();
        }
    };

    let req_headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), proxy.name).await
    {
        return resp;
    }

    if is_websocket_upgrade(&req_headers) {
        let suffix = path.as_ref().map(|Path(p)| p.clone()).unwrap_or_default();
        let query_str = raw_query
            .as_deref()
            .map(|q| format!("?{q}"))
            .unwrap_or_default();
        let upstream_url = format!("{}/{}{}", proxy.upstream, suffix, query_str);
        let upstream_origin = proxy.upstream.clone();

        let (mut parts, _body) = req.into_parts();
        match axum::extract::ws::WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
            Ok(ws) => {
                return kasm_ws_handler(ws, upstream_url, upstream_origin).await;
            }
            Err(rej) => return rej.into_response(),
        }
    }

    let password = match cached_kasm_password(false).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM password fetch failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("KASM password unavailable: {e}")})),
            )
                .into_response();
        }
    };

    let auth = build_kasm_basic_auth(&password);

    let path_inner: Option<String> = path.map(|Path(p)| p);
    let (parts, body) = req.into_parts();
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

    let req1 = Request::from_parts(parts.clone(), Body::from(body_bytes.clone()));
    let resp = proxy
        .handle_with_auth(path_inner.clone().map(Path), req1, auth)
        .await;

    if resp.status() != StatusCode::UNAUTHORIZED {
        return resp;
    }

    let fresh = match cached_kasm_password(true).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM password refresh failed after 401: {e}");
            return resp;
        }
    };
    let auth2 = build_kasm_basic_auth(&fresh);
    let req2 = Request::from_parts(parts, Body::from(body_bytes));
    proxy
        .handle_with_auth(path_inner.map(Path), req2, auth2)
        .await
}

/// Bridge a browser WebSocket upgrade to KasmVNC's websockify via the
/// shared `vnc_hub`.
async fn kasm_ws_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    upstream_url: String,
    upstream_origin: String,
) -> Response {
    let password = match cached_kasm_password(false).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM-WS password fetch failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("KASM password unavailable: {e}")})),
            )
                .into_response();
        }
    };
    let auth = build_kasm_basic_auth(&password);

    let auth_hv = match auth.parse() {
        Ok(v) => v,
        Err(e) => {
            warn!("KASM WS auth header invalid: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "bad upstream auth").into_response();
        }
    };
    let origin_hv = match upstream_origin.parse() {
        Ok(v) => v,
        Err(e) => {
            warn!("KASM WS origin invalid: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "bad upstream origin").into_response();
        }
    };
    let tls = match super::vnc_hub::build_accept_any_tls_connector() {
        Ok(c) => c,
        Err(e) => {
            warn!("KASM TLS connector build failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "tls setup failed").into_response();
        }
    };
    let config = super::vnc_hub::UpstreamConfig {
        auth_header: Some(auth_hv),
        origin: Some(origin_hv),
        subprotocols: Some("binary".parse().expect("static header value")),
        tls_connector: tls,
    };
    let session_key = format!("kasm::{}", upstream_url);

    ws.protocols(["binary"])
        .on_upgrade(move |browser_ws| async move {
            if let Err(e) = super::vnc_hub::join_session_with_config(
                session_key,
                upstream_url.clone(),
                config,
                None,
                browser_ws,
            )
            .await
            {
                warn!(%upstream_url, "KASM WS hub error: {e}");
            }
        })
}

/// List KASM workspace deployments via K8s API.
/// Returns deployment name, replicas, and status for the dashboard.
pub async fn kasm_workspaces_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "KASM-Workspaces").await {
        return resp;
    }

    let kubevirt = match KUBEVIRT.get() {
        Some(k) => k,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "K8s API not configured"})),
            )
                .into_response();
        }
    };

    let url = format!(
        "{}/apis/apps/v1/namespaces/{}/deployments",
        kubevirt.upstream, KASM_NAMESPACE
    );

    let mut upstream_req = kubevirt
        .client
        .get(&url)
        .header("Accept", "application/json");
    if let Some(ref token) = kubevirt.upstream_token {
        upstream_req = upstream_req.bearer_auth(token);
    }

    match upstream_req.send().await {
        Ok(resp) if resp.status().is_success() => match resp.bytes().await {
            Ok(body) => Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(Body::from(body))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()),
            Err(e) => (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("Failed to read K8s response: {e}")})),
            )
                .into_response(),
        },
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("K8s API returned {status}: {}", truncate_body(&body, 200))})),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(json!({"error": format!("K8s API request failed: {e}")})),
        )
            .into_response(),
    }
}

/// Scale a KASM workspace deployment (replicas 0 or 1).
pub async fn kasm_scale_handler(Path(name): Path<String>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "KASM-Scale").await {
        return resp;
    }

    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid deployment name"})),
        )
            .into_response();
    }

    let kubevirt = match KUBEVIRT.get() {
        Some(k) => k,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "K8s API not configured"})),
            )
                .into_response();
        }
    };

    let body_bytes = match axum::body::to_bytes(req.into_body(), 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "Invalid request body"})),
            )
                .into_response();
        }
    };

    let replicas: i32 = match serde_json::from_slice::<serde_json::Value>(&body_bytes)
        .ok()
        .and_then(|v| v.get("replicas")?.as_i64())
        .map(|r| r as i32)
    {
        Some(r) if r == 0 || r == 1 => r,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "replicas must be 0 or 1"})),
            )
                .into_response();
        }
    };

    let url = format!(
        "{}/apis/apps/v1/namespaces/{}/deployments/{}/scale",
        kubevirt.upstream, KASM_NAMESPACE, name
    );

    let scale_body = json!({
        "apiVersion": "autoscaling/v1",
        "kind": "Scale",
        "metadata": { "name": name, "namespace": KASM_NAMESPACE },
        "spec": { "replicas": replicas }
    });

    let mut upstream_req = kubevirt
        .client
        .put(&url)
        .header("Content-Type", "application/json")
        .json(&scale_body);
    if let Some(ref token) = kubevirt.upstream_token {
        upstream_req = upstream_req.bearer_auth(token);
    }

    match upstream_req.send().await {
        Ok(resp) if resp.status().is_success() => axum::Json(json!({
            "success": true,
            "deployment": name,
            "replicas": replicas,
        }))
        .into_response(),
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("Scale failed {status}: {}", truncate_body(&body, 200))})),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(json!({"error": format!("Scale request failed: {e}")})),
        )
            .into_response(),
    }
}

/// JWT-gated 302 to the noVNC UI with the rotated `kasm-vnc-pw` and a
/// path-scoped session cookie.
pub async fn kasm_launch_handler(req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_view_with_query(&headers, query.as_deref(), "KASM-Launch").await
    {
        return resp;
    }

    let password = match cached_kasm_password(true).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM-Launch password fetch failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("KASM password unavailable: {e}")})),
            )
                .into_response();
        }
    };

    let location = format!(
        "/dashboard/kasm/proxy/?password={password}&autoconnect=1&resize=remote&path=dashboard/kasm/proxy/websockify"
    );

    let access_token = extract_auth_token(&headers, query.as_deref()).unwrap_or_default();
    let cookie = format!(
        "kasm_session={access_token}; Path=/dashboard/kasm/proxy/; HttpOnly; Secure; SameSite=Strict; Max-Age=14400"
    );

    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::SET_COOKIE, cookie)
        .body(Body::empty())
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

const KASM_NAV_SHIM_PORT: u16 = 9998;
const MAX_LAUNCH_URL_LEN: usize = 2048;

fn truncate_body(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn ipv4_blocked(ip: &std::net::Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
}

fn url_passes_policy(raw: &str) -> Result<(), &'static str> {
    if raw.is_empty() || raw.len() > MAX_LAUNCH_URL_LEN {
        return Err("invalid url length");
    }
    let parsed = url::Url::parse(raw).map_err(|_| "url parse failed")?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("scheme not allowed"),
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("embedded credentials rejected");
    }
    let host = parsed.host().ok_or("host required")?;
    match host {
        url::Host::Domain(d) => {
            let lower = d.to_ascii_lowercase();
            if lower == "localhost"
                || lower.ends_with(".localhost")
                || lower.ends_with(".internal")
                || lower.ends_with(".cluster.local")
                || lower.ends_with(".svc")
            {
                return Err("host not allowed");
            }
        }
        url::Host::Ipv4(ip) => {
            if ipv4_blocked(&ip) {
                return Err("ipv4 host not allowed");
            }
        }
        url::Host::Ipv6(ip) => {
            // IPv4-mapped/compatible forms (::ffff:127.0.0.1, ::169.254.169.254)
            // must run the IPv4 policy or they slip past the IPv6 checks and
            // reach loopback / link-local (cloud metadata).
            if let Some(v4) = ip.to_ipv4_mapped().or_else(|| ip.to_ipv4()) {
                if ipv4_blocked(&v4) {
                    return Err("ipv6-mapped ipv4 host not allowed");
                }
            }
            if ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (ip.segments()[0] & 0xfe00) == 0xfc00
            {
                return Err("ipv6 host not allowed");
            }
        }
    }
    Ok(())
}

/// POST /dashboard/kasm/launch-url/{name} body `{"url": "..."}` — forwards
/// to the kasm-void nav shim. Reuses `kasm-vnc-pw` as the bearer token; the
/// nav shim only exposes Page.navigate on top of localhost-bound CDP.
pub async fn kasm_launch_url_handler(Path(name): Path<String>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "KASM-LaunchURL").await {
        return resp;
    }

    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') || name.len() > 63 {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid deployment name"})),
        )
            .into_response();
    }

    let body_bytes = match axum::body::to_bytes(req.into_body(), 4096).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "Invalid request body"})),
            )
                .into_response();
        }
    };

    let payload: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "Body is not valid JSON"})),
            )
                .into_response();
        }
    };

    let url = match payload.get("url").and_then(|v| v.as_str()) {
        Some(s) => s.trim().to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({"error": "Missing `url` field"})),
            )
                .into_response();
        }
    };

    if let Err(reason) = url_passes_policy(&url) {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": reason})),
        )
            .into_response();
    }

    let kasm = match KASM.get() {
        Some(k) => k,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "KASM proxy not configured"})),
            )
                .into_response();
        }
    };

    let token = match cached_kasm_password(false).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM-LaunchURL token fetch failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("token unavailable: {e}")})),
            )
                .into_response();
        }
    };

    let nav_url = format!(
        "http://kasm-vpn-service.{KASM_NAMESPACE}.svc.cluster.local:{KASM_NAV_SHIM_PORT}/open"
    );
    let body = json!({"url": url});

    let attempt = |bearer: String| {
        let nav_url = nav_url.clone();
        let body = body.clone();
        let client = kasm.client.clone();
        async move {
            client
                .post(&nav_url)
                .timeout(Duration::from_secs(10))
                .bearer_auth(bearer)
                .json(&body)
                .send()
                .await
        }
    };

    let resp = match attempt(token.clone()).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("nav shim unreachable: {e}")})),
            )
                .into_response();
        }
    };

    if resp.status() != reqwest::StatusCode::UNAUTHORIZED {
        return relay_nav_response(&name, resp).await;
    }

    // Token may be stale after a session-driven password rotation; refresh and retry once.
    let refreshed = match cached_kasm_password(true).await {
        Ok(p) => p,
        Err(e) => {
            warn!("KASM-LaunchURL token refresh failed: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(json!({"error": format!("token refresh failed: {e}")})),
            )
                .into_response();
        }
    };

    match attempt(refreshed).await {
        Ok(retry) => relay_nav_response(&name, retry).await,
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            axum::Json(json!({"error": format!("nav shim unreachable on retry: {e}")})),
        )
            .into_response(),
    }
}

async fn relay_nav_response(workspace: &str, resp: reqwest::Response) -> Response {
    let upstream_status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let truncated = truncate_body(&body, 512);

    if upstream_status.is_success() {
        return axum::Json(json!({
            "success": true,
            "workspace": workspace,
            "upstream": truncated,
        }))
        .into_response();
    }

    let mapped = if upstream_status == reqwest::StatusCode::UNAUTHORIZED {
        StatusCode::BAD_GATEWAY
    } else if upstream_status == reqwest::StatusCode::BAD_REQUEST {
        StatusCode::BAD_REQUEST
    } else {
        StatusCode::BAD_GATEWAY
    };

    (
        mapped,
        axum::Json(json!({
            "error": format!("nav shim {upstream_status}: {truncated}"),
        })),
    )
        .into_response()
}

async fn resolve_account_for_token(token: &TokenInfo) -> Option<uuid::Uuid> {
    let user_id = token.user_id.parse::<uuid::Uuid>().ok()?;
    let wallet = crate::db::get_wallet_client()?;
    match wallet.service_account_for_user(user_id).await {
        Ok(a) => Some(a),
        Err(e) => {
            warn!(%user_id, "fc-billing: account resolution failed: {e}");
            None
        }
    }
}

fn set_account_id_header(req: &mut Request<Body>, account_id: Option<uuid::Uuid>) {
    req.headers_mut().remove("x-kbve-account-id");
    if let Some(acc) = account_id {
        if let Ok(v) = HeaderValue::from_str(&acc.to_string()) {
            req.headers_mut().insert("x-kbve-account-id", v);
        }
    }
}

static FIRECRACKER: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_firecracker_proxy() -> bool {
    let upstream = std::env::var("FIRECRACKER_CTL_URL")
        .unwrap_or_else(|_| "http://firecracker-ctl.firecracker.svc.cluster.local:9001".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for firecracker proxy");

    FIRECRACKER
        .set(ServiceProxy {
            name: "Firecracker",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn firecracker_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "Firecracker").await {
        return resp;
    }

    match FIRECRACKER.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker proxy not configured"})),
        )
            .into_response(),
    }
}

/// Public read-only proxy for the firecracker-ctl OpenAPI document.
///
/// Mounted at `/api/firecracker/openapi.json` so the Scalar viewer at
/// `/dashboard/api/` can fetch the spec without an auth bridge. The
/// document only describes endpoint shapes; the operations themselves
/// remain staff-gated through [`firecracker_proxy_handler`].
pub async fn firecracker_openapi_handler(req: Request<Body>) -> Response {
    match FIRECRACKER.get() {
        Some(proxy) => {
            proxy
                .handle_preauthorized(Some(Path("openapi.json".to_string())), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker proxy not configured"})),
        )
            .into_response(),
    }
}

static WINDMILL: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_windmill_proxy() -> bool {
    let upstream = std::env::var("WINDMILL_GATE_URL")
        .unwrap_or_else(|_| "http://windmill-gate.windmill.svc.cluster.local:5678".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest client for windmill proxy");

    WINDMILL
        .set(ServiceProxy {
            name: "Windmill",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

/// Proxy for the Windmill dashboard canvas. Staff-gated at axum, then forwards
/// the caller's Supabase token to windmill-gate, whose SSO bridge impersonates
/// the user — so Windmill actions carry per-user attribution.
/// Extract the runnable path from a Windmill job-run proxy path, if the request
/// is an invocation. Returns the script/flow path (e.g. `f/web/poem`) so the
/// proxy can enforce the surface boundary. Reads (poll result, scripts/list)
/// return `None` and stay under the plain DASHBOARD_VIEW gate.
fn windmill_runnable_path(proxy_path: &str) -> Option<&str> {
    const MARKERS: [&str; 4] = [
        "/jobs/run/p/",
        "/jobs/run_wait_result/p/",
        "/jobs/run/f/",
        "/jobs/run_wait_result/f/",
    ];
    for marker in MARKERS {
        if let Some(idx) = proxy_path.find(marker) {
            return Some(&proxy_path[idx + marker.len()..]);
        }
    }
    None
}

pub async fn windmill_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());

    let token_info =
        match require_dashboard_view_with_query(&headers, raw_query.as_deref(), "Windmill").await {
            Ok(info) => info,
            Err(resp) => return resp,
        };

    // The windmill folder is the hardened invocation boundary. A browser may
    // only run scripts under `f/web/*`; `f/web/staff/*` additionally requires
    // DASHBOARD_MANAGE. Everything else (f/discordsh/*, f/shared/*,
    // f/kilobase/*, u/*) is rejected — those surfaces are never browser-invoked.
    if let Some(runnable) = path.as_ref().and_then(|Path(p)| windmill_runnable_path(p)) {
        if !runnable.starts_with("f/web/") {
            warn!(
                user_id = %token_info.user_id,
                runnable,
                "Windmill proxy blocked invoke outside f/web/*"
            );
            return (
                StatusCode::FORBIDDEN,
                axum::Json(json!({
                    "error": "Access restricted",
                    "message": "This workflow is not invocable from the dashboard"
                })),
            )
                .into_response();
        }
        if runnable.starts_with("f/web/staff/")
            && !token_info.has_permission(staff_perm::DASHBOARD_MANAGE)
        {
            warn!(
                user_id = %token_info.user_id,
                runnable,
                "Windmill proxy blocked staff workflow — missing DASHBOARD_MANAGE"
            );
            return (
                StatusCode::FORBIDDEN,
                axum::Json(json!({
                    "error": "Access restricted",
                    "message": "This workflow requires staff access"
                })),
            )
                .into_response();
        }
    }

    let token = match extract_auth_token(&headers, raw_query.as_deref()) {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({"error": "Missing Authorization token for Windmill"})),
            )
                .into_response();
        }
    };

    match WINDMILL.get() {
        Some(proxy) => {
            proxy
                .handle_with_auth(path, req, format!("Bearer {token}"))
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Windmill proxy not configured"})),
        )
            .into_response(),
    }
}

static FACTORIO: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_factorio_proxy() -> bool {
    let upstream = std::env::var("FACTORIO_CTL_URL")
        .unwrap_or_else(|_| "http://factorio-ctl.factorio.svc.cluster.local:9002".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for factorio proxy");

    FACTORIO
        .set(ServiceProxy {
            name: "Factorio",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn factorio_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    if let Err(resp) = require_dashboard_view(&headers, "Factorio").await {
        return resp;
    }

    match FACTORIO.get() {
        Some(proxy) => proxy.handle(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Factorio proxy not configured"})),
        )
            .into_response(),
    }
}

/// Public read-only proxy for the factorio-ctl OpenAPI document. Mirrors
/// [`firecracker_openapi_handler`]; the operations stay staff-gated through
/// [`factorio_proxy_handler`].
pub async fn factorio_openapi_handler(req: Request<Body>) -> Response {
    match FACTORIO.get() {
        Some(proxy) => {
            proxy
                .handle_preauthorized(Some(Path("openapi.json".to_string())), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Factorio proxy not configured"})),
        )
            .into_response(),
    }
}

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

static FIRECRACKER_NET: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_firecracker_net_proxy() -> bool {
    let upstream = std::env::var("FIRECRACKER_CTL_NET_URL")
        .unwrap_or_else(|_| "http://firecracker-ctl-net.firecracker.svc.cluster.local:9001".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client for firecracker-net proxy");

    FIRECRACKER_NET
        .set(ServiceProxy {
            name: "Firecracker-Net",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn firecracker_net_proxy_handler(
    path: Option<Path<String>>,
    mut req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let token =
        match require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-Net")
            .await
        {
            Ok(t) => t,
            Err(resp) => return resp,
        };

    let account_id = resolve_account_for_token(&token).await;
    set_account_id_header(&mut req, account_id);

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(path, req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

/// Stable `/api/v1/fc/<rest>` → `/fc/<rest>` alias under the staff gate.
pub async fn firecracker_fc_alias_handler(
    Path(rest): Path<String>,
    mut req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    let token =
        match require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-FC")
            .await
        {
            Ok(t) => t,
            Err(resp) => return resp,
        };

    let account_id = resolve_account_for_token(&token).await;
    set_account_id_header(&mut req, account_id);

    match FIRECRACKER_NET.get() {
        Some(proxy) => {
            let upstream_path = format!("fc/{rest}");
            proxy
                .handle_preauthorized(Some(Path(upstream_path)), req)
                .await
        }
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

pub async fn firecracker_deployments_handler(
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let query: Option<String> = params
        .get("access_token")
        .map(|t| format!("access_token={t}"));
    let token = match require_dashboard_manage_with_query(
        &headers,
        query.as_deref(),
        "Firecracker-Deployments",
    )
    .await
    {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let account_id = match resolve_account_for_token(&token).await {
        Some(a) => a,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "could not resolve wallet account for user"})),
            )
                .into_response();
        }
    };

    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(50)
        .clamp(1, 200);
    let offset = params
        .get("offset")
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0)
        .max(0);
    let live_only = params
        .get("live_only")
        .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    let wallet = match crate::db::get_wallet_client() {
        Some(w) => w,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "wallet not configured"})),
            )
                .into_response();
        }
    };

    match wallet
        .firecracker_my_deployments(account_id, limit, offset, live_only)
        .await
    {
        Ok(rows) => (
            StatusCode::OK,
            axum::Json(json!({
                "account_id": account_id,
                "limit": limit,
                "offset": offset,
                "live_only": live_only,
                "deployments": rows,
            })),
        )
            .into_response(),
        Err(e) => {
            warn!(%account_id, "fc-journal: my_deployments query failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "deployment history query failed"})),
            )
                .into_response()
        }
    }
}

pub async fn firecracker_deployment_stats_handler(
    headers: HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let query: Option<String> = params
        .get("access_token")
        .map(|t| format!("access_token={t}"));
    let token = match require_dashboard_manage_with_query(
        &headers,
        query.as_deref(),
        "Firecracker-Deployment-Stats",
    )
    .await
    {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let account_id = match resolve_account_for_token(&token).await {
        Some(a) => a,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "could not resolve wallet account for user"})),
            )
                .into_response();
        }
    };

    let wallet = match crate::db::get_wallet_client() {
        Some(w) => w,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "wallet not configured"})),
            )
                .into_response();
        }
    };

    match wallet.firecracker_deployment_stats(account_id).await {
        Ok(stats) => (
            StatusCode::OK,
            axum::Json(json!({
                "account_id": account_id,
                "stats": stats,
            })),
        )
            .into_response(),
        Err(e) => {
            warn!(%account_id, "fc-journal: deployment_stats query failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(json!({"error": "deployment stats query failed"})),
            )
                .into_response()
        }
    }
}

pub async fn firecracker_fc_handler(
    axum::extract::Path(params): axum::extract::Path<Vec<(String, String)>>,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(str::to_owned);
    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Firecracker-FC")
            .await
            .map(|_| ())
    {
        return resp;
    }

    let name = params
        .iter()
        .find(|(k, _)| k == "name")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();
    let tail = params
        .iter()
        .find(|(k, _)| k == "path")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();

    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid endpoint name"})),
        )
            .into_response();
    }

    let rewritten = if tail.is_empty() {
        format!("proxy/{name}")
    } else {
        format!("proxy/{name}/{tail}")
    };

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(Some(Path(rewritten)), req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

/// Anonymous `/fc/public/<rest>` → ctl-net `/public-proxy/<rest>`. ctl-net
/// 403s when the endpoint wasn't deployed `visibility: "public"`.
///
/// Catch-all (not `{name}` + `{name}/{*path}`) so the trailing-slash form
/// doesn't fall through to staff `/fc/{name}/...`. Upstream prefix is
/// `/public-proxy/` not `/proxy/public/` — the nested form overlapped
/// with `/proxy/{name}/{*path}` and matchit kept picking the staff route.
pub async fn firecracker_fc_public_handler(
    rest: Option<Path<String>>,
    req: Request<Body>,
) -> Response {
    let rest_str = rest.map(|Path(p)| p).unwrap_or_default();
    let trimmed = rest_str.trim_start_matches('/');
    let (name, tail) = match trimmed.split_once('/') {
        Some((n, t)) => (n, t),
        None => (trimmed, ""),
    };

    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(json!({"error": "Invalid endpoint name"})),
        )
            .into_response();
    }

    let rewritten = if tail.is_empty() {
        format!("public-proxy/{name}")
    } else {
        format!("public-proxy/{name}/{tail}")
    };

    match FIRECRACKER_NET.get() {
        Some(proxy) => proxy.handle_preauthorized(Some(Path(rewritten)), req).await,
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"error": "Firecracker-Net proxy not configured"})),
        )
            .into_response(),
    }
}

static GUACAMOLE: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_guacamole_proxy() -> bool {
    let upstream = std::env::var("GUACAMOLE_UPSTREAM_URL")
        .unwrap_or_else(|_| "http://guacamole.angelscript.svc.cluster.local:8080".into());

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build reqwest client for guacamole proxy");

    GUACAMOLE
        .set(ServiceProxy {
            name: "Guacamole",
            client,
            upstream: upstream.trim_end_matches('/').to_string(),
            upstream_token: None,
            upstream_headers: Vec::new(),
            iframe_safe: false,
            streaming: false,
        })
        .is_ok()
}

pub async fn guacamole_proxy_handler(path: Option<Path<String>>, req: Request<Body>) -> Response {
    let proxy = match GUACAMOLE.get() {
        Some(p) => p,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Guacamole proxy not configured"})),
            )
                .into_response();
        }
    };

    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Guacamole").await
    {
        return resp;
    }

    proxy.handle_preauthorized(path, req).await
}

/// Bridges the browser WebSocket to `/guacamole/websocket-tunnel`. The
/// generic ServiceProxy can't do this — reqwest is HTTP-only and strips
/// the Upgrade header — so we relay frames directly here (same pattern as
/// `kubevirt_vnc_handler`).
pub async fn guacamole_ws_handler(
    ws: axum::extract::ws::WebSocketUpgrade,
    req: Request<Body>,
) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());

    if let Err(resp) =
        require_dashboard_manage_with_query(&headers, query.as_deref(), "Guacamole-WS").await
    {
        return resp;
    }

    let guac = match GUACAMOLE.get() {
        Some(g) => g,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::Json(json!({"error": "Guacamole proxy not configured"})),
            )
                .into_response();
        }
    };

    // Guacamole needs the query string forwarded — token, GUAC_WIDTH, etc.
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();

    let upstream_url = format!("{}/guacamole/websocket-tunnel{}", guac.upstream, query);

    ws.on_upgrade(move |browser_ws| async move {
        if let Err(e) = guacamole_ws_bridge(browser_ws, &upstream_url).await {
            warn!("Guacamole WS bridge error: {e}");
        }
    })
}

/// Bidirectional WebSocket bridge between the browser and Guacamole servlet.
async fn guacamole_ws_bridge(
    browser_ws: axum::extract::ws::WebSocket,
    upstream_url: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use axum::extract::ws::Message as AxumMsg;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::{Message as TungMsg, client::IntoClientRequest};

    let ws_url = upstream_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let request = ws_url.into_client_request()?;

    // Guacamole is cluster-internal (often plain HTTP), so allow non-TLS.
    let (upstream_ws, _resp) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, None).await?;

    let (mut browser_tx, mut browser_rx) = browser_ws.split();
    let (mut upstream_tx, mut upstream_rx) = upstream_ws.split();

    let browser_to_upstream = async {
        while let Some(msg) = browser_rx.next().await {
            match msg {
                Ok(AxumMsg::Text(text)) => {
                    let s: String = text.to_string();
                    if upstream_tx.send(TungMsg::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(AxumMsg::Binary(data)) => {
                    if upstream_tx.send(TungMsg::Binary(data)).await.is_err() {
                        break;
                    }
                }
                Ok(AxumMsg::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
        let _ = upstream_tx.close().await;
    };

    let upstream_to_browser = async {
        while let Some(msg) = upstream_rx.next().await {
            match msg {
                Ok(TungMsg::Text(text)) => {
                    let s: String = text.to_string();
                    if browser_tx.send(AxumMsg::Text(s.into())).await.is_err() {
                        break;
                    }
                }
                Ok(TungMsg::Binary(data)) => {
                    if browser_tx.send(AxumMsg::Binary(data)).await.is_err() {
                        break;
                    }
                }
                Ok(TungMsg::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
        let _ = browser_tx.close().await;
    };

    tokio::select! {
        _ = browser_to_upstream => {},
        _ = upstream_to_browser => {},
    }

    Ok(())
}

static EDGE: OnceLock<ServiceProxy> = OnceLock::new();

pub fn init_edge_proxy() -> bool {
    let supabase_url = match std::env::var("SUPABASE_URL") {
        Ok(u) => u.trim_end_matches('/').to_string(),
        Err(_) => return false,
    };
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
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: false,
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

/// One ROWS tenant: a main `/api/*` proxy plus its docs/openapi proxy.
struct ChuckRpgTenant {
    id: String,
    label: String,
    main: ServiceProxy,
    docs: ServiceProxy,
}

/// Registry of all configured ROWS tenants, keyed by id, with insertion order
/// preserved for stable listing and a default for tenant-less requests.
struct ChuckRpgRegistry {
    tenants: HashMap<String, ChuckRpgTenant>,
    order: Vec<String>,
    default_id: String,
}

static CHUCKRPG: OnceLock<ChuckRpgRegistry> = OnceLock::new();

fn build_chuckrpg_client() -> Client {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build reqwest client for chuckrpg proxy")
}

fn chuckrpg_guid_headers(id: &str, guid: Option<&str>) -> Vec<(HeaderName, HeaderValue)> {
    let mut headers = Vec::new();
    match guid.map(str::trim).filter(|g| !g.is_empty()) {
        Some(g) => match HeaderValue::from_str(g) {
            Ok(val) => headers.push((HeaderName::from_static("x-customerguid"), val)),
            Err(e) => {
                warn!(tenant = %id, error = %e, "invalid ROWS customer guid, header not injected")
            }
        },
        None => warn!(tenant = %id, "no customer guid — ROWS /api/System/* will return 401"),
    }
    headers
}

fn make_chuckrpg_tenant(
    id: String,
    label: String,
    upstream: String,
    docs: String,
    guid: Option<&str>,
) -> ChuckRpgTenant {
    let main = ServiceProxy {
        name: "ChuckRPG",
        client: build_chuckrpg_client(),
        upstream,
        upstream_token: None,
        upstream_headers: chuckrpg_guid_headers(&id, guid),
        iframe_safe: false,
        streaming: false,
    };
    let docs = ServiceProxy {
        name: "ChuckRPG-Docs",
        client: build_chuckrpg_client(),
        upstream: docs,
        upstream_token: None,
        upstream_headers: Vec::new(),
        iframe_safe: false,
        streaming: false,
    };
    ChuckRpgTenant {
        id,
        label,
        main,
        docs,
    }
}

/// Parse `CHUCKRPG_TENANTS` (JSON array of {id,label,upstream,docs,guid_env}),
/// resolving each tenant's customer guid from the env var it names. Falls back
/// to the legacy single-tenant `CHUCKRPG_UPSTREAM_URL` envs when unset.
pub fn init_chuckrpg_proxy() -> bool {
    let raw = match std::env::var("CHUCKRPG_TENANTS") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return init_chuckrpg_proxy_legacy(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "CHUCKRPG_TENANTS is not valid JSON — ROWS proxy disabled");
            return false;
        }
    };
    let arr = match parsed.as_array() {
        Some(a) => a,
        None => {
            warn!("CHUCKRPG_TENANTS must be a JSON array — ROWS proxy disabled");
            return false;
        }
    };

    let mut tenants = HashMap::new();
    let mut order = Vec::new();
    for item in arr {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() {
            warn!("CHUCKRPG_TENANTS entry missing 'id' — skipped");
            continue;
        }
        let label = item
            .get("label")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| id.clone());
        let upstream = item
            .get("upstream")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim_end_matches('/')
            .to_string();
        if upstream.is_empty() {
            warn!(tenant = %id, "CHUCKRPG_TENANTS entry missing 'upstream' — skipped");
            continue;
        }
        let docs = item
            .get("docs")
            .and_then(|v| v.as_str())
            .map(|s| s.trim_end_matches('/').to_string())
            .unwrap_or_else(|| upstream.clone());
        let guid = item
            .get("guid_env")
            .and_then(|v| v.as_str())
            .and_then(|name| std::env::var(name).ok());

        tenants.insert(
            id.clone(),
            make_chuckrpg_tenant(id.clone(), label, upstream, docs, guid.as_deref()),
        );
        order.push(id);
    }

    if tenants.is_empty() {
        warn!("CHUCKRPG_TENANTS produced no valid tenants — ROWS proxy disabled");
        return false;
    }
    let default_id = order[0].clone();
    CHUCKRPG
        .set(ChuckRpgRegistry {
            tenants,
            order,
            default_id,
        })
        .is_ok()
}

fn init_chuckrpg_proxy_legacy() -> bool {
    let upstream = match std::env::var("CHUCKRPG_UPSTREAM_URL") {
        Ok(u) if !u.trim().is_empty() => u.trim_end_matches('/').to_string(),
        _ => return false,
    };
    let docs = std::env::var("CHUCKRPG_DOCS_URL")
        .ok()
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_else(|| upstream.clone());
    let guid = std::env::var("CHUCKRPG_CUSTOMER_GUID").ok();
    let id = "default".to_string();
    let mut tenants = HashMap::new();
    tenants.insert(
        id.clone(),
        make_chuckrpg_tenant(
            id.clone(),
            "ROWS".to_string(),
            upstream,
            docs,
            guid.as_deref(),
        ),
    );
    CHUCKRPG
        .set(ChuckRpgRegistry {
            tenants,
            order: vec![id.clone()],
            default_id: id,
        })
        .is_ok()
}

fn chuckrpg_not_configured() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        axum::Json(json!({"error": "ChuckRPG proxy not configured"})),
    )
        .into_response()
}

fn chuckrpg_unknown_tenant(tenant: &str) -> Response {
    (
        StatusCode::NOT_FOUND,
        axum::Json(json!({"error": format!("unknown ROWS tenant '{tenant}'")})),
    )
        .into_response()
}

/// `/dashboard/chuckrpg/proxy/{tenant}/{*path}` — route to the named tenant's
/// main proxy.
pub async fn chuckrpg_proxy_handler(
    Path((tenant, rest)): Path<(String, String)>,
    req: Request<Body>,
) -> Response {
    match CHUCKRPG.get() {
        Some(reg) => match reg.tenants.get(tenant.trim()) {
            Some(t) => t.main.handle(Some(Path(rest)), req).await,
            None => chuckrpg_unknown_tenant(&tenant),
        },
        None => chuckrpg_not_configured(),
    }
}

/// `/dashboard/chuckrpg/tenants` — list configured tenants for the dashboard
/// selector. Gated by DASHBOARD_VIEW like the proxied endpoints.
pub async fn chuckrpg_tenants_handler(req: Request<Body>) -> Response {
    let req_headers = req.headers().clone();
    let raw_query = req.uri().query().map(|q| q.to_string());
    if let Err(resp) =
        require_dashboard_view_with_query(&req_headers, raw_query.as_deref(), "ChuckRPG").await
    {
        return resp;
    }
    match CHUCKRPG.get() {
        Some(reg) => {
            let list: Vec<_> = reg
                .order
                .iter()
                .filter_map(|id| reg.tenants.get(id))
                .map(|t| json!({"id": t.id, "label": t.label, "default": t.id == reg.default_id}))
                .collect();
            axum::Json(json!({"tenants": list, "default": reg.default_id})).into_response()
        }
        None => chuckrpg_not_configured(),
    }
}

pub async fn chuckrpg_openapi_handler(req: Request<Body>) -> Response {
    let tenant = req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|kv| kv.strip_prefix("tenant="))
            .map(|s| s.to_string())
    });
    match CHUCKRPG.get() {
        Some(reg) => {
            let key = tenant
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&reg.default_id);
            match reg.tenants.get(key) {
                Some(t) => {
                    t.docs
                        .handle_preauthorized(Some(Path("api-docs/openapi.json".to_string())), req)
                        .await
                }
                None => chuckrpg_unknown_tenant(key),
            }
        }
        None => chuckrpg_not_configured(),
    }
}

fn reqwest_headers(headers: &HeaderMap) -> reqwest::header::HeaderMap {
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

    #[test]
    fn url_passes_policy_allows_public_https() {
        assert!(url_passes_policy("https://example.com/").is_ok());
        assert!(url_passes_policy("https://docs.kbve.com/foo?a=1").is_ok());
    }

    #[test]
    fn url_passes_policy_rejects_localhost() {
        assert_eq!(
            url_passes_policy("http://localhost/").unwrap_err(),
            "host not allowed"
        );
        assert_eq!(
            url_passes_policy("http://api.localhost/").unwrap_err(),
            "host not allowed"
        );
    }

    #[test]
    fn url_passes_policy_rejects_cluster_internal() {
        assert!(url_passes_policy("http://argo.argocd.svc/").is_err());
        assert!(url_passes_policy("http://foo.cluster.local/").is_err());
        assert!(url_passes_policy("http://bar.internal/").is_err());
    }

    #[test]
    fn url_passes_policy_rejects_ipv4_mapped_ipv6() {
        // IPv4-mapped / -compatible IPv6 must run the IPv4 blocklist, else
        // loopback and link-local (cloud metadata) slip past the v6 checks.
        assert!(url_passes_policy("http://[::ffff:127.0.0.1]/").is_err());
        assert!(url_passes_policy("http://[::ffff:169.254.169.254]/").is_err());
        assert!(url_passes_policy("http://[::ffff:10.0.0.1]/").is_err());
    }

    #[test]
    fn url_passes_policy_rejects_private_ipv4() {
        assert!(url_passes_policy("http://10.0.0.1/").is_err());
        assert!(url_passes_policy("http://192.168.1.1/").is_err());
        assert!(url_passes_policy("http://127.0.0.1/").is_err());
    }

    #[test]
    fn url_passes_policy_rejects_embedded_credentials() {
        assert_eq!(
            url_passes_policy("https://user:pass@example.com/").unwrap_err(),
            "embedded credentials rejected"
        );
    }

    #[test]
    fn url_passes_policy_rejects_non_http_scheme() {
        assert_eq!(
            url_passes_policy("file:///etc/passwd").unwrap_err(),
            "scheme not allowed"
        );
        assert_eq!(
            url_passes_policy("javascript:alert(1)").unwrap_err(),
            "scheme not allowed"
        );
    }

    #[test]
    fn url_passes_policy_rejects_empty_and_oversized() {
        assert_eq!(url_passes_policy("").unwrap_err(), "invalid url length");
        let oversized = format!("https://example.com/{}", "x".repeat(MAX_LAUNCH_URL_LEN));
        assert_eq!(
            url_passes_policy(&oversized).unwrap_err(),
            "invalid url length"
        );
    }
}
