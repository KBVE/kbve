use crate::agones::AgonesClient;
use crate::config::{Environment, TenantConfig};
use crate::db::DbPool;
use crate::mq::MqProducer;
use crate::service::CachedSession;
use crate::supabase::SupabaseConfig;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

pub struct AppState {
    pub db: DbPool,
    pub sessions: DashMap<Uuid, CachedSession>,
    pub zone_servers: DashMap<i32, String>,
    /// Spin-up lock keyed by zone; stores timestamp so stale locks can be aged out.
    pub zone_spinup_locks: DashMap<String, Instant>,
    pub config: AppConfig,
    pub mq: Option<MqProducer>,
    pub agones: Option<AgonesClient>,
    pub supabase: SupabaseConfig,
    pub instance_log: crate::rest::system::InstanceEventLog,
    pub started_at: Instant,
}

pub struct AppConfig {
    pub customer_guid: Uuid,
    pub tenant_slug: String,
    pub environment: Environment,
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
    tenant: Option<TenantConfig>,
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

    pub fn tenant(mut self, tenant: TenantConfig) -> Self {
        self.tenant = Some(tenant);
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
        let tenant = self
            .tenant
            .ok_or_else(|| anyhow::anyhow!("tenant config required"))?;
        Ok(Arc::new(AppState {
            db: self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?,
            sessions: DashMap::new(),
            zone_servers: DashMap::new(),
            zone_spinup_locks: DashMap::new(),
            config: AppConfig {
                customer_guid: tenant.customer_guid,
                tenant_slug: tenant.slug,
                environment: tenant.environment,
                agones_namespace: self.agones_namespace.unwrap_or_else(|| "ows".into()),
                agones_fleet: self.agones_fleet.unwrap_or_else(|| "ows-hubworld".into()),
            },
            mq: self.mq,
            agones: self.agones,
            supabase: SupabaseConfig::from_env(),
            instance_log: crate::rest::system::InstanceEventLog::new(),
            started_at: Instant::now(),
        }))
    }
}
