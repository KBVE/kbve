use std::time::Instant;

use anyhow::Result;
use jedi::state::sidecar::ClickHouseConfig;
use serde_json::json;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind};

const SNAPSHOTS_TABLE: &str = "gameops.factorio_snapshots_raw";
const PLAYER_EVENTS_TABLE: &str = "gameops.factorio_player_events_raw";
const CHAT_LOG_TABLE: &str = "gameops.factorio_chat_log_raw";

struct Producer {
    ch: ClickHouseConfig,
    cfg: Config,
    rotation_id: String,
    started: Instant,
    last_snapshot: Option<(u64, Instant)>,
}

impl Producer {
    fn now_ts() -> String {
        chrono::Utc::now()
            .format("%Y-%m-%d %H:%M:%S%.3f")
            .to_string()
    }

    fn ups(&mut self, game_tick: u64) -> f32 {
        let now = Instant::now();
        let ups = match self.last_snapshot {
            Some((prev_tick, prev_at)) => {
                let secs = now.duration_since(prev_at).as_secs_f32();
                if secs > 0.0 && game_tick >= prev_tick {
                    (game_tick - prev_tick) as f32 / secs
                } else {
                    0.0
                }
            }
            None => 0.0,
        };
        self.last_snapshot = Some((game_tick, now));
        ups
    }

    async fn snapshot(&mut self, ev: &GameEvent) {
        let game_tick: u64 = ev
            .field("game_tick")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let players: u64 = ev
            .field("players")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let seed: u64 = ev.field("seed").and_then(|v| v.parse().ok()).unwrap_or(0);
        let ups = self.ups(game_tick);

        let row = json!({
            "ts": Self::now_ts(),
            "server_id": self.cfg.server_id,
            "scenario": self.cfg.scenario_default,
            "rotation_id": self.rotation_id,
            "seed": seed,
            "players": players,
            "auto_pause_enabled": self.cfg.auto_pause_enabled as u8,
            "map_age_wall_s": self.started.elapsed().as_secs(),
            "map_age_game_s": game_tick / 60,
            "game_tick": game_tick,
            "ups": ups,
        });
        self.insert(SNAPSHOTS_TABLE, row).await;
    }

    async fn player_event(&self, ev: &GameEvent, event: &str) {
        let row = json!({
            "ts": Self::now_ts(),
            "server_id": self.cfg.server_id,
            "scenario": self.cfg.scenario_default,
            "rotation_id": self.rotation_id,
            "player": ev.player.as_deref().unwrap_or("unknown"),
            "event": event,
            "game_tick": ev.field("game_tick").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
        });
        self.insert(PLAYER_EVENTS_TABLE, row).await;
    }

    async fn chat(&self, ev: &GameEvent) {
        let row = json!({
            "ts": Self::now_ts(),
            "server_id": self.cfg.server_id,
            "scenario": self.cfg.scenario_default,
            "rotation_id": self.rotation_id,
            "player": ev.player.as_deref().unwrap_or("unknown"),
            "mode": "chat",
            "message": ev.text,
            "game_tick": 0u64,
        });
        self.insert(CHAT_LOG_TABLE, row).await;
    }

    async fn insert(&self, table: &str, row: serde_json::Value) {
        match self
            .ch
            .execute_insert(table, std::slice::from_ref(&row))
            .await
        {
            Ok(()) => debug!(table, "inserted row"),
            Err(e) => warn!(table, error = %e, "clickhouse insert failed"),
        }
    }

    async fn handle(&mut self, ev: GameEvent) {
        match ev.kind {
            GameEventKind::Stats => match ev.field("kind") {
                Some("snapshot") => self.snapshot(&ev).await,
                Some("player_event") => {
                    let event = ev.field("event").unwrap_or("join").to_string();
                    self.player_event(&ev, &event).await;
                }
                _ => {}
            },
            GameEventKind::Join => self.player_event(&ev, "join").await,
            GameEventKind::Leave => self.player_event(&ev, "leave").await,
            GameEventKind::Chat => self.chat(&ev).await,
            GameEventKind::Command => {}
        }
    }
}

pub async fn run(cfg: Config, mut rx: Receiver<GameEvent>) -> Result<()> {
    let Some(url) = cfg.clickhouse_url.clone() else {
        warn!("ch_writer disabled: CLICKHOUSE_URL not set");
        loop {
            match rx.recv().await {
                Ok(_) => {}
                Err(RecvError::Closed) => break,
                Err(_) => continue,
            }
        }
        return Ok(());
    };

    let ch = ClickHouseConfig {
        url,
        user: cfg.clickhouse_user.clone().unwrap_or_default(),
        password: cfg.clickhouse_password.clone().unwrap_or_default(),
        database: cfg.clickhouse_database.clone(),
    };

    let mut producer = Producer {
        ch,
        rotation_id: Uuid::new_v4().to_string(),
        started: Instant::now(),
        last_snapshot: None,
        cfg,
    };

    info!(
        rotation_id = %producer.rotation_id,
        database = %producer.cfg.clickhouse_database,
        "ch_writer active — inserting into gameops.factorio_*"
    );

    loop {
        match rx.recv().await {
            Ok(ev) => producer.handle(ev).await,
            Err(RecvError::Lagged(n)) => warn!(skipped = n, "ch_writer lagged on broadcast"),
            Err(RecvError::Closed) => break,
        }
    }
    Ok(())
}
