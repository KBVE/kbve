//! Thin typed wrapper around the Forgejo (Gitea-compatible) REST API v1.
//!
//! Hand-written, mirroring the GitHub client. Callers provide the upstream
//! base URL and an admin/sudo token at construction. Errors are normalised to
//! [`JediError`] so handlers can return them directly.
//!
//! # Example
//! ```ignore
//! let fj = ForgejoClient::new("https://git.example.com", "token");
//! let users = fj.list_admin_users(1, 50).await?;
//! ```

use reqwest::{Client, Response, StatusCode};
use std::borrow::Cow;
use std::time::Duration;

use super::types::*;
use crate::entity::error::JediError;

const USER_AGENT: &str = "kbve-jedi/1.0";

#[derive(Clone)]
pub struct ForgejoClient {
    client: Client,
    token: String,
    base_url: String,
}

impl ForgejoClient {
    pub fn new(base_url: &str, token: &str) -> Self {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()
            .expect("Failed to build reqwest client for ForgejoClient");

        Self {
            client,
            token: token.to_string(),
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }

    pub async fn search_repos(
        &self,
        page: u32,
        limit: u32,
        query: Option<&str>,
    ) -> Result<Vec<ForgejoRepo>, JediError> {
        let url = format!("{}/api/v1/repos/search", self.base_url);
        let mut req = self.client.get(&url).bearer_auth(&self.token).query(&[
            ("page", page.to_string()),
            ("limit", limit.to_string()),
            ("sort", "updated".to_string()),
        ]);
        if let Some(q) = query.filter(|q| !q.is_empty()) {
            req = req.query(&[("q", q)]);
        }
        let resp = self.send(req).await?;
        let results: ForgejoSearchResults<ForgejoRepo> = self.parse_response(resp).await?;
        Ok(results.data)
    }

    pub async fn list_admin_users(
        &self,
        page: u32,
        limit: u32,
    ) -> Result<Vec<ForgejoUser>, JediError> {
        let url = format!("{}/api/v1/admin/users", self.base_url);
        let req = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .query(&[("page", page.to_string()), ("limit", limit.to_string())]);
        let resp = self.send(req).await?;
        self.parse_response(resp).await
    }

    pub async fn list_orgs(&self, page: u32, limit: u32) -> Result<Vec<ForgejoOrg>, JediError> {
        let url = format!("{}/api/v1/orgs", self.base_url);
        let req = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .query(&[("page", page.to_string()), ("limit", limit.to_string())]);
        let resp = self.send(req).await?;
        self.parse_response(resp).await
    }

    async fn send(&self, req: reqwest::RequestBuilder) -> Result<Response, JediError> {
        req.send().await.map_err(|e| {
            if e.is_timeout() {
                JediError::Timeout
            } else {
                JediError::Internal(Cow::Owned(format!("Forgejo request failed: {e}")))
            }
        })
    }

    async fn parse_response<T: serde::de::DeserializeOwned>(
        &self,
        resp: Response,
    ) -> Result<T, JediError> {
        let status = resp.status();
        if status.is_success() {
            let text = resp
                .text()
                .await
                .map_err(|e| JediError::Parse(format!("Failed to read response body: {e}")))?;
            serde_json::from_str(&text)
                .map_err(|e| JediError::Parse(format!("JSON parse error: {e}")))
        } else {
            let body = resp.text().await.unwrap_or_default();
            let message = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
                .unwrap_or(body);
            match status {
                StatusCode::UNAUTHORIZED => Err(JediError::Unauthorized),
                StatusCode::FORBIDDEN => Err(JediError::Forbidden),
                StatusCode::NOT_FOUND => Err(JediError::NotFound),
                _ => Err(JediError::Internal(Cow::Owned(format!(
                    "Forgejo API error {status}: {message}"
                )))),
            }
        }
    }
}
