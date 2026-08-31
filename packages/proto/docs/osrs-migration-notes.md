# `osrs.proto` migration dossier

Captured 2026-08-28 from `kbve/kbve` @ `packages/data/proto/kbve/osrs.proto`.
**Nothing is migrated yet.** This file records what exists, what depends on it, and
what must change before it lands as `kbve/osrs/v1/`.

Source is 825 lines: `package kbve.osrs`, 6 enums, 43 domain messages,
8 request/response messages, 1 service (`OSRSData`, 4 RPCs).

---

## 1. Live consumers — this proto is NOT dormant

Migration is a coordinated change, not a file move.

| Consumer | What it does |
|---|---|
| `apps/kbve/axum-kbve/build.rs` | prost-compiles `osrs.proto`; package `kbve.osrs` listed at line 12, file at line 66 |
| `packages/data/codegen/gen-osrs-zod.mjs` | proto → Zod, emits `generated/osrs-schema.ts` (912 lines, committed) |
| `packages/data/codegen/osrs-zod-config.json` | 8 exclusions, 9 field renames, 3 schema renames |
| `packages/python/kbve/kbve/osrs/` | `families.py`, `survey.py`, `audit.py` |
| `apps/kbve/astro-kbve/src/content/docs/osrs/*.mdx` | **4064 item pages** written against this shape |
| `apps/kbve/astro-kbve/scripts/enrich-v1-items.mjs`, `enrich-v3-wiki-stats.mjs`, `generate-osrs-items.mjs` | ingest/enrichment |

The 4064 MDX files are the real constraint. Any field rename is a 4064-file
rewrite or a compatibility shim.

---

## 2. Full inventory

### Enums (6)

| Enum | Values | Status |
|---|---|---|
| `OSRSSlot` | 12 + unspecified | used by `OSRSEquipment.slot` |
| `OSRSWeaponType` | 23 + unspecified | used by `OSRSEquipment.weapon_type` |
| `OSRSSkill` | 23 + unspecified | used 5× |
| `OSRSFacility` | 10 + unspecified | **declared, never used** — `OSRSRecipe.facility` is `string` |
| `OSRSRarity` | 6 + unspecified | used by `OSRSDropSource.rarity` |
| `OSRSRelationship` | 7 + unspecified | **declared, never used** — `OSRSRelatedItem.relationship` is `string` |

A comment also marks a removed `OSRSRecipeSkill` enum, folded into `OSRSSkill`.

### Messages by cluster

**Equipment & bonuses** — `OSRSAttackBonus`, `OSRSDefenceBonus`, `OSRSOtherBonus`,
`OSRSRequirements`, `OSRSEquipment`, `OSRSSpecialAttack`, `OSRSSetBonus`

**Sources** — `OSRSDropSource`, `OSRSShopSource`, `OSRSSkillingSource`, `OSRSTreasureTrail`

**Creation** — `OSRSRecipeMaterial`, `OSRSRecipe`

**Consumables** — `OSRSEffect`, `OSRSConsumable`, `OSRSFood`, `OSRSCookingBurnRate`, `OSRSCooking`

**Content / SEO** — `OSRSContentSection`, `OSRSAbout`, `OSRSFaqEntry`, `OSRSMeta`

**Families (v4 consolidation)** — `OSRSFamilyRef`, `OSRSFamilyMember`, `OSRSFamily`

**Market** — `OSRSMarketStep`, `OSRSMarketStrategy`, `OSRSPrice`

**Skill-specific** — `OSRSMaterial`, `OSRSPrayer`, `OSRSGathering`, `OSRSFarming`,
`OSRSSlayer`, `OSRSConstruction`

**Item mechanics** — `OSRSTeleport`, `OSRSTeleportDestination`, `OSRSQuestData`,
`OSRSQuestRequirement`, `OSRSCharges`, `OSRSPassiveEffect`, `OSRSAmmunition`,
`OSRSRelatedItem`, `OSRSItemProperties`

**Root** — `OSRSItem`, 47 fields (1–10 base, 11–47 optional sub-messages)

**Transport** — `UpsertItem{Request,Response}`, `SavePrices{Request,Response}`,
`GetItem{Request,Response}`, `SearchItems{Request,Response}`;
`service OSRSData { UpsertItem, GetItem, SearchItems, SavePrices }`

---

## 3. Defects to fix on migration

### 3.1 Market data belongs in `kbve.asset.v1`

`OSRSPrice` is `high_price`/`high_time`/`low_price`/`low_time` — instant-buy and
instant-sell, each with its own epoch. That is exactly `asset.v1.Quote`'s
ask/bid with independent `bid_at`/`ask_at`. Drop `OSRSPrice`; point at `Quote`.

`OSRSItem.ge_limit` ("GE buy limit per 4 hours") is
`TradingRules.buy_limit` + `buy_limit_window_seconds = 14400`.

`OSRSMarketStrategy` / `OSRSMarketStep` duplicate `asset.v1.Strategy` /
`StrategyStep`. Use the asset ones.

### 3.2 `SavePricesRequest` uses parallel arrays

```protobuf
repeated OSRSPrice prices = 1;
repeated int64 item_ids = 2;   // Parallel array — prices[i] is for item_ids[i]
```

Nothing enforces equal length. One dropped element silently reassigns every
price after it to the wrong item. Replace with a repeated pair message.

### 3.3 `OSRSRequirements` hard-codes 23 skills as 23 fields

Fields 1–23 are one `optional int32` per skill, plus `quest` at 24. A new skill
is a schema change, and there is no way to iterate requirements generically —
despite `OSRSSkill` already existing. Replace with
`repeated SkillRequirement { OSRSSkill skill = 1; int32 level = 2; }`.

