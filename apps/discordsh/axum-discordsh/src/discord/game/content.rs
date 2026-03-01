use rand::Rng;

use super::types::*;

// ── Room templates ─────────────────────────────────────────────────

struct RoomTemplate {
    name: &'static str,
    description: &'static str,
}

fn combat_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Shattered Gallery",
            description: "Broken mirrors line the walls. Something stirs in the reflections...",
        },
        RoomTemplate {
            name: "Bone Hollow",
            description: "The air is thick with dust. Bones crunch underfoot.",
        },
        RoomTemplate {
            name: "Obsidian Chamber",
            description: "Dark stone absorbs all light. A shape moves in the void.",
        },
        RoomTemplate {
            name: "Flooded Crypt",
            description: "Ankle-deep water sloshes with each step. Ripples betray another presence.",
        },
    ];
    ROOMS
}

fn treasure_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Crystal Vault",
            description: "A small chamber glittering with crystalline formations. A chest sits in the center.",
        },
        RoomTemplate {
            name: "Gilded Alcove",
            description: "Gold-veined walls catch torchlight. Something sparkles on a pedestal.",
        },
        RoomTemplate {
            name: "Sunken Treasury",
            description: "Water drips from the ceiling onto piles of forgotten coins.",
        },
    ];
    ROOMS
}

fn trap_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Cracked Corridor",
            description: "The floor is riddled with hairline fractures. Each step could be your last.",
        },
        RoomTemplate {
            name: "Needle Gallery",
            description: "Thin holes dot the walls. The slightest breeze triggers a click.",
        },
        RoomTemplate {
            name: "Collapsing Passage",
            description: "Chunks of stone fall from above. The path narrows dangerously.",
        },
    ];
    ROOMS
}

fn rest_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Luminous Alcove",
            description: "A warm glow emanates from a shrine embedded in the wall. You feel at peace.",
        },
        RoomTemplate {
            name: "Quiet Spring",
            description: "Clear water bubbles up from a crack in the stone. Its warmth is soothing.",
        },
        RoomTemplate {
            name: "Ember Hearth",
            description: "An ancient fireplace still burns with pale blue flame. Safe, for now.",
        },
    ];
    ROOMS
}

fn boss_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "The Prismatic Throne",
            description: "An enormous chamber. At its center, a creature of living glass awakens.",
        },
        RoomTemplate {
            name: "The Shattered Crown",
            description: "Fragments of a massive crystal orbit the room. Power radiates from within.",
        },
    ];
    ROOMS
}

fn merchant_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Wanderer's Nook",
            description: "A cloaked figure beckons from behind a makeshift stall.",
        },
        RoomTemplate {
            name: "Dusty Bazaar",
            description: "Trinkets and vials line crooked shelves. A merchant eyes you expectantly.",
        },
    ];
    ROOMS
}

fn story_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Whispering Hall",
            description: "Voices echo from nowhere. The walls seem to breathe.",
        },
        RoomTemplate {
            name: "Mirror Chamber",
            description: "Your reflection moves on its own. It beckons you closer.",
        },
        RoomTemplate {
            name: "The Still Pool",
            description: "A dark pool of water fills the center. Shapes move beneath the surface.",
        },
    ];
    ROOMS
}

fn hallway_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "Narrow Corridor",
            description: "A tight passage stretches ahead. The sounds of battle fade behind you.",
        },
        RoomTemplate {
            name: "Dimly Lit Passage",
            description: "Flickering torches cast long shadows. You catch your breath.",
        },
        RoomTemplate {
            name: "Crumbling Tunnel",
            description: "Loose stones crunch underfoot. The air grows still.",
        },
        RoomTemplate {
            name: "Winding Stairwell",
            description: "Spiraling steps lead deeper. At least nothing followed you here.",
        },
    ];
    ROOMS
}

fn city_rooms() -> &'static [RoomTemplate] {
    static ROOMS: &[RoomTemplate] = &[
        RoomTemplate {
            name: "The Sunken Market",
            description: "Torches line carved stone walls. Merchants hawk wares from hollowed alcoves. An inn's sign creaks overhead.",
        },
        RoomTemplate {
            name: "Dwarven Outpost",
            description: "Sturdy stone buildings cluster around a central well. The smell of cooking drifts from a tavern doorway.",
        },
        RoomTemplate {
            name: "Mushroom Bazaar",
            description: "Giant luminescent fungi provide light. Stalls are carved into their massive stalks. A cozy inn glows warmly.",
        },
    ];
    ROOMS
}

fn pick_template(pool: &[RoomTemplate], rng: &mut impl Rng) -> (String, String) {
    let t = &pool[rng.gen_range(0..pool.len())];
    (t.name.to_owned(), t.description.to_owned())
}

// ── Item registry ───────────────────────────────────────────────────

