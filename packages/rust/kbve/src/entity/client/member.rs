use std::num::NonZeroUsize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use lru::LruCache;
use serde::Deserialize;
use tracing::{info, warn};

use super::supabase::SupabaseClient;

// ── Types ────────────────────────────────────────────────────────────

/// Profile data returned by the `find_user_by_discord_id` RPC.
#[derive(Debug, Clone, Deserialize)]
pub struct UserProfile {
    pub user_id: String,
    #[serde(default)]
    pub discord_username: Option<String>,
    #[serde(default)]
    pub discord_avatar: Option<String>,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub last_sign_in: Option<String>,
}

/// Whether a Discord user is a linked Member or an unlinked Guest.
#[derive(Debug, Clone)]
pub enum MemberStatus {
    /// User has a linked Supabase account.
    Member(UserProfile),
    /// No linked account found.
    Guest {
        /// Whether the one-time "link your account" message has been shown.
        notified: bool,
    },
}

impl MemberStatus {
    /// Returns the display name: username if Member, `None` if Guest.
    pub fn display_name(&self) -> Option<&str> {
        match self {
            MemberStatus::Member(profile) => profile
                .discord_username
                .as_deref()
                .or(profile.full_name.as_deref()),
            MemberStatus::Guest { .. } => None,
        }
    }

    pub fn is_member(&self) -> bool {
        matches!(self, MemberStatus::Member(_))
    }

    pub fn is_guest(&self) -> bool {
        matches!(self, MemberStatus::Guest { .. })
    }
}

// ── Cache ────────────────────────────────────────────────────────────

struct CachedEntry {
    status: MemberStatus,
    expires_at: Instant,
}

/// Thread-safe LRU cache for Discord user membership lookups.
///
/// Each entry has a TTL; expired entries trigger a re-lookup.
/// If the Supabase client is `None` or the RPC call fails, the user
/// is treated as a Guest (graceful degradation).
pub struct MemberCache {
    client: Option<SupabaseClient>,
    cache: Mutex<LruCache<u64, CachedEntry>>,
    ttl: Duration,
}

impl MemberCache {
    /// Create a new cache.
    ///
    /// - `client`: Optional Supabase client. If `None`, all lookups return Guest.
    /// - `capacity`: Max entries before LRU eviction.
    /// - `ttl`: How long entries remain valid.
    pub fn new(client: Option<SupabaseClient>, capacity: usize, ttl: Duration) -> Self {
        let cap = NonZeroUsize::new(capacity).unwrap_or(NonZeroUsize::new(1024).unwrap());
        Self {
            client,
            cache: Mutex::new(LruCache::new(cap)),
            ttl,
        }
    }

    /// Create a cache from environment variables with default capacity (1024)
    /// and TTL (5 minutes).
    pub fn from_env() -> Self {
        Self::new(SupabaseClient::from_env(), 1024, Duration::from_secs(300))
    }

    /// Look up the membership status of a Discord user.
    ///
    /// Returns a cached result if available and not expired.
    /// Otherwise queries Supabase and caches the result.
    pub async fn lookup(&self, discord_id: u64) -> MemberStatus {
        // Check cache (lock held briefly)
        {
            let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(entry) = cache.get(&discord_id) {
                if Instant::now() < entry.expires_at {
                    return entry.status.clone();
                }
            }
        }

        // Fetch from Supabase (no lock held)
        let status = self.fetch_from_supabase(discord_id).await;

        // Store in cache (lock held briefly)
        {
            let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            cache.put(
                discord_id,
                CachedEntry {
                    status: status.clone(),
                    expires_at: Instant::now() + self.ttl,
                },
            );
        }

        status
    }

    /// Mark a Guest user as notified so the one-time message is not repeated.
    pub fn mark_notified(&self, discord_id: u64) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = cache.get_mut(&discord_id) {
            if let MemberStatus::Guest {
                ref mut notified, ..
            } = entry.status
            {
                *notified = true;
            }
        }
    }

    /// Invalidate a specific user's cache entry.
    pub fn invalidate(&self, discord_id: u64) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.pop(&discord_id);
    }

    async fn fetch_from_supabase(&self, discord_id: u64) -> MemberStatus {
        let client = match &self.client {
            Some(c) => c,
            None => return MemberStatus::Guest { notified: false },
        };

        let params = serde_json::json!({
            "p_discord_id": discord_id.to_string()
        });

        let resp = match client
            .rpc_schema("find_user_by_discord_id", params, "tracker")
            .await
        {
            Ok(r) => r,
            Err(e) => {
                warn!(discord_id, error = %e, "Membership lookup failed");
                return MemberStatus::Guest { notified: false };
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!(discord_id, %status, %body, "Membership lookup HTTP error");
            return MemberStatus::Guest { notified: false };
        }

        let text = match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                warn!(discord_id, error = %e, "Failed to read membership response");
                return MemberStatus::Guest { notified: false };
            }
        };

        // Try single object first, then array (PostgREST can return either)
        if let Ok(profile) = serde_json::from_str::<UserProfile>(&text) {
            info!(discord_id, user_id = %profile.user_id, "Member found");
            return MemberStatus::Member(profile);
        }

        if let Ok(profiles) = serde_json::from_str::<Vec<UserProfile>>(&text) {
            if let Some(profile) = profiles.into_iter().next() {
                info!(discord_id, user_id = %profile.user_id, "Member found");
                return MemberStatus::Member(profile);
            }
        }

        MemberStatus::Guest { notified: false }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guest_default_when_no_client() {
        let cache = MemberCache::new(None, 16, Duration::from_secs(60));
        let rt = tokio::runtime::Runtime::new().unwrap();
        let status = rt.block_on(cache.lookup(12345));
        assert!(status.is_guest());
    }

    #[test]
    fn mark_notified_updates_entry() {
        let cache = MemberCache::new(None, 16, Duration::from_secs(60));
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(cache.lookup(12345));
        cache.mark_notified(12345);
        let status = rt.block_on(cache.lookup(12345));
        match status {
            MemberStatus::Guest { notified } => assert!(notified),
            _ => panic!("expected Guest"),
        }
    }

    #[test]
    fn invalidate_removes_entry() {
        let cache = MemberCache::new(None, 16, Duration::from_secs(60));
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(cache.lookup(12345));
        cache.invalidate(12345);
        let status = rt.block_on(cache.lookup(12345));
        match status {
            MemberStatus::Guest { notified } => assert!(!notified),
            _ => panic!("expected fresh Guest"),
        }
    }

    #[test]
    fn cache_respects_capacity() {
        let cache = MemberCache::new(None, 2, Duration::from_secs(60));
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(cache.lookup(1));
        rt.block_on(cache.lookup(2));
        rt.block_on(cache.lookup(3)); // evicts 1
        let inner = cache.cache.lock().unwrap();
        assert_eq!(inner.len(), 2);
    }

    #[test]
    fn display_name_member() {
        let profile = UserProfile {
            user_id: "uuid".into(),
            discord_username: Some("TestUser".into()),
            discord_avatar: None,
            full_name: Some("Test User".into()),
            email: None,
            created_at: None,
            last_sign_in: None,
        };
        let status = MemberStatus::Member(profile);
        assert_eq!(status.display_name(), Some("TestUser"));
    }

    #[test]
    fn display_name_guest() {
        let status = MemberStatus::Guest { notified: false };
        assert_eq!(status.display_name(), None);
        assert!(status.is_guest());
        assert!(!status.is_member());
    }
}
