# cryptothrone — Kubernetes Deployment

Single-Deployment axum service serving `cryptothrone.com`. Routes through the Cilium `kbve-gateway` in the `kbve` namespace via an `HTTPRoute`. Wired with a SecretStore + ExternalSecret pulling Supabase credentials from the kilobase namespace, ready for the planned KBVE / Supabase integration.

## Manifests

| File                                        | Purpose                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `application.yaml`                          | ArgoCD `Application` pointing at `apps/kube/cryptothrone/manifest`                              |
| `manifest/kustomization.yaml`               | Kustomize index                                                                                 |
| `manifest/cryptothrone-serviceaccount.yaml` | `cryptothrone-external-secrets` (used by ExternalSecrets) + `cryptothrone-sa` (used by the pod) |
| `manifest/cryptothrone-externalsecret.yaml` | SecretStore + ExternalSecret rendering `supabase-shared` from kilobase                          |
| `manifest/cryptothrone-deployment.yaml`     | `cryptothrone-deployment` (axum) + `cryptothrone-service` (ClusterIP)                           |
| `manifest/httproute.yaml`                   | HTTPRoute attaching the service to `kbve-gateway` for `cryptothrone.com`                        |
| `manifest/certificate.yaml`                 | cert-manager `Certificate` minting `cryptothrone-tls` via the `letsencrypt-http` ClusterIssuer  |
| `manifest/reference-grant.yaml`             | Lets `kbve-gateway` (in `kbve`) read the `cryptothrone-tls` Secret across namespaces            |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001` (matches the binary owner set by `--chown=10001:10001` in `apps/cryptothrone/axum-cryptothrone/Dockerfile`)
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated `cryptothrone-sa` ServiceAccount with `automountServiceAccountToken: false` at both the SA and pod level. The pod no longer rides on the `default` SA.
- CPU/memory `requests` and `limits` set so the kubelet enforces a cgroup; bursts cap at `2 CPU / 512 MiB`.

## Reloader integration

The Deployment carries `reloader.stakater.com/auto: "true"`. Once `supabase-shared` is rendered by the ExternalSecret, Reloader will roll the workload whenever that Secret rotates. The Deployment references it via `envFrom: secretRef.optional: true`, so the pod still boots cleanly during the gap before the Secret materialises.

## TLS

The `Certificate` resource in `certificate.yaml` mints `cryptothrone-tls` for `cryptothrone.com` via the cluster's `letsencrypt-http` ClusterIssuer, and `reference-grant.yaml` lets `kbve-gateway` read the Secret across namespaces. The previous setup relied on cert-manager's ingress-shim seeing a `cert-manager.io/cluster-issuer` annotation on `cryptothrone-ingress.yaml`, but that file was never listed in `kustomization.yaml` so the Ingress never reached the cluster and no Certificate resource was ever created. The result was a `cryptothrone-tls` Secret stranded at 62 days old with no renewal path. `cryptothrone-ingress.yaml` has been removed; the explicit Certificate + ReferenceGrant pair (mirroring `apps/kube/chuckrpg/manifest/certificate.yaml` and the herbmail equivalent) is the single source of truth.

## Cross-namespace RBAC

The ExternalSecret in this namespace authenticates as `cryptothrone-external-secrets` to the kilobase namespace's source secrets. That requires `cryptothrone-external-secrets` to appear in the `kilobase-secrets-reader-for-discord` RoleBinding subjects list in `apps/kube/kilobase/manifests/cross-namespace-rbac.yaml` (same list that already includes `memes-external-secrets`, `rentearth-external-secrets`, etc.). Until that line lands, the ExternalSecret will fail to render `supabase-shared`; the Deployment's `envFrom` is `optional: true` so the pod keeps running, just without the Supabase env block.

## ArgoCD

- App: `cryptothrone` (source: `apps/kube/cryptothrone/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
