# ROWS — whole-fleet version roll

**Status:** design. Replaces Plan 2 and Plan 3 of
[`2026-08-29-rows-phase4-version-rollout-design.md`](./2026-08-29-rows-phase4-version-rollout-design.md).
Plan 1 (CI immutable publish) shipped as PR #16510 and is unchanged.

## Goal

A new server build goes live automatically, with no human step, once **nobody is playing**.

## Why not a rolling update

The game is one world split across zones, one GameServer per zone. Two server versions
cannot serve the same world at once. Agones `RollingUpdate` is built to produce exactly
that: it replaces `Ready` GameServers while `Allocated` ones keep running the old build, so
a fleet mid-roll is a mixed fleet. That is disqualifying, not a tuning problem.

So the roll is all-or-nothing, and the trigger is total emptiness: **zero active instances
across every zone.** Downtime during the swap is free, because the precondition is that
nobody is connected.

Rev 6 of the phase-4 doc proposed pinning a version in `fleet.yaml` and letting Agones roll
on the template change. That is rejected: it is a per-build git round-trip gated on a batch
`dev → main` merge, and it still produces a mixed fleet.

## Mechanism

At zero players there are no `Allocated` GameServers, so every GameServer in the fleet is
`Ready` and scaling to zero deletes all of them. The `FleetAutoscaler`
(`chuckrpg-beta/manifests/fleet-autoscaler.yaml`: Buffer, `bufferSize: 1`,
`minReplicas: 0`, 30s) then refills to `allocated + 1` on its own, and the replacement pods
boot the newest version directory because that is what the launcher picks:

```sh
find /server -maxdepth 1 -type d -name '[0-9]*' | sort -V | tail -1
```

Version consistency is structural: nothing survives the scale-to-0, so there is no old-build
survivor to be inconsistent with.

The autoscaler is the recovery mechanism here, not an obstacle. The earlier scale-to-0
design (old R3) failed because it needed to *hold* the fleet at zero through a soak while
the autoscaler pushed it back up within 30s. This design never holds — scaling to zero is
the whole operation, and the autoscaler bringing the fleet back is the desired outcome.

Argo already sets `ignoreDifferences` on Fleet `/spec/replicas` with
`RespectIgnoreDifferences=true` (`chuckrpg-beta/application.yaml:25-36`), so the patch is
not reverted on the next sync.

## Sequence

Owned by ROWS. CI's only involvement is announcing that a build exists.

```
CI publishes /server/<N>/            (PR #16510, unchanged)
  → CI POSTs "target version = N" to ROWS
  → deploy_state.TargetVersion = N, Rolled = false

ROWS reconcile, every 30s:
  Rolled = false ?
    → count_active_instances() == 0 ?
        no  → wait (players online; do nothing, do not drain)
        yes → take the admission lockout      (fleet_restart.Lockout)
              re-check count_active_instances() == 0 under the lockout
              scale_fleet(0)
              wait for count_gameservers() == 0
              release the lockout
              autoscaler refills; new pods boot /server/<N>/
  → GameServers report version N (existing build reporter)
  → Rolled = true when reported version == TargetVersion
```

The lockout closes the window where a player spins up between the emptiness check and the
delete. It is the existing `fleet_restart` lockout, held for seconds rather than for a
drain.

## What is reused

| Piece | Where | Note |
|---|---|---|
| `scale_fleet(replicas)` | `agones/client.rs:179` | JSON merge patch on the Fleet |
| `count_gameservers()` | `agones/fleet.rs:33` | all states; the "all old gone" barrier |
| `count_active_instances()` | `repo/instances.rs:1184` | the trigger |
| `deploy_state` | `packages/data/sql/schema/ows/deploy_state.sql` | `TargetVersion`, `Rolled`, `Health` — already the right shape |
| `fleet_restart.Lockout` | `fleet_restart.sql` | admission lockout |
| `deploy_state_refresh` loop | `jobs.rs:72` | 30s tick to hang the reconcile off |
| Build reporter | `ows-build-reporter-configmap.yaml` | already posts the resolved version |

## What is new

1. **An endpoint for CI to announce a build.** `POST /api/System/ReportBuildAvailable`,
   authenticated with the gateway bearer token like `RestartFleet`
   (`rest/system.rs:959`), not the `X-CustomerGUID` the GameServer reporter uses — a
   GameServer must not be able to set the target. Writes `TargetVersion`, `Rolled=false`.
2. **A CI step** at the end of `server_build` (or `server_prune`) that calls it. One
   `curl`. No cluster access from the runner; the runner keeps zero Kubernetes
   permissions.
3. **The reconcile itself.** `seed_deploy_state` is currently
   `INSERT … ON CONFLICT DO NOTHING` (`repo/instances.rs:1458`) and `set_deploy_health` has
   no callers, so `deploy_state` is effectively write-once today. It becomes live state.

## Failure modes

- **Nobody ever stops playing.** The roll waits indefinitely. That is correct behaviour, but
  it must be visible: surface `TargetVersion`, the served version and the wait duration on
  `/health`, and set `Health='unhealthy'` past a configurable threshold.
- **New build crash-loops.** Pods come up on `N`, fail, and Agones recreates them — into the
  same broken build, because the launcher always takes the newest directory. There is no
  automatic fallback. Recovery is to delete `/server/<N>/` from the PVC, at which point the
  launcher picks `N-1` again. `KEEP=2` exists so `N-1` is still there. Worth a runbook line.
- **Scale-to-0 succeeds, autoscaler does not refill.** Fleet sits empty. Detectable as
  `count_gameservers() == 0` persisting; alert on it.
- **A player connects during the swap.** Prevented by the lockout, provided the lockout is
  actually honoured on every join path.

## Open questions

1. **Multi-tenant.** `deploy_state` and `fleet_restart` are one row per `CustomerGUID`, and
   `AgonesClient` is bound to a single fleet. Whether beta/dev/prod each get an independent
   roll, or a tenant maps to several fleets, needs settling before the reconcile is written.
2. **Interaction with an operator `fleet_restart` row.** A version roll should not start
   while an operator restart is active, and probably should not be pre-emptable by one.
3. **Does the existing lockout cover every join path?** `join_candidate_key`
   (`repo/instances.rs:36-55`) admits a join to a draining instance as a last resort. That
   path must be closed while the roll's lockout is held.
4. **Zero-instances vs zero-players.** `count_active_instances()` counts instance rows. An
   instance with no characters on it may still be "active". If an idle zone server keeps a
   row alive, the fleet is never empty by this measure and the roll never fires. This needs
   checking against the empty-server reaper's definition before implementation.
