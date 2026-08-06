use std::collections::{HashMap, HashSet};
use std::time::Duration;

use anyhow::Result;
use tokio::sync::broadcast::Sender;
use tokio::time;
use tracing::{debug, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind};
use crate::live_api::{LivePlayer, LiveSnapshot, SharedLive};
use crate::rest_client::RestClient;

pub fn diff_players(prev: &HashSet<String>, curr: &HashSet<String>) -> (Vec<String>, Vec<String>) {
    let mut joined: Vec<String> = curr.difference(prev).cloned().collect();
    let mut left: Vec<String> = prev.difference(curr).cloned().collect();
    joined.sort();
    left.sort();
    (joined, left)
}

fn stats_event(kind: &str, fields: HashMap<String, String>) -> GameEvent {
    GameEvent {
        kind: GameEventKind::Stats,
        player: None,
        text: String::new(),
        raw: String::new(),
        fields: {
            let mut f = fields;
            f.insert("kind".into(), kind.into());
            f
        },
    }
}

pub async fn run(cfg: Config, tx: Sender<GameEvent>, live: SharedLive) -> Result<()> {
    let client = RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(cfg.agones_rest_probe_timeout_secs.max(5)),
    )?;

    let mut prev: HashSet<String> = HashSet::new();
    let mut known_names: HashMap<String, String> = HashMap::new();
    let mut ticker = time::interval(Duration::from_secs(cfg.poll_interval_secs));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let players = match client.players().await {
            Ok(p) => p,
            Err(e) => {
                debug!(error = %e, "poller: players fetch failed");
                continue;
            }
        };
        let curr: HashSet<String> = players
            .players
            .iter()
            .map(|p| {
                if p.player_id.is_empty() {
                    p.name.clone()
                } else {
                    p.player_id.clone()
                }
            })
            .collect();
        for p in &players.players {
            let id = if p.player_id.is_empty() {
                p.name.clone()
            } else {
                p.player_id.clone()
            };
            known_names.insert(id, p.name.clone());
        }

        let (joined, left) = diff_players(&prev, &curr);
        for id in joined {
            let name = known_names.get(&id).cloned().unwrap_or_else(|| id.clone());
            let _ = tx.send(GameEvent {
                kind: GameEventKind::Join,
                player: Some(name),
                text: String::new(),
                raw: String::new(),
                fields: HashMap::new(),
            });
        }
        for id in left {
            let name = known_names.remove(&id).unwrap_or(id);
            let _ = tx.send(GameEvent {
                kind: GameEventKind::Leave,
                player: Some(name),
                text: String::new(),
                raw: String::new(),
                fields: HashMap::new(),
            });
        }
        prev = curr;

        let metrics = match client.metrics().await {
            Ok(m) => {
                let mut f = HashMap::new();
                f.insert("players".into(), m.currentplayernum.to_string());
                f.insert("serverfps".into(), m.serverfps.to_string());
                f.insert("uptime".into(), m.serveruptime.to_string());
                f.insert("frametime".into(), format!("{:.3}", m.serverframetime));
                let _ = tx.send(stats_event("snapshot", f));
                Some(m)
            }
            Err(e) => {
                warn!(error = %e, "poller: metrics fetch failed");
                None
            }
        };

        let snap = LiveSnapshot {
            ts: chrono::Utc::now().timestamp_millis(),
            fps: metrics.as_ref().map(|m| m.serverfps).unwrap_or(0),
            uptime_s: metrics.as_ref().map(|m| m.serveruptime).unwrap_or(0),
            player_count: players.players.len() as i64,
            players: players
                .players
                .iter()
                .map(|p| LivePlayer {
                    name: p.name.clone(),
                    level: p.level,
                    x: p.location_x,
                    y: p.location_y,
                })
                .collect(),
        };
        *live.write().await = snap;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn diff_detects_join_and_leave() {
        let prev: HashSet<String> = ["a", "b"].iter().map(|s| s.to_string()).collect();
        let curr: HashSet<String> = ["b", "c"].iter().map(|s| s.to_string()).collect();
        let (joined, left) = diff_players(&prev, &curr);
        assert_eq!(joined, vec!["c".to_string()]);
        assert_eq!(left, vec!["a".to_string()]);
    }
}
