# Shared-RAMdisk UE Build (Talos single-node + KubeVirt) — Design

**Date:** 2026-06-24
**Status:** Design accepted; **NOT implementation-ready** — `maxRunners: 2` must not be restored until the blockers in §6 are closed (round-2 audit, 2026-06-24).
**Target:** Full three-way RAM share — one node tmpfs holds the engine image + repo; both Linux builders and the Windows VM read from it.
**Scope:** Unreal Engine CI on the single Talos node. Mac builder out of scope.

## Problem

UE CI jobs failed with `no space left on device` on `/var/lib/docker/.../overlayfs` while extracting `epicgames/unreal-engine:dev-5.8.0`. Root cause: each Linux build pod (`server_build`, `game_build_linux`) ran its own DinD with a per-pod image store, so concurrent jobs each extracted their own ~40 GB copy of the engine and exhausted the RAM-backed store.

Current state (`apps/kube/github/runners/manifests/values-ue.yaml`) is an interim mitigation. **Baseline is `origin/dev` @ `2df4b35`** (verified): `maxRunners: 1` (serialized), a **RAM-backed** `dind-storage` emptyDir (`medium: Memory`, `sizeLimit: 64Gi`), and a ghcr pull-through mirror (`--insecure-registry=registry-mirror-ghcr…`, line 88). This prevents the crash by never running two Linux builds at once, at the cost of all concurrency. This design supersedes that interim hack.

> **Branch drift (read before implementing):** `origin/main` carries a *different* interim state — `maxRunners: 2`, `dind-storage` RAM emptyDir `40Gi` (same mirror). Neither branch uses a plain disk-backed `emptyDir: {}`. Implement against the committed `dev` values (pin the SHA), not against memory or `main`. The original ENOSPC was the **RAM** store exhausting under concurrent extraction — not node disk exhaustion — because `dind-storage` has been `medium: Memory` on both branches. This matters: the cure must respect the node RAM budget (§4), not assume there is disk headroom to fall back on.

## Goals

- Keep build data in RAM for speed (avoid disk I/O).
- **Extract the Linux engine image once**, shared by both Linux builders → restore `maxRunners: 2` (concurrent Linux builds).
- **Clone the repo once**, shared by all three builders (2 Linux + 1 Windows).
- Windows sees the shared repo **as a drive**.

## Platform facts (verified against the repo)

- **Single Talos node** runs everything: k8s control plane, the ARC Linux runner pods, the KubeVirt `windows-builder` VM, and node databases. Total RAM ~109 GB, shared across all of them. The `node.kbve.com/type=intel-nuc` label and "NUC SSD" comments in `talos-worker.yaml` are leftover template strings, not a node fleet.
- Because there is **one node**, co-location is automatic — **no nodeSelector/affinity/pinning is required** for any consumer to share a host-local tmpfs.
- Talos is **immutable**: a host tmpfs is provisioned via Talos machine config or a privileged DaemonSet, not `systemd`/`fstab`.
- The Windows builder is a **KubeVirt VM** (`apps/kube/angelscript/manifest/vm-windows-builder.yaml`): disks are `rootdisk` (PVC `windows-builder-rootdisk`, 120Gi), `iso` (dataVolume), `shared-storage` (PVC `builder-shared-storage`, 50Gi RWX Longhorn, attached as a virtio **block** disk). **No `filesystems`/virtiofs device exists.**
- KubeVirt feature gates (`apps/kube/kubevirt/cr/kubevirt.yaml`) are `LiveMigration, HotplugVolumes, NetworkBindingPlugins, ExpandDisks` — **`ExperimentalVirtiofsSupport` is NOT enabled.**
- Today the Windows job gets the repo by **git clone inside the guest** (`.github/workflows/ci-unreal-build.yml`, `game_build_windows` ~lines 1014–1224); it is a native build (no Docker).
- The Linux engine image is **~40 GB** extracted. The UE engine is **installed natively on Windows** — the Windows builder never pulls the Docker image.

## Why virtio-fs (not a block disk) for the Windows share

A block device (how `builder-shared-storage` is attached) can have only one writer, so it cannot be a repo shared read-write with the Linux side. **virtio-fs is file-level sharing**: the node tmpfs is exported as a KubeVirt `filesystems` device and the guest mounts it as a drive via the VirtIO-FS driver + WinFsp (`VirtioFsSvc`). File-level sharing allows Linux and Windows to read the same tree concurrently — required for "clone once, all three read it."

