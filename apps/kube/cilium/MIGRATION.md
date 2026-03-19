# Cilium Migration Plan

Phased migration from nginx ingress controller + MetalLB to Cilium.
Cluster: Talos Linux, Kubernetes 1.32.1, single /32 external IP (142.132.206.74), MetalLB L2.

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

- [ ] Confirm Talos version supports Cilium CNI swap (Talos 1.6+ has native Cilium support via machine config)
- [ ] Document current pod CIDR (10.244.0.0/16) and service CIDR (10.96.0.0/12)
- [ ] Snapshot current MetalLB IP assignments: `kubectl get svc -A -o wide | grep LoadBalancer`
- [ ] Back up all Ingress resources: `kubectl get ingress -A -o yaml > ingress-backup.yaml`
- [ ] Back up MetalLB config: `kubectl get ipaddresspool,l2advertisement -n metallb-system -o yaml`
- [ ] Verify cert-manager has no hard dependency on nginx (it doesn't — HTTP01 solver uses any ingress class)
- [ ] Create `apps/kube/cilium/` ArgoCD Application structure (this directory)

**Rollback plan:** Talos machine config can revert CNI. Keep flannel config in version control.

---

## Phase 1: Cilium as CNI (replace flannel)

**Goal:** Swap the CNI to Cilium. No ingress changes. nginx stays.

### Talos Machine Config Changes

Talos manages the CNI. To switch to Cilium:

```yaml
# talos machine config patch
cluster:
    network:
        cni:
            name: none # disable default flannel
    proxy:
        disabled: true # Cilium replaces kube-proxy
```

Then install Cilium via Helm:

```bash
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set ipam.mode=kubernetes \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<TALOS_API_IP> \
  --set k8sServicePort=6443 \
  --set hubble.enabled=true \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set operator.replicas=1
```

### ArgoCD Application

Create `apps/kube/cilium/application.yaml` to manage Cilium via ArgoCD (Helm source).

### Validation Checklist

- [ ] All pods in Running state after CNI swap
- [ ] CoreDNS resolving correctly
- [ ] Pod-to-pod connectivity across nodes
- [ ] Pod-to-service connectivity
- [ ] nginx ingress controller still functional (all 16 ingresses respond)
- [ ] Kong proxy still routing Supabase traffic
- [ ] WebSocket connections work (kbve.com/ws, chat.kbve.com, cityvote.com)
- [ ] WebTransport UDP path works (kbve-wt-lb on port 5001)
- [ ] IRC TCP stream proxies work (6667, 6697)
- [ ] MetalLB still assigning 142.132.206.74
- [ ] NetworkPolicies enforced (test RCON restriction, runner egress)
- [ ] Hubble UI accessible (port-forward hubble-ui)
- [ ] cert-manager renewals still work (check pending CertificateRequests)

### Risk

**High.** CNI swap causes brief network disruption. All pods lose networking during the transition and must re-establish connections. Schedule during maintenance window.

**Mitigation:** Talos supports `talosctl upgrade` with CNI changes applied atomically per node. Rolling node upgrades limit blast radius.

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
