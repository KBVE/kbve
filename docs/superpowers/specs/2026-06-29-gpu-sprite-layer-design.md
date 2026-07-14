# GPU Sprite Layer — thin guarded factory for `@kbve/laser`

Date: 2026-06-29
Status: Approved (design)

## Problem

Phaser 4.1 ships `SpriteGPULayer`: a static GPU-buffer batch renderer that draws up
to ~1M quads in a single draw call (~100x faster than per-sprite rendering) by
keeping transform data on the GPU and uploading only when data changes. It targets
ambient mass-sprite content — starfields, weather, particles, crowds, debris,
animated backgrounds — not game characters with per-frame logic.

Both `apps/agones/arpg/web` (ARPG) and `apps/cryptothrone/astro-cryptothrone`
(Cryptothrone) run Phaser 4.1 with `Phaser.AUTO` (→ WebGL when available) and both
consume `@kbve/laser` via a path alias to `packages/npm/laser/src/index.ts`. Without
a shared primitive each app would re-implement the same WebGL guard, context-loss
handling, and the documented allocation-free populate path independently.

## Constraints (from Phaser 4.1 `SpriteGPULayer` type docs)

- **WebGL only.** No-ops under the Canvas fallback path of `Phaser.AUTO`.
- **Single image texture.** No multi-atlas. Power-of-two recommended for pixel art.
- **168 bytes per quad**, CPU and GPU.
- **Buffer mutation is expensive.** `addMember`, `editMember`, `patchMember`,
  `resize`, `removeMembers` update some/all of the buffer. Populate once, leave
  unchanged where possible.
- **Removal rewrites the buffer.** Prefer "hiding" a quad via `scaleX/scaleY/alpha = 0`
  over `removeMembers`.
- **Reuse a single `Member` object** across `addMember` calls — allocating millions
  of member objects has major cost and causes GC pressure.

## Scope

A generic, performance-minded primitive in `@kbve/laser`. **API-first**: no scene
consumer ships in this work. ARPG and Cryptothrone wire it later.

### In scope

Three exports from `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts`,
re-exported through the `lib/phaser` surface and the root `index.ts` barrel:

```ts
export interface GpuSpriteLayerOptions {
  size: number;
  depth?: number;
  alpha?: number;
  blendMode?: number;
  visible?: boolean;
}

export interface GpuSpriteLayerHandle {
  readonly layer: Phaser.GameObjects.SpriteGPULayer;
  dispose(): void;
}

export function createGpuSpriteLayer(
  scene: Phaser.Scene,
  texture: string | Phaser.Textures.Texture,
  opts: GpuSpriteLayerOptions,
): GpuSpriteLayerHandle | null;

export function populateGpuSpriteLayer(
  handle: GpuSpriteLayerHandle,
  count: number,
  fill: (
    member: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>,
    i: number,
  ) => void,
): void;
```

### Out of scope (YAGNI)

- Config presets (starfield/particle builders).
- Pooling / free-list manager.
- Per-frame member-diff batching.
- Any ARPG or Cryptothrone scene integration.

## Behavior

### `createGpuSpriteLayer`

1. **WebGL guard.** If `scene.renderer.type !== Phaser.WEBGL`, return `null`.
   Mirrors the existing guard at `apps/agones/arpg/web/src/game/IsoArpgScene.ts:431`.
   Consumers treat `null` as "ambient layer unavailable" and no-op.
2. Build a `SpriteGPULayerConfig` (`{ size, key: texture, alpha, blendMode, visible }`)
   and create the layer via `scene.add.spriteGPULayer(config)`.
3. Apply `depth` when provided (iso scenes in both apps are depth-sorted; the layer
   must composite under/over entities deterministically).
4. **Context-loss survival.** Install the existing
   `installWebGLContextGuard` (`packages/npm/laser/src/lib/webgl/context-guard.ts`)
   on the game canvas. On `restored`, call `layer.setAllSegmentsNeedUpdate()` so the
   whole buffer re-uploads. Return a handle whose `dispose()` removes the listener
   and destroys the layer.

### `populateGpuSpriteLayer`

Allocates exactly **one** scratch `Member` object. Loops `count` times: calls
`fill(scratch, i)` (consumer mutates fields in place), then `handle.layer.addMember(scratch)`.
Zero per-quad allocation → no GC churn on large populates. Implements the documented
fast path so neither app re-derives it. Per-frame animation (GPU tweens in member
data: position/rotation/scale/alpha easing) is consumer policy and stays out of this
primitive.

## Testing

`gpu-sprite-layer.spec.ts` alongside the source (matches existing `*.spec.ts` in
`lib/phaser`). With a mocked `Phaser.Scene`:

- `renderer.type === Phaser.WEBGL` → returns a handle; `scene.add.spriteGPULayer`
  called with the derived config; `depth` applied when set.
- `renderer.type === Phaser.CANVAS` → returns `null`; factory never called.
- `dispose()` detaches the context-loss listener and destroys the layer.
- `populateGpuSpriteLayer` calls `fill` `count` times and `addMember` `count` times
  with the **same** object reference each call (scratch reuse assertion).

## Conventions

- Free functions, scene-first argument — matches `lib/phaser/entity-fx.ts`.
- `import Phaser from 'phaser'`.
- No comments; code self-documenting (global preference).
- Build/test via nx through `./kbve.sh`, not raw cargo/vitest.

## Consumers (future, not this work)

- ARPG: parallax starfield in `apps/agones/arpg/web/src/game/space/SpaceScene.tsx`.
- Cryptothrone: ambient layer in
  `apps/cryptothrone/astro-cryptothrone/src/components/game/scenes/CloudCityScene.ts`.
