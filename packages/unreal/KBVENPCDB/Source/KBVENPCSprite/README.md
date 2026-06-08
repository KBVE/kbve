# KBVENPCSprite

Billboarded pixel-art NPC sprites for the 3D world — a render module inside the **KBVENPCDB** plugin (data/Mass stay in `KBVENPCDB`; this module only draws). Atlas columns are animation frames, rows are view directions (front / side / back; the right view is the side row mirrored). Rendered through a single HISM per sprite def so hundreds of monsters share one draw path.

## Pieces

- `UKBVENpcSpriteDef` — UDataAsset: atlas texture, sprite material, grid (`Columns`/`Rows`), per-direction row indices, `FramesPerAnim`, `Fps`, `WorldSize`, `PivotZ`. `Ref` ties it to an `FKBVENpcDef` later.
- `FKBVENpcSpriteDirection::Select(...)` — pure: facing yaw + camera → which row + mirror.
- `UKBVENpcSpriteRenderSubsystem` — `UTickableWorldSubsystem`. `SpawnSprite / UpdateSprite / DespawnSprite` by handle; each tick it CPU-billboards every instance (Y-locked, camera-facing) and writes the atlas cell to per-instance custom data.

## Material contract

The def's `SpriteMaterial` must be built once in-editor (engine `.uasset`, not shippable from this module). It needs:

- A `Texture2D` parameter named **`Atlas`** (the subsystem sets it per def via a MID).
- Sample `Atlas` at:
  `UV = MeshUV * float2(CustomData2, CustomData3) + float2(CustomData0, CustomData1)`
  where `CustomData0..3` are the 4 per-instance custom-data floats `(offsetU, offsetV, scaleU, scaleV)`. A negative `scaleU` (with `offsetU` at the next column edge) mirrors for the right-facing view.
- **Nearest** texture sampling (crisp pixels), masked (or translucent) blend, two-sided off.

No world-position-offset is required — the subsystem orients each instance transform toward the camera on the CPU. (A WPO instanced billboard is the planned P2 optimization for thousands of sprites.)

## Custom data layout

| Index | Meaning                          |
| ----- | -------------------------------- |
| 0     | UV offset U                      |
| 1     | UV offset V                      |
| 2     | UV scale U (negative = mirrored) |
| 3     | UV scale V                       |

## Atlas import

Nearest filter, no mipmaps. For the sample slime sheet: 320×192, `Columns = 5`, `Rows = 3`, `FramesPerAnim = 5`, rows front=0 / side=1 / back=2.

## Usage

```cpp
auto* R = World->GetSubsystem<UKBVENpcSpriteRenderSubsystem>();
FKBVENpcSpriteHandle H = R->SpawnSprite(SlimeDef, Location, FacingYawDeg);
// each frame as the monster moves / turns:
R->UpdateSprite(H, NewLocation, NewFacingYaw);
// on death:
R->DespawnSprite(H);
```
