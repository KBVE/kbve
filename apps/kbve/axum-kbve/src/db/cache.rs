// Profile cache - DashMap-backed with background cleanup.
//
// - Reads/writes hit the map directly (no actor channel).
// - `get_or_load` deduplicates concurrent misses for the same key via a
//   per-key tokio mutex stored in `inflight` — 20 simultaneous requests for
//   the same username collapse to a single enrichment pipeline.
// - A single background task sweeps expired entries and caps size.

use dashmap::DashMap;
use std::future::Future;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use super::profile::UserProfile;

const CACHE_TTL: Duration = Duration::from_secs(300);
const CACHE_MAX_SIZE: usize = 10_000;
const CLEANUP_INTERVAL: Duration = Duration::from_secs(60);
const EVICTION_BATCH: usize = CACHE_MAX_SIZE / 10;
// Short-TTL tombstones for known-missing usernames so an unauthenticated
// `/@bogus` flood can't re-run the full 2-RPC enrichment pipeline on every hit.
const NEGATIVE_TTL: Duration = Duration::from_secs(30);
// Hard cap on the tombstone map between background sweeps so a high-rate flood
// of distinct unknown usernames can't grow it without bound.
const NEGATIVE_MAX: usize = 4096;

type ProfileKey = String;

struct CacheEntry {
    profile: Arc<UserProfile>,
    inserted_at: Instant,
    last_accessed: Instant,
}

impl CacheEntry {
    fn from_arc(profile: Arc<UserProfile>) -> Self {
        let now = Instant::now();
        Self {
            profile,
            inserted_at: now,
            last_accessed: now,
        }
    }

    #[inline]
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > CACHE_TTL
    }

    #[inline]
    fn touch(&mut self) {
        self.last_accessed = Instant::now();
    }
}

#[inline]
fn normalize_username(username: &str) -> ProfileKey {
    username.trim().to_ascii_lowercase()
}

#[derive(Default)]
struct CacheCounters {
    hits: AtomicU64,
    misses: AtomicU64,
    evictions: AtomicU64,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub size: usize,
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
}

#[derive(Clone)]
pub struct ProfileCache {
    entries: Arc<DashMap<ProfileKey, CacheEntry>>,
    inflight: Arc<DashMap<ProfileKey, Arc<Mutex<()>>>>,
    negative: Arc<DashMap<ProfileKey, Instant>>,
    /// Bumped on every invalidation. A loader snapshots it before fetching and
    /// skips writing its result if it changed mid-flight, so an invalidation
    /// racing an in-flight load isn't silently overwritten by stale data.
    generation: Arc<AtomicU64>,
    counters: Arc<CacheCounters>,
}

/// RAII cleanup for an `inflight` entry. Removal is conditional on `Arc::ptr_eq`
/// so a late drop cannot clobber a *new* entry inserted by a later caller for
/// the same key.
struct InflightGuard {
    key: ProfileKey,
    mutex: Arc<Mutex<()>>,
    inflight: Arc<DashMap<ProfileKey, Arc<Mutex<()>>>>,
}

impl Drop for InflightGuard {
    fn drop(&mut self) {
        let expected = &self.mutex;
        self.inflight
            .remove_if(&self.key, |_, v| Arc::ptr_eq(v, expected));
    }
}

