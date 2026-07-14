# ROWS — Rust Open World Server

Single-binary game backend (axum REST + gRPC + WS on one port) replacing the OWS .NET
microservices. Orchestrates per-zone UE5 dedicated GameServers via Agones; Postgres (`ows` schema)
is the source of truth. One tenant per deployment (`customer_guid` comes from config/env — ROWS is
NOT multi-tenant per process, and the RLS policies on ows tables are deliberately decorative).

## Design lens

**When designing or brainstorming anything gameplay-infra here (presence, saves, groups, teleport,
instancing, drain), first ask: what would TrinityCore and AzerothCore do?**
(https://github.com/TrinityCore/TrinityCore, https://github.com/azerothcore/azerothcore-wotlk —
battle-tested implementations of this exact problem domain. Verify against their actual source,
not from memory.) They're commonly abbreviated **TC** (TrinityCore) and **AC** (AzerothCore) — if
the user says "AC/TC", this is what they mean. Translation table: their single stateful worldserver's process memory ≈ our
valkey live tier; their `characters` table ≈ the `ows` schema; their async DB worker pool ≈ our
background jobs. Second question, from the lifecycle spec: does this state belong in the **live
tier** (valkey — derivable, loss is self-healing) or the **durable tier** (Postgres — authoritative,
saved on logout/travel/periodic flush)? Never buffer authoritative saves in valkey.

## Docs

Everything lives in [`docs/`](./docs/README.md) (moved from the repo-root `docs/` folder — do not
put ROWS plans/specs back there). **New brainstorm/design specs and implementation plans go under
`apps/rows/docs/superpowers/` (`specs/` and `plans/` subdirs)** — this overrides the superpowers
skills' default `docs/superpowers/…` location for ROWS work. Start with the index; the docs you'll
need most:

- [`docs/2026-06-24-rows-server-lifecycle-and-shutdown.md`](./docs/2026-06-24-rows-server-lifecycle-and-shutdown.md)
  — the umbrella design (drain/shutdown/fleet-restart, valkey-vs-DB tiering) + operator runbooks.
- [`docs/2026-06-24-ue-chuck-drain-contract.md`](./docs/2026-06-24-ue-chuck-drain-contract.md)
  — the contract handed to the UE dev (obligations matrix). **Update it in the same PR whenever a
  change touches anything UE-facing** (endpoints, labels/annotations, wire formats, /health).
- [`docs/2026-06-24-rows-config-and-docs-index.md`](./docs/2026-06-24-rows-config-and-docs-index.md)
  — every config knob. Register new knobs there in the same PR that adds them.