### 3.4 Two enums exist but strings are used instead

`OSRSRecipe.facility` and `OSRSRelatedItem.relationship` are `string` while
`OSRSFacility` and `OSRSRelationship` sit unused. Typos in 4064 MDX files are
currently unvalidated. Switch to the enums and validate during ingest.

### 3.5 Stringly-typed fields with fixed value sets

Each of these documents its legal values in a comment instead of an enum:

- `OSRSFamilyRef.role` — base | poison | dose | charged
- `OSRSFamily.type` — poison | dose | mixed
- `OSRSTreasureTrail.tier` — beginner…master
- `OSRSQuestRequirement.role` — required | reward | optional | starts
- `OSRSPassiveEffect.trigger` — always | on_hit | on_kill | while_worn | chance
- `OSRSTeleport.type`, `.spellbook`
- `OSRSAmmunition.type`, `.tier`
- `OSRSFarming.patch_type` (16 values), `.compost_type`
- `OSRSMaterial.type`, `.tier`
- `OSRSEffect.boost_type` — flat | percentage | formula

`OSRSDropSource.quantity` ("1-3", "1 (noted)"), `.drop_rate` ("1/128") and
`OSRSShopSource.price` ("Free") are strings because the values genuinely are not
numbers. Those stay strings — but the ranges deserve a structured
`min`/`max`/`noted` and the rate a `numerator`/`denominator`.

### 3.6 `OSRSAttackBonus` ≡ `OSRSDefenceBonus`

Identical field-for-field: `stab`, `slash`, `crush`, `magic`, `ranged`. One
`CombatBonus` message used twice.

### 3.7 Field names the downstream config has to correct

`osrs-zod-config.json` renames 9 fields on the way out. Each rename is a proto
name that was wrong:

| Proto | Renamed to | Why |
|---|---|---|
| `OSRSItem.ge_limit` | `limit` | |
| `OSRSItem.drop_sources` | `drop_table` | |
| `OSRSItem.consumable` | `potion` | message is potion-specific despite the name |
| `OSRSConsumable.cooking_level` | `herblore_level` | **wrong skill in the field name** |
| `OSRSCooking.cooking_level` | `level` | redundant prefix |
| `OSRSCooking.cooking_xp` | `xp` | redundant prefix |
| `OSRSCookingBurnRate.fire_success` | `fire_rate` | |
| `OSRSCookingBurnRate.range_success` | `range_rate` | |
| `OSRSCookingBurnRate.gauntlets_success` | `gauntlets_rate` | |

Fix these in the proto and delete the rename table. `OSRSConsumable.cooking_level`
carrying a *Herblore* level is a live bug, not cosmetics.

### 3.8 `OSRSConsumable` vs `OSRSFood` overlap

Both carry `heals` and `cooking_level`; `OSRSItem` holds both plus `OSRSCooking`.
Three messages describing one edible item. Consolidate.

### 3.9 Timestamps are three different types

- `OSRSPrice.high_time` / `low_time` — `int64` epoch seconds
- `OSRSItem.mdx_updated` — ISO date `string`
- `OSRSItemProperties.release_date` / `.update` — free `string`

Module convention is `google.protobuf.Timestamp`.

### 3.10 Money is `int32`

`value`, `lowalch`, `highalch`, `repair_cost`, `recharge_cost` are `int32`.
OSRS's own cash cap is 2,147,483,647 — the same as `int32` max — so any
aggregate (stack value, total inventory) overflows. Use `int64`, or
`common.v1.Decimal` where it must interop with asset pricing.

### 3.11 Unused import

`import "kbve/common.proto";` — no `kbve.common.*` type appears anywhere in the
file. buf `STANDARD` lint flags this.

### 3.12 Untyped item references

`OSRSSetBonus.pieces` is `repeated int32` of item IDs; `OSRSFarming` carries
`seed_id`/`produce_id`/`payment_item_id`; `OSRSCharges` has
`charge_cost_item_id`/`degrade_to_id`; `OSRSConstruction.built_item_id`. All
bare ints. Consider an `ItemRef` wrapper so a reference is distinguishable from
a count.

### 3.13 `OSRSItem` is a 47-field root

Every optional subsystem hangs off one message. It works, but any consumer
deserializes the union of all mechanics. Worth deciding whether the page model
and the game model are the same message.

---

## 4. Module conventions to apply

- Package → `kbve.osrs.v1`, path `kbve/osrs/v1/`
- File basenames must stay unique **module-wide** (C# generator flattens output)
- Split by cluster (§2) rather than one 825-line file — watch for import cycles
  the way `map/v1` needed
- IDs: OSRS item IDs are the game's own `int64`; they are not ULIDs. Keep them,
  and expose them as `asset.v1.AssetIdentifier { scheme: "osrs-item-id" }`
- `google.protobuf.Duration` is banned in this module (prost `Eq` derive) —
  ticks/minutes/hours stay integers. A tick is 0.6s; keep ticks *as ticks*
- Check for `optional foo` + `bool has_foo` pairs before generating C# — that
  pattern produced `CS0102` in `itemdb.proto`

## 5. Open questions

1. **Service migration.** The module currently has no `service` definitions.
   Decide whether `OSRSData` comes along or stays with the app.
2. **`OSRSRecipe` vs `item.CraftingRecipe` vs `profession.ProfessionAction`.**
   Three spellings of "skill + level + xp + materials → output". Still unresolved.
3. **MDX compatibility.** 4064 pages encode the current field names. Either the
   ingest scripts map old→new, or the rename lands as a content migration.
