# kasm-cloakbrowser

KASM workspace image bundling [CloakBrowser](https://github.com/CloakHQ/CloakBrowser),
a stealth Chromium fork. Targets sites that block kasmweb/discord's Electron UA
or kernel fingerprint while running behind a datacenter VPN exit.

## Tags

- `ghcr.io/kbve/kasm-cloakbrowser:dev` — local build
- `ghcr.io/kbve/kasm-cloakbrowser:latest` — published

## Build

```sh
npx nx run kasm-cloakbrowser:container
npx nx run kasm-cloakbrowser:test
```

## Override CloakBrowser version

```sh
docker build \
  --build-arg CLOAK_VERSION=chromium-v146.0.7680.177.4 \
  --build-arg CLOAK_SHA256=<sha256-of-tarball> \
  packages/docker/kasm-cloakbrowser
```

## Runtime env

| Variable    | Default                   | Notes                                           |
| ----------- | ------------------------- | ----------------------------------------------- |
| `START_URL` | `https://discord.com/app` | Launch URL when `KASM_URL` / `LAUNCH_URL` unset |
| `APP_ARGS`  | (chromium defaults)       | Override the full chromium arg list             |
| `KASM_URL`  | unset                     | Per-session URL injected by KASM Workspaces     |

## Deployment

Swap in via the kasm Deployment by replacing the workspace container image:

```yaml
- name: workspace
  image: ghcr.io/kbve/kasm-cloakbrowser:latest
```

The existing `kasm-vpn` Deployment can stay on `kasmweb/discord` while this
image lives alongside on a separate Deployment for testing.