/// Static item definitions for the dungeon.
pub fn item_registry() -> &'static [ItemDef] {
    static ITEMS: &[ItemDef] = &[
        ItemDef {
            id: "potion",
            name: "Potion",
            emoji: "\u{1F9EA}",
            description: "Restores 15 HP",
            max_stack: 5,
            rarity: ItemRarity::Common,
            use_effect: Some(UseEffect::Heal { amount: 15 }),
        },
        ItemDef {
            id: "bandage",
            name: "Bandage",
            emoji: "\u{1F9F7}",
            description: "Heals 5 HP and removes bleed",
            max_stack: 5,
            rarity: ItemRarity::Common,
            use_effect: Some(UseEffect::Heal { amount: 5 }),
        },
        ItemDef {
            id: "bomb",
            name: "Bomb",
            emoji: "\u{1F4A3}",
            description: "Deals 10 damage to the enemy",
            max_stack: 3,
            rarity: ItemRarity::Uncommon,
            use_effect: Some(UseEffect::DamageEnemy { amount: 10 }),
        },
        ItemDef {
            id: "ward",
            name: "Ward",
            emoji: "\u{1F9FF}",
            description: "Grants Shielded for 2 turns",
            max_stack: 2,
            rarity: ItemRarity::Rare,
            use_effect: Some(UseEffect::ApplyEffect {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns: 2,
            }),
        },
        ItemDef {
            id: "rations",
            name: "Rations",
            emoji: "\u{1F35E}",
            description: "Heals 8 HP (best used out of combat)",
            max_stack: 3,
            rarity: ItemRarity::Common,
            use_effect: Some(UseEffect::Heal { amount: 8 }),
        },
        ItemDef {
            id: "smoke_bomb",
            name: "Smoke Bomb",
            emoji: "\u{1F4A8}",
            description: "Guaranteed escape from combat",
            max_stack: 1,
            rarity: ItemRarity::Rare,
            use_effect: Some(UseEffect::GuaranteedFlee),
        },
        ItemDef {
            id: "elixir",
            name: "Elixir",
            emoji: "\u{2728}",
            description: "Fully restores HP",
            max_stack: 1,
            rarity: ItemRarity::Legendary,
            use_effect: Some(UseEffect::FullHeal),
        },
        ItemDef {
            id: "whetstone",
            name: "Whetstone",
            emoji: "\u{1FAA8}",
            description: "Sharpens weapon for 3 turns (+3 dmg)",
            max_stack: 2,
            rarity: ItemRarity::Uncommon,
            use_effect: Some(UseEffect::ApplyEffect {
                kind: EffectKind::Sharpened,
                stacks: 1,
                turns: 3,
            }),
        },
        ItemDef {
            id: "antidote",
            name: "Antidote",
            emoji: "\u{1F9F4}",
            description: "Removes all negative effects",
            max_stack: 2,
            rarity: ItemRarity::Uncommon,
            use_effect: Some(UseEffect::RemoveAllNegativeEffects),
        },
        ItemDef {
            id: "trap_kit",
            name: "Trap Kit",
            emoji: "\u{1FAA4}",
            description: "Sets a trap that damages attackers",
            max_stack: 2,
            rarity: ItemRarity::Uncommon,
            use_effect: Some(UseEffect::ApplyEffect {
                kind: EffectKind::Thorns,
                stacks: 5,
                turns: 2,
            }),
        },
    ];
    ITEMS
}

/// Look up an item definition by ID.
pub fn find_item(id: &str) -> Option<&'static ItemDef> {
    item_registry().iter().find(|item| item.id == id)
}

/// Default starting inventory for a new session.
pub fn starting_inventory() -> Vec<ItemStack> {
    vec![
        ItemStack {
            item_id: "potion".to_owned(),
            qty: 2,
        },
        ItemStack {
            item_id: "bandage".to_owned(),
            qty: 1,
        },
        ItemStack {
            item_id: "bomb".to_owned(),
            qty: 1,
        },
    ]
}

// ── Gear registry ───────────────────────────────────────────────────

