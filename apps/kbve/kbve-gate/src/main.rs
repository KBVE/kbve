//! kbve-gate — thin auth reverse-proxy binary built on `kbve::gate`.
//!
//! Runs as a sidecar in front of an internal service (PoC: n8n). Validates a
//! Supabase JWT and applies an authz policy (`is_staff` by default), then
//! proxies HTTP + WebSocket traffic to the upstream.

use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = match kbve::gate::config_from_env() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("gate config error: {e}");
            std::process::exit(2);
        }
    };

    if let Err(e) = kbve::gate::serve(cfg).await {
        tracing::error!("gate exited: {e}");
        std::process::exit(1);
    }
}
