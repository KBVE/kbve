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

### Dragon Armour (Implemented - Mar 2026)

| ID    | Item             | Override Focus     |
| ----- | ---------------- | ------------------ |
| 1149  | Dragon med helm  | 60 Def helm        |
| 3140  | Dragon chainbody | 60 Def body        |
| 4087  | Dragon platelegs | 60 Def legs        |
| 11335 | Dragon full helm | Ultra-rare helm    |
| 21892 | Dragon platebody | DS2 craftable body |

### Melee Helms (Implemented - Mar 2026)

| ID    | Item              | Override Focus    |
| ----- | ----------------- | ----------------- |
| 10828 | Helm of neitiznot | Iconic melee helm |

### Magic Armour (Implemented - Mar 2026)

| ID   | Item               | Override Focus    |
| ---- | ------------------ | ----------------- |
| 4091 | Mystic robe top    | Budget magic body |
| 4093 | Mystic robe bottom | Budget magic legs |

### Ring Crafting Chain (Implemented - Mar 2026)

| ID    | Item             | Override Focus         |
| ----- | ---------------- | ---------------------- |
| 1637  | Sapphire ring    | Ring of recoil base    |
| 1639  | Emerald ring     | Ring of dueling base   |
| 1641  | Ruby ring        | Ring of forging base   |
| 1643  | Diamond ring     | Ring of life base      |
| 1645  | Dragonstone ring | Ring of wealth base    |
| 6575  | Onyx ring        | Ring of stone base     |
| 19538 | Zenyte ring      | Ring of suffering base |

### Teleport Jewelry (Implemented - Mar 2026)

| ID    | Item            | Override Focus     |
| ----- | --------------- | ------------------ |
| 11113 | Skills necklace | Skilling teleports |
| 11126 | Combat bracelet | Combat teleports   |

### Rune/Obsidian Weapons (Implemented - Mar 2026)

| ID   | Item           | Override Focus         |
| ---- | -------------- | ---------------------- |
| 1289 | Rune sword     | F2P stab weapon        |
| 1373 | Rune battleaxe | F2P strength weapon    |
| 6523 | Toktz-xil-ak   | Obsidian sword         |
| 1347 | Rune warhammer | F2P crush weapon       |
| 1432 | Rune mace      | F2P prayer weapon      |
| 6522 | Toktz-xil-ul   | Obsidian throwing ring |

### Granite Gear (Implemented - Mar 2026)

| ID    | Item           | Override Focus    |
| ----- | -------------- | ----------------- |
| 10589 | Granite helm   | 50 Def/Str helm   |
| 3122  | Granite shield | 50 Def/Str shield |
| 6809  | Granite legs   | 50 Def/Str legs   |

### Battlestaves (Implemented - Mar 2026)

| ID   | Item               | Override Focus          |
| ---- | ------------------ | ----------------------- |
| 6562 | Mud battlestaff    | Water+Earth combo (DKs) |
| 3053 | Lava battlestaff   | Earth+Fire combo        |
| 1401 | Mystic fire staff  | Fire elemental mystic   |
| 1403 | Mystic water staff | Water elemental mystic  |
| 1407 | Mystic earth staff | Earth elemental mystic  |
| 6563 | Mystic mud staff   | Water+Earth mystic      |
| 3054 | Mystic lava staff  | Earth+Fire mystic       |

### Splitbark Armour (Implemented - Mar 2026)

| ID   | Item           | Override Focus    |
| ---- | -------------- | ----------------- |
| 3385 | Splitbark helm | 40 Def/Magic helm |
| 3387 | Splitbark body | 40 Def/Magic body |
| 3389 | Splitbark legs | 40 Def/Magic legs |

### Skeletal Armour (Implemented - Mar 2026)

| ID   | Item             | Override Focus       |
| ---- | ---------------- | -------------------- |
| 6137 | Skeletal helm    | Fremennik magic helm |
| 6139 | Skeletal top     | Fremennik magic body |
| 6141 | Skeletal bottoms | Fremennik magic legs |

### Rock-shell Armour (Implemented - Mar 2026)