/// Static gear definitions for the dungeon.
pub fn gear_registry() -> &'static [GearDef] {
    static GEAR: &[GearDef] = &[
        GearDef {
            id: "rusty_sword",
            name: "Rusty Sword",
            emoji: "\u{2694}",
            slot: EquipSlot::Weapon,
            rarity: ItemRarity::Common,
            bonus_damage: 2,
            bonus_armor: 0,
            bonus_hp: 0,
            special: None,
        },
        GearDef {
            id: "shadow_dagger",
            name: "Shadow Dagger",
            emoji: "\u{1F5E1}",
            slot: EquipSlot::Weapon,
            rarity: ItemRarity::Uncommon,
            bonus_damage: 3,
            bonus_armor: 0,
            bonus_hp: 0,
            special: Some(GearSpecial::CritBonus { percent: 5 }),
        },
        GearDef {
            id: "flame_axe",
            name: "Flame Axe",
            emoji: "\u{1FA93}",
            slot: EquipSlot::Weapon,
            rarity: ItemRarity::Rare,
            bonus_damage: 4,
            bonus_armor: 0,
            bonus_hp: 0,
            special: None,
        },
        GearDef {
            id: "vampiric_blade",
            name: "Vampiric Blade",
            emoji: "\u{1FA78}",
            slot: EquipSlot::Weapon,
            rarity: ItemRarity::Epic,
            bonus_damage: 3,
            bonus_armor: 0,
            bonus_hp: 0,
            special: Some(GearSpecial::LifeSteal { percent: 20 }),
        },
        GearDef {
            id: "leather_vest",
            name: "Leather Vest",
            emoji: "\u{1F9BA}",
            slot: EquipSlot::Armor,
            rarity: ItemRarity::Common,
            bonus_damage: 0,
            bonus_armor: 2,
            bonus_hp: 0,
            special: None,
        },
        GearDef {
            id: "chain_mail",
            name: "Chain Mail",
            emoji: "\u{26D3}",
            slot: EquipSlot::Armor,
            rarity: ItemRarity::Uncommon,
            bonus_damage: 0,
            bonus_armor: 4,
            bonus_hp: 5,
            special: None,
        },
        GearDef {
            id: "spiked_plate",
            name: "Spiked Plate",
            emoji: "\u{1F6E1}",
            slot: EquipSlot::Armor,
            rarity: ItemRarity::Rare,
            bonus_damage: 0,
            bonus_armor: 5,
            bonus_hp: 0,
            special: Some(GearSpecial::Thorns { damage: 3 }),
        },
        GearDef {
            id: "crystal_armor",
            name: "Crystal Armor",
            emoji: "\u{1F48E}",
            slot: EquipSlot::Armor,
            rarity: ItemRarity::Epic,
            bonus_damage: 0,
            bonus_armor: 6,
            bonus_hp: 10,
            special: None,
        },
    ];
    GEAR
}

/// Look up a gear definition by ID.
pub fn find_gear(id: &str) -> Option<&'static GearDef> {
    gear_registry().iter().find(|g| g.id == id)
}

// ── Loot tables ────────────────────────────────────────────────────

struct LootEntry {
    item_id: &'static str,
    weight: u32,
}

struct LootTable {
    id: &'static str,
    entries: &'static [LootEntry],
    drop_chance: f32,
}

fn loot_tables() -> &'static [LootTable] {
    static TABLES: &[LootTable] = &[
        LootTable {
            id: "slime",
            entries: &[
                LootEntry {
                    item_id: "potion",
                    weight: 5,
                },
                LootEntry {
                    item_id: "rations",
                    weight: 3,
                },
            ],
            drop_chance: 0.3,
        },
        LootTable {
            id: "skeleton",
            entries: &[
                LootEntry {
                    item_id: "bandage",
                    weight: 4,
                },
                LootEntry {
                    item_id: "bomb",
                    weight: 2,
                },
            ],
            drop_chance: 0.4,
        },
        LootTable {
            id: "wraith",
            entries: &[
                LootEntry {
                    item_id: "ward",
                    weight: 3,
                },
                LootEntry {
                    item_id: "bomb",
                    weight: 3,
                },
            ],
            drop_chance: 0.5,
        },
        LootTable {
            id: "boss",
            entries: &[
                LootEntry {
                    item_id: "ward",
                    weight: 2,
                },
                LootEntry {
                    item_id: "potion",
                    weight: 3,
                },
                LootEntry {
                    item_id: "bomb",
                    weight: 2,
                },
            ],
            drop_chance: 1.0,
        },
    ];
    TABLES
}

/// Roll a loot drop from the given table. Returns item_id or None.
pub fn roll_loot(table_id: &str) -> Option<&'static str> {
    let mut rng = rand::thread_rng();
    let table = loot_tables().iter().find(|t| t.id == table_id)?;
    if rng.gen_range(0.0f32..1.0) >= table.drop_chance {
        return None;
    }
    let total_weight: u32 = table.entries.iter().map(|e| e.weight).sum();
    if total_weight == 0 {
        return None;
    }
    let mut roll = rng.gen_range(0..total_weight);
    for entry in table.entries {
        if roll < entry.weight {
            return Some(entry.item_id);
        }
        roll -= entry.weight;
    }
    None
}

// ── Gear loot tables ───────────────────────────────────────────────

struct GearLootEntry {
    gear_id: &'static str,
    weight: u32,
}

struct GearLootTable {
    id: &'static str,
    entries: &'static [GearLootEntry],
    drop_chance: f32,
}

fn gear_loot_tables() -> &'static [GearLootTable] {
    static TABLES: &[GearLootTable] = &[
        GearLootTable {
            id: "slime",
            entries: &[
                GearLootEntry {
                    gear_id: "rusty_sword",
                    weight: 5,
                },
                GearLootEntry {
                    gear_id: "leather_vest",
                    weight: 5,
                },
            ],
            drop_chance: 0.10,
        },
        GearLootTable {
            id: "skeleton",
            entries: &[
                GearLootEntry {
                    gear_id: "shadow_dagger",
                    weight: 4,
                },
                GearLootEntry {
                    gear_id: "chain_mail",
                    weight: 4,
                },
            ],
            drop_chance: 0.15,
        },
        GearLootTable {
            id: "wraith",
            entries: &[
                GearLootEntry {
                    gear_id: "flame_axe",
                    weight: 3,
                },
                GearLootEntry {
                    gear_id: "spiked_plate",
                    weight: 3,
                },
            ],
            drop_chance: 0.20,
        },
        GearLootTable {
            id: "boss",
            entries: &[
                GearLootEntry {
                    gear_id: "vampiric_blade",
                    weight: 3,
                },
                GearLootEntry {
                    gear_id: "crystal_armor",
                    weight: 3,
                },
            ],
            drop_chance: 0.50,
        },
    ];
    TABLES
}

