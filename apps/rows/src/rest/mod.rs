pub(crate) mod abilities;
pub(crate) mod auth;
pub(crate) mod characters;
pub(crate) mod global_data;
pub(crate) mod instances;
pub(crate) mod management;
pub mod system;
pub(crate) mod zones;

use crate::models::HealthResponse;
use crate::service::OWSService;
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    routing::get,
};
use std::sync::Arc;

/// Bundles `AppState` (for middleware) and `OWSService` (for handlers) into one extractor.
#[derive(Clone)]
pub struct HandlerState {
    pub app: Arc<AppState>,
    pub svc: Arc<OWSService>,
}

/// Gates server-to-server write routes: requires a valid `x-service-key` (validated against
/// `SUPABASE_SERVICE_KEY_HASH`). Player JWTs and session GUIDs do NOT pass here — these endpoints
/// mutate world/character state and are only for trusted callers like the UE dedicated server.
pub async fn require_service_key(
    State(hs): State<HandlerState>,
    req: Request,
    next: Next,
) -> Response {
    let authorized = crate::middleware::extract_service_key(req.headers())
        .filter(|_| hs.app.supabase.service_key_enabled())
        .map(|key| crate::supabase::validate_service_key(&key, &hs.app.supabase).is_ok())
        .unwrap_or(false);

    if authorized {
        next.run(req).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "errorMessage": "Valid service key required for this endpoint"
            })),
        )
            .into_response()
    }
}

pub fn router(app: Arc<AppState>, svc: Arc<OWSService>) -> Router {
    let hs = HandlerState { app, svc };
    let public = auth::public_api_routes(hs.clone());
    let instance = instances::instance_mgmt_routes(hs.clone());
    let character = characters::character_persistence_routes(hs.clone());
    let global = global_data::global_data_routes(hs.clone());
    let abilities = abilities::abilities_routes(hs.clone());
    let zones = zones::zones_routes(hs.clone());
    let management = management::management_routes(hs.clone());
    let system = system::system_routes(hs.clone());
    let fleet_restart = system::fleet_restart_routes(hs.clone());

    Router::new()
        .route("/", get(root))
        .route("/health", get(health).with_state(hs.clone()))
        .route("/ready", get(readiness).with_state(hs.clone()))
        .merge(public)
        .merge(instance)
        .merge(character)
        .merge(global)
        .merge(abilities)
        .merge(zones)
        .merge(management)
        .merge(system)
        .merge(fleet_restart)
}

#[utoipa::path(get, path = "/", tag = "health",
    responses((status = 200, description = "Service info"))
)]
pub async fn root() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "rows",
        "status": "ok"
    }))
}

#[utoipa::path(get, path = "/health", tag = "health",
    responses((status = 200, description = "Health check", body = HealthResponse))
)]
pub async fn health(State(hs): State<HandlerState>) -> Json<HealthResponse> {
    // Authoritative version from the deploy_state SNAPSHOT (refreshed by jobs::deploy_state_refresh
    // every 30s). /health is the liveness-probe path (timeoutSeconds: 3) and MUST stay DB-free —
    // a synchronous read here would turn a Postgres latency spike into a kubelet restart storm.
    // Degrades to the in-memory ReportBuild value when the snapshot is empty (table dark / no row);
    // `deploy_healthy:true` is the degrade default.
    let deploy = hs.app.deploy_state_cache.read().unwrap().clone();
    let (unreal_version, pending_version, deploy_healthy, failing_version) = match deploy {
        Some(ds) => {
            let healthy = ds.health != "unhealthy";
            let failing = (!healthy).then(|| ds.target_version.clone());
            if ds.rolled {
                (Some(ds.target_version), None, healthy, failing)
            } else {
                // Update pending: the served version isn't in deploy_state (single row), so fall
                // back to the in-memory GameServer-reported value for the served build.
                let served = hs.app.server_build_version.read().unwrap().clone();
                (served, Some(ds.target_version), healthy, failing)
            }
        }
        None => (
            hs.app.server_build_version.read().unwrap().clone(),
            None,
            true,
            None,
        ),
    };

    Json(HealthResponse {
        status: "healthy",
        service: "rows",
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: hs.app.started_at.elapsed().as_secs(),
        active_sessions: hs.app.sessions.len(),
        active_instances: hs.app.zone_servers.len(),
        unreal_version,
        pending_version,
        deploy_healthy,
        failing_version,
    })
}

/// When the pod is draining, report NotReady immediately so the Service deregisters it
/// before shutdown — no new traffic to a dying pod. Returns `None` when not draining.
fn drain_gate(draining: &std::sync::atomic::AtomicBool) -> Option<Response> {
    if draining.load(std::sync::atomic::Ordering::SeqCst) {
        let body = serde_json::json!({ "status": "draining", "service": "rows" });
        Some((StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response())
    } else {
        None
    }
}

/// Probes the DB pool; MQ/Agones are optional so they don't gate readiness. 503 when DB is down.
#[utoipa::path(get, path = "/ready", tag = "health",
    responses(
        (status = 200, description = "Ready — DB reachable"),
        (status = 503, description = "Draining or DB unreachable"),
    )
)]
pub(crate) async fn readiness(State(hs): State<HandlerState>) -> axum::response::Response {
    if let Some(resp) = drain_gate(&hs.app.draining) {
        return resp;
    }
    let db_ok = sqlx::query("SELECT 1").execute(&hs.app.db).await.is_ok();
    let mq_ok = hs.app.mq.is_some();
    let agones_ok = hs.app.agones.is_some();

    let all_ok = db_ok;
    let status = if all_ok { "ready" } else { "degraded" };
    let http_status = if all_ok {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };

    let body = serde_json::json!({
        "status": status,
        "service": "rows",
        "database": db_ok,
        "rabbitmq": mq_ok,
        "agones": agones_ok,
        "sessions_cached": hs.app.sessions.len(),
        "zones_tracked": hs.app.zone_servers.len(),
        "spinup_locks": hs.app.zone_spinup_locks.len(),
    });

    (http_status, Json(body)).into_response()
}

#[cfg(test)]
mod drain_tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn drain_gate_blocks_when_draining() {
        let draining = AtomicBool::new(true);
        let resp = drain_gate(&draining);
        assert!(resp.is_some());
        assert_eq!(resp.unwrap().status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn drain_gate_passes_when_not_draining() {
        let draining = AtomicBool::new(false);
        assert!(drain_gate(&draining).is_none());
    }
}
