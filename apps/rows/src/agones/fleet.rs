use super::client::AgonesClient;
use super::error::AgonesError;
use serde::Serialize;
use tracing::info;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct GameServerInfo {
    pub name: String,
    pub state: String,
    pub address: String,
    pub port: i32,
    pub age_seconds: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FleetStatus {
    pub fleet_name: String,
    pub namespace: String,
    pub ready: i32,
    pub allocated: i32,
    pub shutdown: i32,
    pub scheduled: i32,
    pub game_servers: Vec<GameServerInfo>,
}

impl AgonesClient {
    /// Count of GameServer objects in this tenant's fleet, ALL states included. This is the
    /// Agones half of the fleet-restart "all old gone" barrier: a DB row can hit `status=0` while
    /// its pod is still alive (flushing a save, mid-SIGTERM), so the barrier only opens when the
    /// GameServer list itself is empty. Callers must cache this (see `rest::system`) — it is a
    /// kube-apiserver LIST per call.
    pub async fn count_gameservers(&self) -> Result<i64, AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers?labelSelector=agones.dev/fleet={}",
            self.namespace, self.fleet
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build gameserver count request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s gameserver count request timed out (10s)"))??;

        Ok(resp
            .get("items")
            .and_then(|v| v.as_array())
            .map(|a| a.len() as i64)
            .unwrap_or(0))
    }

    /// Names of GameServers in this tenant's fleet created strictly before `cutoff`
    /// (an RFC3339 UTC instant, e.g. `2026-08-30T04:45:44Z`).
    ///
    /// This is the version roll's "all old servers are gone" barrier. A `count == 0` barrier
    /// cannot work: after `scale_fleet(0)` the FleetAutoscaler refills within 30s while the old
    /// pods are still terminating, and the Fleet template is unchanged so the same
    /// GameServerSet is reused — nothing distinguishes an old GameServer from a new one by
    /// name or label. The count may therefore never read zero, and the roll would hold the
    /// admission lockout open forever: a permanent join freeze rather than a roll.
    ///
    /// Creation time is used rather than a stored name snapshot so the barrier survives a ROWS
    /// restart mid-roll: `deploy_state.phasesince` is the cutoff, and anything older than the
    /// moment we scaled to zero is by definition from the outgoing fleet.
    ///
    /// Agones stamps `metadata.creationTimestamp` in a fixed `...Z` format, so a lexicographic
    /// compare is a chronological one; a malformed or missing stamp is treated as OLD, which
    /// keeps the barrier closed rather than declaring a roll finished early.
    pub async fn list_gameservers_created_before(
        &self,
        cutoff: &str,
    ) -> Result<Vec<String>, AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers?labelSelector=agones.dev/fleet={}",
            self.namespace, self.fleet
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build gameserver list request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s gameserver list request timed out (10s)"))??;

        Ok(resp
            .get("items")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|gs| {
                        let meta = gs.get("metadata")?;
                        let name = meta.get("name")?.as_str()?;
                        let created = meta
                            .get("creationTimestamp")
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        // Missing/unparseable stamp => treat as old (barrier stays closed).
                        (created.is_empty() || created < cutoff).then(|| name.to_owned())
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    #[tracing::instrument(skip(self))]
    pub async fn fleet_status(&self) -> Result<FleetStatus, AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/gameservers?labelSelector=agones.dev/fleet={}",
            self.namespace, self.fleet
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build fleet status request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s fleet status request timed out (10s)"))??;

        let items = resp
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut ready = 0i32;
        let mut allocated = 0i32;
        let mut shutdown = 0i32;
        let mut scheduled = 0i32;
        let mut game_servers = Vec::with_capacity(items.len());

        let now = chrono::Utc::now();

        for item in &items {
            let name = item
                .pointer("/metadata/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let state = item
                .pointer("/status/state")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();

            let address = item
                .pointer("/status/address")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let port = item
                .pointer("/status/ports")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|p| p.get("port"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;

            let creation = item
                .pointer("/metadata/creationTimestamp")
                .and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc));

            let age_seconds = creation.map(|c| (now - c).num_seconds()).unwrap_or(0);

            match state.as_str() {
                "Ready" => ready += 1,
                "Allocated" => allocated += 1,
                "Shutdown" => shutdown += 1,
                "Scheduled" | "Starting" => scheduled += 1,
                _ => {}
            }

            game_servers.push(GameServerInfo {
                name,
                state,
                address,
                port,
                age_seconds,
            });
        }

        info!(
            ready,
            allocated,
            shutdown,
            scheduled,
            total = game_servers.len(),
            "Fleet status queried"
        );

        Ok(FleetStatus {
            fleet_name: self.fleet.clone(),
            namespace: self.namespace.clone(),
            ready,
            allocated,
            shutdown,
            scheduled,
            game_servers,
        })
    }
}
