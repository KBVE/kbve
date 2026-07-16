# Herbmail Modern Doors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viking Tile POM arch surrounds, white-marble trim rings, and wood_planks_17 POM door leaves for every dungeon doorway.

**Architecture:** A rerunnable Pillow script packs the three local source PBR sets into the game's `{color,normal,har}` 1k convention (har: R=height, G=AO, B=roughness). Config/textures load them as `WallMaps`; `dungeonMaterials` renders arch + new trim through the existing POM path; a new `buildTrims` extrudes a molding ring hugging each arch hole using the same deterministic jitter.

**Tech Stack:** three.js r184, R3F 9, PsxMaterial POM (`uUseMaps`/`uPom`), Pillow 12, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-herbmail-modern-doors-design.md`.
- har packing: R=height, G=AO, B=roughness (PsxMaterial: POM depth `1.0 - har.r`, `ao = har.g`, `rough = har.b`).
- Node/mesh determinism: trim must reuse the arch's exact `jitter(lc, lr, 1|2 + variant * ARCH_SALT, …)` params.
- Sources (local): `~/Downloads/wood_planks_17_1k/` (use `normal_gl`), `~/Downloads/Free Tiled Surface Textures/Viking Tile/`, `~/Downloads/Free Tiled Surface Textures/WhiteMarbleTiles  (1)/`.
- `doorAlt` is removed; single wood set.
- New PNGs land in `apps/herbmail/herbmail-game/public/textures/door/` (LFS-covered); run `./kbve.sh -lfs herbmail push origin HEAD` after committing.

---

### Task 1: Texture packer + packed assets

**Files:**

- Create: `apps/herbmail/herbmail-game/art/textures/pack_maps.py`
- Create (generated): `apps/herbmail/herbmail-game/public/textures/door/{wood17,viking,marble1}_{color,normal,har}.png`

**Interfaces:**

- Produces: nine 1024×1024 PNGs at `/textures/door/<name>_<map>.png` consumed by Task 2 config paths.

- [ ] **Step 1: Write the packer**

```python
#!/usr/bin/env python3
"""Pack local source PBR sets into the game's {color,normal,har} convention.

har channels: R=height, G=AO, B=roughness (PsxMaterial decodes POM depth as
1-R, ao=G, rough=B). Rerun after swapping source maps; flip_g inverts the
normal G channel for DirectX-style sources.
"""
from pathlib import Path
from PIL import Image, ImageOps

SIZE = 1024
HOME = Path.home()
TILES = HOME / "Downloads/Free Tiled Surface Textures"
OUT = Path(__file__).resolve().parents[2] / "public/textures/door"

SETS = [
    {
        "name": "wood17",
        "dir": HOME / "Downloads/wood_planks_17_1k",
        "color": "wood_planks_17_basecolor_1k.png",
        "normal": "wood_planks_17_normal_gl_1k.png",
        "height": "wood_planks_17_height_1k.png",
        "ao": "wood_planks_17_ambientocclusion_1k.png",
        "rough": "wood_planks_17_roughness_1k.png",
        "flip_g": False,
    },
    {
        "name": "viking",
        "dir": TILES / "Viking Tile",
        "color": "Viking Tile_BaseColor.png",
        "normal": "Viking Tile_Normal.png",
        "height": "Viking Tile_Height.png",
        "ao": "Viking Tile_AmbientOcclusion.png",
        "rough": "Viking Tile_Roughness.png",
        "flip_g": False,
    },
    {
        "name": "marble1",
        "dir": TILES / "WhiteMarbleTiles  (1)",
        "color": "WhiteMarbleTiles  (1)_BaseColor.png",
        "normal": "WhiteMarbleTiles  (1)_Normal.png",
        "height": "WhiteMarbleTiles  (1)_Height.png",
        "ao": "WhiteMarbleTiles  (1)_AmbientOcclusion.png",
        "rough": "WhiteMarbleTiles  (1)_Roughness.png",
        "flip_g": False,
    },
]


def rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)


