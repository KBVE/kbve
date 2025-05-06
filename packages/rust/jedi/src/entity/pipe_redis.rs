use crate::proto::jedi::MessageKind;
use crate::error::JediError;
use crate::proto::jedi::{ MessageKind as Mk, JediEnvelope, PayloadFormat };
use crate::entity::envelope::{ try_unwrap_flex, wrap_flex };
use crate::state::temple::TempleState;
use bytes::Bytes;
use fred::prelude::*;
use fred::types::streams::{ MultipleOrderedPairs, XID, XCap, XReadResponse as FredXRead };
use serde::{ Deserialize, Serialize };
use std::collections::HashMap;
use std::sync::Arc;
use std::borrow::Cow;
use serde_json::Value;
use crate::entity::{ pipe::Pipe, flex::*, bitwise::*, serde_arc_str, serde_bytes_map };


use super::envelope::{ try_unwrap_payload, wrap_hybrid };

// * Pipe Redis Utils

fn extract_redis_bytes(value: fred::types::Value) -> Result<bytes::Bytes, JediError> {
  value.into_bytes().ok_or_else(|| JediError::Internal("Expected Redis Bytes but got None".into()))
}

fn to_utf8_cow<'a>(bytes: &'a [u8]) -> Cow<'a, str> {
  match std::str::from_utf8(bytes) {
    Ok(s) => Cow::Borrowed(s),
    Err(_) => Cow::Owned(String::from_utf8_lossy(bytes).into_owned()),
  }
}

macro_rules! match_redis_handlers_flex {
  ($kind:expr, $env:expr, $ctx:expr) => {
    {
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
        } else {
            Err(JediError::Internal("Unsupported Redis operation".into()))
        }
    }
  };
}

macro_rules! match_redis_handlers_json {
  ($kind:expr, $env:expr, $ctx:expr) => {
    {
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

#[derive(Debug, Deserialize)]
struct XReadInput {
  #[serde(with = "serde_arc_str::map_arc_to_arc")]
  streams: HashMap<Arc<str>, Arc<str>>,
  count: Option<u64>,
  block: Option<u64>,
}

// * JSON Specific Structs


#[derive(Debug, Serialize)]
struct StreamEntry<'a> {
  id: Cow<'a, str>,
  fields: HashMap<Cow<'a, str>, Cow<'a, str>>,
}

#[derive(Debug, Serialize)]
struct StreamMessages<'a> {
  stream: Cow<'a, str>,
  entries: Vec<StreamEntry<'a>>,
}



pub async fn pipe_redis(env: JediEnvelope, ctx: &TempleState) -> Result<JediEnvelope, JediError> {
  env.pipe_async(|e| async move {
    let format = PayloadFormat::try_from(e.format).map_err(|_|
      JediError::Internal("Invalid PayloadFormat".into())
    )?;

    match format {
      PayloadFormat::Flex => handle_redis_flex(e, ctx).await,
      PayloadFormat::Json => handle_redis_json(e, ctx).await,
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

  match_redis_handlers_flex!(kind.into(), &env, ctx)
}

async fn handle_redis_get_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let key = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();
  let value: bytes::Bytes = extract_redis_bytes(client.get(key.key.as_ref()).await?)?;
  Ok(wrap_hybrid(MessageKind::Get, PayloadFormat::Flex, &value, Some(env.metadata.clone())))
}

async fn handle_redis_set_flex(
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

async fn handle_redis_del_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let key = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();
  client.del::<u64, _>(key.key.as_ref()).await?;
  Ok(env.clone())
}

async fn handle_redis_xadd_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XAddInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let fields: Vec<(&[u8], &[u8])> = input.fields
    .iter()
    .map(|(k, v)| (k.as_ref().as_bytes(), v.as_bytes()))
    .collect();

  let id_hint = input.id
    .as_deref()
    .map(|s| s.as_ref())
    .unwrap_or("*");

  let result = client.xadd::<Bytes, _, _, _, _>(
    input.stream.as_ref(),
    false,
    None::<()>,
    id_hint,
    fields
  ).await?;

  Ok(wrap_hybrid(MessageKind::Add, PayloadFormat::Flex, &result, Some(env.metadata.clone())))
}

async fn handle_redis_xread_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XReadInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let (keys, ids): (Vec<&str>, Vec<&str>) = input.streams
    .iter()
    .map(|(k, v)| (k.as_ref(), v.as_ref()))
    .unzip();

  let result: FredXRead<Bytes, Bytes, Bytes, Bytes> = client.xread_map(
    Some(input.count.unwrap_or(10)),
    input.block,
    keys,
    ids
  ).await?;

  let bytes = serialize_to_flex_bytes(&result)?;
  Ok(wrap_hybrid(MessageKind::Read, PayloadFormat::Flex, &bytes, Some(env.metadata.clone())))
}

//  * JSON Arm

pub async fn handle_redis_json(
  env: JediEnvelope,
  ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
  let kind = MessageKind::try_from(env.kind)
    .map_err(|_| JediError::Internal("Invalid MessageKind".into()))?;

  match_redis_handlers_json!(kind.into(), &env, ctx)
}

async fn handle_redis_get_json(
  env: &JediEnvelope,
  ctx: &TempleState
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
  Ok(wrap_hybrid(MessageKind::Get, PayloadFormat::Json, &result, Some(env.metadata.clone())))
}

async fn handle_redis_set_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let value = input.value
    .as_ref()
    .ok_or_else(|| JediError::Internal("Missing value for Redis SET".into()))?;

  let expiration = input.ttl.map(|ttl| Expiration::EX(ttl as i64));

  client.set::<(), _, _>(input.key.as_ref(), value.as_ref(), expiration, None, false).await?;

  Ok(env.clone())
}

