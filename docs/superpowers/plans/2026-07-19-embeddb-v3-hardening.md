# embeddb v3 (robustness + richer reads + migrations/config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `embeddb` (remove panics, honest checkpoint), add richer typed reads, add config + a migration runner — staying Turso+DuckDB only.

**Architecture:** Extend the existing `EmbedDb`/`EmbedTx`/`analytics.rs`. New `src/value.rs` (`EmbedValue`/`EmbedRow`), new `src/config.rs` (`EmbedConfig`). `EmbedDb` gains a stored `EmbedConfig`. Read path stays a fresh read-only DuckDB conn per call.

**Tech Stack:** Rust, `turso` 0.7, `duckdb` 1.x, `tokio`, `thiserror`.

## Global Constraints

- Work only in `packages/rust/embeddb`.
- No inline comments in source (repo convention).
- No panics on the library path — every fallible op returns `Result`.
- Build/test scoped: `cargo test -p embeddb`. Never build the whole workspace.
- Keep all existing v1/v2 tests green; update call sites when signatures change.
- Verified API facts:
  - turso `Row::get::<T>(idx) -> Result<T>`, `Row::get_value(idx) -> Result<turso::Value>` (Value: `Null|Integer(i64)|Real(f64)|Text(String)|Blob(Vec<u8>)`), `Rows::column_count()`, `Rows::next().await? -> Option<Row>`.
  - duckdb `Row::get_ref(idx) -> Result<ValueRef>` (variants incl `Null, Boolean(bool), TinyInt..BigInt(i64), HugeInt(i128), UTinyInt..UBigInt, Float(f32), Double(f64), Text(&[u8]), Blob(&[u8])`, plus Decimal/Timestamp/Date/Time/Interval), `Statement::column_count()`, `Rows::next()? -> Option<&Row>`.
- Commit after every task. No direct pushes to dev/main.

---

## Phase 1 — Robustness

### Task 1: Non-UTF8 path → error (no panic)

**Files:** Modify `src/error.rs`, `src/db.rs`, `src/analytics.rs`.

**Interfaces:**
- Produces: `EmbedError::NonUtf8Path(std::path::PathBuf)`; `pub(crate) fn path_str(path: &Path) -> Result<&str>` in `db.rs`; `analytics.rs` fns take `&str` path (or use a shared `path_str`).

- [ ] **Step 1: Failing test** — add to `db.rs` tests (unix-only; guard with `#[cfg(unix)]`):

```rust
#[cfg(unix)]
#[tokio::test]
async fn open_non_utf8_path_errors() {
    use std::os::unix::ffi::OsStrExt;
    use std::ffi::OsStr;
    let dir = tempfile::tempdir().unwrap();
    let bad = dir.path().join(OsStr::from_bytes(b"bad\xFFname.db"));
    let err = EmbedDb::open(&bad).await.unwrap_err();
    assert!(matches!(err, EmbedError::NonUtf8Path(_)));
}
```

- [ ] **Step 2: Run — expect FAIL** (`open` panics or wrong error). `cargo test -p embeddb open_non_utf8_path_errors`

- [ ] **Step 3: Add error variant** in `src/error.rs`:

```rust
    #[error("non-utf8 path: {0}")]
    NonUtf8Path(std::path::PathBuf),
```

- [ ] **Step 4: Add helper + use it.** In `src/db.rs` add:

```rust
pub(crate) fn path_str(path: &std::path::Path) -> Result<&str> {
    path.to_str().ok_or_else(|| crate::EmbedError::NonUtf8Path(path.to_path_buf()))
}
```

Change `open` to use it:

```rust
let db = turso::Builder::new_local(crate::db::path_str(&path)?)
    .build()
    .await?;
```

In `src/analytics.rs`, replace `sql_quote_path(path)` usage so the path first goes through `path_str`. Update `scalar_i64`/`scalar_f64` (and any new read fns) to build the ATTACH string from `sql_quote_str(crate::db::path_str(path)?)` instead of the lossy `path.display()`. Remove the now-unused `sql_quote_path` if nothing else uses it (keep `sql_quote_str`).