| ID   | Item             | Override Focus       |
| ---- | ---------------- | -------------------- |
| 6128 | Rock-shell helm  | Fremennik melee helm |
| 6129 | Rock-shell plate | Fremennik melee body |
| 6130 | Rock-shell legs  | Fremennik melee legs |

### Snakeskin/Frog Leather (Implemented - Mar 2026)

| ID    | Item              | Override Focus      |
| ----- | ----------------- | ------------------- |
| 6322  | Snakeskin body    | 30 Ranged/Def body  |
| 6324  | Snakeskin chaps   | 30 Ranged/Def legs  |
| 6328  | Snakeskin boots   | Budget ranged boots |
| 10954 | Frog-leather body | 25 Ranged/Def body  |

### Misc Weapons/Jewelry (Implemented - Mar 2026)

| ID    | Item              | Override Focus         |
| ----- | ----------------- | ---------------------- |
| 11037 | Brine sabre       | Niche 40 Attack weapon |
| 6724  | Seercull          | DK Supreme bow, spec   |
| 1729  | Amulet of defence | Defensive amulet       |

### Dragon Weapons (Implemented - Mar 2026)

| ID   | Item            | Override Focus          |
| ---- | --------------- | ----------------------- |
| 1215 | Dragon dagger   | PvP spec weapon, iconic |
| 1249 | Dragon spear    | Shove spec, Corp Beast  |
| 7158 | Dragon 2h sword | AoE Powerstab spec      |

### Spined Armour (Implemented - Mar 2026)

| ID   | Item         | Override Focus        |
| ---- | ------------ | --------------------- |
| 6131 | Spined helm  | Fremennik ranged helm |
| 6133 | Spined body  | Fremennik ranged body |
| 6135 | Spined chaps | Fremennik ranged legs |

### Boots/Shields (Implemented - Mar 2026)

| ID   | Item           | Override Focus            |
| ---- | -------------- | ------------------------- |
| 3105 | Climbing boots | +2 Str, no Def req, pures |
| 6524 | Toktz-ket-xil  | +5 Str shield, 60 Def     |

### Enchanted Rings (Implemented - Mar 2026)

| ID   | Item            | Override Focus             |
| ---- | --------------- | -------------------------- |
| 2568 | Ring of forging | 100% iron smelt, 140 uses  |
| 2570 | Ring of life    | Emergency teleport at ≤10% |

### Fremennik Helms (Implemented - Mar 2026)

| ID   | Item           | Override Focus        |
| ---- | -------------- | --------------------- |
| 3751 | Berserker helm | +3 Str melee helm     |
| 3753 | Warrior helm   | +5 Slash attack helm  |
| 3755 | Farseer helm   | +6 Magic attack helm  |
| 3749 | Archer helm    | +6 Ranged attack helm |

### Ranged Ammo & Crossbows (Implemented - Mar 2026)

| ID    | Item                | Override Focus             |
| ----- | ------------------- | -------------------------- |
| 8880  | Dorgeshuun crossbow | Budget ranged + bone bolts |
| 830   | Rune javelin        | Ballista ammo              |
| 21318 | Amethyst javelin    | Best non-dragon javelin    |

### Obsidian/Slayer Gear (Implemented - Mar 2026)

| ID    | Item           | Override Focus           |
| ----- | -------------- | ------------------------ |
| 6526  | Toktz-mej-tal  | Hybrid crush/magic staff |
| 4156  | Mirror shield  | Basilisk/Cockatrice req  |
| 11133 | Regen bracelet | 2x HP regen, 1 Def BiS   |

### Pies (Implemented - Mar 2026)

| ID   | Item        | Override Focus       |
| ---- | ----------- | -------------------- |
| 7170 | Mud pie     | PvP run energy drain |
| 7208 | Wild pie    | +5 Slayer boost      |
| 7198 | Admiral pie | +5 Fishing boost     |

### Dragon/Rune Skirts (Implemented - Mar 2026)

| ID   | Item              | Override Focus          |
| ---- | ----------------- | ----------------------- |
| 4585 | Dragon plateskirt | Same stats as platelegs |
| 1093 | Rune plateskirt   | F2P best legs           |

