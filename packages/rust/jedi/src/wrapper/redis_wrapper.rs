use serde::{ Deserialize, Serialize };
use tokio::sync::{ oneshot, broadcast::Sender as BroadcastSender };
use tokio::sync::mpsc::{ Receiver, unbounded_channel, UnboundedReceiver };
use bb8_redis::{ bb8::Pool, RedisConnectionManager };
use redis::{ Client, RedisResult, AsyncCommands, AsyncConnectionConfig, Value, PushInfo, PushKind };
use futures_util::{ StreamExt, SinkExt };
use dashmap::DashSet;

use crate::proto::redis::{ redis_event_object, redis_ws_message, RedisWsMessage };
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
use crate::watchmaster::WatchList;

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
}

impl RedisCommandType {
  pub fn key(&self) -> &str {
    match self {
      Self::Set { key, .. } => key,
      Self::Get { key } => key,
      Self::Del { key } => key,
    }
  }
}

impl RedisEnvelope {
  pub fn set(key: String, value: String) -> Self {
    Self {
      id: None,
      command: RedisCommandType::Set { key, value },
      ttl_seconds: None,
      timestamp: None,
      response_tx: None,
    }
  }

  pub fn get(key: String) -> Self {
    Self {
      id: None,
      command: RedisCommandType::Get { key },
      ttl_seconds: None,
      timestamp: None,
      response_tx: None,
    }
  }

