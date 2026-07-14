# herbmail-game: Codex Icon Studio + MDX-owned model mapping

Date: 2026-07-14
Status: approved design, pre-implementation

## Goal

Let the user produce equipment icons in-engine: browse each itemdb equipment
piece in the Codex, arrange its meshes by dragging, and snapshot a 64×64 PNG
that — after a side-by-side confirm against the current icon — replaces the
icon files in the repo. Also move the piece→SIDEKICK-model mapping into the
itemdb MDX so items fully describe their source model.

## A. MDX `model` block (33 entries)

Frontmatter added to every equipment MDX:

```yaml
model:
    pack: 'SIDEKICK'
    set: 'SCFI09' # KNGT | SCFI09 | SCFI10 | HORR01
    nodes: ['SCFI09_ASHL', 'SCFI09_ASHR']
    slot_keys: ['ASHL', 'ASHR']
    covers: ['HAIR', 'SCFI09_HAIR'] # helms only, optional
```

- Web bundle (`generated/itemdb.json`) passes raw frontmatter through, so the
  block reaches the game; the proto-canonical central JSON ignores it
  (Unreal-safe). Confirm zod `ItemSchema` tolerates the extra key (it and the
  nested schemas are generated with passthrough; validate the 33 entries after
  regen).
- herbmail `armor.ts` builds `ARMOR_PIECES` from the bundle: items with
  `model.pack === 'SIDEKICK'` → `{ id: ref, slots: nodes, slotKeys, set,
covers }`. `BODY_BASE`, the skin-cover map and the equip store stay in code.
  Adding a future item = author MDX + regen bundle, no game-code change.
- Registry order follows bundle order; PIECE_BY_SKIN "first registered" tiebreak
  is arbitrary either way.

## B. Codex Icon Studio

- Codex header mode switch: **Animations | Icon Studio**.
- Left rail: all equipment items with name + current icon thumbnail
  (`/icons/items/<ref>.png`, cache-busted after replacement).
- Viewport: selected piece isolated at rest pose — character clone with ONLY
  the piece's meshes visible, dark background in-view but snapshot renders
  with alpha. Lazy part sets load through the existing partsLoader path.
- **Mesh dragging**: studio flips the piece's SkinnedMeshes to
  `bindMode = 'detached'` with bindMatrixInverse frozen at setup, so node
  transforms move the rendered mesh. Pointer drag on a mesh translates it in
  the camera plane (raycast pick, drag on plane ⊥ camera); drag on empty
  space orbits (OrbitControls); wheel zooms. "Auto-arrange" applies the same
  cluster heuristic as render_icons.py (spread > 1.5× max piece extent →
  side-by-side row). Studio-only mode; gameplay rendering untouched.
- **Snapshot → confirm → write**:
    1. Snapshot renders the current camera view square-cropped to an offscreen
       64×64 render target with alpha, reads pixels to a PNG data URL.
    2. Confirm dialog shows CURRENT icon and NEW capture side by side, each at
       64px actual and 128px zoom (pixelated). Buttons: **Replace** / Cancel.
       No write happens without confirm.
    3. Replace POSTs `{ ref, png }` to a dev-only vite middleware
       (`/__icon-studio`) that decodes base64 and writes BOTH
       `apps/herbmail/herbmail-game/public/icons/items/<ref>.png` and
       `apps/kbve/astro-kbve/public/assets/items/equipment/<ref>.png`
       (paths resolved from the vite config's repo root; ref validated against
       the item registry — no path traversal). Toast shows written paths.
    4. Prod build / non-dev: Replace falls back to downloading `<ref>.png`.
- Ghost mannequin toggle: body-base meshes at 15% opacity for placement
  context (off by default, excluded from snapshot… ghost hidden during the
  offscreen render).

## Verification

- Bundle regen + zod validation of the 33 entries with `model` block.
- vitest suite (armor registry now bundle-driven — tests keep passing on
  refs), tsc, build.
- Playwright: open Codex → Icon Studio, select vanguard-gauntlets, auto-
  arrange, snapshot, confirm dialog appears with two images, Replace →
  middleware writes both files (assert on disk), thumbnails refresh.

## Trade-offs

- Detached-bind dragging is a studio-only rendering mode — never active in
  gameplay or the Animations codex.
- Repo writes are dev-server-only by construction (middleware absent from
  builds); itch/prod builds keep the download fallback.
- MDX regen step required after editing model mappings (existing workflow:
  `nx run astro-kbve:sync:itemdb`).
