use jedi::state::pg::PgCluster;
use std::sync::Arc;

pub type Pg = Arc<PgCluster>;

pub async fn connect() -> anyhow::Result<Pg> {
    let cluster = PgCluster::from_env()
        .await
        .map_err(|e| anyhow::anyhow!("PgCluster init failed: {e}"))?;
    Ok(cluster)
}
