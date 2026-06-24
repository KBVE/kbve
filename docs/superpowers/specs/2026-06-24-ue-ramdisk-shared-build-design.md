# Shared-RAMdisk UE Build (Talos single-node + KubeVirt) — Design

**Date:** 2026-06-24
**Status:** Design accepted. `maxRunners: 2` is the target and the RAM budget closes on the corrected node size (~500 GB, not the earlier mistaken 109 GB — see WS-2). Restoring concurrency is still gated on the **functional** blockers in §6 (B1/B2/B3 — the `ci-unreal-build.yml` rewrite), which are workflow-correctness issues, not RAM. (round-2 audit + node-size correction, 2026-06-24).
**Target:** One node tmpfs holds the engine image + repo. The two Linux builders share it directly (hostPath); the Windows VM gets its **own** RAM-backed copy from a read-only block image of the repo — **no file sharing across the VM boundary, no virtio-fs, no KubeVirt feature gate.**
**Scope:** Unreal Engine CI on the single Talos node. Mac builder out of scope.

## Problem

UE CI jobs failed with `no space left on device` on `/var/lib/docker/.../overlayfs` while extracting `epicgames/unreal-engine:dev-5.8.0`. Root cause: each Linux build pod (`server_build`, `game_build_linux`) ran its own DinD with a per-pod image store, so concurrent jobs each extracted their own ~40 GB copy of the engine and exhausted the RAM-backed store.

Current state (`apps/kube/github/runners/manifests/values-ue.yaml`) is an interim mitigation. **Baseline is `origin/dev` @ `2df4b35`** (verified): `maxRunners: 1` (serialized), a **RAM-backed** `dind-storage` emptyDir (`medium: Memory`, `sizeLimit: 64Gi`), and a ghcr pull-through mirror (`--insecure-registry=registry-mirror-ghcr…`, line 88). This prevents the crash by never running two Linux builds at once, at the cost of all concurrency. This design supersedes that interim hack.

> **Branch drift (read before implementing):** `origin/main` carries a *different* interim state — `maxRunners: 2`, `dind-storage` RAM emptyDir `40Gi` (same mirror). Neither branch uses a plain disk-backed `emptyDir: {}`. Implement against the committed `dev` values (pin the SHA), not against memory or `main`. The original ENOSPC was the **RAM** store exhausting under concurrent extraction — not node disk exhaustion — because `dind-storage` has been `medium: Memory` on both branches. This matters: the cure must respect the node RAM budget (§4), not assume there is disk headroom to fall back on.

## Goals

- Keep build data in RAM for speed (avoid disk I/O).
- **Extract the Linux engine image once**, shared by both Linux builders → restore `maxRunners: 2` (concurrent Linux builds).
- **Populate the repo (git + LFS) once** on the tmpfs; the 2 Linux builders share it read-only via `--local --shared`; the Windows VM reads a read-only **block image** of it and plain-clones into its own RAM work disk.
- Windows gets the repo as a RAM-backed **drive** — its own copy, sole writer — with **zero cluster-wide changes** (plain block-disk attach, like the existing `builder-shared-storage` PVC).

## Platform facts (verified against the repo)

