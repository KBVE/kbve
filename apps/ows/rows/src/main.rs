mod agones;
mod convert;
mod db;
mod error;
mod grpc;
mod middleware;
mod models;
mod mq;
mod repo;
mod rest;
pub mod service;
mod state;
mod trace;

use std::net::SocketAddr;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// Compiled protobuf types from ows.proto + rows.proto
pub mod proto {
    pub mod ows {
        tonic::include_proto!("ows");
    }
    pub mod rows {
        tonic::include_proto!("rows");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
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

    // Database
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

    // Build shared state — single Arc allocation
    let app_state = state::AppState::builder()
        .db(pool)
        .customer_guid(Uuid::parse_str(&api_key)?)
        .agones_config(&agones_ns, &agones_fleet)
        .mq(mq_producer)
        .agones(agones_client)
        .build()?;

    // Transport-agnostic service layer — shared across REST, gRPC, WebSocket
    let svc = Arc::new(service::OWSService::new(app_state.clone()));

    // gRPC services (tonic)
    let grpc_router = grpc::router(app_state.clone(), svc.clone());

    // REST routes (axum) — backward-compat with C# OWS API paths
    let rest_router = rest::router(app_state, svc);

    // Multiplex: gRPC (content-type: application/grpc) + REST on single port
    let app = rest_router
        .merge(grpc_router.into_axum_router())
        .layer(axum::middleware::from_fn(trace::request_trace));

    info!("ROWS listening on {addr} (REST + gRPC multiplexed)");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
