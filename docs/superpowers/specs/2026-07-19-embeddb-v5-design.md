# embeddb v5 — Parallel Reads + Batch/Streaming + Live Read + Consumability Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation
Builds on: `packages/rust/embeddb` (v1 #14292, v2 #14313, v3 #14321, v4 #14332 merged)

## Purpose

Four improvement tracks, landed as ordered commits on one branch. Stays
**Turso (write) + DuckDB (read) only**.

1. Parallel reads — replace the single mutex-guarded DuckDB reader with a pool
   so analytics calls run concurrently (reverses v4's documented serialize
   trade-off).
2. Batch / streaming — a row-callback read API that does not materialize every
   row into a `Vec`, plus a batched multi-row write.
3. Live concurrent read — **research-gated**: prove DuckDB can read the file
   while Turso is actively writing; ship live reads only if the spike passes,
   else fall back to the current checkpoint-then-read model.
4. Consumability — a `#[derive(FromEmbedRow)]` proc-macro crate, criterion
   benchmarks, richer README.

## Current surface (v4)

`EmbedDb { path, conn: turso::Connection, config: EmbedConfig,
reader: Arc<Mutex<duckdb::Connection>> }`. Every analytics call locks the one
reader inside `spawn_blocking`, `USE memory; DETACH src;` then re-`ATTACH` the
file `READ_ONLY`, runs the query. Reads **serialize** on the mutex. Reads
`analytics_scalar_i64/f64/string`, `analytics_rows`, `analytics_query` →
`QueryResult`, `analytics_one`, `analytics_query_as::<T: FromEmbedRow>`.
`EmbedValue { Null, Int, Float, Text, Blob, Bool, HugeInt, Timestamp, Date,
Time }`. Writes: `execute(sql, params)`, `begin() -> EmbedTx`. `checkpoint()`
busy-retries. `EmbedConfig { journal_mode, duckdb_extension_dir,
checkpoint_max_retries }`.

---

## Phase 1 — Parallel reads (reader pool)

Replace `reader: Arc<Mutex<duckdb::Connection>>` with `reader: Arc<ReaderPool>`.

New module `pool.rs`:

```rust
pub(crate) struct ReaderPool {
    idle: std::sync::Mutex<Vec<duckdb::Connection>>,
    available: std::sync::Condvar,
    size: usize,
}

impl ReaderPool {
    // Build `size` DuckDB connections, each with sqlite_scanner loaded once
    // (prepare_sqlite_scanner). Returns Err if any connection fails to build.
    pub(crate) fn build(size: usize, ext_dir: Option<&std::path::Path>) -> crate::Result<Self>;

    // Pop an idle connection (blocking on the Condvar if none idle),
    // returning an RAII guard that pushes the connection back on drop.
    pub(crate) fn checkout(&self) -> ReaderGuard<'_>;
}

pub(crate) struct ReaderGuard<'a> {
    pool: &'a ReaderPool,
    conn: Option<duckdb::Connection>, // Option so Drop can move it back
}
// Deref/DerefMut to duckdb::Connection; Drop pushes conn back + notify_one.
```

Design notes:
- `duckdb::Connection` is `Send`, not `Sync`. A `Connection` is *moved* out of
  the pool on checkout and *moved* back on guard drop — never aliased. The
  `Mutex<Vec<Connection>>` is the only shared state; it is held only for the
  pop/push, never across a query.
- `build` loads the sqlite extension `size` times up front (paid once), never
  per call — the whole point of the v4 shared reader, now multiplied for
  concurrency.
- Each analytics call, inside `spawn_blocking`: `let guard = pool.checkout();`
  then `attach_fresh(&guard, path)?` → query → return. The existing
  `attach_fresh` (`USE memory; DETACH src; ATTACH … READ_ONLY; USE src;`)
  keeps every read fresh regardless of which pooled connection serves it.
- Guard drop returns the connection even on query error / panic-unwind so the
  pool never leaks a slot. (`Drop` runs on unwind; the pushed connection is
  fine to reuse — a failed `ATTACH`/query leaves the connection usable, and
  the next `attach_fresh` starts with `DETACH`.)

Config: add `reader_pool_size: usize` to `EmbedConfig`, default `4`. `open`
uses the default; `open_with` honors the config. `build(0, …)` is rejected →
`EmbedError::Other("reader_pool_size must be >= 1")` (a zero pool would
deadlock on first checkout).

`db.rs` changes: all five analytics wrappers move from
`reader.lock().unwrap_or_else(|e| e.into_inner())` to `pool.checkout()`. The
`Arc<Mutex<…>>` self-heal-from-poison logic is removed (no shared mutex across
the query anymore; the pool's internal mutex is held only for the microscopic
pop/push and never runs user code under lock, so poisoning is not a practical
concern — but still use `lock().unwrap_or_else(|e| e.into_inner())` on the
internal mutex for robustness).

`Debug` for `EmbedDb`: unchanged approach — print `path` + `config` only, not
the pool.

**Tests (P1):**
- Existing analytics tests stay green (pool of 1 behaves like the old reader).
- Concurrent correctness: spawn `pool_size * 3` analytics tasks via
  `tokio::spawn` against one `EmbedDb`, each asserting the correct aggregate;
  all must succeed (proves checkout/return has no aliasing/deadlock and the
  pool recycles connections).
- Pool exhaustion + recovery: with `reader_pool_size = 2`, run 6 concurrent
  reads; all complete (checkout blocks then proceeds as guards drop).
- Freshness across pooled connections: write N → checkpoint → read (some
  connection); write M → checkpoint → read again; sees N+M (the v4 freshness
  guarantee holds no matter which connection serves the second read).

## Phase 2 — Batch / streaming

**Streaming read** — avoid materializing all rows:

```rust
impl EmbedDb {
    /// Run `sql`, invoking `f` once per row. Returns the row count.
    /// `f` runs inside spawn_blocking, so it must be Send.
    pub async fn analytics_for_each<F>(&self, sql: &str, f: F) -> Result<u64>
    where F: FnMut(&EmbedRow) + Send + 'static;
}
```

Implementation: inside `spawn_blocking`, checkout a reader, `attach_fresh`,
prepare + `query([])`, iterate rows mapping each via `value_from_ref` into an
`EmbedRow`, call `f(&row)`, increment count. Never builds a `Vec<EmbedRow>`.
The closure is moved into the blocking task; the count is returned. (Column
names are not surfaced here — the row-callback path is for volume; use
`analytics_query` when you need columns.)

**Batched write** — one prepared statement, one transaction, many param sets:

```rust
impl EmbedDb {
    /// Execute `sql` once per parameter set inside a single transaction.
    /// Returns total rows affected. Rolls back on any error.
    pub async fn execute_batch<I, P>(&self, sql: &str, params: I) -> Result<u64>
    where I: IntoIterator<Item = P> + Send + 'static,
          P: turso::IntoParams + Send + 'static;
}
```

Implementation: `self.begin()` (EmbedTx), loop the param sets calling
`tx.execute(sql, p)` accumulating affected counts, `tx.commit()`. On any
`Err`, drop the tx (deferred-rollback fires on next conn op — already
documented v2 behavior) and return the error. Reuses the existing tx handle;
turso re-parses per `execute` (turso manages its own statement cache — we do
not add a prepared-statement cache, out of scope per v4).

**Tests (P2):**
- `analytics_for_each` visits every row in order, returns correct count,
  values match (assert accumulated sum equals a known total).
- `analytics_for_each` on empty result → count 0, closure never called.
- `execute_batch` inserts K rows in one call; a following count read = K.
- `execute_batch` rolls back atomically: a param set that violates a
  constraint (e.g. duplicate PRIMARY KEY mid-batch) → `Err`, and a subsequent
  count read shows **zero** rows committed from that batch.

## Phase 3 — Live concurrent read (research-gated)

**Step 0 — go/no-go spike (like v1's DuckDB-reads-Turso gate).** Before any API
change, write a `#[test]` that:
1. Opens an `EmbedDb`, creates a table, inserts N rows, `checkpoint()`.
2. Inserts M MORE rows **without** checkpointing.
3. Reads via DuckDB (current `analytics_query`, no checkpoint between write and
   read).
4. Records what DuckDB sees: N (only checkpointed main-file) or N+M (replays
   WAL).

Also a concurrent variant: a `tokio::spawn` write loop (insert + periodic
checkpoint) running while a read loop issues `analytics_query`; assert reads
always return a **consistent** count (never a torn/garbage value; monotonic
non-decreasing across the checkpointed boundary), and no error/corruption.

**Decision on the spike result:**

- **PASS (reads are consistent while a writer is active, corruption-free):**
  - Document the freshness contract explicitly: analytics reflects data **up to
    the most recent checkpoint** (DuckDB sqlite_scanner reads the main file; it
    is not guaranteed to replay uncheckpointed WAL frames — the spike records
    which).
  - Add `EmbedDb::checkpoint_passive(&self) -> Result<()>` running
    `PRAGMA wal_checkpoint(PASSIVE)` — advances the main file **without
    blocking** the writer (PASSIVE checkpoints as many frames as it can without
    waiting on locks; never errors busy). Callers who want fresher live reads
    call `checkpoint_passive()` then read, no writer stall.
  - Document: live concurrent read is safe; freshness = last (passive or full)
    checkpoint. The existing `checkpoint()` (which busy-retries toward a fuller
    checkpoint) stays for callers who need the tightest freshness.

- **FAIL (torn reads, errors, or corruption under a live writer):**
  - Do **not** ship a live-read API. Keep checkpoint-then-read.
  - Document the empirical WAL-visibility limit found (this is itself a
    valuable, non-obvious result worth recording in memory).
  - `checkpoint_passive` may still ship if it independently proves useful
    (non-blocking partial checkpoint) — decide at implementation time from the
    spike data.

Either branch is corruption-safe: DuckDB attaches strictly `READ_ONLY`.

**Tests (P3):** the spike tests above become permanent regression tests
(asserting whichever behavior was observed, so a future turso/duckdb bump that
changes WAL visibility is caught). If PASS, add a `checkpoint_passive` test
(passive checkpoint advances visible count without a full `checkpoint()`).

## Phase 4 — Consumability

**Derive macro — new crate `packages/rust/embeddb-derive`:**
- proc-macro crate (`proc-macro = true`), deps `syn = "2"`, `quote = "1"`,
  `proc-macro2 = "1"`. Workspace member. `version = "0.0.1"` (publish
  sentinel, same lane as embeddb).
- Emits `#[derive(FromEmbedRow)]` for structs with named fields, generating
  `impl FromEmbedRow` that reads each field **by column name** (via
  `columns` + `EmbedRow::get`), converting through the matching accessor. Field
  type → accessor mapping: `i64`→`as_i64`, `f64`→`as_f64`, `String`→`as_str`
  (owned), `bool`→`as_bool`, `i128`→`as_i128`, `Vec<u8>`→blob accessor;
  `Option<T>` → `None` when the value is `Null` or the column is absent, else
  `Some`. A missing column or type mismatch on a non-`Option` field →
  `Err(EmbedError::Other("column '<name>': <reason>"))`.
- `embeddb` re-exports the derive so consumers write
  `use embeddb::FromEmbedRow;` and `#[derive(FromEmbedRow)]` from one crate:
  add `embeddb-derive` as a dependency of `embeddb` with a
  `#[cfg(feature = "derive")]`-gated `pub use embeddb_derive::FromEmbedRow;`.
  Feature `derive` is **on by default** (`default = ["derive"]`) so the ergonomic
  path is the default; consumers who want a proc-macro-free build disable it.
- Reconcile the exact re-export mechanics (name collision between the trait
  `FromEmbedRow` and the derive macro `FromEmbedRow` is fine — Rust allows a
  trait and a derive macro to share a name in the same namespace import, as
  `serde` does).

**Benchmarks — `packages/rust/embeddb/benches/` (criterion, dev-dep):**
- `write_throughput`: N single `execute` inserts vs one `execute_batch` of N.
- `analytics_latency`: repeated `analytics_query` on a fixed dataset.
- `parallel_reads`: K concurrent `analytics_query` at `reader_pool_size` 1 vs
  4 (demonstrates Phase 1's win).
- criterion `[[bench]]` harness = false. Not run in the node_modules-less
  worktree / not a test; `cargo bench -p embeddb` locally is the check.

**README + docs:**
- Document `reader_pool_size`, `analytics_for_each`, `execute_batch`,
  `#[derive(FromEmbedRow)]`, `checkpoint_passive` (if shipped), the live-read
  freshness contract (from the P3 result), and the benchmarks.
- Note the derive crate + `derive` default feature.

## Phase order & rationale

1 (pool) → 2 (batch/stream, uses the pool for reads) → 3 (live read, layered on
the pool + documents freshness) → 4 (consumability, wraps the finished
surface). Pool must precede live-read because both touch the reader; landing
live-read on the old single mutex then re-porting to the pool would be wasted
work.

## Testing (woven per phase + a coverage pass)

- Keep ALL v1–v4 tests green.
- P1: concurrent correctness, pool exhaustion/recovery, cross-connection
  freshness (above).
- P2: for_each order/count/empty, execute_batch commit + atomic rollback.
- P3: spike regression tests (whichever behavior observed) + checkpoint_passive
  if shipped.
- P4: derive macro round-trips a struct (named fields, `Option`, missing-column
  error); `project.json`/benches compile (`cargo bench --no-run` /
  `cargo build --benches`). Derive crate has its own unit test.

## Nx / project.json

- `embeddb` `project.json` already exists (v4). Add `packages/rust/embeddb-derive/project.json`
  mirroring the sibling rust libs (`@monodon/rust` build/test/lint,
  `target-dir: dist/target/embeddb-derive`).
- Add both new crates' membership to the root workspace `Cargo.toml`
  (`embeddb-derive`); `embeddb` already a member.
- `nx test embeddb` still cannot run inside the worktree (no node_modules) —
  validate JSON shape only; `cargo test -p embeddb`, `cargo test -p embeddb-derive`,
  `cargo build -p embeddb --benches` are the local gates.

## Deferred (updated)

WASM target, write-path prepared-statement cache (turso owns statement
handling), backend-swap trait (rejected — Turso+DuckDB only). Reader pool now
BUILT (was deferred). Live concurrent read resolved by the P3 spike either way.

## README note

Keep existing sections intact; append the v5 surface.
