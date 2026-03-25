//! Caching layer for GitHub API data.
//!
//! - **Labels**: cached for 1 hour (rarely change)
//! - **Issues**: cached for 30 seconds (short-lived, avoids re-fetch on button click)

use std::time::{Duration, Instant};

use dashmap::DashMap;
use jedi::entity::github::{GitHubClient, GitHubIssue, GitHubLabel};

const LABEL_TTL: Duration = Duration::from_secs(3600); // 1 hour
const ISSUE_TTL: Duration = Duration::from_secs(30); // 30 seconds

/// Cached GitHub data shared across commands and component handlers.
pub struct GitHubCache {
    labels: DashMap<String, (Instant, Vec<GitHubLabel>)>,
    issues: DashMap<String, (Instant, GitHubIssue)>,
}

impl GitHubCache {
    pub fn new() -> Self {
        Self {
            labels: DashMap::new(),
            issues: DashMap::new(),
        }
    }

    /// Get labels from cache or fetch from GitHub API.
    pub async fn get_or_fetch_labels(
        &self,
        client: &GitHubClient,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<GitHubLabel>, String> {
        let key = format!("{}/{}", owner.to_lowercase(), repo.to_lowercase());

        if let Some(entry) = self.labels.get(&key) {
            let (cached_at, labels) = entry.value();
            if cached_at.elapsed() < LABEL_TTL {
                return Ok(labels.clone());
            }
        }

        let labels = client
            .list_labels(owner, repo)
            .await
            .map_err(|e| format!("Failed to fetch labels: {e}"))?;

        self.labels.insert(key, (Instant::now(), labels.clone()));
        Ok(labels)
    }

    /// Get a single issue from cache or fetch from GitHub API.
    pub async fn get_or_fetch_issue(
        &self,
        client: &GitHubClient,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<GitHubIssue, String> {
        let key = format!(
            "{}/#{}#{}",
            owner.to_lowercase(),
            repo.to_lowercase(),
            number
        );

        if let Some(entry) = self.issues.get(&key) {
            let (cached_at, issue) = entry.value();
            if cached_at.elapsed() < ISSUE_TTL {
                return Ok(issue.clone());
            }
        }

        let issue = client
            .get_issue(owner, repo, number)
            .await
            .map_err(|e| format!("Failed to fetch issue #{number}: {e}"))?;

        self.issues.insert(key, (Instant::now(), issue.clone()));
        Ok(issue)
    }

    /// Invalidate a cached issue (call after mutation like label changes).
    pub fn invalidate_issue(&self, owner: &str, repo: &str, number: u64) {
        let key = format!(
            "{}/#{}#{}",
            owner.to_lowercase(),
            repo.to_lowercase(),
            number
        );
        self.issues.remove(&key);
    }

    /// Prune expired entries to prevent unbounded growth.
    pub fn prune(&self) {
        let now = Instant::now();
        self.labels
            .retain(|_, (cached_at, _)| now.duration_since(*cached_at) < LABEL_TTL * 2);
        self.issues
            .retain(|_, (cached_at, _)| now.duration_since(*cached_at) < ISSUE_TTL * 2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_cache_is_empty() {
        let cache = GitHubCache::new();
        assert_eq!(cache.labels.len(), 0);
        assert_eq!(cache.issues.len(), 0);
    }

    #[test]
    fn invalidate_removes_issue() {
        let cache = GitHubCache::new();
        // Manually insert a fake entry
        let issue = GitHubIssue {
            number: 1,
            title: "test".to_owned(),
            state: "open".to_owned(),
            user: jedi::entity::github::GitHubUser {
                login: "u".to_owned(),
            },
            labels: vec![],
            created_at: "2026-01-01T00:00:00Z".to_owned(),
            updated_at: "2026-01-01T00:00:00Z".to_owned(),
            html_url: "https://example.com".to_owned(),
            pull_request: None,
            assignees: vec![],
            body: None,
            comments: 0,
            issue_type: None,
        };
        cache
            .issues
            .insert("kbve/#kbve#1".to_owned(), (Instant::now(), issue));
        assert_eq!(cache.issues.len(), 1);

        cache.invalidate_issue("KBVE", "kbve", 1);
        assert_eq!(cache.issues.len(), 0);
    }

    #[test]
    fn prune_removes_expired() {
        let cache = GitHubCache::new();
        // Insert with old timestamp
        let old = Instant::now() - Duration::from_secs(7200);
        cache.labels.insert("test/repo".to_owned(), (old, vec![]));
        assert_eq!(cache.labels.len(), 1);

        cache.prune();
        assert_eq!(cache.labels.len(), 0);
    }
}
