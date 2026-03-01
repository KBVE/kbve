use crate::error::JediError;
use crate::pipe_redis::redis_types::XReadStreamInput;
use crate::pipe_redis::{Field, RedisStream};
use crate::proto::jedi::{JediEnvelope, MessageKind, PayloadFormat};
use crate::state::temple::TempleState;
use bytes::Bytes;
use bytes_utils::Str;

use crate::entity::pipe::Pipe;
use fred::prelude::*;
use std::collections::HashMap;
use std::sync::Arc;

use crate::entity::envelope::{try_unwrap_payload, wrap_hybrid};

use super::extract_redis_bytes;
use super::redis_types::{KeyValueInput, RedisResult, StreamEntry, StreamMessages, XAddInput};

macro_rules! match_redis_handlers_flex {
    ($kind:expr, $env:expr, $ctx:expr) => {{
        if MessageKind::get($kind) {
            handle_redis_get_flex($env, $ctx).await
        } else if MessageKind::set($kind) {
            handle_redis_set_flex($env, $ctx).await
        } else if MessageKind::del($kind) {
            handle_redis_del_flex($env, $ctx).await
        } else if MessageKind::xadd($kind) {
            handle_redis_xadd_flex($env, $ctx).await
        } else if MessageKind::xread($kind) {
            handle_redis_xread_flex($env, $ctx).await
        } else if MessageKind::watch($kind) {
            handle_redis_watch_flex($env, $ctx).await
        } else if MessageKind::unwatch($kind) {
            handle_redis_unwatch_flex($env, $ctx).await
        } else if MessageKind::publish($kind) {
            handle_redis_pub_flex($env, $ctx).await
        } else if MessageKind::subscribe($kind) {
            handle_redis_sub_flex($env, $ctx).await
        } else {
            Err(JediError::Internal("Unsupported Redis operation".into()))
        }
    }};
}

macro_rules! match_redis_handlers_json {
    ($kind:expr, $env:expr, $ctx:expr) => {{
        if MessageKind::get($kind) {
            handle_redis_get_json($env, $ctx).await
        } else if MessageKind::set($kind) {
            handle_redis_set_json($env, $ctx).await
        } else if MessageKind::del($kind) {
            handle_redis_del_json($env, $ctx).await
        } else if MessageKind::xadd($kind) {
            handle_redis_xadd_json($env, $ctx).await
        } else if MessageKind::xread($kind) {
            handle_redis_xread_json($env, $ctx).await
        } else if MessageKind::watch($kind) {
            handle_redis_watch_json($env, $ctx).await
        } else if MessageKind::unwatch($kind) {
            handle_redis_unwatch_json($env, $ctx).await
        } else if MessageKind::publish($kind) {
            handle_redis_pub_json($env, $ctx).await
        } else if MessageKind::subscribe($kind) {
            handle_redis_sub_json($env, $ctx).await
        } else {
            Err(JediError::Internal("Unsupported Redis operation".into()))
        }
    }};
}

pub async fn pipe_redis(env: JediEnvelope, ctx: &TempleState) -> Result<JediEnvelope, JediError> {
    env.pipe_async(|e| async move {
        let format = PayloadFormat::try_from(e.format)
            .map_err(|_| JediError::Internal("Invalid PayloadFormat".into()))?;

        match format {
            PayloadFormat::Flex => handle_redis_flex(e, ctx).await,
            PayloadFormat::Json => handle_redis_json(e, ctx).await,
            _ => Err(JediError::Internal("Unsupported PayloadFormat".into())),
        }
    })
    .await
}

pub async fn handle_redis_flex(
    env: JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let kind = env.kind;

    if !MessageKind::try_from_valid(kind) {
        tracing::warn!(
            "Unhandled or invalid MessageKind in Redis Flex handler: {}",
            kind
        );
    }

    // * We could fail it out if the bitmap does not contain "redis" but it should have been handled before it got here.

    match_redis_handlers_flex!(kind, &env, ctx)
}

async fn handle_redis_get_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let key = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();
    let value: bytes::Bytes = extract_redis_bytes(client.get(key.key.as_ref()).await?)?;
    Ok(wrap_hybrid(
        MessageKind::Get,
        PayloadFormat::Flex,
        &value,
        Some(env.metadata.clone()),
    ))
}

async fn handle_redis_set_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let entry = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();
    let value = entry
        .value
        .ok_or_else(|| JediError::Internal("Missing value for Redis SET".into()))?;
    let expiration = entry.ttl.map(|ttl| Expiration::EX(ttl as i64));
    client
        .set::<(), _, _>(entry.key.as_ref(), value.as_ref(), expiration, None, false)
        .await?;
    Ok(env.clone())
}

