# Herbmail Modern Doors — Viking Arch, Marble Trim, Plank Leaf

Date: 2026-07-14
Status: approved

## Goal

Retexture the dungeon doorways for the modern (post-PSX) look: Viking Tile on
the arch surround, a white-marble molding ring around the door hole, and
wood_planks_17 on the door leaf. All three surfaces render through the
existing PsxMaterial POM path (`uUseMaps` + `uPom`) and get creased by n8ao.

Baseline: the modern pivot already in the working tree — `snap=0`, `affine=0`,
`dpr=2`, `flat` canvas, n8ao `AOComposer`, walls on `{color,normal,har}` POM
packs via `dungeonMaterials.ts`.

## Source assets

| Surface       | Source (local)                                                   | Maps used                                       |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Door leaf     | `~/Downloads/wood_planks_17_1k/`                                 | basecolor, **normal_gl**, height, AO, roughness |
| Arch surround | `~/Downloads/Free Tiled Surface Textures/Viking Tile/`           | BaseColor, Normal, Height, AO, Roughness        |
| Trim ring     | `~/Downloads/Free Tiled Surface Textures/WhiteMarbleTiles  (1)/` | BaseColor, Normal, Height, AO, Roughness        |

Marble variant (1) chosen: uniform square grid, reads on a narrow band,
contrasts the dark/gold Viking lattice.

## Components

### 1. Asset packer — `art/textures/pack_maps.py`

Rerunnable script (Pillow). Per surface:

- Resize to 1024×1024 (match brickwall pack budget).
- `<name>_color.png` — basecolor as-is (sRGB).
- `<name>_normal.png` — normal map; wood uses the GL variant. If in-game
  depth cue reads inverted for the tile packs, flip G here (flag per source).
- `<name>_har.png` — packed RGB: R=height, G=AO, B=roughness (PsxMaterial
  decode: POM depth `1.0 - har.r`, `ao = har.g`, `rough = har.b`).

Outputs to `public/textures/door/{wood17,viking,marble1}_{color,normal,har}.png`
(LFS-covered by the existing `public/**/*.png` rule).

### 2. Config + texture loading

- `TEXTURES.arch` and `TEXTURES.door` become `{color,normal,har}` pack
  entries; new `TEXTURES.trim` pack. `doorAlt` removed (single wood set; the
  parity alternation in DoorLeaf goes away).
- `TINT.trim` added (start near `TINT.arch`, tune at verify).
- `textures.ts`: `DungeonTextures.arch/door/trim` typed as `WallMaps`,
  loaded/filtered like walls — color `psxify` (nearest), normal/har `dataify`.

### 3. Materials — `dungeonMaterials.ts`

- `arch: makeMat({ ...wallUniforms(tex.arch), uPom: 1, uTint })`.
- New `trim: makeMat({ ...wallUniforms(tex.trim), uPom: 1, uTint })`.
- `bayFrame`/`bayBack` keep sampling `tex.arch` → they pick up Viking color
  automatically (they stay non-POM, `uOcclude: 0` as today). Accepted.
- DoorLeaf renders `<psxMaterial>` with full maps + `uUseMaps`/`uPom` instead
  of bare `uMap`; parity-based `doorAlt` branch deleted.

### 4. Trim geometry — `arches.ts` / `roomGeometry.ts` / `RoomView.tsx`

- `buildTrims(grid, variant)`: for each arch tile, same `jitter` params
  (openHW, spring, same salts) so the ring hugs the hole exactly. Shape =
  hole contour offset outward by `TRIM_W ≈ TILE * 0.06`, with the hole itself
  as the inner path (jamb strips + semicircular band). Extrude depth ≈ arch
  depth × 1.3, centered, so the molding sits proud of both faces.
- `roomGeometry` dices + exposes `trim: THREE.BufferGeometry[]` beside
  `arch`; disposed with the set.
- `RoomView` draws trim meshes with `mats.trim`.

### 5. Verification

- Typecheck + unit tests + build.
- Headless chromium against preview: walk to a doorway, screenshot open and
  closed leaf; eyeball POM depth direction on all three surfaces, trim
  silhouette, n8ao crease at trim/arch joint.
- Check UV density on the trim arc (`scaleUV(1/TILE)` same as arch); if the
  curve stretches, revisit UV mapping on the ring only.

## Risks

- Normal handedness unknown on the two tile packs — packer has a per-source
  flip-G flag; verify visually.
- POM on the swinging leaf's extrude side faces may smear — acceptable at
  leaf thickness 0.12; if ugly, drop `uPom` to 0 on the leaf only (maps still
  give normal/AO/roughness shading).
- Trim ring silhouette on the semicircle is faceted by ExtrudeGeometry curve
  segments — default segments acceptable at door scale.

## Out of scope

- Floor/ceiling modernization (still Horror\_\* 256px singles).
- Any change to door ECS behavior (locked/swing).
- Replacing bayFrame/bayBack texturing beyond the automatic arch inherit.
