use anyhow::Result;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::{net::SocketAddr, time::Duration};

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{HeaderName, HeaderValue, header},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use poise::serenity_prelude as serenity;
use tokio::net::TcpListener;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::info;

use crate::state::AppState;

/// Shared state available to all Axum handlers.
#[derive(Clone)]
struct HttpState {
    app: Arc<AppState>,
}

pub async fn serve(app_state: Arc<AppState>) -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4321);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let listener = tuned_listener(addr)?;

    info!("HTTP listening on http://{addr}");

    let state = HttpState { app: app_state };
    let app = router(state);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn router(state: HttpState) -> Router {
    let max_inflight: usize = num_cpus::get().max(1) * 1024;

    let static_config = crate::astro::StaticConfig::from_env();

    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        // Security headers
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
        .layer(axum::middleware::from_fn(fix_ts_mime))
        .layer(axum::middleware::from_fn(cache_headers));

    let dynamic_router = Router::new()
        .route("/health", get(health))
        .route("/healthz", get(healthz))
        .route("/bot-restart", post(bot_restart))
        .route("/sign-off", post(sign_off))
        .route("/cleanup-thread", post(cleanup_thread))
        .route("/tracker-status", get(tracker_status))
        .with_state(state);

    static_router.merge(dynamic_router).layer(middleware)
}

// ── Handlers ────────────────────────────────────────────────────────────

/// JSON health endpoint with system metrics.
async fn health(State(state): State<HttpState>) -> impl IntoResponse {
    match state.app.health_monitor.snapshot().await {
        Some(snap) => Json(serde_json::json!({
            "status": "ok",
            "health": snap,
        })),
        None => Json(serde_json::json!({
            "status": "ok",
            "health": null,
            "message": "Health data not yet available"
        })),
    }
}

/// Simple liveness probe for Kubernetes.
async fn healthz() -> &'static str {
    "ok"
}

/// Restart the Discord bot (sets restart flag + shuts down shards).
async fn bot_restart(State(state): State<HttpState>) -> impl IntoResponse {
    state.app.restart_flag.store(true, Ordering::Relaxed);
    if let Some(sm) = state.app.shard_manager.read().await.as_ref() {
        sm.shutdown_all().await;
    }
    Json(serde_json::json!({
        "status": "ok",
        "message": "Bot restart initiated"
    }))
}

/// Graceful shutdown of the entire process.
async fn sign_off(State(state): State<HttpState>) -> impl IntoResponse {
    // Shut down bot shards first
    if let Some(sm) = state.app.shard_manager.read().await.as_ref() {
        sm.shutdown_all().await;
    }
    state.app.shutdown_notify.notify_one();
    Json(serde_json::json!({
        "status": "ok",
        "message": "Shutdown initiated"
    }))
}

/// Delete old bot messages from the configured status thread.
async fn cleanup_thread(State(state): State<HttpState>) -> impl IntoResponse {
    let thread_id = match std::env::var("DISCORD_THREAD_ID")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
    {
        Some(id) => serenity::ChannelId::new(id),
        None => {
            return Json(serde_json::json!({
                "status": "error",
                "message": "DISCORD_THREAD_ID not set"
            }));
        }
    };

    let http = match state.app.bot_http.read().await.clone() {
        Some(h) => h,
        None => {
            return Json(serde_json::json!({
                "status": "error",
                "message": "Bot not connected"
            }));
        }
    };

    // Fetch recent messages
    let messages = match thread_id
        .messages(&http, serenity::GetMessages::new().limit(50))
        .await
    {
        Ok(msgs) => msgs,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to fetch thread messages");
            return Json(serde_json::json!({
                "status": "error",
                "message": "Failed to fetch messages"
            }));
        }
    };

    // Filter to bot's own messages
    let bot_user_id = http.get_current_user().await.map(|u| u.id).ok();
    let to_delete: Vec<serenity::MessageId> = messages
        .iter()
        .filter(|m| bot_user_id.is_some_and(|id| m.author.id == id))
        .map(|m| m.id)
        .collect();

    let count = to_delete.len();
    if count > 1 {
        // Bulk delete (2-100 messages, not older than 14 days)
        let _ = thread_id.delete_messages(&http, &to_delete).await;
    } else if count == 1 {
        let _ = thread_id.delete_message(&http, to_delete[0]).await;
    }

    Json(serde_json::json!({
        "status": "ok",
        "deleted": count
    }))
}

