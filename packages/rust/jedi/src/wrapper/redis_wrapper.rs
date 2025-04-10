use std::sync::Arc;
use axum::extract::ws::Message;
use chrono::Utc;
use serde::{ Deserialize, Serialize };
use tokio::sync::{ oneshot, broadcast::Sender as BroadcastSender };
use fred::{ prelude::*, types::Message as RedisMessage, clients::SubscriberClient };
use tokio::sync::mpsc::{ Receiver, unbounded_channel, UnboundedReceiver, UnboundedSender };
use futures_util::{ StreamExt, SinkExt, pin_mut };
use dashmap::DashSet;
use tokio::task::JoinHandle;

use crate::error::JediError;
use crate::pipe::Pipe;
use crate::proto::redis::{
  redis_event_object,
  redis_ws_message,
  RedisWsMessage,
  UnwatchCommand,
  WatchCommand,
};
use crate::proto::redis::{
  RedisCommand,
  RedisResponse,
  SetCommand,
  GetCommand,
  DelCommand,
  redis_command::Command,
  RedisEvent,
  RedisEventObject,
  RedisKeyUpdate,
  redis_key_update::State,
};
use crate::watchmaster::{ WatchEvent, WatchManager };

use crate::entity::serde_arc_str;

#[derive(Debug)]
pub enum IncomingWsFormat {
  JsonText(String),
  Binary(Vec<u8>),
}

