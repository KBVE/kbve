use crate::{EmbedDb, EmbedRow, EmbedValue, QueryResult, Result};

pub(crate) fn value_from_turso(v: turso::Value) -> EmbedValue {
    match v {
        turso::Value::Null => EmbedValue::Null,
        turso::Value::Integer(n) => EmbedValue::Int(n),
        turso::Value::Real(n) => EmbedValue::Float(n),
        turso::Value::Text(s) => EmbedValue::Text(s),
        turso::Value::Blob(b) => EmbedValue::Blob(b),
    }
}

pub fn params_from_values(values: Vec<EmbedValue>) -> Vec<turso::Value> {
    values.into_iter().map(value_to_turso).collect()
}

pub(crate) fn value_to_turso(v: EmbedValue) -> turso::Value {
    match v {
        EmbedValue::Null => turso::Value::Null,
        EmbedValue::Int(n) => turso::Value::Integer(n),
        EmbedValue::Float(n) => turso::Value::Real(n),
        EmbedValue::Text(s) => turso::Value::Text(s),
        EmbedValue::Blob(b) => turso::Value::Blob(b),
        EmbedValue::Bool(b) => turso::Value::Integer(i64::from(b)),
        EmbedValue::HugeInt(n) => turso::Value::Text(n.to_string()),
        EmbedValue::Timestamp(n) => turso::Value::Integer(n),
        EmbedValue::Date(n) => turso::Value::Integer(i64::from(n)),
        EmbedValue::Time(n) => turso::Value::Integer(n),
    }
}

