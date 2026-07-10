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
    /// UE5 build version loaded off the `ows-server-build` PVC, reported by each gameserver on
    /// boot via `POST /api/System/ReportBuild`. `None` until a gameserver checks in.
    pub server_build_version: std::sync::RwLock<Option<String>>,
    /// Short-TTL cache for the Agones GameServer count behind `/fleet-restart/status`
    /// (`(fetched_at, count)`), shared across callers so an orchestrator polling the endpoint
    /// doesn't turn into a kube-apiserver LIST per request.
    pub gs_count_cache: std::sync::Mutex<Option<(Instant, i64)>>,
    /// In-memory snapshot of the tenant's `deploy_state` row, refreshed by a background job
    /// (`jobs::deploy_state_refresh`, 30s). `/health` reads ONLY this — it is the liveness-probe
    /// path (timeoutSeconds: 3), and a synchronous DB read there turns any Postgres latency spike
    /// into a kubelet restart storm. `None` = no row / table dark. On a refresh error the last
    /// snapshot is kept.
    pub deploy_state_cache: std::sync::RwLock<Option<crate::config::DeployState>>,
}

pub struct AppConfig {
    pub customer_guid: Uuid,
    pub tenant_slug: String,
    pub environment: Environment,
    pub agones_namespace: String,
    pub agones_fleet: String,
    /// Empty-server reaper knobs (parsed in `RowsConfig`, threaded here for the jobs to read).
    pub reaper: ReaperKnobs,
    /// Env baseline for the new-join admission gate (`ROWS_ACCEPT_NEW_JOINS`, default `true`). The
    /// join path combines this with the per-scope `admission_control` overrides.
    pub accept_new_joins: bool,
    /// Non-aggressive fleet-restart stall SLA in seconds (`ROWS_FLEET_RESTART_STALL_SECS`, default
    /// 1800). Past this the restart is `stalled`; past 2× the reconcile auto-lifts the join lockout.
    pub fleet_restart_stall_secs: i64,
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
    accept_new_joins: Option<bool>,
    fleet_restart_stall_secs: Option<i64>,
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

    pub fn accept_new_joins(mut self, accept: bool) -> Self {
        self.accept_new_joins = Some(accept);
        self
    }

    pub fn fleet_restart_stall_secs(mut self, secs: i64) -> Self {
        self.fleet_restart_stall_secs = Some(secs);
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
                accept_new_joins: self.accept_new_joins.unwrap_or(true),
                fleet_restart_stall_secs: self.fleet_restart_stall_secs.unwrap_or(1800),
            },
            mq: self.mq,
            agones: self.agones,
            supabase: SupabaseConfig::from_env(),
            instance_log: crate::rest::system::InstanceEventLog::new(),
            started_at: Instant::now(),
            server_build_version: std::sync::RwLock::new(None),
            gs_count_cache: std::sync::Mutex::new(None),
            deploy_state_cache: std::sync::RwLock::new(None),
        }))
    }
}