- [ ] **Step 5: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 6: Commit** — `feat(embeddb): non-utf8 path returns error instead of panic`

---

### Task 2: Checkpoint busy-check + retry

**Files:** Modify `src/error.rs`, `src/db.rs`.

**Interfaces:**
- Produces: `EmbedError::CheckpointBusy`; `checkpoint` retries and errors when busy. Uses module const `const DEFAULT_CHECKPOINT_RETRIES: u32 = 5;` (Phase 3 Task 5 replaces this read with `self.config.checkpoint_max_retries`).

- [ ] **Step 1: Failing test** — normal checkpoint still succeeds AND returns Ok; add a test asserting a checkpoint on a fresh written DB is Ok (guards against a regression where we always error):

```rust
#[tokio::test]
async fn checkpoint_reports_success_on_idle_db() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("cp.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
}
```

(The busy path is hard to force deterministically in a unit test; it is covered by inspection + the retry loop. Document this in the report.)

- [ ] **Step 2: Run — expect PASS already** for the success test (checkpoint currently returns Ok). This test locks in behavior before we add the busy branch. Proceed to implement the busy inspection.

- [ ] **Step 3: Add error variant** in `src/error.rs`:

```rust
    #[error("checkpoint busy after retries")]
    CheckpointBusy,
```

- [ ] **Step 4: Rewrite `checkpoint`** in `src/db.rs`:

```rust
const DEFAULT_CHECKPOINT_RETRIES: u32 = 5;

pub async fn checkpoint(&self) -> Result<()> {
    for _ in 0..=DEFAULT_CHECKPOINT_RETRIES {
        let mut rows = self.conn.query("PRAGMA wal_checkpoint(TRUNCATE)", ()).await?;
        let mut busy = 0_i64;
        if let Some(row) = rows.next().await? {
            busy = row.get::<i64>(0).unwrap_or(0);
        }
        while rows.next().await?.is_some() {}
        if busy == 0 {
            return Ok(());
        }
        tokio::task::yield_now().await;
    }
    Err(crate::EmbedError::CheckpointBusy)
}
```

- [ ] **Step 5: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 6: Commit** — `feat(embeddb): checkpoint inspects busy + retries, errors if stuck`

---

## Phase 2 — Richer analytics reads

### Task 3: `EmbedValue` + `EmbedRow`

**Files:** Create `src/value.rs`; modify `src/lib.rs`.

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Clone, PartialEq)]
  pub enum EmbedValue { Null, Int(i64), Float(f64), Text(String), Blob(Vec<u8>) }
  #[derive(Debug, Clone, PartialEq)]
  pub struct EmbedRow(pub Vec<EmbedValue>);
  ```
  with `EmbedRow::get(idx) -> Option<&EmbedValue>`, `as_i64/as_f64/as_str(idx) -> Option<..>`. Exported from lib.rs.

- [ ] **Step 1: Failing test** — in `src/value.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn row_accessors() {
        let r = EmbedRow(vec![EmbedValue::Int(7), EmbedValue::Text("hi".into()), EmbedValue::Null]);
        assert_eq!(r.as_i64(0), Some(7));
        assert_eq!(r.as_str(1), Some("hi"));
        assert_eq!(r.get(2), Some(&EmbedValue::Null));
        assert_eq!(r.as_i64(1), None);
        assert_eq!(r.get(9), None);
    }
}
```

- [ ] **Step 2: Run — expect FAIL** (module doesn't exist). Add `mod value; pub use value::{EmbedValue, EmbedRow};` to `lib.rs` first so it compiles to the failure.

- [ ] **Step 3: Implement `src/value.rs`:**

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum EmbedValue {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Blob(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct EmbedRow(pub Vec<EmbedValue>);

impl EmbedRow {
    pub fn get(&self, idx: usize) -> Option<&EmbedValue> {
        self.0.get(idx)
    }
    pub fn as_i64(&self, idx: usize) -> Option<i64> {
        match self.0.get(idx) {
            Some(EmbedValue::Int(v)) => Some(*v),
            _ => None,
        }
    }
    pub fn as_f64(&self, idx: usize) -> Option<f64> {
        match self.0.get(idx) {
            Some(EmbedValue::Float(v)) => Some(*v),
            _ => None,
        }
    }
    pub fn as_str(&self, idx: usize) -> Option<&str> {
        match self.0.get(idx) {
            Some(EmbedValue::Text(v)) => Some(v.as_str()),
            _ => None,
        }
    }
}
```

