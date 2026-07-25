# PalForge — Server-Authored World Objects Mod

**Date:** 2026-07-24
**Status:** Design approved; Phase 0 spike pending
**Owner:** h0lybyte

## Goal

A UE4SS Lua mod that lets the server place persistent, config-defined world
objects into the Palworld map. Feature #1: readable signposts (a physical
post players can walk up to and read). Later object types (protected
structures, landmarks, spawn decor) layer onto the same mechanism.

## Why

Vanilla Palworld has no server-authored placed objects. Admins cannot pin a
"Welcome to Spawn" sign, a rules board, or a landmark that survives restarts
and cannot be griefed. PalForge fills that gap by driving Palworld's own
native build objects from a git-versioned config — no custom meshes, no
custom text rendering.

## Key Discovery — drive the native signboard, don't build one

From the DrRak72/Palworld-Modding-Reference SDK dump:

- `ABP_BuildObject_Signboard_C : APalBuildObject` — real, spawnable,
  replicated, save-persisted. Path:
  `/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C`.
  MapObjectId `"Signboard"`.
- Text lives on native `PalMapObjectSignboardModel` (getter
  `GetSignboardText`, refresh delegate `UpdateSignboardTextDelegate`).
- Actor `OnUpdateText(FString)` pushes model text → 3D widget
  `WBP_Ingame_Signboard_3DText.UpdateText`.
- Players already type text on these via `WBP_Ingame_Signboard_TextInput`.

So a signboard already renders + replicates 3D text natively. PalForge's job
is only to **place them from config and stamp the text.**

## Architecture

Sibling to `PalChatRelay`, same UE4SS loader pattern (retry-forever hook
registration, `ExecuteWithDelay`, `pcall`, `StaticFindObject`, `RegisterHook`).

```
apps/agones/palworld/mods/PalForge/
  scripts/main.lua          loader + world-load trigger + place loop
  objects/signboards.toml   [[sign]] coords, rot, text   (git = source of truth)
```

- **Trigger:** on world-load (delayed schedule, mirroring PalChatRelay's boot
  retry), read config.
- **Place loop:** for each configured object → spawn the native build object
  at coords/rotation → set its model text → call `OnUpdateText()` to refresh.
- **Config = source of truth. Spawn transient + respawn each world-load** —
  no dedupe against the save, no writable PVC state, edits ship by redeploying
  the image. DRY.
- **Packaging:** bakes into the `agones-palworld` game image via `overlay.sh`
  (same staging path as PalChatRelay). `mods.txt` gains `PalForge:1`.
- **Deploy lever:** bump `agones-palworld` MDX version only; deployment yaml
  and version.toml sync automatically post-publish. Never hand-edit those.

## Open Unknowns (resolved by Phase 0 spike)

Both are only answerable on the live server via a UE4SS runtime dump — they
are NOT in any static reference (the reference dumps Blueprint classes +
JsonProperties; native manager/model setters are absent, the same gap that
hid the chat function until it was proved live).

- **R1 — spawn.** Can Lua spawn `BP_BuildObject_Signboard_C` at a coordinate
  and get a valid concrete model? A bare `SpawnActor` may not register with
  save/persistence or may lack a valid `PalMapObjectSignboardModel`; the real
  path may require the build system (foundation / guild / owner).
- **R2 — text setter.** The native setter name on
  `PalMapObjectSignboardModel` (only `GetSignboardText` is dumped). Dump the
  model's functions live to find it. `OnUpdateText` alone may be visual-only,
  not persisted/replicated.

**Fallback if R1/R2 fail:** proximity-chat signs — invisible trigger at
coords; walking near sends the sign's text to the player via the known-working
`BroadcastChatMessage` path (per-player if resolvable, else whole-server with
a per-player cooldown). Reuses existing chat render, zero spawn/replication
risk. Documented here so a spike failure has a landing spot.

## Phases

### Phase 0 — Live spike (de-risk before real build)

Throwaway `probe.lua` deployed to the live server that:
1. Attempts to spawn one `BP_BuildObject_Signboard_C` at a test coordinate.
2. Dumps the spawned actor's `PalMapObjectSignboardParameter` /
   `PalMapObjectSignboardModel` functions (via `ForEachFunction` / Live View)
   to find the text setter.
3. Attempts to set text + `OnUpdateText()` and reports whether the sign
   renders client-side.

Deliverable: probe results (spawn works Y/N, setter name, renders Y/N).
Outcome selects the Phase-1 mechanism (native placement vs. fallback).

### Phase 1 — Config-driven signboards (after spike)

- `objects/signboards.toml` schema: `[[sign]]` with `coords = [x,y,z]`,
  `rot = yaw`, `text = "..."`.
- `scripts/main.lua`: loader, world-load trigger, config parse, place loop
  using the mechanism the spike confirmed.
- `mods.txt` += `PalForge:1`; `overlay.sh` stages `PalForge/scripts` +
  `objects`.
- MDX bump on `agones-palworld`.

### Phase 2+ — Additional object types

- Indestructible flag (protect placed + optionally player objects).
- Further object types (landmarks, protected structures, spawn decor) reusing
  the place-from-config loop.

## Testing

- Phase 0: manual live verification (join server, read UE4SS.log for probe
  output, look for the test sign in-world).
- Phase 1: config a known sign near spawn → redeploy → join → confirm the
  post is present and the text renders for a second client.

## References

- Native signboard classes — DrRak72/Palworld-Modding-Reference (SDK dump).
- Sibling mod — `apps/agones/palworld/mods/PalChatRelay/scripts/main.lua`.
- UE4SS API confirmed in prod: `StaticFindObject`, `RegisterHook`,
  `FindAllOf`, `ExecuteWithDelay`, `ForEachName`, `ForEachProperty`.
- Image + deploy — see [[project_palworld_agones]] memory.
