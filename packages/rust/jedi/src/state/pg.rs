//! PgCluster — first-class CNPG-aware Postgres pool set.
//!
//! Three pools matching the CNPG instance topology:
//!
//!   - `rw`  → `supabase-cluster-rw`  primary, writes + read-after-write
//!   - `ro`  → `supabase-cluster-ro`  HA replicas, strict reads
//!   - `any` → `supabase-cluster-r`   any healthy instance, read fallback
//!
//! TLS via `tokio-postgres-rustls`. URLs with `sslmode=disable` bypass
//! TLS transparently at the libpq layer (the rustls factory is only
//! consulted when the URL asks for SSL), so the same connector serves
//! in-cluster (`sslmode=disable`) and external (`sslmode=require`)
//! deployments.
//!
//! Environment:
//!
//!   - `KBVE_PG_RW_URL`  (required; falls back to `DATABASE_URL_PROD`
//!                        then `WALLET_DATABASE_URL` for compat)
//!   - `KBVE_PG_RO_URL`  (optional; falls back to `DATABASE_URL_PROD_RO`
//!                        then `WALLET_DATABASE_URL_RO`; defaults to
//!                        `KBVE_PG_RW_URL` if absent)
//!   - `KBVE_PG_ANY_URL` (optional; defaults to `KBVE_PG_RW_URL`)
//!   - `KBVE_PG_USE_POOLER` (`true`/`1`/`yes` rewrites
//!                          `supabase-cluster-rw` →
//!                          `supabase-cluster-pooler-rw` etc.)
//!   - `KBVE_PG_APPLICATION_NAME` (default `"kbve"`)
//!   - `KBVE_PG_<RW|RO|ANY>_MAX_SIZE`
//!   - `KBVE_PG_<RW|RO|ANY>_CONNECT_TIMEOUT_MS`
//!   - `KBVE_PG_<RW|RO|ANY>_IDLE_TIMEOUT_MS` (0 disables)
//!   - `KBVE_PG_<RW|RO|ANY>_STATEMENT_TIMEOUT_MS` (0 disables)

use std::{env, sync::Arc, time::Duration};

use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use futures_util::future::BoxFuture;
use rustls::{ClientConfig, RootCertStore};
use tokio_postgres::Config as PgConfig;
use tokio_postgres_rustls::MakeRustlsConnect;
use uuid::Uuid;

use crate::entity::error::JediError;

/// Re-export so consumers don't need a direct `tokio-postgres` dep for
/// `Transaction`, `Row`, `types::*`, etc. used inside `with_caller_read`
/// closures.
pub use tokio_postgres;

pub type PgPool = Pool<PostgresConnectionManager<MakeRustlsConnect>>;
pub type PgConn<'a> = bb8::PooledConnection<'a, PostgresConnectionManager<MakeRustlsConnect>>;

/// Boxed future shape expected from the `with_caller_read` closure body.
/// Lets consumers write `|tx| Box::pin(async move { … })` without
/// spelling out the full `futures_util::future::BoxFuture` path.
pub type PgCallerReadFut<'tx, T> = BoxFuture<'tx, Result<T, JediError>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PgRole {
    Rw,
    Ro,
    Any,
}

