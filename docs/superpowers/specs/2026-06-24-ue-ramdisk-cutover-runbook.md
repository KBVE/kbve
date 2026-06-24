# WS-5 — Cutover & Rollback Runbook: UE shared-ramdisk build

**Companion to:** `2026-06-24-ue-ramdisk-shared-build-design.md`
**Status:** Runbook — the procedure that turns the inert artifacts in this PR into the live system, and reverts them. **Nothing in this PR auto-activates.** The artifacts ship inert specifically so this runbook is the single, ordered, reversible cutover.
**Audience:** an operator with `talosctl` + `kubectl` + KubeVirt access to the single Talos node.

> **Why a runbook is mandatory here:** the runner manifests are Argo auto-sync (`prune: true, selfHeal: true`) tracking `main`, but the tmpfs everything depends on is provisioned *out of band* and lives on the **single control-plane node** (a bad step bricks the cluster — no failover). Order is not advisory; out-of-order steps cause a selfHeal retry loop or an etcd flap (#12987).

## What ships inert in this PR (changes nothing on merge)

| Artifact | Inert because |
|---|---|
| `manifests/shared-dind-daemonset.yaml` | **not** in `kustomization.yaml` → Argo never applies it |
| `manifests/ue-ramdisk-tmpfs-alert.yaml` | **not** in `kustomization.yaml` |
| `values-ue.yaml` | **unchanged** — still `maxRunners: 1`, per-pod dind, `tcp://localhost:2376` |
| `ci-unreal-build.yml` | **unchanged** — old `/tmp` paths, per-pod dind. WS-1 edits below are applied *at cutover*, not in this PR |
| Talos tmpfs | not applied (WS-4 = DaemonSet, no machine-config change) |
| `kubevirt/cr/kubevirt.yaml` | **untouched** — Windows uses a RO block-disk attach, not virtio-fs; no feature gate |
| `vm-windows-builder.yaml` | **unchanged** until cutover — RO `repo.img` disk added then |

## Preconditions (do not start cutover until all true)

1. **WS-2 budget closes.** Run §5 validation at `maxRunners: 1`; the inequality in `2026-06-24-ue-ramdisk-ram-budget.md` holds with measured peak scratch + ≥10 GB margin. If it does not close → **stop, stay at `maxRunners: 1`** (this is the safe state; abandoning cutover is a valid outcome).
2. **`<CEILING>` chosen** = proven tmpfs size; substituted into the DaemonSet and the alert.
3. **VM snapshot (optional, cheap insurance).** A `VirtualMachineSnapshot` of `windows-builder` before the first run is nice-to-have, but **no longer required** — the RO `repo.img` attach does **not** modify the guest (no driver install), so the rootdisk is unchanged.
4. Maintenance window agreed; UE CI quiesced (no in-flight builds).

## Cutover — ordered (each step verifies before the next)

**Order rationale:** provision the tmpfs → bring up the daemon that owns it → point runners at it → only then re-enable concurrency → Windows RO repo-disk last (independent of the Linux path). Workflow edits go in the same change as the runner rework so the two never disagree.

1. **Provision tmpfs + shared dind (WS-3 + WS-4).** Add `shared-dind-daemonset.yaml` to `kustomization.yaml`; let Argo sync (or `kubectl apply` in the window). Verify:
   - `kubectl -n arc-runners get ds ue-shared-dind` → 1/1 ready.
   - `kubectl -n arc-runners exec ds/ue-shared-dind -- mount | grep /var/mnt/ramdisk` → `tmpfs ... size=<CEILING>`.
   - socket exists & group-readable: `ls -l /var/mnt/ramdisk/docker.sock` → group `1000`, mode `srw-rw----`.
2. **Repopulate check.** `kubectl -n arc-runners exec ds/ue-shared-dind -- docker pull <engine-ref>` once; confirm `du -sh /var/mnt/ramdisk/docker` ≈ engine size (not doubled).
3. **Rework `values-ue.yaml` (WS-2/§2.4) — keep `maxRunners: 1` for the first run:**
   - remove the `dind` sidecar container and the `dind-storage` emptyDir;
   - add a `ramdisk` `hostPath` volume (`/var/mnt/ramdisk`, `DirectoryOrCreate`) mounted in the runner with `mountPropagation: HostToContainer`;
   - set `DOCKER_HOST=unix:///var/mnt/ramdisk/docker.sock` (replace `tcp://localhost:2376`);
   - **keep** the `forgejo-lfs-credentials` `api-token` secret env (drift-prone — do not drop);
   - bump `kbve.com/restart-trigger` to force a pod rollout.
   Verify a single real build (still serialized) is green end-to-end via the shared dind.
4. **Apply WS-1 workflow edits** (same PR/commit as step 3 — see "WS-1 edit set" below). Re-run a build; confirm per-run scratch lands under `/var/mnt/ramdisk/<run>-<job>/` and the engine is reused (one copy).
5. **Add the alert** (`ue-ramdisk-tmpfs-alert.yaml` → `kustomization.yaml`). Confirm it loads in Prometheus.
6. **Flip `maxRunners: 2`** only now. Run two concurrent builds; watch `ramdisk-watch-kube.sh`; confirm the WS-2 inequality holds with real peak and that `df /var/mnt/ramdisk/docker` does not double.
7. **Windows RO repo disk (last; independent of the Linux path, zero cluster-wide change):**
   - `prepare` packs the populated repo into `/var/mnt/ramdisk/repo.img` (a sized disk image; git objects + LFS). Create a `hostPath` PV/PVC over it.
   - add a **read-only** `disk` volume to `vm-windows-builder.yaml` backed by that PVC — same mechanism as the existing `builder-shared-storage` attach. **Do NOT touch `kubevirt/cr/kubevirt.yaml`** (no feature gate) and add no `filesystems`/virtio-fs device.
   - ensure ordering `prepare → win_vm_boot → game_build_windows` so `repo.img` exists before the VM boots (the disk is attached at boot, so a booted VM ⇒ the RO disk is present — no mount-readiness race).
   - confirm the guest sees the RO disk as a drive and an in-guest **plain** `git clone` from it into the guest's own work disk succeeds.

## WS-1 edit set (apply at step 4 — `ci-unreal-build.yml`, in-place, no restructuring)

Scope: **only** `server_build` and `game_build_linux` jobs + one new `prepare` job. `ci-unreal.yml`, `ci-unreal-plugins.yml`, and all other jobs (engine_*, plugin_*, mac, windows-native) are untouched.

1. **New `prepare` job** (`runs-on: arc-runner-ue`, `needs: [guard, ...gates]`): under `flock /var/mnt/ramdisk/.prepare.lock`:
   - fetch/clone the mirror to `/var/mnt/ramdisk/repo.git` and ensure the **run's explicit commit SHA** is present (pin it for the run's lifetime — not a branch ref). This is the **external game repo** (Forgejo LFS), so `prepare` carries the GH/Forgejo creds — builders do not:
     ```bash
     git clone --mirror <url> /var/mnt/ramdisk/repo.git   # first run only; else: git -C repo.git fetch --all
     git -C /var/mnt/ramdisk/repo.git lfs fetch --all     # populate repo.git/lfs ONCE (mirror does NOT fetch LFS)
     ```
   - **(Windows only)** pack the populated repo into a read-only disk image for the VM (written here, while the VM is off; attached RO at `win_vm_boot`):
     ```bash
     # size for git objects + LFS + headroom; counts against the node RAM budget (WS-2)
     truncate -s <SIZE> /var/mnt/ramdisk/repo.img
     mkfs.ext4 -F /var/mnt/ramdisk/repo.img            # or mkfs.vfat/ntfs per guest preference
     mnt=$(mktemp -d); mount -o loop /var/mnt/ramdisk/repo.img "$mnt"
     cp -a /var/mnt/ramdisk/repo.git "$mnt"/ && umount "$mnt"   # image is now self-contained; never mounted RW again this run
     ```
   - `docker pull` the engine once into the shared dind;
   - **pre-flight free-space check:** fail fast if `image + mirror + N×scratch_estimate > free tmpfs`;
   - **GC:** remove prior runs' `/var/mnt/ramdisk/*-scratch` and `docker image prune` dangling layers — but **only while holding the lock and with no other build running** (guard against pruning a concurrent build's base; design §4).
