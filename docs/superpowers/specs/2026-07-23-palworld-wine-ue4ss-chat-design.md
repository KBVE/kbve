# Palworld Wine + UE4SS Chat Relay — Design

**Date:** 2026-07-23
**Status:** Approved — implementing

## Goal

Relay real in-game Palworld chat to IRC. Capture chat via UE4SS `RegisterHook`
on the chat function, written to a file the existing Rust relay sidecar tails.

## Why the pivot (Linux-native is impossible)

The Linux-native path (thijsvanloef base + XarminaEu UE4SS Linux `.so`) is a
hard dead end, proven by probe on the actual binary:

- `PalServer-Linux-Shipping` is **ET_EXEC**, `.symtab = 0` (no symbol table),
  and of 25,299 exported `FUNC` symbols in `.dynsym`, **zero** are the UE
  reflection internals UE4SS needs (`GUObjectArray`, `ProcessEvent`,
  `ProcessInternal`, `GMalloc`, `GNatives`, `StaticConstructObject`,
  `CallFunctionByNameWithArguments`).
- UE4SS Linux resolves addresses only via `dlsym` (needs exports) or a manual
  `UE4SS_Addresses.ini`. patternsleuth AOB is Windows-only ("never match" on
  Linux — UE4SSProgram.cpp:942). With `GUObjectArray` unresolved, UE4SS skips
  starting Lua mods entirely (UE4SSProgram.cpp:2542) → `PalChatRelay` never
  loads.
- No public Palworld-Linux address dump exists; deriving addresses requires
  full Ghidra RE of a 196 MB stripped binary, re-done every Palworld patch.

Windows Palworld + **Windows UE4SS** avoids all of this: patternsleuth's
AOB patterns are authored for Windows binaries → they match → hooks fire. This
is the community-standard modding path (UE4SS/PalSchema/Workshop are
Windows-only).

On our **x86_64** Talos nodes, Wine is a compatibility layer, **not** CPU
emulation — win64-on-x86_64 runs at near-native CPU. Overhead is RAM + Xvfb +
slower first boot (winetricks). RAM was already raised to 16–32 Gi.

## Architecture

Thin layer over the proven ripps818 Wine image:

```
FROM ghcr.io/ripps818/docker-palworld-dedicated-server-wine@sha256:243508cd48c49208aca3edafb3369ea2b7b432c58a151cba33617c7a91676316
```

ripps818 already provides: WineHQ stable, winetricks vcrun2022, persistent
Xvfb, Windows SteamCMD, `PalServer-Win64-Shipping-Cmd.exe` launch, REST API,
RCON, and **first-class UE4SS support** — `INSTALL_UE4SS_EXPERIMENTAL=true`
downloads Okaetsu's Palworld UE4SS (`UE4SS-Palworld.zip`) and injects it as
`dwmapi.dll` (`WINEDLLOVERRIDES=...;dwmapi=n,b`).

Our added layer:
1. `ENV INSTALL_UE4SS_EXPERIMENTAL=true`.
2. `COPY` our `PalChatRelay` Lua mod + `UE4SS-settings.ini` to an image
   staging path (`/opt/palchatrelay/`).
3. An **overlay script** (via ripps818's `CUSTOM_SCRIPT_ENABLED=true` /
   `CUSTOM_SCRIPT_PATH`) that copies `PalChatRelay` into `ue4ss/Mods/` and
   writes `ue4ss/Mods/mods.txt` (`PalChatRelay : 1`).
4. `COPY` the prestop shim (`agones-shim-prestop` — REST `/shutdown`,
   already validated for save-on-shutdown).

### Custom-script ordering (confirmed, no longer a risk)
`servermanager.sh::start_main` runs `install-mods.sh` (installs UE4SS to
`ue4ss/Mods/`), then `start_server`. `start_server` (server.sh:91) calls
`check_and_run_custom_script` **before** launching Wine. So our overlay runs
**after** UE4SS is installed and **before** the server starts — exactly right.
It requires `CUSTOM_SCRIPT_PATH` be absolute and contain no `..`.

