use crate::agones::AgonesClient;
use crate::config::{Environment, ReaperKnobs, TenantConfig};
use crate::db::DbPool;
use crate::drain::{ShutdownNotifier, default_notifier};
use crate::mq::MqProducer;
use crate::service::CachedSession;
use crate::supabase::SupabaseConfig;
use dashmap::DashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Instant;
use uuid::Uuid;

pub struct AppState {
    pub db: DbPool,
    /// Read-only pool seam. Defaults to a clone of `db` unless `DATABASE_URL_RO` is set.
    /// Nothing routes to it yet — future read/write split (cnpg -ro).
    pub db_ro: DbPool,
    /// Flipped true on SIGTERM so `/ready` reports NotReady before shutdown.
    pub draining: AtomicBool,
    /// Transport-agnostic player-notify seam (logging no-op today).
    pub notifier: Arc<dyn ShutdownNotifier>,
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
    /// Empty-server reaper knobs (parsed in `RowsConfig`, threaded here for the jobs to read).
    pub reaper: ReaperKnobs,
}

impl AppState {
    pub fn builder() -> AppStateBuilder {
        AppStateBuilder::default()
    }
}

#[derive(Default)]
pub struct AppStateBuilder {
    db: Option<DbPool>,
    db_ro: Option<DbPool>,
    notifier: Option<Arc<dyn ShutdownNotifier>>,
    tenant: Option<TenantConfig>,
    agones_namespace: Option<String>,
    agones_fleet: Option<String>,
    mq: Option<MqProducer>,
    agones: Option<AgonesClient>,
    reaper: Option<ReaperKnobs>,
}

impl AppStateBuilder {
    pub fn db(mut self, pool: DbPool) -> Self {
        self.db = Some(pool);
        self
    }

    pub fn db_ro(mut self, pool: DbPool) -> Self {
        self.db_ro = Some(pool);
        self
    }

    pub fn notifier(mut self, notifier: Arc<dyn ShutdownNotifier>) -> Self {
        self.notifier = Some(notifier);
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

    pub fn reaper_config(mut self, knobs: ReaperKnobs) -> Self {
        self.reaper = Some(knobs);
        self
    }

    pub fn build(self) -> anyhow::Result<Arc<AppState>> {
        let tenant = self
            .tenant
            .ok_or_else(|| anyhow::anyhow!("tenant config required"))?;
        let db = self.db.ok_or_else(|| anyhow::anyhow!("db pool required"))?;
        Ok(Arc::new(AppState {
            db_ro: self.db_ro.unwrap_or_else(|| db.clone()),
            draining: AtomicBool::new(false),
            notifier: self.notifier.unwrap_or_else(default_notifier),
            db,
            sessions: DashMap::new(),
            zone_servers: DashMap::new(),
            zone_spinup_locks: DashMap::new(),
            config: AppConfig {
                customer_guid: tenant.customer_guid,
                tenant_slug: tenant.slug,
                environment: tenant.environment,
                agones_namespace: self.agones_namespace.unwrap_or_else(|| "ows".into()),
                agones_fleet: self.agones_fleet.unwrap_or_else(|| "ows-hubworld".into()),
                reaper: self.reaper.unwrap_or_default(),
            },
            mq: self.mq,
            agones: self.agones,
            supabase: SupabaseConfig::from_env(),
            instance_log: crate::rest::system::InstanceEventLog::new(),
            started_at: Instant::now(),
        }))
    }
}
