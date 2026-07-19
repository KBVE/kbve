# embeddb

Single-file embedded database: a Turso write path and a DuckDB analytics read path over the same SQLite-format file.

## Why

Turso (`libsql`) writes a real SQLite-format file, and DuckDB can attach to and query that same file via its `sqlite` extension. `embeddb` wires these two together so a single file gets fast row-oriented writes from Turso and fast columnar/analytical scans from DuckDB, without running a separate server or duplicating storage.

## Write / read split

- **Writes** go through `EmbedDb`, backed by a `turso::Connection`. `EmbedDb::open` opens (creating if needed) the file in WAL journal mode. `EmbedDb::execute` runs a single write/DDL statement and returns the affected row count.

`EmbedDb::open` (and `open_with`) require the path to be valid UTF-8. A non-UTF-8 path returns `EmbedError::NonUtf8Path` rather than panicking.
- **Reads for analytics** go through DuckDB. `EmbedDb::analytics_scalar_i64` / `EmbedDb::analytics_scalar_f64` open a fresh in-memory DuckDB connection, `ATTACH` the same file read-only via the `sqlite` extension, and run a scalar query against it.

Because DuckDB attaches read-only and Turso owns all writes, only one process ever mutates the file, avoiding write contention between the two engines.

The Turso write path is pure Rust and statically linked — no shared library to manage. The DuckDB analytics read path is *not* fully static end-to-end: `duckdb`'s `bundled` Cargo feature statically links DuckDB's core engine only. The `sqlite`/`sqlite_scanner` extension it loads at runtime is a separate artifact — see "Deployment note" below.

## Checkpoint-then-read model

Turso writes to the file's WAL. DuckDB's `sqlite_scanner` replays uncheckpointed WAL frames when attached read-only, so analytics reads reflect all committed writes regardless of checkpoint status — a checkpoint is **not** required for DuckDB to observe recent writes. See "WAL-visibility freshness contract" under "v5" below for the authoritative statement and the measurements behind it.

`EmbedDb::checkpoint` (which issues `PRAGMA wal_checkpoint(TRUNCATE)`) and `checkpoint_passive` (`PRAGMA wal_checkpoint(PASSIVE)`, see "v5" below) exist for WAL truncation and file-size compaction, not for read visibility. Call `checkpoint` when you want to bound WAL growth or reclaim disk space, not merely to make recent writes visible to analytics queries.

`checkpoint` inspects the `(busy, log, checkpointed)` row that `PRAGMA wal_checkpoint(TRUNCATE)` returns. If it comes back busy (another reader holding the WAL), `checkpoint` retries (yielding between attempts) up to `EmbedConfig::checkpoint_max_retries` times. If it is still busy after retries, `checkpoint` returns `EmbedError::CheckpointBusy` instead of silently returning `Ok` over a possibly-incomplete flush.

When done, call `EmbedDb::close` to drop the connection and release the file.

## Deployment note: DuckDB sqlite extension

`analytics_scalar_i64` / `analytics_scalar_f64` run `INSTALL sqlite; LOAD sqlite;` against the in-memory DuckDB connection before attaching the file. The `bundled` feature on the `duckdb` crate statically links DuckDB's core engine, but it does **not** include the `sqlite_scanner` extension. On first use, DuckDB downloads `sqlite_scanner.duckdb_extension` from `extensions.duckdb.org` into `~/.duckdb/extensions/...` and caches it there for subsequent calls.

In an offline, distroless, or egress-denied deployment — the target environment for this crate — that download fails and every `analytics_*` call returns `EmbedError::Duck`, even though the write path and all local tests are unaffected.

