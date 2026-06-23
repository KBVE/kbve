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

#[allow(dead_code)]
pub fn get_kv_cache() -> Option<&'static Arc<KvCache>> {
    KV_CACHE.get()
}

/// Load the durable placed-env snapshot for a world. Empty when Valkey is
/// unconfigured, the key is unset, or the stored JSON fails to parse.
pub async fn load_persisted_env(key: &str) -> Vec<simgrid::PersistedEnvObject> {
    let Some(kv) = get_kv_cache() else {
        return Vec::new();
    };
    kv.kv_get_str(key)
        .await
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Overwrite the durable placed-env snapshot for a world. Best-effort: logs and
/// returns on serialize or write failure (the next change re-attempts).
pub async fn save_persisted_env(key: &str, objects: &[simgrid::PersistedEnvObject]) {
    let Some(kv) = get_kv_cache() else {
        return;
    };
    match serde_json::to_string(objects) {
        Ok(json) => {
            if kv.kv_set_str(key, &json).await.is_none() {
                tracing::warn!(key, "failed to persist env objects to Valkey");
            }
        }
        Err(e) => tracing::warn!(error = %e, "failed to serialize env objects"),
    }
}