impl PgRole {
    fn env_prefix(self) -> &'static str {
        match self {
            PgRole::Rw => "KBVE_PG_RW",
            PgRole::Ro => "KBVE_PG_RO",
            PgRole::Any => "KBVE_PG_ANY",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PgPoolConfig {
    pub max_size: u32,
    pub connect_timeout: Duration,
    pub idle_timeout: Option<Duration>,
    pub statement_timeout_ms: Option<u64>,
    pub application_name: String,
}

impl PgPoolConfig {
    pub fn defaults_for(role: PgRole, application_name: String) -> Self {
        let max_size = match role {
            PgRole::Rw => 20,
            PgRole::Ro => 30,
            PgRole::Any => 10,
        };
        Self {
            max_size,
            connect_timeout: Duration::from_secs(5),
            idle_timeout: Some(Duration::from_secs(60)),
            statement_timeout_ms: Some(30_000),
            application_name,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PgClusterConfig {
    pub rw_url: String,
    pub ro_url: String,
    pub any_url: String,
    pub rw: PgPoolConfig,
    pub ro: PgPoolConfig,
    pub any: PgPoolConfig,
    pub use_pooler: bool,
}

impl PgClusterConfig {
    pub fn from_env() -> Result<Self, JediError> {
        let app = env::var("KBVE_PG_APPLICATION_NAME").unwrap_or_else(|_| "kbve".to_string());

        let rw_url = read_url_env(&["KBVE_PG_RW_URL", "DATABASE_URL_PROD", "WALLET_DATABASE_URL"])
            .ok_or_else(|| {
                JediError::Internal(
                    "KBVE_PG_RW_URL (or DATABASE_URL_PROD / WALLET_DATABASE_URL) not set".into(),
                )
            })?;

        let ro_url = read_url_env(&[
            "KBVE_PG_RO_URL",
            "DATABASE_URL_PROD_RO",
            "WALLET_DATABASE_URL_RO",
        ])
        .unwrap_or_else(|| rw_url.clone());

        let any_url = read_url_env(&["KBVE_PG_ANY_URL"]).unwrap_or_else(|| rw_url.clone());

        let use_pooler = env::var("KBVE_PG_USE_POOLER")
            .ok()
            .map(|v| {
                matches!(
                    v.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false);

        let mut cfg = Self {
            rw_url,
            ro_url,
            any_url,
            rw: PgPoolConfig::defaults_for(PgRole::Rw, app.clone()),
            ro: PgPoolConfig::defaults_for(PgRole::Ro, app.clone()),
            any: PgPoolConfig::defaults_for(PgRole::Any, app),
            use_pooler,
        };
        apply_pool_env(&mut cfg.rw, PgRole::Rw.env_prefix());
        apply_pool_env(&mut cfg.ro, PgRole::Ro.env_prefix());
        apply_pool_env(&mut cfg.any, PgRole::Any.env_prefix());
        Ok(cfg)
    }

    pub fn resolved_url(&self, role: PgRole) -> String {
        let raw = match role {
            PgRole::Rw => &self.rw_url,
            PgRole::Ro => &self.ro_url,
            PgRole::Any => &self.any_url,
        };
        rewrite_pooler_host(raw, self.use_pooler, role)
    }
}

fn read_url_env(keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Ok(v) = env::var(k) {
            let t = v.trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }
    None
}

fn apply_pool_env(pool: &mut PgPoolConfig, prefix: &str) {
    if let Some(v) = parse_env::<u32>(&format!("{prefix}_MAX_SIZE")) {
        if v >= 1 {
            pool.max_size = v;
        }
    }
    if let Some(v) = parse_env::<u64>(&format!("{prefix}_CONNECT_TIMEOUT_MS")) {
        pool.connect_timeout = Duration::from_millis(v);
    }
    if let Some(v) = parse_env::<u64>(&format!("{prefix}_IDLE_TIMEOUT_MS")) {
        pool.idle_timeout = if v == 0 {
            None
        } else {
            Some(Duration::from_millis(v))
        };
    }
    if let Some(v) = parse_env::<u64>(&format!("{prefix}_STATEMENT_TIMEOUT_MS")) {
        pool.statement_timeout_ms = if v == 0 { None } else { Some(v) };
    }
}

fn parse_env<T: std::str::FromStr>(key: &str) -> Option<T> {
    env::var(key).ok().and_then(|s| s.trim().parse().ok())
}

fn rewrite_pooler_host(url: &str, use_pooler: bool, role: PgRole) -> String {
    if !use_pooler {
        return url.to_string();
    }
    let (from, to) = match role {
        PgRole::Rw => ("supabase-cluster-rw", "supabase-cluster-pooler-rw"),
        PgRole::Ro => ("supabase-cluster-ro", "supabase-cluster-pooler-ro"),
        PgRole::Any => return url.to_string(),
    };
    url.replace(from, to)
}

#[derive(Debug, Clone)]
struct OnAcquire {
    statement_timeout_ms: Option<u64>,
}

impl bb8::CustomizeConnection<tokio_postgres::Client, tokio_postgres::Error> for OnAcquire {
    fn on_acquire<'a>(
        &'a self,
        conn: &'a mut tokio_postgres::Client,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<(), tokio_postgres::Error>> + Send + 'a>,
    > {
        Box::pin(async move {
            if let Some(ms) = self.statement_timeout_ms {
                conn.simple_query(&format!("SET statement_timeout = {ms}"))
                    .await?;
            }
            Ok(())
        })
    }
}

#[derive(Debug, Clone)]
pub struct PgRoleHealth {
    pub role: PgRole,
    pub ok: bool,
    pub latency: Duration,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PgClusterHealth {
    pub rw: PgRoleHealth,
    pub ro: PgRoleHealth,
    pub any: PgRoleHealth,
}

impl PgClusterHealth {
    pub fn all_ok(&self) -> bool {
        self.rw.ok && self.ro.ok && self.any.ok
    }
}

pub struct PgCluster {
    rw: PgPool,
    ro: PgPool,
    any: PgPool,
    cfg: PgClusterConfig,
}

impl PgCluster {
    pub async fn from_env() -> Result<Arc<Self>, JediError> {
        let cfg = PgClusterConfig::from_env()?;
        Self::build(cfg).await
    }

    pub async fn build(cfg: PgClusterConfig) -> Result<Arc<Self>, JediError> {
        let connector = make_rustls_connector()?;
        let rw = build_pool(&cfg.resolved_url(PgRole::Rw), &cfg.rw, connector.clone()).await?;
        let ro = build_pool(&cfg.resolved_url(PgRole::Ro), &cfg.ro, connector.clone()).await?;
        let any = build_pool(&cfg.resolved_url(PgRole::Any), &cfg.any, connector).await?;
        tracing::info!(
            rw_max = cfg.rw.max_size,
            ro_max = cfg.ro.max_size,
            any_max = cfg.any.max_size,
            use_pooler = cfg.use_pooler,
            "[PgCluster] pools built"
        );
        let arc = Arc::new(Self { rw, ro, any, cfg });
        #[cfg(feature = "prometheus")]
        let _ = spawn_state_sampler(Arc::downgrade(&arc));
        Ok(arc)
    }

    /// Per-role liveness probe. `SELECT 1` against each pool in
    /// parallel under a 1s deadline.
    pub async fn health(&self) -> PgClusterHealth {
        let (rw, ro, any) = tokio::join!(
            probe_role(PgRole::Rw, &self.rw),
            probe_role(PgRole::Ro, &self.ro),
            probe_role(PgRole::Any, &self.any),
        );
        PgClusterHealth { rw, ro, any }
    }

    pub fn rw_pool(&self) -> &PgPool {
        &self.rw
    }
    pub fn ro_pool(&self) -> &PgPool {
        &self.ro
    }
    pub fn any_pool(&self) -> &PgPool {
        &self.any
    }
    pub fn config(&self) -> &PgClusterConfig {
        &self.cfg
    }

    pub async fn write(&self) -> Result<PgConn<'_>, JediError> {
        timed_acquire(PgRole::Rw, &self.rw, false).await
    }

    pub async fn strict_read(&self) -> Result<PgConn<'_>, JediError> {
        timed_acquire(PgRole::Ro, &self.ro, false).await
    }

    pub async fn any_read(&self) -> Result<PgConn<'_>, JediError> {
        timed_acquire(PgRole::Any, &self.any, false).await
    }

    /// Read connection with `ro` → `any` fallback for non-critical
    /// reads that should survive a replica blip.
    pub async fn read(&self) -> Result<PgConn<'_>, JediError> {
        match timed_acquire(PgRole::Ro, &self.ro, false).await {
            Ok(c) => Ok(c),
            Err(e) => {
                tracing::warn!(error = %e, "[PgCluster] ro pool acquire failed; falling back to any pool");
                timed_acquire(PgRole::Any, &self.any, true).await
            }
        }
    }

    /// Read-only tx on the `ro` pool with `request.jwt.claims`
    /// impersonating the given subject. Commits on `Ok`, rolls back
    /// on `Err`.
    pub async fn with_caller_read<T, F>(
        &self,
        sub: Uuid,
        role: Option<&str>,
        f: F,
    ) -> Result<T, JediError>
    where
        T: Send,
        F: for<'tx> FnOnce(
                &'tx tokio_postgres::Transaction<'_>,
            ) -> BoxFuture<'tx, Result<T, JediError>>
            + Send,
    {
        let mut conn = self.strict_read().await?;
        let tx = conn.transaction().await.map_err(JediError::from)?;
        let claims = serde_json::json!({
            "role": role.unwrap_or("authenticated"),
            "sub": sub.to_string(),
        })
        .to_string();
        tx.execute(
            "SELECT set_config('request.jwt.claims', $1::text, true)",
            &[&claims],
        )
        .await
        .map_err(JediError::from)?;
        let out = f(&tx).await?;
        tx.commit().await.map_err(JediError::from)?;
        Ok(out)
    }
}

async fn probe_role(role: PgRole, pool: &PgPool) -> PgRoleHealth {
    let started = std::time::Instant::now();
    let res = tokio::time::timeout(Duration::from_secs(1), async {
        let conn = pool.get().await.map_err(pool_err)?;
        conn.simple_query("SELECT 1")
            .await
            .map_err(JediError::from)?;
        Ok::<_, JediError>(())
    })
    .await;
    let latency = started.elapsed();
    match res {
        Ok(Ok(())) => PgRoleHealth {
            role,
            ok: true,
            latency,
            last_error: None,
        },
        Ok(Err(e)) => PgRoleHealth {
            role,
            ok: false,
            latency,
            last_error: Some(e.to_string()),
        },
        Err(_) => PgRoleHealth {
            role,
            ok: false,
            latency,
            last_error: Some("probe timed out after 1s".into()),
        },
    }
}

/// Single acquire path used by `write` / `strict_read` / `any_read` /
/// `read`. Emits a `pg.acquire` tracing span and per-role acquire
/// metrics (under the `prometheus` feature).
async fn timed_acquire<'a>(
    role: PgRole,
    pool: &'a PgPool,
    fallback: bool,
) -> Result<PgConn<'a>, JediError> {
    let state = pool.state();
    let started = std::time::Instant::now();
    let span = tracing::trace_span!(
        "pg.acquire",
        role = pg_metrics::role_label(role),
        fallback = fallback,
        pool.size = state.connections,
        pool.idle = state.idle_connections,
        wait_ms = tracing::field::Empty,
        outcome = tracing::field::Empty,
    );
    let _enter = span.enter();
    let result = pool.get().await;
    let elapsed = started.elapsed();
    let (outcome, mapped) = match result {
        Ok(c) => ("ok", Ok(c)),
        Err(bb8::RunError::TimedOut) => ("timeout", Err(pool_err(bb8::RunError::TimedOut))),
        Err(e) => ("error", Err(pool_err(e))),
    };
    span.record("wait_ms", elapsed.as_millis() as i64);
    span.record("outcome", outcome);
    pg_metrics::record_acquire(role, outcome, elapsed);
    mapped
}

/// 15s interval sampler that emits pool-state gauges so they reflect
/// the current shape even when no traffic is flowing.
#[cfg(feature = "prometheus")]
fn spawn_state_sampler(cluster: std::sync::Weak<PgCluster>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(15));
        loop {
            interval.tick().await;
            let Some(c) = cluster.upgrade() else { return };
            for (role, pool) in [
                (PgRole::Rw, &c.rw),
                (PgRole::Ro, &c.ro),
                (PgRole::Any, &c.any),
            ] {
                let s = pool.state();
                pg_metrics::record_state(role, s.connections, s.idle_connections);
            }
        }
    })
}

