use embeddb::{EmbedConfig, EmbedDb, EmbedError, EmbedValue, FromEmbedRow};

async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
    (dir, db)
}

#[derive(Debug, PartialEq, FromEmbedRow)]
struct Account {
    id: i64,
    handle: String,
    balance: f64,
    active: bool,
    note: Option<String>,
}

#[tokio::test]
async fn full_lifecycle_from_open_to_typed_read() {
    let (_d, db) = open("e2e_lifecycle.db").await;

    db.migrate(&[
        "CREATE TABLE accounts (id INTEGER PRIMARY KEY, handle TEXT, balance REAL, active BOOLEAN, note TEXT)",
        "CREATE INDEX accounts_handle ON accounts (handle)",
    ])
        .await
        .unwrap();

    db.execute_batch(
        "INSERT INTO accounts (id, handle, balance, active, note) VALUES (?, ?, ?, ?, ?)",
        vec![
            (1_i64, "ada", 100.5_f64, true, Some("founder")),
            (2_i64, "grace", 250.0_f64, true, None),
            (3_i64, "alan", 0.0_f64, false, Some("dormant")),
        ],
    )
    .await
    .unwrap();

    let accounts: Vec<Account> = db
        .analytics_query_as("SELECT id, handle, balance, active, note FROM accounts ORDER BY id")
        .await
        .unwrap();

    assert_eq!(accounts.len(), 3);
    assert_eq!(
        accounts[0],
        Account {
            id: 1,
            handle: "ada".into(),
            balance: 100.5,
            active: true,
            note: Some("founder".into())
        }
    );
    assert_eq!(accounts[1].note, None);
    assert!(!accounts[2].active);
}

#[tokio::test]
async fn writes_are_visible_to_analytics_without_checkpoint() {
    let (_d, db) = open("e2e_visibility.db").await;
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    db.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (3)", ()).await.unwrap();

    let n = db
        .analytics_scalar_i64("SELECT count(*) FROM t")
        .await
        .unwrap();
    assert_eq!(n, 3);
    let sum = db
        .analytics_scalar_i64("SELECT sum(v) FROM t")
        .await
        .unwrap();
    assert_eq!(sum, 6);
}

#[tokio::test]
async fn transaction_commit_and_rollback_are_observable() {
    let (_d, db) = open("e2e_tx.db").await;
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();

    let tx = db.begin().await.unwrap();
    tx.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    tx.execute("INSERT INTO t VALUES (2)", ()).await.unwrap();
    tx.commit().await.unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM t")
            .await
            .unwrap(),
        2
    );

    let tx = db.begin().await.unwrap();
    tx.execute("INSERT INTO t VALUES (99)", ()).await.unwrap();
    tx.rollback().await.unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM t")
            .await
            .unwrap(),
        2
    );
}

#[tokio::test]
async fn batch_write_rolls_back_entirely_on_failure() {
    let (_d, db) = open("e2e_batch_rollback.db").await;
    db.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)", ())
        .await
        .unwrap();
    db.execute("INSERT INTO t VALUES (2, 20)", ())
        .await
        .unwrap();

    let res = db
        .execute_batch(
            "INSERT INTO t (id, v) VALUES (?, ?)",
            vec![(1_i64, 10_i64), (2_i64, 20_i64), (3_i64, 30_i64)],
        )
        .await;
    assert!(res.is_err());

    db.execute("INSERT INTO t VALUES (9, 90)", ())
        .await
        .unwrap();
    let ids: Vec<i64> = db
        .analytics_rows("SELECT id FROM t ORDER BY id")
        .await
        .unwrap()
        .iter()
        .map(|r| r.as_i64(0).unwrap())
        .collect();
    assert_eq!(ids, vec![2, 9]);
}

