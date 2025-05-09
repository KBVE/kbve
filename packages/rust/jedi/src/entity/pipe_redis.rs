use crate::error::JediError;
use crate::proto::jedi::{ MessageKind, JediEnvelope, PayloadFormat };
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
    }
  };
}

// * Throwaway Structs

#[derive(Debug, Deserialize)]
struct XAddInput {
  #[serde(with = "serde_arc_str")]
  stream: Arc<str>,
  #[serde(default, with = "serde_arc_str::option")]
  id: Option<Arc<str>>,
  #[serde(with = "serde_arc_str::map_keys")]
  fields: HashMap<Arc<str>, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValueInput {
  #[serde(with = "serde_arc_str")]
  pub key: Arc<str>,
  #[serde(default, with = "serde_arc_str::option")]
  pub value: Option<Arc<str>>,
  pub ttl: Option<usize>,
}

#[derive(Debug, Serialize)]
struct RedisResult {
  #[serde(with = "serde_arc_str")]
  key: Arc<str>,
  #[serde(with = "serde_arc_str::option")]
  value: Option<Arc<str>>,
}

// ! XReadInput -> XReadStreamInput * Following the next step.

#[derive(Debug, Deserialize)]
struct XReadInput {
  #[serde(with = "serde_arc_str::map_arc_to_arc")]
  streams: HashMap<Arc<str>, Arc<str>>,
  #[serde(default)]
  count: Option<u64>,
  #[serde(default)]
  block: Option<u64>,
}

// * Stream Structs

#[derive(Debug, Deserialize)]
pub struct StreamKeySelector {
  #[serde(with = "serde_arc_str")]
  pub stream: Arc<str>,
  #[serde(with = "serde_arc_str")]
  pub id: Arc<str>,
}


#[derive(Debug, Deserialize)]
struct XReadStreamInput {
  streams: Vec<StreamKeySelector>,
  #[serde(default)]
  count: Option<u64>,
  #[serde(default)]
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

  let kind = env.kind;

  if !MessageKind::try_from_valid(kind) {
    tracing::warn!("Unhandled or invalid MessageKind in Redis Flex handler: {}", kind);
  }

  // * We could fail it out if the bitmap does not contain "redis" but it should have been handled before it got here.

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

  Ok(wrap_hybrid(MessageKind::Add as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32, PayloadFormat::Flex, &result, Some(env.metadata.clone())))
}

async fn handle_redis_xread_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XReadStreamInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let (keys, ids): (Vec<&str>, Vec<&str>) = input.streams
    .iter()
    .map(|s| (s.stream.as_ref(), s.id.as_ref()))
    .unzip();

  let result: HashMap<String, Vec<(String, HashMap<String, Vec<u8>>)>> = client.xread_map(
    Some(input.count.unwrap_or(10)),
    input.block,
    keys,
    ids
  ).await?;

  let bytes = serialize_to_flex_bytes(&result)?;
  Ok(wrap_hybrid(
    MessageKind::Read as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
    PayloadFormat::Flex,
    &bytes,
    Some(env.metadata.clone())
  ))
}

async fn handle_redis_watch_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let metadata = env.metadata_or_empty();

  let connection_id = crate::entity::ulid
    ::extract_connection_id_bytes(&metadata)
    .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

  if ctx.watch_manager.is_watching(&connection_id, &*key) {
    return Err(JediError::BadRequest("Already watching this key".into()));
  }

  ctx.watch_manager.watch(connection_id, key.clone(), PayloadFormat::Flex)?;
  Ok(env.clone())
}

async fn handle_redis_unwatch_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let metadata = env.metadata_or_empty();

  let conn_id = crate::entity::ulid
    ::extract_connection_id_bytes(&metadata)
    .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

  ctx.watch_manager.unwatch(&conn_id, key, PayloadFormat::Flex)?;
  Ok(env.clone())
}

async fn handle_redis_pub_flex(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let value = input.value.ok_or_else(|| JediError::BadRequest("Missing value for PUB".into()))?;

  let client = ctx.redis_pool.next().clone();
  let channel = format!("key:{}", key);

  client.publish::<i64, _, _>(&channel, value.as_ref()).await?;
  Ok(env.clone())
}

