//! KvCache — two-tier read-through cache, Valkey-backed L2.
//!
//! Slots into the read fallback chain:
//!
//! ```text
//! L1 in-process LRU  →  L2 Valkey (shared)  →  caller fetch fn (PgCluster read)
//! ```
//!
//! Misses propagate down; populates fire up. L2 errors are swallowed
//! (best-effort cache; Valkey being sick must never fail the request).
//!
//! Single-flight stampede protection via `DashMap<key, broadcast::Sender>`
//! so on a hot-key miss only one task hits the fetch fn; the rest park
//! on the broadcast.
//!
//! Environment:
//!
//!   - `KBVE_KV_NAMESPACE`         (default `"kbve:cache"`)
//!   - `KBVE_KV_L1_CAPACITY`       (default 1024 entries)
//!   - `KBVE_KV_L1_TTL_MS`         (default 500ms)
//!   - `KBVE_KV_L2_TTL_S`          (default 5s)
//!   - `KBVE_KV_L2_ENABLED`        (default `true`)

use std::{
    num::NonZeroUsize,
    sync::Arc,
    time::{Duration, Instant},
};

use dashmap::{DashMap, mapref::entry::Entry};
use fred::clients::Pool as ValkeyPool;
use fred::prelude::*;
use fred::types::Expiration;
use lru::LruCache;
use serde::{Serialize, de::DeserializeOwned};
use tokio::sync::{Mutex, broadcast};

use crate::entity::error::JediError;

/// Hard ceiling on a single L2 (Valkey) op. Valkey normally answers in <10ms;
/// this only trips when a connection is stale/blocked, in which case the cache
/// degrades to a miss rather than hanging the request.
const L2_OP_TIMEOUT: Duration = Duration::from_millis(250);

#[derive(Debug, Clone)]
pub struct KvCacheConfig {
    pub namespace: String,
    pub l1_capacity: NonZeroUsize,
    pub l1_default_ttl: Duration,
    pub l2_default_ttl: Duration,
    pub l2_enabled: bool,
}

impl KvCacheConfig {
    pub fn from_env() -> Self {
        let namespace =
            std::env::var("KBVE_KV_NAMESPACE").unwrap_or_else(|_| "kbve:cache".to_string());
        let l1_capacity =
            NonZeroUsize::new(parse_env::<usize>("KBVE_KV_L1_CAPACITY").unwrap_or(1024))
                .unwrap_or(NonZeroUsize::new(1024).expect("static 1024"));
        let l1_default_ttl =
            Duration::from_millis(parse_env::<u64>("KBVE_KV_L1_TTL_MS").unwrap_or(500));
        let l2_default_ttl = Duration::from_secs(parse_env::<u64>("KBVE_KV_L2_TTL_S").unwrap_or(5));
        let l2_enabled = parse_bool_env("KBVE_KV_L2_ENABLED").unwrap_or(true);
        Self {
            namespace,
            l1_capacity,
            l1_default_ttl,
            l2_default_ttl,
            l2_enabled,
        }
    }
}

struct L1Entry {
    body: Arc<[u8]>,
    tags: Arc<[Arc<str>]>,
    expires_at: Instant,
}

pub struct KvCache {
    cfg: KvCacheConfig,
    l1: Mutex<LruCache<String, L1Entry>>,
    l2: Option<ValkeyPool>,
    #[allow(clippy::type_complexity)]
    inflight: DashMap<String, broadcast::Sender<Result<Arc<[u8]>, String>>>,
    /// `tag → set<qualified_key>` reverse index for L1 invalidation.
    /// L2 mirrors this in `<namespace>:tag:<tag>` Redis SETs.
    tag_index: DashMap<Arc<str>, dashmap::DashSet<Arc<str>>>,
}

impl KvCache {
    pub fn new(cfg: KvCacheConfig, l2: Option<ValkeyPool>) -> Arc<Self> {
        let l2 = if cfg.l2_enabled { l2 } else { None };
        let l1 = Mutex::new(LruCache::new(cfg.l1_capacity));
        Arc::new(Self {
            cfg,
            l1,
            l2,
            inflight: DashMap::new(),
            tag_index: DashMap::new(),
        })
    }

