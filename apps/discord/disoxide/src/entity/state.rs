use std::sync::{ Arc, atomic::{ AtomicU64, Ordering } };
use tokio::sync::RwLock;
use papaya::{ HashMap, Guard };
use axum::body::Bytes;
use tokio::time::Instant;

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
    self.store = Arc::new(HashMap::default());
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

//** Global State */

pub struct GlobalState {
  pub store: StoreSharedState,
  pub metrics: MetricsSharedState,
}

impl GlobalState {
  pub fn new() -> Self {
    Self {
      store: Arc::new(RwLock::new(StoreState::new())),
      metrics: Arc::new(MetricsState::new()),
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

pub type SharedState = Arc<GlobalState>;
