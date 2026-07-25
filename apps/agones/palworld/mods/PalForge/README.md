# PalForge

Server-authored persistent world objects for the Agones Palworld server.
UE4SS Lua mod, sibling to `PalChatRelay`. Drives Palworld's own native build
objects from a git-versioned config — no custom meshes, no custom text
rendering.

**Feature #1:** readable signposts (a physical post players walk up to and
read). Later object types (protected structures, landmarks, spawn decor) reuse
the same place-from-config loop.

## Status

**Skeleton — NOT integrated into the server yet.** `mods.txt`, `overlay.sh`,
and the `agones-palworld` MDX are intentionally untouched. Placement is stubbed
pending the Phase 0 live spike (see below).

## Layout

| File | Role |
|------|------|
| `scripts/main.lua` | Loader, world-ready trigger, place-from-config loop. `spawn_signboard` / `set_sign_text` are stubs until the spike resolves them. |
| `scripts/signboards.lua` | Config as a Lua table (`{ signs = { { coords, rot, text } } }`). Zero-dependency; UE4SS Lua has no TOML parser. Source of truth in git. |
| `scripts/probe.lua` | Phase 0 spike tool. Finds existing signboards, confirms `GetSignboardText`, tries candidate text setters. Run manually on the live server; do not ship. |

## The native signboard

From the DrRak72/Palworld-Modding-Reference SDK dump:

- `ABP_BuildObject_Signboard_C : APalBuildObject` — spawnable, replicated,
  save-persisted. Path
  `/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C`.
- Text lives on native `PalMapObjectSignboardModel` (getter `GetSignboardText`,
  delegate `UpdateSignboardTextDelegate`). Actor refresh `OnUpdateText(FString)`.
  3D render widget `WBP_Ingame_Signboard_3DText.UpdateText`.

## Open unknowns (Phase 0 spike)

- **R1 — spawn.** Can Lua spawn `BP_BuildObject_Signboard_C` at a coordinate
  with a valid concrete model? Bare `SpawnActor` may need the build system
  (foundation / guild / owner) path.
- **R2 — text setter.** Native setter name on `PalMapObjectSignboardModel`
  (only the getter is dumped). `probe.lua` tries candidates against a live
  signboard.

Fallback if both fail: proximity-chat signs (invisible trigger → send text via
the known-working `BroadcastChatMessage` path).

## Integration (later, once the spike resolves R1/R2)

1. Fill `spawn_signboard` / `set_sign_text` in `main.lua` with the confirmed
   mechanism.
2. Add `PalForge:1` to `apps/agones/palworld/mods/mods.txt`.
3. Stage `PalForge/scripts` in `overlay.sh` (same pattern as `PalChatRelay`).
4. Bump the `agones-palworld` MDX version (deploy lever).

See `docs/superpowers/specs/2026-07-24-palforge-design.md` and the
`project_palworld_agones` memory.
