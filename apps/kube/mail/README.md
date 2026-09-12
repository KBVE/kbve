# mail — Kubernetes Deployment

The successor to [`herbmail`](../herbmail/README.md). Same axum API surface (`/mail/*` plus the Stalwart ingest hook), without the bundled Astro site, and with a real CORS allowlist instead of `CorsLayer::permissive()`.

**Nothing here takes herbmail down.** There is deliberately no `HTTPRoute` and no `Certificate`: `herbmail.com` keeps resolving to `herbmail-service`, and this Deployment is reachable only in-cluster at `mail-service.mail.svc.cluster.local:5600`. The cutover is a later, separate change that flips the existing route's `backendRef`.

## Manifests

| File                                | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `application.yaml`                  | ArgoCD `Application` pointing at `apps/kube/mail/manifest`                        |
| `manifest/kustomization.yaml`       | Kustomize index                                                                  |
| `manifest/mail-serviceaccount.yaml` | `mail-external-secrets` (used by ExternalSecrets) + `mail-sa` (used by the pod)   |
| `manifest/mail-externalsecret.yaml` | SecretStore + ExternalSecret rendering `supabase-shared` from kilobase            |
| `manifest/mail-deployment.yaml`     | `mail-deployment` (axum, port 5600) + `mail-service` (ClusterIP)                  |
| `seal-stalwart-hook-secret.sh`      | Seals `stalwart-hook-secret` into **this** namespace                              |

## Enabling it

The Application is commented out in `apps/kube/kustomization.yaml` because no `ghcr.io/kbve/mail:<version>` image is published yet. Order of operations:

1. Release the crate so the image and tag exist (`services/mail/version.toml`, then the tag pipeline writes the pin into `mail-deployment.yaml` via `KUBE_DEPLOYMENT_YAMLS`).
2. Uncomment `- mail/application.yaml` in `apps/kube/kustomization.yaml`.
3. Run `./seal-stalwart-hook-secret.sh` and add the output to `manifest/kustomization.yaml`. SealedSecrets are scoped per namespace + name, so herbmail's existing blob **cannot** be reused here — it will not decrypt in the `mail` namespace. Until a secret exists, `/hooks/stalwart` answers 503 and the rest of the service runs fine.

## Cross-namespace RBAC

`mail-external-secrets` is a subject on the `kilobase-secrets-reader-for-discord` RoleBinding in `apps/kube/kilobase/manifests/cross-namespace-rbac.yaml`. Without that entry the ExternalSecret cannot read `supabase-jwt` and `supabase-shared` is never rendered, which shows up as every `/mail` route returning 401.

## Hardening

Matches herbmail: non-root (10001), read-only root filesystem, all capabilities dropped, `RuntimeDefault` seccomp, no service-account token mounted, `/tmp` as a 64Mi `emptyDir`.
