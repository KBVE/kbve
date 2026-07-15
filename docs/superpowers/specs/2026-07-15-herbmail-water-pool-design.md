# herbmail-game — Dungeon Water Pool (jeantimex/threejs-water port)

Date: 2026-07-15
Status: approved

## Goal

A swimmable water pool in the endless dungeon. Full port of
[jeantimex/threejs-water](https://github.com/jeantimex/threejs-water)
(GPU wave-equation ripple sim, differential-area caustics, Fresnel
reflect/refract surface) as the water base, scoped so it costs zero
render passes when no pool is near the player. Character can enter the
water (surface swim) and climb out.

## Decisions

- Placement: new procedural `POOL` cell style — streams/culls with the
  existing room system.
- Water tech: full jeantimex port, vendored as base.
- Lighting: jeantimex model — one fixed directional light per pool
  (constant dir/color = the "baked" look); no per-frame dungeon light
  eval on pool surfaces.
- Swim: surface only. No diving.

## Section 1 — Water port (`src/game/water/`)

Vendor the repo's `src/water`, `src/shaders`, caustics + renderer logic
into `src/game/water/vendor/`, adapted minimally:

- `WaterSimulation` — 2D wave equation on GPU, ping-pong
  `WebGLRenderTarget` pair (256×256 per pool). Drop injection replaces
  the demo's mouse raycast: player movement while swimming injects
  drops.
- `Caustics` — differential-area pass (brightness = originalArea /
  projectedArea) renders a caustic texture from sim normals + light
  dir.
- `WaterSurface` mesh — Fresnel reflect/refract surface shader; pool
  walls/floor use the port's underwater shaders (caustics projected,
  above/below-surface variants).
- Light: fixed directional dir/color constants per pool.

### Culling contract

`PoolInstance { active }`. Sim + caustics passes run in `useFrame` ONLY
when the pool's room is mounted AND the player is within ~1.5 rooms.

- Room unmounted → surface mesh hidden, no passes.
- Mounted but far → mesh visible, textures frozen at last frame, no
  passes.
- Sim RTs live in a shared singleton buffer pool in case two pools are
  ever visible at once (realistically one active).

## Section 2 — Pool geometry + dungeon integration

- `POOL` cell style = 3 in `genRoom` (~7% of cells via hash; only
  ROOM-shaped candidates, require ≥2 doors). Style already folds into
  `signature = doors:variant:style`, so pool geometry caches free.
- Basin: 4×4 room interior → center 2×2 tiles recessed. Rim at floor
  y=0; water surface y = −1.0 (matches ClimbUp_1m); basin floor
  y = −2.2 (depth visible through refraction).
- `geometry/pool.ts` builder: basin walls + floor as separate geometry
  bound to the port's underwater shader; ledge trim ring in normal
  PsxMaterial stone.
- Collision gains height: new `floorYAtWorld(x, z)` — 0 everywhere,
  −2.2 inside basin tiles. Motor's hardcoded `y <= 0` ground clamp
  becomes `y <= floorY`. Basin walls solid below rim.
- Water volume registry (door-registry pattern): pool room publishes
  `{ center, halfExtents, surfaceY }` on mount; swim system + water
  renderer read it.

## Section 3 — Swim + climb state machine

`CharacterMotor` gains `mode: 'ground' | 'swim'`.

- **Enter (fall)**: walk off rim → gravity drop → when
  `position.y < surfaceY − 0.3` inside a volume → `mode = 'swim'`,
  splash drop into sim, y lerps to swim line (surfaceY − bodyDepth).
- **Enter (deliberate)**: standing at rim facing water, press F → play
  `Climb_Exit` one-shot while motor lerps down/forward into water →
  swim.
- **Swim**: planar movement only, swimSpeed ≈ 1.2, no jump/sprint.
  Anim: `Swim_Idle_Loop` / `Swim_Fwd_Loop` selected by speed (replaces
  gait). Movement injects sim drops at character position every
  ~0.15 s (wake).
- **Exit**: swimming against rim while facing it (probe:
  solid-above-water within 0.5 m ahead) → on forward-hold, chain
  `ClimbLedge` → `ClimbUp_1m` one-shots while motor lerps up 1 m +
  forward onto rim → `mode = 'ground'`.

## Animations (already in character-anim.glb pipeline)

- `Swim_Fwd_Loop` (1.7 s), `Swim_Idle_Loop` (4.2 s)
- `ClimbLedge` → `ClimbUp_1m` (exit)
- `Climb_Exit` (deliberate entry)

Clips not yet on the knight rig get added via
`art/character/retarget_append.mjs` (world-delta retarget) +
`ground_feet_bake.mjs` where applicable.

## Error handling / edge cases

- Two pool rooms adjacent: shared RT buffer pool; only nearest is
  active.
- Player swims while room unmounts (teleport/debug): mode forced back
  to ground, position snapped to nearest rim.
- Sim RT float-texture support: fall back to half-float; jeantimex
  already handles WebGL capability checks — keep them.

## Testing

- `dungeon/store.test.ts` pattern: POOL style determinism (same seed →
  same pool cells), signature includes style, floorYAtWorld returns
  −2.2 only inside basin tiles.
- Motor unit: mode transitions (fall-in threshold, exit lerp restores
  ground mode).
- Visual: run game, force POOL style at spawn cell for verification.
