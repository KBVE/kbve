# Plan: jedi Dependency Optimization

## Goal

Cut jedi's compile cost for every downstream consumer by feature-gating its heavy default dependencies. Today `default = []` is misleading — most heavy crates compile unconditionally, so every consumer (e.g. `jobboard` pulling only `postgres`) still builds the full gRPC + Twitch + Redis + HTTP stack.

This is the single largest lever on the 30-40 min monorepo build: gating means a dependency is _never compiled_ for a consumer that doesn't need it — strictly better than any cache, which only makes recompiling it faster.

## Current State

- jedi: ~17k LOC, `packages/rust/jedi`, published to crates.io as `jedi` 0.2.2 (MIT).
- `[features] default = []`, but the following are non-optional and compile for everyone:
    - `tonic`, `tonic-health`, `tonic-prost`, `tonic-reflection`, `prost`
    - `twitch-irc` (full rustls/ws TLS stack)
    - `fred` (Redis, ~13 features)
    - `axum`, `axum-extra`, `tower`, `tower-http`, `hyper`, `hyper-util`, `askama`
    - `reqwest`, `tokio` (`full`)
- Existing optional features: `postgres`, `clickhouse`, `prometheus`, `valkey`, plus marker features `forgejo`, `itch`.
- `src/lib.rs` declares modules flat with no `#[cfg(feature = ...)]` gating.

## Dependency Usage Audit (files touching each dep)

| Dep                | Files | Action                                                               |
| ------------------ | ----- | -------------------------------------------------------------------- |
| `askama`           | **0** | **Remove entirely — dead dependency**                                |
| `twitch_irc`       | 1     | Gate behind `twitch`                                                 |
| `tonic*` / `prost` | 3     | Gate behind `grpc` (+ `grpc-server` for health/reflection)           |
| `fred`             | 7     | Gate behind `redis`                                                  |
| `reqwest`          | 8     | Gate behind `http`/`ai` as appropriate                               |
| `axum*`            | 10    | Gate behind `http` (widely used — confirm core vs optional boundary) |
| `clickhouse`       | 10    | Already optional (`clickhouse`)                                      |
| `tokio_postgres`   | 3     | Already optional (`postgres`)                                        |

## Proposed Feature Layout

Keep a tiny always-on core; everything heavy opt-in.

```
default = []

# core (always): serde, serde_json, bytes, thiserror, ulid, chrono,
#   jsonwebtoken, dashmap, bitflags, tracing, rustc-hash, flexbuffers

grpc        = ["dep:tonic", "dep:tonic-prost", "dep:prost"]
grpc-server = ["grpc", "dep:tonic-health", "dep:tonic-reflection"]
http        = ["dep:axum", "dep:axum-extra", "dep:tower", "dep:tower-http",
               "dep:hyper", "dep:hyper-util"]
redis       = ["dep:fred"]
twitch      = ["dep:twitch-irc"]
ai          = ["dep:reqwest"]            # groq / featherless clients
postgres    = [ ... unchanged ... ]
clickhouse  = ["dep:clickhouse"]
prometheus  = ["dep:axum-prometheus", "dep:metrics"]
valkey      = ["dep:lru"]
```

(`reqwest` may be needed by more than `ai` — verify; if `http`/`forgejo`/`github` clients use it, fold it into a shared `http-client` feature those pull in.)

## Work Breakdown

