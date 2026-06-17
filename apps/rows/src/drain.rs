//! Transport-agnostic shutdown/player-notification seam.
//!
//! Today `LoggingNotifier` just logs. The `PlayerRegistry<C>` scaffold below is the future
//! per-player connection map (DashMap + mpsc fan-out), generic over the connection/IO handle
//! `C` so WS sockets, Agones channels, or MQ senders all slot in behind one type — wired later
//! without touching the drain sequence.

use std::sync::Arc;
use tracing::warn;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShutdownReason {
    Rollout,
    Shutdown,
}

impl ShutdownReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            ShutdownReason::Rollout => "rollout",
            ShutdownReason::Shutdown => "shutdown",
        }
    }
}

/// Stable message envelope. `message` is human-facing text, filled in by a real notifier later.
#[derive(Debug, Clone)]
pub struct ShutdownNotice {
    pub reason: ShutdownReason,
    pub message: String,
    pub grace_secs: u64,
}

/// The seam. A real implementation fans the notice out to connected players best-effort and
/// must never block shutdown.
pub trait ShutdownNotifier: Send + Sync {
    fn notify_players_shutdown(&self, notice: &ShutdownNotice);
}

/// The only implementation today: log the notice. No-op for players.
pub struct LoggingNotifier;

impl ShutdownNotifier for LoggingNotifier {
    fn notify_players_shutdown(&self, notice: &ShutdownNotice) {
        warn!(
            reason = notice.reason.as_str(),
            grace_secs = notice.grace_secs,
            message = %notice.message,
            "Notifying players of impending shutdown (stub)"
        );
    }
}

pub fn default_notifier() -> Arc<dyn ShutdownNotifier> {
    Arc::new(LoggingNotifier)
}

// ---------------------------------------------------------------------------
// FUTURE: per-player connection registry + mpsc fan-out. Compiled but unused.
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub type PlayerId = uuid::Uuid;

/// Future registry of live player connections, generic over the connection handle `C`.
#[allow(dead_code)]
pub struct PlayerRegistry<C> {
    conns: dashmap::DashMap<PlayerId, C>,
}

#[allow(dead_code)]
impl<C> PlayerRegistry<C> {
    #[allow(clippy::new_without_default)] // dead-coded scaffold; Default deferred with the impl
    pub fn new() -> Self {
        Self {
            conns: dashmap::DashMap::new(),
        }
    }
    pub fn insert(&self, id: PlayerId, conn: C) {
        self.conns.insert(id, conn);
    }
    pub fn remove(&self, id: &PlayerId) -> Option<(PlayerId, C)> {
        self.conns.remove(id)
    }
    pub fn len(&self) -> usize {
        self.conns.len()
    }
    pub fn is_empty(&self) -> bool {
        self.conns.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logging_notifier_is_callable_and_infallible() {
        let n = LoggingNotifier;
        n.notify_players_shutdown(&ShutdownNotice {
            reason: ShutdownReason::Rollout,
            message: "server restarting".into(),
            grace_secs: 8,
        });
    }

    #[test]
    fn reason_as_str_is_stable() {
        assert_eq!(ShutdownReason::Rollout.as_str(), "rollout");
        assert_eq!(ShutdownReason::Shutdown.as_str(), "shutdown");
    }

    #[test]
    fn default_notifier_returns_usable_seam() {
        let n = default_notifier();
        n.notify_players_shutdown(&ShutdownNotice {
            reason: ShutdownReason::Shutdown,
            message: "bye".into(),
            grace_secs: 0,
        });
    }
}
