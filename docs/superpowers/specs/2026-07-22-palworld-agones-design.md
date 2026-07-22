# Palworld Server + Agones SDK Integration — Design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Owner:** h0lybyte / kbve
**Issue:** kbve/kbve#14503

## Goal

Run a Palworld dedicated server inside the kbve Agones ecosystem with full 1:1 parity to the existing `apps/agones/factorio` setup: an Agones-managed `GameServer` composed of the upstream game container plus a Rust **relay sidecar** that drives Agones health/ready, streams gameops telemetry to ClickHouse, and bridges events to IRC.

Reference upstream: `thijsvanloef/palworld-server-docker`.
Reference internal pattern: `apps/agones/factorio` + `apps/kube/agones/factorio`.

## Non-Goals

- Bidirectional player chat over IRC (Palworld exposes no chat-read API — see Divergences).
- Extracting a shared `game-relay` crate (deferred; palworld gets its own bin copied from factorio).
- Autoscaling / Fleet / matchmaking (single `GameServer` first, matching factorio).

## Architecture

Two-container Agones `GameServer`, identical topology to factorio:

1. **`palworld`** — upstream `thijsvanloef/palworld-server-docker` image, thin-wrapped to add a preStop shim + `curl`/`jq`. Upstream entrypoint keeps handling env→config generation, RCON, REST API, and backups. Game process stays PID-managed by the upstream image.
2. **`palworld-relay`** — new Rust bin `agones-palworld-relay` (copied/adapted from `agones-factorio-relay`). Talks to the Agones HTTP SDK sidecar on `127.0.0.1:9358`, polls the Palworld REST API for telemetry, writes to ClickHouse `gameops`, and bridges to IRC.

The Agones SDK sidecar is injected by Agones. The relay POSTs `/health` and `/ready` to it; Agones itself never talks to the game directly.

### Project layout

```
apps/agones/palworld/
  Dockerfile            # FROM thijsvanloef/palworld-server-docker + prestop shim + curl/jq
  docker-compose.yml    # local dev
  project.json          # nx targets: container (local/production), e2e, test noop; tags scope:agones
  version.toml
  shim/
    agones-shim-prestop.sh   # graceful shutdown via REST /v1/api/shutdown
  e2e/                  # vitest, boots container, asserts REST /v1/api/info
  vitest.config.ts
  relay/
    Cargo.toml          # package agones-palworld-relay; deps mirror factorio relay
    Cargo.workspace.toml
    Dockerfile
    project.json
    version.toml
    src/
      main.rs           # orchestrator; tokio::select over task handles
      config.rs         # env parsing (Config::from_env)
      agones_health.rs  # probe REST /info → POST /health, then /ready after initial delay
      rest_client.rs    # Palworld REST client (info/metrics/players/announce/kick/shutdown)
      poller.rs         # poll /players + /metrics on interval → diff → GameEvents
      rcon_client.rs    # optional fallback probe + announce path
      rcon_pool.rs      # optional; kept for parity if RCON path used
      irc_bridge.rs     # one-way: GameEvents→IRC, IRC lines→REST /announce
      ch_writer.rs      # gameops ClickHouse writer
      event.rs          # GameEvent / IrcMessage enums
```

### Kubernetes layout

```
apps/kube/agones/palworld/
  namespace.yaml                    # palworld namespace
  gameserver.yaml                   # 2 containers: palworld + palworld-relay
  saves-pvc.yaml                    # persistent save data
  rcon-sealed-secret.yaml           # admin_password + rcon_password
  credentials-sealed-secret.yaml    # server_password (optional)
  clickhouse-externalsecret.yaml    # gameops CH creds
  application.yaml                  # ArgoCD Application
```

## Divergences from factorio (and why)

| factorio | palworld | reason |
|----------|----------|--------|
| `log_tail` tails `console.log` | `poller` polls REST `/players` + `/metrics` | Palworld emits no chat/event log |
| RCON text parsing | REST JSON | structured player/metric data, less brittle |
| Bidirectional IRC chat | one-way IRC (events out, announce in) | Palworld has no chat-read API |
| preStop rcon save + quit | preStop REST `/v1/api/shutdown` (graceful, saves) | REST is the Palworld-native graceful path |
| RCON = primary probe | REST `/info` = primary probe, RCON = optional fallback | REST richer + already required for telemetry |

## Components

### `rest_client.rs`
HTTP client (reqwest, rustls) for the Palworld REST API, basic-auth as `admin` with `ADMIN_PASSWORD`. Endpoints:
- `GET /v1/api/info` — server name, version (health probe target)
- `GET /v1/api/metrics` — fps, uptime, frametime, player count
- `GET /v1/api/players` — player list (name, playeruid, ping, level, location)
- `POST /v1/api/announce` — broadcast message (IRC→server path)
- `POST /v1/api/kick`, `POST /v1/api/shutdown` — control (shutdown used by preStop)

### `agones_health.rs`
Loop on `AGONES_HEALTH_INTERVAL_SECS`. Each tick: probe REST `/v1/api/info` (with timeout). On success POST `{}` to `{AGONES_SDK_HTTP}/health`; after `AGONES_INITIAL_READY_DELAY_SECS` has elapsed and once only, POST `/ready`. Skip heartbeat if probe fails (mirrors factorio rcon-gate logic). Disabled if `AGONES_SDK_HTTP` unset.

