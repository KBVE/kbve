mod config;
mod engine;
mod mover;
mod reaper;
mod state;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let cfg = config::load_from_env()?;
    let app = axum::Router::new().route("/healthz", axum::routing::get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind(&cfg.api_addr).await?;
    tracing::info!(addr = %cfg.api_addr, "reel listening");
    axum::serve(listener, app).await?;
    Ok(())
}
