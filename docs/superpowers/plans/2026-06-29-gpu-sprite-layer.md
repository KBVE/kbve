# GPU Sprite Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin, WebGL-guarded `SpriteGPULayer` factory to `@kbve/laser` reusable by ARPG and Cryptothrone.

**Architecture:** Three free functions in one focused file under `lib/phaser`, re-exported through the root barrel. `createGpuSpriteLayer` guards on renderer type, builds the layer, wires context-loss recovery, and returns a handle with `dispose()`. `populateGpuSpriteLayer` fills the layer using a single reused scratch member object (the documented allocation-free fast path).

**Tech Stack:** TypeScript, Phaser 4.1 (`SpriteGPULayer`), Vitest, nx via `./kbve.sh`.

## Global Constraints

- Phaser floor: `>=4.1.0` (already the laser peer + both apps).
- `SpriteGPULayer` is WebGL only — every entry point must no-op cleanly on Canvas.
- Reuse one `Member` object across `addMember` calls (GC constraint).
- Removal is via `scaleX/scaleY/alpha = 0`, never `removeMembers` in this primitive.
- Free functions, scene-first argument; `import Phaser from 'phaser'`.
- No comments in source (global preference).
- Build/test through nx (`./kbve.sh -nx ...`), not raw vitest/cargo.
- File: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts` (+ `.spec.ts`).
- Reuse existing `installWebGLContextGuard` from `../webgl/context-guard`.

---

## File Structure

- Create: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts` — the three exports.
- Create: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts` — unit tests.
- Modify: `packages/npm/laser/src/index.ts` — re-export the new module.

---

### Task 1: `createGpuSpriteLayer` — guarded factory + handle

**Files:**
- Create: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts`
- Test: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts`

**Interfaces:**
- Consumes: `installWebGLContextGuard(canvas, { onLost, onRestored }): () => void` from `../webgl/context-guard`.
- Produces:
  - `interface GpuSpriteLayerOptions { size: number; depth?: number; alpha?: number; blendMode?: number; visible?: boolean }`
  - `interface GpuSpriteLayerHandle { readonly layer: Phaser.GameObjects.SpriteGPULayer; dispose(): void }`
  - `createGpuSpriteLayer(scene: Phaser.Scene, texture: string | Phaser.Textures.Texture, opts: GpuSpriteLayerOptions): GpuSpriteLayerHandle | null`

- [ ] **Step 1: Write the failing test**

Create `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createGpuSpriteLayer } from './gpu-sprite-layer';

vi.mock('phaser', () => ({
	default: { WEBGL: 2, CANVAS: 1 },
	WEBGL: 2,
	CANVAS: 1,
}));

function makeLayer() {
	return {
		setDepth: vi.fn().mockReturnThis(),
		setAllSegmentsNeedUpdate: vi.fn(),
		addMember: vi.fn().mockReturnThis(),
		destroy: vi.fn(),
	};
}

function makeScene(rendererType: number, layer = makeLayer()) {
	const spriteGPULayer = vi.fn().mockReturnValue(layer);
	return {
		scene: {
			renderer: { type: rendererType },
			game: { canvas: document.createElement('canvas') },
			add: { spriteGPULayer },
		},
		spriteGPULayer,
		layer,
	};
}

