//! Shared data layer — jedi PgCluster (pooled Postgres) + KvCache (Valkey).
//! Both pull config from env (see kube manifests) and degrade gracefully when
//! unconfigured so the game server still boots. Getters are the access points
//! for persistence systems wired in later.

mod kv_cache;
mod pg_cluster;

#[allow(unused_imports)]
pub use kv_cache::{get_kv_cache, init_kv_cache, load_persisted_env, save_persisted_env};
#[allow(unused_imports)]
pub use pg_cluster::{get_pg_cluster, init_pg_cluster};
