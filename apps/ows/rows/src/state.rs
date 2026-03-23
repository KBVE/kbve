use crate::db::DbPool;
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Shared application state — single Arc allocation, no Clone on inner fields.
/// Passed via axum `State<Arc<AppState>>` and tonic interceptors.
pub struct AppState {
    pub db: DbPool,
    /// In-memory session cache: user_session_guid → customer_guid
    pub sessions: DashMap<Uuid, Uuid>,
    /// Zone instance → GameServer name tracking (Agones)
    pub zone_servers: DashMap<i32, String>,
    pub config: AppConfig,
}

pub struct AppConfig {
    pub customer_guid: Uuid,
    pub agones_namespace: String,
    pub agones_fleet: String,
    pub rabbitmq_url: String,
}

impl AppState {
    pub fn builder() -> AppStateBuilder {
        AppStateBuilder::default()
    }
}

#[derive(Default)]
pub struct AppStateBuilder {
    db: Option<DbPool>,
    customer_guid: Option<Uuid>,
    agones_namespace: Option<String>,
    agones_fleet: Option<String>,
    rabbitmq_url: Option<String>,
}

impl AppStateBuilder {
    pub fn db(mut self, pool: DbPool) -> Self {
        self.db = Some(pool);
        self
    }

    pub fn customer_guid(mut self, guid: Uuid) -> Self {
        self.customer_guid = Some(guid);
        self
    }

    pub fn agones(mut self, namespace: impl Into<String>, fleet: impl Into<String>) -> Self {
        self.agones_namespace = Some(namespace.into());
        self.agones_fleet = Some(fleet.into());
        self
    }

    pub fn rabbitmq(mut self, url: impl Into<String>) -> Self {
        self.rabbitmq_url = Some(url.into());
        self
    }

    pub fn build(self) -> anyhow::Result<Arc<AppState>> {
        Ok(Arc::new(AppState {
            db: self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?,
            sessions: DashMap::new(),
            zone_servers: DashMap::new(),
            config: AppConfig {
                customer_guid: self
                    .customer_guid
                    .ok_or_else(|| anyhow::anyhow!("OWS_API_KEY required"))?,
                agones_namespace: self.agones_namespace.unwrap_or_else(|| "ows".into()),
                agones_fleet: self.agones_fleet.unwrap_or_else(|| "ows-hubworld".into()),
                rabbitmq_url: self
                    .rabbitmq_url
                    .unwrap_or_else(|| "amqp://dev:test@localhost:5672".into()),
            },
        }))
    }
}
