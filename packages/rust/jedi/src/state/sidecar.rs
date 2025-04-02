use std::borrow::Cow;
use std::env;
use chrono::Utc;
use serde::{ Deserialize, Serialize, de::DeserializeOwned };
use crate::error::JediError;
use std::sync::Arc;
use std::path::PathBuf;
use tokio::fs;

pub fn get_env(key: &str, default: &str) -> String {
  let file_key = format!("{}_FILE", key);
  if let Ok(path) = env::var(&file_key) {
    std::fs
      ::read_to_string(path)
      .map(|s| s.trim().to_string())
      .unwrap_or_else(|_| default.to_string())
  } else {
    env::var(key).unwrap_or_else(|_| default.to_string())
  }
}

pub async fn get_env_async(key: &str, default: &str) -> String {
  let file_key = format!("{}_FILE", key);
  if let Ok(path) = env::var(&file_key) {
    tokio::fs
      ::read_to_string(path).await
      .map(|s| s.trim().to_string())
      .unwrap_or_else(|_| default.to_string())
  } else {
    env::var(key).unwrap_or_else(|_| default.to_string())
  }
}

#[derive(Debug, Clone)]
pub struct FileTokenStorage<T> {
  pub(crate) path: Arc<PathBuf>,
  _phantom: std::marker::PhantomData<T>,
}

impl<T> FileTokenStorage<T> where T: Serialize + DeserializeOwned + Send + Sync + 'static {
  pub fn new<P: Into<PathBuf>>(path: P) -> Self {
    Self {
      path: Arc::new(path.into()),
      _phantom: std::marker::PhantomData,
    }
  }

  pub async fn load(&self) -> Option<T> {
    match fs::read_to_string(&*self.path).await {
      Ok(contents) => {
        match serde_json::from_str::<T>(&contents) {
          Ok(token) => Some(token),
          Err(e) => {
            tracing::warn!("Failed to parse token JSON: {}", e);
            None
          }
        }
      }
      Err(e) => {
        tracing::warn!("Failed to read token file: {}", e);
        None
      }
    }
  }

  pub async fn save(&self, value: &T) {
    if let Ok(json) = serde_json::to_string_pretty(value) {
      if let Err(e) = fs::write(&*self.path, json).await {
        tracing::error!("Failed to write token file: {}", e);
      } else {
        tracing::debug!("Token saved at {:?}", self.path);
      }
    }
  }

    pub async fn try_load(&self) -> Result<T, JediError> {
      let contents = fs::read_to_string(&*self.path).await?;
      let token = serde_json::from_str::<T>(&contents)
        .map_err(|e| JediError::Internal(Cow::Owned(format!("Parse error: {e}"))))?;
      Ok(token)
    }
  
    pub async fn try_save(&self, value: &T) -> Result<(), JediError> {
      let json = serde_json::to_string_pretty(value)
        .map_err(|e| JediError::Internal(Cow::Owned(format!("Serialize error: {e}"))))?;
      fs::write(&*self.path, json).await?;
      Ok(())
    }
}

pub struct RedisConfig {
  pub url: String,
}

impl RedisConfig {
  pub fn from_env() -> Self {
    let host = get_env("REDIS_HOST", "localhost");
    let port = get_env("REDIS_PORT", "6379");
    let password = get_env("REDIS_PASSWORD", "");

    let url = if password.is_empty() {
      format!("redis://{}:{}", host, port)
    } else {
      format!("redis://:{}@{}:{}", password, host, port)
    };

    Self { url }
  }
}

pub struct TwitchAuth {
  pub client_id: String,
  pub client_secret: String,
  pub token_path: String,
}

impl TwitchAuth {
  pub fn from_env() -> Self {
    let client_id = get_env("TWITCH_CLIENT_ID", "");
    let client_secret = get_env("TWITCH_CLIENT_SECRET", "");
    let token_path = get_env("TWITCH_TOKEN_PATH", "twitch_tokens.json");

    if client_id.is_empty() || client_secret.is_empty() {
      panic!("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET");
    }

    Self { client_id, client_secret, token_path }
  }
}

#[derive(Serialize, Deserialize, Debug)]
struct EnvTwitchToken {
  access_token: String,
  refresh_token: String,
  expires_in: i64,
  token_type: String,
  #[serde(default)]
  scope: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct TwitchFileToken {
  access_token: String,
  refresh_token: String,
  expires_in: i64,
  created_at: String,
}

pub fn save_twitch_json_from_env(env_key: &str, file_path: &str) -> Result<(), JediError> {
  let raw = std::env
    ::var(env_key)
    .map_err(|e| JediError::Internal(Cow::Owned(format!("env: {}", e))))?;
  let parsed: EnvTwitchToken = serde_json
    ::from_str(&raw)
    .map_err(|e| JediError::Internal(Cow::Owned(format!("json: {}", e))))?;

  let token = TwitchFileToken {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    expires_in: parsed.expires_in,
    created_at: Utc::now().to_rfc3339(),
  };

  let json = serde_json
    ::to_string_pretty(&token)
    .map_err(|e| JediError::Internal(Cow::Owned(format!("serde: {}", e))))?;
  std::fs
    ::write(file_path, json)
    .map_err(|e| JediError::Internal(Cow::Owned(format!("fs: {}", e))))?;

  tracing::debug!(
      env_key = %env_key,
      file_path = %file_path,
      "[Twitch] Token saved from environment to file"
  );

  Ok(())
}