describe('createGpuSpriteLayer', () => {
	it('returns null on the Canvas fallback and never builds a layer', () => {
		const { scene, spriteGPULayer } = makeScene(1);
		const handle = createGpuSpriteLayer(scene as never, 'stars', { size: 100 });
		expect(handle).toBeNull();
		expect(spriteGPULayer).not.toHaveBeenCalled();
	});

	it('builds a depth-applied layer under WebGL and returns a handle', () => {
		const { scene, spriteGPULayer, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', {
			size: 100,
			depth: 5,
			alpha: 0.8,
		});
		expect(handle).not.toBeNull();
		expect(spriteGPULayer).toHaveBeenCalledWith({
			size: 100,
			key: 'stars',
			alpha: 0.8,
			blendMode: undefined,
			visible: undefined,
		});
		expect(layer.setDepth).toHaveBeenCalledWith(5);
		expect(handle!.layer).toBe(layer);
	});

	it('dispose destroys the layer', () => {
		const { scene, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', { size: 10 });
		handle!.dispose();
		expect(layer.destroy).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx laser:test`
Expected: FAIL — `createGpuSpriteLayer` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts`:

```ts
import Phaser from 'phaser';
import { installWebGLContextGuard } from '../webgl/context-guard';

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
): GpuSpriteLayerHandle | null {
	if (scene.renderer.type !== Phaser.WEBGL) {
		return null;
	}

	const layer = scene.add.spriteGPULayer({
		size: opts.size,
		key: texture,
		alpha: opts.alpha,
		blendMode: opts.blendMode,
		visible: opts.visible,
	});

	if (opts.depth !== undefined) {
		layer.setDepth(opts.depth);
	}

	const canvas = scene.game.canvas;
	const detach = installWebGLContextGuard(canvas, {
		onLost: () => {},
		onRestored: () => layer.setAllSegmentsNeedUpdate(),
	});

	return {
		layer,
		dispose() {
			detach();
			layer.destroy();
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx laser:test`
Expected: PASS (3 tests in this file).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts
git commit -m "feat(laser): add guarded SpriteGPULayer factory"
```

---

### Task 2: `populateGpuSpriteLayer` + barrel export

**Files:**
- Modify: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts`
- Modify: `packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts`
- Modify: `packages/npm/laser/src/index.ts`

**Interfaces:**
- Consumes: `GpuSpriteLayerHandle` from Task 1.
- Produces: `populateGpuSpriteLayer(handle: GpuSpriteLayerHandle, count: number, fill: (member: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>, i: number) => void): void`

- [ ] **Step 1: Write the failing test**

Append to `gpu-sprite-layer.spec.ts`:

```ts
import { populateGpuSpriteLayer } from './gpu-sprite-layer';

describe('populateGpuSpriteLayer', () => {
	it('reuses one scratch member across all addMember calls', () => {
		const { scene, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', { size: 3 })!;
		const seen: unknown[] = [];
		layer.addMember.mockImplementation((m: unknown) => {
			seen.push(m);
			return layer;
		});

		const xs: number[] = [];
		populateGpuSpriteLayer(handle, 3, (member, i) => {
			(member as { x: number }).x = i;
			xs.push((member as { x: number }).x);
		});

		expect(layer.addMember).toHaveBeenCalledTimes(3);
		expect(xs).toEqual([0, 1, 2]);
		expect(seen[0]).toBe(seen[1]);
		expect(seen[1]).toBe(seen[2]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx laser:test`
Expected: FAIL — `populateGpuSpriteLayer` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `gpu-sprite-layer.ts`:

```ts
export function populateGpuSpriteLayer(
	handle: GpuSpriteLayerHandle,
	count: number,
	fill: (
		member: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>,
		i: number,
	) => void,
): void {
	const scratch: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member> = {};
	for (let i = 0; i < count; i++) {
		fill(scratch, i);
		handle.layer.addMember(scratch);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx laser:test`
Expected: PASS (4 tests total in file).

- [ ] **Step 5: Add barrel export**

In `packages/npm/laser/src/index.ts`, add alongside the other `lib/phaser` exports:

```ts
export {
	createGpuSpriteLayer,
	populateGpuSpriteLayer,
	type GpuSpriteLayerOptions,
	type GpuSpriteLayerHandle,
} from './lib/phaser/gpu-sprite-layer';
```

- [ ] **Step 6: Verify typecheck + tests**

Run: `./kbve.sh -nx laser:test`
Expected: PASS. Confirm the export resolves (no TS errors).

- [ ] **Step 7: Commit**

```bash
git add packages/npm/laser/src/lib/phaser/gpu-sprite-layer.ts packages/npm/laser/src/lib/phaser/gpu-sprite-layer.spec.ts packages/npm/laser/src/index.ts
git commit -m "feat(laser): add scratch-reuse populate + export GPU sprite layer"
```

---

## Self-Review

- **Spec coverage:** `createGpuSpriteLayer` (guard + depth + context-loss + dispose) → Task 1. `populateGpuSpriteLayer` (scratch reuse) → Task 2. Barrel export → Task 2 Step 5. Tests for guard/null/dispose/populate → both tasks. All spec sections mapped.
- **Placeholder scan:** none — all steps carry real code/commands.
- **Type consistency:** `GpuSpriteLayerHandle`, `GpuSpriteLayerOptions`, `createGpuSpriteLayer`, `populateGpuSpriteLayer` names identical across tasks, spec, and barrel.
- **Note:** context-loss `onRestored` is exercised indirectly (guard wiring asserted via dispose detach path); deeper restore simulation deferred as out-of-scope for this thin primitive.
