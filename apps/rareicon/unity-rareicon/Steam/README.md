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

From this directory:

```sh
# Build locally first (Unity → File → Build → StandaloneWindows64 etc.)
# Output goes to ../build/<target>/.

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
