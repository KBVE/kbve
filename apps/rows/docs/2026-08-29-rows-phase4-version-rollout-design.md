# ROWS Phase 4 — Version Rollout (revised design)

**Status:** design, rev 6 (after five Fable review rounds). Supersedes the Phase 4 section (R0–R5) of
[`2026-06-24-rows-drain-fleet-restart.md`](./2026-06-24-rows-drain-fleet-restart.md).
Phase 3 (drain, `fleet_restart`, `deploy_state`, trigger/pending routes) is shipped and is
reused where noted. This document replaces the Argo-Workflow scale-to-0 orchestrator
(old R3) with an Agones-native rolling model.

**Goal:** a new chuck server build reaches the beta fleet with no human step after the
mdx version bump, and a running server is replaced only when it has no players.

**Non-goals:** prod fleet (Argo app disabled, no CI producer), Windows client-parity gate
(old R1), migration-safety lint (old R2), non-kube supervisors. The decision logic lives in
ROWS so a non-kube supervisor can be added later without redoing this work.

**Delivery:** three implementation plans, in order. Plan 1 and Plan 2 together deliver
"auto roll when the fleet is empty". Plan 3 adds "wait for players to leave".

| Plan | Scope | Delivers |
|---|---|---|
| 1 | CI immutability + gate fix + prune | Safe today, no fleet change |
| 2 | Fleet pin + reporter + server post-publish job | Auto roll of empty servers |
| 3 | ROWS version-aware drain | Busy servers drained, then rolled |

Plan 3 converges only if empty drained servers actually shut down, which needs the
empty-server reaper, which needs live UE heartbeats (UE-side, outside this doc). Plans 1+2
do not depend on that.

---

## 1. Verified current state

Two independent audits (Explore + two Opus verification passes + Fable spec review,
2026-08-29) against `dev`. Everything below is confirmed with file references.

### Build delivery (CI → PVC)

- `ci-unreal-build.yml` deploy step copies the **contents** of `LinuxServer/` into
  `/mnt/longhorn/ows-server/<target>/<version>/`. Result on PVC: `/server/<ver>/chuckServer.sh`,
  **no `LinuxServer/` level** (`.github/workflows/ci-unreal-build.yml:619-635`).
- **(fixed by Plan 1, PR pending)** Deploy does `rm -rf "${DEST}"` before copy (`:626`). Republishing a version deletes a
  directory a pod may be executing from.
- **(fixed by Plan 1, PR pending)** The "already deployed → skip build" gate checks `${DEST}/LinuxServer` (`:356`), which
  deploy never creates. `should_build` is always true.
- **(fixed by Plan 1, PR pending)** Prune runs inside the publish job, keeps newest 3, protects only the `latest` symlink
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
  (`apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml:74-84`). A pod restart
  silently changes version; a new publish changes nothing until a restart. Observed
  2026-08-29: pod on `0.3.49` for 9h with PVC `latest → 0.3.51`. Rolled by hand.
- Dev and prod default to `/server/latest/LinuxServer/chuckServer.sh`
  (`chuckrpg-dev|prod/manifests/fleet.yaml:76`). That path cannot exist given the CI layout.
  Dev's PVC subtree `chuckServerDev/` contents are **unverified** (dev mdx pins `0.3.20`).
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

### Principle

`OWS_SERVER_VERSION` in `fleet.yaml` is the single kube-side pin. Bumping it is the only
rollout trigger. Agones replaces empty servers immediately; ROWS drains busy old-version
servers and shuts them down when empty; the fleet replaces them with the pinned version.
No orchestrator, no scale-to-0, no player disconnects.

### Data flow

```
mdx version bump (human)  →  ci-manifest-sync writes ci-dispatch-manifest.json
  → ci-unreal-build (mode=server): build → /server/<ver>/ (immutable) → latest symlink
  → server_post_publish (NEW, after build OR gate-skip): PR to dev bumping
        fleet.yaml OWS_SERVER_VERSION + label only; idempotent; auto-merged
     (game_post_publish keeps owning version.toml, unchanged)
  → dev → main merge (existing release flow)  ← THE ROLL HAPPENS HERE
  → Argo sync → Fleet template diff → new GameServerSet
       ├─ Ready (empty) old GS: Agones deletes, new GS boots pinned version
       └─ Allocated (busy) old GS: survives RollingUpdate
  → ROWS (Plan 3): instance.serverversion != pin
       → version-roll drain (joins go only to pinned-version instances)
       → empty → shutdown (reaper or UE ShutDownServerInstance) → GS deleted
       → Fleet replaces with pinned version
```

