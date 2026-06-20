use std::collections::HashMap;

use tokio_postgres::error::SqlState;

use crate::state::pg::PgCluster;

const SCHEMA: &str = "forgejo";
const TABLE: &str = "repository";
const REQUIRED_COLUMNS: &[&str] = &["id", "size", "git_size", "lfs_size"];

#[derive(Debug, Clone)]
pub enum ForgejoStorageError {
    SchemaDrift { missing: Vec<String> },
    AccessDenied,
    Db(String),
}

impl std::fmt::Display for ForgejoStorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ForgejoStorageError::SchemaDrift { missing } => write!(
                f,
                "forgejo.{TABLE} schema drift — missing/renamed columns: {}",
                missing.join(", ")
            ),
            ForgejoStorageError::AccessDenied => write!(
                f,
                "no privilege to read forgejo.{TABLE} — grant SELECT to the app role"
            ),
            ForgejoStorageError::Db(e) => write!(f, "forgejo storage query failed: {e}"),
        }
    }
}

impl std::error::Error for ForgejoStorageError {}

fn classify(err: &tokio_postgres::Error) -> ForgejoStorageError {
    match err.code() {
        Some(c) if *c == SqlState::UNDEFINED_COLUMN || *c == SqlState::UNDEFINED_TABLE => {
            ForgejoStorageError::SchemaDrift {
                missing: vec![format!(
                    "{}",
                    err.as_db_error().map(|e| e.message()).unwrap_or("?")
                )],
            }
        }
        Some(c) if *c == SqlState::INSUFFICIENT_PRIVILEGE => ForgejoStorageError::AccessDenied,
        _ => ForgejoStorageError::Db(err.to_string()),
    }
}

/// Probes `information_schema` for the columns this layer depends on. Returns
/// `SchemaDrift` listing exactly what is missing so a Forgejo upgrade that
/// renames a column fails loud and catchable instead of silently feeding zeros.
pub async fn verify_schema(cluster: &PgCluster) -> Result<(), ForgejoStorageError> {
    let conn = cluster
        .read()
        .await
        .map_err(|e| ForgejoStorageError::Db(e.to_string()))?;
    let rows = conn
        .query(
            "SELECT column_name FROM information_schema.columns \
             WHERE table_schema = $1 AND table_name = $2",
            &[&SCHEMA, &TABLE],
        )
        .await
        .map_err(|e| classify(&e))?;

    let present: std::collections::HashSet<String> =
        rows.iter().map(|r| r.get::<_, String>(0)).collect();
    let missing: Vec<String> = REQUIRED_COLUMNS
        .iter()
        .filter(|c| !present.contains(**c))
        .map(|c| c.to_string())
        .collect();

    if present.is_empty() {
        return Err(ForgejoStorageError::AccessDenied);
    }
    if !missing.is_empty() {
        return Err(ForgejoStorageError::SchemaDrift { missing });
    }
    Ok(())
}

/// Per-repo git and LFS size in KB, keyed by Forgejo repo id. Forgejo's REST
/// API only exposes the combined `size`; the git/LFS split lives only in this
/// table. Sizes are stored in bytes, normalised to KB to match the REST units.
pub async fn repo_storage(
    cluster: &PgCluster,
    repo_ids: &[i64],
) -> Result<HashMap<i64, (u64, u64)>, ForgejoStorageError> {
    if repo_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let conn = cluster
        .read()
        .await
        .map_err(|e| ForgejoStorageError::Db(e.to_string()))?;
    let rows = conn
        .query(
            "SELECT id, git_size / 1024, lfs_size / 1024 \
             FROM forgejo.repository WHERE id = ANY($1)",
            &[&repo_ids],
        )
        .await
        .map_err(|e| classify(&e))?;

    let mut out = HashMap::with_capacity(rows.len());
    for row in &rows {
        let id: i64 = row.get(0);
        let git_kb: i64 = row.get(1);
        let lfs_kb: i64 = row.get(2);
        out.insert(id, (git_kb.max(0) as u64, lfs_kb.max(0) as u64));
    }
    Ok(out)
}
