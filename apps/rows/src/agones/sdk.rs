//! ROWS lives outside the GameServer pod, so the Agones sidecar (`localhost:9358`) is unreachable.
//! Instead we drive K8s API patches against the GameServer resource directly. The UE5 SDK
//! continues to call the sidecar from inside the pod for `Ready()` / `Shutdown()` —
//! both sides update state and ROWS reconciles.

use super::client::AgonesClient;
use super::error::AgonesError;
use serde_json::json;
use std::time::Duration;
use tracing::info;

pub mod labels {
    pub const ZONE: &str = "ows.kbve.com/zone";
    pub const MAP: &str = "ows.kbve.com/map";
    pub const ZONE_INSTANCE: &str = "ows.kbve.com/zone-instance";
    pub const WORLD_SERVER: &str = "ows.kbve.com/world-server-id";
    pub const DRAINING: &str = "ows.kbve.com/draining";
    pub const VERSION: &str = "ows.kbve.com/version";
}

pub mod annotations {
    pub const ALLOCATED_AT: &str = "ows.kbve.com/allocated-at";
    pub const CUSTOMER_GUID: &str = "ows.kbve.com/customer-guid";
}

#[derive(Debug, Clone)]
pub struct GameServerInfo {
    pub name: String,
    pub state: String,
    pub address: String,
    pub port: i32,
    pub labels: std::collections::HashMap<String, String>,
    pub player_count: i32,
    pub player_capacity: i32,
}

