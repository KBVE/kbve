use crate::agones::AgonesClient;
use crate::db::DbPool;
use crate::mq::MqProducer;
use crate::service::CachedSession;
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Shared application state — single Arc allocation, no Clone on inner fields.
pub struct AppState {
    pub db: DbPool,
    /// In-memory session cache: user_session_guid → CachedSession
    pub sessions: DashMap<Uuid, CachedSession>,
    /// Zone instance → GameServer name tracking (Agones)
    pub zone_servers: DashMap<i32, String>,
    /// Spin-up lock: zone_name → true if allocation is in progress.
    /// Prevents duplicate Agones allocations for the same zone.
    pub zone_spinup_locks: DashMap<String, bool>,
    pub config: AppConfig,
    /// RabbitMQ producer (None if unavailable — non-fatal)
    pub mq: Option<MqProducer>,
    /// Agones allocator (None if not in-cluster — non-fatal)
    pub agones: Option<AgonesClient>,
}

pub struct AppConfig {
    pub customer_guid: Uuid,
    pub agones_namespace: String,
    pub agones_fleet: String,
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
    mq: Option<MqProducer>,
    agones: Option<AgonesClient>,
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

    pub fn agones_config(mut self, namespace: impl Into<String>, fleet: impl Into<String>) -> Self {
        self.agones_namespace = Some(namespace.into());
        self.agones_fleet = Some(fleet.into());
        self
    }

    pub fn mq(mut self, producer: Option<MqProducer>) -> Self {
        self.mq = producer;
        self
    }

    pub fn agones(mut self, client: Option<AgonesClient>) -> Self {
        self.agones = client;
        self
    }

    pub fn build(self) -> anyhow::Result<Arc<AppState>> {
        Ok(Arc::new(AppState {
            db: self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?,
            sessions: DashMap::new(),
            zone_servers: DashMap::new(),
            zone_spinup_locks: DashMap::new(),
            config: AppConfig {
                customer_guid: self
                    .customer_guid
                    .ok_or_else(|| anyhow::anyhow!("OWS_API_KEY required"))?,
                agones_namespace: self.agones_namespace.unwrap_or_else(|| "ows".into()),
                agones_fleet: self.agones_fleet.unwrap_or_else(|| "ows-hubworld".into()),
            },
            mq: self.mq,
            agones: self.agones,
        }))
    }
}
