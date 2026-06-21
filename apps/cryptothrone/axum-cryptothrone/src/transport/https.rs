use anyhow::Result;
use std::{
    net::SocketAddr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use std::sync::Arc;

use axum::{
    Extension, Router,
    extract::Request,
    http::{HeaderName, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use tokio::net::TcpListener;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::info;

use crate::agones::AgonesAllocator;

pub async fn serve() -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4321);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let listener = tuned_listener(addr)?;

    info!("HTTP listening on http://{addr}");

    let allocator = Arc::new(AgonesAllocator::try_new().await);
    // Optional DB — only the Discord session bridge needs it; the service still
    // serves static + allocation when KBVE_PG_* is unset.
    let pg = match jedi::state::pg::PgCluster::from_env().await {
        Ok(c) => Some(c),
        Err(e) => {
            tracing::warn!(error = %e, "PgCluster offline; /api/discord/session disabled");
            None
        }
    };
    let app = router().layer(Extension(allocator)).layer(Extension(pg));

    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn router() -> Router {
    let max_inflight: usize = num_cpus::get().max(1) * 1024;

    let static_config = crate::astro::StaticConfig::from_env();

    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(axum::error_handling::HandleErrorLayer::new(
            |err: tower::BoxError| async move {
                if err.is::<tower::timeout::error::Elapsed>() {
                    (axum::http::StatusCode::REQUEST_TIMEOUT, "request timed out")
                } else if err.is::<tower::load_shed::error::Overloaded>() {
                    (
                        axum::http::StatusCode::SERVICE_UNAVAILABLE,
                        "service overloaded",
                    )
                } else {
                    tracing::warn!(error = %err, "middleware error");
                    (
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                        "internal server error",
                    )
                }
            },
        ))
        .timeout(Duration::from_secs(10))
        .concurrency_limit(max_inflight)
        .load_shed()
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1024 * 1024));

    let static_router = crate::astro::build_static_router(&static_config)
        .layer(axum::middleware::from_fn(crate::astro::corp_static_assets))
        .layer(axum::middleware::from_fn(fix_ts_mime))
        .layer(axum::middleware::from_fn(cache_headers));

    let dynamic_router = Router::new()
        .route("/health", get(health))
        .route("/api/v1/speed", get(speed))
        .route("/api/join", post(join))
        .route("/api/discord/session", post(crate::discord::session))
        // The Discord Activity proxies under the `/` -> .../discord/ root mapping,
        // which prepends /discord to every request, so its session call lands here.
        .route(
            "/discord/api/discord/session",
            post(crate::discord::session),
        );

    static_router
        .merge(dynamic_router)
        .layer(middleware)
        // Outermost: lets the Discord Activity (/discord/*) be framed by Discord.
        // Runs after the global X-Frame-Options: DENY so it can override it.
        .layer(axum::middleware::from_fn(discord_frame_headers))
}

/// The global `X-Frame-Options: DENY` blocks Discord from framing the Activity.
/// For `/discord/*` swap it for a `frame-ancestors` CSP scoped to Discord's
/// hosts so only Discord can embed it.
async fn discord_frame_headers(request: Request, next: Next) -> Response {
    let is_discord = request.uri().path().starts_with("/discord");
    let mut response = next.run(request).await;
    if is_discord {
        let headers = response.headers_mut();
        headers.remove(header::X_FRAME_OPTIONS);
        headers.insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com",
            ),
        );
    }
    response
}

async fn health() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "status": "ok",
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn speed() -> impl IntoResponse {
    let time_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    axum::Json(serde_json::json!({ "time_ms": time_ms }))
}

async fn join(
    Extension(allocator): Extension<Arc<Option<AgonesAllocator>>>,
    headers: axum::http::HeaderMap,
) -> Response {
    let secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
    if !secret.is_empty() {
        match crate::auth::bearer_token(&headers)
            .and_then(|t| crate::auth::verify_supabase_jwt(t, secret.as_bytes()).ok())
        {
            Some(claims) => {
                tracing::info!(user = %claims.kbve_username, "game server join authorized")
            }
            None => {
                return (
                    StatusCode::UNAUTHORIZED,
                    "missing or invalid Supabase token",
                )
                    .into_response();
            }
        }
    }

    let Some(allocator) = allocator.as_ref() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "allocator offline").into_response();
    };
    match allocator.allocate().await {
        Ok(a) => axum::Json(serde_json::json!({
            "address": a.address,
            "port": a.port,
            "gameServerName": a.game_server_name,
        }))
        .into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "game server allocation failed");
            (StatusCode::SERVICE_UNAVAILABLE, "no game server available").into_response()
        }
    }
}