### Low-Tier Ranged/Melee Armour (Implemented - Mar 2026)

| ID    | Item                 | Override Focus         |
| ----- | -------------------- | ---------------------- |
| 6326  | Snakeskin bandana    | Complete snakeskin set |
| 10956 | Frog-leather chaps   | 25 Ranged/Def legs     |
| 10958 | Frog-leather boots   | 25 Ranged/Def boots    |
| 10824 | Yak-hide armour legs | 20 Def Fremennik legs  |

### Novelty Weapons (Implemented - Mar 2026)

| ID    | Item      | Override Focus          |
| ----- | --------- | ----------------------- |
| 23360 | Ham joint | 3-tick speed, easy clue |

### Enchanted Bolts — Low Tier (Implemented - Mar 2026)

| ID   | Item               | Override Focus           |
| ---- | ------------------ | ------------------------ |
| 8882 | Bone bolts         | Cheapest ranged ammo     |
| 9236 | Opal bolts (e)     | Lucky Lightning effect   |
| 9238 | Pearl bolts (e)    | Sea Curse, fire enemies  |
| 9239 | Topaz bolts (e)    | Down to Earth, -1 Magic  |
| 9240 | Sapphire bolts (e) | Clear Mind, Prayer drain |
| 9241 | Emerald bolts (e)  | Magical Poison, 54% proc |

### Necklace Crafting Chain (Implemented - Mar 2026)

| ID    | Item              | Override Focus           |
| ----- | ----------------- | ------------------------ |
| 1656  | Sapphire necklace | Games necklace base      |
| 1658  | Emerald necklace  | Binding necklace base    |
| 1660  | Ruby necklace     | Digsite pendant base     |
| 1662  | Diamond necklace  | Phoenix necklace base    |
| 1664  | Dragon necklace   | Skills necklace base     |
| 6577  | Onyx necklace     | Berserker necklace base  |
| 19535 | Zenyte necklace   | Necklace of anguish base |
| 21157 | Necklace of faith | Emergency Prayer restore |

### Amulet Crafting Chain (Implemented - Mar 2026)

| ID    | Item               | Override Focus          |
| ----- | ------------------ | ----------------------- |
| 1694  | Sapphire amulet    | Amulet of magic base    |
| 1696  | Emerald amulet     | Amulet of defence base  |
| 1698  | Ruby amulet        | Amulet of strength base |
| 1700  | Diamond amulet     | Amulet of power base    |
| 1702  | Dragonstone amulet | Amulet of glory base    |
| 6581  | Onyx amulet        | Amulet of fury base     |
| 19541 | Zenyte amulet      | Amulet of torture base  |

### Bracelet Crafting Chain (Implemented - Mar 2026)

| ID    | Item                 | Override Focus           |
| ----- | -------------------- | ------------------------ |
| 11072 | Sapphire bracelet    | Bracelet of clay base    |
| 11076 | Emerald bracelet     | Castlewars bracelet base |
| 11085 | Ruby bracelet        | Inoculation bracelet     |
| 11092 | Diamond bracelet     | Forinthry bracelet base  |
| 11115 | Dragonstone bracelet | Combat bracelet base     |
| 11130 | Onyx bracelet        | Regen bracelet base      |

### Misc Weapons/Armour (Implemented - Mar 2026)

| ID    | Item                      | Override Focus             |
| ----- | ------------------------- | -------------------------- |
| 20849 | Dragon thrownaxe          | Dragon thrown weapon, spec |
| 22231 | Dragon boots ornament kit | Dragon boots cosmetic      |
| 10822 | Yak-hide armour (top)     | 20 Def Fremennik body      |

### Mystic Set Completion (Implemented - Mar 2026)

| ID   | Item          | Override Focus        |
| ---- | ------------- | --------------------- |
| 4089 | Mystic hat    | 40 Magic/20 Def head  |
| 4095 | Mystic gloves | 40 Magic/20 Def hands |
| 4097 | Mystic boots  | 40 Magic/20 Def feet  |

### Enchanted Robes (Implemented - Mar 2026)

