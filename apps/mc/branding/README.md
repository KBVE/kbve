# KBVE Minecraft branding assets

Source SVGs and rasterized PNGs for the MC server icon and Modrinth project page.

| File                  | Size    | Used by                                                                     |
| --------------------- | ------- | --------------------------------------------------------------------------- |
| `kbve-icon.svg`       | source  | Master design — 2x2 grid of K B / V E in KBVE green on deep navy            |
| `kbve-banner.svg`     | source  | Title banner — mini icon + project text + right-edge KBVE-green accent bar  |
| `server-icon.png`     | 64x64   | Vanilla MC server-icon — copied into the image and pointed to by `$ICON`    |
| `modrinth-icon.png`   | 256x256 | Modrinth project icon — uploaded manually via the project settings page     |
| `modrinth-banner.png` | 468x60  | Modrinth gallery / Description-markdown banner — uploaded via the same page |

## Re-render after editing

```bash
./render.sh
```

Requires ImageMagick 7+ (`brew install imagemagick`). Both PNGs are committed
so consumers don't need ImageMagick to build the Docker images.

## Where the server-icon ends up at runtime

`apps/mc/Dockerfile` and `apps/mc/lobby/Dockerfile` each:

1. `COPY apps/mc/branding/server-icon.png /usr/local/share/server-icon.png`
2. `ENV ICON=/usr/local/share/server-icon.png`

The `itzg/minecraft-server` startup script reads `$ICON` and copies the file
to `/data/server-icon.png` on first boot. Subsequent boots leave whatever's
already at `/data/server-icon.png` alone — set `OVERRIDE_ICON=TRUE` if you
want the image's icon to win on every restart.
