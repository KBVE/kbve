use crate::state;

pub fn select_expired(items: &[state::Metadata], ttl_secs: u64, now: u64) -> Vec<String> {
    items.iter()
        .filter(|m| now.saturating_sub(m.last_access) > ttl_secs)
        .map(|m| m.id.clone())
        .collect()
}

pub fn reap_once(
    store: &state::StateStore,
    ttl_secs: u64,
    now: u64,
    delete_files: &dyn Fn(&state::Metadata) -> anyhow::Result<()>,
) -> anyhow::Result<Vec<String>> {
    let expired = select_expired(&store.list(), ttl_secs, now);
    let mut reaped = Vec::new();
    for id in expired {
        if let Some(m) = store.get(&id) {
            if let Err(e) = delete_files(&m) {
                tracing::warn!(id = %id, error = %e, "reap delete failed");
                continue;
            }
            store.remove(&id)?;
            tracing::info!(id = %id, name = %m.name, size = m.size, "reaped");
            reaped.push(id);
        }
    }
    Ok(reaped)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub async fn reap_loop(store: state::StateStore, ttl_secs: u64, interval_secs: u64) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    loop {
        ticker.tick().await;
        let delete = |m: &state::Metadata| -> anyhow::Result<()> {
            let target = std::path::Path::new(&m.path);
            if target.is_dir() {
                std::fs::remove_dir_all(target)?;
            } else if target.is_file() {
                std::fs::remove_file(target)?;
            }
            Ok(())
        };
        if let Err(e) = reap_once(&store, ttl_secs, now_secs(), &delete) {
            tracing::error!(error = %e, "reap cycle failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Metadata, StateStore, TorrentState};
    use std::cell::RefCell;
    use tempfile::tempdir;

    fn meta(id: &str, last_access: u64) -> Metadata {
        Metadata {
            id: id.into(), name: id.into(), path: format!("/lib/{id}"),
            size: 1, completed_at: Some(last_access), last_access,
            state: TorrentState::Seeding,
        }
    }

    #[test]
    fn select_expired_uses_ttl_boundary() {
        let items = vec![meta("old", 0), meta("fresh", 100)];
        let expired = select_expired(&items, 50, 120);
        assert_eq!(expired, vec!["old".to_string()]);
    }

    #[test]
    fn reap_once_deletes_and_removes() {
        let dir = tempdir().unwrap();
        let store = StateStore::load(dir.path().join("s.json")).unwrap();
        store.upsert(meta("old", 0)).unwrap();
        store.upsert(meta("fresh", 100)).unwrap();
        let deleted = RefCell::new(Vec::new());
        let reaped = reap_once(&store, 50, 120, &|m| {
            deleted.borrow_mut().push(m.id.clone());
            Ok(())
        }).unwrap();
        assert_eq!(reaped, vec!["old".to_string()]);
        assert_eq!(*deleted.borrow(), vec!["old".to_string()]);
        assert!(store.get("old").is_none());
        assert!(store.get("fresh").is_some());
    }
}
