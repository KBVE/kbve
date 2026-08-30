# ROWS — whole-fleet version roll

**Status:** design, rev 2 (after one review round). Replaces Plan 2 and Plan 3 of
[`2026-08-29-rows-phase4-version-rollout-design.md`](./2026-08-29-rows-phase4-version-rollout-design.md).
Plan 1 (CI immutable publish) shipped as PR #16510 and needs no change.

## Goal

A new server build goes live automatically, with no human step, once **nobody is playing**.

## Why not a rolling update

The game is one world split across zones, one GameServer per zone. Two server versions
cannot serve the same world at once. Agones `RollingUpdate` is built to produce exactly
that: it replaces `Ready` GameServers while `Allocated` ones keep running the old build. A
fleet mid-roll is a mixed fleet, which is disqualifying rather than a tuning problem.

So the roll is all-or-nothing, and the trigger is total emptiness: **zero active instances
across every zone.** Downtime during the swap is free, because the precondition is that
nobody is connected.

## The publish→roll window must not mix versions either

Rev 1 of this design got this wrong, so it is stated plainly.

The launchers pick their build themselves at every container start
(`chuckrpg-beta/manifests/fleet.yaml:75-77`): first `find /server -maxdepth 2 -name
"LinuxServer" -type d | sort -V | tail -1`, falling back to `find /server -maxdepth 1 -type
d -name '[0-9]*' | sort -V | tail -1`. Both are newest-wins.

That means the moment CI publishes `/server/<N>/`, **every pod created for any reason boots
`N`** — autoscaler scale-up, a reaper replacement, a crash restart — while `Allocated`
servers keep serving `N-1`. The fleet is mixed from publish until the roll fires, and since
the roll waits for an empty game that window is unbounded. Scaling to zero would buy
consistency only at the instant it happens.

**Fix: the boot version becomes an explicit pointer that ROWS owns.**

- The launchers boot `/server/current/` — no `find`, no newest-wins, no fallback. If
  `current` is missing or its target has no launch script, fail closed and exit 1.
- CI publishes `/server/<N>/` and does **not** touch `current`. (It keeps maintaining
  `latest` as a human-facing pointer and prune anchor; nothing boots from it.)
- ROWS repoints `current` to `N` as the first step of the roll, immediately before scaling
  to zero.

During the wait, new pods boot the *old* build, so the fleet stays consistent. After the
swap, everything is on `N`. This also makes rollback a one-symlink operation.

## Prerequisite: the trigger has to be able to fire

`count_active_instances()` (`repo/instances.rs:1184`) counts `mapinstances` rows with
`status > 0`. A row only leaves that state via the empty-server reaper or UE's
`SDK.Shutdown()`. **The reaper ships disabled** — `ROWS_EMPTY_REAPER_ENABLED` defaults
false (`config.rs:356`) and is commented out in
`apps/kube/rows/tenants/base/deployment.yaml`.

So on today's deployment an idle zone server keeps its instance row alive indefinitely, the
count never reaches zero, and the roll never fires. This is a hard prerequisite, not an open
question: **the reaper must be enabled (or UE self-shutdown confirmed working) before this
design does anything at all.** Enabling the reaper has its own gate — live UE heartbeats,
per [`ue-chuck-drain-contract`](./2026-06-24-ue-chuck-drain-contract.md).

Before implementing, confirm what "active" should mean here: an instance row with zero
characters on it is still `status > 0`, so "no instance rows" and "no players" are not the
same predicate.

## Mechanism

At zero players nothing is `Allocated`, so scaling the fleet to zero deletes every
GameServer. The `FleetAutoscaler` (`chuckrpg-beta/manifests/fleet-autoscaler.yaml`: Buffer,
`bufferSize: 1`, `minReplicas: 0`, `maxReplicas: 10`, FixedInterval 30s) then refills on its
own, and the replacements boot whatever `current` points at.

The autoscaler is the recovery mechanism, not an obstacle. The earlier scale-to-0 design
(old R3) failed because it needed to *hold* the fleet at zero through a soak while the
autoscaler pushed back within 30s. This design never holds.

Argo sets `ignoreDifferences` on Fleet `/spec/replicas` with `RespectIgnoreDifferences=true`
(`chuckrpg-beta/application.yaml`), so the patch is not reverted on sync. One in-cluster
check is still worth doing: with `ServerSideApply=true`, a field Argo's manager previously
owned can be reset when it stops being owned. Exposure is bounded — git has `replicas: 0`,
and the autoscaler rewrites replicas within 30s — but verify rather than assume.

## Sequence

Owned by ROWS. CI's only involvement is announcing that a build exists.

```
CI publishes /server/<N>/            (PR #16510, unchanged)
  → CI POSTs "target version = N" to ROWS
  → deploy_state.TargetVersion = N, Rolled = false, RollPhase = 'pending'

ROWS reconcile, every 30s, driven by RollPhase:

  pending:
      count_active_instances() == 0 ?  no → stay pending (do NOT drain)
      yes → try_set_admission_lockout()          (claim; see below)
            re-check count_active_instances() == 0 under the lockout
            still 0 ? no → release lockout, stay pending
            snapshot the current GameServer names
            repoint /server/current -> <N>
            scale_fleet(0)
            RollPhase = 'swapping'

  swapping:
      every name in the snapshot is gone ?
        no  → wait (bounded by a timeout; on expiry release the lockout,
               RollPhase = 'pending', alert — do not hold the freeze open)
        yes → release the lockout, RollPhase = 'settling'

  settling:
      a GameServer is Ready AND reports version N ?
        yes → Rolled = true, RollPhase = 'idle'
        timeout → Health = 'unhealthy', alert. current stays at N; recovery is
                  manual (see failure modes).
```

