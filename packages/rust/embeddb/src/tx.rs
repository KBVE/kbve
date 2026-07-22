use crate::Result;

pub struct EmbedTx<'a> {
    tx: turso::transaction::Transaction<'a>,
}

impl<'a> EmbedTx<'a> {
    pub(crate) fn new(tx: turso::transaction::Transaction<'a>) -> Self {
        EmbedTx { tx }
    }

    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
        let affected = self.tx.execute(sql, params).await?;
        Ok(affected)
    }

    pub async fn commit(self) -> Result<()> {
        self.tx.commit().await?;
        Ok(())
    }

    pub async fn rollback(self) -> Result<()> {
        self.tx.rollback().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::EmbedDb;

    async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)", ())
            .await
            .unwrap();
        (dir, db)
    }

    #[tokio::test]
    async fn execute_returns_affected_rows() {
        let (_d, db) = open("tx_affected.db").await;
        let tx = db.begin().await.unwrap();
        assert_eq!(
            tx.execute("INSERT INTO t VALUES (?)", (1_i64,))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            tx.execute("INSERT INTO t VALUES (?)", (2_i64,))
                .await
                .unwrap(),
            1
        );
        assert_eq!(tx.execute("DELETE FROM t", ()).await.unwrap(), 2);
        tx.commit().await.unwrap();
    }

    #[tokio::test]
    async fn commit_persists_writes() {
        let (_d, db) = open("tx_commit.db").await;
        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (1_i64,))
            .await
            .unwrap();
        tx.commit().await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(
            db.analytics_scalar_i64("SELECT count(*) FROM t")
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn rollback_discards_writes() {
        let (_d, db) = open("tx_rollback.db").await;
        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (7_i64,))
            .await
            .unwrap();
        tx.rollback().await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(
            db.analytics_scalar_i64("SELECT count(*) FROM t")
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn execute_error_propagates_within_tx() {
        let (_d, db) = open("tx_err.db").await;
        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (1_i64,))
            .await
            .unwrap();
        assert!(
            tx.execute("INSERT INTO t VALUES (?)", (1_i64,))
                .await
                .is_err()
        );
        tx.rollback().await.unwrap();
    }
}
