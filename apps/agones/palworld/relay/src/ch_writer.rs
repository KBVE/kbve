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

const SNAPSHOTS_TABLE: &str = "gameops.palworld_snapshots_raw";
const PLAYER_EVENTS_TABLE: &str = "gameops.palworld_player_events_raw";

struct Producer {
    ch: ClickHouseConfig,
    cfg: Config,
    rotation_id: String,
    started: Instant,
}

impl Producer {
    fn now_ts() -> String {
        chrono::Utc::now()
            .format("%Y-%m-%d %H:%M:%S%.3f")
            .to_string()
    }

    async fn snapshot(&self, ev: &GameEvent) {
        let row = json!({
            "ts": Self::now_ts(),
            "server_id": self.cfg.server_id,
            "rotation_id": self.rotation_id,
            "players": ev.field("players").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
            "fps": ev.field("serverfps").and_then(|v| v.parse::<i64>().ok()).unwrap_or(0),
            "uptime_s": ev.field("uptime").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
            "frametime_ms": ev.field("frametime").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0),
            "map_age_wall_s": self.started.elapsed().as_secs(),
        });
        self.insert(SNAPSHOTS_TABLE, row).await;
    }

    async fn player_event(&self, ev: &GameEvent, event: &str) {
        let row = json!({
            "ts": Self::now_ts(),
            "server_id": self.cfg.server_id,
            "rotation_id": self.rotation_id,
            "player": ev.player.as_deref().unwrap_or("unknown"),
            "event": event,
        });
        self.insert(PLAYER_EVENTS_TABLE, row).await;
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
            GameEventKind::Stats => {
                if ev.field("kind") == Some("snapshot") {
                    self.snapshot(&ev).await;
                }
            }
            GameEventKind::Join => self.player_event(&ev, "join").await,
            GameEventKind::Leave => self.player_event(&ev, "leave").await,
            GameEventKind::Chat | GameEventKind::Command => {}
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
        cfg,
    };

    info!(
        rotation_id = %producer.rotation_id,
        database = %producer.cfg.clickhouse_database,
        "ch_writer active — inserting into gameops.palworld_*"
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
