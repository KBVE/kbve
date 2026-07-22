use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum TorrentState { Queued, Leeching, Seeding, Reaped }

#[derive(Clone, Debug, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub enum TranscodeStatus { #[default] None, Pending, Remuxing, Encoding, Ready, Failed }

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
    pub transcode: TranscodeStatus,
    #[serde(default)]
    pub transcode_path: Option<String>,
    #[serde(default)]
    pub transcode_error: Option<String>,
}

#[derive(Clone)]
pub struct StateStore {
    inner: Arc<Mutex<HashMap<String, Metadata>>>,
    path: PathBuf,
}

impl StateStore {
    pub fn load(path: PathBuf) -> anyhow::Result<Self> {
        let map = if path.exists() {
            let bytes = std::fs::read(&path)?;
            serde_json::from_slice(&bytes)?
        } else {
            HashMap::new()
        };
        Ok(Self { inner: Arc::new(Mutex::new(map)), path })
    }

    fn persist(&self, map: &HashMap<String, Metadata>) -> anyhow::Result<()> {
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(map)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn upsert(&self, m: Metadata) -> anyhow::Result<()> {
        let mut g = self.inner.lock().unwrap();
        g.insert(m.id.clone(), m);
        self.persist(&g)
    }

    pub fn get(&self, id: &str) -> Option<Metadata> {
        self.inner.lock().unwrap().get(id).cloned()
    }

    pub fn list(&self) -> Vec<Metadata> {
        self.inner.lock().unwrap().values().cloned().collect()
    }

    pub fn touch(&self, id: &str, now: u64) -> anyhow::Result<bool> {
        let mut g = self.inner.lock().unwrap();
        match g.get_mut(id) {
            Some(m) => { m.last_access = now; self.persist(&g)?; Ok(true) }
            None => Ok(false),
        }
    }

    pub fn remove(&self, id: &str) -> anyhow::Result<Option<Metadata>> {
        let mut g = self.inner.lock().unwrap();
        let removed = g.remove(id);
        self.persist(&g)?;
        Ok(removed)
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
            state: TorrentState::Seeding,
            transcode: TranscodeStatus::None, transcode_path: None, transcode_error: None,
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
    fn remove_returns_and_deletes() {
        let dir = tempdir().unwrap();
        let s = StateStore::load(dir.path().join("state.json")).unwrap();
        s.upsert(meta("a", 100)).unwrap();
        assert_eq!(s.remove("a").unwrap().unwrap().id, "a");
        assert!(s.get("a").is_none());
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
}
