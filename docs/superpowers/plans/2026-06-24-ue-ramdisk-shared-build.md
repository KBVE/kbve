# UE Shared-RAMdisk Build — Implementation Plan

> **For operators:** this plan is executed once, by hand, during a maintenance window, by an operator with `kubectl` + `talosctl` + KubeVirt access to the single Talos node. Steps use checkbox (`- [ ]`) syntax. Each task ends with a verification command and the exact output to expect before moving on. Do not skip the verifications — the node has no failover.

**Goal:** Run the UE Linux builds (`server_build`, `game_build_linux`, and one plugin/engine build) concurrently by sharing one RAM-backed Docker image store + git mirror across them, and give the Windows VM its own RAM-backed copy — without exhausting node RAM or touching Talos/KubeVirt install-wide config.

**Architecture:** One host tmpfs at `/var/mnt/ramdisk` on the single node holds two shared stores: the Docker `--data-root` (engine image extracted once) and a git mirror (objects + LFS populated once). The two Linux builders read both directly via `hostPath`; a privileged DaemonSet runs one shared `dockerd` exposed over a host-local UNIX socket. The Windows KubeVirt VM gets a read-only block image (`repo.img`) of the repo and plain-clones from it into its own RAM disk. Nothing is file-shared across the VM boundary, so there is no virtio-fs and no KubeVirt feature gate.

**Tech stack:** Talos Linux (single node), Argo CD, Actions Runner Controller (ARC), KubeVirt, Docker-in-Docker (`docker:29.3.0-dind`), git / git-lfs, kube-prometheus.

## Global Constraints

These apply to every task. Exact values, copied from the verified repo state.