/// Roll a gear loot drop from the given table. Returns gear_id or None.
pub fn roll_gear_loot(table_id: &str) -> Option<&'static str> {
    let mut rng = rand::thread_rng();
    let table = gear_loot_tables().iter().find(|t| t.id == table_id)?;
    if rng.gen_range(0.0f32..1.0) >= table.drop_chance {
        return None;
    }
    let total_weight: u32 = table.entries.iter().map(|e| e.weight).sum();
    if total_weight == 0 {
        return None;
    }
    let mut roll = rng.gen_range(0..total_weight);
    for entry in table.entries {
        if roll < entry.weight {
            return Some(entry.gear_id);
        }
        roll -= entry.weight;
    }
    None
}

// ── Enemy spawning ──────────────────────────────────────────────────

/// Spawn an enemy scaled to the current room index.
/// Picks randomly from a pool per difficulty bracket.
pub fn spawn_enemy(room_index: u32) -> EnemyState {
    let mut rng = rand::thread_rng();
    match room_index {
        0..=1 => {
            match rng.gen_range(0..4) {
                0 => EnemyState {
                    name: "Glass Slime".to_owned(),
                    level: 1,
                    hp: 20,
                    max_hp: 20,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 5 },
                    charged: false,
                    loot_table_id: "slime",
                    enraged: false,
                    index: 0,
                },
                1 => EnemyState {
                    name: "Crystal Bat".to_owned(),
                    level: 1,
                    hp: 15,
                    max_hp: 15,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 4 },
                    charged: false,
                    loot_table_id: "slime",
                    enraged: false,
                    index: 0,
                },
                2 => EnemyState {
                    name: "Mushroom Sprite".to_owned(),
                    level: 1,
                    hp: 18,
                    max_hp: 18,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 4 },
                    charged: false,
                    loot_table_id: "slime",
                    enraged: false,
                    index: 0,
                },
                _ => EnemyState {
                    name: "Dust Mite".to_owned(),
                    level: 1,
                    hp: 12,
                    max_hp: 12,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 6 },
                    charged: false,
                    loot_table_id: "slime",
                    enraged: false,
                    index: 0,
                },
            }
        }
        2..=3 => {
            match rng.gen_range(0..4) {
                0 => EnemyState {
                    name: "Skeleton Guard".to_owned(),
                    level: 2,
                    hp: 30,
                    max_hp: 30,
                    armor: 3,
                    effects: Vec::new(),
                    intent: Intent::Defend { armor: 5 },
                    charged: false,
                    loot_table_id: "skeleton",
                    enraged: false,
                    index: 0,
                },
                1 => EnemyState {
                    name: "Bone Archer".to_owned(),
                    level: 2,
                    hp: 22,
                    max_hp: 22,
                    armor: 1,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 7 },
                    charged: false,
                    loot_table_id: "skeleton",
                    enraged: false,
                    index: 0,
                },
                2 => EnemyState {
                    name: "Cursed Knight".to_owned(),
                    level: 2,
                    hp: 35,
                    max_hp: 35,
                    armor: 5,
                    effects: Vec::new(),
                    intent: Intent::Defend { armor: 5 },
                    charged: false,
                    loot_table_id: "skeleton",
                    enraged: false,
                    index: 0,
                },
                _ => EnemyState {
                    name: "Fire Imp".to_owned(),
                    level: 2,
                    hp: 18,
                    max_hp: 18,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 8 },
                    charged: false,
                    loot_table_id: "skeleton",
                    enraged: false,
                    index: 0,
                },
            }
        }
        4..=5 => {
            match rng.gen_range(0..4) {
                0 => EnemyState {
                    name: "Shadow Wraith".to_owned(),
                    level: 3,
                    hp: 25,
                    max_hp: 25,
                    armor: 2,
                    effects: Vec::new(),
                    intent: Intent::HeavyAttack { dmg: 12 },
                    charged: false,
                    loot_table_id: "wraith",
                    enraged: false,
                    index: 0,
                },
                1 => EnemyState {
                    name: "Phantom Knight".to_owned(),
                    level: 3,
                    hp: 28,
                    max_hp: 28,
                    armor: 4,
                    effects: Vec::new(),
                    intent: Intent::Charge,
                    charged: false,
                    loot_table_id: "wraith",
                    enraged: false,
                    index: 0,
                },
                2 => EnemyState {
                    name: "Void Walker".to_owned(),
                    level: 3,
                    hp: 30,
                    max_hp: 30,
                    armor: 3,
                    effects: Vec::new(),
                    intent: Intent::HeavyAttack { dmg: 10 },
                    charged: false,
                    loot_table_id: "wraith",
                    enraged: false,
                    index: 0,
                },
                _ => EnemyState {
                    name: "Stone Sentinel".to_owned(),
                    level: 3,
                    hp: 40,
                    max_hp: 40,
                    armor: 6,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 6 },
                    charged: false,
                    loot_table_id: "wraith",
                    enraged: false,
                    index: 0,
                },
            }
        }
        _ => {
            if rng.gen_range(0..2) == 0 {
                EnemyState {
                    name: "Glass Golem".to_owned(),
                    level: 5,
                    hp: 60,
                    max_hp: 60,
                    armor: 8,
                    effects: Vec::new(),
                    intent: Intent::Charge,
                    charged: false,
                    loot_table_id: "boss",
                    enraged: false,
                    index: 0,
                }
            } else {
                EnemyState {
                    name: "Corrupted Warden".to_owned(),
                    level: 5,
                    hp: 50,
                    max_hp: 50,
                    armor: 10,
                    effects: Vec::new(),
                    intent: Intent::Charge,
                    charged: false,
                    loot_table_id: "boss",
                    enraged: false,
                    index: 0,
                }
            }
        }
    }
}

