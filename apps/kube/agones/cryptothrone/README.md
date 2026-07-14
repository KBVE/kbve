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

### Wired here

- **Fleet pinned to one world** — autoscaler `minReplicas: maxReplicas: 1`, so
  exactly one Ready server backs `cryptothrone-game`. (A Service round-robins;
  multiple Ready pods would split players across separate worlds.) Image pinned
  to `:0.0.2` (the published tag; post-publish never synced it because the
  Docker Hub leg failed — see project memory).
- **Service + cert + HTTPRoute** — `game-service.yaml` (`cryptothrone-game:7979`,
  sessionAffinity ClientIP), `game-certificate.yaml` (`game.cryptothrone.com`),
  `game-httproute.yaml` (`game.cryptothrone.com → cryptothrone-game:7979` on
  `kbve-gateway`). The client connects to `wss://game.cryptothrone.com/ws`
  (`PUBLIC_CT_GAME_WS` overrides for local dev).

### Remaining cluster step

The Cilium `kbve-gateway` (in the `kbve` namespace) needs a **listener that
accepts `game.cryptothrone.com`** and references the `cryptothrone-game-tls`
secret. If the gateway already has a `*.cryptothrone.com` wildcard listener this
is automatic; otherwise add the listener.

- ⚠ New public hostnames on the Cilium gateway VIP (.71) have returned 522/526
  from Cloudflare; ingress-nginx (.74) works. Validate which path the game
  hostname takes before relying on it.
- ⚠ Don't split apex/sub across listeners sharing one SAN cert — Cilium derives
  Envoy SNI from cert SANs, not `listener.hostname`; duplicate filter chains fall
  through to 404 while reporting Programmed.

## Wire format

The server speaks **both** postcard (binary) and JSON over the same `/ws` —
browser/TS clients send JSON text frames, native clients send postcard binary;
the server replies in whichever format the client used. See
`packages/rust/simgrid/src/net.rs`.
