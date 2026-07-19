use std::path::{Path, PathBuf};
use std::sync::Arc;
use crate::Result;

pub struct EmbedDb {
    path: PathBuf,
    conn: turso::Connection,
    config: crate::EmbedConfig,
    reader: Arc<crate::pool::ReaderPool>,
}

impl std::fmt::Debug for EmbedDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EmbedDb")
            .field("path", &self.path)
            .field("config", &self.config)
            .finish()
    }
}

pub(crate) fn path_str(path: &Path) -> Result<&str> {
    path.to_str().ok_or_else(|| crate::EmbedError::NonUtf8Path(path.to_path_buf()))
}

impl EmbedDb {
    pub async fn open(path: impl AsRef<Path>) -> Result<EmbedDb> {
        EmbedDb::open_with(path, crate::EmbedConfig::default()).await
    }

    pub async fn open_with(path: impl AsRef<Path>, config: crate::EmbedConfig) -> Result<EmbedDb> {
        let path = path.as_ref().to_path_buf();
        let db = turso::Builder::new_local(path_str(&path)?)
            .build()
            .await?;
        let conn = db.connect()?;
        let pragma = format!("PRAGMA journal_mode={}", config.journal_mode);
        conn.execute(&pragma, ()).await.ok();
        let reader = crate::pool::ReaderPool::build(
            config.reader_pool_size,
            config.duckdb_extension_dir.as_deref(),
        )?;
        Ok(EmbedDb { path, conn, config, reader: Arc::new(reader) })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
        let affected = self.conn.execute(sql, params).await?;
        Ok(affected)
    }

    pub async fn checkpoint(&self) -> Result<()> {
        for _ in 0..=self.config.checkpoint_max_retries {
            let mut rows = self.conn.query("PRAGMA wal_checkpoint(TRUNCATE)", ()).await?;
            let mut busy = 0_i64;
            if let Some(row) = rows.next().await? {
                busy = row.get::<i64>(0).unwrap_or(0);
            }
            while rows.next().await?.is_some() {}
            if busy == 0 {
                return Ok(());
            }
            tokio::task::yield_now().await;
        }
        Err(crate::EmbedError::CheckpointBusy)
    }

