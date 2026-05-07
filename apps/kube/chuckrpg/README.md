# ChuckRPG — Kubernetes Deployment

## Domain Architecture

| Domain              | Purpose                        | Proxy             | TLS                            |
| ------------------- | ------------------------------ | ----------------- | ------------------------------ |
| `chuckrpg.com`      | Astro frontend (axum-chuckrpg) | Cloudflare        | Let's Encrypt via cert-manager |
| `api.chuckrpg.com`  | ROWS API (OWS backend)         | Cloudflare        | Let's Encrypt via cert-manager |
| `game.chuckrpg.com` | Agones game servers (UE5 UDP)  | Direct (no proxy) | N/A — UDP only                 |

## Networking

### HTTP/HTTPS (Cilium Gateway API)

`chuckrpg.com` and `api.chuckrpg.com` route through the shared Cilium gateway (`kbve-gateway` in the `kbve` namespace). Cloudflare terminates public TLS on the edge; the origin uses cert-manager certs for Full/Strict SSL mode.

- HTTPRoutes: `chuckrpg-routes`, `chuckrpg-api-routes`
- Certificates: `chuckrpg-tls`, `chuckrpg-api-tls` (issued by `letsencrypt-http` ClusterIssuer)
- ACME challenges work because Cloudflare proxies HTTP traffic to the gateway

### Game Server (Agones UDP)

`game.chuckrpg.com` points directly to the Agones node IP. Game traffic is UDP on dynamic ports assigned by Agones — it does NOT go through the Cilium gateway or any HTTP/HTTPS listener.

- No TLS certificate needed (UDP, not HTTPS)
- No HTTPRoute (not HTTP traffic)
- Fleet: `ows-hubworld` in `arc-runners` namespace
- Server binary: auto-detected from `ows-server-build` PVC

### WebTransport (wt.kbve.com)

The isometric game client uses WebTransport (QUIC/UDP) on `wt.kbve.com:5001`. This has its own dedicated LoadBalancer (`kbve-wt-lb`) and self-signed cert rotation CronJob — separate from the Cilium gateway.

## Manifests

| File                   | Resources                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `namespace.yaml`       | `chuckrpg` namespace                                                                    |
| `serviceaccount.yaml`  | `chuckrpg` ServiceAccount (no token automount — pod does not call the kube API)         |
| `configmap.yaml`       | `chuckrpg-config` — runtime env (HTTP_HOST/PORT/RUST_LOG) plus future integration stubs |
| `deployment.yaml`      | `chuckrpg-deployment` (axum-chuckrpg) and `chuckrpg-service` (ClusterIP)                |
| `httproute.yaml`       | HTTPRoutes for `chuckrpg.com` and `api.chuckrpg.com`                                    |
| `certificate.yaml`     | TLS certs for `chuckrpg.com` and `api.chuckrpg.com`                                     |
| `reference-grant.yaml` | Allows `kbve-gateway` to reference certs in `chuckrpg` namespace                        |

## Hardening

The Deployment runs under a restricted PodSecurity profile:

- `runAsNonRoot: true`, UID/GID `10001` (matches the binary owner set in the Dockerfile)
- `readOnlyRootFilesystem: true` with a 64Mi `emptyDir` mounted at `/tmp` for scratch
- `allowPrivilegeEscalation: false`, all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- Dedicated ServiceAccount with `automountServiceAccountToken: false` at both the SA and pod spec — the axum binary does not need to talk to the kube API
- CPU/memory `requests` and `limits` set on the container so the kubelet enforces a cgroup; bursts cap at 500m / 256Mi

## Runtime configuration & secret rotation

Runtime env lives in `chuckrpg-config` (ConfigMap) — never in the Deployment spec. CI/CD only bumps the image tag; config edits are a separate flow that does not touch the image.

The Deployment carries `reloader.stakater.com/auto: "true"`, so any change to `chuckrpg-config` (or the optional `chuckrpg-secrets` once it exists) triggers a rolling restart automatically. `chuckrpg-secrets` is referenced with `optional: true` so the pod boots fine before any SealedSecret is added.

### Adding the secret store later

1. Generate a SealedSecret named `chuckrpg-secrets` in the `chuckrpg` namespace (use the bitnami sealed-secrets controller; see `apps/kube/redis/manifests/redis-auth-sealedsecret.yaml` for the structure).
2. Commit it to `apps/kube/chuckrpg/manifest/`.
3. ArgoCD syncs it; Reloader detects the new Secret reference and rolls the Deployment.

### Future integrations (kube-DNS targets)

In-cluster service URLs are pre-wired as commented entries in `configmap.yaml`. Uncomment + populate when each upstream is ready:

- `POSTGREST_URL` — `http://supabase-postgrest.kilobase.svc.cluster.local:3000`
- `SUPABASE_FUNCTIONS_URL` — `http://supabase-edge-functions.kilobase.svc.cluster.local:9000`
- `DATABASE_HOST` — `supabase-cluster-rw.kilobase.svc.cluster.local`
- Discord webhook URL/token belong in the SealedSecret, not the ConfigMap

A CiliumNetworkPolicy permitting egress from `chuckrpg` to `kilobase` should land alongside the first integration that actually needs cross-namespace traffic.

## ArgoCD

- App: `chuckrpg` (source: `apps/kube/chuckrpg/manifest`)
- Sync: automated with prune
- Managed by `kube-root` app-of-apps