/// Spawn one or more enemies for a room, scaling count by depth.
/// - Rooms 0-2: always 1 enemy.
/// - Rooms 3-5: 25% chance of 2 enemies, each at 70% HP.
/// - Boss rooms (index >= 6): always 1 boss.
pub fn spawn_enemies(room_index: u32) -> Vec<EnemyState> {
    let mut rng = rand::thread_rng();
    match room_index {
        0..=2 => vec![spawn_enemy(room_index)],
        3..=5 => {
            if rng.gen_range(0.0f32..1.0) < 0.25 {
                let mut e1 = spawn_enemy(room_index);
                let mut e2 = spawn_enemy(room_index);
                // Reduce each to 70% HP
                e1.max_hp = (e1.max_hp as f32 * 0.7) as i32;
                e1.hp = e1.max_hp;
                e1.index = 0;
                e2.max_hp = (e2.max_hp as f32 * 0.7) as i32;
                e2.hp = e2.max_hp;
                e2.index = 1;
                vec![e1, e2]
            } else {
                vec![spawn_enemy(room_index)]
            }
        }
        _ => vec![spawn_enemy(room_index)],
    }
}

// ── XP tables ───────────────────────────────────────────────────────

/// XP awarded for defeating an enemy of the given level.
pub fn xp_for_enemy(level: u8) -> u32 {
    match level {
        1 => 15,
        2 => 30,
        3 => 50,
        5 => 100,
        _ => 20,
    }
}

/// XP required to advance from the given level to the next.
pub fn xp_to_level(level: u8) -> u32 {
    match level {
        1 => 100,
        2 => 200,
        3 => 350,
        _ => 500,
    }
}

// ── Class starting stats ────────────────────────────────────────────

/// Returns (max_hp, armor, base_damage_bonus, crit_chance, gold) for the class.
pub fn class_starting_stats(class: &ClassType) -> (i32, i32, i32, f32, i32) {
    match class {
        ClassType::Warrior => (65, 7, 1, 0.10, 0),
        ClassType::Rogue => (50, 5, 2, 0.20, 10),
        ClassType::Cleric => (55, 6, 0, 0.10, 5),
    }
}

// ── Room generation ─────────────────────────────────────────────────

/// Weighted random room type. Boss guaranteed every 7th room, room 0 always Combat.
fn room_type_for_index(index: u32, rng: &mut impl Rng) -> RoomType {
    if index > 0 && index % 7 == 6 {
        return RoomType::Boss;
    }
    if index == 0 {
        return RoomType::Combat;
    }
    let roll: f32 = rng.r#gen();
    match roll {
        x if x < 0.35 => RoomType::Combat,
        x if x < 0.50 => RoomType::Treasure,
        x if x < 0.65 => RoomType::Trap,
        x if x < 0.75 => RoomType::RestShrine,
        x if x < 0.85 => RoomType::Merchant,
        x if x < 0.90 => RoomType::UndergroundCity,
        _ => RoomType::Story,
    }
}

fn generate_modifiers(index: u32, room_type: &RoomType, rng: &mut impl Rng) -> Vec<RoomModifier> {
    if index < 3 {
        return Vec::new();
    }
    let mut mods = Vec::new();
    if *room_type == RoomType::Combat || *room_type == RoomType::Boss {
        if rng.gen_range(0.0f32..1.0) < 0.25 {
            mods.push(RoomModifier::Fog {
                accuracy_penalty: 0.1 + rng.gen_range(0.0..0.1),
            });
        }
        if rng.gen_range(0.0f32..1.0) < 0.15 {
            mods.push(RoomModifier::Cursed {
                dmg_multiplier: 1.25,
            });
        }
    }
    if *room_type == RoomType::RestShrine && rng.gen_range(0.0f32..1.0) < 0.30 {
        mods.push(RoomModifier::Blessing { heal_bonus: 5 });
    }
    mods
}

