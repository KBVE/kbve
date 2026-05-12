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

| Variable                 | Default                   | Notes                                            |
| ------------------------ | ------------------------- | ------------------------------------------------ |
| `START_URL`              | `https://discord.com/app` | Launch URL when `KASM_URL` / `LAUNCH_URL` unset  |
| `APP_ARGS`               | (chromium defaults)       | Override the full chromium arg list              |
| `KASM_URL`               | unset                     | Per-session URL injected by KASM Workspaces      |
| `CLOAKBROWSER_CACHE_DIR` | `/opt/cloakbrowser-cache` | Where the pip pkg caches its own chromium binary |

## Python SDK

The image bakes `pip install cloakbrowser` and pre-warms the binary cache, so
the snippet from the upstream README works out of the box:

```python
from cloakbrowser import launch

browser = launch()
page = browser.new_page()
page.goto("https://protected-site.com")
browser.close()
```

The pip package and the GUI workspace keep separate chromium copies — the
GUI launches `/opt/cloakbrowser/cloakbrowser` (from the release tarball)
while `launch()` resolves `$CLOAKBROWSER_CACHE_DIR/<version>/chrome` (the
pip pkg's own download). Pin both by passing `CLOAK_VERSION` +
`CLOAKBROWSER_PIP_VERSION` build args.

## Deployment

Swap in via the kasm Deployment by replacing the workspace container image:

```yaml
- name: workspace
  image: ghcr.io/kbve/kasm-cloakbrowser:latest
```

The existing `kasm-vpn` Deployment can stay on `kasmweb/discord` while this
image lives alongside on a separate Deployment for testing.
