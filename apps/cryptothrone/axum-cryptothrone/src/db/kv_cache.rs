use std::sync::Arc;

use jedi::state::kv::KvCache;
use tokio::sync::OnceCell;

static KV_CACHE: OnceCell<Arc<KvCache>> = OnceCell::const_new();

/// Build the two-tier KvCache (L1 LRU + L2 Valkey) from env. L2 is best-effort:
/// if Valkey is unreachable the cache still serves from L1. Idempotent.
pub async fn init_kv_cache() -> bool {
    let cache = KvCache::from_env().await;
    KV_CACHE.set(cache).is_ok()
}

pub fn get_kv_cache() -> Option<&'static Arc<KvCache>> {
    KV_CACHE.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn init_populates_l1_and_get_reflects_it() {
        // KvCache always builds (L1 LRU works without Valkey), so init succeeds
        // and the getter then resolves the shared handle.
        let ok = init_kv_cache().await;
        assert!(ok, "KvCache L1 should always initialize");
        assert!(get_kv_cache().is_some());
    }
}
