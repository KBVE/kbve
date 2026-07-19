# embeddb v2 — Parameterized Writes + Transactions Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation
Builds on: `packages/rust/embeddb` (v1, merged PR #14292)

## Purpose

Close the top deferred item from the embeddb v1 spec: the write path currently
only exposes `execute(&self, sql: &str)` with no parameter binding, forcing
consumers to string-format SQL (injection footgun, review finding M5). This
increment adds parameterized writes and multi-statement transactions.

Non-goals (still deferred): checkpoint busy-check, live concurrent write/read,
backend-swap trait (Turso ↔ rusqlite).

## Turso 0.7 facts (verified against installed crate source)

- `turso::Connection` is `Clone`.
- `Connection::execute(&self, sql, params: impl IntoParams) -> Result<u64>` —
  parameter binding already exists; v1 just passed `()`.
- `turso::IntoParams` is implemented for `()`, tuples `(T, ...)`, `[T; N]`,
  `Vec<T>`, named `[(&'static str, T); N]`, `Vec<(String, T)>`, and `Params`.
- `Connection::unchecked_transaction(&self) -> Result<Transaction<'_>>` obtains a
  transaction from a shared `&self` (no `&mut` needed).
- `Transaction<'conn>` derefs to `Connection` (so `tx.execute(...)` works),
  and has `commit(self)`, `rollback(self)`. Dropping without commit rolls back
  (turso default drop behavior).

## Changes

### 1. Parameterized `execute`

Change the signature on `EmbedDb`:

```rust
pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64>
```

- Body: `self.conn.execute(sql, params).await.map_err(Into::into)`.
- Re-export `turso::IntoParams` from the crate root (`pub use turso::IntoParams;`)
  so consumers can name the bound without a direct turso dependency.
- This is a breaking change to `execute`'s arity. Acceptable at version `0.0.1`
  with no external consumers. All existing no-parameter call sites become
  `execute(sql, ())`.

### 2. Transactions — handle style

New public type `EmbedTx<'a>` wrapping `turso::Transaction<'a>`.

```rust
impl EmbedDb {
    pub async fn begin(&self) -> Result<EmbedTx<'_>>;
}

pub struct EmbedTx<'a> { tx: turso::Transaction<'a> }

impl<'a> EmbedTx<'a> {
    pub async fn execute(&self, sql: &str, params: impl turso::IntoParams) -> Result<u64>;
    pub async fn commit(self) -> Result<()>;
    pub async fn rollback(self) -> Result<()>;
}
```

- `begin` uses `self.conn.unchecked_transaction().await?`.
- `EmbedTx::execute` delegates to the transaction (via its `Deref` to
  `Connection`, or directly): `self.tx.execute(sql, params).await`.
- Dropping an `EmbedTx` without calling `commit` rolls back (turso default) —
  documented, and covered by a test.
- Handle style chosen over a `write_tx(|tx| async { ... })` closure to avoid
  async-closure lifetime friction; idiomatic (sqlx-like).

Placement: `EmbedTx` lives in a new `src/tx.rs`, exported from `lib.rs`.

### 3. Error handling

No new error variants — `turso::Error` already maps via the existing
`EmbedError::Turso(#[from] turso::Error)`.

## Testing

1. **Parameterized insert:** create table, `execute("INSERT INTO t VALUES (?, ?)", (1_i64, 42.0_f64))`, checkpoint, assert DuckDB `count`/value matches. Proves binding works (no string interpolation).
2. **Param avoids injection-style breakage:** insert a text value containing a single quote via a bound param (e.g. `("o'brien",)`), read back, assert intact — a raw `format!` would have broken.
3. **Transaction commit:** `begin` → two `execute` inserts → `commit` → checkpoint → DuckDB count == 2.
4. **Transaction rollback:** `begin` → insert → `rollback` → checkpoint → count == 0.
5. **Drop without commit rolls back:** `begin` → insert → drop the `EmbedTx` (no commit) → checkpoint → count == 0.

All via `cargo test -p embeddb`. Existing v1 tests updated for the new
`execute(sql, ())` arity.

## README

Update the usage section: show a bound-parameter `execute` and a
`begin`/`execute`/`commit` transaction example. Note drop-without-commit =
rollback.

## Deferred (unchanged)

checkpoint busy-check, live concurrent read, backend-swap trait, WASM target.
