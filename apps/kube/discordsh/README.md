# discordsh — Kubernetes Deployment

Discord-side surface for the KBVE world. Two StatefulSets run side by side:

- `discordsh` — the axum web service (`ghcr.io/kbve/discordsh`) that serves the Astro frontend on port 4321.
- `discordsh-bot` — the Rust Discord bot (`ghcr.io/kbve/discordsh-bot`) that listens on port 4322 for health and pulls its `DISCORD_TOKEN` at runtime from Supabase Vault using the namespace-scoped service-role key.

Both share the same `discordsh-config` ConfigMap, `discordsh-redis-secret`, and `discordsh-supabase-shared` Secret, and reach Redis (`redis-master.redis.svc.cluster.local:6379`), the IRC bridge (`ergo-irc-service.irc.svc.cluster.local:6667`), and Supabase Kong (`kong.kilobase.svc.cluster.local:8000`) over in-cluster DNS.

## Manifests

| File                                     | Purpose                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `application.yaml`                       | ArgoCD `Application` pointing at `apps/kube/discordsh/manifest`                                                         |
| `manifest/namespace.yaml`                | `discordsh` namespace                                                                                                   |
| `manifest/configmap.yaml`                | `discordsh-config` runtime configuration                                                                                |
| `manifest/discordsh-externalsecret.yaml` | ExternalSecret pulling Redis / Supabase credentials into the namespace                                                  |
| `manifest/deployment.yaml`               | `discordsh` StatefulSet (axum web) + headless Service                                                                   |
| `manifest/discordsh-bot-deployment.yaml` | `discordsh-bot` StatefulSet (Rust bot) + headless Service                                                               |
| `manifest/discordsh-service.yaml`        | ClusterIP Service for the axum web                                                                                      |
| `manifest/httproute.yaml`                | Gateway API HTTPRoute                                                                                                   |
| `manifest/ingress.yaml`                  | Ingress for the public hostname                                                                                         |
| `manifest/rbac.yaml`                     | `discordsh-sa` (pod SA) + cross-namespace Roles/Bindings for `discordsh-external-secrets` SA + Redis-side NetworkPolicy |

## Hardening

Both StatefulSets and their containers now run under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001` (matches the binary owner set by `--chown=10001:10001` in `apps/discordsh/axum-discordsh/Dockerfile` and `apps/discordsh/discordsh-bot/Dockerfile`)
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch (the axum binary and the bot's image-rendering paths both stage to `/tmp`)
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- `discordsh-sa` ServiceAccount carries `automountServiceAccountToken: false`; both pod specs re-state the same so any future template binding the SA inherits the safe default (the pods do not call the kube API)
- CPU/memory `requests` and `limits` set on every container so the kubelet enforces a cgroup; bursts cap at `500m / 512Mi`

## Reloader integration

Both StatefulSets carry `reloader.stakater.com/auto: "true"`. Stakater Reloader watches the workload-level annotation and rolls the StatefulSet whenever any referenced ConfigMap or Secret changes. The covered surface includes:

- `discordsh-config` (envFrom on both)
- `discordsh-redis-secret` (envFrom on both)
- `discordsh-supabase-shared` (envFrom + `secretKeyRef` on both for the Supabase service-role key)

The bot resolves `DISCORD_TOKEN` at runtime from Supabase Vault, so it does not need a Secret reference for that token specifically — but a rotation of the service-role key (which authenticates the Vault read) still rolls the bot, which is the desired behavior.

## ArgoCD

- App: `discordsh` (source: `apps/kube/discordsh/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
