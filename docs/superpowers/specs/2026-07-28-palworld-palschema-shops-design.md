# Palworld PalSchema Shops — Design

**Date:** 2026-07-28
**Status:** Approved design → plan
**Owner:** KBVE / Palworld (Agones)

## Goal

Rework the Palworld in-world shops through PalSchema (the proven JSON data-table
framework already wired into the server image), with the shop data authored as
**MDX frontmatter** (KBVE house pattern — MDX is source of truth) and rendered
two ways from one source:

1. A committed **PalSchema JSON overlay** the game server loads.
2. A **static shop page** on the astro-kbve site (frontmatter → HTML, OSRS-style).

Phase 1 ships **one shop** (`Village_Shop_1`) to prove the full pipeline end to
end in production with zero runtime-crash surface. The other seven shops are
follow-up MDX files the same generator already handles.

## Background / constraints

- **PalSchema** (Okaetsu, C++ `main.dll`) is fetched pinned + sha256-verified in
  `apps/agones/palworld/Dockerfile` and staged by `overlay.sh` into
  `Mods/PalSchema/mods/`. Confirmed loading in prod.
- PalSchema mod layout (verified against the docs): each mod is a subfolder under
  `mods/`, with a `raw/` subdirectory for data-table edits — `mods/<ModName>/raw/<file>.json`.
  Discovery is automatic (PalSchema scans `mods/`); no manifest/enabled file.
  PalSchema only touches rows/properties named in the JSON; everything else is
  left as-is.
- Shop schema: table `DT_ItemShopCreateData`, keyed by shop row name
  (`Village_Shop_1`, `Desert_Shop_1`, `Volcano_Shop_1`, `Wander_Shop_1`,
  `Bounty_Shop_1`, `Medal_Shop_1`, `Desert_Shop_2`, `Volcano_Shop_2`). Each row:
  `productDataArray: { Action, Items[] }`. `Action: "Clear"` replaces the vanilla
  item list. Item shape:
  `{ StaticItemId, ProductType, OverridePrice, ProductNum, Stock }`,
  `ProductType` = `EPalItemShopProductType::Normal` (enum).
- **Content is KBVE-authored.** The Hex Reworked Shop (Nexus) PalSchema mod is a
  **structural reference only** — item ids and layout ideas, not verbatim data.
  No third-party content is vendored.
- **Data-only, no runtime risk.** This is a data-table overlay; it cannot crash
  the server process the way the parked `RequestSpawnMapObject_Server` spawn did.
- Agones GameServer template is immutable → an image change needs a GS recreate
  to take effect (`kubectl delete gameserver palworld -n palworld`, ~3 min boot).

## Architecture

One source (MDX frontmatter) → two consumers, mirroring the existing
`generate-mc-*` / OSRS render patterns in astro-kbve.

```
src/content/docs/palworld/palshop/village.mdx   (authoring: palshop: frontmatter block)
        │
        ├─ scripts/generate-palworld-shops.mjs ─► apps/agones/palworld/mods/PalSchema/
        │        (+ validate)                       mods/KBVEShops/raw/kbve-shops.json  (committed)
        │                                                   │
        │                                          overlay.sh → Mods/PalSchema/mods/  → game loads
        │
        └─ PalShopTable.astro (reads palshop.items) ─► static shop page under /palworld/
```

### Components

**1. Authoring — `src/content/docs/palworld/palshop/village.mdx`**

Namespaced `palshop:` frontmatter block (OSRS `osrs:`-style), plus normal
Starlight page frontmatter so it renders as a doc page.

```yaml
---
title: Village Shop
template: splash
description: The KBVE Palworld Village shop — starter gear, spheres, and supplies.
sidebar:
    label: Village Shop
palshop:
    shopId: Village_Shop_1
    action: Clear
    items:
        - { id: PalSphere,      type: Normal, price: 0,   num: 1, stock: 0 }
        - { id: ClothArmorCold, type: Normal, price: 500, num: 1, stock: 0 }
        - { id: Medicines,      type: Normal, price: 0,   num: 1, stock: 0 }
---

import PalShopTable from '@/components/palworld/PalShopTable.astro';

<PalShopTable />
```

Authoring shape is terse (`id/type/price/num/stock`); the generator expands to the
full PalSchema field names.

**2. Generator — `apps/kbve/astro-kbve/scripts/generate-palworld-shops.mjs`**

