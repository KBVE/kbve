use embeddb::{EmbedDb, Result};

#[tokio::main]
async fn main() -> Result<()> {
    let dir = std::env::temp_dir().join("embeddb-example.db");
    let db = EmbedDb::open(&dir).await?;
    db.migrate(&["CREATE TABLE users (id INTEGER, name TEXT)"]).await?;

    let tx = db.begin().await?;
    tx.execute("INSERT INTO users VALUES (?, ?)", (1_i64, "alice")).await?;
    tx.execute("INSERT INTO users VALUES (?, ?)", (2_i64, "bob")).await?;
    tx.commit().await?;
    db.checkpoint().await?;

    let q = db.analytics_query("SELECT id, name FROM users ORDER BY id").await?;
    println!("columns: {:?}", q.columns);
    for row in &q.rows {
        println!("{:?}", row);
    }
    let n = db.analytics_scalar_i64("SELECT count(*) FROM users").await?;
    println!("count: {n}");
    db.close().await?;
    Ok(())
}
