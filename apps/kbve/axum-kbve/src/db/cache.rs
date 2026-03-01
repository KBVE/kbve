// Profile cache actor - handles caching with TTL and Discord enrichment
//
// Uses tokio mpsc channels for actor-style message passing.
// All cache operations go through the actor to avoid lock contention.

use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, oneshot};

use super::profile::{DiscordInfo, UserProfile};

/// Cache configuration
const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes
const CACHE_MAX_SIZE: usize = 10_000;
const CHANNEL_BUFFER: usize = 256;

/// Cached profile entry with timestamp
struct CacheEntry {
    profile: Arc<UserProfile>,
    inserted_at: Instant,
    last_accessed: Instant,
}

impl CacheEntry {
    fn new(profile: UserProfile) -> Self {
        let now = Instant::now();
        Self {
            profile: Arc::new(profile),
            inserted_at: now,
            last_accessed: now,
        }
    }

    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > CACHE_TTL
    }

    fn touch(&mut self) {
        self.last_accessed = Instant::now();
    }
}

/// Commands sent to the cache actor
pub enum CacheCommand {
    /// Get a profile by username
    Get {
        username: String,
        reply: oneshot::Sender<Option<Arc<UserProfile>>>,
    },
    /// Store a profile in the cache
    Set {
        username: String,
        profile: UserProfile,
    },
    /// Invalidate a specific profile
    Invalidate { username: String },
    /// Clear all cached profiles
    Clear,
    /// Get cache statistics
    Stats { reply: oneshot::Sender<CacheStats> },
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub size: usize,
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
}

/// Handle to communicate with the cache actor
#[derive(Clone)]
pub struct ProfileCache {
    tx: mpsc::Sender<CacheCommand>,
}

impl ProfileCache {
    /// Get a profile from cache
    pub async fn get(&self, username: &str) -> Option<Arc<UserProfile>> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let cmd = CacheCommand::Get {
            username: username.to_lowercase(),
            reply: reply_tx,
        };

        if self.tx.send(cmd).await.is_err() {
            tracing::error!("Cache actor channel closed");
            return None;
        }

        reply_rx.await.unwrap_or(None)
    }

    /// Store a profile in cache
    pub async fn set(&self, username: &str, profile: UserProfile) {
        let cmd = CacheCommand::Set {
            username: username.to_lowercase(),
            profile,
        };

        if let Err(e) = self.tx.send(cmd).await {
            tracing::error!("Failed to send to cache actor: {}", e);
        }
    }

    /// Invalidate a cached profile
    pub async fn invalidate(&self, username: &str) {
        let cmd = CacheCommand::Invalidate {
            username: username.to_lowercase(),
        };

        let _ = self.tx.send(cmd).await;
    }

    /// Clear entire cache
    pub async fn clear(&self) {
        let _ = self.tx.send(CacheCommand::Clear).await;
    }

    /// Get cache statistics
    pub async fn stats(&self) -> Option<CacheStats> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let cmd = CacheCommand::Stats { reply: reply_tx };

        if self.tx.send(cmd).await.is_err() {
            return None;
        }

        reply_rx.await.ok()
    }
}

/// Spawn the cache actor and return a handle
pub fn spawn_cache_actor() -> ProfileCache {
    let (tx, rx) = mpsc::channel(CHANNEL_BUFFER);

    tokio::spawn(cache_actor_loop(rx));

    ProfileCache { tx }
}

/// The cache actor event loop
async fn cache_actor_loop(mut rx: mpsc::Receiver<CacheCommand>) {
    let cache: DashMap<String, CacheEntry> = DashMap::with_capacity(1000);
    let mut stats = CacheStats {
        size: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
    };

    tracing::info!("Profile cache actor started");

    while let Some(cmd) = rx.recv().await {
        match cmd {
            CacheCommand::Get { username, reply } => {
                let result = cache.get_mut(&username).and_then(|mut entry| {
                    if entry.is_expired() {
                        drop(entry);
                        cache.remove(&username);
                        stats.evictions += 1;
                        stats.size = cache.len();
                        None
                    } else {
                        entry.touch();
                        Some(Arc::clone(&entry.profile))
                    }
                });

                if result.is_some() {
                    stats.hits += 1;
                } else {
                    stats.misses += 1;
                }

                let _ = reply.send(result);
            }

            CacheCommand::Set { username, profile } => {
                // Evict oldest entries if at capacity
                if cache.len() >= CACHE_MAX_SIZE {
                    evict_lru(&cache, &mut stats);
                }

                cache.insert(username, CacheEntry::new(profile));
                stats.size = cache.len();
            }

            CacheCommand::Invalidate { username } => {
                if cache.remove(&username).is_some() {
                    stats.size = cache.len();
                }
            }

            CacheCommand::Clear => {
                cache.clear();
                stats.size = 0;
                tracing::info!("Profile cache cleared");
            }

            CacheCommand::Stats { reply } => {
                let _ = reply.send(stats.clone());
            }
        }
    }

    tracing::warn!("Profile cache actor shutting down");
}

/// Evict least recently used entries when cache is full
fn evict_lru(cache: &DashMap<String, CacheEntry>, stats: &mut CacheStats) {
    // Find entries to evict (oldest 10%)
    let evict_count = CACHE_MAX_SIZE / 10;
    let mut entries: Vec<_> = cache
        .iter()
        .map(|e| (e.key().clone(), e.value().last_accessed))
        .collect();

    entries.sort_by_key(|(_, accessed)| *accessed);

    for (key, _) in entries.into_iter().take(evict_count) {
        cache.remove(&key);
        stats.evictions += 1;
    }

    stats.size = cache.len();
    tracing::debug!("Evicted {} entries from profile cache", evict_count);
}

// Global cache handle
static PROFILE_CACHE: std::sync::OnceLock<ProfileCache> = std::sync::OnceLock::new();

/// Initialize the global profile cache
pub fn init_profile_cache() -> ProfileCache {
    PROFILE_CACHE.get_or_init(spawn_cache_actor).clone()
}

/// Get the global profile cache handle
pub fn get_profile_cache() -> Option<ProfileCache> {
    PROFILE_CACHE.get().cloned()
}