async fn handle_redis_sub_flex(
  env: &JediEnvelope,
  _ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  Ok(env.clone())
}

//  * JSON Arm

pub async fn handle_redis_json(
  env: JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {

  let kind = env.kind;
  if !MessageKind::try_from_valid(kind) {
    tracing::warn!("Unhandled or invalid MessageKind in Redis JSON handler: {}", kind);
  }

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

  Ok(wrap_hybrid(MessageKind::Add as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32, PayloadFormat::Json, &result, Some(env.metadata.clone())))
}

async fn handle_redis_xread_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<XReadInput>(env)?;
  let client = ctx.redis_pool.next().clone();

  let (keys, ids): (Vec<&str>, Vec<&str>) = input.streams
    .iter()
    .map(|(k, v)| (k.as_ref(), v.as_ref()))
    .unzip();

  let result: FredXRead<String, String, String, Vec<u8>> = client.xread_map(
    Some(input.count.unwrap_or(10)),
    input.block,
    keys,
    ids
  ).await?;

  let response: Vec<StreamMessages> = result
    .into_iter()
    .map(|(stream, entries)| StreamMessages {
      stream: Cow::Owned(stream),
      entries: entries
        .into_iter()
        .map(|(id, fields)| {
          let fields_map = fields
            .into_iter()
            .map(|(k, v)| (Cow::Owned(k), Cow::Owned(String::from_utf8_lossy(&v).into_owned())))
            .collect();

          StreamEntry {
            id: Cow::Owned(id),
            fields: fields_map,
          }
        })
        .collect(),
    })
    .collect();

  Ok(wrap_hybrid(
    MessageKind::Read as i32 | MessageKind::Redis as i32 | MessageKind::Stream as i32,
    PayloadFormat::Json,
    &response,
    Some(env.metadata.clone())
  ))
}

async fn handle_redis_watch_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let metadata = env.metadata_or_empty();

  let conn_id = crate::entity::ulid
    ::extract_connection_id_json(&metadata)
    .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

  if ctx.watch_manager.is_watching(&conn_id, &*key) {
    return Err(JediError::BadRequest("Already watching this key".into()));
  }

  ctx.watch_manager.watch(conn_id, key.clone(), PayloadFormat::Json)?;
  Ok(env.clone())
}

async fn handle_redis_unwatch_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let metadata = env.metadata_or_empty();

  let conn_id = crate::entity::ulid
    ::extract_connection_id_json(&metadata)
    .ok_or_else(|| JediError::BadRequest("Missing connection ID in metadata".into()))?;

  ctx.watch_manager.unwatch(&conn_id, key, PayloadFormat::Json)?;
  Ok(env.clone())
}

async fn handle_redis_pub_json(
  env: &JediEnvelope,
  ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  let input = try_unwrap_payload::<KeyValueInput>(env)?;
  let key = input.key;
  let value = input.value.ok_or_else(|| JediError::BadRequest("Missing value for PUB".into()))?;

  let client = ctx.redis_pool.next().clone();
  let channel = format!("key:{}", key);

  client.publish::<i64, _, _>(&channel, value.as_ref()).await?;
  Ok(env.clone())
}

async fn handle_redis_sub_json(
  env: &JediEnvelope,
  _ctx: &TempleState
) -> Result<JediEnvelope, JediError> {
  // SUB is managed by pubsub listener + WatchManager, so just return OK
  Ok(env.clone())
}

pub mod faucet_redis {
  use super::*;
  use crate::envelope::{ EnvelopePipeline, EnvelopeWorkItem };
  use crate::proto::jedi::{ MessageKind, JediEnvelope, PayloadFormat };
  use bytes::Bytes;
  use fred::{ prelude::*, types::Message as RedisMessage, clients::SubscriberClient };
  use tokio::sync::{ mpsc::UnboundedReceiver, broadcast::Sender as BroadcastSender };
  use tokio::task::JoinHandle;