impl ProfileCache {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(DashMap::with_capacity(1024)),
            inflight: Arc::new(DashMap::with_capacity(256)),
            negative: Arc::new(DashMap::with_capacity(256)),
            generation: Arc::new(AtomicU64::new(0)),
            counters: Arc::new(CacheCounters::default()),
        }
    }

    #[allow(dead_code)]
    pub fn get(&self, username: &str) -> Option<Arc<UserProfile>> {
        let key = normalize_username(username);
        self.get_by_key(&key)
    }

    pub fn get_by_key(&self, key: &str) -> Option<Arc<UserProfile>> {
        if let Some(mut entry) = self.entries.get_mut(key) {
            if entry.is_expired() {
                drop(entry);
                if self.entries.remove(key).is_some() {
                    self.counters.evictions.fetch_add(1, Ordering::Relaxed);
                }
                self.counters.misses.fetch_add(1, Ordering::Relaxed);
                return None;
            }

            entry.touch();
            self.counters.hits.fetch_add(1, Ordering::Relaxed);
            return Some(Arc::clone(&entry.profile));
        }

        self.counters.misses.fetch_add(1, Ordering::Relaxed);
        None
    }

    #[allow(dead_code)]
    pub fn set(&self, username: &str, profile: UserProfile) {
        let key = normalize_username(username);
        self.set_by_key(key, profile);
    }

    #[allow(dead_code)]
    pub fn set_by_key(&self, key: ProfileKey, profile: UserProfile) {
        self.insert_arc(key, Arc::new(profile));
    }

    fn insert_arc(&self, key: ProfileKey, profile: Arc<UserProfile>) {
        if self.entries.len() >= CACHE_MAX_SIZE {
            self.evict_lru(EVICTION_BATCH);
        }
        self.entries.insert(key, CacheEntry::from_arc(profile));
    }

    /// Fast path on hit; on miss, acquires a per-key lock so concurrent
    /// callers for the same key share a single `loader` invocation.
    pub async fn get_or_load<F, Fut>(&self, username: &str, loader: F) -> Option<Arc<UserProfile>>
    where
        F: FnOnce(ProfileKey) -> Fut,
        Fut: Future<Output = Option<UserProfile>>,
    {
        let key = normalize_username(username);

        if let Some(profile) = self.get_by_key(&key) {
            return Some(profile);
        }

        if self.is_negative_cached(&key) {
            return None;
        }

        let lock = self
            .inflight
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone();

        // Guard is declared *before* awaiting the lock so a cancellation at
        // the lock-wait still clears the inflight entry. Drop order is LIFO,
        // so `_lock_guard` releases the mutex first (waking waiters to observe
        // a populated cache), then `_inflight_guard` clears the coordination.
        let _inflight_guard = InflightGuard {
            key: key.clone(),
            mutex: Arc::clone(&lock),
            inflight: Arc::clone(&self.inflight),
        };
        let _lock_guard = lock.lock().await;

        // Another caller may have populated the cache while we waited.
        if let Some(profile) = self.get_by_key(&key) {
            return Some(profile);
        }

        // Snapshot the invalidation generation before loading. If an
        // invalidation lands while `loader` is in flight, we must not write the
        // now-stale result back into the cache.
        let generation = self.generation.load(Ordering::Relaxed);

        // We are the loader. Populate cache *before* returning so late-arriving
        // fast-path readers see the hit even before the guard clears inflight.
        match loader(key.clone()).await {
            Some(profile) => {
                let arc = Arc::new(profile);
                if self.generation.load(Ordering::Relaxed) == generation {
                    self.negative.remove(&key);
                    self.insert_arc(key, Arc::clone(&arc));
                }
                Some(arc)
            }
            None => {
                if self.generation.load(Ordering::Relaxed) == generation {
                    self.insert_negative(key);
                }
                None
            }
        }
    }

    fn insert_negative(&self, key: ProfileKey) {
        // Bound growth between background sweeps: once over the cap, drop expired
        // tombstones before inserting the new one.
        if self.negative.len() >= NEGATIVE_MAX {
            self.negative.retain(|_, at| at.elapsed() <= NEGATIVE_TTL);
        }
        self.negative.insert(key, Instant::now());
    }

    fn is_negative_cached(&self, key: &str) -> bool {
        if let Some(at) = self.negative.get(key) {
            if at.elapsed() <= NEGATIVE_TTL {
                return true;
            }
            drop(at);
            self.negative.remove(key);
        }
        false
    }

    #[allow(dead_code)]
    pub fn invalidate(&self, username: &str) {
        let key = normalize_username(username);
        self.invalidate_by_key(&key);
    }

    #[allow(dead_code)]
    pub fn invalidate_by_key(&self, key: &str) {
        // Bump first so a loader that reads the generation after this point
        // observes the change and declines to write its now-stale result.
        self.generation.fetch_add(1, Ordering::Relaxed);
        self.entries.remove(key);
        self.negative.remove(key);
    }

    #[allow(dead_code)]
    pub fn clear(&self) {
        self.entries.clear();
    }

    #[allow(dead_code)]
    pub fn size(&self) -> usize {
        self.entries.len()
    }

    #[allow(dead_code)]
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.entries.len(),
            hits: self.counters.hits.load(Ordering::Relaxed),
            misses: self.counters.misses.load(Ordering::Relaxed),
            evictions: self.counters.evictions.load(Ordering::Relaxed),
        }
    }

    pub async fn run_cleanup_task(self) {
        tracing::info!("Starting profile cache cleanup task");
        let mut interval = tokio::time::interval(CLEANUP_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            self.cleanup_expired();

            let len = self.entries.len();
            if len > CACHE_MAX_SIZE {
                self.evict_lru(len - CACHE_MAX_SIZE);
            }

            tracing::debug!(
                cache_size = self.entries.len(),
                inflight_size = self.inflight.len(),
                "profile cache cleanup tick"
            );
        }
    }

    fn cleanup_expired(&self) {
        let expired: Vec<ProfileKey> = self
            .entries
            .iter()
            .filter_map(|entry| {
                if entry.value().is_expired() {
                    Some(entry.key().clone())
                } else {
                    None
                }
            })
            .collect();

        let mut removed: u64 = 0;
        for key in expired {
            if self.entries.remove(&key).is_some() {
                removed += 1;
            }
        }

        if removed > 0 {
            self.counters
                .evictions
                .fetch_add(removed, Ordering::Relaxed);
            tracing::debug!(removed, "cleaned expired profile cache entries");
        }

        self.negative.retain(|_, at| at.elapsed() <= NEGATIVE_TTL);
    }

    fn evict_lru(&self, count: usize) {
        if count == 0 || self.entries.is_empty() {
            return;
        }

        let mut entries: Vec<_> = self
            .entries
            .iter()
            .map(|e| (e.key().clone(), e.value().last_accessed))
            .collect();

        let target = count.min(entries.len());
        if target < entries.len() {
            // Partition around the target position — O(n) vs sort's O(n log n).
            entries.select_nth_unstable_by_key(target - 1, |(_, accessed)| *accessed);
            entries.truncate(target);
        }

        let mut removed: u64 = 0;
        for (key, _) in entries {
            if self.entries.remove(&key).is_some() {
                removed += 1;
            }
        }

        if removed > 0 {
            self.counters
                .evictions
                .fetch_add(removed, Ordering::Relaxed);
            tracing::debug!(removed, "evicted profile cache entries");
        }
    }
}

impl Default for ProfileCache {
    fn default() -> Self {
        Self::new()
    }
}

static PROFILE_CACHE: std::sync::OnceLock<ProfileCache> = std::sync::OnceLock::new();

/// Initialize the global profile cache (idempotent).
pub fn init_profile_cache() -> ProfileCache {
    PROFILE_CACHE.get_or_init(ProfileCache::new).clone()
}

/// Get the global profile cache handle if it has been initialized.
pub fn get_profile_cache() -> Option<ProfileCache> {
    PROFILE_CACHE.get().cloned()
}