    /// Construct from env. Builds a fred pool against
    /// `KBVE_KV_URL` / `REDIS_URL` (size `KBVE_KV_POOL_SIZE`,
    /// default 4) when `KBVE_KV_L2_ENABLED` is on. On pool build
    /// failure the cache stays L1-only and a warning is logged.
    pub async fn from_env() -> Arc<Self> {
        let cfg = KvCacheConfig::from_env();
        let l2 = if cfg.l2_enabled {
            match build_valkey_pool().await {
                Ok(p) => Some(p),
                Err(e) => {
                    tracing::warn!(error = %e, "[KvCache] L2 disabled: Valkey pool build failed");
                    None
                }
            }
        } else {
            None
        };
        Self::new(cfg, l2)
    }

    pub fn config(&self) -> &KvCacheConfig {
        &self.cfg
    }

    pub async fn get_or_fetch_json<T, F, Fut>(
        &self,
        key: &str,
        ttl: Option<Duration>,
        fetch: F,
    ) -> Result<T, JediError>
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnOnce() -> Fut + Send,
        Fut: std::future::Future<Output = Result<T, JediError>> + Send,
    {
        self.get_or_fetch_json_tagged(key, ttl, fetch, |_| Vec::new())
            .await
    }

    /// Same as [`get_or_fetch_json`] but the caller supplies a closure
    /// that derives a tag list from the fetched value. Tags are
    /// registered alongside the cached body so a later
    /// [`KvCache::invalidate_tag`] can purge every key carrying the
    /// tag — useful when writes are keyed differently from reads
    /// (e.g. `service/credit` knows the `account_id` while
    /// `/me/balance` is keyed by `user_id`).
    pub async fn get_or_fetch_json_tagged<T, F, Fut, TagFn>(
        &self,
        key: &str,
        ttl: Option<Duration>,
        fetch: F,
        tag_fn: TagFn,
    ) -> Result<T, JediError>
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnOnce() -> Fut + Send,
        Fut: std::future::Future<Output = Result<T, JediError>> + Send,
        TagFn: FnOnce(&T) -> Vec<String> + Send,
    {
        let qualified = self.qualified(key);
        let l1_ttl = ttl.unwrap_or(self.cfg.l1_default_ttl);
        let l2_ttl = ttl.unwrap_or(self.cfg.l2_default_ttl);

        if let Some(bytes) = self.l1_get(&qualified).await {
            metrics_inc("kbve_kv_l1_hit");
            return serde_json::from_slice(&bytes).map_err(json_err);
        }
        metrics_inc("kbve_kv_l1_miss");

        if let Some(bytes) = self.l2_get(&qualified).await {
            metrics_inc("kbve_kv_l2_hit");
            let arc: Arc<[u8]> = Arc::from(bytes.into_boxed_slice());
            self.l1_put(qualified.clone(), Arc::clone(&arc), Vec::new(), l1_ttl)
                .await;
            return serde_json::from_slice(&arc).map_err(json_err);
        }
        metrics_inc("kbve_kv_l2_miss");

        let bytes = self
            .single_flight(&qualified, fetch, tag_fn, l1_ttl, l2_ttl)
            .await?;
        serde_json::from_slice(&bytes).map_err(json_err)
    }

