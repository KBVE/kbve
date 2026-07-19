# embeddb — Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation

## Purpose

Foundational Rust library crate providing an embedded, single-file database that
pairs two engines over one SQLite-format file:

- **Turso** (`turso` 0.7, pure-Rust SQLite rewrite, async) — the write path.
- **DuckDB** (`duckdb` 1.x, bundled/static) — the analytics read path (columnar scans, aggregations).

The crate is agnostic plumbing: no consumer-specific logic, no networked service.
It exists so future consumers (e.g. Windmill, axum services, bundled datasets)
can depend on a proven single-file write+analytics combo without re-solving the
wiring each time.

Non-goals for v1: WASM target, connection pooling, a standalone service/app,
backend-swap trait (rusqlite fallback), live concurrent write-while-read.

## Scope (Option A — plumbing only)

v1 delivers the thinnest thing that proves the combo works, structured so
ergonomics (migrations, config) and batteries (async pool, backend trait) can
bolt on later without breaking the public API.

## Location & Packaging

- New crate at `packages/rust/embeddb`.
- Added as a member in the root workspace `Cargo.toml`.
- Library only (`src/lib.rs`). No binary target.
- Dependencies:
  - `turso = "0.7"`
  - `duckdb = { version = "1", features = ["bundled"] }` — static link, no shipped `.so`
  - `tokio` (async runtime; Turso is async)
  - `thiserror` (error enum)
- Rationale for pure-Rust write side: no C toolchain drama, clean cross-compile,
  distroless/`FROM scratch` friendly. Fits ARC-runner / buildkit / distroless setup.

## Public API

Uniform async surface. DuckDB is synchronous, so its calls run inside
`tokio::task::spawn_blocking`. The `ATTACH` wiring is hidden from consumers.

```rust
pub struct EmbedDb { /* turso connection + file path */ }

impl EmbedDb {
    /// Open or create the file; set required pragmas (e.g. WAL).
    pub async fn open(path: impl AsRef<Path>) -> Result<Self>;

    /// Execute a single write statement via Turso.
    pub async fn execute(&self, sql: &str, params: /* param type */) -> Result<u64>;

    /// Run a closure inside a Turso transaction.
    pub async fn write_tx<F, T>(&self, f: F) -> Result<T>;

    /// Analytics read: fresh read-only DuckDB conn, ATTACH the same file
    /// (TYPE sqlite), run SQL, return rows. Runs on a blocking thread.
    pub async fn analytics(&self, sql: &str) -> Result<Rows>;

    /// Flush Turso state to the file so a DuckDB read sees a consistent image.
    pub async fn checkpoint(&self) -> Result<()>;

    /// Close the Turso connection cleanly.
    pub async fn close(self) -> Result<()>;
}
```

Exact param/`Rows`/`write_tx` closure types are settled during implementation to
match the `turso` 0.7 and `duckdb` 1.x APIs. The shape above is the contract.

## Data Flow & Concurrency

- Turso owns all writes to the file.
- `analytics()` opens a **fresh read-only** DuckDB connection per call,
  `ATTACH '<path>' (TYPE sqlite)`, runs the query, drops the connection.
- v1 concurrency model is **checkpoint-then-read**, NOT live concurrent
  write-and-read. Caller writes → `checkpoint()` → `analytics()`. This is the
  safe, provable path. Live concurrency is deferred to a future version, gated
  on a real consumer need.

## Error Handling

- Single `thiserror` enum, e.g.:
  ```rust
  pub enum EmbedError { Turso(..), Duck(..), Io(..) }
  pub type Result<T> = std::result::Result<T, EmbedError>;
  ```
- No panics on the library path; all fallible operations return `Result`.

## Testing

The integration test IS the go/no-go for the whole concept — it validates the
one real risk: **DuckDB reading a Turso-written SQLite-format file.**

1. `open` a temp-file DB.
2. Turso: `CREATE TABLE`, insert N known rows.
3. `checkpoint()`.
4. DuckDB via `analytics("SELECT count(*), avg(x), ... FROM attached table")`.
5. Assert the aggregate matches the known input.

Additional unit coverage: error mapping, open/create of a fresh file, pragma set.

## Known Risk & Fallback

- Turso is pre-1.0; SQLite file-format compatibility is claimed but not
  guaranteed. The integration test is the gate.
- If DuckDB cannot read the Turso file directly, documented fallbacks (NOT built
  in v1, recorded for the plan):
  1. Turso export (`.dump` / copy) into a standard SQLite image DuckDB reads.
  2. Swap the write backend to `rusqlite` (real SQLite) behind the same API —
     the deferred backend-trait, promoted only if Turso's format blocks us.

## Future (explicitly deferred — YAGNI)

- Backend-swap trait (Turso ↔ rusqlite).
- Migration/schema helper, config struct.
- Async connection pool.
- WASM / browser DuckDB target.
- Live concurrent write-while-read.
- Windmill integration (first likely consumer, but not built here).
