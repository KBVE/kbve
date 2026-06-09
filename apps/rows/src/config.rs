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

#[derive(Clone)]
pub struct TenantConfig {
    pub customer_guid: Uuid,
    pub slug: String,
    pub environment: Environment,
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
        let agones_namespace = std::env::var("AGONES_NAMESPACE").unwrap_or_else(|_| "ows".into());
        let agones_fleet = std::env::var("AGONES_FLEET").unwrap_or_else(|_| "ows-hubworld".into());

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
        })
    }
}