| ID   | Item           | Override Focus             |
| ---- | -------------- | -------------------------- |
| 7400 | Enchanted hat  | Treasure trail mystic hat  |
| 7399 | Enchanted top  | Treasure trail mystic top  |
| 7398 | Enchanted robe | Treasure trail mystic legs |

### Slayer/Hybrid Boots (Implemented - Mar 2026)

| ID    | Item               | Override Focus             |
| ----- | ------------------ | -------------------------- |
| 22951 | Boots of brimstone | Hybrid boot, 44 Slayer req |

### Enchanted Dragon Bolts (Implemented - Mar 2026)

| ID    | Item                         | Override Focus              |
| ----- | ---------------------------- | --------------------------- |
| 21932 | Opal dragon bolts (e)        | Lucky Lightning effect      |
| 21934 | Jade dragon bolts (e)        | Earth's Fury knockdown      |
| 21936 | Pearl dragon bolts (e)       | Sea Curse, fire enemy bonus |
| 21938 | Topaz dragon bolts (e)       | Down to Earth, -1 Magic     |
| 21940 | Sapphire dragon bolts (e)    | Clear Mind, Prayer drain    |
| 21942 | Emerald dragon bolts (e)     | Magical Poison, 55% proc    |
| 21948 | Dragonstone dragon bolts (e) | Dragon's Breath dragonfire  |
| 21950 | Onyx dragon bolts (e)        | Life Leech heal effect      |

### Unenchanted Bolts (Implemented - Mar 2026)

| ID   | Item              | Override Focus          |
| ---- | ----------------- | ----------------------- |
| 9340 | Diamond bolts     | Fletching 65, +105 rStr |
| 9341 | Dragonstone bolts | Fletching 71, +117 rStr |

### Enchanted Rings (Implemented - Mar 2026)

| ID   | Item          | Override Focus         |
| ---- | ------------- | ---------------------- |
| 6583 | Ring of stone | Onyx enchant, cosmetic |

### Rune Trimmed (Implemented - Mar 2026)

| ID   | Item               | Override Focus          |
| ---- | ------------------ | ----------------------- |
| 2623 | Rune platebody (t) | Hard clue, same as rune |
| 2619 | Rune full helm (g) | Hard clue, gold-trimmed |

### F2P Rune Weapons (Implemented - Mar 2026)

| ID   | Item           | Override Focus      |
| ---- | -------------- | ------------------- |
| 1303 | Rune longsword | F2P stab, 40 Attack |
| 1213 | Rune dagger    | F2P stab, 40 Attack |
| 1185 | Rune sq shield | F2P shield, 40 Def  |

### Granite/Snakeskin (Implemented - Mar 2026)

| ID    | Item              | Override Focus       |
| ----- | ----------------- | -------------------- |
| 21646 | Granite longsword | 50 Atk/Str slash     |
| 22272 | Snakeskin shield  | 30 Ranged/Def shield |

### God D'hide Bodies (Implemented - Mar 2026)

| ID    | Item                | Override Focus            |
| ----- | ------------------- | ------------------------- |
| 10378 | Guthix d'hide body  | Hard clue, +1 prayer body |
| 10370 | Zamorak d'hide body | Hard clue, +1 prayer body |
| 12500 | Bandos d'hide body  | Hard clue, +1 prayer body |
| 12508 | Armadyl d'hide body | Hard clue, +1 prayer body |
| 12492 | Ancient d'hide body | Hard clue, +1 prayer body |

### God D'hide Shields (Implemented - Mar 2026)

| ID    | Item                  | Override Focus              |
| ----- | --------------------- | --------------------------- |
| 23188 | Guthix d'hide shield  | Hard clue, +1 prayer shield |
| 23194 | Zamorak d'hide shield | Hard clue, +1 prayer shield |
| 23203 | Bandos d'hide shield  | Hard clue, +1 prayer shield |
| 23200 | Armadyl d'hide shield | Hard clue, +1 prayer shield |
| 23197 | Ancient d'hide shield | Hard clue, +1 prayer shield |

### God D'hide Boots (Implemented - Mar 2026)

