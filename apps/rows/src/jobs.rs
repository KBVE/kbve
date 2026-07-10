use crate::repo::InstanceRepo;
use crate::service::OWSService;
use sqlx::Connection; // for PgConnection::close() on the detached advisory-lock connection
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
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

    // One-shot startup check: a failed CREATE INDEX CONCURRENTLY leaves an INVALID
    // idx_mapinstances_drainable that Postgres silently refuses to use — the fleet-restart
    // reconcile's per-tick scan would seq-scan the hot mapinstances table with no error. Surface
    // it loudly instead (recovery: DROP INDEX + re-create CONCURRENTLY; see the index migration).
    {
        let svc = svc.clone();
        tokio::spawn(async move {
            match InstanceRepo(&svc.state().db)
                .check_drainable_index_valid()
                .await
            {
                Ok(Some(false)) => warn!(
                    "idx_mapinstances_drainable is INVALID (failed CONCURRENTLY build) — \
                     drainable scans are seq-scanning; DROP INDEX and re-create CONCURRENTLY"
                ),
                Ok(_) => {} // valid, or not created yet (migration not applied)
                Err(e) => warn!(error = %e, "failed to check idx_mapinstances_drainable validity"),
            }
        });
    }

    tokio::spawn(zone_health_monitor(svc.clone()));
    tokio::spawn(stale_zone_cleanup(svc.clone()));
    tokio::spawn(empty_server_reaper(svc.clone()));
    tokio::spawn(fleet_restart_reconcile(svc.clone()));
    tokio::spawn(deploy_state_refresh(svc.clone()));
    tokio::spawn(spinup_lock_expiry(svc.clone()));
    tokio::spawn(session_cache_sweep(svc));
}

