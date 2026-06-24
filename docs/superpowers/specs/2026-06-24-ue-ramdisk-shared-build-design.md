# Shared-RAMdisk UE Build (Talos single-node + KubeVirt) — Design

**Date:** 2026-06-24
**Status:** Approved (design); implementation plan pending
**Target:** Full three-way RAM share — one node tmpfs holds the engine image + repo; both Linux builders and the Windows VM read from it.
**Scope:** Unreal Engine CI on the single Talos node. Mac builder out of scope.

## Problem

UE CI jobs failed with `no space left on device` on `/var/lib/docker/.../overlayfs` while extracting `epicgames/unreal-engine:dev-5.8.0`. Root cause: each Linux build pod (`server_build`, `game_build_linux`) ran its own DinD with a per-pod image store, so concurrent jobs each extracted their own ~40 GB copy of the engine and exhausted the RAM-backed store.

Current dev state (`apps/kube/github/runners/manifests/values-ue.yaml`) is an interim mitigation: `maxRunners: 1` (serialized), a 64Gi RAM-backed `dind-storage` emptyDir, and a ghcr pull-through mirror (`registry-mirror-ghcr`). This prevents the crash by never running two Linux builds at once, at the cost of all concurrency. This design supersedes that interim hack.

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

1. **Node tmpfs** — provision a host tmpfs at `/var/mnt/ramdisk` on the Talos node (Talos machine config mount, or a privileged DaemonSet that `mount -t tmpfs` into the host namespace). Single sizing knob; validated in §5.
2. **hostPath PV/PVC** over `/var/mnt/ramdisk/repo.git` so KubeVirt can consume it as a virtio-fs source.
3. **Shared dind** — DaemonSet (one pod on the node), privileged, `--data-root=/var/mnt/ramdisk/docker`, hostPath-mounts `/var/mnt/ramdisk`, keeps the existing `--insecure-registry=registry-mirror-ghcr...` and fd-limit flags. Exposes `DOCKER_HOST` (Service on 2376) to runner pods.
4. **`values-ue.yaml` rework** — remove the per-pod `dind` sidecar and `dind-storage` emptyDir; add hostPath mount of `/var/mnt/ramdisk`; set `DOCKER_HOST` to the shared dind Service; restore `maxRunners: 2`.
5. **KubeVirt virtio-fs** — add `ExperimentalVirtiofsSupport` to `featureGates` in `kubevirt/cr/kubevirt.yaml`; add a `filesystems` (virtiofs) device + volume to `vm-windows-builder.yaml` backed by the repo PV; install WinFsp + VirtIO-FS driver in the guest (`VirtioFsSvc`) so the share auto-mounts as a drive. **Precondition: snapshot the VM/rootdisk first (see §4).**
6. **`prepare` gate** in `ci-unreal-build.yml` — idempotent, `flock`-guarded: clone/fetch the mirror to the run SHA and `docker pull` the image once into the shared stores; `server_build`, `game_build_linux`, `game_build_windows` gain `needs: prepare`.

## Data flow (§3 — per pipeline run)

`prepare` (under `flock`) ensures the mirror is fetched to the run's SHA and the image is present in the shared dind → fan out:
- Each **Linux** job `git clone --local --shared` into its own tree on the tmpfs, builds via the shared dind, writing cook output to its own `/var/mnt/ramdisk/<job>-scratch`.
- The **Windows** job reads the repo over virtio-fs (drive), plain-clones to its own working area, builds with the installed engine.

## Failure modes & guards (§4)

- **Node RAM ceiling (critical, single node).** The tmpfs shares ~109 GB with etcd, the KubeVirt VM's RAM, and node databases (ClickHouse/Postgres per ops notes). An oversized tmpfs can OOM the whole node. Size conservatively, validate peak (§5) before raising the cap, and prefer a hard `size=` on the tmpfs so it cannot grow past budget.
- **Windows driver install is irreversible-ish.** **Snapshot `windows-builder` (KubeVirt `VirtualMachineSnapshot`, or Longhorn `VolumeSnapshot` of `windows-builder-rootdisk`) with the VM paused/off, and verify a restore point, BEFORE installing WinFsp/VirtIO-FS.** The virtio-fs task begins with the snapshot, not the install.
- **virtio-fs is experimental.** Enabling the feature gate affects the whole KubeVirt install; validate the VM still boots and live-migration/hotplug behavior is unaffected on the single node.
- **tmpfs is volatile** — reboot / dind restart wipes it. `prepare` repopulates (cold start = one clone + one pull). Treated as a cache, never durable.
- **Concurrent pipelines / different SHAs** — shared *mirror* + per-job working trees ⇒ no working-tree collision; `flock` serializes the populate step.
- **`docker run -v` source visibility** — the shared dind and runner pods must mount the *same* tmpfs hostPath, or bind-mount sources won't exist in the dind. Both mount `/var/mnt/ramdisk`.
- **Windows cross-FS clone** — plain clone (not `--shared`) avoids Windows-git alternates referencing a virtio-fs path.

## Validation & measurement (§5)

- The node is Kubernetes-managed (Talos, no host shell); inspect tmpfs usage via an **ephemeral hostPath pod** (auto-deleted) pinned to the node, polling `df` for running min/max/avg; `--rm` tears it down. Once the dind DaemonSet exists, `kubectl exec` into it suffices (it mounts the tmpfs). Tool: `ramdisk-watch-kube.sh` (auto-detects the node from a running `arc-runner-ue`/`dind` pod).
- Measure extracted image footprint (`docker system df`, `du -sh /var/mnt/ramdisk/docker`) and per-build scratch (`du -sh` of the project tree, plus watch peak) on the first run.
- Confirm measured **peak tmpfs + VM RAM + node baseline < physical RAM** before locking the tmpfs `size=`.
- Confirm both Linux builds reuse one image (`docker images` shows one engine; `df /var/mnt/ramdisk/docker` does not double) at `maxRunners: 2`.
- Confirm the Windows guest mounts the virtio-fs share as a drive and the in-guest `git clone` from it succeeds.

## Out of scope

- Mac builder (separate host; stub).
- Cross-node sharing (single node — not applicable).
- Replacing the existing `builder-shared-storage` block PVC (kept for ISO/installer staging).
- Any change to the native Windows engine install.
