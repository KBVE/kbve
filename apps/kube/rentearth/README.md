# rentearth — Kubernetes Deployment

Single-Deployment service serving `rentearth.com`. Bridges the Astro frontend, Supabase backend, and the in-cluster Ergo IRC service. Routes through both the Cilium `kbve-gateway` (HTTPRoute) and the legacy nginx Ingress for `letsencrypt-http` cert minting.

## Manifests

| File                                     | Purpose                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `application.yaml`                       | ArgoCD `Application` pointing at `apps/kube/rentearth/manifest`                                     |
| `manifest/kustomization.yaml`            | Kustomize index                                                                                     |
| `manifest/rentearth-serviceaccount.yaml` | `rentearth-external-secrets` (used by ExternalSecrets) + `rentearth-sa` (used by the pod)           |
| `manifest/rentearth-externalsecret.yaml` | SecretStore + ExternalSecret rendering `supabase-shared` from kilobase                              |
| `manifest/rentearth-deployment.yaml`     | `rentearth-deployment` + `rentearth-service` (ClusterIP)                                            |
| `manifest/httproute.yaml`                | HTTPRoute attaching the service to `kbve-gateway`                                                   |
| `manifest/nginx-ingress.yaml`            | Legacy nginx Ingress — kept active because cert-manager's ingress-shim mints the TLS Secret from it |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001`. The upstream `ghcr.io/kbve/rentearth:1.0.18` image was built without an explicit `USER` directive (binary owned by root), but the binary itself is world-executable and self-contained, so an arbitrary non-root UID works. Verified locally that the image starts cleanly under `--user 10001:10001 --read-only --tmpfs /tmp:size=64M` (it parses env and proceeds to runtime — only fails on missing required Supabase env, which is post-startup).
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated `rentearth-sa` ServiceAccount with `automountServiceAccountToken: false` at both the SA and pod level. The pod no longer rides on the `default` SA. The existing `rentearth-external-secrets` SA is unchanged — it is the credential ExternalSecrets uses to read source secrets out of `kilobase` and is not the pod SA.
- CPU/memory `requests` and `limits` set so the kubelet enforces a cgroup; bursts cap at `2 CPU / 1 GiB`.

## Reloader integration

The Deployment carries `reloader.stakater.com/auto: "true"`. Stakater Reloader rolls the workload whenever `supabase-shared` rotates — the ExternalSecret refreshes that Secret hourly from the kilobase JWT/db source. The pod template also keeps a static `rollout-restart` annotation so a manual rollout can still be forced by bumping the timestamp if Reloader ever misses an event.

## TLS

cert-manager mints the TLS Secret via the active `nginx-ingress.yaml` (annotated with `cert-manager.io/cluster-issuer: letsencrypt-http`); the Ingress is in the kustomization so the ingress-shim sees it and creates the `Certificate` automatically. No explicit `Certificate` resource is required for this namespace today.

## ArgoCD

- App: `rentearth` (source: `apps/kube/rentearth/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
