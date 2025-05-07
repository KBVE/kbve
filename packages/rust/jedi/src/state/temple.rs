use std::sync::Arc;
// use bb8_redis::{ RedisConnectionManager, bb8::Pool };
use fred::{clients::Pool, prelude::*};
use tokio::{ sync::{ broadcast, mpsc::{ channel, Sender }, oneshot }, task::JoinHandle };
use super::watchmaster::WatchManager;

use crate::{
  error::JediError,
  proto::jedi::JediEnvelope,
  entity::envelope::{EnvelopePipeline, EnvelopeWorkItem},
  entity::pipe_redis::faucet_redis::{create_pubsub_connection_fred, spawn_redis_worker, spawn_pubsub_listener_task, spawn_watch_event_listener},
};

pub struct TempleState {
  pub redis_pool: Pool,
  pub envelope_tx: Sender<EnvelopeWorkItem>,
  pub event_tx: broadcast::Sender<JediEnvelope>,
  pub watch_manager: WatchManager,
  pub pubsub_task: JoinHandle<()>,
  pub watch_listener_task: JoinHandle<()>,
}

impl TempleState {
  pub async fn new(redis_url: &str) -> Result<Arc<Self>, JediError> {
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

      let (envelope_tx, envelope_rx) = tokio::sync::mpsc::channel(128);
      let (event_tx, _event_rx) = broadcast::channel::<JediEnvelope>(128);
      let (watch_event_tx, watch_event_rx) = tokio::sync::mpsc::unbounded_channel();
      let watch_manager = WatchManager::new(watch_event_tx);
  
      let (conn, push_rx) = create_pubsub_connection_fred(config.clone()).await?;
      let watch_listener_task = spawn_watch_event_listener(watch_event_rx, conn.clone());
      let pubsub_task = spawn_pubsub_listener_task(push_rx, event_tx.clone());
  
      let temple = Arc::new(Self {
        redis_pool,
        envelope_tx,
        event_tx,
        watch_manager,
        pubsub_task,
        watch_listener_task,
      });

      spawn_redis_worker(temple.clone(), envelope_rx);


    tracing::info!("[Temple] TempleState fully initialized");

    Ok(temple)
  }

  pub async fn send_envelope(&self, env: JediEnvelope) -> Result<JediEnvelope, JediError> {
    let (tx, rx) = oneshot::channel();
    let item = EnvelopeWorkItem {
      envelope: env,
      response_tx: Some(tx),
    };

    self.envelope_tx
      .send(item)
      .await
      .map_err(|_| JediError::Internal("Redis pipeline is unavailable".into()))?;

    rx.await.map_err(|_| JediError::Internal("Failed to receive response".into()))
  }

  pub fn subscribe_events(&self) -> broadcast::Receiver<JediEnvelope> {
    self.event_tx.subscribe()
  }

  pub fn emit_event(&self, env: JediEnvelope) -> Result<usize, broadcast::error::SendError<JediEnvelope>> {
    self.event_tx.send(env)
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