- [ ] **Step 4: Run — expect PASS.** `cargo test -p embeddb row_accessors`

- [ ] **Step 5: Commit** — `feat(embeddb): EmbedValue/EmbedRow generic result types`

---

### Task 4: `analytics_rows` + `analytics_scalar_string`

**Files:** Modify `src/analytics.rs`, `src/db.rs`.

**Interfaces:**
- Consumes: `EmbedValue`, `EmbedRow`, `path_str`.
- Produces: `analytics::rows(path, sql) -> Result<Vec<EmbedRow>>`, `analytics::scalar_string(path, sql) -> Result<String>`; `EmbedDb::analytics_rows(&self, sql) -> Result<Vec<EmbedRow>>`, `EmbedDb::analytics_scalar_string(&self, sql) -> Result<String>`.

- [ ] **Step 1: Failing test** — in `db.rs` tests:

```rust
#[tokio::test]
async fn analytics_rows_mixed_types() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("rows.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER, v REAL, name TEXT)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (?, ?, ?)", (1_i64, 1.5_f64, "a")).await.unwrap();
    db.execute("INSERT INTO t VALUES (?, ?, ?)", (2_i64, 2.5_f64, "b")).await.unwrap();
    db.checkpoint().await.unwrap();
    let rows = db.analytics_rows("SELECT id, v, name FROM t ORDER BY id").await.unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].as_i64(0), Some(1));
    assert_eq!(rows[0].as_f64(1), Some(1.5));
    assert_eq!(rows[0].as_str(2), Some("a"));
    assert_eq!(rows[1].as_str(2), Some("b"));
}

#[tokio::test]
async fn analytics_rows_handles_null() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("null.db")).await.unwrap();
    db.execute("CREATE TABLE t (a INTEGER, b TEXT)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1, NULL)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    let rows = db.analytics_rows("SELECT a, b FROM t").await.unwrap();
    assert_eq!(rows[0].get(1), Some(&crate::EmbedValue::Null));
}

#[tokio::test]
async fn analytics_scalar_string_reads_text() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("s.db")).await.unwrap();
    db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (?)", ("hello",)).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_string("SELECT name FROM t").await.unwrap(), "hello");
}
```

- [ ] **Step 2: Run — expect FAIL** (methods missing).

- [ ] **Step 3: Implement `analytics::rows` + `scalar_string`** in `src/analytics.rs`. Add a helper to open+attach (factor the repeated open/INSTALL/ATTACH/USE into one `fn attached_conn(path) -> Result<duckdb::Connection>`), then:

