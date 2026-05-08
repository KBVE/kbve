# kasm — Kubernetes Deployment

Browser-based Discord workspace running inside a [KASM](https://kasmweb.com) container. All egress from the workspace exits through a [Gluetun](https://github.com/qdm12/gluetun) WireGuard tunnel — the workspace shares Gluetun's network namespace, so it has no direct internet path. If Gluetun drops, traffic stops instead of leaking through the cluster's public IP.

## Manifests

| File                                 | Purpose                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `application.yaml`                   | ArgoCD `Application` pointing at `apps/kube/kasm/manifest`; ignores `spec.replicas` so manual scale-ups don't drift |
| `manifest/namespace.yaml`            | `kasm` namespace                                                                                                    |
| `manifest/serviceaccount.yaml`       | `kasm-sa` (used by the pod)                                                                                         |
| `manifest/deployment.yaml`           | `kasm-vpn` Deployment (gluetun + workspace + init) and `kasm-vpn-service`                                           |
| `manifest/pvc.yaml`                  | 5Gi Longhorn PVC for `/home/kasm-user` (Discord browser profile)                                                    |
| `manifest/sealed-vpn-wireguard.yaml` | SealedSecret holding the WireGuard provider, type, and keys                                                         |
| `manifest/network-policy.yaml`       | CiliumNetworkPolicy locking egress to the VPN tunnel                                                                |

## Topology

| Container       | Image                                  | Role                                                  |
| --------------- | -------------------------------------- | ----------------------------------------------------- |
| `fix-pvc-perms` | `busybox:1.37` (init)                  | `chown -R 1000:1000 /home/kasm-user`                  |
| `gluetun`       | `ghcr.io/qdm12/gluetun:v3.41.1`        | WireGuard tunnel + kill-switch + HTTP proxy on `8000` |
| `workspace`     | `kasmweb/discord:1.18.0-rolling-daily` | KASM browser desktop on `6901` (shares gluetun netns) |

`replicas: 0` by default. Scale to `1` manually when the workspace is needed; ArgoCD's `ignoreDifferences` on `/spec/replicas` keeps the manual scale-up from reverting.

## Hardening

The Deployment runs under per-container security profiles tuned for the role of each container:

### Pod-level

- `fsGroup: 1000` — PVC files end up group-writable for `kasm-user`
- `seccompProfile: RuntimeDefault` — applied to every container in the pod
- Pod-level `runAsNonRoot` is intentionally **not** set, because the init container needs to chown the PVC as root. Per-container UIDs are pinned individually instead.

### `fix-pvc-perms` (init)

- `runAsUser: 0` (must be root for `chown -R`); `runAsNonRoot: false`
- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: true` (busybox `chown` doesn't write to `/`)
- Capabilities: drop `ALL`; add only `CHOWN`, `DAC_OVERRIDE`, `FOWNER`

### `gluetun`

- Runs as the image default (root) — gluetun manages the network namespace shared with the workspace, so pinning `runAsNonRoot` would break the WireGuard handshake
- `allowPrivilegeEscalation: false`
- Capabilities: drop `ALL`; add only `NET_ADMIN` (required for the tun device + iptables kill-switch)

### `workspace`

- `runAsNonRoot: true`, UID/GID `1000` (matches the `kasm-user` account baked into KASM workspace images)
- `allowPrivilegeEscalation: false`
- Capabilities: drop `ALL`
- `readOnlyRootFilesystem` is **deliberately not set** — the upstream image writes to `/tmp`, `/var`, and `/home/kasm-user/.cache` during boot. Flipping it on without staging the matched `emptyDir` mounts would crash-loop the pod. Tracked as a follow-up.

### Service account

- Dedicated `kasm-sa` with `automountServiceAccountToken: false` at both the SA and pod level. The pod does not call the kube API.

## Reloader integration

The Deployment carries `reloader.stakater.com/auto: "true"`. When the `vpn-wireguard` SealedSecret rotates (re-keying the WireGuard tunnel), Reloader rolls the Deployment automatically. If the manual scale is at `0` the annotation has no effect, by design.

## Known follow-ups

- **`VNC_PW` is plaintext** in `deployment.yaml` (`workspace.env.VNC_PW: changeme`). Move to a SealedSecret named `kasm-vnc-secret` with `kubeseal` and switch the env to `valueFrom.secretKeyRef` before scaling this Deployment > `0` for any non-throwaway use. Tracked here so anyone wiring up the workspace remembers to seal a real password first.
- **`readOnlyRootFilesystem` on the `workspace` container** — needs `emptyDir` mounts for `/tmp`, `/var/cache`, and the relevant subpaths under `/home/kasm-user`, plus a live-test cycle.
- **Gluetun non-root** — the upstream image supports `PUID`/`PGID` env vars; investigating whether running gluetun as a non-zero UID with `NET_ADMIN` still completes the WireGuard handshake under the cluster's CNI is worth a follow-up.

## Egress lockdown

The cluster's CiliumNetworkPolicy in `network-policy.yaml` restricts egress from any pod with `app: kasm-vpn` to:

- kube-dns (UDP/TCP 53)
- in-cluster RFC1918 ranges (so the pod can reach the gluetun-managed tunnel itself)

External traffic only leaves the cluster through the WireGuard tunnel inside Gluetun. If the tunnel drops, gluetun's iptables kill-switch and Cilium policy together stop traffic instead of falling back to the node's IP.

## ArgoCD

- App: `kasm` (source: `apps/kube/kasm/manifest`)
- Sync: automated with prune + selfHeal; `spec.replicas` ignored so manual scale-ups don't drift
- Managed by `kube-root` app-of-apps