impl EmbedDb {
    pub async fn query(&self, sql: &str, params: impl turso::IntoParams) -> Result<QueryResult> {
        let mut rows = self.conn().query(sql, params).await?;
        let columns = rows.column_names();
        let ncols = columns.len();
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            let mut vals = Vec::with_capacity(ncols);
            for i in 0..ncols {
                vals.push(value_from_turso(row.get_value(i)?));
            }
            out.push(EmbedRow(vals));
        }
        Ok(QueryResult { columns, rows: out })
    }

    pub async fn query_rows(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
    ) -> Result<Vec<EmbedRow>> {
        Ok(self.query(sql, params).await?.rows)
    }

    pub async fn query_one(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
    ) -> Result<Option<EmbedRow>> {
        Ok(self.query(sql, params).await?.rows.into_iter().next())
    }

    pub async fn query_as<T: crate::FromEmbedRow>(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
    ) -> Result<Vec<T>> {
        let q = self.query(sql, params).await?;
        let mut out = Vec::with_capacity(q.rows.len());
        for row in &q.rows {
            out.push(T::from_row(row, &q.columns)?);
        }
        Ok(out)
    }

    pub async fn query_for_each<F>(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
        mut f: F,
    ) -> Result<u64>
    where
        F: FnMut(&EmbedRow),
    {
        let mut rows = self.conn().query(sql, params).await?;
        let ncols = rows.column_count();
        let mut count = 0_u64;
        while let Some(row) = rows.next().await? {
            let mut vals = Vec::with_capacity(ncols);
            for i in 0..ncols {
                vals.push(value_from_turso(row.get_value(i)?));
            }
            f(&EmbedRow(vals));
            count += 1;
        }
        Ok(count)
    }

    pub async fn query_scalar_i64(&self, sql: &str, params: impl turso::IntoParams) -> Result<i64> {
        self.scalar(sql, params, "i64", |v| match v {
            EmbedValue::Int(n) => Some(*n),
            _ => None,
        })
        .await
    }

    pub async fn query_scalar_f64(&self, sql: &str, params: impl turso::IntoParams) -> Result<f64> {
        self.scalar(sql, params, "f64", |v| match v {
            EmbedValue::Float(n) => Some(*n),
            EmbedValue::Int(n) => Some(*n as f64),
            _ => None,
        })
        .await
    }

    pub async fn query_scalar_string(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
    ) -> Result<String> {
        self.scalar(sql, params, "string", |v| match v {
            EmbedValue::Text(s) => Some(s.clone()),
            _ => None,
        })
        .await
    }

    async fn scalar<T, F>(
        &self,
        sql: &str,
        params: impl turso::IntoParams,
        expected: &str,
        pick: F,
    ) -> Result<T>
    where
        F: Fn(&EmbedValue) -> Option<T>,
    {
        let row = self.query_one(sql, params).await?.ok_or_else(|| {
            crate::EmbedError::Other(format!("expected one {expected} row, query returned none"))
        })?;
        let value = row
            .get(0)
            .ok_or_else(|| crate::EmbedError::Other(format!("expected {expected}, no columns")))?;
        pick(value)
            .ok_or_else(|| crate::EmbedError::Other(format!("expected {expected}, got {value:?}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
        (dir, db)
    }

    #[test]
    fn turso_value_maps_both_directions() {
        let cases = [
            (turso::Value::Null, EmbedValue::Null),
            (turso::Value::Integer(7), EmbedValue::Int(7)),
            (turso::Value::Real(1.5), EmbedValue::Float(1.5)),
            (turso::Value::Text("x".into()), EmbedValue::Text("x".into())),
            (turso::Value::Blob(vec![1, 2]), EmbedValue::Blob(vec![1, 2])),
        ];
        for (turso_value, embed_value) in cases {
            assert_eq!(value_from_turso(turso_value.clone()), embed_value);
            assert_eq!(value_to_turso(embed_value), turso_value);
        }
    }

    #[test]
    fn richer_values_narrow_to_sqlite_storage_classes() {
        assert_eq!(
            value_to_turso(EmbedValue::Bool(true)),
            turso::Value::Integer(1)
        );
        assert_eq!(
            value_to_turso(EmbedValue::Bool(false)),
            turso::Value::Integer(0)
        );
        assert_eq!(
            value_to_turso(EmbedValue::Timestamp(99)),
            turso::Value::Integer(99)
        );
        assert_eq!(
            value_to_turso(EmbedValue::Date(5)),
            turso::Value::Integer(5)
        );
        assert_eq!(
            value_to_turso(EmbedValue::Time(6)),
            turso::Value::Integer(6)
        );
        assert_eq!(
            value_to_turso(EmbedValue::HugeInt(170141183460469231731687303715884105727)),
            turso::Value::Text("170141183460469231731687303715884105727".into())
        );
    }

    #[tokio::test]
    async fn query_returns_columns_and_rows() {
        let (_d, db) = open("read_query.db").await;
        db.execute("CREATE TABLE t (id INTEGER, label TEXT)", ())
            .await
            .unwrap();
        db.execute("INSERT INTO t VALUES (1, 'one')", ())
            .await
            .unwrap();
        db.execute("INSERT INTO t VALUES (2, 'two')", ())
            .await
            .unwrap();

        let q = db
            .query("SELECT id, label FROM t ORDER BY id", ())
            .await
            .unwrap();
        assert_eq!(q.columns, vec!["id".to_string(), "label".to_string()]);
        assert_eq!(q.len(), 2);
        assert_eq!(q.get(1, "label"), Some(&EmbedValue::Text("two".into())));
    }

    #[tokio::test]
    async fn query_binds_parameters() {
        let (_d, db) = open("read_params.db").await;
        db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (?)", ("o'brien",))
            .await
            .unwrap();
        db.execute("INSERT INTO t VALUES (?)", ("other",))
            .await
            .unwrap();

        let rows = db
            .query_rows("SELECT name FROM t WHERE name = ?", ("o'brien",))
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].as_str(0), Some("o'brien"));
    }

    #[tokio::test]
    async fn dynamic_params_bind_from_embed_values() {
        let (_d, db) = open("read_dynamic.db").await;
        db.execute("CREATE TABLE t (a INTEGER, b TEXT)", ())
            .await
            .unwrap();
        let params = params_from_values(vec![EmbedValue::Int(1), EmbedValue::Text("x".into())]);
        db.execute("INSERT INTO t VALUES (?, ?)", params)
            .await
            .unwrap();

        let probe = params_from_values(vec![EmbedValue::Int(1)]);
        let row = db
            .query_one("SELECT b FROM t WHERE a = ?", probe)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.as_str(0), Some("x"));
    }

    #[tokio::test]
    async fn query_one_returns_none_on_empty() {
        let (_d, db) = open("read_one.db").await;
        db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
        assert!(
            db.query_one("SELECT id FROM t", ())
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn scalars_read_without_duckdb() {
        let (_d, db) = open("read_scalar.db").await;
        db.execute("CREATE TABLE t (n INTEGER, f REAL, s TEXT)", ())
            .await
            .unwrap();
        db.execute("INSERT INTO t VALUES (3, 2.5, 'hi')", ())
            .await
            .unwrap();

        assert_eq!(db.query_scalar_i64("SELECT n FROM t", ()).await.unwrap(), 3);
        assert_eq!(
            db.query_scalar_f64("SELECT f FROM t", ()).await.unwrap(),
            2.5
        );
        assert_eq!(
            db.query_scalar_f64("SELECT n FROM t", ()).await.unwrap(),
            3.0
        );
        assert_eq!(
            db.query_scalar_string("SELECT s FROM t", ()).await.unwrap(),
            "hi"
        );
    }

    #[tokio::test]
    async fn scalar_reports_missing_row_and_wrong_type() {
        let (_d, db) = open("read_scalar_err.db").await;
        db.execute("CREATE TABLE t (s TEXT)", ()).await.unwrap();

        let err = db
            .query_scalar_i64("SELECT s FROM t", ())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("returned none"), "{err}");

        db.execute("INSERT INTO t VALUES ('nope')", ())
            .await
            .unwrap();
        let err = db
            .query_scalar_i64("SELECT s FROM t", ())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("expected i64"), "{err}");
        assert!(
            db.query_scalar_string("SELECT rowid FROM t", ())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn query_for_each_streams_every_row() {
        let (_d, db) = open("read_stream.db").await;
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
        let rows: Vec<(i64,)> = (0..50).map(|i| (i,)).collect();
        db.execute_batch("INSERT INTO t VALUES (?)", rows)
            .await
            .unwrap();

        let mut sum = 0_i64;
        let n = db
            .query_for_each("SELECT v FROM t", (), |row| {
                sum += row.as_i64(0).unwrap_or(0)
            })
            .await
            .unwrap();
        assert_eq!(n, 50);
        assert_eq!(sum, (0..50).sum::<i64>());
    }

    #[tokio::test]
    async fn query_as_maps_into_structs() {
        let (_d, db) = open("read_as.db").await;
        db.execute("CREATE TABLE t (id INTEGER, label TEXT)", ())
            .await
            .unwrap();
        db.execute("INSERT INTO t VALUES (1, 'one')", ())
            .await
            .unwrap();

        struct Rec {
            id: i64,
            label: String,
        }
        impl crate::FromEmbedRow for Rec {
            fn from_row(row: &EmbedRow, columns: &[String]) -> Result<Self> {
                let idx = |name: &str| columns.iter().position(|c| c == name).unwrap();
                Ok(Rec {
                    id: row.as_i64(idx("id")).unwrap(),
                    label: row.as_str(idx("label")).unwrap().to_string(),
                })
            }
        }

        let recs: Vec<Rec> = db.query_as("SELECT id, label FROM t", ()).await.unwrap();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].id, 1);
        assert_eq!(recs[0].label, "one");
    }

    #[tokio::test]
    async fn reads_see_uncommitted_writes_from_the_same_connection() {
        let (_d, db) = open("read_tx.db").await;
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();

        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        assert_eq!(
            db.query_scalar_i64("SELECT count(*) FROM t", ())
                .await
                .unwrap(),
            1
        );
        tx.rollback().await.unwrap();
        assert_eq!(
            db.query_scalar_i64("SELECT count(*) FROM t", ())
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn invalid_sql_errors() {
        let (_d, db) = open("read_bad.db").await;
        assert!(db.query("NOT SQL", ()).await.is_err());
        assert!(db.query_rows("SELECT * FROM missing", ()).await.is_err());
    }

    #[tokio::test]
    async fn reads_discharge_a_deferred_rollback() {
        let (_d, db) = open("read_dangling.db").await;
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();

        {
            let tx = db.begin().await.unwrap();
            tx.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        }

        assert_eq!(
            db.query_scalar_i64("SELECT count(*) FROM t", ())
                .await
                .unwrap(),
            0
        );
        db.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
        let rows = db.query_rows("SELECT v FROM t", ()).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].as_i64(0), Some(2));
    }

    #[tokio::test]
    async fn repeated_queries_are_stable() {
        let (_d, db) = open("read_repeat.db").await;
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
        for _ in 0..100 {
            assert_eq!(
                db.query_scalar_i64("SELECT count(*) FROM t", ())
                    .await
                    .unwrap(),
                1
            );
        }
    }
}
