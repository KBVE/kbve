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

#[derive(Debug)]
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

        parse_allocation(&resp)
    }
}

/// Extract a usable [`Allocation`] from an Agones `GameServerAllocation`
/// response. Pure (no IO) so the brittle field-plucking + validation is unit
/// tested against the real shapes Agones returns.
fn parse_allocation(resp: &serde_json::Value) -> Result<Allocation> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_allocation_success() {
        let resp = json!({
            "status": {
                "state": "Allocated",
                "address": "10.0.0.5",
                "ports": [{ "name": "default", "port": 7777 }],
                "gameServerName": "cryptothrone-server-abc12"
            }
        });
        let a = parse_allocation(&resp).unwrap();
        assert_eq!(a.address, "10.0.0.5");
        assert_eq!(a.port, 7777);
        assert_eq!(a.game_server_name, "cryptothrone-server-abc12");
    }

    #[test]
    fn parse_allocation_unallocated_state_errors() {
        let resp = json!({ "status": { "state": "UnAllocated" } });
        let err = parse_allocation(&resp).unwrap_err().to_string();
        assert!(err.contains("not granted"), "got: {err}");
        assert!(err.contains("UnAllocated"), "state echoed: {err}");
    }

    #[test]
    fn parse_allocation_missing_status_errors() {
        let resp = json!({});
        assert!(
            parse_allocation(&resp)
                .unwrap_err()
                .to_string()
                .contains("no status")
        );
    }

    #[test]
    fn parse_allocation_empty_address_errors() {
        let resp = json!({
            "status": { "state": "Allocated", "ports": [{ "port": 7777 }] }
        });
        assert!(
            parse_allocation(&resp)
                .unwrap_err()
                .to_string()
                .contains("empty address/port")
        );
    }

    #[test]
    fn parse_allocation_zero_port_errors() {
        let resp = json!({
            "status": { "state": "Allocated", "address": "1.2.3.4", "ports": [] }
        });
        assert!(parse_allocation(&resp).is_err());
    }

    #[tokio::test]
    async fn try_new_resolves_without_panicking() {
        // Exercises env-default resolution + the kube client branch. Outside a
        // cluster (CI/local) this returns None; in-cluster it would be Some.
        // Either way the constructor must not panic. The kube client builds a
        // rustls stack, so install the provider main() normally sets up.
        let _ = rustls::crypto::ring::default_provider().install_default();
        let _ = AgonesAllocator::try_new().await;
    }
}
