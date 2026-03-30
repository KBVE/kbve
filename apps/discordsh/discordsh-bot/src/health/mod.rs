use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{ProcessesToUpdate, System};
use tokio::sync::RwLock;
use tracing::{info, warn};

// ── Health status ────────────────────────────────────────────────────

/// Health assessment based on memory and CPU thresholds.
///
/// Thresholds match the Python notification-bot:
/// - HEALTHY: memory ≤ 70% AND CPU ≤ 70%
/// - WARNING: either > 70% but neither > 90%
/// - CRITICAL: either > 90%
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HealthStatus {
    Healthy,
    Warning,
    Critical,
}

impl HealthStatus {
    pub fn from_usage(memory_percent: f64, cpu_percent: f64) -> Self {
        if memory_percent > 90.0 || cpu_percent > 90.0 {
            Self::Critical
        } else if memory_percent > 70.0 || cpu_percent > 70.0 {
            Self::Warning
        } else {
            Self::Healthy
        }
    }

    /// Discord embed color override.
    /// Returns `None` for Healthy (caller should use the normal state color).
    pub fn color_override(self) -> Option<u32> {
        match self {
            Self::Healthy => None,
            Self::Warning => Some(0xE67E22),
            Self::Critical => Some(0xED4245),
        }
    }

    pub fn emoji(self) -> &'static str {
        match self {
            Self::Healthy => "\u{1F7E2}",
            Self::Warning => "\u{1F7E1}",
            Self::Critical => "\u{1F534}",
        }
    }
}

// ── Health snapshot ──────────────────────────────────────────────────

/// Serializable snapshot of health metrics.
#[derive(Debug, Clone, Serialize)]
pub struct HealthSnapshot {
    pub memory_usage_mb: f64,
    pub memory_percent: f64,
    pub system_memory_total_gb: f64,
    pub system_memory_used_percent: f64,
    pub cpu_percent: f64,
    pub thread_count: usize,
    pub pid: u32,
    pub uptime_seconds: u64,
    pub uptime_formatted: String,
    pub health_status: HealthStatus,
}

impl HealthSnapshot {
    /// Generate a Discord-friendly memory bar using emoji squares.
    pub fn memory_bar(&self, width: usize) -> String {
        let filled = ((self.memory_percent / 100.0) * width as f64).round() as usize;
        let filled = filled.min(width);

        let (fill, empty) = if self.memory_percent > 90.0 {
            ("\u{1F7E5}", "\u{2B1B}") // red / black
        } else if self.memory_percent > 70.0 {
            ("\u{1F7E7}", "\u{2B1B}") // orange / black
        } else {
            ("\u{1F7E9}", "\u{2B1B}") // green / black
        };

        format!("{}{}", fill.repeat(filled), empty.repeat(width - filled))
    }
}

// ── Health monitor ───────────────────────────────────────────────────

/// Background health monitor that periodically collects system metrics.
///
/// Owns a persistent `sysinfo::System` for accurate CPU delta measurement
/// and exposes the latest `HealthSnapshot` via an `Arc<RwLock<>>`.
pub struct HealthMonitor {
    sys: RwLock<System>,
    snapshot: RwLock<Option<HealthSnapshot>>,
    start_time: Instant,
    pid: sysinfo::Pid,
}

impl HealthMonitor {
    /// Create a new monitor. Call `spawn_background_task()` to start collection.
    pub fn new() -> Self {
        let pid = sysinfo::get_current_pid().expect("failed to get current PID");
        let mut sys = System::new();
        // Prime the CPU measurement so the first real refresh has a delta.
        sys.refresh_cpu_usage();

        Self {
            sys: RwLock::new(sys),
            snapshot: RwLock::new(None),
            start_time: Instant::now(),
            pid,
        }
    }

    /// Spawn the background refresh task onto the tokio runtime.
    pub fn spawn_background_task(self: &Arc<Self>) {
        let monitor = Arc::clone(self);
        tokio::spawn(async move {
            monitor.background_loop().await;
        });
    }

    /// Read the latest cached snapshot. Returns `None` only before the
    /// first refresh cycle completes (~1s after startup).
    pub async fn snapshot(&self) -> Option<HealthSnapshot> {
        self.snapshot.read().await.clone()
    }

    /// Force an immediate metric refresh (used by the Refresh button).
    pub async fn force_refresh(&self) {
        let snap = self.collect_inner().await;
        *self.snapshot.write().await = Some(snap);
    }

