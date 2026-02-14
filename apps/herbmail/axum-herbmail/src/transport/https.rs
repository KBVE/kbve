use anyhow::Result;
use std::{net::SocketAddr, time::Duration};

use axum::{
    extract::Request,
    middleware::Next,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use tokio::net::TcpListener;
use tracing::info;

pub async fn serve() -> Result<()> {
    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4321);
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    let listener = tuned_listener(addr)?;

    info!("HTTP listening on http://{addr}");

    let app = router();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn router() -> Router {
    use tower_http::compression::Predicate as _;

    let max_inflight: usize = num_cpus::get().max(1) * 1024;

    let static_config = crate::astro::StaticConfig::from_env();

    let compression = tower_http::compression::CompressionLayer::new().compress_when(
        tower_http::compression::predicate::DefaultPredicate::new()
            .and(tower_http::compression::predicate::SizeAbove::new(1024)),
    );

    let middleware = tower::ServiceBuilder::new()
        .layer(
            tower_http::trace::TraceLayer::new_for_http().make_span_with(
                tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
            ),
        )
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(compression)
        .layer(axum::error_handling::HandleErrorLayer::new(
            |err: tower::BoxError| async move {
                if err.is::<tower::timeout::error::Elapsed>() {
                    (axum::http::StatusCode::REQUEST_TIMEOUT, "request timed out")
                } else if err.is::<tower::load_shed::error::Overloaded>() {
                    (axum::http::StatusCode::SERVICE_UNAVAILABLE, "service overloaded")
                } else {
                    tracing::warn!(error = %err, "middleware error");
                    (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
                }
            },
        ))
        .timeout(Duration::from_secs(10))
        .concurrency_limit(max_inflight)
        .load_shed()
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1024 * 1024));

    let static_router = crate::astro::build_static_router(&static_config)
        .layer(axum::middleware::from_fn(fix_ts_mime));

    let public_router = Router::new()
        .route("/health", get(health));

    let dynamic_router = public_router;

    static_router
        .merge(dynamic_router)
        .layer(middleware)
}

async fn health() -> impl IntoResponse {
    "OK"
}

/// Vite outputs worker files with `.ts` extensions. `mime_guess` maps `.ts` to
/// `video/mp2t`, which browsers reject for Web Workers. Override to JS.
async fn fix_ts_mime(request: Request, next: Next) -> Response {
    let is_ts = request.uri().path().ends_with(".ts");
    let mut response = next.run(request).await;
    if is_ts {
        response.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/javascript; charset=utf-8".parse().unwrap(),
        );
    }
    response
}

fn tuned_listener(addr: SocketAddr) -> Result<TcpListener> {
    use socket2::{Socket, Domain, Type, Protocol};

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
