use std::sync::Arc;
// use bb8_redis::{ RedisConnectionManager, bb8::Pool };
use fred::{clients::Pool, prelude::*};
use tokio::{ sync::{ broadcast, mpsc::{ channel, Sender }, oneshot }, task::JoinHandle };
use super::watchmaster::WatchManager;

use crate::{
  error::JediError,
  proto::redis::RedisResponse,
  wrapper::{
    create_pubsub_connection_fred,
    redis_wrapper::{
      spawn_pubsub_listener_task,
      spawn_redis_worker,
      RedisEnvelope,
      RedisEventEnvelope,
    },
    spawn_watch_event_listener,
  },
};

pub struct TempleState {
  pub redis_pool: Pool,
  pub redis_tx: Sender<RedisEnvelope>,
  pub event_tx: broadcast::Sender<RedisEventEnvelope>,
  pub watch_manager: WatchManager,
  pub pubsub_task: JoinHandle<()>,
  pub watch_listener_task: JoinHandle<()>,
}

impl TempleState {
  pub async fn new(redis_url: &str) -> Result<Self, JediError> {
    tracing::info!("[Temple] TempleState::new() called");

    let config = Config::from_url(redis_url)
      .map_err(|e| JediError::Internal(format!("Invalid Redis URL: {e}").into()))?;

    let redis_pool = Builder::from_config(config.clone())
      .set_policy(ReconnectPolicy::default())
      .build_pool(4)
      .map_err(|e| JediError::Internal(format!("Redis pool build failed: {e}").into()))?;

    redis_pool
      .init()
      .await
      .map_err(|e| JediError::Internal(format!("Failed to init Redis pool: {e}").into()))?;

    let (tx, rx) = channel(100);
    spawn_redis_worker(redis_pool.clone(), rx).await;

    let (event_tx, _event_rx) = broadcast::channel::<RedisEventEnvelope>(128);
    let (watch_event_tx, watch_event_rx) = tokio::sync::mpsc::channel(256);
    let watch_manager = WatchManager::new(watch_event_tx);

    let (conn, push_rx) = create_pubsub_connection_fred(config.clone()).await?;

    let watch_listener_task = spawn_watch_event_listener(watch_event_rx, conn.clone());
    let pubsub_task = spawn_pubsub_listener_task(push_rx, event_tx.clone());

    tracing::info!("[Temple] TempleState fully initialized");

    Ok(Self {
      redis_pool,
      redis_tx: tx,
      event_tx,
      watch_manager,
      pubsub_task,
      watch_listener_task,
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

impl Drop for TempleState {
  fn drop(&mut self) {
    tracing::warn!("[Temple] TempleState has been DROPPED");
  }
}

#[derive(Clone)]
pub struct AppState(pub Arc<TempleState>);

pub type SharedState = Arc<TempleState>;
