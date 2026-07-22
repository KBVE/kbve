use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, Deserialize)]
pub struct InfoResp {
    pub version: String,
    pub servername: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetricsResp {
    pub serverfps: i64,
    pub currentplayernum: i64,
    pub serveruptime: i64,
    pub serverframetime: f64,
}

#[derive(Debug, Clone, Deserialize)]
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
        let resp = self
            .http
            .get(self.url(path))
            .basic_auth("admin", Some(&self.admin_password))
            .send()
            .await
            .with_context(|| format!("GET {path} failed"))?
            .error_for_status()?;
        Ok(resp.json::<T>().await?)
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
    fn parse_metrics() {
        let j = r#"{"serverfps":58,"currentplayernum":3,"serveruptime":1200,"serverframetime":16.9,"maxplayernum":32}"#;
        let m: MetricsResp = serde_json::from_str(j).unwrap();
        assert_eq!(m.currentplayernum, 3);
        assert_eq!(m.serverfps, 58);
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