2. **`server_build` / `game_build_linux`:** add `needs: prepare`.
3. **Path namespacing (B1/B3):** replace every `/tmp/game-clone`, `/tmp/game-project`, `/tmp/ue5-build-output` with `/var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>/...`. The `docker run -v` bind sources (currently `-v /tmp/game-project:/project`, `-v /tmp/ue5-build-output:/output`) must point at these shared-tmpfs paths so they resolve inside the shared dind. Each Linux tree clones from the mirror at the pinned SHA and reads LFS from the **shared** store (no creds, no pull):
   ```bash
   git clone --local --shared /var/mnt/ramdisk/repo.git <ns>/work
   git -C <ns>/work checkout <PINNED_SHA>
   git -C <ns>/work config lfs.storage /var/mnt/ramdisk/repo.git/lfs
   git -C <ns>/work lfs checkout         # smudge from shared blobs; never `lfs pull`
   ```
   This replaces the current per-run `git clone --depth 1` + `git lfs pull` (which re-downloaded the art every build).
4. **Remove the per-build prune (B2):** delete `docker system prune -f` from the `Cleanup` steps (lines ~658, ~965). Replace with `rm -rf /var/mnt/ramdisk/${GITHUB_RUN_ID}-<job>` only. Centralized prune lives in `prepare` (step 1).
5. **Alternate-loss tolerance (§4):** on an `object ... not found` git error, re-run `prepare` and re-clone once before failing.

