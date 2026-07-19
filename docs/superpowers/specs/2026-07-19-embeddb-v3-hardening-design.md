# embeddb v3 — Robustness + Richer Reads + Migrations/Config Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation
Builds on: `packages/rust/embeddb` (v1 #14292, v2 #14313 merged)

## Purpose

Harden the crate and close the remaining ergonomics gaps that a real consumer
(e.g. Windmill) would hit, while staying strictly **Turso (write) + DuckDB
(read) only** — no rusqlite / backend-swap trait (rejected: reintroduces the C
toolchain the crate deliberately avoids).

Four phases, landed as ordered commits on one branch:

1. Robustness — remove known panics, make `checkpoint` honest about `busy`.
2. Richer analytics reads — multi-row / multi-column typed results.
3. Migrations + config — `EmbedConfig` and an idempotent migration runner.
4. Comprehensive tests — cover every public method, error paths, edge cases.

## Current surface (v2)

`EmbedDb`: `open`, `path`, `execute(sql, params)`, `checkpoint`, `begin -> EmbedTx`,
`analytics_scalar_i64/f64`, `close`. `EmbedTx`: `execute`, `commit`, `rollback`.
`EmbedError`: `Turso | Duck | Io | Other`. Read side (`analytics.rs`) opens a
fresh read-only DuckDB conn per call, `ATTACH (TYPE sqlite)`, honors
`EMBEDDB_DUCKDB_EXTENSION_DIR`.

---

## Phase 1 — Robustness

### 1.1 Non-UTF8 path panic
`open()` calls `path.to_str().unwrap()` (panics on non-UTF8 path); `analytics.rs`
uses `path.display()` (lossy). Both are the "no panic on library path" violation.

- Add error variant `EmbedError::NonUtf8Path(PathBuf)`.
- Add a shared helper (in `db.rs` or a small `util.rs`) `path_str(path: &Path) -> Result<&str>` returning `Err(NonUtf8Path)` when `to_str()` is `None`.
- Use it in `open()` (feeding `Builder::new_local`) and in `analytics.rs` (feeding the ATTACH string, replacing the lossy `display()`).

### 1.2 Checkpoint busy-check
`checkpoint()` drains `PRAGMA wal_checkpoint(TRUNCATE)` rows but ignores the
returned `(busy, log, checkpointed)` row. If `busy != 0`, the WAL was not fully
truncated → a subsequent reader can see stale data with `Ok(())` returned.

- Read column 0 (`busy`) from the returned row via the turso `Rows`/`Row` API.
- Retry up to `checkpoint_max_retries` times (default from config, e.g. 5), yielding via `tokio::task::yield_now()` between attempts.
- If still busy after retries, return `EmbedError::CheckpointBusy`.
- Add error variant `EmbedError::CheckpointBusy`.

---

## Phase 2 — Richer analytics reads

Current reads return a single scalar. Add generic multi-row/column reads with a
self-contained value type (no `duckdb` types leaked across the API).

- New `EmbedValue` enum in a new `src/value.rs`:
  ```rust
  #[derive(Debug, Clone, PartialEq)]
  pub enum EmbedValue { Null, Int(i64), Float(f64), Text(String), Blob(Vec<u8>) }
  ```
- New `EmbedRow(pub Vec<EmbedValue>)` with helper accessors `get(idx) -> Option<&EmbedValue>`, and typed convenience `as_i64/as_f64/as_str(idx) -> Option<...>`.
- `EmbedDb::analytics_rows(&self, sql: &str) -> Result<Vec<EmbedRow>>` — runs the query on the read DuckDB conn, reads all columns of every row generically by inspecting each column's DuckDB type and mapping to `EmbedValue` (Null/Int/Float/Text/Blob; other types fall back to `Text` via string rendering or error — decide during impl, prefer erroring on genuinely unmappable types over silent lossy coercion).
- Add `EmbedDb::analytics_scalar_string(&self, sql) -> Result<String>` for text scalars (mirrors the existing i64/f64 scalars).
- Keep `analytics_scalar_i64/f64` unchanged.
- All read methods keep the `spawn_blocking` async wrapper pattern.

## Phase 3 — Migrations + config

### 3.1 `EmbedConfig`
```rust
#[derive(Debug, Clone)]
pub struct EmbedConfig {
    pub journal_mode: String,              // default "WAL"
    pub duckdb_extension_dir: Option<PathBuf>, // overrides EMBEDDB_DUCKDB_EXTENSION_DIR when set
    pub checkpoint_max_retries: u32,       // default 5
}
impl Default for EmbedConfig { /* WAL, None, 5 */ }
```
- `EmbedDb::open_with(path, config) -> Result<EmbedDb>`; `open(path)` delegates with `EmbedConfig::default()`.
- `EmbedDb` stores the config; `checkpoint` uses `checkpoint_max_retries`; the read path passes `duckdb_extension_dir` (falling back to the env var when `None`) to `prepare_sqlite_scanner`.

### 3.2 Migration runner
```rust
pub async fn migrate(&self, migrations: &[&str]) -> Result<()>;
```
- Maintains a private table `_embeddb_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)`.
- On call: read the highest applied `version`; for each migration at index `i >= next`, run it and record `version = i` — each migration wrapped in a transaction (`begin`/`commit`, rollback on error).
- Idempotent: re-running with the same slice is a no-op; appending new entries applies only the new tail.
- Ordered: index = version. Callers must only append, never reorder (documented).

## Phase 4 — Comprehensive tests

Add tests covering, at minimum:
- Phase 1: non-UTF8 path returns `NonUtf8Path` error (construct an invalid path via `OsStr`/bytes on unix); checkpoint returns `Ok` on normal write (busy path is hard to force — document if not directly testable).
- Phase 2: `analytics_rows` with multiple rows and mixed column types (int, float, text, null); `EmbedRow` accessors; `analytics_scalar_string`.
- Phase 3: `open_with` custom config (non-default retries); `duckdb_extension_dir` config path used; `migrate` applies all on fresh DB, re-run is no-op, appended migration applies only the new one, a failing migration leaves prior state intact (rollback).
- Error mapping for each new variant.
- Keep all existing v1/v2 tests green.

## Error additions (summary)

`EmbedError::NonUtf8Path(PathBuf)`, `EmbedError::CheckpointBusy`. No change to
existing variants.

## Deferred (unchanged)

Live concurrent write/read, WASM target, backend-swap trait (rejected —
Turso+DuckDB only), connection pooling.
