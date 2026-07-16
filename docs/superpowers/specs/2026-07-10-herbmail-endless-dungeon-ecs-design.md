# Endless Dungeon Room System — herbmail-game (ECS)

**Date:** 2026-07-10
**Project:** `apps/herbmail/herbmail-game` (React Three Fiber PSX dungeon)
**Status:** Design approved, pending implementation plan

## Goal

Replace the single hand-authored dungeon map with an **infinite, seeded, streamed**
dungeon. Rooms are ECS entities anchored to a macro lattice and connected as a graph.
Only rooms near the player are mounted, giving bounded draw calls (frustum + room
culling) regardless of how far the player explores. Content (torches now; items/npcs
later) reuses the existing `@kbve/laser` ECS and the astro-kbve itemdb/npcdb registries
so we build one system, not several.

## Non-Goals (future specs)

- Enemies / loot / combat spawning (hooks only)
- Save persistence across sessions
- Minimap, biomes/themes, special rooms (boss/shop)
- New prop/art meshes

Empty, DB-compatible spawn hooks are left in the room descriptor so these land without
rework.

## Existing Code (integration surface)

- `src/game/level.ts` — static `MAP` grid, `COLS/ROWS`, `tileAt`, `solidAt`, `roomAt`
  (flood-fill rooms), `spawnPoint`. **Global** grid, read everywhere.
- `src/game/geometry/*` — `buildWalls`, `buildFloor`, `buildCeiling`, `buildArches`,
  `buildCoves`, `buildCornerCoves`, `buildBays`; plus `faces.ts` (`exposedFaces`,
  `isSolid`, `faceMatrix`), `rng.ts` (`hash01`). All import the **global** `MAP`.
- `src/game/DungeonScene.tsx` — renders merged whole-map meshes.
- `src/game/torches.ts` — seeds torches from `MAP`, room-tagged (`roomAt`); placed-torch
  pool; per-room light cull already in `WallTorches.tsx`.
- `src/game/FpsControls.tsx` / `character/ThirdPersonPlayer` — movement + collision via
  `solidAt`.
- `@kbve/laser` `ecs` subpath — bitecs core (`createWorld`, `addEntity`, `addComponent`,
  `query`), SoA components (`Position`, `Health`, `Kind`, `Owner`, `Active`, tags
  `PlayerTag/NpcTag/ItemTag/EnvTag/MonsterTag`), `EntityStore<R>` (serverEid↔eid map,
  `byTile` spatial index via `packTile`, `spawn/update/despawn`, `SpawnData`), helpers
  (`packTile`, `queryInRange`), `spatial/quadtree`, `tile/path`, `determ`.
- astro-kbve content DBs: `content/docs/itemdb/*.mdx` (`ref`, `key`, `id`, `type_flags`,
  stats, `bonuses`), `content/docs/npcdb/*.mdx` (`ref`, `id`, `type_flags`, `stats`
  `{hp,max_hp,attack,defense,speed,armor}`, `behavior.movement_type`, `family`, `rank`).

## Architecture

### Macro lattice

- Infinite integer grid of **cells**, coord `(cx, cy) ∈ ℤ²`.
- `CELL` = tiles per cell edge (e.g. `6`). Cell world origin = `(cx·CELL·TILE,
  cy·CELL·TILE)`.
- A **Room** anchors at a cell and may span 1+ contiguous cells (flexible footprint via a
  cell mask). One room owns a rectangular tile subgrid.
- **Doors** are graph edges between rooms across a shared cell border, realized as arch
  openings in the wall between them.

### Determinism

- One `worldSeed`. A room's full layout is a pure function `genRoom(worldSeed, cx, cy)`.
- The door on a shared border between cells A and B is decided by a **symmetric** hash of
  the ordered-pair `(min(A,B), max(A,B))`, so both rooms independently compute the same
  answer — no cross-room desync when generated in either order.
- Explored graph is in-memory for the session. Reload + same `worldSeed` reproduces the
  identical dungeon. Unmount → remount is lossless.

### ECS module (`src/game/dungeon/ecs.ts`)

