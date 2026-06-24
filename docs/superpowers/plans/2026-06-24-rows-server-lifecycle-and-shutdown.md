# ROWS Server Lifecycle: Drain, Shutdown & Fleet-Restart — Design Spec

> **Status:** Design spec — NOT yet implemented. Captures a design discussion so the model isn't
> lost. This is a **cross-repo contract** (ROWS ⟷ UE/chuck ⟷ deploy/Argo), so most of it lands as
> follow-up work, not in the reaper PR (#13200). The reaper PR ships the *force/unresponsive*
> backstop only; this spec is the cooperative lifecycle that sits on top of it.

## Motivation

Today ROWS has exactly two shutdown behaviors, and they're at opposite extremes:

- **Cooperative (soft):** the `empty-shutdown-minutes` annotation → UE self-shutdown. UE is
  authoritative and won't shut down if it has players. No reasons, no negotiation.
- **Forced (hard):** the reaper `DELETE`s the GameServer. No veto, and it currently trusts ROWS'
  possibly-stale player count — so a server that just got a player (lagging heartbeat) could be
  hard-killed.

We want a richer, data-safe lifecycle in between: drain reasons with conditions, the ability for UE
to veto a soft shutdown with ground truth, graceful saves with no arbitrary time limit, player
transfer/rebalance, and a coordinated fleet-wide restart for binary/gameplay/DB-migration rollouts.

## Principles

1. **UE is authoritative on occupancy.** ROWS' player count is a derived, possibly-stale cache.
   Shutdowns motivated by *ROWS's belief about players* must be vetoable; shutdowns motivated by
   *infra need* are not.
2. **Liveness, not a clock, is the kill trigger.** A server that is heartbeating and making drain
   progress is given unlimited time to save. Force-kill fires only on **lost liveness** (crash) or
   an explicit **operator emergency** — never on a drain timer.
3. **Data is always saved except on Force.** Every cooperative rung persists player state before the
   server dies. `Force` is the only path that accepts data loss.
4. **Durable state vs cache.** `mapinstances` (Postgres) is the lifecycle source of truth; valkey
   holds only routing/affinity. Authoritative player saves never live solely in the volatile cache —
   if "save" must survive a crash, it goes to Postgres (or a durable queue), not valkey.

## Two actions

| Action | Trigger | Data saved? | Who ends it |
|---|---|---|---|
| **Drain** | empty / rebalance / maintenance / node-drain / fleet-restart | ✅ always | UE saves → `SDK.Shutdown()` |
| **Force** | lost liveness (auto) **or** operator emergency (manual) | ❌ | ROWS `DELETE`s the GameServer |

Everything is a `Drain` except the two Force triggers. `crashed`/`unresponsive` = the auto-Force
path (today's reaper `Stale`/`NeverReported`).

## Drain is one thing, parameterized

```
Drain {
  request_id,        // correlation + idempotency
  reason_tag,        // empty | rebalance | maintenance | node-drain | fleet-restart  (label only)
  urgency,           // when_able | asap
  drop_players,      // bool — may UE disconnect-after-save to finish?  (default false)
  transfer_target?,  // instance id, for rebalance
  deadline?,         // infra-imposed cutoff (node-drain); NOT our policy clock
  abortable,         // can ROWS/operator cancel it
  issued_by,         // reaper | operator | shard-switch | node-watcher  (audit)
}
```

`reason_tag` is for logs/metrics/audit only — behavior comes entirely from the other fields.

### The forcefulness ladder

| Rung | New joins | Existing players | **Data saved?** | Ends when |
|---|---|---|---|---|
| Drain `when_able` | conditional (UE) | wait for natural empty | ✅ | players leave on their own |
| Drain `asap` | rejected (UE) | actively transfer / hurry | ✅ | players moved or leave |
| Drain `asap + drop_players` | rejected (UE) | **save, then disconnect** | ✅ | UE drops after save |
| **Force** | — | dropped immediately | ❌ | ROWS `DELETE`s |

`drop_players` drain is the graceful-but-firm middle rung — *not* the same as Force, because data is
persisted first. It's exactly what makes a hard infra deadline (node-drain) or a fleet-restart safe.

### Reason → default policy

| reason_tag | urgency | drop | transfer | abortable | deadline |
|---|---|---|---|---|---|
| empty | when_able | no | no | yes | none |
| rebalance | asap | no | yes (whole party together) | yes | none |
| maintenance | when_able | optional | optional | yes | optional |
| node-drain | asap | on deadline | optional | no | node clock |
| fleet-restart | asap | yes | no | yes (until drop) | soft window |
| operator | asap | yes | no | no | short |
| crashed | — (Force, no request) | — | — | — | — |

## State machine (per instance)

```
Active ──drain req──▶ DrainRequested ──ack──▶ Draining ──empty──▶ Saving ──▶ Gone
  ▲                        │                     │
  │                     rejected (veto)        repopulated (when_able)
  └────── abort / veto ◀───┴─────────────────────┘
Any state ──lost liveness OR operator force──▶ ForceKilled (DELETE)
```

## Request / response contract

**ROWS → UE** (request): the `Drain { … }` struct above, delivered via Agones annotation the
GameServer watches (recommended — no new network path; UE already has the Agones SDK).

**UE → ROWS** (response, piggybacks the existing heartbeat):

| Field | Purpose |
|---|---|
| `request_id` | echo — a stale ack can't cancel a newer request |
| `state` | ack / draining / saving / **rejected** / complete |
| `players_remaining` | drain progress |
| `reject_reason?` | the veto, e.g. `has_players:3` |
| `last_progress_at` | distinguishes "saving slowly (alive)" from "hung" — this is what makes "no hard limit" safe |

Drain is **complete when UE says `complete`**, not when ROWS' (laggy) count hits 0.

## Allocation & travel — one preference order

Travel is just re-allocation through `join_map`, so there's no special "travel during shutdown"
path. The allocation rule is a **preference order**, not a hard include/exclude:

| Priority | Target | Used when |
|---|---|---|
| 1 | healthy (not draining) | normal — always preferred |
| 2 | `when_able`-draining | **fallback** — only if no healthy target exists |
| 3 | `asap` / `drop`-draining, Force | never |

This is what lets "stay on till it's done" work: in a gentle staggered restart every server is
`when_able`, so players freely travel among the still-up ones (tier 2) instead of being stranded.

### new-join vs travel

ROWS distinguishes the two by **active session** (it already tracks sessions):

- **session present → travel** — allowed (subject to the preference order).
- **no session → new join / reconnect** — honors the fleet `accept_new_joins` gate.

## Live-state data tiering (valkey vs DB)

Guiding line: **derivable/live state lives in valkey; durable/authoritative state lives in DB.**
Player count and zone membership can be reconstructed from heartbeats, so they don't need durability
— valkey loss is self-healing.

| Data | DB | valkey | Rebuild on valkey loss |
|---|---|---|---|
| Instance lifecycle (status, `gameservername`, drain, port) | ✅ **truth** | ✅ cache | re-query DB |
| Player count / instance | ❌ | ✅ **live** | next heartbeat |
| Zone roster (who's where) | ❌ | ✅ **live** | heartbeat + re-travel |
| Empty-since / last-seen (reaper timers) | ❌ | ✅ live | resets (fail-safe — grants fresh grace) |
| Player last-zone (resume) | ✅ **on logout/autosave** | — | durable |
| Character / inventory | ✅ truth | optional cache | re-query DB |

So **instances = DB truth + valkey cache** (one less DB hit on travel); **counts/rosters =
valkey-only** (rebuilt from heartbeats); **last-zone = DB on logout/autosave** (the only durable
"where" a player is).

**ROWS owns the zone roster from events.** ROWS already processes every join (`join_map`), travel
(re-allocation), and logout — so it maintains the valkey roster itself; the **heartbeat reconciles**
(UE's authoritative count corrects drift/crashes). UE doesn't need to ship full rosters every
heartbeat, just the count.

**Caveats:**
- **Reaper reads the live layer and fail-safes on no-data.** Reaper reads valkey for
  count/empty/liveness, DB for *which instances exist* + `gameservername` to deallocate. When
  occupancy data is missing/stale (valkey blip), it must **not reap** — same philosophy as
  `require_heartbeat`. This **evolves the reaper shipped in #13200** (which reads counts from
  `mapinstances`): that is **v1 (DB counts)**; valkey-counts is the **v2 target**.
- **Valkey loss → degraded routing, briefly.** No rosters → affinity can't answer "is my party
  here?" → fall back to least-loaded/new-instance until heartbeats + travel refill. Acceptable.
- **Optional:** a low-frequency count snapshot to DB (not per-heartbeat) for dashboard/observability
  only — not the hot path.

## Admission control hierarchy & runtime control plane

New-join admission is gated at multiple scopes; `join_map` (for a **new join**) walks them top-down
and the first "closed" gate rejects with a client-facing reason. **Travel (active session) bypasses
the new-join blocks** but still respects capacity/availability.

| Scope | Gate | Set by | Use case |
|---|---|---|---|
| **Global / game-wide** | `accept_new_joins` (off = freeze all) | dashboard (manual); optional auto circuit-breaker | incident / heavy-load: pause all new joins while planning |
| **Cluster / node-pool / node** | routing-eligible flag | kube operator (auto on full/pressure) or dashboard | cluster full → stop routing new joins there |
| **Tenant / fleet** | fleet-restart lockout | fleet-restart flow | rollout |
| **Instance** | `draining` + urgency | reaper / drain | per-server drain |

So allocation is one funnel: **global → cluster → tenant → instance preference-order.** Gates pause
*new joins*; existing players keep playing and traveling. Optionally a **hard** global pause also
blocks travel (travel is re-allocation = load too), giving two levels: soft (new joins only) and
hard (travel too) for a true emergency.

### Runtime control plane

These gates — plus the `reaper_config` knobs and fleet-restart triggers — are operational toggles
the **dashboard writes and ROWS reads at runtime**. Generalizes the env-baseline + DB-override
pattern already shipped for `reaper_config`:

- **DB = truth** (dashboard writes; survives restarts). The ows schema already has `global_data` /
  `world_settings` that could host global gates; per-scope tables for cluster/node.
- **valkey = hot-path cache** — global/cluster gates are read on *every* new join, written rarely by
  the dashboard → cache them, with DB as the source of truth.
- **auto vs manual** — cluster-full can auto-trip (a controller watching capacity); the global
  freeze is primarily a manual incident lever, with an optional auto circuit-breaker.

The `reaper_config` table (this PR) is the first slice of this control plane.

## Party affinity (routing) vs admission (UE)

| Concern | Owner |
|---|---|
| Where a player is *allocated* (incl. party affinity) | **ROWS** (valkey lookup) |
| Who a draining server still *admits* | **UE** (per urgency) |

Affinity rule on join to a zone:
- No party member in the zone → least-loaded non-draining instance (preference order above).
- Party member in the zone → the party's instance (anchor = party leader's instance).

Affinity needs a `(group, zone) → instance` lookup on the hot path → **valkey**, with an atomic
`SETNX`/claim so two members joining simultaneously don't split across servers. (See "Out of scope".)

## Reaper interaction (the correctness catch)

A `draining` instance is **exempt from the empty / never-reported reap** (a draining server going to
0 is *success*, not abandonment) — **but it is STILL subject to the Force path on lost liveness.** A
server that's draining and then crashes mid-save must still be reclaimed. So drain changes *which*
reap reasons apply, it does not remove the instance from reaping entirely.

## Fleet-restart (binary / gameplay / migration rollout)

**Default for every rollout** — even with no DB change, because gameplay/protocol logic can break
across versions. One cutover strategy, always full-shutdown-first, no mixed-version coexistence:

```
drain all old (stagger optional)
  ──▶ [BARRIER: all old down]
  ──▶ (update_type == migration? run dbmate)
  ──▶ launch new
  ──▶ players reconnect
```

### Two update types

| `update_type` | At the barrier |
|---|---|
| `restart` | nothing extra |
| `migration` | run dbmate, then launch new |

`migration` **is** the safe dbmate ordering: all old servers are down before the schema changes, and
new servers only start after — so no old binary races the migration. (The degrade-on-missing-column
guard in the reaper PR is the safety net for *accidental* ordering; this flow avoids it by
construction.)

### Phased join policy during the restart

| Phase | New joins | Travel | Purpose |
|---|---|---|---|
| Announced / early | ✅ | ✅ | normal play; countdown broadcast |
| Lockout (near end) | ❌ | ✅ | population can only shrink; a downed server can't be rejoined |
| All down → barrier | ❌ | ❌ | cutover |

The **lockout guarantees convergence**: no new entrants + can't rejoin a downed server + servers
shutting down → population monotonically → 0. `drop_players` is the last-resort for idle stragglers
on the final server, not the primary mechanism.

### Stagger

| `stagger` | `batch_size` | Behavior |
|---|---|---|
| `false` | — | all servers at once |
| `true` | `1` | one server at a time |
| `true` | `N` | groups of N at a time |

(+ optional `wave_delay` between batches.) Default `false` at current low player counts. Stagger only
smooths *how old servers drain* (DB save spike) — it's independent of the cutover, which always waits
for all-down. Player broadcast ("server restarting in X") pairs naturally with staggered waves.

### Absorbing the save spike (only when scale demands it)

Three escalating tiers, build only what's needed:

1. **Now:** `stagger: false`, saves go straight to Postgres (no spike at low counts).
2. **At scale:** `stagger: true` + `batch_size` to smooth the spike + per-batch player messaging.
3. **If waves still aren't enough:** **durable-queue (RabbitMQ, already deployed) write-behind** —
   servers dump saves as persistent messages, workers flush → Postgres at a controlled rate.
   **Never buffer authoritative saves in valkey** (volatile; eviction/restart = data loss — it
   reintroduces the exact risk the graceful save exists to prevent).

## Drain state representation

Lean toward dedicated columns on `mapinstances` (keeps the existing `status` 0/1/2 semantics intact):

- `drain_state` (none | requested | draining | saving)
- `drain_reason`, `drain_request_id`, `drain_deadline`

DB = lifecycle truth (survives ROWS restart + valkey loss). valkey = routing/affinity only.

## Ownership

| Concern | Owner |
|---|---|
| Where new players are allocated; exclude `asap`/`drop` from pool; party affinity | **ROWS** |
| Enforce the admission gate hierarchy (global/cluster/tenant/instance); new-join vs travel (session-aware) | **ROWS** |
| Write admission/control-plane toggles (global freeze, cluster routing, reaper knobs, fleet-restart) | **Dashboard** |
| Auto-trip cluster-full / load circuit-breaker | **kube operator / controller** |
| Drain state on `mapinstances`; reaper Force-on-liveness; "all drained" signal | **ROWS** |
| Transfer-target handout; stagger/batch orchestration | **ROWS** |
| Who a draining server admits (incl. party continuity); save-to-DB; drain pacing; `SDK.Shutdown()` timing; travel players on rebalance; render player broadcasts | **UE (chuck)** |
| Run dbmate (migration type); launch new image | deploy / CI / Argo |

## Edge cases

- **Veto race:** drain-empty issued, player joins same tick → UE replies `rejected: has_players:1`
  → ROWS clears its empty marker. `request_id` stops a stale ack canceling a newer request.
- **Idempotent re-issue:** reaper re-evaluates every 60s; a duplicate drain for an in-flight
  `request_id` is a no-op.
- **Drain stall (repopulation):** `when_able` keeps admitting → never empties. Fine for empty/
  rebalance (or auto-abort); for node-drain/fleet-restart, escalate `when_able → asap → drop`.
- **Deadline vs save time (node-drain):** `drop_players` must fire with **margin before** the k8s
  deadline, and `terminationGracePeriodSeconds` ≥ max expected save, or SIGKILL eats unsaved data.
- **Progress stall (alive but hung):** heartbeat alive but `players_remaining`/`last_progress_at`
  frozen for a very long window → alert, optional last-ditch force. The *only* place a (generous)
  timer re-enters, and only as a backstop.
- **Overlapping requests:** rebalance then node-drain → escalate to the stronger policy.
- **Already gone (404):** drain request to a dead pod → treat as `complete`, clean up the row.
- **Whole-party transfer:** rebalance moves a party together to a target with room for all; a big
  party that doesn't fit isn't rebalanced.
- **Anchor eviction:** when an instance enters Draining, evict its `(group → instance)` binding from
  valkey so new joiners aren't routed to a dying server (except `when_able` party continuity).
- **Reserved instance:** a freshly-allocated instance held for a traveling party looks empty → needs
  a "reserved/warming" grace so the reaper doesn't kill it before they connect.

## Open decisions

1. **Drain state representation** — dedicated `drain_*` columns (leaning this) vs extending the
   `status` enum.
2. **Shard-wide switch mechanism** — global `fleet_restart` flag (MVP) vs `target_version` control
   (composes with the Argo image roll, idempotent/self-healing). Leaning `target_version`.
3. **Node-drain deadline** — big `terminationGracePeriodSeconds` (blunt) vs proactive pre-drain
   (ROWS watches node cordon/drain events, drains those GameServers first with unlimited time).

## Out of scope (separate tickets / repos)

- **valkey group/zone + occupancy cache** — affinity lookup, `SETNX` anchor/claim for the join race,
  reserved-instance grace, instanced-vs-open-world policy, **plus the live occupancy layer** (instance
  cache, per-instance player count, zone roster, reaper timers — see "Live-state data tiering").
  (rows already has a valkey deployed.)
- **Reaper v2 (valkey-backed occupancy)** — move the reaper's count/empty/liveness reads from
  `mapinstances` to valkey (DB still source for instance lifecycle + `gameservername`), with
  fail-safe-on-no-data. The #13200 reaper is v1 (DB counts).
- **UE/chuck contract** — receiving requests, admission policy, save-to-DB, drain pacing, transfer,
  `SDK.Shutdown()` timing, player broadcasts. Extends #13194.
- **RabbitMQ write-behind** save buffer (only when stagger waves aren't enough).
- **client-version gate** — reject old clients with "update required" during/after a rollout.
- **Dashboard control plane** — UI + DB-backed toggles (global join freeze, per-cluster routing,
  reaper knobs, fleet-restart triggers), valkey-cached for hot-path reads. Generalizes
  `reaper_config`.
- **Cluster/node capacity controller** — auto-marks a cluster/node routing-ineligible on
  full/pressure; auto load circuit-breaker for the global freeze.
