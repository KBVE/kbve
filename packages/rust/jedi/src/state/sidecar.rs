use std::fs;
use std::env;

pub fn get_env(key: &str, default: &str) -> String {
  let file_key = format!("{}_FILE", key);
  if let Ok(path) = env::var(&file_key) {
    fs::read_to_string(path)
      .map(|s| s.trim().to_string())
      .unwrap_or_else(|_| default.to_string())
  } else {
    env::var(key).unwrap_or_else(|_| default.to_string())
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