#[derive(Debug)]
pub struct RedisWsRequestContext {
  pub envelope: RedisEnvelope,
  pub raw: Option<IncomingWsFormat>,
  pub connection_id: Option<[u8; 16]>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RedisEnvelope {
  pub id: Option<String>,
  #[serde(flatten)]
  pub command: RedisCommandType,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ttl_seconds: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub timestamp: Option<u64>,

  #[serde(skip_serializing, skip_deserializing)]
  #[serde(default)]
  pub response_tx: Option<oneshot::Sender<RedisResponse>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisEventEnvelope {
  #[serde(with = "serde_arc_str")]
  pub channel: Arc<str>,
  pub event: RedisEventObject,
  pub received_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum RedisCommandType {
  Set {
    #[serde(with = "serde_arc_str")]
    key: Arc<str>,
    #[serde(with = "serde_arc_str")]
    value: Arc<str>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ttl: Option<u64>,
  },
  Get {
    #[serde(with = "serde_arc_str")]
    key: Arc<str>,
  },
  Del {
    #[serde(with = "serde_arc_str")]
    key: Arc<str>,
  },
  Watch {
    #[serde(with = "serde_arc_str")]
    key: Arc<str>,
  },
  Unwatch {
    #[serde(with = "serde_arc_str")]
    key: Arc<str>,
  },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ThinRedisCommand {
  Set {
    key: String,
    value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ttl: Option<u64>,
  },
  Get {
    key: String,
  },
  Del {
    key: String,
  },
  Watch {
    key: String,
  },
  Unwatch {
    key: String,
  },
}

impl From<ThinRedisCommand> for RedisEnvelope {
  fn from(cmd: ThinRedisCommand) -> Self {
    match cmd {
      ThinRedisCommand::Set { key, value, ttl } =>
        RedisEnvelope {
          id: None,
          command: RedisCommandType::Set {
            key: Arc::from(key),
            value: Arc::from(value),
            ttl,
          },
          ttl_seconds: ttl,
          timestamp: Some(chrono::Utc::now().timestamp_millis() as u64),
          response_tx: None,
        },
      ThinRedisCommand::Get { key } => RedisEnvelope::get(key),
      ThinRedisCommand::Del { key } => RedisEnvelope::del(key),
      ThinRedisCommand::Watch { key } =>
        RedisEnvelope::new(RedisCommandType::Watch {
          key: Arc::from(key),
        }),
      ThinRedisCommand::Unwatch { key } =>
        RedisEnvelope::new(RedisCommandType::Unwatch {
          key: Arc::from(key),
        }),
    }
  }
}

impl RedisCommandType {
  pub fn key(&self) -> &str {
    match self {
      Self::Set { key, .. } => key,
      Self::Get { key } => key,
      Self::Del { key } => key,
      Self::Watch { key } => key,
      Self::Unwatch { key } => key,
    }
  }
}

impl RedisEnvelope {
  fn new(command: RedisCommandType) -> Self {
    Self {
      id: None,
      command,
      ttl_seconds: None,
      timestamp: None,
      response_tx: None,
    }
  }

  pub fn set<K, V>(key: K, value: V) -> Self where K: Into<Arc<str>>, V: Into<Arc<str>> {
    Self::new(RedisCommandType::Set {
      key: key.into(),
      value: value.into(),
      ttl: None,
    })
  }

  pub fn set_with_ttl<K, V>(key: K, value: V, ttl: u64) -> Self
    where K: Into<Arc<str>>, V: Into<Arc<str>>
  {
    Self::new(RedisCommandType::Set {
      key: key.into(),
      value: value.into(),
      ttl: Some(ttl),
    })
  }

  pub fn get<K: Into<Arc<str>>>(key: K) -> Self {
    Self::new(RedisCommandType::Get {
      key: key.into(),
    })
  }

  pub fn del<K: Into<Arc<str>>>(key: K) -> Self {
    Self::new(RedisCommandType::Del {
      key: key.into(),
    })
  }

  pub fn from_proto(
    cmd: RedisCommand,
    tx: Option<oneshot::Sender<RedisResponse>>
  ) -> Result<Self, &'static str> {
    let mut env = RedisEnvelope::try_from(cmd)?;
    env.response_tx = tx;
    Ok(env)
  }

  pub fn with_response_tx(mut self, tx: oneshot::Sender<RedisResponse>) -> Self {
    self.response_tx = Some(tx);
    self
  }

  pub async fn process(&self, pool: &fred::clients::Pool) -> Result<RedisResponse, JediError> {
    match &self.command {
      RedisCommandType::Set { key, value, ttl } => {
        let res = if let Some(ttl) = ttl {
          pool.set::<(), _, _>(
            key.as_ref(),
            value.as_ref(),
            Some(Expiration::EX(*ttl as i64)),
            None,
            false
          ).await
        } else {
          pool.set::<(), _, _>(key.as_ref(), value.as_ref(), None, None, false).await
        };

        res.map_err(JediError::from)?;

        Ok(RedisResponse {
          status: "OK".into(),
          value: value.to_string(),
        })
      }

      RedisCommandType::Get { key } => {
        let res: Option<String> = pool.get(key.as_ref()).await.map_err(JediError::from)?;
        Ok(RedisResponse {
          status: "OK".into(),
          value: res.unwrap_or_default(),
        })
      }

      RedisCommandType::Del { key } => {
        let deleted: i64 = pool.del(key.as_ref()).await.map_err(JediError::from)?;
        Ok(RedisResponse {
          status: "OK".into(),
          value: deleted.to_string(),
        })
      }

      RedisCommandType::Watch { .. } | RedisCommandType::Unwatch { .. } => {
        Err(JediError::BadRequest("Watch commands must be handled externally".into()))
      }
    }
  }

  pub fn emit(&self, response: &RedisResponse) -> Option<RedisKeyUpdate> {
    match &self.command {
      RedisCommandType::Set { key, .. } => {
        if response.status == "OK" {
          Some(redis_key_update_value(key, &response.value))
        } else {
          None
        }
      }

      RedisCommandType::Del { key } => {
        if response.status == "OK" { Some(redis_key_update_deleted(key)) } else { None }
      }

      RedisCommandType::Get { key } => {
        if response.status == "OK" {
          Some(redis_key_update_from_response(key, response))
        } else {
          None
        }
      }

      RedisCommandType::Watch { .. } | RedisCommandType::Unwatch { .. } => None,
    }
  }

  pub async fn publish(
    &self,
    update: Option<RedisKeyUpdate>,
    pool: &fred::clients::Pool
  ) -> Result<(), JediError> {
    if let Some(update) = update {
      publish_update(pool, self.command.key(), update).await;
    }

    Ok(())
  }

  pub async fn full_pipeline(
    &mut self,
    pool: &fred::clients::Pool
  ) -> Result<RedisResponse, JediError> {
    let response = self.process(pool).await?;
    let update = self.emit(&response);
    self.publish(update, pool).await?;
    Ok(response)
  }
}

impl RedisKeyUpdate {
  pub fn is_deleted(&self) -> bool {
    matches!(self.state, Some(State::Deleted(true)))
  }

  pub fn value(&self) -> Option<&str> {
    match &self.state {
      Some(State::Value(v)) => Some(v),
      _ => None,
    }
  }

  pub fn into_log_fields(self) -> (String, String) {
    match self.state {
      Some(State::Value(val)) => (self.key, val),
      Some(State::Deleted(_)) => (self.key, "[deleted]".into()),
      None => (self.key, "[unknown]".into()),
    }
  }

  pub fn from_raw_change<K, V>(key: K, value: Option<V>) -> Self where K: AsRef<str>, V: AsRef<str> {
    match value {
      Some(val) => redis_key_update_value(key, val),
      None => redis_key_update_deleted(key),
    }
  }
}

impl RedisWsMessage {
  pub fn from_command(cmd: RedisCommand) -> Self {
    RedisWsMessage {
      message: Some(redis_ws_message::Message::Command(cmd)),
    }
  }

  pub fn from_event(event: RedisEvent) -> Self {
    RedisWsMessage {
      message: Some(redis_ws_message::Message::Event(event)),
    }
  }

  pub fn from_watch_command(key: impl Into<String>) -> Self {
    RedisWsMessage {
      message: Some(
        redis_ws_message::Message::Watch(crate::proto::redis::WatchCommand {
          key: key.into(),
        })
      ),
    }
  }

  pub fn from_update(update: RedisKeyUpdate) -> Self {
    RedisWsMessage {
      message: Some(redis_ws_message::Message::Update(update)),
    }
  }

  pub fn as_json_string(&self) -> Option<String> {
    serde_json::to_string(self).ok()
  }
}

impl From<RedisEnvelope> for RedisCommand {
  fn from(envelope: RedisEnvelope) -> Self {
    use RedisCommandType::*;

    let command = match envelope.command {
      Set { key, value, ttl } =>
        Command::Set(SetCommand {
          key: key.to_string(),
          value: value.to_string(),
          ttl,
        }),
      Get { key } =>
        Command::Get(GetCommand {
          key: key.to_string(),
        }),
      Del { key } =>
        Command::Del(DelCommand {
          key: key.to_string(),
        }),
      Watch { key } =>
        Command::Watch(WatchCommand {
          key: key.to_string(),
        }),
      Unwatch { key } =>
        Command::Unwatch(UnwatchCommand {
          key: key.to_string(),
        }),
    };

    RedisCommand {
      command: Some(command),
    }
  }
}

impl Clone for RedisEnvelope {
  fn clone(&self) -> Self {
    Self {
      id: self.id.clone(),
      command: self.command.clone(),
      ttl_seconds: self.ttl_seconds,
      timestamp: self.timestamp,
      response_tx: None,
    }
  }
}

impl TryFrom<RedisCommand> for RedisEnvelope {
  type Error = &'static str;

  fn try_from(cmd: RedisCommand) -> Result<Self, Self::Error> {
    use Command::*;

    let command = match cmd.command {
      Some(Set(cmd)) =>
        RedisCommandType::Set {
          key: Arc::from(cmd.key),
          value: Arc::from(cmd.value),
          ttl: cmd.ttl,
        },
      Some(Get(cmd)) =>
        RedisCommandType::Get {
          key: Arc::from(cmd.key),
        },
      Some(Del(cmd)) =>
        RedisCommandType::Del {
          key: Arc::from(cmd.key),
        },
      Some(Watch(cmd)) =>
        RedisCommandType::Watch {
          key: Arc::from(cmd.key),
        },
      Some(Unwatch(cmd)) =>
        RedisCommandType::Unwatch {
          key: Arc::from(cmd.key),
        },
      None => {
        return Err("Missing Redis command variant");
      }
    };

    Ok(RedisEnvelope {
      id: None,
      command,
      ttl_seconds: None,
      timestamp: None,
      response_tx: None,
    })
  }
}

impl From<&RedisEnvelope> for RedisCommand {
  fn from(envelope: &RedisEnvelope) -> Self {
    use Command::*;

    let command = match &envelope.command {
      RedisCommandType::Set { key, value, ttl } =>
        Set(SetCommand {
          key: key.to_string(),
          value: value.to_string(),
          ttl: *ttl,
        }),
      RedisCommandType::Get { key } =>
        Get(GetCommand {
          key: key.to_string(),
        }),
      RedisCommandType::Del { key } =>
        Del(DelCommand {
          key: key.to_string(),
        }),
      RedisCommandType::Watch { key } =>
        Watch(WatchCommand {
          key: key.to_string(),
        }),
      RedisCommandType::Unwatch { key } =>
        Unwatch(UnwatchCommand {
          key: key.to_string(),
        }),
    };

    RedisCommand {
      command: Some(command),
    }
  }
}

// ** Process -> Redis Envelope

// ** Redis Cluster Connection

pub async fn create_pubsub_connection_fred(
  config: Config
) -> Result<(SubscriberClient, UnboundedReceiver<RedisEventEnvelope>), JediError> {
  let subscriber = Builder::from_config(config)
    .build_subscriber_client()
    .map_err(|e| JediError::Internal(format!("SubscriberClient build failed: {e}").into()))?;

  subscriber
    .init().await
    .map_err(|e| { JediError::Internal(format!("SubscriberClient init failed: {e}").into()) })?;

  // subscriber
  //   .psubscribe(vec!["key:*"]).await
  //   .map_err(|e| { JediError::Internal(format!("Failed to psubscribe: {e}").into()) })?;

  let _resub = subscriber.manage_subscriptions();

  let mut rx = subscriber.message_rx();
  let (tx, internal_rx) = unbounded_channel::<RedisEventEnvelope>();

  tokio::spawn(async move {
    while let Ok(msg) = rx.recv().await {
      if let Some(envelope) = parse_pubsub_message(&msg) {
        let _ = tx.send(envelope);
      }
    }
  });

  Ok((subscriber, internal_rx))
}

fn parse_pubsub_message(msg: &RedisMessage) -> Option<RedisEventEnvelope> {
  let key = Arc::<str>::from(msg.channel.to_string());
  let raw_payload = msg.value.clone().convert::<String>().ok()?;

  let update: RedisKeyUpdate = serde_json::from_str(&raw_payload).ok()?;

  Some(RedisEventEnvelope {
    channel: key.clone(),
    received_at: chrono::Utc::now().timestamp_millis() as u64,
    event: RedisEventObject {
      object: Some(redis_event_object::Object::Update(update)),
    },
  })
}


//  ** Redis Handler

pub async fn spawn_redis_worker(pool: Pool, mut rx: Receiver<RedisEnvelope>) {
  tokio::spawn(async move {
    tracing::info!("[Temple] Spawning Redis worker");

    while let Some(envelope) = rx.recv().await {
      let RedisEnvelope { command, response_tx, ttl_seconds, .. } = envelope;

      let redis_response = match command {
        RedisCommandType::Set { key, value, ttl: _ } => {
          let res = if let Some(ttl) = ttl_seconds {
            pool.set::<(), _, _>(
              key.as_ref(),
              value.as_ref(),
              Some(Expiration::EX(ttl as i64)),
              None,
              false
            ).await
          } else {
            pool.set::<(), _, _>(key.as_ref(), value.as_ref(), None, None, false).await
          };

          if res.is_ok() {
            let update = redis_key_update_value(&*key, &*value);
            publish_update(&pool, &key, update).await;
          }

          RedisResponse {
            status: format!("{:?}", res),
            value: value.to_string(),
          }
        }

        RedisCommandType::Get { key } => {
          let res: Result<Option<String>, _> = pool.get(key.as_ref()).await;

          RedisResponse {
            status: format!("{:?}", res),
            value: res.unwrap_or_default().unwrap_or_default(),
          }
        }

        RedisCommandType::Del { key } => {
          let res: Result<i64, _> = pool.del(key.as_ref()).await;

          if res.is_ok() {
            let update = redis_key_update_deleted(key.as_ref());
            publish_update(&pool, key.as_ref(), update).await;
          }

          RedisResponse {
            status: format!("{:?}", res),
            value: String::new(),
          }
        }

        RedisCommandType::Watch { .. } | RedisCommandType::Unwatch { .. } => {
          tracing::debug!("Skipping Watch/Unwatch in Redis worker");
          continue;
        }
      };

      if let Some(tx) = response_tx {
        let _ = tx.send(redis_response);
      }
    }

    tracing::warn!("[Temple] Redis worker has exited");
  });
}

async fn publish_update(pool: &fred::clients::Pool, key: &str, update: RedisKeyUpdate) {
  let channel = redis_channel_for_key(key);

  let mut buffer = Vec::with_capacity(256);

  match serde_json::to_writer(&mut buffer, &update) {
    Ok(_) => {
      tracing::debug!("Publishing update to {}", channel);

      let client = pool.next().clone();

      match client.publish::<i64, _, _>(&channel, &buffer[..]).await {
        Ok(_) => tracing::debug!("Published Redis update to {}", channel),
        Err(e) => tracing::warn!("Failed to publish update to {}: {}", channel, e),
      }
    }
    Err(e) => {
      tracing::warn!("Failed to serialize RedisKeyUpdate: {}", e);
    }
  }
}


pub fn spawn_pubsub_listener_task(
  mut rx: UnboundedReceiver<RedisEventEnvelope>,
  event_tx: BroadcastSender<RedisEventEnvelope>
) -> JoinHandle<()> {
  tracing::info!("[Temple] Spawning Redis PubSub listener task");

  tokio::spawn(async move {
    while let Some(envelope) = rx.recv().await {
      tracing::debug!(
        "[Temple] Received Redis pubsub envelope: channel={}, event={:?}",
        envelope.channel,
        envelope.event
      );

      match event_tx.send(envelope.clone()) {
        Ok(count) => {
          tracing::debug!("Event sent to {} WebSocket(s) on channel: {}", count, envelope.channel);
        }
        Err(e) => {
          tracing::warn!("Failed to send RedisEventEnvelope: {}", e);
        }
      }
    }

    tracing::warn!("[Temple] PubSub listener has exited.");
  })
}

pub fn spawn_watch_event_listener(
  mut rx: Receiver<WatchEvent>,
  client: SubscriberClient
) -> JoinHandle<()> {
  tracing::info!("[Temple] Spawning Redis WatchEvent listener task");

  tokio::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        WatchEvent::Watch(key) => {
          let channel = format!("key:{}", key);
          tracing::info!("[Temple] Subscribing to Redis channel: {}", channel);

          if let Err(e) = client.subscribe(channel.clone()).await {
            tracing::error!("[Temple] Failed to subscribe to {channel}: {}", e);
          }
        }

        WatchEvent::Unwatch(key) => {
          let channel = format!("key:{}", key);
          tracing::info!("[Temple] Unsubscribing from Redis channel: {}", channel);

          if let Err(e) = client.unsubscribe(channel.clone()).await {
            tracing::error!("[Temple] Failed to unsubscribe from {channel}: {}", e);
          }
        }
      }
    }

    tracing::warn!("[Temple] Redis WatchEvent listener exiting");
  })
}
// * WatchMaster END

