use crate::middleware::require_customer_guid;
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::get};
use serde::Serialize;
use std::time::Instant;
use utoipa::ToSchema;

use super::HandlerState;

pub fn system_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/api/System/FleetStatus", get(fleet_status))
        .route("/api/System/Health", get(aggregated_health))
        .route("/api/System/ActivePlayers", get(active_players))
        .route("/api/System/InstanceLog", get(instance_log))
        .route("/api/System/DeploymentInfo", get(deployment_info))
        .route("/api/System/ReportBuild", axum::routing::post(report_build))
        .route(
            "/api/System/RestartGameServer",
            axum::routing::post(restart_game_server),
        )
        .route(
            "/api/System/RestartFleet",
            axum::routing::post(restart_fleet),
        )
        .route(
            "/api/System/VerifyDeployment",
            axum::routing::post(verify_deployment),
        )
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

/// Fleet-restart routes. SECURITY POSTURE (HIGH-1): these are served on the same port (4322) every
/// GameServer already reaches, and a NetworkPolicy filters by pod-selector + port, never HTTP path
/// — so "cluster-internal" is NOT an access control here. The read routes (`status`, `pending`)
/// are tolerable for any in-cluster caller; the mutating `trigger` route additionally requires the
/// gateway-held bearer token (`ROWS_FLEET_RESTART_TOKEN`, from the ows sealed-secret set) that
/// GameServers do NOT hold — see `require_fleet_restart_token`. Keep these off any public Ingress.
pub fn fleet_restart_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/fleet-restart/status", get(fleet_restart_status))
        .route("/fleet-restart/pending", get(fleet_restart_pending))
        .route(
            "/fleet-restart/trigger",
            axum::routing::post(fleet_restart_trigger),
        )
        .route(
            "/fleet-restart/clear",
            axum::routing::post(fleet_restart_clear),
        )
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

/// App-level auth for the MUTATING fleet-restart route (HIGH-1). The gateway holds
/// `ROWS_FLEET_RESTART_TOKEN` (from the ows sealed-secret set); GameServers do NOT — a
/// NetworkPolicy cannot keep them off this path (same port 4322, and policies can't filter by
/// HTTP path). Fails closed: unset/empty env ⇒ every caller is rejected 401.
fn fleet_restart_token_ok(headers: &HeaderMap) -> bool {
    let expected = std::env::var("ROWS_FLEET_RESTART_TOKEN").unwrap_or_default();
    fleet_restart_token_matches(&expected, headers)
}

