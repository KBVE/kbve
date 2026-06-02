# kasm-void

KASM workspace image that bundles the upstream `kasmweb/discord` install with
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a stealth Chromium
fork, plus a small CDP-backed URL launcher (`nav_shim.py`) on port 9998.
All three components auto-launch on session start and are individually
supervised — if any crashes or is closed it is respawned by the startup
loop.

Use case: run Discord inside the KASM session and screenshare the bundled
browser through Discord's video/stream feature; remote services drive page
navigation via the nav-shim HTTP endpoint.

## Tags

- `ghcr.io/kbve/kasm-void:dev` — local build
- `ghcr.io/kbve/kasm-void:latest` — published

## Build

```sh
npx nx run kasm-void:container
npx nx run kasm-void:test
```

## Runtime env

| Variable             | Default             | Notes                                                       |
| -------------------- | ------------------- | ----------------------------------------------------------- |
| `START_URL`          | `https://kbve.com`  | Launch URL for the cloakbrowser instance                    |
| `CLOAK_APP_ARGS`     | (chromium defaults) | Override the full cloakbrowser arg list                     |
| `LAUNCH_DISCORD`     | `1`                 | Set to `0` to disable Discord supervisor                    |
| `LAUNCH_CLOAK`       | `1`                 | Set to `0` to disable browser supervisor                    |
| `LAUNCH_NAV_SHIM`    | `1`                 | Set to `0` to disable URL-launcher HTTP supervisor          |
| `NAV_SHIM_PORT`      | `9998`              | nav-shim HTTP listener port                                 |
| `CDP_PORT`           | `9222`              | Chromium remote-debugging port (loopback only)              |
| `URL_LAUNCHER_TOKEN` | (k8s secret)        | Bearer token required by `POST /open`; falls back to VNC_PW |
| `VNC_PW`             | (k8s secret)        | Provided by the kasm Deployment                             |

## Exposed ports / health

- `9222/tcp` — Chromium CDP (loopback bind via `--remote-debugging-address=127.0.0.1`)
- `9998/tcp` — nav-shim HTTP (`GET /healthz`, `POST /open`)
- `HEALTHCHECK` probes `http://127.0.0.1:${NAV_SHIM_PORT}/healthz` so
  `docker ps` / Kubernetes probes can detect a wedged shim.

## Crash recovery

`custom_startup.sh` spawns three background supervisors (`cloak_loop`,
`discord_loop`, `nav_shim_loop`). Each polls `pgrep` every 3–5 seconds
and re-launches its app if missing — closing Discord, the browser, or
killing the shim process simply triggers a respawn.

## Deployment

Used by `apps/kube/kasm/manifest/deployment.yaml` as the `workspace`
container. Resource requests/limits are bumped to req `2`/`4Gi`, lim
`4`/`8Gi` to accommodate Discord + browser + screenshare encoding.
