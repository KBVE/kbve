use std::sync::Arc;

use axum::{
    body::Body,
    extract::{FromRequestParts, Request, State, ws::WebSocketUpgrade},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use reqwest::Client;
use tracing::{debug, warn};

use super::auth::{
    Authz, GATE_SESSION_COOKIE, StaffGate, access_token_in_query, extract_token, validate_token,
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
        Self {
            cfg,
            client: Client::new(),
        }
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

/// Mint the `kbve_gate` session cookie from a URL-delivered token, then 302 to a
/// clean URL so the JWT never lingers in history, referrers, or logs.
fn cookie_land(state: &GateState, uri: &Uri, token: &str) -> Response {
    let cleaned = uri.query().map(strip_access_token).unwrap_or_default();
    let location = if cleaned.is_empty() {
        uri.path().to_string()
    } else {
        format!("{}?{}", uri.path(), cleaned)
    };
    let mut cookie = format!(
        "{GATE_SESSION_COOKIE}={token}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax"
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
) -> Response {
    if status == StatusCode::UNAUTHORIZED {
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
    (status, axum::Json(serde_json::json!({ "error": msg }))).into_response()
}

/// Validate the JWT and apply the authz policy. Returns the user id on pass.
async fn authorize(
    state: &GateState,
    headers: &HeaderMap,
    query: Option<&str>,
    ext_url: &str,
) -> Result<String, Response> {
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
            ));
        }
    };
    let sub = data.claims.sub;

    match &state.cfg.authz {
        Authz::JwtOnly => Ok(sub),
        Authz::IsStaff => {
            let staff = match &state.cfg.staff {
                Some(s) => s,
                None => {
                    return Err((
                        StatusCode::SERVICE_UNAVAILABLE,
                        axum::Json(serde_json::json!({ "error": "staff gate unconfigured" })),
                    )
                        .into_response());
                }
            };
            match staff.is_staff(&sub).await {
                Ok(true) => Ok(sub),
                Ok(false) => Err(deny(
                    state,
                    headers,
                    StatusCode::FORBIDDEN,
                    "staff only",
                    ext_url,
                )),
                Err(e) => Err((
                    StatusCode::BAD_GATEWAY,
                    axum::Json(serde_json::json!({ "error": e.to_string() })),
                )
                    .into_response()),
            }
        }
    }
}

async fn gate_handler(State(state): State<Arc<GateState>>, req: Request<Body>) -> Response {
    let headers = req.headers().clone();
    let query = req.uri().query().map(|q| q.to_string());
    let ext_url = external_url(&headers, req.uri());

    if let Err(resp) = authorize(&state, &headers, query.as_deref(), &ext_url).await {
        return resp;
    }

    // Token arrived in the URL (post-login bounce): convert it to a session
    // cookie and redirect to a clean URL. Skipped for WebSocket upgrades, which
    // carry the token in the cookie the browser already holds.
    if !is_websocket_upgrade(&headers) {
        if let Some(token) = query.as_deref().and_then(access_token_in_query) {
            return cookie_land(&state, req.uri(), &token);
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

fn upstream_uri(upstream: &str, prefix: &str, uri: &Uri) -> String {
    let path = uri.path();
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    format!(
        "{}{}{}{}",
        upstream.trim_end_matches('/'),
        prefix,
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
    headers.remove(header::COOKIE);
    for h in HOP_BY_HOP {
        headers.remove(*h);
    }

    if let Some(basic) = &state.cfg.upstream_basic {
        if let Ok(v) = HeaderValue::from_str(basic) {
            headers.insert(header::AUTHORIZATION, v);
        }
    }

    let body_bytes = match axum::body::to_bytes(req.into_body(), 25 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                axum::Json(serde_json::json!({ "error": "request body too large" })),
            )
                .into_response();
        }
    };

    debug!(%url, %method, "gate forward");

    let resp = match state
        .client
        .request(method, &url)
        .headers(reqwest_headers(&headers))
        .body(body_bytes)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(%url, "gate upstream error: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                axum::Json(
                    serde_json::json!({ "error": "upstream unreachable", "detail": e.to_string() }),
                ),
            )
                .into_response();
        }
    };

    let status =
        StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

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
    let ws = match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(ws) => ws,
        Err(rej) => return rej.into_response(),
    };

    ws.on_upgrade(move |browser_ws| async move {
        if let Err(e) = pump_ws(browser_ws, ws_url.clone(), basic).await {
            warn!(%ws_url, "gate ws bridge error: {e}");
        }
    })
}

async fn pump_ws(
    browser: axum::extract::ws::WebSocket,
    upstream_url: String,
    basic: Option<String>,
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
                AMsg::Binary(b) => TMsg::Binary(b.to_vec().into()),
                AMsg::Ping(b) => TMsg::Ping(b.to_vec().into()),
                AMsg::Pong(b) => TMsg::Pong(b.to_vec().into()),
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