/// Pure comparison half of [`fleet_restart_token_ok`] (env-free so it is unit-testable).
/// Fails closed: empty expected token ⇒ every caller is rejected.
fn fleet_restart_token_matches(expected: &str, headers: &HeaderMap) -> bool {
    if expected.is_empty() {
        return false;
    }
    let presented = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    // Constant-time-ish compare: length check then byte fold, so a prefix match doesn't
    // short-circuit early.
    presented.len() == expected.len()
        && presented
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

/// TTL for the cached Agones GameServer count behind `/fleet-restart/status`. The DB counts are
/// cheap; only the Agones LIST needs the cache (this cluster has a documented apiserver/etcd
/// pressure history). Orchestrators should poll no faster than every 5s.
const GS_COUNT_TTL: std::time::Duration = std::time::Duration::from_secs(5);

/// Agones GameServer count, cached for `GS_COUNT_TTL` (shared across callers). `None` = Agones
/// unavailable or the LIST failed — callers must FAIL CLOSED (report not-safe-to-roll), never
/// treat unknown as zero.
async fn cached_gameserver_count(hs: &HandlerState) -> Option<i64> {
    if let Some((at, n)) = *hs.app.gs_count_cache.lock().unwrap() {
        if at.elapsed() < GS_COUNT_TTL {
            return Some(n);
        }
    }
    let agones = hs.app.agones.as_ref()?;
    match agones.count_gameservers().await {
        Ok(n) => {
            *hs.app.gs_count_cache.lock().unwrap() = Some((Instant::now(), n));
            Some(n)
        }
        Err(e) => {
            tracing::warn!(error = %e, "fleet-restart: gameserver count failed");
            None
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct FleetRestartStatus {
    /// A `fleet_restart` row is active for this tenant.
    pub active: bool,
    /// DB-level count of instances still `status > 0` (the *necessary* barrier level).
    pub draining: i64,
    /// Agones GameServer objects still present, any state (the *sufficient* barrier level).
    /// `-1` = Agones unavailable/LIST failed — unknown, never treated as zero.
    pub gameservers: i64,
    /// `active && draining == 0` — the DB says every instance is gone; begin the cutover.
    pub all_drained: bool,
    /// Every old pod is actually gone; safe to roll. Exactly `drained_at != null`: stamped (by
    /// this endpoint or the reconcile) at full convergence — 0 instances + 0 gameservers — and
    /// DURABLE for the rest of the activation, so the cutover's scale-up (new gameservers while
    /// the row is still active) does NOT flip it back to false. Stamping also stops the
    /// reconcile's drain fan-out, so the new fleet is never drained by this restart.
    pub safe_to_roll: bool,
    /// RFC3339 timestamp of the convergence latch (`fleet_restart.drainedat`); `null` until the
    /// two-level barrier first opened. Past this, the reconcile's drain fan-out is stopped.
    pub drained_at: Option<String>,
    /// Non-aggressive stall backstop: `active && draining > 0` past the stall SLA. The alertable
    /// "drain not converging — check empty_server_reaper" signal.
    pub stalled: bool,
}

#[utoipa::path(
    get,
    path = "/fleet-restart/status",
    tag = "system",
    summary = "Fleet-restart drain status + two-level safe-to-roll barrier",
    description = "DB draining count (necessary) + Agones GameServer count (sufficient). safe_to_roll only when both hit 0 while a restart is active. Poll cadence >= 5s (the GS count is cached ~5s). Cluster-internal only.",
    responses((status = 200, description = "Fleet-restart status", body = FleetRestartStatus)),
)]
pub async fn fleet_restart_status(
    State(hs): State<HandlerState>,
) -> Result<Json<FleetRestartStatus>, crate::error::RowsError> {
    let guid = hs.app.config.customer_guid;
    let repo = crate::repo::InstanceRepo(&hs.app.db);
    let fr = repo.get_fleet_restart(guid).await?;
    let active = matches!(&fr, Some(fr) if fr.active);
    let draining = repo.count_active_instances(guid).await?;
    // Fail closed on an unknown GS count: -1 can never satisfy `== 0`.
    let gameservers = cached_gameserver_count(&hs).await.unwrap_or(-1);
    let all_drained = active && draining == 0;
    let mut drained_at = fr
        .as_ref()
        .filter(|fr| fr.active)
        .and_then(|fr| fr.drained_at);
    // Read-repair the convergence latch: THIS response is what tells the orchestrator "roll now",
    // and the orchestrator's scale-up races the reconcile's next tick (up to 30s away). If the
    // latch weren't stamped before we answer, the new fleet's gameservers would flip the barrier
    // shut and the still-active row would drain them. Stamping here (idempotent, WHERE drainedat
    // IS NULL) closes that window: fan-out is stopped no later than the first safe-to-roll answer.
    // The reconcile stamps it too (backup for pollers that never call this endpoint).
    if active && drained_at.is_none() && draining == 0 && gameservers == 0 {
        match repo.set_fleet_drained_at(guid).await {
            Ok(()) => drained_at = Some(chrono::Utc::now()),
            Err(e) => {
                tracing::warn!(error = %e, "fleet-restart: status read-repair of drained_at failed")
            }
        }
    }
    // safe_to_roll IS the latch — never reported true without drainedat durably stamped, so a
    // failed stamp fails closed (this poll says false; the next one retries). Durable: once
    // stamped, the cutover's own scale-up (new gameservers while the row is still active) must
    // not flip safe_to_roll back to false.
    let safe_to_roll = drained_at.is_some();
    let stalled = fr.as_ref().is_some_and(|fr| {
        fr.active
            && draining > 0
            && (chrono::Utc::now() - fr.started_at).num_seconds()
                > hs.app.config.fleet_restart_stall_secs
    });
    Ok(Json(FleetRestartStatus {
        active,
        draining,
        gameservers,
        all_drained,
        safe_to_roll,
        drained_at: drained_at.map(|d| d.to_rfc3339()),
        stalled,
    }))
}

#[derive(Serialize, ToSchema)]
pub struct FleetRestartPending {
    /// A merged-but-not-rolled update exists (`deploy_state.rolled=false`).
    pub pending: bool,
    /// The pending version, when `pending=true`.
    pub target_version: Option<String>,
}

#[utoipa::path(
    get,
    path = "/fleet-restart/pending",
    tag = "system",
    summary = "Is a version update pending?",
    description = "pending=true when deploy_state has rolled=false. Gates the aggressive trigger (and the dashboard button). Cluster-internal only.",
    responses((status = 200, description = "Pending-update state", body = FleetRestartPending)),
)]
pub async fn fleet_restart_pending(
    State(hs): State<HandlerState>,
) -> Result<Json<FleetRestartPending>, crate::error::RowsError> {
    let ds = crate::repo::InstanceRepo(&hs.app.db)
        .get_deploy_state(hs.app.config.customer_guid)
        .await?;
    let (pending, target_version) = match ds {
        Some(ds) if !ds.rolled => (true, Some(ds.target_version)),
        _ => (false, None),
    };
    Ok(Json(FleetRestartPending {
        pending,
        target_version,
    }))
}

/// Default aggressive grace window (seconds) when the trigger body omits `grace_secs`.
const FLEET_RESTART_DEFAULT_GRACE_SECS: i64 = 300;