pub fn redis_key_update_value<K, V>(key: K, value: V) -> RedisKeyUpdate
  where K: AsRef<str>, V: AsRef<str>
{
  RedisKeyUpdate {
    key: key.as_ref().to_string(),
    state: Some(State::Value(value.as_ref().to_string())),
    timestamp: chrono::Utc::now().timestamp_millis() as u64,
  }
}

pub fn redis_key_update_deleted<K>(key: K) -> RedisKeyUpdate where K: AsRef<str> {
  RedisKeyUpdate {
    key: key.as_ref().to_string(),
    state: Some(State::Deleted(true)),
    timestamp: chrono::Utc::now().timestamp_millis() as u64,
  }
}

pub fn redis_ws_update_msg(update: RedisKeyUpdate) -> RedisWsMessage {
  RedisWsMessage {
    message: Some(redis_ws_message::Message::Update(update)),
  }
}

pub fn redis_key_update_from_get<K, V>(key: K, value: Option<V>) -> RedisKeyUpdate
  where K: AsRef<str>, V: AsRef<str>
{
  match value {
    Some(val) => redis_key_update_value(key, val),
    None => redis_key_update_deleted(key),
  }
}

pub fn redis_key_update_from_command(cmd: &RedisCommand) -> Option<RedisKeyUpdate> {
  use crate::proto::redis::redis_command::Command::*;
  match &cmd.command {
    Some(Set(c)) => Some(redis_key_update_value(&c.key, &c.value)),
    Some(Del(c)) => Some(redis_key_update_deleted(&c.key)),
    _ => None,
  }
}

