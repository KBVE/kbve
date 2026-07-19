use std::path::{Path, PathBuf};
use crate::Result;

pub struct EmbedDb {
    path: PathBuf,
    conn: turso::Connection,
}

impl EmbedDb {
    pub async fn open(path: impl AsRef<Path>) -> Result<EmbedDb> {
        let path = path.as_ref().to_path_buf();
        let db = turso::Builder::new_local(path.to_str().unwrap())
            .build()
            .await?;
        let conn = db.connect()?;
        conn.execute("PRAGMA journal_mode=WAL", ()).await.ok();
        Ok(EmbedDb { path, conn })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
        let affected = self.conn.execute(sql, params).await?;
        Ok(affected)
    }

    pub async fn checkpoint(&self) -> Result<()> {
        let mut rows = self.conn.query("PRAGMA wal_checkpoint(TRUNCATE)", ()).await?;
        while rows.next().await?.is_some() {}
        Ok(())
    }

    pub async fn analytics_scalar_i64(&self, sql: &str) -> Result<i64> {
        let path = self.path.clone();
        let sql = sql.to_string();
        tokio::task::spawn_blocking(move || crate::analytics::scalar_i64(&path, &sql))
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_scalar_f64(&self, sql: &str) -> Result<f64> {
        let path = self.path.clone();
        let sql = sql.to_string();
        tokio::task::spawn_blocking(move || crate::analytics::scalar_f64(&path, &sql))
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn close(self) -> Result<()> {
        drop(self.conn);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn open_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("t.db");
        let db = EmbedDb::open(&p).await.unwrap();
        assert_eq!(db.path(), p.as_path());
        assert!(p.exists());
    }

    #[tokio::test]
    async fn execute_creates_and_inserts() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("w.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, v REAL)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1, 10.0)", ()).await.unwrap();
        let n = db.execute("INSERT INTO t VALUES (?, ?)", (2_i64, 20.0_f64)).await.unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn execute_bound_param_preserves_quote() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("q.db")).await.unwrap();
        db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?)", ("o'brien",)).await.unwrap();
        db.checkpoint().await.unwrap();
        let n = db.analytics_scalar_i64("SELECT count(*) FROM t WHERE name = 'o''brien'").await.unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn checkpoint_after_write_ok() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("c.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
    }

    #[tokio::test]
    async fn duckdb_reads_turso_written_file() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("x.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, v REAL)", ()).await.unwrap();
        for i in 1..=5 {
            db.execute(&format!("INSERT INTO t VALUES ({}, {}.0)", i, i * 10), ()).await.unwrap();
        }
        db.checkpoint().await.unwrap();

        let count = db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap();
        assert_eq!(count, 5);
    }

    #[tokio::test]
    async fn analytics_handles_quoted_path() {
        let dir = tempfile::tempdir().unwrap();
        let quoted_dir = dir.path().join("o'brien");
        std::fs::create_dir_all(&quoted_dir).unwrap();
        let db = EmbedDb::open(quoted_dir.join("q.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, v REAL)", ()).await.unwrap();
        for i in 1..=3 {
            db.execute(&format!("INSERT INTO t VALUES ({}, {}.0)", i, i * 10), ()).await.unwrap();
        }
        db.checkpoint().await.unwrap();

        let count = db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap();
        assert_eq!(count, 3);
    }

    #[tokio::test]
    async fn duckdb_avg_matches() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("a.db")).await.unwrap();
        db.execute("CREATE TABLE t (v REAL)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (10.0), (20.0), (30.0)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let avg = db.analytics_scalar_f64("SELECT avg(v) FROM t").await.unwrap();
        assert!((avg - 20.0).abs() < 1e-9);
        db.close().await.unwrap();
    }
}
