# embeddb

Single-file embedded database: a Turso write path and a DuckDB analytics read path over the same SQLite-format file.

## Why

Turso (`libsql`) writes a real SQLite-format file, and DuckDB can attach to and query that same file via its `sqlite` extension. `embeddb` wires these two together so a single file gets fast row-oriented writes from Turso and fast columnar/analytical scans from DuckDB, without running a separate server or duplicating storage.

## Write / read split

- **Writes** go through `EmbedDb`, backed by a `turso::Connection`. `EmbedDb::open` opens (creating if needed) the file in WAL journal mode. `EmbedDb::execute` runs a single write/DDL statement and returns the affected row count.
- **Reads for analytics** go through DuckDB. `EmbedDb::analytics_scalar_i64` / `EmbedDb::analytics_scalar_f64` open a fresh in-memory DuckDB connection, `ATTACH` the same file read-only via the `sqlite` extension, and run a scalar query against it.

Because DuckDB attaches read-only and Turso owns all writes, only one process ever mutates the file, avoiding write contention between the two engines.

## Checkpoint-then-read model

Turso writes to the file's WAL. DuckDB's SQLite reader sees the main database file, not the WAL, so a checkpoint must run before DuckDB can observe recent writes. Call `EmbedDb::checkpoint` (which issues `PRAGMA wal_checkpoint(TRUNCATE)`) after writes and before running analytics queries — skipping this step means DuckDB may read stale or incomplete data.

When done, call `EmbedDb::close` to drop the connection and release the file.

## Usage

```rust
use embeddb::EmbedDb;

#[tokio::main]
async fn main() -> embeddb::Result<()> {
    let db = EmbedDb::open("data.db").await?;

    db.execute("CREATE TABLE t (v REAL)").await?;
    db.execute("INSERT INTO t VALUES (10.0), (20.0), (30.0)").await?;

    db.checkpoint().await?;

    let avg = db.analytics_scalar_f64("SELECT avg(v) FROM t").await?;
    assert!((avg - 20.0).abs() < 1e-9);

    db.close().await?;
    Ok(())
}
```
