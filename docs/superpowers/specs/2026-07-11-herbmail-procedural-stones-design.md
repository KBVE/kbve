# Procedural Minable Stones — herbmail-game

Date: 2026-07-11
Status: Approved design

## Goal

Add natural, procedurally-generated rock props to the dungeon that read as PSX
(256px textures, flat + torch-lit) and are prepared, ECS-first, for a mining
mechanic: they take damage when struck, shrink + chip as they are mined, and
break out when depleted. Ore drops are stubbed this round. Placement becomes a
data-driven per-room-type policy that also absorbs the existing crate scatter.

Non-goals this round: ore drop entities, inventory/pickup, a dedicated pickaxe
tool, wall-vein placement geometry.

## Assets — texture pipeline

Source: `~/Downloads/dark_rock_1k/textures/`. One-time conversion into the game's
public textures, downscaled to 256×256:

- `dark_rock_diff_1k.jpg` → `public/textures/dark_rock_diff_256.png`
- `dark_rock_nor_gl_1k.exr` → `public/textures/dark_rock_nor_256.png`
  (OpenGL tangent-space normal; EXR is linear, write RGB8 PNG)

Displacement + roughness maps are dropped — not PSX. Conversion via ImageMagick
(`magick <in> -resize 256x256 <out>`; EXR reads with the bundled OpenEXR
delegate). Runtime sampling: `NearestFilter` mag/min, `RepeatWrapping` on S/T,
diffuse in `SRGBColorSpace`, normal in linear.

## Procedural geometry — `game/prop/stoneModel.ts`

Pure geometry module (no ECS, no scene state), mirroring `torchModel.ts`.

- `stoneGeometry(seed: number, size: number, lumpiness: number): THREE.BufferGeometry`
- Base: an icosphere (icosahedron subdivided ~2). Each vertex is displaced along
  its normal by seeded 3D value-noise so every stone is a unique natural lump.
  `size` sets the base radius; `lumpiness` scales displacement amplitude.
- Bottom vertices below a threshold are flattened to `y = 0` so the stone rests
  on the floor without a mount offset.
- `geometry.computeVertexNormals()` after displacement so torchlight reads the
  faceted surface. UVs: spherical or box projection so `dark_rock` tiles cleanly.
- Fully deterministic in `seed` — same seed always yields the same rock, so a
  streamed-out/streamed-in room rebuilds the identical stone.
- Built per-entity at spawn; the owning mesh is disposed on despawn (same
  geometry+material dispose path added for crates in `MeshPool.destroy`).

Noise: reuse the existing `game/geometry/rng` hashing to seed a small value-noise
function; no new dependency.

## ECS — components & spawn

`kinds.ts`:

- `PROP_STONE` (next prop id after `PROP_CRATE`)
- `MODEL_STONE` (next model id); stones are procedural, so this only indexes the
  `MeshPool` config slot — there is no GLB URL entry.

laser `packages/npm/laser/src/lib/ecs/props.ts` — new component:

```
Stone = {
  seed:     Float32Array,  // deterministic shape seed
  size:     Float32Array,  // base radius (m)
  hardness: Float32Array,  // hits-per-stage scalar (reserved for tuning)
  ore:      Uint8Array,    // future drop type; 0 = none this round
}
```

`game/prop/stone.ts` (mirrors `crate.ts`):

- `STONE_MAX_HP`, `stoneId(col,row)`, `stoneTransform(col,row)`
- `spawnStone(world, ownerEid, pos, seed, size)`:
  Prop + Transform3 + MeshRef(`MODEL_STONE`) + **Collider**(hx=hz=size) +
  Stone + `applyStats({ maxHp: STONE_MAX_HP })` (reuse Health for mine HP).

Collision is already generic: `crateGrid` indexes any `[Prop, Transform3,
Collider]` entity and `collision.ts` resolves the AABB from `Collider` +
`Transform3`. Stones get solidity for free.

## Rendering — extend `MeshPool`

`ModelConfig` gains an optional builder:

