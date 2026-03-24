use kube::Client;
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};
use tracing::{error, info, warn};

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;
const CIRCUIT_BREAKER_THRESHOLD: u32 = 5;
const CIRCUIT_BREAKER_RESET_SECS: u64 = 30;

/// Agones GameServer allocator via kube-rs with retry and circuit breaker.
pub struct AgonesClient {
    client: Client,
    namespace: String,
    fleet: String,
    consecutive_failures: AtomicU32,
    circuit_opened_at: std::sync::Mutex<Option<Instant>>,
}

#[derive(Debug)]
pub struct AllocationResult {
    pub game_server_name: String,
    pub address: String,
    pub port: i32,
}

#[derive(Debug, thiserror::Error)]
pub enum AgonesError {
    #[error("circuit breaker open — {consecutive_failures} consecutive failures")]
    CircuitOpen { consecutive_failures: u32 },
    #[error("allocation state: {state} (expected Allocated)")]
    NotAllocated { state: String },
    #[error("K8s API error: {0}")]
    ApiError(#[from] kube::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

impl AgonesError {
    fn is_retryable(&self) -> bool {
        matches!(self, AgonesError::ApiError(_))
    }
}

impl AgonesClient {
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
                error!("Agones client unavailable (non-fatal): {e}");
                None
            }
        }
    }

    fn check_circuit(&self) -> Result<(), AgonesError> {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures >= CIRCUIT_BREAKER_THRESHOLD {
            let mut opened = self.circuit_opened_at.lock().unwrap();
            if let Some(opened_at) = *opened {
                if opened_at.elapsed() < Duration::from_secs(CIRCUIT_BREAKER_RESET_SECS) {
                    return Err(AgonesError::CircuitOpen {
                        consecutive_failures: failures,
                    });
                }
                // Reset after cooldown
                info!("Circuit breaker half-open — allowing retry");
                *opened = None;
                self.consecutive_failures.store(0, Ordering::Relaxed);
            }
        }
        Ok(())
    }

    fn record_success(&self) {
        self.consecutive_failures.store(0, Ordering::Relaxed);
        *self.circuit_opened_at.lock().unwrap() = None;
    }

    fn record_failure(&self) {
        let prev = self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
        if prev + 1 >= CIRCUIT_BREAKER_THRESHOLD {
            let mut opened = self.circuit_opened_at.lock().unwrap();
            if opened.is_none() {
                warn!(
                    failures = prev + 1,
                    "Circuit breaker opened — pausing allocations for {CIRCUIT_BREAKER_RESET_SECS}s"
                );
                *opened = Some(Instant::now());
            }
        }
    }

    pub async fn allocate(
        &self,
        map_name: &str,
        zone_instance_id: i32,
    ) -> Result<AllocationResult, AgonesError> {
        self.check_circuit()?;

        let start = Instant::now();
        let mut last_err = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1));
                warn!(attempt, ?backoff, "Retrying allocation");
                tokio::time::sleep(backoff).await;
            }

            match self.try_allocate(map_name, zone_instance_id).await {
                Ok(result) => {
                    self.record_success();
                    let elapsed = start.elapsed();
                    info!(
                        gs_name = result.game_server_name,
                        address = result.address,
                        port = result.port,
                        map_name,
                        zone_instance_id,
                        elapsed_ms = elapsed.as_millis() as u64,
                        attempts = attempt + 1,
                        "Allocated GameServer"
                    );
                    return Ok(result);
                }
                Err(e) => {
                    if !e.is_retryable() {
                        self.record_failure();
                        return Err(e);
                    }
                    warn!(attempt, error = %e, "Allocation attempt failed (retryable)");
                    last_err = Some(e);
                }
            }
        }

        self.record_failure();
        Err(last_err.unwrap_or_else(|| {
            AgonesError::Other(anyhow::anyhow!(
                "Allocation failed after {MAX_RETRIES} retries"
            ))
        }))
    }

    async fn try_allocate(
        &self,
        map_name: &str,
        zone_instance_id: i32,
    ) -> Result<AllocationResult, AgonesError> {
        let allocation = json!({
            "apiVersion": "allocation.agones.dev/v1",
            "kind": "GameServerAllocation",
            "metadata": { "namespace": &self.namespace },
            "spec": {
                "required": {
                    "matchLabels": {
                        "agones.dev/fleet": &self.fleet
                    }
                },
                "metadata": {
                    "labels": {
                        "ows.kbve.com/map": map_name,
                        "ows.kbve.com/zone-instance": zone_instance_id.to_string()
                    }
                }
            }
        });

        let url = format!(
            "/apis/allocation.agones.dev/v1/namespaces/{}/gameserverallocations",
            self.namespace
        );

        let req = http::Request::post(&url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&allocation)?)
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let resp: serde_json::Value = self.client.request(req).await?;

        let status = resp
            .get("status")
            .ok_or_else(|| anyhow::anyhow!("No status in allocation response"))?;

        let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("");

        if state != "Allocated" {
            return Err(AgonesError::NotAllocated {
                state: state.to_string(),
            });
        }

        let address = status
            .get("address")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let port = status
            .get("ports")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|p| p.get("port"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        let gs_name = status
            .get("gameServerName")
            .or_else(|| status.get("nodeName"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        Ok(AllocationResult {
            game_server_name: gs_name,
            address,
            port,
        })
    }

    pub async fn deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        self.check_circuit()?;

        let start = Instant::now();
        let mut last_err = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let backoff = Duration::from_millis(INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1));
                tokio::time::sleep(backoff).await;
            }

            match self.try_deallocate(game_server_name).await {
                Ok(()) => {
                    self.record_success();
                    info!(
                        game_server_name,
                        elapsed_ms = start.elapsed().as_millis() as u64,
                        "Deallocated GameServer"
                    );
                    return Ok(());
                }
                Err(e) => {
                    if !e.is_retryable() {
                        self.record_failure();
                        return Err(e);
                    }
                    last_err = Some(e);
                }
            }
        }

        self.record_failure();
        Err(last_err.unwrap_or_else(|| {
            AgonesError::Other(anyhow::anyhow!(
                "Deallocation failed after {MAX_RETRIES} retries"
            ))
        }))
    }

    async fn try_deallocate(&self, game_server_name: &str) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, game_server_name
        );

        let req = http::Request::delete(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let _: serde_json::Value = self.client.request(req).await?;
        Ok(())
    }
}
