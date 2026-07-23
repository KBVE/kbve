# Palworld In-Game Chat → IRC via Native-Linux UE4SS

> **⚠️ SUPERSEDED (2026-07-23).** This native-Linux UE4SS approach is abandoned.
> A probe of the actual Steam binary proved it impossible: `PalServer-Linux-Shipping`
> is export-stripped (`.symtab = 0`; of 25,299 exported `FUNC` symbols in `.dynsym`,
> **zero** are the UE reflection internals UE4SS needs — `GUObjectArray`,
> `ProcessEvent`, `GMalloc`, `GNatives`, ...). UE4SS Linux resolves only via `dlsym`
> or a manual `UE4SS_Addresses.ini`, and patternsleuth AOB is Windows-only, so
> `GUObjectArray` never resolves and Lua mods never start. Replaced by
> Windows-Palworld-under-Wine: see
> **[`2026-07-23-palworld-wine-ue4ss-chat-design.md`](./2026-07-23-palworld-wine-ue4ss-chat-design.md)**.
> Kept as the record of why the native path cannot work.

Date: 2026-07-22
Status: **SUPERSEDED** by the Wine design (2026-07-23)
Branch: `worktree-palworld-ue4ss`

## Problem

The Agones-managed Palworld relay currently forwards player **join/leave** and
snapshot events to kbve IRC. It relays no actual in-game chat, because the
vanilla Palworld dedicated server exposes none of it:

- The base image REST surface is `info/metrics/players/announce/shutdown` — no
  chat-read endpoint.
- RCON has no chat-fetch command.
- The Palworld server log does not record player chat.
- The base image `thijsvanloef/palworld-server-docker` (and the jammsen
  alternative) only emit join/leave/lifecycle via Discord webhooks, detected by
  RCON `ShowPlayers` polling — the same signal the relay already has.

The goal: relay the messages players actually type into IRC (and thus Discord,
via the existing irc-gateway), and stop relaying join/leave noise to IRC. This
must run on the **Linux-native** dedicated server — no Proton/Wine — to stay
resource-efficient.

## Approach

In-game chat is only reachable from **inside** the running Unreal server
process. RE-UE4SS now ships a native Linux build (`libUE4SS.so`) that injects
into the ELF `PalServer-Linux-Shipping` via `LD_PRELOAD` and runs Lua/C++ mods
in-process. A small Lua mod hooks the chat UFunction and appends each message to
a log file on a shared volume. The relay sidecar tails that file, turns each
line into a `GameEvent{Chat}`, and pushes it onto the existing broadcast bus —
where the IRC bridge already lives.

Rejected alternatives:

- **Proton/Wine + Windows server + Windows UE4SS mods** — heavier image, worse
  resource profile. Rejected in favor of native Linux.
- **Switch base image to jammsen** — same vanilla-Linux limitation, no chat, and
  its Node.js companion duplicates the relay's job. No benefit.
- **Lua → HTTP POST to relay** — UE4SS Lua lacks reliable HTTP; would force a
  C++ mod or bundled luasocket. Rejected for file-tail.
- **RCON announce echo** — creates in-game echo loops. Rejected.

## Architecture

```
┌─ game container (thijsvanloef base + UE4SS layer) ──────────────┐
│  run_ue4ss.sh --host-executable PalServer-Linux-Shipping        │
│      → LD_PRELOAD libUE4SS.so → PalChatRelay Lua mod            │
│           hooks chat UFunction → append line to chat.log        │
│                                     │                            │
│              emptyDir  /shared/palworld-chat/chat.log            │
└─────────────────────────────────────┼───────────────────────────┘
                                       │ (same emptyDir, read)
┌─ relay sidecar ─────────────────────▼───────────────────────────┐
│  chat_tail.rs   tail chat.log → GameEvent{Chat} → game_tx       │
│  irc_bridge     format_for_irc: relay Chat only, drop Join/Leave │
│  poller/ch_writer  UNCHANGED (Join/Leave/Stats → ClickHouse)    │
└──────────────────────────────────────────────────────────────────┘
```

The relay's broadcast bus (`main.rs`, `broadcast::channel::<GameEvent>`) already
fans out to both `irc_bridge` and `ch_writer`. Chat becomes a new **producer**
on that bus; ClickHouse telemetry is unaffected. Only the IRC formatter changes
behavior.