---

### Plan 1 — CI publish: immutable versioned builds (`ci-unreal-build.yml`)

1. **Layout fixed as flat:** `/server/<ver>/chuckServer.sh`. Record it in the workflow
   comment. Do not add a `LinuxServer/` level.
2. **Gate fix:** `server_gate` checks `find "${DEST}" -maxdepth 1 -name '*Server.sh'`.
   "Already deployed" then actually skips.
3. **Immutable publish:** if `${DEST}` holds a `*Server.sh`, fail the deploy step with a
   `::error::` instead of `rm -rf`. Escape hatch: `workflow_dispatch` input
   `force_republish=true` (explicit, logged). `force_republish` is **not** rollback.
4. **Prune** moves to its own job (`needs: server_build`, `runs-on: arc-runner-ue` for the
   `/mnt/longhorn` mount, with a repo checkout of **`main`**). It reads every
   `OWS_SERVER_VERSION` value under `apps/kube/agones/rows-tenants/*/manifests/fleet.yaml`
   **and**, live from the cluster, every distinct `ows.kbve.com/server-version` label on
   Fleets and on GameServers in `Ready|Allocated|Reserved` across `arc-runners` (union,
   no target→fleet mapping needed; over-protective is fine). A version carried only by an
   Allocated old GameServer must survive — Plan 2 has no drain, so such a server can outlive
   three publishes. Never delete a protected version or the `latest` target. Keep newest 3
   otherwise. `main`, not
   `dev`, because Argo deploys `main`; a pin merged to `dev` but not yet promoted is
   protected by the live-Fleet read.
   The live read needs identity: `arc-runner-ue` has apiserver egress
   (`runner-apiserver-egress.yaml:34-45`) but no ServiceAccount. Add `arc-fleet-reader`
   SA + Role (`agones.dev` `fleets,gameservers` `get,list` in `arc-runners`) + RoleBinding, following
   `vm-starter-rbac.yaml`, and set `template.spec.serviceAccountName` in `values-ue.yaml`.
   Read via `curl` with the SA token (do not assume `kubectl` in
   `ghcr.io/kbve/arc-runner`). If the live read fails, prune **skips deletion** (fail closed).
5. `latest` symlink stays (human convenience), but no fleet references it.

---

### Plan 2 — Fleet pin, reporter, server post-publish

#### 2.A Fleet manifest (`chuckrpg-beta` only — see dev note)

Add to the **existing** blocks (`fleet.yaml:18-23` labels; pod spec at
`spec.template.spec.template.spec`):

```yaml
spec:
    template:                       # GameServer template
        metadata:
            labels:
                # bumped with env by post-publish; used by Plan 3 selectors
                ows.kbve.com/server-version: '0.3.51'
        spec:
            template:               # Pod template
                spec:
                    terminationGracePeriodSeconds: 120  # placeholder, see §4
                    containers:
                        - name: ue5-server
                          env:
                              # THE rollout trigger (post-publish sed rewrites the value: line)
                              - name: OWS_SERVER_VERSION
                                value: '0.3.51'
                          command:
                              - /bin/bash
                              - -c
                              - |
                                  SERVER_DIR="/server/${OWS_SERVER_VERSION}"
                                  SERVER_BIN=$(find "${SERVER_DIR}" -maxdepth 1 -name '*Server.sh' 2>/dev/null | head -1)
                                  if [ -z "${SERVER_BIN}" ]; then
                                    echo "ERROR: pinned build ${OWS_SERVER_VERSION} not on PVC"; ls -la /server/
                                    sleep 60   # slow the Agones unhealthy→recreate loop
                                    exit 1
                                  fi
                                  echo "Starting UE5 dedicated server ${OWS_SERVER_VERSION} from ${SERVER_BIN}"
                                  exec "${SERVER_BIN}" -server -log -nosteam -unattended \
                                    -port=${GAME_PORT:-7777} -GameMode=${OWS_GAME_MODE} ${OWS_EXTRA_ARGS:-}
```

- `OWS_SERVER_VERSION` is also set on `build-reporter-init` and `build-reporter`. Their
  `server-binary` volumeMounts (`fleet.yaml:54-58,155-159`) are removed — the reporter no
  longer reads the PVC. `OWS_SERVER_BIN` is derived, never declared. No `$(VAR)` references.
- Remove every `find … | sort -V | tail -1` fallback. Fail closed.
- Strategy stays `RollingUpdate 25%/25%`. On a 1-replica fleet: new GS surges up, old
  Ready GS is deleted; an old Allocated GS survives until it shuts down.
