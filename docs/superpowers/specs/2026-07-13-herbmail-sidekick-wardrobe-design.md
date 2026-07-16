# herbmail-game: SIDEKICK wardrobe expansion (sci-fi + horror sets, lazy-loaded)

Date: 2026-07-13
Status: approved design, pre-implementation

## Goal

Integrate the remaining SIDEKICK starter content — the two sci-fi civilian characters (Starter_02/Starter_03, built from `SCFI_CIVL_09` + `SCFI_CIVL_10` parts) and the horror villain helmet (`HORR_VILN_01`) — into `apps/herbmail/herbmail-game` as mix-and-match wardrobe pieces alongside the existing knight, with per-piece stats so combat stats can later derive from worn items.

## Source inventory (`~/Downloads/SIDEKICK_Starter_Unity_2021_3_v1_0_4.unitypackage`)

- `SCFI_CIVL_09` — full set, 26 parts: body slots `10TORS..21FOTR`, armor attachments `22AHED..34AKNR` (AHED, AFAC, ABAC, AHPF/B/L/R, ASHL/R, AEBL/R, AKNL/R), plus `02HAIR`.
- `SCFI_CIVL_10` — 6 accessory parts: `22AHED`, `26AHPB`, `27AHPL`, `28AHPR`, `29ASHL`, `30ASHR`.
- `HORR_VILN_01` — 1 part: `22AHED` helmet.
- Colormaps: sci-fi parts are palette-swapped by preset — `T_Starter_02ColorMap` (Starter_02) / `T_Starter_03ColorMap` (Starter_03) over identical UVs. Horror helmet appears in Starter_04 → `T_Starter_04ColorMap`. Knight already uses `T_Starter_01ColorMap`.
- All parts carry the same 88-bone UE-mannequin skeleton as the committed knight rig → bind with zero retarget.

## Decisions

1. **Lazy-loaded per-set parts glbs; `character-anim.glb` untouched.** Baked/grounded animation clips carry all the past churn (grounding, mirrors, anchors); never re-export that file for mesh additions. New content ships as separate small glbs fetched on first equip.
2. **Mix-and-match per slot**, not whole-outfit switching. Every slot independently picks a variant or none.
3. **Piece registry with stats + item ids.** Each piece is the future inventory item; stats live on the piece definition.

## 1. Assets — `art/character/build_parts_glb.py`

Blender headless script, reusing the extraction + material pattern from `attach_skin_body.py`:

- Input: extracted unitypackage part FBX dirs + colormap PNGs.
- Output → `public/models/parts/`:
    - `scifi-civ09.glb` — the 26 `SCFI_CIVL_09` parts, nodes named `SCFI09_<SLOT>` (e.g. `SCFI09_TORS`, `SCFI09_HAIR`).
    - `scifi-civ10.glb` — the 6 `SCFI_CIVL_10` parts, nodes `SCFI10_<SLOT>`.
    - `horr-viln01.glb` — the `HORR01_AHED` helmet.
- Each glb contains the 88-bone armature in rest pose, **no animation clips**, no morphs (`export_morph=False`).
- One shared material per glb: `T_Starter_02ColorMap` for both sci-fi glbs (default palette), `T_Starter_04ColorMap` for horror. `interpolation='Closest'`, Specular IOR 0 (PSX look). Palette swap to Starter_03 is a possible later runtime texture swap — same UVs, no new geometry.
- Node-name prefixing avoids collision with the knight's unprefixed slot nodes (`TORS`, `AHED`, …) in the main glb.

## 2. Runtime rebind — `src/game/character/partsLoader.ts`

- `loadPartsSet(setId)`: fetch + parse the set glb once (module-level cache), resolve each SkinnedMesh.
- Attach: for each part mesh, build a `THREE.Skeleton` from the **main character's bones**, looked up by the part skeleton's bone names in the part's bone order, reusing the part's own `boneInverses`; `mesh.bind(skeleton)`; add mesh under the character group. Same rig and rest pose → follows every baked clip with no retarget.
- Detach: `visible = false` once loaded (mirrors the knight visibility model); meshes stay resident after first load.
- Failure mode is loud (mesh explodes if bone mapping wrong) — verify in dev immediately.

## 3. Wardrobe model — evolve `armor.ts`

- Slot → variant instead of boolean piece set: each slot (`AHED`, `TORS`, `LEGL`, … plus `HAIR`) holds one of its available piece ids or `null`.
- Piece registry entry:

```ts
interface WardrobePiece {
	id: string; // 'kngt_helmet', 'scifi09_torso', 'horr01_helmet' — future item id
	label: string;
	slot: string; // 'AHED', 'TORS', ...
	set: 'KNGT' | 'SCFI09' | 'SCFI10' | 'HORR01';
	node: string; // mesh node name ('AHED' knight, 'SCFI09_AHED', ...)
	stats?: {
		armor?: number;
		weight?: number;
		[k: string]: number | undefined;
	};
}
```

- Knight pieces resolve to nodes already in `character-anim.glb` (visibility flip, as today). Non-knight sets trigger `loadPartsSet` on first equip.
- Skin-twin rule generalizes: any equipped variant in a body slot hides `SKIN_<slot>`; `null` shows the skin. `BODY_BASE` unchanged. Knight `HAIR` is currently body-base; with a sci-fi hair variant, `HAIR` becomes a slot whose `null` state shows the original hair.
- `pieceForMesh` generalizes to variant nodes so body-click keeps working.
- Stats: `playerStats.ts` later sums `stats` over equipped pieces — registry is the single source; inventory `items.ts` `equipId` will point at `WardrobePiece.id` when pieces become grid items (out of scope here, but ids and shape are final).

## 4. Panel — `inventory/EquipmentSection.tsx`

- Per-slot row shows current variant label; click cycles available variants → none → first. Body-click cycles the same way via the generalized `pieceForMesh`.
- Keep `data-x-kbve` tag scheme (`equip-armor-{slot}` etc.).

## 5. Verification

- Dev run: equip sci-fi torso/legs/helmet + horror helmet; run walk/jump/punch/sword — attached meshes track the rig (no explosion, no lag), skin twins hide correctly, PSX texture look matches knight.
- Network tab: parts glb fetched only on first equip of its set.
- `character-anim.glb` byte-identical → no clip-grounding re-verification needed.

## Trade-offs

- Per-set glbs (3 files) over per-part (33 files): one small over-fetch on first equip of a set; structure allows a per-part split later without changing the wardrobe model.
- Runtime rebind is the one new mechanism; it is a known same-named-rig pattern and fails visibly if wrong.
- Sci-fi default palette fixed to Starter_02 for now; Starter_03 palette = later texture swap feature.