To support that environment, pre-stage `sqlite_scanner.duckdb_extension` (matching the DuckDB version pulled in by this crate) in a directory on the target, and set the `EMBEDDB_DUCKDB_EXTENSION_DIR` environment variable to that directory before calling any `analytics_*` method. When set, `embeddb` runs `SET extension_directory = '<dir>';` on the DuckDB connection before `INSTALL sqlite`, so `INSTALL` resolves from the pre-staged directory instead of the network and becomes a no-op if the extension is already present there. When unset (the default, including in this crate's own test suite), behavior is unchanged from before this note.

## Nx targets

This crate is an Nx project (`packages/rust/embeddb/project.json`) with `build`, `test`, `e2e`, and `lint` targets backed by `@monodon/rust`. Run them through Nx rather than calling `cargo` directly:

```bash
pnpm nx build embeddb
pnpm nx test embeddb
pnpm nx lint embeddb
```

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

`EmbedDb::execute` and `EmbedDb::begin` share the same underlying `turso::Connection`. While a transaction is open, use the `tx` handle for writes — calling `db.execute(...)` on the same `EmbedDb` runs that statement inside the open transaction instead of autocommitting independently.

### Configuration: `EmbedConfig` + `open_with`

`EmbedDb::open` uses `EmbedConfig::default()` (`journal_mode: "WAL"`, no `duckdb_extension_dir`, `checkpoint_max_retries: 5`). To override any of these, build an `EmbedConfig` and pass it to `EmbedDb::open_with`:

```rust
use embeddb::{EmbedConfig, EmbedDb};

let cfg = EmbedConfig {
    journal_mode: "WAL".into(),
    duckdb_extension_dir: None,
    checkpoint_max_retries: 10,
};
let db = EmbedDb::open_with("data.db", cfg).await?;
```

`checkpoint_max_retries` controls how many times `EmbedDb::checkpoint` retries a busy WAL checkpoint before returning `EmbedError::CheckpointBusy` (see "Checkpoint-then-read model" above). `duckdb_extension_dir` is a per-`EmbedDb` override for the `EMBEDDB_DUCKDB_EXTENSION_DIR` environment variable described in "Deployment note" below.

### Analytics rows: `analytics_rows`, `EmbedRow`, `EmbedValue`, `analytics_scalar_string`

Alongside the scalar helpers (`analytics_scalar_i64`, `analytics_scalar_f64`), `analytics_scalar_string` reads a single text value, and `analytics_rows` reads an entire result set into `Vec<EmbedRow>`:

```rust
db.execute("CREATE TABLE t (id INTEGER, v REAL, name TEXT)", ()).await?;
db.execute("INSERT INTO t VALUES (?, ?, ?)", (1_i64, 1.5_f64, "a")).await?;
db.checkpoint().await?;

let name = db.analytics_scalar_string("SELECT name FROM t WHERE id = 1").await?;
assert_eq!(name, "a");

let rows = db.analytics_rows("SELECT id, v, name FROM t ORDER BY id").await?;
assert_eq!(rows[0].as_i64(0), Some(1));
assert_eq!(rows[0].as_f64(1), Some(1.5));
assert_eq!(rows[0].as_str(2), Some("a"));
```

Each `EmbedRow` wraps a `Vec<EmbedValue>`, one per selected column. `EmbedValue` is:

```rust
pub enum EmbedValue {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Blob(Vec<u8>),
    Bool(bool),
    HugeInt(i128),
    Timestamp(i64),
    Date(i32),
    Time(i64),
}
```

`Timestamp`/`Time` are stored as microseconds (DuckDB's `SECOND`/`MILLISECOND`/`NANOSECOND` units are normalized to microseconds; `NANOSECOND` truncates, it does not round). `Date` is days since the Unix epoch (DuckDB's native `DATE` representation). `HugeInt` covers DuckDB `HUGEINT` and any `UBIGINT` value too large for `i64`, which otherwise maps to `Int`.

Use `EmbedRow::get` for the raw `&EmbedValue`, or the typed accessors, which return `None` if the column is absent or holds a different variant: `as_i64`, `as_f64`, `as_str`, `as_bool`, `as_i128` (for `HugeInt`), `as_timestamp`, `as_date`, `as_time`.

`DECIMAL` columns map to `EmbedValue::Text` holding DuckDB's formatted decimal string (e.g. `CAST(1.5 AS DECIMAL(4,2))` → `"1.50"`) rather than a lossy float conversion.

Not every DuckDB type has a dedicated `EmbedValue` variant. An unmapped type (e.g. `INTERVAL`) returns `EmbedError::Other` with a message containing `cast to VARCHAR` — cast the column to `VARCHAR` in the SQL to read it as `EmbedValue::Text` instead:

```rust
db.analytics_rows("SELECT CAST(some_interval_col AS VARCHAR) FROM t").await?;
```

### Structured queries: `analytics_query`, `QueryResult`, `analytics_one`, `analytics_query_as`

`analytics_rows` returns bare `Vec<EmbedRow>` with no column names. `analytics_query` returns a `QueryResult` that pairs the result rows with their column names:

```rust
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<EmbedRow>,
}
```

`QueryResult::column_index(name)` looks up a column's position, `QueryResult::get(row, name)` fetches a value by row index and column name in one call, and `len`/`is_empty` describe the row count:

```rust
let q = db.analytics_query("SELECT id, name FROM t ORDER BY id").await?;
assert_eq!(q.columns, vec!["id".to_string(), "name".to_string()]);
assert_eq!(q.get(0, "name"), Some(&embeddb::EmbedValue::Text("a".into())));
```

On an empty result set, `columns` still reflects the query's projected column names — only `rows` is empty.

`analytics_one` runs a query and returns just the first row (`Option<EmbedRow>`), or `None` if the query matched nothing:

```rust
let first = db.analytics_one("SELECT id FROM t").await?;
```

`analytics_query_as<T>` maps each row into a caller-defined type `T: FromEmbedRow`:

```rust
pub trait FromEmbedRow: Sized {
    fn from_row(row: &EmbedRow, columns: &[String]) -> embeddb::Result<Self>;
}

struct User { id: i64, name: String }

impl FromEmbedRow for User {
    fn from_row(row: &EmbedRow, columns: &[String]) -> embeddb::Result<Self> {
        let idx = |n: &str| columns.iter().position(|c| c == n)
            .ok_or_else(|| embeddb::EmbedError::Other(format!("missing col {n}")));
        Ok(User {
            id: row.as_i64(idx("id")?).ok_or_else(|| embeddb::EmbedError::Other("id".into()))?,
            name: row.as_str(idx("name")?).ok_or_else(|| embeddb::EmbedError::Other("name".into()))?.to_string(),
        })
    }
}

let users: Vec<User> = db.analytics_query_as("SELECT id, name FROM t ORDER BY id").await?;
```

A query matching zero rows produces an empty `Vec<T>`.

### Reader reuse

`EmbedDb` holds one shared, long-lived DuckDB reader connection (`Arc<Mutex<duckdb::Connection>>`) instead of opening a fresh connection per analytics call. All `analytics_*` methods (`analytics_scalar_i64`, `analytics_scalar_f64`, `analytics_scalar_string`, `analytics_rows`, `analytics_query`, `analytics_one`, `analytics_query_as`) lock that same reader, re-`ATTACH` the file, and run their query on a blocking thread via `tokio::task::spawn_blocking`.

Because the reader is behind a `Mutex`, concurrent analytics calls on the same `EmbedDb` serialize rather than running in parallel — correctness is preserved, but heavy concurrent analytics load is bottlenecked on a single DuckDB connection. Each call re-attaches before querying, so every read reflects the most recent `checkpoint`, not a snapshot taken when the reader was first opened.

### Schema migrations: `migrate`

`EmbedDb::migrate` takes an ordered slice of DDL/DML strings and applies only the ones not yet recorded as applied, tracked in an internal `_embeddb_migrations` table keyed by index:

```rust
let migrations = [
    "CREATE TABLE a (id INTEGER)",
    "CREATE TABLE b (id INTEGER)",
];
db.migrate(&migrations).await?;
```

`migrate` is append-only and idempotent: calling it again with the same slice is a no-op, and calling it with the same prefix plus new entries appended applies only the new entries. Each migration runs in its own transaction; if a migration fails, that transaction is rolled back and the error is returned, leaving previously-applied migrations intact and no partial record for the failed one — so migrating with the same (or a fixed) slice afterward will retry it.

Each migration string is executed as a single statement via `tx.execute`. A string containing multiple statements (e.g. `"CREATE TABLE x (id INTEGER); CREATE INDEX idx_x ON x (id)"`) will only apply the first statement, yet the whole string is still recorded as applied — so the remaining statements silently never run. Callers must split multi-statement migrations into one array entry per statement.

## v5

### Reader pool: `EmbedConfig::reader_pool_size`

v4's "Reader reuse" section above describes a single shared DuckDB reader connection behind a `Mutex`, which serializes all concurrent `analytics_*` calls. v5 replaces that single connection with a pool of DuckDB reader connections sized by `EmbedConfig::reader_pool_size` (default `4`). Concurrent `analytics_*` calls now check out a connection from the pool and run in parallel instead of queuing behind one lock:

```rust
use embeddb::{EmbedConfig, EmbedDb};

let cfg = EmbedConfig { reader_pool_size: 8, ..Default::default() };
let db = EmbedDb::open_with("data.db", cfg).await?;
```

### Streaming rows: `analytics_for_each`

`analytics_query` and `analytics_rows` materialize the full result set into a `Vec` before returning. `analytics_for_each` instead streams each row through a callback and never builds that intermediate `Vec`, returning the number of rows visited:

```rust
let mut total = 0_i64;
let n = db.analytics_for_each("SELECT v FROM t ORDER BY v", |row| {
    total += row.as_i64(0).unwrap_or(0);
}).await?;
```

### Batched writes: `execute_batch`

`execute_batch` runs many parameter sets for the same SQL statement inside a single transaction, committing once at the end. If any one execution fails, the whole batch rolls back atomically instead of leaving a partially-applied set of rows:

```rust
let params: Vec<(i64, f64)> = (0..1000).map(|i| (i, i as f64)).collect();
let n = db.execute_batch("INSERT INTO t VALUES (?, ?)", params).await?;
```

### Non-blocking checkpoint: `checkpoint_passive`

`EmbedDb::checkpoint` issues `PRAGMA wal_checkpoint(TRUNCATE)`, which blocks new writers until it completes and truncates the WAL file. `checkpoint_passive` issues `PRAGMA wal_checkpoint(PASSIVE)` instead: it checkpoints as many WAL frames as it can without blocking writers or readers, and simply checkpoints fewer frames (or none) if the WAL is busy, rather than retrying or erroring:

```rust
db.checkpoint_passive().await?;
```

### Typed rows: `#[derive(FromEmbedRow)]` and `FromEmbedValue`

The `embeddb-derive` crate provides a `#[derive(FromEmbedRow)]` proc macro that generates a `FromEmbedRow` impl for a plain struct with named fields, mapping each field to the same-named result column via that field's `FromEmbedValue` implementation:

```rust
use embeddb::FromEmbedRow;

#[derive(Debug, PartialEq, FromEmbedRow)]
struct Rec {
    id: i64,
    name: String,
    note: Option<String>,
}

let rows: Vec<Rec> = db.analytics_query_as("SELECT id, name, note FROM t ORDER BY id").await?;
```

`FromEmbedValue` is implemented for `i64`, `f64`, `String`, `bool`, `i128`, `Vec<u8>`, and `Option<T>` for any `T: FromEmbedValue` (mapping SQL `NULL` to `None`). A field whose column is missing from the query's result set, or whose value doesn't convert to the field's type, makes the derived `from_row` return an error rather than panicking.

The `derive` Cargo feature is on by default and pulls in `embeddb-derive`. Building with `--no-default-features` drops the proc-macro dependency: `FromEmbedRow` and `FromEmbedValue` (and all other APIs) remain available, but the `#[derive(FromEmbedRow)]` macro itself is not — implement `FromEmbedRow` by hand in that configuration.

### WAL-visibility freshness contract

A Task 3 spike measured what DuckDB's `sqlite_scanner` actually sees when attached read-only to a file Turso is concurrently writing. Contrary to the "checkpoint before every read" framing in "Checkpoint-then-read model" above, the scanner replays uncheckpointed WAL frames directly: a read performed after 3 checkpointed inserts plus 2 further, uncheckpointed inserts returned all 5 rows, not just the 3 checkpointed ones. A concurrent writer/reader test over the same file showed row counts observed by the reader are monotonic and non-decreasing, and never torn (no partial row ever seen) — DuckDB attaches `READ_ONLY`, so it observes a consistent view of the file even mid-write.

The freshness contract this crate now documents: **analytics reads reflect all committed writes, including writes not yet checkpointed.** A live concurrent reader alongside an active writer is safe. `checkpoint` and `checkpoint_passive` still matter for WAL truncation and file-size compaction — an unbounded WAL grows without a checkpoint — but they are not required for read visibility, and callers that only need "see the latest committed data" no longer need to checkpoint before every analytics call.

### Benchmarks

`benches/embeddb_bench.rs` is a `criterion` benchmark binary (`harness = false`) covering `execute_batch` write throughput and parallel `analytics_scalar_f64` reads across `reader_pool_size` values of 1 and 4. Build it with:

```bash
cargo build -p embeddb --benches
```

Run it (slow — not part of the normal test loop) with:

```bash
cargo bench -p embeddb
```