pub fn should_emit_update(key_update: &RedisKeyUpdate, watch_manager: &WatchManager) -> bool {
  let key_arc = Arc::<str>::from(key_update.key.as_str());
  let guard = watch_manager.key_to_conns.guard();

  watch_manager.key_to_conns.get(&key_arc, &guard).map_or(false, |set| !set.is_empty())
}

pub fn create_ws_update_if_watched(
  key_update: &RedisKeyUpdate,
  watch_manager: &WatchManager
) -> Option<RedisWsMessage> {
  if should_emit_update(key_update, watch_manager) {
    Some(redis_ws_update_msg(key_update.clone()))
  } else {
    None
  }
}

// * Parse Websockets

pub fn parse_incoming_ws_data(
  input: IncomingWsFormat,
  connection_id: Option<[u8; 16]>
) -> Result<RedisWsRequestContext, JediError> {
  let envelope = match &input {
    IncomingWsFormat::JsonText(text) => { parse_redis_envelope_from_json(text)? }

    IncomingWsFormat::Binary(data) => {
      let reader = flexbuffers::Reader
        ::get_root(&data[..])
        .map_err(|e| JediError::Parse(format!("flexbuffers parse error: {e}")))?;

      let map = reader.as_map();
      parse_redis_envelope_from_flex(&map)?
    }
  };

  Ok(RedisWsRequestContext {
    envelope,
    raw: Some(input),
    connection_id,
  })
}

