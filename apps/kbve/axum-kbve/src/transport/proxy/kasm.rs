use std::sync::OnceLock;
use std::time::Duration;

use axum::{
    body::{Body},
    extract::{FromRequestParts, Path, Request},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use serde_json::json;
use tracing::warn;

use super::core::*;
use super::kubevirt::{KASM_NAMESPACE, KUBEVIRT};

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
    let tls = match crate::transport::vnc_hub::build_accept_any_tls_connector() {
        Ok(c) => c,
        Err(e) => {
            warn!("KASM TLS connector build failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "tls setup failed").into_response();
        }
    };
    let config = crate::transport::vnc_hub::UpstreamConfig {
        auth_header: Some(auth_hv),
        origin: Some(origin_hv),
        subprotocols: Some("binary".parse().expect("static header value")),
        tls_connector: tls,
    };
    let session_key = format!("kasm::{}", upstream_url);

    ws.protocols(["binary"])
        .on_upgrade(move |browser_ws| async move {
            if let Err(e) = crate::transport::vnc_hub::join_session_with_config(
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


#[cfg(test)]
mod tests {
    use super::*;

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
