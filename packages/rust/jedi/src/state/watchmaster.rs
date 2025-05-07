use dashmap::DashSet;
use papaya::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

use crate::{
  error::JediError,
  proto::jedi::{ JediEnvelope, MessageKind, PayloadFormat },
  entity::envelope::wrap_hybrid,
  entity::pipe_redis::KeyValueInput,
};

pub type ConnId = [u8; 16];

pub type WatchedKeys = Arc<DashSet<Arc<str>>>;
pub type WatchedConns = Arc<DashSet<ConnId>>;


pub struct WatchManager {
  pub key_to_conns: Arc<HashMap<Arc<str>, WatchedConns>>,
  pub conn_to_keys: Arc<HashMap<ConnId, WatchedKeys>>,
  pub event_tx: UnboundedSender<JediEnvelope>,
  pub format: PayloadFormat,

}

const WATCH_KIND: i32 = MessageKind::Redis as i32
  | MessageKind::Heartbeat as i32
  | MessageKind::Read as i32
  | MessageKind::Info as i32;

const UNWATCH_KIND: i32 = MessageKind::Redis as i32
  | MessageKind::Heartbeat as i32
  | MessageKind::Del as i32
  | MessageKind::Info as i32;

impl WatchManager {
  pub fn new(event_tx: UnboundedSender<JediEnvelope>, format: PayloadFormat) -> Self {
    Self {
      key_to_conns: Arc::new(HashMap::default()),
      conn_to_keys: Arc::new(HashMap::default()),
      event_tx,
      format,
    }
  }

   fn emit_watch_event(&self, key: &Arc<str>, kind: i32) {
    let payload = KeyValueInput {
      key: Arc::clone(key),
      value: None,
      ttl: None,
    };

    let envelope = wrap_hybrid(kind, self.format, &payload, None);

    if let Err(e) = self.event_tx.send(envelope) {
      tracing::warn!("[WatchManager] Failed to send watch event: {}", e);
    }
  }

  pub fn watch<K: Into<Arc<str>>>(&self, conn_id: ConnId, key: K) -> Result<(), JediError> {
    let key = key.into();

    let key_guard = self.key_to_conns.guard();
    let conns = self.key_to_conns
      .get(&key, &key_guard)
      .cloned()
      .unwrap_or_else(|| {
        let new = Arc::new(DashSet::new());
        self.key_to_conns.insert(Arc::clone(&key), new.clone(), &key_guard);
        new
      });

    if !conns.insert(conn_id) {
      return Err(JediError::BadRequest("Already watching this key".into()));
    }

    let conn_guard = self.conn_to_keys.guard();
    let keys = self.conn_to_keys
      .get(&conn_id, &conn_guard)
      .cloned()
      .unwrap_or_else(|| {
        let new = Arc::new(DashSet::new());
        self.conn_to_keys.insert(conn_id, new.clone(), &conn_guard);
        new
      });

    keys.insert(Arc::clone(&key));

    if conns.len() == 1 {
      self.emit_watch_event(&key, WATCH_KIND);

    }

    Ok(())
  }

  pub fn unwatch<K: Into<Arc<str>>>(&self, conn_id: &ConnId, key: K) -> Result<bool, JediError> {
    let key_arc = key.into();
    let mut last = false;

    let key_guard = self.key_to_conns.guard();
    let is_watching = self.key_to_conns
      .get(&key_arc, &key_guard)
      .map(|conns| conns.contains(conn_id))
      .unwrap_or(false);

    if !is_watching {
      return Err(JediError::BadRequest("This key is not watched by the connection".into()));
    }

    if let Some(conns) = self.key_to_conns.get(&key_arc, &key_guard) {
      conns.remove(conn_id);
      if conns.is_empty() {
        self.key_to_conns.remove(&key_arc, &key_guard);
        last = true;

        let envelope = wrap_hybrid(
          MessageKind::UNWATCH,
          PayloadFormat::Json,
          &serde_json::json!({ "key": key_arc }),
          None,
        );
        let _ = self.event_tx.send(envelope);
      }
    }

    let conn_guard = self.conn_to_keys.guard();
    if let Some(keys) = self.conn_to_keys.get(conn_id, &conn_guard) {
      keys.remove(&key_arc);
      if keys.is_empty() {
        self.conn_to_keys.remove(conn_id, &conn_guard);
      }
    }

    Ok(last)
  }

  pub fn remove_connection(&self, conn_id: &ConnId) -> Vec<Arc<str>> {
    let removed_keys: Vec<Arc<str>> = {
      let conn_guard = self.conn_to_keys.guard();
      self.conn_to_keys
        .get(conn_id, &conn_guard)
        .map(|set| set.iter().map(|k| Arc::clone(k.key())).collect())
        .unwrap_or_default()
    };

    removed_keys
      .into_iter()
      .filter_map(|key| match self.unwatch(conn_id, Arc::clone(&key)) {
        Ok(true) => Some(key),
        Ok(false) => None,
        Err(e) => {
          tracing::warn!("[WatchManager] Failed to unwatch: key={key}, conn={:?}, err={e}", conn_id);
          None
        }
      })
      .collect()
  }
  

  pub fn is_watching<K: Into<Arc<str>>>(&self, conn_id: &ConnId, key: K) -> bool {
    let key_arc = key.into();
    let guard = self.key_to_conns.guard();

    self.key_to_conns
      .get(&key_arc, &guard)
      .map(|set| set.contains(conn_id))
      .unwrap_or(false)
  }

  pub fn for_each_watcher_pin<K: Into<Arc<str>>, F: FnMut(&ConnId)>(&self, key: K, mut f: F) {
    let pinned = self.key_to_conns.pin_owned();
    let key_arc = key.into();

    if let Some(set) = pinned.get(&key_arc) {
      for conn in set.iter() {
        f(conn.key());
      }
    }
  }

  pub fn for_each_watcher<K: Into<Arc<str>>, F: FnMut(&ConnId)>(&self, key: K, mut f: F) {
    let key_arc = key.into();
    let guard = self.key_to_conns.guard();

    if let Some(set) = self.key_to_conns.get(&key_arc, &guard) {
      for conn in set.iter() {
        f(conn.key());
      }
    }
  }

  pub fn for_each_key_pin<F: FnMut(&Arc<str>)>(&self, conn_id: &ConnId, mut f: F) {
    let pinned = self.conn_to_keys.pin_owned();

    if let Some(set) = pinned.get(conn_id) {
      for key in set.iter() {
        f(key.key());
      }
    }
  }

  pub fn for_each_key<F: FnMut(&Arc<str>)>(&self, conn_id: &ConnId, mut f: F) {
    let guard = self.conn_to_keys.guard();

    if let Some(set) = self.conn_to_keys.get(conn_id, &guard) {
      for key in set.iter() {
        f(key.key());
      }
    }
  }

  pub fn has_watchers<K: Into<Arc<str>>>(&self, key: K) -> bool {
    let key_arc = key.into();
    let guard = self.key_to_conns.guard();

    self.key_to_conns
      .get(&key_arc, &guard)
      .map(|set| !set.is_empty())
      .unwrap_or(false)
  }
}
