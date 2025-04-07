use std::sync::Arc;
use axum::extract::ws::Message;
use redis::aio::MultiplexedConnection;
use serde::{ Deserialize, Serialize };
use tokio::sync::{ oneshot, broadcast::Sender as BroadcastSender };
use tokio::sync::mpsc::{ Receiver, unbounded_channel, UnboundedReceiver };
use bb8_redis::{ bb8::Pool, RedisConnectionManager };
use redis::{ Client, RedisResult, AsyncCommands, AsyncConnectionConfig, Value, PushInfo, PushKind };
use futures_util::{ StreamExt, SinkExt, pin_mut };
use dashmap::DashSet;
use tokio::task::JoinHandle;

use crate::error::JediError;
use crate::proto::redis::{ redis_event_object, redis_ws_message, RedisWsMessage, UnwatchCommand, WatchCommand };
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
  pub channel: String,
  pub event: RedisEventObject,
  pub received_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum RedisCommandType {
  Set {
    key: String,
    value: String,
  },
  Get {
    key: String,
  },
  Del {
    key: String,
  },
  Watch { key: String },
  Unwatch { key: String },
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

  pub fn set(key: String, value: String) -> Self {
    Self::new(RedisCommandType::Set { key, value })
  }

  pub fn get(key: String) -> Self {
    Self::new(RedisCommandType::Get { key })
  }

  pub fn del(key: String) -> Self {
    Self::new(RedisCommandType::Del { key })
  }

  pub fn from_proto(
    cmd: RedisCommand,
    tx: Option<oneshot::Sender<RedisResponse>>,
  ) -> Result<Self, &'static str> {
    let mut env = RedisEnvelope::try_from(cmd)?;
    env.response_tx = tx;
    Ok(env)
  }

  pub fn with_response_tx(mut self, tx: oneshot::Sender<RedisResponse>) -> Self {
    self.response_tx = Some(tx);
    self
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
      Set { key, value } => Command::Set(SetCommand { key, value }),
      Get { key } => Command::Get(GetCommand { key }),
      Del { key } => Command::Del(DelCommand { key }),
      Watch { key } => Command::Watch(WatchCommand { key }),
      Unwatch { key } => Command::Unwatch(UnwatchCommand { key }),
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
      Some(Set(cmd)) => RedisCommandType::Set { key: cmd.key, value: cmd.value },
      Some(Get(cmd)) => RedisCommandType::Get { key: cmd.key },
      Some(Del(cmd)) => RedisCommandType::Del { key: cmd.key },
      Some(Watch(cmd)) => RedisCommandType::Watch { key: cmd.key },
      Some(Unwatch(cmd)) => RedisCommandType::Unwatch { key: cmd.key },
      None => return Err("Missing Redis command variant"),
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
      RedisCommandType::Set { key, value } => Set(SetCommand {
        key: key.clone(),
        value: value.clone(),
      }),
      RedisCommandType::Get { key } => Get(GetCommand {
        key: key.clone(),
      }),
      RedisCommandType::Del { key } => Del(DelCommand {
        key: key.clone(),
      }),
      RedisCommandType::Watch { key } => Watch(WatchCommand {
        key: key.clone(),
      }),
      RedisCommandType::Unwatch { key } => Unwatch(UnwatchCommand {
        key: key.clone(),
      }),
    };

    RedisCommand {
      command: Some(command),
    }
  }
}


// ** Redis Cluster Connection

pub async fn create_pubsub_connection(
  redis_url: &str
) -> Result<(MultiplexedConnection, UnboundedReceiver<PushInfo>), JediError> {
  let full_url = if redis_url.contains('?') {
    format!("{redis_url}&protocol=resp3")
  } else {
    format!("{redis_url}?protocol=resp3")
  };

  tracing::info!("[Temple] Connecting to Redis PubSub at {full_url}");

  let client = Client::open(full_url.clone()).map_err(|e|
    JediError::Internal(format!("Redis client error: {e}").into())
  )?;

  let (push_tx, push_rx) = unbounded_channel::<PushInfo>();
  let config = AsyncConnectionConfig::default().set_push_sender(push_tx);

  let conn = client
    .get_multiplexed_async_connection_with_config(&config).await
    .map_err(|e| JediError::Internal(format!("Redis connection error: {e}").into()))?;

  Ok((conn, push_rx))
}

