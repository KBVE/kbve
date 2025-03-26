use dashmap::DashSet;
use papaya::{ HashMap, Guard };
use std::sync::Arc;
use tokio::sync::mpsc::{ Sender, Receiver };

pub type ConnId = [u8; 16];

pub type WatchedKeys = Arc<DashSet<Arc<str>>>;
pub type WatchedConns = Arc<DashSet<ConnId>>;

#[derive(Debug)]
pub enum WatchEvent {
  Watch(Arc<str>),
  Unwatch(Arc<str>),
}

pub struct WatchManager {
  pub key_to_conns: Arc<HashMap<Arc<str>, WatchedConns>>,
  pub conn_to_keys: Arc<HashMap<ConnId, WatchedKeys>>,
  pub event_tx: Sender<WatchEvent>,
}

impl WatchManager {
  pub fn new(event_tx: Sender<WatchEvent>) -> Self {
    Self {
      key_to_conns: Arc::new(HashMap::default()),
      conn_to_keys: Arc::new(HashMap::default()),
      event_tx,
    }
  }

  pub fn guard(&self) -> impl Guard + '_ {
    self.key_to_conns.guard()
  }

  pub fn watch<K: Into<Arc<str>>>(&self, conn_id: ConnId, key: K, guard: &impl Guard) -> bool {
    let key = key.into();

    let conns = self.key_to_conns
      .get(&key, guard)
      .cloned()
      .unwrap_or_else(|| {
        let new = Arc::new(DashSet::new());
        self.key_to_conns.insert(Arc::clone(&key), new.clone(), guard);
        new
      });

    let is_first = conns.insert(conn_id);

    if is_first && conns.len() == 1 {
      let _ = self.event_tx.try_send(WatchEvent::Watch(Arc::clone(&key)));
    }

    let keys = self.conn_to_keys
      .get(&conn_id, guard)
      .cloned()
      .unwrap_or_else(|| {
        let new = Arc::new(DashSet::new());
        self.conn_to_keys.insert(conn_id, new.clone(), guard);
        new
      });

    keys.insert(Arc::clone(&key));

    conns.len() == 1
  }

  pub fn unwatch<K: Into<Arc<str>>>(&self, conn_id: &ConnId, key: K, guard: &impl Guard) -> bool {
    let key_arc = key.into();
    let mut last = false;

    if let Some(conns) = self.key_to_conns.get(&key_arc, guard) {
      conns.remove(conn_id);
      if conns.is_empty() {
        self.key_to_conns.remove(&key_arc, guard);
        last = true;

        let _ = self.event_tx.try_send(WatchEvent::Unwatch(Arc::clone(&key_arc)));
      }
    }

    if let Some(keys) = self.conn_to_keys.get(conn_id, guard) {
      keys.remove(&key_arc);
      if keys.is_empty() {
        self.conn_to_keys.remove(conn_id, guard);
      }
    }

    last
  }

  pub fn remove_connection(&self, conn_id: &ConnId, guard: &impl Guard) -> Vec<Arc<str>> {
    let mut removed_keys = Vec::new();

    if let Some(keys) = self.conn_to_keys.get(conn_id, guard) {
      for key in keys.iter() {
        if self.unwatch(conn_id, Arc::clone(key.key()), guard) {
          removed_keys.push(Arc::clone(key.key()));
        }
      }
    }

    self.conn_to_keys.remove(conn_id, guard);
    removed_keys
  }

  pub fn is_watching<K: Into<Arc<str>>>(
    &self,
    conn_id: &ConnId,
    key: K,
    guard: &impl Guard
  ) -> bool {
    let key_arc = key.into();
    self.key_to_conns
      .get(&key_arc, guard)
      .map(|set| set.contains(conn_id))
      .unwrap_or(false)
  }

  pub fn for_each_watcher<K: Into<Arc<str>>, F: FnMut(&ConnId)>(&self, key: K, mut f: F) {
    let pinned = self.key_to_conns.pin_owned();
    let key_arc = key.into();

    if let Some(set) = pinned.get(&key_arc) {
      for conn in set.iter() {
        f(conn.key());
      }
    }
  }

  pub fn for_each_key<F: FnMut(&Arc<str>)>(&self, conn_id: &ConnId, mut f: F) {
    let pinned = self.conn_to_keys.pin_owned();

    if let Some(set) = pinned.get(conn_id) {
      for key in set.iter() {
        f(key.key());
      }
    }
  }

  pub fn has_watchers<K: Into<Arc<str>>>(&self, key: K, guard: &impl Guard) -> bool {
    let key_arc = key.into();
    self.key_to_conns
      .get(&key_arc, guard)
      .map(|set| !set.is_empty())
      .unwrap_or(false)
  }
}