    /// Background loop: 1s warmup for CPU delta, then 60s periodic refreshes.
    async fn background_loop(&self) {
        // Wait 1s so the primed CPU refresh has a meaningful time delta.
        tokio::time::sleep(Duration::from_secs(1)).await;

        let snap = self.collect_inner().await;
        *self.snapshot.write().await = Some(snap);
        info!("Initial health snapshot collected");

        let mut interval = tokio::time::interval(Duration::from_secs(60));
        interval.tick().await; // skip the immediate first tick

        loop {
            interval.tick().await;
            let snap = self.collect_inner().await;
            *self.snapshot.write().await = Some(snap);
        }
    }

    /// Refresh the persistent System and extract a snapshot.
    async fn collect_inner(&self) -> HealthSnapshot {
        let mut sys = self.sys.write().await;
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::Some(&[self.pid]), false);
        self.extract_from(&sys)
    }

    /// Extract metrics from the System without holding any lock.
    fn extract_from(&self, sys: &System) -> HealthSnapshot {
        let total_mem = sys.total_memory();
        let used_mem = sys.used_memory();

        let (proc_mem_bytes, thread_count) = match sys.process(self.pid) {
            Some(proc) => {
                let threads = {
                    #[cfg(target_os = "linux")]
                    {
                        proc.tasks().map_or(0, |t| t.len())
                    }
                    #[cfg(not(target_os = "linux"))]
                    {
                        let _ = proc;
                        0usize
                    }
                };
                (proc.memory(), threads)
            }
            None => {
                warn!("Could not find own process in sysinfo");
                (0, 0)
            }
        };

        let memory_usage_mb = proc_mem_bytes as f64 / 1_048_576.0;
        let memory_percent = if total_mem > 0 {
            (proc_mem_bytes as f64 / total_mem as f64) * 100.0
        } else {
            0.0
        };
        let system_memory_total_gb = total_mem as f64 / 1_073_741_824.0;
        let system_memory_used_percent = if total_mem > 0 {
            (used_mem as f64 / total_mem as f64) * 100.0
        } else {
            0.0
        };
        let cpu_percent = sys.global_cpu_usage() as f64;

        let uptime_secs = self.start_time.elapsed().as_secs();
        let health_status = HealthStatus::from_usage(memory_percent, cpu_percent);

        HealthSnapshot {
            memory_usage_mb: round2(memory_usage_mb),
            memory_percent: round2(memory_percent),
            system_memory_total_gb: round2(system_memory_total_gb),
            system_memory_used_percent: round2(system_memory_used_percent),
            cpu_percent: round2(cpu_percent),
            thread_count,
            pid: self.pid.as_u32(),
            uptime_seconds: uptime_secs,
            uptime_formatted: format_uptime_secs(uptime_secs),
            health_status,
        }
    }
}

/// Round to 2 decimal places.
fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn format_uptime_secs(total_secs: u64) -> String {
    let days = total_secs / 86400;
    let hours = (total_secs % 86400) / 3600;
    let minutes = (total_secs % 3600) / 60;
    let seconds = total_secs % 60;

    if days > 0 {
        format!("{days}d {hours}h {minutes}m {seconds}s")
    } else if hours > 0 {
        format!("{hours}h {minutes}m {seconds}s")
    } else if minutes > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{seconds}s")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_status_healthy() {
        assert_eq!(HealthStatus::from_usage(50.0, 60.0), HealthStatus::Healthy);
        assert_eq!(HealthStatus::from_usage(70.0, 70.0), HealthStatus::Healthy);
    }

    #[test]
    fn health_status_warning() {
        assert_eq!(HealthStatus::from_usage(71.0, 50.0), HealthStatus::Warning);
        assert_eq!(HealthStatus::from_usage(50.0, 71.0), HealthStatus::Warning);
    }

    #[test]
    fn health_status_critical() {
        assert_eq!(HealthStatus::from_usage(91.0, 50.0), HealthStatus::Critical);
        assert_eq!(HealthStatus::from_usage(50.0, 91.0), HealthStatus::Critical);
    }

    #[test]
    fn memory_bar_low_usage() {
        let snap = HealthSnapshot {
            memory_usage_mb: 10.0,
            memory_percent: 30.0,
            system_memory_total_gb: 16.0,
            system_memory_used_percent: 50.0,
            cpu_percent: 5.0,
            thread_count: 1,
            pid: 1,
            uptime_seconds: 60,
            uptime_formatted: "1m 0s".into(),
            health_status: HealthStatus::Healthy,
        };
        let bar = snap.memory_bar(10);
        // 30% of 10 = 3 filled
        assert!(bar.contains("\u{1F7E9}")); // green squares
        assert!(bar.contains("\u{2B1B}")); // black squares
    }

    #[test]
    fn round2_precision() {
        assert_eq!(round2(3.14159), 3.14);
        assert_eq!(round2(0.0), 0.0);
        assert_eq!(round2(99.999), 100.0);
    }
}
