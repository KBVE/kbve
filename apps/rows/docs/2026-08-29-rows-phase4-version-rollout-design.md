# ROWS Phase 4 — Version Rollout (revised design)

**Status:** design, rev 7. Supersedes the Phase 4 section (R0–R5) of
[`2026-06-24-rows-drain-fleet-restart.md`](./2026-06-24-rows-drain-fleet-restart.md).
Phase 3 (drain, `fleet_restart`, `deploy_state`, trigger/pending routes) is shipped and is
reused where noted. This document replaces the Argo-Workflow scale-to-0 orchestrator
(old R3) with an Agones-native rolling model.

**rev 7 (2026-08-30): the fleet version pin is dropped.** Rev 6 made
`OWS_SERVER_VERSION` in `fleet.yaml` the single kube-side pin and the rollout trigger.
That is gone — see §2. Plan 1 shipped without its pin-dependent half; Plan 2 is deleted
entirely; Plan 3 is superseded by
[`2026-08-30-rows-whole-fleet-version-roll.md`](./2026-08-30-rows-whole-fleet-version-roll.md),
which rolls the whole fleet at once when the game is empty instead of draining a mixed one.

**This document is now history plus §1.** The verified current-state audit in §1 is still
the reference; the live design lives in the file above.

**Goal:** a new chuck server build reaches the beta fleet with no human step after the
mdx version bump, and a running server is replaced only when it has no players.

**Non-goals:** prod fleet (Argo app disabled, no CI producer), Windows client-parity gate
(old R1), migration-safety lint (old R2), non-kube supervisors. The decision logic lives in
ROWS so a non-kube supervisor can be added later without redoing this work.

