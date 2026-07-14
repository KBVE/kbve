# ROWS — Config & Docs Index (Living Document)

> **Status:** LIVING / NOT FINAL. Single source of truth for **every ROWS config knob** (env,
> per-tenant DB override, Agones wire keys, internal constants) and the **map of docs** that own
> them. **Maintenance:** when a `rows-drain-*` phase or the reaper lands a new knob, add the row
> here _in the same PR_ and link the owning doc. Values here mirror the source — when they disagree,
> **the source wins** (`apps/rows/src/config.rs`, `main.rs`, `db.rs`, `agones/client.rs`,
> `agones/pipeline.rs`, `jobs.rs`). Defaults are quoted from those files at the SHA in the changelog.
>
> Items marked **→ /project/rows/** are queued to graduate into the published page
> `apps/kbve/astro-kbve/src/content/docs/project/rows.mdx` (`https://kbve.com/project/rows/`) once
> the owning feature is enabled in an env. They are **staged here, not yet published** — see
> [§ Promotion](#promotion-to-kbvecomprojectrows).

---

## Document map

| Doc                                                                                      | Scope                                            | Status                                   | Owns                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| [rows-empty-server-reaper](./2026-06-23-rows-empty-server-reaper.md)                     | Empty/abandoned GameServer reaper (the backstop) | **implemented** (PR #13200, ships inert) | `ROWS_EMPTY_REAP*`, `ROWS_REAP_*`, `ows.reaper_config`, `gameservername`, reaper constants |
| [rows-server-lifecycle-and-shutdown](./2026-06-24-rows-server-lifecycle-and-shutdown.md) | Lifecycle/shutdown/drain design spec (parent)    | living spec                              | drain principles, `draining` semantics                                                     |
| [rows-drain-core](./2026-06-24-rows-drain-core.md)                                       | Drain state machine + signal (Phase 1)           | not started                              | `ows.kbve.com/draining`, `ROWS_DRAIN_GRACE_SECS`, `ROWS_ACCEPT_NEW_JOINS` (proposed)       |
| [rows-drain-admission](./2026-06-24-rows-drain-admission.md)                             | Admission control during drain (Phase 2)         | not started                              | admission policy (UE-owned), routing exclusion                                             |
| [rows-drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md)                     | Fleet-restart / maintenance drains (Phase 3)     | not started                              | `reason/urgency/drop_players/deadline/request_id` request annotations (🕳️ unpinned)        |
| [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md)                       | Chuck (UE5) side of the cooperative contract     | LIVING (cross-repo)                      | heartbeat fields, SDK obligations, save budget vs Fleet TGPS                               |
| [rows.mdx](../../kbve/astro-kbve/src/content/docs/project/rows.mdx)                      | **Published** project page (`/project/rows/`)    | live                                     | the operator-facing subset (see [§ Promotion](#promotion-to-kbvecomprojectrows))           |
| [kbverows.mdx](../../kbve/astro-kbve/src/content/docs/project/kbverows.mdx)              | UE client/plugin glue page                       | live                                     | client-side wiring                                                                         |

**Phase chain:** lifecycle-spec → reaper (done) → drain-core → drain-admission → drain-fleet-restart,
with ue-chuck-drain-contract tracking the UE obligations for each. The reaper is the only piece
shipped; everything `drain-*` is design-stage and its knobs below are marked **proposed**.

---

## 1. Reaper knobs (env baseline)

Parsed in `RowsConfig::from_env` (`apps/rows/src/config.rs`); defaults live in
`ReaperKnobs::default()`. **All ship OFF/inert.** Owning doc:
[rows-empty-server-reaper](./2026-06-23-rows-empty-server-reaper.md). Deployment template:
`apps/kube/rows/tenants/base/deployment.yaml` (the three dangerous switches ship **commented out**).

| Env var                                | Type | Default      | Effect                                                                                                                                                                                                                                                                                     | Safety                                                                                    |
| -------------------------------------- | ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ROWS_EMPTY_REAPER_ENABLED`            | bool | `false`      | Master kill switch — the whole reaper loop no-ops when false.                                                                                                                                                                                                                              | **DANGER switch** — commented out in YAML                                                 |
| `ROWS_REAP_NEVER_REPORTED`             | bool | `false`      | Gates the time-based `NeverReported` path (reap a row that never heartbeated, past boot grace).                                                                                                                                                                                            | **MOST DANGEROUS** — deallocates _populated_ servers pre-heartbeat; commented out in YAML |
| `ROWS_REAP_REQUIRE_HEARTBEAT`          | bool | `true`       | Auto-gate: suppress `NeverReported` until ≥1 heartbeat was _ever_ observed for the tenant.                                                                                                                                                                                                 | Defense-in-depth; leave ON                                                                |
| `ROWS_EMPTY_REAP_STALE_SECS`           | i64  | `0` (off)    | Reap a still-"populated" instance whose heartbeat went stale this many secs (crashed-while-populated).                                                                                                                                                                                     | **DANGER switch** — needs trusted heartbeat delivery; commented out in YAML               |
| `ROWS_EMPTY_REAP_BOOT_GRACE_SECS`      | i64  | `14400` (4h) | `NeverReported` boot-grace window.                                                                                                                                                                                                                                                         | safe (inert while switches off)                                                           |
| `ROWS_EMPTY_REAP_BUFFER_SECS`          | i64  | `30`         | Added to per-map empty timeout so UE `SDK.Shutdown()` wins first.                                                                                                                                                                                                                          | safe                                                                                      |
| `ROWS_EMPTY_REAP_MIN_EMPTY_SECS`       | i64  | `300`        | Floor on the effective empty timeout (protects a freshly-allocated server under a still-loading player).                                                                                                                                                                                   | safe                                                                                      |
| `ROWS_EMPTY_REAP_FRESH_SECS`           | i64  | `180`        | Empty marker is only honored if `lastupdatefromserver` is within this window (wedged-heartbeat guard). `0` = off.                                                                                                                                                                          | safe; **must be ≫ UE heartbeat interval** or the Empty path is silently inert             |
| `ROWS_STAMP_EMPTY_SHUTDOWN_ANNOTATION` | bool | `true`       | Stamp the `ows.kbve.com/empty-shutdown-minutes` allocation annotation (tells the UE server when to self-shutdown after going empty). Stamped by default even before a UE consumer reads it. Set `false` to skip the per-map-timeout DB read and omit it. Env-only (no DB override column). | safe; independent of the reaper switches                                                  |

## 2. Reaper per-tenant override (DB, no redeploy)

Table `ows.reaper_config` (migration `20260627021802`). One row per tenant (PK `customerguid`),
every value column NULLable. The reaper reads it **every 60s cycle** and merges over the env
baseline — **non-NULL DB value wins per field**; NULL = use env. Read path:
`InstanceRepo::get_reaper_config_override` → `ReaperKnobs::merged_with`. A missing table (SQLSTATE
42P01) degrades cleanly to env config.

| Column             | Overrides env var                 |
| ------------------ | --------------------------------- |
| `enabled`          | `ROWS_EMPTY_REAPER_ENABLED`       |
| `neverreported`    | `ROWS_REAP_NEVER_REPORTED`        |
| `requireheartbeat` | `ROWS_REAP_REQUIRE_HEARTBEAT`     |
| `bootgracesecs`    | `ROWS_EMPTY_REAP_BOOT_GRACE_SECS` |
| `buffersecs`       | `ROWS_EMPTY_REAP_BUFFER_SECS`     |
| `stalesecs`        | `ROWS_EMPTY_REAP_STALE_SECS`      |
| `minemptysecs`     | `ROWS_EMPTY_REAP_MIN_EMPTY_SECS`  |
| `emptyfreshsecs`   | `ROWS_EMPTY_REAP_FRESH_SECS`      |

> ⚠️ A tenant enabled **purely via DB** does **not** emit the loud startup `warn!` (which only
> reflects env). The `require_heartbeat` auto-gate still applies. See reaper-plan Runbook §5.

## 3. Reaper internal constants (not env-tunable)

Hard-coded in `apps/rows/src/jobs.rs` / `repo/instances.rs`. Listed so the operational envelope is
visible; changing them is a code change.

| Constant                                      | Value                                                                 | Location                        | Meaning                                                  |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| reap cycle interval                           | `60s`                                                                 | `jobs.rs` `empty_server_reaper` | how often the loop ticks                                 |
| `MAX_CONCURRENT_REAPS`                        | `8`                                                                   | `jobs.rs`                       | max GameServers torn down concurrently per cycle         |
| candidate cap                                 | `500`                                                                 | `get_active_reap_candidates`    | per-cycle row cap (logs a warn at the cap)               |
| `FALLBACK_EMPTY_SHUTDOWN_MINUTES_ON_DB_ERROR` | `30`                                                                  | `repo/instances.rs`             | annotation fallback when the per-map timeout read errors |
| advisory lock                                 | `pg_try_advisory_lock(hashtext('rows-empty-reaper'), hashtext(guid))` | `jobs.rs`                       | per-tenant single-reaper guard (multi-replica safety)    |

## 4. Drain knobs (Phase 1–3 — proposed, design-stage)

Owned by the `drain-*` plans; **not implemented** except `ROWS_DRAIN_GRACE_SECS`. Wire formats
marked 🕳️ are unpinned — see [ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md)
"Open / unpinned".

| Knob                                                                                                                                                                             | Type                                  | Default                                                                | Status                                                                                                                                                       | Owning doc                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `ROWS_DRAIN_GRACE_SECS`                                                                                                                                                          | u64                                   | `8`                                                                    | **live** (`main.rs`, process shutdown grace)                                                                                                                 | lifecycle-spec                                                  |
| `ROWS_ACCEPT_NEW_JOINS`                                                                                                                                                          | bool                                  | —                                                                      | proposed                                                                                                                                                     | [drain-core](./2026-06-24-rows-drain-core.md)                   |
| `ROWS_FLEET_RESTART_STALL_SECS`                                                                                                                                                  | i64                                   | `1800`                                                                 | **shipped (inert)** — non-aggressive stall SLA; `stalled=true` past it, lockout auto-lift past 2×                                                            | [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) |
| `ROWS_FLEET_RESTART_TOKEN`                                                                                                                                                       | string                                | unset (**fail closed**: trigger 401s)                                  | **shipped** — gateway-held bearer token for `POST /fleet-restart/trigger`; GameServers must NOT hold it                                                      | [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) |
| `fleet_restart` control row (`active`/`reason`/`urgency`/`dropplayers`/`stagger`/`batchsize`/`lockout`/`lockoutapplied`/`startedat`/`draindeadline`/`targetversion`/`requestid`) | DB table (migration `20260629120000`) | safe-by-default, DB-enforced (`chk_safe_default`, `chk_deadline_aggr`) | **shipped (inert)** — clear with `active=false`, never DELETE                                                                                                | [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) |
| `deploy_state` (`targetversion`/`rolled`/`health`)                                                                                                                               | DB table (migration `20260629130000`) | seeded one-shot by ReportBuild                                         | **shipped (inert)** — backs `/health` version + `/fleet-restart/pending`                                                                                     | [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) |
| `GET /fleet-restart/status`                                                                                                                                                      | REST (4322, cluster-internal)         | —                                                                      | **shipped** — `{active, draining, gameservers, all_drained, safe_to_roll, stalled}`; poll ≥5s (GS count cached ~5s); `gameservers:-1` = unknown, fail closed | lifecycle-spec runbook                                          |
| `GET /fleet-restart/pending` / `POST /fleet-restart/trigger`                                                                                                                     | REST (4322; trigger token-authed)     | trigger grace default 300s                                             | **shipped** — trigger 404s unless an update is pending; 409 while a restart is active                                                                        | lifecycle-spec runbook                                          |
| drain request schema (`reason`/`urgency`/`drop_players`/`deadline`/`request_id`)                                                                                                 | annotations                           | —                                                                      | 🕳️ unpinned                                                                                                                                                  | [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) |

### Restart triggers & version-parity gate (Phase 3 — proposed)

Not a runtime knob ROWS reads — a **deploy-pipeline** control, recorded here so the surface is in one
place. Owning doc: [drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) "Restart triggers,
modes & version-parity gate" (🕳️ V1).

| Concern                    | Where                                                                 | Behavior                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Version-parity gate**    | `utils-post-publish.yml` auto-PR (`.github`), **not** the rows binary | The post-publish **sync is the existing auto-PR** (e.g. PR #13262 — bumps `version.toml`/`Cargo.*` + deployment image tag). For rows, add a **required parity merge check** (can't merge until the matching **client** build published) + arrange the non-aggressive restart instead of a bare tag swap (B-1). Beta first; prod not live yet. |
| **Non-aggressive restart** | post-publish GitOps PR (merge-gated)                                  | `urgency=0 (when_able)`, `drop_players=false` — drain-to-natural-empty, no forced disconnects. The default routine roll.                                                                                                                                                                                                                      |
| **Aggressive restart**     | dashboard (operator)                                                  | `urgency=1 (asap)`, `drop_players=true` — save-then-disconnect at a deadline. Explicit opt-in.                                                                                                                                                                                                                                                |
| Runtime client gate        | `ows.kbve.com/version` label + UE obligation #12                      | reject below-version clients with "update required", not a raw disconnect.                                                                                                                                                                                                                                                                    |

## 5. Core service env (tenant / DB / Agones / auth)

Parsed in `RowsConfig::from_env` + `db.rs`. Beta/release **require** the tenant-critical secrets
(no localhost fallback). Already partially documented on the published page — see
[rows.mdx](../../kbve/astro-kbve/src/content/docs/project/rows.mdx) "Per-tenant deployment".

| Env var                      | Default (dev)                    | beta/release | Notes                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWS_ENV`                    | `dev`                            | —            | `dev`\|`beta`\|`release`                                                                                                                                                                                                                                                |
| `OWS_API_KEY`                | ephemeral UUID + warn            | **required** | tenant `customer_guid`                                                                                                                                                                                                                                                  |
| `OWS_TENANT_SLUG`            | `default`                        | —            | log/metrics label `rows-<slug>`                                                                                                                                                                                                                                         |
| `DATABASE_URL`               | `postgres://…localhost:5432/ows` | **required** |                                                                                                                                                                                                                                                                         |
| `DATABASE_URL_RO`            | (falls back to RW)               | —            | read-only pool                                                                                                                                                                                                                                                          |
| `DB_MAX_CONNECTIONS`         | **`50`** (code)                  | —            | ⚠️ deployment sets **`10`** — code default ≠ deployed value. **Reaper budget:** enabling the reaper draws up to `MAX_CONCURRENT_REAPS(8) + 1` lock conn ≈ 9–10 of 10 → can starve the player hot path. Size the pool before enabling — see reaper plan Runbook §6 (G1). |
| `RABBITMQ_URL`               | `amqp://dev:test@localhost:5672` | **required** |                                                                                                                                                                                                                                                                         |
| `AGONES_NAMESPACE`           | `ows` (code)                     | **required** | deployment sets `arc-runners`                                                                                                                                                                                                                                           |
| `AGONES_FLEET`               | `ows-hubworld` (code)            | **required** | watcher filters `agones.dev/fleet=<fleet>`                                                                                                                                                                                                                              |
| `HTTP_HOST` / `HTTP_PORT`    | `0.0.0.0` / `4322`               | —            | REST+gRPC multiplexed                                                                                                                                                                                                                                                   |
| `DOCS_PORT` / `METRICS_PORT` | `4323` / `4324`                  | —            |                                                                                                                                                                                                                                                                         |
| `SUPABASE_JWT_SECRET`        | —                                | optional     | player JWT (HS256)                                                                                                                                                                                                                                                      |
| `SUPABASE_SERVICE_KEY_HASH`  | —                                | optional     | trusted-server key (argon2)                                                                                                                                                                                                                                             |
| `SUPABASE_URL`               | —                                | —            | set in deployment                                                                                                                                                                                                                                                       |

### Agones circuit breaker / timeout (`agones/client.rs`)

| Env var                             | Default | Effect                                      |
| ----------------------------------- | ------- | ------------------------------------------- |
| `AGONES_CIRCUIT_BREAKER_THRESHOLD`  | `5`     | consecutive failures before a breaker opens |
| `AGONES_CIRCUIT_BREAKER_RESET_SECS` | `30`    | half-open retry delay                       |
| `AGONES_API_TIMEOUT_SECS`           | `10`    | per-request K8s/Agones timeout              |

> Allocation and deallocation have **separate** breakers (`agones/client.rs` `Breaker`) so a reaper
> teardown storm cannot starve player allocation.

### ⚠️ Known config drift / bug (pre-existing, not #13200)

`apps/rows/src/agones/pipeline.rs` reads malformed env keys — the literal string
`"ROWS_spinup_timeout_secs()"` (function-call syntax baked into the key) instead of
`ROWS_SPINUP_TIMEOUT_SECS`:

| Deployment sets                     | Code actually reads                | Hard default | Result                               |
| ----------------------------------- | ---------------------------------- | ------------ | ------------------------------------ |
| `ROWS_SPINUP_TIMEOUT_SECS=60`       | `"ROWS_spinup_timeout_secs()"`     | `60`         | **knob is dead** — env never matches |
| `ROWS_SPINUP_POLL_INTERVAL_MS=2000` | `"ROWS_spinup_poll_interval_ms()"` | `2000`       | **knob is dead**                     |
| `ROWS_SPINUP_INITIAL_DELAY_MS=3000` | `"ROWS_spinup_initial_delay_ms()"` | `3000`       | **knob is dead**                     |

Currently harmless (deployment values equal the hard defaults), but changing them in the YAML has
**no effect**. Fix in a follow-up: use `"ROWS_SPINUP_TIMEOUT_SECS"` etc. Tracked here until then.

## 6. Agones wire keys (ROWS ⟷ chuck contract surface)

Set by ROWS on the GameServer (`apps/rows/src/agones/sdk.rs`, `allocate.rs`), read UE-side via the
Agones SDK `WatchGameServer`. The authoritative contract is
[ue-chuck-drain-contract](./2026-06-24-ue-chuck-drain-contract.md).

| Key                                   | Kind       | Set at                     | Consumed by                                           |
| ------------------------------------- | ---------- | -------------------------- | ----------------------------------------------------- |
| `ows.kbve.com/zone`                   | label      | allocation                 | routing                                               |
| `ows.kbve.com/map`                    | label      | allocation                 | routing                                               |
| `ows.kbve.com/zone-instance`          | label      | allocation (then patched)  | reconcile (unreliable → DB `gameservername` fallback) |
| `ows.kbve.com/world-server-id`        | label      | allocation                 | routing                                               |
| `ows.kbve.com/version`                | label      | allocation                 | (proposed) drain capability handshake                 |
| `ows.kbve.com/draining`               | label      | `mark_draining`            | UE drain trigger (Phase 1)                            |
| `ows.kbve.com/allocated-at`           | annotation | allocation                 | observability                                         |
| `ows.kbve.com/customer-guid`          | annotation | allocation                 | tenant tagging                                        |
| `ows.kbve.com/empty-shutdown-minutes` | annotation | allocation (**PR #13200**) | UE self-shutdown timer (primary teardown path)        |

**chuck → ROWS:** `POST /api/Instance/UpdateNumberOfPlayers` (the heartbeat) — drives
`numberofreportedplayers`, `lastupdatefromserver`, `lastserveremptydate`. Drain progress/veto fields
are 🕳️ unpinned (Phase 3).

## 7. DB objects (ows schema) introduced/used by the reaper

Migrations under `packages/data/sql/dbmate/migrations/`; reference schema under
`packages/data/sql/schema/ows/`. Applied by the manual `ci-dbmate-deploy` workflow (SHA-gated),
decoupled from the image rollout — code degrades on 42703 (column) / 42P01 (table).

| Object                                                  | Migration        | Notes                                                                                                                     |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `mapinstances.gameservername VARCHAR(253) NULL`         | `20260627021758` | label-independent teardown fallback; not backfilled (`ON CONFLICT DO NOTHING`)                                            |
| `idx_mapinstances_active` (partial, `WHERE status > 0`) | `20260627021800` | reaper candidate scan; built `CONCURRENTLY` — an interrupted build strands an INVALID index (see migration recovery note) |
| `ows.reaper_config`                                     | `20260627021802` | per-tenant override (table §2); RLS `USING (true)` → isolation is app-side via `customerguid`                             |

Marker columns on `mapinstances` (maintained by `update_number_of_players`): `numberofreportedplayers`
(`GREATEST($,0)`), `lastupdatefromserver` (`NOW()`), `lastserveremptydate` (stamped on 0, cleared on >0),
`createdate`.

---

## Promotion to kbve.com/project/rows/

Staged — **not yet published**. Each block graduates into
[rows.mdx](../../kbve/astro-kbve/src/content/docs/project/rows.mdx) when its owning feature
is enabled in an env (so the public page only documents live behavior). Per repo rules, that mdx is
version-pipelined (`pipeline: docker`) — a content-only edit is fine but lands in the next docs build.

| Promote                                              | Trigger                                          | Target section in rows.mdx               |
| ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| §1 Reaper env knobs + §3 constants (operator subset) | first env where `ROWS_EMPTY_REAPER_ENABLED=true` | new "Empty-server reaper" section        |
| §2 `ows.reaper_config` override how-to               | same                                             | same                                     |
| §5 circuit-breaker / timeout env                     | now-safe (already live)                          | extend "Per-tenant deployment" table     |
| §6 Agones wire keys                                  | when drain (Phase 1) lands                       | new "GameServer lifecycle keys" section  |
| §5 known-bug fix note                                | once the `ROWS_SPINUP_*` keys are fixed          | drop from here, no public mention needed |

When promoting: copy the **operator-facing** rows only (env var, default, effect, safety) — leave
internal constants, design-stage `drain-*` knobs, and the bug ledger in this living doc.

---

## Changelog

- 2026-06-24 — initial index at SHA `fdb3a44`. Catalogs reaper (PR #13200) + core/agones env, the
  `ows.reaper_config` override, Agones wire keys, and the `drain-*` proposed knobs. Recorded the
  pre-existing `ROWS_SPINUP_*` malformed-env-key bug (§5).
- 2026-07-09 — Phase 3 (fleet-restart) shipped inert: `fleet_restart` + `deploy_state` tables,
  `ROWS_FLEET_RESTART_STALL_SECS` / `ROWS_FLEET_RESTART_TOKEN`, `/fleet-restart/{status,pending,trigger}`
  endpoints, `idx_mapinstances_drainable`. Operator runbook lives in the lifecycle spec
  ("Fleet-restart — operator runbook").
