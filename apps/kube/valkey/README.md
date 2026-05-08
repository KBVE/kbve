# valkey — Kubernetes Deployment

Secondary key-value store alongside Redis. Backed by the official `valkey-io/valkey-helm` chart (not Bitnami), in `standalone` shape (one master, no replicas) with persistence on Longhorn.

## Manifests

| File                                      | Purpose                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `application.yaml`                        | ArgoCD `Application` — multi-source: chart + `values.yaml` + sealed-secret manifest dir         |
| `manifests/values.yaml`                   | Helm values overlay: auth, persistence, metrics, Reloader annotation                            |
| `manifests/valkey-auth-sealedsecret.yaml` | SealedSecret holding the auth password, referenced by `auth.usersExistingSecret`                |
| `manifests/kustomization.yaml`            | Lists the SealedSecret as a kustomize resource so ArgoCD picks it up alongside the chart render |

## Hardening

The valkey-helm chart at `0.9.4` ships hardened pod defaults — none of these are overridden in our values.yaml, they flow from the chart:

- `runAsNonRoot: true`, UID/GID `1000`, `fsGroup: 1000`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault` (added in chart 0.9.4)
- `automountServiceAccountToken: false` on the rendered pod spec
- CPU/memory `requests` and `limits` set on the master container so the kubelet enforces a cgroup; bursts cap at `500m / 512Mi`

## Reloader integration

`workloadAnnotations.reloader.stakater.com/auto: "true"` lands the annotation on the rendered Deployment metadata — the surface Stakater Reloader watches by default. When `valkey-auth` rotates, the master pod rolls automatically. Verified via `helm template` against chart 0.9.4 that the annotation appears under `Deployment.metadata.annotations`, not just the pod template.

## Chart version policy

Pinned to `0.9.4` (Valkey app `9.0.2`). Bumped from `0.9.3` to pick up the new `workloadAnnotations` field plus the `seccompProfile` and `allowPrivilegeEscalation` defaults. Selector labels are identical between 0.9.3 and 0.9.4 (verified via `helm template` diff), so no immutability conflict on upgrade.

## ArgoCD

- App: `valkey` (multi-source — chart + this repo's `values.yaml` + manifest dir)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