#[utoipa::path(
    post,
    path = "/fleet-restart/trigger",
    tag = "system",
    summary = "Trigger a coordinated fleet restart",
    description = "Upserts the fleet_restart control row. aggressive: urgency=1, dropplayers=true, deadline=now()+grace_secs (default 300) — save-then-disconnect at the deadline; requires a pending update. non_aggressive: drain-to-natural-empty, never disconnects. Requires the gateway bearer token (ROWS_FLEET_RESTART_TOKEN); NOT public, NOT for GameServers.",
    request_body(
        description = "{ mode: \"aggressive\"|\"non_aggressive\", grace_secs?: i64, stagger?: bool (default false), batch_size?: i64 >= 1 (default 1) } — stagger paces the drain in batches of batch_size per 30s tick; it is NOT strict wave-by-wave isolation (the next batch starts when instances are still un-drained, not when the previous batch completes)",
        content_type = "application/json"
    ),
    responses(
        (status = 200, description = "Restart activated: { success, mode, drain_deadline? }"),
        (status = 400, description = "Invalid mode / grace_secs / batch_size"),
        (status = 401, description = "Missing/invalid gateway token"),
        (status = 409, description = "A restart is already active"),
        (status = 412, description = "Precondition failed: empty_server_reaper is disabled for this tenant (the restart cannot converge; enable it first), or aggressive mode with no pending update"),
    ),
)]
pub async fn fleet_restart_trigger(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    if !fleet_restart_token_ok(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "error": "fleet-restart trigger requires the gateway bearer token",
            })),
        )
            .into_response();
    }

    let mode = body.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    let aggressive = match mode {
        "aggressive" => true,
        "non_aggressive" => false,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "error": "mode must be \"aggressive\" or \"non_aggressive\"",
                })),
            )
                .into_response();
        }
    };
    let grace_secs = body
        .get("grace_secs")
        .and_then(|v| v.as_i64())
        .unwrap_or(FLEET_RESTART_DEFAULT_GRACE_SECS);
    if aggressive && grace_secs <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "grace_secs must be > 0",
            })),
        )
            .into_response();
    }
    // Batched rollout pacing. NOTE: stagger is batch-paced draining, NOT strict wave-by-wave
    // isolation — the next batch is gated on instances still being un-drained, not on the previous
    // batch completing. Defaults preserve the whole-fleet behavior. Validated here so the DB
    // CHECK (BatchSize >= 1) surfaces as a 400, not a 500.
    let stagger = body
        .get("stagger")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let batch_size = body.get("batch_size").and_then(|v| v.as_i64()).unwrap_or(1);
    if !(1..=i64::from(i32::MAX)).contains(&batch_size) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "batch_size must be >= 1",
            })),
        )
            .into_response();
    }

    let guid = hs.app.config.customer_guid;
    let repo = crate::repo::InstanceRepo(&hs.app.db);

    // Convergence precondition: only empty_server_reaper moves instances to status=0
    // (set_drain_state rejects it), so a restart with the reaper disabled is a GUARANTEED stall —
    // 30–60 min of join lockout ending in the stage-2 auto-lift, not a completed drain. Fail fast
    // at the operator with the runbook pointer instead. Effective config = env baseline merged
    // with the per-tenant reaperconfig override (the same read the reaper does each cycle).
    // Deliberately NOT auto-enabled here: enabling the reaper is a hard-gated runbook step (UE
    // heartbeats must be live first) and must never happen as a side effect of a restart click.
    // The SQL trigger path stays ungated as the break-glass. Fail closed on a read error — we
    // can't prove the restart can converge.
    match repo.get_reaper_config_override(guid).await {
        Ok(ov) => {
            if !hs.app.config.reaper.merged_with(&ov).enabled {
                return (
                    StatusCode::PRECONDITION_FAILED,
                    Json(serde_json::json!({
                        "success": false,
                        "error": "fleet restart cannot converge: empty_server_reaper is disabled \
                                  for this tenant — enable it first (reaper runbook §2), or use \
                                  the SQL trigger path deliberately",
                    })),
                )
                    .into_response();
            }
        }
        Err(e) => return e.into_response(),
    }

    // The aggressive path exists to *deploy a pending update* — you can't restart-to-deploy with
    // nothing to deploy (this narrows WHEN it fires; the token above controls WHO). 412, not 404:
    // the resource exists, a precondition doesn't hold (and 404 is ambiguous with a bad route).
    if aggressive {
        match repo.get_deploy_state(guid).await {
            Ok(Some(ds)) if !ds.rolled => {}
            Ok(_) => {
                return (
                    StatusCode::PRECONDITION_FAILED,
                    Json(serde_json::json!({
                        "success": false,
                        "error": "no pending update — aggressive restart refused",
                    })),
                )
                    .into_response();
            }
            Err(e) => return e.into_response(),
        }
    }

    let deadline = aggressive.then(|| chrono::Utc::now() + chrono::Duration::seconds(grace_secs));
    let reason = if aggressive {
        "fleet-restart:aggressive"
    } else {
        "fleet-restart:non_aggressive"
    };
    // One restart at a time, enforced ATOMICALLY in the upsert (`WHERE fleet_restart.active =
    // false`): a re-trigger mid-drain would silently reset the stall clock and (aggressive) re-arm
    // the deadline, and a check-then-write here would race two concurrent triggers. `false` =
    // another restart is active → 409; the operator clears or finishes it first.
    match repo
        .set_fleet_restart(
            guid,
            aggressive,
            deadline,
            reason,
            stagger,
            batch_size as i32,
        )
        .await
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "success": false,
                    "error": "a fleet restart is already active",
                })),
            )
                .into_response();
        }
        Err(e) => return e.into_response(),
    }

    tracing::info!(
        mode,
        grace_secs = aggressive.then_some(grace_secs),
        "fleet-restart triggered via API"
    );
    Json(serde_json::json!({
        "success": true,
        "mode": mode,
        "drain_deadline": deadline.map(|d| d.to_rfc3339()),
    }))
    .into_response()
}

