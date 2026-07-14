# Cilium Migration Plan

Phased migration from nginx ingress controller + MetalLB to Cilium.
Cluster: Talos Linux, Kubernetes 1.33.2, dual /32 external IPs
(142.132.206.74 legacy + 142.132.206.71 Cilium gateway VIP).

## Status (2026-06-05)

| Phase   | Title                                         | State                                                           |
| ------- | --------------------------------------------- | --------------------------------------------------------------- |
| Phase 0 | Pre-migration prep                            | DONE                                                            |
| Phase 1 | Cilium as CNI + WireGuard                     | DONE (2026-03-19)                                               |
| Phase 2 | Replace ingress-nginx with Cilium Gateway API | DONE in PR #11551; residual cluster cleanup pending — see below |
| Phase 3 | WebTransport / QUIC validation                | Pending                                                         |
| Phase 4 | MetalLB replacement                           | N/A — MetalLB never adopted on this cluster after Phase 1       |
| Phase 5 | Gateway API modernization                     | DONE — all live routes are HTTPRoute via `kbve-gateway`         |

**Residual Phase 2 cleanup (operational, not repo):**

- Three stale Ingress objects (`bugwars/bugwars-ingress`,
  `restream/restreamer`, `staryo/staryo-ingress`) survive in the
  cluster only because nginx was still alive when they were created.
  They were never in the repo and now point at a dead VIP. Decide
  before purge: migrate to HTTPRoute or accept the apps going dark.
- The `kube-flannel` and `kube-proxy` DaemonSets are still in
  `kube-system` after they were temporarily enabled during the
  2026-06-06 lockout recovery (see Phase 6 below). Talos no longer
  manages them — they're orphan DaemonSets. Safe to delete once
  Cilium is fully stable.

---

## Phase 6: Operational invariants and recovery (2026-06-06 incident)

A multi-hour outage exposed a destructive interaction between
Cilium's eBPF service redirect and the node's primary host IP.
This section documents the failure mode and the procedure that
restored the cluster — required reading before any future
LB IPAM pool or kbve-gateway change.

### Hard invariant: node IP must never appear in a Cilium LB pool

`142.132.206.74` is the Talos node's primary host IP
(`machine.network.interfaces[0].addresses`). After PR #11551 removed
ingress-nginx and freed `.74` from the legacy MetalLB Service,
`CiliumLoadBalancerIPPool/public-ip-pool` still listed `.74/32` as
a block. Cilium LB IPAM allocated `.74` to the kbve-gateway Service.
Cilium 1.19's eBPF service-redirect program then intercepted **all**
TCP traffic to `.74` and silently blackholed every port outside the
Service's port list:

| Port  | Owner before       | Owner after Cilium claim | Result                    |
| ----- | ------------------ | ------------------------ | ------------------------- |
| 80    | (none)             | Cilium Envoy             | served                    |
| 443   | (none)             | Cilium Envoy             | served                    |
| 6443  | kube-apiserver     | (nothing, intercepted)   | external client times out |
| 50000 | apid (Talos API)   | (nothing, intercepted)   | external client times out |
| 22    | (no sshd on Talos) | (nothing, intercepted)   | external client times out |

External `kubectl` and `talosctl` both lock out. ArgoCD continues
running in-cluster (it reaches the apiserver via
`kubernetes.default.svc`, not the external `.74:6443`), but its pods
can't be re-scheduled if Cilium itself flaps.

**The fix is purely declarative:** PR #11811 dropped `.74` from
`CiliumLoadBalancerIPPool/public-ip-pool.spec.blocks` and from
`kbve-gateway.spec.infrastructure.annotations[io.cilium/lb-ipam-ips]`.
The node IP is permanently excluded from anything Cilium can claim.

### Cilium image cache corruption from rescue-mode disk surgery

