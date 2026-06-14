use std::sync::Arc;

use jedi::state::kv::KvCache;
use tokio::sync::OnceCell;

static KV_CACHE: OnceCell<Arc<KvCache>> = OnceCell::const_new();

pub async fn init_kv_cache() -> bool {
    let cache = KvCache::from_env().await;
    KV_CACHE.set(cache).is_ok()
}

pub fn get_kv_cache() -> Option<&'static Arc<KvCache>> {
    KV_CACHE.get()
}
