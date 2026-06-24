# Chuck (Unreal) ⟷ ROWS — Drain & Lifecycle Contract

> **Status:** LIVING / NOT FINAL. This is the chuck (UE5 dedicated server) side of the drain
> lifecycle whose ROWS half is specified in `2026-06-24-rows-server-lifecycle-and-shutdown.md` and
> built by the `rows-drain-*` plans. **Maintenance:** update this after each ROWS phase lands — the
> "Obligation matrix" maps each UE obligation to the ROWS phase that needs it, so keep that in sync.
> Wire formats marked 🕳️ are not finalized; treat them as proposed until the matching ROWS phase
> pins them. Config knobs + the full Agones wire-key registry are catalogued in
> [rows-config-and-docs-index](./2026-06-24-rows-config-and-docs-index.md).

## Why this exists

ROWS owns *allocation, routing, drain-state, and the force backstop*. It cannot save player state,
decide who a server admits, or shut a server down gracefully — only the UE GameServer can. So the
cooperative lifecycle is a **contract**: ROWS signals intent, chuck executes the game-side behavior
and reports back. Without the chuck side, ROWS' drain is inert (it can only force-DELETE).

## The two channels (already exist)

| Direction | Transport | Today |
|---|---|---|
| **chuck → ROWS** | HTTP `POST /api/Instance/UpdateNumberOfPlayers` (the heartbeat) | sends player count; ROWS derives `lastserveremptydate` + liveness |
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
   - Heartbeat *liveness* is what ROWS' `require_heartbeat` gate keys on: until chuck heartbeats at
     least once, ROWS will not run never-reported reaping. So: **heartbeat from `BeginPlay`/server
     start, before any players connect.**
2. **Agones SDK health, off-thread.** Call `Health()` on its own cadence from a thread that a long
   DB save **cannot block** — otherwise Agones marks the pod Unhealthy and reclaims it mid-save
   (see Constraints / B1).
3. **Self-shutdown on the empty annotation.** Read `ows.kbve.com/empty-shutdown-minutes` (stamped
   at allocation). After the instance has been empty that many minutes, call `SDK.Shutdown()`. This
   is the **primary** teardown path; ROWS' reaper is only the backstop for when this doesn't happen.

> ⚠️ **Until v2 (Agones-health cross-check) exists, keep ROWS' empty-reap gate OFF.** The reaper's
> `Empty` path trusts ROWS' (possibly stale) count; the safe teardown is *this* annotation-driven
> self-shutdown. See the "silence ≠ dead" residual in the lifecycle spec.

---

## Drain obligations (gate: cooperative drain — ROWS Phases 1–3)

4. **React to the drain signal.** Watch the GameServer object; when ROWS sets
   `ows.kbve.com/draining=true` (and, later, the richer request annotations below), begin a
   graceful drain: stop being a target for *new* players, let existing players finish or transfer,
   **save state**, then `SDK.Shutdown()` when empty. (ROWS already calls `mark_draining` as a
   belt-and-suspenders trigger.)
5. **Admission policy during drain (UE owns this).** ROWS stops *allocating* new players to a
   draining instance, but connections can still arrive (e.g. party/group continuity). Per urgency:
   - `when_able` → keep admitting party/group-continuation joins (a member rejoining an in-progress
     dungeon); reject unrelated new joins.
   - `asap` → reject all new admissions.
   ROWS does **not** compute party membership — that's chuck's call.
6. **Save player state to DB before shutting down.** On drain (and on SIGTERM), persist each
   player's state, including their **last zone** (ROWS reads last-zone on next login for resume).
   Completed saves must be durable (Postgres); an in-flight save lost to a crash is acceptable
   (ROWS Principle 3), a *skipped* save is not.
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
   renders it. (ROWS' notify seam is logging-only today.)
10. **`drop_players` behavior.** When the drain sets `drop_players=true` (node-drain at deadline,
    operator-expedite, fleet-restart), **save then disconnect** remaining players — graceful
    (data-safe), not a hard kill. Without `drop_players`, wait for natural empty.
11. **Transfer on rebalance.** When a drain carries a `transfer_target`, travel the **whole party
    together** to that server (don't scatter); if it can't fit, leave them.
12. **Client-version gate (client-break updates).** After a binary update that breaks client compat,
    reject old clients with an "update required" signal rather than a raw disconnect. (Partly
    launcher/client-side.)

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

| # | Obligation | Needed by ROWS phase | Status |
|---|---|---|---|
| 1 | Heartbeat + accurate count | Reaper (shipped) — `require_heartbeat` | **required now** to enable reaper |
| 2 | Health() off-thread | Reaper + all drain | required now |
| 3 | Self-shutdown on `empty-shutdown-minutes` | Reaper (cooperative empty path) | required now |
| 4 | React to `draining` signal | Phase 1 Core (drain state) | when Core lands |
| 5 | Admission policy during drain | Phase 2 Admission | when Phase 2 lands |
| 6 | Save state (+ last-zone) before shutdown | Phase 1–3 | when Core lands |
| 7 | Drain progress + veto in heartbeat | Phase 3 (wire format) | 🕳️ format TBD |
| 8 | Capability handshake / version | Phase 3 (W1) | 🕳️ format TBD |
| 9 | Player broadcast / countdown | Phase 3 fleet-restart | when Phase 3 lands |
| 10 | `drop_players` save-then-disconnect | Phase 3 fleet-restart | when Phase 3 lands |
| 11 | Transfer on `transfer_target` | Phase 3 (rebalance) | later refinement |
| 12 | Client-version gate | Phase 3 (client-break updates) | later |

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

## Changelog

- 2026-06-24 — initial draft from the lifecycle spec + Core/admission/fleet-restart plans.
