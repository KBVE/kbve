use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions, PgSslMode};
use std::str::FromStr;
use std::time::Duration;
use tracing::{info, warn};

pub type DbPool = PgPool;

pub async fn connect(database_url: &str) -> anyhow::Result<DbPool> {
    // Auto-detect format: postgres:// URL or Npgsql semicolon-delimited
    let opts =
        if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://") {
            info!("Parsing DATABASE_URL as postgres:// URL");
            PgConnectOptions::from_str(database_url)?
        } else if database_url.contains('=') && database_url.contains(';') {
            info!("Parsing DATABASE_URL as Npgsql/ADO.NET connection string");
            parse_npgsql(database_url)?
        } else {
            anyhow::bail!(
                "DATABASE_URL must be a postgres:// URL or Npgsql connection string. Got: {}...",
                &database_url[..database_url.len().min(40)]
            );
        };

    // Set search_path for OWS schema resolution
    let opts = opts.options([("search_path", "ows,extensions,public")]);
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

/// Parse an Npgsql/ADO.NET connection string into PgConnectOptions.
///
/// Format: `Host=host;Port=5432;Database=db;Username=user;Password=pass;...`
///
/// Supported keys (case-insensitive):
///   Host, Server → hostname
///   Port → port
///   Database → database
///   Username, User ID, User → username
///   Password → password
///   SSL Mode, SslMode → ssl mode
///   Search Path → search_path (applied via options)
fn parse_npgsql(conn_str: &str) -> anyhow::Result<PgConnectOptions> {
    let mut opts = PgConnectOptions::new();

    for part in conn_str.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let (key, value) = part
            .split_once('=')
            .ok_or_else(|| anyhow::anyhow!("Invalid key=value in connection string: {part}"))?;

        let key_lower = key.trim().to_lowercase();
        let value = value.trim();

        match key_lower.as_str() {
            "host" | "server" => {
                opts = opts.host(value);
            }
            "port" => {
                opts = opts.port(value.parse::<u16>().unwrap_or(5432));
            }
            "database" => {
                opts = opts.database(value);
            }
            "username" | "user id" | "user" => {
                opts = opts.username(value);
            }
            "password" => {
                opts = opts.password(value);
            }
            "ssl mode" | "sslmode" => match value.to_lowercase().as_str() {
                "disable" | "none" => opts = opts.ssl_mode(PgSslMode::Disable),
                "prefer" => opts = opts.ssl_mode(PgSslMode::Prefer),
                "require" => opts = opts.ssl_mode(PgSslMode::Require),
                "verify-ca" | "verifyca" => opts = opts.ssl_mode(PgSslMode::VerifyCa),
                "verify-full" | "verifyfull" => opts = opts.ssl_mode(PgSslMode::VerifyFull),
                _ => warn!(ssl_mode = value, "Unknown SSL mode, using default"),
            },
            "search path" => {
                // Will be overridden by our explicit options() call, but log it
                info!(
                    search_path = value,
                    "Npgsql search_path found (overridden by ROWS)"
                );
            }
            _ => {
                // Skip unknown keys (Pooling, Timeout, CommandTimeout, etc.)
            }
        }
    }

    Ok(opts)
}
