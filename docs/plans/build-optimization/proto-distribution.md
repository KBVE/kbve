# Plan: Proto Distribution

## Goal

Make the centralized protobuf definitions consumable by any crate/app/repo without a hardcoded relative path into the monorepo, so that (a) generated code is cached cleanly and (b) leaf apps like `jobboard` can be extracted to their own repo later with a one-line dependency swap.

## Current State

- **Source of truth**: `packages/data/proto/` — 40+ `.proto` files grouped by domain (`jedi/`, `jobboard/`, `kbve/`, `git/`, `rows/`, item/npc/map/quest db, etc.).
- **Generation**: each Rust crate has its own `build.rs` that runs `tonic-prost-build`, gated by the `BUILD_PROTO` env var, writing generated `.rs` into the crate's committed `src/proto/`.
    - `jedi/build.rs`: compiles its slice, applies `type_attribute` serde derives, writes `src/proto`.
    - `jobboard/build.rs`: **hardcodes `proto_root = "../../packages/data/proto"`** — breaks the moment the app leaves the monorepo.
- Generated Rust is **checked in** (vendored) — `BUILD_PROTO` unset = skip codegen, use committed output.
- TS side: `@kbve/proto` vendors generated schemas (`gen-all` with `vendorTo`); app-tagged builds trip lint (see memory).

## Problem

Three classes of consumer need the generated code, each blocked differently:

1. **In-repo Rust crates** — work today via relative path, but the path coupling means no crate can move.
2. **TS/JS consumers** — already vendored via `@kbve/proto`, but generation is a separate pipeline.
3. **Extracted repos** (future `jobboard`) — cannot reach `../../packages/data/proto` at all.

## Options

### Option A — Publish a generated Rust crate (`kbve-proto` / `jedi-proto`)

- One crate owns the `.proto` → Rust codegen, publishes to crates.io (like `jedi` already does).
- Consumers depend on it by version; no `build.rs` codegen, no `BUILD_PROTO`.
- **Pro**: clean version pin, works across repos, matches the `jedi`-on-crates.io model already proven.
- **Con**: another publish step; per-message `type_attribute` customizations (serde derives) must live in the proto crate, shared by all consumers — fine if customizations are universal, friction if app-specific (jobboard adds `#[serde(default)]` to its own messages).
- **Mitigation**: split — a base `kbve-proto` crate for shared messages; app-specific serde tweaks stay in app codegen over the _published `.proto` files_ (ship `.proto` in the crate via `include_str!`/`OUT_DIR`, or a companion `-proto-src` crate).

### Option B — Distribute `.proto` sources as a package, keep per-crate codegen

- Publish `packages/data/proto` as a versioned artifact (a `*-proto-src` crate that exposes the `.proto` files, or an npm/OCI bundle).
- Each consumer keeps its `build.rs` but points at the dep's bundled protos instead of a relative path.
- **Pro**: preserves per-app `type_attribute` customization exactly as today; smallest behavioral change.
- **Con**: every consumer still runs codegen (slower than depending on prebuilt types); two-step version dance.

### Option C — Git submodule / subtree of the proto dir

- Extracted repos pull `packages/data/proto` as a submodule.
- **Pro**: zero packaging.
- **Con**: submodule UX pain, version drift, no semver. Not recommended.

## Recommendation

**Option A (publish generated crate) for shared messages, with `.proto` sources shipped for app-specific codegen.** It matches the already-working `jedi`-on-crates.io pattern, removes `build.rs` codegen from the hot path (faster, more cacheable builds), and unblocks extraction. Keep app-specific serde customizations local by shipping the `.proto` files in the crate for the rare consumer that needs custom derives.

## Work Breakdown

1. **Inventory customizations** — catalog every `type_attribute` / `field_attribute` / `serde(default)` across all `build.rs` files. Classify universal vs app-specific.
2. **Create `kbve-proto` crate** under `packages/rust/` — owns codegen for shared messages with universal derives, exposes generated modules. Optionally re-export `tonic` service stubs behind a `grpc` feature (coordinate with [jedi-deps-optimization.md](./jedi-deps-optimization.md)).
3. **Ship `.proto` sources** in the crate (e.g. via `include_dir!` or published alongside) for consumers needing custom codegen.
4. **Migrate one consumer end-to-end** — pick `jobboard`:
    - Replace its `build.rs` relative-path codegen with a dependency on `kbve-proto` for shared types.
    - Keep only the truly app-specific messages (`SubmitApplicationInput`, `DecisionInput` `serde(default)`) generated locally from the shipped `.proto`.
    - Confirm a path-free build.
5. **Versioning** — wire proto crate version bump into the existing manifest/MDX release flow (no manual bumps, per repo convention).
6. **TS parity** — confirm `@kbve/proto` `gen-all` still works or shares the same source; don't fork the source of truth.
7. **Roll out** to remaining Rust consumers incrementally.

## Validation

- `jobboard` builds with **no** `../../packages/data/proto` reference and no `BUILD_PROTO` requirement for shared types.
- Generated output byte-identical (or intentionally diffed) vs current vendored `src/proto`.
- A consumer can build offline against published crate versions only.
- `@kbve/proto` TS output unchanged.

## Risks / Notes

- Per-message serde customization is the main friction — get the universal/app-specific split right before publishing, or churn the crate API.
- `BUILD_PROTO`-gated, checked-in generated code is the current safety net; keep it until the published crate is proven, then remove the codegen path.
- Coordinate the `grpc` feature boundary with jedi so service stubs aren't compiled by message-only consumers.

## Related

- [jedi-deps-optimization.md](./jedi-deps-optimization.md)
- [nx-cache-improvements.md](./nx-cache-improvements.md)