fn generate_hazards(index: u32, room_type: &RoomType, rng: &mut impl Rng) -> Vec<Hazard> {
    let mut hazards = Vec::new();
    match room_type {
        RoomType::Trap => {
            if rng.gen_bool(0.5) {
                hazards.push(Hazard::Spikes {
                    dmg: 5 + index as i32 / 2,
                });
            } else {
                hazards.push(Hazard::Gas {
                    effect: EffectKind::Poison,
                    stacks: 1,
                    turns: 3,
                });
            }
        }
        RoomType::Combat if index >= 5 => {
            if rng.gen_range(0.0f32..1.0) < 0.20 {
                hazards.push(Hazard::Gas {
                    effect: EffectKind::Burning,
                    stacks: 1,
                    turns: 2,
                });
            }
        }
        _ => {}
    }
    hazards
}

/// Generate a room for the given index with randomized content.
pub fn generate_room(index: u32) -> RoomState {
    let mut rng = rand::thread_rng();
    let room_type = room_type_for_index(index, &mut rng);

    let pool: &[RoomTemplate] = match &room_type {
        RoomType::Combat => combat_rooms(),
        RoomType::Treasure => treasure_rooms(),
        RoomType::Trap => trap_rooms(),
        RoomType::RestShrine => rest_rooms(),
        RoomType::Boss => boss_rooms(),
        RoomType::Merchant => merchant_rooms(),
        RoomType::Story => story_rooms(),
        RoomType::Hallway => hallway_rooms(),
        RoomType::UndergroundCity => city_rooms(),
    };
    let (name, description) = pick_template(pool, &mut rng);
    let modifiers = generate_modifiers(index, &room_type, &mut rng);
    let hazards = generate_hazards(index, &room_type, &mut rng);

    RoomState {
        index,
        room_type,
        name,
        description,
        modifiers,
        hazards,
        merchant_stock: Vec::new(),
        story_event: None,
    }
}

/// Generate a hallway room (safe passage after fleeing combat).
pub fn generate_hallway_room(index: u32) -> RoomState {
    let mut rng = rand::thread_rng();
    let (name, description) = pick_template(hallway_rooms(), &mut rng);
    RoomState {
        index,
        room_type: RoomType::Hallway,
        name,
        description,
        modifiers: Vec::new(),
        hazards: Vec::new(),
        merchant_stock: Vec::new(),
        story_event: None,
    }
}

// ── Merchant stock ──────────────────────────────────────────────────

/// Generate 3 random items for sale, priced by rarity + room depth.
pub fn generate_merchant_stock(room_index: u32) -> Vec<MerchantOffer> {
    let mut rng = rand::thread_rng();
    let all_items = item_registry();
    let mut indices: Vec<usize> = (0..all_items.len()).collect();

    // Fisher-Yates shuffle
    for i in (1..indices.len()).rev() {
        let j = rng.gen_range(0..=i);
        indices.swap(i, j);
    }

    indices
        .iter()
        .take(3)
        .map(|&idx| {
            let item = &all_items[idx];
            let base_price = match item.rarity {
                ItemRarity::Common => 10,
                ItemRarity::Uncommon => 20,
                ItemRarity::Rare => 40,
                ItemRarity::Epic => 80,
                ItemRarity::Legendary => 150,
            };
            MerchantOffer {
                item_id: item.id.to_owned(),
                price: base_price + (room_index as i32 * 2),
            }
        })
        .collect()
}

// ── Story events ────────────────────────────────────────────────────

/// Generate a random story event for a Story room.
pub fn generate_story_event() -> StoryEvent {
    let mut rng = rand::thread_rng();
    let events = [
        StoryEvent {
            prompt: "A mirror whispers your name...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Listen".to_owned(),
                    description: "Lean closer to the mirror.".to_owned(),
                },
                StoryChoice {
                    label: "Smash".to_owned(),
                    description: "Shatter the mirror with your fist.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "A rusty chest sits in the corner, vines crawling over its lock.".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Open".to_owned(),
                    description: "Pry it open.".to_owned(),
                },
                StoryChoice {
                    label: "Inspect".to_owned(),
                    description: "Examine it carefully first.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "A spectral figure offers a glowing vial in exchange for your gold.".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Accept".to_owned(),
                    description: "Trade 15 gold for the vial.".to_owned(),
                },
                StoryChoice {
                    label: "Refuse".to_owned(),
                    description: "Walk away.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "Ancient runes glow on the floor. They pulse with energy.".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Step In".to_owned(),
                    description: "Stand in the circle of runes.".to_owned(),
                },
                StoryChoice {
                    label: "Avoid".to_owned(),
                    description: "Walk carefully around them.".to_owned(),
                },
            ],
        },
    ];
    events[rng.gen_range(0..events.len())].clone()
}

