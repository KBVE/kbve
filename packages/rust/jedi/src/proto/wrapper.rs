use serde::{ Deserialize, Serialize };
use crate::proto::redis::{
  RedisCommand,
  RedisResponse,
  SetCommand,
  GetCommand,
  DelCommand,
  redis_command::Command,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum RedisEnvelope {
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
    match envelope {
      RedisEnvelope::Set { key, value } =>
        RedisCommand {
          command: Some(Command::Set(SetCommand { key, value })),
        },
      RedisEnvelope::Get { key } =>
        RedisCommand {
          command: Some(Command::Get(GetCommand { key })),
        },
      RedisEnvelope::Del { key } =>
        RedisCommand {
          command: Some(Command::Del(DelCommand { key })),
        },
    }
  }
}

impl TryFrom<RedisCommand> for RedisEnvelope {
  type Error = &'static str;

  fn try_from(cmd: RedisCommand) -> Result<Self, Self::Error> {
    use Command;
    match cmd.command {
      Some(Command::Set(cmd)) =>
        Ok(RedisEnvelope::Set {
          key: cmd.key,
          value: cmd.value,
        }),
      Some(Command::Get(cmd)) =>
        Ok(RedisEnvelope::Get {
          key: cmd.key,
        }),
      Some(Command::Del(cmd)) =>
        Ok(RedisEnvelope::Del {
          key: cmd.key,
        }),
      None => Err("Missing Redis command variant"),
    }
  }
}
