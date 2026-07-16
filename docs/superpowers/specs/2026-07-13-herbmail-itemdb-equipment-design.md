# herbmail-game: itemdb-backed equipment sets + icon pipeline

Date: 2026-07-13
Status: approved design, pre-implementation

## Goal

Give every herbmail wardrobe piece a real item identity in the monorepo itemdb
(MDX source of truth in astro-kbve), collapse L/R and quad pieces into single
set items so gear never stacks and enchantments apply once per set, and render
64×64 Blender icons for the inventory UI.

## Decisions

1. **Item = set, model = per-limb.** One itemdb entry per equipment set
   (Pauldrons, Gloves, Fauld Set …). The herbmail registry keeps each mesh node
   (`ASHL`/`ASHR`, `FOTL`/`FOTR`) individually addressable so future limb
   damage / prosthetics / cybernetics can hide or replace one side without
   changing the item model.
2. **MDX is source of truth** (existing pattern): edit MDX, `nx sync`
   regenerates the JSON bundles; herbmail consumes the snake_case web bundle
   via the canonical `Item` type from `@kbve/itemdb-schema`.
3. **Uniqueness**: all equipment `stackable: false`; grid instances already
   carry a `uid`. Material stacking is out of scope.

## 1. itemdb MDX — 33 set entries

`apps/kbve/astro-kbve/src/content/docs/itemdb/<ref>.mdx`, frontmatter per the
existing equipment pattern (chain-mail.mdx): ULID `id`, kebab `ref`, next free
numeric `key` (601+), `stackable: false`, `action: 'equip'`, rarity, prices,
`equipment.slot` (coarse enum) + `equipment.bonuses` (armor, health, …;
weight moves into bonuses).

Sets:

- KNGT (14): kngt-helmet, kngt-eye-patch, kngt-backpack, kngt-chest,
  kngt-pauldrons, kngt-upper-arms, kngt-elbow-guards, kngt-bracers,
  kngt-gauntlets, kngt-hips, kngt-fauld-set (AHPF/B/L/R), kngt-legs,
  kngt-knee-guards, kngt-boots.
- SCFI09 (15): scifi09-hair, scifi09-visor, scifi09-mask, scifi09-tech-pack,
  scifi09-jacket, scifi09-sleeves, scifi09-cuffs, scifi09-gloves,
  scifi09-pants, scifi09-pant-legs, scifi09-sneakers, scifi09-pouch-set
  (AHPF/B/L/R), scifi09-shoulder-pads, scifi09-elbow-pads, scifi09-knee-pads.
- SCFI10 (3): scifi10-helmet, scifi10-pouch-set (AHPB/L/R),
  scifi10-shoulders.
- HORR01 (1): horr01-villain-helm.

Coarse slot mapping (fine body slots stay in herbmail): head = helmets, hair,
visor, mask, eye patch; back = packs; chest = jacket/chest plate, pauldrons,
shoulders, sleeves, upper arms; hands = gloves, gauntlets, bracers, cuffs,
elbow pieces; legs = hips, pants, faulds, pouch sets, legs, pant legs, knee
pieces; feet = boots, sneakers.

A one-off scaffold script generates the 33 MDX files from the current
`armor.ts` data (labels, stats); after generation the MDX is human-owned.

## 2. herbmail registry — set pieces

`armor.ts`:

- Merge L/R and quad entries: one `ArmorPiece` per set with
  `slots: ['ASHL','ASHR']` (all owned mesh nodes) and
  `slotKeys: ['ASHL','ASHR']` (all body locations occupied). Eviction clears
  every occupied key — equipping sci-fi shoulders removes knight pauldrons
  entirely.
- Each piece gains `ref`; identity, label, stats resolve from the itemdb
  bundle (`generated/itemdb.json`, `Item` type). Local registry keeps only
  render/game data: nodes, slotKeys, covers, part set, grid footprint, icon.
- Per-node visibility API unchanged — limb-level hiding stays possible for
  future damage systems.

Consumers to update: items.ts (registry from itemdb refs), Paperdoll (pair
slots merge into one cell per set, quads one cell), store
reconcile/autoEquip (slotKeys plural), codexLoadouts/Codex chips (33 pieces),
partLabels.

## 3. Icons — Blender 64×64

`art/character/render_icons.py`:

- Per set: import ALL its part meshes (unitypackage FBX; knight
  `FANT_KNGT_17` parts included) with the correct colormap, frame camera on
  the combined bbox (3/4 front angle), transparent film, EEVEE →
  `public/icons/items/<ref>.png`, 64×64.
- Inventory grid + paperdoll render the icon (flat color stays as fallback
  and border tint).
- Icons later reusable on itemdb pages.

## Verification

- `nx sync` regenerates itemdb bundles; zod `ItemRegistry` parse passes with
  the 33 new entries; existing camelCase central JSON stays byte-compatible
  for Unreal consumers.
- herbmail: vitest suite (armor-inventory bridge reworked for sets), tsc,
  vite build.
- Codex loadouts render all sets; playwright screenshots; icons visible in
  the grid.

## Trade-offs

- No single-side equip anymore (deliberate — asymmetry returns later as a
  dedicated limb-damage/prosthetic system at the model layer).
- Coarse itemdb slot loses body detail; acceptable, herbmail owns fine slots.
- 33 MDX files scaffolded once; future stat tuning happens in MDX, not code.
