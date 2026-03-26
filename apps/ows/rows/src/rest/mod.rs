mod abilities;
mod auth;
mod characters;
mod global_data;
mod instances;
mod management;
mod zones;

use crate::models::HealthResponse;
use crate::service::OWSService;
use crate::state::AppState;
use axum::{Json, Router, extract::State, response::IntoResponse, routing::get};
use std::sync::Arc;

/// Shared handler state — holds both AppState (for middleware) and OWSService (for logic).
#[derive(Clone)]
pub struct HandlerState {
    pub app: Arc<AppState>,
    pub svc: Arc<OWSService>,
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

    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/ready", get(readiness).with_state(hs.clone()))
        .merge(public)
        .merge(instance)
        .merge(character)
        .merge(global)
        .merge(abilities)
        .merge(zones)
        .merge(management)
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
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        service: "rows",
    })
}

/// Deep readiness check — probes DB pool. Returns 503 if database is unavailable.
async fn readiness(State(hs): State<HandlerState>) -> axum::response::Response {
    let db_ok = sqlx::query("SELECT 1").execute(&hs.app.db).await.is_ok();
    let mq_ok = hs.app.mq.is_some();
    let agones_ok = hs.app.agones.is_some();

    let all_ok = db_ok; // MQ and Agones are optional
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