- **Single Talos node** runs everything: k8s control plane, the ARC Linux runner pods, the KubeVirt `windows-builder` VM, and node databases. Total RAM **~500 GB** (operator-confirmed 2026-06-24; an earlier draft's "~109 GB, verified against the repo" was wrong — physical RAM is not in `talos-worker.yaml`), shared across all of them. The `node.kbve.com/type=intel-nuc` label and "NUC SSD" comments in `talos-worker.yaml` are leftover template strings, not a node fleet.
- Because there is **one node**, co-location is automatic — **no nodeSelector/affinity/pinning is required** for any consumer to share a host-local tmpfs.
- Talos is **immutable**: a host tmpfs is provisioned via Talos machine config or a privileged DaemonSet, not `systemd`/`fstab`.
- The Windows builder is a **KubeVirt VM** (`apps/kube/angelscript/manifest/vm-windows-builder.yaml`): disks are `rootdisk` (PVC `windows-builder-rootdisk`, 120Gi), `iso` (dataVolume), `shared-storage` (PVC `builder-shared-storage`, 50Gi RWX Longhorn, attached as a virtio **block** disk). **No `filesystems`/virtiofs device exists.**
- KubeVirt feature gates (`apps/kube/kubevirt/cr/kubevirt.yaml`) are `LiveMigration, HotplugVolumes, NetworkBindingPlugins, ExpandDisks` — **`ExperimentalVirtiofsSupport` is NOT enabled.**
- Today the Windows job gets the repo by **git clone inside the guest** (`.github/workflows/ci-unreal-build.yml`, `game_build_windows` ~lines 1014–1224); it is a native build (no Docker).
- The Linux engine image is **~40 GB** extracted. The UE engine is **installed natively on Windows** — the Windows builder never pulls the Docker image.

## Why a read-only block image for Windows (NOT virtio-fs)

**Decision (supersedes the earlier virtio-fs design): Windows gets its own RAM copy via a read-only block image. No virtio-fs, no `ExperimentalVirtiofsSupport` gate.**

Why the reversal:
- **A VM can't read a host directory** — only a block disk or a file-sharing protocol. The Linux pods read `repo.git` as a tmpfs *directory* (hostPath); the guest has no equivalent.
- **A shared *writable* block disk corrupts** regardless of filesystem (FAT/NTFS/ext4 alike): two independent kernels (host + guest) cache filesystem metadata separately with no coordinator, so concurrent RW = corruption. FAT does not help. The only safe block sharing is **read-only everywhere**.
- **True file-level sharing** (Linux + Windows read/write the *same live tree*) needs a server that arbitrates access — virtio-fs (host=server) or SMB/NFS. virtio-fs requires the install-wide `ExperimentalVirtiofsSupport` gate; SMB requires an extra Samba pod. Both add blast radius / moving parts.
- **We don't need true sharing.** Windows clones its **own** copy. So instead: `prepare` packs the populated repo into a **read-only disk image** on the tmpfs (`repo.img`, RAM-backed); `win_vm_boot` attaches it to the VM **read-only** (the safe RO-everywhere exception — it's written only while the VM is off); the guest mounts it as a drive and does a **plain full clone** into its own RAM work disk. Sole-writer-of-its-own-disk ⇒ no corruption, no gate, no Talos, no reboot — a plain block-disk attach exactly like `builder-shared-storage` today.

Trade-off (accepted): the repo exists in **two representations** — a *directory* for the Linux pods, a *disk image* for the VM (there is no single representation that serves both a pod and a VM without a file-sharing server). And the Windows clone is a **full RAM copy** (objects + LFS, not deduped) — fine for one VM; sized in §4/WS-2.

## Architecture (§1 — single tmpfs, three consumers)

One host tmpfs on the Talos node at `/var/mnt/ramdisk` (size validated against node RAM; see §5) holds two shared stores:

- `/var/mnt/ramdisk/docker` — data-root for **one shared dind** (DaemonSet; single node ⇒ one pod). The 40 GB Linux UE image is pulled/extracted **once**; both Linux builders share its read-only overlay base layers.
- `/var/mnt/ramdisk/repo.git` — one git **mirror**, cloned **once**, holding **both** git objects (source/history, cheap) **and** the LFS object store (`repo.git/lfs/objects` — the heavy art payload). The mirror is of the **external game repo** (whose Forgejo LFS is the dominant data), not the light monorepo; `prepare` needs the GH/Forgejo creds to populate it.
  - **Key gotcha:** `git clone --mirror` does **not** fetch LFS blobs, and `git clone --local --shared` shares git objects via alternates but **not** `.git/lfs/objects`. Naïvely, each builder would re-pull the LFS art → the expensive payload duplicated per builder, defeating the RAM saving. So `prepare` must `git lfs fetch --all` into the mirror **once**, and each builder points its LFS storage at the shared store (`git config lfs.storage /var/mnt/ramdisk/repo.git/lfs`) instead of copying — readonly sharing of both objects and blobs. Only `prepare` ever writes/pulls.

Consumers (all on the one node, no pinning needed):

