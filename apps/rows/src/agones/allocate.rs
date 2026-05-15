//! GameServer allocation via Agones API.

use super::client::AgonesClient;
use super::error::AgonesError;
use serde_json::json;
use std::time::{Duration, Instant};
use tracing::{info, warn};

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 200;

/// Result of a successful GameServer allocation.
#[derive(Debug, Clone)]
pub struct AllocationResult {
    pub game_server_name: String,
    pub address: String,
    pub port: i32,
}

impl AgonesClient {
    /// Allocate a GameServer from the fleet for a given zone.
    /// Retries on transient K8s API errors with exponential backoff.
    #[tracing::instrument(skip(self), fields(fleet = %self.fleet, namespace = %self.namespace))]
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
                warn!(attempt, ?backoff, map_name, "Retrying allocation");
                tokio::time::sleep(backoff).await;
            }

            match self.try_allocate(map_name, zone_instance_id).await {
                Ok(result) => {
                    self.record_success();
                    info!(
                        gs_name = %result.game_server_name,
                        address = %result.address,
                        port = result.port,
                        map_name,
                        zone_instance_id,
                        elapsed_ms = start.elapsed().as_millis() as u64,
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
                    warn!(attempt, error = %e, map_name, "Allocation attempt failed (retryable)");
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

    /// Single allocation attempt against the Agones API.
    #[tracing::instrument(skip(self))]
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

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s allocation request timed out (10s)"))??;

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

        // Validate: reject allocations with missing critical fields
        if address.is_empty() {
            return Err(AgonesError::Other(anyhow::anyhow!(
                "Allocated GameServer has empty address"
            )));
        }
        if port <= 0 {
            return Err(AgonesError::Other(anyhow::anyhow!(
                "Allocated GameServer has invalid port: {port}"
            )));
        }
        if gs_name.is_empty() {
            return Err(AgonesError::Other(anyhow::anyhow!(
                "Allocated GameServer has empty name"
            )));
        }

        Ok(AllocationResult {
            game_server_name: gs_name,
            address,
            port,
        })
    }
}
