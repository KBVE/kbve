# Embed Dungeon — "The Glass Catacombs"

A Discord-native, embed-first JRPG dungeon crawler with SVG card rendering, real-time combat, and cooperative party play.

## Game Loop

1. **Start**: `/dungeon start [solo|party] [warrior|rogue|cleric]`
2. **Explore**: Navigate rooms with combat, treasure, traps, merchants, rest shrines, story events, and cities
3. **Combat**: Attack, defend, use items, flee, or target specific enemies
4. **Progress**: Earn XP, level up, find gear, buy items from merchants
5. **Boss**: Defeat the boss at room 7+ for victory

## Classes

| Class | HP | Armor | Crit | Special |
|-------|-----|-------|------|---------|
| Warrior | 65 | 7 | 10% | 20% chance to stagger enemies |
| Rogue | 50 | 5 | 20% | First attack crits, +15% flee |
| Cleric | 55 | 6 | 10% | Heal ally for 10 HP (once/combat) |

## Equipment

### Weapons
| Name | Rarity | +Dmg | Special |
|------|--------|------|---------|
| Rusty Sword | Common | +2 | — |
| Shadow Dagger | Uncommon | +3 | +5% crit |
| Flame Axe | Rare | +4 | — |
| Vampiric Blade | Epic | +3 | 20% lifesteal |

### Armor
| Name | Rarity | +Armor | +HP | Special |
|------|--------|--------|-----|---------|
| Leather Vest | Common | +2 | — | — |
| Chain Mail | Uncommon | +4 | +5 | — |
| Spiked Plate | Rare | +5 | — | Thorns(3) |
| Crystal Armor | Epic | +6 | +10 | — |

## Items (10 total)

| Item | Rarity | Effect |
|------|--------|--------|
| Health Potion | Common | Heal 15 HP |
| Shield Scroll | Common | +3 armor for 3 turns |
| Fire Bomb | Uncommon | 12 dmg to enemy |
| Poison Vial | Uncommon | Apply Poison (2 stacks, 3 turns) |
| Bandage | Common | Remove Bleed |
| Smoke Bomb | Rare | Guaranteed flee |
| Elixir | Legendary | Full heal to max HP |
| Whetstone | Uncommon | +3 dmg for 3 turns |
| Antidote | Uncommon | Remove all negative effects |
| Trap Kit | Uncommon | Apply Thorns to self |

## Enemies (14 types + 2 bosses)

**Bracket 0-1**: Slime, Skeleton, Mushroom Sprite, Dust Mite
**Bracket 2-3**: Wraith, Shadow Beast, Cursed Knight, Fire Imp
**Bracket 4-5**: Dark Mage, Golem, Void Walker, Stone Sentinel
**Bosses**: Glass Golem (60 HP, 8 armor), Corrupted Warden (50 HP, 10 armor)

## Combat Mechanics

- **Base damage**: 6-12 + class bonus + weapon bonus + Sharpened stacks
- **Critical hits**: Double damage, chance = base + gear bonus
- **Defend**: Halves next incoming hit (replaces flat armor bonus)
- **Weakened**: -30% outgoing damage
- **Stunned**: Skip turn entirely
- **Boss enrage**: At 50% HP, +50% damage on all attacks
- **Multi-enemy**: 2 enemies possible in mid-game rooms, each takes independent turns

## XP & Leveling

| Enemy Level | XP |
|-------------|-----|
| 1 | 15 |
| 2 | 30 |
| 3 | 50 |
| 5 (Boss) | 100 |

| Player Level | XP to Next |
|-------------|------------|
| 1 → 2 | 100 |
| 2 → 3 | 200 |
| 3 → 4 | 350 |
| 4+ | 500 |

Level up: +5 max HP, full heal.

## Party Mode

- Up to 4 players (owner + 3)
- Each player picks a class on join
- Individual action submission per round
- Gold and XP split evenly among alive players
- WaitingForActions phase shows pending players

## Technical Stack

- **Rust** (poise 0.6.1, serenity 0.12.5)
- **Askama** SVG templates → resvg PNG rendering
- **DashMap** + `Arc<Mutex<SessionState>>` for concurrent sessions
- **Custom ID format**: `dng|<short_sid>|<action>|<arg>` (Discord 100-char limit)
