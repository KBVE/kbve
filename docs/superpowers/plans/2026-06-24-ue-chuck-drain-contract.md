# Chuck (Unreal) ⟷ ROWS — Drain & Lifecycle Contract

> **Status:** LIVING / NOT FINAL. This is the chuck (UE5 dedicated server) side of the drain
> lifecycle whose ROWS half is specified in `2026-06-24-rows-server-lifecycle-and-shutdown.md` and
> built by the `rows-drain-*` plans. **Maintenance:** update this after each ROWS phase lands — the
> "Obligation matrix" maps each UE obligation to the ROWS phase that needs it, so keep that in sync.
> Wire formats marked 🕳️ are not finalized; treat them as proposed until the matching ROWS phase
> pins them. Config knobs + the full Agones wire-key registry are catalogued in
> [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md).

## Why this exists

ROWS owns _allocation, routing, drain-state, and the force backstop_. It cannot save player state,
decide who a server admits, or shut a server down gracefully — only the UE GameServer can. So the
cooperative lifecycle is a **contract**: ROWS signals intent, chuck executes the game-side behavior
and reports back. Without the chuck side, ROWS' drain is inert (it can only force-DELETE).

## The two channels (already exist)

| Direction        | Transport                                                                                              | Today                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **chuck → ROWS** | HTTP `POST /api/Instance/UpdateNumberOfPlayers` (the heartbeat)                                        | sends player count; ROWS derives `lastserveremptydate` + liveness      |
| **ROWS → chuck** | Agones GameServer **labels/annotations** (`ows.kbve.com/*`), read via the Agones SDK `WatchGameServer` | ROWS sets `ows.kbve.com/draining=true`, `empty-shutdown-minutes`, etc. |

chuck also speaks the **Agones SDK** directly (`Ready()`, `Health()`, `Shutdown()`, `WatchGameServer()`).

Known keys ROWS already uses (`apps/rows/src/agones/sdk.rs`): labels `ows.kbve.com/{zone, map,
zone-instance, world-server-id, draining, version}`; annotations `ows.kbve.com/{allocated-at,
customer-guid, empty-shutdown-minutes}`.

---

## Foundational obligations (gate: makes the shipped reaper safe to enable)

These are needed **before** ROWS' empty-reaper can be turned on — they're why the reaper ships
gated-off + `require_heartbeat`.

