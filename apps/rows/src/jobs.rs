use crate::repo::InstanceRepo;
use crate::service::OWSService;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn};

pub fn spawn_all(svc: Arc<OWSService>) {
    // Surface destructive-reaper enablement loudly at startup so a stray env flag in a values
    // file is visible in the logs, not silently active. `reap_never_reported` is the dangerous
    // one (deallocates populated servers ~boot_grace after spawn if heartbeats aren't live yet).
    let reaper = &svc.state().config.reaper;
    if reaper.enabled {
        warn!(
            never_reported = reaper.never_reported,
            boot_grace_secs = reaper.boot_grace_secs,
            stale_secs = reaper.stale_secs,
            "Empty-server reaper ENABLED — it will deallocate empty GameServers"
        );
    }
    if reaper.never_reported {
        warn!(
            "ROWS_REAP_NEVER_REPORTED is ON — never-reported instances are reap-eligible past boot grace; \
             confirm UE heartbeats are live in this env or populated servers will be torn down"
        );
    }
    if reaper.stale_secs > 0 {
        warn!(
            stale_secs = reaper.stale_secs,
            "ROWS_EMPTY_REAP_STALE_SECS is ON — populated instances with a stale heartbeat are \
             reap-eligible; a global heartbeat outage would make live servers look stale"
        );
    }

    tokio::spawn(zone_health_monitor(svc.clone()));
    tokio::spawn(stale_zone_cleanup(svc.clone()));
    tokio::spawn(empty_server_reaper(svc.clone()));
    tokio::spawn(spinup_lock_expiry(svc.clone()));
    tokio::spawn(session_cache_sweep(svc));
}

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

async fn stale_zone_cleanup(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.tick().await;

    loop {
        interval.tick().await;

        let guid = svc.state().config.customer_guid;
        let repo = InstanceRepo(&svc.state().db);

        match repo.remove_characters_from_inactive_instances(guid).await {
            Ok(removed) if removed > 0 => {
                info!(removed, "Cleaned characters from inactive instances");
            }
            Err(e) => warn!(error = %e, "Failed to clean inactive instance characters"),
            _ => {}
        }

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

/// Max GameServers torn down concurrently per cycle. Each `deallocate` can take up to
/// retries × backoff × 10s; serial teardown of a large batch would overrun the 60s cadence, so
/// fan out with a bound (kept modest to avoid hammering the K8s API / Agones allocator).
const MAX_CONCURRENT_REAPS: usize = 8;

/// A candidate that `reap_decision` selected and whose GameServer name resolved — ready to tear down.
struct ReapTarget {
    instance_id: i32,
    gs: String,
    reason: crate::agones::reaper::ReapReason,
}

/// Backstop for the server's own `SDK.Shutdown()`. Gated OFF by default (see safety note):
/// the whole loop no-ops unless `reaper.enabled`, the time-based `NeverReported` path is
/// independently gated by `reaper.never_reported`, and the crashed-while-populated `Stale` path
/// by `reaper.stale_secs > 0`.
///
/// Teardown ordering is deallocate-FIRST: only on a successful `deallocate` do we drop the
/// in-memory tracking and flip `status=0`. On a deallocate *failure* we leave the row at
/// `status>0` and tracked, so the next 60s cycle re-evaluates and retries — a transient Agones
/// error can never strand a GameServer. The one exception is an instance with no resolvable
/// GameServer name (legacy/reconcile-miss): there's nothing to deallocate, so it's flipped
/// `status=0` (terminal) with a one-time warn rather than re-warned forever.
///
/// SINGLE-REPLICA ASSUMPTION: unlike the spin-up path (which holds a per-zone lock), the reaper
/// takes no lock — it assumes exactly one rows replica runs this loop (`tenants/base` is
/// `replicas: 1`). Scaling rows beyond one replica would let two reapers concurrently deallocate
/// the same GameServer; add leader election / a shared lock before raising the replica count.
async fn empty_server_reaper(svc: Arc<OWSService>) {
    use crate::agones::reaper::reap_decision;
    use tokio::task::JoinSet;

    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.tick().await;

    loop {
        interval.tick().await;

        let reaper = svc.state().config.reaper.clone();
        if !reaper.enabled {
            continue; // master kill switch — ships OFF
        }

        let guid = svc.state().config.customer_guid;
        let now = chrono::Utc::now().naive_utc();
        let repo = InstanceRepo(&svc.state().db);

        let candidates = match repo.get_active_reap_candidates(guid).await {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "Reaper: failed to load active instances");
                continue;
            }
        };
        if candidates.len() >= 500 {
            warn!(count = candidates.len(), "Reaper: candidate query hit the 500-row cap — possible under-reaping");
        }

        if svc.state().agones.is_none() {
            continue;
        }

        // Phase 1 (sequential, cheap): decide + resolve GameServer names. The no-name terminal
        // path is a quick DB update, handled here. Builds the teardown work-list for phase 2.
        let mut targets: Vec<ReapTarget> = Vec::new();
        for inst in &candidates {
            let Some(reason) = reap_decision(
                inst.number_of_reported_players,
                inst.last_update_from_server,
                inst.last_server_empty_date,
                inst.create_date,
                inst.minutes_to_shutdown_after_empty,
                reaper.boot_grace_secs,
                reaper.buffer_secs,
                reaper.stale_secs,
                reaper.min_empty_secs,
                reaper.never_reported,
                now,
            ) else {
                continue;
            };

            // Resolve the GameServer: in-memory tracking first, DB column as label-independent fallback.
            let gs_name = match svc.state().zone_servers.get(&inst.map_instance_id) {
                Some(v) => Some(v.value().clone()),
                None => repo
                    .get_gameserver_name(guid, inst.map_instance_id)
                    .await
                    .ok()
                    .flatten(),
            };
            match gs_name {
                Some(gs) => targets.push(ReapTarget {
                    instance_id: inst.map_instance_id,
                    gs,
                    reason,
                }),
                None => {
                    // Terminal state for the no-name case (legacy rows from before the
                    // `gameservername` column, or a `reconcile_allocations` miss). We can't
                    // deallocate a GameServer we can't name, so flip status=0 to drop it from
                    // routing AND the candidate set, and surface it ONCE for manual/infra check —
                    // instead of re-warning every 60s forever. Deliberate, narrow exception to
                    // deallocate-first: in practice these are legacy rows whose pod is already
                    // gone; a still-live one is flagged for `kubectl` cleanup.
                    match repo.shut_down_server_instance(guid, inst.map_instance_id).await {
                        Ok(()) => warn!(instance_id = inst.map_instance_id, ?reason, "Reaper: no resolvable GameServer name — marked status=0; verify no orphaned pod (manual cleanup)"),
                        Err(e) => warn!(error = %e, instance_id = inst.map_instance_id, "Reaper: failed to set status=0 for unresolvable instance"),
                    }
                }
            }
        }

        // Phase 2 (bounded concurrency): deallocate-first teardown, up to MAX_CONCURRENT_REAPS at
        // once, so a large batch doesn't overrun the 60s cycle.
        let mut iter = targets.into_iter();
        let mut set: JoinSet<()> = JoinSet::new();
        loop {
            while set.len() < MAX_CONCURRENT_REAPS {
                let Some(target) = iter.next() else { break };
                set.spawn(reap_one(svc.clone(), guid, target));
            }
            if set.join_next().await.is_none() {
                break; // no work left and nothing in flight
            }
        }
    }
}