Uses `@kbve/laser` bitecs core + `packTile`. Dungeon-specific components (SoA, keyed by
eid):

- `RoomCell { cx: Int32, cy: Int32 }` — anchor cell
- `RoomShape { mask: Uint8 }` — occupied cells relative to anchor (bitmask, small footprints)
- `RoomDoors { bits: Uint8 }` — open edges N/E/S/W at anchor border
- `RoomSeed { value: Uint32 }`
- `RoomPhase { value: Uint8 }` — `0` seed-only · `1` generated (desc built) · `2` mounted
- Tags: `RoomTag`, `ActiveRoomTag`

A thin `DungeonWorld`:

- wraps `createWorld()`
- `Map<cellKey, eid>` occupancy index (`packTile(cx, cy)`) for O(1) lattice lookup +
  neighbour/graph adjacency
- `roomAtCell(cx,cy) → eid | undefined`
- `ensureRoom(cx,cy)` (idempotent create at `Phase 1`)
- `neighbors(eid)` via door bits + lattice

Content entities (torches now; items/npcs later) reuse laser's `EntityStore` / `SpawnData`
so nothing here duplicates that machinery.

### Generation (pure, seeded) — `src/game/dungeon/generate.ts`

`genRoom(worldSeed, cx, cy): RoomDesc`

```
interface RoomDesc {
  cell: { cx, cy };
  shapeMask: number;                 // occupied cells
  tiles: Uint8Array;                 // 0 floor, 1 wall, 2 arch — room-local rect
  cols, rows;                        // room-local tile dims
  originTile: { col, row };          // world tile offset = cell * CELL
  doors: number;                     // N/E/S/W bitmask (arch positions)
  torches: TorchSlot[];              // deterministic torch mounts (local tile + face)
  spawnSlots: SpawnSlot[];           // DB-compatible content hooks (empty use this spec)
}

interface SpawnSlot { cat: EntityCat; ref: string; localTile: { col, row } }
```

- RNG: reuse `hash01(a,b,c)` style seeded hashing (or `@kbve/laser` `determ`), salted with
  `worldSeed`.
- `genRoom` decides room size within its cell(s), carves the floor, places perimeter
  walls, and opens arch doorways only where the symmetric border hash says a door exists.
- Torch slots generated here (deterministic), replacing `torches.ts` seed-from-MAP.
- `spawnSlots` reference itemdb/npcdb `ref`s; unpopulated this spec.

### Geometry refactor — `src/game/geometry/*`

The core change. Builders stop importing the global `MAP` and take a `Grid`:

```
interface Grid {
  cols, rows;
  originCol, originRow;              // world-tile offset for this room
  tileAt(col, row): 0 | 1 | 2;       // room-local coords; out-of-range → wall
}
```

- `faces.ts` `exposedFaces/isSolid/faceMatrix` parameterized by `Grid`.
- `walls/slabs/arches/coves/corners/bays` take `Grid`, emit geometry in **world** space via
  `originCol/originRow`.
- `buildRoomGeometry(desc): THREE.Group` — assembles a single room's walls (per tex
  bucket), floor, ceiling, arches, coves, corner-coves, bays into one group.
- A `RoomGrid` adapter presents a `RoomDesc` as a `Grid`.
- `level.ts`: static `MAP` retired as world source (kept only as the origin-room template
  if convenient). `solidAt`/`roomAt` replaced by lattice-backed versions (below).

### Streaming systems — `src/game/dungeon/stream.ts` + React bridge

Runs on **player cell change**, not every frame.

- `playerCell = floor(playerWorld / (CELL·TILE))`.
- `ensureGenerated`: for every cell within `N+1` door-hops of `playerCell`, `ensureRoom`
  (create entity, `genRoom`, `Phase 1`). Generate-ahead by one ring so a neighbour room's
  geometry + collision exist the instant a door is crossed.
- `mountSet` = rooms within `N` hops (`N` = 1–2, tunable). Promote to `Phase 2`
  (`ActiveRoomTag`). Rooms leaving the set → `Phase ≤ 1`, unmount + dispose geometry.