//  ** Redis Handler
pub async fn spawn_redis_worker(
  pool: Pool<RedisConnectionManager>,
  mut rx: Receiver<RedisEnvelope>
) {
  tokio::spawn(async move {
    tracing::info!("[Temple] About to spawn Redis worker");

    while let Some(envelope) = rx.recv().await {
      let RedisEnvelope { command, response_tx, .. } = envelope;

      // Skip non-Redis store commands like Watch/Unwatch
      let redis_cmd = match command {
        RedisCommandType::Set { key, value } => {
          let mut conn = match pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
              tracing::error!("Redis pool error: {e}");
              continue;
            }
          };

          let res = conn.set(&key, &value).await;
          if res.is_ok() {
            publish_update(&mut conn, &key, redis_key_update_value(&key, &value)).await;
          }

          RedisResponse {
            status: format!("{:?}", res),
            value: String::new(),
          }
        }

        RedisCommandType::Get { key } => {
          let mut conn = match pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
              tracing::error!("Redis pool error: {e}");
              continue;
            }
          };

          let res = conn.get(&key).await;
          RedisResponse {
            status: format!("{:?}", res),
            value: res.unwrap_or_default(),
          }
        }

        RedisCommandType::Del { key } => {
          let mut conn = match pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
              tracing::error!("Redis pool error: {e}");
              continue;
            }
          };

          let res = conn.del(&key).await;
          if res.is_ok() {
            publish_update(&mut conn, &key, redis_key_update_deleted(&key)).await;
          }

          RedisResponse {
            status: format!("{:?}", res),
            value: String::new(),
          }
        }

        RedisCommandType::Watch { .. } | RedisCommandType::Unwatch { .. } => {
          tracing::debug!("Ignoring non-store command in Redis worker");
          continue;
        }
      };

      if let Some(tx) = response_tx {
        let _ = tx.send(redis_cmd);
      }
    }
  });
}


async fn publish_update(
  conn: &mut impl AsyncCommands,
  key: &str,
  update: RedisKeyUpdate,
) {
  let event = RedisEventObject {
    object: Some(redis_event_object::Object::Update(update)),
  };

  if let Ok(payload) = serde_json::to_string(&event) {
    let channel = redis_channel_for_key(key);
    tracing::debug!("Publishing update to {channel}");

    match conn.publish::<_, _, i64>(channel.clone(), payload).await {
      Ok(_) => tracing::debug!("Published successfully"),
      Err(e) => tracing::warn!("Failed to publish update on {channel}: {e}"),
    }
    
  }
}