/// Query cluster shard status from Supabase tracker.
async fn tracker_status(State(state): State<HttpState>) -> impl IntoResponse {
    let cluster = std::env::var("CLUSTER_NAME").unwrap_or_else(|_| "default".into());

    match &state.app.tracker {
        Some(tracker) => {
            let shards = tracker.get_cluster_status(&cluster).await;
            Json(serde_json::json!({
                "status": "ok",
                "cluster": cluster,
                "shards": shards
            }))
        }
        None => Json(serde_json::json!({
            "status": "ok",
            "message": "Tracker not configured"
        })),
    }
}

// ── Middleware ───────────────────────────────────────────────────────────

/// Set Cache-Control based on request path.
async fn cache_headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    let cache_value = if path.starts_with("/_astro/") {
        // Content-hashed Vite bundles — cache forever
        "public, max-age=31536000, immutable"
    } else if path.starts_with("/pagefind/") || path.starts_with("/images/") {
        // Build-time generated, static until next deploy
        "public, max-age=86400"
    } else if path.ends_with(".html") || path == "/" || !path.contains('.') {
        // Static HTML pages — immutable until next container deploy
        "public, max-age=86400"
    } else {
        "public, max-age=86400"
    };

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(cache_value));

    response
}

/// Vite outputs worker files with `.ts` extensions. `mime_guess` maps `.ts` to
/// `video/mp2t`, which browsers reject for Web Workers. Override to JS.
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
    use axum::{body::Body, http::StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::health::HealthMonitor;

    /// Build a minimal router with all API endpoints + middleware.
    /// Returns the router and the shared `AppState` so tests can inspect
    /// state mutations (e.g. `restart_flag`) after calling POST endpoints.
    fn test_router() -> (Router, Arc<AppState>) {
        let health_monitor = Arc::new(HealthMonitor::new());
        let app_state = Arc::new(AppState::new(health_monitor, None));
        let state = HttpState {
            app: Arc::clone(&app_state),
        };

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

        let router = Router::new()
            .route("/health", get(health))
            .route("/healthz", get(healthz))
            .route("/bot-restart", post(bot_restart))
            .route("/sign-off", post(sign_off))
            .route("/cleanup-thread", post(cleanup_thread))
            .route("/tracker-status", get(tracker_status))
            .with_state(state)
            .layer(middleware);

        (router, app_state)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let (app, _) = test_router();
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
    }

    #[tokio::test]
    async fn test_healthz_endpoint() {
        let (app, _) = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/healthz")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"ok");
    }

    #[tokio::test]
    async fn test_tracker_status_no_tracker() {
        let (app, _) = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/tracker-status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["message"], "Tracker not configured");
    }

    #[tokio::test]
    async fn test_security_headers() {
        let (app, _) = test_router();
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
    async fn test_fix_ts_mime_rewrites() {
        let app = Router::new()
            .route("/worker.ts", get(|| async { "code" }))
            .route("/script.js", get(|| async { "code" }))
            .layer(axum::middleware::from_fn(fix_ts_mime));

        // .ts file should get JS content-type
        let response = app
            .clone()
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

        // .js file should NOT be rewritten
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/script.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap().to_string());
        assert!(ct.is_none() || !ct.unwrap().contains("application/javascript"));
    }

    #[tokio::test]
    async fn test_bot_restart_sets_flag() {
        let (app, state) = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/bot-restart")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["message"], "Bot restart initiated");

        // Verify the restart flag was actually set
        assert!(state.restart_flag.load(Ordering::Relaxed));
    }

    #[tokio::test]
    async fn test_sign_off_returns_ok() {
        let (app, _) = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sign-off")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["message"], "Shutdown initiated");
    }

    #[tokio::test]
    async fn test_cleanup_thread_no_env() {
        let (app, _) = test_router();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/cleanup-thread")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "error");
        assert_eq!(json["message"], "DISCORD_THREAD_ID not set");
    }
}
