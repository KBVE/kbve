use crate::state;

pub fn select_expired(items: &[state::Metadata], ttl_secs: u64, now: u64) -> Vec<String> {
    items.iter()
        .filter(|m| now.saturating_sub(m.last_access) > ttl_secs)
        .map(|m| m.id.clone())
        .collect()
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub async fn reap_loop(engine: crate::engine::Engine, ttl_secs: u64, interval_secs: u64) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    loop {
        ticker.tick().await;
        if let Err(e) = engine.reap_expired(ttl_secs, now_secs()).await {
            tracing::error!(error = %e, "reap cycle failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Metadata, TorrentState};

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
}
