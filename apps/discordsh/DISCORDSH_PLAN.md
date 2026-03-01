# DiscordSH — Gameplay Roadmap

## Current State (v0.2)

The dungeon crawler game "The Glass Catacombs" has been overhauled with a comprehensive gameplay expansion covering combat mechanics, character progression, and party coordination.

### Implemented Features

#### Combat System
- **Critical Hits**: 10% base chance (class/gear modifiable), doubles damage
- **Defend Rework**: Blocking halves next incoming hit instead of flat armor bonus
- **Weakened Effect**: Reduces outgoing damage by 30%
- **Stunned Effect**: Skips the affected entity's turn
- **Sharpened Effect**: +3 bonus damage per stack (from Whetstone)
- **Thorns Effect**: Reflects damage when hit (from Trap Kit or Spiked Plate)
- **Multi-enemy Encounters**: Rooms 3-5 have 25% chance of 2 enemies at 70% HP
- **Boss Enrage**: At 50% HP, bosses gain 50% damage boost and enrage indicator

#### Character System
- **3 Classes**: Warrior (tank, stagger passive), Rogue (crit/flee bonus), Cleric (heal ally)
- **XP & Leveling**: Earn XP from kills, level up grants +5 max HP and full heal
- **Equipment Slots**: Weapon (bonus damage) and Armor (bonus armor/HP)
- **Gear Specials**: LifeSteal, Thorns, CritBonus
- **8 Gear Items**: 4 weapons + 4 armor pieces across rarities

#### Items & Content
- **10 Consumable Items**: Including Smoke Bomb (guaranteed flee), Elixir (full heal), Whetstone, Antidote, Trap Kit
- **14 Enemy Types**: 2 per bracket plus 2 bosses, scaled by room depth
- **Gear Loot Tables**: Enemies drop equipment based on difficulty tier

#### Party Mode
- **Individual Actions**: Each party member submits their action independently
- **WaitingForActions Phase**: Shows who hasn't acted yet, auto-resolves when all ready
- **Gold/XP Sharing**: Split evenly among alive party members
- **Class Selection on Join**: `/dungeon join cleric`

#### Persistent Stats (Session-scoped)
- Lifetime kills, gold earned, rooms cleared, bosses defeated

### Architecture
- `types.rs` — All game types, enums, state structs
- `content.rs` — Item/gear/enemy registries, loot tables, XP tables, class stats
- `logic.rs` — Combat resolution, effect ticking, room advancement, equip/heal actions
- `render.rs` — Discord embed and component builders
- `card.rs` + `card.svg` — Askama SVG template → PNG game card rendering
- `router.rs` — Component interaction routing (`dng|<sid>|<action>|<arg>`)
- `session.rs` — DashMap-backed in-memory session store
- `dungeon.rs` — `/dungeon` slash command (start, join, leave, status, end)

## Future Ideas

- Database persistence for player stats across sessions
- Leaderboards and player profiles
- More story events and branching paths
- Crafting system using collected materials
- PvP arena mode
- Seasonal content rotations
