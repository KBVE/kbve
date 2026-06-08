use anyhow::{Result, anyhow};
use kube::Client;
use serde_json::json;
use std::time::Duration;
use tracing::{info, warn};

pub struct AgonesAllocator {
    client: Client,
    namespace: String,
    fleet: String,
}

pub struct Allocation {
    pub game_server_name: String,
    pub address: String,
    pub port: i32,
}

impl AgonesAllocator {
    pub async fn try_new() -> Option<Self> {
        let namespace =
            std::env::var("CT_AGONES_NAMESPACE").unwrap_or_else(|_| "cryptothrone".into());
        let fleet =
            std::env::var("CT_AGONES_FLEET").unwrap_or_else(|_| "cryptothrone-server".into());
        match Client::try_default().await {
            Ok(client) => {
                info!(namespace, fleet, "Agones allocator ready (in-cluster)");
                Some(Self {
                    client,
                    namespace,
                    fleet,
                })
            }
            Err(e) => {
                warn!(error = %e, "Agones allocator unavailable — /api/join will 503 (local dev?)");
                None
            }
        }
    }

    pub async fn allocate(&self) -> Result<Allocation> {
        let body = json!({
            "apiVersion": "allocation.agones.dev/v1",
            "kind": "GameServerAllocation",
            "metadata": { "namespace": self.namespace },
            "spec": { "required": { "matchLabels": { "agones.dev/fleet": self.fleet } } }
        });
        let url = format!(
            "/apis/allocation.agones.dev/v1/namespaces/{}/gameserverallocations",
            self.namespace
        );
        let req = http::Request::post(&url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&body)?)
            .map_err(|e| anyhow!("build allocation request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(Duration::from_secs(10), self.client.request(req))
                .await
                .map_err(|_| anyhow!("allocation request timed out"))??;

        let status = resp
            .get("status")
            .ok_or_else(|| anyhow!("no status in allocation response"))?;
        let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("");
        if state != "Allocated" {
            return Err(anyhow!("allocation not granted (state={state})"));
        }
        let address = status
            .get("address")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let port = status
            .get("ports")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|p| p.get("port"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        let game_server_name = status
            .get("gameServerName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if address.is_empty() || port <= 0 {
            return Err(anyhow!("allocation returned empty address/port"));
        }
        Ok(Allocation {
            game_server_name,
            address,
            port,
        })
    }
}
