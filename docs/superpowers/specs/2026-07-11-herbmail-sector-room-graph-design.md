# herbmail-game — Sector Room-Graph Dungeon

Date: 2026-07-11
App: `apps/herbmail/herbmail-game`
Supersedes generation layer of `2026-07-10-herbmail-endless-dungeon-ecs-design.md` (keeps its ECS/prop/door/geometry infrastructure).

## Goal

Replace the flat "every lattice cell is a 6×6 room, ~62% edge-hash doors" generation with a **seed-deterministic sector room-graph**: multi-cell rooms connected by corridors, guaranteed connectivity, controlled multiple paths (loops), graph-gated locks/keys, and cross-sector stitching so the dungeon stays endless. Player mutations persist in IndexedDB.

Design priorities: natural flow, layout uniqueness, many possible graphs — all reproducible from `(seed, sx, sy)`.

## Layers

1. **Lattice** (unchanged) — tiles, `CELL=6` tiles/cell, cell coords `(cx,cy)`, `TILE` world units per tile.
2. **Sector** — `S×S` cells, `S=8`. Sector coord `(sx,sy)=floorDiv(cx,S)`; local cell `(lx,ly)=((cx%S)+S)%S` (negative-safe, per the known neg-modulo trap). Sector seed `sseed=hash(seed,sx,sy)`.
3. **Room graph** — per sector: BSP partition → multi-cell rooms + 1-wide corridors, spanning tree + loop edges, locks/keys.
4. **World graph** — sectors joined at borders by always-unlocked connector doors; infinite and always reachable.

## Sector generation (`sector.ts`, pure)

`genSector(seed, sx, sy) -> Sector`, memoized by key `"sx|sy"`.

### BSP partition

- Start with the `S×S` cell rect. Recursively split along a seeded axis at a seeded position.
- Stop when a leaf reaches min size (`2×2` cells) or max depth (`~3`), seeded early-stop for size variety. Yields ~4–8 leaves.
- Each leaf places a **room rect** inside itself, inset by a seeded `0..1` cell padding per side (varied room sizes, min `2×2`). Room occupies whole cells.

### Rooms & corridors

- `Room = { id, col0,row0,w,h (cells), type, doors: bitmask-ish edge set, keyId?, spawnSlots }`.
- `type ∈ { ENTRANCE, NORMAL, JUNCTION, DEADEND, ARENA }` assigned from graph degree + seeded roll (semantic only; drives spawn density + variant later).
- **Corridors** connect room centers along BSP sibling joins: 1-cell-wide L-shaped chains of cells. `Corridor = { id, cells: [(cx,cy)...], doors }`.

### Graph edges

- **Tree edges**: each BSP internal node joins its two child subtrees with one corridor → spanning tree → guaranteed connectivity.
- **Loop edges**: for each pair of rooms whose rects are adjacent/near and not tree-connected, open a corridor with prob `LOOP_CHANCE=0.25` → alternate paths.
- Every edge crosses a wall at a chosen tile = a **door slot**. A seeded fraction become ECS door leaves; the rest stay open arches.

### `cellOwner`

`Map<localCellIndex, {kind:'room'|'corridor', id}>` covering every occupied cell — O(1) world→feature resolution for collision/streaming. Unoccupied cells = solid rock (never mounted).

## Multi-cell rooms (`generate.ts` changes)

- `RoomDesc` already carries `cols/rows/originCol/originRow` — generalize from fixed `CELL×CELL` to `w*CELL × h*CELL` (rooms) or the corridor's tile footprint.
- Build the room's tile grid: floor interior, single perimeter wall ring around the **whole** multi-cell rect, `ARCH` tiles punched where edges/doors connect. Internal per-cell walls are gone (open room).
- Corridors: 1-cell-wide tile strips, walls with arch openings at ends.
- `signature` = `${w}x${h}:${doorMask}:${type}:${variant}` for the `roomGeometry.ts` cache. Multi-cell rooms are less cache-dense than before; keep LRU, raise cap if needed. Floor/ceiling stay global singletons scaled per-room.
- Geometry builders already accept a `Grid`; feed them the room's local grid unchanged.

## Locks & keys (solvable)