async fn handle_redis_del_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let key = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();
    client.del::<u64, _>(key.key.as_ref()).await?;
    Ok(env.clone())
}

async fn handle_redis_xadd_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<XAddInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    let fields: Vec<(&[u8], &[u8])> = input
        .fields
        .iter()
        .map(|(k, v)| (k.as_ref().as_bytes(), v.as_bytes()))
        .collect();

    let id_hint = input.id.as_deref().unwrap_or("*");

    let result = client
        .xadd::<Bytes, _, _, _, _>(input.stream.as_ref(), false, None::<()>, id_hint, fields)
        .await?;

    Ok(wrap_hybrid(
        MessageKind::Add as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
        PayloadFormat::Flex,
        &result,
        Some(env.metadata.clone()),
    ))
}

pub async fn handle_redis_xread_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<XReadStreamInput>(env).map_err(|e| {
        tracing::error!("Deserialization error: {:?}", e);
        JediError::Parse(e.to_string())
    })?;

    let (keys, ids): (Vec<Str>, Vec<Str>) = input
        .streams
        .iter()
        .filter_map(|s| {
            if s.stream.is_empty() || s.id.is_empty() {
                return None;
            }
            if !s
                .id
                .chars()
                .all(|c| c.is_ascii_digit() || c == '-' || c == '$')
            {
                return None;
            }
            Some((Str::from(s.stream.as_ref()), Str::from(s.id.as_ref())))
        })
        .unzip();

    if keys.is_empty() {
        tracing::error!("No valid streams provided");
        return Err(JediError::Internal("No valid streams provided".into()));
    }

    tracing::debug!(
        "XREAD inputs: keys={:?}, ids={:?}, count={:?}, block={:?}",
        keys,
        ids,
        input.count,
        input.block
    );

    let client = ctx.redis_pool.next().clone();
    let raw_result: fred::types::streams::XReadResponse<Str, Str, Str, Str> = client
        .xread_map(Some(input.count.unwrap_or(10)), input.block, keys, ids)
        .await
        .map_err(|e| {
            tracing::error!("XREAD error: {:?}", e);
            JediError::Database(format!("Redis error: {}", e).into())
        })?;

    let redis_stream = RedisStream {
        streams: raw_result
            .into_iter()
            .map(|(stream_name, entries)| StreamMessages {
                stream: stream_name.to_string(),
                entries: entries
                    .into_iter()
                    .map(|(id, fields)| StreamEntry {
                        id: id.to_string(),
                        fields: fields
                            .into_iter()
                            .map(|(k, v)| Field {
                                key: k.to_string(),
                                value: v.as_bytes().to_vec(),
                            })
                            .collect(),
                    })
                    .collect(),
            })
            .collect(),
    };

    let bytes = crate::entity::flex::serialize_to_flex_bytes(&redis_stream)?;

    Ok(wrap_hybrid(
        MessageKind::Read as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
        PayloadFormat::Flex,
        &bytes,
        Some(env.metadata.clone()),
    ))
}

async fn handle_redis_watch_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let metadata = env.metadata_or_empty();

    let connection_id = crate::entity::ulid::extract_connection_id_bytes(&metadata)
        .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

    if ctx.watch_manager.is_watching(&connection_id, &*key) {
        return Err(JediError::BadRequest("Already watching this key".into()));
    }

    ctx.watch_manager
        .watch(connection_id, key.clone(), PayloadFormat::Flex)?;
    Ok(env.clone())
}

async fn handle_redis_unwatch_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let metadata = env.metadata_or_empty();

    let conn_id = crate::entity::ulid::extract_connection_id_bytes(&metadata)
        .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

    ctx.watch_manager
        .unwatch(&conn_id, key, PayloadFormat::Flex)?;
    Ok(env.clone())
}

async fn handle_redis_pub_flex(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let value = input
        .value
        .ok_or_else(|| JediError::BadRequest("Missing value for PUB".into()))?;

    let client = ctx.redis_pool.next().clone();
    let channel = format!("key:{}", key);

    client
        .publish::<i64, _, _>(&channel, value.as_ref())
        .await?;
    Ok(env.clone())
}

async fn handle_redis_sub_flex(
    env: &JediEnvelope,
    _ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    Ok(env.clone())
}

//  * JSON Arm

pub async fn handle_redis_json(
    env: JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let kind = env.kind;
    if !MessageKind::try_from_valid(kind) {
        tracing::warn!(
            "Unhandled or invalid MessageKind in Redis JSON handler: {}",
            kind
        );
    }

    match_redis_handlers_json!(kind, &env, ctx)
}

