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

| File                   | Resources                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `namespace.yaml`       | `chuckrpg` namespace                                             |
| `deployment.yaml`      | `chuckrpg-deployment` (axum-chuckrpg)                            |
| `httproute.yaml`       | HTTPRoutes for `chuckrpg.com` and `api.chuckrpg.com`             |
| `certificate.yaml`     | TLS certs for `chuckrpg.com` and `api.chuckrpg.com`              |
| `reference-grant.yaml` | Allows `kbve-gateway` to reference certs in `chuckrpg` namespace |

## ArgoCD

- App: `chuckrpg` (source: `apps/kube/chuckrpg/manifest`)
- Sync: automated with prune
- Managed by `kube-root` app-of-apps
