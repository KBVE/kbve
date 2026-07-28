use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct InfoResp {
    pub version: String,
    pub servername: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetricsResp {
    #[serde(default)]
    pub serverfps: i64,
    #[serde(default)]
    pub currentplayernum: i64,
    #[serde(rename = "uptime", alias = "serveruptime", default)]
    pub serveruptime: i64,
    #[serde(default)]
    pub serverframetime: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Player {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "playerId", default)]
    pub player_id: String,
    #[serde(rename = "userId", default)]
    pub user_id: String,
    #[serde(default)]
    pub ping: f64,
    #[serde(default)]
    pub level: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayersResp {
    #[serde(default)]
    pub players: Vec<Player>,
}

pub struct RestClient {
    http: reqwest::Client,
    base: String,
    admin_password: String,
}

impl RestClient {
    pub fn new(base: String, admin_password: String, timeout: Duration) -> Result<Self> {
        let http = reqwest::Client::builder().timeout(timeout).build()?;
        Ok(Self {
            http,
            base: base.trim_end_matches('/').to_string(),
            admin_password,
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}/v1/api/{}", self.base, path)
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let body = self
            .http
            .get(self.url(path))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .with_context(|| format!("GET {path} failed"))?
            .error_for_status()?
            .text()
            .await
            .with_context(|| format!("GET {path}: read body failed"))?;
        serde_json::from_str::<T>(&body).with_context(|| {
            let snippet: String = body.chars().take(240).collect();
            format!("GET {path}: decode failed, body={snippet}")
        })
    }

    pub async fn info(&self) -> Result<InfoResp> {
        self.get_json("info").await
    }

    pub async fn metrics(&self) -> Result<MetricsResp> {
        self.get_json("metrics").await
    }

    pub async fn players(&self) -> Result<PlayersResp> {
        self.get_json("players").await
    }

    pub async fn announce(&self, message: &str) -> Result<()> {
        self.http
            .post(self.url("announce"))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&json!({ "message": message }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn shutdown(&self, waittime: u32, message: &str) -> Result<()> {
        self.http
            .post(self.url("shutdown"))
            .basic_auth("admin", Some(&self.admin_password))
            .json(&json!({ "waittime": waittime, "message": message }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_metrics_real_uptime_field() {
        let j = r#"{"serverfps":58,"currentplayernum":3,"serverframetime":16.9,"maxplayernum":32,"uptime":1200}"#;
        let m: MetricsResp = serde_json::from_str(j).unwrap();
        assert_eq!(m.currentplayernum, 3);
        assert_eq!(m.serverfps, 58);
        assert_eq!(m.serveruptime, 1200);
    }

    #[test]
    fn parse_metrics_legacy_alias_and_missing_fields() {
        let m: MetricsResp = serde_json::from_str(r#"{"serveruptime":42}"#).unwrap();
        assert_eq!(m.serveruptime, 42);
        assert_eq!(m.serverfps, 0);
        let empty: MetricsResp = serde_json::from_str("{}").unwrap();
        assert_eq!(empty.serveruptime, 0);
    }

    #[test]
    fn parse_players() {
        let j = r#"{"players":[{"name":"Al","playerId":"abc","userId":"steam_1","ip":"","ping":42.0,"location_x":0.0,"location_y":0.0,"level":5,"building_count":0}]}"#;
        let p: PlayersResp = serde_json::from_str(j).unwrap();
        assert_eq!(p.players.len(), 1);
        assert_eq!(p.players[0].name, "Al");
        assert_eq!(p.players[0].level, 5);
    }

    #[test]
    fn parse_info() {
        let j = r#"{"version":"v0.3.11","servername":"KBVE Pal"}"#;
        let i: InfoResp = serde_json::from_str(j).unwrap();
        assert_eq!(i.servername, "KBVE Pal");
    }
}
