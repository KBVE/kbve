//! Structured lifecycle events. Emitted as JSON on stdout, tailed by the
//! cluster Vector DaemonSet (kubernetes_logs) into ClickHouse
//! observability.logs_distributed. Each helper carries a stable `event`
//! field so downstream queries do not depend on log message wording.

pub fn torrent_added(id: &str, scheme: &str) {
    tracing::info!(event = "torrent_added", id, scheme, "torrent added");
}

pub fn torrent_completed(id: &str, size: u64) {
    tracing::info!(event = "torrent_completed", id, size, "torrent moved to library");
}

pub fn torrent_failed(id: &str, phase: &str, reason: &str) {
    tracing::warn!(event = "torrent_failed", id, phase, reason, "torrent failed");
}

pub fn reaped(id: &str, name: &str, size: u64) {
    tracing::info!(event = "reaped", id, name, size, "reaped");
}

pub fn reconcile_failed(id: &str, name: &str) {
    tracing::warn!(
        event = "reconcile_failed",
        id,
        name,
        "leeching torrent failed on restart (no session persistence)"
    );
}

pub fn transcode_failed(id: &str, reason: &str) {
    tracing::error!(event = "transcode_failed", id, reason, "transcode failed");
}

pub fn hls_failed(id: &str, reason: &str) {
    tracing::error!(event = "hls_failed", id, reason, "hls start failed");
}

pub fn stream_served(id: &str, bytes: u64, delivery: &str, partial: bool) {
    tracing::info!(event = "stream_served", id, bytes, delivery, partial, "stream served");
}

pub fn vpn_leak() {
    tracing::error!(
        event = "vpn_leak",
        "vpn egress check failed; pausing all torrents (possible ip leak)"
    );
}

pub fn vpn_restored() {
    tracing::info!(event = "vpn_restored", "vpn egress restored; resuming torrents");
}