- **2 Linux builders** (`server_build`, `game_build_linux`): drop the per-pod dind sidecar; set `DOCKER_HOST` to the shared dind. Each `hostPath`-mounts `/var/mnt/ramdisk` so `docker run -v <project>` resolves inside the shared dind (the bind-mount source must exist in the dind's filesystem, which is the same node tmpfs). Each gets an **isolated** working tree via `git clone --local --shared /var/mnt/ramdisk/repo.git <work>` (object alternates — objects referenced not copied; tree is writable/private so the two concurrent builds never collide on `Intermediate/`, `Saved/`, `Binaries/`), then `git config lfs.storage /var/mnt/ramdisk/repo.git/lfs` + `git lfs checkout` so LFS blobs smudge from the **shared** store (no network, no per-job copy). Builders are pure readers — never `git lfs pull`.
- **1 Windows builder** (`game_build_windows`): `prepare` packs the populated repo (git + LFS) into a **read-only disk image** on the tmpfs (`/var/mnt/ramdisk/repo.img`); `win_vm_boot` attaches it to the VM **read-only**; the guest mounts it as a drive (e.g. `R:`) and does a **plain full `git clone`** into its own RAM work disk (e.g. `W:`) — not `--shared` (alternates don't cross the VM boundary; the path differs in the guest). Engine is installed natively. The clone is a full copy (objects + LFS), so the VM is the sole writer of its own work disk → no cross-OS block corruption.
- **Mac**: out of scope (separate host, stub).

Sharing graph:
- `repo.git` directory (tmpfs) → **Linux ×2** via hostPath + `--local --shared` (+ shared `lfs.storage`)
- `repo.img` read-only block image (tmpfs) → **Windows VM** (RO attach → plain full clone into its own work disk; no live sharing)
- dind image-store (tmpfs) → Linux ×2 only

## Components (§2 — what to build/change)

1. **Node tmpfs** — provision a host tmpfs at `/var/mnt/ramdisk` on the Talos node. **DECISION (WS-4, supersedes the earlier preference): use a privileged DaemonSet that mounts `tmpfs` into the host namespace — NOT a Talos `machine.config` mount.** Rationale: Talos v1.8 has no clean host-tmpfs primitive, and any machine-config apply to the **single control-plane node carries reboot/brick risk with no failover** — an OS-level change this design must avoid. The DaemonSet needs **no Talos change and no reboot** and is revertible by deleting the pod. See `2026-06-24-ue-ramdisk-talos-tmpfs-decision.md`. Single sizing knob (`size=150G`, the WS-2 cap; raise with `maxRunners` per the WS-2 table); validated in §5.
2. **hostPath PV/PVC** over `/var/mnt/ramdisk/repo.img` (the RO repo disk image) so KubeVirt can attach it to the VM as a plain block disk — same mechanism as the existing `builder-shared-storage` PVC. **No virtio-fs, no feature gate.**
3. **Shared dind** — DaemonSet (one pod on the node), privileged, `--data-root=/var/mnt/ramdisk/docker`, hostPath-mounts `/var/mnt/ramdisk`, keeps the existing `--insecure-registry=registry-mirror-ghcr...` and fd-limit flags. **Exposes the daemon to runner pods via a host-local UNIX socket on a hostPath (`/var/mnt/ramdisk/docker.sock`), NOT a cluster TCP Service** — see §4 (DinD exposure). Runner pods set `DOCKER_HOST=unix:///var/mnt/ramdisk/docker.sock`.
4. **`values-ue.yaml` rework** — remove the per-pod `dind` sidecar and `dind-storage` emptyDir; add hostPath mount of `/var/mnt/ramdisk`; set `DOCKER_HOST` to the host-local socket (above); preserve the existing `forgejo-lfs-credentials` (`api-token`) secret mount on the new runner template (drift-prone per ops notes); restore `maxRunners: 2`.
5. **Windows RO repo disk (NO KubeVirt config change)** — add a **read-only block disk** to `vm-windows-builder.yaml` backed by the `repo.img` hostPath PVC (a plain `disk` volume, like the existing `builder-shared-storage` attach). **No `featureGates` change, no `filesystems`/virtio-fs device, no WinFsp/VirtIO-FS driver install** — so `kubevirt/cr/kubevirt.yaml` is **untouched** and there is **no install-wide change**. The guest auto-mounts the RO disk and plain-clones from it. No driver install ⇒ the VM-snapshot precondition is no longer required for this step (the rootdisk is unmodified), though a snapshot before the first run is still cheap insurance.
6. **`prepare` gate** in `ci-unreal-build.yml` — **see §6 WS-1: this is a workflow rewrite (per-job path namespacing, removing the per-build `docker system prune -f`), not just an added `needs:`** — idempotent, `flock`-guarded: clone/fetch the mirror to the run SHA, `git lfs fetch --all`, pack the RO `repo.img`, and `docker pull` the image once into the shared stores; includes the **pre-flight free-space check** (§4). `server_build`, `game_build_linux` gain `needs: prepare`. **`game_build_windows` runs on the `UE5-Win` label and already `needs: [guard, game_gate, win_vm_boot]`** — `prepare` must complete (and `repo.img` exist) **before** `win_vm_boot` attaches it RO and boots, so the ordering is `prepare → win_vm_boot → game_build_windows`. Because the disk is attached at boot (not hot-mounted into a running guest), a booted VM implies the RO disk is present — no separate mount-readiness race.

## Data flow (§3 — per pipeline run)

`prepare` (under `flock`) ensures the mirror is fetched to the run's SHA, **its LFS blobs are populated once** (`git lfs fetch --all` into `repo.git/lfs`), and the image is present in the shared dind → fan out:
- Each **Linux** job `git clone --local --shared` into its own tree on the tmpfs, sets `lfs.storage` to the shared `repo.git/lfs` and `git lfs checkout` (reads blobs, never pulls), builds via the shared dind, writing cook output to its own `/var/mnt/ramdisk/<job>-scratch`.
- The **Windows** job boots with the RO `repo.img` attached (drive `R:`), plain-clones from it into its own RAM work disk (`W:`), builds with the installed engine.

## Failure modes & guards (§4)

- **DinD exposure (security, HIGH — do NOT ship as TCP).** The shared daemon listens on `tcp://0.0.0.0:2376 --tls=false`. Fronting that with a ClusterIP Service would expose an **unauthenticated privileged Docker API cluster-wide** — any pod could drive it and trivially escape to node root. On a single node this is unnecessary: bind the daemon to a **host-local UNIX socket on the shared hostPath** (`unix:///var/mnt/ramdisk/docker.sock`) that only the co-located runner pods mount. If TCP is ever required, it must be `--tls` with client certs **and** a `NetworkPolicy` scoping the daemon to the UE runner pods only. The current per-pod localhost sidecar must not be replaced by a less-scoped transport.
- **Node RAM ceiling (single node).** The tmpfs shares **~500 GB** with etcd, the KubeVirt VM RAM (16Gi guest / 20Gi limit), and node databases (ClickHouse/Postgres). etcd `fdatasync` latency on this node is already the documented failure mode (issue [[project_etcd_io_starvation_argo_flapping]] / #12987); memory pressure that evicts page cache or stalls etcd can drop the control-plane lease and flap the whole cluster. On ~500 GB the budget is not the binding constraint — the **tmpfs `size=` ceiling (150 GB)** is what bounds concurrency, and it is deliberately capped well under node RAM so a full tmpfs can never starve etcd. Still verify both:
    - **Budget (closes comfortably):** `engine-overlay + mirror + 2×Linux-scratch + repo.img + Windows-clone-copy + 20 GB VM + etcd/CH/PG baseline + page-cache margin < 500 GB` (note: `repo.img` and the Windows full-copy clone are RAM terms only while the VM is up; if Windows builds overlap Linux builds, count them — they still fit, ~190 GB free per WS-2). The tighter check is the **tmpfs ceiling**: `engine + mirror + N×scratch + repo.img < 150 GB`. Raise `maxRunners` and the ceiling together (WS-2 table); never one without the other.
    - **Image base stays in RAM** (all-in-RAM, by design decision). The whole `--data-root` lives on tmpfs; the budget proof above must close *with* the engine in RAM. If it doesn't, reduce `maxRunners` rather than moving the image to disk. *(Revisit later: once stable, benchmark all-in-RAM vs. image-`--data-root`-on-disk to see which is actually faster — the read-mostly base may run just as fast from disk via page cache, freeing RAM. Decide on measured numbers, not assumption.)*
    - Enforce a hard tmpfs `size=` so it cannot grow past budget.
- **Windows RO repo image — RAM budget + volatility.** `repo.img` is a fixed-size RAM-backed disk on the tmpfs; its written bytes count against the **node** RAM budget (§Node RAM ceiling / WS-2), and the Windows guest's plain clone is a **full RAM copy** (objects + LFS, not deduped) inside its own work disk — both terms must be in the budget. The image is volatile (tmpfs wipe ⇒ gone); `prepare` repacks it per run, and `win_vm_boot` only attaches it after `prepare` succeeds.
- **RO-everywhere is the only safe block sharing.** `repo.img` is written **only while the VM is off** (during `prepare`), then attached **read-only**; the VM never writes it and Linux never mounts it (Linux uses the `repo.git` *directory*, not the image). No concurrent writer ⇒ no cross-OS cache-coherency corruption. Do **not** attach `repo.img` read-write to the VM or loop-mount it RW on Linux while the VM holds it.
- **No eviction = ENOSPC relocated to RAM.** A fixed-size tmpfs is a cache with no GC. Without reclamation, accumulating working trees, cook scratch, and stale image layers will hit the hard `size=` cap mid-build — the *same* ENOSPC failure class, just moved into RAM. Required: (a) a **pre-flight free-space check in `prepare`** that fails fast if projected need (image + mirror + N×scratch estimate) exceeds free tmpfs, and (b) a **GC step** that reclaims prior runs' `<job>-scratch` and prunes dangling docker layers (`docker image prune`) between pipelines. No silent unbounded growth.
- **`--shared` alternates AND shared LFS storage on a volatile store can corrupt in-flight builds.** Linux trees use `git clone --local --shared` (git objects referenced in `repo.git`, not copied) **and** `lfs.storage` pointing at the shared `repo.git/lfs` (LFS blobs referenced, not copied). If the tmpfs/dind is wiped while a tree still references it, **both git objects and LFS blobs** vanish underneath the job → cryptic `object not found` *or* git-lfs smudge/`missing object` failures. Builders must **tolerate alternate/LFS loss**: on an object-missing or LFS-smudge error, re-run `prepare` and re-clone. (A full local clone + local `git lfs pull` instead of shared storage is the resilient fallback if corruption recurs — at the cost of the dedup.)
- **Concurrent pipelines / SHA skew on the shared mirror.** A second `prepare` can fast-forward the mirror to a newer SHA while the first pipeline's builders are still cloning, yielding a tree mismatched to the pipeline's SHA. Builders must **clone by explicit commit SHA** (not branch ref), and `prepare` must keep that SHA's objects pinned for the pipeline's lifetime. `flock` only serializes populate, not this skew — it does not by itself prevent the mismatch.
- **tmpfs is volatile** — reboot / dind restart wipes it. `prepare` repopulates (cold start = one clone + one pull). Treated as a cache, never durable.
- **`docker run -v` source visibility** — the shared dind and runner pods must mount the *same* tmpfs hostPath, or bind-mount sources won't exist in the dind. Both mount `/var/mnt/ramdisk`.
- **Windows cross-FS clone** — plain full clone (not `--shared`) from the RO `R:` drive into the guest's own work disk; alternates don't cross the VM boundary (the object-store path differs in the guest), so a full copy is required and is the robust choice.

## Validation & measurement (§5)

- The node is Kubernetes-managed (Talos, no host shell); inspect tmpfs usage via an **ephemeral hostPath pod** (auto-deleted) pinned to the node, polling `df` for running min/max/avg; `--rm` tears it down. Once the dind DaemonSet exists, `kubectl exec` into it suffices (it mounts the tmpfs). Tool: `ramdisk-watch-kube.sh` (auto-detects the node from a running `arc-runner-ue`/`dind` pod).
- Measure extracted image footprint (`docker system df`, `du -sh /var/mnt/ramdisk/docker`) and per-build scratch (`du -sh` of the project tree, plus watch peak) on the first run.
- Confirm measured **peak tmpfs + VM RAM + node baseline < physical RAM** before locking the tmpfs `size=`.
- Confirm both Linux builds reuse one image (`docker images` shows one engine; `df /var/mnt/ramdisk/docker` does not double) at `maxRunners: 2`.
- Confirm the Windows guest boots with the RO `repo.img` attached, sees it as a drive, and the in-guest plain `git clone` from it succeeds. Confirm `kubevirt/cr/kubevirt.yaml` is unchanged (no feature gate added).

## Implementation prerequisites & workstreams (§6 — round-2 audit, 2026-06-24)

A second adversarial audit read the spec **against the workflow it modifies** (`.github/workflows/ci-unreal-build.yml` @ `origin/dev`) and the full `values-ue.yaml`, not just the platform facts. It found three **blockers** that break the build the moment `maxRunners: 2` is restored, plus budget/rollback gaps. These are not optional polish — `maxRunners` stays at `1` until they are closed.

This work ships as **one PR** (#13278): the items below are workstreams (WS-1…WS-5) within this single PR, not separate follow-up PRs. They are sequenced, not independent — WS-1 gates the `maxRunners: 2` flip.

**Deliverables in this PR (all INERT — nothing auto-activates on merge; Argo auto-sync is avoided by keeping new manifests out of `kustomization.yaml` and leaving `values-ue.yaml` unchanged):**

| WS | Deliverable | File | State |
|----|-------------|------|-------|
| WS-1 | Workflow edit set (path namespacing, prune removal, `prepare`/`flock`, clone-by-SHA) — applied at **cutover**, not in this PR (a reusable workflow goes live at its merged ref; it is coupled to the runner rework and untestable here) | exact edits pinned in the runbook | Specified, not applied |
| WS-2 | RAM-budget worksheet + runtime alert | `2026-06-24-ue-ramdisk-ram-budget.md`, `manifests/ue-ramdisk-tmpfs-alert.yaml` | Worksheet + inert alert |
| WS-3 | Shared-dind DaemonSet (+ PDB, host-local socket gid, 2-build envelope) | `manifests/shared-dind-daemonset.yaml` | Inert (not in kustomization) |
| WS-4 | Talos tmpfs decision record (**reverses §2.1**: DaemonSet, not machine-config) | `2026-06-24-ue-ramdisk-talos-tmpfs-decision.md` | Decision (needs cluster validation) |
| WS-5 | Cutover + rollback runbook (deploy order, per-VM RO-disk revert; no gate to revert) | `2026-06-24-ue-ramdisk-cutover-runbook.md` | Keystone |

> **Why WS-1 is specified, not applied:** `ci-unreal-build.yml` is a `workflow_call` reusable workflow — the moment a rewritten version reaches the merged ref it is live for the next UE build, and its new code paths require the shared dind + tmpfs that do not exist until cutover. Hand-editing a ~2600-line workflow blind and untestable, coupled to absent infra, is the larger risk. The precise, minimal in-place edits (only `server_build`, `game_build_linux`, + a new `prepare` job; `ci-unreal.yml`/`ci-unreal-plugins.yml` untouched) are pinned in the runbook and applied together with the runner rework during cutover.
>
> **Blast-radius / scope inventory (read this before approving):**
> - **Cluster/install-wide changes: ZERO.** The earlier virtio-fs design's one install-wide change (the KubeVirt `ExperimentalVirtiofsSupport` feature gate) is **removed** — Windows now uses a plain read-only block-disk attach (`repo.img`), so `kubevirt/cr/kubevirt.yaml` is untouched. No feature gates, no ClusterRoles, no cluster-scoped RBAC, no CRD changes.
> - **Talos / OS-level changes: NONE.** WS-4 rejects the machine-config tmpfs route. The tmpfs is a privileged DaemonSet — **no machine-config apply, no reboot** (an OS-level change on the single control-plane node is a brick risk with no failover; explicitly avoided).
> - **Node-level privileged workload: ONE** — the shared-dind DaemonSet (`hostPID` + `nsenter` to mount tmpfs). Not a cluster-API/Talos change; revertible by deleting the pod; namespaced to `arc-runners`.
> - **VM spec change: per-object only** — one read-only block disk added to `vm-windows-builder.yaml` (same mechanism as the existing `builder-shared-storage` attach). Affects only that one VM.
> - **Net:** the entire plan is namespaced workloads + one per-VM disk attach. **No install-wide, no Talos, no reboot anywhere.**
>
> **Runner topology clarification (not the 3 scale sets):** the "2 Linux + 1 Windows" consumers are **not** the three `arc-runner-ue*` Helm releases. Both Linux builders are pods of the single **`arc-runner-ue`** scale set (concurrency = `maxRunners`); the Windows builder is the **KubeVirt VM** whose in-guest self-hosted runner registers as **`UE5-Win`**. `arc-runner-ue-win` (expects a physical Windows node) and `arc-runner-ue-mac` are **dormant (0 runners)** and need no changes — do not wire the repo disk into them.

### Blockers (must land before restoring concurrency)

- **B1 — `docker run -v /tmp/...` will not resolve in a shared dind.** Both Linux builds bind-mount RAM-emptyDir paths into the daemon: `docker run --rm -v /tmp/game-project:/project -v /tmp/ue5-build-output:/output` (`ci-unreal-build.yml` ~L525/L894). Today this works *only* because the per-pod dind sidecar shares the pod's `shared-tmp`/`work` emptyDirs. A shared DaemonSet dind sees its **own** `/tmp`, so the bind source is empty → the container builds nothing. **Every** hardcoded `/tmp/game-clone`, `/tmp/game-project`, `/tmp/ue5-build-output` (dozens, ~L441–L965) must move under the shared hostPath. §2.6 ("add `needs: prepare`") drastically understates this — it is a workflow rewrite, captured as WS-1.
- **B2 — existing `docker system prune -f` destroys the shared image mid-build.** Every Linux job ends with `Cleanup: docker system prune -f` (~L658, ~L965). With one shared dind, the first build to finish prunes the 40 GB engine base layers (and dangling layers) the *second, still-running* build depends on → second build re-pulls 40 GB (re-triggering the original ENOSPC-in-RAM) or fails. The in-build prune must be removed/rescoped; GC centralizes into `prepare` under the same `flock` (WS-1).
- **B3 — concurrent builds collide on identical hardcoded paths.** `server_build` and `game_build_linux` both use the *same literal* `/tmp/game-project` and `/tmp/ue5-build-output`. Today they are isolated by per-pod emptyDirs; once moved to a shared hostPath (to satisfy B1) the two jobs read/write the same tree, and one job's `rm -rf /tmp/game-project` (~L441/L801) wipes the other mid-build → silent cross-contamination and wrong-artifact deploys to the Longhorn OWS PVC. Per-job namespacing (e.g. `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/…`) for the materialized project **and** output dirs is mandatory, not only for the git working tree (WS-1).

### Workstreams (all in this PR)

1. **`ci-unreal-build.yml` rewrite** — per-job path namespacing under the shared hostPath (project + output + clone, not just the git tree); **remove/rescope** the per-build `docker system prune -f` and centralize GC in `prepare` under `flock`; thread `prepare`/`flock` and clone-by-explicit-SHA (§4 SHA-skew). Closes B1, B2, B3. WS-1 is the gate for `maxRunners: 2`.
2. **RAM-budget worksheet + hard cap + alert** — the worksheet must count **all** RAM consumers: the shared tmpfs *plus* the runner pods' own RAM emptyDirs (`work` `medium: Memory` 24Gi + `shared-tmp` `medium: Memory` 16Gi, per `values-ue.yaml`, i.e. up to **2×40 = 80 GB** at `maxRunners: 2`, which live **outside** the tmpfs) + VM (20Gi) + etcd/CH/PG baseline + page-cache margin. On the corrected **~500 GB** node this sum closes with ~190 GB to spare (WS-2), so the gate is the **tmpfs `size=` ceiling (150 GB)**, not node RAM. Deliver: the worksheet, the hard tmpfs `size=150G`, and a **runtime** tmpfs-usage alert — the §4 pre-flight check runs *before* the cook and cannot see peak scratch (the unguarded etcd-flap path, #12987).
3. **Shared-dind DaemonSet manifest** — privileged, `--data-root=/var/mnt/ramdisk/docker`, host-local UNIX socket on the shared hostPath with an explicit **socket gid** the non-root runner (`runAsUser: 1000`) can access (default root:root 0660 socket → `permission denied`); a **PodDisruptionBudget**; and a resource envelope sized for **two** concurrent cooks (today each per-pod dind had 80Gi/4cpu) co-resident with etcd. Note: shared dind is now a **single point of failure** — its crash/tmpfs-wipe fails *both* concurrent builds, not one.
4. **Talos tmpfs spike + decision record** — §2.1 prefers a `machine.config` mount, but Talos has no generic fstab/tmpfs primitive; this may force the privileged-DaemonSet fallback the spec tries to avoid. Treat as a spike with a written decision (machine-config vs DaemonSet), not a foregone preference.
5. **Deploy-order + rollback runbook** — this is a multi-surface change (workflow rewrite, `values-ue.yaml`, dind DaemonSet + tmpfs, one RO repo disk on `vm-windows-builder.yaml`) with no sequence and no revert plan today. The runbook must include ordering **and** rollback. **Note:** the virtio-fs/`ExperimentalVirtiofsSupport` surface is **removed** from this plan (Windows uses a RO block-disk attach), so there is no install-wide gate to revert; rollback is namespaced-workload + per-VM-disk removal only. The `prepare → win_vm_boot` ordering must ensure `repo.img` exists before the VM boots (disk attached at boot ⇒ no mount-readiness race).

### Branch-drift reminder

`dev`/`main` interim states differ (`maxRunners` 1 vs 2, `dind-storage` 64Gi vs 40Gi). Reconcile before promotion or the next `dev→main` merge yields an untested third combination.

## Audit reconciliation (2026-06-24)

An adversarial review of this spec was run. Disposition:

- **Rejected — "baseline doesn't exist" / "root cause is disk not RAM" (both HIGH).** Verified against `git show origin/dev:…values-ue.yaml` @ `2df4b35`: `maxRunners: 1`, `dind-storage` `medium: Memory` `64Gi`, mirror present — matches this spec. The review's claimed `maxRunners: 3` / plain `emptyDir: {}` / no-mirror matches **neither** `dev` nor `main` (main = `maxRunners: 2` / RAM `40Gi`). The store is RAM-backed on both branches, so the ENOSPC was RAM exhaustion as stated; the disk-vs-RAM reframe does not apply. Branch drift is real but different from the review's claim — captured in **Problem**.
- **Accepted — DinD-over-TCP exposure (HIGH security):** §4 *DinD exposure* + §2.3/§2.4 now mandate a host-local UNIX socket, not a cluster TCP Service.
- **Accepted — no tmpfs eviction; `--shared` alternates fragility; SHA skew:** added to §4 (pre-flight + GC, alternate-loss tolerance, clone-by-SHA).
- **Accepted then SUPERSEDED — Talos machine-config mount:** WS-4's spike reversed this. The implemented plan uses a **privileged DaemonSet, no Talos machine-config change, no reboot** (an OS-level change on the single control-plane node is a brick risk this design avoids). Thread-`prepare`-through-`win_vm_boot` and preserve-forgejo-lfs-secret: folded into §2.
- **Partially accepted — elevate the node RAM ceiling to the primary risk:** §4 *Node RAM ceiling* + §5. The reviewer's suggestion to move the read-only image base off RAM was **declined** — all-in-RAM is a deliberate design decision; the budget proof must close with the engine in RAM, otherwise lower `maxRunners`.

## Out of scope

- Mac builder (separate host; stub).
- Cross-node sharing (single node — not applicable).
- Replacing the existing `builder-shared-storage` block PVC (kept for ISO/installer staging; the new RO `repo.img` disk is a separate, additional attach).
- virtio-fs / `ExperimentalVirtiofsSupport` / WinFsp — **explicitly dropped** (superseded by the RO block-image approach; no install-wide change).
- Any change to the native Windows engine install.
