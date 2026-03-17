//! Thin wrapper around the GitHub REST API v3.
//!
//! Callers provide a PAT at construction — token retrieval (e.g. from Supabase Vault)
//! is the caller's responsibility.
//!
//! # Example
//! ```ignore
//! let gh = GitHubClient::new("ghp_xxxx");
//! let issues = gh.list_issues("KBVE", "kbve", Some("open"), Some(25)).await?;
//! ```

use reqwest::{Client, Response, StatusCode};
use std::borrow::Cow;
use tracing::warn;

use super::types::*;
use crate::entity::error::JediError;

const DEFAULT_BASE_URL: &str = "https://api.github.com";
const USER_AGENT: &str = "kbve-jedi/1.0";

#[derive(Clone)]
pub struct GitHubClient {
    client: Client,
    token: String,
    base_url: String,
}

impl GitHubClient {
    /// Create a new GitHub client with a personal access token.
    pub fn new(token: &str) -> Self {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .build()
            .expect("Failed to build reqwest client for GitHubClient");

        Self {
            client,
            token: token.to_string(),
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    /// Override the base URL (useful for GitHub Enterprise or testing).
    pub fn with_base_url(mut self, url: &str) -> Self {
        self.base_url = url.trim_end_matches('/').to_string();
        self
    }

    // ── API Methods ─────────────────────────────────────────────────

    /// Fetch issues for a repository. Excludes pull requests by default.
    pub async fn list_issues(
        &self,
        owner: &str,
        repo: &str,
        state: Option<&str>,
        per_page: Option<u8>,
    ) -> Result<Vec<GitHubIssue>, JediError> {
        let url = format!("{}/repos/{}/{}/issues", self.base_url, owner, repo);
        let mut req = self.client.get(&url).bearer_auth(&self.token);

        if let Some(s) = state {
            req = req.query(&[("state", s)]);
        }
        req = req.query(&[("per_page", per_page.unwrap_or(30).to_string())]);

        let resp = req
            .send()
            .await
            .map_err(|e| JediError::Internal(Cow::Owned(format!("GitHub request failed: {e}"))))?;

        let resp = self.check_rate_limit(resp);
        let issues: Vec<GitHubIssue> = self.parse_response(resp).await?;

        // GitHub's issues endpoint includes PRs — filter them out
        Ok(issues
            .into_iter()
            .filter(|i| !i.is_pull_request())
            .collect())
    }

    /// Fetch pull requests for a repository.
    pub async fn list_pulls(
        &self,
        owner: &str,
        repo: &str,
        state: Option<&str>,
        per_page: Option<u8>,
    ) -> Result<Vec<GitHubPull>, JediError> {
        let url = format!("{}/repos/{}/{}/pulls", self.base_url, owner, repo);
        let mut req = self.client.get(&url).bearer_auth(&self.token);

        if let Some(s) = state {
            req = req.query(&[("state", s)]);
        }
        req = req.query(&[("per_page", per_page.unwrap_or(30).to_string())]);

        let resp = req
            .send()
            .await
            .map_err(|e| JediError::Internal(Cow::Owned(format!("GitHub request failed: {e}"))))?;

        let resp = self.check_rate_limit(resp);
        self.parse_response(resp).await
    }

    /// Fetch recent commits for a repository.
    pub async fn list_commits(
        &self,
        owner: &str,
        repo: &str,
        since: Option<&str>,
        per_page: Option<u8>,
    ) -> Result<Vec<GitHubCommit>, JediError> {
        let url = format!("{}/repos/{}/{}/commits", self.base_url, owner, repo);
        let mut req = self.client.get(&url).bearer_auth(&self.token);

        if let Some(s) = since {
            req = req.query(&[("since", s)]);
        }
        req = req.query(&[("per_page", per_page.unwrap_or(30).to_string())]);

        let resp = req
            .send()
            .await
            .map_err(|e| JediError::Internal(Cow::Owned(format!("GitHub request failed: {e}"))))?;

        let resp = self.check_rate_limit(resp);
        self.parse_response(resp).await
    }

    /// Fetch branch protection rules.
    pub async fn get_branch_protection(
        &self,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<GitHubBranchProtection, JediError> {
        let url = format!(
            "{}/repos/{}/{}/branches/{}/protection",
            self.base_url, owner, repo, branch
        );

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| JediError::Internal(Cow::Owned(format!("GitHub request failed: {e}"))))?;

        let resp = self.check_rate_limit(resp);
        self.parse_response(resp).await
    }

    /// Fetch repository metadata.
    pub async fn get_repo(&self, owner: &str, repo: &str) -> Result<GitHubRepo, JediError> {
        let url = format!("{}/repos/{}/{}", self.base_url, owner, repo);

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| JediError::Internal(Cow::Owned(format!("GitHub request failed: {e}"))))?;

        let resp = self.check_rate_limit(resp);
        self.parse_response(resp).await
    }

    // ── Stagnation Detection ────────────────────────────────────────

    /// Filter issues that haven't been updated within `threshold_days`.
    pub fn stale_issues(issues: &[GitHubIssue], threshold_days: u64) -> Vec<&GitHubIssue> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(threshold_days as i64);
        issues
            .iter()
            .filter(|i| {
                chrono::DateTime::parse_from_rfc3339(&i.updated_at)
                    .map(|dt| dt < cutoff)
                    .unwrap_or(false)
            })
            .collect()
    }

    /// Filter pull requests that haven't been updated within `threshold_days`.
    pub fn stale_pulls(pulls: &[GitHubPull], threshold_days: u64) -> Vec<&GitHubPull> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(threshold_days as i64);
        pulls
            .iter()
            .filter(|p| {
                chrono::DateTime::parse_from_rfc3339(&p.updated_at)
                    .map(|dt| dt < cutoff)
                    .unwrap_or(false)
            })
            .collect()
    }

    // ── Internal ────────────────────────────────────────────────────

    /// Check rate limit headers and log warnings.
    fn check_rate_limit(&self, resp: Response) -> Response {
        if let Some(remaining) = resp
            .headers()
            .get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u32>().ok())
        {
            if remaining < 10 {
                let reset = resp
                    .headers()
                    .get("x-ratelimit-reset")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown");
                warn!(remaining, reset, "GitHub API rate limit low");
            }
        }
        resp
    }

    /// Parse a GitHub API response, mapping HTTP errors to JediError.
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
            match status {
                StatusCode::UNAUTHORIZED => Err(JediError::Unauthorized),
                StatusCode::FORBIDDEN => Err(JediError::Forbidden),
                StatusCode::NOT_FOUND => Err(JediError::NotFound),
                StatusCode::TOO_MANY_REQUESTS => Err(JediError::Forbidden),
                _ => Err(JediError::Internal(Cow::Owned(format!(
                    "GitHub API error {status}: {body}"
                )))),
            }
        }
    }
}