## Components

### 1. Vendored UE4SS Linux runtime

- Source: `NullPrism/RE-UE4SS-Linux` release `linux-v0.1.0`,
  `RE-UE4SS-Linux-0.1.0-x86_64.tar.gz`.
- Tarball sha256: `15f9f368f51619918f29f5adbae6a0411056896c65b76b30980be4899b0f48da`.
- Contents: `libUE4SS.so`, `run_ue4ss.sh`, `UE4SS-settings.ini`, `Mods/`
  (standard scaffold incl. `shared/UEHelpers`, BPModLoader — all disabled by
  default), `UE4SS-crashes/`, `SHA256SUMS`, provenance files.
- Provisioning: fetched at Docker build time with sha256 verification (fallback:
  commit into repo via Git LFS if the release URL proves unstable). Pin the
  exact version; treat any bump as deliberate.
- Staging (per bundle INSTALL.md), beside the ELF:

  ```
  Pal/Binaries/Linux/
  ├── libUE4SS.so
  ├── run_ue4ss.sh
  ├── UE4SS-settings.ini
  ├── Mods/
  └── UE4SS-crashes/
  ```

### 2. PalChatRelay Lua mod

- New mod `Mods/PalChatRelay/Scripts/main.lua`, enabled via `Mods/mods.txt`
  (leave every bundled mod disabled).
- Behavior: `RegisterHook` on Palworld's chat-receive UFunction. On each chat
  event, write one tab-delimited line to the chat log:

  ```
  <unix_ms>\t<player>\t<text>
  ```

- **Key discovery task (P1):** the exact chat UFunction name. Found by dumping
  UObjects with the bundled `ConsoleCommandsMod`/`ActorDumperMod`, or by lifting
  the hook point from an existing community chat mod (e.g. the Nexus Discord
  Integration mod). This is the single largest unknown and gates the rest.
- Chat log path is fixed by container mount (see §6), e.g.
  `/palworld/chat-relay/chat.log`. The Lua mod appends; it never rotates or
  truncates.

### 3. Game Dockerfile change

- File: `apps/agones/palworld/Dockerfile` (currently `FROM
  thijsvanloef/palworld-server-docker`, adds curl/jq + Agones prestop shim).
- Add a build step that fetches + checksum-verifies the UE4SS tarball and stages
  it into `/palworld/Pal/Binaries/Linux/`, plus copies in `Mods/PalChatRelay`.
- Change the server launch so thijsvanloef's `PalServer.sh` is routed through the
  bundle's launcher:

  ```
  run_ue4ss.sh --host-executable <.../PalServer-Linux-Shipping> \
    <.../PalServer.sh> <existing args>
  ```

  `run_ue4ss.sh` prepends `libUE4SS.so` to `LD_PRELOAD` while preserving the
  existing steamclient preload, and verifies the host is a real ELF. The precise
  interception point in the thijsvanloef entrypoint is determined in P1.
- Server root in the base image is `/palworld`; binaries at
  `/palworld/Pal/Binaries/Linux/`.

### 4. relay `chat_tail.rs` (new module)

- Opens `CHAT_LOG_PATH`, seeks to end, and follows appended lines (poll on an
  interval; tolerate the file not existing yet and being recreated).
- Parses each `ts\tplayer\ttext` line into
  `GameEvent { kind: Chat, player: Some(player), text, .. }` and sends it on
  `game_tx`.
- Spawned from `main.rs` alongside the existing tasks; added to the `select!`.
- Malformed lines are logged at debug and skipped, never fatal.

### 5. relay config

- Add `chat_log_path: Option<String>` to `Config`, env `CHAT_LOG_PATH`.
- When unset, `chat_tail` logs a warning and idles (mirrors `ch_writer`'s
  disabled path) so the relay still runs without the chat volume.

### 6. relay `irc_bridge` formatter

- `format_for_irc`: `Chat` → `<player> text` (empty text skipped); `Join`,
  `Leave`, `Stats`, `Command` → `None`.
- `last_players` becomes unused for output; keep the parameter or drop it as the
  implementation prefers.

### 7. gameserver.yaml

