use axum::{routing::get, Router};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let app = Router::new().route("/healthz", get(|| async { "ok" }));
    let addr = "0.0.0.0:8080";
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "reel listening");
    axum::serve(listener, app).await?;
    Ok(())
}