    async fn single_flight<T, F, Fut, TagFn>(
        &self,
        qualified: &str,
        fetch: F,
        tag_fn: TagFn,
        l1_ttl: Duration,
        l2_ttl: Duration,
    ) -> Result<Arc<[u8]>, JediError>
    where
        T: Serialize + Send,
        F: FnOnce() -> Fut + Send,
        Fut: std::future::Future<Output = Result<T, JediError>> + Send,
        TagFn: FnOnce(&T) -> Vec<String> + Send,
    {
        let receiver = match self.inflight.entry(qualified.to_string()) {
            Entry::Occupied(o) => {
                metrics_inc("kbve_kv_inflight_share");
                Some(o.get().subscribe())
            }
            Entry::Vacant(v) => {
                let (tx, _rx) = broadcast::channel(1);
                v.insert(tx);
                None
            }
        };

        if let Some(mut rx) = receiver {
            return match rx.recv().await {
                Ok(Ok(bytes)) => Ok(bytes),
                Ok(Err(s)) => Err(JediError::Internal(
                    format!("kv single-flight upstream: {s}").into(),
                )),
                Err(_) => Err(JediError::Internal(
                    "kv single-flight channel closed".into(),
                )),
            };
        }

        let outcome = fetch().await;
        let (bytes, tags, err_str): (Option<Arc<[u8]>>, Vec<String>, Option<String>) =
            match &outcome {
                Ok(v) => match serde_json::to_vec(v) {
                    Ok(b) => (Some(Arc::from(b.into_boxed_slice())), tag_fn(v), None),
                    Err(e) => (None, Vec::new(), Some(format!("kv encode: {e}"))),
                },
                Err(e) => (None, Vec::new(), Some(e.to_string())),
            };

        if let Some((_, tx)) = self.inflight.remove(qualified) {
            let payload = match (&bytes, &err_str) {
                (Some(b), _) => Ok(Arc::clone(b)),
                (_, Some(s)) => Err(s.clone()),
                _ => Err("kv: empty outcome".to_string()),
            };
            let _ = tx.send(payload);
        }

        outcome?;
        let bytes = bytes.ok_or_else(|| {
            JediError::Internal(err_str.unwrap_or_else(|| "kv: missing body".into()).into())
        })?;

        self.l1_put(
            qualified.to_string(),
            Arc::clone(&bytes),
            tags.clone(),
            l1_ttl,
        )
        .await;
        self.l2_put(qualified, bytes.as_ref(), &tags, l2_ttl).await;

        Ok(bytes)
    }

    pub async fn invalidate(&self, key: &str) -> Result<(), JediError> {
        let q = self.qualified(key);
        let tags = self.l1_pop(&q).await;
        self.tag_index_remove_key(&q, &tags);
        if let Some(pool) = &self.l2 {
            let _: Result<i64, _> = pool.del(&*q).await;
        }
        Ok(())
    }

    pub async fn invalidate_prefix(&self, prefix: &str) -> Result<(), JediError> {
        let q = self.qualified(prefix);
        let victims: Vec<(String, Arc<[Arc<str>]>)> = {
            let mut l1 = self.l1.lock().await;
            let keys: Vec<String> = l1
                .iter()
                .filter_map(|(k, _)| {
                    if k.starts_with(&q) {
                        Some(k.clone())
                    } else {
                        None
                    }
                })
                .collect();
            keys.into_iter()
                .filter_map(|k| {
                    let entry = l1.pop(&k)?;
                    Some((k, entry.tags))
                })
                .collect()
        };
        for (k, tags) in victims {
            self.tag_index_remove_key(&k, &tags);
        }
        Ok(())
    }

    /// Drop every cached entry registered under `tag` from L1 + L2.
    /// Returns the number of L1 keys purged (L2 deletes happen
    /// best-effort and may exceed the L1 count when other pods have
    /// also cached entries under the same tag).
    ///
    /// `tag` is namespaced internally — callers pass the bare tag
    /// (e.g. `"wallet:account:<uuid>"`).
    pub async fn invalidate_tag(&self, tag: &str) -> Result<usize, JediError> {
        let qualified_tag: Arc<str> = self.qualified(tag).into();

        let l1_keys: Vec<Arc<str>> = self
            .tag_index
            .remove(&qualified_tag)
            .map(|(_, set)| set.into_iter().collect())
            .unwrap_or_default();
        let l1_count = l1_keys.len();
        {
            let mut l1 = self.l1.lock().await;
            for k in &l1_keys {
                if let Some(entry) = l1.pop(&**k) {
                    let other_tags: Vec<Arc<str>> = entry
                        .tags
                        .iter()
                        .filter(|t| **t != qualified_tag)
                        .cloned()
                        .collect();
                    drop(other_tags);
                }
            }
        }

        if let Some(pool) = &self.l2 {
            let tag_set_key = self.tag_set_key(&qualified_tag);
            let members: Vec<String> = match pool.smembers::<Vec<String>, _>(&*tag_set_key).await {
                Ok(m) => m,
                Err(e) => {
                    tracing::warn!(error = %e, tag = %tag, "[KvCache] L2 SMEMBERS failed");
                    Vec::new()
                }
            };
            for m in &members {
                let _: Result<i64, _> = pool.del(m.as_str()).await;
            }
            let _: Result<i64, _> = pool.del(&*tag_set_key).await;
        }

        Ok(l1_count)
    }

