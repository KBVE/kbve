//! Server-side access control for the Forgejo client, mirroring the GitHub
//! client's `RepoPolicy`. An open policy (default) permits every owner; a
//! restricted policy only permits owners on its allowlist, so a consumer with
//! a narrow mandate (or the dashboard via `FORGEJO_ALLOWED_OWNERS`) can't
//! mutate repos/orgs outside it even with an admin token.

use std::collections::HashSet;

use crate::entity::error::JediError;

#[derive(Clone, Debug, Default)]
pub struct ForgejoPolicy {
    allowed_owners: Option<HashSet<String>>,
}

impl ForgejoPolicy {
    /// Permit every owner.
    pub fn open() -> Self {
        Self {
            allowed_owners: None,
        }
    }

    /// Permit only the given owners (case-insensitive). Empty input stays open.
    pub fn from_owners<I, S>(owners: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let set: HashSet<String> = owners
            .into_iter()
            .map(|o| o.as_ref().trim().to_ascii_lowercase())
            .filter(|o| !o.is_empty())
            .collect();
        Self {
            allowed_owners: if set.is_empty() { None } else { Some(set) },
        }
    }

    /// Reject before any HTTP call if `owner` is outside the allowlist.
    pub fn check_owner(&self, owner: &str) -> Result<(), JediError> {
        match &self.allowed_owners {
            None => Ok(()),
            Some(set) if set.contains(&owner.to_ascii_lowercase()) => Ok(()),
            Some(_) => Err(JediError::Forbidden),
        }
    }
}
