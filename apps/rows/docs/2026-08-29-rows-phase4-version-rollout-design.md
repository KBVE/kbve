# ROWS Phase 4 — Version Rollout (revised design)

**Status:** design, rev 7. Supersedes the Phase 4 section (R0–R5) of
[`2026-06-24-rows-drain-fleet-restart.md`](./2026-06-24-rows-drain-fleet-restart.md).
Phase 3 (drain, `fleet_restart`, `deploy_state`, trigger/pending routes) is shipped and is
reused where noted. This document replaces the Argo-Workflow scale-to-0 orchestrator
(old R3) with an Agones-native rolling model.

**rev 7 (2026-08-30): the fleet version pin is dropped.** Rev 6 made
`OWS_SERVER_VERSION` in `fleet.yaml` the single kube-side pin and the rollout trigger.
That is gone — see §2. Plan 2 is deleted entirely; Plan 1 shipped without its
pin-dependent half; Plan 3 loses the input it was designed around and needs a new one.

**Goal:** a new chuck server build reaches the beta fleet with no human step after the
mdx version bump, and a running server is replaced only when it has no players.

**Non-goals:** prod fleet (Argo app disabled, no CI producer), Windows client-parity gate
(old R1), migration-safety lint (old R2), non-kube supervisors. The decision logic lives in
ROWS so a non-kube supervisor can be added later without redoing this work.

