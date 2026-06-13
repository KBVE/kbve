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
pub type PgConn<'a> =
    bb8::PooledConnection<'a, PostgresConnectionManager<MakeRustlsConnect>>;

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
        let app = env::var("KBVE_PG_APPLICATION_NAME")
            .unwrap_or_else(|_| "kbve".to_string());

        let rw_url = read_url_env(&[
            "KBVE_PG_RW_URL",
            "DATABASE_URL_PROD",
            "WALLET_DATABASE_URL",
        ])
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
    // CNPG pooler service naming. The `Any` role has no pooler equivalent
    // (poolers front rw + ro only); skip the rewrite to keep direct
    // any-instance fallback semantics.
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

impl bb8::CustomizeConnection<tokio_postgres::Client, tokio_postgres::Error>
    for OnAcquire
{
    fn on_acquire<'a>(
        &'a self,
        conn: &'a mut tokio_postgres::Client,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<(), tokio_postgres::Error>>
                + Send
                + 'a,
        >,
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
        let rw = build_pool(
            &cfg.resolved_url(PgRole::Rw),
            &cfg.rw,
            connector.clone(),
        )
        .await?;
        let ro = build_pool(
            &cfg.resolved_url(PgRole::Ro),
            &cfg.ro,
            connector.clone(),
        )
        .await?;
        let any = build_pool(&cfg.resolved_url(PgRole::Any), &cfg.any, connector).await?;
        tracing::info!(
            rw_max = cfg.rw.max_size,
            ro_max = cfg.ro.max_size,
            any_max = cfg.any.max_size,
            use_pooler = cfg.use_pooler,
            "[PgCluster] pools built"
        );
        Ok(Arc::new(Self { rw, ro, any, cfg }))
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
        self.rw.get().await.map_err(pool_err)
    }

    pub async fn strict_read(&self) -> Result<PgConn<'_>, JediError> {
        self.ro.get().await.map_err(pool_err)
    }

    pub async fn any_read(&self) -> Result<PgConn<'_>, JediError> {
        self.any.get().await.map_err(pool_err)
    }

    /// Read connection with replica → any-instance fallback. Use for
    /// non-critical reads that should survive a replica blip.
    pub async fn read(&self) -> Result<PgConn<'_>, JediError> {
        match self.ro.get().await {
            Ok(c) => Ok(c),
            Err(e) => {
                tracing::warn!(error = %e, "[PgCluster] ro pool acquire failed; falling back to any pool");
                self.any.get().await.map_err(pool_err)
            }
        }
    }

    /// Run a read-only closure inside a transaction with
    /// `request.jwt.claims` impersonating the given subject so
    /// SECURITY DEFINER proxies that resolve `auth.uid()` see the
    /// caller. Acquires from the strict replica pool. Commits on
    /// success; rolls back on error.
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

async fn build_pool(
    url: &str,
    cfg: &PgPoolConfig,
    connector: MakeRustlsConnect,
) -> Result<PgPool, JediError> {
    let mut pg_cfg: PgConfig = url
        .parse()
        .map_err(|e: tokio_postgres::Error| {
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
    // Ensure a CryptoProvider is installed exactly once. Idempotent —
    // calling install repeatedly only succeeds on the first call.
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
            rw_url: "postgresql://u:p@supabase-cluster-rw.kilobase.svc.cluster.local:5432/db".into(),
            ro_url: "postgresql://u:p@supabase-cluster-ro.kilobase.svc.cluster.local:5432/db".into(),
            any_url: "postgresql://u:p@supabase-cluster-r.kilobase.svc.cluster.local:5432/db".into(),
            rw: PgPoolConfig::defaults_for(PgRole::Rw, "test".into()),
            ro: PgPoolConfig::defaults_for(PgRole::Ro, "test".into()),
            any: PgPoolConfig::defaults_for(PgRole::Any, "test".into()),
            use_pooler: true,
        };
        assert!(cfg.resolved_url(PgRole::Rw).contains("supabase-cluster-pooler-rw"));
        assert!(cfg.resolved_url(PgRole::Ro).contains("supabase-cluster-pooler-ro"));
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
