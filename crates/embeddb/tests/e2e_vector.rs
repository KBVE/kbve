use embeddb::{EmbedDb, EmbedError, VectorFilter, VectorSpace};

async fn open(name: &str) -> (tempfile::TempDir, EmbedDb) {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join(name)).await.unwrap();
    db.vector_init().await.unwrap();
    (dir, db)
}

fn seeded_vector(seed: u64, dim: usize) -> Vec<f32> {
    let mut state = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    (0..dim)
        .map(|_| {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((state >> 33) as f32 / u32::MAX as f32) - 0.5
        })
        .collect()
}

#[tokio::test]
async fn conversation_recall_returns_the_nearest_messages() {
    let (_d, db) = open("e2e_recall.db").await;
    let space = VectorSpace::new("local", "recall-model", 4);

    db.vector_upsert(&space, "message", "deploy-talk", &[1.0, 0.0, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "message", "deploy-followup", &[0.95, 0.1, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "message", "lunch-plans", &[0.0, 0.0, 1.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "message", "weather", &[0.0, 0.0, 0.0, 1.0])
        .await
        .unwrap();

    let hits = db
        .vector_search(&space, &[1.0, 0.05, 0.0, 0.0], 2, None)
        .await
        .unwrap();
    assert_eq!(hits.len(), 2);
    let ids: Vec<&str> = hits.iter().map(|h| h.ref_id.as_str()).collect();
    assert!(ids.contains(&"deploy-talk"));
    assert!(ids.contains(&"deploy-followup"));
    assert!(hits[0].score >= hits[1].score);
    assert!(hits[1].score > 0.9);
}

#[tokio::test]
async fn provider_migration_backfills_without_disturbing_the_live_model() {
    let (_d, db) = open("e2e_migrate_provider.db").await;
    let local = VectorSpace::new("local", "bge-small", 4);
    let hosted = VectorSpace::new("openai", "text-embedding-3-small", 4);

    let corpus = [
        ("msg-1", [1.0_f32, 0.0, 0.0, 0.0]),
        ("msg-2", [0.0, 1.0, 0.0, 0.0]),
        ("msg-3", [0.0, 0.0, 1.0, 0.0]),
    ];
    for (id, v) in &corpus {
        db.vector_upsert(&local, "message", id, v).await.unwrap();
    }
    assert_eq!(db.vector_count("bge-small").await.unwrap(), 3);

    let backfill: Vec<(String, String, Vec<f32>)> = corpus
        .iter()
        .map(|(id, v)| ("message".to_string(), id.to_string(), v.to_vec()))
        .collect();
    db.vector_upsert_batch(&hosted, &backfill).await.unwrap();

    assert_eq!(db.vector_count("bge-small").await.unwrap(), 3);
    assert_eq!(db.vector_count("text-embedding-3-small").await.unwrap(), 3);

    let old = db
        .vector_search(&local, &[1.0, 0.0, 0.0, 0.0], 10, None)
        .await
        .unwrap();
    let new = db
        .vector_search(&hosted, &[1.0, 0.0, 0.0, 0.0], 10, None)
        .await
        .unwrap();
    assert_eq!(old.len(), 3);
    assert_eq!(new.len(), 3);
    assert_eq!(old[0].ref_id, "msg-1");
    assert_eq!(new[0].ref_id, "msg-1");

    db.vector_delete_model("bge-small").await.unwrap();
    assert_eq!(db.vector_count("bge-small").await.unwrap(), 0);
    assert_eq!(db.vector_count("text-embedding-3-small").await.unwrap(), 3);
}

#[tokio::test]
async fn ranking_is_stable_over_a_realistic_corpus() {
    let (_d, db) = open("e2e_corpus.db").await;
    let dim = 64;
    let space = VectorSpace::new("local", "corpus-model", dim);

    let items: Vec<(String, String, Vec<f32>)> = (0..500)
        .map(|i| {
            (
                "message".to_string(),
                format!("m{i}"),
                seeded_vector(i, dim),
            )
        })
        .collect();
    let written = db.vector_upsert_batch(&space, &items).await.unwrap();
    assert_eq!(written, 500);

    let target = items[123].2.clone();
    let hits = db.vector_search(&space, &target, 5, None).await.unwrap();
    assert_eq!(hits.len(), 5);
    assert_eq!(hits[0].ref_id, "m123");
    assert!((hits[0].score - 1.0).abs() < 1e-4);
    for pair in hits.windows(2) {
        assert!(
            pair[0].score >= pair[1].score,
            "results are not sorted: {hits:?}"
        );
    }

    let again = db.vector_search(&space, &target, 5, None).await.unwrap();
    assert_eq!(hits, again);
}

#[tokio::test]
async fn ref_kind_filter_partitions_the_same_model() {
    let (_d, db) = open("e2e_kinds.db").await;
    let space = VectorSpace::new("local", "kind-model", 3);

    db.vector_upsert(&space, "message", "m1", &[1.0, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "document", "d1", &[1.0, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "document", "d2", &[0.9, 0.1, 0.0])
        .await
        .unwrap();

    let docs = db
        .vector_search(
            &space,
            &[1.0, 0.0, 0.0],
            10,
            Some(&VectorFilter::kind("document")),
        )
        .await
        .unwrap();
    assert_eq!(docs.len(), 2);
    assert!(docs.iter().all(|h| h.ref_kind == "document"));

    let all = db
        .vector_search(&space, &[1.0, 0.0, 0.0], 10, None)
        .await
        .unwrap();
    assert_eq!(all.len(), 3);

    let empty = db
        .vector_search(
            &space,
            &[1.0, 0.0, 0.0],
            10,
            Some(&VectorFilter::kind("nothing")),
        )
        .await
        .unwrap();
    assert!(empty.is_empty());
}

#[tokio::test]
async fn vectors_survive_close_and_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("e2e_vec_reopen.db");
    let space = VectorSpace::new("local", "persist-model", 3);

    {
        let db = EmbedDb::open(&path).await.unwrap();
        db.vector_init().await.unwrap();
        db.vector_upsert(&space, "message", "a", &[3.0, 4.0, 0.0])
            .await
            .unwrap();
        db.checkpoint().await.unwrap();
        db.close().await.unwrap();
    }

    let db = EmbedDb::open(&path).await.unwrap();
    db.vector_init().await.unwrap();
    assert_eq!(db.vector_count("persist-model").await.unwrap(), 1);
    let hits = db
        .vector_search(&space, &[3.0, 4.0, 0.0], 1, None)
        .await
        .unwrap();
    assert!((hits[0].score - 1.0).abs() < 1e-5);

    let norm = db
        .analytics_scalar_f64("SELECT norm FROM _embeddb_vectors WHERE ref_id = 'a'")
        .await
        .unwrap();
    assert!(
        (norm - 5.0).abs() < 1e-5,
        "original magnitude should be preserved, got {norm}"
    );
}

#[tokio::test]
async fn vector_rows_are_visible_to_the_analytics_reader() {
    let (_d, db) = open("e2e_vec_analytics.db").await;
    let space = VectorSpace::new("local", "analytics-model", 3);
    db.vector_upsert(&space, "message", "a", &[1.0, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&space, "document", "b", &[0.0, 1.0, 0.0])
        .await
        .unwrap();

    let rows = db
        .analytics_rows(
            "SELECT ref_kind, count(*) FROM _embeddb_vectors GROUP BY ref_kind ORDER BY ref_kind",
        )
        .await
        .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].as_str(0), Some("document"));
    assert_eq!(rows[1].as_str(0), Some("message"));

    let provider = db
        .analytics_scalar_string("SELECT DISTINCT provider FROM _embeddb_vectors")
        .await
        .unwrap();
    assert_eq!(provider, "local");
}

#[tokio::test]
async fn init_coexists_with_consumer_migrations() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("e2e_vec_migrate.db"))
        .await
        .unwrap();

    db.migrate(&["CREATE TABLE messages (id TEXT PRIMARY KEY, body TEXT)"])
        .await
        .unwrap();
    db.vector_init().await.unwrap();
    db.migrate(&[
        "CREATE TABLE messages (id TEXT PRIMARY KEY, body TEXT)",
        "CREATE TABLE channels (id TEXT PRIMARY KEY)",
    ])
    .await
    .unwrap();

    db.execute("INSERT INTO channels VALUES ('c1')", ())
        .await
        .unwrap();
    assert_eq!(
        db.analytics_scalar_i64("SELECT count(*) FROM channels")
            .await
            .unwrap(),
        1
    );

    let ledger = db
        .analytics_scalar_i64("SELECT count(*) FROM _embeddb_migrations")
        .await
        .unwrap();
    assert_eq!(
        ledger, 2,
        "vector_init must not consume a migration version slot"
    );
}

#[tokio::test]
async fn corrupt_vector_blob_errors_instead_of_scoring_garbage() {
    let (_d, db) = open("e2e_vec_corrupt.db").await;
    let space = VectorSpace::new("local", "corrupt-model", 3);
    db.vector_upsert(&space, "message", "good", &[1.0, 0.0, 0.0])
        .await
        .unwrap();

    db.execute(
        "INSERT INTO _embeddb_vectors \
         (ref_kind, ref_id, provider, model, dim, norm, vec, created_at) \
         VALUES ('message', 'ragged', 'local', 'corrupt-model', 3, 1.0, ?, 0)",
        (vec![1_u8, 2, 3],),
    )
    .await
    .unwrap();

    let err = db
        .vector_search(&space, &[1.0, 0.0, 0.0], 5, None)
        .await
        .unwrap_err();
    assert!(
        matches!(err, EmbedError::VectorBlob(_)),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn wrong_dimension_row_errors_instead_of_scoring_garbage() {
    let (_d, db) = open("e2e_vec_wrongdim.db").await;
    let space = VectorSpace::new("local", "dim-model", 3);
    db.vector_upsert(&space, "message", "good", &[1.0, 0.0, 0.0])
        .await
        .unwrap();

    db.execute(
        "INSERT INTO _embeddb_vectors \
         (ref_kind, ref_id, provider, model, dim, norm, vec, created_at) \
         VALUES ('message', 'short', 'local', 'dim-model', 2, 1.0, ?, 0)",
        (embeddb::pack(&[1.0_f32, 0.0]),),
    )
    .await
    .unwrap();

    let err = db
        .vector_search(&space, &[1.0, 0.0, 0.0], 5, None)
        .await
        .unwrap_err();
    assert!(
        matches!(
            err,
            EmbedError::VectorDim {
                expected: 3,
                actual: 2
            }
        ),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn non_blob_vector_column_errors() {
    let (_d, db) = open("e2e_vec_nonblob.db").await;
    let space = VectorSpace::new("local", "nonblob-model", 3);

    db.execute(
        "INSERT INTO _embeddb_vectors \
         (ref_kind, ref_id, provider, model, dim, norm, vec, created_at) \
         VALUES ('message', 'text-vec', 'local', 'nonblob-model', 3, 1.0, 'not a blob', 0)",
        (),
    )
    .await
    .unwrap();

    let err = db
        .vector_search(&space, &[1.0, 0.0, 0.0], 5, None)
        .await
        .unwrap_err();
    assert!(
        matches!(err, EmbedError::VectorBlob(_)),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn non_text_ref_column_errors() {
    let (_d, db) = open("e2e_vec_nontext.db").await;
    let space = VectorSpace::new("local", "nontext-model", 3);

    db.execute(
        "INSERT INTO _embeddb_vectors \
         (ref_kind, ref_id, provider, model, dim, norm, vec, created_at) \
         VALUES (?, ?, 'local', 'nontext-model', 3, 1.0, ?, 0)",
        (
            vec![0_u8, 159, 146, 150],
            vec![0_u8, 1],
            embeddb::pack(&[1.0_f32, 0.0, 0.0]),
        ),
    )
    .await
    .unwrap();

    let err = db
        .vector_search(&space, &[1.0, 0.0, 0.0], 5, None)
        .await
        .unwrap_err();
    assert!(
        matches!(err, EmbedError::VectorBlob(_)),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn delete_is_scoped_to_one_model() {
    let (_d, db) = open("e2e_vec_delete.db").await;
    let a = VectorSpace::new("local", "del-a", 3);
    let b = VectorSpace::new("api", "del-b", 3);
    db.vector_upsert(&a, "message", "shared", &[1.0, 0.0, 0.0])
        .await
        .unwrap();
    db.vector_upsert(&b, "message", "shared", &[1.0, 0.0, 0.0])
        .await
        .unwrap();

    assert_eq!(
        db.vector_delete("del-a", "message", "shared")
            .await
            .unwrap(),
        1
    );
    assert_eq!(db.vector_count("del-a").await.unwrap(), 0);
    assert_eq!(db.vector_count("del-b").await.unwrap(), 1);
    assert_eq!(
        db.vector_delete("del-a", "message", "shared")
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn codec_helpers_are_usable_outside_the_database() {
    let v = vec![0.5_f32, -1.25, 3.0];
    let packed = embeddb::pack(&v);
    assert_eq!(embeddb::unpack(&packed).unwrap(), v);

    let (unit, magnitude) = embeddb::normalize(&v).unwrap();
    assert!((embeddb::norm(&unit) - 1.0).abs() < 1e-6);
    assert!((magnitude - embeddb::norm(&v)).abs() < 1e-6);
    assert!((embeddb::dot(&unit, &unit) - 1.0).abs() < 1e-6);

    assert!(matches!(
        embeddb::normalize(&[0.0, 0.0]),
        Err(EmbedError::VectorZeroNorm)
    ));
    assert!(matches!(
        embeddb::unpack(&[0, 1, 2]),
        Err(EmbedError::VectorBlob(_))
    ));
}

#[tokio::test]
async fn concurrent_searches_against_one_database() {
    let dir = tempfile::tempdir().unwrap();
    let db = std::sync::Arc::new(
        EmbedDb::open(dir.path().join("e2e_vec_conc.db"))
            .await
            .unwrap(),
    );
    db.vector_init().await.unwrap();
    let space = VectorSpace::new("local", "conc-model", 8);

    let items: Vec<(String, String, Vec<f32>)> = (0..200)
        .map(|i| ("message".to_string(), format!("m{i}"), seeded_vector(i, 8)))
        .collect();
    db.vector_upsert_batch(&space, &items).await.unwrap();

    let mut handles = Vec::new();
    for i in 0..8_u64 {
        let db = db.clone();
        let space = space.clone();
        let probe = seeded_vector(i, 8);
        handles.push(tokio::spawn(async move {
            db.vector_search(&space, &probe, 3, None).await.unwrap()
        }));
    }
    for (i, h) in handles.into_iter().enumerate() {
        let hits = h.await.unwrap();
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].ref_id, format!("m{i}"));
    }
}
