# embeddb

Single-file embedded database: a Turso write path and a DuckDB analytics read path over the same SQLite-format file.

## Why

Turso (`libsql`) writes a real SQLite-format file, and DuckDB can attach to and query that same file via its `sqlite` extension. `embeddb` wires these two together so a single file gets fast row-oriented writes from Turso and fast columnar/analytical scans from DuckDB, without running a separate server or duplicating storage.

## Write / read split

- **Writes** go through `EmbedDb`, backed by a `turso::Connection`. `EmbedDb::open` opens (creating if needed) the file in WAL journal mode. `EmbedDb::execute` runs a single write/DDL statement and returns the affected row count.
- **Reads for analytics** go through DuckDB. `EmbedDb::analytics_scalar_i64` / `EmbedDb::analytics_scalar_f64` open a fresh in-memory DuckDB connection, `ATTACH` the same file read-only via the `sqlite` extension, and run a scalar query against it.

Because DuckDB attaches read-only and Turso owns all writes, only one process ever mutates the file, avoiding write contention between the two engines.

The Turso write path is pure Rust and statically linked — no shared library to manage. The DuckDB analytics read path is *not* fully static end-to-end: `duckdb`'s `bundled` Cargo feature statically links DuckDB's core engine only. The `sqlite`/`sqlite_scanner` extension it loads at runtime is a separate artifact — see "Deployment note" below.

## Checkpoint-then-read model

Turso writes to the file's WAL. DuckDB's SQLite reader sees the main database file, not the WAL, so a checkpoint must run before DuckDB can observe recent writes. Call `EmbedDb::checkpoint` (which issues `PRAGMA wal_checkpoint(TRUNCATE)`) after writes and before running analytics queries — skipping this step means DuckDB may read stale or incomplete data.

`checkpoint` does not inspect the `(busy, log, checkpointed)` row that `PRAGMA wal_checkpoint(TRUNCATE)` returns. If the checkpoint comes back busy (another reader holding the WAL), the flush may be incomplete and a subsequent analytics read could see stale data. This is safe under the v1 single-writer/no-concurrent-live-reader model this crate assumes; a future revision may want to surface the busy state to callers.

When done, call `EmbedDb::close` to drop the connection and release the file.

## Deployment note: DuckDB sqlite extension

`analytics_scalar_i64` / `analytics_scalar_f64` run `INSTALL sqlite; LOAD sqlite;` against the in-memory DuckDB connection before attaching the file. The `bundled` feature on the `duckdb` crate statically links DuckDB's core engine, but it does **not** include the `sqlite_scanner` extension. On first use, DuckDB downloads `sqlite_scanner.duckdb_extension` from `extensions.duckdb.org` into `~/.duckdb/extensions/...` and caches it there for subsequent calls.

In an offline, distroless, or egress-denied deployment — the target environment for this crate — that download fails and every `analytics_*` call returns `EmbedError::Duck`, even though the write path and all local tests are unaffected.

To support that environment, pre-stage `sqlite_scanner.duckdb_extension` (matching the DuckDB version pulled in by this crate) in a directory on the target, and set the `EMBEDDB_DUCKDB_EXTENSION_DIR` environment variable to that directory before calling any `analytics_*` method. When set, `embeddb` runs `SET extension_directory = '<dir>';` on the DuckDB connection before `INSTALL sqlite`, so `INSTALL` resolves from the pre-staged directory instead of the network and becomes a no-op if the extension is already present there. When unset (the default, including in this crate's own test suite), behavior is unchanged from before this note.

## Usage

```rust
use embeddb::EmbedDb;

#[tokio::main]
async fn main() -> embeddb::Result<()> {
    let db = EmbedDb::open("data.db").await?;

    db.execute("CREATE TABLE t (v REAL)", ()).await?;
    db.execute("INSERT INTO t VALUES (10.0), (20.0), (30.0)", ()).await?;

    db.checkpoint().await?;

    let avg = db.analytics_scalar_f64("SELECT avg(v) FROM t").await?;
    assert!((avg - 20.0).abs() < 1e-9);

    db.close().await?;
    Ok(())
}
```

`execute` takes a SQL string and anything implementing `turso::IntoParams` — `()` for no parameters, or a tuple of bound values:

```rust
db.execute("CREATE TABLE t (id INTEGER, name TEXT)", ()).await?;
db.execute("INSERT INTO t VALUES (?, ?)", (1_i64, "a")).await?;
```

### Transactions

`EmbedDb::begin` returns an `EmbedTx` handle with its own `execute`, plus `commit`/`rollback` to end it:

```rust
let tx = db.begin().await?;
tx.execute("INSERT INTO t VALUES (?, ?)", (2_i64, "b")).await?;
tx.execute("INSERT INTO t VALUES (?, ?)", (3_i64, "c")).await?;
tx.commit().await?;
```

Dropping an `EmbedTx` without calling `commit` discards the transaction's writes (rolled back on the connection's next use, not synchronously at drop).
