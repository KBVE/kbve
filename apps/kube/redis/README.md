# Redis — Kubernetes Deployment

Cluster-wide Redis for internal services (rate limiting, ephemeral state, queue brokering). Deployed via the Bitnami `redis` Helm chart in `standalone` architecture (one master, no replicas) with persistence on Longhorn.

## Manifests

| File                                     | Purpose                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `application.yaml`                       | ArgoCD `Application` — multi-source: Bitnami chart + `values.yaml` + sealed-secret manifest dir |
| `manifests/values.yaml`                  | Helm values overlay: architecture, auth, persistence, network policy, hardening annotations     |
| `manifests/redis-auth-sealedsecret.yaml` | SealedSecret holding the auth password, referenced by `auth.existingSecret`                     |
| `manifests/kustomization.yaml`           | Lists the SealedSecret as a kustomize resource so ArgoCD picks it up alongside the chart render |

## Hardening

The Bitnami chart already renders a hardened pod spec by default — this is intentional baseline, not custom configuration:

- `runAsNonRoot: true`, UID/GID `1001` (Bitnami convention)
- `readOnlyRootFilesystem: true` with chart-managed `emptyDir` mounts for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- `automountServiceAccountToken: false` (chart default at every level: SA, master pod, replica pod, metrics)
- CPU/memory `requests` and `limits` set on the master container so the kubelet enforces a cgroup; bursts cap at 500m / 512Mi

The chart-rendered NetworkPolicy (`networkPolicy.enabled: true`) restricts ingress to pods matching the chart's auth selector — combined with `allowExternal: true`, any pod in the cluster can reach Redis on 6379, but the namespace boundary is still enforced by the policy.

## Reloader integration

`commonAnnotations.reloader.stakater.com/auto: "true"` propagates to every chart resource, including the master StatefulSet itself. Stakater Reloader watches workload-level annotations (not just pod template), so this is the correct surface to ensure the controller sees changes. When `redis-auth` rotates, the master pod rolls automatically.

## Chart version policy

Pinned to `21.2.13` (Redis 8.0.3). Newer chart majors (22.x → 25.x) ship newer Redis app versions and have evolved alongside Bitnami's image-licensing changes; bumping past 21.x belongs in its own PR with image-pull and consumer-compatibility verification, not bundled with hardening.

## ArgoCD

- App: `redis` (multi-source — Bitnami chart + this repo's `values.yaml` + manifest dir)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