    fn tag_set_key(&self, qualified_tag: &str) -> String {
        format!("{}:__tag:{qualified_tag}", self.cfg.namespace)
    }

    fn tag_index_register(&self, qualified_key: &Arc<str>, tags: &[Arc<str>]) {
        for tag in tags {
            self.tag_index
                .entry(Arc::clone(tag))
                .or_default()
                .insert(Arc::clone(qualified_key));
        }
    }

    fn tag_index_remove_key(&self, qualified_key: &str, tags: &[Arc<str>]) {
        for tag in tags {
            if let Some(set) = self.tag_index.get(tag) {
                set.remove(qualified_key);
            }
        }
    }

    fn qualified(&self, key: &str) -> String {
        format!("{}:{}", self.cfg.namespace, key)
    }

    async fn l1_get(&self, key: &str) -> Option<Arc<[u8]>> {
        let mut l1 = self.l1.lock().await;
        let body = match l1.peek(key) {
            Some(e) if e.expires_at > Instant::now() => Some(Arc::clone(&e.body)),
            Some(_) => None,
            None => return None,
        };
        if body.is_none() {
            l1.pop(key);
        }
        body
    }

    async fn l1_pop(&self, key: &str) -> Arc<[Arc<str>]> {
        match self.l1.lock().await.pop(key) {
            Some(e) => e.tags,
            None => Arc::from(Vec::<Arc<str>>::new().into_boxed_slice()),
        }
    }

    async fn l1_put(&self, key: String, body: Arc<[u8]>, tags: Vec<String>, ttl: Duration) {
        let qualified_key: Arc<str> = key.clone().into();
        let tag_arcs: Vec<Arc<str>> = tags
            .into_iter()
            .map(|t| Arc::<str>::from(self.qualified(&t).into_boxed_str()))
            .collect();
        let tag_slice: Arc<[Arc<str>]> = Arc::from(tag_arcs.clone().into_boxed_slice());
        self.tag_index_register(&qualified_key, &tag_arcs);
        let entry = L1Entry {
            body,
            tags: tag_slice,
            expires_at: Instant::now() + ttl,
        };
        self.l1.lock().await.put(key, entry);
    }

    async fn l2_get(&self, key: &str) -> Option<Vec<u8>> {
        let pool = self.l2.as_ref()?;
        // A stale/blocked Valkey connection must not hang the request — bound
        // the op so a non-responsive cache degrades to a miss (→ caller fetch).
        match tokio::time::timeout(L2_OP_TIMEOUT, pool.get::<Vec<u8>, _>(key)).await {
            Ok(Ok(b)) if !b.is_empty() => Some(b),
            Ok(_) => None,
            Err(_) => {
                metrics_inc("kbve_kv_l2_timeout");
                tracing::warn!(key = %key, "[KvCache] L2 get timed out; treating as miss");
                None
            }
        }
    }