The first recovery attempt edited Talos's persistent
`config.yaml` from Hetzner Rescue to switch CNI to flannel + add
`extraHostEntries` blocking `quay.io`, AND deleted Cilium image
config blobs from `/var/lib/containerd/io.containerd.content.v1.content/`.
The blob-delete left containerd's bolt metadata DB
(`io.containerd.metadata.v1.bolt/meta.db`) referencing missing
blobs. Subsequent image pulls failed with
`blob sha256:<digest> expected at <path>: blob not found`, and
re-pulling never refreshed the metadata. The pull error survived
multiple reboots and `talosctl image rm` operations.

**The fix:** wipe the entire containerd state on disk while leaving
etcd alone. `/var/lib/containerd/io.containerd.content.v1.content/blobs/sha256/*`
(content blobs), `/var/lib/containerd/io.containerd.metadata.v1.bolt/meta.db`
(bolt metadata), and the snapshotter trees are all safe to delete.
`/var/lib/etcd/` is on the same EPHEMERAL partition but is a separate
directory tree — leave it intact and the cluster state survives.

### Recovery runbook (lock-out from external clients)

If `.74:6443` and `.74:50000` both time out from the laptop while
ICMP ping to `.74` works and `kbve.com` returns CF 5xx:

1. **Confirm Cilium hijack vs network outage.** ICMP responds but
   non-80/443 TCP times out = eBPF intercept. If even ICMP fails,
   the node is dead — Hetzner Robot, KVM console, hardware first.
2. **Stage the repo fix.** Open a PR shrinking
   `CiliumLoadBalancerIPPool.spec.blocks` to exclude the node IP
   and removing the node IP from any `io.cilium/lb-ipam-ips`
   annotations. Merge to `main`. This is the permanent fix —
   everything below is the way to get the cluster back to a state
   where ArgoCD can apply it.
3. **Hetzner Rescue, cycle 1.** Activate Rescue (Robot → Rescue
   tab → 64-bit Linux + SSH key), hardware reset, SSH in.
4. **Identify Talos partitions.** `lsblk -f` — STATE and EPHEMERAL
   labels move between `/dev/sda` and `/dev/sdb` depending on disk
   enumeration order. Always mount by label
   (`/dev/disk/by-label/STATE`, `/dev/disk/by-label/EPHEMERAL`).
5. **Wipe containerd state, NOT etcd.** Mount EPHEMERAL by label
   and delete:
    ```
    rm -rf /mnt/ephemeral/lib/containerd/io.containerd.content.v1.content/blobs/sha256/*
    rm -f /mnt/ephemeral/lib/containerd/io.containerd.metadata.v1.bolt/meta.db
    rm -rf /mnt/ephemeral/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/*
    rm -rf /mnt/ephemeral/lib/containerd/io.containerd.snapshotter.v1.native/snapshots/*
    ```
    Verify `/mnt/ephemeral/lib/etcd/member/` is untouched before
    unmount.
6. **Do NOT edit Talos `config.yaml` from rescue.** Disk-edits to
   the persistent machineconfig were the source of half the pain
   in this incident. If a Talos config change is needed, apply it
   via `talosctl patch machineconfig` AFTER the API is back —
   never from rescue.
7. **Reboot to Talos.** Robot → Rescue deactivate → hardware reset.
8. **Wait 5–10 minutes.** Containerd starts empty. Kubelet pulls
   every image from scratch. The Cilium agent re-installs from the
   corrected pool (already on `main` from step 2), claims only the
   non-node VIPs, and the node's host TCP stack reclaims `.74` for
   the apiserver and talosctl.
9. **Cleanup.** Once `kubectl` works again, force-delete pods stuck
   in `Unknown` (their replacements are already in
   `ContainerCreating`), and remove the legacy `kube-flannel` /
   `kube-proxy` DaemonSets if they were enabled during recovery.

### Talos disk layout note

`/dev/sda` and `/dev/sdb` swap between boots — Linux's disk
enumeration is not stable across the BIOS POST order, and the
Talos installer drive can appear as either depending on whether
Rescue mode was used last. Mount partitions by their persistent
label (xfs `LABEL=STATE`, `LABEL=EPHEMERAL`, `LABEL=BOOT`) via
`/dev/disk/by-label/<name>`, never by raw `/dev/sd*` path.

---

## Current State

