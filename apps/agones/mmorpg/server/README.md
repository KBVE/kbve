# mmorpg-server

Dedicated server for `apps/arcade/mmorpg`. Headless bevy + avian3d for the
simulation, lightyear for replication over a WebSocket, Agones for the
lifecycle.

## Shape

Three things share the process:

- **the sim** — owns the main thread, because bevy's `ScheduleRunnerPlugin`
  blocks. 30 Hz fixed tick, kinematic character bodies, server-authoritative
  movement.
- **the HTTP door** (`/healthz`, `POST /token`) — on a tokio runtime with two
  worker threads, so a slow request cannot stall a tick.
- **Agones** — `Ready()` once, then a health ping every two seconds. Absent
  sidecar is a warning, not a failure, so `cargo run` works on a laptop.

## Joining

A browser cannot put an `Authorization` header on a WebSocket, so admission
happens over HTTP first:

```
POST /token            { "jwt": "<supabase access token>" }   # or no body
 ->  { "token": "<base64 ConnectToken>", "server_url": "wss://...",
       "name": "guest-4f2a91", "guest": true }
```

The identity travels **inside** the token, in netcode's `user_data`, which the
token's signature covers. A client cannot rename itself, there is no
per-connection state to keep, and a token minted before a rolling update is
still good against the pod that comes after it.

- **no token** → a guest: `guest-<6 chars>`, nothing persisted.
- **a valid token** → the `kbve_username` from its claims.
- **a bad token** → refused. Not demoted to a guest: a player whose session
  expired should be told, not handed a stranger's nameplate.

## Running it locally

```bash
cargo run -p mmorpg-server
# then point a client at it
MMORPG_SERVER=http://127.0.0.1:7961/token moon run mmorpg:run
```

`GAME_PRIVATE_KEY` unset means the all-zero development key, which anyone
reading the source can forge. The server says so in the log on startup; in the
cluster the Fleet supplies it from the `mmorpg-netcode` secret.

| variable | default | what it does |
| --- | --- | --- |
| `MMORPG_GAME_ADDR` | `0.0.0.0:7960` | the WebSocket the game speaks |
| `MMORPG_HTTP_ADDR` | `0.0.0.0:7961` | `/healthz` and `/token` |
| `MMORPG_PUBLIC_WS_URL` | derived from the bind address | what the token tells a browser to open |
| `SUPABASE_URL` | unset | unset means guests only — it does not fail open |
| `GAME_PRIVATE_KEY` | the all-zero dev key | signs and checks `ConnectToken`s |

## In the cluster

`apps/kube/agones/mmorpg/manifests` — a Fleet of one, reached through the Cilium
gateway at `mmorpg.kbve.com` (`/ws` to 7960, `/token` and `/healthz` to 7961).
One always-on server rather than an allocation per player: a public playtest
wants everyone in the same world.

The namespace is listed in `apps/kube/agones/values.yaml`, which is
load-bearing — a fleet in a namespace the chart does not know about never gets a
pod, and the GameServer respawns into `Error` every 30 seconds instead.