| ID    | Item                 | Override Focus             |
| ----- | -------------------- | -------------------------- |
| 19927 | Guthix d'hide boots  | Hard clue, +1 prayer boots |
| 19936 | Zamorak d'hide boots | Hard clue, +1 prayer boots |
| 19924 | Bandos d'hide boots  | Hard clue, +1 prayer boots |
| 19930 | Armadyl d'hide boots | Hard clue, +1 prayer boots |
| 19921 | Ancient d'hide boots | Hard clue, +1 prayer boots |

### God D'hide Chaps (Implemented - Mar 2026)

| ID    | Item          | Override Focus              |
| ----- | ------------- | --------------------------- |
| 10380 | Guthix chaps  | Hard clue, no Def req chaps |
| 10372 | Zamorak chaps | Hard clue, no Def req chaps |
| 12502 | Bandos chaps  | Hard clue, no Def req chaps |
| 12510 | Armadyl chaps | Hard clue, no Def req chaps |
| 12494 | Ancient chaps | Hard clue, no Def req chaps |

### God D'hide Coifs (Implemented - Mar 2026)

| ID    | Item         | Override Focus            |
| ----- | ------------ | ------------------------- |
| 10382 | Guthix coif  | Hard clue, +1 prayer head |
| 10374 | Zamorak coif | Hard clue, +1 prayer head |
| 12504 | Bandos coif  | Hard clue, +1 prayer head |
| 12512 | Armadyl coif | Hard clue, +1 prayer head |
| 12496 | Ancient coif | Hard clue, +1 prayer head |

### God D'hide Bracers (Implemented - Mar 2026)

| ID    | Item            | Override Focus              |
| ----- | --------------- | --------------------------- |
| 10376 | Guthix bracers  | Hard clue, no Def req hands |
| 10368 | Zamorak bracers | Hard clue, no Def req hands |
| 12498 | Bandos bracers  | Hard clue, no Def req hands |
| 12506 | Armadyl bracers | Hard clue, no Def req hands |
| 12490 | Ancient bracers | Hard clue, no Def req hands |

### Studded/Leather Armour (Implemented - Mar 2026)

| ID   | Item             | Override Focus     |
| ---- | ---------------- | ------------------ |
| 1133 | Studded body     | F2P 20 Ranged body |
| 1097 | Studded chaps    | F2P 20 Ranged legs |
| 1131 | Hardleather body | F2P 10 Def body    |

### Mage Training Arena Wands (Implemented - Mar 2026)

| ID   | Item          | Override Focus    |
| ---- | ------------- | ----------------- |
| 6908 | Beginner wand | MTA entry wand    |
| 6912 | Teacher wand  | MTA mid-tier wand |

### Gilded D'hide (Implemented - Mar 2026)

| ID    | Item                    | Override Focus             |
| ----- | ----------------------- | -------------------------- |
| 23264 | Gilded d'hide body      | Elite clue, cosmetic body  |
| 23267 | Gilded d'hide chaps     | Elite clue, cosmetic chaps |
| 23261 | Gilded d'hide vambraces | Elite clue, cosmetic vambs |
| 23258 | Gilded coif             | Elite clue, cosmetic coif  |

### Trimmed D'hide Bodies (Implemented - Mar 2026)

| ID    | Item                  | Override Focus         |
| ----- | --------------------- | ---------------------- |
| 12385 | Black d'hide body (t) | Elite clue, 70 Ranged  |
| 7374  | Blue d'hide body (g)  | Hard clue, 50 Ranged   |
| 7376  | Blue d'hide body (t)  | Hard clue, 50 Ranged   |
| 7370  | Green d'hide body (g) | Medium clue, 40 Ranged |
| 7372  | Green d'hide body (t) | Medium clue, 40 Ranged |
| 12327 | Red d'hide body (g)   | Hard clue, 60 Ranged   |
| 12331 | Red d'hide body (t)   | Hard clue, 60 Ranged   |

### Trimmed D'hide Chaps (Implemented - Mar 2026)

