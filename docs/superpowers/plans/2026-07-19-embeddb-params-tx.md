# embeddb v2 (params + transactions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add parameterized writes and handle-style transactions to the `embeddb` crate.

**Architecture:** `EmbedDb::execute` gains an `impl IntoParams` argument. A new `EmbedTx<'a>` wraps `turso::Transaction`, obtained via `Connection::unchecked_transaction(&self)`, exposing `execute`/`commit`/`rollback`.

**Tech Stack:** Rust, `turso` 0.7, `duckdb` 1.x, `tokio`, `thiserror`.

## Global Constraints

- Work only in `packages/rust/embeddb` (crate already exists, v1 merged).
- No inline comments in source (repo convention).
- No panics on the library path; all fallible ops return `Result`.
- Build/test scoped: `cargo test -p embeddb`. Never build the whole workspace.
- Turso 0.7 facts (verified): `Connection: Clone`; `execute(&self, sql, params: impl IntoParams) -> Result<u64>`; `unchecked_transaction(&self) -> Result<Transaction<'_>>`; `Transaction` derefs to `Connection`, has `commit(self)`/`rollback(self)`; drop-without-commit rolls back. Re-export path: `pub use turso::IntoParams;`.
- Commit after every task. No direct pushes to dev/main.

---

### Task 1: Parameterized `execute` + re-export `IntoParams`

**Files:**
- Modify: `packages/rust/embeddb/src/db.rs`
- Modify: `packages/rust/embeddb/src/lib.rs`

**Interfaces:**
- Produces: `pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64>`; `pub use turso::IntoParams;` from crate root.

- [ ] **Step 1: Update the failing tests first**

In `src/db.rs` tests mod, update the existing `execute_creates_and_inserts` test to the new arity and add a bound-param assertion:

```rust
#[tokio::test]
async fn execute_creates_and_inserts() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("w.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER, v REAL)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (1, 10.0)", ()).await.unwrap();
    let n = db.execute("INSERT INTO t VALUES (?, ?)", (2_i64, 20.0_f64)).await.unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn execute_bound_param_preserves_quote() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("q.db")).await.unwrap();
    db.execute("CREATE TABLE t (name TEXT)", ()).await.unwrap();
    db.execute("INSERT INTO t VALUES (?)", ("o'brien",)).await.unwrap();
    db.checkpoint().await.unwrap();
    let n = db.analytics_scalar_i64("SELECT count(*) FROM t WHERE name = 'o''brien'").await.unwrap();
    assert_eq!(n, 1);
}
```

Note: EVERY other existing call to `db.execute(...)` in the whole test module (Tasks from v1: `open`, checkpoint, analytics, quoted-path tests) must also be updated from `execute(sql)` to `execute(sql, ())`. Grep the file for `.execute(` and fix all call sites.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p embeddb`
Expected: compile error — `execute` takes 1 arg but 2 given (old signature), or the new call sites don't compile.

- [ ] **Step 3: Change the `execute` signature**

In `src/db.rs`:

```rust
pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
    let affected = self.conn.execute(sql, params).await?;
    Ok(affected)
}
```

- [ ] **Step 4: Re-export `IntoParams`**

In `src/lib.rs`, add:

```rust
pub use turso::IntoParams;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p embeddb`
Expected: all tests PASS (existing + two updated/new).

- [ ] **Step 6: Commit**

```bash
git add packages/rust/embeddb/src/db.rs packages/rust/embeddb/src/lib.rs
git commit -m "feat(embeddb): parameterized execute + re-export IntoParams"
```

---

### Task 2: `EmbedTx` transaction handle

**Files:**
- Create: `packages/rust/embeddb/src/tx.rs`
- Modify: `packages/rust/embeddb/src/db.rs` (add `begin`)
- Modify: `packages/rust/embeddb/src/lib.rs` (module + export)

**Interfaces:**
- Consumes: `EmbedDb` (holds `conn: turso::Connection`), `Result`.
- Produces:
  - `pub async fn begin(&self) -> Result<EmbedTx<'_>>` on `EmbedDb`.
  - `pub struct EmbedTx<'a>` with `pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64>`, `pub async fn commit(self) -> Result<()>`, `pub async fn rollback(self) -> Result<()>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/db.rs` tests mod:

```rust
#[tokio::test]
async fn tx_commit_persists() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("c.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
    let tx = db.begin().await.unwrap();
    tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
    tx.execute("INSERT INTO t VALUES (?)", (2_i64,)).await.unwrap();
    tx.commit().await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 2);
}

#[tokio::test]
async fn tx_rollback_discards() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("r.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
    let tx = db.begin().await.unwrap();
    tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
    tx.rollback().await.unwrap();
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 0);
}

#[tokio::test]
async fn tx_drop_without_commit_rolls_back() {
    let dir = tempfile::tempdir().unwrap();
    let db = EmbedDb::open(dir.path().join("d.db")).await.unwrap();
    db.execute("CREATE TABLE t (id INTEGER)", ()).await.unwrap();
    {
        let tx = db.begin().await.unwrap();
        tx.execute("INSERT INTO t VALUES (?)", (1_i64,)).await.unwrap();
    }
    db.checkpoint().await.unwrap();
    assert_eq!(db.analytics_scalar_i64("SELECT count(*) FROM t").await.unwrap(), 0);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p embeddb`
Expected: compile error — no `begin` method, no `EmbedTx`.

- [ ] **Step 3: Create `src/tx.rs`**

```rust
use crate::Result;

pub struct EmbedTx<'a> {
    tx: turso::Transaction<'a>,
}

impl<'a> EmbedTx<'a> {
    pub(crate) fn new(tx: turso::Transaction<'a>) -> Self {
        EmbedTx { tx }
    }

    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64> {
        let affected = self.tx.execute(sql, params).await?;
        Ok(affected)
    }

    pub async fn commit(self) -> Result<()> {
        self.tx.commit().await?;
        Ok(())
    }

    pub async fn rollback(self) -> Result<()> {
        self.tx.rollback().await?;
        Ok(())
    }
}
```

If `self.tx.execute(...)` does not resolve directly (method lives on the
`Connection` reached via `Deref`), call it through the deref target — the
`Transaction` derefs to `Connection`, so `(&*self.tx).execute(sql, params)` or
`self.tx.execute(sql, params)` both reach it; use whichever compiles. Keep the
`EmbedTx::execute` signature unchanged.

- [ ] **Step 4: Add `begin` on `EmbedDb`**

In `src/db.rs`:

```rust
pub async fn begin(&self) -> Result<crate::EmbedTx<'_>> {
    let tx = self.conn.unchecked_transaction().await?;
    Ok(crate::EmbedTx::new(tx))
}
```

- [ ] **Step 5: Wire module + export in `lib.rs`**

```rust
mod tx;
pub use tx::EmbedTx;
```

(Add alongside the existing `mod`/`pub use` lines; keep `mod db; mod error; mod analytics;` etc. intact.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p embeddb`
Expected: all tests PASS, including the three transaction tests.

- [ ] **Step 7: Commit**

```bash
git add packages/rust/embeddb/src/tx.rs packages/rust/embeddb/src/db.rs packages/rust/embeddb/src/lib.rs
git commit -m "feat(embeddb): EmbedTx transaction handle (begin/commit/rollback)"
```

---

### Task 3: README update

**Files:**
- Modify: `packages/rust/embeddb/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the usage example**

Replace/extend the usage section so it shows:
- a bound-parameter write: `db.execute("INSERT INTO t VALUES (?, ?)", (1_i64, "a")).await?;`
- a transaction: `let tx = db.begin().await?; tx.execute(...).await?; tx.commit().await?;`
- a one-line note: dropping an `EmbedTx` without `commit` rolls back.

Keep the existing "Deployment note: DuckDB sqlite extension" and
"Checkpoint-then-read model" sections intact.

- [ ] **Step 2: Verify the crate still builds and all tests pass**

Run: `cargo test -p embeddb`
Expected: all PASS (README change does not affect tests, but confirm no stray edits broke anything).

- [ ] **Step 3: Commit**

```bash
git add packages/rust/embeddb/README.md
git commit -m "docs(embeddb): README examples for params + transactions"
```

---

## Self-Review

- **Spec coverage:** parameterized execute + IntoParams re-export (T1); EmbedTx begin/commit/rollback + drop-rollback (T2); README (T3). All five spec tests mapped: bound insert + quote-preservation (T1), commit/rollback/drop (T2).
- **Placeholder scan:** none; the Deref note in T2 Step 3 is deliberate compile-adaptation guidance, not missing content.
- **Type consistency:** `EmbedTx<'a>`, `EmbedTx::new`, `begin`, `execute(sql, params)`, `commit`, `rollback`, `IntoParams` names consistent across tasks and match the spec.