/// Keeps `AppState.deploy_state_cache` fresh so `/health` never touches the DB — `/health` is the
/// liveness-probe path (timeoutSeconds: 3, failureThreshold: 3): a synchronous read there would
/// turn any Postgres latency spike into a kubelet restart storm (this cluster has documented
/// storage-contention incidents). First refresh runs immediately so the snapshot is populated as
/// soon as the pod is up; a refresh error keeps the last-known snapshot (stale beats a probe kill).
async fn deploy_state_refresh(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    loop {
        interval.tick().await; // first tick fires immediately
        let guid = svc.state().config.customer_guid;
        match InstanceRepo(&svc.state().db).get_deploy_state(guid).await {
            Ok(snapshot) => {
                *svc.state().deploy_state_cache.write().unwrap() = snapshot;
            }
            Err(e) => {
                warn!(error = %e, "deploy_state refresh failed — keeping last snapshot");
            }
        }
    }
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
///
/// CONNECTION-POOL BUDGET: each concurrent `reap_one` acquires one DB connection for its
/// `status=0` flip, and the cycle additionally holds `lock_conn` out of the pool for its whole
/// duration. So the reaper's peak draw is `1 (lock) + MAX_CONCURRENT_REAPS`. `rows` connects
/// *directly* to the CNPG RW primary (`supabase-cluster-rw:5432`) with a `DB_MAX_CONNECTIONS`-sized
/// sqlx pool (deployment: 20). Keep the invariant `1 + MAX_CONCURRENT_REAPS + hot-path headroom ≤
/// DB_MAX_CONNECTIONS` so a reap batch never starves the player hot path (heartbeats / joins) on
/// `acquire()`. With pool=20 and this value=2 the reaper draws ≤3, leaving ≥17 for the hot path —
/// so even a concurrent join spike can't push total demand past the pool and stall `acquire()`.
/// Raising the pool further to scale teardown belongs to the pooler migration (KBVE #7593) — but see
/// the advisory-lock note in `empty_server_reaper`: the lock MUST stay on a session-capable endpoint
/// (direct RW or the *session*-mode pooler), never the transaction-mode RW pooler.
const MAX_CONCURRENT_REAPS: usize = 2;

/// Rate-limit window (secs) for the stale-empty retention warn. The condition behind it
/// (`empty_fresh_secs < heartbeat_interval`) is a static misconfiguration that persists every
/// 60s cycle, so an unguarded warn would log once a minute indefinitely. Surface it at most
/// hourly. Epoch-seconds of the last emit; `0` = never warned.
const STALE_EMPTY_WARN_INTERVAL_SECS: i64 = 3600;
static LAST_STALE_EMPTY_WARN: AtomicI64 = AtomicI64::new(0);

/// RAII backstop for the session-level advisory lock held during a reap cycle.
///
/// The happy path releases the lock explicitly with `pg_advisory_unlock` and returns the pinned
/// connection to the pool (`disarm`); the unlock-failure path detaches+closes it (`take`). This
/// guard only fires when *neither* runs — e.g. a panic in the loop body between acquiring the lock
/// and reaching the unlock. On drop while still armed it closes the connection on a detached task,
/// ending the backend session so Postgres drops the session lock — instead of returning a
/// still-locked connection to the pool, which would make every later cycle's `pg_try_advisory_lock`
/// return false and silently wedge reaping for this tenant.
struct AdvisoryLockGuard {
    conn: Option<sqlx::pool::PoolConnection<sqlx::Postgres>>,
}

impl AdvisoryLockGuard {
    fn new(conn: sqlx::pool::PoolConnection<sqlx::Postgres>) -> Self {
        Self { conn: Some(conn) }
    }

    /// Borrow the held connection as a `&mut PgConnection` (what sqlx's `Executor` wants) for the
    /// explicit unlock query — `PoolConnection` derefs to the inner `PgConnection`.
    fn conn_mut(&mut self) -> &mut sqlx::PgConnection {
        self.conn
            .as_mut()
            .expect("advisory-lock connection already released")
    }

    /// Disarm after a successful explicit unlock: the lock is already released, so let the
    /// connection return to the pool normally.
    fn disarm(mut self) {
        let _ = self.conn.take();
    }

    /// Disarm and hand back the connection so the caller can detach+close it (unlock-failed path).
    fn take(mut self) -> sqlx::pool::PoolConnection<sqlx::Postgres> {
        self.conn
            .take()
            .expect("advisory-lock connection already released")
    }
}

impl Drop for AdvisoryLockGuard {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            // Reached only when the cycle neither unlocked nor detached — i.e. a panic/early exit
            // while still holding the lock. Close the connection on a detached task so the backend
            // session ends and Postgres releases the session lock.
            warn!(
                "Reaper: advisory lock released via guard — closing connection (cycle did not unlock cleanly)"
            );
            tokio::spawn(async move {
                if let Err(e) = conn.detach().close().await {
                    warn!(error = %e, "Reaper: error closing advisory-lock connection in guard");
                }
            });
        }
    }
}

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
/// MULTI-REPLICA SAFETY: unlike the spin-up path (which holds a per-zone in-memory lock), the
/// reaper guards each cycle with a tenant-scoped Postgres advisory lock. If rows is ever scaled
/// past one replica, only the lock holder reaps that cycle, so two reapers can never concurrently
/// deallocate the same GameServer. The lock is keyed on the tenant guid so co-tenants sharing the
/// DB don't block each other; it's taken with `pg_try_advisory_lock` (non-blocking) and released
/// at the end of the cycle.
async fn empty_server_reaper(svc: Arc<OWSService>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.tick().await;

    loop {
        interval.tick().await;

        let env_reaper = svc.state().config.reaper.clone();
        let guid = svc.state().config.customer_guid;

        // Effective config = env baseline with the per-tenant `reaperconfig` override applied
        // (DB wins per field). Read every cycle so a DB-side enable/disable/tune takes effect
        // without a redeploy; on read failure fall back to the env baseline (which ships OFF).
        let reaper = match InstanceRepo(&svc.state().db)
            .get_reaper_config_override(guid)
            .await
        {
            Ok(ov) => env_reaper.merged_with(&ov),
            Err(e) => {
                warn!(error = %e, "Reaper: failed to read per-tenant config override — using env defaults");
                env_reaper
            }
        };
        if !reaper.enabled {
            continue; // master kill switch — env baseline OR per-tenant override
        }

        // Acquire a dedicated connection and try the advisory lock. Two int4 keys: a constant
        // namespace (`'rows-empty-reaper'`) + the tenant guid hash, so the lock is per-tenant.
        //
        // POOLER CONSTRAINT: this is a SESSION-level advisory lock — taken here and
        // released by the `pg_advisory_unlock` below, across two separate statements on the SAME
        // pinned `lock_conn`. That is only sound on a session-pinned endpoint: today `DATABASE_URL`
        // points directly at `supabase-cluster-rw:5432` (correct). If `rows` is ever migrated onto
        // the CNPG *transaction*-mode RW pooler (`supabase-cluster-pooler-rw`, KBVE #7593), each
        // statement may land on a different backend — the lock would be taken on one, never held,
        // and never released, silently voiding the multi-replica double-deallocate guard. Keep this
        // connection on the direct RW (or a session-mode pooler) regardless of where bulk traffic
        // goes.
        let mut lock_conn = match svc.state().db.acquire().await {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "Reaper: failed to acquire DB connection for advisory lock — skipping cycle");
                continue;
            }
        };
        let locked = match sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_lock(hashtext('rows-empty-reaper'), hashtext($1))",
        )
        .bind(guid.to_string())
        .fetch_one(&mut *lock_conn)
        .await
        {
            Ok(v) => v,
            Err(e) => {
                warn!(error = %e, "Reaper: advisory-lock query failed — skipping cycle");
                continue;
            }
        };
        if !locked {
            // Another replica holds the reap lock this cycle; back off until the next tick.
            // No lock held here, so `lock_conn` returns to the pool normally.
            continue;
        }

        // We now hold the session lock. Arm the RAII guard immediately so the lock is released
        // even if the loop body panics before the explicit unlock below runs (the guard closes
        // the connection on drop, ending the backend session).
        let mut lock_guard = AdvisoryLockGuard::new(lock_conn);

        // Run the cycle as a supervised task: a panic inside it is caught at the task boundary
        // (JoinError) instead of killing this loop — and, critically, the advisory unlock below
        // ALWAYS runs. A session-level lock skipped on panic would leak on the pooled connection
        // and permanently wedge reaping for this tenant.
        if let Err(e) = tokio::spawn(run_reap_cycle(svc.clone(), guid, reaper.clone())).await {
            error!(error = %e, "Reaper: reap cycle panicked — releasing lock, loop continues");
        }

        // Release explicitly: a session-level advisory lock outlives a pooled connection's return,
        // so it must be unlocked before the connection goes back to the pool or it would leak.
        match sqlx::query("SELECT pg_advisory_unlock(hashtext('rows-empty-reaper'), hashtext($1))")
            .bind(guid.to_string())
            .execute(lock_guard.conn_mut())
            .await
        {
            // Lock released cleanly — disarm the guard and let the connection return to the pool.
            Ok(_) => lock_guard.disarm(),
            Err(e) => {
                // A failed unlock that nonetheless returns a HEALTHY connection to the pool
                // leaves the session-level lock held on that pooled backend — every later cycle's
                // pg_try_advisory_lock (on a different conn) then returns false and reaping is wedged
                // for this tenant until that exact connection happens to be recycled. Detach the
                // connection from the pool and close it so the backend session ends and the lock is
                // released by Postgres, instead of trusting the unlock that just failed.
                warn!(error = %e, "Reaper: failed to release advisory lock — closing connection to drop the session lock");
                if let Err(e) = lock_guard.take().detach().close().await {
                    warn!(error = %e, "Reaper: error closing detached lock connection (lock still released on session end)");
                }
                continue;
            }
        }
    }
}

