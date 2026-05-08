# cityvote — Kubernetes Deployment

Single-Deployment service. No backend secrets — no ExternalSecret, no SealedSecret, no Reloader integration. Public traffic flows in via both the Cilium `kbve-gateway` (HTTPRoute) and the legacy nginx Ingress (kept active so cert-manager's ingress-shim mints the TLS Secret).

## Manifests

| File                                    | Purpose                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `application.yaml`                      | ArgoCD `Application` pointing at `apps/kube/cityvote/manifest`                                      |
| `manifest/kustomization.yaml`           | Kustomize index                                                                                     |
| `manifest/cityvote-serviceaccount.yaml` | `cityvote-sa` (used by the pod)                                                                     |
| `manifest/cityvote-deployment.yaml`     | `cityvote-deployment` + `cityvote-service` (ClusterIP)                                              |
| `manifest/httproute.yaml`               | HTTPRoute attaching the service to `kbve-gateway`                                                   |
| `manifest/nginx-ingress.yaml`           | Legacy nginx Ingress — kept active because cert-manager's ingress-shim mints the TLS Secret from it |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001`. Verified locally that `ghcr.io/kbve/cityvote:1.0.3` starts cleanly under `--user 10001:10001 --read-only --tmpfs /tmp:size=64M` (process logs `HTTP/WS listening on http://0.0.0.0:4321`).
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated `cityvote-sa` ServiceAccount with `automountServiceAccountToken: false` at both the SA and pod level. The pod no longer rides on the `default` SA. The pod does not call the kube API, so the projected token is unused weight.
- CPU/memory `requests` and `limits` set so the kubelet enforces a cgroup; bursts cap at `200m / 256Mi`.

## Reloader integration

Not applicable — the Deployment has no Secret or ConfigMap references, so there is nothing for Reloader to watch. The pod template keeps a static `rollout-restart` annotation so a manual rollout can still be forced by bumping the timestamp if a redeploy is needed without changing the image tag.

## TLS

cert-manager mints the TLS Secret via the active `nginx-ingress.yaml` (annotated with `cert-manager.io/cluster-issuer: letsencrypt-http`); the Ingress is in the kustomization so the ingress-shim sees it and creates the `Certificate` automatically. No explicit `Certificate` resource is required for this namespace today.

## ArgoCD

- App: `cityvote` (source: `apps/kube/cityvote/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