Tracking issue for the lifecycle work: [#13281](https://github.com/KBVE/kbve/issues/13281).

## Hard-to-find things that will bite you

- **`/health` is the liveness probe** (`timeoutSeconds: 3`) and MUST stay DB-free. Anything it
  reports from Postgres goes through a background-refreshed snapshot (see `deploy_state_cache` in
  `state.rs` + `jobs::deploy_state_refresh`), never a synchronous query — a DB latency spike
  otherwise becomes a kubelet restart storm (this cluster has documented storage-contention
  history, issue #12987). `/ready` is DB-gated on purpose; keep game-build health out of it.
- **Session-level Postgres advisory locks** (reaper, fleet-restart reconcile in `jobs.rs`): lock
  and unlock MUST run on the same pinned connection (`acquire()` a dedicated conn, RAII
  `AdvisoryLockGuard`, detach+close on unlock failure). Taking the lock on the pool silently
  no-op-unlocks and wedges the job for the tenant. Never move these onto the transaction-mode
  pooler. A shared helper is a wanted follow-up — don't hand-roll a third copy.
- **Degrade-on-missing-schema:** every read of a new table/column handles SQLSTATE `42P01`/`42703`
  (`is_undefined_table` / `is_undefined_column`, `repo/instances.rs`) so the image can roll out
  ahead of the migration. New tables ship a dbmate migration in
  `packages/data/sql/dbmate/migrations/` **and** a mirror in `packages/data/sql/schema/ows/`.
  Migrations are applied manually via `ci-dbmate-deploy`, decoupled from the image.
- **`CREATE INDEX CONCURRENTLY`** migrations need `-- migrate:up transaction:false` and must be the
  ONLY statement (no `SET search_path` — qualify `ows.` inline). An interrupted build strands an
  INVALID index that `IF NOT EXISTS` then skips forever; ROWS warns at startup via
  `check_drainable_index_valid`-style `pg_index.indisvalid` checks.
- **Postgres folds unquoted DDL identifiers to lowercase** (`DrainState` → `drainstate`): sqlx
  models need `#[sqlx(rename = "...")]` per column; queries use the lowercase names.
- **Port 4322 serves REST+gRPC to every GameServer, and NetworkPolicies can't filter HTTP paths**
  — "cluster-internal" is not auth. Mutating/destructive routes need app-level auth: the
  gateway-held `ROWS_FLEET_RESTART_TOKEN` bearer (fails closed when unset; GameServers must never
  receive it). GameServer-trusted writes use `x-service-key` (`require_service_key`). 4323 = docs,
  4324 = metrics.
- **New REST routes/schemas must be registered in `openapi.rs`** (`paths(...)` + `components`) or
  they're missing from swagger.
- **Two deployment trees:** `apps/kube/rows/manifest/` (namespace `rows`, Argo syncs the raw dir,
  secrets named `ows-*`... mostly) and `apps/kube/rows/tenants/` (kustomize base + per-tenant
  overlays → `rows-chuckrpg-{dev,beta,prod}`, `rows-rentearth-release`, secrets named `rows-*`).
  Edit both when changing env/PDB/probes. Argo `selfHeal: true` reverts manual `kubectl` edits —
  change git, never the cluster. SealedSecrets are per-namespace (`kubeseal --raw`); controller in
  `kube-system`.
- **Versioning:** never bump `version.toml` / `Cargo.toml` versions by hand — bump only the mdx
  frontmatter in `apps/kbve/astro-kbve/src/content/docs/project/rows.mdx` (`pipeline: docker`);
  CI's post-publish PR owns the rest. Pre-bumping silently skips the build.
- **The chuck UE server binary is a PVC path, not an image tag** (`ows-server-build` PVC,
  `/server/latest/...` — mutable `latest/` is the known R0 hazard). Bumping the fleet `image:`
  only rolls the kubectl sidecar.
- **`ROWS_SPINUP_*` env knobs are dead** — `agones/pipeline.rs` reads malformed keys (literal
  `"ROWS_spinup_timeout_secs()"`). The YAML values match the hard defaults so it's latent; fix is
  a known follow-up.
- **Tests:** `cargo test` runs pure-logic tests only (no DB in CI). DB-touching tests follow the
  `TEST_DATABASE_URL`/`DATABASE_URL` skip-if-unset pattern (see
  `is_character_on_active_instance_…` in `repo/instances.rs`).
- **Key wire facts:** heartbeat = `POST /api/Instance/UpdateNumberOfPlayers` (count; drives
  `lastupdatefromserver`/`lastserveremptydate` — reaper liveness). Bulk positions =
  `POST /api/Characters/UpdateAllPlayerPositions`, wire format `CharName:X:Y:Z:RX:RY:RZ|...`.
  ROWS→UE signals ride GameServer labels/annotations (`ows.kbve.com/*`, registry in the config
  index; UE watches via the Agones SDK). `ReportBuild` versions must match
  `[0-9A-Za-z._-]{1,64}` with ≥1 digit — first accepted report seeds `deploy_state`.
- **`mapinstances.status`:** `0` = inactive/torn down, `>0` = active; ONLY the reaper/lifecycle
  writes `status=0` (`set_drain_state` rejects it) — anything waiting on "all drained" depends on
  the reaper being enabled. Drain state is monotonic (escalate-only, `drain_severity`).

## Workflow

Repo-wide rules apply (root `AGENTS.md`): worktrees branched from `dev`, conventional commits, no
co-author lines, PRs → `dev`. Build/test from `apps/rows`: `cargo build && cargo test` (workspace
pins a recent rustc via `rust-version` — `rustup update stable` if the build refuses).