pub fn spawn_pubsub_listener_task(
  mut push_rx: UnboundedReceiver<PushInfo>,
  event_tx: BroadcastSender<RedisEventEnvelope>
) -> JoinHandle<()> {
  tracing::info!("[Temple] Spawning Redis PubSub listener task");

  tokio::spawn(async move {
    while let Some(push) = push_rx.recv().await {
      tracing::debug!("[Temple] Received push: kind={:?} data={:?}", push.kind, push.data);

      match push.kind {
        PushKind::Message | PushKind::PMessage | PushKind::SMessage => {
          if push.data.len() >= 2 {
            match (&push.data[0], &push.data[1]) {
              (Value::BulkString(channel), Value::BulkString(payload)) => {
                let channel = String::from_utf8_lossy(channel).to_string();
                tracing::debug!("[Temple] Received PubSub message on channel: {}", channel);
                tracing::debug!("[Temple] Raw payload: {:?}", String::from_utf8_lossy(payload));

                match serde_json::from_slice::<RedisEventObject>(payload) {
                  Ok(event) => {
                    let envelope = RedisEventEnvelope {
                      channel: channel.clone(),
                      event,
                      received_at: chrono::Utc::now().timestamp_millis() as u64,
                    };
                    match event_tx.send(envelope) {
                      Ok(count) => tracing::debug!(
                        "Event sent to {} WebSocket(s) on channel: {}, payload: {:?}",
                        count,
                        channel,
                        String::from_utf8_lossy(payload)
                      ),
                      
                      Err(e) => tracing::warn!("Failed to send RedisEventEnvelope: {}", e),
                    }
                  }
                  Err(e) => {
                    tracing::warn!("[Temple] Failed to parse RedisEventObject: {}", e);
                  }
                }
              }
              _ => {
                tracing::debug!("[Temple] Unexpected pubsub data format: {:?}", push.data);
              }
            }
          } else {
            tracing::debug!("[Temple] Insufficient pubsub data length: {:?}", push.data);
          }
        }
        _ => {
          tracing::debug!("[Temple] Ignored push kind: {:?}", push.kind);
        }
      }
    }

    tracing::warn!("[Temple] PubSub listener has exited.");
  })
}

pub fn spawn_watch_event_listener(
  mut rx: Receiver<WatchEvent>,
  mut conn: MultiplexedConnection
) -> JoinHandle<()> {
  tracing::info!("[Temple] Spawning Redis WatchEvent listener task");

  tokio::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        WatchEvent::Watch(key) => {
          let channel = format!("key:{}", key);
          tracing::info!("[Temple] Subscribing to Redis channel: {}", channel);

          if let Err(e) = conn.subscribe(&channel).await {
            tracing::error!("[Temple] Failed to subscribe to {channel}: {}", e);
          }
        }

        WatchEvent::Unwatch(key) => {
          let channel = format!("key:{}", key);
          tracing::info!("[Temple] Unsubscribing from Redis channel: {}", channel);

          if let Err(e) = conn.unsubscribe(&channel).await {
            tracing::error!("[Temple] Failed to unsubscribe from {channel}: {}", e);
          }
        }
      }
    }

    tracing::warn!("[Temple] Redis WatchEvent listener exiting");
  })
}

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

// pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
//   serde_json::from_str::<RedisWsMessage>(json)
// }

pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
  serde_json::from_str::<RedisWsMessage>(json).or_else(|_| {
    serde_json::from_str::<RedisCommand>(json).map(|cmd| {
      RedisWsMessage {
        message: Some(redis_ws_message::Message::Command(cmd)),
      }
    })
  })
}

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
    command: RedisCommandType::Set { key, value },
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
  use crate::proto::redis::{RedisWsMessage, redis_ws_message::Message, ErrorMessage};

  let error_msg = RedisWsMessage {
      message: Some(Message::ErrorMsg(ErrorMessage {
          error: msg.to_string(),
      })),
  };

  error_msg.as_json_string().unwrap_or_else(|| "{\"type\":\"error\",\"payload\":{\"error\":\"unknown\"}}".into())
}

pub fn convert_thin_ws_command(cmd: ThinWsCommand) -> RedisWsMessage {
  match cmd {
      ThinWsCommand::Set { key, value } => RedisWsMessage::from_command(RedisCommand {
          command: Some(Command::Set(SetCommand { key, value })),
      }),
      ThinWsCommand::Get { key } => RedisWsMessage::from_command(RedisCommand {
          command: Some(Command::Get(GetCommand { key })),
      }),
      ThinWsCommand::Del { key } => RedisWsMessage::from_command(RedisCommand {
          command: Some(Command::Del(DelCommand { key })),
      }),
      ThinWsCommand::Watch { key } => RedisWsMessage::from_watch_command(key),
  }
}