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

    // Agones
    let (agones_ok, agones_err) = match &hs.app.agones {
        Some(agones) => {
            // Check circuit breaker state
            match agones.fleet_status().await {
                Ok(_) => (true, None),
                Err(e) => (false, Some(format!("{e}"))),
            }
        }
        None => (false, Some("Not configured".into())),
    };

    let active_sessions = hs.app.sessions.len();
    let active_instances = hs.app.zone_servers.len();

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
            }
        },
        "active_sessions": active_sessions,
        "active_instances": active_instances
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
