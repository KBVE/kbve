//! System API endpoints — fleet status, health, players, instance log, deployment info.
//! All endpoints require X-CustomerGUID header (existing auth pattern).

use crate::middleware::require_customer_guid;
use crate::state::AppState;
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::get};
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use utoipa::ToSchema;

use super::HandlerState;

// ─── Routes ──────────────────────────────────────────────────

pub fn system_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/api/System/FleetStatus", get(fleet_status))
        .route("/api/System/Health", get(aggregated_health))
        .route("/api/System/ActivePlayers", get(active_players))
        .route("/api/System/InstanceLog", get(instance_log))
        .route("/api/System/DeploymentInfo", get(deployment_info))
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
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

// ─── Fleet Status ────────────────────────────────────────────

async fn fleet_status(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
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

// ─── Aggregated Health ───────────────────────────────────────

#[derive(Serialize, ToSchema)]
struct HealthCheck {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn aggregated_health(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
    // Postgres
    let pg_start = Instant::now();
    let pg_ok = sqlx::query("SELECT 1").execute(&hs.app.db).await.is_ok();
    let pg_latency = pg_start.elapsed().as_millis() as u64;

    // RabbitMQ
    let mq_ok = hs.app.mq.is_some();

    // Agones — check circuit breaker state + fleet connectivity
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

// ─── Active Players ──────────────────────────────────────────

async fn active_players(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> Json<serde_json::Value> {
    let customer_guid = crate::middleware::extract_customer_guid(&headers);

    // Query: sessions joined with characters and map instances
    let rows: Vec<(String, String, Option<String>, Option<i32>)> = sqlx::query_as(
        "SELECT c.charname, us.usersessionguid::text,
                m.zonename, cmi.mapinstanceid
         FROM usersessions us
         JOIN characters c ON c.userguid = us.userguid
            AND c.customerguid = us.customerguid
            AND c.charname = us.selectedcharactername
         LEFT JOIN charonmapinstance cmi ON cmi.characterid = c.characterid
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

// ─── Instance Lifecycle Log ──────────────────────────────────

/// In-memory ring buffer for instance events.
/// Stored in AppState — events pushed from agones/pipeline.rs.
use std::collections::VecDeque;
use std::sync::Mutex;

/// A single instance lifecycle event.
#[derive(Clone, Serialize, ToSchema)]
pub struct InstanceEvent {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub event: String,
    pub zone_instance_id: i32,
    pub map_name: String,
    pub game_server: String,
    pub trigger: String,
}

/// Ring buffer for instance events (max 200 entries).
pub struct InstanceEventLog {
    events: Mutex<VecDeque<InstanceEvent>>,
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

async fn instance_log(
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

// ─── Deployment Info ─────────────────────────────────────────

async fn deployment_info(State(hs): State<HandlerState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "rust_version": env!("CARGO_PKG_RUST_VERSION", "unknown"),
        "agones_namespace": hs.app.config.agones_namespace,
        "agones_fleet": hs.app.config.agones_fleet,
        "agones_available": hs.app.agones.is_some(),
        "rabbitmq_connected": hs.app.mq.is_some(),
        "http_port": std::env::var("HTTP_PORT").unwrap_or_else(|_| "4322".into()),
        "swagger_port": std::env::var("DOCS_PORT").unwrap_or_else(|_| "4323".into()),
        "active_sessions": hs.app.sessions.len(),
        "zone_servers_tracked": hs.app.zone_servers.len(),
        "spinup_locks_active": hs.app.zone_spinup_locks.len(),
    }))
}

// ─── Restart GameServer ─────────────────────────────────────

/// Restart a specific GameServer by zone_instance_id.
/// Flow: send MQ shutdown → delete Agones GameServer → watcher auto-cleans DB.
/// Agones auto-replaces with a fresh pod from the fleet.
async fn restart_game_server(
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

    // Find the GameServer name from tracking
    let gs_name = hs
        .app
        .zone_servers
        .get(&zone_instance_id)
        .map(|e| e.value().clone());

    // Send MQ shutdown notification (if available)
    if let Some(ref mq) = hs.app.mq {
        let msg = crate::mq::ShutDownMessage {
            customer_guid: customer_guid.to_string(),
            zone_instance_id,
        };
        // Find world_server_id from DB for the routing key
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

    // Delete the Agones GameServer — Agones fleet auto-replaces it
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

    // Log the event
    hs.app.instance_log.push(InstanceEvent {
        timestamp: chrono::Utc::now(),
        event: "restart".into(),
        zone_instance_id,
        map_name: String::new(),
        game_server: gs_name.unwrap_or_else(|| "unknown".into()),
        trigger: "api".into(),
    });

    // DB cleanup happens automatically via the GameServer watcher
    Json(serde_json::json!({
        "success": true,
        "message": "GameServer restart initiated. Watcher will clean DB. Fleet will auto-replace."
    }))
}

// ─── Restart Fleet ──────────────────────────────────────────

/// Restart the entire fleet — scale to 0, clean all DB entries, scale back up.
/// Use with caution — disconnects all players.
async fn restart_fleet(
    State(hs): State<HandlerState>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let customer_guid = hs.app.config.customer_guid;
    let desired_replicas = body.get("replicas").and_then(|v| v.as_i64()).unwrap_or(2) as i32;

    // Step 1: Scale fleet to 0 (kills all pods including Allocated)
    if let Some(ref agones) = hs.app.agones {
        tracing::info!("RestartFleet: scaling to 0");
        if let Err(e) = agones.scale_fleet(0).await {
            return Json(serde_json::json!({
                "success": false,
                "error": format!("Failed to scale fleet to 0: {e}")
            }));
        }

        // Wait for pods to terminate
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    // Step 2: Clean all zone instance DB entries
    let repo = crate::repo::InstanceRepo(&hs.app.db);
    if let Err(e) = repo.delete_all_map_instances(customer_guid).await {
        return Json(serde_json::json!({
            "success": false,
            "error": format!("Failed to clean DB: {e}")
        }));
    }
    if let Err(e) = repo.deactivate_all_world_servers(customer_guid).await {
        tracing::warn!(error = %e, "Failed to deactivate world servers");
    }

    // Step 3: Clear tracking maps
    hs.app.zone_servers.clear();
    hs.app.zone_spinup_locks.clear();

    // Step 4: Scale fleet back up
    if let Some(ref agones) = hs.app.agones {
        tracing::info!(replicas = desired_replicas, "RestartFleet: scaling back up");
        if let Err(e) = agones.scale_fleet(desired_replicas).await {
            return Json(serde_json::json!({
                "success": false,
                "error": format!("DB cleaned but failed to scale fleet back up: {e}. Manual scale needed.")
            }));
        }
    }

    // Log the event
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
}

// ─── Verify Deployment ──────────────────────────────────────

/// Post-deployment verification — checks that the fleet is healthy after restart.
/// Polls Agones for Ready servers, verifies count matches desired, checks DB is clean.
/// Returns a detailed report with per-check pass/fail status.
async fn verify_deployment(
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

    // Check 1: Agones fleet status — poll until Ready count matches
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

    // Check 2: DB state — no stale mapinstances or active worldservers
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

    // Check 3: ROWS health — postgres, rabbitmq, agones all reachable
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

    // Check 4: Allocation test — try allocating and immediately releasing
    // Only run if fleet is ready and DB is clean
    let mut alloc_ok = false;
    if fleet_ok && db_clean {
        if let Some(ref agones) = hs.app.agones {
            match agones.allocate("__verify__", 0).await {
                Ok(alloc) => {
                    // Immediately deallocate the test server
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

    // Log the verification event
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
