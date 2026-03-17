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

#[cfg(test)]
mod tests {
    use super::*;

    // ── Fixture helpers ──────────────────────────────────────────────

    fn make_issue(number: u64, updated_at: &str, labels: Vec<&str>) -> GitHubIssue {
        GitHubIssue {
            number,
            title: format!("Issue #{number}"),
            state: "open".to_string(),
            user: GitHubUser {
                login: "testuser".to_string(),
            },
            labels: labels
                .into_iter()
                .map(|n| GitHubLabel {
                    name: n.to_string(),
                    color: None,
                })
                .collect(),
            created_at: updated_at.to_string(),
            updated_at: updated_at.to_string(),
            html_url: format!("https://github.com/test/repo/issues/{number}"),
            pull_request: None,
        }
    }

    fn make_pull(number: u64, updated_at: &str, draft: bool) -> GitHubPull {
        GitHubPull {
            number,
            title: format!("PR #{number}"),
            state: "open".to_string(),
            user: GitHubUser {
                login: "testuser".to_string(),
            },
            head: GitHubRef {
                ref_name: "feature-branch".to_string(),
                sha: "abc123".to_string(),
            },
            created_at: updated_at.to_string(),
            updated_at: updated_at.to_string(),
            html_url: format!("https://github.com/test/repo/pull/{number}"),
            draft,
        }
    }

    fn days_ago(days: i64) -> String {
        (chrono::Utc::now() - chrono::Duration::days(days))
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    }

    // ── Type deserialization ─────────────────────────────────────────