| ID    | Item                   | Override Focus         |
| ----- | ---------------------- | ---------------------- |
| 12387 | Black d'hide chaps (t) | Hard clue, 70 Ranged   |
| 7382  | Blue d'hide chaps (g)  | Medium clue, 50 Ranged |
| 7384  | Blue d'hide chaps (t)  | Medium clue, 50 Ranged |
| 7378  | Green d'hide chaps (g) | Medium clue, 40 Ranged |
| 7380  | Green d'hide chaps (t) | Medium clue, 40 Ranged |
| 12329 | Red d'hide chaps (g)   | Hard clue, 60 Ranged   |
| 12333 | Red d'hide chaps (t)   | Hard clue, 60 Ranged   |

### Misc Weapons (Implemented - Mar 2026)

| ID    | Item              | Override Focus         |
| ----- | ----------------- | ---------------------- |
| 6910  | Apprentice wand   | MTA mid wand, 50 Magic |
| 10156 | Hunter's crossbow | Kebbit bolt crossbow   |

### Elegant Shirts & Legs — Men's (Implemented - Mar 2026)

| ID    | Item                 | Override Focus         |
| ----- | -------------------- | ---------------------- |
| 10404 | Red elegant shirt    | Easy clue, body slot   |
| 10406 | Red elegant legs     | Easy clue, legs slot   |
| 10408 | Blue elegant shirt   | Easy clue, body slot   |
| 10410 | Blue elegant legs    | Easy clue, legs slot   |
| 10412 | Green elegant shirt  | Easy clue, body slot   |
| 10414 | Green elegant legs   | Easy clue, legs slot   |
| 10400 | Black elegant shirt  | Medium clue, body slot |
| 10402 | Black elegant legs   | Medium clue, legs slot |
| 10416 | Purple elegant shirt | Medium clue, body slot |
| 10418 | Purple elegant legs  | Medium clue, legs slot |
| 10420 | White elegant blouse | Medium clue, body slot |
| 10422 | White elegant skirt  | Medium clue, legs slot |
| 12347 | Gold elegant shirt   | Medium clue, body slot |
| 12349 | Gold elegant legs    | Medium clue, legs slot |
| 12315 | Pink elegant shirt   | Medium clue, body slot |
| 12317 | Pink elegant legs    | Medium clue, legs slot |

### Elegant Blouses & Skirts — Women's (Implemented - Mar 2026)

| ID    | Item                  | Override Focus         |
| ----- | --------------------- | ---------------------- |
| 10424 | Red elegant blouse    | Easy clue, body slot   |
| 10426 | Red elegant skirt     | Easy clue, legs slot   |
| 10428 | Blue elegant blouse   | Easy clue, body slot   |
| 10430 | Blue elegant skirt    | Easy clue, legs slot   |
| 10432 | Green elegant blouse  | Easy clue, body slot   |
| 10434 | Green elegant skirt   | Easy clue, legs slot   |
| 10436 | Purple elegant blouse | Medium clue, body slot |
| 10438 | Purple elegant skirt  | Medium clue, legs slot |
| 12343 | Gold elegant blouse   | Medium clue, body slot |
| 12345 | Gold elegant skirt    | Medium clue, legs slot |
| 12339 | Pink elegant blouse   | Medium clue, body slot |
| 12341 | Pink elegant skirt    | Medium clue, legs slot |

### H.A.M. Robes Set (Implemented - Mar 2026)

| ID   | Item       | Override Focus             |
| ---- | ---------- | -------------------------- |
| 4302 | Ham hood   | Head slot, pickpocket set  |
| 4298 | Ham shirt  | Body slot, pickpocket set  |
| 4300 | Ham robe   | Legs slot, pickpocket set  |
| 4304 | Ham cloak  | Cape slot, pickpocket set  |
| 4308 | Ham gloves | Hands slot, pickpocket set |
| 4310 | Ham boots  | Feet slot, pickpocket set  |

### Shade Robes (Implemented - Mar 2026)

| ID  | Item           | Override Focus      |
| --- | -------------- | ------------------- |
| 546 | Shade robe top | +5 Prayer, F2P body |
| 548 | Shade robe     | +4 Prayer, F2P legs |

### Zamorak Vestments (Implemented - Mar 2026)