## Architecture (§1 — single tmpfs, three consumers)

One host tmpfs on the Talos node at `/var/mnt/ramdisk` (size validated against node RAM; see §5) holds two shared stores:

- `/var/mnt/ramdisk/docker` — data-root for **one shared dind** (DaemonSet; single node ⇒ one pod). The 40 GB Linux UE image is pulled/extracted **once**; both Linux builders share its read-only overlay base layers.
- `/var/mnt/ramdisk/repo.git` — one git **mirror** (~7 GB objects), cloned **once**.

Consumers (all on the one node, no pinning needed):

- **2 Linux builders** (`server_build`, `game_build_linux`): drop the per-pod dind sidecar; set `DOCKER_HOST` to the shared dind. Each `hostPath`-mounts `/var/mnt/ramdisk` so `docker run -v <project>` resolves inside the shared dind (the bind-mount source must exist in the dind's filesystem, which is the same node tmpfs). Each gets an **isolated** working tree via `git clone --local --shared /var/mnt/ramdisk/repo.git <work>` (object alternates — objects referenced not copied; tree is writable/private so the two concurrent builds never collide on `Intermediate/`, `Saved/`, `Binaries/`).
- **1 Windows builder** (`game_build_windows`): mounts `/var/mnt/ramdisk/repo.git` via **virtio-fs as a drive**, then does a **plain** `git clone` inside the guest (not `--shared` — avoids Windows-git alternates referencing a virtio-fs path). Engine is installed natively.
- **Mac**: out of scope (separate host, stub).

Sharing graph:
- `repo.git` (tmpfs) → all 3 (Linux ×2 via hostPath + `--local --shared`; Windows via virtio-fs + plain clone)
- dind image-store (tmpfs) → Linux ×2 only

## Components (§2 — what to build/change)

1. **Node tmpfs** — provision a host tmpfs at `/var/mnt/ramdisk` on the Talos node. **Prefer a Talos `machine.config` mount** (declarative, survives reconcile, no extra privileged workload) over a privileged DaemonSet that `mount -t tmpfs` into the host namespace; the DaemonSet is a fallback only if a machine-config mount proves impractical. Single sizing knob; validated in §5.
2. **hostPath PV/PVC** over `/var/mnt/ramdisk/repo.git` so KubeVirt can consume it as a virtio-fs source.
3. **Shared dind** — DaemonSet (one pod on the node), privileged, `--data-root=/var/mnt/ramdisk/docker`, hostPath-mounts `/var/mnt/ramdisk`, keeps the existing `--insecure-registry=registry-mirror-ghcr...` and fd-limit flags. **Exposes the daemon to runner pods via a host-local UNIX socket on a hostPath (`/var/mnt/ramdisk/docker.sock`), NOT a cluster TCP Service** — see §4 (DinD exposure). Runner pods set `DOCKER_HOST=unix:///var/mnt/ramdisk/docker.sock`.
4. **`values-ue.yaml` rework** — remove the per-pod `dind` sidecar and `dind-storage` emptyDir; add hostPath mount of `/var/mnt/ramdisk`; set `DOCKER_HOST` to the host-local socket (above); preserve the existing `forgejo-lfs-credentials` (`api-token`) secret mount on the new runner template (drift-prone per ops notes); restore `maxRunners: 2`.
5. **KubeVirt virtio-fs** — add `ExperimentalVirtiofsSupport` to `featureGates` in `kubevirt/cr/kubevirt.yaml`; add a `filesystems` (virtiofs) device + volume to `vm-windows-builder.yaml` backed by the repo PV; install WinFsp + VirtIO-FS driver in the guest (`VirtioFsSvc`) so the share auto-mounts as a drive. **Precondition: snapshot the VM/rootdisk first (see §4).**
6. **`prepare` gate** in `ci-unreal-build.yml` — **see §6 PR-1: this is a workflow rewrite (per-job path namespacing, removing the per-build `docker system prune -f`), not just an added `needs:`** — idempotent, `flock`-guarded: clone/fetch the mirror to the run SHA and `docker pull` the image once into the shared stores; includes the **pre-flight free-space check** (§4). `server_build`, `game_build_linux` gain `needs: prepare`. **`game_build_windows` runs on the `UE5-Win` label and already `needs: [guard, game_gate, win_vm_boot]`** — adding `prepare` there must keep `win_vm_boot` ordering so the virtio-fs mount is ready before the guild reads it; the VM-boot/virtio-fs-mount race is an explicit task in the Windows plan.

## Data flow (§3 — per pipeline run)

`prepare` (under `flock`) ensures the mirror is fetched to the run's SHA and the image is present in the shared dind → fan out:
- Each **Linux** job `git clone --local --shared` into its own tree on the tmpfs, builds via the shared dind, writing cook output to its own `/var/mnt/ramdisk/<job>-scratch`.
- The **Windows** job reads the repo over virtio-fs (drive), plain-clones to its own working area, builds with the installed engine.

## Failure modes & guards (§4)

- **DinD exposure (security, HIGH — do NOT ship as TCP).** The shared daemon listens on `tcp://0.0.0.0:2376 --tls=false`. Fronting that with a ClusterIP Service would expose an **unauthenticated privileged Docker API cluster-wide** — any pod could drive it and trivially escape to node root. On a single node this is unnecessary: bind the daemon to a **host-local UNIX socket on the shared hostPath** (`unix:///var/mnt/ramdisk/docker.sock`) that only the co-located runner pods mount. If TCP is ever required, it must be `--tls` with client certs **and** a `NetworkPolicy` scoping the daemon to the UE runner pods only. The current per-pod localhost sidecar must not be replaced by a less-scoped transport.
- **Node RAM ceiling (the dominant risk, single node).** The tmpfs shares ~109 GB with etcd, the KubeVirt VM RAM (16Gi guest / 20Gi limit), and node databases (ClickHouse/Postgres). etcd `fdatasync` latency on this node is already the documented failure mode (issue [[project_etcd_io_starvation_argo_flapping]] / #12987); memory pressure that evicts page cache or stalls etcd can drop the control-plane lease and flap the whole cluster. Treat this as the design's primary constraint, not a tunable knob:
    - **Prove the budget before enabling:** `2×engine-overlay + 7 GB mirror + 2×scratch + 20 GB VM + etcd/CH/PG baseline + page-cache margin < 109 GB`. If it doesn't close with margin, do not raise `maxRunners` to 2.
    - **Image base stays in RAM** (all-in-RAM, by design decision). The whole `--data-root` lives on tmpfs; the budget proof above must close *with* the engine in RAM. If it doesn't, reduce `maxRunners` rather than moving the image to disk. *(Revisit later: once stable, benchmark all-in-RAM vs. image-`--data-root`-on-disk to see which is actually faster — the read-mostly base may run just as fast from disk via page cache, freeing RAM. Decide on measured numbers, not assumption.)*
    - Enforce a hard tmpfs `size=` so it cannot grow past budget.
- **Windows driver install is irreversible-ish.** **Snapshot `windows-builder` (KubeVirt `VirtualMachineSnapshot`, or Longhorn `VolumeSnapshot` of `windows-builder-rootdisk`) with the VM paused/off, and verify a restore point, BEFORE installing WinFsp/VirtIO-FS.** The virtio-fs task begins with the snapshot, not the install.
- **virtio-fs is experimental.** Enabling the feature gate affects the whole KubeVirt install; validate the VM still boots and live-migration/hotplug behavior is unaffected on the single node.
- **No eviction = ENOSPC relocated to RAM.** A fixed-size tmpfs is a cache with no GC. Without reclamation, accumulating working trees, cook scratch, and stale image layers will hit the hard `size=` cap mid-build — the *same* ENOSPC failure class, just moved into RAM. Required: (a) a **pre-flight free-space check in `prepare`** that fails fast if projected need (image + mirror + N×scratch estimate) exceeds free tmpfs, and (b) a **GC step** that reclaims prior runs' `<job>-scratch` and prunes dangling docker layers (`docker image prune`) between pipelines. No silent unbounded growth.
- **`--shared` alternates on a volatile store can corrupt in-flight builds.** Linux trees use `git clone --local --shared` (objects referenced in `repo.git`, not copied). If the tmpfs/dind is wiped while a tree still references it, objects vanish underneath the job → cryptic `object not found`. Builders must **tolerate alternate loss**: on an object-missing error, re-run `prepare` and re-clone. (Accepting a full local clone instead of `--shared` is the resilient fallback if corruption recurs.)
- **Concurrent pipelines / SHA skew on the shared mirror.** A second `prepare` can fast-forward the mirror to a newer SHA while the first pipeline's builders are still cloning, yielding a tree mismatched to the pipeline's SHA. Builders must **clone by explicit commit SHA** (not branch ref), and `prepare` must keep that SHA's objects pinned for the pipeline's lifetime. `flock` only serializes populate, not this skew — it does not by itself prevent the mismatch.
- **tmpfs is volatile** — reboot / dind restart wipes it. `prepare` repopulates (cold start = one clone + one pull). Treated as a cache, never durable.
- **`docker run -v` source visibility** — the shared dind and runner pods must mount the *same* tmpfs hostPath, or bind-mount sources won't exist in the dind. Both mount `/var/mnt/ramdisk`.
- **Windows cross-FS clone** — plain clone (not `--shared`) avoids Windows-git alternates referencing a virtio-fs path.

## Validation & measurement (§5)

- The node is Kubernetes-managed (Talos, no host shell); inspect tmpfs usage via an **ephemeral hostPath pod** (auto-deleted) pinned to the node, polling `df` for running min/max/avg; `--rm` tears it down. Once the dind DaemonSet exists, `kubectl exec` into it suffices (it mounts the tmpfs). Tool: `ramdisk-watch-kube.sh` (auto-detects the node from a running `arc-runner-ue`/`dind` pod).
- Measure extracted image footprint (`docker system df`, `du -sh /var/mnt/ramdisk/docker`) and per-build scratch (`du -sh` of the project tree, plus watch peak) on the first run.
- Confirm measured **peak tmpfs + VM RAM + node baseline < physical RAM** before locking the tmpfs `size=`.
- Confirm both Linux builds reuse one image (`docker images` shows one engine; `df /var/mnt/ramdisk/docker` does not double) at `maxRunners: 2`.
- Confirm the Windows guest mounts the virtio-fs share as a drive and the in-guest `git clone` from it succeeds.

## Implementation prerequisites & required PRs (§6 — round-2 audit, 2026-06-24)

A second adversarial audit read the spec **against the workflow it modifies** (`.github/workflows/ci-unreal-build.yml` @ `origin/dev`) and the full `values-ue.yaml`, not just the platform facts. It found three **blockers** that break the build the moment `maxRunners: 2` is restored, plus budget/rollback gaps. These are not optional polish — `maxRunners` stays at `1` until they are closed.

### Blockers (must land before restoring concurrency)

- **B1 — `docker run -v /tmp/...` will not resolve in a shared dind.** Both Linux builds bind-mount RAM-emptyDir paths into the daemon: `docker run --rm -v /tmp/game-project:/project -v /tmp/ue5-build-output:/output` (`ci-unreal-build.yml` ~L525/L894). Today this works *only* because the per-pod dind sidecar shares the pod's `shared-tmp`/`work` emptyDirs. A shared DaemonSet dind sees its **own** `/tmp`, so the bind source is empty → the container builds nothing. **Every** hardcoded `/tmp/game-clone`, `/tmp/game-project`, `/tmp/ue5-build-output` (dozens, ~L441–L965) must move under the shared hostPath. §2.6 ("add `needs: prepare`") drastically understates this — it is a workflow rewrite, captured as PR-1.
- **B2 — existing `docker system prune -f` destroys the shared image mid-build.** Every Linux job ends with `Cleanup: docker system prune -f` (~L658, ~L965). With one shared dind, the first build to finish prunes the 40 GB engine base layers (and dangling layers) the *second, still-running* build depends on → second build re-pulls 40 GB (re-triggering the original ENOSPC-in-RAM) or fails. The in-build prune must be removed/rescoped; GC centralizes into `prepare` under the same `flock` (PR-1).
- **B3 — concurrent builds collide on identical hardcoded paths.** `server_build` and `game_build_linux` both use the *same literal* `/tmp/game-project` and `/tmp/ue5-build-output`. Today they are isolated by per-pod emptyDirs; once moved to a shared hostPath (to satisfy B1) the two jobs read/write the same tree, and one job's `rm -rf /tmp/game-project` (~L441/L801) wipes the other mid-build → silent cross-contamination and wrong-artifact deploys to the Longhorn OWS PVC. Per-job namespacing (e.g. `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/…`) for the materialized project **and** output dirs is mandatory, not only for the git working tree (PR-1).

### Required follow-up PRs

1. **`ci-unreal-build.yml` rewrite** — per-job path namespacing under the shared hostPath (project + output + clone, not just the git tree); **remove/rescope** the per-build `docker system prune -f` and centralize GC in `prepare` under `flock`; thread `prepare`/`flock` and clone-by-explicit-SHA (§4 SHA-skew). Closes B1, B2, B3. This PR is the gate for `maxRunners: 2`.
2. **Corrected RAM-budget worksheet + hard cap + alert** — the §4 budget proof omits the runner pods' own RAM emptyDirs (`work` `medium: Memory` 24Gi + `shared-tmp` `medium: Memory` 16Gi, per `values-ue.yaml`), i.e. up to **2×40 = 80 GB** at `maxRunners: 2` that the proof never counts. Either migrate these onto the shared hostPath (then they enter the budget) or keep them (then the budget cannot close). Deliver: a worksheet counting **all** RAM emptyDirs + tmpfs + VM (20Gi) + etcd/CH/PG baseline + page-cache margin against 109 GB; a hard tmpfs `size=`; and a **runtime** tmpfs-usage alert — the §4 pre-flight check runs *before* the cook and cannot see peak scratch (the unguarded etcd-flap path, #12987).
3. **Shared-dind DaemonSet manifest** — privileged, `--data-root=/var/mnt/ramdisk/docker`, host-local UNIX socket on the shared hostPath with an explicit **socket gid** the non-root runner (`runAsUser: 1000`) can access (default root:root 0660 socket → `permission denied`); a **PodDisruptionBudget**; and a resource envelope sized for **two** concurrent cooks (today each per-pod dind had 80Gi/4cpu) co-resident with etcd. Note: shared dind is now a **single point of failure** — its crash/tmpfs-wipe fails *both* concurrent builds, not one.
4. **Talos tmpfs spike + decision record** — §2.1 prefers a `machine.config` mount, but Talos has no generic fstab/tmpfs primitive; this may force the privileged-DaemonSet fallback the spec tries to avoid. Treat as a spike with a written decision (machine-config vs DaemonSet), not a foregone preference.
5. **Deploy-order + rollback runbook** — this is a 6-surface change (workflow rewrite, `values-ue.yaml`, dind DaemonSet, Talos tmpfs, KubeVirt CR feature gate, VM virtio-fs device) with no sequence and no revert plan today. The runbook must include ordering **and** rollback, explicitly covering reverting the install-wide `ExperimentalVirtiofsSupport` gate once the VM depends on it (not a clean revert on a single node), plus `win_vm_boot` virtio-fs **mount-readiness** (a booted VM ≠ a mounted share — the boot gate at ~L967 has no mount probe).

### Branch-drift reminder

`dev`/`main` interim states differ (`maxRunners` 1 vs 2, `dind-storage` 64Gi vs 40Gi). Reconcile before promotion or the next `dev→main` merge yields an untested third combination.

## Audit reconciliation (2026-06-24)

An adversarial review of this spec was run. Disposition:

- **Rejected — "baseline doesn't exist" / "root cause is disk not RAM" (both HIGH).** Verified against `git show origin/dev:…values-ue.yaml` @ `2df4b35`: `maxRunners: 1`, `dind-storage` `medium: Memory` `64Gi`, mirror present — matches this spec. The review's claimed `maxRunners: 3` / plain `emptyDir: {}` / no-mirror matches **neither** `dev` nor `main` (main = `maxRunners: 2` / RAM `40Gi`). The store is RAM-backed on both branches, so the ENOSPC was RAM exhaustion as stated; the disk-vs-RAM reframe does not apply. Branch drift is real but different from the review's claim — captured in **Problem**.
- **Accepted — DinD-over-TCP exposure (HIGH security):** §4 *DinD exposure* + §2.3/§2.4 now mandate a host-local UNIX socket, not a cluster TCP Service.
- **Accepted — no tmpfs eviction; `--shared` alternates fragility; SHA skew:** added to §4 (pre-flight + GC, alternate-loss tolerance, clone-by-SHA).
- **Accepted — prefer Talos machine-config mount; thread `prepare` through `win_vm_boot`; preserve forgejo-lfs secret:** folded into §2.
- **Partially accepted — elevate the node RAM ceiling to the primary risk:** §4 *Node RAM ceiling* + §5. The reviewer's suggestion to move the read-only image base off RAM was **declined** — all-in-RAM is a deliberate design decision; the budget proof must close with the engine in RAM, otherwise lower `maxRunners`.

## Out of scope

- Mac builder (separate host; stub).
- Cross-node sharing (single node — not applicable).
- Replacing the existing `builder-shared-storage` block PVC (kept for ISO/installer staging).
- Any change to the native Windows engine install.
