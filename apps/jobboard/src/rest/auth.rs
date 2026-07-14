use crate::auth::AuthUser;
use crate::error::{ApiResult, pg_err};
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/auth/me", get(me))
}

async fn me(State(app): State<Arc<AppState>>, user: AuthUser) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;

    let has_talent = conn
        .query_opt(
            "SELECT 1 FROM jobboard.talent_profiles WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .is_some();

    let has_client = conn
        .query_opt(
            "SELECT 1 FROM jobboard.client_profiles WHERE user_id = $1",
            &[&user.user_id],
        )
        .await
        .map_err(pg_err)?
        .is_some();

    Ok(Json(serde_json::json!({
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "talent_profile": has_talent,
        "client_profile": has_client,
    })))
}