    async fn l2_put(&self, key: &str, body: &[u8], tags: &[String], ttl: Duration) {
        let Some(pool) = &self.l2 else { return };
        let ttl_ms = ttl.as_millis() as i64;
        let set_fut =
            pool.set::<(), _, _>(key, body, Some(Expiration::PX(ttl_ms.max(1))), None, false);
        match tokio::time::timeout(L2_OP_TIMEOUT, set_fut).await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                tracing::warn!(error = %e, key = %key, "[KvCache] L2 put failed");
                return;
            }
            Err(_) => {
                metrics_inc("kbve_kv_l2_timeout");
                tracing::warn!(key = %key, "[KvCache] L2 put timed out");
                return;
            }
        }
        let set_ttl_secs = (ttl.as_secs().saturating_mul(2)).max(1);
        for tag in tags {
            let qualified_tag = self.qualified(tag);
            let tag_set_key = self.tag_set_key(&qualified_tag);
            let _: Result<i64, _> = pool.sadd(&*tag_set_key, key).await;
            let _: Result<i64, _> = pool.expire(&*tag_set_key, set_ttl_secs as i64, None).await;
        }
    }

    /// Atomic per-window counter for rate limiting, shared via valkey across
    /// every service pointed at the same `KBVE_KV_URL`. Increments the counter
    /// for `key` in the current window and returns the post-increment count, or
    /// `None` when L2 (valkey) is unavailable so callers can fall back to an
    /// in-process limiter. The key expires after `window_secs`, so the window
    /// is fixed (resets once the counter ages out).
    pub async fn check_rate(&self, key: &str, window_secs: u64) -> Option<u64> {
        let pool = self.l2.as_ref()?;
        let rkey = self.qualified(&format!("rl:{key}"));
        let count: i64 = pool.incr::<i64, _>(&rkey).await.ok()?;
        if count == 1 {
            let _ = pool.expire::<(), _>(&rkey, window_secs as i64, None).await;
        }
        Some(count.max(0) as u64)
    }

    /// Append `value` to a capped Valkey list and trim it to the newest
    /// `max_len` entries. Returns `None` when L2 (Valkey) is unavailable so the
    /// caller can fall back to in-process storage. Oldest-first ordering: read
    /// the list back with [`list_range`](Self::list_range).
    pub async fn list_push_capped(&self, key: &str, value: &str, max_len: usize) -> Option<()> {
        let pool = self.l2.as_ref()?;
        let lkey = self.qualified(key);
        let _: i64 = pool.rpush::<i64, _, _>(&lkey, value).await.ok()?;
        let _: () = pool.ltrim(&lkey, -(max_len as i64), -1).await.ok()?;
        Some(())
    }

    /// Read a Valkey list oldest-first. Returns `None` when L2 is unavailable.
    pub async fn list_range(&self, key: &str) -> Option<Vec<String>> {
        let pool = self.l2.as_ref()?;
        let lkey = self.qualified(key);
        pool.lrange::<Vec<String>, _>(&lkey, 0, -1).await.ok()
    }
}

