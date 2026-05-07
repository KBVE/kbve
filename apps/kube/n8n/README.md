# n8n — Kubernetes Deployment

Workflow automation platform running in queue-based execution mode: a main `n8n` Deployment serves the UI / webhooks and produces jobs, and an `n8n-worker` Deployment consumes them. Both reuse the cluster Redis (`redis-master.redis.svc.cluster.local`) as the BullMQ queue and the shared Supabase Postgres (`supabase-cluster-rw.kilobase.svc.cluster.local`, `n8n` schema) for persistence.

## Manifests

| File                                  | Purpose                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `application.yaml`                    | ArgoCD `Application` pointing at `apps/kube/n8n/manifest`                                         |
| `manifest/n8n-deployment.yaml`        | Main `n8n` Deployment — UI + webhook receiver + task-runner sidecar                               |
| `manifest/n8n-worker-deployment.yaml` | `n8n-worker` Deployment — pulls queue jobs from Redis + task-runner sidecar                       |
| `manifest/n8n-service.yaml`           | ClusterIP Service exposing 5678 / metrics                                                         |
| `manifest/n8n-ingress.yaml`           | Ingress for `n8n.kbve.com`                                                                        |
| `manifest/httproute.yaml`             | Gateway API HTTPRoute (alternative path)                                                          |
| `manifest/rbac.yaml`                  | `n8n-sa` ServiceAccount + cross-namespace Roles/Bindings + Redis-side NetworkPolicy               |
| `manifest/n8n-pdb.yaml`               | PodDisruptionBudgets for `n8n` and `n8n-worker` (both `minAvailable: 1`)                          |
| `manifest/n8n-keda.yaml`              | KEDA scaler for the worker Deployment based on Redis queue depth                                  |
| `manifest/n8n-servicemonitor.yaml`    | Prometheus ServiceMonitor                                                                         |
| `manifest/n8n-*-sealedsecret.yaml`    | SealedSecrets: `n8n-encryption-secret`, `n8n-license-secret`, `n8n-runner-auth`, `n8n-basic-auth` |
| `manifest/n8n-externalsecret.yaml`    | ExternalSecret pulling `redis-auth` and `supabase-postgres` into the namespace                    |

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

- `n8n-redis-secret` (envFrom)
- `n8n-supabase-shared` (DB password via `secretKeyRef`)
- `n8n-encryption-secret` (n8n's at-rest encryption key)
- `n8n-license-secret` (license activation key)
- `n8n-runner-auth` (broker auth between n8n and the task runner)

Before this annotation, rotating any of these required a manual `kubectl rollout restart`.

## Out of scope (intentionally deferred)

- **`readOnlyRootFilesystem`** — needs `emptyDir` for `/home/node/.n8n` and `/tmp` plus a live test cycle to confirm n8n still boots and the runner sidecar can launch isolated processes.
- **PDB tuning** — both PDBs are `minAvailable: 1` against `replicas: 1`, which makes node drain block forever. Worth fixing alongside replica scale-out (worker is already KEDA-scaled, so the worker PDB should follow KEDA's min-replicas).
- **CiliumNetworkPolicy** — current cross-namespace policy is the legacy `networking.k8s.io/v1` `NetworkPolicy` in `rbac.yaml`. Migrating to CNP belongs with the wider Cilium Phase 2 work, not bundled here.

## ArgoCD

- App: `n8n` (source: `apps/kube/n8n/manifest`)
- Sync: automated with prune + selfHeal
- Managed by `kube-root` app-of-apps