| Component     | Version                 | Notes                                       |
| ------------- | ----------------------- | ------------------------------------------- |
| CNI           | Talos default (flannel) | Managed by Talos machine config             |
| Ingress       | ingress-nginx 4.13.0    | 2 replicas, LoadBalancer, MetalLB shared IP |
| Load Balancer | MetalLB (L2)            | Single IP pool: 142.132.206.74/32           |
| Cert Manager  | cert-manager            | LE HTTP01/DNS01 + internal CA               |
| API Gateway   | Kong                    | Supabase services (kilobase namespace)      |

### Ingress Inventory (16 resources)

| Host                           | Path                 | Backend              | Port     | Namespace       | Special                              |
| ------------------------------ | -------------------- | -------------------- | -------- | --------------- | ------------------------------------ |
| kbve.com                       | /                    | kbve-service         | 4321     | kbve            | rewrite-target                       |
| kbve.com                       | /ws                  | kbve-service         | 5000     | kbve            | WebSocket (3600s timeout, sticky IP) |
| argo.kbve.com                  | /                    | argocd-server        | 443      | argocd          | HTTPS backend                        |
| api.kbve.com                   | /                    | kong-kong-proxy      | 80       | kilobase        | CORS, large buffers                  |
| supabase.kbve.com              | /                    | kong-kong-proxy      | 80       | kilobase        | Same as api                          |
| n8n.kbve.com                   | /webhook, /rest, ... | n8n                  | 5678     | n8n             | Split auth (basic on root)           |
| mc.kbve.com                    | /                    | mc-service           | 8080     | mc              | 50m body                             |
| longhorn.kbve.com              | /                    | longhorn-frontend    | 80       | longhorn-system | 10GB body, 1800s timeout             |
| notification.kbve.com          | /                    | notification-bot     | 3000     | discord         |                                      |
| irc.kbve.com                   | /                    | irc-redirect-service | 80       | irc             | Redirect                             |
| chat.kbve.com                  | /                    | irc-gateway-service  | 4321     | irc             | WebSocket (3600s, sticky IP)         |
| discord.sh                     | /                    | discordsh-service    | 80       | discordsh       |                                      |
| meme.sh, www.meme.sh           | /                    | memes-service        | 4321     | memes           | CORS headers                         |
| cryptothrone.com               | /                    | cryptothrone-service | 4321     | cryptothrone    |                                      |
| cityvote.com                   | /                    | cityvote-service     | 4321     | cityvote        | WebSocket (3600s)                    |
| rentearth.com + subdomains     | /                    | multiple             | multiple | rentearth       | WebSocket, CORS, IRC                 |
| herbmail.com, www.herbmail.com | /                    | herbmail-service     | 4321     | herbmail        |                                      |

### TCP/UDP Stream Proxies (nginx)

| Port | Protocol | Backend                        | Status                         |
| ---- | -------- | ------------------------------ | ------------------------------ |
| 6667 | TCP      | irc/ergo-irc-service:6667      | Active                         |
| 6697 | TCP      | irc/ergo-irc-service:6697      | Active (TLS)                   |
| 5001 | UDP      | kbve/kbve-wt-lb (dedicated LB) | Moved out of nginx in PR #8299 |

### NetworkPolicies (4)

- `mc/mc-rcon-restrict` — RCON port locked to internal namespaces
- `arc-runners/arc-runner-egress` — GitHub runners outbound allowlist
- `kilobase/cronjob-egress-apiserver-only` — backup CronJobs restricted
- `crossplane-system/cronjob-egress-apiserver-only` — S3 healthcheck restricted

---

## Phase 0: Pre-Migration (no cluster changes)

**Goal:** Validate Cilium compatibility with Talos and establish rollback plan.

