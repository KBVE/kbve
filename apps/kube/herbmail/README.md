# herbmail — Kubernetes Deployment

Single-Deployment axum service serving `herbmail.com` and `www.herbmail.com`. Routes through the Cilium `kbve-gateway` in the `kbve` namespace via an `HTTPRoute`. Reads `supabase-shared` Secret rendered locally by an ExternalSecret pulling from the kilobase namespace.

## Manifests

| File                                    | Purpose                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `application.yaml`                      | ArgoCD `Application` pointing at `apps/kube/herbmail/manifest`                             |
| `manifest/kustomization.yaml`           | Kustomize index                                                                            |
| `manifest/herbmail-serviceaccount.yaml` | `herbmail-external-secrets` (used by ExternalSecrets) + `herbmail-sa` (used by the pod)    |
| `manifest/herbmail-externalsecret.yaml` | SecretStore + ExternalSecret rendering `supabase-shared` from kilobase                     |
| `manifest/herbmail-deployment.yaml`     | `herbmail-deployment` (axum) + `herbmail-service` (ClusterIP)                              |
| `manifest/httproute.yaml`               | HTTPRoute attaching the service to `kbve-gateway` for `herbmail.com` / `www.herbmail.com`  |
| `manifest/certificate.yaml`             | cert-manager `Certificate` minting `herbmail-tls` via the `letsencrypt-http` ClusterIssuer |
| `manifest/reference-grant.yaml`         | Lets `kbve-gateway` (in `kbve`) read the `herbmail-tls` Secret living in this namespace    |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001` (matches the binary owner set by `--chown=10001:10001` in `apps/herbmail/axum-herbmail/Dockerfile`)
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated `herbmail-sa` ServiceAccount carries `automountServiceAccountToken: false`; the pod spec re-states the field so any future template binding the SA inherits the safe default. The pod does not call the kube API.
- CPU/memory `requests` and `limits` set so the kubelet enforces a cgroup; bursts cap at `2 CPU / 1 GiB`.

## Reloader integration

The Deployment carries `reloader.stakater.com/auto: "true"`. Stakater Reloader rolls the workload whenever `supabase-shared` rotates — the ExternalSecret refreshes that Secret hourly from the kilobase JWT/db source, so any Supabase rotation now propagates without a manual `kubectl rollout restart`.

## TLS

The `Certificate` resource in `certificate.yaml` mints `herbmail-tls` for both `herbmail.com` and `www.herbmail.com` via the cluster's `letsencrypt-http` ClusterIssuer, and `reference-grant.yaml` lets `kbve-gateway` read the Secret across namespaces. The previous setup relied on cert-manager's ingress-shim seeing a `cert-manager.io/cluster-issuer` annotation on `nginx-ingress.yaml`, but that file was never listed in `kustomization.yaml`, so the Ingress never reached the cluster and no Certificate resource was ever created. The result was a `herbmail-tls` Secret stranded at 79 days old with no renewal path. `nginx-ingress.yaml` has been removed; the explicit Certificate + ReferenceGrant pair (mirroring `apps/kube/chuckrpg/manifest/certificate.yaml`) is the single source of truth.

## ArgoCD

- App: `herbmail` (source: `apps/kube/herbmail/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