- FleetAutoscaler unchanged: after the template change its `allocated + 1` Ready servers
  are new-version servers.
- **Dev fleet:** not pinned in this plan. Before pinning dev, verify
  `/mnt/longhorn/ows-server/chuckServerDev/` holds a versioned dir matching the dev mdx
  (`0.3.20`); record the result in §1. Until then dev keeps its current command.
- **Prod fleet:** untouched; add a comment that the Argo app is disabled.

#### 2.B Build reporter (`ows-build-reporter-configmap.yaml`)

```sh
VER="${OWS_SERVER_VERSION:-}"
[ -n "$VER" ] || { echo "ows-build-reporter: OWS_SERVER_VERSION unset"; exit 0; }
```

Drop the `readlink`/`find` resolution. Body stays `{"version": "<ver>"}`; the reporter is
**advisory** (feeds `/health.served_versions`), never a control input (see Plan 3.1).

#### 2.C Server post-publish job (`ci-unreal-build.yml` + `utils-post-publish.yml`)

Ownership split, by construction no shared file:

- `game_post_publish` (existing, client) keeps writing `version.toml`. Unchanged.
- `server_post_publish` (new) writes **only** the fleet pin. It runs after a successful
  build **or** a gate skip, and is idempotent (pin already at version → nothing to commit,
  which `utils-post-publish.yml` already handles).

```yaml
server_post_publish:
    needs: [server_config, server_gate, server_build]
    if: |
        always() && inputs.mode == 'server'
        && needs.server_gate.result == 'success'
        && (needs.server_build.result == 'success' || needs.server_build.result == 'skipped')
        && inputs.fleet_manifests != '' && inputs.fleet_manifests != 'null'
        && inputs.fleet_manifests != '[]'
    permissions:
        contents: write
        pull-requests: write
        actions: write
    uses: KBVE/kbve/.github/workflows/utils-post-publish.yml@dev
    with:
        app_name: ${{ inputs.app_name }}
        version: ${{ needs.server_config.outputs.version }}
        fleet_manifests: ${{ inputs.fleet_manifests }}   # JSON array
        branch_suffix: '-fleet'
        # no version_toml_path: pin-only PR
    secrets:
        TRIGGER_PAT: ${{ secrets.UNITY_PAT }}
```

`utils-post-publish.yml` changes (all required, or the pin never moves):

- `version_toml_path` becomes optional (`default: ''`). The "Update version.toml" step
  (`:140-151`), its `EXPECTED_FILES` entry (`:269`) and `git add` (`:323`) are gated on it
  being non-empty. Today it is required and runs unconditionally, so a pin-only call would
  either fail validation or bump `version.toml` from the server side.
- New input `branch_suffix` (default `''`): `BRANCH="atom-post-publish-${APP}-v${VERSION}${SUFFIX}"`
  (`:312`). Without it the game and server jobs collide on the same branch and the second
  is silently skipped (`:357-361`). `app_name` must stay identical — auto-merge resolves the
  manifest entry by it (`ci-auto-merge-bot-prs.yml:199-231`).
- New input `fleet_manifests` (JSON array, iterated like `deployment_yamls`).
- `branch_suffix` is validated with `^[a-zA-Z0-9-]*$` and added to the ASCII / punycode /
  metachar loops (`:77,85,121`) — it is interpolated into `git` commands.