async fn handle_redis_get_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    let value_bytes = client.get(input.key.as_ref()).await?;
    let bytes = extract_redis_bytes(value_bytes)?;
    let value = Some(Arc::from(String::from_utf8_lossy(&bytes).into_owned()));
    let result = RedisResult {
        key: input.key,
        value,
    };
    Ok(wrap_hybrid(
        MessageKind::Get,
        PayloadFormat::Json,
        &result,
        Some(env.metadata.clone()),
    ))
}

async fn handle_redis_set_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    let value = input
        .value
        .as_ref()
        .ok_or_else(|| JediError::Internal("Missing value for Redis SET".into()))?;

    let expiration = input.ttl.map(|ttl| Expiration::EX(ttl as i64));

    client
        .set::<(), _, _>(input.key.as_ref(), value.as_ref(), expiration, None, false)
        .await?;

    Ok(env.clone())
}

async fn handle_redis_del_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    client.del::<u64, _>(input.key.as_ref()).await?;

    Ok(env.clone())
}

async fn handle_redis_xadd_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<XAddInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    let fields: Vec<(&[u8], &[u8])> = input
        .fields
        .iter()
        .map(|(k, v)| (k.as_ref().as_bytes(), v.as_bytes()))
        .collect();

    let id_hint = input.id.as_deref().unwrap_or("*");

    let result = client
        .xadd::<Bytes, _, _, _, _>(input.stream.as_ref(), false, None::<()>, id_hint, fields)
        .await?;

    Ok(wrap_hybrid(
        MessageKind::Add as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
        PayloadFormat::Json,
        &result,
        Some(env.metadata.clone()),
    ))
}

pub async fn handle_redis_xread_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<XReadStreamInput>(env)?;
    let client = ctx.redis_pool.next().clone();

    let (keys, ids): (Vec<String>, Vec<String>) = input
        .streams
        .iter()
        .map(|s| (s.stream.to_string(), s.id.to_string()))
        .unzip();

    #[allow(clippy::type_complexity)]
    let raw_result: HashMap<String, Vec<(String, HashMap<String, Vec<u8>>)>> = client
        .xread_map(Some(input.count.unwrap_or(10)), input.block, keys, ids)
        .await
        .map_err(|e| {
            tracing::error!("XREAD error: {:?}", e);
            JediError::Database(format!("Redis error: {}", e).into())
        })?;

    let response: Vec<serde_json::Value> = raw_result
        .into_iter()
        .map(|(stream, entries)| {
            let entries_json: Vec<serde_json::Value> = entries
                .into_iter()
                .map(|(id, fields)| {
                    let fields_json: Vec<serde_json::Value> = fields
                        .into_iter()
                        .map(|(k, v)| {
                            serde_json::json!({
                                "key": k,
                                "value": String::from_utf8_lossy(&v).into_owned()
                            })
                        })
                        .collect();

                    serde_json::json!({
                        "id": id,
                        "fields": fields_json
                    })
                })
                .collect();

            serde_json::json!({
                "stream": stream,
                "entries": entries_json
            })
        })
        .collect();

    Ok(wrap_hybrid(
        MessageKind::Read as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
        PayloadFormat::Json,
        &response,
        Some(env.metadata.clone()),
    ))
}

async fn handle_redis_watch_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let metadata = env.metadata_or_empty();

    let conn_id = crate::entity::ulid::extract_connection_id_json(&metadata)
        .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

    if ctx.watch_manager.is_watching(&conn_id, &*key) {
        return Err(JediError::BadRequest("Already watching this key".into()));
    }

    ctx.watch_manager
        .watch(conn_id, key.clone(), PayloadFormat::Json)?;
    Ok(env.clone())
}

async fn handle_redis_unwatch_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let metadata = env.metadata_or_empty();

    let conn_id = crate::entity::ulid::extract_connection_id_json(&metadata)
        .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

    ctx.watch_manager
        .unwatch(&conn_id, key, PayloadFormat::Json)?;
    Ok(env.clone())
}

async fn handle_redis_pub_json(
    env: &JediEnvelope,
    ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<KeyValueInput>(env)?;
    let key = input.key;
    let value = input
        .value
        .ok_or_else(|| JediError::BadRequest("Missing value for PUB".into()))?;

    let client = ctx.redis_pool.next().clone();
    let channel = format!("key:{}", key);

    client
        .publish::<i64, _, _>(&channel, value.as_ref())
        .await?;
    Ok(env.clone())
}

async fn handle_redis_sub_json(
    env: &JediEnvelope,
    _ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
    // SUB is managed by pubsub listener + WatchManager, so just return OK
    Ok(env.clone())
}
