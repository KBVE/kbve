mod agones;
mod db;
mod error;
mod grpc;
mod middleware;
mod models;
mod mq;
mod repo;
mod rest;
mod state;

use std::net::SocketAddr;
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
                .unwrap_or_else(|_| "rows=info,tower_http=info".into()),
        )
        .json()
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/ows".into());
    let api_key = std::env::var("OWS_API_KEY").unwrap_or_else(|_| Uuid::new_v4().to_string());

    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "4322".into())
        .parse()?;
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    // Database
    let pool = db::connect(&database_url).await?;
    info!("Database connected");

    // Build shared state — single Arc allocation
    let app_state = state::AppState::builder()
        .db(pool)
        .customer_guid(Uuid::parse_str(&api_key)?)
        .agones(
            std::env::var("AGONES_NAMESPACE").unwrap_or_else(|_| "ows".into()),
            std::env::var("AGONES_FLEET").unwrap_or_else(|_| "ows-hubworld".into()),
        )
        .rabbitmq(
            std::env::var("RABBITMQ_URL")
                .unwrap_or_else(|_| "amqp://dev:test@localhost:5672".into()),
        )
        .build()?;

    // gRPC services (tonic) — shares Arc<AppState>
    let grpc_router = grpc::router();

    // REST routes (axum) — backward-compat with C# OWS API paths
    let rest_router = rest::router(app_state);

    // Multiplex: gRPC (content-type: application/grpc) + REST on single port
    let app = rest_router.merge(grpc_router.into_axum_router());

    info!("ROWS listening on {addr} (REST + gRPC multiplexed)");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