#[utoipa::path(
    post,
    path = "/fleet-restart/clear",
    tag = "system",
    summary = "Clear (complete or cancel) the active fleet restart",
    description = "Sets fleet_restart.active=false — the API counterpart of the SQL runbook step, so a restart started via /fleet-restart/trigger can be finished without a psql session. The reconcile's next tick lifts the admission lockout iff it owns it. cleared=false when nothing was active (idempotent). Requires the gateway bearer token.",
    responses(
        (status = 200, description = "{ success: true, cleared: bool }"),
        (status = 401, description = "Missing/invalid gateway token"),
    ),
)]
pub async fn fleet_restart_clear(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    // Same gate as the trigger: clearing mid-drain re-opens joins and re-arms the legacy
    // RestartFleet break-glass — as operator-privileged as starting one.
    if !fleet_restart_token_ok(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "error": "fleet-restart clear requires the gateway bearer token",
            })),
        )
            .into_response();
    }

    let guid = hs.app.config.customer_guid;
    match crate::repo::InstanceRepo(&hs.app.db)
        .clear_fleet_restart(guid)
        .await
    {
        Ok(cleared) => {
            if cleared {
                tracing::info!(
                    "fleet-restart cleared via API — reconcile lifts any owned lockout next tick"
                );
            }
            Json(serde_json::json!({ "success": true, "cleared": cleared })).into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[utoipa::path(
    get,
    path = "/api/System/FleetStatus",
    tag = "system",
    summary = "Agones fleet status",
    description = "Returns the current Agones GameServer fleet state — ready, allocated, shutdown counts plus per-server detail (name, address, port, age).",
    responses(
        (status = 200, description = "Fleet status (or { error } if Agones is not configured)"),
    )
)]
pub async fn fleet_status(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
    match &hs.app.agones {
        Some(agones) => match agones.fleet_status().await {
            Ok(status) => Json(serde_json::json!(status)),
            Err(e) => Json(serde_json::json!({
                "error": format!("Failed to query fleet: {e}")
            })),
        },
        None => Json(serde_json::json!({
            "error": "Agones not available"
        })),
    }
}

#[derive(Serialize, ToSchema)]
struct HealthCheck {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/System/Health",
    tag = "system",
    summary = "Aggregated health",
    description = "Per-dependency health (postgres, rabbitmq, agones) plus overall status, uptime, in-memory session/instance/spinup-lock counts.",
    responses(
        (status = 200, description = "Aggregated health document"),
    )
)]
pub async fn aggregated_health(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
    let pg_start = Instant::now();
    let pg_ok = sqlx::query("SELECT 1").execute(&hs.app.db).await.is_ok();
    let pg_latency = pg_start.elapsed().as_millis() as u64;

    let mq_ok = hs.app.mq.is_some();

    let (agones_ok, agones_err, circuit_state) = match &hs.app.agones {
        Some(agones) => {
            let cb_state = if agones.is_circuit_open() {
                "open"
            } else {
                "closed"
            };
            let failures = agones.consecutive_failure_count();

            match agones.fleet_status().await {
                Ok(_) => (
                    true,
                    None,
                    serde_json::json!({
                        "state": cb_state,
                        "consecutive_failures": failures,
                    }),
                ),
                Err(e) => (
                    false,
                    Some(format!("{e}")),
                    serde_json::json!({
                        "state": cb_state,
                        "consecutive_failures": failures,
                    }),
                ),
            }
        }
        None => (
            false,
            Some("Not configured".into()),
            serde_json::json!(null),
        ),
    };

    let active_sessions = hs.app.sessions.len();
    let active_instances = hs.app.zone_servers.len();
    let spinup_locks = hs.app.zone_spinup_locks.len();
    let uptime_seconds = hs.app.started_at.elapsed().as_secs();

    let overall = if pg_ok && agones_ok {
        "healthy"
    } else if pg_ok {
        "degraded"
    } else {
        "unhealthy"
    };

    Json(serde_json::json!({
        "status": overall,
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": uptime_seconds,
        "checks": {
            "postgres": { "ok": pg_ok, "latency_ms": pg_latency },
            "rabbitmq": { "ok": mq_ok },
            "agones": {
                "ok": agones_ok,
                "error": agones_err,
                "circuit_breaker": circuit_state,
            }
        },
        "active_sessions": active_sessions,
        "active_instances": active_instances,
        "spinup_locks": spinup_locks
    }))
}

#[utoipa::path(
    get,
    path = "/api/System/ActivePlayers",
    tag = "system",
    summary = "Active players",
    description = "Characters currently bound to a live MapInstance (INNER JOIN charonmapinstance) — represents in-world presence, not the count of open auth sessions.",
    responses(
        (status = 200, description = "List of in-world players { total, players[{ character_name, user_session_guid, zone_name, zone_instance_id }] }"),
    )
)]
pub async fn active_players(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> Json<serde_json::Value> {
    let customer_guid = crate::middleware::extract_customer_guid(&headers);

    let rows: Vec<(String, String, Option<String>, i32)> = sqlx::query_as(
        "SELECT c.charname, us.usersessionguid::text,
                m.zonename, cmi.mapinstanceid
         FROM usersessions us
         JOIN characters c ON c.userguid = us.userguid
            AND c.customerguid = us.customerguid
            AND c.charname = us.selectedcharactername
         JOIN charonmapinstance cmi ON cmi.characterid = c.characterid
            AND cmi.customerguid = c.customerguid
         LEFT JOIN mapinstances mi ON mi.mapinstanceid = cmi.mapinstanceid
            AND mi.customerguid = cmi.customerguid
         LEFT JOIN maps m ON m.mapid = mi.mapid
            AND m.customerguid = mi.customerguid
         WHERE us.customerguid = $1",
    )
    .bind(customer_guid)
    .fetch_all(&hs.app.db)
    .await
    .unwrap_or_default();

    let players: Vec<serde_json::Value> = rows
        .iter()
        .map(|(char_name, session_guid, zone, instance_id)| {
            serde_json::json!({
                "character_name": char_name,
                "user_session_guid": session_guid,
                "zone_name": zone,
                "zone_instance_id": instance_id,
            })
        })
        .collect();

    Json(serde_json::json!({
        "total": players.len(),
        "players": players
    }))
}

use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Clone, Serialize, ToSchema)]
pub struct InstanceEvent {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub event: String,
    pub zone_instance_id: i32,
    pub map_name: String,
    pub game_server: String,
    pub trigger: String,
}

