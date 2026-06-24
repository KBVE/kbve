use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    body::Body,
    extract::{FromRequestParts, Request, State, ws::WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use tracing::{debug, warn};

use super::auth::{
    Authz, GATE_SESSION_COOKIE, SB_ACCESS_TOKEN_COOKIE, StaffGate, access_token_in_query,
    extract_token, validate_token,
};

/// Runtime configuration for the gate, normally built from env in the binary.
pub struct GateConfig {
    /// Upstream base URL, e.g. `http://127.0.0.1:5679`.
    pub upstream: String,
    /// Path prefix prepended to every upstream request, e.g.
    /// `/dashboard/grafana/proxy`. Empty for a transparent proxy. Lets the gate
    /// front an upstream that serves from a sub-path under a different host.
    pub upstream_prefix: String,
    /// Supabase HS256 JWT secret.
    pub jwt_secret: String,
    /// Authorization policy applied after JWT validation.
    pub authz: Authz,
    /// Optional `Authorization: Basic <b64>` value injected on every upstream
    /// request. Lets the upstream keep its own basic-auth lock while the
    /// browser never sees the credential.
    pub upstream_basic: Option<String>,
    /// Where to send unauthenticated browser navigations (302). When unset a
    /// bare 401/403 is returned instead. The gate appends `?redirect_to=<this
    /// URL>` so the login page can bounce the browser back with a token.
    pub login_redirect: Option<String>,
    /// Domain scope for the minted `kbve_gate` session cookie, e.g. `.kbve.com`,
    /// so every subdomain behind the gate shares it. When unset the cookie is
    /// host-only.
    pub cookie_domain: Option<String>,
    /// Staff RPC gate. Required when `authz` is `IsStaff`.
    pub staff: Option<StaffGate>,
}

pub struct GateState {
    cfg: GateConfig,
    client: Client,
}

impl GateState {
    pub fn new(cfg: GateConfig) -> Self {
        let client = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { cfg, client }
    }

    pub fn into_router(self) -> axum::Router {
        axum::Router::new()
            .route("/healthz", axum::routing::get(|| async { "ok" }))
            .fallback(gate_handler)
            .with_state(Arc::new(self))
    }
}

/// RFC 6455 upgrade detection.
fn is_websocket_upgrade(headers: &HeaderMap) -> bool {
    fn contains(headers: &HeaderMap, name: &str, needle: &str) -> bool {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.split(',').any(|t| t.trim().eq_ignore_ascii_case(needle)))
            .unwrap_or(false)
    }
    contains(headers, "connection", "upgrade") && contains(headers, "upgrade", "websocket")
}

/// True for top-level browser navigations — used to decide redirect vs 401.
fn is_navigation(headers: &HeaderMap) -> bool {
    headers
        .get("sec-fetch-mode")
        .and_then(|v| v.to_str().ok())
        .map(|m| m.eq_ignore_ascii_case("navigate"))
        .unwrap_or(false)
        || headers
            .get(header::ACCEPT)
            .and_then(|v| v.to_str().ok())
            .map(|a| a.contains("text/html"))
            .unwrap_or(false)
}

/// 302 to `location`, optionally planting a `Set-Cookie`.
fn redirect(location: &str, set_cookie: Option<&str>) -> Response {
    let mut builder = Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location);
    if let Some(c) = set_cookie {
        builder = builder.header(header::SET_COOKIE, c);
    }
    builder
        .body(Body::empty())
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::empty())
                .unwrap()
        })
        .into_response()
}

/// Reconstruct the externally-visible URL (sans query) from proxy headers, used
/// as the `redirect_to` target so the login page can return the browser here.
fn external_url(headers: &HeaderMap, uri: &Uri) -> String {
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("https");
    format!("{scheme}://{host}{}", uri.path())
}