| Plan | Scope | State |
|---|---|---|
| 1 | CI immutability + gate fix + prune | **Shipped** (PR #16510). No fleet change. |
| 2 | Fleet pin + reporter + server post-publish job | **Dropped** — see §2. |
| 3 | ROWS version-aware drain | Not started. Now the *only* roll mechanism. |

Plan 3 converges only if empty drained servers actually shut down, which needs the
empty-server reaper, which needs live UE heartbeats (UE-side, outside this doc).

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

### Plan 3 — ROWS version-aware drain

**Plan 3 is now the only roll mechanism, and it needs a new input.** Every component below
was written against the fleet pin: 3.1 stamps `serverversion` from the allocated
GameServer's `ows.kbve.com/server-version` label, and 3.2 reads the same label off the Fleet
as the target. Neither label exists. Treat 3.1 and 3.2 as **open**, and 3.3–3.8 as
conditional on how they are resolved.

The candidate target is *the highest version among GameServers currently `Ready` or
`Allocated`* — the value both the launcher and the reporter already compute independently.
Open problems with it:

- **Source of truth.** With no label, the reporter is the only version signal, and 3.1
  rejects it precisely because it is spoofable by any GameServer (`rest/system.rs:775-780`
  authenticates only `X-CustomerGUID`). Either accept that trust level for drain decisions,
  or have the GameServer stamp its own Agones label via the SDK at boot — which is the same
  trust level, more honestly named.
- **Bootstrapping.** "Highest version observed Ready" cannot notice a build that no pod has
  started yet, so a publish does not become a target until something boots it. Something has
  to create that first pod.
- **Crash loops.** A newest-dir target is self-fulfilling: if the new build cannot start,
  no GS ever reports it, so the target never advances and nothing drains. That is
  fail-safe, and it also means a bad publish is invisible rather than alarming.

An alternative worth pricing before committing: drop version comparison entirely and roll on
*publish time* — drain instances whose GameServer is older than the newest build's mtime.
It needs no version plumbing at all, at the cost of not being able to say what is running.

The system-row semantics below stand on their own and are unaffected by which target source
wins. Components:

**3.1 Per-instance version, stamped at allocation.** *(OPEN — rev-6 text; the
label it reads does not exist. Retained for the schema and call sites, not the source.)* `mapinstances.serverversion TEXT NULL`
(additive migration + `packages/data/sql/schema/ows/` mirror). Written when the instance row
is inserted (`repo/instances.rs:846-870`, new arg) from the allocated GameServer's
`ows.kbve.com/server-version` label. The `GameServerAllocation` response carries
`status.metadata.labels` (Agones 1.58); `AllocationResult` (`allocate.rs:11-15,155-193`)
currently keeps only name/address/port and gains a `labels` field.
`reconcile_allocations` (`agones/sdk.rs:266-306`) backfills on startup. The reporter is not
a source — it is spoofable by any GameServer (§1).

**3.2 Fleet pin reader.** *(OPEN — rev-6 text; there is no pin to read. Whatever
replaces it occupies this slot: one cached call returning the target version.)* `agones::fleet::pinned_version(fleet) -> Option<String>`:
GET the Fleet, read `spec.template.metadata.labels["ows.kbve.com/server-version"]`. Cached
in the existing 30s snapshot with `count_gameservers`. This is the only kube-specific read;
a non-kube supervisor replaces this function.

**3.3 Allocation prefers the pin.** `allocate.rs:99-105` switches from the deprecated
`required` to ordered `selectors`: `[{fleet + ows.kbve.com/server-version: <pin>}, {fleet}]`
when `pinned_version()` is `Some`; `[{fleet}]` when `None`. **Preferred, not required**: a
required pin label would 500 every spin-up in the surge window (new GS not yet Ready;
`NotAllocated` is not retryable, `allocate.rs:132-137`, `error.rs:20-22`). With preference,
a spin-up in that window may land on the old version and is then drained like any other
old instance. So 3.3 biases, it does not guarantee.

**3.4 `deploy_state` becomes live.** Replace the `DO NOTHING` seed with an upsert driven by
the snapshot:

- pin ≠ `targetversion` → `targetversion = pin, rolled = false, health = 'healthy'`.
- `rolled = true` when **(a)** ≥1 GameServer `Ready|Allocated` carries label `== pin`
  **and (b)** zero active instances with `serverversion IS DISTINCT FROM pin`.
  (a) stops an empty fleet from being vacuously "rolled" while the new build crash-loops.
- `health = 'unhealthy'` when `rolled = false` for longer than
  `ROWS_DEPLOY_UNHEALTHY_AFTER_SECS` (new knob, default 900) with no GS at the pin
  `Ready|Allocated`. Register it in the config index doc.
- `/health`: `target_version` (the pin) and `served_versions[]` (distinct
  `serverversion` of active instances) as separate fields. `unreal_version` keeps its
  current meaning (served) for launcher compatibility; note in the UE contract doc.

**3.5 Version-roll drain — a distinct row kind.** The existing operator row semantics
(lockout, whole-fleet fan-out, `count_active == 0` latch, stall, 409) do not fit a rolling
roll. Add a discriminator `fleet_restart.owner IN ('operator','system')` (additive
migration; default `'operator'`) with system-row rules:

| Aspect | Operator row (today) | System row (version-roll) |
|---|---|---|
| Opened by | `POST /fleet-restart/trigger` | reconcile, when `deploy_state.rolled=false` **and** condition (a) of 3.4 holds |
| `lockout` | true | **false** — new `open_system_fleet_restart` writes it |
| Fan-out | all active instances | `list_drainable_instances_not_at_version(pin)` |
| Drain state | `state=1, urgency=0` | `state=1, urgency=0` **plus** join filter (3.6) |
| Converged when | `active == 0 && gameservers == 0` | `count_active_instances_not_at_version(pin) == 0` → row `active=false`, `rolled=true` |
| Stall clock | `startedat` vs `fleet_restart_stall_secs` | same, on the not-at-version count |
| `safe_to_roll` / `drainedat` | latched | not used; `/fleet-restart/status` reports `mode: version-roll` and omits `safe_to_roll` |
| Operator trigger while active | 409 | **escalates**: aggressive trigger converts the row to operator-owned (`urgency=1`, deadline). Escalation of an `owner='system'` row is **exempt** from the reaper-disabled 412 (it converts, it does not create) |
| `POST /fleet-restart/clear` | `active=false` | `active=false` **and** `deploy_state.rolled=true` in one tx (accept the current version mix); status shows `cleared_by: operator`. Without this the open condition re-fires next tick and the roll cannot be cancelled |

Only one row exists at a time (PK `CustomerGUID`). A system row never overrides an active
operator row; it waits.

SQL consequences: `set_fleet_restart` is `WHERE active=false` (`repo/instances.rs:1548-1556`)
and cannot escalate. Add `escalate_fleet_restart`: one `UPDATE … SET owner='operator',
urgency=1, dropplayers=true, draindeadline=$1, lockout=true WHERE active AND owner='system'`
(satisfies `chk_safe_default`/`chk_deadline_aggr` because `urgency=1` is set in the same
statement). Escalation adopts full operator semantics including lockout. Convergence writes
`fleet_restart.active=false` and `deploy_state.rolled=true` in **one transaction** so the
open condition cannot reopen the row on the next tick. Both stall reads
(`jobs.rs:1144-1186`, stage 1 and 2) switch to the not-at-version count when
`owner='system'`.

**3.6 Join filter.** `join_map_by_char_name` (`repo/instances.rs:170-260`) has three
callers: `find_existing` (`pipeline.rs:123-128`), `poll_until_ready` loop + timeout fallback
(`pipeline.rs:401-430`), and the `acquire_lock` Conflict branch
(`service/instances.rs:218-226`). The filter goes **inside** `join_map_by_char_name`
(new args `pin: Option<&str>`, `system_row_active: bool`; `join_candidate_key` takes
`server_version`) so every caller inherits it. While a system row is active, instances with
`serverversion IS DISTINCT FROM pin` are excluded; with none for the zone, ROWS spins one up
(3.3 biases it toward the pin). The MQ fallback path (`mq.rs:353`, no Agones) cannot honour
the pin; say so in `2026-06-24-rows-server-lifecycle-and-shutdown.md` (fleet-restart operator runbook). Operator-row behaviour unchanged.

**3.7 Shutdown of empty drained instances.** Both existing writers are accepted:
the empty-server reaper, and UE calling `ShutDownServerInstance` / Agones `SDK.Shutdown()`.
The reaper is enabled for beta (`ROWS_EMPTY_REAPER_ENABLED=true` in
`apps/kube/rows/tenants/overlays/chuckrpg-beta/`) **only after** the heartbeat precondition
in `deployment.yaml:100-112` is verified live. `ROWS_REAP_NEVER_REPORTED` stays off. The
system row bypasses the HTTP 412 gate (it is not an HTTP trigger), so no gate change is
needed. The `ue_shutdown_trusted` idea from rev 1 is dropped. Until UE heartbeats are live
and the reaper is on, Plan 3 drains but never converges; Plans 1+2 still deliver the
empty-fleet roll.

**3.8 Doc/code drift fixes** (same plan): 412 not 404 in the old doc; document
`stagger`/`batch_size`; `RestartFleet` fails closed on empty token (after confirming the
sealed secret ships to every tenant overlay); correct the "only the reaper writes
`status=0`" comments in `jobs.rs`, `CLAUDE.md`, and the old plan.

---

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
- **Plan 3 (unit)** — the target-source tests depend on the open question above and are not
  specified until it is settled. Independent of it: `deploy_state` transitions incl. (a)/(b)
  and the empty-fleet case; `list_drainable_instances_not_at_version`; system row never
  opens over an operator row; aggressive trigger escalates a system row; join filter
  excludes off-target instances on all three join paths while a system row is active;
  `escalate_fleet_restart` flips a system row to operator with lockout and bypasses the
  reaper 412; `/fleet-restart/clear` on a system row sets `rolled=true` atomically and the
  row does not reopen; `deploy_state.health` flips to `unhealthy` after
  `ROWS_DEPLOY_UNHEALTHY_AFTER_SECS`; stall stage 1/2 read
  `count_active_instances_not_at_version`; reconcile with an existing active system row is a
  no-op (idempotent resume after ROWS restart).
- **Plan 3 (live, beta):** publish `N+1` with one player on `N`. Expect: ROWS opens a
  version-roll row; the empty `Ready` GS on `N` is replaced by one on `N+1`; the Allocated
  GS stays on `N`; a second player spins up on `N+1`; first player leaves → old GS gone
  within the reaper window; `served_versions=[N+1]`, `pending=false`.

---

## 6. Rollout order

1. Plan 1 (CI) — PR #16510 to `dev`. **Done.**
2. Plan 3 design pass to settle the target-version source, then 3.1–3.8, migrations, and the
   reaper enabled on the beta overlay after the heartbeat check.
3. Measure the save budget and set `terminationGracePeriodSeconds` (§4).
4. Live tests (§5).

Each step is its own PR to `dev`.

**Until step 2 ships, rolling beta is manual.** A publish reaches only newly created pods;
an existing `Ready` GameServer stays on its build indefinitely. The operator lever is
`RestartFleet` or deleting `Ready` GameServers, and it is the only one.