    #[test]
    fn deserialize_issue_json() {
        let json = r#"{
            "number": 42,
            "title": "Test issue",
            "state": "open",
            "user": {"login": "octocat"},
            "labels": [{"name": "bug", "color": "d73a4a"}],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "html_url": "https://github.com/test/repo/issues/42"
        }"#;
        let issue: GitHubIssue = serde_json::from_str(json).unwrap();
        assert_eq!(issue.number, 42);
        assert_eq!(issue.title, "Test issue");
        assert_eq!(issue.user.login, "octocat");
        assert_eq!(issue.labels.len(), 1);
        assert_eq!(issue.labels[0].name, "bug");
        assert!(!issue.is_pull_request());
    }

    #[test]
    fn deserialize_issue_with_pr_field() {
        let json = r#"{
            "number": 10,
            "title": "PR as issue",
            "state": "open",
            "user": {"login": "octocat"},
            "labels": [],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "html_url": "https://github.com/test/repo/issues/10",
            "pull_request": {"url": "https://api.github.com/repos/test/repo/pulls/10"}
        }"#;
        let issue: GitHubIssue = serde_json::from_str(json).unwrap();
        assert!(issue.is_pull_request());
    }

    #[test]
    fn deserialize_pull_json() {
        let json = r#"{
            "number": 99,
            "title": "Add feature",
            "state": "open",
            "user": {"login": "dev"},
            "head": {"ref": "feat/new", "sha": "deadbeef"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-03T00:00:00Z",
            "html_url": "https://github.com/test/repo/pull/99",
            "draft": true
        }"#;
        let pull: GitHubPull = serde_json::from_str(json).unwrap();
        assert_eq!(pull.number, 99);
        assert_eq!(pull.head.ref_name, "feat/new");
        assert!(pull.draft);
    }

    #[test]
    fn deserialize_commit_json() {
        let json = r#"{
            "sha": "abc123def",
            "commit": {
                "message": "fix: resolve bug",
                "author": {"name": "Dev", "date": "2026-01-01T12:00:00Z"}
            },
            "html_url": "https://github.com/test/repo/commit/abc123def"
        }"#;
        let commit: GitHubCommit = serde_json::from_str(json).unwrap();
        assert_eq!(commit.sha, "abc123def");
        assert_eq!(commit.commit.message, "fix: resolve bug");
        assert_eq!(commit.commit.author.name, "Dev");
    }

    #[test]
    fn deserialize_repo_json() {
        let json = r#"{
            "name": "kbve",
            "full_name": "KBVE/kbve",
            "description": "A monorepo",
            "html_url": "https://github.com/KBVE/kbve",
            "default_branch": "main",
            "open_issues_count": 150
        }"#;
        let repo: GitHubRepo = serde_json::from_str(json).unwrap();
        assert_eq!(repo.full_name, "KBVE/kbve");
        assert_eq!(repo.default_branch, "main");
        assert_eq!(repo.open_issues_count, 150);
    }

    #[test]
    fn deserialize_branch_protection_json() {
        let json = r#"{
            "required_status_checks": {"strict": true, "contexts": ["ci/build"]},
            "enforce_admins": {"enabled": true}
        }"#;
        let bp: GitHubBranchProtection = serde_json::from_str(json).unwrap();
        assert!(bp.required_status_checks.unwrap().strict);
        assert!(bp.enforce_admins.unwrap().enabled);
    }

    #[test]
    fn deserialize_issue_missing_optional_labels() {
        let json = r#"{
            "number": 1,
            "title": "No labels",
            "state": "open",
            "user": {"login": "u"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "html_url": "https://example.com/1"
        }"#;
        let issue: GitHubIssue = serde_json::from_str(json).unwrap();
        assert!(issue.labels.is_empty());
    }

    // ── Stale filtering ──────────────────────────────────────────────

    #[test]
    fn stale_issues_filters_by_threshold() {
        let issues = vec![
            make_issue(1, &days_ago(10), vec![]),
            make_issue(2, &days_ago(2), vec![]),
            make_issue(3, &days_ago(5), vec![]),
        ];
        let stale = GitHubClient::stale_issues(&issues, 3);
        assert_eq!(stale.len(), 2);
        assert!(stale.iter().any(|i| i.number == 1));
        assert!(stale.iter().any(|i| i.number == 3));
    }

    #[test]
    fn stale_issues_empty_when_all_recent() {
        let issues = vec![
            make_issue(1, &days_ago(0), vec![]),
            make_issue(2, &days_ago(1), vec![]),
        ];
        let stale = GitHubClient::stale_issues(&issues, 7);
        assert!(stale.is_empty());
    }

    #[test]
    fn stale_pulls_filters_by_threshold() {
        let pulls = vec![
            make_pull(1, &days_ago(15), false),
            make_pull(2, &days_ago(1), true),
        ];
        let stale = GitHubClient::stale_pulls(&pulls, 7);
        assert_eq!(stale.len(), 1);
        assert_eq!(stale[0].number, 1);
    }

    #[test]
    fn stale_issues_handles_invalid_dates() {
        let issues = vec![make_issue(1, "not-a-date", vec![])];
        let stale = GitHubClient::stale_issues(&issues, 1);
        assert!(stale.is_empty());
    }

    #[test]
    fn stale_issues_empty_input() {
        let stale = GitHubClient::stale_issues(&[], 1);
        assert!(stale.is_empty());
    }

    // ── Client construction ──────────────────────────────────────────

    #[test]
    fn with_base_url_trims_trailing_slash() {
        let client = GitHubClient::new("tok").with_base_url("https://gh.example.com/");
        assert_eq!(client.base_url, "https://gh.example.com");
    }

    // ── Mock Axum server helpers ─────────────────────────────────────

    use axum::{Router, routing::get};

    /// Start a mock HTTP server and return its base URL (e.g. "http://127.0.0.1:PORT").
    async fn mock_server(app: Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}")
    }

    // ── Error mapping (HTTP status → JediError) ─────────────────────

    #[tokio::test]
    async fn error_401_maps_to_unauthorized() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { axum::http::StatusCode::UNAUTHORIZED }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("bad-token").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::Unauthorized), "got: {err:?}");
    }

    #[tokio::test]
    async fn error_403_maps_to_forbidden() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { axum::http::StatusCode::FORBIDDEN }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::Forbidden), "got: {err:?}");
    }

    #[tokio::test]
    async fn error_404_maps_to_not_found() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { axum::http::StatusCode::NOT_FOUND }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::NotFound), "got: {err:?}");
    }

    #[tokio::test]
    async fn error_429_maps_to_forbidden() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { axum::http::StatusCode::TOO_MANY_REQUESTS }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::Forbidden), "got: {err:?}");
    }

    #[tokio::test]
    async fn error_500_maps_to_internal() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { axum::http::StatusCode::INTERNAL_SERVER_ERROR }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::Internal(_)), "got: {err:?}");
    }

    // ── Rate limit header parsing ────────────────────────────────────

    #[tokio::test]
    async fn rate_limit_low_logs_warning() {
        // The check_rate_limit method logs but doesn't error — we verify
        // the request still succeeds when rate limit headers are present.
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async {
                (
                    [
                        ("x-ratelimit-remaining", "5"),
                        ("x-ratelimit-reset", "1700000000"),
                    ],
                    "[]",
                )
            }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let issues = client.list_issues("o", "r", None, None).await.unwrap();
        assert!(issues.is_empty());
    }

    #[tokio::test]
    async fn rate_limit_healthy_no_issue() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async {
                (
                    [
                        ("x-ratelimit-remaining", "4999"),
                        ("x-ratelimit-reset", "1700000000"),
                    ],
                    "[]",
                )
            }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let issues = client.list_issues("o", "r", None, None).await.unwrap();
        assert!(issues.is_empty());
    }

    // ── list_issues filters out PRs ──────────────────────────────────

    #[tokio::test]
    async fn list_issues_filters_pull_requests() {
        let body = r#"[
            {
                "number": 1, "title": "Real issue", "state": "open",
                "user": {"login": "u"}, "labels": [],
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "html_url": "https://example.com/1"
            },
            {
                "number": 2, "title": "Sneaky PR", "state": "open",
                "user": {"login": "u"}, "labels": [],
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "html_url": "https://example.com/2",
                "pull_request": {"url": "https://api.example.com/pulls/2"}
            }
        ]"#;
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(move || async move { body }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let issues = client.list_issues("o", "r", None, None).await.unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 1);
    }

    // ── list_pulls success ───────────────────────────────────────────

    #[tokio::test]
    async fn list_pulls_success() {
        let body = r#"[{
            "number": 42, "title": "My PR", "state": "open",
            "user": {"login": "dev"},
            "head": {"ref": "feat/x", "sha": "abc"},
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "html_url": "https://example.com/pull/42",
            "draft": false
        }]"#;
        let app = Router::new().route(
            "/repos/{owner}/{repo}/pulls",
            get(move || async move { body }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let pulls = client
            .list_pulls("o", "r", Some("open"), Some(10))
            .await
            .unwrap();
        assert_eq!(pulls.len(), 1);
        assert_eq!(pulls[0].number, 42);
        assert_eq!(pulls[0].head.ref_name, "feat/x");
    }

    // ── get_repo success ─────────────────────────────────────────────

    #[tokio::test]
    async fn get_repo_success() {
        let body = r#"{
            "name": "kbve", "full_name": "KBVE/kbve",
            "description": "Mono", "html_url": "https://github.com/KBVE/kbve",
            "default_branch": "main", "open_issues_count": 42
        }"#;
        let app = Router::new().route("/repos/{owner}/{repo}", get(move || async move { body }));
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let repo = client.get_repo("KBVE", "kbve").await.unwrap();
        assert_eq!(repo.full_name, "KBVE/kbve");
        assert_eq!(repo.open_issues_count, 42);
    }

    // ── Invalid JSON → parse error ───────────────────────────────────

    #[tokio::test]
    async fn invalid_json_maps_to_parse_error() {
        let app = Router::new().route(
            "/repos/{owner}/{repo}/issues",
            get(|| async { "not json at all" }),
        );
        let base = mock_server(app).await;
        let client = GitHubClient::new("tok").with_base_url(&base);

        let err = client.list_issues("o", "r", None, None).await.unwrap_err();
        assert!(matches!(err, JediError::Parse(_)), "got: {err:?}");
    }
}
