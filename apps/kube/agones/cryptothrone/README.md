# cryptothrone Agones game server

Agones `Fleet` + autoscaler for `cryptothrone-server` (the simgrid grid sim),
plus the create-only `GameServerAllocation` RBAC the web tier (`axum-cryptothrone`,
`POST /api/join`) uses to allocate a server.

## Browser WSS edge — two connection models

CryptoThrone runs a **shared persistent world**, not per-match instances. That
changes how the browser reaches a GameServer:

- **Agones-native (per-match):** `/api/join` returns `nodeIP:dynamicPort` over
  plain TCP. A browser can't open `wss://` to a raw dynamic node port (no TLS,
  no hostname). Fine for native clients, not browsers.
- **Shared-world (what CryptoThrone needs):** front the Fleet pods with a stable
  `wss://` hostname. `game-service.yaml` is the in-cluster Service
  (`cryptothrone-game:7979`, `sessionAffinity: ClientIP`) selecting the Fleet's
  `app: cryptothrone-server` pods. The browser connects to
  `wss://game.cryptothrone.com/ws`; the gateway terminates TLS and proxies the
  WS upgrade to container port 7979.

### Remaining wiring (needs cluster validation — not committed)

1. **Pin the Fleet to one world.** A Service round-robins; with multiple Ready
   pods players land on _different_ worlds. For a single shared world set the
   autoscaler `minReplicas: maxReplicas: 1` (or a static Fleet `replicas: 1`).
   Grow to sharded worlds later with a per-world Service + hostname.
2. **Gateway listener + cert.** Add a `game.cryptothrone.com` listener to the
   Cilium `kbve-gateway` (in the `kbve` namespace) with a cert-manager
   `Certificate` (mirror `apps/kube/cryptothrone/manifest/certificate.yaml`), then
   an `HTTPRoute` `game.cryptothrone.com → cryptothrone-game:7979`. Cilium/Envoy
   proxies the WS upgrade on a normal HTTPRoute.
    - ⚠ New public hostnames on the Cilium gateway VIP (.71) have returned
      522/526 from Cloudflare; ingress-nginx (.74) works. Validate which path the
      game hostname should take before relying on it.
    - ⚠ Don't split apex/sub across listeners sharing one SAN cert — Cilium
      derives Envoy SNI from cert SANs, not `listener.hostname`, and duplicate
      filter chains fall through to 404 while reporting Programmed.

The Service here is the safe, validated piece. The gateway/cert/Fleet-pin steps
need a cluster pass.

## Wire format

The server speaks **both** postcard (binary) and JSON over the same `/ws` —
browser/TS clients send JSON text frames, native clients send postcard binary;
the server replies in whichever format the client used. See
`packages/rust/simgrid/src/net.rs`.