/// Drop the `access_token` pair from a query string, preserving the rest.
fn strip_access_token(query: &str) -> String {
    query
        .split('&')
        .filter(|p| *p != "access_token" && !p.starts_with("access_token="))
        .collect::<Vec<_>>()
        .join("&")
}

/// Strip the upstream path prefix from a redirect `Location` so the browser
/// never sees the gate's internal sub-path mapping. Handles server-relative
/// (`/prefix/x` → `/x`) and absolute (`scheme://host/prefix/x`) forms; returns
/// `None` when nothing changed.
fn rewrite_location(loc: &str, prefix: &str) -> Option<String> {
    if prefix.is_empty() {
        return None;
    }
    let strip = |path: &str| -> Option<String> {
        let rest = path.strip_prefix(prefix)?;
        if rest.is_empty() {
            Some("/".to_string())
        } else if rest.starts_with('/') {
            Some(rest.to_string())
        } else {
            None
        }
    };
    if loc.starts_with('/') {
        return strip(loc);
    }
    for scheme in ["http://", "https://"] {
        if let Some(after) = loc.strip_prefix(scheme) {
            if let Some(slash) = after.find('/') {
                let (host, path) = after.split_at(slash);
                if let Some(rest) = strip(path) {
                    return Some(format!("{scheme}{host}{rest}"));
                }
            }
            break;
        }
    }
    None
}

fn status_class(status: StatusCode) -> &'static str {
    match status.as_u16() {
        100..=199 => "1xx",
        200..=299 => "2xx",
        300..=399 => "3xx",
        400..=499 => "4xx",
        _ => "5xx",
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Mint the `kbve_gate` session cookie from a URL-delivered token, then 302 to a
/// clean URL so the JWT never lingers in history, referrers, or logs. The cookie
/// lifetime tracks the token's own `exp` so it never outlives the JWT.
fn cookie_land(state: &GateState, uri: &Uri, token: &str, exp: i64) -> Response {
    let cleaned = uri.query().map(strip_access_token).unwrap_or_default();
    let location = if cleaned.is_empty() {
        uri.path().to_string()
    } else {
        format!("{}?{}", uri.path(), cleaned)
    };
    let max_age = (exp - unix_now()).clamp(0, 86400);
    let mut cookie = format!(
        "{GATE_SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; Secure; SameSite=Lax"
    );
    if let Some(domain) = &state.cfg.cookie_domain {
        cookie.push_str("; Domain=");
        cookie.push_str(domain);
    }
    redirect(&location, Some(&cookie))
}

fn deny(
    state: &GateState,
    headers: &HeaderMap,
    status: StatusCode,
    msg: &str,
    ext_url: &str,
    bounced: bool,
) -> Response {
    warn!(%status, reason = %msg, path = %ext_url, bounced, "gate deny");
    let result = match status {
        StatusCode::UNAUTHORIZED => "deny_unauthorized",
        StatusCode::FORBIDDEN => "deny_forbidden",
        _ => "deny_other",
    };
    metrics::counter!("gate_auth_total", "result" => result).increment(1);
    if status == StatusCode::UNAUTHORIZED {
        if bounced && is_navigation(headers) {
            return loop_break_page(msg);
        }
        if let Some(target) = &state.cfg.login_redirect {
            if is_navigation(headers) {
                let enc: String =
                    url::form_urlencoded::byte_serialize(ext_url.as_bytes()).collect();
                let sep = if target.contains('?') { '&' } else { '?' };
                let location = format!("{target}{sep}redirect_to={enc}");
                return redirect(&location, None);
            }
        }
    }
    if status == StatusCode::FORBIDDEN && is_navigation(headers) {
        return forbidden_page();
    }
    (status, axum::Json(serde_json::json!({ "error": msg }))).into_response()
}

/// HTML 403 for a signed-in user who lacks access — a bare JSON body reads as a
/// broken page in the browser.
fn forbidden_page() -> Response {
    let body = "<!doctype html><meta charset=utf-8><title>Not authorized</title>\
         <body style=\"font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem\">\
         <h1>Not authorized</h1>\
         <p>You are signed in, but your account does not have access to this service.</p>\
         <p>Ask an administrator to grant access, then reload.</p>\
         </body>";
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(body))
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::empty())
                .unwrap()
        })
        .into_response()
}

