//! Repository access policy for the GitHub client.
//!
//! `RepoPolicy` controls which repositories the client is allowed to query.
//! When an allowlist is configured, API calls to unlisted repos are rejected
//! before any HTTP request is made.
//!
//! # Configuration
//!
//! Set `GITHUB_ALLOWED_REPOS` to a comma-separated list of `owner/repo` entries:
//!
//! ```text
//! GITHUB_ALLOWED_REPOS=KBVE/kbve,KBVE/kbve.com
//! ```
//!
//! If the variable is unset or empty, all repos are allowed (open mode).

use std::collections::HashSet;

use tracing::info;

use crate::entity::error::JediError;

/// Controls which repositories the GitHub client may access.
#[derive(Debug, Clone)]
pub struct RepoPolicy {
    /// Lowercased `"owner/repo"` entries. `None` = all repos allowed.
    allowed_repos: Option<HashSet<String>>,
}

impl RepoPolicy {
    /// No restrictions — every repo is allowed.
    pub fn open() -> Self {
        Self {
            allowed_repos: None,
        }
    }

    /// Build from an explicit set of `"owner/repo"` strings.
    pub fn from_allowed(repos: &[&str]) -> Self {
        let set: HashSet<String> = repos.iter().map(|r| r.to_lowercase()).collect();
        Self {
            allowed_repos: if set.is_empty() { None } else { Some(set) },
        }
    }

    /// Build from the `GITHUB_ALLOWED_REPOS` environment variable.
    ///
    /// Unset or empty → open mode (all repos allowed).
    pub fn from_env() -> Self {
        let raw = match std::env::var("GITHUB_ALLOWED_REPOS") {
            Ok(v) if !v.trim().is_empty() => v,
            _ => {
                info!("GITHUB_ALLOWED_REPOS not set — all repos allowed");
                return Self::open();
            }
        };

        let repos: HashSet<String> = raw
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| s.contains('/'))
            .collect();

        if repos.is_empty() {
            info!("GITHUB_ALLOWED_REPOS contained no valid entries — all repos allowed");
            return Self::open();
        }

        info!(count = repos.len(), "GitHub repo allowlist configured");
        Self {
            allowed_repos: Some(repos),
        }
    }

    /// Returns `true` if the repo is permitted by this policy.
    pub fn is_allowed(&self, owner: &str, repo: &str) -> bool {
        match &self.allowed_repos {
            None => true,
            Some(set) => {
                let key = format!("{}/{}", owner.to_lowercase(), repo.to_lowercase());
                set.contains(&key)
            }
        }
    }

    /// Returns `Ok(())` if allowed, `Err(JediError::Forbidden)` otherwise.
    pub fn check(&self, owner: &str, repo: &str) -> Result<(), JediError> {
        if self.is_allowed(owner, repo) {
            Ok(())
        } else {
            Err(JediError::Forbidden)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_allows_everything() {
        let policy = RepoPolicy::open();
        assert!(policy.is_allowed("anything", "goes"));
        assert!(policy.check("foo", "bar").is_ok());
    }

    #[test]
    fn allowlist_permits_listed_repos() {
        let policy = RepoPolicy::from_allowed(&["KBVE/kbve", "KBVE/kbve.com"]);
        assert!(policy.is_allowed("KBVE", "kbve"));
        assert!(policy.is_allowed("kbve", "KBVE")); // case insensitive
        assert!(policy.is_allowed("KBVE", "kbve.com"));
    }

    #[test]
    fn allowlist_blocks_unlisted_repos() {
        let policy = RepoPolicy::from_allowed(&["KBVE/kbve"]);
        assert!(!policy.is_allowed("evil", "repo"));
        assert!(policy.check("evil", "repo").is_err());
    }

    #[test]
    fn empty_allowlist_becomes_open() {
        let policy = RepoPolicy::from_allowed(&[]);
        assert!(policy.is_allowed("any", "repo"));
    }

    #[test]
    fn check_returns_forbidden() {
        let policy = RepoPolicy::from_allowed(&["only/this"]);
        let err = policy.check("not", "this").unwrap_err();
        assert!(matches!(err, JediError::Forbidden));
    }
}
