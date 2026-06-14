//! Shared data layer — jedi PgCluster (pooled Postgres) + KvCache (Valkey).
//! Both pull config from env (see kube manifests) and degrade gracefully when
//! unconfigured so the website still boots.

mod kv_cache;
mod pg_cluster;

#[allow(unused_imports)]
pub use kv_cache::{get_kv_cache, init_kv_cache};
#[allow(unused_imports)]
pub use pg_cluster::{get_pg_cluster, init_pg_cluster};
