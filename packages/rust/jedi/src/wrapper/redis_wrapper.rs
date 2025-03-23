use serde::{ Deserialize, Serialize };
use tokio::sync::oneshot;
use crate::proto::redis::{
  RedisCommand,
  RedisResponse,
  SetCommand,
  GetCommand,
  DelCommand,
  redis_command::Command,
};

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
