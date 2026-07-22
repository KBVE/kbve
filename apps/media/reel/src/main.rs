mod api;
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
    let store = state::StateStore::load(cfg.state_file.clone())?;
    let eng = engine::Engine::start(&cfg, store.clone()).await?;

    tokio::spawn(reaper::reap_loop(
        store.clone(),
        cfg.ttl_secs,
        cfg.reap_interval_secs,
    ));

    let app = api::router(api::AppState {
        engine: eng,
        store,
        token: cfg.api_token.clone(),
    });
    let listener = tokio::net::TcpListener::bind(&cfg.api_addr).await?;
    tracing::info!(addr = %cfg.api_addr, "reel listening");
    axum::serve(listener, app).await?;
    Ok(())
}