impl AgonesClient {
    #[tracing::instrument(skip(self), fields(gs = %gs_name, key = %key))]
    pub async fn set_label(
        &self,
        gs_name: &str,
        key: &str,
        value: &str,
    ) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, gs_name
        );

        let body = json!({
            "metadata": {
                "labels": {
                    key: value
                }
            }
        });

        let req = http::Request::patch(&url)
            .header("Content-Type", "application/merge-patch+json")
            .body(serde_json::to_vec(&body).unwrap())
            .map_err(|e| anyhow::anyhow!("Failed to build label request: {e}"))?;

        tokio::time::timeout(
            super::client::api_timeout(),
            self.client.request::<serde_json::Value>(req),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Set label request timed out"))??;

        info!(gs = gs_name, key, value, "Label set on GameServer");
        Ok(())
    }

    #[tracing::instrument(skip(self), fields(gs = %gs_name, key = %key))]
    pub async fn set_annotation(
        &self,
        gs_name: &str,
        key: &str,
        value: &str,
    ) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, gs_name
        );

        let body = json!({
            "metadata": {
                "annotations": {
                    key: value
                }
            }
        });

        let req = http::Request::patch(&url)
            .header("Content-Type", "application/merge-patch+json")
            .body(serde_json::to_vec(&body).unwrap())
            .map_err(|e| anyhow::anyhow!("Failed to build annotation request: {e}"))?;

        tokio::time::timeout(
            super::client::api_timeout(),
            self.client.request::<serde_json::Value>(req),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Set annotation request timed out"))??;

        Ok(())
    }

    /// Single PATCH instead of N round-trips; prefer over chained `set_label` calls.
    #[tracing::instrument(skip(self, labels), fields(gs = %gs_name, count = labels.len()))]
    pub async fn set_labels(
        &self,
        gs_name: &str,
        labels: &[(&str, &str)],
    ) -> Result<(), AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, gs_name
        );

        let label_map: serde_json::Map<String, serde_json::Value> = labels
            .iter()
            .map(|(k, v)| (k.to_string(), json!(v)))
            .collect();

        let body = json!({
            "metadata": {
                "labels": label_map
            }
        });

        let req = http::Request::patch(&url)
            .header("Content-Type", "application/merge-patch+json")
            .body(serde_json::to_vec(&body).unwrap())
            .map_err(|e| anyhow::anyhow!("Failed to build labels request: {e}"))?;

        tokio::time::timeout(
            super::client::api_timeout(),
            self.client.request::<serde_json::Value>(req),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Set labels request timed out"))??;

        info!(gs = gs_name, "Labels set on GameServer");
        Ok(())
    }

    #[tracing::instrument(skip(self), fields(gs = %gs_name))]
    pub async fn get_gameserver(&self, gs_name: &str) -> Result<GameServerInfo, AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers/{}",
            self.namespace, gs_name
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("Get GameServer request timed out"))??;

        let status = resp.get("status").cloned().unwrap_or_default();
        let metadata = resp.get("metadata").cloned().unwrap_or_default();

        let labels: std::collections::HashMap<String, String> = metadata
            .get("labels")
            .and_then(|l| serde_json::from_value(l.clone()).ok())
            .unwrap_or_default();

        let player_count = status
            .pointer("/players/count")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        let player_capacity = status
            .pointer("/players/capacity")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

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

        let state = status
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        Ok(GameServerInfo {
            name: gs_name.to_string(),
            state,
            address,
            port,
            labels,
            player_count,
            player_capacity,
        })
    }

    /// Belt-and-suspenders signal: sets `ows.kbve.com/draining=true` so the watcher starts a
    /// graceful shutdown even if the UE5 SDK never calls `Shutdown()` from inside the pod.
    #[tracing::instrument(skip(self), fields(gs = %gs_name))]
    pub async fn mark_draining(&self, gs_name: &str) -> Result<(), AgonesError> {
        self.set_label(gs_name, labels::DRAINING, "true").await?;
        info!(gs = gs_name, "GameServer marked as draining");
        Ok(())
    }

    #[tracing::instrument(skip(self), fields(gs = %gs_name))]
    pub async fn tag_allocated(
        &self,
        gs_name: &str,
        zone: &str,
        map: &str,
        zone_instance_id: i32,
        world_server_id: i32,
        customer_guid: &str,
    ) -> Result<(), AgonesError> {
        self.set_labels(
            gs_name,
            &[
                (labels::ZONE, zone),
                (labels::MAP, map),
                (labels::ZONE_INSTANCE, &zone_instance_id.to_string()),
                (labels::WORLD_SERVER, &world_server_id.to_string()),
            ],
        )
        .await?;

        self.set_annotation(
            gs_name,
            annotations::ALLOCATED_AT,
            &chrono::Utc::now().to_rfc3339(),
        )
        .await?;

        self.set_annotation(gs_name, annotations::CUSTOMER_GUID, customer_guid)
            .await?;

        info!(
            gs = gs_name,
            zone,
            map,
            zone_instance_id,
            world_server_id,
            "GameServer tagged with allocation metadata"
        );
        Ok(())
    }

    /// Rebuilds `zone_servers` from the live fleet so a ROWS restart doesn't lose allocations.
    #[tracing::instrument(skip(self))]
    pub async fn reconcile_allocations(&self) -> Result<Vec<(i32, String)>, AgonesError> {
        let label_selector = format!("agones.dev/fleet={}", self.fleet);
        let encoded: String = label_selector
            .bytes()
            .map(|b| match b {
                b'=' => "%3D".to_string(),
                b'/' => "%2F".to_string(),
                _ => (b as char).to_string(),
            })
            .collect();
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers?labelSelector={}",
            self.namespace, encoded
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build list request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(Duration::from_secs(15), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("List GameServers timed out"))??;

        let items = resp
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut allocations = Vec::new();

        for gs in &items {
            let state = gs
                .pointer("/status/state")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if state != "Allocated" {
                continue;
            }

            let name = gs
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let zone_instance_str = gs
                .pointer(&format!(
                    "/metadata/labels/{}",
                    labels::ZONE_INSTANCE.replace('/', "~1")
                ))
                .and_then(|v| v.as_str())
                .unwrap_or("0");

            let zone_instance_id: i32 = zone_instance_str.parse().unwrap_or(0);

            if zone_instance_id > 0 && !name.is_empty() {
                allocations.push((zone_instance_id, name.to_string()));
            }
        }

        info!(
            recovered = allocations.len(),
            total_gs = items.len(),
            "Reconciled allocations from Agones"
        );

        Ok(allocations)
    }
}
