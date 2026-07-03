//! Outbound content filter — runs at the client→ergo chokepoint so a blocked
//! message never reaches ergo, never broadcasts, and never enters the history
//! ring (history.rs appends from the ergo side, so blocking before the ergo
//! write covers both the live fan-out and backscroll).
//!
//! Three layers:
//!  - link block: drop messages carrying URLs / invites so a client can't spam
//!    links at every other user.
//!  - word blocklist: case-insensitive banned substrings. The list lives in
//!    Valkey (`chat:filter:words`, a JSON array) so staff can edit it live and
//!    every gateway replica shares it; a static fallback ships in-binary so the
//!    filter still bites when Valkey is unconfigured.
//!  - repeat flood: the count-based ratelimit (ratelimit.rs) lets a steady
//!    stream through; this catches the same line sent over and over, which a
//!    raw count window misses.
//!
//! Matching is substring/lowercase only — deliberate obfuscation (`h t t p`,
//! unicode look-alikes) is out of scope for v1; tighten if abuse shows up.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

use tokio::time::interval;
use tracing::{info, warn};

use crate::gateway::kv;

/// Valkey key holding the live word blocklist as a JSON string array.
const BLOCKLIST_KEY: &str = "chat:filter:words";
/// How often the background task re-reads the Valkey blocklist.
const BLOCKLIST_REFRESH: Duration = Duration::from_secs(60);

/// Markers that flag a message as carrying a link/invite. Lowercased before
/// the scan, so these stay lowercase.
const LINK_MARKERS: &[&str] = &[
    "://",
    "www.",
    "discord.gg",
    ".gg/",
    "t.me/",
    "bit.ly",
    "tinyurl",
];

/// Words blocked even when Valkey is unreachable. Keep minimal — the live list
/// is the real source. Lowercase.
const STATIC_BLOCKLIST: &[&str] = &[];

/// Same content seen this many times inside [`REPEAT_WINDOW`] is a flood.
const REPEAT_LIMIT: u32 = 3;
/// Window for the repeat-flood counter.
const REPEAT_WINDOW: Duration = Duration::from_secs(15);

/// Outcome of filtering one message.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Decision {
    /// Forward the message unchanged.
    Allow,
    /// Drop the message; `reason` is a short tag surfaced to the sender.
    Block(&'static str),
}

fn blocklist() -> &'static RwLock<Vec<String>> {
    static B: OnceLock<RwLock<Vec<String>>> = OnceLock::new();
    B.get_or_init(|| RwLock::new(STATIC_BLOCKLIST.iter().map(|s| s.to_string()).collect()))
}

/// Spawn the background task that keeps the word blocklist fresh from Valkey.
/// Call once at startup. No-op effect when Valkey is unconfigured (the static
/// list stays in place).
pub fn spawn_blocklist_refresher() {
    tokio::spawn(async {
        let mut tick = interval(BLOCKLIST_REFRESH);
        loop {
            tick.tick().await;
            reload_blocklist().await;
        }
    });
}

async fn reload_blocklist() {
    let Some(cache) = kv::get() else { return };
    let Some(raw) = cache.kv_get_str(BLOCKLIST_KEY).await else {
        return;
    };
    match serde_json::from_str::<Vec<String>>(&raw) {
        Ok(words) => {
            let words: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();
            let n = words.len();
            *blocklist().write().expect("blocklist rwlock poisoned") = words;
            info!(count = n, "chat word blocklist refreshed from Valkey");
        }
        Err(e) => warn!("ignoring malformed chat blocklist JSON: {e}"),
    }
}

/// Decide what to do with one outbound message from `user`.
pub fn check(user: &str, content: &str) -> Decision {
    let lower = content.to_lowercase();

    if LINK_MARKERS.iter().any(|m| lower.contains(m)) {
        return Decision::Block("link");
    }

    {
        let words = blocklist().read().expect("blocklist rwlock poisoned");
        if words
            .iter()
            .any(|w| !w.is_empty() && lower.contains(w.as_str()))
        {
            return Decision::Block("blocked word");
        }
    }

    if repeat_flood(user, &lower, Instant::now()) {
        return Decision::Block("repeated message");
    }

    Decision::Allow
}

struct RepeatBucket {
    content: u64,
    count: u32,
    window_start: Instant,
}

fn repeat_state() -> &'static Mutex<HashMap<String, RepeatBucket>> {
    static R: OnceLock<Mutex<HashMap<String, RepeatBucket>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hash_content(content: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    content.hash(&mut h);
    h.finish()
}

fn repeat_flood(user: &str, lower: &str, now: Instant) -> bool {
    let h = hash_content(lower);
    let mut map = repeat_state().lock().expect("repeat mutex poisoned");
    let b = map.entry(user.to_string()).or_insert(RepeatBucket {
        content: h,
        count: 0,
        window_start: now,
    });
    if b.content != h || now.duration_since(b.window_start) >= REPEAT_WINDOW {
        b.content = h;
        b.count = 1;
        b.window_start = now;
        return false;
    }
    b.count += 1;
    b.count > REPEAT_LIMIT
}

/// Drop repeat buckets idle longer than `idle`, bounding memory. Call
/// periodically alongside the ratelimit prune.
pub fn prune(idle: Duration) {
    let now = Instant::now();
    repeat_state()
        .lock()
        .expect("repeat mutex poisoned")
        .retain(|_, b| now.duration_since(b.window_start) < idle);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_links() {
        assert_eq!(
            check("u", "check https://evil.test"),
            Decision::Block("link")
        );
        assert_eq!(check("u", "join discord.gg/abcd"), Decision::Block("link"));
        assert_eq!(check("u", "www.spam.test now"), Decision::Block("link"));
    }

    #[test]
    fn allows_plain_chat() {
        assert_eq!(check("u", "hello there friend"), Decision::Allow);
    }

    #[test]
    fn blocklist_matches_case_insensitive() {
        blocklist().write().unwrap().push("badword".to_string());
        assert_eq!(
            check("u", "this is BadWord here"),
            Decision::Block("blocked word")
        );
        blocklist().write().unwrap().clear();
    }

    #[test]
    fn repeat_flood_trips_after_limit() {
        let now = Instant::now();
        let u = "flooder";
        for _ in 0..REPEAT_LIMIT {
            assert!(!repeat_flood(u, "spam", now));
        }
        assert!(repeat_flood(u, "spam", now));
    }

    #[test]
    fn different_content_resets_repeat() {
        let now = Instant::now();
        let u = "talker";
        for _ in 0..REPEAT_LIMIT {
            repeat_flood(u, "spam", now);
        }
        assert!(!repeat_flood(u, "something else", now));
    }
}
