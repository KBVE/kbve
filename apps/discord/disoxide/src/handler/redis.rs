use axum::{
    extract::{State, Json},
    response::IntoResponse,
};


use axum::Router;
use axum::routing::post;

use jedi::{wrapper::{redis_key_update_from_get, RedisEnvelope}};
use std::sync::Arc;
use crate::entity::state::{SharedState};

use jedi::proto::redis::{SetCommand as RedisSetPayload, GetCommand as RedisGetPayload, RedisResponse, RedisKeyUpdate};



pub async fn redis_set(
    State(state): State<SharedState>,
    Json(payload): Json<RedisSetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::set(payload.key.clone(), payload.value.clone());
    match state.temple.send_redis(cmd).await {
        Ok(_) => Json(true).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}


pub async fn redis_get(
    State(state): State<SharedState>,
    Json(payload): Json<RedisGetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::get(payload.key.clone());

    match state.temple.send_redis(cmd).await {
        Ok(resp) => {
            let update = redis_key_update_from_get(payload.key, Some(resp.value));
            Json(update).into_response()
        }
        Err(_) => {
            let update = redis_key_update_from_get(payload.key, Option::<String>::None);
            Json(update).into_response()
        }
    }
}

pub async fn redis_del(
    State(state): State<SharedState>,
    Json(payload): Json<RedisGetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::del(payload.key.clone());
    match state.temple.send_redis(cmd).await {
        Ok(_) => Json(true).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}


pub fn redis_router() -> Router<SharedState> {
    Router::new()
        .route("/redis/set", post(redis_set))
        .route("/redis/get", post(redis_get))
        .route("/redis/del", post(redis_del))
}
