use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions, PgSslMode};
use std::str::FromStr;
use std::time::Duration;
use tracing::{info, warn};

pub type DbPool = PgPool;

/// Build connection options from either a `postgres://` URL or an Npgsql/ADO.NET string.
/// Parsing only — no network I/O. `Err` means the URL itself is malformed.
fn build_opts(database_url: &str) -> anyhow::Result<PgConnectOptions> {
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

    info!("Database search_path set to: ows,extensions,public");
    Ok(opts.options([("search_path", "ows,extensions,public")]))
}

/// Build a **lazy** pool: connections open on first use, never at construction, so a saturated
/// or unreachable DB cannot crash startup. `min_connections(0)` means no eager/idle connections.
pub fn connect_lazy(database_url: &str) -> anyhow::Result<DbPool> {
    let opts = build_opts(database_url)?;

    let max_conns: u32 = std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50);

    let pool = PgPoolOptions::new()
        .max_connections(max_conns)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(300))
        .connect_lazy_with(opts);
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_lazy_does_not_dial_at_construction() {
        // Unreachable host: a lazy pool must still build without error,
        // because no connection is opened until first acquire.
        let pool = connect_lazy("postgres://u:p@10.255.255.1:5432/none");
        assert!(pool.is_ok(), "lazy pool construction must not fail on an unreachable host");
    }

    #[test]
    fn build_opts_rejects_garbage() {
        assert!(build_opts("not-a-valid-url").is_err());
    }

    #[test]
    fn build_opts_accepts_postgres_url() {
        assert!(build_opts("postgres://u:p@db:5432/app").is_ok());
    }
}

/// Parse an Npgsql/ADO.NET connection string (`Host=...;Port=...;Database=...;...`).
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
                info!(
                    search_path = value,
                    "Npgsql search_path found (overridden by ROWS)"
                );
            }
            _ => {}
        }
    }

    Ok(opts)
}