/// One reap pass, run under the advisory lock held by the caller. Loads candidates, decides per
/// instance, resolves GameServer names (in-memory `zone_servers` first, with the DB fallback
/// BATCHED into one `ANY($)` query for all cache-misses so a post-restart cycle doesn't fan out to
/// hundreds of sequential lookups), then performs deallocate-first teardown with bounded concurrency.
async fn run_reap_cycle(
    svc: Arc<OWSService>,
    guid: uuid::Uuid,
    reaper: crate::config::ReaperKnobs,
) {
    use crate::agones::reaper::reap_decision;
    let svc = &svc;
    let reaper = &reaper;
    use tokio::task::JoinSet;

    let now = chrono::Utc::now().naive_utc();
    let repo = InstanceRepo(&svc.state().db);

    let candidates = match repo.get_active_reap_candidates(guid).await {
        Ok(c) => c,
        Err(e) => {
            // error!, not warn!: the drain-column fallback in get_active_reap_candidates already
            // absorbs the migration window, so reaching here means a genuine DB failure that stalls
            // the reaper for this cycle — a multi-cycle outage leaks GameServers and must be loud.
            error!(error = %e, "Reaper: failed to load active instances — reaper cycle skipped");
            return;
        }
    };
    if candidates.len() >= 500 {
        warn!(
            count = candidates.len(),
            "Reaper: candidate query hit the 500-row cap — possible under-reaping"
        );
    }

    if svc.state().agones.is_none() {
        return;
    }

    // Heartbeat auto-gate (`require_heartbeat`): the never-reported path is only safe once a
    // heartbeat has *ever* been observed for this tenant. If UE isn't configured to heartbeat,
    // none is ever seen, so we suppress never-reported entirely — a full server (pre-heartbeat
    // indistinguishable from a dead one) is never reaped. Fail-safe: any error suppresses it.
    let allow_never_reported = if reaper.never_reported {
        if reaper.require_heartbeat {
            match repo.tenant_has_observed_heartbeat(guid).await {
                Ok(true) => true,
                Ok(false) => {
                    warn!(
                        "Reaper: never_reported suppressed — no heartbeat ever observed for this tenant (UE heartbeat not configured?)"
                    );
                    false
                }
                Err(e) => {
                    warn!(error = %e, "Reaper: heartbeat-observed check failed — suppressing never_reported this cycle");
                    false
                }
            }
        } else {
            true
        }
    } else {
        false
    };

    // Phase 1: decide, then resolve GameServer names.
    let mut targets: Vec<ReapTarget> = Vec::new();
    let mut misses: Vec<(i32, crate::agones::reaper::ReapReason)> = Vec::new();
    // count empty servers retained purely because their heartbeat is stale vs
    // `empty_fresh_secs`. A persistent nonzero count means `empty_fresh_secs < heartbeat_interval`,
    // so the Empty reap silently never fires — surface it instead of looking like "nothing to reap".
    let mut retained_stale_empty: u32 = 0;
    for inst in &candidates {
        let Some(reason) = reap_decision(&crate::agones::reaper::ReapInputs {
            player_count: inst.number_of_reported_players,
            last_update_from_server: inst.last_update_from_server,
            last_server_empty_date: inst.last_server_empty_date,
            create_date: inst.create_date,
            minutes_to_shutdown_after_empty: inst.minutes_to_shutdown_after_empty,
            boot_grace_secs: reaper.boot_grace_secs,
            empty_buffer_secs: reaper.buffer_secs,
            stale_secs: reaper.stale_secs,
            min_empty_secs: reaper.min_empty_secs,
            allow_never_reported,
            empty_fresh_secs: reaper.empty_fresh_secs,
            is_draining: inst.drain_state.is_some(), // NULL = not draining; any stored value (1|2) = draining
            drain_deadline: inst.drain_deadline,
            now,
        }) else {
            if crate::agones::reaper::retained_due_to_stale_heartbeat(
                inst.number_of_reported_players,
                inst.last_update_from_server,
                inst.last_server_empty_date,
                reaper.empty_fresh_secs,
                now,
            ) {
                retained_stale_empty += 1;
            }
            continue;
        };

        match svc.state().zone_servers.get(&inst.map_instance_id) {
            Some(v) => targets.push(ReapTarget {
                instance_id: inst.map_instance_id,
                gs: v.value().clone(),
                reason,
            }),
            None => misses.push((inst.map_instance_id, reason)),
        }
    }
    if retained_stale_empty > 0 {
        // Rate-limited to once per STALE_EMPTY_WARN_INTERVAL_SECS: this reflects a static
        // misconfiguration that recurs every cycle, so warn hourly instead of every 60s.
        let now_secs = now.and_utc().timestamp();
        let last = LAST_STALE_EMPTY_WARN.load(Ordering::Relaxed);
        if now_secs - last >= STALE_EMPTY_WARN_INTERVAL_SECS {
            LAST_STALE_EMPTY_WARN.store(now_secs, Ordering::Relaxed);
            warn!(
                count = retained_stale_empty,
                empty_fresh_secs = reaper.empty_fresh_secs,
                "Reaper: empty servers retained — heartbeat stale vs empty_fresh_secs (Empty reap suppressed; \
                 confirm heartbeat_interval < empty_fresh_secs)"
            );
        }
    }

    if !misses.is_empty() {
        let ids: Vec<i32> = misses.iter().map(|(id, _)| *id).collect();
        match repo.get_gameserver_names(guid, &ids).await {
            Ok(rows) => {
                // Partition the misses against the DB-resolved names (pure, unit-tested). Only
                // reached on Ok — a transient DB error skips this whole block so the misses are
                // never misclassified as unresolved and mass-flipped to status=0.
                let resolved: HashMap<i32, Option<String>> = rows.into_iter().collect();
                let (resolved_targets, unresolved) =
                    crate::agones::reaper::resolve_misses(misses, &resolved);
                for (id, gs, reason) in resolved_targets {
                    targets.push(ReapTarget {
                        instance_id: id,
                        gs,
                        reason,
                    });
                }
                for (id, reason) in unresolved {
                    // Terminal state for the no-name case (legacy rows from before the
                    // `gameservername` column, or a `reconcile_allocations` miss). We can't
                    // deallocate a GameServer we can't name, so flip status=0 to drop it from
                    // routing AND the candidate set, and surface it ONCE for manual/infra check —
                    // instead of re-warning every 60s forever. Deliberate, narrow exception to
                    // deallocate-first: in practice these are legacy rows whose pod is already gone;
                    // a still-live one is flagged for `kubectl` cleanup.
                    match repo.shut_down_server_instance(guid, id).await {
                        Ok(()) => warn!(
                            instance_id = id,
                            ?reason,
                            "Reaper: no resolvable GameServer name — marked status=0; verify no orphaned pod (manual cleanup)"
                        ),
                        Err(e) => {
                            warn!(error = %e, instance_id = id, "Reaper: failed to set status=0 for unresolvable instance")
                        }
                    }
                }
            }
            // A transient DB error must NOT mass-flip the misses to status=0; leave them for
            // the next cycle (still tracked, still status>0).
            Err(e) => {
                warn!(error = %e, "Reaper: failed to batch-resolve GameServer names — retrying next cycle")
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
        match set.join_next().await {
            None => break, // no work left and nothing in flight
            Some(Ok(())) => {}
            Some(Err(e)) => error!(error = %e, "Reaper: teardown task failed (panic/cancelled)"),
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
            // Bound the worldservers leak: the Agones path mints a fresh worldserver row
            // per GameServer, so a reaped instance otherwise leaves its launcher row stuck at
            // serverstatus=1 forever. Deactivate it — but only if no other active instance shares it
            // (safe for the 1:N launcher case). Best-effort: a failure just leaves the stale row, so
            // it never blocks teardown.
            match repo
                .deactivate_world_server_if_last_instance(guid, instance_id)
                .await
            {
                Ok(n) if n > 0 => info!(instance_id, "Reaper: deactivated now-empty worldserver"),
                Ok(_) => {}
                Err(e) => {
                    warn!(error = %e, instance_id, "Reaper: failed to deactivate worldserver (non-fatal)")
                }
            }
        }
        Err(e) => {
            // Leave status>0 + tracking intact; next cycle re-evaluates and retries.
            warn!(error = %e, gs = %gs, instance_id, "Reaper: deallocate failed — will retry next cycle");
        }
    }
}

/// Whole-fleet (`!stagger`) batch cap for the fleet-restart drain fan-out.
const FLEET_DRAIN_CAP: i64 = 4096;

/// DB-backed coordinated fleet restart: reconciles the tenant's `fleet_restart` control row every
/// 30s. While a restart is `active` it fans `set_drain_state` across active instances (whole-fleet
/// or staggered batches), holds the admission lockout (when `lockout`), and enforces the aggressive
/// deadline / non-aggressive stall backstop. When the row is absent or `active=false` it lifts the
/// lockout ONCE iff it owns it (`lockoutapplied`), then no-ops — the feature ships dark.
///
/// Lock/unlock pattern mirrors `empty_server_reaper` EXACTLY. The advisory lock is SESSION-level,
/// so it MUST be taken and released on the same pinned connection — taking it on the pool would
/// unlock on a different pooled connection (a no-op), leak the lock, and wedge the reconcile for
/// this tenant until restart. The POOLER CONSTRAINT documented in `empty_server_reaper` applies
/// verbatim: this must stay on the session-pinned direct RW endpoint, never the transaction-mode
/// pooler. Single-flight per tenant, so >1 ROWS replica never double-fans `set_drain_state`.
async fn fleet_restart_reconcile(svc: Arc<OWSService>) {
    // Convergence coupling, surfaced at job start: an instance only leaves `status>0` when the
    // reaper tears it down (`set_drain_state` rejects state=0), so a fleet restart CANNOT converge
    // with the reaper disabled — the stall backstop below turns that into a bounded, loud stall.
    if !svc.state().config.reaper.enabled {
        info!(
            "fleet-restart: empty_server_reaper is DISABLED in the env baseline — a fleet restart \
             cannot converge unless a per-tenant reaperconfig override enables it (stall backstop \
             will surface this)"
        );
    }
    // HA precondition (unenforceable from inside the pod — replica count isn't visible here):
    // the reconcile is resume-safe and the advisory lock makes >1 replica correct, but at
    // replicas: 1 a node drain pauses admission lifting, status polling, and the reconcile until
    // reschedule. Surface the requirement every boot so it isn't just a YAML comment.
    warn!(
        "fleet-restart reconcile active — before relying on it in prod, run ROWS with replicas >= 2 \
         (rows-pdb is maxUnavailable:1; a single replica pauses orchestration on every node drain)"
    );

    // Refuse to run at all if session-level advisory locks aren't actually session-pinned (i.e.
    // the pool points at a transaction-mode pooler): behind one, lock and unlock land on different
    // backends, both replicas "win" the tenant every tick, and the double fan-out / lockout races
    // are silent. A comment can't enforce the endpoint choice — probe it. DB errors retry (the DB
    // may just not be up yet); a definitive "not pinned" disables the job for this process.
    loop {
        match verify_session_pinned_locks(&svc.state().db).await {
            Ok(true) => break,
            Ok(false) => {
                error!(
                    "fleet-restart: advisory locks are NOT session-pinned (transaction-mode \
                     pooler?) — reconcile DISABLED for this process. Point DATABASE_URL at the \
                     direct RW endpoint (or a session-mode pooler) and restart. The reaper's \
                     advisory lock has the same requirement."
                );
                return;
            }
            Err(e) => {
                warn!(error = %e, "fleet-restart: session-pinning probe failed — retrying in 60s");
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        }
    }

    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.tick().await;
    loop {
        interval.tick().await;
        let guid = svc.state().config.customer_guid;

        // Pin a dedicated connection for the session-level advisory lock (see doc comment).
        let mut lock_conn = match svc.state().db.acquire().await {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "fleet-restart: failed to acquire lock connection — skipping tick");
                continue;
            }
        };
        let locked = match sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_lock(hashtext('rows-fleet-restart'), hashtext($1))",
        )
        .bind(guid.to_string())
        .fetch_one(&mut *lock_conn)
        .await
        {
            Ok(v) => v,
            Err(e) => {
                warn!(error = %e, "fleet-restart: advisory-lock query failed — skipping tick");
                continue; // no lock held; lock_conn returns to the pool normally
            }
        };
        if !locked {
            continue; // another replica owns this tenant's reconcile this tick
        }

        // Arm the RAII guard so the session lock is dropped even if the cycle panics.
        let mut lock_guard = AdvisoryLockGuard::new(lock_conn);

        // Run the cycle as a supervised task so a panic is caught at the JoinError boundary and
        // the explicit unlock below ALWAYS runs (a leaked session lock would wedge this tenant).
        if let Err(e) = tokio::spawn(run_fleet_restart_cycle(svc.clone(), guid)).await {
            error!(error = %e, "fleet-restart: cycle panicked — releasing lock, loop continues");
        }

        // Release on the SAME pinned connection. On failure, detach+close so Postgres drops the
        // session lock when the backend session ends, rather than leaking it on a pooled connection.
        match sqlx::query("SELECT pg_advisory_unlock(hashtext('rows-fleet-restart'), hashtext($1))")
            .bind(guid.to_string())
            .execute(lock_guard.conn_mut())
            .await
        {
            Ok(_) => lock_guard.disarm(),
            Err(e) => {
                warn!(error = %e, "fleet-restart: failed to release advisory lock — closing connection");
                if let Err(e) = lock_guard.take().detach().close().await {
                    warn!(error = %e, "fleet-restart: error closing detached lock connection");
                }
            }
        }
    }
}

