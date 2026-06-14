//! Per-username chat anti-spam (in-process, fixed window).
//!
//! Keyed by the authenticated nick (JWT -> username), shared across all
//! sessions in this gateway process. Throttled messages are dropped before
//! they reach ergo, so a spamming player can't make the relay's IRC connection
//! flood and earn a server-side ban. Sustained flooding escalates to a kick.
//!
//! This is the in-process layer; a future valkey-backed `KvCache::check_rate`
//! will share the same `Verdict` across gateway replicas + discordsh.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Messages allowed per window before throttling.
const MAX_PER_WINDOW: u32 = 10;
/// Total messages in a window that mark a flood and disconnect the session.
const KICK_CEILING: u32 = 30;
/// Counting window.
const WINDOW: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Verdict {
    /// Forward the message.
    Allow,
    /// Over the per-window limit — drop it (don't forward to ergo).
    Throttle,
    /// Sustained flood — disconnect the session.
    Kick,
}

struct Bucket {
    window_start: Instant,
    count: u32,
    last_seen: Instant,
}

#[derive(Default)]
struct Buckets {
    map: HashMap<String, Bucket>,
}

impl Buckets {
    fn check(&mut self, user: &str, now: Instant) -> Verdict {
        let b = self.map.entry(user.to_string()).or_insert(Bucket {
            window_start: now,
            count: 0,
            last_seen: now,
        });
        b.last_seen = now;
        if now.duration_since(b.window_start) >= WINDOW {
            b.window_start = now;
            b.count = 1;
            return Verdict::Allow;
        }
        b.count += 1;
        if b.count > KICK_CEILING {
            Verdict::Kick
        } else if b.count > MAX_PER_WINDOW {
            Verdict::Throttle
        } else {
            Verdict::Allow
        }
    }

    fn prune(&mut self, now: Instant, idle: Duration) {
        self.map
            .retain(|_, b| now.duration_since(b.last_seen) < idle);
    }
}

fn global() -> &'static Mutex<Buckets> {
    static B: OnceLock<Mutex<Buckets>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(Buckets::default()))
}

/// Record one message for `user` and decide what to do with it.
pub fn check(user: &str) -> Verdict {
    global()
        .lock()
        .expect("ratelimit mutex poisoned")
        .check(user, Instant::now())
}

/// Drop buckets idle longer than `idle`, to bound memory. Call periodically.
pub fn prune(idle: Duration) {
    global()
        .lock()
        .expect("ratelimit mutex poisoned")
        .prune(Instant::now(), idle);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_then_throttles_then_kicks() {
        let mut b = Buckets::default();
        let t0 = Instant::now();
        for _ in 0..MAX_PER_WINDOW {
            assert_eq!(b.check("u", t0), Verdict::Allow);
        }
        assert_eq!(b.check("u", t0), Verdict::Throttle);
        let mut last = Verdict::Throttle;
        for _ in 0..KICK_CEILING {
            last = b.check("u", t0);
        }
        assert_eq!(last, Verdict::Kick);
    }

    #[test]
    fn window_reset_allows_again() {
        let mut b = Buckets::default();
        let t0 = Instant::now();
        for _ in 0..(MAX_PER_WINDOW + 5) {
            b.check("u", t0);
        }
        assert_eq!(b.check("u", t0 + WINDOW), Verdict::Allow);
    }

    #[test]
    fn users_are_independent() {
        let mut b = Buckets::default();
        let t0 = Instant::now();
        for _ in 0..(KICK_CEILING + 2) {
            b.check("flooder", t0);
        }
        assert_eq!(b.check("calm", t0), Verdict::Allow);
    }

    #[test]
    fn prune_drops_idle_buckets() {
        let mut b = Buckets::default();
        b.check("old", Instant::now());
        b.prune(Instant::now(), Duration::from_secs(0));
        assert!(b.map.is_empty());
    }
}