pub struct InstanceEventLog {
    events: Mutex<VecDeque<InstanceEvent>>,
}

impl Default for InstanceEventLog {
    fn default() -> Self {
        Self::new()
    }
}

impl InstanceEventLog {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(VecDeque::with_capacity(200)),
        }
    }

    pub fn push(&self, event: InstanceEvent) {
        let mut events = self.events.lock().unwrap();
        if events.len() >= 200 {
            events.pop_front();
        }
        events.push_back(event);
    }

    pub fn recent(&self, limit: usize) -> Vec<InstanceEvent> {
        let events = self.events.lock().unwrap();
        events.iter().rev().take(limit).cloned().collect()
    }
}

#[utoipa::path(
    get,
    path = "/api/System/InstanceLog",
    tag = "system",
    summary = "Instance lifecycle events",
    description = "Recent zone-instance events from the in-memory ring buffer (allocate, deallocate, restart, verify_*). Max 200 entries retained; default page size 50, capped at 200 via `limit`.",
    params(
        ("limit" = Option<usize>, Query, description = "Max entries to return (default 50, max 200)")
    ),
    responses(
        (status = 200, description = "{ events: InstanceEvent[] }"),
    )
)]
pub async fn instance_log(
    State(hs): State<HandlerState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let limit: usize = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50)
        .min(200);

    let events = hs.app.instance_log.recent(limit);

    Json(serde_json::json!({
        "events": events
    }))
}

#[utoipa::path(
    get,
    path = "/api/System/DeploymentInfo",
    tag = "system",
    summary = "Deployment metadata",
    description = "Build identity (version, rust_version), Agones binding (namespace, fleet), runtime ports, and Supabase configuration flags.",
    responses(
        (status = 200, description = "Static deployment metadata"),
    )
)]
pub async fn deployment_info(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "rust_version": env!("CARGO_PKG_RUST_VERSION", "unknown"),
        "tenant_slug": hs.app.config.tenant_slug,
        "environment": hs.app.config.environment.as_str(),
        "customer_guid": hs.app.config.customer_guid.to_string(),
        "agones_namespace": hs.app.config.agones_namespace,
        "agones_fleet": hs.app.config.agones_fleet,
        "agones_available": hs.app.agones.is_some(),
        "rabbitmq_connected": hs.app.mq.is_some(),
        "http_port": std::env::var("HTTP_PORT").unwrap_or_else(|_| "4322".into()),
        "swagger_port": std::env::var("DOCS_PORT").unwrap_or_else(|_| "4323".into()),
        "active_sessions": hs.app.sessions.len(),
        "zone_servers_tracked": hs.app.zone_servers.len(),
        "spinup_locks_active": hs.app.zone_spinup_locks.len(),
        "supabase": {
            "jwt_configured": hs.app.supabase.jwt_enabled(),
            "service_key_configured": hs.app.supabase.service_key_enabled(),
            "url_configured": hs.app.supabase.url.is_some(),
        },
    }))
}

