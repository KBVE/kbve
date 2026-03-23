mod grpc;
mod rest;

use std::net::SocketAddr;
use tracing::info;

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

    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "4322".into())
        .parse()?;
    let addr: SocketAddr = format!("{host}:{port}").parse()?;

    // gRPC services (tonic)
    let grpc_router = grpc::router();

    // REST routes (axum) — health, legacy API compat
    let rest_router = rest::router();

    // Multiplex: merge tonic routes into the axum router.
    // gRPC traffic (content-type: application/grpc) is handled by tonic,
    // everything else by axum — single port, single binary.
    let app = rest_router.merge(grpc_router.into_axum_router());

    info!("ROWS listening on {addr} (REST + gRPC multiplexed)");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
