use crate::error::{ApiError, ApiResult, pg_err};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/verticals", get(list_verticals))
        .route("/verticals/{id}/taxonomy", get(vertical_taxonomy))
}

async fn list_verticals(State(app): State<Arc<AppState>>) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;
    let rows = conn
        .query(
            "SELECT id, slug, label, description, status, sort_order
             FROM jobboard.verticals WHERE status > 0 ORDER BY sort_order, label",
            &[],
        )
        .await
        .map_err(pg_err)?;

    let verticals: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<_, i64>(0),
                "slug": r.get::<_, String>(1),
                "label": r.get::<_, String>(2),
                "description": r.get::<_, String>(3),
                "status": r.get::<_, i32>(4),
                "sort_order": r.get::<_, i32>(5),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "verticals": verticals })))
}

async fn vertical_taxonomy(
    State(app): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<serde_json::Value> {
    let conn = app.db.read().await?;
    let exists = conn
        .query_opt("SELECT 1 FROM jobboard.verticals WHERE id = $1", &[&id])
        .await
        .map_err(pg_err)?;
    if exists.is_none() {
        return Err(ApiError::NotFound(format!("vertical {id}")));
    }

    let rows = conn
        .query(
            "SELECT id, kind, name, label, status
             FROM jobboard.taxonomy WHERE vertical_id = $1 AND status > 0
             ORDER BY kind, label",
            &[&id],
        )
        .await
        .map_err(pg_err)?;

    let kind_label = |k: i32| match k {
        1 => "discipline",
        2 => "tool",
        3 => "skill",
        _ => "other",
    };

    let items: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let kind: i32 = r.get(1);
            serde_json::json!({
                "id": r.get::<_, i64>(0),
                "kind": kind,
                "kind_label": kind_label(kind),
                "name": r.get::<_, String>(2),
                "label": r.get::<_, String>(3),
                "status": r.get::<_, i32>(4),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "vertical_id": id,
        "taxonomy": items,
    })))
}
