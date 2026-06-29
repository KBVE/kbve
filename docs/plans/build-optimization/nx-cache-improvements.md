# Plan: Nx Cache & Build Improvements

## Goal

Cut the 30-40 min monorepo build by fixing cache correctness (so unchanged work is actually skipped) and standing up a self-hosted remote cache. These are framework-agnostic wins that help every app, unlike Module Federation (wrong tool — runtime micro-frontend sharing, no fit for our SSG/RN/Rust/UE stack).

## Current State (`nx.json`)

- `targetDefaults` set `cache: true` for `build`/`test`/`lint`/vite/esbuild/tsc/vitest. Good baseline.
- **`namedInputs.default = ["{projectRoot}/**/\*", "sharedGlobals"]`** — every file in a project is a cache input, including `README.md`, docs, and unrelated assets. A README edit busts the `build` cache.
- **`sharedGlobals = ["{workspaceRoot}/go.work"]`** — only `go.work`. Missing the global files that _should_ invalidate everything: root `Cargo.lock`, `pnpm-lock.yaml`, `tsconfig.base.json`, `nx.json` itself, toolchain pins.
- `production` excludes test/eslint files (good) but inherits the broad `{projectRoot}/**/*` base.
- Plugins: `@monodon/rust` (Rust), `@nxlv/python`, `@nx/eslint`, `@nx/vite`, `@nx/vitest`.
- **No remote cache** — local cache only; cold CI runners start from zero every time.

## Problems → Fixes

### 1. Over-broad `default` input busts cache on noise

Non-source files (`README.md`, `docs/**`, images) are hashed into the build cache.

**Fix**: tighten `default`/`production` to exclude doc and non-source noise:

```jsonc
"production": [
  "default",
  "!{projectRoot}/**/*.md",
  "!{projectRoot}/**/README*",
  "!{projectRoot}/docs/**/*",
  // existing test/eslint exclusions...
]
```

Verify nothing legitimately depends on `.md` (e.g. `rust-embed` of templates, MDX-driven codegen — jedi has no askama templates after cleanup, but rows/astro may embed assets; scope per-project if needed).

### 2. `sharedGlobals` missing global invalidators

Changing `pnpm-lock.yaml` or root `Cargo.lock` should bust dependent caches; today it may not.

**Fix**:

```jsonc
"sharedGlobals": [
  "{workspaceRoot}/go.work",
  "{workspaceRoot}/pnpm-lock.yaml",
  "{workspaceRoot}/Cargo.lock",
  "{workspaceRoot}/tsconfig.base.json",
  "{workspaceRoot}/nx.json"
]
```

Balance: too broad = everything rebuilds on any lockfile change (correct but costly); too narrow = stale cache bugs. Lockfiles belong here; per-language toolchain pins too.

### 3. Rust caching is coarse (`@monodon/rust`)

Rust `build` outputs the whole `target-dir`; cargo's own incremental + cargo-chef (Docker) overlap awkwardly with Nx cache, and a single crate change can invalidate a large output.

**Fixes**:

- Ensure each Rust project's `build` declares correct `outputs` (the specific `target-dir`) and `inputs` (exclude docs/tests from `production`).
- Add **`sccache`** as the rustc wrapper (`RUSTC_WRAPPER=sccache`) backed by the same remote store — caches _compiled dependencies_ across builds and machines, which Nx project-level caching can't do for sub-crate granularity. Pairs with, doesn't replace, Nx cache.
- Pursued in tandem with [jedi-deps-optimization.md](./jedi-deps-optimization.md): feature-gating shrinks what compiles at all — the biggest Rust win.

### 4. No remote cache

Cold CI runners rebuild everything. Self-hosting is the requirement (Nx Cloud not in use).

**Critical security context**: Nx's `@nx/azure-cache` / `@nx/s3-cache` / `@nx/gcs-cache` / `@nx/shared-fs-cache` are **deprecated as of 2026-05-21** due to **CVE-2025-36852 (CREEP)** — a single read+write credential with no branch tracking enables cache poisoning. **Do not use them.**

**Fix — roll our own per Nx's self-hosted OpenAPI cache spec**:

- Stand up a small **Axum service** (on-brand; we run Axum everywhere) implementing the Nx remote-cache OpenAPI spec, backed by **Azure Blob** (our existing Azure stack).
- Point Nx at it via `NX_SELF_HOSTED_REMOTE_CACHE_SERVER`.
- **Mandatory** anti-CREEP control: **`PUT` returns `409 Conflict` if the key already exists** (write-once / immutable artifacts) — this is what the deprecated packages lacked.
- Auth tiering: read-only token for untrusted/PR builds; write token only for trusted branches (the branch tracking the CVE packages missed).
- Azure Blob lifecycle policy for TTL eviction.
- ~200 LOC Axum + Blob SDK; deploy like other internal services.

### 5. Ensure `affected` is the CI entrypoint

Confirm CI runs `nx affected -t build test lint` against a correct base/head, not `run-many`/build-all. This is the largest single win if not already in place.

## Work Breakdown

1. **Audit current CI invocation** — confirm `affected` vs build-all; fix base/head SHA resolution.
2. **Tighten `namedInputs`** — exclude docs/markdown from `production`; expand `sharedGlobals` with lockfiles + base configs. Measure cache hit-rate before/after.
3. **Per-project `outputs`/`inputs` audit** — especially Rust projects; ensure outputs are precise and inputs exclude noise.
4. **Build the Axum + Azure Blob remote cache server** — implement Nx OpenAPI cache spec, enforce 409-on-existing, tiered auth. Deploy.
5. **Wire `RUSTC_WRAPPER=sccache`** in CI, backed by the same remote store.
6. **Measure** — capture wall-clock for a representative PR (touch one app) before/after each change; track cache hit-rate.

## Validation

- Editing only a `README.md` does **not** invalidate that project's `build` cache.
- Touching `pnpm-lock.yaml` **does** invalidate dependent JS caches; `Cargo.lock` invalidates Rust.
- Second CI run of an unchanged branch is a near-total cache hit (local + remote).
- Remote cache rejects overwrite of an existing key (`409`), verified by test.
- `nx affected` on a single-app change builds only that app + its dependents.

## Risks / Notes

- Remote cache security is on us — the 409 write-once control is non-negotiable; get it reviewed.
- Over-tightening inputs risks **stale cache** (missing a real dependency) — worse than a slow build. Add lockfiles/base configs to `sharedGlobals` conservatively and validate.
- `sccache` + cargo-chef + Nx cache overlap — keep roles clear: Nx = task-level, sccache = compiler-artifact-level, cargo-chef = Docker-layer-level.
- Nix was considered as an alternative build/cache system; deferred — it caches a fat dep tree better but doesn't shrink it, and the migration cost is high. Feature-gating (jedi plan) + sccache + this remote cache deliver most of the gain without a build-system rewrite.

## Related

- [jedi-deps-optimization.md](./jedi-deps-optimization.md)
- [proto-distribution.md](./proto-distribution.md)
