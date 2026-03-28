//! Minimal GitHub API v3 response types.
//!
//! Only the fields we actually use are deserialized — GitHub returns much more.

use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub assignees: Vec<GitHubUser>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub comments: u64,
    /// Native GitHub issue type (Bug, Feature, Task, etc.). Requires org-level setup.
    #[serde(default, rename = "type")]
    pub issue_type: Option<GitHubIssueType>,
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
    #[serde(default)]
    pub labels: Vec<GitHubLabel>,
    #[serde(default)]
    pub assignees: Vec<GitHubUser>,
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

/// Native GitHub issue type (org-level: Bug, Feature, Task, or custom).
#[derive(Debug, Clone, Deserialize)]
pub struct GitHubIssueType {
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

// ── Comments ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubComment {
    pub id: u64,
    pub body: String,
    pub user: GitHubUser,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
}

// ── Request Payloads ───────────────────────────────────────────────

/// Payload for creating a new issue via POST `/repos/{owner}/{repo}/issues`.
#[derive(Debug, Clone, Serialize)]
pub struct CreateIssueRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub assignees: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub issue_type: Option<String>,
}

/// Payload for updating an issue via PATCH `/repos/{owner}/{repo}/issues/{number}`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateIssueRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignees: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub issue_type: Option<String>,
}

// ── Search ──────────────────────────────────────────────────────────

/// Wrapper for the GitHub search/issues response.
#[derive(Debug, Clone, Deserialize)]
pub struct GitHubSearchResult {
    pub total_count: u64,
    pub incomplete_results: bool,
    pub items: Vec<GitHubIssue>,
}

// ── Workflows ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubWorkflowsResponse {
    pub total_count: u64,
    pub workflows: Vec<GitHubWorkflow>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubWorkflow {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub state: String,
    #[serde(default)]
    pub html_url: String,
}

// ── Merge ───────────────────────────────────────────────────────────

/// Payload for merging a pull request via PUT `/repos/{owner}/{repo}/pulls/{number}/merge`.
#[derive(Debug, Clone, Serialize)]
pub struct MergePullRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_method: Option<String>,
}

/// Response from merging a pull request.
#[derive(Debug, Clone, Deserialize)]
pub struct GitHubMergeResult {
    pub sha: String,
    pub merged: bool,
    pub message: String,
}

// ── Rate Limit ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GitHubRateLimit {
    pub remaining: u32,
    pub limit: u32,
    pub reset: u64,
}