- [x] Confirm Talos version supports Cilium CNI swap — **Talos v1.8.0** (installer: `ghcr.io/siderolabs/installer:v1.8.0`), well above 1.6+ requirement
- [x] Document current pod CIDR (10.244.0.0/16) and service CIDR (10.96.0.0/12) — confirmed in `talos-worker.yaml`
- [x] KubePrism already enabled on port 7445 — no machine config change needed for this
- [x] WireGuard tools system extension already installed (`siderolabs/wireguard-tools`) — kernel module available
- [x] Infra-level WireGuard (wg0, port 51820, 10.0.0.0/24) already connects NUC workers to Hetzner control plane — Cilium WireGuard (port 51871) is a separate layer for pod traffic
- [ ] `cluster.proxy.disabled` is currently `false` — must flip to `true` during Phase 1 cutover
- [ ] Snapshot current MetalLB IP assignments: `kubectl get svc -A -o wide | grep LoadBalancer`
- [ ] Back up all Ingress resources: `kubectl get ingress -A -o yaml > ingress-backup.yaml`
- [ ] Back up MetalLB config: `kubectl get ipaddresspool,l2advertisement -n metallb-system -o yaml`
- [x] cert-manager check — `letsencrypt-dns` and `internal-ca-issuer` are nginx-independent. **However**, `letsencrypt-http` ClusterIssuer has `ingressClassName: nginx` hardcoded in all 5 HTTP01 solvers (kbve.com, discord.sh, herbmail.com, meme.sh, cryptothrone.com). Must update to `cilium` during Phase 2 ingress migration.
- [x] Create `apps/kube/cilium/` ArgoCD Application structure — `application.yaml`, `values.yaml`, `patches/`

**Rollback plan:** `patches/cilium-rollback.yaml` reverts to flannel + kube-proxy. Apply per-node via `talosctl patch machineconfig`, then remove Cilium ArgoCD Application.

---

## Phase 1: Cilium as CNI + WireGuard (replace flannel) — COMPLETED 2026-03-19

**Status:** COMPLETE. Cilium is the active CNI with kubeProxyReplacement and WireGuard encryption.

### Lessons Learned

1. **Do NOT set `kubeProxyReplacement: true` before the CNI swap.** Cilium and kube-proxy both try to bind the same health check NodePorts, causing cluster-wide DNS failures. Deploy Cilium with `kubeProxyReplacement: false` first, then flip to `true` at the same time as the Talos patch.
2. **Pin `kubelet.nodeIP.validSubnets` when adding secondary IPs.** Without this, kubelet advertises the secondary IP as InternalIP. The API server can't reach kubelet on the wrong IP, breaking logs/exec/port-forward and causing pods to get stuck in Pending/ContainerCreating.
3. **Cilium attaches eBPF programs to all interfaces even when flannel is the active CNI.** This can interfere with flannel's routing. The ideal sequence is: deploy Cilium → apply Talos CNI patch → restart all pods.
4. **Restart all pods after the CNI swap.** Existing pods keep stale flannel networking. A rolling restart of all deployments/statefulsets is required.

**Goal:** Swap the CNI to Cilium with WireGuard pod-to-pod encryption. No ingress changes. nginx stays.

Reference: https://docs.siderolabs.com/kubernetes-guides/cni/deploying-cilium

### Talos Machine Config Patch

```yaml
cluster:
    network:
        cni:
            name: none # disable default flannel
    proxy:
        disabled: true # Cilium replaces kube-proxy
machine:
    features:
        kubePrism:
            enabled: true # required — Cilium uses localhost:7445 for API access
            port: 7445
    sysctls:
        net.core.bpf_jit_enable: '1' # JIT for eBPF performance
```

Apply via: `talosctl gen config my-cluster https://<endpoint>:6443 --config-patch @cilium-patch.yaml`
Or patch existing: `talosctl patch machineconfig --patch @cilium-patch.yaml`

### Talos-Specific Gotchas