| ID    | Item              | Override Focus              |
| ----- | ----------------- | --------------------------- |
| 10460 | Zamorak robe top  | Easy clue, +6 Prayer, 20 Pr |
| 10468 | Zamorak robe legs | Easy clue, +5 Prayer, 20 Pr |

### God Vestment Accessories (Implemented - Mar 2026)

| ID    | Item              | Override Focus               |
| ----- | ----------------- | ---------------------------- |
| 10470 | Saradomin stole   | Hard clue, +10 Prayer, neck  |
| 10474 | Zamorak stole     | Hard clue, +10 Prayer, neck  |
| 10440 | Saradomin crozier | Hard clue, +6 Prayer, weapon |
| 10454 | Guthix mitre      | Medium clue, +5 Prayer, head |

### Trimmed Amulets (Implemented - Mar 2026)

| ID    | Item                  | Override Focus                |
| ----- | --------------------- | ----------------------------- |
| 10354 | Amulet of glory (t4)  | Hard clue, trimmed glory      |
| 10366 | Amulet of magic (t)   | Hard clue, trimmed magic ammy |
| 23309 | Amulet of defence (t) | Hard clue, trimmed defence    |
| 23354 | Amulet of power (t)   | Hard clue, trimmed power      |

### Misc Treasure Trail Gear (Implemented - Mar 2026)

| ID    | Item            | Override Focus             |
| ----- | --------------- | -------------------------- |
| 23389 | Spiked manacles | Medium clue, +4 Str boots  |
| 23246 | Fremennik kilt  | Medium clue, cosmetic legs |
| 12379 | Rune cane       | Hard clue, cosmetic weapon |
| 12377 | Adamant cane    | Hard clue, cosmetic weapon |

### God Vestments — Saradomin/Guthix/Zamorak Completion (Implemented - Mar 2026)

| ID    | Item                | Override Focus               |
| ----- | ------------------- | ---------------------------- |
| 10452 | Saradomin mitre     | Medium clue, +5 Prayer, head |
| 10456 | Zamorak mitre       | Medium clue, +5 Prayer, head |
| 10458 | Saradomin robe top  | Easy clue, +6 Prayer, body   |
| 10462 | Guthix robe top     | Easy clue, +6 Prayer, body   |
| 10464 | Saradomin robe legs | Easy clue, +5 Prayer, legs   |
| 10466 | Guthix robe legs    | Easy clue, +5 Prayer, legs   |
| 10442 | Guthix crozier      | Hard clue, +6 Prayer, weapon |
| 10444 | Zamorak crozier     | Hard clue, +6 Prayer, weapon |
| 10446 | Saradomin cloak     | Medium clue, +3 Prayer, cape |
| 10448 | Guthix cloak        | Medium clue, +3 Prayer, cape |
| 10450 | Zamorak cloak       | Medium clue, +3 Prayer, cape |
| 10472 | Guthix stole        | Hard clue, +10 Prayer, neck  |

### God Vestments — Ancient (Implemented - Mar 2026)

| ID    | Item              | Override Focus               |
| ----- | ----------------- | ---------------------------- |
| 12193 | Ancient robe top  | Easy clue, +6 Prayer, body   |
| 12195 | Ancient robe legs | Easy clue, +5 Prayer, legs   |
| 12197 | Ancient cloak     | Medium clue, +3 Prayer, cape |
| 12199 | Ancient crozier   | Hard clue, +6 Prayer, weapon |
| 12201 | Ancient stole     | Hard clue, +10 Prayer, neck  |
| 12203 | Ancient mitre     | Medium clue, +5 Prayer, head |

### God Vestments — Armadyl (Implemented - Mar 2026)

| ID    | Item              | Override Focus               |
| ----- | ----------------- | ---------------------------- |
| 12253 | Armadyl robe top  | Easy clue, +6 Prayer, body   |
| 12255 | Armadyl robe legs | Easy clue, +5 Prayer, legs   |
| 12257 | Armadyl stole     | Hard clue, +10 Prayer, neck  |
| 12259 | Armadyl mitre     | Medium clue, +5 Prayer, head |
| 12261 | Armadyl cloak     | Medium clue, +3 Prayer, cape |
| 12263 | Armadyl crozier   | Hard clue, +6 Prayer, weapon |