mod pg_metrics {
    use super::PgRole;
    use std::time::Duration;

    pub(super) fn role_label(role: PgRole) -> &'static str {
        match role {
            PgRole::Rw => "rw",
            PgRole::Ro => "ro",
            PgRole::Any => "any",
        }
    }

    #[cfg(feature = "prometheus")]
    pub(super) fn record_acquire(role: PgRole, outcome: &'static str, elapsed: Duration) {
        let role_str = role_label(role);
        metrics::counter!(
            "kbve_pg_pool_acquire_total",
            "role" => role_str,
            "outcome" => outcome,
        )
        .increment(1);
        metrics::histogram!(
            "kbve_pg_pool_acquire_duration_seconds",
            "role" => role_str,
        )
        .record(elapsed.as_secs_f64());
    }

    #[cfg(not(feature = "prometheus"))]
    pub(super) fn record_acquire(_role: PgRole, _outcome: &'static str, _elapsed: Duration) {}

    #[cfg(feature = "prometheus")]
    pub(super) fn record_state(role: PgRole, size: u32, idle: u32) {
        let role_str = role_label(role);
        metrics::gauge!("kbve_pg_pool_size", "role" => role_str).set(size as f64);
        metrics::gauge!("kbve_pg_pool_idle", "role" => role_str).set(idle as f64);
        metrics::gauge!("kbve_pg_pool_in_use", "role" => role_str)
            .set(size.saturating_sub(idle) as f64);
    }
}