1. **No `SYS_MODULE` capability** — Talos does not allow loading kernel modules from workloads. The Helm values must explicitly set the security context capabilities without `SYS_MODULE`.
2. **KubePrism required** — Cilium connects to the API server via `localhost:7445` (KubePrism proxy), not the external control plane endpoint. This avoids a chicken-and-egg problem where Cilium needs networking to reach the API server.
3. **cgroup v2 mounts** — Talos uses cgroup v2. Cilium must not auto-mount; use the host path `/sys/fs/cgroup` instead.
4. **CoreDNS conflict** — `forwardKubeDNSToHost=true` (Talos default) combined with `bpf.masquerade=true` breaks CoreDNS. Set `forwardKubeDNSToHost=false` in machine config if enabling BPF masquerade.
5. **Pod Security** — Cilium agent requires privileged namespace. Apply `pod-security.kubernetes.io/enforce=privileged` label to `kube-system`.
6. **Inline manifests (recommended by Siderolabs for production)** — Template the Helm chart and embed the output in `cluster.inlineManifests` on control plane nodes only. Manifests deploy at bootstrap time before any other workloads. Use `talosctl upgrade-k8s` for updates (Talos never auto-deletes/updates inline manifests).

### Helm Values

```yaml
# apps/kube/cilium/values.yaml
ipam:
    mode: kubernetes

kubeProxyReplacement: true
k8sServiceHost: localhost # KubePrism
k8sServicePort: 7445 # KubePrism port

# Talos cgroup v2
cgroup:
    autoMount:
        enabled: false
    hostRoot: /sys/fs/cgroup

# Talos security — no SYS_MODULE
securityContext:
    capabilities:
        ciliumAgent:
            - CHOWN
            - KILL
            - NET_ADMIN
            - NET_RAW
            - IPC_LOCK
            - SYS_ADMIN
            - SYS_RESOURCE
            - DAC_OVERRIDE
            - FOWNER
            - SETGID
            - SETUID
        cleanCiliumState:
            - NET_ADMIN
            - SYS_ADMIN
            - SYS_RESOURCE

# WireGuard encryption (pod-to-pod + node-to-node)
encryption:
    enabled: true
    type: wireguard
    nodeEncryption: true # also encrypt node-to-node, pod-to-node traffic

# Observability
hubble:
    enabled: true
    relay:
        enabled: true
    ui:
        enabled: true

# Gateway API (prep for Phase 2/5)
gatewayAPI:
    enabled: true
    enableAlpn: true
    enableAppProtocol: true

operator:
    replicas: 1
```

### WireGuard Details

Cilium's WireGuard integration provides transparent encryption at the network layer with zero application changes.

- **Coverage (default):** Pod-to-pod traffic between Cilium-managed endpoints
- **Coverage (`nodeEncryption: true`):** Also encrypts node-to-node, pod-to-node, and node-to-pod traffic
- **Not encrypted:** Traffic within the same node (observable locally anyway)
- **Kernel requirement:** Linux 5.6+ with `CONFIG_WIREGUARD=m` (Talos kernel includes this)
- **Port:** UDP 51871 must be reachable between all cluster nodes
- **Key management:** Fully automatic — Cilium generates and rotates WireGuard keys per node, no manual key distribution
- **Performance:** Kernel-space WireGuard, no userspace overhead, minimal latency impact

**What this protects:**

- All east-west traffic between pods across nodes is encrypted — Supabase ↔ Kong, game server ↔ database, n8n ↔ APIs
- Node-to-node traffic (kubelet, etcd, control plane) when `nodeEncryption: true`
- Eliminates the need for application-level mTLS for internal service communication

**Limitations:**

- Control-plane nodes auto-opt-out of node encryption (label `node-role.kubernetes.io/control-plane`) to prevent bootstrap deadlock
- Packets may briefly drop during WireGuard device reconfiguration on endpoint/node updates
- All clusters in a Cluster Mesh must have WireGuard enabled (no mixed mode)

### Deployment Method

**Option A: Helm via ArgoCD (simpler, fits existing workflow)**

Create `apps/kube/cilium/application.yaml` pointing to the Cilium Helm chart with the values above. ArgoCD manages lifecycle. Easier to iterate during initial rollout.

**Option B: Inline manifests (recommended by Siderolabs for production)**

```bash
# Template the Helm chart
helm template cilium cilium/cilium \
  --version 1.18.0 \
  --namespace kube-system \
  -f values.yaml > cilium-manifests.yaml

# Embed in Talos machine config (control plane nodes only)
talosctl patch machineconfig --patch @inline-cilium-patch.yaml
```