| Plan | Scope | State |
|---|---|---|
| 1 | CI immutability + gate fix + prune | **Shipped** (PR #16510). No fleet change. |
| 2 | Fleet pin + reporter + server post-publish job | **Dropped** — see §2. |
| 3 | ROWS version-aware drain | **Superseded** by the whole-fleet roll — see §Plan 3. |

---

## 1. Verified current state

Two independent audits (Explore + two Opus verification passes + Fable spec review,
2026-08-29) against `dev`. Everything below is confirmed with file references.

### Build delivery (CI → PVC)

- `ci-unreal-build.yml` deploy step copies the **contents** of `LinuxServer/` into
  `/mnt/longhorn/ows-server/<target>/<version>/`. Result on PVC: `/server/<ver>/chuckServer.sh`,
  **no `LinuxServer/` level** (`.github/workflows/ci-unreal-build.yml:619-635`).
- **(fixed by Plan 1, PR #16510)** Deploy does `rm -rf "${DEST}"` before copy (`:626`). Republishing a version deletes a
  directory a pod may be executing from.
- **(fixed by Plan 1, PR #16510)** The "already deployed → skip build" gate checks `${DEST}/LinuxServer` (`:356`), which
  deploy never creates. `should_build` is always true.
- **(fixed by Plan 1, PR #16510)** Prune runs inside the publish job, keeps newest 3, protects only the `latest` symlink
  target (`:637-670`). `.nfs*` is not an in-use guard for a running binary.
- Version selection: `ci-dispatch-manifest.json` wins over `version.toml` (`:297-302`).
  Manifest = desired (from mdx, written by `ci-manifest-sync.yml`); `version.toml` =
  published. Any difference is lag, not drift. As of 2026-08-29 evening: mdx, manifest and
  `version.toml` all read `0.3.51` (#16495, #16498). `/server/chuckServer/0.3.51` was built
  by a manual dispatch at 04:21 (before the mdx bump) and its mtime is unchanged, so the
  later chain did not republish over it.
- **The server chain has no post-publish.** The chuck post-publish PR
  (`chore(chuck): post-publish sync …`) is produced by `game_post_publish`
  (`ci-unreal-build.yml:1610-1628`), which runs only for `mode == 'game'` (client). Game and
  server builds are dispatched in parallel from the same manifest version
  (`ci-unreal.yml:55-108`). The mdx is `pipeline: unreal_game` (`unreal-chuck-beta.mdx:14`).
- Post-publish PRs are auto-merged by `ci-auto-merge-bot-prs.yml:168,197,378-397`.
- `apps/rows/scripts/deploy-server.sh` mounts the PVC at its root (no `subPath`) and
  writes `/<ver>/LinuxServer/`. Fleets mount `subPath: chuckServer*`. Its output is invisible
  to every fleet.
- PVC is `ReadWriteMany` (`apps/kube/github/runners/manifests/ows-server-build-pvc.yaml:13-14`).
  Old R0 Step 4 gate: resolved.

### Fleet manifests

- Beta `ue5-server` picks the newest numeric dir at boot
  (`apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml:74-84`). Rev 6 treated
  this as a defect; as of rev 7 it is **the mechanism** — see §2. Its consequence is
  unchanged and is the open problem: a pod restart changes version silently, and a new
  publish changes nothing until a restart. Observed 2026-08-29: pod on `0.3.49` for 9h with
  PVC `latest → 0.3.51`, rolled by hand. Still true 2026-08-30: both beta GameServers on
  `0.3.53` with the PVC at `0.3.54`.
- Dev and prod default to `/server/latest/LinuxServer/chuckServer.sh`
  (`chuckrpg-dev|prod/manifests/fleet.yaml:76`). That path cannot exist given the CI layout,
  and both fallbacks there also require a `LinuxServer` dir. **Verified 2026-08-30:** the
  chuckrpg-dev pod exits 1 with `ERROR: cooked server binary not found` before UE starts —
  an earlier cause of that fleet's READY=0 than the known Agones `Ready()` hang. Its subPath
  `chuckServerDev/` is an **empty directory** dated PVC-provisioning day: `unreal_chuck_dev`
  has never dispatched, because its declared `version_toml`
  (`apps/chuckrpg/unreal-chuck/version-dev.toml`) does not exist and `is_newer`'s `0.0.0`
  guard then refuses forever. Dev and prod are unused; only beta is shipped.
- Prod: `subPath: chuckServerProd` has no CI producer; prod Argo app is commented out
  (`apps/kube/kustomization.yaml:75`). Unreachable config.
- **Argo tracks `main`** (`chuckrpg-beta/application.yaml:21`). Anything merged to `dev`
  reaches the cluster only at the next dev→main merge.
- `terminationGracePeriodSeconds` unset on all fleets (implicit 30s).
- `spec.replicas: 0` committed; a `FleetAutoscaler` (Buffer, `bufferSize:1`,
  `minReplicas:0`, 30s) drives replicas to `allocated + 1`
  (`chuckrpg-beta/manifests/fleet-autoscaler.yaml:11-21`). Agones has no suspend field.
- Argo app for the fleet: `automated.prune: true`, **no `selfHeal`**, `ignoreDifferences` on
  Fleet `/spec/replicas` + `RespectIgnoreDifferences=true` (`application.yaml:25-36`).
- ROWS allocates a GameServer (`GameServerAllocation`) on player spin-up, matching only
  `agones.dev/fleet` (`apps/rows/src/agones/pipeline.rs:170-173`, `allocate.rs:99-112`).
  Agones `RollingUpdate` never deletes an **Allocated** GameServer; it replaces **Ready** ones.
- `mapinstances.gameservername` exists and is written at insert (`repo/instances.rs:853`,
  `models.rs:215`). `fleet_restart.targetversion` exists, unused
  (`packages/data/sql/schema/ows/fleet_restart.sql:22`).

### Build reporter

- `report.sh` resolves `OWS_SERVER_BIN` (unset everywhere) then falls back to the newest
  `*Server.sh` on the PVC (`ows-build-reporter-configmap.yaml:13-14`). Re-runs every 60s.
  Reports "newest published", not "running". Authenticated only by `X-CustomerGUID`
  (`rest/system.rs:775-780`) — any GameServer can post any version.
- `seed_deploy_state` is `INSERT … rolled=true ON CONFLICT DO NOTHING`
  (`repo/instances.rs:1458-1477`). No other writer; `set_deploy_health` has zero callers
  (`:1482`). `/health.unreal_version` is frozen at the first version ever reported,
  `GET /fleet-restart/pending` is permanently `false`, aggressive trigger always 412s
  (`rest/system.rs:356-372`).

### Fleet-restart machinery (Phase 3, shipped)

- `POST /fleet-restart/trigger` order: 401 token → 412 reaper-disabled (**both** modes,
  `rest/system.rs:336-352`) → 412 no-pending (aggressive) → 409 row active. Accepts
  undocumented `stagger`/`batch_size`. Doc says 404; code says 412.
- Reaper default off (`config.rs:356`); env commented out with a runbook gate requiring live
  UE heartbeats (`apps/kube/rows/tenants/base/deployment.yaml:100-112`); `jobs.rs:409-431`
  suppresses reaping of never-reported instances without an observed heartbeat.
- "Only the reaper writes `status=0`" (code comments, `CLAUDE.md`, old plan) is false:
  `POST /api/Instance/ShutDownServerInstance` (service-key) and gRPC also write it
  (`rest/instances.rs:325-346`, `grpc.rs:365`).
- `set_fleet_restart` hard-codes `lockout=true` (`repo/instances.rs:1548,1553`); schema
  default `Lockout true`. No `lockout=false` writer.
- Drain fan-out `list_drainable_instances` has no version predicate (`:1218-1226`); it
  drains every active instance.
- Convergence/latch = `count_active_instances == 0 && count_gameservers == 0`
  (`jobs.rs:1003-1024`); `count_gameservers` is state-agnostic (`agones/fleet.rs:33-53`).
  With the autoscaler live this can never be true. Stall path warns after
  `fleet_restart_stall_secs`, errors and auto-lifts lockout after 2× (`jobs.rs:1144-1186`).
- `join_candidate_key` (`repo/instances.rs:36-55`) still admits joins to a
  `state=1, urgency=0` instance as last resort when no healthy instance exists for the zone.
- `scale_fleet` / `RestartFleet` 409s while a row is active (`rest/system.rs:966-1000`).
  `RestartFleet` authenticates only if `ROWS_FLEET_RESTART_TOKEN` is non-empty; secret is
  `optional: true` (`deployment.yaml:78-83`).
- No version comparison exists anywhere in ROWS (`state.rs:35`; read only by `/health`).
- `client_versions` table does not exist; Win64 client job has a skip path that still lets
  the server publish go green (`ci-unreal-build.yml:1084-1090`).

### Why old R3 is dropped

Old R3 (drain → `safe_to_roll` → scale-to-0 → apply → scale-up → soak) is unreachable:
the barrier needs `gameservers == 0` before the step that scales to 0, the FleetAutoscaler
refills to 1 within 30s, and the only scaler 409s while the row it depends on is active.
It also forces full-tenant downtime per roll. Agones already gives "replace only empty
servers" via Allocated/Ready, and ROWS already allocates. The revised design uses that.

---

## 2. Design

### Principle (rev 7)

**The newest version directory on the PVC is the target version.** There is no pin.

Every fleet launcher resolves its build at container start with
`find /server -maxdepth 1 -type d -name '[0-9]*' | sort -V | tail -1`, so any pod that
starts runs the newest published build. Publishing is therefore the only rollout input, and
`fleet.yaml` never changes between releases.

Rev 6 instead made `OWS_SERVER_VERSION` in `fleet.yaml` the pin and its bump the rollout
trigger. That was dropped for cost: it required a CI-authored PR per server build, an
auto-merge to `dev`, a batch human `dev → main` merge, and an Argo sync before a build could
reach the cluster — and it made prune's "which version is still in use" question require
Agones labels, a ServiceAccount and RBAC to answer. Without a pin the question has no
subject, because no pod ever wants an older directory.

**What the pin was also doing, and what now has to replace it.** A pin bump changed the
Fleet template, and *that* is what made Agones roll: `RollingUpdate` replaces `Ready`
GameServers and leaves `Allocated` ones alone. With no template change there is no trigger
at all — a `Ready` GameServer on an old build sits `Ready` on that build indefinitely. A
publish reaches only pods that happen to be created for other reasons.

So the rollout trigger moves from CI into ROWS (Plan 3). Until Plan 3 lands, rolling is an
operator action (`RestartFleet`, or deleting `Ready` GameServers).

### Data flow

```
mdx version bump (human)
  → ci-unreal-build (mode=server): build → /server/<ver>/ (immutable) → latest symlink
  → prune keeps newest 2                                    ← CI ends here
                                                               no PR, no Argo, no fleet edit

  → any GameServer created from now on boots /server/<newest>/
  → existing GameServers keep running whatever they started with:
       ├─ Ready (empty) old GS: nothing removes it            ← THE GAP
       └─ Allocated (busy) old GS: correct to leave alone

  → ROWS (Plan 3): target = newest version observed Ready
       → drain instances below target (joins go only to target-version instances)
       → empty → shutdown (reaper or UE ShutDownServerInstance) → GS deleted
       → FleetAutoscaler refills; the new GS boots the newest dir
```

The client side needs no CI sequencing: ROWS already tracks the served version
(`rest/system.rs`), and a client launcher picks the client build matching it. Retaining two
client builds is an itch channel-naming change (version-suffixed channels), independent of
everything here.

---

### Plan 1 — CI publish: immutable versioned builds — SHIPPED

See [`2026-08-29-plan1-ci-immutable-server-builds.md`](./2026-08-29-plan1-ci-immutable-server-builds.md).

Flat immutable layout, a working gate, an atomic stage-and-swap publish, a reachable
`force_republish`, forward-only `latest`, and prune keeping newest `KEEP=2` plus the
`latest` target. No pins, no cluster reads, no added permissions. `latest` is human
convenience and a prune anchor; no fleet reads it.

---

### Plan 2 — DROPPED

Fleet pin (2.A), reporter rewrite (2.B), server post-publish job and `-fleet` PR (2.C), and
the pin-rollback runbook (2.D) are all deleted.

2.B would have been a regression: the reporter already resolves the version with the same
newest-dir logic as the launchers (`ows-build-reporter-configmap.yaml:18`), and rewriting it
to read `OWS_SERVER_VERSION` would have coupled it to a value that no longer exists.

A grep for `ows.kbve.com/server-version` and `OWS_SERVER_VERSION` across `.rs`, `.yaml`,
`.yml` and `.sql`, excluding these docs, returns nothing — the pin never reached live code,
so dropping it deletes none.

---

### Plan 3 — SUPERSEDED

Rev 6's Plan 3 was a version-aware rolling drain: stamp each instance with the version of
the GameServer it was allocated from, compare against the fleet pin, and drain instances
below it while new joins go only to pinned-version servers. It is deleted.

Two reasons. It read a `ows.kbve.com/server-version` label that the dropped pin was
supposed to write, so it had no input. More fundamentally it was designed to converge a
*mixed* fleet, and a mixed fleet is not acceptable: the world is one game split across
zones, one GameServer per zone, and two server versions cannot serve it at once.

The replacement waits for the whole game to be empty and then rolls everything at once,
which removes the need for per-instance versions, join filters and drain entirely:

**→ [`2026-08-30-rows-whole-fleet-version-roll.md`](./2026-08-30-rows-whole-fleet-version-roll.md)**


## 3. Error handling

| Failure | Behaviour |
|---|---|
| Pinned version missing on PVC | `ue5-server` sleeps 60s, exits 1. Agones recreates on its health loop. 3.4(a) never holds, so no system row opens; existing old instances keep taking joins; spin-ups land on old Ready GS via the fallback selector (3.3). `deploy_healthy=false` after `ROWS_DEPLOY_UNHEALTHY_AFTER_SECS`. Fix = rollback PR (2.D). Cannot happen via the normal path: 2.C runs only after the gate confirms the build is on the PVC. |
| New build crash-loops | Same: 3.4(a) gates the drain, so a broken roll causes no join outage. |
| Republish same version | CI fails fast (Plan 1.3). |
| Player joins during drain | 3.6 routes to pinned-version instances only (all three join paths); spin-up prefers the pin (3.3). |
| Stale `usersessions` keeps an old instance non-empty | Reaper `minutes_to_shutdown_after_empty` + session expiry apply. `/fleet-restart/status.stalled=true` after `fleet_restart_stall_secs`. Operator escape: aggressive trigger escalates the system row (3.5). |
| ROWS restarts mid-roll | State in `deploy_state`, `fleet_restart`, `mapinstances.serverversion`; reconcile resumes. |
| Pin merged to `dev` but not `main` | Nothing happens until promotion; prune reads `main` + live Fleet so the build survives. |
| Autoscaler + rolling update | Autoscaler wants `allocated + 1`; RollingUpdate satisfies it with pinned-version Ready servers. No conflict. |

---

## 4. Open measurement

`terminationGracePeriodSeconds` is 120 as a placeholder. Before enabling the reaper on beta,
measure the worst-case save on a drained server and set TGPS to that plus margin. Record it
in `2026-06-24-rows-server-lifecycle-and-shutdown.md` (fleet-restart operator runbook).

---

## 5. Testing

- **Plan 1 — shipped.** `bash .github/scripts/ows/tests/run-all.sh`: gate skips when the
  launch script is present and rebuilds under `force_republish`; a partial dir rebuilds
  while a complete one is refused (exit 3); publish leaves no `.stage-*` or `.old-*`;
  `latest` moves forward only; prune keeps newest 2, the `latest` target and `.nfs*` dirs,
  and sweeps stale leftovers without touching a fresh staging dir. Run and linted in CI by
  the `ows_scripts` job in `ci-actionlint.yml`.
- **Plan 2 — dropped**, no tests.
- **Plan 3** — superseded; its tests live with the design that replaced it.

---

## 6. Rollout order

1. Plan 1 (CI) — PR #16510 to `dev`. **Done.**
2. Whole-fleet version roll — see
   [`2026-08-30-rows-whole-fleet-version-roll.md`](./2026-08-30-rows-whole-fleet-version-roll.md).
3. Measure the save budget and set `terminationGracePeriodSeconds` (§4).
4. Live tests (§5).

Each step is its own PR to `dev`.

**Until step 2 ships, rolling beta is manual.** A publish reaches only newly created pods;
an existing `Ready` GameServer stays on its build indefinitely. The operator lever is
`RestartFleet` or deleting `Ready` GameServers, and it is the only one.