```rust
fn attached_conn(path: &Path) -> Result<duckdb::Connection> {
    let conn = duckdb::Connection::open_in_memory()?;
    prepare_sqlite_scanner(&conn)?;
    let attach = format!("ATTACH '{}' AS src (TYPE sqlite, READ_ONLY);", sql_quote_str(crate::db::path_str(path)?));
    conn.execute_batch(&attach)?;
    conn.execute_batch("USE src;")?;
    Ok(conn)
}

pub fn rows(path: &Path, sql: &str) -> Result<Vec<crate::EmbedRow>> {
    let conn = attached_conn(path)?;
    let mut stmt = conn.prepare(sql)?;
    let ncols = stmt.column_count();
    let mut out = Vec::new();
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let mut vals = Vec::with_capacity(ncols);
        for i in 0..ncols {
            vals.push(value_from_ref(row.get_ref(i)?)?);
        }
        out.push(crate::EmbedRow(vals));
    }
    Ok(out)
}

pub fn scalar_string(path: &Path, sql: &str) -> Result<String> {
    let conn = attached_conn(path)?;
    let val: String = conn.query_row(sql, [], |r| r.get(0))?;
    Ok(val)
}

fn value_from_ref(v: duckdb::types::ValueRef<'_>) -> Result<crate::EmbedValue> {
    use duckdb::types::ValueRef as V;
    Ok(match v {
        V::Null => crate::EmbedValue::Null,
        V::Boolean(b) => crate::EmbedValue::Int(b as i64),
        V::TinyInt(n) => crate::EmbedValue::Int(n as i64),
        V::SmallInt(n) => crate::EmbedValue::Int(n as i64),
        V::Int(n) => crate::EmbedValue::Int(n as i64),
        V::BigInt(n) => crate::EmbedValue::Int(n),
        V::UTinyInt(n) => crate::EmbedValue::Int(n as i64),
        V::USmallInt(n) => crate::EmbedValue::Int(n as i64),
        V::UInt(n) => crate::EmbedValue::Int(n as i64),
        V::Float(n) => crate::EmbedValue::Float(n as f64),
        V::Double(n) => crate::EmbedValue::Float(n),
        V::Text(b) => crate::EmbedValue::Text(String::from_utf8_lossy(b).into_owned()),
        V::Blob(b) => crate::EmbedValue::Blob(b.to_vec()),
        other => return Err(crate::EmbedError::Other(format!("unmapped duckdb type: {:?}", other))),
    })
}
```

Refactor the existing `scalar_i64`/`scalar_f64` to also use `attached_conn` (removes duplication). Adjust the exact `ValueRef`/`prepare`/`query` calls to compile against duckdb 1.x — the shapes above match the installed source but reconcile if a method name differs (e.g. `query` vs `query([])`).

- [ ] **Step 4: Add async wrappers** in `src/db.rs` (mirror the existing scalar wrappers):

```rust
pub async fn analytics_rows(&self, sql: &str) -> Result<Vec<crate::EmbedRow>> {
    let path = self.path.clone();
    let sql = sql.to_string();
    tokio::task::spawn_blocking(move || crate::analytics::rows(&path, &sql))
        .await
        .map_err(|e| crate::EmbedError::Other(e.to_string()))?
}

pub async fn analytics_scalar_string(&self, sql: &str) -> Result<String> {
    let path = self.path.clone();
    let sql = sql.to_string();
    tokio::task::spawn_blocking(move || crate::analytics::scalar_string(&path, &sql))
        .await
        .map_err(|e| crate::EmbedError::Other(e.to_string()))?
}
```

- [ ] **Step 5: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 6: Commit** — `feat(embeddb): analytics_rows + analytics_scalar_string`

---

## Phase 3 — Config + migrations

### Task 5: `EmbedConfig` + `open_with`

**Files:** Create `src/config.rs`; modify `src/db.rs`, `src/analytics.rs`, `src/lib.rs`.

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Clone)]
  pub struct EmbedConfig { pub journal_mode: String, pub duckdb_extension_dir: Option<std::path::PathBuf>, pub checkpoint_max_retries: u32 }
  impl Default for EmbedConfig { .. } // "WAL", None, 5
  ```
  `EmbedDb::open_with(path, config) -> Result<EmbedDb>`; `open` delegates. `EmbedDb` stores `config`. `checkpoint` uses `self.config.checkpoint_max_retries`. Read path receives `duckdb_extension_dir`.

- [ ] **Step 1: Failing test** — in `db.rs` tests:

```rust
#[tokio::test]
async fn open_with_custom_config() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = crate::EmbedConfig { journal_mode: "WAL".into(), duckdb_extension_dir: None, checkpoint_max_retries: 1 };
    let db = EmbedDb::open_with(dir.path().join("cfg.db"), cfg).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 1);
}
```

- [ ] **Step 2: Run — expect FAIL** (`open_with`, `EmbedConfig` missing).

- [ ] **Step 3: Create `src/config.rs`:**

```rust
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct EmbedConfig {
    pub journal_mode: String,
    pub duckdb_extension_dir: Option<PathBuf>,
    pub checkpoint_max_retries: u32,
}