  pub async fn create_pubsub_connection_fred(
    config: Config
  ) -> Result<(SubscriberClient, UnboundedReceiver<JediEnvelope>), JediError> {
    let subscriber = Builder::from_config(config)
      .build_subscriber_client()
      .map_err(|e| JediError::Internal(format!("Failed to build subscriber: {e}").into()))?;

    subscriber
      .init().await
      .map_err(|e| { JediError::Internal(format!("Failed to init subscriber: {e}").into()) })?;

    let _ = subscriber.manage_subscriptions();

    let mut redis_rx = subscriber.message_rx();
    let (app_tx, app_rx) = tokio::sync::mpsc::unbounded_channel();

    tokio::spawn(async move {
      while let Ok(msg) = redis_rx.recv().await {
        if let Some(env) = parse_pubsub_message_to_envelope(&msg) {
          let _ = app_tx.send(env);
        }
      }
    });

    Ok((subscriber, app_rx))
  }

  fn parse_pubsub_message_to_envelope(msg: &RedisMessage) -> Option<JediEnvelope> {
    let channel = format!("{}", msg.channel);
    let payload: String = msg.value.clone().convert().ok()?;
    let key = channel.strip_prefix("key:")?.to_owned();

    let env = wrap_hybrid(
      MessageKind::ConfigUpdate,
      PayloadFormat::Json,
      &serde_json::json!({
        "key": key,
        "value": payload,
        "timestamp": chrono::Utc::now().timestamp_millis(),
      }),
      None
    );

    Some(env)
  }


  pub fn spawn_pubsub_listener_task(
    mut rx: UnboundedReceiver<JediEnvelope>,
    event_tx: BroadcastSender<JediEnvelope>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(env) = rx.recv().await {
            let kind = env.kind;
            if MessageKind::try_from_valid(kind) {
                tracing::debug!("[Redis] PubSub event received: kind={} (valid)", kind);
            } else {
                tracing::warn!("[Redis] PubSub event received: kind={} (invalid)", kind);
            }

            if let Err(e) = event_tx.send(env.clone()) {
                tracing::warn!("[Redis] Failed to broadcast pubsub event: {}", e);
            }
        }

        tracing::warn!("[Redis] PubSub listener exited");
    })
}


  pub fn spawn_watch_event_listener(
    mut rx: UnboundedReceiver<JediEnvelope>,
    client: SubscriberClient
  ) -> JoinHandle<()> {
    tokio::spawn(async move {
      while let Some(env) = rx.recv().await {
        
        let kind = env.kind;

        if !MessageKind::try_from_valid(kind) {
            tracing::warn!("[Redis] Received invalid MessageKind: {}", kind);
            continue;
        }

        if MessageKind::watch(kind) || MessageKind::unwatch(kind) {
          let payload = try_unwrap_payload::<KeyValueInput>(&env);

          let key = match payload {
            Ok(kv) => kv.key,
            Err(e) => {
              tracing::warn!("[Redis] Failed to parse watch/unwatch payload: {}", e);
              continue;
            }
          };

          let channel = format!("key:{}", key);
          let result = if MessageKind::watch(kind.into()) {
            tracing::info!("[Redis] Subscribing to {}", channel);
            client.subscribe(channel).await
          } else {
            tracing::info!("[Redis] Unsubscribing from {}", channel);
            client.unsubscribe(channel).await
          };

          if let Err(e) = result {
            tracing::warn!("[Redis] Failed to process watch/unwatch: {}", e);
          }
        } else {
          tracing::debug!("[Redis] Ignored non-watch envelope in watch listener: kind={:?}", kind);
        }
      }

      tracing::warn!("[Redis] WatchEvent listener exiting");
    })
  }

  pub fn spawn_redis_worker(
    ctx: Arc<TempleState>,
    mut rx: tokio::sync::mpsc::Receiver<EnvelopeWorkItem>
  ) -> JoinHandle<()> {
    tokio::spawn(async move {
      tracing::info!("[RedisWorker] Spawned");

      while let Some(EnvelopeWorkItem { envelope, response_tx }) = rx.recv().await {
        let result = envelope.process(&ctx).await;

        if let Some(tx) = response_tx {
          let _ = tx.send(match result {
            Ok(env) => env,
            Err(e) => JediEnvelope::error("RedisWorker", &e.to_string()),
          });
        }
      }

      tracing::warn!("[RedisWorker] Redis worker exiting");
    })
  }
}