#[tokio::test]
async fn migrations_are_idempotent_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("e2e_migrate.db");
    let migrations = ["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"];

    {
        let db = EmbedDb::open(&path).await.unwrap();
        db.migrate(&migrations).await.unwrap();
        db.execute("INSERT INTO a VALUES (1)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        db.close().await.unwrap();
    }

    let db = EmbedDb::open(&path).await.unwrap();
    db.migrate(&migrations).await.unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM a")
            .await
            .unwrap(),
        1
    );

    db.migrate(&[migrations[0], migrations[1], "CREATE TABLE c (id INTEGER)"])
        .await
        .unwrap();
    db.execute("INSERT INTO c VALUES (1)", ()).await.unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM c")
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn duckdb_type_mapping_covers_numeric_and_temporal_columns() {
    let (_d, db) = open("e2e_types.db").await;
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();

    let rows = db
        .analytics_rows(
            "SELECT \
             CAST(1 AS TINYINT), CAST(2 AS SMALLINT), CAST(3 AS INTEGER), CAST(4 AS BIGINT), \
             CAST(5 AS HUGEINT), CAST(6 AS UTINYINT), CAST(7 AS USMALLINT), CAST(8 AS UINTEGER), \
             CAST(9 AS UBIGINT), CAST(18446744073709551615 AS UBIGINT), \
             CAST(1.5 AS FLOAT), CAST(2.5 AS DOUBLE), CAST(3.25 AS DECIMAL(10,2)), \
             CAST('2024-01-02' AS DATE), CAST('2024-01-02 03:04:05' AS TIMESTAMP), \
             CAST('03:04:05' AS TIME), CAST('hi' AS VARCHAR), CAST(true AS BOOLEAN), NULL \
             FROM t",
        )
        .await
        .unwrap();

    let r = &rows[0];
    assert_eq!(r.as_i64(0), Some(1));
    assert_eq!(r.as_i64(1), Some(2));
    assert_eq!(r.as_i64(2), Some(3));
    assert_eq!(r.as_i64(3), Some(4));
    assert_eq!(r.as_i128(4), Some(5));
    assert_eq!(r.as_i64(5), Some(6));
    assert_eq!(r.as_i64(6), Some(7));
    assert_eq!(r.as_i64(7), Some(8));
    assert_eq!(r.as_i64(8), Some(9));
    assert_eq!(r.as_i128(9), Some(18446744073709551615));
    assert_eq!(r.as_f64(10), Some(1.5));
    assert_eq!(r.as_f64(11), Some(2.5));
    assert_eq!(r.as_str(12), Some("3.25"));
    assert!(r.as_date(13).is_some());
    assert!(r.as_timestamp(14).is_some());
    assert!(r.as_time(15).is_some());
    assert_eq!(r.as_str(16), Some("hi"));
    assert_eq!(r.as_bool(17), Some(true));
    assert_eq!(r.get(18), Some(&EmbedValue::Null));
}

#[tokio::test]
async fn blob_roundtrips_through_the_analytics_reader() {
    let (_d, db) = open("e2e_blob.db").await;
    db.execute("CREATE TABLE t (b BLOB)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (?)", (vec![1_u8, 2, 3, 255],))
        .await
        .unwrap();
    db.checkpoint().await.unwrap();

    let rows = db.analytics_rows("SELECT b FROM t").await.unwrap();
    assert_eq!(rows[0].get(0), Some(&EmbedValue::Blob(vec![1, 2, 3, 255])));
}

#[tokio::test]
async fn streaming_read_visits_every_row() {
    let (_d, db) = open("e2e_stream.db").await;
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
    let rows: Vec<(i64,)> = (0..250).map(|i| (i,)).collect();
    db.execute_batch("INSERT INTO t VALUES (?)", rows)
        .await
        .unwrap();

    let total = std::sync::Arc::new(std::sync::atomic::AtomicI64::new(0));
    let sink = total.clone();
    let seen = db
        .analytics_for_each("SELECT v FROM t", move |row| {
            sink.fetch_add(
                row.as_i64(0).unwrap_or(0),
                std::sync::atomic::Ordering::SeqCst,
            );
        })
        .await
        .unwrap();

    assert_eq!(seen, 250);
    assert_eq!(
        total.load(std::sync::atomic::Ordering::SeqCst),
        (0..250).sum::<i64>()
    );
}

