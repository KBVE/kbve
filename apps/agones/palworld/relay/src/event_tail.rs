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

const BOSS_DEDUPE_DIST: f64 = 2000.0;
const BOSS_DEDUPE_MS: i64 = 180_000;
const EVENT_MATCH_DIST: f64 = 1000.0;

#[derive(Debug, Clone, Serialize)]
pub struct BossDefeat {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub defeated_at: i64,
    pub respawn_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorldEvent {
    pub kind: String,
    pub class: String,
    pub x: f64,
    pub y: f64,
    pub first_seen: i64,
}

pub type SharedBosses = Arc<RwLock<HashMap<String, BossDefeat>>>;
pub type SharedEvents = Arc<RwLock<Vec<WorldEvent>>>;

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

pub fn parse_events_line(line: &str) -> Option<(i64, Vec<WorldEvent>)> {
    let mut parts = line.trim().split('\t');
    let ts: i64 = parts.next()?.parse().ok()?;
    if parts.next()? != "EVENTS" {
        return None;
    }
    let payload = parts.next()?;
    if payload == "-" {
        return Some((ts, Vec::new()));
    }
    let mut items = Vec::new();
    for item in payload.split(';') {
        let mut f = item.split(':');
        let (Some(kind), Some(class), Some(xs), Some(ys)) =
            (f.next(), f.next(), f.next(), f.next())
        else {
            continue;
        };
        let (Ok(x), Ok(y)) = (xs.parse::<f64>(), ys.parse::<f64>()) else {
            continue;
        };
        items.push(WorldEvent {
            kind: kind.to_string(),
            class: class.to_string(),
            x,
            y,
            first_seen: ts,
        });
    }
    Some((ts, items))
}

pub fn is_duplicate_defeat(existing: &HashMap<String, BossDefeat>, d: &BossDefeat) -> bool {
    existing.values().any(|b| {
        b.id == d.id
            && (d.defeated_at - b.defeated_at).abs() < BOSS_DEDUPE_MS
            && ((b.x - d.x).powi(2) + (b.y - d.y).powi(2)).sqrt() < BOSS_DEDUPE_DIST
    })
}

pub fn merge_events(current: &[WorldEvent], incoming: Vec<WorldEvent>) -> Vec<WorldEvent> {
    incoming
        .into_iter()
        .map(|mut e| {
            if let Some(prev) = current.iter().find(|p| {
                p.kind == e.kind
                    && ((p.x - e.x).powi(2) + (p.y - e.y).powi(2)).sqrt() < EVENT_MATCH_DIST
            }) {
                e.first_seen = prev.first_seen;
            }
            e
        })
        .collect()
}

pub async fn run(cfg: Config, bosses: SharedBosses, events: SharedEvents) -> Result<()> {
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
                let mut guard = bosses.write().await;
                if is_duplicate_defeat(&guard, &defeat) {
                    continue;
                }
                info!(id = %defeat.id, x = defeat.x, y = defeat.y, "boss defeat");
                let key = format!("{}:{}:{}", defeat.id, defeat.x.round(), defeat.y.round());
                guard.insert(key, defeat);
            } else if let Some((_, incoming)) = parse_events_line(&line) {
                let mut guard = events.write().await;
                let merged = merge_events(&guard, incoming);
                if merged.len() != guard.len() {
                    info!(count = merged.len(), "world events snapshot");
                }
                *guard = merged;
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

    #[test]
    fn parses_events_snapshot() {
        let (ts, items) = parse_events_line(
            "1785580000000\tEVENTS\tsupply:PalSupplyDrop:-1000.5:2000.0;meteor:BP_Meteor_C:3.0:4.0",
        )
        .unwrap();
        assert_eq!(ts, 1785580000000);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].kind, "supply");
        assert_eq!(items[0].x, -1000.5);
        assert_eq!(items[1].kind, "meteor");
    }

    #[test]
    fn parses_empty_events_snapshot() {
        let (_, items) = parse_events_line("1785580000000\tEVENTS\t-").unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn dedupes_repeated_defeats() {
        let mut map = HashMap::new();
        let a = parse_line(
            "1785579935000\tBOSS_DEFEAT\tBP_Boss_Eagle_C_1\t-226993.8\t191072.5",
            3600,
        )
        .unwrap();
        map.insert("k".to_string(), a);
        let b = parse_line(
            "1785579937000\tBOSS_DEFEAT\tBP_Boss_Eagle_C_2\t-227373.7\t190387.1",
            3600,
        )
        .unwrap();
        assert!(is_duplicate_defeat(&map, &b));
        let far = parse_line(
            "1785579937000\tBOSS_DEFEAT\tBP_Boss_Eagle_C_3\t-100000.0\t50000.0",
            3600,
        )
        .unwrap();
        assert!(!is_duplicate_defeat(&map, &far));
    }

    #[test]
    fn merge_preserves_first_seen() {
        let current = vec![WorldEvent {
            kind: "supply".into(),
            class: "PalSupplyDrop".into(),
            x: 100.0,
            y: 200.0,
            first_seen: 111,
        }];
        let incoming = vec![
            WorldEvent {
                kind: "supply".into(),
                class: "PalSupplyDrop".into(),
                x: 150.0,
                y: 220.0,
                first_seen: 999,
            },
            WorldEvent {
                kind: "meteor".into(),
                class: "BP_Meteor_C".into(),
                x: 9999.0,
                y: 9999.0,
                first_seen: 999,
            },
        ];
        let merged = merge_events(&current, incoming);
        assert_eq!(merged[0].first_seen, 111);
        assert_eq!(merged[1].first_seen, 999);
    }
}
