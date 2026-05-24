use std::num::NonZeroUsize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use lru::LruCache;
use serde::Deserialize;
use tracing::{info, warn};

use super::supabase::SupabaseClient;

const SCHEMA: &str = "gh";

#[derive(Debug, Clone, Deserialize)]
pub struct CachedIssue {
    pub owner: String,
    pub repo: String,
    pub number: u32,
    pub title: String,
    pub state: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub labels: serde_json::Value,
    #[serde(default)]
    pub assignees: serde_json::Value,
    #[serde(default)]
    pub author: Option<String>,
    pub html_url: String,
    #[serde(default)]
    pub is_pull_request: bool,
    pub github_created_at: String,
    pub github_updated_at: String,
    #[serde(default)]
    pub closed_at: Option<String>,
    pub synced_at: String,
    #[serde(default)]
    pub discord_guild_id: Option<i64>,
    #[serde(default)]
    pub discord_channel_id: Option<i64>,
    #[serde(default)]
    pub discord_thread_id: Option<i64>,
}

impl CachedIssue {
    pub fn assignee_logins(&self) -> Vec<String> {
        self.assignees
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.get("login").and_then(|l| l.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn label_names(&self) -> Vec<String> {
        self.labels
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn assignee_count(&self) -> usize {
        self.assignees.as_array().map(|arr| arr.len()).unwrap_or(0)
    }

    pub fn is_stale(&self, max_age: Duration) -> bool {
        match chrono::DateTime::parse_from_rfc3339(&self.synced_at) {
            Ok(synced) => {
                let now = chrono::Utc::now();
                let age = now.signed_duration_since(synced.with_timezone(&chrono::Utc));
                age.to_std().map(|d| d > max_age).unwrap_or(false)
            }
            Err(_) => true,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UndeliveredEvent {
    pub id: i64,
    pub owner: String,
    pub repo: String,
    pub number: u32,
    pub event_type: String,
    #[serde(default)]
    pub actor: Option<String>,
    pub payload: serde_json::Value,
    pub created_at: String,
    #[serde(default)]
    pub delivery_attempts: i32,
    pub claim_token: uuid::Uuid,
}

#[derive(Debug, thiserror::Error)]
pub enum GithubStoreError {
    #[error("supabase client not configured")]
    NotConfigured,
    #[error("supabase HTTP {status}: {body}")]
    Http {
        status: reqwest::StatusCode,
        body: String,
    },
    #[error("supabase transport: {0}")]
    Transport(#[from] super::supabase::SupabaseError),
    #[error("response decode: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("response body: {0}")]
    Body(#[from] reqwest::Error),
}

struct CachedEntry {
    issue: Option<CachedIssue>,
    expires_at: Instant,
}

pub struct GithubStore {
    client: Option<SupabaseClient>,
    cache: Mutex<LruCache<(String, String, u32), CachedEntry>>,
    ttl: Duration,
    stale_after: Duration,
}

impl GithubStore {
    pub fn new(client: Option<SupabaseClient>, capacity: usize, ttl: Duration) -> Self {
        let cap = NonZeroUsize::new(capacity).unwrap_or(NonZeroUsize::new(512).unwrap());
        Self {
            client,
            cache: Mutex::new(LruCache::new(cap)),
            ttl,
            stale_after: Duration::from_secs(5 * 60),
        }
    }

    pub fn from_env() -> Self {
        let ttl_secs = std::env::var("GITHUB_STORE_TTL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(30);
        let stale_secs = std::env::var("GITHUB_STORE_STALE_AFTER_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(300);
        let cap = std::env::var("GITHUB_STORE_CAPACITY")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(1024);

        let mut store = Self::new(
            SupabaseClient::from_env(),
            cap,
            Duration::from_secs(ttl_secs),
        );
        store.stale_after = Duration::from_secs(stale_secs);
        store
    }

    pub fn is_enabled(&self) -> bool {
        self.client.is_some()
    }

    pub fn stale_after(&self) -> Duration {
        self.stale_after
    }

    pub fn invalidate(&self, owner: &str, repo: &str, number: u32) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.pop(&(owner.to_owned(), repo.to_owned(), number));
    }

    pub async fn get_issue(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
    ) -> Result<Option<CachedIssue>, GithubStoreError> {
        let key = (owner.to_owned(), repo.to_owned(), number);

        {
            let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(entry) = cache.get(&key) {
                if Instant::now() < entry.expires_at {
                    return Ok(entry.issue.clone());
                }
            }
        }

        let Some(client) = self.client.as_ref() else {
            return Err(GithubStoreError::NotConfigured);
        };

        let params = serde_json::json!({
            "p_owner": owner,
            "p_repo": repo,
            "p_number": number,
        });

        let resp = client.rpc_schema("get_issue", params, SCHEMA).await?;
        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            warn!(%status, body = %text, owner, repo, number, "gh.get_issue HTTP error");
            return Err(GithubStoreError::Http { status, body: text });
        }

        let issue = parse_optional_row::<CachedIssue>(&text)?;

        {
            let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            cache.put(
                key,
                CachedEntry {
                    issue: issue.clone(),
                    expires_at: Instant::now() + self.ttl,
                },
            );
        }

        Ok(issue)
    }

    pub async fn list_open(
        &self,
        owner: &str,
        repo: &str,
        limit: u32,
    ) -> Result<Vec<CachedIssue>, GithubStoreError> {
        let Some(client) = self.client.as_ref() else {
            return Err(GithubStoreError::NotConfigured);
        };

        let params = serde_json::json!({
            "p_owner": owner,
            "p_repo": repo,
            "p_limit": limit,
        });

        let resp = client
            .rpc_schema("list_open_issues", params, SCHEMA)
            .await?;
        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            warn!(%status, body = %text, owner, repo, "gh.list_open_issues HTTP error");
            return Err(GithubStoreError::Http { status, body: text });
        }

        let rows: Vec<CachedIssue> = serde_json::from_str(&text)?;
        info!(owner, repo, count = rows.len(), "gh.list_open_issues");
        Ok(rows)
    }

    pub async fn set_discord_thread(
        &self,
        owner: &str,
        repo: &str,
        number: u32,
        guild_id: i64,
        channel_id: i64,
        thread_id: i64,
    ) -> Result<(), GithubStoreError> {
        let Some(client) = self.client.as_ref() else {
            return Err(GithubStoreError::NotConfigured);
        };

        let params = serde_json::json!({
            "p_owner": owner,
            "p_repo": repo,
            "p_number": number,
            "p_guild_id": guild_id,
            "p_channel_id": channel_id,
            "p_thread_id": thread_id,
        });

        let resp = client
            .rpc_schema("set_discord_thread", params, SCHEMA)
            .await?;
        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            warn!(%status, body = %text, owner, repo, number, "gh.set_discord_thread HTTP error");
            return Err(GithubStoreError::Http { status, body: text });
        }

        self.invalidate(owner, repo, number);
        info!(
            owner,
            repo, number, thread_id, "Discord thread linked to gh.issue"
        );
        Ok(())
    }

    pub async fn claim_undelivered(
        &self,
        limit: u32,
        lease_secs: u32,
    ) -> Result<Vec<UndeliveredEvent>, GithubStoreError> {
        let Some(client) = self.client.as_ref() else {
            return Err(GithubStoreError::NotConfigured);
        };

        let params = serde_json::json!({
            "p_limit": limit,
            "p_lease_secs": lease_secs,
        });
        let resp = client
            .rpc_schema("claim_undelivered_events", params, SCHEMA)
            .await?;
        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            warn!(%status, body = %text, "gh.claim_undelivered_events HTTP error");
            return Err(GithubStoreError::Http { status, body: text });
        }

        let rows: Vec<UndeliveredEvent> = serde_json::from_str(&text)?;
        if !rows.is_empty() {
            info!(count = rows.len(), "claimed undelivered gh events");
        }
        Ok(rows)
    }

    pub async fn mark_event_delivered(
        &self,
        id: i64,
        claim_token: uuid::Uuid,
    ) -> Result<bool, GithubStoreError> {
        let resp_text = self
            .call_event_state_raw(
                "mark_event_delivered",
                serde_json::json!({ "p_id": id, "p_claim_token": claim_token }),
            )
            .await?;
        parse_bool_body(&resp_text)
    }

    pub async fn mark_event_failed(
        &self,
        id: i64,
        claim_token: uuid::Uuid,
        error: &str,
        max_attempts: u32,
    ) -> Result<DeliveryState, GithubStoreError> {
        let resp_text = self
            .call_event_state_raw(
                "mark_event_failed",
                serde_json::json!({
                    "p_id": id,
                    "p_claim_token": claim_token,
                    "p_error": error,
                    "p_max_attempts": max_attempts,
                }),
            )
            .await?;
        parse_delivery_state_body(&resp_text)
    }

    async fn call_event_state_raw(
        &self,
        rpc: &str,
        params: serde_json::Value,
    ) -> Result<String, GithubStoreError> {
        let Some(client) = self.client.as_ref() else {
            return Err(GithubStoreError::NotConfigured);
        };

        let resp = client.rpc_schema(rpc, params, SCHEMA).await?;
        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            warn!(%status, body = %text, rpc, "gh event-state RPC HTTP error");
            return Err(GithubStoreError::Http { status, body: text });
        }

        Ok(text)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeliveryState {
    Pending,
    Claimed,
    Delivered,
    DeadLetter,
}

impl DeliveryState {
    pub fn from_smallint(v: i16) -> Option<Self> {
        match v {
            0 => Some(Self::Pending),
            1 => Some(Self::Claimed),
            2 => Some(Self::Delivered),
            3 => Some(Self::DeadLetter),
            _ => None,
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Delivered | Self::DeadLetter)
    }
}

fn parse_bool_body(text: &str) -> Result<bool, GithubStoreError> {
    let trimmed = text.trim();
    if trimmed == "true" {
        Ok(true)
    } else if trimmed == "false" {
        Ok(false)
    } else {
        serde_json::from_str::<bool>(trimmed).map_err(GithubStoreError::Decode)
    }
}

fn parse_delivery_state_body(text: &str) -> Result<DeliveryState, GithubStoreError> {
    let trimmed = text.trim();
    let n: i16 = serde_json::from_str(trimmed)?;
    DeliveryState::from_smallint(n).ok_or_else(|| GithubStoreError::Http {
        status: reqwest::StatusCode::BAD_GATEWAY,
        body: format!("unexpected delivery_state value: {n}"),
    })
}

fn parse_optional_row<T>(text: &str) -> Result<Option<T>, GithubStoreError>
where
    T: for<'de> Deserialize<'de>,
{
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(None);
    }

    if let Ok(row) = serde_json::from_str::<T>(trimmed) {
        return Ok(Some(row));
    }

    let rows: Vec<T> = serde_json::from_str(trimmed)?;
    Ok(rows.into_iter().next())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_issue_extracts_logins_and_labels() {
        let raw = serde_json::json!({
            "owner": "KBVE",
            "repo": "kbve",
            "number": 11262,
            "title": "feat: /gh claim",
            "state": "open",
            "labels": [{"name": "enhancement"}, {"name": "discordsh"}],
            "assignees": [{"login": "h0lybyte"}],
            "author": "h0lybyte",
            "html_url": "https://github.com/KBVE/kbve/issues/11262",
            "is_pull_request": false,
            "github_created_at": "2026-05-21T00:00:00Z",
            "github_updated_at": "2026-05-22T00:00:00Z",
            "synced_at": "2026-05-22T00:00:00Z"
        });
        let issue: CachedIssue = serde_json::from_value(raw).unwrap();
        assert_eq!(issue.assignee_logins(), vec!["h0lybyte"]);
        assert_eq!(issue.label_names(), vec!["enhancement", "discordsh"]);
        assert_eq!(issue.assignee_count(), 1);
    }

    #[test]
    fn cached_issue_stale_when_synced_old() {
        let raw = serde_json::json!({
            "owner": "KBVE",
            "repo": "kbve",
            "number": 1,
            "title": "old",
            "state": "open",
            "labels": [],
            "assignees": [],
            "author": null,
            "html_url": "https://example.com",
            "is_pull_request": false,
            "github_created_at": "2000-01-01T00:00:00Z",
            "github_updated_at": "2000-01-01T00:00:00Z",
            "synced_at": "2000-01-01T00:00:00Z"
        });
        let issue: CachedIssue = serde_json::from_value(raw).unwrap();
        assert!(issue.is_stale(Duration::from_secs(60)));
    }

    #[test]
    fn parse_optional_row_handles_empty() {
        let none: Option<CachedIssue> = parse_optional_row("").unwrap();
        assert!(none.is_none());
        let none: Option<CachedIssue> = parse_optional_row("[]").unwrap();
        assert!(none.is_none());
        let none: Option<CachedIssue> = parse_optional_row("null").unwrap();
        assert!(none.is_none());
    }

    #[test]
    fn delivery_state_round_trip() {
        for (n, st) in [
            (0, DeliveryState::Pending),
            (1, DeliveryState::Claimed),
            (2, DeliveryState::Delivered),
            (3, DeliveryState::DeadLetter),
        ] {
            assert_eq!(DeliveryState::from_smallint(n), Some(st));
        }
        assert_eq!(DeliveryState::from_smallint(99), None);
        assert!(!DeliveryState::Pending.is_terminal());
        assert!(!DeliveryState::Claimed.is_terminal());
        assert!(DeliveryState::Delivered.is_terminal());
        assert!(DeliveryState::DeadLetter.is_terminal());
    }

    #[test]
    fn parse_delivery_state_body_accepts_smallint() {
        assert_eq!(
            parse_delivery_state_body("0").unwrap(),
            DeliveryState::Pending
        );
        assert_eq!(
            parse_delivery_state_body(" 3 ").unwrap(),
            DeliveryState::DeadLetter
        );
        assert!(parse_delivery_state_body("99").is_err());
    }

    #[test]
    fn parse_bool_body_accepts_true_false() {
        assert!(parse_bool_body("true").unwrap());
        assert!(!parse_bool_body("false").unwrap());
    }

    #[test]
    fn store_disabled_without_client_get() {
        let store = GithubStore::new(None, 16, Duration::from_secs(60));
        assert!(!store.is_enabled());
        let rt = tokio::runtime::Runtime::new().unwrap();
        let err = rt.block_on(store.get_issue("KBVE", "kbve", 1));
        assert!(matches!(err, Err(GithubStoreError::NotConfigured)));
    }
}
