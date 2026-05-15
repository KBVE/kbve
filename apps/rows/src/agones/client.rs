//! Agones client — K8s API access with circuit breaker.

use kube::Client;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

/// Circuit breaker opens after this many consecutive failures.
/// Override: AGONES_circuit_breaker_threshold() env var.
fn circuit_breaker_threshold() -> u32 {
    std::env::var("AGONES_circuit_breaker_threshold()")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5)
}

/// Seconds to wait before allowing a retry after circuit opens.
/// Override: AGONES_circuit_breaker_reset_secs() env var.
fn circuit_breaker_reset_secs() -> u64 {
    std::env::var("AGONES_circuit_breaker_reset_secs()")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
}

/// Timeout for individual K8s API calls (seconds).
/// Override: AGONES_API_TIMEOUT_SECS env var.
pub(crate) fn api_timeout() -> Duration {
    let secs = std::env::var("AGONES_API_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10u64);
    Duration::from_secs(secs)
}

/// Agones GameServer manager via kube-rs.
pub struct AgonesClient {
    pub(crate) client: Client,
    pub(crate) namespace: String,
    pub(crate) fleet: String,
    pub(crate) consecutive_failures: AtomicU32,
    pub(crate) circuit_opened_at: std::sync::Mutex<Option<Instant>>,
}

impl AgonesClient {
    /// Try to initialize an in-cluster Kubernetes client for Agones.
    /// Returns None if not running inside a K8s pod (non-fatal).
    #[tracing::instrument(skip_all, fields(namespace, fleet))]
    pub async fn try_new(namespace: &str, fleet: &str) -> Option<Self> {
        match Client::try_default().await {
            Ok(client) => {
                info!(namespace, fleet, "Agones client initialized (in-cluster)");
                Some(Self {
                    client,
                    namespace: namespace.to_string(),
                    fleet: fleet.to_string(),
                    consecutive_failures: AtomicU32::new(0),
                    circuit_opened_at: std::sync::Mutex::new(None),
                })
            }
            Err(e) => {
                error!(error = %e, "Agones client unavailable (non-fatal)");
                None
            }
        }
    }

    /// Check if the circuit breaker allows an operation.
    pub(crate) fn check_circuit(&self) -> Result<(), super::AgonesError> {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures >= circuit_breaker_threshold() {
            let mut opened = self.circuit_opened_at.lock().unwrap();
            if let Some(opened_at) = *opened {
                if opened_at.elapsed() < Duration::from_secs(circuit_breaker_reset_secs()) {
                    return Err(super::AgonesError::CircuitOpen {
                        consecutive_failures: failures,
                    });
                }
                info!("Circuit breaker half-open — allowing retry");
                *opened = None;
                self.consecutive_failures.store(0, Ordering::Relaxed);
            }
        }
        Ok(())
    }

    /// Record a successful operation — resets the circuit breaker.
    pub(crate) fn record_success(&self) {
        self.consecutive_failures.store(0, Ordering::Relaxed);
        *self.circuit_opened_at.lock().unwrap() = None;
    }

    /// Record a failed operation — may trip the circuit breaker.
    pub(crate) fn record_failure(&self) {
        let prev = self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
        if prev + 1 >= circuit_breaker_threshold() {
            let mut opened = self.circuit_opened_at.lock().unwrap();
            if opened.is_none() {
                warn!(
                    failures = prev + 1,
                    reset_secs = circuit_breaker_reset_secs(),
                    "Circuit breaker opened — pausing operations"
                );
                *opened = Some(Instant::now());
            }
        }
    }

    /// Get the namespace this client operates in.
    pub fn namespace(&self) -> &str {
        &self.namespace
    }

    /// Get the fleet this client targets.
    pub fn fleet(&self) -> &str {
        &self.fleet
    }

    /// Check if the circuit breaker is currently open.
    pub fn is_circuit_open(&self) -> bool {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures >= circuit_breaker_threshold() {
            let opened = self.circuit_opened_at.lock().unwrap();
            if let Some(opened_at) = *opened {
                return opened_at.elapsed() < Duration::from_secs(circuit_breaker_reset_secs());
            }
        }
        false
    }

    /// Get the current consecutive failure count.
    pub fn consecutive_failure_count(&self) -> u32 {
        self.consecutive_failures.load(Ordering::Relaxed)
    }

    /// Scale the fleet to a given number of replicas.
    /// Uses JSON Merge Patch on the fleet spec (not the scale subresource).
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
