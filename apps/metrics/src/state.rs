use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use ahash::AHashMap;
use jedi::state::sidecar::ClickHouseConfig;
use parking_lot::Mutex;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use crate::auth::StaffAuth;
use crate::config::Config;

const LIMITER_SHARDS: usize = 32;
const WINDOW: Duration = Duration::from_secs(60);

pub struct AppState {
    pub cfg: Config,
    pub ch: ClickHouseConfig,
    pub tx: mpsc::Sender<String>,
    pub auth: Option<StaffAuth>,
    pub started_at: Instant,
    ip_limiter: Sharded,
    project_limiter: Sharded,
    global_count: AtomicU32,
    global_window_ms: AtomicU64,
    /// Latched once the errors table has been seen. The schema is applied by a
    /// one-shot setup job and never goes away afterwards, so re-querying on every
    /// kubelet probe would buy nothing and cost a ClickHouse round trip each time.
    schema_ready: AtomicBool,
}

struct Bucket {
    count: u32,
    window_start: Instant,
}

/// Fixed-window rate limiter split across `LIMITER_SHARDS` independently-locked
/// maps. Under concurrent ingest, requests hash to different shards instead of
/// all serializing on one global mutex.
struct Sharded {
    shards: [Mutex<AHashMap<String, Bucket>>; LIMITER_SHARDS],
}

impl Sharded {
    fn new() -> Self {
        Self {
            shards: std::array::from_fn(|_| Mutex::new(AHashMap::new())),
        }
    }

    fn check(&self, key: &str, limit: u32) -> bool {
        if limit == 0 {
            return true;
        }
        let now = Instant::now();
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut hasher);
        let shard = &self.shards[(hasher.finish() as usize) % LIMITER_SHARDS];

        let mut map = shard.lock();
        if map.len() > 4096 {
            map.retain(|_, b| now.duration_since(b.window_start) < WINDOW);
        }
        // Fast path: existing key needs no allocation.
        if let Some(b) = map.get_mut(key) {
            if now.duration_since(b.window_start) >= WINDOW {
                b.count = 0;
                b.window_start = now;
            }
            b.count += 1;
            return b.count <= limit;
        }
        map.insert(
            key.to_string(),
            Bucket {
                count: 1,
                window_start: now,
            },
        );
        1 <= limit
    }
}

impl AppState {
    pub fn new(
        cfg: Config,
        ch: ClickHouseConfig,
        tx: mpsc::Sender<String>,
        auth: Option<StaffAuth>,
    ) -> Self {
        Self {
            cfg,
            ch,
            tx,
            auth,
            started_at: Instant::now(),
            ip_limiter: Sharded::new(),
            project_limiter: Sharded::new(),
            global_count: AtomicU32::new(0),
            global_window_ms: AtomicU64::new(0),
            schema_ready: AtomicBool::new(false),
        }
    }

    /// Whether the errors table actually exists.
    ///
    /// `SELECT 1` passes against a ClickHouse with no telemetry schema at all,
    /// which is how a wedged setup job stayed invisible: ingest answered 202,
    /// the flusher failed asynchronously and dropped every row, and the only
    /// complaint was a 502 on a dashboard nobody had open. This asks the
    /// question the probe was supposed to be asking.
    pub async fn schema_ready(&self) -> bool {
        if self.schema_ready.load(Ordering::Relaxed) {
            return true;
        }
        // LIMIT 0 so this stays a metadata check rather than reading rows.
        let sql = format!("SELECT 1 FROM {} LIMIT 0", self.cfg.errors_table);
        let ok = self.ch.execute_select(&sql).await.is_ok();
        if ok {
            self.schema_ready.store(true, Ordering::Relaxed);
        }
        ok
    }

    /// Per-client-IP request cap.
    pub fn allow_ip(&self, ip: &str) -> bool {
        self.ip_limiter.check(ip, self.cfg.rate_limit_per_min)
    }

    /// Per-project event cap (separate shard map; no key allocation on hits).
    pub fn allow_project(&self, project: &str) -> bool {
        self.project_limiter
            .check(project, self.cfg.project_rate_limit_per_min)
    }