impl Default for EmbedConfig {
    fn default() -> Self {
        EmbedConfig { journal_mode: "WAL".to_string(), duckdb_extension_dir: None, checkpoint_max_retries: 5 }
    }
}
```

Add to `lib.rs`: `mod config; pub use config::EmbedConfig;`.

- [ ] **Step 4: Thread config through `EmbedDb`.** Add `config: EmbedConfig` field. Rework:

```rust
pub async fn open(path: impl AsRef<Path>) -> Result<EmbedDb> {
    EmbedDb::open_with(path, crate::EmbedConfig::default()).await
}

pub async fn open_with(path: impl AsRef<Path>, config: crate::EmbedConfig) -> Result<EmbedDb> {
    let path = path.as_ref().to_path_buf();
    let db = turso::Builder::new_local(path_str(&path)?).build().await?;
    let conn = db.connect()?;
    let pragma = format!("PRAGMA journal_mode={}", config.journal_mode);
    conn.execute(&pragma, ()).await.ok();
    Ok(EmbedDb { path, conn, config })
}
```

Change `checkpoint`'s loop bound from `DEFAULT_CHECKPOINT_RETRIES` to `self.config.checkpoint_max_retries` (remove the const, or keep it only as `EmbedConfig::default`'s value). Change the read-path wrappers (`analytics_rows`, `analytics_scalar_i64/f64/string`) to pass `self.config.duckdb_extension_dir.clone()` into the analytics fns; update `analytics::*` signatures to accept `ext_dir: Option<&Path>` and have `prepare_sqlite_scanner` prefer it over the env var (env var remains the fallback when `None`).

- [ ] **Step 5: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 6: Commit** — `feat(embeddb): EmbedConfig + open_with (journal mode, ext dir, retries)`

---

### Task 6: Migration runner

**Files:** Create `src/migrate.rs`; modify `src/db.rs`, `src/lib.rs`.

**Interfaces:**
- Produces: `EmbedDb::migrate(&self, migrations: &[&str]) -> Result<()>`. Private table `_embeddb_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`.

- [ ] **Step 1: Failing tests** — in `db.rs` tests:

```rust
#[tokio::test]
async fn migrate_applies_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("m.db")).await.unwrap();
    let m = ["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"];
    db.migrate(&m).await.unwrap();
    db.migrate(&m).await.unwrap();
    db.execute("INSERT INTO a VALUES (1)", ()).await.unwrap();
    db.execute("INSERT INTO b VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM a").await.unwrap(), 1);
}

#[tokio::test]
async fn migrate_appended_applies_only_new() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("m2.db")).await.unwrap();
    db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
    db.migrate(&["CREATE TABLE a (id INTEGER)", "CREATE TABLE c (id INTEGER)"]).await.unwrap();
    db.execute("INSERT INTO c VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM c").await.unwrap(), 1);
}

#[tokio::test]
async fn migrate_failure_rolls_back_that_migration() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("m3.db")).await.unwrap();
    let err = db.migrate(&["CREATE TABLE a (id INTEGER)", "NOT VALID SQL"]).await;
    assert!(err.is_err());
    db.migrate(&["CREATE TABLE a (id INTEGER)"]).await.unwrap();
    db.execute("INSERT INTO a VALUES (1)", ()).await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM a").await.unwrap(), 1);
}
```

- [ ] **Step 2: Run — expect FAIL** (`migrate` missing).

- [ ] **Step 3: Create `src/migrate.rs`** with a free async fn the method delegates to:

```rust
use crate::{EmbedDb, Result};

