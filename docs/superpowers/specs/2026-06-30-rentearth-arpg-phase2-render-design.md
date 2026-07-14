# RentEarth ↔ ARPG Agones Multiplayer — Phase 2: Client Render

**Date:** 2026-06-30
**Status:** Approved (design)
**Scope:** Phase 2 of the rentearth ARPG multiplayer effort. Builds the client-side render layer on top of the Phase 1 networking client (`KBVESimgrid`, merged in #13626). Offline/local-control mode, gameplay events, and client prediction are deferred to Phase 3.

## Goal

Turn the decoded server snapshots from Phase 1 into a visible, smooth, isometric multiplayer scene: server-driven entity actors grounded on seed-generated terrain, viewed through a fixed orthographic isometric camera. The Rust ARPG server remains full authority; Unreal renders and samples input only.

## Prior Art (Phase 1, do not modify)

- `packages/unreal/KBVENet/Source/KBVESimgrid/` — transport: WebSocket + COBS + postcard, `USimgridClientSubsystem`.
- Delegates already exposed: `OnWelcome(int32 YourSlot, int64 Seed)`, `OnSnapshot()`, `OnRejected(FString)`, `OnDisconnected()`.
- Snapshot access: `const FSimgridSnapshot& GetLastSnapshot() const`.
- Entity data per `FSimgridEntityDelta`: `Eid`, `Kind`, `Owner`, `Tile{X,Y}`, `Facing`, `Sub`, `Qx`, `Qy` (POS_SCALE=32), `Qvx`, `Qvy` (VEL_SCALE=256), `InputAck`, `Hp`, `MaxHp`, `bDestroyed`, `Z`, `Effects[]`, `Piloting`.
- Snapshot carries `Tick`, `ServerTimeMs`, `bKeyframe`, `Entities[]`.
- Input path (`SendMove`) already wired in the Phase 1 subsystem.

## Authority Model (unchanged)

Rust server = full authority over sim, collision, movement, AOI. Unreal = client/renderer. UE physics / CharacterMovement are cosmetic on the networked path.

## Module Layout

New module **`KBVESimgridRender`** under the existing `KBVENet` plugin, sibling to `KBVESimgrid`. Keeps all networking + its render scaffold under one plugin; reusable by other Agones clients (e.g. cryptothrone). The transport module stays pure (no Engine-render coupling beyond what it already has).

```
packages/unreal/KBVENet/Source/
├── KBVESimgrid/        (Phase 1) transport
└── KBVESimgridRender/  (NEW) client render scaffold
    ├── SimgridCoords          tile/quantized → UE world (static)
    ├── SimgridInterpolator     snapshot buffer + lerp
    ├── SimgridEntityActor      thin server-driven render actor
    ├── SimgridEntityManager    spawn/update/despawn from snapshots
    ├── SimgridIsoCameraPawn     orthographic fixed-angle camera rig
    └── SimgridWorldBridge       Welcome.seed → KBVEWorld terrain + height sampling
```

`KBVESimgridRender.Build.cs` deps: Public `Core`, `CoreUObject`, `Engine`; Private `KBVESimgrid`, `KBVEWorld`, `KBVEWorldCore`.

`chuck` gains `KBVESimgridRender` in its `PrivateDependencyModuleNames` and supplies content + wiring only: the Kind→mesh data table, gamemode/controller hookup, and the seed→terrain trigger. No render algorithm lives in `chuck`.

## Components

### `SimgridCoords` (static helper)
- `TILE_SIZE = 100.0f` (uu per tile), `POS_SCALE = 32`, `FLOOR_HEIGHT = 200.0f` (uu per server Z level).
- `static FVector2D QuantToWorldXY(int32 Qx, int32 Qy)` → `{ Qx / 32.0 * TILE_SIZE, Qy / 32.0 * TILE_SIZE }`.
- `static FVector2D TileToWorldXY(int32 X, int32 Y)` → `{ X * TILE_SIZE, Y * TILE_SIZE }`.
- Pure functions; unit-tested against exact expected values.

### `USimgridInterpolator`
- Ring buffer of recent snapshots keyed by `ServerTimeMs` (retain a small window, e.g. last 8).
- `INTERP_DELAY_MS = 100`.
- `bool SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpEntityState& Out)` — lerp `Qx/Qy` and `Z` between the two snapshots bracketing `RenderTimeMs`; facing held/stepped from the newer sample. Edge cases: render time before oldest → clamp to oldest; after newest → clamp to newest (extrapolation not attempted in Phase 2); entity present in only one sample → return that sample; entity in neither → return false.
- `FSimgridInterpEntityState`: `FVector2D WorldXY`, `int32 Z`, `uint8 Facing`, `uint16 Kind`, `uint16 Owner`, `uint32 Eid`.

### `ASimgridEntityActor`
- `USceneComponent` root + one mesh component (start with `UStaticMeshComponent`; skeletal + anim deferred to Phase 3).
- No `UCharacterMovementComponent`, no physics simulation. Transform set directly each tick.
- `void ApplyState(const FVector& WorldPos, uint8 Facing, uint16 Kind)` — sets location, yaw from facing, assigns mesh if Kind changed.
- Mesh resolution: manager passes the resolved `UStaticMesh*` (from the Kind→mesh table); a default placeholder mesh is used when a Kind is unmapped.

### `USimgridEntityManager`
- Owned by the gamemode/controller on the networked path.
- `TMap<uint32 /*Eid*/, ASimgridEntityActor*>`.
- Each UE tick, after the interpolator produces states for the current keyframe/entity set:
  - new `Eid` → spawn `ASimgridEntityActor`, resolve mesh via Kind→mesh table.
  - existing `Eid` → `ApplyState`.
  - `bDestroyed` **or** absent from the latest keyframe (after a short grace window) → destroy actor and remove from map.
- The local `YourSlot` entity (matched by `Owner == YourSlot` on a player-kind entity) is **not** spawned as a remote actor; its interpolated state is routed to the local pawn drive mode (below).

### `ASimgridIsoCameraPawn`
- `UCameraComponent` with `ProjectionMode = Orthographic`.
- Fixed rotation: pitch −30°, yaw 45° (true-iso feel); `ORTHO_WIDTH = 2048.0f` (tunable const).
- Fixed offset above/behind the local entity; each tick lerp-follows the local entity's interpolated world position (`CAMERA_FOLLOW_LERP` const for smoothing).
- Possessed by `AchuckPlayerController` when the subsystem enters `Live`. The existing spring-arm third-person pawn is retained (unused on the networked path) for Phase 3 offline mode.

### `USimgridWorldBridge`
- On `OnWelcome`, receives `Seed`; builds a ring of `AKBVEWorldChunkActor` chunks around the spawn tile via `Build(Coord, (uint32)Seed, CellsPerEdge, CellSize, WaterZ)`.
- `float SampleHeight(float Wx, float Wy) const` — deterministic terrain height at a world XY for the current seed (delegates to the chunk actor's `SampleHeight` / `FKBVEWorldNoise`).
- Terrain is cosmetic. Client noise is deterministic from `Seed`, so all clients render the same ground.

## Coordinate & Terrain Mapping

- World XY: `SimgridCoords::QuantToWorldXY(Qx, Qy)`.
- Render Z: `WorldBridge.SampleHeight(worldX, worldY) + serverZ * FLOOR_HEIGHT`.
- Facing → yaw: map the server `Facing` byte to a yaw (8- or 4-direction table matching the server's facing enum ordering).
- Server keeps XY + Z-floor authority; terrain height only lifts the render position so actors visually hug the generated ground.

## Data Flow

```
OnWelcome(slot, seed)
  → store YourSlot
  → WorldBridge.BuildTerrain(seed) around spawn
  → controller possesses ASimgridIsoCameraPawn

OnSnapshot()  (subsystem already decoded into GetLastSnapshot())
  → Interpolator.Push(GetLastSnapshot())

Every UE tick (manager):
  renderTime = nowMs − INTERP_DELAY_MS
  for each entity in latest keyframe set:
     Interpolator.SampleEntity(eid, renderTime) → state
     worldPos = (state.WorldXY, SampleHeight(...) + state.Z*FLOOR_HEIGHT)
     if entity is local slot: route to local pawn drive mode
     else: upsert ASimgridEntityActor.ApplyState(worldPos, facing, kind)
  reconcile membership vs keyframe → despawn stale
  camera follows local entity worldPos
```

## Local Pawn Drive Mode

- Local `YourSlot` entity does not spawn a remote actor.
- `AchuckCoreCharacter` (already implements `IKBVEMovementDriver`) gains a **Simgrid drive mode**: `UCharacterMovementComponent` set to a kinematic/flying-or-none mode so it does not self-simulate; its transform is driven from the interpolated server state.
- The drive-mode selection is an abstraction point, left swappable so Phase 3 can flip the same pawn to local `CharacterMovement` for offline/shop instances.
- Input sampling + `SendMove` already exist in the Phase 1 subsystem; Phase 2 does not change the outbound path.

## Error Handling & Lifecycle

- `OnDisconnected` / `OnRejected` → despawn all remote actors, clear the manager map, unpossess the iso camera (return control to the default pawn), stop terrain-follow.
- Missing/unmapped Kind mesh → placeholder mesh + log; never crash.
- Chunk build failure → log and fall back to a flat plane at Z=0 for that chunk.
- Interpolator with a single snapshot → render that snapshot directly (no lerp) until a second arrives.

## Testing

C++ automation tests in `KBVESimgridRender` (`KBVE.SimgridRender.*`):

- **Coords** — `QuantToWorldXY` / `TileToWorldXY` exact expected values, including negative coordinates.
- **Interpolator** — lerp at a render time bracketed by two snapshots yields the midpoint; render time before oldest clamps to oldest; after newest clamps to newest; single-sample returns that sample; unknown eid returns false.
- **Manager** — spawn on new eid; despawn on `bDestroyed`; despawn on absence from a later keyframe; local-slot entity is not spawned as a remote actor (routed instead).
- **Height determinism** — same seed + same XY → identical `SampleHeight` across two bridge instances.

Manual integration: local ARPG server + two rentearth clients — actors move smoothly (interpolated), sit on seed terrain, and the isometric orthographic camera follows the local player; disconnect cleans up.

## Out of Scope (Phase 3)

- Offline / shop local-control mode (client-side trigger to flip the pawn drive mode).
- Client-side prediction & reconciliation of the local move (currently the local pawn follows server state directly).
- Ephemeral gameplay events: combat, inventory, projectiles, ships, dungeons.
- `MoveTo` click-to-move input.
- Chunk streaming / LOD beyond the initial spawn ring.
- Skeletal meshes and animation state machines for entities (Phase 2 uses static meshes).

## Definition of Done (Phase 2)

- `KBVESimgridRender` builds under `KBVENet` and is consumed by `chuck`.
- On `Welcome`, terrain generates from the seed and the client possesses the orthographic isometric camera.
- Snapshot entities render as actors grounded on the terrain and move smoothly via interpolation; the local player is driven by server state (no remote actor for self).
- Remote actors despawn on destroy/disconnect.
- `KBVE.SimgridRender.*` automation tests pass; the module compiles in the `chuckEditor` target.
