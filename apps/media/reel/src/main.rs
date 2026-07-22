use reel::{api, config, engine, reaper, state};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cfg = config::load_from_env()?;
    let store = state::StateStore::load(cfg.state_file.clone())?;
    let eng = engine::Engine::start(&cfg, store.clone()).await?;
    let transcoder = reel::transcode::Transcoder::new(
        store.clone(),
        cfg.remux_concurrency,
        cfg.encode_concurrency,
        cfg.ffmpeg_bin.clone(),
        cfg.ffprobe_bin.clone(),
        cfg.transcode_enabled,
    );

    tokio::spawn(reaper::reap_loop(
        eng.clone(),
        cfg.ttl_secs,
        cfg.reap_interval_secs,
    ));

    let app = api::router(api::AppState {
        engine: eng,
        store,
        token: cfg.api_token.clone(),
        transcoder,
    });
    let listener = tokio::net::TcpListener::bind(&cfg.api_addr).await?;
    tracing::info!(addr = %cfg.api_addr, "reel listening");
    axum::serve(listener, app).await?;
    Ok(())
}
