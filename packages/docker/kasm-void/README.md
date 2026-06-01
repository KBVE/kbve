# kasm-void

KASM workspace image that bundles the upstream `kasmweb/discord` install with
[CloakBrowser](https://github.com/CloakHQ/CloakBrowser), a stealth Chromium
fork. Both apps auto-launch on session start and are individually supervised
— if either crashes or is closed it is respawned by the startup loop.

Use case: run Discord inside the KASM session and screenshare the bundled
browser through Discord's video/stream feature.

## Tags

- `ghcr.io/kbve/kasm-void:dev` — local build
- `ghcr.io/kbve/kasm-void:latest` — published

## Build

```sh
npx nx run kasm-void:container
npx nx run kasm-void:test
```

## Runtime env

| Variable         | Default             | Notes                                    |
| ---------------- | ------------------- | ---------------------------------------- |
| `START_URL`      | `https://kbve.com`  | Launch URL for the cloakbrowser instance |
| `CLOAK_APP_ARGS` | (chromium defaults) | Override the full cloakbrowser arg list  |
| `LAUNCH_DISCORD` | `1`                 | Set to `0` to disable Discord supervisor |
| `LAUNCH_CLOAK`   | `0`/`1`             | Set to `0` to disable browser supervisor |
| `VNC_PW`         | (k8s secret)        | Provided by the kasm Deployment          |

## Crash recovery

`custom_startup.sh` spawns two background supervisors. Each polls `pgrep`
every 3 seconds and re-launches its app if missing — closing Discord or
the browser window from the desktop simply triggers a respawn.

## Deployment

Used by `apps/kube/kasm/manifest/deployment.yaml` as the `workspace`
container. Resource requests/limits are bumped to req `2`/`4Gi`, lim
`4`/`8Gi` to accommodate Discord + browser + screenshare encoding.