- Reads every `src/content/docs/palworld/palshop/*.mdx`, parses YAML frontmatter
  (`yaml` package, as `generate-mc-items.mjs` does).
- For each file, takes the `palshop` block and builds one row:
  ```
  DT_ItemShopCreateData[shopId] = {
    productDataArray: {
      Action: <action>,                 // "Clear"
      Items: items.map(expand)
    }
  }
  expand(i) = {
    StaticItemId: i.id,
    ProductType: "EPalItemShopProductType::" + i.type,   // "Normal"
    OverridePrice: i.price,
    ProductNum: i.num,
    Stock: i.stock
  }
  ```
- Merges all shop rows into one object and writes
  `apps/agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json`
  (path relative to the astro-kbve project root, the generator cwd:
  `../../agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json`;
  resolved from `import.meta.url`, not raw cwd, and the target dir asserted).
  Deterministic
  key order (shops sorted, item order preserved) so diffs are stable.

**3. Validator — `apps/kbve/astro-kbve/scripts/validate-palworld-shops.mjs`**

Mirrors `validate-mc-mdx.mjs`. Fails non-zero on:
- missing `palshop.shopId` / `action` / `items`,
- unknown `shopId` (not one of the 8 known rows),
- duplicate `shopId` across files,
- `type` not in the allowed enum set (`Normal` for Phase 1),
- non-integer `price` / `num` / `stock`, or `num` < 1 / negative price/stock,
- empty `items`.

Run before the generator (and in CI) so bad frontmatter never produces JSON.

**4. Site render — `src/components/palworld/PalShopTable.astro`**

Reads the page's own `palshop.items` from the entry frontmatter (OSRS render
pattern — `OSRSGatheringInfo.astro`-style) and emits a static HTML table
(item, price, qty, stock). No client JS required.

**5. nx wiring**

Add an nx target on the astro-kbve project: `generate-palworld-shops` runs the
validator then the generator (`./kbve.sh -nx run astro-kbve:generate-palworld-shops`).
The generated JSON is **committed to git**; Docker copies the overlay dir as-is
(no node in the image build). Follows the ci-manifest-sync artifact convention.

## Data flow (deploy)

1. Edit/author `palshop/village.mdx`.
2. `nx run astro-kbve:generate-palworld-shops` → validator passes → writes
   `KBVEShops/raw/kbve-shops.json`.
3. Commit MDX + generated JSON + component (single PR).
4. MDX version bump on the palworld doc → image rebuild.
5. GS recreate → PalSchema load log shows the KBVEShops mod applied.
6. Verify in-game: Village shop shows the curated stock; other shops vanilla.

## Testing

- **Generator unit check:** a fixture frontmatter object → asserted JSON output
  (exact PalSchema shape, enum expansion, field names). Node assert script under
  `scripts/` or a `*.test` mirroring existing script conventions.
- **Validator negative cases:** missing keys, bad enum, non-integer price, unknown
  shopId, duplicate shopId each return non-zero.
- **JSON parse gate:** generated `kbve-shops.json` parses and contains
  `DT_ItemShopCreateData.Village_Shop_1.productDataArray.Items[]`.
- **Live verification (manual, prod):** PalSchema apply log + in-game shop stock.

## Scope

**In (Phase 1):**
- `palshop/village.mdx` (one shop, `Action: Clear`, KBVE-curated Village list).
- Generator + validator + nx target.
- `PalShopTable.astro` render.
- Committed `kbve-shops.json` overlay artifact.
- Attribution note in `mods/PalSchema/README.md` (Hex = structural reference).

**Out (follow-up phases):**
- The other 7 shops (add MDX files; generator already handles them).
- Non-`Normal` product types (medal/bounty currencies) — add to the enum set
  and validator when those shops land.
- Any PalSchema content beyond shops (NPCs/items/recipes).

## Risks / mitigations

- **Wrong `StaticItemId`** → item silently absent in shop. Mitigation: curate from
  known-valid ids (Hex reference uses real ids); validator can later gain an
  allowlist if an item table is available.
- **Cross-app relative write path** (astro script → apps/agones). Mitigation:
  resolve from `import.meta`/`__dirname`, assert the target dir exists, fail loud.
- **`Action: Clear` wipes a shop** if `items` is empty. Mitigation: validator
  rejects empty `items`.
- **Generated artifact drift** (JSON edited by hand, MDX not regenerated).
  Mitigation: JSON is generated-only; a CI check can re-run the generator and
  diff (follow-up).
```
