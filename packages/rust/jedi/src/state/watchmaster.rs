use dashmap::DashSet;
use papaya::HashMap;
use papaya::Guard;
use std::sync::Arc;
// use rustc_hash::FxHasher;
// use std::hash::{Hash, Hasher};


// pub fn hash_key<T: Hash>(value: &T) -> u64 {
//     let mut hasher = FxHasher::default();
//     value.hash(&mut hasher);
//     hasher.finish()
// }

pub type ConnId = String;

#[derive(Default)]
pub struct WatchList {
  keys: DashSet<String>,
}

impl WatchList {
  
    pub fn new() -> Self {
        Self {
          keys: DashSet::new(),
        }
      }
    
      pub fn watch(&self, key: impl Into<String>) {
        self.keys.insert(key.into());
      }
    
      pub fn unwatch(&self, key: &str) {
        self.keys.remove(key);
      }
    
      pub fn is_watching(&self, key: &str) -> bool {
        self.keys.contains(key)
      }
    
      pub fn all(&self) -> Vec<String> {
        self.keys.iter().map(|k| k.clone()).collect()
      }

}

#[derive(Default)]
pub struct WatchManager {
  inner: Arc<HashMap<ConnId, Arc<WatchList>>>,
}

impl WatchManager {
  pub fn new() -> Self {
    Self {
      inner: Arc::new(HashMap::default()),
    }
  }

  pub fn get_watchlist(&self, conn_id: &ConnId, guard: &impl Guard) -> Option<Arc<WatchList>> {
    self.inner.get(conn_id, guard).cloned()
  }

  pub fn create_watchlist(&self, conn_id: ConnId, guard: &impl Guard) -> Arc<WatchList> {
    let list = Arc::new(WatchList::new());
    self.inner.insert(conn_id, list.clone(), guard);
    list
  }

  pub fn remove_watchlist(&self, conn_id: &ConnId, guard: &impl Guard) {
    self.inner.remove(conn_id, guard);
  }

  pub fn guard(&self) -> impl Guard + '_ {
    self.inner.guard()
  }
}
