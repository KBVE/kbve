use criterion::{criterion_group, criterion_main, Criterion};
use embeddb::{EmbedConfig, EmbedDb};

fn rt() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().build().unwrap()
}

async fn seeded(path: std::path::PathBuf, pool: usize, rows: i64) -> EmbedDb {
    let cfg = EmbedConfig { reader_pool_size: pool, ..Default::default() };
    let db = EmbedDb::open_with(path, cfg).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER, v REAL)", ()).await.unwrap();
    let params: Vec<(i64, f64)> = (0..rows).map(|i| (i, i as f64)).collect();
    db.execute_batch("INSERT INTO t VALUES (?, ?)", params).await.unwrap();
    db.checkpoint().await.unwrap();
    db
}

fn bench_writes(c: &mut Criterion) {
    let rt = rt();
    let dir = tempfile::tempdir().unwrap();
    c.bench_function("execute_batch_1000", |b| {
        b.iter(|| {
            rt.block_on(async {
                let db = EmbedDb::open(dir.path().join("bw.db")).await.unwrap();
                db.execute("DROP TABLE IF EXISTS t", ()).await.unwrap();
                db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
                let params: Vec<(i64,)> = (0..1000).map(|i| (i,)).collect();
                db.execute_batch("INSERT INTO t VALUES (?)", params).await.unwrap();
            })
        })
    });
}

fn bench_reads(c: &mut Criterion) {
    let rt = rt();
    let dir = tempfile::tempdir().unwrap();
    for pool in [1usize, 4usize] {
        let db = rt.block_on(seeded(dir.path().join(format!("br{pool}.db")), pool, 10_000));
        let db = std::sync::Arc::new(db);
        c.bench_function(&format!("parallel_reads_pool_{pool}"), |b| {
            b.iter(|| {
                rt.block_on(async {
                    let mut handles = Vec::new();
                    for _ in 0..8 {
                        let db = db.clone();
                        handles.push(tokio::spawn(async move {
                            db.analytics_scalar_f64("SELECT avg(v) FROM t").await.unwrap()
                        }));
                    }
                    for h in handles { h.await.unwrap(); }
                })
            })
        });
    }
}

criterion_group!(benches, bench_writes, bench_reads);
criterion_main!(benches);
