# OSRS Item Integration

## Overview

Static OSRS item pages with live GE prices, processing chains, and market flip strategies. Pages are auto-generated from the Wiki API with manual overrides for profitable items.

## Architecture

```
website/astro/
├── scripts/generate-osrs-items.mjs    # Generates ~10k item pages
├── src/content/docs/osrs/             # Auto-generated (DO NOT EDIT)
│   ├── logs.mdx
│   ├── yew-longbow.mdx
│   └── ... (~10k items)
├── data/osrs-overrides/               # Manual overrides (SAFE TO EDIT)
│   ├── _1511.mdx                      # Logs
│   ├── _1515.mdx                      # Yew logs
│   └── _*.mdx                         # By item ID
└── src/components/osrs/
    ├── OSRSItemPanel.astro            # Item display panel
    └── OSRSPriceWidget.tsx            # Live price widget
```

## Commands

```bash
cd website/astro
pnpm generate:osrs    # Regenerate all item pages with overrides
pnpm build            # Build site (includes PageFind indexing)
```

## Override System

### Creating an Override

1. Find item ID from [OSRS Wiki](https://oldschool.runescape.wiki/) or generated page
2. Create `data/osrs-overrides/_ITEMID.mdx`
3. Add markdown content with internal links
4. Run `pnpm generate:osrs` to inject content

### Override Template

```mdx
## Processing

Describe how to process this item into something more valuable.

| Input                   | Output                  | Skill Level | XP  |
| ----------------------- | ----------------------- | ----------- | --- |
| [Item A](/osrs/item-a/) | [Item B](/osrs/item-b/) | 50          | 100 |

## Market Flip Strategy

**Method Name:**

- Step 1: Buy X
- Step 2: Process into Y
- Calculate: `Output price - Input price - Costs = Profit`

## Related Items

- [Related Item](/osrs/related-item/) - Description
```

---

## Priority Items for Overrides

Focus on items with clear processing chains and market flip potential.

### Fletching Chain (Implemented)

| ID   | Item            | Override Focus         |
| ---- | --------------- | ---------------------- |
| 1511 | Logs            | Arrow shaft production |
| 1515 | Yew logs        | Longbow processing     |
| 1513 | Magic logs      | High-tier fletching    |
| 52   | Arrow shaft     | Bulk processing        |
| 53   | Headless arrow  | Arrow production       |
| 66   | Yew longbow (u) | Stringing profit       |
| 855  | Yew longbow     | Alch target (768 GP)   |
| 859  | Magic longbow   | Alch target (1,536 GP) |
| 1777 | Bow string      | Stringing bows         |
| 1779 | Flax            | Spinning profit        |
| 314  | Feather         | Arrow/fishing supply   |
| 561  | Nature rune     | Alch cost calculation  |

### Smithing Chain (Implemented)

| ID   | Item           | Override Focus          |
| ---- | -------------- | ----------------------- |
| 440  | Iron ore       | Bar smelting            |
| 453  | Coal           | Bar requirements        |
| 2353 | Steel bar      | Cannonball production   |
| 2357 | Gold bar       | Jewelry crafting        |
| 2363 | Runite bar     | High-tier smithing      |
| 1127 | Rune platebody | Alch target (39,000 GP) |
| 1319 | Rune 2h sword  | Alch target (38,400 GP) |

### Cooking Chain (Implemented)

| ID  | Item        | Override Focus    |
| --- | ----------- | ----------------- |
| 317 | Raw shrimps | Beginner cooking  |
| 377 | Raw lobster | Mid-tier cooking  |
| 379 | Lobster     | Budget PvM food   |
| 383 | Raw shark   | High-tier cooking |
| 385 | Shark       | End-game food     |

### Herblore Chain (Implemented)

| ID   | Item             | Override Focus       |
| ---- | ---------------- | -------------------- |
| 257  | Ranarr weed      | Prayer potion herb   |
| 3000 | Snapdragon       | Super restore herb   |
| 2434 | Prayer potion(4) | Essential consumable |
| 3024 | Super restore(4) | Raid consumable      |
| 5295 | Ranarr seed      | Herb farming profit  |

### Crafting Chain (Implemented)

| ID   | Item             | Override Focus  |
| ---- | ---------------- | --------------- |
| 1739 | Cowhide          | Tanning profit  |
| 1753 | Green dragonhide | D'hide crafting |
| 536  | Dragon bones     | Prayer training |

### Runes Chain (Implemented - Jan 2026)

| ID   | Item        | Override Focus        |
| ---- | ----------- | --------------------- |
| 554  | Fire rune   | Elemental, High Alch  |
| 555  | Water rune  | Elemental, Ice spells |
| 556  | Air rune    | Elemental, most used  |
| 557  | Earth rune  | Elemental, utility    |
| 558  | Mind rune   | Strike spells         |
| 562  | Chaos rune  | Bolt spells           |
| 9075 | Astral rune | Lunar spells          |

### Mining/Smithing Chain (Implemented - Jan 2026)

| ID   | Item           | Override Focus    |
| ---- | -------------- | ----------------- |
| 436  | Copper ore     | Bronze bar        |
| 438  | Tin ore        | Bronze bar        |
| 442  | Silver ore     | Silver bar        |
| 444  | Gold ore       | Gold bar, jewelry |
| 447  | Mithril ore    | Mithril bar       |
| 449  | Adamantite ore | Adamant bar       |
| 2349 | Bronze bar     | Entry smithing    |
| 2355 | Silver bar     | Crafting          |

### Gems Chain (Implemented - Jan 2026)

| ID    | Item           | Override Focus    |
| ----- | -------------- | ----------------- |
| 1615  | Dragonstone    | High-tier jewelry |
| 1619  | Uncut ruby     | Ruby bolts        |
| 1621  | Uncut emerald  | Ring of dueling   |
| 1623  | Uncut sapphire | Ring of recoil    |
| 6573  | Onyx           | Fury amulet       |
| 19493 | Zenyte         | BiS jewelry       |

### Fish Chain (Implemented - Jan 2026)

| ID   | Item          | Override Focus    |
| ---- | ------------- | ----------------- |
| 359  | Raw tuna      | Mid-level cooking |
| 361  | Tuna          | Budget food       |
| 371  | Raw swordfish | F2P cooking       |
| 3142 | Raw karambwan | Combo eating      |
| 7944 | Raw monkfish  | Mid-tier food     |

### Herbs Chain (Implemented - Jan 2026)

| ID  | Item              | Override Focus  |
| --- | ----------------- | --------------- |
| 207 | Grimy ranarr weed | Cleaning profit |
| 225 | Limpwurt root     | Super strength  |
| 245 | Wine of zamorak   | Ranging potion  |
| 263 | Kwuarm            | Super strength  |
| 267 | Dwarf weed        | Ranging potion  |
| 269 | Torstol           | Super combat    |

### Bones/Prayer Chain (Implemented - Jan 2026)

| ID    | Item                  | Override Focus |
| ----- | --------------------- | -------------- |
| 532   | Big bones             | F2P Prayer     |
| 6812  | Wyvern bones          | Slayer bones   |
| 13511 | Ensouled dragon head  | Arceuus Prayer |
| 22124 | Superior dragon bones | Best Prayer XP |

### Combat Gear (Implemented - Jan 2026)

| ID    | Item             | Override Focus   |
| ----- | ---------------- | ---------------- |
| 4151  | Abyssal whip     | 70 Attack weapon |
| 4587  | Dragon scimitar  | 60 Attack weapon |
| 10034 | Red chinchompa   | Ranged training  |
| 11959 | Black chinchompa | Best Ranged XP   |

### Utility Items (Implemented - Jan 2026)

| ID    | Item             | Override Focus      |
| ----- | ---------------- | ------------------- |
| 227   | Vial of water    | Herblore base       |
| 567   | Unpowered orb    | Battlestaff chain   |
| 569   | Fire orb         | Safe charging       |
| 573   | Air orb          | Wilderness charging |
| 1391  | Battlestaff      | Orb attachment      |
| 1704  | Amulet of glory  | Teleports           |
| 1775  | Molten glass     | Crafting base       |
| 1783  | Bucket of sand   | Glass making        |
| 2572  | Ring of wealth   | Drop table          |
| 2970  | Mort myre fungus | Super energy        |
| 5952  | Antidote++(4)    | Poison immunity     |
| 6693  | Crushed nest     | Sara brew           |
| 11232 | Dragon dart tip  | Fastest Fletching   |
| 21347 | Amethyst         | Arrow/bolt tips     |
| 21483 | Ultracompost     | Best yields         |
| 21490 | Seaweed spore    | Giant seaweed       |
| 21504 | Giant seaweed    | Superglass Make     |

### Farming (Implemented - Jan 2026)

| ID    | Item         | Override Focus |
| ----- | ------------ | -------------- |
| 5974  | Coconut      | Tree payments  |
| 8780  | Teak plank   | Construction   |
| 19669 | Redwood logs | Arrow shafts   |
| 22929 | Dragonfruit  | Tree payments  |

### Food Chain (Implemented - Jan 2026)

| ID   | Item             | Override Focus   |
| ---- | ---------------- | ---------------- |
| 329  | Salmon           | F2P food         |
| 331  | Raw salmon       | F2P fishing      |
| 333  | Trout            | Entry-level food |
| 335  | Raw trout        | Entry fishing    |
| 373  | Swordfish        | F2P combat food  |
| 391  | Manta ray        | High-tier food   |
| 3144 | Cooked karambwan | Combo eating     |
| 7946 | Monkfish         | Mid-tier food    |

### Ranged Ammo (Implemented - Jan 2026)

| ID    | Item           | Override Focus     |
| ----- | -------------- | ------------------ |
| 11230 | Dragon dart    | Best blowpipe ammo |
| 21326 | Amethyst arrow | High-tier arrows   |
| 25849 | Amethyst dart  | Mid-tier blowpipe  |

### Dragonhide Leather (Implemented - Jan 2026)

| ID   | Item                 | Override Focus    |
| ---- | -------------------- | ----------------- |
| 2503 | Black d'hide body    | Best d'hide armor |
| 2505 | Blue dragon leather  | Mid-tier leather  |
| 2507 | Red dragon leather   | High-tier leather |
| 2509 | Black dragon leather | Best leather      |

### Combat Potions (Implemented - Jan 2026)

| ID    | Item              | Override Focus    |
| ----- | ----------------- | ----------------- |
| 2436  | Super attack(4)   | Attack boost      |
| 2442  | Super defence(4)  | Defence boost     |
| 2444  | Ranging potion(4) | Ranged boost      |
| 3051  | Grimy snapdragon  | Herb cleaning     |
| 12695 | Super combat(4)   | Best melee potion |

---

## Future Override Priorities

### High Priority (Not Yet Implemented)

| ID   | Item              | Reason           |
| ---- | ----------------- | ---------------- |
| 1761 | Red dragonhide    | D'hide chain     |
| 1755 | Chisel            | Gem cutting tool |
| 2440 | Super strength(4) | Combat potion    |

### Medium Priority

| ID   | Item             | Reason       |
| ---- | ---------------- | ------------ |
| 995  | Coins            | GP reference |
| 2454 | Attack potion(4) | Basic potion |
| 3040 | Magic potion(4)  | Magic boost  |

---

## API Integration

### Price Data

Live prices fetched from Axum API:

```
GET /api/v1/osrs/{itemId}
```

Response:

```json
{
	"id": 1515,
	"name": "Yew logs",
	"high": 250,
	"low": 245,
	"avg": 247,
	"high_time": 1704412800,
	"low_time": 1704412750
}
```

### Volume Data

24h volume from OSRS Wiki Prices API:

```
GET https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=1h&id={itemId}
```

---

## Backlink Strategy

Internal links in overrides create automatic backlinks via starlight-site-graph:

```
Logs → Arrow shaft → Headless arrow → Bronze arrow
  ↓
Yew logs → Yew longbow (u) → Yew longbow → Nature rune
  ↓
Magic logs → Magic longbow (u) → Magic longbow
```

This creates a web of interconnected pages for:

- SEO internal linking
- User navigation between related items
- Processing chain discovery

---

## Maintenance

### Adding New Overrides

1. Identify profitable processing chain
2. Find all item IDs involved
3. Create override files with cross-links
4. Run `pnpm generate:osrs`
5. Verify backlinks appear on related pages

### Updating Override Content

1. Edit `data/osrs-overrides/_ITEMID.mdx`
2. Run `pnpm generate:osrs`
3. Content is re-injected into generated page

### Override Files Are Safe

- Located outside `src/content/docs/`
- Never deleted by generation script
- Manually maintained

---

## Automated Workflow

### Batch Processing Protocol

When adding multiple items, use this workflow:

1. **Queue items** in the appropriate batch below
2. **Verify on wiki** - Check item ID and gather info from `oldschool.runescape.wiki/w/Item_name`
3. **Generate override** - Create `_ITEMID.mdx` with template
4. **Mark complete** - Move item from queue to implemented section
5. **Run build** - `pnpm generate:osrs` after batch complete

### Claude Code Instructions

When processing a batch:

```
For each item in the CURRENT BATCH queue:
1. Fetch wiki data: https://oldschool.runescape.wiki/w/{item_name}
2. Create override file using the TEMPLATE below
3. Include: processing chains, related items, market strategies
4. Use internal links: [Item Name](/osrs/item-slug/)
5. Mark item as DONE in queue
```

### Override Template (Copy-Paste Ready)

```mdx
## Obtaining

How to obtain this item (monster drops, skilling, shops, etc.)

## Processing

| Input                         | Output                  | Skill | Level | XP  |
| ----------------------------- | ----------------------- | ----- | ----- | --- |
| [This item](/osrs/this-item/) | [Output](/osrs/output/) | Skill | ##    | ##  |

## Market Strategy

**Primary Use:**

- Description of main market activity
- Calculate: `Output price - Input price = Profit`

**Tips:**

- Buy limit: X per 4 hours
- Volume considerations
- Best times to trade

## Related Items

- [Related 1](/osrs/related-1/) - How it relates
- [Related 2](/osrs/related-2/) - How it relates
```

---

## Item Queues

### CURRENT BATCH (In Progress)

Items actively being processed. Move to implemented section when done.

| ID  | Item        | Status | Wiki Link |
| --- | ----------- | ------ | --------- |
| -   | Queue clear | -      | -         |

### RECENTLY COMPLETED (Jan 21, 2026) - Batch 2

| ID    | Item                 | Override Focus         |
| ----- | -------------------- | ---------------------- |
| 4708  | Ahrim's hood         | Barrows magic helm     |
| 4714  | Ahrim's robeskirt    | Barrows magic legs     |
| 4716  | Dharok's helm        | Barrows melee helm     |
| 4720  | Dharok's platebody   | Barrows melee body     |
| 4722  | Dharok's platelegs   | Barrows melee legs     |
| 4724  | Guthan's helm        | Barrows healing set    |
| 4732  | Karil's coif         | Barrows ranged helm    |
| 4736  | Karil's leathertop   | Barrows ranged body    |
| 4738  | Karil's leatherskirt | Barrows ranged legs    |
| 4745  | Torag's helm         | Barrows tank helm      |
| 4749  | Torag's platebody    | Barrows tank body      |
| 4751  | Torag's platelegs    | Barrows tank legs      |
| 4753  | Verac's helm         | Barrows prayer helm    |
| 4757  | Verac's brassard     | Barrows prayer body    |
| 4759  | Verac's plateskirt   | Barrows prayer legs    |
| 11702 | Armadyl hilt         | GWD godsword component |
| 11704 | Bandos hilt          | GWD godsword component |
| 11706 | Saradomin hilt       | GWD godsword component |
| 11708 | Zamorak hilt         | GWD godsword component |
| 4155  | Enchanted gem        | Slayer communication   |
| 3026  | Super restore(3)     | Essential PvM potion   |
| 3028  | Super restore(2)     | Essential PvM potion   |
| 6568  | Obsidian cape        | Pre-fire cape option   |
| 1706  | Amulet of glory(3)   | Teleport amulet        |
| 1708  | Amulet of glory(2)   | Teleport amulet        |
| 1710  | Amulet of glory(1)   | Teleport amulet        |

### RECENTLY COMPLETED (Jan 21, 2026) - Batch 1

| ID    | Item                        | Override Focus           |
| ----- | --------------------------- | ------------------------ |
| 26376 | Torva platelegs             | BiS melee legs, HP boost |
| 11663 | Void mage helm              | Magic void set           |
| 11664 | Void ranger helm            | Ranged void set          |
| 6687  | Saradomin brew(3)           | Essential PvM consumable |
| 6689  | Saradomin brew(2)           | Essential PvM consumable |
| 6691  | Saradomin brew(1)           | Essential PvM consumable |
| 4712  | Ahrim's robetop             | Barrows magic armor      |
| 22969 | Hydra's heart               | Brimstone ring component |
| 22971 | Hydra's fang                | Brimstone ring component |
| 22973 | Hydra's eye                 | Brimstone ring component |
| 11248 | Eclectic impling jar        | Medium clue farming      |
| 11256 | Dragon impling jar          | Elite clue farming       |
| 2579  | Wizard boots                | Magic clue reward        |
| 12598 | Holy sandals                | Prayer clue reward       |
| 5296  | Toadflax seed               | Herb farming             |
| 23997 | Blade of saeldor (inactive) | BiS slash weapon         |

### RECENTLY COMPLETED (Jan 7, 2026)

| ID    | Item                         | Override Focus                |
| ----- | ---------------------------- | ----------------------------- |
| 22978 | Scythe of vitur              | ToB BiS melee, 3-hit mechanic |
| 22325 | Twisted bow                  | CoX BiS ranged, magic scaling |
| 24225 | Sanguinesti staff            | ToB mage, lifesteal           |
| 27277 | Tumeken's shadow             | ToA BiS mage, 3x multiplier   |
| 11806 | Saradomin godsword           | Healing spec                  |
| 11808 | Zamorak godsword             | Freeze spec                   |
| 12924 | Toxic blowpipe               | Fast ranged, venom            |
| 21012 | Dragon hunter crossbow       | Dragon slayer BiS             |
| 12791 | Rune pouch                   | Rune storage utility          |
| 21034 | Tome of fire                 | Fire spell damage boost       |
| 11920 | Dragon pickaxe               | Best pickaxe + upgrades       |
| 13576 | Dragon warhammer             | Defence drain spec            |
| 4151  | Abyssal whip                 | 70 Attack BiS                 |
| 4587  | Dragon scimitar              | 60 Attack BiS                 |
| 11802 | Armadyl godsword             | KO spec weapon                |
| 11804 | Bandos godsword              | Defence drain spec            |
| 1761  | Red dragonhide               | D'hide tanning/crafting       |
| 1755  | Chisel                       | Gem cutting tool              |
| 995   | Coins                        | Currency reference            |
| 2454  | Attack potion(4)             | Basic combat potion           |
| 3040  | Magic potion(4)              | Magic boost                   |
| 2459  | Defence potion(4)            | Defence boost                 |
| 113   | Strength potion(4)           | Strength boost                |
| 2483  | Cadantine blood potion (unf) | Bastion/Battlemage base       |
| 211   | Serum 207 (3)                | Herblore training             |
| 259   | Irit leaf                    | Super attack/antipoison       |
| 265   | Cadantine                    | Super defence/antifire        |
| 2440  | Super strength(4)            | Combat potion                 |
| 2452  | Antifire(4)                  | Dragon protection             |
| 2481  | Irit potion (unf)            | Zahur service                 |
| 2970  | Mort myre fungus             | Super energy                  |
| 3022  | Super energy(4)              | Run energy restore            |
| 3049  | Cadantine potion (unf)       | Zahur service                 |
| 10925 | Zahur                        | NPC potion service            |
| 11951 | White lily                   | Flower patch protection       |

### NEXT BATCH (Queued)

Items ready for next processing session.

| ID    | Item              | Category | Wiki Link                                                      |
| ----- | ----------------- | -------- | -------------------------------------------------------------- |
| 13235 | Eternal boots     | Magic    | [Wiki](https://oldschool.runescape.wiki/w/Eternal_boots)       |
| 13239 | Primordial boots  | Combat   | [Wiki](https://oldschool.runescape.wiki/w/Primordial_boots)    |
| 13237 | Pegasian boots    | Ranged   | [Wiki](https://oldschool.runescape.wiki/w/Pegasian_boots)      |
| 12931 | Serpentine helm   | Combat   | [Wiki](https://oldschool.runescape.wiki/w/Serpentine_helm)     |
| 21018 | Dinh's bulwark    | Tank     | [Wiki](https://oldschool.runescape.wiki/w/Dinh%27s_bulwark)    |
| 22322 | Kodai wand        | Magic    | [Wiki](https://oldschool.runescape.wiki/w/Kodai_wand)          |
| 21006 | Inquisitor's mace | Combat   | [Wiki](https://oldschool.runescape.wiki/w/Inquisitor%27s_mace) |
| 27235 | Fang              | Combat   | [Wiki](https://oldschool.runescape.wiki/w/Osmumten%27s_fang)   |

### BACKLOG (Future Items)

Items identified for future implementation.

| ID    | Item                    | Category | Priority |
| ----- | ----------------------- | -------- | -------- |
| 24417 | Masori body             | Ranged   | High     |
| 24419 | Masori chaps            | Ranged   | High     |
| 26374 | Torva platebody         | Combat   | High     |
| 26376 | Torva platelegs         | Combat   | High     |
| 26382 | Torva full helm         | Combat   | High     |
| 25865 | Zaryte crossbow         | Ranged   | High     |
| 22981 | Avernic defender        | Combat   | High     |
| 21000 | Inquisitor's hauberk    | Combat   | High     |
| 21003 | Inquisitor's plateskirt | Combat   | High     |
| 13652 | Dragon claws            | Combat   | High     |

---

## Schema System

### Overview

OSRS items can use comprehensive typed frontmatter schemas defined in `src/data/schema/osrs/IOSRSSchema.ts`. This enables:

- Structured equipment stats instead of markdown tables
- SEO/meta integration with Starlight
- Drop sources, shop sources, and skilling data
- Creation recipes and cooking information
- Treasure trail associations
- Related items linking

### Schema Location

```
src/data/schema/
├── index.ts              # Main exports (includes osrs/)
└── osrs/
    ├── index.ts          # OSRS schema exports
    └── IOSRSSchema.ts    # All OSRS schemas
```

### Available Types

| Schema               | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| **Core**             |                                                        |
| `OSRSExtended`       | Full item type with all optional data                  |
| `OSRSMeta`           | SEO/meta information (description, og:image, keywords) |
| `OSRSItemProperties` | Wiki infobox data (tradeable, stackable, release date) |
| **Equipment**        |                                                        |
| `OSRSEquipment`      | Attack/defence bonuses, slot, requirements             |
| `OSRSSpecialAttack`  | Weapon special attack details                          |
| `OSRSSetBonus`       | Set bonuses (Barrows, Void, etc.)                      |
| **Consumables**      |                                                        |
| `OSRSPotion`         | Potion effects and boosts                              |
| `OSRSFood`           | Healing and combo food data                            |
| `OSRSCooking`        | Cooking levels, XP, burn rates                         |
| **Sources**          |                                                        |
| `OSRSDropTable`      | Monster drop sources and rates                         |
| `OSRSShopSource`     | Shop locations and prices                              |
| `OSRSSkillingSource` | Skilling methods (fishing, mining, etc.)               |
| **Creation**         |                                                        |
| `OSRSRecipe`         | Crafting/herblore/smithing recipes                     |
| `OSRSMaterial`       | Recipe ingredients                                     |
| **Misc**             |                                                        |
| `OSRSTreasureTrail`  | Clue scroll data                                       |
| `OSRSRelatedItem`    | Related item references                                |

---

### SEO / Meta Example

Integrates with Starlight's built-in SEO features:

```yaml
---
meta:
    description: 'Abyssal whip - Best-in-slot 70 Attack weapon in OSRS'
    keywords: ['osrs', 'abyssal whip', 'melee', 'slayer']
    og_image: 'https://oldschool.runescape.wiki/images/Abyssal_whip.png'
    og_image_alt: 'Abyssal whip item sprite'
    twitter_card: summary_large_image
---
```

### Item Properties Example

```yaml
---
properties:
    release_date: '2005-01-26'
    tradeable: true
    tradeable_ge: true
    stackable: false
    noteable: true
    equipable: true
    weight: 0.453
    options: ['Wield', 'Drop', 'Examine']
---
```

### Equipment Frontmatter Example

```yaml
---
equipment:
    slot: weapon
    weapon_type: whip
    weight: 0.453
    attack_speed: 4
    attack_range: 1
    attack_bonus:
        stab: 0
        slash: 82
        crush: 0
        magic: 0
        ranged: 0
    defence_bonus:
        stab: 0
        slash: 0
        crush: 0
        magic: 0
        ranged: 0
    other_bonus:
        melee_strength: 82
        ranged_strength: 0
        magic_damage: 0
        prayer: 0
    requirements:
        attack: 70
    degradable: false
special_attack:
    name: 'Energy Drain'
    energy: 50
    description: "Transfers 10% of opponent's run energy to you"
---
```

### Drop Sources Example

```yaml
---
drop_table:
    primary_source: 'Abyssal demon'
    best_drop_rate: '1/512'
    sources:
        - source: 'Abyssal demon'
          source_id: 415
          combat_level: 124
          quantity: '1'
          rarity: rare
          drop_rate: '1/512'
          members_only: true
        - source: 'Abyssal Sire'
          source_id: 5886
          combat_level: 350
          quantity: '1'
          rarity: uncommon
          drop_rate: '1/100'
          members_only: true
---
```

### Recipe Example

```yaml
---
recipes:
    - skill: herblore
      level: 72
      xp: 142.5
      materials:
          - item_name: 'Snapdragon'
            item_id: 3000
            quantity: 1
          - item_name: "Red spiders' eggs"
            item_id: 223
            quantity: 1
      tools: ['Pestle and mortar']
      ticks: 2
      members_only: true
---
```

### Food / Cooking Example

```yaml
---
food:
    heals: 20
    cooking_level: 80
    cooking_xp: 210
    burn_level: 94
cooking:
    level: 80
    xp: 210
    stop_burn_level: 99
    stop_burn_level_gauntlets: 94
    raw_item_id: 383
    raw_item_name: 'Raw shark'
    ticks: 4
    burn_rates:
        - level: 80
          fire_rate: 64.06
          range_rate: 73.44
          gauntlets_rate: 86.72
---
```

### Related Items Example

```yaml
---
related_items:
    - item_id: 4178
      item_name: 'Abyssal whip (volcanic)'
      relationship: variant
      description: 'Volcanic recolor'
    - item_id: 12773
      item_name: 'Abyssal tentacle'
      relationship: upgrade
      description: 'Requires kraken tentacle'
---
```

---

### Equipment Slots

Valid `slot` values: `head`, `cape`, `neck`, `ammo`, `weapon`, `body`, `shield`, `legs`, `hands`, `feet`, `ring`, `2h`

### Weapon Types

Valid `weapon_type` values: `unarmed`, `axe`, `blunt`, `bow`, `bulwark`, `chinchompa`, `claw`, `crossbow`, `gun`, `pickaxe`, `polearm`, `polestaff`, `powered-staff`, `salamander`, `scythe`, `slash-sword`, `spear`, `spiked`, `stab-sword`, `staff`, `thrown`, `two-handed-sword`, `whip`

### Drop Rarities

Valid `rarity` values: `always`, `common`, `uncommon`, `rare`, `very-rare`, `varies`

### Creation Skills

Valid `skill` values: `herblore`, `crafting`, `smithing`, `fletching`, `cooking`, `construction`, `runecraft`, `magic`, `firemaking`

### Related Item Relationships

Valid `relationship` values: `variant`, `upgrade`, `downgrade`, `component`, `product`, `set-piece`, `alternative`

---

### Type Guards

Available helper functions for type checking:

```typescript
import {
	// Equipment
	hasEquipment,
	isWeapon,
	hasSpecialAttack,
	hasSetBonus,
	// Consumables
	isPotion,
	isFood,
	hasCooking,
	// Sources
	hasDropSources,
	hasShopSources,
	hasRecipes,
	// Misc
	isTreasureTrailItem,
	hasMeta,
	hasProperties,
	isTradeable,
	isQuestItem,
	// Utility
	generateMetaDescription,
} from '@/data/schema';
```

### Usage Examples

```typescript
// Check if item is equipable weapon
if (hasEquipment(item) && isWeapon(item)) {
	console.log(`Attack speed: ${item.equipment.attack_speed}`);
}

// Check for drop sources
if (hasDropSources(item)) {
	console.log(`Primary source: ${item.drop_table.primary_source}`);
}

// Generate SEO description
const description = generateMetaDescription(item);
```

### Migration Notes

- All fields are **optional** for backwards compatibility
- Existing markdown stat tables continue to work
- New items can use either approach (markdown or frontmatter)
- Frontmatter enables future features: stat comparison, filtering, search

---

## Tracking Progress

### Session Log

Record batch completions here:

| Date         | Items Added                                  | Total Overrides |
| ------------ | -------------------------------------------- | --------------- |
| Jan 2026     | Initial ~100 items                           | ~100            |
| Jan 7, 2026  | +35 items (potions, weapons, raid gear)      | ~135            |
| Jan 21, 2026 | +42 items (barrows, hilts, potions, utility) | ~881            |

### Quick Stats

To count current overrides:

```bash
ls -1 website/astro/data/osrs-overrides/_*.mdx | wc -l
```

### Verification Checklist

After each batch:

- [ ] All queue items have override files
- [ ] Internal links use correct slug format `/osrs/item-slug/`
- [ ] `pnpm generate:osrs` runs without errors
- [ ] Spot-check 2-3 items in browser