    pub async fn analytics_scalar_i64(&self, sql: &str) -> Result<i64> {
        let path = self.path.clone();
        let sql = sql.to_string();
        let pool = self.reader.clone();
        tokio::task::spawn_blocking(move || {
            let guard = pool.checkout();
            crate::analytics::scalar_i64(&guard, &path, &sql)
        })
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_scalar_f64(&self, sql: &str) -> Result<f64> {
        let path = self.path.clone();
        let sql = sql.to_string();
        let pool = self.reader.clone();
        tokio::task::spawn_blocking(move || {
            let guard = pool.checkout();
            crate::analytics::scalar_f64(&guard, &path, &sql)
        })
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_rows(&self, sql: &str) -> Result<Vec<crate::EmbedRow>> {
        let path = self.path.clone();
        let sql = sql.to_string();
        let pool = self.reader.clone();
        tokio::task::spawn_blocking(move || {
            let guard = pool.checkout();
            crate::analytics::rows(&guard, &path, &sql)
        })
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_query(&self, sql: &str) -> Result<crate::QueryResult> {
        let path = self.path.clone();
        let sql = sql.to_string();
        let pool = self.reader.clone();
        tokio::task::spawn_blocking(move || {
            let guard = pool.checkout();
            crate::analytics::query(&guard, &path, &sql)
        })
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_one(&self, sql: &str) -> Result<Option<crate::EmbedRow>> {
        Ok(self.analytics_query(sql).await?.rows.into_iter().next())
    }

    pub async fn analytics_scalar_string(&self, sql: &str) -> Result<String> {
        let path = self.path.clone();
        let sql = sql.to_string();
        let pool = self.reader.clone();
        tokio::task::spawn_blocking(move || {
            let guard = pool.checkout();
            crate::analytics::scalar_string(&guard, &path, &sql)
        })
            .await
            .map_err(|e| crate::EmbedError::Other(e.to_string()))?
    }

    pub async fn analytics_query_as<T: crate::FromEmbedRow>(&self, sql: &str) -> Result<Vec<T>> {
        let q = self.analytics_query(sql).await?;
        let mut out = Vec::with_capacity(q.rows.len());
        for row in &q.rows {
            out.push(T::from_row(row, &q.columns)?);
        }
        Ok(out)
    }

    pub async fn begin(&self) -> Result<crate::EmbedTx<'_>> {
        let tx = self.conn.unchecked_transaction().await?;
        Ok(crate::EmbedTx::new(tx))
    }

    pub async fn close(self) -> Result<()> {
        drop(self.conn);
        Ok(())
    }

    pub(crate) async fn max_migration_version(&self) -> Result<i64> {
        let mut rows = self
            .conn
            .query("SELECT COALESCE(MAX(version), -1) FROM _embeddb_migrations", ())
            .await?;
        let mut v = -1_i64;
        if let Some(row) = rows.next().await? {
            v = row.get::<i64>(0).unwrap_or(-1);
        }
        while rows.next().await?.is_some() {}
        Ok(v)
    }

    pub async fn migrate(&self, migrations: &[&str]) -> Result<()> {
        crate::migrate::run(self, migrations).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[tokio::test]
    async fn open_non_utf8_path_errors() {
        use std::os::unix::ffi::OsStrExt;
        use std::ffi::OsStr;
        let dir = tempfile::tempdir().unwrap();
        let bad = dir.path().join(OsStr::from_bytes(b"bad\xFFname.db"));
        let err = EmbedDb::open(&bad).await.unwrap_err();
        assert!(matches!(err, crate::EmbedError::NonUtf8Path(_)));
    }

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
    async fn checkpoint_reports_success_on_idle_db() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("cp.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
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

    #[tokio::test]
    async fn tx_commit_persists() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("c.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (2_i64,)).await.unwrap();
        tx.commit().await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 2);
    }

    #[tokio::test]
    async fn tx_rollback_discards() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("r.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        let tx = db.begin().await.unwrap();
        let n = tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
        assert_eq!(n, 1);
        tx.rollback().await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 0);

        let tx2 = db.begin().await.unwrap();
        let n2 = tx2.execute("INSERT INTO t VALUES (?)", (2_i64,)).await.unwrap();
        assert_eq!(n2, 1);
        tx2.commit().await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn analytics_rows_mixed_types() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("rows.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, v REAL, name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?, ?, ?)", (1_i64, 1.5_f64, "a")).await.unwrap();
        db.execute("INSERT INTO t VALUES (?, ?, ?)", (2_i64, 2.5_f64, "b")).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT id, v, name FROM t ORDER BY id").await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].as_i64(0), Some(1));
        assert_eq!(rows[0].as_f64(1), Some(1.5));
        assert_eq!(rows[0].as_str(2), Some("a"));
        assert_eq!(rows[1].as_str(2), Some("b"));
    }

    #[tokio::test]
    async fn analytics_rows_handles_null() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("null.db")).await.unwrap();
        db.execute("CREATE TABLE t (a INTEGER, b TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1, NULL)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT a, b FROM t").await.unwrap();
        assert_eq!(rows[0].get(1), Some(&crate::EmbedValue::Null));
    }

    #[tokio::test]
    async fn analytics_scalar_string_reads_text() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("s.db")).await.unwrap();
        db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?)", ("hello",)).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_string("SELECT name FROM t").await.unwrap(), "hello");
    }

    #[tokio::test]
    async fn open_with_custom_config() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = crate::EmbedConfig { journal_mode: "WAL".into(), duckdb_extension_dir: None, checkpoint_max_retries: 1, reader_pool_size: 2 };
        let db = EmbedDb::open_with(dir.path().join("cfg.db"), cfg).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn tx_drop_without_commit_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("d.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        {
            let tx = db.begin().await.unwrap();
            tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
        }
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn migrate_applies_and_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("m.db")).await.unwrap();
        let m = ["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"];
        db.migrate(&m).await.unwrap();
        db.migrate(&m).await.unwrap();
        db.execute("INSERT INTO a VALUES (1)", ()).await.unwrap();
        db.execute("INSERT INTO b VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM a").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn migrate_appended_applies_only_new() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("m2.db")).await.unwrap();
        db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
        db.migrate(&["CREATE TABLE a (id INTEGER)", "CREATE TABLE c (id INTEGER)"]).await.unwrap();
        db.execute("INSERT INTO c VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM c").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn analytics_rows_empty_table_returns_empty_vec() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("empty.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT id FROM t").await.unwrap();
        assert_eq!(rows, Vec::<crate::EmbedRow>::new());
    }

    #[tokio::test]
    async fn analytics_scalar_string_round_trips_quote() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("quote_string.db")).await.unwrap();
        db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?)", ("o'brien",)).await.unwrap();
        db.checkpoint().await.unwrap();
        let name = db.analytics_scalar_string("SELECT name FROM t").await.unwrap();
        assert_eq!(name, "o'brien");
    }

    #[tokio::test]
    async fn analytics_rows_blob_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("blob.db")).await.unwrap();
        db.execute("CREATE TABLE t (b BLOB)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (X'00FF')", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT b FROM t").await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get(0), Some(&crate::EmbedValue::Blob(vec![0x00, 0xFF])));
    }

    #[tokio::test]
    async fn analytics_rows_multi_row_ordering() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("order.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, v REAL, name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?, ?, ?)", (3_i64, 30.0_f64, "c")).await.unwrap();
        db.execute("INSERT INTO t VALUES (?, ?, ?)", (1_i64, 10.0_f64, "a")).await.unwrap();
        db.execute("INSERT INTO t VALUES (?, ?, ?)", (2_i64, 20.0_f64, "b")).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT id, v, name FROM t ORDER BY id").await.unwrap();
        assert_eq!(
            rows,
            vec![
                crate::EmbedRow(vec![
                    crate::EmbedValue::Int(1),
                    crate::EmbedValue::Float(10.0),
                    crate::EmbedValue::Text("a".into()),
                ]),
                crate::EmbedRow(vec![
                    crate::EmbedValue::Int(2),
                    crate::EmbedValue::Float(20.0),
                    crate::EmbedValue::Text("b".into()),
                ]),
                crate::EmbedRow(vec![
                    crate::EmbedValue::Int(3),
                    crate::EmbedValue::Float(30.0),
                    crate::EmbedValue::Text("c".into()),
                ]),
            ]
        );
    }

    #[tokio::test]
    async fn analytics_rows_large_int_in_range() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("bigint.db")).await.unwrap();
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?)", (i64::MAX,)).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT v FROM t").await.unwrap();
        assert_eq!(rows[0].get(0), Some(&crate::EmbedValue::Int(i64::MAX)));
    }

    #[tokio::test]
    async fn analytics_rows_maps_bool_and_types() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("v.db")).await.unwrap();
        db.execute("CREATE TABLE t (b INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT CAST(b AS BOOLEAN) FROM t").await.unwrap();
        assert_eq!(rows[0].as_bool(0), Some(true));
    }

    #[tokio::test]
    async fn analytics_rows_maps_ubigint_over_i64() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("u.db")).await.unwrap();
        db.execute("CREATE TABLE t (x INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT 18446744073709551615::UBIGINT FROM t").await.unwrap();
        assert_eq!(rows[0].as_i128(0), Some(18446744073709551615_i128));
    }

    #[tokio::test]
    async fn analytics_rows_maps_timestamp_and_date() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("ts.db")).await.unwrap();
        db.execute("CREATE TABLE t (x INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT TIMESTAMP '2021-01-01 00:00:00' AT TIME ZONE 'UTC', DATE '2021-01-01' FROM t").await.unwrap();
        assert!(matches!(rows[0].get(0), Some(crate::EmbedValue::Timestamp(_))));
        assert!(matches!(rows[0].get(1), Some(crate::EmbedValue::Date(_))));
        assert_eq!(rows[0].as_timestamp(0), Some(1_609_459_200_000_000));
        assert_eq!(rows[0].as_date(1), Some(18628));
    }

    #[tokio::test]
    async fn analytics_query_columns_and_get() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("q.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1, 'a')", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let q = db.analytics_query("SELECT id, name FROM t").await.unwrap();
        assert_eq!(q.columns, vec!["id".to_string(), "name".to_string()]);
        assert_eq!(q.column_index("name"), Some(1));
        assert_eq!(q.get(0, "name"), Some(&crate::EmbedValue::Text("a".into())));
        assert_eq!(q.get(0, "missing"), None);
        assert_eq!(q.len(), 1);
    }

    #[tokio::test]
    async fn analytics_one_first_or_none() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("o.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert!(db.analytics_one("SELECT id FROM t").await.unwrap().is_none());
        db.execute("INSERT INTO t VALUES (5)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_one("SELECT id FROM t").await.unwrap().unwrap().as_i64(0), Some(5));
    }

    #[tokio::test]
    async fn analytics_query_as_maps_struct() {
        #[derive(Debug, PartialEq)]
        struct Rowt { id: i64, name: String }
        impl crate::FromEmbedRow for Rowt {
            fn from_row(row: &crate::EmbedRow, cols: &[String]) -> crate::Result<Self> {
                let ci = |n: &str| cols.iter().position(|c| c == n)
                    .ok_or_else(|| crate::EmbedError::Other(format!("missing col {n}")));
                let id = row.as_i64(ci("id")?).ok_or_else(|| crate::EmbedError::Other("id".into()))?;
                let name = row.as_str(ci("name")?).ok_or_else(|| crate::EmbedError::Other("name".into()))?.to_string();
                Ok(Rowt { id, name })
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("as.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b')", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let got: Vec<Rowt> = db.analytics_query_as("SELECT id, name FROM t ORDER BY id").await.unwrap();
        assert_eq!(got, vec![Rowt{id:1,name:"a".into()}, Rowt{id:2,name:"b".into()}]);
    }

    #[tokio::test]
    async fn migrate_failure_rolls_back_that_migration() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("m3.db")).await.unwrap();
        let err = db.migrate(&["CREATE TABLE a (id INTEGER)", "NOT VALID SQL"]).await;
        assert!(err.is_err());
        db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
        db.execute("INSERT INTO a VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM a").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn analytics_query_empty_table_has_columns_no_rows() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("empty_q.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER, name TEXT)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let q = db.analytics_query("SELECT id, name FROM t").await.unwrap();
        assert_eq!(q.columns, vec!["id".to_string(), "name".to_string()]);
        assert!(q.rows.is_empty());
        assert_eq!(q.len(), 0);
    }

    #[tokio::test]
    async fn analytics_query_as_empty_returns_empty_vec() {
        struct Rowt;
        impl crate::FromEmbedRow for Rowt {
            fn from_row(_row: &crate::EmbedRow, _cols: &[String]) -> crate::Result<Self> {
                Ok(Rowt)
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("empty_as.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let got: Vec<Rowt> = db.analytics_query_as("SELECT id FROM t").await.unwrap();
        assert_eq!(got.len(), 0);
    }

    #[tokio::test]
    async fn analytics_rows_decimal_maps_to_text() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("decimal.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let rows = db.analytics_rows("SELECT CAST(1.5 AS DECIMAL(4,2)) FROM t").await.unwrap();
        assert_eq!(rows[0].get(0), Some(&crate::EmbedValue::Text("1.50".to_string())));
    }

    #[tokio::test]
    async fn analytics_rows_unmapped_type_errors_with_cast_hint() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("interval.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let err = db.analytics_rows("SELECT INTERVAL '1' DAY FROM t").await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("cast to VARCHAR"), "unexpected error message: {msg}");
    }

    #[tokio::test]
    async fn analytics_query_sequential_reads_reflect_checkpoints() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("seq.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let q1 = db.analytics_query("SELECT id FROM t").await.unwrap();
        assert_eq!(q1.len(), 1);

        db.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (3)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let q2 = db.analytics_query("SELECT id FROM t").await.unwrap();
        assert_eq!(q2.len(), 3);
    }

    #[tokio::test]
    async fn reused_reader_sees_fresh_data() {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join("fresh.db")).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
        db.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (3)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 3);
    }

    #[tokio::test]
    async fn pool_concurrent_reads_all_correct() {
        let dir = tempfile::tempdir().unwrap();
        let db = std::sync::Arc::new(EmbedDb::open(dir.path().join("pool.db")).await.unwrap());
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        for i in 1..=10 {
            db.execute(&format!("INSERT INTO t VALUES ({i})"), ()).await.unwrap();
        }
        db.checkpoint().await.unwrap();
        let mut handles = Vec::new();
        for _ in 0..12 {
            let db = db.clone();
            handles.push(tokio::spawn(async move {
                db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap()
            }));
        }
        for h in handles {
            assert_eq!(h.await.unwrap(), 10);
        }
    }

    #[tokio::test]
    async fn pool_exhaustion_recovers() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = crate::EmbedConfig { reader_pool_size: 2, ..Default::default() };
        let db = std::sync::Arc::new(EmbedDb::open_with(dir.path().join("ex.db"), cfg).await.unwrap());
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        let mut handles = Vec::new();
        for _ in 0..6 {
            let db = db.clone();
            handles.push(tokio::spawn(async move {
                db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap()
            }));
        }
        for h in handles {
            assert_eq!(h.await.unwrap(), 1);
        }
    }

    #[tokio::test]
    async fn pool_cross_connection_freshness() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = crate::EmbedConfig { reader_pool_size: 3, ..Default::default() };
        let db = EmbedDb::open_with(dir.path().join("cf.db"), cfg).await.unwrap();
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        for _ in 0..5 {
            assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
        }
        db.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (3)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        for _ in 0..5 {
            assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 3);
        }
    }
}
