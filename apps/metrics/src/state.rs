use std::sync::Arc;
use std::time::{Duration, Instant};

use ahash::AHashMap;
use jedi::state::sidecar::ClickHouseConfig;
use parking_lot::Mutex;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

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

    /// Fixed-window counter. Returns false once `limit` is exceeded for `key`
    /// within the 60s window. A limit of 0 disables the check (always allows).
    fn check(&self, key: &str, limit: u32) -> bool {
        if limit == 0 {
            return true;
        }
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
        bucket.count <= limit
    }

    /// Per-client-IP request cap.
    pub fn allow_ip(&self, ip: &str) -> bool {
        self.check(ip, self.cfg.rate_limit_per_min)
    }

    /// Per-project event cap (keyed separately from IPs).
    pub fn allow_project(&self, project: &str) -> bool {
        self.check(&format!("p:{project}"), self.cfg.project_rate_limit_per_min)
    }

    /// Global ingest ceiling across all clients.
    pub fn allow_global(&self) -> bool {
        self.check("__global__", self.cfg.global_rate_limit_per_min)
    }
}

pub fn spawn_flusher(
    state: Arc<AppState>,
    mut rx: mpsc::Receiver<Value>,
    mut shutdown: oneshot::Receiver<()>,
) -> JoinHandle<()> {
    let table = state.cfg.errors_table.clone();
    let flush_rows = state.cfg.flush_rows;
    let interval = Duration::from_millis(state.cfg.flush_interval_ms);
    let timeout = Duration::from_millis(state.cfg.insert_timeout_ms);
    let retries = state.cfg.insert_max_retries;
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
                                flush(&state.ch, &table, &mut buf, timeout, retries).await;
                            }
                        }
                        None => {
                            flush(&state.ch, &table, &mut buf, timeout, retries).await;
                            break;
                        }
                    }
                }
                _ = tick.tick() => {
                    if !buf.is_empty() {
                        flush(&state.ch, &table, &mut buf, timeout, retries).await;
                    }
                }
                _ = &mut shutdown => {
                    // Drain anything still queued, then final flush before exit
                    // so a rollout doesn't lose buffered telemetry.
                    while let Ok(row) = rx.try_recv() {
                        buf.push(row);
                    }
                    flush(&state.ch, &table, &mut buf, timeout, retries).await;
                    break;
                }
            }
        }
    })
}

/// Insert with a per-attempt timeout (a hung ClickHouse must not stall the
/// single flusher forever) and bounded retries with backoff (survive a
/// transient CH blip instead of dropping the whole buffer on first error).
async fn flush(
    ch: &ClickHouseConfig,
    table: &str,
    buf: &mut Vec<Value>,
    timeout: Duration,
    max_retries: u32,
) {
    if buf.is_empty() {
        return;
    }
    let rows = std::mem::take(buf);
    let n = rows.len();
    let mut attempt = 0u32;
    loop {
        let result = tokio::time::timeout(timeout, ch.execute_insert(table, &rows)).await;
        match result {
            Ok(Ok(())) => {
                tracing::debug!(rows = n, "flushed telemetry rows");
                return;
            }
            outcome => {
                if attempt >= max_retries {
                    match outcome {
                        Ok(Err(e)) => {
                            tracing::error!(error = %e, rows = n, attempts = attempt + 1, "clickhouse insert failed; dropping rows")
                        }
                        _ => {
                            tracing::error!(
                                timeout_ms = timeout.as_millis() as u64,
                                rows = n,
                                attempts = attempt + 1,
                                "clickhouse insert timed out; dropping rows"
                            )
                        }
                    }
                    return;
                }
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
            }
        }
    }
}