> These edits are coupled to step 3's runner rework — they only work once `DOCKER_HOST` is the shared socket and `/var/mnt/ramdisk` is mounted in the runner. Never merge them ahead of the runner rework, or the next UE build breaks immediately (a reusable workflow goes live at the merged ref).

## Rollback (reverse order; each surface independently revertible)

- **Windows RO repo disk:** stop the VM; remove the RO `disk` volume from `vm-windows-builder.yaml`; the VM boots as before. Clean, per-VM, fully reversible — **no `kubevirt/cr/kubevirt.yaml` change to revert** (no feature gate was ever added). `repo.img` is volatile tmpfs (vanishes on its own).
- **Concurrency:** set `maxRunners: 1` (instant mitigation for any RAM/etcd pressure — do this FIRST in any incident, before deeper rollback).
- **Workflow:** revert the `ci-unreal-build.yml` WS-1 commit. Because it's coupled to the runner rework, revert it together with the next item.
- **Runner rework:** restore `values-ue.yaml` to the `dev` baseline (`2df4b35`: per-pod dind sidecar, `dind-storage` RAM 64Gi, `DOCKER_HOST=tcp://localhost:2376`, `maxRunners: 1`); bump restart-trigger.
- **Shared dind + tmpfs:** remove `shared-dind-daemonset.yaml` and `ue-ramdisk-tmpfs-alert.yaml` from `kustomization.yaml`; Argo prune deletes the DaemonSet; the tmpfs disappears with its pod (volatile by design — no data to preserve).
- **End state of full rollback = the current safe interim:** `maxRunners: 1`, per-pod RAM dind. Known-good.

## Incident quick-reference

| Symptom | First action |
|---|---|
| `UERamdiskNearFull` / `UENodeMemoryLow` firing | `maxRunners: 1`, kill running UE build |
| etcd/Argo/Kyverno flapping during a build (#12987) | `maxRunners: 1` immediately; then investigate tmpfs/scratch peak |
| Builds fail `permission denied` on docker socket | check `/var/mnt/ramdisk/docker.sock` group = 1000 (WS-3 chgrp watcher) |
| Second concurrent build re-pulls 40 GB / ENOSPC | confirm WS-1 prune removal landed; a stray `docker system prune` is wiping the shared image |
| `object not found` mid-build | tmpfs/dind was wiped under a `--shared` clone; re-run `prepare` (alternate-loss tolerance) |
| Windows job reads stale/empty repo | `repo.img` not packed before boot; confirm `prepare → win_vm_boot` ordering and that the RO disk attached |
