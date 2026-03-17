//! Minimal GitHub API v3 response types.
//!
//! Only the fields we actually use are deserialized — GitHub returns much more.

use serde::Deserialize;

// ── Issues ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub user: GitHubUser,
    #[serde(default)]
    pub labels: Vec<GitHubLabel>,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub pull_request: Option<serde_json::Value>,
}

impl GitHubIssue {
    /// Returns true if this is actually a pull request (GitHub API returns PRs in issues endpoint).
    pub fn is_pull_request(&self) -> bool {
        self.pull_request.is_some()
    }
}

// ── Pull Requests ───────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubPull {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub user: GitHubUser,
    pub head: GitHubRef,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    #[serde(default)]
    pub draft: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubRef {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
}

// ── Commits ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubCommit {
    pub sha: String,
    pub commit: GitHubCommitDetail,
    pub html_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubCommitDetail {
    pub message: String,
    pub author: GitHubCommitAuthor,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubCommitAuthor {
    pub name: String,
    pub date: String,
}

// ── Branch Protection ───────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubBranchProtection {
    #[serde(default)]
    pub required_status_checks: Option<GitHubStatusChecks>,
    #[serde(default)]
    pub enforce_admins: Option<GitHubEnforceAdmins>,
    #[serde(default)]
    pub required_pull_request_reviews: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubStatusChecks {
    pub strict: bool,
    #[serde(default)]
    pub contexts: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubEnforceAdmins {
    pub enabled: bool,
}

// ── Repository ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubRepo {
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub html_url: String,
    pub default_branch: String,
    pub open_issues_count: u64,
}

// ── Shared ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubUser {
    pub login: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubLabel {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

// ── Rate Limit ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GitHubRateLimit {
    pub remaining: u32,
    pub limit: u32,
    pub reset: u64,
}
