// OWS parity requires many-arg functions in repo/service layers.
#![allow(clippy::too_many_arguments)]
// SDK proxy, pipeline accessors, and repo methods are wired incrementally.
// Dead code warnings suppressed until Iris/FastNoise/dashboard features are complete.
#![allow(dead_code)]

mod agones;
mod convert;
mod db;
mod error;
mod grpc;
mod jobs;
mod middleware;
mod models;
mod mq;
mod openapi;
mod repo;
pub mod rest;
pub mod service;
mod state;
mod trace;
mod ws;

use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tracing::{info, warn};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use uuid::Uuid;

/// Compiled protobuf types from ows.proto + rows.proto.
/// Vendored in src/proto/ — regenerate with `BUILD_PROTO=1 cargo build -p rows`.
pub mod proto {
    pub mod ows {
        include!("proto/ows.rs");
    }
    pub mod rows {
        include!("proto/rows.rs");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install rustls crypto provider before any TLS operations (kube-rs, sqlx).
    // Required since rustls 0.23+ no longer auto-selects a provider.
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rows=info,tower_http=debug".into()),
        )
        .json()
        .with_target(true)
        .with_thread_ids(true)
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/ows".into());
    let api_key = std::env::var("OWS_API_KEY").unwrap_or_else(|_| Uuid::new_v4().to_string());
    let rabbitmq_url =
        std::env::var("RABBITMQ_URL").unwrap_or_else(|_| "amqp://dev:test@localhost:5672".into());
    let agones_ns = std::env::var("AGONES_NAMESPACE").unwrap_or_else(|_| "ows".into());
    let agones_fleet = std::env::var("AGONES_FLEET").unwrap_or_else(|_| "ows-hubworld".into());

    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "4322".into())
        .parse()?;
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    // Database with retry
    let pool = db::connect(&database_url).await?;
    info!("Database connected");

    // RabbitMQ (non-fatal if unavailable)
    let mq_producer = mq::try_connect(&rabbitmq_url).await;
    info!(
        available = mq_producer.is_some(),
        "RabbitMQ initialization complete"
    );

    // Agones (non-fatal if not in-cluster)
    let agones_client = agones::AgonesClient::try_new(&agones_ns, &agones_fleet).await;
    info!(
        available = agones_client.is_some(),
        "Agones initialization complete"
    );

    // Build shared state
    let app_state = state::AppState::builder()
        .db(pool)
        .customer_guid(Uuid::parse_str(&api_key)?)
        .agones_config(&agones_ns, &agones_fleet)
        .mq(mq_producer)
        .agones(agones_client)
        .build()?;

    // Transport-agnostic service layer
    let svc = Arc::new(service::OWSService::new(app_state.clone()));

    // Reconcile: rebuild tracking map from live Agones allocations (crash recovery)
    if let Some(ref agones) = app_state.agones {
        match agones.reconcile_allocations().await {
            Ok(allocs) => {
                for (instance_id, gs_name) in &allocs {
                    app_state.zone_servers.insert(*instance_id, gs_name.clone());
                }
                info!(recovered = allocs.len(), "Startup reconciliation complete");
            }
            Err(e) => {
                warn!(error = %e, "Startup reconciliation failed (non-fatal)");
            }
        }
    }

    // Background jobs (health monitoring, cleanup)
    jobs::spawn_all(svc.clone());

    // GameServer watcher — auto-cleanup DB on server shutdown/delete
    {
        let watcher_state = app_state.clone();
        tokio::spawn(async move {
            agones::watcher::spawn_gameserver_watcher(watcher_state).await;
        });
        info!("GameServer watcher spawned");
    }

    // RabbitMQ consumer (instance launcher handshake)
    // world_server_id=0 is a placeholder — real value comes from register_launcher
    mq::spawn_consumer(&rabbitmq_url, 0, svc.clone()).await;

    // gRPC services
    let grpc_router = grpc::router(svc.clone());

    // REST routes (backward-compat)
    let rest_router = rest::router(app_state, svc.clone());

    // WebSocket routes
    let ws_router = ws::router(svc);

    // Multiplex: gRPC + REST + WebSocket on single port (public)
    let app = rest_router
        .merge(ws_router)
        .merge(grpc_router.into_axum_router())
        .layer(axum::middleware::from_fn(trace::request_trace))
        .layer(TimeoutLayer::with_status_code(
            http::StatusCode::GATEWAY_TIMEOUT,
            std::time::Duration::from_secs(90),
        )) // 90s global request timeout → 504
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024)) // 10MB max body
        .layer(CorsLayer::permissive());

    // Swagger UI on internal-only port (not exposed via HTTPRoute/gateway)
    let docs_port: u16 = std::env::var("DOCS_PORT")
        .unwrap_or_else(|_| "4323".into())
        .parse()
        .unwrap_or(4323);
    let docs_addr: SocketAddr = format!("{host}:{docs_port}").parse()?;
    let docs_app = axum::Router::new().merge(
        SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", openapi::ApiDoc::openapi()),
    );
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(docs_addr).await.unwrap();
        info!("Swagger UI listening on {docs_addr} (internal only)");
        axum::serve(listener, docs_app).await.ok();
    });

    info!("ROWS listening on {addr} (REST + gRPC + WS multiplexed)");

    // Graceful shutdown: drain in-flight requests on SIGTERM/SIGINT
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("ROWS shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received Ctrl+C, shutting down..."),
        _ = terminate => info!("Received SIGTERM, shutting down..."),
    }
}