async fn build_pool(
    url: &str,
    cfg: &PgPoolConfig,
    connector: MakeRustlsConnect,
) -> Result<PgPool, JediError> {
    let mut pg_cfg: PgConfig = url.parse().map_err(|e: tokio_postgres::Error| {
        JediError::Internal(format!("invalid Postgres URL: {e}").into())
    })?;
    pg_cfg.application_name(&cfg.application_name);
    pg_cfg.connect_timeout(cfg.connect_timeout);

    let mgr = PostgresConnectionManager::new(pg_cfg, connector);
    let pool = Pool::builder()
        .max_size(cfg.max_size)
        .connection_timeout(cfg.connect_timeout)
        .idle_timeout(cfg.idle_timeout)
        .connection_customizer(Box::new(OnAcquire {
            statement_timeout_ms: cfg.statement_timeout_ms,
        }))
        .build(mgr)
        .await
        .map_err(|e| JediError::Internal(format!("pg pool build failed: {e}").into()))?;
    Ok(pool)
}

fn make_rustls_connector() -> Result<MakeRustlsConnect, JediError> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let cfg = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(MakeRustlsConnect::new(cfg))
}

fn pool_err(e: bb8::RunError<tokio_postgres::Error>) -> JediError {
    JediError::Database(format!("pg pool: {e}").into())
}

