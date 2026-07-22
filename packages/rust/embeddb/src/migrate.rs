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
        if let Err(e) = tx
            .execute(
                "INSERT INTO _embeddb_migrations (version, applied_at) VALUES (?, datetime('now'))",
                (version,),
            )
            .await
        {
            tx.rollback().await.ok();
            return Err(e);
        }
        tx.commit().await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::EmbedDb;

    async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
        (dir, db)
    }

    #[tokio::test]
    async fn empty_migrations_is_noop_but_creates_ledger() {
        let (_d, db) = open("mig_empty.db").await;
        db.migrate(&[]).await.unwrap();
        assert_eq!(db.max_migration_version().await.unwrap(), -1);
    }

    #[tokio::test]
    async fn version_advances_with_each_migration() {
        let (_d, db) = open("mig_ver.db").await;
        db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
        assert_eq!(db.max_migration_version().await.unwrap(), 0);
        db.migrate(&["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"])
            .await
            .unwrap();
        assert_eq!(db.max_migration_version().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn rerun_same_set_keeps_version_stable() {
        let (_d, db) = open("mig_stable.db").await;
        let m = ["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"];
        db.migrate(&m).await.unwrap();
        db.migrate(&m).await.unwrap();
        db.migrate(&m).await.unwrap();
        assert_eq!(db.max_migration_version().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn ledger_records_applied_at() {
        let (_d, db) = open("mig_applied_at.db").await;
        db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
        db.checkpoint().await.unwrap();
        let n = db
            .analytics_scalar_i64(
                "SELECT count(*) FROM _embeddb_migrations WHERE applied_at IS NOT NULL",
            )
            .await
            .unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn failed_migration_leaves_version_unchanged() {
        let (_d, db) = open("mig_fail.db").await;
        db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
        assert_eq!(db.max_migration_version().await.unwrap(), 0);
        let res = db
            .migrate(&["CREATE TABLE a (id INTEGER)", "NOT VALID SQL"])
            .await;
        assert!(res.is_err());
        assert_eq!(db.max_migration_version().await.unwrap(), 0);
    }
}
