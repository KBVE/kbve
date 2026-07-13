# Silhouette Parallax Occlusion Mapping (SPOM) in `@kbve/laser`

**Date:** 2026-07-13
**Status:** Design approved, pending spec review
**Owner:** herbmail-game rendering / @kbve/laser

## Goal

Add Parallax Occlusion Mapping (POM) and Silhouette POM (SPOM) as reusable
shader primitives in `@kbve/laser`, so any KBVE game can give flat surfaces the
illusion of real carved depth without heavy geometry. First consumer:
herbmail-game dungeon walls (a "modern take on PSX" — chunky retro look plus
genuine relief). Reference: `SkyeShark/threejs-silhouette-pom`.

Ship the algorithm into laser as a clean, reusable library **first**, prove it
with a standalone demo, then wire it into herbmail as a separate phase.

## Background / Constraints

- **herbmail renderer:** default R3F `<Canvas>` → `WebGLRenderer` + raw **GLSL**
  `ShaderMaterial`. Wall material is bespoke: PSX vertex-snap, affine UV warp,
  custom point lights, 2D shadow raymarch, fog
  (`apps/herbmail/herbmail-game/src/game/render/PsxMaterial.tsx`). Albedo-only
  today (`uMap`); no normal maps, no tangent attribute.
- **SkyeShark reference** is built on three.js **WebGPURenderer + TSL** node
  materials (`parallaxOcclusionUV()`, `pom.shadow()`, silhouette via
  `alphaToCoverage` + `alphaTestNode`). TSL nodes cannot be consumed by
  herbmail's raw GLSL `ShaderMaterial` — the algorithm is portable, the code is
  not. We port the math, not the source.
- **Renderer fork is the central architectural fact:**
  - WebGL/GLSL = herbmail today = ship-now path.
  - WebGPU/WGSL/TSL = SkyeShark's world = the modern-PSX endgame, but a full
    renderer+material migration for herbmail → deferred to a later phase.
- **"Get both"** = laser houses SPOM behind a shared spec + uniform contract
  with two **hand-written** emit targets (GLSL now, WGSL/TSL scaffolded).
  We do NOT auto-transpile one shader lang to the other (YAGNI).
- **three** pinned `^0.184.0` (root); laser peerDep `three >=0.160.0`.
- Silhouette does **not** require extruded prisms. SkyeShark carves outline by
  discarding fragments where the ray marches off the height plate bounds
  (`alphaToCoverage`). Optional inflated shell only for true overhang.
- herbmail walls are **axis-aligned** → tangent/bitangent derived in the vertex
  shader from the world normal. No tangent attribute needed, keeping
  `chunkGeometry.ts` attribute copy lean.

## Architecture

### §1 — Package layout

```
packages/npm/laser/src/lib/webgl/pom/
  spec.md          # algorithm + uniform contract (single source of truth)
  pom.glsl.ts      # GLSL chunk exports (ship): POM_MARCH, SPOM_SILHOUETTE,
                   #   DERIVE_TANGENT, height helpers
  pom.wgsl.ts      # WGSL/TSL port (scaffold, future WebGPU)
  PomMaterial.tsx  # standalone drei shaderMaterial (GLSL) — demos/other games
  uniforms.ts      # PomUniforms type + default factory (shared both targets)
  index.ts         # re-exports for the module
```

- Sits beside existing `packages/npm/laser/src/lib/webgl/context-guard.ts`.
- Barrel-exported from `packages/npm/laser/src/index.ts` under a `// WebGL / POM`
  section, following the existing export style.
- GLSL chunks are exported as tagged template string constants
  (`/* glsl */`), the same convention `PsxMaterial.tsx` already uses, so
  consumers splice them into their own fragment/vertex source.

### §2 — Algorithm (portable core)

Tangent-space, view-direction driven. Three GLSL chunks plus an optional
self-shadow march:

- **`DERIVE_TANGENT`** — vertex-shader helper. Given world normal of an
  axis-aligned surface, produce tangent + bitangent (TBN) with no vertex
  attribute. Emits varyings for tangent-space view direction.
- **`POM_MARCH`** — fragment-shader function. Linear layer-march from
  `uMinLayers` (head-on) to `uMaxLayers` (grazing) by view angle, then a
  binary-search refinement. Returns the parallaxed (offset) UV and the hit
  height. Any material samples that UV for albedo/lighting.
- **`SPOM_SILHOUETTE`** — when a marched ray exits the height-plate bounds, the
  fragment `discard`s (paired with `alphaToCoverage` on the material). This
  carves the outline past the quad edge. Accepts optional inflated-shell input
  for true overhang; **off by default**.