#[derive(Clone)]
pub struct SharedPgCluster(pub Arc<PgCluster>);

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn with_env<F: FnOnce()>(vars: &[(&str, Option<&str>)], f: F) {
        let prior: Vec<_> = vars
            .iter()
            .map(|(k, _)| (k.to_string(), env::var(k).ok()))
            .collect();
        for (k, v) in vars {
            // SAFETY: tests are gated by the postgres feature and rely on
            // serial execution within this crate's test binary. The env
            // mutation is restored to its prior state after `f` runs.
            unsafe {
                match v {
                    Some(val) => env::set_var(k, val),
                    None => env::remove_var(k),
                }
            }
        }
        f();
        for (k, v) in prior {
            unsafe {
                match v {
                    Some(val) => env::set_var(&k, val),
                    None => env::remove_var(&k),
                }
            }
        }
    }

    #[test]
    #[serial]
    fn from_env_requires_rw_url() {
        with_env(
            &[
                ("KBVE_PG_RW_URL", None),
                ("DATABASE_URL_PROD", None),
                ("WALLET_DATABASE_URL", None),
            ],
            || {
                let err = PgClusterConfig::from_env().unwrap_err();
                assert!(format!("{err}").contains("KBVE_PG_RW_URL"));
            },
        );
    }

    #[test]
    #[serial]
    fn from_env_falls_back_through_compat_keys() {
        with_env(
            &[
                ("KBVE_PG_RW_URL", None),
                ("DATABASE_URL_PROD", None),
                ("WALLET_DATABASE_URL", Some("postgresql://u:p@h/db")),
                ("KBVE_PG_RO_URL", None),
                ("DATABASE_URL_PROD_RO", None),
                ("WALLET_DATABASE_URL_RO", None),
                ("KBVE_PG_ANY_URL", None),
                ("KBVE_PG_USE_POOLER", None),
            ],
            || {
                let cfg = PgClusterConfig::from_env().unwrap();
                assert_eq!(cfg.rw_url, "postgresql://u:p@h/db");
                assert_eq!(cfg.ro_url, cfg.rw_url);
                assert_eq!(cfg.any_url, cfg.rw_url);
                assert!(!cfg.use_pooler);
            },
        );
    }

    #[test]
    #[serial]
    fn pool_env_overrides_apply() {
        with_env(
            &[
                ("KBVE_PG_RW_URL", Some("postgresql://u:p@h/db")),
                ("KBVE_PG_RW_MAX_SIZE", Some("42")),
                ("KBVE_PG_RW_STATEMENT_TIMEOUT_MS", Some("0")),
                ("KBVE_PG_RW_IDLE_TIMEOUT_MS", Some("0")),
                ("KBVE_PG_RW_CONNECT_TIMEOUT_MS", Some("7500")),
            ],
            || {
                let cfg = PgClusterConfig::from_env().unwrap();
                assert_eq!(cfg.rw.max_size, 42);
                assert_eq!(cfg.rw.statement_timeout_ms, None);
                assert_eq!(cfg.rw.idle_timeout, None);
                assert_eq!(cfg.rw.connect_timeout, Duration::from_millis(7500));
            },
        );
    }

    #[test]
    fn use_pooler_rewrites_rw_and_ro_only() {
        let cfg = PgClusterConfig {
            rw_url: "postgresql://u:p@supabase-cluster-rw.kilobase.svc.cluster.local:5432/db"
                .into(),
            ro_url: "postgresql://u:p@supabase-cluster-ro.kilobase.svc.cluster.local:5432/db"
                .into(),
            any_url: "postgresql://u:p@supabase-cluster-r.kilobase.svc.cluster.local:5432/db"
                .into(),
            rw: PgPoolConfig::defaults_for(PgRole::Rw, "test".into()),
            ro: PgPoolConfig::defaults_for(PgRole::Ro, "test".into()),
            any: PgPoolConfig::defaults_for(PgRole::Any, "test".into()),
            use_pooler: true,
        };
        assert!(
            cfg.resolved_url(PgRole::Rw)
                .contains("supabase-cluster-pooler-rw")
        );
        assert!(
            cfg.resolved_url(PgRole::Ro)
                .contains("supabase-cluster-pooler-ro")
        );
        assert!(cfg.resolved_url(PgRole::Any).contains("supabase-cluster-r"));
        assert!(!cfg.resolved_url(PgRole::Any).contains("pooler"));
    }

    #[test]
    fn pooler_disabled_leaves_urls_intact() {
        let cfg = PgClusterConfig {
            rw_url: "postgresql://u:p@supabase-cluster-rw:5432/db".into(),
            ro_url: "postgresql://u:p@supabase-cluster-ro:5432/db".into(),
            any_url: "postgresql://u:p@supabase-cluster-r:5432/db".into(),
            rw: PgPoolConfig::defaults_for(PgRole::Rw, "test".into()),
            ro: PgPoolConfig::defaults_for(PgRole::Ro, "test".into()),
            any: PgPoolConfig::defaults_for(PgRole::Any, "test".into()),
            use_pooler: false,
        };
        assert!(!cfg.resolved_url(PgRole::Rw).contains("pooler"));
        assert!(!cfg.resolved_url(PgRole::Ro).contains("pooler"));
    }

    #[test]
    #[serial]
    fn use_pooler_truthy_values() {
        for v in ["1", "true", "yes", "on", "TRUE", "Yes"] {
            with_env(
                &[
                    ("KBVE_PG_RW_URL", Some("postgresql://u:p@h/db")),
                    ("KBVE_PG_USE_POOLER", Some(v)),
                ],
                || {
                    let cfg = PgClusterConfig::from_env().unwrap();
                    assert!(cfg.use_pooler, "expected true for {v}");
                },
            );
        }
        for v in ["0", "false", "no", "off", ""] {
            with_env(
                &[
                    ("KBVE_PG_RW_URL", Some("postgresql://u:p@h/db")),
                    ("KBVE_PG_USE_POOLER", Some(v)),
                ],
                || {
                    let cfg = PgClusterConfig::from_env().unwrap();
                    assert!(!cfg.use_pooler, "expected false for {v:?}");
                },
            );
        }
    }
}