async fn build_valkey_pool() -> Result<ValkeyPool, String> {
    let url = std::env::var("KBVE_KV_URL")
        .or_else(|_| std::env::var("REDIS_URL"))
        .map_err(|_| "KBVE_KV_URL / REDIS_URL not set".to_string())?;

    let pool_size: usize = std::env::var("KBVE_KV_POOL_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4);

    let config = Config::from_url(&url).map_err(|e| format!("invalid KV URL: {e}"))?;
    let pool = Builder::from_config(config)
        .set_policy(ReconnectPolicy::default())
        // Global ceiling on every command so a silently-broken connection
        // (e.g. after a CA rotation) can never hang a caller — fred fails the
        // command and the cache degrades to a miss. Belt to the per-op timeouts.
        .with_performance_config(|c| {
            c.default_command_timeout = Duration::from_millis(750);
        })
        .build_pool(pool_size)
        .map_err(|e| format!("KV pool build failed: {e}"))?;
    pool.init()
        .await
        .map_err(|e| format!("KV pool init failed: {e}"))?;
    Ok(pool)
}

fn json_err(e: serde_json::Error) -> JediError {
    JediError::Internal(format!("kv json: {e}").into())
}

fn parse_env<T: std::str::FromStr>(key: &str) -> Option<T> {
    std::env::var(key).ok().and_then(|s| s.trim().parse().ok())
}

fn parse_bool_env(key: &str) -> Option<bool> {
    std::env::var(key).ok().map(|v| {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

#[cfg(feature = "prometheus")]
fn metrics_inc(name: &'static str) {
    metrics::counter!(name).increment(1);
}

#[cfg(not(feature = "prometheus"))]
fn metrics_inc(_: &'static str) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn cfg() -> KvCacheConfig {
        KvCacheConfig {
            namespace: "test".into(),
            l1_capacity: NonZeroUsize::new(8).unwrap(),
            l1_default_ttl: Duration::from_secs(60),
            l2_default_ttl: Duration::from_secs(60),
            l2_enabled: false,
        }
    }

    #[tokio::test]
    async fn invalidate_tag_purges_all_keys_carrying_tag() {
        let cache = KvCache::new(cfg(), None);
        let acc_a = uuid::Uuid::new_v4();
        let acc_b = uuid::Uuid::new_v4();

        let _: u32 = cache
            .get_or_fetch_json_tagged(
                "user-1:balance",
                None,
                || async { Ok::<u32, JediError>(100) },
                |_| vec![format!("wallet:account:{acc_a}")],
            )
            .await
            .unwrap();
        let _: u32 = cache
            .get_or_fetch_json_tagged(
                "user-1:coupons",
                None,
                || async { Ok::<u32, JediError>(7) },
                |_| vec![format!("wallet:account:{acc_a}")],
            )
            .await
            .unwrap();
        let _: u32 = cache
            .get_or_fetch_json_tagged(
                "user-2:balance",
                None,
                || async { Ok::<u32, JediError>(200) },
                |_| vec![format!("wallet:account:{acc_b}")],
            )
            .await
            .unwrap();

        let purged = cache
            .invalidate_tag(&format!("wallet:account:{acc_a}"))
            .await
            .unwrap();
        assert_eq!(purged, 2, "expected both acc_a keys purged");

        let v: u32 = cache
            .get_or_fetch_json_tagged(
                "user-1:balance",
                None,
                || async { Ok::<u32, JediError>(999) },
                |_| vec![format!("wallet:account:{acc_a}")],
            )
            .await
            .unwrap();
        assert_eq!(v, 999);

        let v: u32 = cache
            .get_or_fetch_json_tagged(
                "user-2:balance",
                None,
                || async { panic!("should be cached") },
                |_| vec![format!("wallet:account:{acc_b}")],
            )
            .await
            .unwrap();
        assert_eq!(v, 200);
    }

    #[tokio::test]
    async fn invalidate_tag_with_no_members_is_noop() {
        let cache = KvCache::new(cfg(), None);
        let purged = cache.invalidate_tag("never-registered").await.unwrap();
        assert_eq!(purged, 0);
    }

    #[tokio::test]
    async fn key_with_multiple_tags_purged_on_any_tag() {
        let cache = KvCache::new(cfg(), None);
        let _: u32 = cache
            .get_or_fetch_json_tagged(
                "shared",
                None,
                || async { Ok::<u32, JediError>(42) },
                |_| vec!["tag-a".into(), "tag-b".into()],
            )
            .await
            .unwrap();

        cache.invalidate_tag("tag-b").await.unwrap();

        let v: u32 = cache
            .get_or_fetch_json_tagged(
                "shared",
                None,
                || async { Ok::<u32, JediError>(99) },
                |_| vec!["tag-a".into(), "tag-b".into()],
            )
            .await
            .unwrap();
        assert_eq!(v, 99);
    }

    #[tokio::test]
    async fn populates_l1_on_first_fetch() {
        let cache = KvCache::new(cfg(), None);
        let val: u32 = cache
            .get_or_fetch_json("k", None, || async { Ok::<u32, JediError>(42) })
            .await
            .unwrap();
        assert_eq!(val, 42);
        let val2: u32 = cache
            .get_or_fetch_json("k", None, || async { panic!("should not be called") })
            .await
            .unwrap();
        assert_eq!(val2, 42);
    }

    #[tokio::test]
    async fn invalidate_removes_l1_entry() {
        let cache = KvCache::new(cfg(), None);
        let _: u32 = cache
            .get_or_fetch_json("k", None, || async { Ok::<u32, JediError>(1) })
            .await
            .unwrap();
        cache.invalidate("k").await.unwrap();
        let v: u32 = cache
            .get_or_fetch_json("k", None, || async { Ok::<u32, JediError>(2) })
            .await
            .unwrap();
        assert_eq!(v, 2);
    }

    #[tokio::test]
    async fn invalidate_prefix_clears_matching_l1() {
        let cache = KvCache::new(cfg(), None);
        for k in ["wallet:a", "wallet:b", "market:c"] {
            let _: u32 = cache
                .get_or_fetch_json(k, None, || async { Ok::<u32, JediError>(1) })
                .await
                .unwrap();
        }
        cache.invalidate_prefix("wallet").await.unwrap();
        let v: u32 = cache
            .get_or_fetch_json("wallet:a", None, || async { Ok::<u32, JediError>(99) })
            .await
            .unwrap();
        assert_eq!(v, 99);
        let v: u32 = cache
            .get_or_fetch_json("market:c", None, || async { panic!("should be cached") })
            .await
            .unwrap();
        assert_eq!(v, 1);
    }

    #[tokio::test]
    async fn fetch_error_propagates_and_does_not_cache() {
        let cache = KvCache::new(cfg(), None);
        let r: Result<u32, _> = cache
            .get_or_fetch_json("k", None, || async {
                Err(JediError::Internal("boom".into()))
            })
            .await;
        assert!(r.is_err());
        let v: u32 = cache
            .get_or_fetch_json("k", None, || async { Ok::<u32, JediError>(7) })
            .await
            .unwrap();
        assert_eq!(v, 7);
    }

    #[test]
    #[serial]
    fn from_env_defaults() {
        unsafe {
            std::env::remove_var("KBVE_KV_NAMESPACE");
            std::env::remove_var("KBVE_KV_L1_CAPACITY");
            std::env::remove_var("KBVE_KV_L1_TTL_MS");
            std::env::remove_var("KBVE_KV_L2_TTL_S");
            std::env::remove_var("KBVE_KV_L2_ENABLED");
        }
        let c = KvCacheConfig::from_env();
        assert_eq!(c.namespace, "kbve:cache");
        assert_eq!(c.l1_capacity.get(), 1024);
        assert_eq!(c.l1_default_ttl, Duration::from_millis(500));
        assert_eq!(c.l2_default_ttl, Duration::from_secs(5));
        assert!(c.l2_enabled);
    }

    #[test]
    #[serial]
    fn from_env_overrides_apply() {
        unsafe {
            std::env::set_var("KBVE_KV_NAMESPACE", "custom");
            std::env::set_var("KBVE_KV_L1_CAPACITY", "256");
            std::env::set_var("KBVE_KV_L1_TTL_MS", "1500");
            std::env::set_var("KBVE_KV_L2_TTL_S", "30");
            std::env::set_var("KBVE_KV_L2_ENABLED", "false");
        }
        let c = KvCacheConfig::from_env();
        assert_eq!(c.namespace, "custom");
        assert_eq!(c.l1_capacity.get(), 256);
        assert_eq!(c.l1_default_ttl, Duration::from_millis(1500));
        assert_eq!(c.l2_default_ttl, Duration::from_secs(30));
        assert!(!c.l2_enabled);
        unsafe {
            std::env::remove_var("KBVE_KV_NAMESPACE");
            std::env::remove_var("KBVE_KV_L1_CAPACITY");
            std::env::remove_var("KBVE_KV_L1_TTL_MS");
            std::env::remove_var("KBVE_KV_L2_TTL_S");
            std::env::remove_var("KBVE_KV_L2_ENABLED");
        }
    }
}