  pub fn del(key: String) -> Self {
    Self {
      id: None,
      command: RedisCommandType::Del { key },
      ttl_seconds: None,
      timestamp: None,
      response_tx: None,
    }
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

  pub fn as_json_string(&self) -> Option<String> {
    serde_json::to_string(self).ok()
  }
}

impl From<RedisEnvelope> for RedisCommand {
  fn from(envelope: RedisEnvelope) -> Self {
    match envelope.command {
      RedisCommandType::Set { key, value } =>
        RedisCommand {
          command: Some(Command::Set(SetCommand { key, value })),
        },
      RedisCommandType::Get { key } =>
        RedisCommand {
          command: Some(Command::Get(GetCommand { key })),
        },
      RedisCommandType::Del { key } =>
        RedisCommand {
          command: Some(Command::Del(DelCommand { key })),
        },
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
    use Command;
    match cmd.command {
      Some(Command::Set(cmd)) =>
        Ok(RedisEnvelope {
          id: None,
          ttl_seconds: None,
          timestamp: None,
          response_tx: None,
          command: RedisCommandType::Set {
            key: cmd.key,
            value: cmd.value,
          },
        }),
      Some(Command::Get(cmd)) =>
        Ok(RedisEnvelope {
          id: None,
          ttl_seconds: None,
          timestamp: None,
          response_tx: None,
          command: RedisCommandType::Get { key: cmd.key },
        }),
      Some(Command::Del(cmd)) =>
        Ok(RedisEnvelope {
          id: None,
          ttl_seconds: None,
          timestamp: None,
          response_tx: None,
          command: RedisCommandType::Del { key: cmd.key },
        }),
      None => Err("Missing Redis command variant"),
    }
  }
}

impl From<&RedisEnvelope> for RedisCommand {
  fn from(envelope: &RedisEnvelope) -> Self {
    match &envelope.command {
      RedisCommandType::Set { key, value } =>
        RedisCommand {
          command: Some(
            Command::Set(SetCommand {
              key: key.clone(),
              value: value.clone(),
            })
          ),
        },
      RedisCommandType::Get { key } =>
        RedisCommand {
          command: Some(
            Command::Get(GetCommand {
              key: key.clone(),
            })
          ),
        },
      RedisCommandType::Del { key } =>
        RedisCommand {
          command: Some(
            Command::Del(DelCommand {
              key: key.clone(),
            })
          ),
        },
    }
  }
}

//  ** Redis Handler

pub async fn spawn_redis_worker(
  pool: Pool<RedisConnectionManager>,
  mut rx: Receiver<RedisEnvelope>
) {
  tokio::spawn(async move {
    while let Some(envelope) = rx.recv().await {
      let mut conn = match pool.get().await {
        Ok(conn) => conn,
        Err(e) => {
          tracing::error!("Redis pool error: {e}");
          continue;
        }
      };

      let response = match envelope.command {
        RedisCommandType::Set { key, value } => {
          let res: redis::RedisResult<()> = conn.set(&key, &value).await;
          if res.is_ok() {
              let update = redis_key_update_value(&key, &value);
              let event = RedisEventObject {
                  object: Some(redis_event_object::Object::Update(update)),
              };
      
              if let Ok(payload) = serde_json::to_string(&event) {
                  tracing::debug!("Publishing RedisKeyUpdate on Set for channel: {}", redis_channel_for_key(&key));
                  let result: redis::RedisResult<i64> = conn.publish(redis_channel_for_key(&key), payload).await;
                  tracing::debug!("Publish result SET: {:?}", result);

              }
          }
          RedisResponse {
              status: format!("{:?}", res),
              value: String::new(),
          }
      }
        RedisCommandType::Get { key } => {
          let res: redis::RedisResult<String> = conn.get(&key).await;
          RedisResponse {
            status: format!("{:?}", res),
            value: res.unwrap_or_default(),
          }
        }
        RedisCommandType::Del { key } => {
          let res: redis::RedisResult<u64> = conn.del(&key).await;
          if res.is_ok() {
            let update = redis_key_update_deleted(&key);
            let event = RedisEventObject {
                object: Some(redis_event_object::Object::Update(update)),
            };
    
            if let Ok(payload) = serde_json::to_string(&event) {
              tracing::debug!("Publishing RedisKeyUpdate for Del on channel: {}", redis_channel_for_key(&key));
              let result: redis::RedisResult<i64> = conn.publish(redis_channel_for_key(&key), payload).await;
              tracing::debug!("Publish result DEL: {:?}", result);

            }
        }
          RedisResponse {
            status: format!("{:?}", res),
            value: String::new(),
          }
        }
      };

      if let Some(tx) = envelope.response_tx {
        let _ = tx.send(response);
      }
    }
  });
}

pub async fn spawn_pubsub_listener(
  redis_url: &str,
  channels: Vec<String>,
  event_tx: BroadcastSender<RedisEventEnvelope>
) -> RedisResult<()> {
  let full_url = if redis_url.contains('?') {
    format!("{redis_url}&protocol=resp3")
  } else {
    format!("{redis_url}?protocol=resp3")
  };

  tracing::info!("Connecting to Redis for PubSub at: {}", full_url);
  let client = Client::open(full_url)?;
  let (tx, mut rx) = unbounded_channel::<PushInfo>();

  let config = AsyncConnectionConfig::default().set_push_sender(tx);
  let mut conn = client.get_multiplexed_async_connection_with_config(&config).await?;

  for ch in &channels {
    tracing::info!("Subscribed to Redis channel: {}", ch);
    conn.subscribe(ch).await?;
  }

  tokio::spawn(async move {
    while let Some(push) = rx.recv().await {

      tracing::debug!("Received push: kind={:?} data={:?}", push.kind, push.data);
      match push.kind {
        PushKind::Message | PushKind::PMessage | PushKind::SMessage => {
          if push.data.len() >= 3 {
            match (&push.data[1], &push.data[2]) {
              (Value::BulkString(channel), Value::BulkString(payload)) => {
                let channel = String::from_utf8_lossy(channel).to_string();
                tracing::debug!("Received PubSub message on channel: {}", channel);
                tracing::debug!("Raw payload: {:?}", String::from_utf8_lossy(payload));
                match serde_json::from_slice::<RedisEventObject>(payload) {
                  Ok(event) => {
                    tracing::debug!("Parsed RedisEventObject successfully");
                    let envelope = RedisEventEnvelope {
                      channel,
                      event,
                      received_at: chrono::Utc::now().timestamp_millis() as u64,
                    };
                    let _ = event_tx.send(envelope);
                  }
                  Err(e) => {
                    tracing::warn!("Failed to parse RedisEventObject: {}", e);
                  }
                }
              }
              _ => {
                tracing::debug!("Unexpected pubsub data format: {:?}", push.data);
              }
            }
          } else {
            tracing::debug!("Insufficient pubsub data length: {:?}", push.data);
          }
        }
        other => {
          tracing::debug!("Ignored push kind: {:?}", other);
        }
      }
    }
  });

  Ok(())
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

pub fn should_emit_update(key_update: &RedisKeyUpdate, watchlist: &DashSet<String>) -> bool {
  watchlist.contains(&key_update.key)
}

pub fn create_ws_update_if_watched(
  key_update: &RedisKeyUpdate,
  watchlist: &DashSet<String>
) -> Option<RedisWsMessage> {
  if should_emit_update(key_update, watchlist) {
    Some(redis_ws_update_msg(key_update.clone()))
  } else {
    None
  }
}

pub fn parse_ws_command(json: &str) -> Result<RedisWsMessage, serde_json::Error> {
  serde_json::from_str::<RedisWsMessage>(json)
}

pub fn extract_watch_command_key(msg: &RedisWsMessage) -> Option<&str> {
  match &msg.message {
    Some(redis_ws_message::Message::Watch(cmd)) => Some(&cmd.key),
    _ => None,
  }
}

pub fn build_redis_envelope_from_ws(msg: &RedisWsMessage) -> Option<RedisEnvelope> {
  match &msg.message {
    Some(redis_ws_message::Message::Command(cmd)) => RedisEnvelope::try_from(cmd.clone()).ok(),
    _ => None,
  }
}

pub fn add_watch_key(watchlist: &DashSet<String>, key: impl Into<String>) {
  watchlist.insert(key.into());
}

pub fn remove_watch_key(watchlist: &DashSet<String>, key: &str) {
  watchlist.remove(key);
}

pub fn redis_key_update_from_response(
  key: impl Into<String>,
  resp: &RedisResponse
) -> RedisKeyUpdate {
  let key = key.into();
  if resp.value.is_empty() {
    redis_key_update_deleted(key)
  } else {
    redis_key_update_value(key, &resp.value)
  }
}

pub fn redis_channel_for_key(key: &str) -> String {
  format!("key:{}", key)
}

pub fn format_key_update_log(update: &RedisKeyUpdate) -> String {
  let (k, v) = update.clone().into_log_fields();
  format!("{} -> {}", k, v)
}

pub fn filter_updates_for_watchlist<'a>(
  updates: impl Iterator<Item = &'a RedisKeyUpdate>,
  watchlist: &DashSet<String>
) -> Vec<RedisWsMessage> {
  updates.filter_map(|upd| create_ws_update_if_watched(upd, watchlist)).collect()
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

pub fn should_emit_update_hashed(key_update: &RedisKeyUpdate, list: &WatchList) -> bool {
  list.is_watching(&key_update.key)
}