### `poller.rs`
Replaces `log_tail`. Polls `/players` + `/metrics` every interval; diffs the player set against previous snapshot to emit `player_join` / `player_leave`; emits `player_count` + `server_metrics` snapshots. Broadcasts `GameEvent`s over the same `broadcast::channel` topology factorio uses.

### `irc_bridge.rs`
Subscribes to `GameEvent`s → formats join/leave/count lines to IRC. Inbound IRC lines → `POST /v1/api/announce`. One-way for chat (no player-chat capture).

### `ch_writer.rs`
Same jedi `clickhouse` feature path as factorio. Writes to `gameops` database. Event rows: `player_join`, `player_leave`, `player_count`, `server_metrics` (fps, uptime, frametime), tagged with `server_id`.

### `main.rs`
`Config::from_env()`, then spawn: `poller`, `irc_bridge`, `ch_writer`, `agones_health` (+ optional `rcon` tasks). `tokio::select!` over handles + `ctrl_c`, matching factorio's orchestrator.

## Config (env)

Relay `Config::from_env`:
- `PALWORLD_REST_ADDR` (default `http://127.0.0.1:8212`)
- `PALWORLD_ADMIN_PASSWORD` (required — REST basic auth)
- `PALWORLD_RCON_ADDR` (default `127.0.0.1:25575`), `PALWORLD_RCON_PASSWORD` (optional fallback)
- `PALWORLD_SERVER_ID` (default `palworld-default`)
- `IRC_SERVER`, `IRC_PORT`, `IRC_USE_TLS`, `IRC_NICK` (default `palworld-bot`), `IRC_CHANNEL`, `IRC_PASSWORD`
- `CLICKHOUSE_URL/USER/PASSWORD/DATABASE` (database default `gameops`)
- `AGONES_SDK_HTTP` (`http://127.0.0.1:9358`), `AGONES_HEALTH_INTERVAL_SECS` (5), `AGONES_REST_PROBE_TIMEOUT_SECS` (2), `AGONES_INITIAL_READY_DELAY_SECS` (60)

Upstream image env (gameserver.yaml): `SERVER_NAME`, `ADMIN_PASSWORD` (from secret), `SERVER_PASSWORD` (from secret, optional), `PLAYERS`, `PORT=8211`, `RCON_ENABLED=true`, `RCON_PORT=25575`, `REST_API_ENABLED=true`, `REST_API_PORT=8212`, `PUID=1000`, `PGID=1000`, `BACKUP_ENABLED=true`, `MULTITHREADING=true`.

## Ports

| port | proto | purpose | exposure |
|------|-------|---------|----------|
| 8211 | UDP | game | Static hostPort (Agones) |
| 27015 | UDP | Steam query | container |
| 25575 | TCP | RCON | 127.0.0.1 only |
| 8212 | TCP | REST API | cluster-internal (relay uses 127.0.0.1) |
| 9358 | TCP | Agones HTTP SDK | injected sidecar, 127.0.0.1 |

## GameServer manifest

Mirror `apps/kube/agones/factorio/manifests/gameserver.yaml`:
- `health: { initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 5 }`
- `terminationGracePeriodSeconds: 120`
- securityContext runAsNonRoot / runAsUser 1000 / fsGroup 1000, seccomp RuntimeDefault
- volumes: `palworld-saves` PVC → `/palworld/Pal/Saved`, log/config emptyDirs as needed
- game container `preStop` exec → `/usr/local/bin/agones-shim-prestop`
- relay container: readOnlyRootFilesystem, drop ALL caps, small resources (50m/64Mi → 500m/256Mi)

## Data flow

```
Palworld REST (:8212) ──poll──> poller ──GameEvent──> ch_writer ──> ClickHouse gameops
                                        └──GameEvent──> irc_bridge ──> IRC
IRC line ──> irc_bridge ──> REST /v1/api/announce
agones_health ──probe /info──> POST /health (+ /ready once) ──> Agones SDK :9358
preStop ──> REST /v1/api/shutdown (graceful save)
```

## Testing

- **Relay unit tests:** REST response parsing (info/metrics/players), player-set diff → join/leave events, config env parsing.
- **e2e (vitest):** `container` target builds image; boot container, wait for REST `/v1/api/info` 200 (bounded retry loop), assert info + metrics shape. Mirror factorio e2e target structure.

## CI / publish

Two ghcr images, sentinel-versioned via `version.toml` (same as factorio):
- `ghcr.io/kbve/agones-palworld`
- `ghcr.io/kbve/agones-palworld-relay`

nx `container` target with `local`/`production` configurations + buildcache, `test` noop, `e2e` target. Tag `scope:agones`.

## Open items

- Confirm exact Palworld REST auth header format (basic `admin:ADMIN_PASSWORD`) against the running upstream image during implementation.
- Confirm save path (`/palworld/Pal/Saved`) for the pinned upstream image tag; pin `PALWORLD_VERSION`/image tag in Dockerfile ARG.
- Decide whether to keep the RCON fallback tasks or drop RCON entirely (REST-only) after e2e validation.