- **Node:** one Talos node, **~500 GB** RAM, **no failover**. It shares that RAM across the k8s control plane, etcd, ClickHouse, Postgres, the KubeVirt `windows-builder` VM, and the ARC runner pods. etcd `fdatasync` starvation already flaps this cluster (#12987) — memory pressure that evicts page cache or stalls etcd drops the control-plane lease.
- **Baseline to implement against:** `origin/dev` @ `2df4b35`. `values-ue.yaml` there is `maxRunners: 1`, a RAM-backed `dind-storage` emptyDir (`medium: Memory`, `sizeLimit: 64Gi`), and a ghcr pull-through mirror (`--insecure-registry=registry-mirror-ghcr.arc-runners.svc.cluster.local:5000`). `origin/main` drifts (`maxRunners: 2`, `dind-storage 40Gi`) — pin to the `dev` SHA, not `main`. Reconcile the `dev`/`main` interim states before the next `dev→main` promotion, or that merge yields an untested third combination.
- **Concurrency target:** `maxRunners: 3` — `server_build` + `game_build_linux` + one plugin/engine Linux build. All are pods of the single `arc-runner-ue` scale set. The Windows builder is the KubeVirt VM (registers as `UE5-Win`) and runs in parallel on its own. Mac is a separate physical box and costs this node nothing.
- **tmpfs ceiling:** `size=200G`. It caps `engine (~45) + mirror (~7) + N × per_build_scratch (~49 each) + repo.img`. Raising `maxRunners` requires raising the ceiling in the same edit (see [Reference: RAM sizing](#reference-ram-sizing)); never raise one without the other.
- **Runner identity:** runner pods run `runAsUser: 1000` / `runAsGroup: 1000`. The shared docker socket must be group-readable by gid 1000.
- **Nothing auto-activates on merge.** The two new manifests are deliberately absent from `kustomization.yaml`, and `values-ue.yaml` is unchanged, so Argo (auto-sync, `prune`, `selfHeal`, tracking `main`) never applies them. This plan is the only path that activates them.
- **Activation is a normal human-reviewed PR.** The PR that adds the DaemonSet to `kustomization.yaml` and reworks `values-ue.yaml` introduces a privileged, node-root workload — it must NOT go through the `ci-atom.yml` auto-merge lane.
- **No install-wide change anywhere:** no Talos `machine.config` apply, no reboot, no KubeVirt feature gate, no cluster-scoped RBAC/CRD. The only privileged workload is one DaemonSet in `arc-runners`; the only VM change is one read-only disk on `vm-windows-builder.yaml`.
- **All build paths live under `/var/mnt/ramdisk`.** Runner pods set `DOCKER_HOST=unix:///var/mnt/ramdisk/docker.sock`.

---

## File Structure

**Created in this PR (inert — change nothing on merge):**

| File | Responsibility |
|---|---|
| `apps/kube/github/runners/manifests/shared-dind-daemonset.yaml` | Privileged DaemonSet: provisions the tmpfs (init container via `nsenter`) and runs the one shared `dockerd` on a host-local UNIX socket. Plus a PodDisruptionBudget. **Not** in `kustomization.yaml`. |
| `apps/kube/github/runners/manifests/ue-ramdisk-tmpfs-alert.yaml` | `PrometheusRule`: fires on tmpfs >85% full or node `MemAvailable` <8 GB during a build. **Not** in `kustomization.yaml`. |
| `apps/kube/github/runners/manifests/ue-shared-dind-idle-reaper.yaml` | CronJob (+ SA/Role/RoleBinding): frees the ~52 GB cache after `IDLE_TTL_SECONDS` (default 4 h) of no UE builds. **Not** in `kustomization.yaml`. |
| `docs/superpowers/plans/2026-06-24-ue-ramdisk-shared-build.md` | This plan. |

**Modified at cutover (each in the task that owns it, below):**

| File | Change |
|---|---|
| `apps/kube/github/runners/manifests/kustomization.yaml` | Add the two manifests (Tasks 2 and 6). |
| `apps/kube/github/runners/manifests/values-ue.yaml` | Drop per-pod dind sidecar + `dind-storage`; add the `ramdisk` hostPath; point `DOCKER_HOST` at the socket; set `maxRunners` (Tasks 3 and 7). |
| `.github/workflows/ci-unreal-build.yml` | Add the `prepare` job; namespace per-job paths; remove the per-build `docker system prune` (Task 4). |
| `apps/kube/angelscript/manifest/vm-windows-builder.yaml` | Add one read-only `repo.img` block disk + a hostPath PV/PVC for it (Task 8). |

---

## Background — why each non-obvious choice is what it is

Read this once; the tasks assume it.

### Verified repo state (the audit trail behind the facts above)

Confirmed against the repo so a reviewer need not re-derive it:

- **The Windows builder is a KubeVirt VM** (`apps/kube/angelscript/manifest/vm-windows-builder.yaml`) with disks: `rootdisk` (PVC `windows-builder-rootdisk`, 120Gi), `iso` (dataVolume), and `shared-storage` (PVC `builder-shared-storage`, 50Gi RWX Longhorn, attached as a **virtio block** disk). There is **no `filesystems`/virtio-fs device**. The new `repo.img` (Task 8) is the *same kind* of plain block-disk attach as `builder-shared-storage`.
- **KubeVirt feature gates** (`apps/kube/kubevirt/cr/kubevirt.yaml`) are `LiveMigration, HotplugVolumes, NetworkBindingPlugins, ExpandDisks` — **`ExperimentalVirtiofsSupport` is NOT enabled**, and this plan adds none. (Stated as confirmed current state so the virtio-fs question is closed, not re-opened at review.)
- **`node.kbve.com/type=intel-nuc` and "NUC SSD" comments in `talos-worker.yaml` are leftover template strings, not a node fleet.** This is one ~500 GB node, not many NUCs — do not read the labels as a cluster.
- **One node ⇒ co-location is automatic.** No `nodeSelector`/affinity/pinning is required for any consumer to share the host-local tmpfs; the DaemonSet's single pod and the runner pods all land on the same node by construction.

- **The failure being fixed:** UE CI hit `no space left on device` on `/var/lib/docker/.../overlayfs` extracting `epicgames/unreal-engine:dev-5.8.0`. Each Linux pod ran its own DinD with a per-pod RAM image store, so two concurrent jobs each extracted their own ~40 GB engine and exhausted the RAM store. The interim fix was `maxRunners: 1` (serialize). This plan removes the duplication instead.
- **What sharing actually saves:** de-duplication, not relocation. One engine copy instead of N (~40 GB saved) and one mirror instead of per-build clones. Per-build scratch is the *same* RAM whether it sits in a per-pod emptyDir or the shared tmpfs. On ~500 GB the saved copy is not the margin — the [tmpfs ceiling](#reference-ram-sizing) is what bounds concurrency.
- **Shared dind over a UNIX socket, never TCP.** A TCP dind (`tcp://0.0.0.0:2376 --tls=false`) behind a ClusterIP is an unauthenticated privileged Docker API reachable cluster-wide — any pod drives it and escapes to node root. A host-local UNIX socket on the shared `hostPath` is reachable only by the co-located runner pods that mount it. (A compromised UE build step still reaches node root via that socket by design — that is inherent to giving CI a shared daemon; the socket choice keeps the exposure node-local instead of cluster-wide.) If TCP is ever genuinely required, it must be `--tls` with client certs **and** a `NetworkPolicy` scoping the daemon to the UE runner pods only — never the bare `--tls=false` form.
- **tmpfs via privileged DaemonSet, not Talos `machine.config`.** Talos v1.8 has no primitive that mounts an arbitrary host tmpfs visible to pod `hostPath` (`machine.kubelet.extraMounts` injects into the kubelet container, `machine.disks` targets block devices, `machine.files` writes files). A machine-config apply to the sole control-plane node is a brick risk with no failover. The DaemonSet `nsenter`s into the host mount namespace and mounts the tmpfs — no Talos change, no reboot, revertible by deleting the pod. The tmpfs is volatile cache; `prepare` repopulates it after any wipe.
- **Windows gets a read-only block image, not a shared directory.** A VM can't read a host directory — only a block disk or a file-sharing protocol. A *writable* block disk shared between two kernels corrupts regardless of filesystem (independent metadata caches, no coordinator). True file sharing (virtio-fs / SMB) needs a server and, for virtio-fs, the install-wide `ExperimentalVirtiofsSupport` gate. Windows doesn't need the *same live tree* — it needs *a* copy. So `prepare` packs the repo into a read-only `repo.img` (written only while the VM is off), attaches it RO at boot, and the guest plain-clones from it into its own RAM work disk. Sole-writer-of-its-own-disk ⇒ no corruption, no gate, no reboot.
- **The git/LFS sharing trick.** `git clone --mirror` does NOT fetch LFS blobs, and `git clone --local --shared` shares git objects via alternates but NOT `.git/lfs/objects`. So `prepare` must `git lfs fetch --all` into the mirror once, and each Linux builder points `lfs.storage` at the shared store (`git config lfs.storage /var/mnt/ramdisk/repo.git/lfs`) and `git lfs checkout` — reading blobs, never pulling. The mirror is of the **external game repo** (Forgejo LFS is the heavy payload), so only `prepare` carries the GH/Forgejo creds; builders carry none.

---

## Phase 0 — Preconditions

### Task 0: Confirm sizing and quiesce CI

**Files:** none (operational checks).

- [ ] **Step 1: Confirm the tmpfs ceiling covers the target.** `size=200G` is baked into `shared-dind-daemonset.yaml` for `maxRunners: 3`. Confirm `200 ≥ engine(~45) + mirror(~7) + 3 × peak_scratch`. If a project's measured peak scratch makes `3 × scratch > ~148 GB`, raise the ceiling (room to ~250 GB on this node — see [Reference: RAM sizing](#reference-ram-sizing)) before proceeding; do not lower the target.

- [ ] **Step 2: Confirm node RAM headroom.** With builds idle and the VM off:

  Run: `kubectl debug node/<node> -it --image=busybox -- free -g` (or read `node_memory_MemTotal_bytes`)
  Expected: total ≈ 500 GB. If it reads materially lower, stop — the whole budget assumes ~500 GB.

- [ ] **Step 3: Quiesce UE CI.** Ensure no UE build is in flight (check the Actions tab / `kubectl -n arc-runners get pods -l ...`). Agree the maintenance window.

**Checkpoint:** sizing confirmed, window open, no in-flight builds.

---

## Phase 1 — Provision the tmpfs and the shared daemon

### Task 1: Substitute the ceiling if the target changed

**Files:**
- Modify: `apps/kube/github/runners/manifests/shared-dind-daemonset.yaml`

The DaemonSet ships with `size=200G` and `cpu: '12'` sized for 3 concurrent cooks. Only touch this if Task 0 decided on a different `maxRunners`/ceiling.

- [ ] **Step 1: If `maxRunners ≠ 3`, set the ceiling.** Replace every `size=200G` with the value from the [scaling table](#reference-ram-sizing) and update the `cpu` limit (12 is sized for 3 cooks co-resident with etcd).

  Run: `grep -n 'size=' apps/kube/github/runners/manifests/shared-dind-daemonset.yaml`
  Expected: both the init-container mount and the header comment show the chosen size; nothing reads a literal placeholder.

- [ ] **Step 2: Commit** (only if changed).

```bash
git add apps/kube/github/runners/manifests/shared-dind-daemonset.yaml
git commit -m "chore(ue-ci): set shared-dind tmpfs ceiling for chosen maxRunners"
```

### Task 2: Apply the shared-dind DaemonSet

**Files:**
- Modify: `apps/kube/github/runners/manifests/kustomization.yaml`

- [ ] **Step 1: Add the DaemonSet to kustomize.** Append `shared-dind-daemonset.yaml` to the `resources:` list in `kustomization.yaml`. (Do NOT add the alert yet — that is Task 6.) Let Argo sync, or `kubectl apply -k` the manifests dir inside the window.

- [ ] **Step 2: Verify the pod is ready.**

  Run: `kubectl -n arc-runners get ds ue-shared-dind`
  Expected: `DESIRED 1, READY 1`.

- [ ] **Step 3: Verify the mount is a real tmpfs at the right size.**

  Run: `kubectl -n arc-runners exec ds/ue-shared-dind -- mount | grep /var/mnt/ramdisk`
  Expected: `tmpfs on /var/mnt/ramdisk type tmpfs (rw,...,size=...G,mode=1777)`.

- [ ] **Step 4: Assert RAM-backed (the silent-OS-disk guard).** The `hostPath` is `DirectoryOrCreate`, so a failed/un-propagated mount would silently leave `--data-root` on the node OS disk (etcd's disk).

  Run: `kubectl -n arc-runners exec ds/ue-shared-dind -- stat -f -c %T /var/mnt/ramdisk`
  Expected: `tmpfs`. Anything else (e.g. `ext2/ext3`) → STOP; the mount/propagation failed. (The pod also self-asserts this and CrashLoops with `FATAL: ... not tmpfs` rather than proceed.)

- [ ] **Step 5: Verify the socket is group-readable by the runner.**

  Run: `kubectl -n arc-runners exec ds/ue-shared-dind -- ls -l /var/mnt/ramdisk/docker.sock`
  Expected: `srw-rw---- ... 1000 ...` (group `1000`, mode `0660`).

- [ ] **Step 6: Reboot drill (within this window).** A pod-mounted tmpfs is not re-created on node reboot until the DaemonSet pod reschedules and re-runs its init — this confirms the "volatile cache, repopulated by `prepare`" assumption holds. Delete the pod (`kubectl -n arc-runners delete pod -l app=ue-shared-dind`) and confirm it reschedules and re-mounts (`mount | grep /var/mnt/ramdisk` shows the tmpfs again). Optional but recommended before depending on it.

- [ ] **Step 7: Commit.**

```bash
git add apps/kube/github/runners/manifests/kustomization.yaml
git commit -m "feat(ue-ci): activate shared-dind DaemonSet + tmpfs"
```

**Checkpoint:** one shared `dockerd` is up, data-root is on a 200 GB tmpfs, socket reachable by gid 1000.

### Task 3: Seed the engine image once

**Files:** none (runtime check).

- [ ] **Step 1: Pull the engine into the shared store.** `ENGINE_REF` = the image the workflow uses (`ghcr.io/epicgames/unreal-engine:${ue_image_tag}`).

  Run: `kubectl -n arc-runners exec ds/ue-shared-dind -- docker pull <ENGINE_REF>`
  Expected: pull completes.

- [ ] **Step 2: Confirm it is not doubled.**

  Run: `kubectl -n arc-runners exec ds/ue-shared-dind -- du -sh /var/mnt/ramdisk/docker`
  Expected: ≈ one engine footprint (~40–45 GB), not 2×.

**Checkpoint:** engine extracted once on the tmpfs.

---

## Phase 2 — Point the runners at the shared daemon (still serialized)

### Task 4: Rework `values-ue.yaml`, keep `maxRunners: 1` for the first real build

**Files:**
- Modify: `apps/kube/github/runners/manifests/values-ue.yaml`

- [ ] **Step 1: Edit the runner template.** Make exactly these changes:
  - Remove the `dind` sidecar container.
  - Remove the `dind-storage` emptyDir volume.
  - Add a `ramdisk` `hostPath` volume: `path: /var/mnt/ramdisk`, `type: DirectoryOrCreate`, mounted into the runner at `/var/mnt/ramdisk` with `mountPropagation: HostToContainer`.
  - Set env `DOCKER_HOST=unix:///var/mnt/ramdisk/docker.sock` (replace `tcp://localhost:2376`).
  - **Keep** the `forgejo-lfs-credentials` (`api-token`) secret env on the new template — it is drift-prone, do not drop it.
  - Keep `maxRunners: 1` for now.
  - Bump `kbve.com/restart-trigger` to force a pod rollout.

- [ ] **Step 2: Sync and verify a serialized build is green.** Apply, let the runner pods roll, then run one real UE build.

  Run: watch the build in Actions; `kubectl -n arc-runners exec ds/ue-shared-dind -- docker ps`
  Expected: the build's containers appear under the **shared** daemon; the build completes green end-to-end.

- [ ] **Step 3: Commit.**

```bash
git add apps/kube/github/runners/manifests/values-ue.yaml
git commit -m "feat(ue-ci): runners use shared-dind socket + ramdisk hostPath (maxRunners:1)"
```

**Checkpoint:** a single build runs through the shared dind. Concurrency still off.

---

## Phase 3 — Rewrite the workflow so concurrency is safe

These three defects break the build the moment `maxRunners > 1`. All live in `.github/workflows/ci-unreal-build.yml` and must land **together** with Task 4's runner rework (a `workflow_call` reusable workflow goes live at the merged ref; its new paths require the shared dind + tmpfs from Phases 1–2). Scope: only `server_build`, `game_build_linux`, and a new `prepare` job. `ci-unreal.yml`, `ci-unreal-plugins.yml`, and all other jobs (`engine_*`, `plugin_*`, mac, windows-native) are untouched.

**The three defects:**
- **B1 — `docker run -v /tmp/...` won't resolve in a shared dind.** Both Linux builds bind-mount RAM-emptyDir paths into the daemon (`-v /tmp/game-project:/project -v /tmp/ue5-build-output:/output`, ~L525/L894). That worked only because the per-pod sidecar shared the pod's emptyDirs. A shared daemon sees its own `/tmp`, so the bind source is empty → the container builds nothing. Every hardcoded `/tmp/game-clone`, `/tmp/game-project`, `/tmp/ue5-build-output` (~L441–L965) must move under `/var/mnt/ramdisk`.
- **B2 — `docker system prune -f` destroys the shared image mid-build.** Each Linux job ends with `Cleanup: docker system prune -f` (~L658, ~L965). With one shared daemon, the first job to finish prunes the 40 GB engine base layers the still-running job depends on → re-pull or fail.
- **B3 — concurrent builds collide on identical literal paths.** `server_build` and `game_build_linux` both use the *same* `/tmp/game-project` and `/tmp/ue5-build-output`. Once moved to a shared hostPath, one job's `rm -rf` wipes the other mid-build → silent cross-contamination and wrong artifacts to the Longhorn OWS PVC. Per-job namespacing is mandatory.

### Task 5: Add the `prepare` job and rework the two Linux jobs

**Files:**
- Modify: `.github/workflows/ci-unreal-build.yml`

- [ ] **Step 1: Add a `prepare` job.** `runs-on: arc-runner-ue`, `needs: [guard, <existing gates>]`. Body runs under `flock /var/mnt/ramdisk/.prepare.lock`:

```bash
# Mark activity so the idle reaper (Task 6b) never frees a cache that is
# actively in use, and measures idle from the last build start.
touch /var/mnt/ramdisk/.last-build

# Mirror the EXTERNAL game repo (objects + LFS) once; pin the run's SHA.
# PINNED_SHA = the dispatching run's commit (github.sha); URL/creds: Forgejo.
git clone --mirror <url> /var/mnt/ramdisk/repo.git 2>/dev/null \
  || git -C /var/mnt/ramdisk/repo.git fetch --all
git -C /var/mnt/ramdisk/repo.git lfs fetch --all   # mirror does NOT fetch LFS

# Windows only: pack the populated repo into a read-only block image,
# written here while the VM is off; attached RO at win_vm_boot.
# SIZE = git objects + LFS + headroom (counts against the RAM budget).
truncate -s <SIZE> /var/mnt/ramdisk/repo.img
mkfs.ext4 -F /var/mnt/ramdisk/repo.img
mnt=$(mktemp -d); mount -o loop /var/mnt/ramdisk/repo.img "$mnt"
cp -a /var/mnt/ramdisk/repo.git "$mnt"/ && umount "$mnt"

# Engine into the shared dind once.
docker pull <ENGINE_REF>

# Pre-flight: fail fast if it won't fit.
# (image + mirror + N*scratch_estimate) must be < free tmpfs.

# GC, ONLY while holding the lock with no other build running:
rm -rf /var/mnt/ramdisk/*-scratch
docker image prune -f
```

- [ ] **Step 2: Gate the Linux builds on it.** Add `needs: prepare` to `server_build` and `game_build_linux`.

- [ ] **Step 3: Namespace every per-job path (closes B1 + B3).** Replace every `/tmp/game-clone`, `/tmp/game-project`, `/tmp/ue5-build-output` with `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/...`, including the `docker run -v` bind sources so they resolve inside the shared dind. Each Linux tree clones from the mirror at the pinned SHA and reads LFS from the shared store:

```bash
ns=/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>
git clone --local --shared /var/mnt/ramdisk/repo.git "$ns/work"
git -C "$ns/work" checkout <PINNED_SHA>          # explicit SHA, never a branch ref
git -C "$ns/work" config lfs.storage /var/mnt/ramdisk/repo.git/lfs
git -C "$ns/work" lfs checkout                    # smudge from shared blobs; never lfs pull
```

- [ ] **Step 4: Remove the per-build prune (closes B2).** Delete `docker system prune -f` from both `Cleanup` steps (~L658, ~L965). Replace with `rm -rf /var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>` only. Centralized GC lives in `prepare`.

- [ ] **Step 5: Add alternate-loss tolerance.** On a git `object ... not found` or git-lfs `missing object` error (the tmpfs/dind was wiped under a `--shared` clone), re-run `prepare` and re-clone once before failing.

- [ ] **Step 6: Verify with one build (still `maxRunners: 1`).** Re-run a build.

  Expected: per-run scratch lands under `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/`; `docker images` on the shared daemon shows one engine; the build is green.

- [ ] **Step 7: Commit** (same PR as Task 4 — never merge ahead of it).

```bash
git add .github/workflows/ci-unreal-build.yml
git commit -m "feat(ue-ci): prepare job + per-job path namespacing + drop per-build prune"
```

**Checkpoint:** the workflow is safe for concurrency; still verified at 1.

---

## Phase 4 — Turn on the alert, then concurrency

### Task 6: Activate the tmpfs/RAM pressure alert

**Files:**
- Modify: `apps/kube/github/runners/manifests/kustomization.yaml`

- [ ] **Step 1: Add the alert to kustomize.** Append `ue-ramdisk-tmpfs-alert.yaml` to `resources:`.

- [ ] **Step 2: Verify Prometheus loaded it.** The rule's labels (`prometheus: kube-prometheus`, `role: alert-rules`) must match this cluster's Prometheus `ruleSelector` or it silently never loads.

  Run: check the Prometheus UI → Status → Rules for group `ue-ramdisk.pressure` (alerts `UERamdiskNearFull`, `UENodeMemoryLow`).
  Expected: the group is present and not in an error state.

- [ ] **Step 3: Commit.**

```bash
git add apps/kube/github/runners/manifests/kustomization.yaml
git commit -m "feat(ue-ci): activate ramdisk pressure alert"
```

### Task 6b: Activate the idle-cache reaper

**Files:**
- Modify: `apps/kube/github/runners/manifests/kustomization.yaml`

The reaper frees the ~52 GB cache after the node is idle of UE builds for `IDLE_TTL_SECONDS` (default 4 h), so the cache isn't pinned in RAM overnight/over weekends. See [Reference: lifecycle](#reference-lifecycle-what-is-kept-vs-freed).

- [ ] **Step 1: Tune the TTL if 4 h isn't right.** Edit `IDLE_TTL_SECONDS` in `ue-shared-dind-idle-reaper.yaml` (`14400` = 4 h). Lower = RAM back sooner, more cold starts; higher = fewer cold starts, RAM held longer.

- [ ] **Step 2: Add the reaper to kustomize.** Append `ue-shared-dind-idle-reaper.yaml` to `resources:`.

- [ ] **Step 3: Verify it runs and is correctly guarded.** Wait for one scheduled run (or `kubectl -n arc-runners create job --from=cronjob/ue-shared-dind-idle-reaper reaper-test`).

  Run: `kubectl -n arc-runners logs job/reaper-test`
  Expected (cache hot, recent build): `last build <N>s ago (< 14400s TTL); keep cache hot` — it must NOT free a fresh cache. (Confirm it only frees after a real >TTL idle with no running builds.)

- [ ] **Step 4: Commit.**

```bash
git add apps/kube/github/runners/manifests/kustomization.yaml
git commit -m "feat(ue-ci): activate shared-dind idle-cache reaper (4h TTL)"
```

### Task 7: Flip to `maxRunners: 3`

**Files:**
- Modify: `apps/kube/github/runners/manifests/values-ue.yaml`

- [ ] **Step 1: Set the target.** Change `maxRunners: 1` → `maxRunners: 3`; bump `kbve.com/restart-trigger`.

- [ ] **Step 2: Run three concurrent Linux builds** (e.g. server + game + a plugin build) and watch the node.

  Run: `bash ramdisk-watch-kube.sh` (auto-detects the node from a running `arc-runner-ue`/`dind` pod) during the builds.
  Expected: tmpfs peak stays under `size=200G`; `df /var/mnt/ramdisk/docker` does **not** double (one engine reused); no `UERamdisk*` alert fires; etcd stays healthy.

- [ ] **Step 3: Commit.**

```bash
git add apps/kube/github/runners/manifests/values-ue.yaml
git commit -m "feat(ue-ci): restore concurrency (maxRunners:3)"
```

**Checkpoint:** three Linux cooks share one engine in RAM; budget holds.

---

## Phase 5 — Windows read-only repo disk (independent of the Linux path)

### Task 8: Attach `repo.img` to the VM read-only

**Files:**
- Create: a `hostPath` PV + PVC over `/var/mnt/ramdisk/repo.img`
- Modify: `apps/kube/angelscript/manifest/vm-windows-builder.yaml`

`prepare` (Task 5) already packs `repo.img` while the VM is off. This attaches it.

- [ ] **Step 1: Create the PV/PVC** over `/var/mnt/ramdisk/repo.img` — same mechanism as the existing `builder-shared-storage` PVC.

- [ ] **Step 2: Add a read-only `disk` volume** to `vm-windows-builder.yaml` backed by that PVC. Do **not** touch `kubevirt/cr/kubevirt.yaml`; add no `filesystems`/virtio-fs device.

- [ ] **Step 3: Order it before boot.** Ensure the job order is `prepare → win_vm_boot → game_build_windows` so `repo.img` exists before the VM boots. The disk is attached at boot, so a booted VM ⇒ the RO disk is present (no mount-readiness race).

- [ ] **Step 4: Verify the guest.**

  Expected: the guest sees the RO disk as a drive (e.g. `R:`); an in-guest **plain** `git clone` from it into the guest's own work disk (e.g. `W:`) succeeds; `kubevirt/cr/kubevirt.yaml` is unchanged.

- [ ] **Step 5: Commit.**

```bash
git add apps/kube/angelscript/manifest/vm-windows-builder.yaml apps/kube/.../repo-img-pv*.yaml
git commit -m "feat(ue-ci): attach read-only repo.img to windows-builder VM"
```

**Checkpoint:** Windows builds from its own RAM copy; no cluster-wide change made.

---

## Rollback (reverse order; each surface independently revertible)

- **First action in ANY RAM/etcd incident:** set `maxRunners: 1`. Instant mitigation before any deeper rollback.
- **Windows RO disk:** stop the VM; remove the RO `disk` volume from `vm-windows-builder.yaml`; the VM boots as before. No `kubevirt/cr/kubevirt.yaml` change to revert. `repo.img` is volatile tmpfs (vanishes on its own).
- **Workflow:** revert the `ci-unreal-build.yml` commit (Task 5) together with the runner rework (next item) — they are coupled.
- **Runner rework:** restore `values-ue.yaml` to `dev` @ `2df4b35` (per-pod dind sidecar, `dind-storage` RAM 64Gi, `DOCKER_HOST=tcp://localhost:2376`, `maxRunners: 1`); bump restart-trigger.
- **Shared dind + tmpfs + alert + reaper:** remove `shared-dind-daemonset.yaml`, `ue-ramdisk-tmpfs-alert.yaml`, and `ue-shared-dind-idle-reaper.yaml` from `kustomization.yaml`; Argo prune deletes them; the tmpfs disappears with its pod (volatile by design — no data to preserve).
- **End state of full rollback = the current safe interim:** `maxRunners: 1`, per-pod RAM dind. Known-good.

**Before node maintenance:** the `ue-shared-dind` PDB is `minAvailable: 1` on a single-pod/single-node workload, so it permanently blocks voluntary eviction. `kubectl -n arc-runners delete pdb ue-shared-dind` before any `kubectl drain` / Talos maintenance, or the drain hangs.

---

## Incident quick-reference

| Symptom | First action |
|---|---|
| `UERamdiskNearFull` / `UENodeMemoryLow` firing | set `maxRunners: 1`, kill the running UE build |
| etcd/Argo/Kyverno flapping during a build (#12987) | set `maxRunners: 1` immediately; then investigate tmpfs/scratch peak |
| Build fails `permission denied` on the docker socket | check `/var/mnt/ramdisk/docker.sock` group = `1000` |
| Second concurrent build re-pulls 40 GB / ENOSPC | a stray `docker system prune` is wiping the shared image — confirm Task 5 prune removal landed |
| `object not found` mid-build | tmpfs/dind was wiped under a `--shared` clone — re-run `prepare` (alternate-loss tolerance) |
| Windows job reads a stale/empty repo | `repo.img` not packed before boot — confirm `prepare → win_vm_boot` ordering and the RO disk attached |
| `ue-shared-dind` CrashLoop `FATAL: ... not tmpfs` | mount/propagation failed; data-root would land on the OS disk. Do NOT bypass — fix the mount (init container ran, host mount-ns access, `nsenter` worked) |
| tmpfs `size=` too small for `maxRunners` (ENOSPC mid-build) | raise the DaemonSet `size=` per the scaling table; headroom to ~250 GB |
| `kubectl drain` / Talos maintenance hangs | the `ue-shared-dind` PDB blocks eviction — `kubectl -n arc-runners delete pdb ue-shared-dind` first |

---

## Reference: RAM sizing

Node ~500 GB. Two ceilings; the tighter binds.

1. **Node RAM** — the whole working set must stay `< 500 GB`. With everything at once (3 Linux cooks + Windows VM; Mac is a separate box):

```
500
 − 200  tmpfs ceiling (engine 45 + mirror 7 + 3×scratch + repo.img, hard-capped)
 − 120  3 runner pods' own RAM emptyDirs: 3 × [work 24 + shared-tmp 16]  (OUTSIDE the tmpfs)
 −  50  Windows VM 20 + in-guest full clone ~30 (only while the VM is up)
 −  20  node baseline (etcd + ClickHouse + Postgres + control plane + OS)
 −  10  page-cache margin
 = ~100 GB free
```

2. **tmpfs `size=` (200 GB)** — shared-store terms only: `engine 45 + mirror 7 + N × per_build_scratch + repo.img`. Within 200 GB, `52` is fixed, leaving ~148 GB → ~49 GB per build at `maxRunners: 3`. The runner pods' own `medium: Memory` emptyDirs (`work` 24Gi + `shared-tmp` 16Gi) live OUTSIDE the tmpfs and count only against node RAM.

**Scaling table** — raise `maxRunners` and the ceiling together, never one alone:

| `maxRunners` | Covers | tmpfs ceiling | Node-RAM check |
|---|---|---|---|
| 2 | server + game | 150 GB | ✅ ~190 GB free |
| **3** | **+ one plugin or engine Linux build (target)** | **200 GB** | ✅ ~100 GB free |
| 4 | + plugin matrix overlap | ~250 GB | ⚠️ ~30 GB free — validate peak scratch + baseline first |

`maxRunners` is a concurrency cap, not a correctness gate — over-subscription just queues (FIFO), it never corrupts. Plugin builds (`ci-unreal-plugins.yml`, auto on PRs touching `packages/unreal/**`, matrixed per plugin) and engine builds also land on `arc-runner-ue`, so they can coincide with a game build; `maxRunners: 3` lets one of them run rather than queue. The engine `--data-root` stays in RAM — with ~500 GB there is no reason to move it to disk.

**Open question (deferred, not decided):** once the system is stable, benchmark all-in-RAM vs. the engine `--data-root` on disk. The engine base is read-mostly, so it *may* run just as fast from disk via the page cache while freeing ~45 GB of RAM. **Counterweight (why all-in-RAM is the current default, not just inertia):** the build SSD is shared with etcd, and the whole reason build data lives in RAM is to keep I/O off that disk — heavy I/O contends with etcd `fdatasync` and flaps the control plane (#12987). Moving the engine to disk reintroduces I/O on exactly that disk: the one-time extraction writes ~40 GB to the SSD, and any page-cache eviction re-reads from it. On a ~500 GB node the ~45 GB the engine costs in RAM is cheap insurance against that. So the bar for switching is "measured numbers show disk is genuinely as fast *and* the extraction/eviction I/O doesn't perturb etcd" — not just "it frees RAM." Re-pulling the image per build is strictly worse than either (it re-pays the 40 GB extraction every run) and is never the answer.

**Measure these on the first run** to confirm the ceiling (they don't gate go/no-go at 500 GB, but they tell you if a project is unusually large): `du -sh /var/mnt/ramdisk/docker` (engine), `du -sh /var/mnt/ramdisk/repo.git` (mirror), and peak `du -sh /var/mnt/ramdisk/<run>-<job>/{work,output}` via `ramdisk-watch-kube.sh`.

---

## Reference: guards that must stay in place

- **RO-everywhere for `repo.img`.** Written only while the VM is off (during `prepare`), then attached read-only. Never attach it RW to the VM or loop-mount it RW on Linux while the VM holds it — concurrent writers across two kernels corrupt it.
- **`--shared` alternates + shared LFS on a volatile store.** If the tmpfs is wiped while a tree references it, both git objects and LFS blobs vanish under the job. Builders tolerate this (re-run `prepare`, re-clone). The resilient fallback if corruption recurs is a full local clone + local `git lfs pull` (loses the dedup).
- **SHA skew on the shared mirror.** A second `prepare` can fast-forward the mirror while the first pipeline's builders are still cloning. Builders clone by explicit commit SHA (not branch ref); `prepare` keeps that SHA pinned for the pipeline's lifetime. `flock` serializes populate, not this skew.
- **`docker run -v` source visibility.** The shared dind and the runner pods must mount the *same* `/var/mnt/ramdisk` hostPath, or bind sources won't exist in the daemon.
- **No silent unbounded growth.** A fixed-size tmpfs is a cache with no GC; without the `prepare` pre-flight check + GC step, accumulating scratch and stale layers hit the `size=` cap mid-build — the original ENOSPC, relocated into RAM.

---

## Reference: lifecycle (what is kept vs freed)

Three different lifetimes — do not collapse them. The common mistake is to tear down the *cache* per build; that re-pays the 40 GB extraction every run (and that I/O is what the whole design keeps off etcd's shared SSD).

| Thing | Lifetime | Freed by |
|---|---|---|
| Runner pod | per job | ARC (ephemeral runners) |
| Per-run scratch `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/` | per job | the job's `rm -rf` cleanup step (Task 5) |
| Stale scratch from crashed runs + dangling docker layers | per pipeline | `prepare` GC, under `flock`, no other build running (Task 5) |
| **Shared cache** — engine image + git mirror (~52 GB in tmpfs) | **kept hot across builds**, freed only on real idle | the **idle reaper** after `IDLE_TTL_SECONDS` (default 4 h) of no UE builds, or node reboot / pod reschedule |
| The tmpfs *mount* itself | host mount namespace; survives pod restarts | node reboot, or an explicit `umount` |

**Why the reaper frees contents instead of deleting the pod:** the tmpfs is mounted into the host mount namespace by the dind init's `nsenter`, so it survives pod deletion — deleting the pod would NOT return the RAM. The reaper instead frees the bytes in-daemon (`docker image prune -a -f` + `rm -rf` the mirror/scratch), leaving an empty tmpfs (which costs ~0 RAM). Two guards make mid-build reaping impossible: it skips if any `arc-runner-ue` runner pod is Running, and skips if the shared daemon has any running container. The next build after a reap cold-starts via `prepare` (one re-pull + re-extract); steady-state bursts reuse the hot cache.

**Tuning:** `IDLE_TTL_SECONDS` in `ue-shared-dind-idle-reaper.yaml`. Lower = RAM back sooner, more cold starts; higher = fewer cold starts, RAM held longer. 4 h frees the cache nights/weekends without re-extracting during a normal day of builds.

---

## Out of scope

- Mac builder (separate host).
- Cross-node sharing (single node).
- Replacing the existing `builder-shared-storage` block PVC (kept for ISO/installer staging; the RO `repo.img` is a separate, additional attach).
- virtio-fs / `ExperimentalVirtiofsSupport` / WinFsp.
- Any change to the native Windows engine install.