1. **Remove `askama`** — 0 usages. Drop from `Cargo.toml`. Quick win, isolated PR.
2. **Map module → feature** — for each `src/` module, determine which heavy dep it pulls. Produce the exact `#[cfg(feature = ...)]` set for `lib.rs` and submodule `mod.rs` files.
3. **Make deps `optional = true`** in `Cargo.toml` and define the feature groups above.
4. **Gate modules** — add `#[cfg(feature = ...)]` to module declarations and any `pub use` re-exports. Gate gRPC codegen include in `src/proto/mod.rs` behind `grpc`.
5. **Fix consumers** — update each downstream crate's `jedi = { features = [...] }` to the minimal set:
    - `jobboard`: likely `["postgres", "grpc"]` (verify it doesn't use twitch/fred/http).
    - Audit every in-repo consumer (`grep -rl 'jedi =' --include=Cargo.toml`).
6. **CI matrix** — add a feature-powerset smoke build (`cargo hack check --feature-powerset --depth 2` or a curated subset) so gating regressions surface. Keep it cheap/scheduled, not per-PR.
7. **Measure** — record clean `cargo build` wall-time for `jobboard` before/after gating to quantify the win.

## Validation

- `cargo build -p jedi` with `--no-default-features` succeeds (core only).
- Each feature builds in isolation: `cargo check -p jedi --no-default-features --features <f>`.
- `cargo check -p jedi --all-features` matches today's behavior.
- All downstream crates build with their trimmed feature sets.
- No accidental `default` feature leakage (consumers should set `default-features = false` where they want strict minimal).

## Risks / Notes

- `tokio = "full"` pulls every Tokio feature; narrow to the actually-used set in a follow-up (separate from feature gating to keep blast radius small).
- Gating widely-used deps (`axum`, 10 files) needs care — decide whether HTTP types are part of jedi's core surface or genuinely optional. If core, leave ungated and focus gains on `twitch`/`redis`/`grpc`/`ai`.
- crates.io consumers: feature changes are semver-additive if `default = []` stays empty, but trimming what a _named_ feature pulls can break external users — bump minor and document.
- Coordinate with [proto-distribution.md](./proto-distribution.md): the `grpc` feature and `src/proto` codegen are coupled.

## Execution Status (2026-06-29)

| Step                | Status      | PR     | Notes                                                                                          |
| ------------------- | ----------- | ------ | ---------------------------------------------------------------------------------------------- |
| Remove `askama`     | ✅ done     | #13587 | Dead dep dropped.                                                                               |
| Gate `twitch`       | ✅ done     | #13587 | `twitch = ["dep:twitch-irc"]`; gated `wrapper/twitch_wrapper` + `proto/twitch`.                 |
| Gate `fred` (redis) | ✅ done     | #13593 | Folded into `valkey = ["dep:lru", "dep:fred"]` — fred is internal-only, no consumer touches it. |
| Gate `grpc`         | ✅ done     | (this) | `tonic*` optional behind `grpc`; gated 4 proto service submods + `error.rs` Status impls.       |
| `reqwest` / `axum`  | ⬜ deferred | —      | Kept core (auth-core + response contract). See findings below.                                  |
| `tokio = "full"`    | ⬜ deferred | —      | Narrow feature set in separate PR.                                                              |
| CI feature matrix   | ⬜ todo     | —      | `cargo hack --feature-powerset` smoke build.                                                    |
| Measure build win   | ⬜ todo     | —      | Wall-time before/after for a trimmed consumer.                                                  |

**grpc finding (verified):** jedi's tonic transport is internal/unused — no consumer references jedi's grpc service mods or `From<JediError> for tonic::Status`. jobboard + rows carry their **own** `tonic` dep + proto, not jedi's. `prost` message types stay **core** (every proto struct derives `prost::Message`); only `tonic`/`tonic-prost`/`tonic-health`/`tonic-reflection` go optional. tonic-health + tonic-reflection had **0 src usages** but are kept under `grpc` for the server-bootstrap story. Service codegen lives in 4 vendored submods (`{click_house,redis}_service_{client,server}`) gated with `#[cfg(feature = "grpc")]`; `build.rs` codegen is manual (`BUILD_PROTO`) so the gates are hand-maintained.

## Investigation Findings (2026-06-29, verified against code)

### Confirmed

- **`askama` dead — 0 usages.** Drop `askama = "0.15.4"` from `Cargo.toml`. Zero-risk PR.
- **`twitch-irc` cleanly isolated.** Only `src/wrapper/twitch_wrapper.rs` + `src/proto/twitch.rs`. No `twitch_irc`/`twitch::` refs anywhere else. Gate `pub mod twitch_wrapper` (in `src/wrapper/mod.rs`) + `pub mod twitch` (in `src/proto/mod.rs`) behind `twitch`. High-value, low-risk — full rustls/ws TLS stack drops for all 17 consumers (none use twitch).
- **Postgres pattern already correct.** `error.rs:94` and `:142,184` use `#[cfg(feature = "postgres")]`. Copy this pattern for the new gates.

### Central blocker: `src/entity/error.rs` (the `JediError` core type)

Imports **unconditionally** at top: `axum`, `fred`, `tower`. Every consumer touches `JediError`. Unconditional From impls that must be cfg-gated before deps can go optional:

- `From<RedisError>` (`error.rs:171`) → gate behind `redis`
- `From<JediError> for tonic::Status` (`:101`) + `From<tonic::Status>` (`:120`) → gate behind `grpc`
- `From<BoxError>` + `tower::timeout` (`:132`) → gate behind `http`
- `impl IntoResponse for JediError` (axum `Json`/`Response`) → gate behind `http`

This file is the real work. No gate lands until its imports + impls are cfg-split.

### `reqwest` is auth-core, NOT just `ai` — plan correction

Used in 8 files incl. `src/jwks.rs` + `src/jwt_cache.rs` (JWKS fetch for ES256/JWT verification = core surface every auth consumer needs). Do **not** fold reqwest into `ai`. Keep reqwest **core** (or a thin `http-client` feature pulled by `ai`/`forgejo`/`github`/jwks). The `ai = ["dep:reqwest"]` line in the proposed layout is wrong.

### `axum` is core surface — leave ungated (recommendation)

10 files incl. `error.rs` (`IntoResponse`), `envelope.rs`. HTTP types are jedi's core response contract. Gating axum touches too much for marginal gain. Focus the win on `twitch` + `grpc` + `redis`.

### Consumer feature map (17 in-repo; verified)

| Consumer                                            | Current jedi features                                         | Notes                                      |
| --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| jobboard                                            | `postgres`                                                    | NOT twitch/fred/grpc — biggest beneficiary |
| arpg/server, cryptothrone/server, axum-cryptothrone | `postgres`,`valkey`                                           |                                            |
| axum-kbve                                           | `clickhouse`,`forgejo`,`postgres`,`valkey`                    | heaviest                                   |
| metrics                                             | `clickhouse`,`prometheus`                                     |                                            |
| rows                                                | `prometheus`                                                  |                                            |
| factorio/relay, factorio-ctl                        | `clickhouse`                                                  |                                            |
| irc-gateway, discordsh-bot                          | `valkey`                                                      |                                            |
| axum-discordsh                                      | `postgres`                                                    |                                            |
| rentearth, chuckrpg                                 | `itch`                                                        | marker only                                |
| axum-memes, axum-herbmail                           | _(none)_                                                      | pure core consumers                        |
| packages/rust/kbve                                  | path only; `jedi/valkey` + `jedi/prometheus` via own features |                                            |

**Nobody uses twitch or grpc-as-consumer feature today** → both currently compile for all 17 for zero benefit. Highest ROI gates.

### Revised sequencing (smallest blast radius first)

1. Remove `askama` — isolated PR.
2. Gate `twitch` — isolated, no error.rs entanglement beyond mod decl (twitch From impls: none in error.rs). Clean win.
3. Split `error.rs` imports/impls under `#[cfg]` for `grpc`/`redis` (+ `http` if pursued). Prereq for 4.
4. Gate `grpc` (`tonic*`,`prost`) + `redis` (`fred`) as optional; gate `proto/*` grpc modules + `wrapper/redis_wrapper` + `entity/pipe_redis`.
5. Add `redis`/`grpc` to consumers that actually need them (audit `state/kv.rs`, `state/temple.rs` users — fred-backed). Most consumers drop both.
6. Keep `reqwest` + `axum` core. Defer `tokio = "full"` narrowing.

## Related

- [proto-distribution.md](./proto-distribution.md)
- [nx-cache-improvements.md](./nx-cache-improvements.md)
