use embeddb::{EmbedConfig, EmbedDb, EmbedValue, VectorFilter, VectorSpace};

const SCHEMA: &str = "CREATE TABLE messages (\
 id TEXT PRIMARY KEY, channel TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL)";

async fn open_without_duckdb(dir: &tempfile::TempDir, name: &str) -> EmbedDb {
    let broken = dir.path().join("extension_dir_is_a_file");
    std::fs::write(&broken, b"x").unwrap();
    let config = EmbedConfig {
        duckdb_extension_dir: Some(broken),
        ..EmbedConfig::default()
    };
    let db = EmbedDb::open_with(dir.path().join(name), config)
        .await
        .unwrap();
    db.migrate(&[SCHEMA]).await.unwrap();
    db.vector_init().await.unwrap();
    db
}

fn space() -> VectorSpace {
    VectorSpace::new("local", "offline-model", 4)
}

fn embed(text: &str) -> Vec<f32> {
    let mut v = vec![0.0_f32; 4];
    for (i, byte) in text.bytes().enumerate() {
        v[i % 4] += f32::from(byte) / 255.0;
    }
    if v.iter().all(|x| *x == 0.0) {
        v[0] = 1.0;
    }
    v
}

#[tokio::test]
async fn full_recall_flow_works_with_duckdb_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_recall.db").await;
    let space = space();

    let corpus = [
        (
            "m1",
            "general",
            "ada",
            "the deploy failed on the staging cluster",
        ),
        ("m2", "general", "grace", "lunch plans for tomorrow"),
        ("m3", "random", "alan", "staging cluster is back up"),
    ];

    for (id, channel, author, body) in &corpus {
        db.execute(
            "INSERT INTO messages (id, channel, author, body) VALUES (?, ?, ?, ?)",
            (*id, *channel, *author, *body),
        )
        .await
        .unwrap();
        db.vector_upsert(&space, "message", id, &embed(body))
            .await
            .unwrap();
    }

    assert!(
        db.analytics_scalar_i64("SELECT count(*) FROM messages")
            .await
            .is_err(),
        "this test is only meaningful when the DuckDB reader cannot be built"
    );

    let hits = db
        .vector_search(
            &space,
            &embed("the deploy failed on the staging cluster"),
            2,
            None,
        )
        .await
        .unwrap();
    assert_eq!(hits[0].ref_id, "m1");

    let row = db
        .query_one(
            "SELECT author, body FROM messages WHERE id = ?",
            (hits[0].ref_id.as_str(),),
        )
        .await
        .unwrap()
        .expect("recalled message must be readable without duckdb");
    assert_eq!(row.as_str(0), Some("ada"));
    assert_eq!(
        row.as_str(1),
        Some("the deploy failed on the staging cluster")
    );

    let count = db
        .query_scalar_i64("SELECT count(*) FROM messages", ())
        .await
        .unwrap();
    assert_eq!(count, 3);

    let channel_rows = db
        .query_rows(
            "SELECT id FROM messages WHERE channel = ? ORDER BY id",
            ("general",),
        )
        .await
        .unwrap();
    assert_eq!(channel_rows.len(), 2);
}

#[tokio::test]
async fn recalled_ids_hydrate_back_into_full_rows() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_hydrate.db").await;
    let space = space();

    for i in 0..20 {
        let id = format!("m{i}");
        let body = format!("message number {i} about clusters");
        db.execute(
            "INSERT INTO messages (id, channel, author, body) VALUES (?, ?, ?, ?)",
            (id.as_str(), "general", "ada", body.as_str()),
        )
        .await
        .unwrap();
        db.vector_upsert(&space, "message", &id, &embed(&body))
            .await
            .unwrap();
    }

    let hits = db
        .vector_search(&space, &embed("message number 7 about clusters"), 3, None)
        .await
        .unwrap();
    assert_eq!(hits.len(), 3);

    let mut bodies = Vec::new();
    for hit in &hits {
        let row = db
            .query_one(
                "SELECT body FROM messages WHERE id = ?",
                (hit.ref_id.as_str(),),
            )
            .await
            .unwrap()
            .unwrap();
        bodies.push(row.as_str(0).unwrap().to_string());
    }
    assert_eq!(bodies.len(), 3);
    assert!(
        bodies[0].contains("number 7"),
        "closest hit should be the exact message: {bodies:?}"
    );
}

