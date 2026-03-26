use crate::repo::InstanceRepo;
use crate::service::OWSService;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn};

/// Spawn all background jobs as tokio tasks.
pub fn spawn_all(svc: Arc<OWSService>) {
    tokio::spawn(zone_health_monitor(svc.clone()));
    tokio::spawn(stale_zone_cleanup(svc.clone()));
    tokio::spawn(spinup_lock_expiry(svc));
}

/// Periodic zone health monitor — logs metrics every 30s.
async fn zone_health_monitor(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;

    loop {
        interval.tick().await;

        let tracked = svc.state().zone_servers.len();
        let sessions = svc.state().sessions.len();
        let locks = svc.state().zone_spinup_locks.len();

        let db_ok = sqlx::query("SELECT 1")
            .execute(&svc.state().db)
            .await
            .is_ok();

        if !db_ok {
            error!("Health monitor: database unreachable");
        }

        info!(
            zones_tracked = tracked,
            sessions_cached = sessions,
            spinup_locks = locks,
            db_ok,
            "Health monitor tick"
        );
    }
}

/// Periodic stale zone cleanup — removes inactive map instances and
/// deallocates orphaned Agones GameServers every 60s.
async fn stale_zone_cleanup(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.tick().await;

    loop {
        interval.tick().await;

        let guid = svc.state().config.customer_guid;
        let repo = InstanceRepo(&svc.state().db);

        // Clean up characters from inactive instances
        match repo.remove_characters_from_inactive_instances(guid).await {
            Ok(removed) if removed > 0 => {
                info!(removed, "Cleaned characters from inactive instances");
            }
            Err(e) => warn!(error = %e, "Failed to clean inactive instance characters"),
            _ => {}
        }

        // Find inactive map instances and deallocate their Agones GameServers
        match repo.get_all_inactive_map_instances(guid).await {
            Ok(instances) => {
                for inst in &instances {
                    if let Some((_, gs_name)) =
                        svc.state().zone_servers.remove(&inst.map_instance_id)
                    {
                        if let Some(ref agones) = svc.state().agones {
                            if let Err(e) = agones.deallocate(&gs_name).await {
                                warn!(
                                    gs = %gs_name,
                                    error = %e,
                                    "Failed to deallocate stale GameServer"
                                );
                            } else {
                                info!(gs = %gs_name, zone = inst.map_instance_id, "Deallocated stale GameServer");
                            }
                        }
                    }
                }
            }
            Err(e) => warn!(error = %e, "Failed to query inactive map instances"),
        }
    }
}

/// Expire stale spin-up locks older than 90 seconds.
/// Uses per-lock timestamps instead of clearing all locks blindly.
async fn spinup_lock_expiry(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;

    loop {
        interval.tick().await;

        let max_age = Duration::from_secs(90);
        let mut expired = 0u32;

        // Collect stale keys (can't remove while iterating DashMap)
        let stale_keys: Vec<String> = svc
            .state()
            .zone_spinup_locks
            .iter()
            .filter(|entry| entry.value().elapsed() > max_age)
            .map(|entry| entry.key().clone())
            .collect();

        for key in stale_keys {
            svc.state().zone_spinup_locks.remove(&key);
            expired += 1;
            warn!(lock_key = %key, "Expired stale spin-up lock");
        }

        if expired > 0 {
            warn!(expired, "Expired stale spin-up locks");
        }
    }
}
