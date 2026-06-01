use anyhow::Result;
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader, SeekFrom};
use tokio::sync::broadcast::Sender;
use tokio::time::{Duration, sleep};
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind};

pub async fn run(cfg: Config, tx: Sender<GameEvent>) -> Result<()> {
    let path = cfg.console_log_path.clone();
    info!(?path, "log_tail starting");

    loop {
        if !path.exists() {
            debug!(?path, "console log not present yet, waiting");
            sleep(Duration::from_secs(1)).await;
            continue;
        }

        let mut file = match File::open(&path).await {
            Ok(f) => f,
            Err(err) => {
                warn!(?err, ?path, "failed to open console log");
                sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        if let Err(err) = file.seek(SeekFrom::End(0)).await {
            warn!(?err, "failed to seek end of console log");
            sleep(Duration::from_secs(1)).await;
            continue;
        }

        let mut reader = BufReader::new(file);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    sleep(Duration::from_millis(500)).await;
                }
                Ok(_) => {
                    if let Some(event) = parse_line(&line) {
                        let _ = tx.send(event);
                    }
                }
                Err(err) => {
                    warn!(?err, "console log read error, reopening");
                    break;
                }
            }
        }
    }
}

fn parse_line(line: &str) -> Option<GameEvent> {
    let trimmed = line.trim_end_matches(['\n', '\r']);
    let kind = if trimmed.contains("[CHAT]") {
        GameEventKind::Chat
    } else if trimmed.contains("[JOIN]") {
        GameEventKind::Join
    } else if trimmed.contains("[LEAVE]") {
        GameEventKind::Leave
    } else if trimmed.contains("[COMMAND]") {
        GameEventKind::Command
    } else if trimmed.contains("[STATS]") {
        GameEventKind::Stats
    } else {
        return None;
    };

    Some(GameEvent {
        kind,
        player: None,
        text: trimmed.to_string(),
        raw: trimmed.to_string(),
    })
}
