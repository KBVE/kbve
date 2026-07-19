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

    pub async fn execute(&self, sql: &str) -> Result<u64> {
        let affected = self.conn.execute(sql, ()).await?;
        Ok(affected)
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
        db.execute("CREATE TABLE t (id INTEGER, v REAL)").await.unwrap();
        db.execute("INSERT INTO t VALUES (1, 10.0)").await.unwrap();
        let n = db.execute("INSERT INTO t VALUES (2, 20.0)").await.unwrap();
        assert_eq!(n, 1);
    }
}