### What carries over unchanged
- Relay sidecar: `chat_tail.rs`, `irc_bridge.rs`, `poller`, `config.rs`.
- `PalChatRelay/scripts/main.lua` — `RegisterHook` **now functions**.
- Rotator (image bump → gameserver rotate), Agones REST health, prestop.

## Data flow

```
Player types chat
  → PalServer-Win64 (under Wine) UE4SS RegisterHook(BroadcastChat)
  → main.lua io.open(PALWORLD_CHAT_LOG) append "ts\tplayer\ttext"
  → [shared emptyDir] /shared/chat/chat.log
  → relay sidecar chat_tail::run tails file
  → game_tx broadcast → irc_bridge → IRC   (<player> text)
```

### Chat-log path across the Wine boundary
The Lua runs inside the Windows process under Wine. Wine maps the host root to
drive `Z:`. So:
- Shared volume: `chat-relay` emptyDir mounted at **`/shared/chat`** in both
  the game container and the relay sidecar.
- Mod env: `PALWORLD_CHAT_LOG=Z:/shared/chat/chat.log` (Wine-visible).
- Relay env: `CHAT_LOG_PATH=/shared/chat/chat.log` (Linux-visible).

Mount at `/shared/chat`, **not** under `/palworld` (the game `VOLUME`), to
avoid clashing with the game data volume.

## Kubernetes / Agones integration

`apps/kube/agones/palworld/manifests/gameserver.yaml`:
- Game container image → new Wine image.
- Add envs: `INSTALL_UE4SS_EXPERIMENTAL=true`, `CUSTOM_SCRIPT_ENABLED=true`,
  `CUSTOM_SCRIPT_PATH=/opt/palchatrelay/overlay.sh`,
  `PALWORLD_CHAT_LOG=Z:/shared/chat/chat.log`.
- Quiet ripps818 automation we don't want (Agones/rotator own lifecycle):
  `BACKUP_ENABLED=false`, `RESTART_ENABLED=false`,
  `PLAYER_DETECTION_ENABLED=false`, `RCON_PLAYER_DETECTION=false`.
- Move `chat-relay` mount from `/palworld/chat-relay` → `/shared/chat` in both
  containers; relay `CHAT_LOG_PATH=/shared/chat/chat.log`.
- `runAsNonRoot` cannot be forced — ripps818 entrypoint **must start as root**
  (it `gosu`-drops to `steam` after Xvfb + PUID/PGID fixup). Keep the existing
  root-init caps model already documented for this gameserver.

## Testing (CI e2e, x86 runner)

Revert the diagnostic terminal e2e back to a real test, adapted for Wine:
1. `docker run` the Wine image with REST enabled (+ UE4SS envs).
2. Wait for REST `/v1/api/info` (longer budget — Wine first-boot +
   winetricks; keep 900s ceiling, stream container tail).
3. Verify UE4SS loaded: find `UE4SS.log` under
   `Pal/Binaries/Win64/ue4ss/` and grep `PalChatRelay`.
4. **New**: exercise the chat path end to end if feasible — else assert the
   hook registered (log line) as the gate.
5. `npx vitest run` (REST assertions), then teardown.

## Risks / open items

- **Okaetsu UE4SS-Palworld version drift**: pinned by ripps818's default URL;
  a Palworld update may need a newer UE4SS. Acceptable (community-tracked).
- **First-boot time**: winetricks vcrun2022 on a fresh prefix is slow. The
  ripps818 image bakes the prefix, so this is one-time at build, not per-pod —
  confirm in e2e.
- **Base image supply chain**: pinned by digest above; bump deliberately.
- **Save persistence**: unchanged — prestop REST `/shutdown` flushes saves;
  `/palworld` volume semantics identical to before.

## Non-goals
- Web manager (ripps818 bundles none in the server image; the 1tsmejp manager
  is out of scope — Agones + relay own orchestration).
- PalSchema / Workshop mods (available via this base, but not this task).
