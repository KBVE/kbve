# embeddb v4 — Value Completeness + Ergonomic Reads + Nx + Perf Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation
Builds on: `packages/rust/embeddb` (v1 #14292, v2 #14313, v3 #14321 merged)

## Purpose

Four improvement tracks, landed as ordered commits on one branch. Stays
**Turso (write) + DuckDB (read) only**.

1. Value-type completeness — stop erroring on bool / big ints / temporals.
2. Ergonomic reads — column names, single-row, query-into-struct.
3. Nx + consumability — real nx `project.json` + usage example.
4. Perf — reuse the DuckDB reader connection instead of rebuilding per call.

## Current surface (v3)

`EmbedValue { Null, Int(i64), Float(f64), Text(String), Blob(Vec<u8>) }`;
`EmbedRow(Vec<EmbedValue>)` with `get/as_i64/as_f64/as_str`. Reads:
`analytics_scalar_i64/f64/string`, `analytics_rows -> Vec<EmbedRow>`. `analytics.rs`
maps `duckdb::types::ValueRef` → `EmbedValue`, ERRORING on Bool→(actually maps to
Int today), HugeInt/UBigInt out-of-range, and all temporal/decimal/interval types.
Each read opens a fresh in-memory DuckDB conn + `INSTALL sqlite; LOAD sqlite;` +
`ATTACH`. `EmbedConfig` carries `duckdb_extension_dir`, `checkpoint_max_retries`.

---

## Phase 1 — Value-type completeness

Extend `EmbedValue` and the `value_from_ref` mapper.

New variants:
```rust
pub enum EmbedValue {
    Null, Int(i64), Float(f64), Text(String), Blob(Vec<u8>),
    Bool(bool),
    HugeInt(i128),
    Timestamp(i64), // microseconds since unix epoch (normalized from TimeUnit)
    Date(i32),      // days since unix epoch
    Time(i64),      // microseconds since midnight (normalized from TimeUnit)
}
```

Mapping changes in `value_from_ref`:
- `Boolean(b)` → `Bool(b)` (was `Int(b as i64)`).
- `HugeInt(n)` → `HugeInt(n)` (was try_from→Int or error). `UBigInt(n)` that
  fits i64 → `Int`; if it exceeds i64 → `HugeInt(n as i128)` (no longer errors —
  i128 holds any u64).
- `Timestamp(unit, v)` → `Timestamp(micros)` normalizing: Second×1_000_000,
  Millisecond×1_000, Microsecond×1, Nanosecond÷1_000.
- `Date32(v)` → `Date(v)`.
- `Time64(unit, v)` → `Time(micros)` (same normalization as Timestamp).
- `Decimal(d)` → `Text(d.to_string())`.
- Remaining exotic (Interval, Union, Struct, List, Map, Enum, etc.) → keep
  erroring, but improve the message: name the type and suggest casting to VARCHAR
  in SQL, e.g. `EmbedError::Other("unmapped duckdb type <X>; cast to VARCHAR in SQL")`.

New `EmbedRow` accessors: `as_bool`, `as_i128`, `as_timestamp`, `as_date`, `as_time`.

Reconcile the exact duckdb `TimeUnit` enum variant names against the installed
crate during implementation.

## Phase 2 — Ergonomic reads

- New `QueryResult`:
  ```rust
  pub struct QueryResult {
      pub columns: Vec<String>,
      pub rows: Vec<EmbedRow>,
  }
  impl QueryResult {
      pub fn column_index(&self, name: &str) -> Option<usize>;
      pub fn get(&self, row: usize, column: &str) -> Option<&EmbedValue>;
      pub fn len(&self) -> usize;      // row count
      pub fn is_empty(&self) -> bool;
  }
  ```
- `EmbedDb::analytics_query(&self, sql) -> Result<QueryResult>` — reads column
  names (from the executed statement) + all rows.
- `analytics_rows` re-expressed as `analytics_query(sql).map(|q| q.rows)` (keeps
  the existing signature + tests green).
- `EmbedDb::analytics_one(&self, sql) -> Result<Option<EmbedRow>>` — first row or None.
- Query-into-struct: a trait
  ```rust
  pub trait FromEmbedRow: Sized {
      fn from_row(row: &EmbedRow, columns: &[String]) -> Result<Self>;
  }
  ```
  and `EmbedDb::analytics_query_as<T: FromEmbedRow>(&self, sql) -> Result<Vec<T>>`
  that runs `analytics_query` then maps each row. Ship the trait + method + one
  test impl in the test module (no derive macro — YAGNI).

Column names: `Statement::column_count()` panics before `query()` (v3 gotcha) —
read column names the same safe way (after the query executes, via the first
`Row`'s statement `row.as_ref().column_names()`, or a documented equivalent).
If there are zero rows, fall back to preparing + reading names post-execute;
reconcile the exact duckdb API that returns names without panicking.

## Phase 3 — Nx + consumability

- Add `packages/rust/embeddb/project.json` mirroring the existing rust libs
  (`packages/rust/holy/project.json` is the template): `@monodon/rust` `build`,
  `test`, `lint` targets + an `e2e` `nx:run-commands` → `nx test embeddb`;
  `projectType: library`, `sourceRoot: packages/rust/embeddb/src`,
  `target-dir: dist/target/embeddb`.
- Add a runnable example `packages/rust/embeddb/examples/basic.rs` exercising
  open → migrate → execute (params) → transaction → checkpoint → analytics_query,
  printing results. (Compiled by `cargo build --examples`, not a test.)
- Note in the report: `nx test embeddb` cannot be run inside the node_modules-less
  worktree; verification of the nx target itself is deferred to CI / main tree.
  The `project.json` must be valid JSON matching the sibling libs' shape, and
  `cargo test -p embeddb` + `cargo build -p embeddb --examples` must pass locally.

## Phase 4 — Perf: reuse the DuckDB reader

Today every `analytics_*` call: `open_in_memory` + `INSTALL sqlite; LOAD sqlite;`
+ `ATTACH`. The extension load + connection create dominate. Reuse one reader.

- `EmbedDb` stores `reader: std::sync::Arc<std::sync::Mutex<duckdb::Connection>>`
  created in `open_with`: `open_in_memory` + `prepare_sqlite_scanner` once.
  (`duckdb::Connection` is `Send` but not `Sync`; `Mutex<Connection>` is
  `Send + Sync`, and it is locked only inside `spawn_blocking`.)
- Each analytics call, inside `spawn_blocking`: lock the reader, then
  **DETACH the previous `src` if attached, ATTACH the file fresh, run the query**.
  Re-attaching per call guarantees the reader sees post-checkpoint data (no stale
  page/schema cache). Use `ATTACH ... AS src (TYPE sqlite, READ_ONLY)` then
  `DETACH src` at the end (or `DETACH IF EXISTS` at the start) so the alias is
  reusable across calls.
- **Trade-off (documented):** a shared reader serializes analytics calls (they
  lock the same Mutex) — analytics reads no longer run in parallel. Acceptable
  for this single-file embedded lane; the setup cost saved dominates. If parallel
  reads are later needed, a small reader pool is the follow-up (deferred).
- **Critical correctness test:** write rows → checkpoint → analytics (sees N);
  write more → checkpoint → analytics again on the SAME db (sees N+M). Proves the
  reused reader is not serving stale data.
- Write-path prepared-statement caching is explicitly **out of scope** (turso
  manages its own statement handling; poor risk/reward) — noted, not built.

`EmbedDb` is no longer trivially `Debug` if it holds the reader — derive `Debug`
manually or `#[derive(Debug)]` only if all fields are Debug (Mutex<Connection>
is Debug if Connection is Debug; reconcile — if not, implement Debug by hand
printing just the path/config).

## Testing (woven per phase + a coverage pass)

- P1: bool, i128 (u64::MAX round-trips as HugeInt), timestamp/date/time columns
  map to the right variant with correct normalized values; decimal → text;
  interval still errors with the improved message; new accessors.
- P2: `analytics_query` returns correct column names + rows; `get(row, "col")`;
  `column_index`; `analytics_one` (row / None on empty); `analytics_query_as`
  into a test struct.
- P3: `project.json` is valid JSON; `examples/basic.rs` compiles
  (`cargo build -p embeddb --examples`).
- P4: reader-reuse freshness test (above); existing analytics tests still green.
- Keep all v1–v3 tests green.

## README

Document the new `EmbedValue` variants + accessors, `analytics_query`/`QueryResult`/
`analytics_one`/`analytics_query_as` + `FromEmbedRow`, the nx targets, and the
reader-reuse behavior (analytics reads serialize; reads always reflect the last
checkpoint). Keep existing sections intact.

## Deferred (unchanged)

Live concurrent write/read, WASM target, reader pool for parallel analytics,
write-path prepared-statement cache, backend-swap trait (rejected).
