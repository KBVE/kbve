//! Membership / vetting REST surface. The core logic lives in `crate::membership`
//! (shared with the gRPC service); these handlers just adapt it to HTTP JSON.

use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::membership;
use crate::proto::jobboard::{DecisionInput, SubmitApplicationInput};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use std::sync::Arc;
use uuid::Uuid;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/applications", post(submit).get(my_application))
        .route("/admin/applications", get(admin_list))
        .route("/admin/applications/{id}/decision", post(admin_decide))
}

async fn submit(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Json(body): Json<SubmitApplicationInput>,
) -> ApiResult<serde_json::Value> {
    let view = membership::submit(&app, user.user_id, body).await?;
    Ok(Json(serde_json::json!({
        "id": view.id,
        "status": view.status,
        "created_at": view.created_at,
    })))
}

async fn my_application(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    let view = membership::get_mine(&app, user.user_id).await?;
    Ok(Json(serde_json::json!({ "application": view })))
}

async fn admin_list(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
) -> ApiResult<serde_json::Value> {
    let applications = membership::admin_list(&app, user.user_id).await?;
    Ok(Json(serde_json::json!({ "applications": applications })))
}

async fn admin_decide(
    State(app): State<Arc<AppState>>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<DecisionInput>,
) -> ApiResult<serde_json::Value> {
    let new_status = membership::decide(&app, user.user_id, id, body).await?;
    Ok(Json(serde_json::json!({
        "success": true,
        "id": id,
        "status": new_status,
    })))
}