    /// Global ingest ceiling — a single lock-free fixed-window counter so the
    /// hottest check on every request never takes a lock.
    pub fn allow_global(&self) -> bool {
        let limit = self.cfg.global_rate_limit_per_min;
        if limit == 0 {
            return true;
        }
        let now_ms = self.started_at.elapsed().as_millis() as u64;
        let start = self.global_window_ms.load(Ordering::Relaxed);
        if now_ms.saturating_sub(start) >= WINDOW.as_millis() as u64
            && self
                .global_window_ms
                .compare_exchange(start, now_ms, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
        {
            self.global_count.store(0, Ordering::Relaxed);
        }
        // fetch_add returns the prior value; prior + 1 <= limit  ==  prior < limit.
        self.global_count.fetch_add(1, Ordering::Relaxed) < limit
    }
}

pub fn spawn_flusher(
    state: Arc<AppState>,
    mut rx: mpsc::Receiver<String>,
    mut shutdown: oneshot::Receiver<()>,
) -> JoinHandle<()> {
    let table = state.cfg.errors_table.clone();
    let flush_rows = state.cfg.flush_rows;
    let interval = Duration::from_millis(state.cfg.flush_interval_ms);
    let timeout = Duration::from_millis(state.cfg.insert_timeout_ms);
    let retries = state.cfg.insert_max_retries;
    tokio::spawn(async move {
        let mut buf: Vec<String> = Vec::with_capacity(flush_rows);
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
    buf: &mut Vec<String>,
    timeout: Duration,
    max_retries: u32,
) {
    if buf.is_empty() {
        return;
    }
    let rows = std::mem::take(buf);
    let n = rows.len();
    // Rows arrive pre-serialized; the flusher only concatenates the
    // JSONEachRow body (single allocation), never re-walks a Value.
    let body = rows.join("\n");
    let mut attempt = 0u32;
    loop {
        let result = tokio::time::timeout(timeout, ch.execute_insert_raw(table, &body)).await;
        match result {
            Ok(Ok(())) => {
                tracing::debug!(rows = n, "flushed telemetry rows");
                metrics::counter!("metrics_flush_rows_total").increment(n as u64);
                return;
            }
            outcome => {
                if attempt >= max_retries {
                    metrics::counter!("metrics_flush_failures_total").increment(1);
                    metrics::counter!("metrics_flush_dropped_rows_total").increment(n as u64);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A ClickHouse that cannot be reached, so a query can only fail. Port 1 is
    /// unroutable rather than merely closed, which keeps the test off the network
    /// stack's slow path.
    fn unreachable_state() -> AppState {
        let (tx, _rx) = mpsc::channel(8);
        AppState::new(
            Config::from_env(),
            ClickHouseConfig {
                url: "http://127.0.0.1:1".to_string(),
                user: "test".to_string(),
                password: String::new(),
                database: "telemetry".to_string(),
            },
            tx,
            None,
        )
    }

    #[tokio::test]
    async fn a_missing_errors_table_is_not_ready() {
        let app = unreachable_state();
        assert!(
            !app.schema_ready().await,
            "a database the service cannot even query must not read as ready"
        );
        assert!(
            !app.schema_ready.load(Ordering::Relaxed),
            "a failed check must not latch, or one bad probe would poison every later one"
        );
    }

    #[tokio::test]
    async fn the_check_latches_once_the_table_has_been_seen() {
        // Standing in for a successful first probe. After that the answer is
        // returned without touching ClickHouse — which is the point, since this
        // runs on every kubelet readiness probe for the life of the pod.
        let app = unreachable_state();
        app.schema_ready.store(true, Ordering::Relaxed);
        assert!(
            app.schema_ready().await,
            "the latch must short-circuit rather than re-query a now-unreachable server"
        );
    }

    #[test]
    fn sharded_limiter_enforces_and_isolates_keys() {
        let s = Sharded::new();
        assert!(s.check("k", 2));
        assert!(s.check("k", 2));
        assert!(!s.check("k", 2)); // third over a limit of 2
        assert!(s.check("other", 2)); // independent key unaffected
        assert!(s.check("k", 0)); // limit 0 disables the check
    }
}
