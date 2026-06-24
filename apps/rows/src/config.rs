use anyhow::{Context, anyhow};
use std::net::SocketAddr;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Environment {
    Dev,
    Beta,
    Release,
}

impl Environment {
    pub fn as_str(self) -> &'static str {
        match self {
            Environment::Dev => "dev",
            Environment::Beta => "beta",
            Environment::Release => "release",
        }
    }

    fn parse(raw: &str) -> anyhow::Result<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "dev" | "development" => Ok(Environment::Dev),
            "beta" | "staging" => Ok(Environment::Beta),
            "release" | "prod" | "production" => Ok(Environment::Release),
            other => Err(anyhow!(
                "invalid OWS_ENV '{other}' (expected dev|beta|release)"
            )),
        }
    }

    fn requires_explicit_guid(self) -> bool {
        matches!(self, Environment::Beta | Environment::Release)
    }
}

/// Defaults are only safe in dev; for beta/release an unset value would silently collide
/// multiple tenants onto the same fleet/namespace, so require it explicitly there.
fn require_or_default(
    var: &str,
    default: &str,
    environment: Environment,
) -> anyhow::Result<String> {
    match std::env::var(var) {
        Ok(v) => Ok(v),
        Err(_) if environment.requires_explicit_guid() => Err(anyhow!(
            "{var} is required for OWS_ENV={}",
            environment.as_str()
        )),
        Err(_) => Ok(default.to_string()),
    }
}

#[derive(Clone)]
pub struct TenantConfig {
    pub customer_guid: Uuid,
    pub slug: String,
    pub environment: Environment,
}

/// Empty-server reaper knobs (all gated OFF / inert by default). Grouped so the six values
/// thread through the state builder as one argument instead of six positional primitives.
#[derive(Clone, Debug)]
pub struct ReaperKnobs {
    /// Master kill switch — the whole reaper loop no-ops when false.
    pub enabled: bool,
    /// Independently gates the time-based `NeverReported` path; keep off until the heartbeat
    /// is confirmed live in the target env, or it deallocates populated servers.
    pub never_reported: bool,
    /// `NeverReported` boot-grace window.
    pub boot_grace_secs: i64,
    /// Buffer added to the per-map empty timeout so the server's own `SDK.Shutdown()` wins first.
    pub buffer_secs: i64,
    /// Reap a still-"populated" instance whose heartbeat went stale this many seconds ago
    /// (crashed-while-populated). `0` = disabled. Only safe once heartbeats are reliably live.
    pub stale_secs: i64,
    /// Floor on the effective empty timeout so a freshly allocated server isn't reaped under a
    /// still-loading player even if a map is misconfigured with a tiny timeout.
    pub min_empty_secs: i64,
}

impl Default for ReaperKnobs {
    fn default() -> Self {
        Self {
            enabled: false,
            never_reported: false,
            boot_grace_secs: 14400,
            buffer_secs: 30,
            stale_secs: 0,
            min_empty_secs: 300,
        }
    }
}

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_i64(key: &str, default: i64) -> i64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub struct RowsConfig {
    pub tenant: TenantConfig,
    pub database_url: String,
    pub rabbitmq_url: String,
    pub agones_namespace: String,
    pub agones_fleet: String,
    pub http_addr: SocketAddr,
    pub metrics_port: u16,
    pub docs_port: u16,
    pub reaper: ReaperKnobs,
}

impl RowsConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let environment = match std::env::var("OWS_ENV") {
            Ok(raw) => Environment::parse(&raw)?,
            Err(_) => Environment::Dev,
        };

        let customer_guid = match std::env::var("OWS_API_KEY") {
            Ok(raw) => Uuid::parse_str(raw.trim())
                .with_context(|| format!("OWS_API_KEY '{raw}' is not a valid UUID"))?,
            Err(_) if environment.requires_explicit_guid() => {
                return Err(anyhow!(
                    "OWS_API_KEY (tenant customer_guid) is required for OWS_ENV={}",
                    environment.as_str()
                ));
            }
            Err(_) => {
                let ephemeral = Uuid::new_v4();
                tracing::warn!(
                    customer_guid = %ephemeral,
                    "OWS_API_KEY unset; generated ephemeral tenant for dev — state will not persist across restarts"
                );
                ephemeral
            }
        };

        let slug = std::env::var("OWS_TENANT_SLUG").unwrap_or_else(|_| "default".into());

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/ows".into());
        let rabbitmq_url = std::env::var("RABBITMQ_URL")
            .unwrap_or_else(|_| "amqp://dev:test@localhost:5672".into());
        let agones_namespace = require_or_default("AGONES_NAMESPACE", "ows", environment)?;
        let agones_fleet = require_or_default("AGONES_FLEET", "ows-hubworld", environment)?;

        let host = std::env::var("HTTP_HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let port: u16 = std::env::var("HTTP_PORT")
            .unwrap_or_else(|_| "4322".into())
            .parse()
            .context("HTTP_PORT must be a u16")?;
        let http_addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .with_context(|| format!("invalid HTTP bind address {host}:{port}"))?;

        let metrics_port: u16 = std::env::var("METRICS_PORT")
            .unwrap_or_else(|_| "4324".into())
            .parse()
            .unwrap_or(4324);
        let docs_port: u16 = std::env::var("DOCS_PORT")
            .unwrap_or_else(|_| "4323".into())
            .parse()
            .unwrap_or(4323);

        // Empty-server reaper knobs. Booleans default OFF: the reaper ships inert and the
        // time-based paths stay gated until a live heartbeat is confirmed (see reaper safety note).
        let reaper = ReaperKnobs {
            enabled: env_bool("ROWS_EMPTY_REAPER_ENABLED", false),
            never_reported: env_bool("ROWS_REAP_NEVER_REPORTED", false),
            boot_grace_secs: env_i64("ROWS_EMPTY_REAP_BOOT_GRACE_SECS", 14400),
            buffer_secs: env_i64("ROWS_EMPTY_REAP_BUFFER_SECS", 30),
            stale_secs: env_i64("ROWS_EMPTY_REAP_STALE_SECS", 0),
            min_empty_secs: env_i64("ROWS_EMPTY_REAP_MIN_EMPTY_SECS", 300),
        };

        Ok(Self {
            tenant: TenantConfig {
                customer_guid,
                slug,
                environment,
            },
            database_url,
            rabbitmq_url,
            agones_namespace,
            agones_fleet,
            http_addr,
            metrics_port,
            docs_port,
            reaper,
        })
    }
}
