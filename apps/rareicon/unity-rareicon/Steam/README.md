# RareIcon Steam upload

VDF configs consumed by `steamcmd +run_app_build` for the RareIcon demo
on Steamworks (AppID `3791950`).

## Layout

| File                              | Role                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `app_build_demo.vdf`              | Top-level — binds the demo app to its three depots, sets `contentroot` at `../build/` |
| `depot_build_3791951_windows.vdf` | Windows depot — pulls `../build/StandaloneWindows64/`                                 |
| `depot_build_3791952_linux.vdf`   | Linux depot — pulls `../build/StandaloneLinux64/`                                     |
| `depot_build_3791953_macos.vdf`   | macOS depot — pulls `../build/StandaloneOSX/`                                         |

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
docker compose -f apps/rareicon/unity-rareicon/Steam/docker-compose.yml \
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
base64 -i apps/rareicon/unity-rareicon/Steam/steam-export/config.vdf \
    -o /tmp/steam_config.b64
gh secret set STEAM_CONFIG_VDF --repo kbve/kbve < /tmp/steam_config.b64
rm -rf /tmp/steam_config.b64 \
    apps/rareicon/unity-rareicon/Steam/steam-export
```

**Step 2 — upload a build** (after a Unity standalone build at
`../build/StandaloneWindows64/` etc.):

```sh
# from repo root
docker compose -f apps/rareicon/unity-rareicon/Steam/docker-compose.yml \
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
verified.

## Notes

- AppID `3791950` is the standalone **Steam demo**. The full game is
  AppID `2238370` (separate app + depots, queued for later release).
- The Editor postprocessor (`SteamBuildPostprocessor.cs`) writes
  `steam_appid.txt` into each build's output dir so the Steamworks SDK
  finds the AppID at first launch. **Default = demo (3791950)**; opt
  into main with the `RAREICON_MAIN` scripting define under Player
  Settings → Other Settings → Scripting Define Symbols (or pass
  `-define:RAREICON_MAIN` via game-ci builder customParameters).
- `BuildOutput/` in this directory holds steamcmd's intermediate cache
  files and is git-ignored.