#[tokio::test]
async fn concurrent_readers_share_the_pool() {
    let dir = tempfile::tempdir().unwrap();
    let db = std::sync::Arc::new(
        EmbedDb::open_with(
            dir.path().join("e2e_pool.db"),
            EmbedConfig {
                reader_pool_size: 2,
                ..EmbedConfig::default()
            },
        )
        .await
        .unwrap(),
    );
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
    let rows: Vec<(i64,)> = (0..100).map(|i| (i,)).collect();
    db.execute_batch("INSERT INTO t VALUES (?)", rows)
        .await
        .unwrap();

    let mut handles = Vec::new();
    for _ in 0..8 {
        let db = db.clone();
        handles.push(tokio::spawn(async move {
            db.analytics_scalar_i64("SELECT count(*) FROM t")
                .await
                .unwrap()
        }));
    }
    for h in handles {
        assert_eq!(h.await.unwrap(), 100);
    }
}

#[tokio::test]
async fn unmapped_column_type_reports_a_cast_hint() {
    let (_d, db) = open("e2e_unmapped.db").await;
    db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();

    let err = db
        .analytics_rows("SELECT [1, 2, 3] FROM t")
        .await
        .unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("cast to VARCHAR"), "unexpected message: {msg}");
}

#[tokio::test]
async fn invalid_sql_surfaces_as_an_error_not_a_panic() {
    let (_d, db) = open("e2e_bad_sql.db").await;
    assert!(db.execute("NOT VALID SQL", ()).await.is_err());
    assert!(
        db.analytics_scalar_i64("SELECT * FROM missing_table")
            .await
            .is_err()
    );
    assert!(db.analytics_rows("ALSO NOT SQL").await.is_err());
}

#[tokio::test]
async fn query_result_exposes_columns_by_name() {
    let (_d, db) = open("e2e_columns.db").await;
    db.execute("CREATE TABLE t (id INTEGER, label TEXT)", ())
        .await
        .unwrap();
    db.execute("INSERT INTO t VALUES (1, 'one')", ())
        .await
        .unwrap();
    db.checkpoint().await.unwrap();

    let q = db.analytics_query("SELECT id, label FROM t").await.unwrap();
    assert_eq!(q.columns, vec!["id".to_string(), "label".to_string()]);
    assert_eq!(q.get(0, "label"), Some(&EmbedValue::Text("one".into())));
    assert_eq!(q.column_index("missing"), None);

    let one = db.analytics_one("SELECT id FROM t").await.unwrap().unwrap();
    assert_eq!(one.as_i64(0), Some(1));
    let none = db
        .analytics_one("SELECT id FROM t WHERE id = 999")
        .await
        .unwrap();
    assert!(none.is_none());
}

#[tokio::test]
async fn typed_read_reports_conversion_failure() {
    let (_d, db) = open("e2e_typed_err.db").await;
    db.execute(
        "CREATE TABLE t (id TEXT, handle TEXT, balance REAL, active BOOLEAN, note TEXT)",
        (),
    )
    .await
    .unwrap();
    db.execute(
        "INSERT INTO t VALUES ('not-an-int', 'x', 1.0, true, NULL)",
        (),
    )
    .await
    .unwrap();
    db.checkpoint().await.unwrap();

    let err = db
        .analytics_query_as::<Account>("SELECT id, handle, balance, active, note FROM t")
        .await
        .unwrap_err();
    assert!(matches!(err, EmbedError::Other(_)));
}

#[tokio::test]
async fn parameter_binding_survives_hostile_strings() {
    let (_d, db) = open("e2e_binding.db").await;
    db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
    for hostile in ["o'brien", "'; DROP TABLE t; --", "line\nbreak", "emoji 🧪"] {
        db.execute("INSERT INTO t VALUES (?)", (hostile,))
            .await
            .unwrap();
    }
    db.checkpoint().await.unwrap();

    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM t")
            .await
            .unwrap(),
        4
    );
    let n = db
        .analytics_scalar_i64("SELECT count(*) FROM t WHERE name = '''; DROP TABLE t; --'")
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn reopening_a_path_sees_previously_committed_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("e2e_reopen.db");
    {
        let db = EmbedDb::open(&path).await.unwrap();
        db.execute("CREATE TABLE t (v INTEGER)", ()).await.unwrap();
        db.execute("INSERT INTO t VALUES (42)", ()).await.unwrap();
        db.checkpoint().await.unwrap();
        db.close().await.unwrap();
    }
    let db = EmbedDb::open(&path).await.unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT sum(v) FROM t")
            .await
            .unwrap(),
        42
    );
    assert_eq!(db.path(), path.as_path());
}