- React bridge: `useDungeon()` (external store like `torches.ts`) exposes the active mounted
  set. `<Dungeon>` renders one `<RoomView eid>` per active room; each builds
  `buildRoomGeometry` in `useMemo` keyed by `cellKey`, disposes on unmount. Per-room groups
  → three frustum-culls off-screen rooms for free.

### Collision & player

- `solidAtWorld(x, z)`: world → cell → `roomAtCell` → room tile grid → solid test.
  Generate-ahead guarantees the neighbour room's grid exists before the player reaches its
  door. Arch openings remain passable (same logic as current `solidAt` arch handling).
- `FpsControls` / `ThirdPersonPlayer` swap `solidAt` → `solidAtWorld`.
- Player spawns in the origin room `(0,0)`.

### Torches & content integration

- Torch seeding moves into `genRoom` (deterministic per cell). Placed torches attach to
  their containing room. Existing room-based light cull in `WallTorches.tsx` carries over
  (room identity now = room eid / cellKey).
- Later content: a `populateRoom(eid)` system reads `spawnSlots`, loads the itemdb/npcdb
  def (JSON built from the MDX), and calls laser `EntityStore.spawn(SpawnData)` into the
  active room — reusing `Kind`/`Health`/tags/`byTile`. No new registry, no new spawn path.

## Module boundaries

| Module | Purpose | Depends on |
|---|---|---|
| `dungeon/ecs.ts` | Room entities, components, `DungeonWorld` lattice index | `@kbve/laser` bitecs |
| `dungeon/generate.ts` | Pure `genRoom(seed,cx,cy) → RoomDesc` | rng/determ only |
| `dungeon/stream.ts` | ensureGenerated / mountSet / dispose; player-cell tracking | ecs, generate |
| `dungeon/store.ts` | `useDungeon()` external store of active set | stream |
| `geometry/*` | `Grid`-parameterized builders + `buildRoomGeometry` | `Grid`, config |
| `dungeon/RoomGrid.ts` | `RoomDesc` → `Grid` adapter | generate |
| `dungeon/collision.ts` | `solidAtWorld` | ecs, generate |
| `Dungeon.tsx` / `RoomView.tsx` | R3F render of active rooms | store, geometry |

Each is unit-testable in isolation: generation is pure; the grid adapter is pure; streaming
is a state machine over cell coords; collision is a pure query over the lattice.

## Testing (vitest — laser + herbmail already use it)

- **Generation determinism:** `genRoom(seed, cx, cy)` twice → identical `RoomDesc`.
- **Door reciprocity:** for adjacent cells A,B, A's border-door bit == B's border-door bit
  (symmetric hash), generated in either order.
- **RoomGrid:** `tileAt` matches `RoomDesc.tiles`; out-of-range → wall.
- **Geometry builders:** given a small fixed `Grid`, vertex/group counts stable; world
  offset applied (spot-check a vertex position).
- **Streaming:** simulate player crossing cell borders → mount/unmount set matches N-hop
  expectation; unmounted room geometry disposed (no retained buffers).
- **Collision:** `solidAtWorld` matches the room grid for floor/wall/arch tiles across a
  cell boundary.

## Risks / Open Points

- **Room-spanning footprints** add complexity to the lattice index and door hashing. If it
  proves heavy, phase 1 can restrict rooms to a single cell (`shapeMask` = 1 cell) and add
  multi-cell footprints in a follow-up — the descriptor already carries `shapeMask`.
- **Geometry refactor blast radius:** every builder touches the global `MAP`. The `Grid`
  interface is the seam; the origin room can be validated against current output before
  deleting `MAP` as the source.
- **Hop-distance vs generation cost:** `genRoom` must stay cheap (pure, allocation-light)
  since generate-ahead runs on cell change.

## Rollout

1. `Grid` interface + refactor builders; prove origin room renders identically.
2. `dungeon/ecs.ts` + `generate.ts` (+ tests).
3. `stream.ts` + `store.ts` + `Dungeon/RoomView`; wire into `App.tsx`.
4. `solidAtWorld`; swap player collision.
5. Move torch seeding into `genRoom`; verify light cull.
6. Delete static-`MAP` world source; keep origin template if used.
