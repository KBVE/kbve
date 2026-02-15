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

#[cfg(feature = "clickhouse")]
pub struct ClickHouseConfig {
  pub url: String,
  pub user: String,
  pub password: String,
  pub database: String,
}

#[cfg(feature = "clickhouse")]
impl ClickHouseConfig {
  pub fn from_env() -> Self {
    let host = get_env("CLICKHOUSE_HOST", "localhost");
    let port = get_env("CLICKHOUSE_PORT", "8123");
    let user = get_env("CLICKHOUSE_USER", "default");
    let password = get_env("CLICKHOUSE_PASSWORD", "");
    let database = get_env("CLICKHOUSE_DATABASE", "default");

    let url = format!("http://{}:{}", host, port);

    Self { url, user, password, database }
  }

  pub fn build_client(&self) -> clickhouse::Client {
    let mut client = clickhouse::Client::default()
      .with_url(&self.url)
      .with_user(&self.user)
      .with_database(&self.database);

    if !self.password.is_empty() {
      client = client.with_password(&self.password);
    }

    client
  }

  pub async fn execute_select(&self, query: &str) -> Result<Vec<serde_json::Value>, JediError> {
    let http = reqwest::Client::new();
    let full_query = format!("{} FORMAT JSONEachRow", query);

    let mut req = http
      .post(&self.url)
      .query(&[("database", &self.database)])
      .body(full_query);

    if !self.user.is_empty() {
      req = req.header("X-ClickHouse-User", &self.user);
    }
    if !self.password.is_empty() {
      req = req.header("X-ClickHouse-Key", &self.password);
    }

    let resp = req
      .send()
      .await
      .map_err(|e| JediError::Database(Cow::Owned(format!("ClickHouse HTTP error: {}", e))))?;

    if !resp.status().is_success() {
      let body = resp.text().await.unwrap_or_default();
      return Err(JediError::Database(Cow::Owned(format!("ClickHouse query failed: {}", body))));
    }

    let text = resp
      .text()
      .await
      .map_err(|e| JediError::Database(Cow::Owned(format!("ClickHouse response error: {}", e))))?;

    let rows: Vec<serde_json::Value> = text
      .lines()
      .filter(|l| !l.is_empty())
      .map(|l| serde_json::from_str(l))
      .collect::<Result<_, _>>()
      .map_err(|e| JediError::Parse(format!("ClickHouse JSON parse error: {}", e)))?;

    Ok(rows)
  }

  pub async fn execute_insert(&self, table: &str, rows: &[serde_json::Value]) -> Result<(), JediError> {
    if rows.is_empty() {
      return Ok(());
    }

    let body = rows
      .iter()
      .map(|r| serde_json::to_string(r))
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| JediError::Parse(format!("ClickHouse JSON serialize error: {}", e)))?
      .join("\n");

    let insert_query = format!("INSERT INTO {} FORMAT JSONEachRow", table);
    let http = reqwest::Client::new();

    let mut req = http
      .post(&self.url)
      .query(&[("database", &self.database), ("query", &insert_query)])
      .body(body);

    if !self.user.is_empty() {
      req = req.header("X-ClickHouse-User", &self.user);
    }
    if !self.password.is_empty() {
      req = req.header("X-ClickHouse-Key", &self.password);
    }

    let resp = req
      .send()
      .await
      .map_err(|e| JediError::Database(Cow::Owned(format!("ClickHouse HTTP error: {}", e))))?;

    if !resp.status().is_success() {
      let err_body = resp.text().await.unwrap_or_default();
      return Err(JediError::Database(Cow::Owned(format!("ClickHouse insert failed: {}", err_body))));
    }

    Ok(())
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
