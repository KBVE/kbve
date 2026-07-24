use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;

static PERSIST_SEQ: AtomicU64 = AtomicU64::new(0);

pub const DEFAULT_STATE_FLUSH_MS: u64 = 1000;

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum TorrentState { Leeching, Seeding, Reaped, Failed }

#[derive(Clone, Debug, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub enum TranscodeStatus { #[default] None, Pending, Remuxing, Encoding, Ready, Failed }

#[derive(Clone, Debug, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub enum HlsStatus { #[default] None, Starting, Live, Ready, Failed }

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Metadata {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub completed_at: Option<u64>,
    pub last_access: u64,
    pub state: TorrentState,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub active_path: Option<String>,
    #[serde(default)]
    pub transcode: TranscodeStatus,
    #[serde(default)]
    pub transcode_path: Option<String>,
    #[serde(default)]
    pub transcode_error: Option<String>,
    #[serde(default)]
    pub hls: HlsStatus,
    #[serde(default)]
    pub hls_dir: Option<String>,
    #[serde(default)]
    pub hls_error: Option<String>,
}

#[derive(Clone)]
pub struct StateStore {
    inner: Arc<Mutex<HashMap<String, Metadata>>>,
    path: PathBuf,
    dirty: Arc<Notify>,
}

impl StateStore {
    pub fn load(path: PathBuf) -> anyhow::Result<Self> {
        let map = if path.exists() {
            let bytes = std::fs::read(&path)?;
            serde_json::from_slice(&bytes)?
        } else {
            HashMap::new()
        };
        Ok(Self {
            inner: Arc::new(Mutex::new(map)),
            path,
            dirty: Arc::new(Notify::new()),
        })
    }

