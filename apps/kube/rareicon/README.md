# RareIcon — Kubernetes Deployment

## Domain Architecture

| Domain             | Purpose                        | Proxy      | TLS                            |
| ------------------ | ------------------------------ | ---------- | ------------------------------ |
| `rareicon.com`     | Astro frontend (axum-rareicon) | Cloudflare | Let's Encrypt via cert-manager |
| `api.rareicon.com` | RareIcon API                   | Cloudflare | Let's Encrypt via cert-manager |

## Networking

### HTTP/HTTPS (Cilium Gateway API)

`rareicon.com` and `api.rareicon.com` route through the shared Cilium gateway (`kbve-gateway` in the `kbve` namespace). Cloudflare terminates public TLS on the edge; the origin uses cert-manager certs for Full/Strict SSL mode.

- HTTPRoutes: `rareicon-routes`, `rareicon-api-routes`
- Certificates: `rareicon-tls`, `rareicon-api-tls` (issued by `letsencrypt-http` ClusterIssuer)
- ACME challenges work because Cloudflare proxies HTTP traffic to the gateway

### Ingress fallback (ingress-nginx)

`rareicon-ingress.yaml` mirrors the `rareicon-routes` HTTPRoute on ingress-nginx. Until DNS is fully cut over to the Cilium gateway, the Ingress is what serves `rareicon.com` from the nginx LoadBalancer.

## Manifests

| File                    | Resources                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `namespace.yaml`        | `rareicon` namespace                                             |
| `deployment.yaml`       | `rareicon-deployment` + `rareicon-service` (axum-rareicon)       |
| `httproute.yaml`        | HTTPRoutes for `rareicon.com` and `api.rareicon.com`             |
| `certificate.yaml`      | TLS certs for `rareicon.com` and `api.rareicon.com`              |
| `reference-grant.yaml`  | Allows `kbve-gateway` to reference certs in `rareicon` namespace |
| `rareicon-ingress.yaml` | ingress-nginx fallback for `rareicon.com`                        |

## ArgoCD

- App: `rareicon` (source: `apps/kube/rareicon/manifest`)
- Sync: automated with prune
- Managed by `kube-root` app-of-apps