/// Terminal HTML shown when a post-login bounce token is rejected — breaks the
/// login↔gate redirect loop and surfaces the underlying reason.
fn loop_break_page(reason: &str) -> Response {
    let safe = reason
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>Sign-in failed</title>\
         <body style=\"font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem\">\
         <h1>Sign-in failed</h1>\
         <p>Your session was rejected by the gateway, so we stopped before looping back to login.</p>\
         <p style=\"color:#666\">Reason: {safe}</p>\
         <p>Sign out and back in. If it persists the gateway JWT secret is out of sync with auth.</p>\
         </body>"
    );
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(body))
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::empty())
                .unwrap()
        })
        .into_response()
}

/// Validate the JWT and apply the authz policy. Returns the token `exp` on pass.
async fn authorize(
    state: &GateState,
    headers: &HeaderMap,
    query: Option<&str>,
    ext_url: &str,
    bounced: bool,
) -> Result<i64, Response> {
    let token = extract_token(
        headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok()),
        headers.get(header::COOKIE).and_then(|v| v.to_str().ok()),
        query,
    );

    let token = match token {
        Some(t) => t,
        None => {
            return Err(deny(
                state,
                headers,
                StatusCode::UNAUTHORIZED,
                "missing token",
                ext_url,
                bounced,
            ));
        }
    };

    let data = match validate_token(&token, &state.cfg.jwt_secret) {
        Ok(d) => d,
        Err(e) => {
            return Err(deny(
                state,
                headers,
                StatusCode::UNAUTHORIZED,
                &e.to_string(),
                ext_url,
                bounced,
            ));
        }
    };
    let sub = data.claims.sub;
    let exp = data.claims.exp;

    match &state.cfg.authz {
        Authz::JwtOnly => Ok(exp),
        Authz::IsStaff => {
            let staff = match &state.cfg.staff {
                Some(s) => s,
                None => {
                    metrics::counter!("gate_auth_total", "result" => "error_backend").increment(1);
                    return Err((
                        StatusCode::SERVICE_UNAVAILABLE,
                        axum::Json(serde_json::json!({ "error": "staff gate unconfigured" })),
                    )
                        .into_response());
                }
            };
            match staff.is_staff(&sub).await {
                Ok(true) => Ok(exp),
                Ok(false) => Err(deny(
                    state,
                    headers,
                    StatusCode::FORBIDDEN,
                    "staff only",
                    ext_url,
                    bounced,
                )),
                Err(e) => {
                    metrics::counter!("gate_auth_total", "result" => "error_backend").increment(1);
                    Err((
                        StatusCode::BAD_GATEWAY,
                        axum::Json(serde_json::json!({ "error": e.to_string() })),
                    )
                        .into_response())
                }
            }
        }
    }
}

