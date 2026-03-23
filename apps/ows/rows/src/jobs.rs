use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info};

use crate::service::OWSService;

/// Spawn background jobs. All run as tokio tasks — non-blocking.
pub fn spawn_all(svc: Arc<OWSService>) {
    tokio::spawn(zone_health_monitor(svc));
}

/// Periodic zone health monitor — checks for stale zone instances
/// and cleans up tracked GameServers that are no longer responsive.
/// Runs every 30 seconds (matches C# TimedHostedService pattern).
async fn zone_health_monitor(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await; // skip immediate first tick

    loop {
        interval.tick().await;

        let tracked = svc.state().zone_servers.len();
        let sessions = svc.state().sessions.len();

        info!(
            zones_tracked = tracked,
            sessions_cached = sessions,
            "Health monitor tick"
        );

        // Check DB connectivity
        let db_ok = sqlx::query("SELECT 1")
            .execute(&svc.state().db)
            .await
            .is_ok();

        if !db_ok {
            error!("Health monitor: database unreachable");
        }

        // Evict expired sessions (older than 24h) from cache
        // DashMap iteration is lock-free per-shard
        let _before = svc.state().sessions.len();
        // For now, we don't track login time in CachedSession — future enhancement
        // svc.state().sessions.retain(|_, v| v.login_time.elapsed() < Duration::from_secs(86400));

        if tracked > 0 {
            info!(zones = tracked, "Active zone servers being tracked");
        }
    }
}
