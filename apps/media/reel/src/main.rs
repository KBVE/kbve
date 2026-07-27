use reel::{api, config, engine, reaper, state};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let log_json = std::env::var("REEL_LOG_JSON")
        .map(|v| !(v.eq_ignore_ascii_case("false") || v == "0"))
        .unwrap_or(true);
    let filter = tracing_subscriber::EnvFilter::from_default_env();
    if log_json {
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .json()
            .flatten_event(true)
            .init();
    } else {
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }

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

    let hls = reel::hls::HlsManager::new(
        store.clone(),
        cfg.encode_concurrency,
        cfg.ffmpeg_bin.clone(),
        cfg.hls_segment_secs as u32,
        cfg.hls_enabled,
    );

    tokio::spawn(reaper::reap_loop(
        eng.clone(),
        hls.clone(),
        transcoder.clone(),
        cfg.ttl_secs,
        cfg.reap_interval_secs,
    ));

    tokio::spawn(engine::vpn_watchdog_loop(eng.clone(), cfg.vpn_watchdog_secs));

    if !cfg.trackers_urls.is_empty() {
        tokio::spawn(engine::tracker_refresh_loop(
            eng.clone(),
            cfg.trackers_urls.clone(),
            cfg.trackers_cache.clone(),
            cfg.extra_trackers.clone(),
            cfg.trackers_refresh_secs,
        ));
    }

    tokio::spawn(state::persist_loop(store.clone(), cfg.state_flush_ms));

    let store_for_flush = store.clone();
    let transcoder_for_shutdown = transcoder.clone();
    let hls_for_shutdown = hls.clone();
    let app = api::router(api::AppState {
        engine: eng,
        store,
        token: cfg.api_token.clone(),
        transcoder,
        stream_enabled: cfg.stream_enabled,
        hls,
        ffprobe_bin: cfg.ffprobe_bin.clone(),
    });
    let listener = tokio::net::TcpListener::bind(&cfg.api_addr).await?;
    tracing::info!(addr = %cfg.api_addr, "reel listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    tracing::info!("shutdown signal received; killing ffmpeg children and flushing state");
    transcoder_for_shutdown.abort_all().await;
    hls_for_shutdown.abort_all().await;
    if let Err(e) = store_for_flush.flush() {
        tracing::warn!(error = %e, "state flush on shutdown failed");
    }
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(e) => tracing::warn!(error = %e, "failed to install SIGTERM handler"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}
