use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use std::str::FromStr;
use std::time::Duration;
use tracing::info;

pub type DbPool = PgPool;

pub async fn connect(database_url: &str) -> anyhow::Result<DbPool> {
    // Parse the URL and ensure search_path is set for OWS schema resolution.
    // sqlx respects PgConnectOptions which supports options=-c search_path=...
    let mut opts = PgConnectOptions::from_str(database_url)?;

    // If the URL doesn't already contain options with search_path, set it.
    // OWS tables live in the 'ows' schema, crypt()/gen_salt() in 'extensions'.
    opts = opts.options([("search_path", "ows,extensions,public")]);

    info!("Database search_path set to: ows,extensions,public");

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(300))
        .connect_with(opts)
        .await?;
    Ok(pool)
}
