use std::sync::Arc;
use bb8_redis::{ RedisConnectionManager, bb8::Pool };
use tokio::sync::{ mpsc::{ channel, Sender }, oneshot };

use crate::{
  error::JediError,
  proto::redis::RedisResponse,
  wrapper::redis_wrapper::{ spawn_redis_worker, RedisEnvelope },
};

pub struct TempleState {
  pub redis_pool: Pool<RedisConnectionManager>,
  pub redis_tx: Sender<RedisEnvelope>,
}

impl TempleState {
  pub async fn new(redis_url: &str) -> Arc<Self> {
    let manager = RedisConnectionManager::new(redis_url).unwrap();
    let pool = Pool::builder().build(manager).await.unwrap();

    let (tx, rx) = channel(100);
    spawn_redis_worker(pool.clone(), rx).await;

    Arc::new(Self {
      redis_pool: pool,
      redis_tx: tx,
    })
  }
  pub async fn send_redis(&self, cmd: RedisEnvelope) -> Result<RedisResponse, JediError> {
    let (tx, rx) = oneshot::channel();
    let mut cmd = cmd;
    cmd.response_tx = Some(tx);
    self.redis_tx
      .send(cmd).await
      .map_err(|_| JediError::Internal("Redis worker not available".into()))?;
    rx.await.map_err(|_| JediError::Internal("Failed to receive Redis response".into()))
  }
}

#[derive(Clone)]
pub struct AppState(pub Arc<TempleState>);

pub type SharedState = Arc<TempleState>;