/// Probes whether statements on one pooled connection reach ONE backend session — the invariant
/// every session-level advisory lock here depends on. Takes a probe advisory lock, then asks
/// `pg_locks` whether the *current backend* holds an advisory lock: behind a transaction-mode
/// pooler the two statements can land on different backends, so the lock is invisible to the
/// second (`false`). Always releases via `pg_advisory_unlock_all()` on the same pinned connection.
///
/// The probe key is `pg_backend_pid()`, NOT a shared constant: with a shared key, two replicas
/// probing at the same instant collide — the loser's try-lock returns false, its `pg_locks` check
/// finds nothing, and a correctly-pinned process would be misdiagnosed as "behind a pooler" and
/// permanently disable its reconcile. Keying by backend pid makes cross-process collision
/// impossible on a direct connection. The try-lock result is still checked as a belt-and-braces
/// (a leaked probe lock on a pooled backend could shadow the key): a failed acquire is
/// INCONCLUSIVE (`Err` → caller retries), never a "not pinned" verdict.
async fn verify_session_pinned_locks(db: &crate::db::DbPool) -> Result<bool, sqlx::Error> {
    let mut conn = db.acquire().await?;
    let locked: bool = sqlx::query_scalar(
        "SELECT pg_try_advisory_lock(hashtext('rows-pooler-probe'), pg_backend_pid())",
    )
    .fetch_one(&mut *conn)
    .await?;
    if !locked {
        return Err(sqlx::Error::Protocol(
            "pooler probe lock contended — inconclusive, retry".into(),
        ));
    }
    let pinned: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM pg_locks
         WHERE locktype = 'advisory' AND pid = pg_backend_pid())",
    )
    .fetch_one(&mut *conn)
    .await?;
    sqlx::query("SELECT pg_advisory_unlock_all()")
        .execute(&mut *conn)
        .await?;
    Ok(pinned)
}

