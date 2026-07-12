# Herbmail-game — Diablo-style Grid Inventory (Design)

Date: 2026-07-12
App: `apps/herbmail/herbmail-game`
Status: approved design, ready for implementation plan

## Goal

Add a spatial (Diablo/Tarkov-style) grid inventory. Items occupy multi-cell
footprints (1x1, 2x2, 1x3, …). Player opens the grid, drags items to place them,
rotates footprints 90°, and can auto-sort. Loot from breaking crates / mining
stones flows into the grid; equippable items live in the grid and can be equipped
from it. Ship the core concept first, then iterate.

## Locked decisions

- **Type:** spatial grid inventory (fixed-shape rectangles placed into a bag grid).
- **Footprints:** multi-cell (e.g. 1x1, 1x3, 2x2). No stacking — every item is one
  footprint instance with its own uid.
- **Rotation:** 90° via `R` while dragging (1x3 ↔ 3x1).
- **Interaction:** drag + drop, plus an auto-sort button.
- **Sources:** both — loot drops (crate/stone) AND equippables (sword/torch/crate)
  live in the grid.
- **Grid size:** 10 columns × 6 rows = 60 cells.
- **Open key:** `I` (toggle).
- **Persistence:** in-memory only (resets on reload), matching the rest of the game.

## Architecture — approach A (chosen)

DOM overlay grid + module-singleton store, mirroring the existing HUD panels
(`PlayerBars`, `EquipmentPanel`) and the `viewmodel/store.ts` state pattern
(`useSyncExternalStore` over a module singleton). No new dependencies. No R3F/THREE
coupling for the UI.

Rejected:

- **B — in-world R3F panel (drei `Html`):** worse pointer handling over the
  pointer-lock canvas, needless coupling.
- **C — react-dnd:** violates the pnpm-root-deps rule and adds bundle weight for a
  game shipping to itch.io. Drag is simple enough to hand-roll.

## Module boundaries

New directory `src/game/inventory/`:

- `grid.ts` — pure spatial-grid logic. No React, no THREE. Occupancy bitmap,
  `canPlace(items, item, x, y, rot)`, `place`, `remove`, `move`, `autoSort`
  (first-fit, area-descending), `footprintOf(itemId, rot)`. Fully unit-testable.
- `items.ts` — item registry: `{ id, w, h, label, color, equipId? }`. Footprint
  dims + optional link to a `LOADOUT` equip id. Loot ids (stone, wood, gem) plus
  equippable ids (sword, torch, crate).
- `store.ts` — module singleton + `useSyncExternalStore`. Holds `PlacedItem[]`
  (source of truth) and an `open` flag. Actions: `addLoot(id)`, `move`, `rotate`,
  `autoSort`, `toggleOpen`, `useInventory()`, `useInventoryOpen()`. Emits on change.
- `InventoryPanel.tsx` — overlay UI: grid render, drag+drop, rotate (R while
  dragging), auto-sort button. Mounted in `App.tsx` beside `EquipmentPanel`.
- `pickup.ts` — `useInventoryPickup()` hook wiring crate-break and stone-mine drops
  into `addLoot`.

## Data model + grid logic

```
Footprint:  { w, h }                       // rot=1 swaps to { h, w }
PlacedItem: { uid, itemId, x, y, rot }     // x,y = top-left cell; rot ∈ {0,1}
GridState:  { items: PlacedItem[], open: boolean }
```

- Source of truth = `PlacedItem[]`. A derived `Uint8Array(COLS*ROWS)` occupancy map
  is rebuilt from the list on each change (grid is tiny; no need to mutate in place).
- `canPlace` = bounds check + zero overlap against occupancy (ignoring the item's
  own cells when moving).
- `place` / `move` validate via `canPlace` then commit; invalid → no-op (UI snaps
  the ghost back).
- `autoSort`: clear, sort items by area descending, first-fit scan — for each item
  try rot=0 then rot=1, scanning cells left→right, top→bottom; place at first fit.
- `addLoot(id)`: create a uid, first-fit place. If nothing fits → return `false`;
  caller spawns floor debris + a brief "inventory full" HUD flash (reuse existing
  puff/flash paths). No stacking; each successful `addLoot` = one new uid.

Constants: `COLS = 10`, `ROWS = 6`.

## Interaction + UI

- **Toggle:** `I` opens/closes. While open → release pointer-lock so the cursor
  frees for dragging, and pause player input. Close → re-lock. (Wire in `App.tsx`
  alongside the existing keydown handler; guard against `INPUT` targets like the
  current code does.)
- **Drag:** pointer-down on a placed item lifts it into a ghost that follows the
  cursor. The hovered target cell shows a footprint highlight — green (valid) / red
  (invalid). Pointer-up commits via `move`, else snaps back. Native pointer events;
  the panel is a `pointerEvents:'auto'` island over the canvas.
- **Rotate:** `R` while dragging flips the dragged footprint; the highlight updates
  live.
- **Auto-sort button:** top-right of the panel; calls `autoSort`.
- **Style:** matches the HUD — dark `rgba(10,10,14,0.8)` background, `#333` border,
  monospace type. Items render as flat colored cells (from `items.ts` `color`) with
  a label. PSX flat look; no textures in v1.

## Loot + equip wiring

- **Loot:** `useInventoryPickup()` mounted in `App`. Crate break → `addLoot('wood')`;
  stone mine → `addLoot('stone')` with a small `gem` chance. Hooks into the existing
  break path in `useCrateBreak.ts` and the mine path in `useStoneMine.ts` (add drop
  calls at the break/mine-complete point; do not change their existing behavior).
  `addLoot` failure → existing floor-debris fallback.
- **Equip:** items whose registry entry sets `equipId` are equippable. Double-click
  the grid slot → call the existing `setEquipped(equipId)` from `viewmodel/store.ts`.
  The grid represents ownership; equipping does not remove the item from the grid.
  The existing 1-9 equip keys keep working unchanged.

## Testing + integration points

- `grid.test.ts` (pure logic, mirrors `sector.test.ts`): place, overlap reject,
  rotate footprint, autosort packing, full-grid rejection.
- Manual: press `I`; drag / rotate / auto-sort; break a crate → `wood` appears;
  mine a stone → `stone` appears; double-click a `sword` slot → equips.
- Touch points:
    - `App.tsx` — mount `InventoryPanel` + `useInventoryPickup`, add `I` toggle,
      pause/resume pointer-lock.
    - `useCrateBreak.ts` / `useStoneMine.ts` — add drop calls.
    - No edits to `equipment.ts` or `viewmodel/store.ts` internals — only _call_
      `setEquipped`.

## Out of scope (v1 — revisit later)

- Stacking / quantity badges.
- localStorage persistence.
- Item icons/textures (flat colored cells for now).
- Tooltips, item stats, rarity, context menus.
- Dropping items back to the world from the grid.

```

```