pub(crate) async fn run(db: &EmbedDb, migrations: &[&str]) -> Result<()> {
    db.execute(
        "CREATE TABLE IF NOT EXISTS _embeddb_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)",
        (),
    ).await?;
    let applied = db
        .analytics_applied_migrations()
        .await
        .unwrap_or(-1);
    for (i, sql) in migrations.iter().enumerate() {
        let version = i as i64;
        if version <= applied {
            continue;
        }
        let tx = db.begin().await?;
        if let Err(e) = tx.execute(sql, ()).await {
            tx.rollback().await.ok();
            return Err(e);
        }
        if let Err(e) = tx.execute(
            "INSERT INTO _embeddb_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (version,),
        ).await {
            tx.rollback().await.ok();
            return Err(e);
        }
        tx.commit().await?;
    }
    Ok(())
}
```

Reading the highest applied version must NOT go through DuckDB (that requires a
checkpoint and read-only attach — heavy and stale). Instead read it directly on
the turso write connection. Add a small private helper on `EmbedDb` in `db.rs`:

```rust
pub(crate) async fn max_migration_version(&self) -> Result<i64> {
    let mut rows = self
        .conn
        .query("SELECT COALESCE(MAX(version), -1) FROM _embeddb_migrations", ())
        .await?;
    let mut v = -1_i64;
    if let Some(row) = rows.next().await? {
        v = row.get::<i64>(0).unwrap_or(-1);
    }
    while rows.next().await?.is_some() {}
    Ok(v)
}
```

Then in `migrate.rs` call `db.max_migration_version().await?` (replace the
`analytics_applied_migrations`/`unwrap_or(-1)` placeholder above with this call;
the table is guaranteed to exist because it is created immediately before).
Add `EmbedDb::migrate`:

```rust
pub async fn migrate(&self, migrations: &[&str]) -> Result<()> {
    crate::migrate::run(self, migrations).await
}
```

Add `mod migrate;` to `lib.rs`.

- [ ] **Step 4: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 5: Commit** — `feat(embeddb): idempotent migration runner`

---

## Phase 4 — Comprehensive tests + README

### Task 7: Coverage hardening + README

**Files:** Modify `src/error.rs` (test), `src/db.rs` (tests), `packages/rust/embeddb/README.md`.

**Interfaces:** none new (tests + docs only).

- [ ] **Step 1: Add error-mapping + edge tests.** In `error.rs` tests add coverage that `NonUtf8Path` and `CheckpointBusy` format via `Display` (`format!("{}", ..)` non-empty). In `db.rs` tests add:
  - `analytics_rows` on an empty table returns an empty `Vec`.
  - `analytics_scalar_string` round-trips a value containing a single quote (bound param) — e.g. insert `"o'brien"`, read back equal.
  - `EmbedRow` blob column round-trips (`CREATE TABLE t (b BLOB)`, insert via `execute` with a `Vec<u8>` param if `IntoParams` supports it, else `X'00FF'` literal; assert `EmbedValue::Blob`).
  - Multi-row ordering: 3 rows, assert full `Vec<EmbedRow>` contents in order.

  Write each as a `#[tokio::test]`. Every test must assert concrete expected values (no bare `is_ok()`).

- [ ] **Step 2: Run — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 3: Update README** — add sections/examples for: `EmbedConfig` + `open_with`; `analytics_rows`/`EmbedRow`/`EmbedValue` and `analytics_scalar_string`; the `migrate` runner (append-only, idempotent). Keep existing sections (Deployment note, Checkpoint-then-read, Transactions) intact. Note that `checkpoint` now errors with `CheckpointBusy` after retries, and non-UTF8 paths error rather than panic.

- [ ] **Step 4: Run full suite — expect PASS.** `cargo test -p embeddb`

- [ ] **Step 5: Commit** — `test(embeddb): coverage hardening + README for v3`

---

## Self-Review

- **Spec coverage:** Phase 1 non-utf8 (T1) + checkpoint busy (T2); Phase 2 value types (T3) + rows/scalar_string (T4); Phase 3 config (T5) + migrations (T6); Phase 4 coverage+README (T7). All spec test items mapped.
- **Placeholder scan:** the `analytics_applied_migrations` name in T6 Step 3's first code block is explicitly replaced by `max_migration_version` in the same step — no dangling placeholder in the final code.
- **Type consistency:** `EmbedValue`, `EmbedRow`, `EmbedConfig`, `path_str`, `max_migration_version`, `analytics::{rows, scalar_string, attached_conn, value_from_ref}`, error variants `NonUtf8Path`/`CheckpointBusy` used consistently across tasks.
- **Ordering note:** T2 introduces `DEFAULT_CHECKPOINT_RETRIES` const; T5 replaces it with `self.config.checkpoint_max_retries`. Intentional, called out in both tasks.