- When `branch_suffix` is set, the PR title gets ` (fleet)` appended so the game and fleet
  PRs are distinguishable (auto-merge's title regex tolerates it).

Why "or skipped": the dispatcher (`ci-main.yml:135-165`) re-dispatches while mdx ≠
`version.toml`; the server gate skips when the build is already on the PVC. A single-shot
post-publish would then never fire and the pin would never move. Consequence to accept: if
the client build fails after the server published, the dispatcher keeps re-dispatching both
until the client succeeds — the server side is a cheap skip + no-op PR each time. If the
server build fails after the client published, `version.toml` is already bumped, nothing
re-dispatches, and a human must re-dispatch the server build (`workflow_dispatch`). State
this in `2026-06-24-rows-server-lifecycle-and-shutdown.md` (fleet-restart operator runbook).

`utils-post-publish.yml` gains input `fleet_manifests` (JSON array, same shape and jq
iteration as `deployment_yamls`). Per file, a **dedicated** step (not the deployment sed,
which rewrites every `version:` key):

```sh
sed -i "/name: OWS_SERVER_VERSION/{n;s|value:.*|value: '${VERSION}'|}" "$f"
sed -i "s|\(ows.kbve.com/server-version:\).*|\1 '${VERSION}'|" "$f"
```

The step runs `if: inputs.fleet_manifests != ''`; a listed file that does not exist →
`::warning` + skip, mirroring the deployment-yaml step (`:245-248`). `value:` must be the
line directly after `name: OWS_SERVER_VERSION` in every container (2.A guarantees it).
Validation: `jq -e 'type=="array"'` on the raw input, then run each **element**
(`jq -r '.[]'`) through the traversal / absolute / metachar / printable-ASCII loops
(`:66-116`). Never feed the raw `fleet_manifests` string to those loops — `toJSON` output
is multi-line and the ASCII check would reject it (`deployment_yamls` is likewise kept out
of the loops today). Add the elements to `EXPECTED_FILES` (`:257-292`) and `git add`
(`:301-330`).

Frontmatter lives under `engine`, because only `engine.*` reaches `ci-unreal.yml`
(`ci-main.yml:557-559`):

```yaml
# unreal-chuck-beta.mdx
engine:
    fleet_manifests:
        - apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml
```

Touch points (eight, all in this plan):

1. `apps/kbve/astro-kbve/.../project-schema.ts:63-106` — `engine` zod object is closed;
   add `fleet_manifests: z.array(z.string()).optional()`.
2. astro `gen:ci-manifest` generator (`project.json:143-156`; `manifest-builder.ts:247`
   passes `engine` through; `sync:ci-manifest` only copies the build output) —
   no code change, but the PR must commit the regenerated `.github/ci-dispatch-manifest.json`
   or `ci-manifest-guard` (`:92-100`) flags structural drift.
3. `ci-main.yml` — no change (passes whole `engine` JSON).
4. `ci-unreal.yml` server job (`:96-108`) — add `app_name: ${{ fromJSON(inputs.engine).app_name }}`
   (missing today; utils-post-publish rejects empty) and
   `fleet_manifests: ${{ fromJSON(inputs.engine).fleet_manifests && toJSON(fromJSON(inputs.engine).fleet_manifests) || '' }}`
   so projects without the field pass `''`, not the string `null`.
5. `ci-unreal-build.yml` — declare input, forward to `server_post_publish`.
6. `utils-post-publish.yml` — consume (above).
7. `ci-auto-merge-bot-prs.yml:244-252` — extend `allowedFiles` with
   `entry.engine?.fleet_manifests ?? []`; otherwise the fleet PR is "blocked" and waits for
   a human, and the pin never moves without one.
8. `AGENTS.md` — rollback carve-out (2.D).

Do **not** write `ci-dispatch-manifest.json` from post-publish; `ci-manifest-sync.yml`
owns it.

#### 2.D Rollback (operator runbook — copy into `2026-06-24-rows-server-lifecycle-and-shutdown.md` (fleet-restart operator runbook))

Rollback is a human PR that re-pins the fleet. **Carve-out to the AGENTS.md rule:** the
fleet pin is the one CI-owned line a human may edit, and only for rollback. Never
`dbmate down`. `force_republish` is not rollback.

1. In `apps/kube/agones/rows-tenants/chuckrpg-beta/manifests/fleet.yaml` set **both**
   lines to the retained older version: the `value:` under `name: OWS_SERVER_VERSION`
   (every container) and the `ows.kbve.com/server-version:` label. Both, or Plan 3's
   selectors disagree with the binary.
2. Confirm the build still exists: `/mnt/longhorn/ows-server/chuckServer/<old>/chuckServer.sh`
   (Plan 1 prune protects the pin, so it should).
3. Open the PR to `dev`. It is a human merge — auto-merge takes bot PRs only.
4. Promote dev→main. Nothing happens until then (Argo `targetRevision: main`).
5. Verify:
   `kubectl -n arc-runners get fleet rows-chuckrpg-beta -o jsonpath='{.spec.template.metadata.labels.ows\.kbve\.com/server-version}'`
   then `kubectl -n arc-runners get gs -l agones.dev/fleet=rows-chuckrpg-beta` shows a
   `Ready` GameServer with the old label.

Leave the mdx at the newer version. mdx == `version.toml`, so nothing re-dispatches and the
rollback is stable until the next deliberate bump. Plan 3's 3.4 treats the downward pin like
any pin change (`rolled=false`, drains the newer version).

---

### Plan 3 — ROWS version-aware drain

Plan 3 gets its own short design pass before code (system-row semantics below are the
starting point, not the final word). Components:

**3.1 Per-instance version, stamped at allocation.** `mapinstances.serverversion TEXT NULL`
(additive migration + `packages/data/sql/schema/ows/` mirror). Written when the instance row
is inserted (`repo/instances.rs:846-870`, new arg) from the allocated GameServer's
`ows.kbve.com/server-version` label. The `GameServerAllocation` response carries
`status.metadata.labels` (Agones 1.58); `AllocationResult` (`allocate.rs:11-15,155-193`)
currently keeps only name/address/port and gains a `labels` field.
`reconcile_allocations` (`agones/sdk.rs:266-306`) backfills on startup. The reporter is not
a source — it is spoofable by any GameServer (§1).

**3.2 Fleet pin reader.** `agones::fleet::pinned_version(fleet) -> Option<String>`:
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

- **Plan 1 (workflow):** gate skips when `*Server.sh` present; deploy fails on existing
  non-empty `DEST` without `force_republish`; prune never removes a version named in any
  `fleet.yaml` on `main`, on a live Fleet label, or carried only by an Allocated
  GameServer's label; prune skips deletion when the live read fails.
- **Plan 2:** `kustomize build` for beta; no `$(NAME)` where `NAME` is a declared env var
  (kube expands only those; shell `$(find …)` is fine); all three containers carry
  `OWS_SERVER_VERSION`; the 2.A command block run under bash with `/server` = empty tmpdir
  prints `not on PVC`, sleeps 60, exits 1; `server_post_publish` PR touches exactly `fleet.yaml` (never `version.toml`); its branch ends in `-fleet`; auto-merge accepts
  it; re-dispatch of an on-PVC version yields skip + no-op post-publish (no PR, no loop);
  no other `version:`-shaped line in `fleet.yaml` changes; a project without
  `engine.fleet_manifests` skips `server_post_publish` cleanly. Live: merge pin `N+1` to main with the fleet empty → new GS `Ready` on `N+1`
  within 2 min, old GS gone.
- **Plan 3 (unit):** `pinned_version` parser; `deploy_state` transitions incl. (a)/(b) and
  the empty-fleet case; `list_drainable_instances_not_at_version`; system row never
  opens over an operator row; aggressive trigger escalates a system row; join filter
  excludes non-pin instances on all three join paths while a system row is active;
  allocation selectors are `[fleet+pin, fleet]`; `escalate_fleet_restart` flips a system
  row to operator with lockout and bypasses the reaper 412; `/fleet-restart/clear` on a
  system row sets `rolled=true` atomically and the row does not reopen; `deploy_state.health`
  flips to `unhealthy` after `ROWS_DEPLOY_UNHEALTHY_AFTER_SECS` with no pinned GS; stall
  stage 1/2 read `count_active_instances_not_at_version`; reconcile with an existing active
  system row is a no-op (idempotent resume after ROWS restart).
- **Plan 3 (live, beta):** publish `N+1` with one player on `N`. Expect: new Ready GS on
  `N+1`; old GS stays Allocated; `/fleet-restart/pending=true`, `status.mode=version-roll`;
  a second player spins up on `N+1`, not `N`; first player leaves → old GS gone within the
  reaper window; `target_version=N+1`, `served_versions=[N+1]`, `pending=false`.

---

## 6. Rollout order

1. Plan 1 (CI) — PR pending to `dev`. Done.
2. Plan 2.A + 2.B — pin beta to the version on the PVC `latest` target (`0.3.51` today),
   reporter change. **Precondition checked at PR time:** mdx `version:` == `version.toml` ==
   pin (true today). If they differ, bump mdx to the pin value in the same PR — the
   dispatcher re-dispatches while mdx ≠ `version.toml`, and the first fleet PR would rewrite
   the pin to the mdx value. PR to `dev`; takes effect at the next dev→main merge.
3. Plan 2.C + 2.D — server post-publish job, frontmatter plumbing, AGENTS.md carve-out.
   **Gap between steps 2 and 3:** any mdx bump landing in between leaves the pin stale, and
   post-publish only fires while mdx ≠ `version.toml`, so there is no catch-up. Rule until
   step 3 is on `main`: whoever bumps `unreal-chuck-beta.mdx` edits the pin in the same PR
   (2.D carve-out applies). Line in `2026-06-24-rows-server-lifecycle-and-shutdown.md` (fleet-restart operator runbook).
4. Plan 3 design pass, then 3.1–3.8, migrations, reaper enabled on beta overlay after the
   heartbeat check.
5. Measure save budget, set TGPS (§4).
6. Live tests (§5).

Each step is its own PR to `dev`.