#[utoipa::path(
    post,
    path = "/api/System/ReportBuild",
    tag = "system",
    summary = "Report loaded UE build version",
    description = "Gameservers POST the build version they loaded off the ows-server-build PVC on boot; surfaced on /health as unreal_version.",
    request_body(description = "{ version: string }", content_type = "application/json"),
    responses((status = 200, description = "{ success: bool, version?: string }")),
)]
pub async fn report_build(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let version = body
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    // ReportBuild is reachable by anything holding the tenant-GUID header (every GameServer / any
    // in-cluster caller on 4322), and its first write permanently seeds the launcher's download
    // target — so gate on plausibility before it touches any state. This bounds accidental (typo'd
    // test pod, garbage payload) and casual-malicious poisoning; a real orchestrated roll
    // overwrites the seed with the authoritative version anyway.
    if !is_plausible_build_version(version) {
        tracing::warn!(
            version,
            "ReportBuild: rejected implausible build version (charset/length/shape)"
        );
        return Json(serde_json::json!({
            "success": false,
            "error": "version must be 1-64 chars of [0-9A-Za-z._-] and contain a digit"
        }));
    }

    {
        let mut current = hs.app.server_build_version.write().unwrap();
        if current.as_deref() != Some(version) {
            tracing::info!(version, "Gameserver reported loaded UE build version");
        }
        *current = Some(version.to_string());
    }

    // One-shot deploy_state seed (ON CONFLICT DO NOTHING): keeps /health.unreal_version non-null
    // before the first orchestrated roll ever writes rolled=true. Never overwrites a real roll or
    // a pending update; best-effort (a failure just leaves the in-memory fallback). Logged with
    // the caller so a mis-seed is traceable (first-write-wins defines the launcher target).
    let source = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("user-agent"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    match crate::repo::InstanceRepo(&hs.app.db)
        .seed_deploy_state(hs.app.config.customer_guid, version)
        .await
    {
        Ok(seeded) if seeded => {
            tracing::info!(
                version,
                source,
                "ReportBuild: seeded deploy_state as the served version (first report wins; \
                 verify against the PVC if unexpected)"
            );
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = %e, "ReportBuild: deploy_state seed failed (non-fatal)"),
    }

    Json(serde_json::json!({ "success": true, "version": version }))
}

/// Plausibility gate for GameServer-reported build versions: 1–64 chars of `[0-9A-Za-z._-]`, at
/// least one digit. Deliberately loose (matches `0.3.46`, `0.3.46-rc1`, `dev.1`), but blocks
/// empty/garbage/injection-shaped strings from becoming the launcher's download target.
///
/// NOT a path-safety guarantee: `..1` passes the charset. Never interpolate an accepted version
/// into a filesystem path (e.g. a `/server/<version>/` lookup) without an additional
/// no-leading-dot / exact-segment check at that call site.
fn is_plausible_build_version(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 64
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
        && v.bytes().any(|b| b.is_ascii_digit())
}

#[utoipa::path(
    post,
    path = "/api/System/RestartGameServer",
    tag = "system",
    summary = "Restart a single GameServer",
    description = "Sends MQ shutdown, deletes the Agones GameServer for the target zone_instance_id, and lets the fleet auto-replace. DB cleanup runs via the GameServer watcher.",
    request_body(
        description = "{ zone_instance_id: i32 } — accepts either snake or camelCase",
        content_type = "application/json"
    ),
    responses(
        (status = 200, description = "{ success: bool, message?: string, error?: string }"),
    )
)]
pub async fn restart_game_server(
    State(hs): State<HandlerState>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let zone_instance_id = body
        .get("zone_instance_id")
        .or_else(|| body.get("zoneInstanceId"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    if zone_instance_id <= 0 {
        return Json(serde_json::json!({
            "success": false,
            "error": "zone_instance_id is required"
        }));
    }

    let customer_guid = hs.app.config.customer_guid;

    let gs_name = hs
        .app
        .zone_servers
        .get(&zone_instance_id)
        .map(|e| e.value().clone());

    if let Some(ref mq) = hs.app.mq {
        let msg = crate::mq::ShutDownMessage {
            customer_guid: customer_guid.to_string(),
            zone_instance_id,
        };
        let repo = crate::repo::InstanceRepo(&hs.app.db);
        if let Ok(Some(info)) = repo
            .get_zone_instance_info(customer_guid, zone_instance_id)
            .await
        {
            if let Err(e) = mq.publish_shut_down(info.world_server_id, &msg).await {
                tracing::warn!(error = %e, "MQ shutdown publish failed (non-fatal)");
            }
        }
    }

    if let (Some(ref agones), Some(ref gs)) = (&hs.app.agones, &gs_name) {
        match agones.deallocate(gs).await {
            Ok(_) => {
                tracing::info!(gs = %gs, zone_instance_id, "GameServer deleted for restart");
            }
            Err(e) => {
                tracing::error!(error = %e, gs = %gs, "Failed to delete GameServer");
                return Json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to delete GameServer: {e}")
                }));
            }
        }
    }

    hs.app.instance_log.push(InstanceEvent {
        timestamp: chrono::Utc::now(),
        event: "restart".into(),
        zone_instance_id,
        map_name: String::new(),
        game_server: gs_name.unwrap_or_else(|| "unknown".into()),
        trigger: "api".into(),
    });

    Json(serde_json::json!({
        "success": true,
        "message": "GameServer restart initiated. Watcher will clean DB. Fleet will auto-replace."
    }))
}

