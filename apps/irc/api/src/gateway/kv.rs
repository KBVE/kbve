//! Shared Valkey handle (jedi KvCache) for the gateway. Used by the anti-spam
//! limiter so rate counters are shared across gateway replicas and with other
//! services (discordsh) that point at the same KBVE_KV_URL. Non-fatal: if
//! Valkey is unconfigured the limiter falls back to its in-process window.

use std::sync::Arc;

use jedi::state::kv::KvCache;
use tokio::sync::OnceCell;

static KV: OnceCell<Arc<KvCache>> = OnceCell::const_new();

/// Build the KvCache from env (KBVE_KV_URL / KBVE_KV_*). Idempotent.
pub async fn init() -> bool {
    let cache = KvCache::from_env().await;
    KV.set(cache).is_ok()
}

pub fn get() -> Option<&'static Arc<KvCache>> {
    KV.get()
}
