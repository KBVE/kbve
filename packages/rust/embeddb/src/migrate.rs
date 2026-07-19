use crate::{EmbedDb, Result};

pub(crate) async fn run(db: &EmbedDb, migrations: &[&str]) -> Result<()> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS _embeddb_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)",
        (),
    ).await?;
    let applied = db.max_migration_version().await?;
    for (i, sql) in migrations.iter().enumerate() {
        let version = i as i64;
        if version <= applied {
            continue;
        }
        let tx = db.begin().await?;
        if let Err(e) = tx.execute(sql, ()).await {
            tx.rollback().await.ok();
            return Err(e);
        }
        if let Err(e) = tx.execute(
            "INSERT INTO _embeddb_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (version,),
        ).await {
            tx.rollback().await.ok();
            return Err(e);
        }
        tx.commit().await?;
    }
    Ok(())
}