- Per sector pick `K∈0..2` locked edges. Only **tree edges** are lockable (locking a loop edge gates nothing).
- Locking a tree edge splits rooms into `near` (entrance side) / `far`. The key spawns in a `near` room → always obtainable before the lock.
- Multiple locks ordered by increasing tree depth from entrance; each lock's `near` set computed after prior locks so no key ends up behind its own (or a later) lock.
- **Entrance** = the sector's border-connector rooms (start side). Border connectors are always unlocked.
- Wiring: `Door` component gains `keyId`. Key = `spawnSlot {cat:KEY, ref:keyId, col,row}` in a room. Pickup adds `keyId` to a player key set; F on a matching locked door consumes/uses it. Reuses existing `Door.locked` authority + door prompt.

## Cross-sector stitching

- For each shared border between sector `A` and neighbor `B`, deterministically choose ≥1 boundary cell pair via the existing **symmetric edge hash** (unordered pair → both sectors agree). Punch an always-unlocked connector door there, owned by whichever room/corridor touches that boundary cell (extend a border room/corridor to reach it if needed).
- Guarantees ≥1 crossing per shared edge → global endless traversal never dead-ends.

## Streaming (`stream.ts`, `store.ts`, `ecs.ts`)

- ECS: **one entity per graph room and per corridor** (not per cell). `byCell: Map<cellKey, eid>` for world lookup; `descs`, `byId` maps as today.
- `DungeonWorld.ensureRoomAt(cx,cy)`: resolve sector (lazy `genSector`), find the room/corridor owning that cell, ensure its entity, return eid.
- BFS unchanged in shape but over the **room graph** (rooms/corridors = nodes, doors = edges) spanning sectors. `neighborCells(eid)` → neighbor rooms across doors incl. cross-sector connectors. `MOUNT_HOPS` now counts rooms, not cells (tune to ~2).
- `store.rebuild` mounts whole rooms; prop/door spawn per mounted room as today.

## Collision (`collision.ts`)

`solidAtWorld(x,z)`: world tile → `(cx,cy)` → sector → `cellOwner` → room/corridor tile grid. Unowned cell = solid. Arch open-half + locked-door sealing reuse current logic against the resolved feature's tiles.

## IndexedDB mutation overlay (`persist.ts`, new)

- Base graph/geometry stays regen-from-seed (never persisted).
- Overlay keyed by sector `"sx|sy"`: `{ unlockedDoors:Set<doorKey>, placedTorches:[], suppressedTorches:[], collectedKeys:Set<keyId> }`.
- Async `loadSector(sx,sy)` on sector gen; apply after room spawn (post-spawn overlay — determinism untouched). Debounced `saveSector` on any mutation.
- Wraps current in-memory `placed.ts` + doors `unlocked` Set with a durable backing store; in-memory stays the fast path, IndexedDB is write-through + load-on-mount. Graceful no-op if IndexedDB unavailable.

## Determinism & tests

herbmail-game has no vitest yet — add a minimal config. Tests (pure, no WebGL):

- **Connectivity**: every room in a sector reachable from entrance over unlocked+locked edges.
- **Solvability**: for every locked door, its key's room is reachable from entrance without crossing that (or any deeper) lock.
- **Border reciprocity**: sector `A`'s connector to `B` equals `B`'s connector to `A` (symmetric hash).
- **Neg-coord safety**: `genSector` at negative `(sx,sy)` — no negative-index crash, floor-mod everywhere.
- **Determinism**: `genSector(seed,sx,sy)` twice = deep-equal.

## Implementation phases

1. `sector.ts` pure BSP graph gen + locks + unit tests (no render).
2. Multi-cell `RoomDesc`/corridor tile build in `generate.ts` + `roomGeometry` signature.
3. `ecs.ts` one-entity-per-room + `byCell`; `collision.ts` rework.
4. `stream.ts`/`store.ts` room-graph BFS across sectors, lazy sector gen.
5. Cross-sector stitching + connector doors.
6. Locks/keys gameplay wiring (key spawn, pickup, F-unlock consume).
7. IndexedDB overlay (`persist.ts`), wrap `placed.ts` + door unlock set.

Each render-affecting phase verified in the running dev app (`nx serve` / vite) before moving on.

## Non-goals

- Enemies/loot beyond key items (spawnSlots reserved, unpopulated).
- Minimap/fog (visited-set persistence deferred).
- Multiplayer (single-player).
