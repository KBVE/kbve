use axum::{Router, response::Json, routing::get};
use serde_json::{Value, json};
use std::net::SocketAddr;
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "axum-chuckrpg",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn root() -> &'static str {
    "ChuckRPG API"
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "4322".to_string())
        .parse()
        .expect("HTTP_PORT must be a valid port");

    let addr: SocketAddr = format!("{host}:{port}").parse().unwrap();
    tracing::info!("axum-chuckrpg listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
