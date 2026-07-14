use std::sync::Arc;

use jedi::state::pg::PgCluster;
use tokio::sync::OnceCell;

static PG_CLUSTER: OnceCell<Option<Arc<PgCluster>>> = OnceCell::const_new();

/// Build the shared PgCluster (RW/RO/ANY pools) from env. Non-fatal: if the
/// pools can't be built the service still boots and PgCluster-backed routes
/// degrade. Idempotent via OnceCell.
pub async fn init_pg_cluster() -> bool {
    PG_CLUSTER
        .get_or_init(|| async {
            match PgCluster::from_env().await {
                Ok(cluster) => {
                    tracing::info!("PgCluster initialized");
                    Some(cluster)
                }
                Err(e) => {
                    tracing::warn!(error = %e, "PgCluster disabled: failed to build pools");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn init_is_idempotent_and_getter_tracks_state() {
        // No KBVE_PG_* in the test env -> pools fail to build -> disabled. The
        // getter must agree with init, and a second init is a no-op (OnceCell).
        let enabled = init_pg_cluster().await;
        assert_eq!(get_pg_cluster().is_some(), enabled);
        assert_eq!(init_pg_cluster().await, enabled, "init is idempotent");
    }
}