pub fn parse_redis_envelope_from_json(text: &str) -> Result<RedisEnvelope, JediError> {
  if let Ok(msg) = serde_json::from_str::<RedisWsMessage>(text) {
    if let Some(envelope) = build_redis_envelope_from_ws(&msg) {
      return Ok(envelope);
    }
  }

  if let Ok(thin) = serde_json::from_str::<ThinRedisCommand>(text) {
    return Ok(RedisEnvelope::from(thin));
  }

  if let Ok(cmd) = serde_json::from_str::<RedisCommand>(text) {
    return RedisEnvelope::try_from(cmd).map_err(|_|
      JediError::Parse("invalid RedisCommand".into())
    );
  }

  Err(JediError::Parse("Unable to parse RedisEnvelope from JSON".into()))
}

pub fn parse_redis_envelope_from_flex(
  map: &flexbuffers::MapReader<&[u8]>
) -> Result<RedisEnvelope, JediError> {
  let key_reader = map.idx("key");
  let key = key_reader
    .get_str()
    .map_err(|_| JediError::Parse("missing or invalid 'key' field".into()))?;

  let cmd_type = map.idx("type").get_str().unwrap_or("set").to_lowercase();

  match cmd_type.as_str() {
    "set" => {
      let value_reader = map.idx("value");
      let value = value_reader.get_str().unwrap_or("");

      let ttl = map.idx("ttl").get_u64().ok();

      Ok(
        if let Some(ttl) = ttl {
          RedisEnvelope::set_with_ttl(key, value, ttl)
        } else {
          RedisEnvelope::set(key, value)
        }
      )
    }

    "get" => Ok(RedisEnvelope::get(key)),

    "del" => Ok(RedisEnvelope::del(key)),

    "watch" =>
      Ok(
        RedisEnvelope::new(RedisCommandType::Watch {
          key: Arc::from(key),
        })
      ),

    "unwatch" =>
      Ok(
        RedisEnvelope::new(RedisCommandType::Unwatch {
          key: Arc::from(key),
        })
      ),

    other => Err(JediError::Parse(format!("unsupported flex command type: {}", other))),
  }
}

// pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
//   serde_json::from_str::<RedisWsMessage>(json)
// }

// pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
//   serde_json::from_str::<RedisWsMessage>(json).or_else(|_| {
//     serde_json::from_str::<RedisCommand>(json).map(|cmd| {
//       RedisWsMessage {
//         message: Some(redis_ws_message::Message::Command(cmd)),
//       }
//     })
//   })
// }

pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
  serde_json
    ::from_str::<RedisWsMessage>(json)
    .or_else(|_|
      serde_json::from_str::<RedisCommand>(json).map(|cmd| RedisWsMessage {
        message: Some(redis_ws_message::Message::Command(cmd)),
      })
    )
    .or_else(|_|
      serde_json::from_str::<ThinRedisCommand>(json).map(|thin| {
        let env: RedisEnvelope = thin.into();
        RedisWsMessage {
          message: Some(redis_ws_message::Message::Command((&env).into())),
        }
      })
    )
}

// * Additional Helper Functions */

pub fn extract_watch_command_key(msg: &RedisWsMessage) -> Option<Arc<str>> {
  match &msg.message {
    Some(redis_ws_message::Message::Watch(cmd)) => Some(Arc::from(cmd.key.as_str())),
    _ => None,
  }
}

pub fn build_redis_envelope_from_ws(msg: &RedisWsMessage) -> Option<RedisEnvelope> {
  match &msg.message {
    Some(redis_ws_message::Message::Command(cmd)) => RedisEnvelope::try_from(cmd.clone()).ok(),
    _ => None,
  }
}

