use std::sync::Arc;
use bb8_redis::{ RedisConnectionManager, bb8::Pool };
use tokio::{sync::{ broadcast, mpsc::{ channel, Sender }, oneshot }, task::JoinHandle};
use super::watchmaster::WatchManager;

use crate::{
  error::JediError,
  proto::redis::RedisResponse,
  wrapper::redis_wrapper::{ spawn_redis_worker, RedisEnvelope, RedisEventEnvelope, spawn_pubsub_listener_task },
};

pub struct TempleState {
  pub redis_pool: Pool<RedisConnectionManager>,
  pub redis_tx: Sender<RedisEnvelope>,
  pub event_tx: broadcast::Sender<RedisEventEnvelope>,
  pub watch_manager: WatchManager,
  pub pubsub_task: JoinHandle<()>,
}

impl TempleState {
  pub async fn new(redis_url: &str) -> Self {
    tracing::info!("[Temple] TempleState::new() called");

    let manager = RedisConnectionManager::new(redis_url).unwrap();
    let pool = Pool::builder().build(manager).await.unwrap();

    let (tx, rx) = channel(100);
    spawn_redis_worker(pool.clone(), rx).await;

    let (event_tx, _event_rx) = broadcast::channel::<RedisEventEnvelope>(128);

    let watch_manager = WatchManager::new();


    let pubsub_task = spawn_pubsub_listener_task(
      redis_url.to_string(),
      vec!["key:1".into()],
      event_tx.clone(),
  );


    Self {
      redis_pool: pool,
      redis_tx: tx,
      event_tx,
      watch_manager,
      pubsub_task
    }
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

  pub fn subscribe_events(&self) -> broadcast::Receiver<RedisEventEnvelope> {
    self.event_tx.subscribe()
  }

  pub fn emit_event(
    &self,
    envelope: RedisEventEnvelope
  ) -> Result<usize, broadcast::error::SendError<RedisEventEnvelope>> {
    self.event_tx.send(envelope)
  }
}

#[derive(Clone)]
pub struct AppState(pub Arc<TempleState>);

pub type SharedState = Arc<TempleState>;