async fn gate_handler(State(state): State<Arc<GateState>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());
    let ext_url = external_url(&headers, req.uri());
    let bounced = query.as_deref().and_then(access_token_in_query).is_some();

    let exp = match authorize(&state, &headers, query.as_deref(), &ext_url, bounced).await {
        Ok(exp) => exp,
        Err(resp) => return resp,
    };
    metrics::counter!("gate_auth_total", "result" => "allow").increment(1);

    // Token arrived in the URL (post-login bounce): convert it to a session
    // cookie and redirect to a clean URL. Skipped for WebSocket upgrades, which
    // carry the token in the cookie the browser already holds.
    if !is_websocket_upgrade(&headers) {
        if let Some(token) = query.as_deref().and_then(access_token_in_query) {
            return cookie_land(&state, req.uri(), &token, exp);
        }
    }

    if is_websocket_upgrade(&headers) {
        return ws_bridge(&state, req).await;
    }

    forward_http(&state, req).await
}

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// Drop the gate's own cookies (`kbve_gate`, `sb-access-token`) from a Cookie
/// header, leaving the upstream's own cookies (e.g. n8n's session) intact.
fn strip_gate_cookies(cookie_header: &str) -> String {
    cookie_header
        .split(';')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .filter(|p| {
            let name = p.split_once('=').map(|(k, _)| k).unwrap_or(p);
            name != GATE_SESSION_COOKIE && name != SB_ACCESS_TOKEN_COOKIE
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// Rewrite the Cookie header so the upstream sees its own cookies but never the
/// gate's auth tokens.
fn sanitize_cookies(headers: &mut HeaderMap) {
    let kept = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(strip_gate_cookies);
    headers.remove(header::COOKIE);
    if let Some(kept) = kept {
        if !kept.is_empty() {
            if let Ok(v) = HeaderValue::from_str(&kept) {
                headers.insert(header::COOKIE, v);
            }
        }
    }
}

fn upstream_uri(upstream: &str, prefix: &str, uri: &Uri) -> String {
    let path = uri.path();
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let applied_prefix =
        if prefix.is_empty() || path == prefix || path.starts_with(&format!("{prefix}/")) {
            ""
        } else {
            prefix
        };
    format!(
        "{}{}{}{}",
        upstream.trim_end_matches('/'),
        applied_prefix,
        path,
        query
    )
}

async fn forward_http(state: &GateState, req: Request<Body>) -> Response {
    let method = req.method().clone();
    let url = upstream_uri(&state.cfg.upstream, &state.cfg.upstream_prefix, req.uri());
    let mut headers = req.headers().clone();

    headers.remove(header::HOST);
    headers.remove(header::AUTHORIZATION);
    headers.remove(header::ACCEPT_ENCODING);
    sanitize_cookies(&mut headers);
    for h in HOP_BY_HOP {
        headers.remove(*h);
    }

    if let Some(basic) = &state.cfg.upstream_basic {
        if let Ok(v) = HeaderValue::from_str(basic) {
            headers.insert(header::AUTHORIZATION, v);
        }
    }

    let body = reqwest::Body::wrap_stream(req.into_body().into_data_stream());

    debug!(%url, %method, "gate forward");

    let started = std::time::Instant::now();
    let resp = match state
        .client
        .request(method, &url)
        .headers(reqwest_headers(&headers))
        .body(body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(%url, "gate upstream error: {e}");
            metrics::counter!("gate_upstream_responses_total", "class" => "error").increment(1);
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(serde_json::json!({ "error": "upstream unreachable" })),
            )
                .into_response();
        }
    };

    let status =
        StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    metrics::histogram!("gate_upstream_duration_seconds").record(started.elapsed().as_secs_f64());
    metrics::counter!("gate_upstream_responses_total", "class" => status_class(status))
        .increment(1);

    let mut out_headers = HeaderMap::new();
    for (k, v) in resp.headers() {
        if let (Ok(name), Ok(val)) = (
            HeaderName::from_bytes(k.as_str().as_bytes()),
            HeaderValue::from_bytes(v.as_bytes()),
        ) {
            out_headers.append(name, val);
        }
    }
    out_headers.remove("content-encoding");
    for h in HOP_BY_HOP {
        out_headers.remove(*h);
    }

    let rewritten = out_headers
        .get(header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|loc| rewrite_location(loc, &state.cfg.upstream_prefix));
    if let Some(loc) = rewritten {
        if let Ok(v) = HeaderValue::from_str(&loc) {
            out_headers.insert(header::LOCATION, v);
        }
    }

    let body = Body::from_stream(resp.bytes_stream());
    let mut builder = Response::builder().status(status);
    if let Some(h) = builder.headers_mut() {
        *h = out_headers;
    }
    builder
        .body(body)
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::empty())
                .unwrap()
        })
        .into_response()
}