Inline manifests deploy at bootstrap time before any workloads, avoiding the gap where pods have no CNI. However, updates require `talosctl upgrade-k8s` instead of `kubectl apply`.

**Recommendation:** Start with Option A (ArgoCD Helm) for easier iteration. Move to inline manifests once the config is battle-tested.

### Validation Checklist

- [ ] All pods in Running state after CNI swap
- [ ] `cilium status` shows all agents healthy
- [ ] CoreDNS resolving correctly (especially if `bpf.masquerade` enabled)
- [ ] Pod-to-pod connectivity across nodes
- [ ] Pod-to-service connectivity
- [ ] **WireGuard:** `cilium encrypt status` shows WireGuard interfaces up, keys established per node
- [ ] **WireGuard:** `hubble observe --namespace kbve` shows flows with encryption indicator
- [ ] **WireGuard:** UDP 51871 open between all nodes (`ss -ulnp | grep 51871`)
- [ ] **WireGuard:** `tcpdump -i eth0 -n udp port 51871` confirms encrypted traffic between nodes
- [ ] nginx ingress controller still functional (all 16 ingresses respond)
- [ ] Kong proxy still routing Supabase traffic
- [ ] WebSocket connections work (kbve.com/ws, chat.kbve.com, cityvote.com)
- [ ] WebTransport UDP path works (kbve-wt-lb on port 5001)
- [ ] IRC TCP stream proxies work (6667, 6697)
- [ ] MetalLB still assigning 142.132.206.74
- [ ] NetworkPolicies enforced (test RCON restriction, runner egress)
- [ ] Hubble UI accessible (`kubectl port-forward -n kube-system svc/hubble-ui 12000:80`)
- [ ] cert-manager renewals still work (check pending CertificateRequests)

### Risk

**High.** CNI swap causes brief network disruption. All pods lose networking during the transition and must re-establish connections. Schedule during maintenance window.

**Mitigation:** Talos supports `talosctl upgrade` with config changes applied atomically per node. Rolling node upgrades limit blast radius. If Cilium fails to start, revert machine config to re-enable flannel.

---

## Phase 2: Replace ingress-nginx with Cilium Ingress

**Goal:** Remove nginx ingress controller. Cilium handles L7 ingress via its Envoy-based proxy.

### Decision: Cilium Ingress vs Gateway API

|                  | Cilium Ingress Controller                                   | Cilium Gateway API                                              |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Resource model   | `networking.k8s.io/v1 Ingress` (same as now)                | `gateway.networking.k8s.io/v1 HTTPRoute`                        |
| Migration effort | Lower — reuse existing Ingress YAMLs with annotation tweaks | Higher — rewrite all 16 resources                               |
| Future-proof     | Ingress API is frozen (no new features)                     | Gateway API is the K8s standard going forward                   |
| Feature parity   | Covers all current annotations except nginx-specific ones   | Native support for traffic splitting, header modification, etc. |
| WebSocket        | Supported                                                   | Supported natively via `backendRef`                             |
| TCP/UDP routing  | Requires `CiliumEnvoyConfig` or `TCPRoute`                  | `TCPRoute` / `UDPRoute` (alpha)                                 |

**Recommendation:** Start with Cilium Ingress Controller (lower friction), then incrementally adopt Gateway API for new services. Rewrite existing Ingress resources to Gateway API as a follow-up.

### Annotation Translation (nginx → Cilium)

| nginx annotation                                      | Cilium equivalent                                      |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `nginx.ingress.kubernetes.io/rewrite-target: /`       | Cilium Ingress supports `rewrite-target` annotation    |
| `nginx.ingress.kubernetes.io/proxy-read-timeout`      | `ingress.cilium.io/proxy-read-timeout` or Envoy config |
| `nginx.ingress.kubernetes.io/proxy-body-size`         | `ingress.cilium.io/proxy-body-size`                    |
| `nginx.ingress.kubernetes.io/backend-protocol: HTTPS` | `ingress.cilium.io/backend-protocol: HTTPS`            |
| `nginx.ingress.kubernetes.io/upstream-hash-by`        | CiliumEnvoyConfig with consistent hashing              |
| `nginx.ingress.kubernetes.io/enable-cors`             | CiliumEnvoyConfig CORS filter                          |
| `nginx.ingress.kubernetes.io/auth-type: basic`        | CiliumEnvoyConfig ext_authz or basic_auth              |