pub fn add_watch_key(watchlist: &DashSet<Arc<str>>, key: impl Into<Arc<str>>) {
  watchlist.insert(key.into());
}

pub fn remove_watch_key(watchlist: &DashSet<Arc<str>>, key: &str) {
  watchlist.remove(&Arc::<str>::from(key));
}

pub fn redis_key_update_from_response(
  key: impl AsRef<str>,
  resp: &RedisResponse
) -> RedisKeyUpdate {
  if resp.value.is_empty() {
    redis_key_update_deleted(key)
  } else {
    redis_key_update_value(key, &resp.value)
  }
}

pub fn redis_channel_for_key(key: &str) -> String {
  format!("key:{}", key)
}

pub fn filter_updates_for_active_keys<'a>(
  updates: impl Iterator<Item = &'a RedisKeyUpdate>,
  watch_manager: &WatchManager
) -> Vec<RedisWsMessage> {
  let guard = watch_manager.key_to_conns.guard();

  updates
    .filter_map(|upd| {
      let key_arc = Arc::<str>::from(upd.key.as_str());
      if watch_manager.key_to_conns.get(&key_arc, &guard).map_or(false, |set| !set.is_empty()) {
        Some(redis_ws_update_msg(upd.clone()))
      } else {
        None
      }
    })
    .collect()
}

pub fn set_with_ttl(key: String, value: String, ttl: u64) -> RedisEnvelope {
  RedisEnvelope {
    id: None,
    command: RedisCommandType::Set {
      key: Arc::from(key),
      value: Arc::from(value),
      ttl: Some(ttl),
    },
    ttl_seconds: Some(ttl),
    timestamp: Some(chrono::Utc::now().timestamp_millis() as u64),
    response_tx: None,
  }
}

pub fn should_emit_update_hashed(
  key_update: &RedisKeyUpdate,
  watch_manager: &WatchManager
) -> bool {
  watch_manager.has_watchers(&*key_update.key)
}

pub async fn send_ws_error(sender: &mut (impl SinkExt<Message> + Unpin), msg: impl ToString) {
  let err_msg = RedisWsMessage {
    message: Some(
      redis_ws_message::Message::ErrorMsg(crate::proto::redis::ErrorMessage {
        error: msg.to_string(),
      })
    ),
  };

  if let Some(json) = err_msg.as_json_string() {
    let _ = sender.send(Message::Text(json.into())).await;
  }
}

pub fn redis_ws_error_msg<S: ToString>(msg: S) -> String {
  use crate::proto::redis::{ RedisWsMessage, redis_ws_message::Message, ErrorMessage };

  let error_msg = RedisWsMessage {
    message: Some(
      Message::ErrorMsg(ErrorMessage {
        error: msg.to_string(),
      })
    ),
  };

  error_msg
    .as_json_string()
    .unwrap_or_else(|| "{\"type\":\"error\",\"payload\":{\"error\":\"unknown\"}}".into())
}