#[utoipa::path(
    post,
    path = "/api/System/RestartFleet",
    tag = "system",
    summary = "Restart the full fleet",
    description = "Scales the Agones fleet to 0, deletes all map instances + deactivates world servers, clears in-memory tracking, then scales back up to `replicas` (default 2). Disconnects every player — use with caution.",
    request_body(
        description = "{ replicas?: i32 } (default 2)",
        content_type = "application/json"
    ),
    responses(
        (status = 200, description = "{ success: bool, message?: string, error?: string }"),
        (status = 401, description = "ROWS_FLEET_RESTART_TOKEN is configured and the bearer token is missing/invalid"),
        (status = 409, description = "A cooperative fleet restart is active — refused (use the fleet-restart flow)"),
        (status = 503, description = "Could not verify the fleet_restart control row — refused (fail closed)"),
    )
)]
pub async fn restart_fleet(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    // This force-drops every player (scale-to-0 + delete_all_map_instances) — strictly more
    // destructive than /fleet-restart/trigger, so it gets the same gateway-token gate. Conditional
    // (only when ROWS_FLEET_RESTART_TOKEN is configured) rather than fail-closed: this endpoint
    // pre-dates the token and is the documented break-glass; hard-401ing it before the sealed
    // secret ships would brick the existing dashboard flow. Once the secret is deployed, every
    // caller must present it.
    if std::env::var("ROWS_FLEET_RESTART_TOKEN")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
        && !fleet_restart_token_ok(&headers)
    {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "error": "RestartFleet requires the gateway bearer token",
            })),
        )
            .into_response();
    }

    let customer_guid = hs.app.config.customer_guid;
    let desired_replicas = body.get("replicas").and_then(|v| v.as_i64()).unwrap_or(2) as i32;

    // The cooperative fleet-restart flow supersedes this imperative scale-to-0: firing it during
    // an in-flight drain would delete instances out from under the reconcile AND force-drop every
    // player a non-aggressive drain promised not to touch. Refuse while a restart is active; this
    // stays available as a break-glass once the restart row is cleared (active=false).
    match crate::repo::InstanceRepo(&hs.app.db)
        .get_fleet_restart(customer_guid)
        .await
    {
        Ok(Some(fr)) if fr.active => {
            return (
                axum::http::StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "success": false,
                    "error": "A cooperative fleet restart is active — use the fleet-restart flow \
                              (or clear it with active=false) instead of the legacy RestartFleet",
                })),
            )
                .into_response();
        }
        Ok(_) => {}
        Err(e) => {
            // Fail closed: if we can't read the control row we can't prove no drain is in flight.
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "success": false,
                    "error": format!("Cannot verify no cooperative restart is active: {e}"),
                })),
            )
                .into_response();
        }
    }

    if let Some(ref agones) = hs.app.agones {
        tracing::info!("RestartFleet: scaling to 0");
        if let Err(e) = agones.scale_fleet(0).await {
            return Json(serde_json::json!({
                "success": false,
                "error": format!("Failed to scale fleet to 0: {e}")
            }))
            .into_response();
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    let repo = crate::repo::InstanceRepo(&hs.app.db);
    if let Err(e) = repo.delete_all_map_instances(customer_guid).await {
        return Json(serde_json::json!({
            "success": false,
            "error": format!("Failed to clean DB: {e}")
        }))
        .into_response();
    }
    if let Err(e) = repo.deactivate_all_world_servers(customer_guid).await {
        tracing::warn!(error = %e, "Failed to deactivate world servers");
    }

    hs.app.zone_servers.clear();
    hs.app.zone_spinup_locks.clear();

    if let Some(ref agones) = hs.app.agones {
        tracing::info!(replicas = desired_replicas, "RestartFleet: scaling back up");
        if let Err(e) = agones.scale_fleet(desired_replicas).await {
            return Json(serde_json::json!({
                "success": false,
                "error": format!("DB cleaned but failed to scale fleet back up: {e}. Manual scale needed.")
            }))
            .into_response();
        }
    }

    hs.app.instance_log.push(InstanceEvent {
        timestamp: chrono::Utc::now(),
        event: "fleet_restart".into(),
        zone_instance_id: 0,
        map_name: String::new(),
        game_server: "all".into(),
        trigger: "api".into(),
    });

    Json(serde_json::json!({
        "success": true,
        "message": format!("Fleet restarted. Scaled 0 → {desired_replicas}. DB cleaned.")
    }))
    .into_response()
}

#[utoipa::path(
    post,
    path = "/api/System/VerifyDeployment",
    tag = "system",
    summary = "Verify deployment health",
    description = "Polls Agones until `expected_ready` servers report Ready (up to `max_wait_secs`), confirms DB has no stale map instances, runs an allocate/deallocate smoke test, and reports per-check pass/fail.",
    request_body(
        description = "{ expected_ready?: i32 (default 2), max_wait_secs?: i64 (default 90) }",
        content_type = "application/json"
    ),
    responses(
        (status = 200, description = "{ success, elapsed_secs, checks[], summary }"),
    )
)]
pub async fn verify_deployment(
    State(hs): State<HandlerState>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let expected_ready = body
        .get("expected_ready")
        .and_then(|v| v.as_i64())
        .unwrap_or(2) as i32;

    let max_wait_secs = body
        .get("max_wait_secs")
        .and_then(|v| v.as_i64())
        .unwrap_or(90) as u64;

    let customer_guid = hs.app.config.customer_guid;
    let mut checks: Vec<serde_json::Value> = Vec::new();
    let start = std::time::Instant::now();

    let mut fleet_ok = false;
    let mut ready_count = 0i32;
    let mut allocated_count = 0i32;
    let mut gs_details: Vec<serde_json::Value> = Vec::new();

    if let Some(ref agones) = hs.app.agones {
        let poll_interval = std::time::Duration::from_secs(5);
        let timeout = std::time::Duration::from_secs(max_wait_secs);

        while start.elapsed() < timeout {
            match agones.fleet_status().await {
                Ok(status) => {
                    ready_count = status.ready;
                    allocated_count = status.allocated;
                    gs_details = status
                        .game_servers
                        .iter()
                        .map(|gs| {
                            serde_json::json!({
                                "name": gs.name,
                                "state": gs.state,
                                "port": gs.port,
                                "age_seconds": gs.age_seconds,
                            })
                        })
                        .collect();

                    if ready_count >= expected_ready {
                        fleet_ok = true;
                        break;
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Fleet status check failed during verification");
                }
            }
            tokio::time::sleep(poll_interval).await;
        }
    } else {
        checks.push(serde_json::json!({
            "check": "agones",
            "pass": false,
            "error": "Agones client not available"
        }));
    }

    checks.push(serde_json::json!({
        "check": "fleet_ready",
        "pass": fleet_ok,
        "ready": ready_count,
        "allocated": allocated_count,
        "expected": expected_ready,
        "elapsed_secs": start.elapsed().as_secs(),
        "game_servers": gs_details,
    }));

    let repo = crate::repo::InstanceRepo(&hs.app.db);
    let db_clean = match repo.count_active_instances(customer_guid).await {
        Ok(count) => {
            checks.push(serde_json::json!({
                "check": "db_clean",
                "pass": count == 0,
                "active_instances": count,
                "detail": if count == 0 { "No stale instances" } else { "Stale instances found" }
            }));
            count == 0
        }
        Err(e) => {
            checks.push(serde_json::json!({
                "check": "db_clean",
                "pass": false,
                "error": format!("DB query failed: {e}")
            }));
            false
        }
    };

    let pg_ok = !hs.app.db.is_closed();
    let mq_ok = hs.app.mq.is_some();
    let agones_ok = hs.app.agones.is_some();

    checks.push(serde_json::json!({
        "check": "rows_health",
        "pass": pg_ok && agones_ok,
        "postgres": pg_ok,
        "rabbitmq": mq_ok,
        "agones": agones_ok,
    }));

    let mut alloc_ok = false;
    if fleet_ok && db_clean {
        if let Some(ref agones) = hs.app.agones {
            match agones.allocate("__verify__", 0, 0).await {
                Ok(alloc) => {
                    let gs_name = alloc.game_server_name.clone();
                    if let Err(e) = agones.deallocate(&gs_name).await {
                        tracing::warn!(error = %e, gs = %gs_name, "Failed to deallocate test server");
                    }
                    alloc_ok = true;
                    checks.push(serde_json::json!({
                        "check": "allocation_test",
                        "pass": true,
                        "gs_name": gs_name,
                        "address": alloc.address,
                        "port": alloc.port,
                        "detail": "Allocated and deallocated test server successfully"
                    }));
                }
                Err(e) => {
                    checks.push(serde_json::json!({
                        "check": "allocation_test",
                        "pass": false,
                        "error": format!("Allocation failed: {e}")
                    }));
                }
            }
        }
    } else {
        checks.push(serde_json::json!({
            "check": "allocation_test",
            "pass": false,
            "skipped": true,
            "reason": if !fleet_ok { "Fleet not ready" } else { "DB not clean" }
        }));
    }

    let all_pass = fleet_ok && db_clean && pg_ok && agones_ok && alloc_ok;

    hs.app.instance_log.push(InstanceEvent {
        timestamp: chrono::Utc::now(),
        event: if all_pass {
            "verify_pass".into()
        } else {
            "verify_fail".into()
        },
        zone_instance_id: 0,
        map_name: String::new(),
        game_server: format!("ready:{ready_count}"),
        trigger: "api".into(),
    });

    Json(serde_json::json!({
        "success": all_pass,
        "elapsed_secs": start.elapsed().as_secs(),
        "checks": checks,
        "summary": if all_pass {
            format!("All checks passed. {ready_count} servers ready.")
        } else {
            "One or more checks failed. See details.".to_string()
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::{fleet_restart_token_matches, is_plausible_build_version};
    use axum::http::{HeaderMap, HeaderValue, header::AUTHORIZATION};

    fn headers_with_bearer(token: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        h
    }

    /// The gate guards the mutating fleet-restart routes AND (once configured) the destructive
    /// legacy RestartFleet — it must fail closed on every malformed/absent input.
    #[test]
    fn token_gate_fails_closed() {
        // No expected token configured ⇒ reject everyone, even an empty-for-empty "match".
        assert!(!fleet_restart_token_matches("", &HeaderMap::new()));
        assert!(!fleet_restart_token_matches("", &headers_with_bearer("")));
        assert!(!fleet_restart_token_matches(
            "",
            &headers_with_bearer("anything")
        ));
        // Configured token, missing/malformed/wrong credentials.
        assert!(!fleet_restart_token_matches("s3cret", &HeaderMap::new()));
        assert!(!fleet_restart_token_matches(
            "s3cret",
            &headers_with_bearer("")
        ));
        assert!(!fleet_restart_token_matches(
            "s3cret",
            &headers_with_bearer("wrong!")
        ));
        assert!(!fleet_restart_token_matches(
            "s3cret",
            &headers_with_bearer("s3cre")
        )); // prefix
        assert!(!fleet_restart_token_matches(
            "s3cret",
            &headers_with_bearer("s3crets")
        )); // superstring
        let mut no_bearer = HeaderMap::new();
        no_bearer.insert(AUTHORIZATION, HeaderValue::from_static("Basic s3cret"));
        assert!(!fleet_restart_token_matches("s3cret", &no_bearer));
    }

    #[test]
    fn token_gate_accepts_exact_match() {
        assert!(fleet_restart_token_matches(
            "s3cret",
            &headers_with_bearer("s3cret")
        ));
    }

    // The seed defines the launcher's download target (first-write-wins), so the gate must pass
    // real build shapes and block garbage/injection-shaped strings.
    #[test]
    fn plausible_build_versions_pass() {
        for v in ["0.3.46", "0.3.46-rc1", "1.0.0_beta", "dev.1", "20260709"] {
            assert!(is_plausible_build_version(v), "{v} should pass");
        }
    }

    #[test]
    fn implausible_build_versions_rejected() {
        let too_long = "1".repeat(65);
        for v in [
            "",                   // empty
            "latest",             // no digit — a mutable tag, not a version
            "0.3.46; DROP TABLE", // spaces / injection charset
            "../0.3.46",          // path traversal shape
            "0.3.46\n",           // control chars
            too_long.as_str(),    // over length cap
        ] {
            assert!(!is_plausible_build_version(v), "{v:?} should be rejected");
        }
    }
}