- **Self-shadow march** (optional, flag-gated) — a second short march from the
  hit point toward a light direction for soft relief shadows.

**Uniform contract** (see `uniforms.ts`, mirrored in `spec.md`):

| Uniform        | Type        | Meaning |
|----------------|-------------|---------|
| `uHeightMap`   | `sampler2D` | height field (consumer-supplied) |
| `uPomScale`    | `float`     | relief depth in UV units |
| `uMinLayers`   | `float`     | march steps head-on |
| `uMaxLayers`   | `float`     | march steps at grazing angle |
| `uSilhouette`  | `float`     | 0/1 enable edge discard |
| `uShadow`      | `float`     | 0/1 enable self-shadow march |

The height map is an **input sampler** — the consumer decides where height comes
from (see §3). This keeps the primitive decoupled from any art pipeline.

### §3 — Height source (a knob, not a hard dependency)

laser ships two zero-art helpers so nothing blocks on hand-authored maps:

- **`heightFromLuma()`** — derive height from albedo luminance (instant, crude:
  baked shadows in the texture read as depth, acceptable for first light).
- **`heightBrick()`** — procedural mortar grooves + noise, fully in-shader,
  tunable, no texture needed.

Hand-authored hero heightmaps are a later, opt-in path. herbmail first-light
uses procedural/derived height.

### §4 — herbmail integration (separate phase, after laser lands)

- Splice `POM_MARCH` + `SPOM_SILHOUETTE` into the `PsxMaterial.tsx` fragment
  shader.
- POM runs on **perspective-correct UV**. Disable `uAffine` on POM walls —
  affine UV warp compounded with parallax offset produces texture "swim".
- Keep vertex snap + nearest filter → the modern-PSX result: chunky retro
  silhouette with real depth.
- **Scope-gate:** walls only in first pass. Distance-LOD ramps march steps → 0
  inside fog (parallax invisible far away, saves fragment cost).
- Floor, ceiling, columns, arches: opt-in later, not first light.
- Existing custom lights, fog, and 2D shadow raymarch stay intact — POM only
  changes which UV they sample.

### §5 — Validation

- Standalone `<PomMaterial>` demo scene in laser: single quad, `heightBrick`
  height, orbit camera. Visual proof + regression check **before** touching
  herbmail.
- Unit tests: `uniforms.ts` default factory, and the tangent-derivation math
  (pure-function portion) where testable off-GPU.

## Data flow

```
consumer material (PsxMaterial / PomMaterial)
  vertex:   DERIVE_TANGENT  → TBN, tangent-space view dir varyings
  fragment: POM_MARCH(uHeightMap, viewDirTS, uPomScale, uMin/MaxLayers)
              → offsetUV, hitHeight
            SPOM_SILHOUETTE(offsetUV bounds) → discard? (alphaToCoverage)
            [optional] self-shadow march → shadow term
            sample albedo/lighting at offsetUV
height source: heightFromLuma() | heightBrick() | authored map → uHeightMap
```

## Error handling / edge cases

- **No WebGPU in herbmail:** GLSL path only; WGSL/TSL is scaffold, not loaded.
- **Silhouette on non-axis-aligned geometry:** `DERIVE_TANGENT` assumes
  axis-aligned surfaces (valid for dungeon walls). Non-axis surfaces must supply
  a tangent attribute — documented limitation in `spec.md`.
- **Affine + POM:** enforced mutually exclusive on POM walls (design §4).
- **Grazing-angle cost blowup:** bounded by `uMaxLayers` + distance-LOD ramp.
- **alphaToCoverage requires MSAA:** demo and herbmail canvases already
  antialiased; documented as a material requirement.

## Testing strategy

- Unit: `uniforms.ts` factory defaults; tangent math pure functions.
- Visual: laser demo scene (manual + screenshot regression baseline).
- Integration: herbmail wall render behind a feature flag; compare against
  current PSX walls for perf (frame time) and look.

## Out of scope

- WebGPU renderer migration for herbmail (WGSL/TSL is scaffold only this pass).
- Hand-authored hero heightmaps.
- POM on floor/ceiling/columns/arches (walls only, first light).
- Inflated-shell true overhang (input hook exists, disabled by default).

## Phasing

1. **laser core** — §1 layout, §2 GLSL chunks, §3 height helpers, `uniforms.ts`,
   barrel export.
2. **laser validation** — §5 `<PomMaterial>` demo + unit tests.
3. **WGSL/TSL scaffold** — `pom.wgsl.ts` hand-port stub + `spec.md` parity notes.
4. **herbmail integration** — §4 splice into `PsxMaterial`, walls only, feature
   flag, distance-LOD.