- File: `apps/kube/agones/palworld/manifests/gameserver.yaml`.
- Add an `emptyDir` volume (e.g. `chat-relay`), mounted:
  - game container: read-write at `/palworld/chat-relay`
  - relay sidecar: read at the same logical path, `CHAT_LOG_PATH` pointed at it.
- Add whatever `securityContext` the exec-heap requirement needs (resolved in
  P1). The game container already sets `allowPrivilegeEscalation: true`.
- (RAM bump to 32Gi limit is handled separately in PR #14525, not here.)

## Data flow

1. Player types in-game → Palworld chat UFunction fires in the server process.
2. PalChatRelay Lua hook writes `ts\tplayer\ttext` to
   `/palworld/chat-relay/chat.log`.
3. relay `chat_tail` reads the new line → `GameEvent{Chat}` → `game_tx`.
4. `irc_bridge` formats `<player> text` → `PRIVMSG` to the IRC channel.
5. irc-gateway relays IRC → Discord (already wired, unchanged).

`poller` and `ch_writer` continue independently: join/leave/snapshots still land
in `gameops.palworld_*`; they simply no longer reach IRC.

## Phasing

- **P1 — UE4SS load + chat hook (the risk).** Bundle into the container, boot,
  confirm `UE4SS.log` shows the loader initialized, PalChatRelay loads, the chat
  hook fires on a real message, and a line lands in chat.log. Resolve exec-heap /
  securityContext here. **Gate:** if chat never fires, stop before building the
  pipeline and reassess (different UE4SS build, different hook point, or shelve).
- **P2 — relay.** `chat_tail.rs`, config, and the `format_for_irc` change.
  Testable end-to-end against a hand-written fake chat.log, no game required.
- **P3 — wire + productionize.** emptyDir volume in gameserver.yaml,
  checksum-pinned fetch in the Dockerfile, launch wrapper, securityContext.
- **P4 — docs + version + deploy.** Update `agones-palworld.mdx` (server is no
  longer vanilla — documents the UE4SS layer) and `agones-palworld-relay.mdx`
  (chat relay + drop join/leave from IRC). Version bumps via MDX only. ArgoCD
  picks up the manifest + images.

## Risks and mitigations

- **UE4SS Linux is experimental; compatibility is per game/engine/glibc combo.**
  The P1 smoke-gate is exactly this check. thijsvanloef is Debian-based; the
  bundle was validated on a Palworld server, but not necessarily this image.
- **Chat UFunction offsets break on Palworld updates.** Pin `PALWORLD_TAG`
  (already an `ARG`), pin the UE4SS version, pin the mod. Updates are deliberate,
  gated by re-running P1.
- **Exec-heap / JIT.** The runtime needs an executable heap. Talos nodes have no
  SELinux, but the pod may need a seccomp/securityContext adjustment. Resolved in
  P1; do not globally enable `execheap`.
- **Third-party binary trust.** The `.so` is a prebuilt community artifact.
  Mitigate with the sha256 lock and, if desired, the LFS-vendored fallback so the
  artifact is committed rather than fetched.
- **Container no longer vanilla.** The `agones-palworld` design premise ("keep
  the Palworld container vanilla") changes. P4 updates the docs to reflect the
  UE4SS layer.

## Out of scope (YAGNI)

- Chat → ClickHouse (`gameops.palworld_chat_*`) — deferred; add later if wanted.
- Two-way bridge (IRC → in-game chat). The existing IRC → REST `announce` path
  stays as-is; no new game-directed write.
- Building UE4SS from source — the pinned prebuilt release is sufficient.

## Affected files

- `apps/agones/palworld/Dockerfile` — UE4SS stage + launch wrapper.
- `apps/agones/palworld/Mods/PalChatRelay/Scripts/main.lua` — new chat hook.
- `apps/agones/palworld/relay/src/chat_tail.rs` — new tail producer.
- `apps/agones/palworld/relay/src/main.rs` — spawn chat_tail.
- `apps/agones/palworld/relay/src/config.rs` — `CHAT_LOG_PATH`.
- `apps/agones/palworld/relay/src/irc_bridge.rs` — formatter change.
- `apps/kube/agones/palworld/manifests/gameserver.yaml` — emptyDir + mounts +
  securityContext.
- `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx` — UE4SS
  layer, version bump.
- `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld-relay.mdx` —
  chat relay, version bump.