1. **Heartbeat with an accurate count.** Periodically `POST /api/Instance/UpdateNumberOfPlayers`
   with this instance's current player count.
    - Report **exact `0`** when empty (this is what starts ROWS' empty timer). **Never** report a
      negative count (ROWS clamps with `GREATEST($,0)` but don't rely on it).
    - Heartbeat _liveness_ is what ROWS' `require_heartbeat` gate keys on: until chuck heartbeats at
      least once, ROWS will not run never-reported reaping. So: **heartbeat from `BeginPlay`/server
      start, before any players connect.**
2. **Agones SDK health, off-thread.** Call `Health()` on its own cadence from a thread that a long
   DB save **cannot block** — otherwise Agones marks the pod Unhealthy and reclaims it mid-save
   (see Constraints / B1).
3. **Self-shutdown on the empty annotation.** Read `ows.kbve.com/empty-shutdown-minutes` (stamped
   at allocation). After the instance has been empty that many minutes, call `SDK.Shutdown()`. This
   is the **primary** teardown path; ROWS' reaper is only the backstop for when this doesn't happen.

> ⚠️ **Until v2 (Agones-health cross-check) exists, keep ROWS' empty-reap gate OFF.** The reaper's
> `Empty` path trusts ROWS' (possibly stale) count; the safe teardown is _this_ annotation-driven
> self-shutdown. See the "silence ≠ dead" residual in the lifecycle spec.

---

## Drain obligations (gate: cooperative drain — ROWS Phases 1–3)

4. **React to the drain signal.** Watch the GameServer object; when ROWS sets
   `ows.kbve.com/draining=true` (and, later, the richer request annotations below), begin a
   graceful drain: stop being a target for _new_ players, let existing players finish or transfer,
   **save state**, then `SDK.Shutdown()` when empty. As-built (Phase 3, #13575): the fleet-restart
   reconcile patches the label **once, on the tick that first marks the instance draining** —
   idempotent on the UE side is still required (a re-read after `WatchGameServer` reconnect sees
   the same label).
5. **Admission policy during drain (UE owns this).** ROWS stops _allocating_ new players to a
   draining instance, but connections can still arrive (e.g. party/group continuity). Per urgency:
    - `when_able` → keep admitting party/group-continuation joins (a member rejoining an in-progress
      dungeon); reject unrelated new joins.
    - `asap` → reject all new admissions.
      ROWS does **not** compute party membership — that's chuck's call.
6. **Save player state to DB before shutting down.** On drain (and on SIGTERM), persist each
   player's state, including their **last zone** (ROWS reads last-zone on next login for resume).
   Completed saves must be durable (Postgres); an in-flight save lost to a crash is acceptable
   (ROWS Principle 3), a _skipped_ save is not.
7. **Report drain progress + veto** via the heartbeat (richer fields — 🕳️ format pinned in ROWS
   Phase 3): echo `request_id`; report `state` (ack / draining / saving / **rejected** / complete),
   `players_remaining`, `reject_reason` (e.g. `has_players:3`), and `last_progress_at`. The **veto**
   (`rejected` + count) is how a server with players overrides a stale "empty" drain request.
   ROWS treats drain as complete only when chuck reports `complete`.
8. **Capability handshake (🕳️ W1).** Advertise a drain-protocol version (proposed: the existing
   `ows.kbve.com/version` label, or a field in the heartbeat) so ROWS applies drain semantics only
   to capable servers and otherwise falls back to annotation-self-shutdown + force. Without this,
   deploying ROWS-new against chuck-old leaves instances "draining" in ROWS but never acked.

---

## Fleet-restart obligations (gate: ROWS Phase 3)

9. **Player broadcast / countdown.** When a drain carries a `deadline` (fleet-restart /
   maintenance), render "server restarting in X" to players. ROWS supplies the deadline; chuck
   renders it. (ROWS' notify seam is logging-only today.) **As-built gap (Phase 3):** the deadline
   lives only in `mapinstances.draindeadline` — ROWS does **not** yet push it to a GameServer
   annotation, so UE currently has **no wire** for the countdown value. Blocked on pinning the
   drain-request annotation schema (🕳️ below); until then the only UE-visible signal is the
   boolean `draining` label.
10. **`drop_players` behavior.** When the drain sets `drop_players=true` (node-drain at deadline,
    operator-expedite, fleet-restart), **save then disconnect** remaining players — graceful
    (data-safe), not a hard kill. Without `drop_players`, wait for natural empty.
11. **Transfer on rebalance.** When a drain carries a `transfer_target`, travel the **whole party
    together** to that server (don't scatter); if it can't fit, leave them.
12. **Client-version gate (client-break updates).** After a binary update that breaks client compat,
    reject old clients with an "update required" signal rather than a raw disconnect. (Partly
    launcher/client-side.)

---

## New in ROWS Phase 3 (#13575) — as-built rules UE + launcher must follow

- **`POST /api/System/ReportBuild` now validates the version string.** Accepted shape: **1–64
  chars of `[0-9A-Za-z._-]`, containing at least one digit** (`0.3.46`, `0.3.46-rc1`, `dev.1` pass;
  empty, `latest`, spaces, path shapes are rejected with `success:false`). Send the **real cooked
  build version** the server loaded off the PVC — the **first accepted report seeds
  `deploy_state` as the fleet's authoritative served version** (first-write-wins until an
  orchestrated roll overwrites it), which becomes the launcher's download target. Never report a
  placeholder.
- **`GET /health` is the launcher contract** (public, `https://api-beta.chuckrpg.com/health`):
    - `unreal_version` = the authoritative served build = **the client version the launcher must
      download**. Explicit `null` means "no authoritative target" — the launcher must show a
      maintenance/hold state and must **NOT** auto-download an arbitrary build.
    - `pending_version` (informational) = merged but not yet rolled.
    - `deploy_healthy:false` + `failing_version` = the last rollout's soak failed; advisory only.
- **Drain signal is live:** a fleet restart marks each active instance draining in the DB **and
  patches `ows.kbve.com/draining=true`** on its GameServer (obligation #4's trigger). Per-request
  annotations (`reason/urgency/drop_players/deadline/request_id`) are still 🕳️ unpinned — the
  boolean label is the only drain wire UE gets today.
- **Fleet-restart never force-disconnects on the non-aggressive path.** Aggressive restarts
  (dashboard-triggered) force-deallocate overdue GameServers past a deadline — the pod gets the
  normal Agones shutdown, so obligation #6's save-on-SIGTERM (within TGPS) is what protects players.

---

## Admission-gate obligations (gate: ROWS Phase 2 admission gate — #13543)

13. **Back off on a retryable admission rejection (client-side).** When ROWS pauses _new_ joins
    (operator freeze / soft load-shed admission gate, PR #13543), it rejects the join with a
    **retryable** signal — `HTTP 503` + `Retry-After: 5` (REST) / gRPC `unavailable`, code
    `UNAVAILABLE` — deliberately **not** `409 / already_exists` (which clients treat as permanent;
    ROWS-side contract F2). The chuck client MUST treat this as "try again shortly": honor
    `Retry-After` (or a bounded default backoff), show a "servers busy — retrying…" state, and
    retry, rather than surfacing a hard "connection failed" / kicking the player to an error screen.
    A client that treats 503/`unavailable` as terminal makes the retryable contract useless — the
    freeze degrades into a hard bounce. **Status: unverified** — needs a UE-side check of how the
    login/connect path handles 503 + `Retry-After` and gRPC `unavailable`. (Distinct from
    obligation #5, which is UE-owned admission _during drain_; this is the client honoring
    ROWS-owned admission _gating_.)

---

## Operational constraints chuck MUST honor

- **Save budget ≤ Fleet TGPS (🕳️ B1).** The binding limit on save time is the GameServer pod's
  `terminationGracePeriodSeconds`, then unconditional SIGKILL. The chuck Fleet
  (`apps/kube/agones/rows-tenants/chuckrpg-*/manifests/fleet.yaml`) currently sets **no** TGPS
  (implicit 30s) — too short for a real save. **Action (ROWS/infra side):** declare TGPS explicitly
  ≥ max save budget. **Action (chuck side):** keep the save within that budget; run it off the
  `Health()` thread (the Agones health window is ~75s but SIGKILL at TGPS fires first).
- **Exact-0 / non-negative counts** (see Foundational #1).
- **Idempotent drain handling.** ROWS re-asserts the drain signal each cycle; a repeated request for
  an in-flight `request_id` is a no-op.

---

## Obligation matrix (keep in sync per ROWS phase)

All three ROWS phases are now shipped (Phase 1 Core #13537, Phase 2 Admission #13543, Phase 3
Fleet-restart #13575 — all inert until operator-enabled), so every "when phase lands" gate below is
open: the UE obligations are what remains.

| #   | Obligation                                                                       | Needed by ROWS phase                                         | Status                                                               |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Heartbeat + accurate count                                                       | Reaper (shipped #13200) — `require_heartbeat`                | **required now** to enable reaper                                    |
| 2   | Health() off-thread                                                              | Reaper + all drain                                           | **required now**                                                     |
| 3   | Self-shutdown on `empty-shutdown-minutes`                                        | Reaper (cooperative empty path)                              | **required now**                                                     |
| 4   | React to `draining` signal                                                       | Phase 1 Core ✅ #13537; label emitted by Phase 3 ✅ #13575   | **required before first fleet-restart use**                          |
| 5   | Admission policy during drain                                                    | Phase 2 Admission ✅ #13543                                  | **required before first fleet-restart use**                          |
| 6   | Save state (+ last-zone) before shutdown                                         | Phase 1–3 ✅                                                 | **required before first fleet-restart use**                          |
| 7   | Drain progress + veto in heartbeat                                               | Phase 3 wire format                                          | 🕳️ format still TBD (not pinned by #13575)                           |
| 8   | Capability handshake / version                                                   | Phase 3 (W1)                                                 | 🕳️ format still TBD                                                  |
| 9   | Player broadcast / countdown                                                     | Phase 3 fleet-restart ✅                                     | blocked on 🕳️ deadline annotation (no UE wire yet)                   |
| 10  | `drop_players` save-then-disconnect                                              | Phase 3 fleet-restart ✅                                     | needed for aggressive restarts (save-on-SIGTERM covers the backstop) |
| 11  | Transfer on `transfer_target`                                                    | Phase 3 (rebalance)                                          | later refinement                                                     |
| 12  | Client-version gate                                                              | Phase 3 (client-break updates) + launcher `/health` contract | later (runtime half; deploy half = R1 parity gate, open)             |
| 13  | Client backoff on retryable admission (503 + `Retry-After` / gRPC `unavailable`) | Phase 2 admission gate (#13543)                              | **unverified — needs UE check**                                      |
| 14  | ReportBuild sends the real, valid build version (see "New in ROWS Phase 3")      | Phase 3 `/health` launcher contract                          | **required before beta fleet scales up**                             |

---

## Open / unpinned (🕳️ — resolved as ROWS phases land)

- **Heartbeat wire format for the drain fields** (#7) — REST body extension vs gRPC fields. Pinned
  in ROWS Phase 3 alongside W1.
- **Capability handshake mechanism** (#8) — `version` label vs heartbeat field.
- **Drain-request annotation schema** — beyond the boolean `draining=true`, the per-request
  `reason/urgency/drop_players/deadline/request_id` keys (proposed under `ows.kbve.com/`) are pinned
  when ROWS emits them (Phase 3 / the request-ack loop).
- **Party/group admission rules** (#5) — which join classes `when_able` admits (party only? guild?
  dungeon-in-progress?) is chuck game-design.
- **Transfer protocol** (#11) — how chuck travels a party to `transfer_target` (seamless vs
  reconnect).
- **Version-parity gate (deploy-side, 🕳️ V1)** — obligation #12 is the _runtime_ half (reject
  old clients). Its _deploy-time_ half lives in ROWS Phase 3
  ([rows-drain-fleet-restart](./2026-06-24-rows-drain-fleet-restart.md) "Restart triggers, modes &
  version-parity gate"): the post-publish sync must not arrange a server fleet-restart until the
  matching client build is published. Automated post-publish rolls are **non-aggressive**
  (drain-to-empty); aggressive rolls are dashboard-triggered.

## Changelog

- 2026-06-24 — initial draft from the lifecycle spec + Core/admission/fleet-restart plans.
- 2026-06-28 — added obligation #13 (client backoff on retryable admission rejection) from the
  #13543 admission-gate audit; client behavior on 503/`unavailable` is unverified.
- 2026-07-10 — Phase 3 (#13575) as-built sync: `draining` label now actually emitted by the
  fleet-restart reconcile (the earlier "ROWS already calls mark_draining" claim was wrong — it was
  never wired until #13575); added the ReportBuild version-validation rule + first-write-wins seed,
  the `/health` launcher contract (obligation #14), and the #9 gap (deadline has no UE wire until
  the annotation schema is pinned). Matrix statuses updated: all ROWS phases shipped.