fn reqwest_headers(headers: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut out = reqwest::header::HeaderMap::with_capacity(headers.len());
    for (k, v) in headers {
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()),
            reqwest::header::HeaderValue::from_bytes(v.as_bytes()),
        ) {
            out.append(name, val);
        }
    }
    out
}

/// Bridge a browser WebSocket to the upstream. reqwest is HTTP-only, so the
/// upgrade leg uses tokio-tungstenite directly.
async fn ws_bridge(state: &GateState, req: Request<Body>) -> Response {
    let mut ws_url = upstream_uri(&state.cfg.upstream, &state.cfg.upstream_prefix, req.uri());
    if let Some(rest) = ws_url.strip_prefix("http://") {
        ws_url = format!("ws://{rest}");
    } else if let Some(rest) = ws_url.strip_prefix("https://") {
        ws_url = format!("wss://{rest}");
    }
    let basic = state.cfg.upstream_basic.clone();

    let (mut parts, _body) = req.into_parts();
    let cookie = parts
        .headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(strip_gate_cookies)
        .filter(|c| !c.is_empty());
    let ws = match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(ws) => ws,
        Err(rej) => return rej.into_response(),
    };

    ws.on_upgrade(move |browser_ws| async move {
        if let Err(e) = pump_ws(browser_ws, ws_url.clone(), basic, cookie).await {
            warn!(%ws_url, "gate ws bridge error: {e}");
        }
    })
}

async fn pump_ws(
    browser: axum::extract::ws::WebSocket,
    upstream_url: String,
    basic: Option<String>,
    cookie: Option<String>,
) -> Result<(), String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message as TMsg;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let mut request = upstream_url
        .as_str()
        .into_client_request()
        .map_err(|e| format!("ws request build: {e}"))?;
    if let Some(b) = &basic {
        request.headers_mut().insert(
            "authorization",
            b.parse().map_err(|e| format!("ws basic header: {e}"))?,
        );
    }
    if let Some(c) = &cookie {
        request.headers_mut().insert(
            "cookie",
            c.parse().map_err(|e| format!("ws cookie header: {e}"))?,
        );
    }

    let (upstream, _resp) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("ws connect: {e}"))?;

    let (mut up_tx, mut up_rx) = upstream.split();
    let (mut br_tx, mut br_rx) = browser.split();

    let browser_to_upstream = async {
        while let Some(Ok(msg)) = br_rx.next().await {
            use axum::extract::ws::Message as AMsg;
            let out = match msg {
                AMsg::Text(t) => TMsg::Text(t.as_str().into()),
                AMsg::Binary(b) => TMsg::Binary(b.to_vec()),
                AMsg::Ping(b) => TMsg::Ping(b.to_vec()),
                AMsg::Pong(b) => TMsg::Pong(b.to_vec()),
                AMsg::Close(_) => {
                    let _ = up_tx.send(TMsg::Close(None)).await;
                    break;
                }
            };
            if up_tx.send(out).await.is_err() {
                break;
            }
        }
    };

    let upstream_to_browser = async {
        while let Some(Ok(msg)) = up_rx.next().await {
            use axum::extract::ws::Message as AMsg;
            let out = match msg {
                TMsg::Text(t) => AMsg::Text(t.as_str().into()),
                TMsg::Binary(b) => AMsg::Binary(b.to_vec().into()),
                TMsg::Ping(b) => AMsg::Ping(b.to_vec().into()),
                TMsg::Pong(b) => AMsg::Pong(b.to_vec().into()),
                TMsg::Close(_) => {
                    let _ = br_tx.send(AMsg::Close(None)).await;
                    break;
                }
                TMsg::Frame(_) => continue,
            };
            if br_tx.send(out).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = browser_to_upstream => {}
        _ = upstream_to_browser => {}
    }
    Ok(())
}