### Migration Sequence

Migrate in priority order (most critical first, least traffic last):

**Wave 1 — Core services (validate basics)**

- [ ] kbve.com `/` → kbve-service:4321
- [ ] kbve.com `/ws` → kbve-service:5000 (WebSocket — critical validation)
- [ ] api.kbve.com → kong-kong-proxy:80 (Supabase API — high traffic)

**Wave 2 — Internal tools**

- [ ] argo.kbve.com → argocd-server:443 (HTTPS backend)
- [ ] n8n.kbve.com → n8n:5678 (split auth)
- [ ] longhorn.kbve.com → longhorn-frontend:80
- [ ] notification.kbve.com → notification-bot:3000

**Wave 3 — Secondary domains**

- [ ] meme.sh → memes-service:4321
- [ ] discord.sh → discordsh-service:80
- [ ] cryptothrone.com → cryptothrone-service:4321
- [ ] herbmail.com → herbmail-service:4321
- [ ] cityvote.com → cityvote-service:4321 (WebSocket)
- [ ] rentearth.com → multiple backends (WebSocket, CORS)

**Wave 4 — IRC + TCP stream**

- [ ] chat.kbve.com → irc-gateway-service:4321 (WebSocket)
- [ ] irc.kbve.com → irc-redirect-service:80
- [ ] TCP 6667/6697 → ergo-irc-service (requires `TCPRoute` or `CiliumEnvoyConfig`)

### Dual-Stack Transition

Run both ingress controllers simultaneously during migration:

1. Set Cilium ingress class to `cilium` (not `nginx`)
2. Migrate one Ingress at a time by changing `kubernetes.io/ingress.class: cilium`
3. Validate each service before proceeding
4. Once all 16 are on Cilium, remove nginx ArgoCD Application

### Validation Checklist (per wave)

- [ ] HTTP 200 on all migrated hostnames
- [ ] TLS certificates served correctly (cert-manager + Cilium integration)
- [ ] WebSocket upgrade succeeds where applicable
- [ ] CORS headers present on api.kbve.com / supabase.kbve.com
- [ ] Large uploads work on mc.kbve.com (50m) and longhorn.kbve.com (10GB)
- [ ] Basic auth works on n8n.kbve.com root
- [ ] No certificate renewal failures

---

## Phase 3: WebTransport / QUIC Validation

**Goal:** Confirm WebTransport works end-to-end with Cilium in the data path.

Even with the dedicated `kbve-wt-lb` LoadBalancer bypassing the ingress controller, Cilium as CNI sits in the packet path (eBPF programs on every node).

### Validation

- [ ] Client `new WebTransport("https://kbve.com:5001")` connects successfully
- [ ] QUIC handshake completes (check TLS cert digest matches)
- [ ] Game state replicates over WebTransport (lightyear entity sync)
- [ ] Long-lived connections survive (10+ minutes without timeout)
- [ ] Client network change (WiFi → cellular) reconnects via QUIC connection migration
- [ ] WebSocket fallback still works for Safari
- [ ] `hubble observe --namespace kbve --protocol UDP` shows QUIC flows

### Potential Cilium-Specific Issues

| Issue                                         | Symptom                            | Fix                                                                          |
| --------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| eBPF conntrack timeout too short for QUIC     | Connection drops after idle period | `bpf-ct-timeout-service-any` / `bpf-ct-timeout-service-udp` in Cilium config |
| NodePort SNAT masquerades source IP           | Session affinity breaks            | `externalTrafficPolicy: Local` on kbve-wt-lb (already set)                   |
| Cilium host-reachable services intercepts UDP | QUIC packets routed incorrectly    | Verify `enable-host-reachable-services` doesn't interfere                    |

