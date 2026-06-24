use kube::Client;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

fn circuit_breaker_threshold() -> u32 {
    std::env::var("AGONES_CIRCUIT_BREAKER_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5)
}

fn circuit_breaker_reset_secs() -> u64 {
    std::env::var("AGONES_CIRCUIT_BREAKER_RESET_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
}

pub(crate) fn api_timeout() -> Duration {
    let secs = std::env::var("AGONES_API_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10u64);
    Duration::from_secs(secs)
}

/// A single circuit breaker (consecutive-failure count + open-since). Allocation and deallocation
/// each own a separate instance so a deallocate storm (the reaper / stale-zone cleanup backstop)
/// can't trip the breaker that gates *player* allocation — the player-facing hot path.
pub(crate) struct Breaker {
    consecutive_failures: AtomicU32,
    opened_at: std::sync::Mutex<Option<Instant>>,
    label: &'static str,
}

impl Breaker {
    fn new(label: &'static str) -> Self {
        Self {
            consecutive_failures: AtomicU32::new(0),
            opened_at: std::sync::Mutex::new(None),
            label,
        }
    }

    fn check(&self) -> Result<(), super::AgonesError> {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures >= circuit_breaker_threshold() {
            let mut opened = self.opened_at.lock().unwrap();
            if let Some(opened_at) = *opened {
                if opened_at.elapsed() < Duration::from_secs(circuit_breaker_reset_secs()) {
                    return Err(super::AgonesError::CircuitOpen {
                        consecutive_failures: failures,
                    });
                }
                info!(breaker = self.label, "Circuit breaker half-open — allowing retry");
                *opened = None;
                self.consecutive_failures.store(0, Ordering::Relaxed);
            }
        }
        Ok(())
    }

    fn record_success(&self) {
        self.consecutive_failures.store(0, Ordering::Relaxed);
        *self.opened_at.lock().unwrap() = None;
    }

    fn record_failure(&self) {
        let prev = self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
        if prev + 1 >= circuit_breaker_threshold() {
            let mut opened = self.opened_at.lock().unwrap();
            if opened.is_none() {
                warn!(
                    breaker = self.label,
                    failures = prev + 1,
                    reset_secs = circuit_breaker_reset_secs(),
                    "Circuit breaker opened — pausing operations"
                );
                *opened = Some(Instant::now());
            }
        }
    }

    fn is_open(&self) -> bool {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures >= circuit_breaker_threshold() {
            let opened = self.opened_at.lock().unwrap();
            if let Some(opened_at) = *opened {
                return opened_at.elapsed() < Duration::from_secs(circuit_breaker_reset_secs());
            }
        }
        false
    }

    fn failure_count(&self) -> u32 {
        self.consecutive_failures.load(Ordering::Relaxed)
    }
}

pub struct AgonesClient {
    pub(crate) client: Client,
    pub(crate) namespace: String,
    pub(crate) fleet: String,
    /// Gates player allocation. Deallocate failures do NOT touch this.
    pub(crate) alloc_breaker: Breaker,
    /// Isolated breaker for deallocate (backstop teardown) so it can't starve allocation.
    pub(crate) dealloc_breaker: Breaker,
}

impl AgonesClient {
    /// Returns `None` outside a K8s pod (no in-cluster kubeconfig) so callers can run locally.
    #[tracing::instrument(skip_all, fields(namespace, fleet))]
    pub async fn try_new(namespace: &str, fleet: &str) -> Option<Self> {
        match Client::try_default().await {
            Ok(client) => {
                info!(namespace, fleet, "Agones client initialized (in-cluster)");
                Some(Self {
                    client,
                    namespace: namespace.to_string(),
                    fleet: fleet.to_string(),
                    alloc_breaker: Breaker::new("allocate"),
                    dealloc_breaker: Breaker::new("deallocate"),
                })
            }
            Err(e) => {
                error!(error = %e, "Agones client unavailable (non-fatal)");
                None
            }
        }
    }

    // Allocation breaker (player-facing hot path).
    pub(crate) fn check_circuit(&self) -> Result<(), super::AgonesError> {
        self.alloc_breaker.check()
    }

    pub(crate) fn record_success(&self) {
        self.alloc_breaker.record_success();
    }

    pub(crate) fn record_failure(&self) {
        self.alloc_breaker.record_failure();
    }

    // Deallocation breaker — isolated so backstop teardown failures can't deny player allocations.
    pub(crate) fn check_circuit_dealloc(&self) -> Result<(), super::AgonesError> {
        self.dealloc_breaker.check()
    }

    pub(crate) fn record_dealloc_success(&self) {
        self.dealloc_breaker.record_success();
    }

    pub(crate) fn record_dealloc_failure(&self) {
        self.dealloc_breaker.record_failure();
    }

    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    pub fn fleet(&self) -> &str {
        &self.fleet
    }

    /// Player-facing health: reports the allocation breaker (deallocate is isolated, so a teardown
    /// storm doesn't degrade the reported allocate health).
    pub fn is_circuit_open(&self) -> bool {
        self.alloc_breaker.is_open()
    }

    pub fn consecutive_failure_count(&self) -> u32 {
        self.alloc_breaker.failure_count()
    }

    /// Patches the fleet spec directly (JSON Merge Patch) instead of the `/scale` subresource;
    /// the latter has been flaky against Agones CRDs.
    pub async fn scale_fleet(&self, replicas: i32) -> Result<(), super::AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/fleets/{}",
            self.namespace, self.fleet
        );

        let body = serde_json::json!({
            "spec": {
                "replicas": replicas
            }
        });

        let req = http::Request::patch(&url)
            .header("Content-Type", "application/merge-patch+json")
            .body(serde_json::to_vec(&body).unwrap())
            .map_err(|e| anyhow::anyhow!("Failed to build scale request: {e}"))?;

        let _resp: serde_json::Value =
            tokio::time::timeout(api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("Fleet scale request timed out"))??;

        info!(fleet = %self.fleet, replicas, "Fleet scaled");
        Ok(())
    }
}
