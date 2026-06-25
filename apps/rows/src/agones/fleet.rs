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

pub fn image_tag(image: &str) -> String {
    let repo_and_tag = image.rsplit('/').next().unwrap_or(image);
    match repo_and_tag.rsplit_once(':') {
        Some((_, tag)) if !tag.is_empty() => tag.to_string(),
        _ => image.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::image_tag;

    #[test]
    fn extracts_tag() {
        assert_eq!(image_tag("ghcr.io/kbve/chuckrpg:0.1.31"), "0.1.31");
    }

    #[test]
    fn registry_port_is_not_mistaken_for_tag() {
        assert_eq!(image_tag("registry:5000/kbve/chuckrpg:abc123"), "abc123");
    }

    #[test]
    fn untagged_falls_back_to_full_ref() {
        assert_eq!(
            image_tag("registry:5000/kbve/chuckrpg"),
            "registry:5000/kbve/chuckrpg"
        );
        assert_eq!(image_tag("chuckrpg"), "chuckrpg");
    }
}

impl AgonesClient {
    #[tracing::instrument(skip(self))]
    pub async fn fleet_container_image(&self) -> Result<Option<String>, AgonesError> {
        let url = format!(
            "/apis/agones.dev/v1/namespaces/{}/fleets/{}",
            self.namespace, self.fleet
        );

        let req = http::Request::get(&url)
            .body(Vec::new())
            .map_err(|e| anyhow::anyhow!("Failed to build fleet image request: {e}"))?;

        let resp: serde_json::Value =
            tokio::time::timeout(super::client::api_timeout(), self.client.request(req))
                .await
                .map_err(|_| anyhow::anyhow!("K8s fleet image request timed out"))??;

        let image = resp
            .pointer("/spec/template/spec/template/spec/containers/0/image")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(image)
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
