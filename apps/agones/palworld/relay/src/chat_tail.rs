use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader};
use tokio::sync::broadcast::Sender;
use tokio::time;
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind};

const DEDUP_WINDOW: Duration = Duration::from_millis(1500);

/// Suppresses identical chat lines seen within a short window. The UE4SS chat
/// hook can fire more than once for a single message (pre/post + engine
/// re-broadcast), producing duplicate lines in the log.
pub(crate) struct Dedup {
    window: Duration,
    seen: HashMap<String, Instant>,
}

impl Dedup {
    pub(crate) fn new(window: Duration) -> Self {
        Self {
            window,
            seen: HashMap::new(),
        }
    }

    /// Returns true if this key has not been seen within the window (and
    /// records it). Old entries are pruned on each call.
    pub(crate) fn allow(&mut self, key: &str, now: Instant) -> bool {
        self.seen
            .retain(|_, t| now.saturating_duration_since(*t) < self.window);
        match self.seen.get(key) {
            Some(&t) if now.saturating_duration_since(t) < self.window => false,
            _ => {
                self.seen.insert(key.to_string(), now);
                true
            }
        }
    }
}

fn dedup_key(ev: &GameEvent) -> String {
    format!("{}\u{0}{}", ev.player.as_deref().unwrap_or(""), ev.text)
}

pub fn parse_chat_line(line: &str) -> Option<GameEvent> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(3, '\t');
    let _ts = parts.next()?;
    let player = parts.next()?.trim();
    let text = parts.next()?.trim();
    if player.is_empty() || text.is_empty() {
        return None;
    }
    Some(GameEvent {
        kind: GameEventKind::Chat,
        player: Some(player.to_string()),
        text: text.to_string(),
        raw: line.to_string(),
        fields: HashMap::new(),
    })
}

pub async fn run(cfg: Config, tx: Sender<GameEvent>) -> Result<()> {
    let Some(path) = cfg.chat_log_path.clone() else {
        warn!("chat_tail disabled: CHAT_LOG_PATH not set");
        return Ok(());
    };
    info!(path = %path, "chat_tail following chat log");

    let mut pos: u64 = 0;
    let mut dedup = Dedup::new(DEDUP_WINDOW);
    let mut ticker = time::interval(Duration::from_millis(500));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(e) => {
                debug!(error = %e, "chat_tail: chat log not open yet");
                continue;
            }
        };
        let len = match file.metadata().await {
            Ok(m) => m.len(),
            Err(e) => {
                debug!(error = %e, "chat_tail: metadata failed");
                continue;
            }
        };
        if len < pos {
            pos = 0;
        }
        if len == pos {
            continue;
        }

        let mut reader = BufReader::new(file);
        if reader.seek(std::io::SeekFrom::Start(pos)).await.is_err() {
            continue;
        }
        let mut line = String::new();
        loop {
            line.clear();
            let n = match reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) => {
                    debug!(error = %e, "chat_tail: read_line failed");
                    break;
                }
            };
            if !line.ends_with('\n') {
                break;
            }
            pos += n as u64;
            if let Some(ev) = parse_chat_line(&line) {
                if dedup.allow(&dedup_key(&ev), Instant::now()) {
                    let _ = tx.send(ev);
                } else {
                    debug!(player = ?ev.player, "chat_tail: deduped duplicate line");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    #[test]
    fn parses_well_formed_line() {
        let ev = parse_chat_line("1784300000000\tAlice\thello world").unwrap();
        assert!(matches!(ev.kind, GameEventKind::Chat));
        assert_eq!(ev.player.as_deref(), Some("Alice"));
        assert_eq!(ev.text, "hello world");
    }

    #[test]
    fn keeps_tabs_in_message_body() {
        let ev = parse_chat_line("1\tBob\ta\tb").unwrap();
        assert_eq!(ev.text, "a\tb");
    }

    #[test]
    fn rejects_blank_and_malformed() {
        assert!(parse_chat_line("").is_none());
        assert!(parse_chat_line("   ").is_none());
        assert!(parse_chat_line("no-tabs-here").is_none());
        assert!(parse_chat_line("1\tOnlyPlayer").is_none());
        assert!(parse_chat_line("1\t\ttext").is_none());
        assert!(parse_chat_line("1\tPlayer\t").is_none());
    }

    #[tokio::test]
    async fn follows_appended_lines() {
        use tokio::io::AsyncWriteExt;
        let dir = std::env::temp_dir().join(format!("chat_tail_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("chat.log");
        let path_str = path.to_string_lossy().to_string();

        let mut cfg = base_test_config();
        cfg.chat_log_path = Some(path_str.clone());

        let (tx, mut rx) = tokio::sync::broadcast::channel::<GameEvent>(16);
        let handle = tokio::spawn(run(cfg, tx));

        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let mut f = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .unwrap();
        f.write_all(b"1\tCarol\tgg\n").await.unwrap();
        f.flush().await.unwrap();

        let ev = tokio::time::timeout(std::time::Duration::from_secs(3), rx.recv())
            .await
            .expect("timed out waiting for chat event")
            .unwrap();
        assert_eq!(ev.player.as_deref(), Some("Carol"));
        assert_eq!(ev.text, "gg");
        handle.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dedup_suppresses_identical_within_window() {
        let mut d = Dedup::new(Duration::from_millis(1500));
        let t0 = Instant::now();
        assert!(d.allow("Alice\u{0}hi", t0));
        assert!(!d.allow("Alice\u{0}hi", t0 + Duration::from_millis(500)));
        assert!(!d.allow("Alice\u{0}hi", t0 + Duration::from_millis(1499)));
    }

    #[test]
    fn dedup_allows_after_window() {
        let mut d = Dedup::new(Duration::from_millis(1500));
        let t0 = Instant::now();
        assert!(d.allow("Alice\u{0}hi", t0));
        assert!(d.allow("Alice\u{0}hi", t0 + Duration::from_millis(1600)));
    }

    #[test]
    fn dedup_allows_distinct_keys() {
        let mut d = Dedup::new(Duration::from_millis(1500));
        let t0 = Instant::now();
        assert!(d.allow("Alice\u{0}hi", t0));
        assert!(d.allow("Bob\u{0}hi", t0));
        assert!(d.allow("Alice\u{0}bye", t0));
    }

    #[test]
    fn dedup_key_separates_player_and_text() {
        let a = parse_chat_line("1\tAli\tce-hi").unwrap();
        let b = parse_chat_line("1\tAlice\t-hi").unwrap();
        assert_ne!(dedup_key(&a), dedup_key(&b));
    }

    fn base_test_config() -> Config {
        let _g = crate::config::env_test_guard();
        unsafe {
            std::env::set_var("PALWORLD_ADMIN_PASSWORD", "pw");
        }
        Config::from_env().unwrap()
    }
}
