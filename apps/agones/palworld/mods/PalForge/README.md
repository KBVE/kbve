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
| `scripts/signs.lua` | The sign feature. Commands: `!signhp` (read deterioration/HP/owner), `!signrepair` (zero deterioration — property write), `!signclaim` (re-own `BuildPlayerUId` to the server guid — FGuid write, manual). |
| `scripts/guardian.lua` | Keep/sweep loop. Commands: `!guardstart` / `!guardstop` / `!guardstatus` / `!guardtick`. Automated path uses **only** deterioration float writes. |
| `scripts/diag.lua` | Safe capability probes: `!httptest`, `!curltest` (no network). |
| `scripts/signboards.lua` | Config as a Lua table (`{ server_guid, signs, guardian }`). UE4SS Lua has no TOML parser; source of truth in git. |

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
- **Ownership:** `PalMapObjectModel.BuildPlayerUId` is
  `BlueprintReadWrite`/replicated, so a hand-placed sign's owner can be
  rewritten to a canonical server id (`!signclaim`). This is an FGuid struct
  write — treated as crash-risk and pre-logged, kept **manual** until proven
  live. Not run by the guardian loop.

## Guardian (keep/sweep)

`guardian.lua` maintains registered structures and clears unregistered ones
from restricted zones. It classifies each loaded signboard model:

- **ours** — owner equals `server_guid`, or the model sits within
  `keep_radius` of a configured sign coord. Action: deterioration → 0 (kept).
- **foreign** — located and not ours, inside a restricted `zone`. Action:
  deterioration → `sweep_damage` (self-destructs via the game's own decay
  path; no destroy RPC).
- **unknown** — owner/location unresolved. Action: **skip**. The guardian
  never sweeps a model it cannot localize.

The automated loop performs **only** deterioration float writes — the proven
safe tier. The FGuid ownership write (`!signclaim`) stays a manual command.
The loop is **opt-in** (`!guardstart`), disabled on boot (`guardian.enabled`
defaults false); `!guardtick` runs a single pass. Config lives in
`signboards.lua` (`server_guid`, `guardian.{interval_ms, sweep_damage,
keep_radius, max_per_tick, zones}`). Until zones are configured and a working
model-locator/claim is proven live, every sign classifies **unknown** and the
loop is a safe no-op.

## Reference

Native signboard: `ABP_BuildObject_Signboard_C : APalBuildObject`
(`/Game/Pal/Blueprint/MapObject/BuildObject/BP_BuildObject_Signboard.BP_BuildObject_Signboard_C`).
Model class `PalMapObjectSignboardModel`, owned by `PalMapObjectManager`.
Field/function names from `localcc/PalworldModdingKit` (`PalMapObjectManager.h`,
`PalMapObjectModel.h`, `PalMapObjectSignboardModel.h`).

See the `project_palworld_agones` memory for the full spike history (why
server-spawn is parked, the crash root cause, and the safe-write decision).
