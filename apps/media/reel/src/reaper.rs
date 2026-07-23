use crate::state;

pub fn is_reapable(m: &state::Metadata) -> bool {
    use state::{HlsStatus, TorrentState, TranscodeStatus};
    if m.state == TorrentState::Leeching {
        return false;
    }
    if matches!(
        m.transcode,
        TranscodeStatus::Pending | TranscodeStatus::Remuxing | TranscodeStatus::Encoding
    ) {
        return false;
    }
    if m.hls == HlsStatus::Starting {
        return false;
    }
    true
}

pub fn select_expired(items: &[state::Metadata], ttl_secs: u64, now: u64) -> Vec<String> {
    items
        .iter()
        .filter(|m| now.saturating_sub(m.last_access) > ttl_secs && is_reapable(m))
        .map(|m| m.id.clone())
        .collect()
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub async fn reap_loop(
    engine: crate::engine::Engine,
    hls: crate::hls::HlsManager,
    ttl_secs: u64,
    interval_secs: u64,
) {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_secs));
    loop {
        ticker.tick().await;
        match engine.reap_expired(ttl_secs, now_secs()).await {
            Ok(reaped) => {
                for id in reaped {
                    hls.abort(&id).await;
                }
            }
            Err(e) => tracing::error!(error = %e, "reap cycle failed"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{HlsStatus, Metadata, TorrentState, TranscodeStatus};

    fn meta(id: &str, last_access: u64) -> Metadata {
        Metadata {
            id: id.into(),
            name: id.into(),
            path: format!("/lib/{id}"),
            size: 1,
            completed_at: Some(last_access),
            last_access,
            state: TorrentState::Seeding,
            error: None,
            transcode: TranscodeStatus::None,
            transcode_path: None,
            transcode_error: None,
            hls: HlsStatus::None,
            hls_dir: None,
            hls_error: None,
        }
    }

    #[test]
    fn select_expired_uses_ttl_boundary() {
        let items = vec![meta("old", 0), meta("fresh", 100)];
        let expired = select_expired(&items, 50, 120);
        assert_eq!(expired, vec!["old".to_string()]);
    }

    #[test]
    fn leeching_is_not_reapable() {
        let mut m = meta("d", 0);
        m.state = TorrentState::Leeching;
        assert!(!is_reapable(&m));
    }

    #[test]
    fn in_flight_transcode_is_not_reapable() {
        for s in [
            TranscodeStatus::Pending,
            TranscodeStatus::Remuxing,
            TranscodeStatus::Encoding,
        ] {
            let mut m = meta("t", 0);
            m.transcode = s;
            assert!(!is_reapable(&m));
        }
    }

    #[test]
    fn hls_starting_is_not_reapable() {
        let mut m = meta("h", 0);
        m.hls = HlsStatus::Starting;
        assert!(!is_reapable(&m));
    }

    #[test]
    fn seeding_and_idle_live_are_reapable() {
        let seeding = meta("s", 0);
        assert!(is_reapable(&seeding));
        let mut live = meta("l", 0);
        live.hls = HlsStatus::Live;
        assert!(is_reapable(&live));
    }

    #[test]
    fn select_expired_skips_active_download() {
        let mut leech = meta("dl", 0);
        leech.state = TorrentState::Leeching;
        let items = vec![leech, meta("done", 0)];
        let expired = select_expired(&items, 50, 120);
        assert_eq!(expired, vec!["done".to_string()]);
    }
}