---

## Phase 4: Evaluate MetalLB Replacement

**Goal:** Decide whether Cilium's LB IPAM + L2 announcements can replace MetalLB.

### Current MetalLB Setup

- Single IP pool: `142.132.206.74/32`
- L2 advertisement (ARP-based)
- `allow-shared-ip: shared-public-ip` for multi-service IP sharing

### Cilium LB IPAM Equivalent

```yaml
# CiliumLoadBalancerIPPool
apiVersion: cilium.io/v2alpha1
kind: CiliumLoadBalancerIPPool
metadata:
  name: public-ip-pool
spec:
  blocks:
    - cidr: 142.132.206.74/32

# CiliumL2AnnouncementPolicy
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata:
  name: default
spec:
  loadBalancerIPs: true
  interfaces:
    - ^eth[0-9]+    # adjust to match node interface
  nodeSelector:
    matchLabels: {}
```

### Decision Criteria

| Factor                   | MetalLB                      | Cilium LB IPAM                               |
| ------------------------ | ---------------------------- | -------------------------------------------- |
| L2 stability             | Stable (GA)                  | Beta (documented as such)                    |
| Shared IP                | `allow-shared-ip` annotation | `sharing-key` annotation on Service          |
| BGP support              | Full BGP with peers          | Cilium BGP Control Plane (beta)              |
| Operational overhead     | Separate DaemonSet           | Built into Cilium agent (one less component) |
| Mixed TCP/UDP on same IP | Supported via annotation     | Supported via `sharing-key`                  |

### Recommendation

- **If risk-averse:** Keep MetalLB during Phase 1-3. Replace only after Cilium L2 graduates to stable or after validating in a staging environment.
- **If consolidating:** Replace MetalLB in Phase 4 after all ingress migration is validated. One fewer component to maintain.

### Migration Steps (if proceeding)

- [ ] Install `CiliumLoadBalancerIPPool` with `142.132.206.74/32`
- [ ] Install `CiliumL2AnnouncementPolicy` matching node interfaces
- [ ] Enable `l2announcements.enabled=true` and `externalIPs.enabled=true` in Cilium Helm values
- [ ] Update `kbve-wt-lb` Service: replace `metallb.io/allow-shared-ip` with `lbipam.cilium.io/sharing-key`
- [ ] Cordon MetalLB: scale speaker DaemonSet to 0
- [ ] Verify external IP still assigned and reachable
- [ ] Remove MetalLB ArgoCD Application

---

## Phase 5: Gateway API Modernization (optional)

**Goal:** Rewrite Ingress resources to Gateway API for long-term maintainability.

This is optional and can happen incrementally. Gateway API provides:

- `HTTPRoute` for HTTP/HTTPS (replaces Ingress)
- `TCPRoute` for IRC ports (replaces nginx tcp ConfigMap)
- `UDPRoute` for future UDP services (alpha)
- `GRPCRoute` for gRPC services
- Traffic splitting, header modification, request mirroring

### Example: kbve.com HTTPRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
    name: kbve-routes
    namespace: kbve
spec:
    parentRefs:
        - name: cilium-gateway
          namespace: kube-system
    hostnames:
        - kbve.com
    rules:
        - matches:
              - path:
                    type: PathPrefix
                    value: /ws
          backendRefs:
              - name: kbve-service
                port: 5000
        - matches:
              - path:
                    type: PathPrefix
                    value: /
          backendRefs:
              - name: kbve-service
                port: 4321
```

---

## Timeline Estimate

| Phase   | Scope                       | Dependencies                  |
| ------- | --------------------------- | ----------------------------- |
| Phase 0 | Pre-migration prep          | None                          |
| Phase 1 | CNI swap to Cilium          | Phase 0, maintenance window   |
| Phase 2 | Ingress migration (4 waves) | Phase 1 stable for 1+ week    |
| Phase 3 | WebTransport validation     | Phase 1                       |
| Phase 4 | MetalLB evaluation          | Phase 2 complete              |
| Phase 5 | Gateway API rewrite         | Phase 2 complete, incremental |