/// The `deadline` stamped on each `set_drain_state`: aggressive restarts carry the row's
/// `draindeadline` (UTC-naive per the column contract); non-aggressive ⇒ `None` (never forces).
fn fr_deadline(fr: &crate::config::FleetRestart) -> Option<chrono::NaiveDateTime> {
    fr.drain_deadline.map(|d| d.naive_utc())
}

/// Patches `ows.kbve.com/draining=true` onto each instance's GameServer — the UE-facing half of
/// the drain (contract obligation #4; UE watches the label via the Agones SDK and starts its
/// graceful drain/save). Name resolution mirrors the reaper: in-memory `zone_servers` first, one
/// batched DB fallback for misses. No-op when Agones is unavailable (local dev).
async fn mark_gameservers_draining(
    svc: &Arc<OWSService>,
    repo: &InstanceRepo<'_>,
    guid: uuid::Uuid,
    instance_ids: &[i32],
) {
    if instance_ids.is_empty() {
        return;
    }
    let Some(ref agones) = svc.state().agones else {
        return;
    };
    let mut named: Vec<(i32, String)> = Vec::new();
    let mut misses: Vec<i32> = Vec::new();
    for id in instance_ids {
        match svc.state().zone_servers.get(id) {
            Some(v) => named.push((*id, v.value().clone())),
            None => misses.push(*id),
        }
    }
    if !misses.is_empty() {
        match repo.get_gameserver_names(guid, &misses).await {
            Ok(rows) => {
                for (id, gs) in rows {
                    match gs {
                        Some(gs) => named.push((id, gs)),
                        None => warn!(
                            instance_id = id,
                            "fleet-restart: no GameServer name to signal draining (legacy row?)"
                        ),
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, "fleet-restart: failed to resolve GameServer names for drain signal")
            }
        }
    }
    for (id, gs) in named {
        if let Err(e) = agones.mark_draining(&gs).await {
            // Retried next tick (the caller re-signals every still-draining instance), so a
            // transient apiserver failure only delays the graceful drain by ~30s.
            warn!(error = %e, gs = %gs, instance_id = id,
                  "fleet-restart: failed to set draining label — retrying next tick");
        }
    }
}

/// One reconcile pass, run under the advisory lock held by the caller (mirrors `run_reap_cycle`).
async fn run_fleet_restart_cycle(svc: Arc<OWSService>, guid: uuid::Uuid) {
    let repo = InstanceRepo(&svc.state().db);

    let fr = match repo.get_fleet_restart(guid).await {
        Ok(Some(fr)) if fr.active => fr,
        // No active restart (row present, active=false). Lift the lockout ONLY if THIS restart
        // applied it (lockoutapplied) — never blindly NULL the shared admission_control row, which
        // maintenance/abuse flows also write. One-shot + idempotent on cold-start resume.
        Ok(Some(fr)) => {
            if fr.lockout_applied {
                if let Err(e) = repo.set_admission(guid, None).await {
                    warn!(error = %e, "fleet-restart: failed to lift lockout");
                    return; // leave lockoutapplied=true; retry next tick
                }
                if let Err(e) = repo.set_fleet_lockout_applied(guid, false).await {
                    warn!(error = %e, "fleet-restart: failed to clear lockout-applied flag");
                }
                info!("fleet-restart: restart cleared — admission lockout lifted");
            }
            return;
        }
        Ok(None) => return, // inert: no row at all, nothing to do (and nothing we ever locked)
        Err(e) => {
            warn!(error = %e, "fleet-restart: read failed");
            return;
        }
    };

    // Hold the lockout while the restart runs (travel still allowed — the admission gate only
    // blocks *new* joins). Ownership means "the lockout exists because of THIS restart": on first
    // application, check the shared admission_control row first — if another writer (maintenance /
    // abuse mitigation) already holds acceptnewjoins=false, do NOT write or claim it, or the
    // restart's clear-path would lift that writer's freeze (the exact clobber `lockoutapplied`
    // exists to prevent). Once owned, re-assert every tick (heals a concurrent NULL-out).
    if fr.lockout {
        if fr.lockout_applied {
            if let Err(e) = repo.set_admission(guid, Some(false)).await {
                warn!(error = %e, "fleet-restart: failed to re-assert lockout");
            }
        } else {
            // Claim ownership FIRST, then write — if the claim lands but the write fails (or we
            // crash between them), the next tick's `lockout_applied` branch re-asserts. The
            // reverse order would strand an applied-but-unowned lockout (piggybacked forever).
            // The write itself is CONDITIONAL-ATOMIC (`try_set_admission_lockout`: only
            // transitions acceptnewjoins to false if it isn't false already), so another writer's
            // freeze landing concurrently is detected in the same statement — no read-then-write
            // TOCTOU — and we un-claim instead of adopting (and later lifting) their freeze.
            if let Err(e) = repo.set_fleet_lockout_applied(guid, true).await {
                warn!(error = %e, "fleet-restart: lockout ownership claim failed — retrying next tick");
            } else {
                match repo.try_set_admission_lockout(guid).await {
                    Ok(true) => {} // we performed the transition — ownership stands
                    Ok(false) => {
                        // Another writer already holds the freeze — piggyback, never claim.
                        if let Err(e) = repo.set_fleet_lockout_applied(guid, false).await {
                            warn!(error = %e, "fleet-restart: failed to un-claim after piggyback detection");
                        }
                    }
                    Err(e) => {
                        warn!(error = %e, "fleet-restart: failed to set lockout (owned; re-asserted next tick)");
                    }
                }
            }
        }
    }

    // Barrier latch (see `FleetRestart::drained_at`): once the restart has fully converged —
    // no DB instances AND no Agones GameServers — the drain fan-out below must never run again
    // for this activation. The cutover's scale-up registers NEW-version instances while the row
    // is still `active` (the runbook clears it after a confirmed scale-up); without the latch the
    // next tick would drain-label and fan `set_drain_state` across the fresh fleet.
    if fr.drained_at.is_some() {
        info!(
            "fleet-restart: converged (drained_at latched) — holding lockout, awaiting operator clear"
        );
        return;
    }

    // Batch source: instances not yet draining. Whole-fleet if !stagger.
    let limit = if fr.stagger {
        i64::from(fr.batch_size.max(1))
    } else {
        FLEET_DRAIN_CAP
    };
    let batch = match repo.list_drainable_instances(guid, limit).await {
        Ok(b) => b,
        Err(e) => {
            warn!(error = %e, "fleet-restart: list failed");
            return;
        }
    };

    for id in &batch {
        match repo
            .set_drain_state(
                guid,
                *id,
                1, // draining
                fr.urgency,
                fr.drop_players,
                &fr.reason,
                fr.request_id,
                fr_deadline(&fr),
            )
            .await
        {
            Ok(_) => {} // 0 rows = guard rejected (row gone / stricter drain in flight)
            Err(e) => {
                warn!(error = %e, instance_id = id, "fleet-restart: set_drain_state failed")
            }
        }
    }

    // UE-facing drain signal (contract obligation #4): the DB drain state only affects ROWS-side
    // routing — the GameServer learns it is draining via the `ows.kbve.com/draining=true` label
    // (watched through the Agones SDK). Without this, a populated server never starts its graceful
    // drain/save and a non-aggressive restart converges only by luck. Re-signaled for EVERY
    // still-draining instance each tick, not once at first drain: a one-shot patch lost to a
    // transient apiserver failure (this cluster has a documented etcd-pressure history) would
    // otherwise never be retried and the server would never begin its graceful drain. The patch is
    // idempotent — a no-op label PATCH does not bump resourceVersion or write etcd — and the
    // re-signal set shrinks as instances converge to status=0, so steady-state cost is zero.
    match repo.list_draining_instances(guid, FLEET_DRAIN_CAP).await {
        Ok(draining_ids) => {
            mark_gameservers_draining(&svc, &repo, guid, &draining_ids).await;
        }
        Err(e) => {
            warn!(error = %e, "fleet-restart: draining-instance list failed — labels retry next tick")
        }
    }

    // Escalation re-stamp: when this restart is AGGRESSIVE (deadline set), instances already
    // drained by an earlier non-aggressive pass carry `draindeadline = NULL` and would never match
    // the overdue query below — the operator's "escalate to aggressive" (the primary stalled-drain
    // recovery) would silently no-op. Re-stamp them with the aggressive params; `set_drain_state`'s
    // monotonic guard permits the escalation (severity 1/1/true > 1/0/false) and refuses downgrades,
    // so this is idempotent and can never relax a stricter in-flight drain.
    if fr.drain_deadline.is_some() {
        match repo
            .list_deadline_restampable_instances(guid, FLEET_DRAIN_CAP)
            .await
        {
            Ok(restamp) => {
                if !restamp.is_empty() {
                    info!(
                        count = restamp.len(),
                        "fleet-restart: escalating already-draining instances to the aggressive deadline"
                    );
                }
                for id in &restamp {
                    if let Err(e) = repo
                        .set_drain_state(
                            guid,
                            *id,
                            1, // draining
                            fr.urgency,
                            fr.drop_players,
                            &fr.reason,
                            fr.request_id,
                            fr_deadline(&fr),
                        )
                        .await
                    {
                        warn!(error = %e, instance_id = id, "fleet-restart: escalation re-stamp failed");
                    }
                }
            }
            Err(e) => warn!(error = %e, "fleet-restart: escalation re-stamp list failed"),
        }
    }

    // Deadline + stall backstop: even the non-aggressive path bounds the join outage, so a
    // stuck/disabled reaper (or a population that never leaves) surfaces as a loud, observable
    // stall instead of an indefinitely-held lockout.
    enforce_drain_deadline(&svc, &repo, guid, &fr).await;

    let remaining = repo.count_active_instances(guid).await.unwrap_or(-1);
    info!(
        active = remaining,
        staggered = fr.stagger,
        batch = batch.len(),
        "fleet-restart: reconcile tick"
    );
    // remaining == 0 is the DB all-drained signal (exposed via /fleet-restart/status). It only
    // reaches 0 once instances hit status=0, which ONLY empty_server_reaper writes
    // (set_drain_state rejects state=0) — so convergence depends on the reaper AND the backstop.

    // Latch full convergence: DB drained AND every Agones GameServer gone (the same two-level
    // barrier as /fleet-restart/status.safe_to_roll). Requires a LIVE Agones count — an
    // unavailable/failed LIST must never latch (fail closed), and local dev (no Agones) never
    // latches. Once set, the next tick's early-return stops the fan-out so the post-cutover new
    // fleet is never drained by this still-active row; the trigger upsert resets the latch.
    if remaining == 0 {
        if let Some(ref agones) = svc.state().agones {
            match agones.count_gameservers().await {
                Ok(0) => {
                    if let Err(e) = repo.set_fleet_drained_at(guid).await {
                        warn!(error = %e, "fleet-restart: failed to latch drained_at — retrying next tick");
                    } else {
                        info!(
                            "fleet-restart: fully converged (0 instances, 0 gameservers) — \
                             drained_at latched; fan-out stopped, safe to begin the cutover"
                        );
                    }
                }
                Ok(_) => {} // pods still terminating — latch next tick
                Err(e) => {
                    warn!(error = %e, "fleet-restart: gameserver count failed — latch deferred")
                }
            }
        }
    }
}

/// Two paths, two behaviours (safe-by-default is a hard invariant):
///
/// **Aggressive** (`drain_deadline` set and passed): force-deallocate the overdue instances
/// per-GameServer — never a whole-Fleet scale-to-0, which would also kill instances still draining
/// cleanly. Aggressive explicitly opts into save-then-disconnect at the deadline.
///
/// **Non-aggressive** (no deadline): never disconnect anyone, but bound the join outage in two
/// escalating stages off `started_at`:
///   1. past `fleet_restart_stall_secs`: loud warn + `stalled` surfaces on /fleet-restart/status.
///   2. past 2×: auto-lift the join lockout while leaving the restart active (new players land on
///      old-version instances — safe within a version line; the roll just takes longer).
///
/// The aggressive path gets stall *surfacing* (an `error!` past the stall SLA when overdue
/// instances aren't converging) but deliberately NO stage-2 auto-lift: lifting joins mid-aggressive
/// routes players onto instances (or fresh old-version spin-ups) that the deadline backstop
/// force-deallocates on the next tick — a join-and-drop churn loop, strictly worse than the
/// lockout. The recovery is operator action: restore Agones / clear the restart.
async fn enforce_drain_deadline(
    svc: &Arc<OWSService>,
    repo: &InstanceRepo<'_>,
    guid: uuid::Uuid,
    fr: &crate::config::FleetRestart,
) {
    if let Some(deadline) = fr.drain_deadline {
        // Aggressive path: per-GameServer force-deallocate of overdue instances.
        if chrono::Utc::now() < deadline {
            return;
        }
        let overdue = match repo
            .list_overdue_draining_instances(guid, chrono::Utc::now().naive_utc())
            .await
        {
            Ok(v) => v,
            Err(e) => {
                warn!(error = %e, "fleet-restart: overdue-instance query failed");
                return;
            }
        };
        if overdue.is_empty() {
            return;
        }
        // Aggressive stall surfacing (no auto-lift — see the doc comment): if overdue instances
        // are still here past the stall SLA, force-deallocation is not converging (Agones down,
        // unresolvable GameServer names). Escalate to error! so it alerts; /fleet-restart/status
        // reports stalled=true off the same clock.
        let stalled_secs = (chrono::Utc::now() - fr.started_at).num_seconds();
        if stalled_secs > svc.state().config.fleet_restart_stall_secs {
            error!(
                stalled_secs,
                overdue = overdue.len(),
                "fleet-restart: AGGRESSIVE restart stalled — force-deallocation not converging; \
                 lockout stays held (no auto-lift: joins would land on doomed instances). \
                 Restore Agones / resolve GameServer names, or clear the restart (active=false)"
            );
        }
        let Some(ref agones) = svc.state().agones else {
            warn!(
                overdue = overdue.len(),
                "fleet-restart: deadline passed but Agones unavailable — cannot force-deallocate"
            );
            return;
        };
        info!(
            overdue = overdue.len(),
            "fleet-restart: drain deadline passed — force-deallocating overdue instances"
        );
        // Resolve GameServer names: in-memory tracking first, one batched DB fallback for misses
        // (mirrors the reaper's resolution; a resolve failure just retries next tick).
        let mut named: Vec<(i32, String)> = Vec::new();
        let mut misses: Vec<i32> = Vec::new();
        for id in &overdue {
            match svc.state().zone_servers.get(id) {
                Some(v) => named.push((*id, v.value().clone())),
                None => misses.push(*id),
            }
        }
        if !misses.is_empty() {
            match repo.get_gameserver_names(guid, &misses).await {
                Ok(rows) => {
                    for (id, gs) in rows {
                        match gs {
                            Some(gs) => named.push((id, gs)),
                            None => warn!(
                                instance_id = id,
                                "fleet-restart: overdue instance has no resolvable GameServer name"
                            ),
                        }
                    }
                }
                Err(e) => {
                    warn!(error = %e, "fleet-restart: failed to resolve GameServer names — retrying next tick")
                }
            }
        }
        // Deallocate-first, serially (deadline batches are small; the reaper's concurrency budget
        // reasoning applies — don't starve the hot path). A failure leaves the row for next tick.
        for (id, gs) in named {
            match agones.deallocate(&gs).await {
                Ok(()) => {
                    svc.state().zone_servers.remove(&id);
                    if let Err(e) = repo.shut_down_server_instance(guid, id).await {
                        warn!(error = %e, instance_id = id, "fleet-restart: deallocated but failed to set status=0");
                    }
                }
                Err(e) => {
                    warn!(error = %e, gs = %gs, instance_id = id, "fleet-restart: deallocate failed — will retry next tick");
                }
            }
        }
        return;
    }

    // Non-aggressive path: never disconnect; bound the join outage off started_at.
    let stall_secs = svc.state().config.fleet_restart_stall_secs;
    let stalled_secs = (chrono::Utc::now() - fr.started_at).num_seconds();
    if stalled_secs <= stall_secs {
        return;
    }
    let draining = match repo.count_active_instances(guid).await {
        Ok(n) => n,
        Err(e) => {
            warn!(error = %e, "fleet-restart: active-count read failed during stall check");
            return;
        }
    };
    if draining == 0 {
        return; // converged — nothing stalled
    }
    if stalled_secs > 2 * stall_secs {
        // Stage 2: hard join-outage cap. Auto-lift the lockout while leaving the restart active.
        // Order matters — `lockout=false` FIRST, so the next tick's active branch (`if fr.lockout`)
        // can never re-apply the lockout between a partial lift and its retry (lifting admission
        // first left a one-tick null↔false flap window when the lockout clear failed). Then lift
        // admission; then clear ownership LAST, so a failure anywhere leaves `lockoutapplied=true`
        // and this branch (or the operator-clear branch) retries the lift next tick.
        if fr.lockout || fr.lockout_applied {
            if let Err(e) = repo.set_fleet_lockout(guid, false).await {
                warn!(error = %e, "fleet-restart: stall auto-lift failed to clear lockout flag");
                return; // nothing changed; retry next tick
            }
            if let Err(e) = repo.set_admission(guid, None).await {
                warn!(error = %e, "fleet-restart: stall auto-lift failed to lift admission");
                return; // lockout=false already: no re-apply flap; lockoutapplied=true retries this
            }
            if let Err(e) = repo.set_fleet_lockout_applied(guid, false).await {
                warn!(error = %e, "fleet-restart: stall auto-lift failed to clear ownership flag");
            }
            error!(
                stalled_secs,
                draining,
                "fleet-restart: join-outage cap hit — lockout auto-lifted, drain still pending; \
                 escalate to aggressive (deadline) or clear the restart"
            );
        }
    } else {
        // Stage 1: stall SLA breached. Drain continues; lockout still held; /fleet-restart/status
        // reports stalled=true off the same started_at clock.
        warn!(
            stalled_secs,
            draining,
            "fleet-restart: drain stalled — check empty_server_reaper is enabled and healthy"
        );
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