async fn handle_redis_del_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  client.del::<u64, _>(input.key.as_ref()).await?;

  Ok(env.clone())
}

async fn handle_redis_xadd_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XAddInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let fields: Vec<(&[u8], &[u8])> = input.fields
    .iter()
    .map(|(k, v)| (k.as_ref().as_bytes(), v.as_bytes()))
    .collect();

  let id_hint = input.id
    .as_deref()
    .map(|s| s.as_ref())
    .unwrap_or("*");

  let result = client.xadd::<Bytes, _, _, _, _>(
    input.stream.as_ref(),
    false,
    None::<()>,
    id_hint,
    fields
  ).await?;

  Ok(wrap_hybrid(MessageKind::Add, PayloadFormat::Json, &result, Some(env.metadata.clone())))
}

async fn handle_redis_xread_json(
  env: &JediEnvelope,
  ctx: &TempleState,
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XReadInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let (keys, ids): (Vec<&str>, Vec<&str>) = input
    .streams
    .iter()
    .map(|(k, v)| (k.as_ref(), v.as_ref()))
    .unzip();

  let result: FredXRead<Bytes, Bytes, Bytes, Bytes> = client
    .xread_map(Some(input.count.unwrap_or(10)), input.block, keys, ids)
    .await?;

  let response: Vec<StreamMessages> = result
    .iter()
    .map(|(stream, entries)| StreamMessages {
      stream: to_utf8_cow(stream),
      entries: entries
        .iter()
        .map(|(id, fields)| {
          let fields_map: HashMap<_, _> = fields
            .iter()
            .map(|(k, v)| (to_utf8_cow(k), to_utf8_cow(v)))
            .collect();

          StreamEntry {
            id: to_utf8_cow(id),
            fields: fields_map,
          }
        })
        .collect(),
    })
    .collect();

  Ok(wrap_hybrid(
    MessageKind::Read,
    PayloadFormat::Json,
    &response,
    Some(env.metadata.clone()),
  ))
}