/// Tears down one resolved target: deallocate FIRST, then (only on success) drop tracking and
/// flip `status=0`. A deallocate failure leaves the row reap-eligible for the next cycle.
async fn reap_one(svc: Arc<OWSService>, guid: uuid::Uuid, target: ReapTarget) {
    let ReapTarget {
        instance_id,
        gs,
        reason,
    } = target;

    let Some(ref agones) = svc.state().agones else {
        return;
    };

    info!(instance_id, ?reason, gs = %gs, "Reaping empty/abandoned zone server");

    match agones.deallocate(&gs).await {
        Ok(()) => {
            svc.state().zone_servers.remove(&instance_id);
            let repo = InstanceRepo(&svc.state().db);
            if let Err(e) = repo.shut_down_server_instance(guid, instance_id).await {
                warn!(error = %e, instance_id, "Reaper: deallocated but failed to set status=0");
            }
        }
        Err(e) => {
            // Leave status>0 + tracking intact; next cycle re-evaluates and retries.
            warn!(error = %e, gs = %gs, instance_id, "Reaper: deallocate failed — will retry next cycle");
        }
    }
}

async fn spinup_lock_expiry(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;

    loop {
        interval.tick().await;

        let max_age = Duration::from_secs(90);
        let mut expired = 0u32;

        // DashMap forbids remove-while-iterating, so collect keys first.
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

/// Prevents unbounded growth from sessions that never call PlayerLogout.
async fn session_cache_sweep(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(300));
    interval.tick().await;

    loop {
        interval.tick().await;

        let max_age = Duration::from_secs(24 * 60 * 60);
        let before = svc.state().sessions.len();

        let stale_keys: Vec<uuid::Uuid> = svc
            .state()
            .sessions
            .iter()
            .filter(|entry| entry.value().created_at.elapsed() > max_age)
            .map(|entry| *entry.key())
            .collect();

        for key in &stale_keys {
            svc.state().sessions.remove(key);
        }

        let evicted = stale_keys.len();
        if evicted > 0 {
            info!(
                evicted,
                before,
                after = svc.state().sessions.len(),
                "Session cache sweep"
            );
        }
    }
}