async fn cache_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    let is_html = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.starts_with("text/html"));
    // The Discord/embed entry bundles keep a stable filename across releases, so
    // a long max-age would pin last deploy's bytes; force them to revalidate.
    let is_entry_bundle = path == "/discord/discord.js" || path == "/embed/embed.js";

    // /_astro/ assets are content-hashed → immutable. HTML and the unhashed entry
    // bundles must revalidate (ETag/304) so a redeploy is seen at once. A non-2xx
    // is never cached — a transient 404 once stuck in Cloudflare for a full day.
    let cache_value = if !response.status().is_success() {
        "no-store"
    } else if path.starts_with("/_astro/") {
        "public, max-age=31536000, immutable"
    } else if is_html || is_entry_bundle {
        "no-cache"
    } else {
        "public, max-age=86400"
    };

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(cache_value));

    response
}

async fn fix_ts_mime(request: Request, next: Next) -> Response {
    let is_ts = request.uri().path().ends_with(".ts");
    let mut response = next.run(request).await;
    if is_ts {
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/javascript; charset=utf-8"),
        );
    }
    response
}

fn tuned_listener(addr: SocketAddr) -> Result<TcpListener> {
    use socket2::{Domain, Protocol, Socket, Type};

    let domain = match addr {
        SocketAddr::V4(_) => Domain::IPV4,
        SocketAddr::V6(_) => Domain::IPV6,
    };
    let socket = Socket::new(domain, Type::STREAM, Some(Protocol::TCP))?;

    socket.set_reuse_address(true)?;
    socket.set_keepalive(true)?;

    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        use socket2::TcpKeepalive;
        let ka = TcpKeepalive::new()
            .with_time(Duration::from_secs(30))
            .with_interval(Duration::from_secs(10));
        let _ = socket.set_tcp_keepalive(&ka);
    }

    socket.bind(&addr.into())?;
    socket.listen(1024)?;

    let std_listener = std::net::TcpListener::from(socket);
    std_listener.set_nonblocking(true)?;
    Ok(TcpListener::from_std(std_listener)?)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::astro::{StaticConfig, build_static_router};
    use axum::{body::Body, http::StatusCode};
    use http_body_util::BodyExt;
    use serial_test::serial;
    use tower::ServiceExt;

    /// Build a throwaway Astro `dist/` with a nested Discord Activity bundle,
    /// then serve it through the real static router — exactly as the binary
    /// does (no `trim_trailing_slash`: that layer 307-loops `ServeDir`'s
    /// directory redirect on `trailingSlash: always` routes and was reverted
    /// in #12442). Guards the `/discord/discord.js` path that 404s in prod
    /// only because the live image predates the bundle.
    fn discord_static_app(dir: &std::path::Path) -> Router {
        std::fs::create_dir_all(dir.join("discord")).unwrap();
        std::fs::write(
            dir.join("discord/index.html"),
            "<!doctype html><script src=\"discord.js\" defer></script>",
        )
        .unwrap();
        std::fs::write(
            dir.join("discord/discord.js"),
            "console.log('cryptothrone discord activity');",
        )
        .unwrap();
        std::fs::write(dir.join("404.html"), "<h1>404</h1>").unwrap();

        let cfg = StaticConfig {
            base_dir: dir.to_path_buf(),
            precompressed: false,
        };
        build_static_router(&cfg)
    }

    #[tokio::test]
    async fn test_discord_js_served_not_404() {
        let dir = std::env::temp_dir().join(format!("axum-ct-discord-{}", std::process::id()));
        let app = discord_static_app(&dir);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/discord/discord.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK, "discord.js must not 404");
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_owned())
            .unwrap_or_default();
        assert!(
            ct.contains("javascript"),
            "discord.js should serve as JS, got: {ct}"
        );
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert!(
            std::str::from_utf8(&body)
                .unwrap()
                .contains("discord activity")
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn test_discord_index_serves_at_trailing_slash() {
        let dir = std::env::temp_dir().join(format!("axum-ct-discord-idx-{}", std::process::id()));

        // `/discord/` is the real Discord Activity load path — serves index.html.
        let slash = discord_static_app(&dir)
            .oneshot(
                Request::builder()
                    .uri("/discord/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(slash.status(), StatusCode::OK, "/discord/ must serve index");

        // `/discord` (no slash) gets a single 307 to add the slash — NOT a loop.
        let bare = discord_static_app(&dir)
            .oneshot(
                Request::builder()
                    .uri("/discord")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            bare.status(),
            StatusCode::TEMPORARY_REDIRECT,
            "/discord redirects once to /discord/"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    fn test_router() -> Router {
        let middleware = tower::ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                HeaderName::from_static("referrer-policy"),
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            ));

        Router::new()
            .route("/health", get(health))
            .route("/api/v1/speed", get(speed))
            .layer(middleware)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["version"], env!("CARGO_PKG_VERSION"));
    }

    #[tokio::test]
    async fn test_security_headers() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );
        assert_eq!(response.headers().get("x-frame-options").unwrap(), "DENY");
        assert_eq!(
            response.headers().get("referrer-policy").unwrap(),
            "strict-origin-when-cross-origin"
        );
    }

    #[tokio::test]
    async fn test_cache_headers_astro_path() {
        let app = Router::new()
            .route("/_astro/{*path}", get(|| async { "asset" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/_astro/bundle.abc123.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("immutable"));
        assert!(cc.contains("31536000"));
    }

    #[tokio::test]
    async fn test_cache_headers_html_page() {
        let app = Router::new()
            .route("/", get(|| async { "page" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cc.contains("86400"));
    }

    #[tokio::test]
    async fn test_cache_headers_html_revalidates() {
        let app = Router::new()
            .route(
                "/discord/",
                get(|| async {
                    (
                        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                        "<html>",
                    )
                }),
            )
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/discord/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );
    }

    #[tokio::test]
    async fn test_cache_headers_entry_bundle_revalidates() {
        let app = Router::new()
            .route("/discord/discord.js", get(|| async { "bundle" }))
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/discord/discord.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-cache"
        );
    }

    #[tokio::test]
    async fn test_cache_headers_404_not_cached() {
        let app = Router::new()
            .route(
                "/missing.js",
                get(|| async { (StatusCode::NOT_FOUND, "nope") }),
            )
            .layer(axum::middleware::from_fn(cache_headers));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/missing.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let cc = response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap();
        assert_eq!(cc, "no-store");
    }

    #[tokio::test]
    async fn test_fix_ts_mime_rewrites() {
        let app = Router::new()
            .route("/worker.ts", get(|| async { "code" }))
            .layer(axum::middleware::from_fn(fix_ts_mime));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/worker.ts")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/javascript; charset=utf-8"
        );
    }

    #[tokio::test]
    async fn test_speed_endpoint() {
        let app = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/speed")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let speed: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(speed["time_ms"].as_u64().unwrap() > 0);
    }

    #[tokio::test]
    async fn test_fix_ts_mime_passes_non_ts_through() {
        let app = Router::new()
            .route(
                "/script.js",
                get(|| async { ([(header::CONTENT_TYPE, "text/plain")], "code") }),
            )
            .layer(axum::middleware::from_fn(fix_ts_mime));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/script.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        // Non-.ts content type is left untouched.
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/plain"
        );
    }

    #[tokio::test]
    async fn test_discord_frame_headers_relax_csp_for_activity() {
        let app = Router::new()
            .route("/discord/x", get(|| async { "x" }))
            .route("/other", get(|| async { "o" }))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(axum::middleware::from_fn(discord_frame_headers));

        let discord = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/discord/x")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(
            discord.headers().get(header::X_FRAME_OPTIONS).is_none(),
            "X-Frame-Options must be dropped for /discord/*"
        );
        let csp = discord
            .headers()
            .get(header::CONTENT_SECURITY_POLICY)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(csp.contains("frame-ancestors"));
        assert!(csp.contains("discord.com"));

        let other = app
            .oneshot(
                Request::builder()
                    .uri("/other")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            other.headers().get(header::X_FRAME_OPTIONS).unwrap(),
            "DENY",
            "non-discord routes keep the global DENY"
        );
        assert!(
            other
                .headers()
                .get(header::CONTENT_SECURITY_POLICY)
                .is_none()
        );
    }

    #[tokio::test]
    async fn test_tuned_listener_binds_ephemeral_port() {
        let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
        let listener = tuned_listener(addr).expect("bind ephemeral port");
        let local = listener.local_addr().unwrap();
        assert!(local.port() > 0, "OS assigned a real port");
        assert!(local.ip().is_loopback());
    }

    #[tokio::test]
    #[serial]
    async fn test_join_unauthorized_without_bearer() {
        std::env::set_var("SUPABASE_JWT_SECRET", "secret");
        let allocator = Arc::new(None::<AgonesAllocator>);
        let resp = join(Extension(allocator), axum::http::HeaderMap::new())
            .await
            .into_response();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[tokio::test]
    #[serial]
    async fn test_join_allocator_offline_returns_503() {
        // No JWT secret -> auth gate is skipped -> reaches the allocator check.
        std::env::remove_var("SUPABASE_JWT_SECRET");
        let allocator = Arc::new(None::<AgonesAllocator>);
        let resp = join(Extension(allocator), axum::http::HeaderMap::new())
            .await
            .into_response();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}