Three details the reconcile must get right, each from a real failure in review:

- **The barrier is a name snapshot, not a count.** `count_gameservers()`
  (`agones/fleet.rs:33`) counts every GameServer with the fleet label, in all states. The
  autoscaler refills within 30s while old pods are still terminating, and the template is
  unchanged so the same GameServerSet is reused — nothing distinguishes old from new. A
  `count == 0` barrier can therefore never be satisfied, and the sequence would hold the
  admission lockout forever: a permanent join freeze, not a roll. Wait for the *specific*
  pre-scale GameServers to disappear.
- **`RollPhase` must be persisted.** With only `Rolled` to go on, the tick after the
  autoscaler refills sees zero instances again — joins are locked out, so no rows exist —
  and re-runs `scale_fleet(0)`, killing the servers it just created, every 30s.
- **The lockout is `admission_control`, not `fleet_restart`.** Claim it with
  `try_set_admission_lockout` (`repo/instances.rs:1291`), which is atomic and *refuses* if
  another writer already holds the freeze — piggybacking is forbidden by design, so a
  refused claim means stay `pending` and retry. Writing `fleet_restart.active = true`
  instead would start `fleet_restart_reconcile`'s drain fan-out, which this design never
  wants. Decide who lifts the lockout if ROWS dies between claim and release: today only an
  active restart's reconcile lifts an owned lockout, so `RollPhase` recovery on startup has
  to cover it.

## What is reused

| Piece | Where |
|---|---|
| `scale_fleet(replicas)` | `agones/client.rs:179` — JSON merge patch on the Fleet |
| GameServer listing | `agones/fleet.rs:33,56` — `count_gameservers` / `fleet_status` |
| `count_active_instances()` | `repo/instances.rs:1184` |
| `try_set_admission_lockout` | `repo/instances.rs:1291` |
| `deploy_state` | `packages/data/sql/schema/ows/deploy_state.sql` — `TargetVersion`, `Rolled`, `Health` |
| `deploy_state_refresh` loop | `jobs.rs:72` — 30s tick to hang the reconcile off |
| Build reporter | `ows-build-reporter-configmap.yaml` — posts the resolved version |

## What is new

1. **`/server/current`,** owned by ROWS, and launchers that boot it and fail closed.
   Bootstrap: point `current` at the running version before the launcher change lands, or
   the first pod restart after the change has nothing to boot.
2. **`deploy_state.RollPhase`** — additive migration, plus the SQL mirror.
3. **An endpoint for CI to announce a build.** `POST /api/System/ReportBuildAvailable`,
   gateway bearer token like `RestartFleet` (`rest/system.rs:937`) — *not* the
   `X-CustomerGUID` the GameServer reporter uses, since a GameServer must not set the
   target. Writes `TargetVersion`, `Rolled=false`, `RollPhase='pending'`.
4. **A CI step** at the end of the server build calling it. One `curl`. The runner keeps
   zero Kubernetes permissions.
5. **The reconcile.** `seed_deploy_state` is `INSERT … ON CONFLICT DO NOTHING`
   (`repo/instances.rs:1458`) and `set_deploy_health` has no callers, so `deploy_state` is
   write-once today. It becomes live state.

## Failure modes

- **Nobody ever stops playing.** The roll waits indefinitely. Correct, but must be visible:
  expose `TargetVersion`, served version and wait duration on `/health`, and flip
  `Health='unhealthy'` past a threshold.
- **New build crash-loops.** Pods come up on `N`, fail, and Agones recreates them into the
  same broken build. Recovery is repointing `current` back to `N-1` — one symlink, and
  `KEEP=2` guarantees `N-1` is still on the PVC. Needs an operator endpoint and a runbook
  line; do not make this a manual `kubectl exec`.
- **A join slips through the lockout.** The admission gate runs before candidate selection,
  so it does cover `join_candidate_key`'s last-resort admission into a draining instance —
  but it fails **open** twice: on a DB error in the admission read, and via
  `unwrap_or(true)` in travel detection, where a DB blip classifies a new join as travel and
  bypasses the gate. The under-lockout re-check narrows this; it does not close it. Define
  what happens if an instance appears after the snapshot: abort and retry, do not proceed.
- **Scale-to-0 succeeds, autoscaler does not refill.** Fleet sits empty. Detectable as the
  post-swap Ready count staying at zero; alert on it.
- **ROWS restarts mid-roll.** `RollPhase` is the recovery input; startup must reconcile it
  against reality, including releasing an orphaned lockout.

## Open questions

1. **Multi-tenant.** `deploy_state` and `fleet_restart` are one row per `CustomerGUID`, and
   `AgonesClient` binds to a single fleet. Whether beta/dev/prod roll independently, or one
   tenant maps to several fleets, needs settling before the reconcile is written.
2. **Interaction with an operator `fleet_restart` row.** A version roll should not start
   while one is active, and probably should not be pre-emptable by one. The lockout claim
   gives a natural interlock — decide whether that is sufficient.
3. **Does the swap need `terminationGracePeriodSeconds`?** It is unset on all fleets
   (implicit 30s). If a server needs longer to flush a save, the snapshot barrier will wait
   for it, which is correct but extends the freeze. Measure before setting.