    fn write_file(path: &std::path::Path, map: &HashMap<String, Metadata>) -> anyhow::Result<()> {
        let seq = PERSIST_SEQ.fetch_add(1, Ordering::Relaxed);
        let tmp = path.with_extension(format!("json.tmp.{seq}"));
        let bytes = serde_json::to_vec_pretty(map)?;
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    fn snapshot(&self) -> HashMap<String, Metadata> {
        self.inner.lock().unwrap().clone()
    }

    fn persist_now(&self) -> anyhow::Result<()> {
        let snap = self.snapshot();
        Self::write_file(&self.path, &snap)
    }

    pub fn flush(&self) -> anyhow::Result<()> {
        self.persist_now()
    }

    pub fn upsert(&self, m: Metadata) -> anyhow::Result<()> {
        {
            let mut g = self.inner.lock().unwrap();
            g.insert(m.id.clone(), m);
        }
        self.persist_now()
    }

    pub fn get(&self, id: &str) -> Option<Metadata> {
        self.inner.lock().unwrap().get(id).cloned()
    }

    pub fn list(&self) -> Vec<Metadata> {
        self.inner.lock().unwrap().values().cloned().collect()
    }

    pub fn touch(&self, id: &str, now: u64) -> anyhow::Result<bool> {
        let hit = {
            let mut g = self.inner.lock().unwrap();
            match g.get_mut(id) {
                Some(m) => {
                    m.last_access = now;
                    true
                }
                None => false,
            }
        };
        if hit {
            self.dirty.notify_one();
        }
        Ok(hit)
    }

    pub fn remove(&self, id: &str) -> anyhow::Result<Option<Metadata>> {
        let removed = {
            let mut g = self.inner.lock().unwrap();
            g.remove(id)
        };
        self.persist_now()?;
        Ok(removed)
    }

    pub fn update<F, R>(&self, id: &str, f: F) -> anyhow::Result<Option<R>>
    where
        F: FnOnce(&mut Metadata) -> (R, bool),
    {
        let (result, dirty) = {
            let mut g = self.inner.lock().unwrap();
            match g.get_mut(id) {
                Some(m) => {
                    let (r, dirty) = f(m);
                    (Some(r), dirty)
                }
                None => (None, false),
            }
        };
        if dirty {
            self.persist_now()?;
        }
        Ok(result)
    }
}

pub async fn persist_loop(store: StateStore, debounce_ms: u64) {
    loop {
        store.dirty.notified().await;
        if debounce_ms > 0 {
            tokio::time::sleep(Duration::from_millis(debounce_ms)).await;
        }
        let snap = store.snapshot();
        let path = store.path.clone();
        match tokio::task::spawn_blocking(move || StateStore::write_file(&path, &snap)).await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!(error = %e, "state flush failed"),
            Err(e) => tracing::warn!(error = %e, "state flush task panicked"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn meta(id: &str, last_access: u64) -> Metadata {
        Metadata {
            id: id.into(), name: format!("t-{id}"), path: format!("/lib/{id}"),
            size: 10, completed_at: Some(last_access), last_access,
            state: TorrentState::Seeding, error: None, active_path: None,
            transcode: TranscodeStatus::None, transcode_path: None, transcode_error: None,
            hls: HlsStatus::None, hls_dir: None, hls_error: None,
        }
    }

    #[test]
    fn upsert_get_list_roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("state.json");
        let s = StateStore::load(p.clone()).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        s.upsert(meta("b", 200)).unwrap();
        assert_eq!(s.get("a").unwrap().last_access, 100);
        assert_eq!(s.list().len(), 2);
    }

    #[test]
    fn persists_and_reloads() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("state.json");
        { let s = StateStore::load(p.clone()).unwrap(); s.upsert(meta("a", 100)).unwrap(); }
        let s2 = StateStore::load(p).unwrap();
        assert_eq!(s2.get("a").unwrap().name, "t-a");
    }

    #[test]
    fn touch_updates_last_access() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("state.json")).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        assert!(s.touch("a", 999).unwrap());
        assert_eq!(s.get("a").unwrap().last_access, 999);
        assert!(!s.touch("missing", 1).unwrap());
    }

    #[test]
    fn touch_defers_disk_write_until_flush() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("state.json");
        let s = StateStore::load(p.clone()).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        s.touch("a", 999).unwrap();
        assert_eq!(s.get("a").unwrap().last_access, 999);
        assert_eq!(
            StateStore::load(p.clone()).unwrap().get("a").unwrap().last_access,
            100,
            "touch must not hit disk inline"
        );
        s.flush().unwrap();
        assert_eq!(
            StateStore::load(p).unwrap().get("a").unwrap().last_access,
            999,
            "flush persists coalesced touches"
        );
    }

    #[test]
    fn upsert_and_remove_persist_synchronously() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("state.json");
        let s = StateStore::load(p.clone()).unwrap();
        s.upsert(meta("a", 1)).unwrap();
        assert!(StateStore::load(p.clone()).unwrap().get("a").is_some());
        s.remove("a").unwrap();
        assert!(StateStore::load(p).unwrap().get("a").is_none());
    }

    #[test]
    fn remove_returns_and_deletes() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("state.json")).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        assert_eq!(s.remove("a").unwrap().unwrap().id, "a");
        assert!(s.get("a").is_none());
    }

    #[test]
    fn update_mutates_in_place_and_preserves_other_fields() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        let got = s
            .update("a", |m| {
                m.transcode = TranscodeStatus::Pending;
                (m.last_access, true)
            })
            .unwrap();
        assert_eq!(got, Some(100));
        let m = s.get("a").unwrap();
        assert_eq!(m.transcode, TranscodeStatus::Pending);
        assert_eq!(m.last_access, 100);
        assert!(s.update("missing", |_m| ((), true)).unwrap().is_none());
    }

    #[test]
    fn update_without_dirty_flag_does_not_change_persisted_state() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("s.json")).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        let got = s.update("a", |m| (m.last_access, false)).unwrap();
        assert_eq!(got, Some(100));
        let m = s.get("a").unwrap();
        assert_eq!(m.last_access, 100);
        assert_eq!(m.transcode, TranscodeStatus::None);
    }

    #[test]
    fn old_json_without_transcode_fields_loads_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("state.json");
        let legacy = r#"{"1":{"id":"1","name":"m","path":"/lib/m","size":3,"completed_at":10,"last_access":10,"state":"Seeding"}}"#;
        std::fs::write(&p, legacy).unwrap();
        let s = StateStore::load(p).unwrap();
        let m = s.get("1").unwrap();
        assert_eq!(m.transcode, TranscodeStatus::None);
        assert!(m.transcode_path.is_none());
        assert!(m.transcode_error.is_none());
    }

    #[test]
    fn active_path_roundtrips_and_defaults_none_on_legacy() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("state.json");
        let legacy = r#"{"1":{"id":"1","name":"m","path":"/lib/m","size":3,"completed_at":10,"last_access":10,"state":"Seeding"}}"#;
        std::fs::write(&p, legacy).unwrap();
        assert!(StateStore::load(p.clone()).unwrap().get("1").unwrap().active_path.is_none());
        let s = StateStore::load(p.clone()).unwrap();
        s.update("1", |m| {
            m.active_path = Some("/data/active/abc".into());
            ((), true)
        })
        .unwrap();
        assert_eq!(
            StateStore::load(p).unwrap().get("1").unwrap().active_path.as_deref(),
            Some("/data/active/abc")
        );
    }

    #[test]
    fn old_json_without_hls_fields_loads_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("state.json");
        let legacy = r#"{"1":{"id":"1","name":"m","path":"/lib/m","size":3,"completed_at":10,"last_access":10,"state":"Seeding"}}"#;
        std::fs::write(&p, legacy).unwrap();
        let s = StateStore::load(p).unwrap();
        let m = s.get("1").unwrap();
        assert_eq!(m.hls, HlsStatus::None);
        assert!(m.hls_dir.is_none());
        assert!(m.hls_error.is_none());
    }
}
