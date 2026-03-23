use kube::Client;
use serde_json::json;
use tracing::{error, info};

/// Agones GameServer allocator via kube-rs.
pub struct AgonesClient {
    client: Client,
    namespace: String,
    fleet: String,
}

#[derive(Debug)]
pub struct AllocationResult {
    pub game_server_name: String,
    pub address: String,
    pub port: i32,
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
                })
            }
            Err(e) => {
                error!("Agones client unavailable (non-fatal): {e}");
                None
            }
        }
    }

    pub async fn allocate(
        &self,
        map_name: &str,
        zone_instance_id: i32,
    ) -> anyhow::Result<AllocationResult> {
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

        // Use raw HTTP to create the allocation CRD
        let url = format!(
            "/apis/allocation.agones.dev/v1/namespaces/{}/gameserverallocations",
            self.namespace
        );

        let req = http::Request::post(&url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&allocation)?)
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let resp: serde_json::Value = self
            .client
            .request(req)
            .await
            .map_err(|e| anyhow::anyhow!("K8s API error: {e}"))?;

        let status = resp
            .get("status")
            .ok_or_else(|| anyhow::anyhow!("No status in allocation response"))?;

        let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("");

        if state != "Allocated" {
            anyhow::bail!("Allocation state: {state} (expected Allocated)");
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

        info!(
            gs_name,
            address, port, map_name, zone_instance_id, "Allocated GameServer"
        );

        Ok(AllocationResult {
            game_server_name: gs_name,
            address,
            port,
        })
    }

    pub async fn deallocate(&self, game_server_name: &str) -> anyhow::Result<()> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, game_server_name
        );

        let req = http::Request::delete(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let _: serde_json::Value = self
            .client
            .request(req)
            .await
            .map_err(|e| anyhow::anyhow!("K8s API error: {e}"))?;

        info!(game_server_name, "Deallocated GameServer");
        Ok(())
    }
}
