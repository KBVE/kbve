# PalForge

Server-authored persistent world objects for the Agones Palworld server.
UE4SS Lua mod, sibling to `PalChatRelay`. Drives Palworld's own native build
objects — no custom meshes, no custom text rendering.

**Feature #1:** readable signposts that persist and are maintained by the
server. Text is server-authored; the sign is kept alive against decay.

## Status

Integrated and live. Command results are written to the shared chat log
(sender `PalForge`) and surface in Discord/IRC as `[PAL] PalForge: …`.

## Layout

| File | Role |
|------|------|
| `scripts/main.lua` | Loader, world-ready trigger, chat hook, command dispatch to the modules below. |
| `scripts/pos.lua` | Resolves a player's world location. Command: `!pos`. |
| `scripts/signs.lua` | The sign feature. Commands: `!signhp` (read deterioration/HP/owner), `!signrepair` (zero deterioration — property write). |
| `scripts/diag.lua` | Safe capability probes: `!httptest`, `!curltest` (no network). |
| `scripts/signboards.lua` | Config as a Lua table (`{ signs = { { coords, rot, text } } }`). UE4SS Lua has no TOML parser; source of truth in git. |

Each module exposes `handle(sender, text, emit, ctx)` and owns its own command
parsing; `main.lua` just calls each in turn. `emit` logs and appends to the
shared chat log.

## Sign approach

Palworld exposes no safe server-side spawn for build objects — the native
`RequestSpawnMapObject_Server` aborts the process when called from a bare Lua
context (it assumes a full build-request context), and there is no non-prod
Palworld to iterate on. So the sign is **hand-placed** by staff (native,
visible, saved) and maintained by PalForge:

- **Text:** server-authored via `PalMapObjectSignboardModel` (`OnUpdateText` /
  `GetSignboardText`), re-applied from `signboards.lua`.
- **Persistence:** global build deterioration stays **on** (so abandoned player
  builds are still garbage-collected), but PalForge zeroes the deterioration
  accumulators (`DeteriorationDamage` / `DeteriorationTotalDamage`) on its own
  signs on a cycle — a property write, not the crash-prone repair RPC.
- **Ownership (planned):** `PalMapObjectModel.BuildPlayerUId` is
  `BlueprintReadWrite`/replicated, so a hand-placed sign's owner can be
  rewritten to a canonical server id via the same safe-write path.

## Reference

Native signboard: `ABP_BuildObject_Signboard_C : APalBuildObject`
(`/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C`).
Model class `PalMapObjectSignboardModel`, owned by `PalMapObjectManager`.
Field/function names from `localcc/PalworldModdingKit` (`PalMapObjectManager.h`,
`PalMapObjectModel.h`, `PalMapObjectSignboardModel.h`).

See the `project_palworld_agones` memory for the full spike history (why
server-spawn is parked, the crash root cause, and the safe-write decision).
