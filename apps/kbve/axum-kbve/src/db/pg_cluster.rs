use std::sync::Arc;

use jedi::state::pg::PgCluster;
use tokio::sync::OnceCell;

static PG_CLUSTER: OnceCell<Option<Arc<PgCluster>>> = OnceCell::const_new();

pub async fn init_pg_cluster() -> bool {
    PG_CLUSTER
        .get_or_init(|| async {
            match PgCluster::from_env().await {
                Ok(cluster) => {
                    tracing::info!("PgCluster initialized");
                    Some(cluster)
                }
                Err(e) => {
                    tracing::warn!(
                        error = %e,
                        "PgCluster disabled: failed to build pools"
                    );
                    None
                }
            }
        })
        .await
        .is_some()
}

pub fn get_pg_cluster() -> Option<&'static Arc<PgCluster>> {
    PG_CLUSTER.get().and_then(|c| c.as_ref())
}
