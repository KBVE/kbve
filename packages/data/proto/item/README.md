# Item Proto — Universal Item Database

Single source of truth for item definitions across all KBVE games (astro-kbve itemdb, discordsh dungeon, isometric).

## File

- **`itemdb.proto`** — complete item schema with registry

## Game Coverage

| Feature | astro-kbve | discordsh | isometric |
|---------|-----------|-----------|-----------|
| Identity (id, slug, name) | `id`, `ref`, `name` | `id`, `name` | enum variant |
| Category bitmask | `ItemCategoryFlags` | — | — |
| Rarity | string field | `ItemRarity` enum | — |
| Stacking | `stackable` bool | `max_stack` u16 | `max_stack()` u32 |
| Equipment | `equipped` bool | `GearDef` (slot, specials) | — |
| Use effects | `action`, `effects` | `UseEffect` enum (12+ variants) | — |
| Food/cooking | — | — | — |
| Crafting | `craftingMaterials` | — | — |
| Deployable | full deploy config | — | — |
| Skilling/gathering | — | — | `ItemKind` + `LootEvent` |
| Visual | `img`, `pixelDensity` | `emoji` | — |

## Enums

| Enum | Values | Purpose |
|------|--------|---------|
| `ItemTypeFlag` | 21 flags (bitmask) | Multi-type classification (weapon + quest + legendary) |
| `ItemRarity` | Common → Mythic (6) | Drop/display rarity tier |
| `EquipSlot` | 12 slots + unspecified | Where equipment is worn |
| `Element` | 9 elements + none | Damage/resistance affinity |
| `UseEffectType` | 14 types + none | What happens on item use |
| `GearSpecialType` | 4 passives + none | Equipment passive abilities |
| `StatusEffectKind` | 14 effects + unspecified | Codified status effects (poison, burning, etc.) |
| `SkillingType` | 15 disciplines + unspecified | Skill system classification |

## Sub-messages

### Combat & Equipment

- **`ItemBonuses`** — 16 fixed stat fields (armor, attack, strength, charisma, etc.) + `map<string, double> extra` for arbitrary game-specific bonuses (cookingSpeed, zeroG, fallDamageReduction)
- **`EquipmentInfo`** — slot, bonuses, gear special (lifesteal/thorns/crit/DR), durability
- **`UseEffect`** — effect type + amount/stacks/turns/percent with both `StatusEffectKind` enum and `effect_kind_custom` string fallback
- **`ItemAffinity`** — element + magnitude for resistances/boosts

### Food & Skilling

- **`FoodInfo`** — heals, doses, cooking level/xp, burn level, duration, buff effects
- **`SkillingInfo`** — skill type, level requirement, xp reward, tool required, gather time, respawn time, resource node ref

### Crafting & Deployable

- **`CraftingRecipe`** — ingredients (with consumed flag), tools, skill/level, xp, output quantity, facility, members-only
- **`CraftingIngredient`** — item ref + name + amount + consumed flag
- **`DeployableInfo`** — grid size, pivot, prefab, scale, snap, scripts, deployable type (cooker/campfire/workbench)
- **`ScriptBinding`** — GUID-based script with `map<string, string> vars` for variable overrides

### Sets & Sources

- **`ItemSet`** — set id/name, member item refs, tiered bonuses
- **`SetBonus`** — pieces required, description, stat bonuses, special effects
- **`ItemSource`** — source type (drop/shop/craft/quest/gather), ref, drop rate, quantity range

### Extensibility

- **`ItemExtension`** — namespaced key-value pairs (`oneof` string/int/float/bool/bytes) for game-specific data without modifying the proto

## Item Message Fields (by section)

```
Identity:        id, slug, name, title, description, lore
Classification:  type_flags, rarity, element, tags
Visual:          img, icon, emoji, pixel_density, sorting_layer/order, model/animation/sound refs
Inventory:       max_stack, stackable, weight
Requirements:    level_requirement, quest_requirement
Economy:         buy_price, sell_price, tradeable
Consumable:      consumable, cooldown, action, use_effects[]
Equipment:       equipment { slot, bonuses, special, durability }
Food:            food { heals, doses, cooking_level/xp, burn_level, duration, buffs }
Skilling:        skilling { skill, level, xp, tool, gather_time, respawn, node }
Crafting:        recipes[] { ingredients, tools, skill, level, xp, quantity, facility }
Deployable:      deployable { size, pivot, prefab, scale, snap, scripts, type }
Resistances:     resistances[], affinities[]
Scripts:         scripts[] { guid, name, vars }
Sources:         sources[] { type, ref, name, drop_rate, quantity }
Relations:       related_item_refs[], set_ref
Durability:      durability, max_durability
Extensions:      extensions[] { key, value }
Metadata:        credits, drafted
```

## Registry

`ItemRegistry` contains:
- `repeated Item items` — all item definitions
- `repeated ItemSet sets` — item set definitions (span multiple items)

## Related

- NPC proto: [`../npc/`](../npc/)
- Common types: [`../kbve/common.proto`](../kbve/common.proto)
- Codegen: [`../../codegen/`](../../codegen/)
