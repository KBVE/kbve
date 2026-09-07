# RareIcon Steam upload

VDF configs consumed by `steamcmd +run_app_build` for the RareIcon demo
on Steamworks (AppID `3791950`).

These moved here from `unity-rareicon/` with the game itself: RareIcon
ships from the Unreal project now, and the Steam app is the same app —
same AppID, same three depots, new engine behind them.

## Layout

| File                              | Role                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `app_build_demo.vdf`              | Top-level — binds the demo app to its three depots, `contentroot` at `../build/` |
| `depot_build_3791951_windows.vdf` | Windows depot — pulls `../build/Windows/`                                        |
| `depot_build_3791952_linux.vdf`   | Linux depot — pulls `../build/Linux/`                                            |
| `depot_build_3791953_macos.vdf`   | macOS depot — pulls `../build/Mac/`                                              |

`Windows/`, `Linux/` and `Mac/` are Unreal's own archive directory names
from `BuildCookRun -archive`, so a local upload wants the archive
directory dropped at `../build/` unchanged.

## In CI

`utils-unreal-build.yml`'s `game_steam` job runs after all three client
builds succeed, unzips each platform artifact into `build/`, and uploads
through `utils-steam-deploy.yml`. Which apps it uploads to comes from
`STEAM_APPS` in the project's `moon.yml`; an entry with no
`app_build_<label>.vdf` beside this file is logged and skipped, which is
how AppID `2238370` (the full game) sits dormant until it ships.

All three platforms are required: the depots go up as one Steam build, so
a missing platform would leave that depot on the previous version.

## Local upload

Two flavours: `docker compose` for reproducible runs (recommended),
host-installed `steamcmd` for ad-hoc testing.

### Via docker compose (uses ghcr.io/kbve/steamcmd-ubuntu:24.04)

`STEAM_USERNAME` + `STEAM_PASSWORD` come from the gitignored repo-root
`.env`; never inlined into the compose file.

**Step 1 — capture `config.vdf` once** (only when the
`STEAM_CONFIG_VDF` GitHub secret needs refreshing):

```sh
# from repo root
docker compose -f apps/rareicon/unreal-rareicon/Steam/docker-compose.yml \
    --env-file .env run --rm capture
```

Inside the shell:

```sh
steamcmd +login "$STEAM_USERNAME"
# enter password, confirm Steam Guard on phone, then:
quit
cp /root/Steam/config/config.vdf /export/
exit
```

The captured `config.vdf` lands in `Steam/steam-export/config.vdf`
(gitignored). Upload to GitHub:

```sh
base64 -i apps/rareicon/unreal-rareicon/Steam/steam-export/config.vdf \
    -o /tmp/steam_config.b64
gh secret set STEAM_CONFIG_VDF --repo kbve/kbve < /tmp/steam_config.b64
rm -rf /tmp/steam_config.b64 \
    apps/rareicon/unreal-rareicon/Steam/steam-export
```

**Step 2 — upload a build** (after packaging clients into
`../build/Windows/`, `../build/Linux/`, `../build/Mac/`):

```sh
# from repo root
docker compose -f apps/rareicon/unreal-rareicon/Steam/docker-compose.yml \
    --env-file .env run --rm upload
```

### Via host steamcmd (ad-hoc, your Mac steam install)

```sh
# from this directory
steamcmd +login h0lybyte \
    +run_app_build "$(pwd)/app_build_demo.vdf" \
    +quit
```

`setlive` is intentionally **blank** in `app_build_demo.vdf` so the
upload lands on the default branch for review. Promote to a public
branch (e.g. `demo`, `playtest`) via the Steamworks dashboard once
verified — or let CI do it: a `STEAM_APPS` entry with
`promote_to_branch` dispatches `ci-steam-promote.yml`, gated by the
`steam-prod` environment.

## Notes

- AppID `3791950` is the standalone **Steam demo**. The full game is
  AppID `2238370` (separate app + depots, queued for later release).
- The Unreal project does **not** enable `OnlineSubsystemSteam` yet, so
  these builds ship without the Steam overlay, achievements or a
  `steam_appid.txt`. That is a game-side change, not an upload one — the
  Unity postprocessor that used to write `steam_appid.txt` went with the
  Unity project.
- `BuildOutput/` in this directory holds steamcmd's intermediate cache
  files and is git-ignored.