#[tokio::test]
async fn token_ledger_aggregates_without_duckdb() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_ledger.db").await;

    db.execute(
        "CREATE TABLE token_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, \
         prompt_tokens INTEGER, completion_tokens INTEGER)",
        (),
    )
    .await
    .unwrap();

    db.execute_batch(
        "INSERT INTO token_usage (model, prompt_tokens, completion_tokens) VALUES (?, ?, ?)",
        vec![
            ("gpt", 100_i64, 50_i64),
            ("gpt", 200_i64, 75_i64),
            ("other", 10_i64, 5_i64),
        ],
    )
    .await
    .unwrap();

    let total = db
        .query_scalar_i64(
            "SELECT sum(prompt_tokens + completion_tokens) FROM token_usage WHERE model = ?",
            ("gpt",),
        )
        .await
        .unwrap();
    assert_eq!(total, 425);

    let rows = db
        .query_rows(
            "SELECT model, sum(prompt_tokens) FROM token_usage GROUP BY model ORDER BY model",
            (),
        )
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].as_str(0), Some("gpt"));
    assert_eq!(rows[0].as_i64(1), Some(300));
}

#[tokio::test]
async fn filtered_recall_then_hydrate_by_kind() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_kind.db").await;
    let space = space();

    db.execute(
        "INSERT INTO messages (id, channel, author, body) VALUES ('m1', 'general', 'ada', 'cluster status')",
        (),
    )
        .await
        .unwrap();
    db.vector_upsert(&space, "message", "m1", &embed("cluster status"))
        .await
        .unwrap();
    db.vector_upsert(&space, "document", "d1", &embed("cluster status"))
        .await
        .unwrap();

    let hits = db
        .vector_search(
            &space,
            &embed("cluster status"),
            5,
            Some(&VectorFilter::kind("message")),
        )
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].ref_kind, "message");

    let row = db
        .query_one(
            "SELECT body FROM messages WHERE id = ?",
            (hits[0].ref_id.as_str(),),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.as_str(0), Some("cluster status"));
}

#[tokio::test]
async fn writes_and_reads_agree_across_a_transaction_without_duckdb() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_tx.db").await;

    let tx = db.begin().await.unwrap();
    tx.execute(
        "INSERT INTO messages (id, channel, author, body) VALUES ('t1', 'c', 'a', 'body')",
        (),
    )
    .await
    .unwrap();
    tx.rollback().await.unwrap();
    assert_eq!(
        db.query_scalar_i64("SELECT count(*) FROM messages", ())
            .await
            .unwrap(),
        0
    );

    let tx = db.begin().await.unwrap();
    tx.execute(
        "INSERT INTO messages (id, channel, author, body) VALUES ('t2', 'c', 'a', 'body')",
        (),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(
        db.query_scalar_i64("SELECT count(*) FROM messages", ())
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn dynamic_parameters_drive_a_runtime_built_query() {
    let dir = tempfile::tempdir().unwrap();
    let db = open_without_duckdb(&dir, "offline_dynamic.db").await;

    db.execute(
        "INSERT INTO messages (id, channel, author, body) VALUES ('m1', 'general', 'ada', 'one')",
        (),
    )
    .await
    .unwrap();

    let filters: Vec<EmbedValue> = vec![
        EmbedValue::Text("general".into()),
        EmbedValue::Text("ada".into()),
    ];
    let rows = db
        .query_rows(
            "SELECT body FROM messages WHERE channel = ? AND author = ?",
            embeddb::params_from_values(filters),
        )
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].as_str(0), Some("one"));
}

#[tokio::test]
async fn analytics_still_works_when_duckdb_is_available() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("offline_control.db"))
        .await
        .unwrap();
    db.migrate(&[SCHEMA]).await.unwrap();
    db.execute(
        "INSERT INTO messages (id, channel, author, body) VALUES ('m1', 'general', 'ada', 'one')",
        (),
    )
    .await
    .unwrap();

    let via_turso = db
        .query_scalar_i64("SELECT count(*) FROM messages", ())
        .await
        .unwrap();
    let via_duckdb = db
        .analytics_scalar_i64("SELECT count(*) FROM messages")
        .await
        .unwrap();
    assert_eq!(via_turso, via_duckdb);
    assert_eq!(via_turso, 1);
}
