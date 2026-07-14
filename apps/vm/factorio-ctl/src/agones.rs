use anyhow::{Context, Result, anyhow};
use kube::Client;
use serde::Serialize;
use utoipa::ToSchema;

/// Subset of the Agones `GameServer` `.status` we surface. Field-plucked from
/// the raw CRD JSON (no typed CRD vendoring) so an Agones schema bump can't
/// break the build.
#[derive(Debug, Clone, Serialize, ToSchema, Default)]
pub struct GameServerStatus {
    pub state: String,
    pub address: Option<String>,
    pub node_name: Option<String>,
    pub port: Option<i32>,
}

/// GET the named GameServer from the Agones API and pluck its status.
pub async fn get_gameserver(
    client: &Client,
    namespace: &str,
    name: &str,
) -> Result<GameServerStatus> {
    let url = format!("/apis/agones.dev/v1/namespaces/{namespace}/gameservers/{name}");
    let req = http::Request::get(&url)
        .body(Vec::new())
        .map_err(|e| anyhow!("build gameserver request: {e}"))?;

    let resp: serde_json::Value = client
        .request(req)
        .await
        .context("agones gameserver GET failed")?;

    Ok(parse_status(&resp))
}

fn parse_status(resp: &serde_json::Value) -> GameServerStatus {
    let status = resp.get("status");
    let state = status
        .and_then(|s| s.get("state"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let address = status
        .and_then(|s| s.get("address"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let node_name = status
        .and_then(|s| s.get("nodeName"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let port = status
        .and_then(|s| s.get("ports"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|p| p.get("port"))
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);

    GameServerStatus {
        state,
        address,
        node_name,
        port,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_ready_gameserver() {
        let resp = json!({
            "status": {
                "state": "Ready",
                "address": "10.0.0.5",
                "nodeName": "talos-abc",
                "ports": [{ "name": "game", "port": 34197 }]
            }
        });
        let s = parse_status(&resp);
        assert_eq!(s.state, "Ready");
        assert_eq!(s.address.as_deref(), Some("10.0.0.5"));
        assert_eq!(s.node_name.as_deref(), Some("talos-abc"));
        assert_eq!(s.port, Some(34197));
    }

    #[test]
    fn defaults_when_status_absent() {
        let s = parse_status(&json!({}));
        assert_eq!(s.state, "Unknown");
        assert!(s.address.is_none());
        assert!(s.port.is_none());
    }
}
