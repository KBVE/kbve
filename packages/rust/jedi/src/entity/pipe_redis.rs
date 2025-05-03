use crate::proto::jedi::MessageKind;
use crate::error::JediError;
use crate::proto::jedi::{ MessageKind as Mk, JediEnvelope, PayloadFormat };
use crate::entity::envelope::{ try_unwrap_flex, wrap_flex };
use crate::state::temple::TempleState;
use bytes::Bytes;
use fred::prelude::*;
use serde::{ Deserialize, Serialize };
use std::collections::HashMap;
use std::sync::Arc;
use serde_json::Value;
use crate::entity::{ pipe::Pipe, flex::*, bitwise::*, serde_arc_str };

use super::envelope::{ try_unwrap_payload, wrap_hybrid };

// * Pipe Redis Utils

fn extract_redis_bytes(value: fred::types::Value) -> Result<bytes::Bytes, JediError> {
  value.into_bytes().ok_or_else(|| JediError::Internal("Expected Redis Bytes but got None".into()))
}

macro_rules! match_redis_handlers {
  ($kind:expr, $env:expr, $ctx:expr) => {
    {
        if MessageKind::get($kind) {
            handle_redis_get($env, $ctx).await
        } else if MessageKind::set($kind) {
            handle_redis_set($env, $ctx).await
        } else if MessageKind::del($kind) {
            handle_redis_del($env, $ctx).await
        } else {
            Err(JediError::Internal("Unsupported Redis operation".into()))
        }
    }
  };
}

// * Throwaway Structs

#[derive(Debug, Deserialize)]
struct XAddInput {
  #[serde(with = "serde_arc_str")]
  stream: Arc<str>,
  #[serde(with = "serde_arc_str::option")]
  id: Option<Arc<str>>,
  #[serde(with = "serde_arc_str::map_keys")]

  fields: HashMap<Arc<str>, String>,
}

#[derive(Debug, Deserialize)]
struct KeyValueInput {
  #[serde(with = "serde_arc_str")]
  key: Arc<str>,
  #[serde(with = "serde_arc_str::option")]
  value: Option<Arc<str>>,
  ttl: Option<usize>,
}

#[derive(Debug, Serialize)]
struct RedisResult {
  #[serde(with = "serde_arc_str")]
  key: Arc<str>,
  #[serde(with = "serde_arc_str::option")]
  value: Option<Arc<str>>,
}

pub async fn pipe_redis(env: JediEnvelope, ctx: &TempleState) -> Result<JediEnvelope, JediError> {
  env.pipe_async(|e| async move {
    let format = PayloadFormat::try_from(e.format).map_err(|_|
      JediError::Internal("Invalid PayloadFormat".into())
    )?;

    match format {
      PayloadFormat::Flex => handle_redis_flex(e, ctx).await,
      //PayloadFormat::Json => handle_redis_json(e, ctx).await,
      _ => Err(JediError::Internal("Unsupported PayloadFormat".into())),
    }
  }).await
}

pub async fn handle_redis_flex(
  env: JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let kind = MessageKind::try_from(env.kind).map_err(|_|
    JediError::Internal("Invalid MessageKind".into())
  )?;

  match_redis_handlers!(kind.into(), &env, ctx)
}

async fn handle_redis_get(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let key = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();
  let value: bytes::Bytes = extract_redis_bytes(client.get(key.key.as_ref()).await?)?;
  Ok(wrap_hybrid(MessageKind::Get, PayloadFormat::Flex, &value))
}

async fn handle_redis_set(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let entry = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();
  let value = entry.value.ok_or_else(|| JediError::Internal("Missing value for Redis SET".into()))?;
  let expiration = entry.ttl.map(|ttl| Expiration::EX(ttl as i64));
  client.set::<(), _, _>(entry.key.as_ref(), value.as_ref(), expiration, None, false).await?;
  Ok(env.clone())
}

async fn handle_redis_del(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let key = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();
  client.del::<u64, _>(key.key.as_ref()).await?;
  Ok(env.clone())
}
