use std::sync::{ Arc, atomic::{ AtomicU64, Ordering } };
use tokio::sync::RwLock;
use tokio::sync::{mpsc, oneshot};

use papaya::{ HashMap, Guard };
use axum::body::Bytes;
use tokio::time::Instant;
use jedi::state::temple::TempleState;
// use super::helper::{ReadRequest, WriteRequest};

use crate::proto::{store::StoreObj, wrapper::{ ReadEnvelope, StoreObjExt}};

#[derive(Default)]
pub struct StoreState {
  pub store: Arc<HashMap<String, (Bytes, Instant)>>,
}

impl StoreState {
  pub fn new() -> Self {
    Self {
      store: Arc::new(HashMap::default()),
    }
  }
  pub fn guard(&self) -> impl Guard + '_ {
    self.store.guard()
  }
  pub fn get<'guard>(
    &self,
    key: &str,
    guard: &'guard impl Guard
  ) -> Option<&'guard (Bytes, Instant)> {
    self.store.get(key, guard)
  }

  pub fn set(&self, key: String, value: Bytes, expires_at: Instant, guard: &impl Guard) {
    self.store.insert(key, (value, expires_at), guard);
  }

  pub fn replace_store(&mut self) {
    let old_store = std::mem::replace(&mut self.store, Arc::new(HashMap::default()));
    tokio::spawn(async move {
        let guard = old_store.guard();
        old_store.clear(&guard);
        drop(guard);
        drop(old_store);
        tracing::info!("[Disoxide] Store cleared and memory dropped");
    });
}


  
}

#[derive(Default)]
pub struct MetricsState {
  pub get_key_sum: AtomicU64,
  pub get_key_count: AtomicU64,
  pub set_key_sum: AtomicU64,
  pub set_key_count: AtomicU64,
}

impl MetricsState {
  pub fn new() -> Self {
    Self {
      get_key_sum: AtomicU64::new(0),
      get_key_count: AtomicU64::new(0),
      set_key_sum: AtomicU64::new(0),
      set_key_count: AtomicU64::new(0),
    }
  }
}

pub type StoreSharedState = Arc<RwLock<StoreState>>;
pub type MetricsSharedState = Arc<MetricsState>;
pub type TempleSharedState = Arc<TempleState>;

//** Global State */

pub struct AppGlobalState {
  pub store: StoreSharedState,
  pub metrics: MetricsSharedState,
  pub write_tx: mpsc::Sender<StoreObj>,
  pub read_tx: mpsc::Sender<ReadEnvelope>,
  pub temple: TempleSharedState,
}

impl AppGlobalState {
  pub async fn new(redis_url: &str) -> Self {

    tracing::info!("[AppGlobalState] AppGlobalState::new() called");


    let store = Arc::new(RwLock::new(StoreState::new()));
    let metrics = Arc::new(MetricsState::new());

    let (write_tx, mut write_rx) = mpsc::channel::<StoreObj>(1024);
    let (read_tx, mut read_rx) = mpsc::channel::<ReadEnvelope>(1024);

    let temple: Arc<TempleState> = TempleState::new(redis_url)
        .await
        .expect("Failed to initialize TempleState");
    // let _ = spawn_pubsub_listener(redis_url, vec!["key:1".into()], temple.event_tx.clone()).await;

    tokio::spawn({
      let store_clone = store.clone();
      async move {
        while let Some(obj) = write_rx.recv().await {
          let (key, value, expires_at): (String, Bytes, Instant) = obj.into();
          let store_ref = store_clone.write().await;
          let guard = store_ref.guard();
          store_ref.set(key, value, expires_at, &guard);
        }
      }
    });

    tokio::spawn({
      let store_clone = store.clone();
      async move {
        while let Some(ReadEnvelope { proto, response_tx }) = read_rx.recv().await {
          let store_ref = store_clone.read().await;
          let guard = store_ref.guard();
          let result = store_ref.get(&proto.key, &guard).cloned();
          let _ = response_tx.send(result);
        }
      }
    });

    Self {
      store,
      metrics,
      write_tx,
      read_tx,
      temple,
    }
  }

  pub fn record_metrics(&self, method: &str, elapsed: u64) {
    if method == "GET" {
      self.metrics.get_key_count.fetch_add(1, Ordering::Relaxed);
      self.metrics.get_key_sum.fetch_add(elapsed, Ordering::Relaxed);
    } else if method == "POST" {
      self.metrics.set_key_count.fetch_add(1, Ordering::Relaxed);
      self.metrics.set_key_sum.fetch_add(elapsed, Ordering::Relaxed);
    }
  }

  pub fn get_metrics(&self) -> (u64, u64, u64, u64) {
    let get_count = self.metrics.get_key_count.load(Ordering::Relaxed);
    let get_sum = self.metrics.get_key_sum.load(Ordering::Relaxed);
    let set_count = self.metrics.set_key_count.load(Ordering::Relaxed);
    let set_sum = self.metrics.set_key_sum.load(Ordering::Relaxed);

    (get_count, get_sum, set_count, set_sum)
  }
}

pub type SharedState = Arc<AppGlobalState>;
