# n8n — Kubernetes Deployment

Workflow automation platform running in queue-based execution mode: a main `n8n` Deployment serves the UI / webhooks and produces jobs, and an `n8n-worker` Deployment consumes them. Both reuse the cluster Valkey (`valkey.valkey.svc.cluster.local:6379`, DB `2`, prefix `n8n-bull`) as the BullMQ queue and the shared Supabase Postgres (`supabase-cluster-rw.kilobase.svc.cluster.local`, `n8n` schema) for persistence.

## Manifests

| File                                  | Purpose                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `application.yaml`                    | ArgoCD `Application` pointing at `apps/kube/n8n/manifest`                                                     |
| `manifest/n8n-deployment.yaml`        | Main `n8n` Deployment — UI + webhook receiver + kbve-gate + task-runner sidecar                               |
| `manifest/n8n-worker-deployment.yaml` | `n8n-worker` Deployment — pulls queue jobs from Valkey + task-runner sidecar                                  |
| `manifest/n8n-service.yaml`           | ClusterIP Service exposing 5678 / metrics                                                                     |
| `manifest/n8n-httproute.yaml`         | Gateway API HTTPRoute for `n8n.kbve.com`                                                                      |
| `manifest/rbac.yaml`                  | `n8n-sa` ServiceAccount + cross-namespace Roles/Bindings (kilobase + rabbitmq-system)                         |
| `manifest/n8n-pdb.yaml`               | PodDisruptionBudgets for `n8n` and `n8n-worker` (both `maxUnavailable: 1`)                                    |
| `manifest/n8n-keda.yaml`              | KEDA scaler for the worker Deployment based on Valkey queue depth                                             |
| `manifest/n8n-servicemonitor.yaml`    | Prometheus ServiceMonitor                                                                                     |
| `manifest/n8n-*-sealedsecret.yaml`    | SealedSecrets: `n8n-encryption-secret`, `n8n-license-secret`, `n8n-runner-auth`, `n8n-basic-auth`, `n8n-hmac` |
| `manifest/n8n-externalsecret.yaml`    | ExternalSecrets: supabase DB password, gate JWT, rabbitmq + supabase workflow credentials                     |

## Secrets

| k8s Secret                 | Source                                                   | Consumed by                                      |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `n8n-supabase-shared`      | ExternalSecret ← `supabase-postgres`                     | DB password (`secretKeyRef`) on both Deployments |
| `n8n-gate-supabase-jwt`    | ExternalSecret ← `supabase-jwt`                          | kbve-gate sidecar (JWT secret + anon key)        |
| `valkey-auth`              | cloned into ns by Kyverno                                | BullMQ queue password (`secretKeyRef`) + KEDA    |
| `n8n-rabbitmq-credentials` | ExternalSecret ← `rabbitmq-default-user`                 | Workflow RabbitMQ nodes (UI credential, below)   |
| `n8n-supabase-workflow`    | ExternalSecret ← `supabase-jwt` + `supabase-service-key` | Workflow Supabase / HTTP nodes (UI credential)   |

## Workflow credentials

`N8N_BLOCK_ENV_ACCESS_IN_NODE` is `true`, so workflows cannot read pod env via `$env`. Connection info for RabbitMQ and Supabase is surfaced as namespace Secrets; a staff member wires them once into the n8n credential store via the UI. Pull the values with:

```sh
kubectl get secret -n n8n n8n-rabbitmq-credentials -o jsonpath='{.data.amqp-url}'    | base64 -d
kubectl get secret -n n8n n8n-supabase-workflow    -o jsonpath='{.data.supabase-url}' | base64 -d
kubectl get secret -n n8n n8n-supabase-workflow    -o jsonpath='{.data.service-key}'  | base64 -d
```

- **RabbitMQ** node credential → use the `amqp-url` value (`amqp://<user>:<pass>@<host>:5672`). Broker reachable in-cluster at `rabbitmq.rabbitmq-system.svc.cluster.local:5672`.
- **Supabase / HTTP** node → base URL `supabase-url` (Kong, `http://kong.kilobase.svc.cluster.local:8000`), with `anon-key` or `service-key` as the bearer / `apikey` header depending on the call.

Cross-namespace reads are granted in `rbac.yaml`: `n8n-external-secrets` reads `supabase-*` in `kilobase` and `rabbitmq-default-user` in `rabbitmq-system`.

## Hardening

Both Deployments and the task-runner sidecars now run under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `1000` (matches the `node` user baked into the upstream `n8nio/n8n` and `n8nio/runners` images)
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- `n8n-sa` ServiceAccount carries `automountServiceAccountToken: false`; both pod specs re-state the same so any future template binding `n8n-sa` inherits the safe default
- CPU/memory `requests` and `limits` set on every container so the kubelet enforces a cgroup; main container limits at `8Gi / 4 CPU`, worker at `4Gi / 2 CPU`, runners at `1Gi / 1 CPU`

`readOnlyRootFilesystem` is **deliberately not set** in this iteration. The upstream n8n image writes to `/home/node/.n8n` at boot (license file, default settings) and `/tmp` (binary data staging) even when the database lives externally; flipping this on without first staging matched `emptyDir` mounts would crash-loop the Deployment. Tracked as a follow-up.

## Reloader integration

Both Deployments carry `reloader.stakater.com/auto: "true"`. Stakater Reloader watches the workload-level annotation and rolls the Deployment when any referenced Secret or ConfigMap changes. The covered surface includes:

- `discordsh-n8n-hmac` (envFrom)
- `n8n-supabase-shared` (DB password via `secretKeyRef`)
- `valkey-auth` (BullMQ queue password)
- `n8n-encryption-secret` (n8n's at-rest encryption key)
- `n8n-license-secret` (license activation key)
- `n8n-runner-auth` (broker auth between n8n and the task runner)

Before this annotation, rotating any of these required a manual `kubectl rollout restart`.

## Out of scope (intentionally deferred)

- **`readOnlyRootFilesystem`** — needs `emptyDir` for `/home/node/.n8n` and `/tmp` plus a live test cycle to confirm n8n still boots and the runner sidecar can launch isolated processes.
- **`external-secrets.io/v1` migration** — every ExternalSecret/SecretStore here is still on the deprecated `v1beta1`. Bumping belongs with the repo-wide migration (issue #13121), not piecemeal in this dir.
- **CiliumNetworkPolicy** — migrating cross-namespace policy to CNP belongs with the wider Cilium Phase 2 work, not bundled here.

## ArgoCD

- App: `n8n` (source: `apps/kube/n8n/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