/// Resolve a story event choice. Returns the outcome for the given event index and choice.
pub fn resolve_story_choice(event_prompt: &str, choice_idx: usize) -> StoryOutcome {
    // Match outcomes by prompt + choice index
    match (event_prompt, choice_idx) {
        ("A mirror whispers your name...", 0) => StoryOutcome {
            log_message: "The mirror grants you clarity. You feel stronger.".to_owned(),
            hp_change: 10,
            gold_change: 0,
            item_gain: None,
            effect_gain: None,
        },
        ("A mirror whispers your name...", _) => StoryOutcome {
            log_message: "Glass shards cut your hand, but you find something inside.".to_owned(),
            hp_change: -5,
            gold_change: 0,
            item_gain: Some("bomb"),
            effect_gain: Some((EffectKind::Bleed, 1, 2)),
        },
        (p, 0) if p.starts_with("A rusty chest") => StoryOutcome {
            log_message: "The chest springs open! Gold spills out.".to_owned(),
            hp_change: 0,
            gold_change: 20,
            item_gain: None,
            effect_gain: None,
        },
        (p, _) if p.starts_with("A rusty chest") => StoryOutcome {
            log_message:
                "You notice a trap mechanism. Carefully, you disarm it and take the contents."
                    .to_owned(),
            hp_change: 0,
            gold_change: 10,
            item_gain: Some("potion"),
            effect_gain: None,
        },
        (p, 0) if p.starts_with("A spectral figure") => StoryOutcome {
            log_message: "The spirit nods and vanishes. The vial warms in your hand.".to_owned(),
            hp_change: 0,
            gold_change: -15,
            item_gain: Some("ward"),
            effect_gain: None,
        },
        (p, _) if p.starts_with("A spectral figure") => StoryOutcome {
            log_message: "The spirit fades, disappointed. You move on.".to_owned(),
            hp_change: 0,
            gold_change: 0,
            item_gain: None,
            effect_gain: None,
        },
        (p, 0) if p.starts_with("Ancient runes") => StoryOutcome {
            log_message: "Energy surges through you! Your wounds knit together.".to_owned(),
            hp_change: 15,
            gold_change: 0,
            item_gain: None,
            effect_gain: Some((EffectKind::Shielded, 1, 3)),
        },
        (p, _) if p.starts_with("Ancient runes") => StoryOutcome {
            log_message: "You step around the runes. Nothing happens.".to_owned(),
            hp_change: 0,
            gold_change: 0,
            item_gain: None,
            effect_gain: None,
        },
        _ => StoryOutcome {
            log_message: "Nothing happens.".to_owned(),
            hp_change: 0,
            gold_change: 0,
            item_gain: None,
            effect_gain: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_registry_has_10_items() {
        assert_eq!(item_registry().len(), 10);
    }

    #[test]
    fn find_item_by_id() {
        let potion = find_item("potion");
        assert!(potion.is_some());
        assert_eq!(potion.unwrap().name, "Potion");
    }

    #[test]
    fn find_item_missing() {
        assert!(find_item("nonexistent").is_none());
    }

    #[test]
    fn starting_inventory_has_items() {
        let inv = starting_inventory();
        assert_eq!(inv.len(), 3);
        assert_eq!(inv[0].item_id, "potion");
        assert_eq!(inv[0].qty, 2);
    }

    #[test]
    fn items_have_rarity() {
        let potion = find_item("potion").unwrap();
        assert_eq!(potion.rarity, ItemRarity::Common);
        let ward = find_item("ward").unwrap();
        assert_eq!(ward.rarity, ItemRarity::Rare);
    }

    #[test]
    fn gear_registry_test() {
        assert_eq!(gear_registry().len(), 8);
        // Verify a weapon and an armor piece exist
        let sword = find_gear("rusty_sword").unwrap();
        assert_eq!(sword.slot, EquipSlot::Weapon);
        assert_eq!(sword.rarity, ItemRarity::Common);

        let vest = find_gear("leather_vest").unwrap();
        assert_eq!(vest.slot, EquipSlot::Armor);
        assert_eq!(vest.bonus_armor, 2);
    }

    #[test]
    fn find_gear_test() {
        assert!(find_gear("vampiric_blade").is_some());
        assert!(find_gear("crystal_armor").is_some());
        assert!(find_gear("nonexistent").is_none());

        let vamp = find_gear("vampiric_blade").unwrap();
        assert_eq!(vamp.rarity, ItemRarity::Epic);
        assert_eq!(
            vamp.special,
            Some(GearSpecial::LifeSteal { percent: 20 })
        );
    }

    #[test]
    fn enemy_scaling() {
        let e0 = spawn_enemy(0);
        assert_eq!(e0.level, 1);
        assert!(e0.hp <= 20);
        assert!(!e0.enraged);

        let e2 = spawn_enemy(2);
        assert_eq!(e2.level, 2);
        assert!(!e2.enraged);

        let e4 = spawn_enemy(4);
        assert_eq!(e4.level, 3);
        assert!(!e4.enraged);

        let boss = spawn_enemy(7);
        assert_eq!(boss.level, 5);
        assert!(boss.hp >= 50);
        assert!(!boss.charged);
        assert_eq!(boss.loot_table_id, "boss");
        assert!(!boss.enraged);
    }

    #[test]
    fn spawn_enemies_test() {
        // Early rooms: always 1
        for _ in 0..20 {
            let enemies = spawn_enemies(0);
            assert_eq!(enemies.len(), 1);
            assert_eq!(enemies[0].index, 0);
        }

        // Boss rooms: always 1
        for _ in 0..20 {
            let enemies = spawn_enemies(6);
            assert_eq!(enemies.len(), 1);
        }

        // Mid rooms (3-5): can be 1 or 2
        let mut saw_two = false;
        let mut saw_one = false;
        for _ in 0..200 {
            let enemies = spawn_enemies(4);
            match enemies.len() {
                1 => saw_one = true,
                2 => {
                    saw_two = true;
                    assert_eq!(enemies[0].index, 0);
                    assert_eq!(enemies[1].index, 1);
                    // Check HP is reduced (70% of max)
                    assert!(enemies[0].hp < 30); // Even the tankiest enemy at 40 HP * 0.7 = 28
                }
                _ => panic!("unexpected enemy count"),
            }
            if saw_one && saw_two {
                break;
            }
        }
        assert!(saw_one, "should see single-enemy rooms");
        assert!(saw_two, "should see double-enemy rooms");
    }

    #[test]
    fn xp_tables_test() {
        assert_eq!(xp_for_enemy(1), 15);
        assert_eq!(xp_for_enemy(2), 30);
        assert_eq!(xp_for_enemy(3), 50);
        assert_eq!(xp_for_enemy(5), 100);
        assert_eq!(xp_for_enemy(4), 20); // fallback

        assert_eq!(xp_to_level(1), 100);
        assert_eq!(xp_to_level(2), 200);
        assert_eq!(xp_to_level(3), 350);
        assert_eq!(xp_to_level(4), 500); // fallback
        assert_eq!(xp_to_level(10), 500); // fallback
    }

    #[test]
    fn class_stats_test() {
        let (hp, armor, dmg, crit, gold) = class_starting_stats(&ClassType::Warrior);
        assert_eq!(hp, 65);
        assert_eq!(armor, 7);
        assert_eq!(dmg, 1);
        assert!((crit - 0.10).abs() < f32::EPSILON);
        assert_eq!(gold, 0);

        let (hp, armor, dmg, crit, gold) = class_starting_stats(&ClassType::Rogue);
        assert_eq!(hp, 50);
        assert_eq!(armor, 5);
        assert_eq!(dmg, 2);
        assert!((crit - 0.20).abs() < f32::EPSILON);
        assert_eq!(gold, 10);

        let (hp, armor, dmg, crit, gold) = class_starting_stats(&ClassType::Cleric);
        assert_eq!(hp, 55);
        assert_eq!(armor, 6);
        assert_eq!(dmg, 0);
        assert!((crit - 0.10).abs() < f32::EPSILON);
        assert_eq!(gold, 5);
    }

    #[test]
    fn room_zero_is_combat() {
        // Room 0 should always be Combat
        for _ in 0..20 {
            assert_eq!(generate_room(0).room_type, RoomType::Combat);
        }
    }

    #[test]
    fn boss_every_7th_room() {
        for _ in 0..10 {
            assert_eq!(generate_room(6).room_type, RoomType::Boss);
            assert_eq!(generate_room(13).room_type, RoomType::Boss);
            assert_eq!(generate_room(20).room_type, RoomType::Boss);
        }
    }

    #[test]
    fn room_variety_in_names() {
        use std::collections::HashSet;
        let mut names = HashSet::new();
        for _ in 0..50 {
            let room = generate_room(2); // index 2 can be various types
            names.insert(room.name.clone());
        }
        // Should see at least 2 different names in 50 rolls
        assert!(names.len() >= 2);
    }

    #[test]
    fn roll_loot_boss_always_drops() {
        // Boss has drop_chance 1.0 — should always return Some
        for _ in 0..50 {
            assert!(roll_loot("boss").is_some());
        }
    }

    #[test]
    fn roll_loot_unknown_table_returns_none() {
        assert!(roll_loot("nonexistent").is_none());
    }

    #[test]
    fn merchant_stock_has_3_items() {
        let stock = generate_merchant_stock(3);
        assert_eq!(stock.len(), 3);
        for offer in &stock {
            assert!(offer.price > 0);
            assert!(find_item(&offer.item_id).is_some());
        }
    }

    #[test]
    fn story_event_generated() {
        let event = generate_story_event();
        assert!(!event.prompt.is_empty());
        assert_eq!(event.choices.len(), 2);
    }

    #[test]
    fn story_outcome_resolved() {
        let outcome = resolve_story_choice("A mirror whispers your name...", 0);
        assert_eq!(outcome.hp_change, 10);
        let outcome2 = resolve_story_choice("A mirror whispers your name...", 1);
        assert_eq!(outcome2.hp_change, -5);
        assert!(outcome2.item_gain.is_some());
    }

    #[test]
    fn generate_room_has_required_fields() {
        let room = generate_room(5);
        assert!(!room.name.is_empty());
        assert!(!room.description.is_empty());
    }

    #[test]
    fn hallway_room_is_safe() {
        let room = generate_hallway_room(3);
        assert_eq!(room.room_type, RoomType::Hallway);
        assert!(room.hazards.is_empty());
        assert!(room.modifiers.is_empty());
        assert!(!room.name.is_empty());
    }
}
