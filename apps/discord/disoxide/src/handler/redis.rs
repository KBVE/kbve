use axum::{
    extract::{State, Json},
    response::IntoResponse,
};
use axum::Router;
use axum::routing::post;

use axum::http::StatusCode;
use jedi::{envelope::try_unwrap_payload, wrapper::{redis_key_update_from_get, RedisEnvelope}};
use jedi::entity::envelope::wrap_hybrid;
use jedi::proto::jedi::{MessageKind, PayloadFormat, JediEnvelope};
use serde::{Deserialize, Serialize};

use std::{borrow::Cow, sync::Arc};

use bytes::Bytes;

use crate::entity::state::{SharedState};

//use jedi::proto::redis::{SetCommand as RedisSetPayload, GetCommand as RedisGetPayload, RedisResponse, RedisKeyUpdate};

#[derive(Serialize, Deserialize)]
pub struct RedisPayload<'a> {
    pub key: Cow<'a, str>,
    #[serde(default)]
    pub value: Option<Cow<'a, str>>,
    #[serde(default)]
    pub ttl: Option<usize>,
}


fn wrap_redis_json_command_with_meta<T: serde::Serialize>(
    kind: i32,
    payload: &T,
    metadata: Option<Bytes>,
) -> JediEnvelope {
    wrap_hybrid(kind, PayloadFormat::Json, payload, metadata)
}


pub async fn redis_set(
    State(state): State<SharedState>,
    Json(payload): Json<RedisPayload<'_>>,
) -> impl IntoResponse {
    if payload.value.is_none() {
        return (axum::http::StatusCode::BAD_REQUEST, "Missing value for SET").into_response();
    }

    let kind = MessageKind::Redis as i32 | MessageKind::Set as i32;
    let envelope = wrap_redis_json_command_with_meta(kind, &payload, None);

    match state.temple.send_envelope(envelope).await {
        Ok(_) => Json(true).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}


pub async fn redis_get(
    State(state): State<SharedState>,
    Json(payload): Json<RedisPayload<'_>>,
) -> impl IntoResponse {
    let kind = MessageKind::Redis as i32 | MessageKind::Get as i32;
    let envelope = wrap_hybrid(kind, PayloadFormat::Json, &payload, None);

    match state.temple.send_envelope(envelope).await {
        Ok(env) => {
            match try_unwrap_payload::<RedisPayload>(&env) {
                Ok(result) => Json(result).into_response(),
                Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn redis_del(
    State(state): State<SharedState>,
    Json(payload): Json<RedisPayload<'_>>,
) -> impl IntoResponse {
    let kind = MessageKind::Redis as i32 | MessageKind::Del as i32;
    let envelope = wrap_redis_json_command_with_meta(kind, &payload, None);

    match state.temple.send_envelope(envelope).await {
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
