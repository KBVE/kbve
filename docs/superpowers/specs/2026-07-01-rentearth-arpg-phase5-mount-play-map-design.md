# Phase 5 — Mount ARPG Client onto Play Map (rentearth) Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation
**Predecessors:** Phase 1 (transport), Phase 2 (render), Phase 3 (ephemeral), Phase 4 (shortcut login)

## Problem

Phases 1–3 built the simgrid ARPG net client (`AchuckSimgridController`,
`ASimgridIsoCameraPawn`, `USimgridEntityManager`, `USimgridClientSubsystem`)
in isolation. Nothing mounts it into the actual play loop. When a player logs
in and enters the game, the menu opens `L_ChuckWorld`, whose GameMode override
is `chuckCoreGameMode` → `AchuckCorePlayerController` + `AchuckCoreCharacter`
(a standard third-person spring-arm character). Result: the player sees a
third-person camera, never connects to the Rust ARPG server, and none of the
isometric render runs. `AchuckSimgridController` is referenced by no GameMode;
`USimgridClientSubsystem::SendMove` is called by nothing.

This phase mounts the client onto a dedicated map so entering the game
connects to the live Rust ARPG server, renders the shared world in
isometric, and moves a server-authoritative local player from WASD input.

## Goal

Entering the game (post-login) travels to a dedicated ARPG map that runs
`AchuckSimgridController`, connects to `wss://arpg.kbve.com/ws`, shows the
isometric camera, and drives the local player's movement through the Rust
server via `SendMove`. Movement is server-authoritative (server-snap); no
client-side prediction in this phase.

## Non-Goals (deferred)

- **Client-side prediction / reconcile** — Phase 6. Server-snap only here.
  Prediction will be an application-layer deterministic integrator matching
  the Rust server's fixed-cadence step, layered onto the same
  `ApplyServerCorrection` seam. **Not** UE Iris (no UE NetDriver/server exists
  — authority is the Rust server over a custom WebSocket binary protocol) and
  **not** UE Chaos physics (non-deterministic float physics would diverge from
  the server and break 1:1).
- Click-to-move, click-to-attack, ability/spell input.
- Auto-reconnect on drop (Phase 5 bounces to the main menu).
- Packaging / notarize.

## Architecture

Four units, all in the rentearth chuck fork
(`apps/rentearth/unreal-rentearth/Source/chuck`) plus one new map asset.

### 1. `AchuckSimgridGameMode` (new)

`Source/chuck/Net/chuckSimgridGameMode.{h,cpp}`. Extends `AGameModeBase`.
Constructor sets:

- `PlayerControllerClass = AchuckSimgridController::StaticClass()`
- `DefaultPawnClass = AchuckArpgPawn::StaticClass()`

### 2. `AchuckArpgPawn` (new)

`Source/chuck/Net/chuckArpgPawn.{h,cpp}`. Minimal visible pawn implementing
`IKBVEMovementDriver`. Extends `APawn`.

- Root `UStaticMeshComponent` visual, using the same mesh the remote entity
  actors use (`DefaultEntityMesh`, assigned by the controller/manager) so the
  local player and remote entities look identical. If the mesh is null the
  pawn is invisible but non-fatal (camera still follows).
- No `UCharacterMovementComponent`, no physics simulation, no jump/sprint/nav.
- `ApplyServerCorrection(const FVector& Position, const FVector& Velocity)` →
  `SetActorLocation(Position)`. This is the single seam Phase 6 prediction
  will extend.

The local player is rendered by this pawn, not by an entity actor:
`USimgridEntityManager` skips the local eid from actor spawn and instead
routes its snapshot to `LocalPawn` via `ApplyServerCorrection`
(`SimgridEntityManager.cpp:90-104`).

### 3. Input path on `AchuckSimgridController`

Reuse `UchuckInputs` Move (a `Vector2D` axis) and Sprint (bool). The
controller binds Move/Sprint in `SetupInputComponent` (Enhanced Input) and,
each tick while connected, converts the current axis to a normalized tile-space
move intent and calls `USimgridClientSubsystem::SendMove`.

The screen→tile basis mirrors the web client's `readIntent`
(`apps/agones/arpg/web/src/game/systems/movement.ts`): for screen axes
`ix` (right−left) and `iy` (down−up),

```
wx = ix + iy
wy = iy - ix
```

then normalize and scale to ±127 (fits `int8`), matching the web
`mx = round((intent.x / mag) * 127)`. The mapping is isolated in a pure static
function so it is unit-testable without an engine world:

```cpp
struct FchuckMoveIntent { int8 Mx = 0; int8 My = 0; bool bRun = false; };
static FchuckMoveIntent BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun);
```

`BuildMoveIntent({0,0}, *)` → `{0,0,*}`. Nonzero axis → normalized ±127 in
tile axes. `bRun` passes through (`bRun = true` when NOT walking, matching the
web `!walking` flag; Sprint held = run).

Per-tick send: build intent from the current Move axis, call
`SendMove(FSimgridMove{ .Mx, .My, .bRun, .Tick })`. The subsystem stamps Seq
and Tick and encodes the frame (`SimgridClientSubsystem.cpp:85-97`).

### 4. `L_ArpgWorld` (new minimal map)

`Content/Map/L_ArpgWorld.umap`: ground plane sized to the server grid, a
`PlayerStart`, a directional light + sky. The GameMode is **not** baked into
the map's WorldSettings; it is forced at travel time via the URL option so we
don't depend on binary `.umap` edits:

```cpp
UGameplayStatics::OpenLevel(this, PlayLevelName, true,
    TEXT("game=/Script/chuck.chuckSimgridGameMode"));
```

The menu's `PlayLevelName` changes from `L_ChuckWorld` to `L_ArpgWorld`
(`chuckMenuPlayerController.h`). Because `.umap` is a binary asset that cannot
be authored from the raw CLI, the map is created by a headless editor Python
step (`UnrealEditor-Cmd … -run=pythonscript`) committed as a repeatable
script; the resulting `L_ArpgWorld.umap` is committed as an asset.

### Camera — no change

`ASimgridIsoCameraPawn` already uses `ISO_PITCH = -30°`, `ISO_YAW = 45°`,
orthographic, which is the exact 2:1 isometric match for the web client's
`TILE_W=64 / TILE_H=32` projection (`sin(30°) = 0.5 = TILE_H/TILE_W`). The
controller already spawns it and calls `SetViewTargetWithBlend` on
`OnWelcome`, and follows the local world position each tick
(`chuckSimgridController.cpp:62-98`). Phase 5 verifies this activates; it
changes no camera code.

## Data Flow

```
Menu (login + username gate, Phase 4)
  └─ OpenLevel("L_ArpgWorld", "game=…chuckSimgridGameMode")
       └─ AchuckSimgridController::BeginPlay
            ├─ subsystem.ConnectToServer("wss://arpg.kbve.com/ws")   [JWT+username, Phase 1]
            └─ OnWelcome(slot, seed)
                 ├─ spawn ASimgridIsoCameraPawn + SetViewTargetWithBlend   [existing]
                 └─ Manager.SetLocalSlot(slot) / SetLocalPawn(ArpgPawn)
  per tick (controller, while Live):
    read Move axis → BuildMoveIntent → SendMove(Mx, My, bRun, tick)
  per snapshot (subsystem → Manager):
    remote eids → ASimgridEntityActor render (interp)
    local eid   → ApplyServerCorrection → ArpgPawn.SetActorLocation
    camera.SetFollowTarget(localWorldPos)
```

## Error Handling

- **Connect failure / disconnect** → existing `OnDisconnected` clears the
  Manager, and the controller additionally `ClientTravel`s back to
  `L_MainMenu` so the player is never stranded on an empty map.
- **No `OnWelcome`** (auth rejected — server closes the socket) → same
  disconnect path → menu.
- **Null entity mesh** → pawn invisible, camera still follows; non-fatal.

## Testing

- **Pure unit (UE automation, `#if WITH_DEV_AUTOMATION_TESTS`)** — `Chuck.Arpg.MoveIntent.*`:
  `BuildMoveIntent` for zero axis, the four cardinals, a diagonal, and the run
  flag. Assert the `(Mx, My, bRun)` triples against the web `readIntent` basis.
- **Build gate** — `chuckEditor Mac Development` compiles.
- **PIE smoke (manual, in DoD checklist)** — login → auto-travel to
  `L_ArpgWorld` → connects to live server → isometric view → WASD moves the
  server-authoritative pawn → remote entities render. Requires the live server
  and editor, so it is a documented manual check, not automation.

## Constraints

- rentearth chuck fork only; never touch main chuck at
  `apps/chuckrpg/unreal-chuck`.
- UE editor build target is `chuckEditor` (not `rentearthEditor`).
- No code comments in shipped source.
- Worktree + PR into `dev`.
