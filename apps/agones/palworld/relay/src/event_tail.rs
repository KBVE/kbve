use std::collections::HashMap;
use std::io::SeekFrom;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::RwLock;
use tokio::time;
use tracing::{info, warn};

use crate::config::Config;

#[derive(Debug, Clone, Serialize)]
pub struct BossDefeat {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub defeated_at: i64,
    pub respawn_at: i64,
}

pub type SharedBosses = Arc<RwLock<HashMap<String, BossDefeat>>>;

pub fn normalize_id(raw: &str) -> String {
    let name = raw
        .rsplit(['.', ':'])
        .next()
        .unwrap_or(raw)
        .split_whitespace()
        .next()
        .unwrap_or(raw);
    let mut id = name.to_lowercase();
    loop {
        let before = id.len();
        for prefix in ["bp_", "boss_", "gym_"] {
            if let Some(rest) = id.strip_prefix(prefix) {
                id = rest.to_string();
            }
        }
        if id.len() == before {
            break;
        }
    }
    id = id
        .trim_end_matches(|c: char| c.is_ascii_digit() || c == '_')
        .to_string();
    id.strip_suffix("_c").map(str::to_string).unwrap_or(id)
}

pub fn parse_line(line: &str, respawn_secs: i64) -> Option<BossDefeat> {
    let mut parts = line.trim().split('\t');
    let ts: i64 = parts.next()?.parse().ok()?;
    if parts.next()? != "BOSS_DEFEAT" {
        return None;
    }
    let raw = parts.next()?;
    let x: f64 = parts.next()?.parse().ok()?;
    let y: f64 = parts.next()?.parse().ok()?;
    Some(BossDefeat {
        id: normalize_id(raw),
        x,
        y,
        defeated_at: ts,
        respawn_at: ts + respawn_secs * 1000,
    })
}

pub async fn run(cfg: Config, bosses: SharedBosses) -> Result<()> {
    let path = cfg.events_log_path.clone();
    let respawn_secs = cfg.boss_respawn_secs as i64;
    info!(path = %path, respawn_secs, "event_tail starting");

    let mut offset: u64 = 0;
    let mut carry = String::new();
    let mut ticker = time::interval(Duration::from_secs(2));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let meta = match tokio::fs::metadata(&path).await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() < offset {
            offset = 0;
            carry.clear();
        }
        if meta.len() == offset {
            prune(&bosses).await;
            continue;
        }

        let mut file = match tokio::fs::File::open(&path).await {
            Ok(f) => f,
            Err(e) => {
                warn!(error = %e, "event_tail: open failed");
                continue;
            }
        };
        if file.seek(SeekFrom::Start(offset)).await.is_err() {
            continue;
        }
        let mut buf = String::new();
        match file.read_to_string(&mut buf).await {
            Ok(n) => offset += n as u64,
            Err(e) => {
                warn!(error = %e, "event_tail: read failed");
                continue;
            }
        }
        carry.push_str(&buf);
        while let Some(nl) = carry.find('\n') {
            let line = carry[..nl].to_string();
            carry.drain(..=nl);
            if let Some(defeat) = parse_line(&line, respawn_secs) {
                info!(id = %defeat.id, x = defeat.x, y = defeat.y, "boss defeat");
                let key = format!(
                    "{}:{}:{}",
                    defeat.id,
                    defeat.x.round(),
                    defeat.y.round()
                );
                bosses.write().await.insert(key, defeat);
            }
        }
        prune(&bosses).await;
    }
}

async fn prune(bosses: &SharedBosses) {
    let now = chrono::Utc::now().timestamp_millis();
    bosses.write().await.retain(|_, b| b.respawn_at > now);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_defeat_line() {
        let d = parse_line(
            "1785477685000\tBOSS_DEFEAT\tBP_Boss_IceHorse_Dark_C_214728 /Game/Pal/Maps\t-167230.0\t96430.0",
            3600,
        )
        .unwrap();
        assert_eq!(d.id, "icehorse_dark");
        assert_eq!(d.x, -167230.0);
        assert_eq!(d.respawn_at, 1785477685000 + 3_600_000);
    }

    #[test]
    fn normalizes_boss_ids() {
        assert_eq!(
            normalize_id(
                "PalCharacter /Game/Pal/Maps/MainWorld.MainWorld:PersistentLevel.BP_Boss_IceHorse_Dark_C_2147281404"
            ),
            "icehorse_dark"
        );
        assert_eq!(normalize_id("BOSS_Anubis"), "anubis");
        assert_eq!(normalize_id("GYM_ThunderDragonMan_2"), "thunderdragonman");
    }

    #[test]
    fn rejects_non_defeat_lines() {
        assert!(parse_line("123\tCHAT\thello\t0\t0", 3600).is_none());
        assert!(parse_line("garbage", 3600).is_none());
    }
}
