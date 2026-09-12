mod transport;

use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mail=info,tower_http=info".into()),
        )
        .json()
        .init();

    info!("Mail v{}", env!("CARGO_PKG_VERSION"));

    match (
        std::env::var("SUPABASE_URL"),
        std::env::var("SUPABASE_ANON_KEY"),
    ) {
        (Ok(url), Ok(anon)) => {
            let jwt_cache = jedi::jwt_cache::init_jwt_cache(url, anon);
            tokio::spawn(jwt_cache.run_cleanup_task());
        }
        _ => tracing::warn!("SUPABASE_URL / SUPABASE_ANON_KEY unset; every /mail route will 401"),
    }

    transport::https::serve().await
}