```
build?: (eid: number) => THREE.Object3D
```

`MeshPool.create` uses `cfg.build(eid)` when present (per-entity procedural mesh),
otherwise the existing `prep(cfg.base)` clone path. Crates/torches keep the clone
path; stones use `build`.

`stoneConfig`: `orient: 'upright'`, `holder: false`, `hitbox: true`,
`build(eid)` →

- `stoneGeometry(Stone.seed[eid], Stone.size[eid], LUMPINESS)`
- material: `MeshStandardMaterial { map: darkRockDiff, normalMap: darkRockNor,
roughness: 1, metalness: 0 }`, Nearest-filtered — lit only by scene torches.
- Shared diffuse/normal textures (module-level, never per-stone disposed);
  per-stone geometry disposed on destroy.

## Mining — `game/character/useStoneMine.ts`

Mirrors `useCrateBreak`, driven by the same melee `onContact` stream, gated on
`Prop.kind === PROP_STONE`:

- Each hit: `Health.hp -= 1`, fire SAB chip debris (`getSimBridge().shatter` at
  the stone centre, or a lighter chip variant), and step the mesh scale down per
  stage (e.g. hp3→1.0, hp2→0.9, hp1→0.75) so it visibly mines down.
- hp → 0: SAB shatter burst, despawn the entity, `suppressAt(pos)` so it does not
  respawn on room stream, and `// TODO: spawn ore drop (Stone.ore)`.

Stage → scale mapping lives beside `crackStage` (a `mineStage(hp)` helper). No
geometry rebuild — scale only, per the deform decision.

## Placement — data-driven per room type — `game/prop/decor.ts`

Generalises `scatterCrates` into a per-`variant` policy table that also drives
stones (crates migrated in).

```
interface ScatterRule { kind: number; min: number; max: number; salt: number }
const DECOR_POLICY: ScatterRule[][]   // indexed by room variant
```

`scatterDecor(world, roomEid, desc)`:

- Collect interior FLOOR tiles (as `scatterCrates` does today).
- For each rule in `DECOR_POLICY[desc.variant % VARIANTS]`: roll a count in
  `[min,max]` from `hash01(desc.cx, desc.cy, rule.salt)`, pick tiles by
  `hash01(..., salt + i*prime)`, skip suppressed/occupied, and spawn by `kind`
  (`PROP_CRATE` → `spawnCrate`, `PROP_STONE` → `spawnStone` with a per-tile seed
  from `stoneId`).

`spawn.ts`: `scatterCrates` is removed; `spawnRoomProps` calls `scatterDecor`.
Torches, niche candles, columns, and fireflies stay geometry/face-driven —
unchanged. Determinism, streaming, and suppression semantics are preserved.

## Files touched

New: `stoneModel.ts`, `stone.ts`, `decor.ts`, `useStoneMine.ts`,
`public/textures/dark_rock_diff_256.png`, `dark_rock_nor_256.png`.
Edited: `kinds.ts`, laser `props.ts`, `MeshPool.ts`, `PropRenderer.tsx`
(register `stoneConfig` + preload textures + wire `useStoneMine`), `spawn.ts`
(swap to `scatterDecor`).

## Testing / verification

- Texture files exist at 256×256, load without CORS/COOP issues under the SAB
  isolation headers.
- Typecheck clean (`tsc --noEmit`) and lint passes (pre-commit).
- Manual: stones appear on floor tiles, are lit by nearby torches only (dark
  where unlit), block movement at their footprint (not whole tile), shrink + chip
  when struck, and break + stay gone after depletion across a room stream cycle.
- Determinism: re-entering a room reproduces identical stones (seed-stable),
  except ones mined out (suppressed).

## Deferred / TODO

- Ore drop entities + pickup on depletion (`Stone.ore` already carried).
- Pickaxe/tool gating of mine damage.
- Wall-vein placement rule as an alternate `ScatterRule` distribution.
- Semantic room types (mine/treasure) layered over `variant` for richer policies.
