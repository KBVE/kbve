//! Windmill session bridge — turns a gate-authenticated Supabase identity into
//! a Windmill session without Windmill EE SSO. The gate ensures an instance
//! user + workspace membership exist for the staff member's email, mints a
//! short-lived impersonation token with a superadmin API token, and injects it
//! as the upstream `Authorization: Bearer` so Windmill sees every request as
//! that user. The token never reaches the browser.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use tokio::sync::Mutex;
use tracing::{info, warn};

pub struct WindmillBridge {
    base: String,
    admin_token: String,
    workspace: Option<String>,
    ttl_secs: i64,
    cache: Mutex<HashMap<String, CachedToken>>,
}

struct CachedToken {
    token: String,
    exp: i64,
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn rfc3339_in(secs: i64) -> String {
    (chrono::Utc::now() + chrono::Duration::seconds(secs.max(0)))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

impl WindmillBridge {
    pub fn new(base: &str, admin_token: String, workspace: Option<String>, ttl_secs: i64) -> Self {
        Self {
            base: base.trim_end_matches('/').to_string(),
            admin_token,
            workspace,
            ttl_secs,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Return a Windmill token for `email`, minting (and provisioning the user
    /// on first sight) when the cached one is missing or near expiry.
    pub async fn ensure_token(&self, client: &Client, email: &str) -> Result<String, String> {
        let now = unix_now();
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(email) {
                if entry.exp - 60 > now {
                    return Ok(entry.token.clone());
                }
            }
        }

        if !self.user_exists(client, email).await? {
            self.create_user(client, email).await?;
            if let Some(ws) = &self.workspace {
                self.add_to_workspace(client, email, ws).await;
            }
        }

        let token = self.impersonate(client, email).await?;
        let exp = now + self.ttl_secs;
        self.cache.lock().await.insert(
            email.to_string(),
            CachedToken {
                token: token.clone(),
                exp,
            },
        );
        Ok(token)
    }

    async fn user_exists(&self, client: &Client, email: &str) -> Result<bool, String> {
        let url = format!("{}/api/users/exists/{}", self.base, email);
        let resp = client
            .get(&url)
            .bearer_auth(&self.admin_token)
            .send()
            .await
            .map_err(|e| format!("windmill user_exists: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("windmill user_exists HTTP {}", resp.status()));
        }
        resp.json::<bool>()
            .await
            .map_err(|e| format!("windmill user_exists body: {e}"))
    }

    async fn create_user(&self, client: &Client, email: &str) -> Result<(), String> {
        // Random throwaway password: the account only ever logs in through the
        // gate's impersonation tokens.
        let password = format!("{}{}", ulid::Ulid::new(), ulid::Ulid::new());
        let url = format!("{}/api/users/create", self.base);
        let resp = client
            .post(&url)
            .bearer_auth(&self.admin_token)
            .json(&serde_json::json!({
                "email": email,
                "password": password,
                "super_admin": false,
                "name": email,
                "skip_email": true,
            }))
            .send()
            .await
            .map_err(|e| format!("windmill create_user: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("windmill create_user HTTP {status}: {body}"));
        }
        info!(%email, "windmill bridge: instance user created");
        Ok(())
    }

    async fn add_to_workspace(&self, client: &Client, email: &str, workspace: &str) {
        let url = format!("{}/api/w/{}/workspaces/add_user", self.base, workspace);
        let result = client
            .post(&url)
            .bearer_auth(&self.admin_token)
            .json(&serde_json::json!({
                "email": email,
                "is_admin": false,
                "operator": false,
            }))
            .send()
            .await;
        match result {
            Ok(resp) if resp.status().is_success() => {
                info!(%email, %workspace, "windmill bridge: user added to workspace");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                warn!(%email, %workspace, %status, %body, "windmill bridge: workspace add failed");
            }
            Err(e) => {
                warn!(%email, %workspace, "windmill bridge: workspace add error: {e}");
            }
        }
    }

    async fn impersonate(&self, client: &Client, email: &str) -> Result<String, String> {
        let url = format!("{}/api/users/tokens/impersonate", self.base);
        let resp = client
            .post(&url)
            .bearer_auth(&self.admin_token)
            .json(&serde_json::json!({
                "impersonate_email": email,
                "label": "kbve-gate",
                "expiration": rfc3339_in(self.ttl_secs),
            }))
            .send()
            .await
            .map_err(|e| format!("windmill impersonate: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("windmill impersonate HTTP {status}: {body}"));
        }
        let token = resp
            .text()
            .await
            .map_err(|e| format!("windmill impersonate body: {e}"))?;
        let token = token.trim().to_string();
        if token.is_empty() {
            return Err("windmill impersonate returned empty token".to_string());
        }
        Ok(token)
    }
}
