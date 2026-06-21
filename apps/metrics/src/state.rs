use std::sync::Arc;
use std::time::{Duration, Instant};

use ahash::AHashMap;
use jedi::state::sidecar::ClickHouseConfig;
use parking_lot::Mutex;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::auth::StaffAuth;
use crate::config::Config;

pub struct AppState {
    pub cfg: Config,
    pub ch: ClickHouseConfig,
    pub tx: mpsc::Sender<Value>,
    pub auth: Option<StaffAuth>,
    pub started_at: Instant,
    limiter: Mutex<AHashMap<String, Bucket>>,
}

struct Bucket {
    count: u32,
    window_start: Instant,
}

impl AppState {
    pub fn new(
        cfg: Config,
        ch: ClickHouseConfig,
        tx: mpsc::Sender<Value>,
        auth: Option<StaffAuth>,
    ) -> Self {
        Self {
            cfg,
            ch,
            tx,
            auth,
            started_at: Instant::now(),
            limiter: Mutex::new(AHashMap::new()),
        }
    }

    pub fn allow(&self, key: &str) -> bool {
        let now = Instant::now();
        let window = Duration::from_secs(60);
        let mut map = self.limiter.lock();
        if map.len() > 50_000 {
            map.retain(|_, b| now.duration_since(b.window_start) < window);
        }
        let bucket = map.entry(key.to_string()).or_insert(Bucket {
            count: 0,
            window_start: now,
        });
        if now.duration_since(bucket.window_start) >= window {
            bucket.count = 0;
            bucket.window_start = now;
        }
        bucket.count += 1;
        bucket.count <= self.cfg.rate_limit_per_min
    }
}

pub fn spawn_flusher(state: Arc<AppState>, mut rx: mpsc::Receiver<Value>) {
    let table = state.cfg.errors_table.clone();
    let flush_rows = state.cfg.flush_rows;
    let interval = Duration::from_millis(state.cfg.flush_interval_ms);
    tokio::spawn(async move {
        let mut buf: Vec<Value> = Vec::with_capacity(flush_rows);
        let mut tick = tokio::time::interval(interval);
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(row) => {
                            buf.push(row);
                            if buf.len() >= flush_rows {
                                flush(&state.ch, &table, &mut buf).await;
                            }
                        }
                        None => {
                            flush(&state.ch, &table, &mut buf).await;
                            break;
                        }
                    }
                }
                _ = tick.tick() => {
                    if !buf.is_empty() {
                        flush(&state.ch, &table, &mut buf).await;
                    }
                }
            }
        }
    });
}

async fn flush(ch: &ClickHouseConfig, table: &str, buf: &mut Vec<Value>) {
    if buf.is_empty() {
        return;
    }
    let rows = std::mem::take(buf);
    let n = rows.len();
    if let Err(e) = ch.execute_insert(table, &rows).await {
        tracing::error!(error = %e, rows = n, "clickhouse insert failed");
    } else {
        tracing::debug!(rows = n, "flushed telemetry rows");
    }
}
