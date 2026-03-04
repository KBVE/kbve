use axum::{Json, Router, extract::Path, http::StatusCode, response::IntoResponse, routing::get};

use super::data;
use super::models::{ItemData, NPCData, SpeedResponse};

async fn list_items() -> Json<Vec<ItemData>> {
    Json(data::all_items().to_vec())
}

async fn get_item(Path(id): Path<String>) -> impl IntoResponse {
    match data::item_by_id(&id) {
        Some(item) => Ok(Json(item.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn list_npcs() -> Json<Vec<NPCData>> {
    Json(data::all_npcs().to_vec())
}

async fn get_npc(Path(id): Path<String>) -> impl IntoResponse {
    match data::npc_by_id(&id) {
        Some(npc) => Ok(Json(npc.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn get_dialogue(Path(id): Path<String>) -> impl IntoResponse {
    match data::dialogue_by_id(&id) {
        Some(dialogue) => Ok(Json(dialogue.clone())),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn speed() -> Json<SpeedResponse> {
    Json(SpeedResponse { time_ms: 0 })
}

pub fn game_router() -> Router {
    Router::new()
        .route("/api/v1/items", get(list_items))
        .route("/api/v1/items/{id}", get(get_item))
        .route("/api/v1/npcs", get(list_npcs))
        .route("/api/v1/npcs/{id}", get(get_npc))
        .route("/api/v1/dialogues/{id}", get(get_dialogue))
        .route("/api/v1/speed", get(speed))
}
