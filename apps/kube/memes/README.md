# memes — Kubernetes Deployment

Single-Deployment axum service for the meme content surface. Routes through both the Cilium `kbve-gateway` (HTTPRoute) and the legacy nginx Ingress for `letsencrypt-http` cert minting.

## Manifests

| File                                 | Purpose                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `application.yaml`                   | ArgoCD `Application` pointing at `apps/kube/memes/manifest`                                      |
| `manifest/kustomization.yaml`        | Kustomize index                                                                                  |
| `manifest/memes-serviceaccount.yaml` | `memes-external-secrets` (used by ExternalSecrets) + `memes-sa` (used by the pod)                |
| `manifest/memes-externalsecret.yaml` | SecretStore + ExternalSecret rendering `supabase-shared` from kilobase                           |
| `manifest/memes-deployment.yaml`     | `memes-deployment` (axum) + `memes-service` (ClusterIP)                                          |
| `manifest/httproute.yaml`            | HTTPRoute attaching the service to `kbve-gateway`                                                |
| `manifest/nginx-ingress.yaml`        | Legacy nginx Ingress — kept active because cert-manager's ingress-shim mints `memes-tls` from it |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001` (matches the binary owner set by `--chown=10001:10001` in `apps/memes/axum-memes/Dockerfile`)
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated `memes-sa` ServiceAccount with `automountServiceAccountToken: false` at both the SA and pod level. The pod no longer rides on the `default` SA. The existing `memes-external-secrets` SA is unchanged — it is the credential ExternalSecrets uses to read source secrets out of `kilobase` and is not the pod SA.
- CPU/memory `requests` and `limits` set so the kubelet enforces a cgroup; bursts cap at `2 CPU / 1 GiB`.

## Reloader integration

The Deployment carries `reloader.stakater.com/auto: "true"`. Stakater Reloader rolls the workload whenever `supabase-shared` rotates — the ExternalSecret refreshes that Secret hourly from the kilobase JWT/db source. The pod template also keeps a static `rollout-restart` annotation so a manual rollout can still be forced by bumping the timestamp if Reloader ever misses an event.

## TLS

cert-manager mints `memes-tls` via the active `nginx-ingress.yaml` (annotated with `cert-manager.io/cluster-issuer: letsencrypt-http`); the Ingress is in the kustomization so the ingress-shim sees it and creates the `Certificate` automatically. No explicit `Certificate` resource is required for this namespace today, unlike chuckrpg / herbmail / cryptothrone where the Ingress was checked in but never listed in kustomization.

## ArgoCD

- App: `memes` (source: `apps/kube/memes/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