def gray(path: Path) -> Image.Image:
    return Image.open(path).convert("L").resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SETS:
        d = s["dir"]
        rgb(d / s["color"]).save(OUT / f"{s['name']}_color.png")
        n = rgb(d / s["normal"])
        if s["flip_g"]:
            r, g, b = n.split()
            n = Image.merge("RGB", (r, ImageOps.invert(g), b))
        n.save(OUT / f"{s['name']}_normal.png")
        har = Image.merge(
            "RGB",
            (gray(d / s["height"]), gray(d / s["ao"]), gray(d / s["rough"])),
        )
        har.save(OUT / f"{s['name']}_har.png")
        print(f"packed {s['name']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `python3 apps/herbmail/herbmail-game/art/textures/pack_maps.py`
Expected: `packed wood17`, `packed viking`, `packed marble1`.

- [ ] **Step 3: Sanity-check outputs**

Run: PIL one-liner asserting 9 files exist, all 1024×1024 RGB, and each har G-channel mean is between 40 and 250 (AO not dead).
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add apps/herbmail/herbmail-game/art/textures/pack_maps.py apps/herbmail/herbmail-game/public/textures/door
git commit -m "feat(herbmail-game): pack viking/marble/wood door texture sets"
```

### Task 2: Texture plumbing — config, loader, materials, leaf

**Files:**

- Modify: `apps/herbmail/herbmail-game/src/game/config.ts` (TEXTURES.arch/door → packs, add trim, drop doorAlt; TINT.trim)
- Modify: `apps/herbmail/herbmail-game/src/game/textures.ts` (arch/trim/door as `WallMaps`)
- Modify: `apps/herbmail/herbmail-game/src/game/dungeon/dungeonMaterials.ts` (arch POM, new `trim` material, bay uses `tex.arch.color`)
- Modify: `apps/herbmail/herbmail-game/src/game/door/DoorLeaf.tsx` (full maps + POM, drop doorAlt parity)

**Interfaces:**

- Consumes: Task 1 texture paths.
- Produces: `DungeonTextures.arch/trim/door: WallMaps`; `DungeonMaterials.trim: PsxMaterialImpl`.

- [ ] **Step 1: config.ts** — replace `arch`, `door`, `doorAlt` entries:

```ts
	arch: {
		color: '/textures/door/viking_color.png',
		normal: '/textures/door/viking_normal.png',
		har: '/textures/door/viking_har.png',
	},
	trim: {
		color: '/textures/door/marble1_color.png',
		normal: '/textures/door/marble1_normal.png',
		har: '/textures/door/marble1_har.png',
	},
	door: {
		color: '/textures/door/wood17_color.png',
		normal: '/textures/door/wood17_normal.png',
		har: '/textures/door/wood17_har.png',
	},
```

and in TINT add `trim: [0.92, 0.92, 0.95],`.

- [ ] **Step 2: textures.ts** — `arch`, `trim`, `door` become `WallMaps`, loaded like walls (color `psxify`, normal/har `dataify`); flatten all packs into the `useTexture` list; remove doorAlt.

- [ ] **Step 3: dungeonMaterials.ts** —

```ts
	arch: makeMat({ ...wallUniforms(tex.arch), uPom: 1, uTint: tint(TINT.arch) }),
	trim: makeMat({ ...wallUniforms(tex.trim), uPom: 1, uTint: tint(TINT.trim) }),
```

`bayFrame`/`bayBack` switch `uMap: tex.arch` → `uMap: tex.arch.color`. `arch` leaves the non-affine set unchanged (affine is 0 in modern mode anyway). Add `trim` to `DungeonMaterials`, the uniform-sync list, and the dispose list.

- [ ] **Step 4: DoorLeaf.tsx** — replace the parity texture pick with:

```tsx
	const tex = useDungeonTextures();
	…
	<psxMaterial
		uMap={tex.door.color}
		uNormalMap={tex.door.normal}
		uHarMap={tex.door.har}
		uUseMaps={1}
		uPom={1}
		uSnap={snap}
		uAffine={0}
		uRes={res}
		uTint={tint}
		uOcclude={0}
		side={THREE.DoubleSide}
	/>
```

- [ ] **Step 5: Verify**

Run: `npx vitest run --config apps/herbmail/herbmail-game/vite.config.ts` and `./kbve.sh -nx herbmail-game:typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(herbmail-game): viking arch + wood leaf POM materials"
```

### Task 3: Marble trim ring geometry

**Files:**

- Modify: `apps/herbmail/herbmail-game/src/game/geometry/arches.ts` (add `buildTrims`)
- Modify: `apps/herbmail/herbmail-game/src/game/dungeon/roomGeometry.ts` (trim category)
- Modify: `apps/herbmail/herbmail-game/src/game/dungeon/RoomView.tsx` (render trim)
- Test: `apps/herbmail/herbmail-game/src/game/geometry/arches.test.ts`

**Interfaces:**

- Consumes: `archTiles`, `jitter`, `ARCH_SALT` (existing).
- Produces: `buildTrims(grid: Grid, variant?: number): THREE.BufferGeometry`; `RoomGeoSet.trim: THREE.BufferGeometry[]`.

- [ ] **Step 1: Failing test** — `buildTrims` produces geometry beside every arch, ring bounds ≈ openHW + TRIM_W, proud of the arch depth:

```ts
import { describe, it, expect } from 'vitest';
import { buildArches, buildTrims } from './arches';
import { genSectorDesc, makeLocalGrid } from '../dungeon/generate';

describe('buildTrims', () => {
	it('emits a proud molding ring wherever arches exist', () => {
		const d = genSectorDesc(1337, 0, 0);
		const g = makeLocalGrid(d);
		const trims = buildTrims(g, d.variant);
		const arches = buildArches(g, d.variant);
		expect(trims.attributes.position.count).toBeGreaterThan(0);
		trims.computeBoundingBox();
		arches.computeBoundingBox();
		expect(trims.boundingBox!.max.y).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run — fails** (`buildTrims` not exported).

- [ ] **Step 3: Implement `buildTrims`** in arches.ts:

```ts
const TRIM_W = TILE * 0.06;
const TRIM_DEPTH_MULT = 1.3;

function trimShape(openHW: number, spring: number): THREE.Shape {
	const sink = TILE * 0.3;
	const o = openHW + TRIM_W;
	const s = new THREE.Shape();
	s.moveTo(-o, -sink);
	s.lineTo(o, -sink);
	s.lineTo(o, spring);
	s.absarc(0, spring, o, 0, Math.PI, false);
	s.lineTo(-o, -sink);
	const hole = new THREE.Path();
	hole.moveTo(-openHW, -sink);
	hole.lineTo(openHW, -sink);
	hole.lineTo(openHW, spring);
	hole.absarc(0, spring, openHW, 0, Math.PI, false);
	hole.lineTo(-openHW, -sink);
	s.holes.push(hole);
	return s;
}

export function buildTrims(grid: Grid, variant = 0): THREE.BufferGeometry {
	const arches = archTiles(grid);
	if (!arches.length) return new THREE.BufferGeometry();
	const depth = TILE * 0.16 * TRIM_DEPTH_MULT;
	const parts: THREE.BufferGeometry[] = [];
	for (const a of arches) {
		const salt = variant * ARCH_SALT;
		const openHW = jitter(a.col, a.row, 1 + salt, TILE * 0.28, TILE * 0.38);
		const spring = jitter(a.col, a.row, 2 + salt, TILE * 0.95, TILE * 1.25);
		const g = new THREE.ExtrudeGeometry(trimShape(openHW, spring), {
			depth,
			bevelEnabled: false,
		});
		scaleUV(g, 1 / TILE);
		g.translate(0, 0, -depth / 2);
		const m = new THREE.Matrix4().makeTranslation(
			a.col * TILE + HALF,
			0,
			a.row * TILE + HALF,
		);
		if (a.axis === 'x')
			m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
		g.applyMatrix4(m);
		parts.push(g);
	}
	return mergeGeometries(parts, false);
}
```

- [ ] **Step 4: roomGeometry.ts** — add `trim: THREE.BufferGeometry[]` to `RoomGeoSet`, `trim: dice(buildTrims(g, v))` in `buildSet`, and dispose in `disposeSet`.

- [ ] **Step 5: RoomView.tsx** — after the archway group:

```tsx
<ChunkGroup geos={set.trim} kind="door trim" material={mats.trim} />
```

- [ ] **Step 6: Run tests + typecheck — pass.**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(herbmail-game): marble trim molding around door arches"
```

### Task 4: Visual verification + LFS

- [ ] **Step 1:** Build + preview headless; screenshot spawn view and a doorway (spawn faces one at tile (24,27)).
- [ ] **Step 2:** Check: viking relief reads correctly (recessed mortar, not embossed) on arch; marble ring proud of the panel; plank leaf. If depth reads inverted on a tile pack, set that source's `flip_g: True`, rerun packer, recommit textures.
- [ ] **Step 3:** `./kbve.sh -lfs herbmail push origin HEAD` after the texture commit is pushed.
