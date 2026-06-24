# WS-4 — Decision Record: how to provision `/var/mnt/ramdisk` on Talos

**Companion to:** `2026-06-24-ue-ramdisk-shared-build-design.md` (§2.1)
**Status:** Decision record — **recommendation only; requires cluster validation.** Cannot be spiked from a worktree (no `talosctl`/cluster access). The spec's §2.1 *preference* for a machine-config mount is **reversed here** with rationale.
**Decision:** Provision the tmpfs with a **privileged DaemonSet** that mounts `tmpfs` into the host mount namespace. Treat the Talos machine-config route as the thing to *retire to* later, only if a future Talos version exposes a clean host-tmpfs primitive.

## Context

`/var/mnt/ramdisk` must be a real on-host tmpfs that ordinary pods consume via `hostPath` and that KubeVirt exports via virtio-fs. It must exist **before** the shared-dind DaemonSet and the reworked runner pods start, or their `hostPath` mounts bind an empty/absent dir → broken builds + Argo selfHeal retry loop.

Node: single Talos node (`talos-worker.yaml`, `ghcr.io/siderolabs/kubelet:v1.32.1`, installer `v1.8.0`). Talos is immutable — no host shell, no `fstab`, no `systemd` units.

## Options considered

### Option A — privileged DaemonSet (CHOSEN)
A one-pod DaemonSet (single node) runs an init that enters the host mount namespace and mounts a sized tmpfs:

```
nsenter --mount=/proc/1/ns/mnt -- \
  sh -c 'mountpoint -q /var/mnt/ramdisk || \
         (mkdir -p /var/mnt/ramdisk && \
          mount -t tmpfs -o size=<CEILING>,mode=1777 tmpfs /var/mnt/ramdisk)'
```
then sleeps. Requires `hostPID: true`, `securityContext.privileged: true`, host mount-ns access.

- **Pro:** works on any Talos version; the `size=` ceiling (WS-2 gate) is set in plain pod spec; idempotent; observable via `kubectl`.
- **Pro:** the dind DaemonSet (already privileged, already hostPath) can *be* this — fold the tmpfs mount into the dind init container so there is one privileged workload, not two. (Recommended: avoids a second privileged pod, which is what the spec wanted to avoid.)
- **Con:** privileged + host mount-ns is a real attack surface on the control-plane node. Scope it tightly (dedicated ns/SA, no extra caps beyond what the mount needs) and document it in the security section of the runbook.
- **Con:** a tmpfs mounted from a pod is **not** re-created automatically on node reboot until the DaemonSet pod is rescheduled and runs its init — acceptable because the spec already treats the tmpfs as volatile cache repopulated by `prepare`.

### Option B — Talos `machine.config` mount (the spec's stated preference) — REJECTED for now
There is no documented Talos v1.8 primitive that mounts an arbitrary **host** tmpfs at `/var/mnt/ramdisk` visible to pod `hostPath`:
- `machine.kubelet.extraMounts` injects mounts into the **kubelet container**, not the host namespace other pods share.
- `machine.disks` / user volumes target **block devices**, not tmpfs.
- `machine.files` writes files, not mounts.

So the machine-config route is, at best, version-dependent and unproven, and at worst impossible on v1.8 — exactly the "may prove impractical → DaemonSet fallback" the spec hedged on. Choosing A up front avoids burning a risky machine-config apply (a bad machine config on the **single control-plane node bricks the cluster — no failover**) on an approach that may not exist.

## Risks specific to the single control-plane node

- **Brick risk (Option B):** any machine-config apply to the sole control-plane node is high-stakes; prefer not to touch it for this feature. Option A needs **no** machine-config change.
- **RAM accounting:** tmpfs pages count against node RAM; the `size=` ceiling must equal the WS-2 proven budget, never larger. Enforced in the DaemonSet's mount options.

## Validation checklist (must run on-cluster before relying on this)
1. Apply Option A DaemonSet; `kubectl exec` in and confirm `mount | grep /var/mnt/ramdisk` shows `tmpfs size=<CEILING>`.
2. From a throwaway hostPath pod, write/read a file under `/var/mnt/ramdisk` — confirms other pods see the same mount.
3. Confirm a `hostPath` PV over `/var/mnt/ramdisk/repo.git` binds and KubeVirt can consume it as a virtio-fs source.
4. Reboot drill (maintenance window): confirm the DaemonSet re-mounts on reschedule and `prepare` repopulates.
