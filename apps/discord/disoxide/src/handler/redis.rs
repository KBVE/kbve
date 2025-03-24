use axum::{
    extract::{State, Json},
    response::IntoResponse,
};


use axum::Router;
use axum::routing::post;

use jedi::wrapper::RedisEnvelope;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::entity::state::GlobalState;

#[derive(Deserialize)]
pub struct RedisSetPayload {
    pub key: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct RedisGetPayload {
    pub key: String,
}

#[derive(Serialize)]
pub struct RedisResponse {
    pub key: String,
    pub value: Option<String>,
}

pub async fn redis_set(
    State(state): State<Arc<GlobalState>>,
    Json(payload): Json<RedisSetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::set(payload.key.clone(), payload.value.clone());
    match state.temple.send_redis(cmd).await {
        Ok(_) => Json(true).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn redis_get(
    State(state): State<Arc<GlobalState>>,
    Json(payload): Json<RedisGetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::get(payload.key.clone());
    match state.temple.send_redis(cmd).await {
        Ok(resp) => {
            let value = resp.value;
            Json(RedisResponse {
                key: payload.key,
                value: Some(value),
            })
            .into_response()
        }
        Err(_) => Json(RedisResponse {
            key: payload.key,
            value: None,
        })
        .into_response(),
    }
}

pub async fn redis_del(
    State(state): State<Arc<GlobalState>>,
    Json(payload): Json<RedisGetPayload>,
) -> impl IntoResponse {
    let cmd = RedisEnvelope::del(payload.key.clone());
    match state.temple.send_redis(cmd).await {
        Ok(_) => Json(true).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}


pub fn redis_router(state: Arc<GlobalState>) -> Router<Arc<GlobalState>> {
    Router::new()
        .route("/redis/set", post(redis_set))
        .route("/redis/get", post(redis_get))
        .route("/redis/del", post(redis_del))
        .with_state(state)
}
