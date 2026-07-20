# embeddb v6 — Lazy Reader + Crate Release Scaffold Design Spec

Date: 2026-07-19
Status: Approved, pre-implementation
Builds on: `packages/rust/embeddb` + `packages/rust/embeddb-derive` (v1 #14292 … v5 #14345 merged)

## Purpose

Two tracks on one branch. Stays **Turso (write) + DuckDB (read) only**.

1. **Lazy reader** — build the DuckDB reader pool on first analytics call instead
   of at `open()`. A Turso-only consumer never runs `INSTALL sqlite` / touches
   the sqlite_scanner extension, so the egress dependency only matters for code
   that actually runs analytics. Resolves the "distroless-clean for the write
   path" concern for the primary use.
2. **Crate release scaffold** — prepare both crates for crates.io. `embeddb-derive`
   publishes now (0.1.0); `embeddb` is scaffolded but held (`publish = false`)
   until its dependency is live, then flipped in a follow-up.

## Track 1 — Lazy reader

### Current (v5)
`EmbedDb { path, conn, config, reader: Arc<crate::pool::ReaderPool> }`.
`open_with` eagerly calls `ReaderPool::build(size, ext_dir)` — which builds
`size` DuckDB connections, each running `INSTALL sqlite; LOAD sqlite;`
(`prepare_sqlite_scanner`). So **every `open()` pays the extension load / egress
hit**, even a consumer that only writes via Turso and never reads analytics.

### Change
Wrap the pool in a lazy holder built in `pool.rs`:

```rust
pub(crate) struct LazyReaderPool {
    size: usize,
    ext_dir: Option<std::path::PathBuf>,
    inner: std::sync::Mutex<Option<std::sync::Arc<ReaderPool>>>,
}

impl LazyReaderPool {
    pub(crate) fn new(size: usize, ext_dir: Option<std::path::PathBuf>) -> Self {
        LazyReaderPool { size, ext_dir, inner: std::sync::Mutex::new(None) }
    }

    pub(crate) fn get(&self) -> crate::Result<std::sync::Arc<ReaderPool>> {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pool) = guard.as_ref() {
            return Ok(pool.clone());
        }
        let pool = std::sync::Arc::new(ReaderPool::build(self.size, self.ext_dir.as_deref())?);
        *guard = Some(pool.clone());
        Ok(pool)
    }
}
```

- `EmbedDb.reader` becomes `Arc<crate::pool::LazyReaderPool>`.
- `open_with` constructs `Arc::new(LazyReaderPool::new(config.reader_pool_size,
  config.duckdb_extension_dir.clone()))` — **no `ReaderPool::build` at open**.
- Each of the six analytics wrappers (`analytics_scalar_i64/f64/string`,
  `analytics_rows`→delegates, `analytics_query`, `analytics_for_each`), inside
  `spawn_blocking`: `let pool = lazy.get()?;` then `let guard = pool.checkout();`
  then the existing free-fn call. `get()` runs in the blocking context (the
  `INSTALL sqlite` network call is sync — correct to run off the async runtime).
- Failure of `get()` is **not cached** (only a successful build is stored under
  the mutex), so a consumer that stages the extension after a failed first
  analytics call can retry successfully.
- `ReaderPool` and its `build`/`checkout`/`ReaderGuard` are unchanged. The
  freshness `attach_fresh` per read is unchanged. Concurrency guarantees from v5
  hold (the pool itself is identical; only its construction is deferred).

### Concurrency note
`LazyReaderPool::get` holds `inner` only for the check-or-build. Two concurrent
first-callers serialize on the mutex: the first builds and stores, the second
sees `Some` and clones. Build-under-lock means the second waits out the first
build — acceptable (both need the pool before proceeding). No lock is held
across `checkout()` or the query.

### Tests (Track 1)
- **Laziness proof (deterministic):** open a DB with a config whose
  `duckdb_extension_dir` points at a path that makes `ReaderPool::build` FAIL,
  then `open`, `execute`, `checkpoint` must all SUCCEED (no reader built), and a
  subsequent `analytics_scalar_i64` must ERROR (reader built lazily, hits the bad
  dir). The implementer must confirm the chosen forcing function actually fails
  the build in this environment (e.g. a `duckdb_extension_dir` set to a path that
  is a file, or a non-writable/nonexistent path that `SET extension_directory` +
  `INSTALL sqlite` rejects); if the first choice does not fail deterministically,
  pick one that does — the test's contract is "open succeeds, analytics fails,
  proving the build was deferred to the analytics call."
- **Happy path unchanged:** an existing-style test (open → write → checkpoint →
  `analytics_scalar_i64`) still returns the correct value (lazy build succeeds on
  first analytics call, pool then reused).
- **Reuse across calls:** two sequential analytics calls on one `EmbedDb` both
  succeed and return correct values (second reuses the cached pool).
- All v1–v5 tests stay green (they call analytics, which now triggers the lazy
  build transparently).

## Track 2 — Crate release scaffold

KBVE crate release mechanics (verified against `.github/workflows/ci-publish.yml`
+ `rust-publish-crate.yml` + `ci-dispatch-manifest.json`):
- **Publish fires only when** `version.toml` `publish != false` AND the MDX/manifest
  version (LOCAL) > `version.toml` version (PUBLISHED), both non-`0.0.0`.
- MDX `version:` is the source of truth (patched into Cargo.toml at publish);
  `version.toml` `version` is the "last published" marker; `0.0.0` = "not
  initialized → skip". So a **first publish seeds `version.toml` at `0.0.1`**
  (non-zero, below the `0.1.0` target).
- The dispatch manifest (`.github/ci-dispatch-manifest.json`) is regenerated from
  the project MDX by `npx nx run astro-kbve:gen:ci-manifest`; a CI guard
  (`ci-manifest-guard.yml`) verifies it matches. The worktree has no node_modules,
  so the manifest entries are hand-written to match the generator's shape; the CI
  guard validates on the PR.

### 2a. `embeddb-derive` — publishes now (0.1.0)
- `packages/rust/embeddb-derive/version.toml`:
  ```toml
  version = "0.0.1"
  publish = true
  ```
- `apps/kbve/astro-kbve/src/content/docs/project/embeddb-derive-crate.mdx` —
  mirror the `jedi-crate.mdx` frontmatter shape with:
  `pipeline: crates`, `package_name: embeddb-derive`, `version: "0.1.0"`,
  `source_path: packages/rust/embeddb-derive`,
  `version_toml: packages/rust/embeddb-derive/version.toml`, plus the sidebar,
  tags, jsonld FAQ, and `bento` block (splash) describing the derive macro. A
  `BentoDoc` body import as jedi does.
- `packages/rust/embeddb-derive/Cargo.toml` `version` stays `0.0.1` (the sync
  step patches it to the MDX `0.1.0` at publish time).

### 2b. `embeddb` — scaffolded, held (`publish = false`)
- `packages/rust/embeddb/version.toml`:
  ```toml
  version = "0.0.1"
  publish = false
  ```
  (`publish = false` gates it off at `ci-publish.yml:180` regardless of version —
  held until the derive is live on crates.io and this is flipped in a follow-up.)
- `apps/kbve/astro-kbve/src/content/docs/project/embeddb-crate.mdx` — same
  frontmatter shape: `pipeline: crates`, `package_name: embeddb`,
  `version: "0.1.0"`, `source_path: packages/rust/embeddb`,
  `version_toml: packages/rust/embeddb/version.toml`, bento block describing the
  Turso+DuckDB single-file DB (pool, streaming, derive, live-read).
- **Dependency lockstep:** `packages/rust/embeddb/Cargo.toml` — change the
  `embeddb-derive` dependency from `version = "0.0.1"` to `version = "0.1.0"`
  (keep `path = "../embeddb-derive"`, `optional = true`). When `embeddb` is later
  unheld, cargo resolves the published `embeddb-derive 0.1.0`. (Path + version
  coexist; local builds use the path, crates.io publish uses the version.)

### 2c. Dispatch manifest entries
Hand-add two entries to the `crates` array of `.github/ci-dispatch-manifest.json`,
matching the existing entry shape (e.g. `jedi_crate`), placed in the array's sort
order (`embeddb_crate`, then `embeddb_derive_crate`, both before `erust_crate`):

```json
{
 "key": "embeddb_crate",
 "package_name": "embeddb",
 "version": "0.1.0",
 "version_toml": "packages/rust/embeddb/version.toml",
 "version_source": "apps/kbve/astro-kbve/src/content/docs/project/embeddb-crate.mdx",
 "version_target": "packages/rust/embeddb/Cargo.toml"
}
```
```json
{
 "key": "embeddb_derive_crate",
 "package_name": "embeddb-derive",
 "version": "0.1.0",
 "version_toml": "packages/rust/embeddb-derive/version.toml",
 "version_source": "apps/kbve/astro-kbve/src/content/docs/project/embeddb-derive-crate.mdx",
 "version_target": "packages/rust/embeddb-derive/Cargo.toml"
}
```
The exact key ordering / placement must match what `gen:ci-manifest` produces so
the guard passes — reconcile against the generator's sort at implementation time
(the existing array is alphabetical by `key`). If the CI guard rejects the
hand-written manifest, regenerate via the nx target on a node_modules-enabled
checkout and use that output.

### Release sequence (documented, not automated here)
On merge to dev → main, the pipeline publishes `embeddb-derive 0.1.0` (its
`publish = true`, LOCAL 0.1.0 > version.toml 0.0.1). `embeddb` is skipped
(`publish = false`). After `embeddb-derive 0.1.0` is live and indexed on
crates.io, a **follow-up PR** flips `embeddb/version.toml` to `publish = true`
(leaving version.toml `version` at `0.0.1` so 0.1.0 > 0.0.1 triggers), and the
next run publishes `embeddb 0.1.0`.

## Non-goals / deferred (unchanged)
WASM, write-path prepared-statement cache, live Valkey/Redis-protocol
integration (revisit later per user), backend-swap trait (rejected). The reader
pool, streaming, derive, and live-read all shipped in v1–v5.

## Testing summary
- Track 1: laziness proof + happy-path + reuse, all v1–v5 green.
- Track 2: `version.toml`/MDX are data — validated by `cargo build -p embeddb`
  (dep version resolves via path locally) + JSON validity of the manifest + the
  CI manifest-guard on the PR. No new Rust tests for Track 2.
- Gates: `cargo test -p embeddb`, `cargo test -p embeddb-derive`,
  `cargo build -p embeddb` (confirms the `0.1.0` dep still resolves via path).

## README
Append a short "Publishing" note to `packages/rust/embeddb/README.md`: MDX =
version source of truth, `version.toml` seed `0.0.1` + `publish` flag, derive
publishes first, embeddb held until the derive is live.