### God Vestments — Bandos (Implemented - Mar 2026)

| ID    | Item             | Override Focus               |
| ----- | ---------------- | ---------------------------- |
| 12265 | Bandos robe top  | Easy clue, +6 Prayer, body   |
| 12267 | Bandos robe legs | Easy clue, +5 Prayer, legs   |
| 12269 | Bandos stole     | Hard clue, +10 Prayer, neck  |
| 12271 | Bandos mitre     | Medium clue, +5 Prayer, head |
| 12273 | Bandos cloak     | Medium clue, +3 Prayer, cape |
| 12275 | Bandos crozier   | Hard clue, +6 Prayer, weapon |

### Trimmed/Gold Wizard Robes (Implemented - Mar 2026)

| ID    | Item                  | Override Focus           |
| ----- | --------------------- | ------------------------ |
| 7390  | Blue wizard robe (g)  | Easy clue, +3 Magic body |
| 7392  | Blue wizard robe (t)  | Easy clue, +3 Magic body |
| 7394  | Blue wizard hat (g)   | Easy clue, +2 Magic head |
| 7396  | Blue wizard hat (t)   | Easy clue, +2 Magic head |
| 12449 | Black wizard robe (g) | Easy clue, +3 Magic body |
| 12451 | Black wizard robe (t) | Easy clue, +3 Magic body |
| 12453 | Black wizard hat (g)  | Easy clue, +2 Magic head |
| 12455 | Black wizard hat (t)  | Easy clue, +2 Magic head |

### Black Trimmed Armour (Implemented - Mar 2026)

| ID   | Item                 | Override Focus           |
| ---- | -------------------- | ------------------------ |
| 2583 | Black platebody (t)  | Easy clue, 10 Def body   |
| 2585 | Black platelegs (t)  | Easy clue, 10 Def legs   |
| 2587 | Black full helm (t)  | Easy clue, 10 Def head   |
| 2589 | Black kiteshield (t) | Easy clue, 10 Def shield |
| 2591 | Black platebody (g)  | Easy clue, 10 Def body   |
| 2593 | Black platelegs (g)  | Easy clue, 10 Def legs   |

### Adamant Trimmed Armour (Implemented - Mar 2026)

| ID   | Item                   | Override Focus             |
| ---- | ---------------------- | -------------------------- |
| 2599 | Adamant platebody (t)  | Medium clue, 30 Def body   |
| 2601 | Adamant platelegs (t)  | Medium clue, 30 Def legs   |
| 2603 | Adamant kiteshield (t) | Medium clue, 30 Def shield |
| 2605 | Adamant full helm (t)  | Medium clue, 30 Def head   |
| 2607 | Adamant platebody (g)  | Medium clue, 30 Def body   |
| 2609 | Adamant platelegs (g)  | Medium clue, 30 Def legs   |

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

| Date         | Items Added                                                    | Total Overrides |
| ------------ | -------------------------------------------------------------- | --------------- |
| Jan 2026     | Initial ~100 items                                             | ~100            |
| Jan 7, 2026  | +35 items (potions, weapons, raid gear)                        | ~135            |
| Jan 21, 2026 | +42 items (barrows, hilts, potions, utility)                   | ~881            |
| Mar 11, 2026 | +20 items (jewelry chains, misc weapons)                       | ~901            |
| Mar 12, 2026 | +20 items (dragon bolts e, mystic, trimmed)                    | ~921            |
| Mar 12, 2026 | +20 items (god d'hide sets, rune weapons)                      | ~941            |
| Mar 12, 2026 | +20 items (god chaps/coifs/bracers, misc)                      | ~961            |
| Mar 13, 2026 | +20 items (gilded/trimmed d'hide, misc)                        | ~981            |
| Mar 13, 2026 | +50 items (elegant sets, HAM, robes, vestments, amulets)       | ~1031           |
| Mar 13, 2026 | +50 items (god vestments, wizard robes, black/adamant trimmed) | ~1081           |

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
