use rand::prelude::*;
use rand_chacha::ChaCha8Rng;

use super::proto_bridge;
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
    let t = &pool[rng.random_range(0..pool.len())];
    (t.name.to_owned(), t.description.to_owned())
}

// ── Item registry (proto-driven) ────────────────────────────────────
//
// Item definitions are now loaded from the embedded itemdb.json via the
// proto_bridge module. The hardcoded arrays have been removed.

/// All consumable item definitions, loaded from the proto item database.
pub fn item_registry() -> &'static [ItemDef] {
    super::proto_bridge::item_registry()
}

/// Look up an item definition by ID.
pub fn find_item(id: &str) -> Option<&'static ItemDef> {
    super::proto_bridge::find_item(id)
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

// ── Gear registry (proto-driven) ────────────────────────────────────

/// All gear definitions, loaded from the proto item database.
pub fn gear_registry() -> &'static [GearDef] {
    super::proto_bridge::gear_registry()
}

/// Look up a gear definition by ID.
pub fn find_gear(id: &str) -> Option<&'static GearDef> {
    super::proto_bridge::find_gear(id)
}

/// Check whether an item or gear ID has rarity >= Rare.
pub fn is_rare_or_above(id: &str) -> bool {
    super::proto_bridge::is_rare_or_above(id)
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
                LootEntry {
                    item_id: "vitality_potion",
                    weight: 1,
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
                LootEntry {
                    item_id: "fire_flask",
                    weight: 2,
                },
                LootEntry {
                    item_id: "iron_skin_potion",
                    weight: 1,
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
                LootEntry {
                    item_id: "campfire_kit",
                    weight: 1,
                },
                LootEntry {
                    item_id: "rage_draught",
                    weight: 1,
                },
                LootEntry {
                    item_id: "phoenix_feather",
                    weight: 1,
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
                LootEntry {
                    item_id: "teleport_rune",
                    weight: 1,
                },
                LootEntry {
                    item_id: "campfire_kit",
                    weight: 1,
                },
                LootEntry {
                    item_id: "fire_flask",
                    weight: 1,
                },
                LootEntry {
                    item_id: "phoenix_feather",
                    weight: 1,
                },
            ],
            drop_chance: 1.0,
        },
    ];
    TABLES
}

/// Roll a loot drop from the given table. Returns item_id or None.
pub fn roll_loot(table_id: &str) -> Option<&'static str> {
    let mut rng = rand::rng();
    let table = loot_tables().iter().find(|t| t.id == table_id)?;
    if rng.random_range(0.0f32..1.0) >= table.drop_chance {
        return None;
    }
    let total_weight: u32 = table.entries.iter().map(|e| e.weight).sum();
    if total_weight == 0 {
        return None;
    }
    let mut roll = rng.random_range(0..total_weight);
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
                GearLootEntry {
                    gear_id: "iron_mace",
                    weight: 3,
                },
                GearLootEntry {
                    gear_id: "shadow_cloak",
                    weight: 3,
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
                GearLootEntry {
                    gear_id: "glass_stiletto",
                    weight: 2,
                },
                GearLootEntry {
                    gear_id: "runeguard_plate",
                    weight: 2,
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
                GearLootEntry {
                    gear_id: "excalibur",
                    weight: 1,
                },
                GearLootEntry {
                    gear_id: "void_scythe",
                    weight: 1,
                },
                GearLootEntry {
                    gear_id: "dragon_scale",
                    weight: 1,
                },
            ],
            drop_chance: 0.50,
        },
    ];
    TABLES
}

/// Roll a gear loot drop from the given table. Returns gear_id or None.
pub fn roll_gear_loot(table_id: &str) -> Option<&'static str> {
    let mut rng = rand::rng();
    let table = gear_loot_tables().iter().find(|t| t.id == table_id)?;
    if rng.random_range(0.0f32..1.0) >= table.drop_chance {
        return None;
    }
    let total_weight: u32 = table.entries.iter().map(|e| e.weight).sum();
    if total_weight == 0 {
        return None;
    }
    let mut roll = rng.random_range(0..total_weight);
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
/// Picks randomly from the proto NPC database, filtered by level.
pub fn spawn_enemy(room_index: u32) -> EnemyState {
    let mut rng = rand::rng();
    let level: i32 = match room_index {
        0..=1 => 1,
        2..=3 => 2,
        4..=5 => 3,
        _ => 5,
    };

    let pool = proto_bridge::find_npcs_by_level(level);
    if pool.is_empty() {
        // Fallback — should never happen with a valid npcdb.json
        return EnemyState {
            name: "Unknown Creature".to_owned(),
            level: level as u8,
            hp: 20,
            max_hp: 20,
            armor: 0,
            effects: Vec::new(),
            intent: Intent::Attack { dmg: 5 },
            charged: false,
            loot_table_id: "slime",
            enraged: false,
            index: 0,
            first_strike: false,
            personality: Personality::Feral,
        };
    }

    let npc = pool[rng.random_range(0..pool.len())];
    proto_bridge::proto_to_enemy_state(npc)
}

// ── Flavor text system ──────────────────────────────────────────────

/// Pick a random entry from a slice.
fn pick<'a>(rng: &mut impl rand::Rng, pool: &[&'a str]) -> &'a str {
    pool[rng.random_range(0..pool.len())]
}

/// Flavor text for a normal attack. `{name}` = enemy, `{target}` = player, `{dmg}` = damage.
pub fn flavor_attack(personality: Personality, name: &str, target: &str, dmg: i32) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} roars and slashes at {target} for {dmg} damage!",
                "{name} snarls, \"You'll pay for that!\" and strikes {target} for {dmg} damage!",
                "{name} charges forward with reckless fury, hitting {target} for {dmg} damage!",
                "{name} bares its teeth and smashes into {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} feints left, then strikes {target} from the shadows for {dmg} damage!",
                "{name} whispers, \"Too slow...\" and slices {target} for {dmg} damage!",
                "{name} finds an opening in {target}'s guard — {dmg} damage!",
                "{name} darts forward with precision, hitting {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} lunges desperately at {target} for {dmg} damage!",
                "{name} swings wildly with trembling hands, hitting {target} for {dmg} damage!",
                "{name} panics and lashes out at {target} — {dmg} damage!",
                "{name} squeals and attacks {target} in a frenzy for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} strikes {target} with measured precision. {dmg} damage.",
                "{name} delivers a calculated blow to {target}. {dmg} damage.",
                "{name} moves without hesitation, hitting {target} for {dmg} damage.",
                "{name} attacks {target}. {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} lunges with feral intensity at {target} for {dmg} damage!",
                "{name} hisses and claws at {target} — {dmg} damage!",
                "{name} pounces on {target} with savage force! {dmg} damage!",
                "{name} screeches and tears into {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} raises a weary hand and strikes {target} for {dmg} damage. \"This too shall pass...\"",
                "{name} murmurs ancient words as {target} takes {dmg} damage.",
                "{name} sighs, \"I've seen a thousand like you,\" and hits {target} for {dmg} damage.",
                "{name} channels forgotten power into {target}. {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} laughs and swings at {target}! \"Nothing personal!\" {dmg} damage!",
                "{name} winks at {target} and lands a playful jab for {dmg} damage!",
                "{name} hums a little tune while smacking {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} materializes behind {target} — {dmg} damage. \"You never saw me.\"",
                "{name} whispers something unknowable and strikes {target} for {dmg} damage.",
                "A shadow extends from {name}, lashing {target} for {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} winces and takes a reluctant swipe at {target}. {dmg} damage!",
                "{name} closes its eyes and flails at {target}! {dmg} damage!",
                "\"P-please don't hurt me!\" {name} swats at {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} salutes and delivers a precise strike to {target}. {dmg} damage.",
                "{name} engages {target} with honor. A clean blow for {dmg} damage.",
                "\"Defend yourself!\" {name} strikes {target} with disciplined form. {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} bumps into {target} clumsily. {dmg} damage.",
                "{name} flails in surprise and grazes {target} for {dmg} damage.",
                "{name} accidentally swats {target}. {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{target}", target)
    .replace("{dmg}", &dmg.to_string())
}

/// Flavor text for a heavy attack.
pub fn flavor_heavy_attack(personality: Personality, name: &str, target: &str, dmg: i32) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} ROARS and brings down a devastating blow on {target}! {dmg} damage!",
                "{name} screams with fury and smashes {target} for {dmg} damage!",
                "{name} charges with blind rage — {target} takes {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} reveals its trap — a devastating strike hits {target} for {dmg} damage!",
                "{name} waited for this moment. {target} takes {dmg} damage!",
                "{name} strikes with lethal precision. {target} staggers from {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} throws everything it has at {target} in desperation! {dmg} damage!",
                "{name} shrieks and delivers a wild, heavy blow to {target}! {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} unleashes a devastating blow on {target}. {dmg} damage.",
                "{name} executes a powerful strike against {target}. {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} rears back and slams into {target} with bone-crushing force! {dmg} damage!",
                "{name} goes berserk, mauling {target} for {dmg} damage!",
                "{name} unleashes a primal assault on {target}! {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} channels ancient wrath — {target} is engulfed! {dmg} damage!",
                "{name} speaks a word of destruction. {target} takes {dmg} damage.",
                "\"Remember this pain.\" {name} devastates {target} for {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} winds up with a grin and SLAMS {target}! \"Wow, that was a good one!\" {dmg} damage!",
                "{name} giggles and unleashes a massive hit on {target}! {dmg} damage!",
                "\"Here comes the big one!\" {name} clobbers {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "Reality bends as {name} delivers a devastating blow to {target}. {dmg} damage.",
                "{name} strikes from between dimensions — {target} reels from {dmg} damage!",
                "\"The veil parts for no one.\" {name} devastates {target} for {dmg} damage.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} trips and accidentally headbutts {target} with bone-crushing force! {dmg} damage!",
                "\"I didn't mean to!\" {name} panics and wallops {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} declares, \"For honor!\" and delivers a devastating blow to {target}! {dmg} damage!",
                "{name} channels righteous fury into a mighty strike against {target}! {dmg} damage!",
                "{name} raises its weapon high and brings it down with full force on {target}! {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} stumbles and crashes into {target} with unexpected force! {dmg} damage!",
                "{name} panics and thrashes wildly, hitting {target} for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{target}", target)
    .replace("{dmg}", &dmg.to_string())
}

/// Flavor text for defend/fortify.
pub fn flavor_defend(personality: Personality, name: &str, armor: i32) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} braces defiantly. \"Come at me!\" (+{armor} armor)",
                "{name} digs in and snarls. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} takes a defensive stance, studying your movements. (+{armor} armor)",
                "{name} raises its guard, eyes calculating. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} cowers behind its defenses. (+{armor} armor)",
                "{name} whimpers and curls up defensively. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} fortifies its defenses. (+{armor} armor)",
                "{name} shifts into a defensive posture. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} hunkers down and growls warningly. (+{armor} armor)",
                "{name} tucks in its limbs and hardens its shell. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} draws on ancient wards. \"Patience is its own shield.\" (+{armor} armor)",
                "{name} whispers a protective incantation. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} puts up its guard with a smile. \"Can't hurt what you can't hit!\" (+{armor} armor)",
                "{name} cheerfully hunkers down. \"Safety first!\" (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} folds space around itself, warping incoming blows. (+{armor} armor)",
                "{name} shimmers and becomes harder to strike. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} ducks behind the nearest cover, whimpering. (+{armor} armor)",
                "{name} shields its face with both arms, trembling. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} raises its shield with practiced grace. (+{armor} armor)",
                "{name} assumes a disciplined defensive stance. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} curls up and tries to look small. (+{armor} armor)",
                "{name} retreats into its shell. (+{armor} armor)",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{armor}", &armor.to_string())
}

/// Flavor text for charge (gathering power).
pub fn flavor_charge(personality: Personality, name: &str) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} seethes with fury, gathering power for a devastating strike!",
                "{name} bellows a war cry, muscles tensing for the killing blow!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} narrows its eyes, coiling like a spring. Something terrible is coming...",
                "{name} grins wickedly, power building in its hands...",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} trembles, channeling desperate energy!",
                "{name} screeches, its body crackling with unstable power!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} is gathering power...",
                "{name} enters a deep stance, energy building...",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} rears back, baring its fangs as energy crackles around it!",
                "{name} lets out a bone-chilling howl, power surging through its body!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} closes its eyes. \"The old power stirs once more...\"",
                "{name} draws upon forgotten magic, the air growing heavy...",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} bounces excitedly, energy building! \"Ooh, this is gonna be fun!\"",
                "{name} hums louder, a warm glow gathering around it!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} begins to chant in an unknown tongue, reality rippling...",
                "The air grows cold around {name}. Something is gathering beyond the veil...",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} cowers, accidentally building up power from sheer panic!",
                "{name} whimpers and clenches its fists, desperate energy swirling!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} plants its feet and draws upon inner resolve. \"Prepare yourself!\"",
                "{name} steadies its breathing, channeling disciplined power...",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} puffs up, trying to look bigger than it is...",
                "{name} shivers and braces itself, gathering courage...",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
}

/// Flavor text for flee.
pub fn flavor_flee(personality: Personality, name: &str) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "The {name} spits in rage but retreats, knowing it's outmatched!",
                "The {name} snarls, \"This isn't over!\" and flees!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "The {name} vanishes into the shadows. \"We'll meet again...\"",
                "The {name} slips away, already plotting its revenge.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "The {name} yelps in terror and scrambles away!",
                "The {name} cries out, overwhelmed by the fear of death, and flees!",
                "The {name} turns tail and bolts, whimpering in panic!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "The {name} retreats without a word.",
                "The {name} disengages, recognizing the odds.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "The {name} screeches and skitters away into the darkness!",
                "The {name} hisses one final warning and flees!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "The {name} fades into the mist. \"Another time, another age...\"",
                "The {name} withdraws. \"Even I must yield to time.\"",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "The {name} waves goodbye! \"Great fight! Let's do it again sometime!\"",
                "The {name} skips away laughing. \"No hard feelings!\"",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "The {name} dissolves into shadow. \"We shall meet again... when the stars align.\"",
                "The {name} folds into itself and vanishes without a trace.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "The {name} shrieks \"I SURRENDER!\" and scrambles away on all fours!",
                "The {name} sobs uncontrollably and flees, tripping over its own feet!",
                "The {name} throws its weapon away and sprints in blind terror!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "The {name} bows respectfully. \"You have bested me. Until we meet again.\"",
                "The {name} sheathes its weapon with dignity and withdraws.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "The {name} hops away without a care in the world.",
                "The {name} waddles off, losing interest in the fight.",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
}

/// Flavor text for applying a debuff.
pub fn flavor_debuff(personality: Personality, name: &str, target: &str, effect: &str) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} unleashes {effect} on {target} with a vicious snarl!",
                "{name} curses {target} with {effect}! \"Suffer!\"",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} laces its attack with {effect}. {target} is affected!",
                "{name} exploits a weakness — {target} is afflicted with {effect}!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} desperately flings {effect} at {target}!",
                "{name} panics and inflicts {effect} on {target}!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} inflicts {effect} on {target}.",
                "{name} applies {effect} to {target} with clinical precision.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} spits venom — {target} is afflicted with {effect}!",
                "{name} releases a noxious burst! {target} suffers {effect}!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} speaks a cursed word. {target} is gripped by {effect}.",
                "\"Know my burden.\" {name} inflicts {effect} on {target}.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} giggles and tosses {effect} at {target}! \"Oops, sorry about that!\"",
                "{name} cheerfully hexes {target} with {effect}! \"It'll wear off... probably!\"",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} traces a sigil in the air. {target} is marked with {effect}.",
                "\"The pattern demands it.\" {name} binds {target} with {effect}.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} hurls {effect} at {target} while hiding behind a rock!",
                "\"S-stay away!\" {name} flings {effect} at {target} in a panic!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} regretfully applies {effect} to {target}. \"Forgive the dishonor.\"",
                "{name} channels {effect} at {target} with solemn resolve.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} accidentally brushes against {target}, leaving behind {effect}!",
                "{name} sneezes on {target}! {effect} applied!",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{target}", target)
    .replace("{effect}", effect)
}

/// Flavor text for AoE attack.
pub fn flavor_aoe(personality: Personality, name: &str, dmg: i32) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} ROARS and unleashes a devastating wave of destruction! {dmg} damage to all!",
                "{name} goes berserk, lashing out at everyone for {dmg} damage!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} triggers a hidden trap — everyone takes {dmg} damage!",
                "{name} releases a calculated area attack! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} shrieks and unleashes wild energy in every direction! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} unleashes an area attack. {dmg} damage to all.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} thrashes violently, hitting everyone for {dmg} damage!",
                "{name} sprays acid in every direction! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} unleashes an ancient shockwave. \"None shall stand!\" {dmg} damage to all!",
                "The ground trembles as {name} releases its fury. {dmg} damage to all.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} spins around joyfully, sending shockwaves everywhere! {dmg} damage to all!",
                "\"Wheeee!\" {name} erupts with radiant energy! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "Reality fractures around {name}. Everyone takes {dmg} damage.",
                "{name} opens a rift — dark energy pours out, dealing {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} flails in total panic, accidentally hitting everyone for {dmg} damage!",
                "\"STAY BACK!\" {name} unleashes wild energy in every direction! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} raises its weapon skyward and unleashes a righteous blast! {dmg} damage to all!",
                "\"Face judgment!\" {name} sweeps the battlefield for {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} stumbles around in a panic, bumping into everyone! {dmg} damage to all!",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{dmg}", &dmg.to_string())
}

/// Flavor text for self-heal.
pub fn flavor_heal(personality: Personality, name: &str, amount: i32) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] =
                &["{name} devours something and heals for {amount}! \"I'm not done yet!\""];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} drinks from a hidden vial, restoring {amount} HP.",
                "{name} patches its wounds with eerie precision. +{amount} HP.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &["{name} frantically bandages its wounds! +{amount} HP!"];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} heals for {amount}.",
                "{name} regenerates {amount} HP.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} licks its wounds, recovering {amount} HP.",
                "{name} consumes a fallen creature and heals {amount} HP!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} draws life from the dungeon walls. +{amount} HP.",
                "\"The old bones mend.\" {name} heals for {amount}.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} patches itself up with a whistle and a smile! +{amount} HP!",
                "{name} snacks on something and grins. \"Good as new!\" +{amount} HP!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} draws life from somewhere unseen. +{amount} HP.",
                "Shadows coil around {name}'s wounds, mending them. +{amount} HP.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} hastily slaps a bandage on while crying. +{amount} HP!",
                "{name} gulps down a potion between sobs. +{amount} HP!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} tends to its wounds with practiced dignity. +{amount} HP.",
                "{name} takes a measured breath, restoring {amount} HP.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} nibbles on some moss and recovers {amount} HP.",
                "{name} finds a quiet spot to rest. +{amount} HP.",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
    .replace("{amount}", &amount.to_string())
}

/// Flavor text for stunned state.
pub fn flavor_stunned(personality: Personality, name: &str) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} staggers, fury blazing in its eyes but unable to act!",
                "{name} shakes its head in rage, dazed and helpless!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} stumbles, its composure shattered for a moment.",
                "{name} reels, caught off guard for the first time.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} freezes in terror, paralyzed!",
                "{name} whimpers, too dazed to move!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &["{name} is stunned.", "{name} falters momentarily."];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} screeches in confusion, unable to act!",
                "{name} stumbles and thrashes, disoriented!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} pauses, ancient eyes flickering with confusion.",
                "\"Impossible...\" {name} is stunned.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} wobbles dizzily. \"Whoa, the room's spinning! Fun!\"",
                "{name} stumbles and laughs, too dazed to act!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} flickers like a candle in the wind, momentarily disrupted.",
                "The enigma surrounding {name} falters — it is stunned.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} faints from the shock! ...it's still breathing, though.",
                "{name} yelps and freezes, too terrified to move!",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} staggers but holds its composure. Stunned.",
                "{name} takes the blow with grace, but cannot act.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} blinks in confusion, completely dazed.",
                "{name} sits down, bewildered.",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
}

/// Emotional reaction based on HP percentage — appended to action messages.
pub fn flavor_emotional_reaction(
    personality: Personality,
    name: &str,
    hp_percent: f32,
) -> Option<String> {
    let mut rng = rand::rng();

    // Only trigger at certain HP thresholds, and not every time (30% chance)
    if rng.random::<f32>() > 0.30 {
        return None;
    }

    if hp_percent <= 0.15 {
        // Near death
        let msg = match personality {
            Personality::Aggressive => {
                let pool: &[&str] = &[
                    "*{name}'s rage is fading, replaced by something like fear...*",
                    "*{name} sways on its feet, blood dripping, but refuses to fall.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Cunning => {
                let pool: &[&str] = &[
                    "*{name}'s mask of confidence finally cracks.*",
                    "*{name} glances toward the exit, calculating its last options...*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Fearful => {
                let pool: &[&str] = &[
                    "*{name} is trembling uncontrollably, eyes wide with the fear of death.*",
                    "*{name} lets out a pitiful wail, barely clinging to life!*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Stoic => {
                let pool: &[&str] = &[
                    "*For the first time, {name} shows a flicker of something... doubt?*",
                    "*{name}'s stance falters almost imperceptibly.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Feral => {
                let pool: &[&str] = &[
                    "*{name} whimpers, its feral bravado replaced by raw survival instinct.*",
                    "*{name}'s movements grow desperate and erratic.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Ancient => {
                let pool: &[&str] = &[
                    "*{name} whispers, \"So this is how it ends... again.\"*",
                    "*{name}'s ancient form flickers, barely holding together.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Cheerful => {
                let pool: &[&str] = &[
                    "*{name}'s smile finally falters. \"Okay... that one actually hurt...\"*",
                    "*{name} tries to laugh, but only manages a weak cough.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Mysterious => {
                let pool: &[&str] = &[
                    "*The shadows around {name} begin to unravel...*",
                    "*{name}'s enigmatic aura dims to almost nothing.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Cowardly => {
                let pool: &[&str] = &[
                    "*{name} is sobbing openly, begging for its life between gasps.*",
                    "*{name} crawls along the ground, too broken to even flee.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Noble => {
                let pool: &[&str] = &[
                    "*{name} kneels, bloodied but unbowed. \"I will not beg.\"*",
                    "*{name}'s grip tightens on its weapon. \"A noble end, then.\"*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Passive => {
                let pool: &[&str] = &[
                    "*{name} lets out a soft, pitiful croak...*",
                    "*{name} lies still, barely breathing.*",
                ];
                pick(&mut rng, pool)
            }
        };
        Some(msg.replace("{name}", name))
    } else if hp_percent <= 0.40 {
        // Wounded
        let msg = match personality {
            Personality::Aggressive => {
                let pool: &[&str] = &[
                    "*{name} spits blood and grins. \"Is that all you've got?\"*",
                    "*{name}'s wounds only seem to make it angrier.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Cunning => {
                let pool: &[&str] =
                    &["*{name} reassesses the situation, a flicker of worry in its eyes.*"];
                pick(&mut rng, pool)
            }
            Personality::Fearful => {
                let pool: &[&str] = &[
                    "*{name} whimpers and backs away, looking for an escape route.*",
                    "*{name}'s hands shake as it clutches its wounds.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Stoic => {
                let pool: &[&str] = &["*{name} acknowledges its wounds with a silent nod.*"];
                pick(&mut rng, pool)
            }
            Personality::Feral => {
                let pool: &[&str] = &[
                    "*{name} snarls and bares its wounds defiantly.*",
                    "*{name} hisses through the pain, growing more dangerous.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Ancient => {
                let pool: &[&str] =
                    &["*{name} murmurs, \"A worthy opponent... it has been too long.\"*"];
                pick(&mut rng, pool)
            }
            Personality::Cheerful => {
                let pool: &[&str] = &["*{name} winces but forces a grin. \"Just a scratch!\"*"];
                pick(&mut rng, pool)
            }
            Personality::Mysterious => {
                let pool: &[&str] =
                    &["*{name}'s form flickers, revealing something else beneath...*"];
                pick(&mut rng, pool)
            }
            Personality::Cowardly => {
                let pool: &[&str] = &[
                    "*{name} whimpers, \"Please... I don't want to die here!\"*",
                    "*{name} is visibly shaking, looking for any way out.*",
                ];
                pick(&mut rng, pool)
            }
            Personality::Noble => {
                let pool: &[&str] =
                    &["*{name} straightens despite its wounds. \"I will not falter.\"*"];
                pick(&mut rng, pool)
            }
            Personality::Passive => {
                let pool: &[&str] =
                    &["*{name} looks around nervously, wondering how it got here.*"];
                pick(&mut rng, pool)
            }
        };
        Some(msg.replace("{name}", name))
    } else {
        None
    }
}

/// Flavor text for player defeating an enemy.
pub fn flavor_death(personality: Personality, name: &str) -> String {
    let mut rng = rand::rng();
    match personality {
        Personality::Aggressive => {
            let pool: &[&str] = &[
                "{name} collapses with a final, defiant roar!",
                "{name} falls, cursing with its last breath!",
                "{name} crumbles, rage burning out like a dying ember.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cunning => {
            let pool: &[&str] = &[
                "{name} falls with a look of disbelief. \"Impossible...\"",
                "{name} collapses. Its plans die with it.",
                "{name} gasps, \"I underestimated you...\" and goes still.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Fearful => {
            let pool: &[&str] = &[
                "{name} lets out one final, pitiful cry before going still.",
                "{name} collapses, a look of relief washing over its face.",
                "{name} falls silent, its fear finally at an end.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Stoic => {
            let pool: &[&str] = &[
                "{name} falls without a sound.",
                "{name} crumbles to dust.",
                "{name} collapses, its duty fulfilled.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Feral => {
            let pool: &[&str] = &[
                "{name} lets out a strangled screech and goes limp.",
                "{name} twitches once and dissolves into the shadows.",
                "{name} collapses in a heap, the wildness fading from its eyes.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Ancient => {
            let pool: &[&str] = &[
                "{name} sighs, \"At last... rest.\" and crumbles to dust.",
                "{name} whispers, \"The cycle continues...\" and fades away.",
                "{name} falls, and for a moment the dungeon itself seems to mourn.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cheerful => {
            let pool: &[&str] = &[
                "{name} grins one last time. \"Good game...\" and collapses.",
                "{name} gives a thumbs up as it falls. \"That was... fun...\"",
                "{name} laughs softly and goes still, a smile frozen on its face.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Mysterious => {
            let pool: &[&str] = &[
                "{name} dissolves into mist, leaving only an echo: \"This is not the end...\"",
                "{name} shatters like glass, each fragment reflecting a different reality.",
                "The shadows swallow {name} whole. Was it ever truly here?",
            ];
            pick(&mut rng, pool)
        }
        Personality::Cowardly => {
            let pool: &[&str] = &[
                "{name} collapses with a final, pathetic whimper.",
                "{name} falls, looking almost relieved the fight is over.",
                "\"I knew this would happen...\" {name} crumples to the ground.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Noble => {
            let pool: &[&str] = &[
                "{name} falls to one knee, then bows its head. \"Well fought.\"",
                "{name} salutes its opponent with its last breath and collapses.",
                "{name} falls with dignity, weapon still raised in a final salute.",
            ];
            pick(&mut rng, pool)
        }
        Personality::Passive => {
            let pool: &[&str] = &[
                "{name} lets out one last gentle croak and goes still.",
                "{name} topples over peacefully. It didn't seem to mind.",
                "{name} fades away quietly, as if it was never really here.",
            ];
            pick(&mut rng, pool)
        }
    }
    .replace("{name}", name)
}

/// Spawn one or more enemies for a room, scaling count by depth.
/// - Rooms 0-1: always 1 enemy.
/// - Room 2: 15% chance of 2 enemies at 80% HP.
/// - Rooms 3-4: 30% chance of 2 enemies at 70% HP.
/// - Room 5: 30% chance of 2 at 70% HP, 10% chance of 3 at 55% HP.
/// - Boss rooms (index >= 6): always 1 boss.
pub fn spawn_enemies(room_index: u32) -> Vec<EnemyState> {
    let mut rng = rand::rng();
    match room_index {
        0..=1 => vec![spawn_enemy(room_index)],
        2 => {
            if rng.random_range(0.0f32..1.0) < 0.15 {
                let mut e1 = spawn_enemy(room_index);
                let mut e2 = spawn_enemy(room_index);
                e1.max_hp = (e1.max_hp as f32 * 0.8) as i32;
                e1.hp = e1.max_hp;
                e1.index = 0;
                e2.max_hp = (e2.max_hp as f32 * 0.8) as i32;
                e2.hp = e2.max_hp;
                e2.index = 1;
                vec![e1, e2]
            } else {
                vec![spawn_enemy(room_index)]
            }
        }
        3..=4 => {
            if rng.random_range(0.0f32..1.0) < 0.30 {
                let mut e1 = spawn_enemy(room_index);
                let mut e2 = spawn_enemy(room_index);
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
        5 => {
            let roll = rng.random_range(0.0f32..1.0);
            if roll < 0.10 {
                // 10% chance: 3 enemies at 55% HP
                let mut e1 = spawn_enemy(room_index);
                let mut e2 = spawn_enemy(room_index);
                let mut e3 = spawn_enemy(room_index);
                for (i, e) in [&mut e1, &mut e2, &mut e3].iter_mut().enumerate() {
                    e.max_hp = (e.max_hp as f32 * 0.55) as i32;
                    e.hp = e.max_hp;
                    e.index = i as u8;
                }
                vec![e1, e2, e3]
            } else if roll < 0.40 {
                // 30% chance: 2 enemies at 70% HP
                let mut e1 = spawn_enemy(room_index);
                let mut e2 = spawn_enemy(room_index);
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
/// (Legacy linear room gen — kept for test helpers.)
#[allow(dead_code)]
fn room_type_for_index(index: u32, rng: &mut impl Rng) -> RoomType {
    if index > 0 && index % 7 == 6 {
        return RoomType::Boss;
    }
    if index == 0 {
        return RoomType::Combat;
    }
    let roll: f32 = rng.random();
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
        if rng.random_range(0.0f32..1.0) < 0.25 {
            mods.push(RoomModifier::Fog {
                accuracy_penalty: 0.1 + rng.random_range(0.0..0.1),
            });
        }
        if rng.random_range(0.0f32..1.0) < 0.15 {
            mods.push(RoomModifier::Cursed {
                dmg_multiplier: 1.25,
            });
        }
    }
    if *room_type == RoomType::RestShrine && rng.random_range(0.0f32..1.0) < 0.30 {
        mods.push(RoomModifier::Blessing { heal_bonus: 5 });
    }
    mods
}

fn generate_hazards(index: u32, room_type: &RoomType, rng: &mut impl Rng) -> Vec<Hazard> {
    let mut hazards = Vec::new();
    match room_type {
        RoomType::Trap => {
            if rng.random_bool(0.5) {
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
            if rng.random_range(0.0f32..1.0) < 0.20 {
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
/// (Legacy linear room gen — kept for test helpers.)
#[allow(dead_code)]
pub fn generate_room(index: u32) -> RoomState {
    let mut rng = rand::rng();
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
        available_quests: Vec::new(),
    }
}

/// Generate a hallway room (safe passage after fleeing combat).
pub fn generate_hallway_room(index: u32) -> RoomState {
    let mut rng = rand::rng();
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
        available_quests: Vec::new(),
    }
}

// ── Merchant stock ──────────────────────────────────────────────────

/// Generate 3 random items for sale, priced by rarity + room depth.
pub fn generate_merchant_stock(room_index: u32) -> Vec<MerchantOffer> {
    let mut rng = rand::rng();
    let all_items = item_registry();
    let mut indices: Vec<usize> = (0..all_items.len()).collect();

    // Fisher-Yates shuffle
    for i in (1..indices.len()).rev() {
        let j = rng.random_range(0..=i);
        indices.swap(i, j);
    }

    let mut offers: Vec<MerchantOffer> = indices
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
                is_gear: false,
            }
        })
        .collect();

    // Append 1-2 random gear items at higher prices
    let all_gear = gear_registry();
    let mut gear_indices: Vec<usize> = (0..all_gear.len()).collect();
    for i in (1..gear_indices.len()).rev() {
        let j = rng.random_range(0..=i);
        gear_indices.swap(i, j);
    }
    let gear_count = rng.random_range(1..=2usize);
    for &idx in gear_indices.iter().take(gear_count) {
        let gear = &all_gear[idx];
        let base_price = match gear.rarity {
            ItemRarity::Common => 25,
            ItemRarity::Uncommon => 50,
            ItemRarity::Rare => 100,
            ItemRarity::Epic => 200,
            ItemRarity::Legendary => 400,
        };
        offers.push(MerchantOffer {
            item_id: gear.id.to_owned(),
            price: base_price + (room_index as i32 * 3),
            is_gear: true,
        });
    }

    offers
}

/// Compute sell price for a consumable item (50% of rarity base price).
pub fn sell_price_for_item(item_id: &str) -> Option<i32> {
    find_item(item_id).map(|def| {
        let base = match def.rarity {
            ItemRarity::Common => 10,
            ItemRarity::Uncommon => 20,
            ItemRarity::Rare => 40,
            ItemRarity::Epic => 80,
            ItemRarity::Legendary => 150,
        };
        base / 2
    })
}

/// Compute sell price for a gear item (50% of rarity base price).
pub fn sell_price_for_gear(gear_id: &str) -> Option<i32> {
    find_gear(gear_id).map(|def| {
        let base = match def.rarity {
            ItemRarity::Common => 10,
            ItemRarity::Uncommon => 20,
            ItemRarity::Rare => 40,
            ItemRarity::Epic => 80,
            ItemRarity::Legendary => 150,
        };
        base / 2
    })
}

// ── Story events ────────────────────────────────────────────────────

/// Generate a random story event for a Story room.
pub fn generate_story_event() -> StoryEvent {
    let mut rng = rand::rng();
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
        StoryEvent {
            prompt: "A sealed door with ancient locks blocks the way...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Pick Lock".to_owned(),
                    description: "Try to pick the ancient lock.".to_owned(),
                },
                StoryChoice {
                    label: "Force Open".to_owned(),
                    description: "Smash through the door.".to_owned(),
                },
                StoryChoice {
                    label: "Sense Traps".to_owned(),
                    description: "Feel for hidden mechanisms.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "A dying adventurer reaches out for help...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Help Them".to_owned(),
                    description: "Tend to their wounds.".to_owned(),
                },
                StoryChoice {
                    label: "Take Gear".to_owned(),
                    description: "Claim their equipment.".to_owned(),
                },
                StoryChoice {
                    label: "Search Pockets".to_owned(),
                    description: "Rifle through their belongings.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "A narrow bridge spans a dark chasm...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Cross Carefully".to_owned(),
                    description: "Move slowly and steadily.".to_owned(),
                },
                StoryChoice {
                    label: "Sprint Across".to_owned(),
                    description: "Run before it collapses.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "You discover a hidden shrine...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Pray".to_owned(),
                    description: "Kneel and offer a prayer.".to_owned(),
                },
                StoryChoice {
                    label: "Pass".to_owned(),
                    description: "Continue on your way.".to_owned(),
                },
            ],
        },
        StoryEvent {
            prompt: "A translucent merchant ghost materializes...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Trade".to_owned(),
                    description: "Offer 20 gold for spectral protection.".to_owned(),
                },
                StoryChoice {
                    label: "Decline".to_owned(),
                    description: "Politely refuse.".to_owned(),
                },
            ],
        },
    ];
    events[rng.random_range(0..events.len())].clone()
}

/// Resolve a story event choice. Returns the outcome for the given event index and choice.
pub fn resolve_story_choice(
    event_prompt: &str,
    choice_idx: usize,
    class: &ClassType,
) -> StoryOutcome {
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
        // ── Event 5: Sealed door ──────────────────────────────────────
        (p, 0) if p.starts_with("A sealed door") => match class {
            ClassType::Rogue => StoryOutcome {
                log_message: "Your nimble fingers make quick work of the ancient lock. Gold gleams inside!".to_owned(),
                hp_change: 0,
                gold_change: 10,
                item_gain: None,
                effect_gain: None,
            },
            _ => StoryOutcome {
                log_message: "You fumble with the lock mechanism, triggering a needle trap.".to_owned(),
                hp_change: -3,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, 1) if p.starts_with("A sealed door") => match class {
            ClassType::Warrior => StoryOutcome {
                log_message: "You smash through the door! Splinters cut you, but the impact sharpens your resolve.".to_owned(),
                hp_change: -8,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Sharpened, 2, 3)),
            },
            _ => StoryOutcome {
                log_message: "You throw yourself against the door, bruising your shoulder.".to_owned(),
                hp_change: -8,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, _) if p.starts_with("A sealed door") => match class {
            ClassType::Cleric => StoryOutcome {
                log_message: "Your divine senses detect a hidden trap. You disarm it and feel blessed.".to_owned(),
                hp_change: 5,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Shielded, 1, 3)),
            },
            _ => StoryOutcome {
                log_message: "You sense something but can't quite make it out. Nothing happens.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        // ── Event 6: Dying adventurer ─────────────────────────────────
        (p, 0) if p.starts_with("A dying adventurer") => match class {
            ClassType::Cleric => StoryOutcome {
                log_message: "Your healing touch saves the adventurer. They bless you with divine protection.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Shielded, 1, 3)),
            },
            _ => StoryOutcome {
                log_message: "You do your best to help. The adventurer thanks you weakly.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, 1) if p.starts_with("A dying adventurer") => match class {
            ClassType::Warrior => StoryOutcome {
                log_message: "You claim the fallen warrior's weapon. A whetstone falls from their belt.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: Some("whetstone"),
                effect_gain: Some((EffectKind::Sharpened, 1, 3)),
            },
            _ => StoryOutcome {
                log_message: "You take their gear. It's mostly worn out.".to_owned(),
                hp_change: 0,
                gold_change: 5,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, _) if p.starts_with("A dying adventurer") => match class {
            ClassType::Rogue => StoryOutcome {
                log_message: "Your quick fingers find a hidden coin purse. Not bad.".to_owned(),
                hp_change: 0,
                gold_change: 25,
                item_gain: None,
                effect_gain: None,
            },
            _ => StoryOutcome {
                log_message: "You search but find only lint and regret.".to_owned(),
                hp_change: 0,
                gold_change: 3,
                item_gain: None,
                effect_gain: None,
            },
        },
        // ── Event 7: Narrow bridge ────────────────────────────────────
        (p, 0) if p.starts_with("A narrow bridge") => match class {
            ClassType::Rogue => StoryOutcome {
                log_message: "Your light feet carry you safely across the bridge.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
            ClassType::Cleric => StoryOutcome {
                log_message: "A prayer steadies your nerves. You cross safely, feeling protected.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Shielded, 1, 2)),
            },
            ClassType::Warrior => StoryOutcome {
                log_message: "You cross the bridge carefully. The planks creak but hold.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, _) if p.starts_with("A narrow bridge") => StoryOutcome {
            log_message: "You sprint across! A plank snaps underfoot, scraping your leg, but you grab some coins on the other side.".to_owned(),
            hp_change: -5,
            gold_change: 5,
            item_gain: None,
            effect_gain: None,
        },
        // ── Event 8: Hidden shrine ────────────────────────────────────
        (p, 0) if p.starts_with("You discover a hidden shrine") => match class {
            ClassType::Warrior => StoryOutcome {
                log_message: "The shrine empowers your blade with divine fury.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Sharpened, 2, 4)),
            },
            ClassType::Rogue => StoryOutcome {
                log_message: "The shrine wraps you in a protective shimmer.".to_owned(),
                hp_change: 0,
                gold_change: 0,
                item_gain: None,
                effect_gain: Some((EffectKind::Shielded, 1, 4)),
            },
            ClassType::Cleric => StoryOutcome {
                log_message: "The shrine resonates with your faith. Warmth floods through you.".to_owned(),
                hp_change: 30,
                gold_change: 0,
                item_gain: None,
                effect_gain: None,
            },
        },
        (p, _) if p.starts_with("You discover a hidden shrine") => StoryOutcome {
            log_message: "You pass the shrine without stopping.".to_owned(),
            hp_change: 0,
            gold_change: 0,
            item_gain: None,
            effect_gain: None,
        },
        // ── Event 9: Ghost merchant ───────────────────────────────────
        (p, 0) if p.starts_with("A translucent merchant ghost") => StoryOutcome {
            log_message: "The ghost accepts your gold and wraps you in spectral armor.".to_owned(),
            hp_change: 0,
            gold_change: -20,
            item_gain: None,
            effect_gain: Some((EffectKind::Shielded, 2, 4)),
        },
        (p, _) if p.starts_with("A translucent merchant ghost") => StoryOutcome {
            log_message: "The ghost fades away with a disappointed sigh.".to_owned(),
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

// ── Map generation ──────────────────────────────────────────────────

/// Create a deterministic RNG for a specific tile position.
fn tile_rng(seed: u64, pos: &MapPos) -> ChaCha8Rng {
    let hash = seed ^ ((pos.x as u64) << 32 | (pos.y as u16 as u64));
    ChaCha8Rng::seed_from_u64(hash)
}

/// Generate exits for a tile (2-4 directions, at least 2 to avoid dead ends).
fn generate_exits(rng: &mut impl RngExt) -> Vec<Direction> {
    let all = Direction::all();
    let count = rng.random_range(2..=4usize);
    let mut exits: Vec<Direction> = all.to_vec();
    // Shuffle and take `count`
    for i in (1..exits.len()).rev() {
        let j = rng.random_range(0..=i);
        exits.swap(i, j);
    }
    exits.truncate(count);
    exits
}

/// Determine room type for a map tile based on position and depth.
fn tile_type_for_position(
    pos: &MapPos,
    depth: u32,
    boss_positions: &[MapPos],
    rng: &mut impl RngExt,
) -> RoomType {
    // Origin is always city
    if pos.x == 0 && pos.y == 0 {
        return RoomType::UndergroundCity;
    }

    // Boss positions
    if boss_positions.contains(pos) {
        return RoomType::Boss;
    }

    // Weight table (same probabilities as linear system)
    let roll: f32 = rng.random();
    if depth <= 1 {
        // Near city: mostly safe rooms
        if roll < 0.40 {
            RoomType::Combat
        } else if roll < 0.55 {
            RoomType::RestShrine
        } else if roll < 0.70 {
            RoomType::Merchant
        } else if roll < 0.85 {
            RoomType::Treasure
        } else {
            RoomType::Story
        }
    } else {
        // Deeper: standard distribution
        if roll < 0.35 {
            RoomType::Combat
        } else if roll < 0.50 {
            RoomType::Treasure
        } else if roll < 0.62 {
            RoomType::Trap
        } else if roll < 0.72 {
            RoomType::RestShrine
        } else if roll < 0.82 {
            RoomType::Merchant
        } else if roll < 0.92 {
            RoomType::Story
        } else {
            RoomType::Hallway
        }
    }
}

/// Compute boss positions — one boss per Manhattan distance ring of 7.
fn compute_boss_positions(seed: u64) -> Vec<MapPos> {
    let mut rng = ChaCha8Rng::seed_from_u64(seed.wrapping_add(0xB055));
    let mut positions = Vec::new();
    for ring in 1..=5u32 {
        let depth = ring * 7;
        // Pick a random position at this Manhattan distance
        let x = rng.random_range(0..=depth as i16);
        let y = (depth as i16) - x;
        // Randomize sign
        let x = if rng.random_bool(0.5) { x } else { -x };
        let y = if rng.random_bool(0.5) { y } else { -y };
        positions.push(MapPos::new(x, y));
    }
    positions
}

/// Generate a single map tile at the given position.
fn generate_tile_at(seed: u64, pos: &MapPos, boss_positions: &[MapPos]) -> MapTile {
    let mut rng = tile_rng(seed, pos);
    let depth = pos.depth();
    let room_type = tile_type_for_position(pos, depth, boss_positions, &mut rng);

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
    let exits = generate_exits(&mut rng);

    MapTile {
        pos: *pos,
        room_type,
        name,
        description,
        exits,
        visited: false,
        cleared: false,
    }
}

/// Generate the initial map for a new session.
pub fn generate_initial_map(session_id: &uuid::Uuid) -> MapState {
    let seed = session_id.as_u128() as u64;
    let boss_positions = compute_boss_positions(seed);
    let origin = MapPos::new(0, 0);

    let mut tiles = std::collections::HashMap::new();

    // Origin tile = UndergroundCity
    let origin_tile = MapTile {
        pos: origin,
        room_type: RoomType::UndergroundCity,
        name: "The Underground City".to_owned(),
        description: "A bustling settlement beneath the earth. Merchants hawk wares and a hospital offers healing.".to_owned(),
        exits: vec![Direction::North, Direction::South, Direction::East, Direction::West],
        visited: true,
        cleared: true,
    };
    tiles.insert(origin, origin_tile);

    // Reveal the 4 adjacent tiles
    for &dir in Direction::all() {
        let neighbor = origin.neighbor(dir);
        let mut tile = generate_tile_at(seed, &neighbor, &boss_positions);
        // Ensure bidirectional connectivity: neighbor must have exit back to origin
        let back = dir.opposite();
        if !tile.exits.contains(&back) {
            tile.exits.push(back);
        }
        tiles.insert(neighbor, tile);
    }

    MapState {
        seed,
        position: origin,
        tiles,
        tiles_visited: 1,
        boss_positions,
    }
}

/// Reveal a tile on the map. If it doesn't exist, generate it.
/// Ensures bidirectional exit consistency.
pub fn reveal_tile(map: &mut MapState, pos: MapPos, from_dir: Option<Direction>) {
    if !map.tiles.contains_key(&pos) {
        let mut tile = generate_tile_at(map.seed, &pos, &map.boss_positions);
        // Ensure bidirectional exit: tile must have exit back to where we came from
        if let Some(dir) = from_dir {
            let back = dir.opposite();
            if !tile.exits.contains(&back) {
                tile.exits.push(back);
            }
        }
        map.tiles.insert(pos, tile);
    }
}

/// Reveal all neighbors of a position.
pub fn reveal_neighbors(map: &mut MapState, pos: MapPos) {
    let tile_exits: Vec<Direction> = map
        .tiles
        .get(&pos)
        .map(|t| t.exits.clone())
        .unwrap_or_default();

    for dir in tile_exits {
        let neighbor = pos.neighbor(dir);
        reveal_tile(map, neighbor, Some(dir));
    }
}

/// Build a RoomState from a MapTile (bridge to existing combat/merchant/etc systems).
pub fn room_from_tile(tile: &MapTile) -> RoomState {
    let depth = tile.pos.depth();
    let mut rng = tile_rng(0, &tile.pos); // Use a consistent seed for the tile

    let modifiers = generate_modifiers(depth, &tile.room_type, &mut rng);
    let hazards = generate_hazards(depth, &tile.room_type, &mut rng);

    let merchant_stock =
        if tile.room_type == RoomType::Merchant || tile.room_type == RoomType::UndergroundCity {
            generate_merchant_stock(depth)
        } else {
            Vec::new()
        };

    let story_event = if tile.room_type == RoomType::Story {
        Some(generate_story_event())
    } else {
        None
    };

    RoomState {
        index: depth,
        room_type: tile.room_type.clone(),
        name: tile.name.clone(),
        description: tile.description.clone(),
        modifiers,
        hazards,
        merchant_stock,
        story_event,
        available_quests: Vec::new(),
    }
}

/// Generate a lightweight encounter room for random travel encounters.
pub fn generate_encounter_room(depth: u32) -> RoomState {
    let mut rng = rand::rng();
    let (name, description) = pick_template(combat_rooms(), &mut rng);
    let modifiers = generate_modifiers(depth, &RoomType::Combat, &mut rng);
    let hazards = generate_hazards(depth, &RoomType::Combat, &mut rng);

    RoomState {
        index: depth,
        room_type: RoomType::Combat,
        name,
        description,
        modifiers,
        hazards,
        merchant_stock: Vec::new(),
        story_event: None,
        available_quests: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_registry_has_17_items() {
        assert_eq!(item_registry().len(), 17);
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
        assert_eq!(gear_registry().len(), 15);
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
        assert_eq!(vamp.special, Some(GearSpecial::LifeSteal { percent: 20 }));
    }

    #[test]
    fn enemy_scaling() {
        let e0 = spawn_enemy(0);
        assert_eq!(e0.level, 1);
        assert!(e0.hp <= 25); // Crumbling Statue is the tankiest tier-1 at 22 HP
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

        // Mid rooms (3-4): can be 1 or 2
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
                    // Crystal Golem is the tankiest at 45 HP * 0.7 = 31
                    assert!(enemies[0].hp < 35);
                }
                _ => panic!("unexpected enemy count at room 4"),
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
    fn merchant_stock_has_items_and_gear() {
        let stock = generate_merchant_stock(3);
        // 3 consumables + 1-2 gear = 4 or 5 total
        assert!(stock.len() >= 4 && stock.len() <= 5);
        let consumables: Vec<_> = stock.iter().filter(|o| !o.is_gear).collect();
        let gear: Vec<_> = stock.iter().filter(|o| o.is_gear).collect();
        assert_eq!(consumables.len(), 3);
        assert!(gear.len() >= 1 && gear.len() <= 2);
        for offer in &consumables {
            assert!(offer.price > 0);
            assert!(find_item(&offer.item_id).is_some());
        }
        for offer in &gear {
            assert!(offer.price > 0);
            assert!(find_gear(&offer.item_id).is_some());
        }
    }

    #[test]
    fn story_event_generated() {
        let event = generate_story_event();
        assert!(!event.prompt.is_empty());
        assert!(event.choices.len() >= 2 && event.choices.len() <= 3);
    }

    #[test]
    fn story_outcome_resolved() {
        let outcome =
            resolve_story_choice("A mirror whispers your name...", 0, &ClassType::Warrior);
        assert_eq!(outcome.hp_change, 10);
        let outcome2 =
            resolve_story_choice("A mirror whispers your name...", 1, &ClassType::Warrior);
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

    #[test]
    fn test_sell_price_for_item() {
        // Known items should return a positive sell price
        let potion_price = sell_price_for_item("potion");
        assert!(potion_price.is_some());
        assert!(
            potion_price.unwrap() > 0,
            "potion sell price should be positive"
        );

        let bandage_price = sell_price_for_item("bandage");
        assert!(bandage_price.is_some());
        assert!(
            bandage_price.unwrap() > 0,
            "bandage sell price should be positive"
        );

        // Unknown item should return None
        let unknown_price = sell_price_for_item("nonexistent");
        assert!(
            unknown_price.is_none(),
            "nonexistent item should return None"
        );
    }

    #[test]
    fn test_sell_price_for_gear() {
        // Known gear should return a positive sell price
        let sword_price = sell_price_for_gear("rusty_sword");
        assert!(sword_price.is_some());
        assert!(
            sword_price.unwrap() > 0,
            "rusty_sword sell price should be positive"
        );

        // Unknown gear should return None
        let unknown_price = sell_price_for_gear("nonexistent");
        assert!(
            unknown_price.is_none(),
            "nonexistent gear should return None"
        );
    }

    #[test]
    fn test_story_events_variety() {
        use std::collections::HashSet;
        let mut prompts = HashSet::new();
        for _ in 0..100 {
            let event = generate_story_event();
            prompts.insert(event.prompt.clone());
        }
        // There are 4 different events; in 100 rolls we should see at least 3
        assert!(
            prompts.len() >= 3,
            "Expected at least 3 unique story events in 100 rolls, got {}",
            prompts.len()
        );
    }

    #[test]
    fn test_story_choice_resolve_outcomes() {
        // Mirror event, choice 0 (Listen): grants +10 HP
        let outcome =
            resolve_story_choice("A mirror whispers your name...", 0, &ClassType::Warrior);
        assert_eq!(outcome.hp_change, 10);
        assert_eq!(outcome.gold_change, 0);
        assert!(outcome.item_gain.is_none());

        // Mirror event, choice 1 (Smash): -5 HP, gets bomb, gets bleed
        let outcome =
            resolve_story_choice("A mirror whispers your name...", 1, &ClassType::Warrior);
        assert_eq!(outcome.hp_change, -5);
        assert_eq!(outcome.item_gain, Some("bomb"));
        assert!(outcome.effect_gain.is_some());

        // Rusty chest, choice 0 (Open): +20 gold
        let outcome = resolve_story_choice(
            "A rusty chest sits in the corner, vines crawling over its lock.",
            0,
            &ClassType::Warrior,
        );
        assert_eq!(outcome.gold_change, 20);
        assert_eq!(outcome.hp_change, 0);

        // Spectral figure, choice 0 (Accept): -15 gold, gets ward
        let outcome = resolve_story_choice(
            "A spectral figure offers a glowing vial in exchange for your gold.",
            0,
            &ClassType::Warrior,
        );
        assert_eq!(outcome.gold_change, -15);
        assert_eq!(outcome.item_gain, Some("ward"));

        // Ancient runes, choice 0 (Step In): +15 HP, shielded effect
        let outcome = resolve_story_choice(
            "Ancient runes glow on the floor. They pulse with energy.",
            0,
            &ClassType::Warrior,
        );
        assert_eq!(outcome.hp_change, 15);
        assert!(outcome.effect_gain.is_some());
        let (kind, _, _) = outcome.effect_gain.unwrap();
        assert_eq!(kind, EffectKind::Shielded);

        // Unknown event falls through to default
        let outcome = resolve_story_choice("completely unknown prompt", 0, &ClassType::Warrior);
        assert_eq!(outcome.hp_change, 0);
        assert_eq!(outcome.gold_change, 0);
        assert!(outcome.item_gain.is_none());
    }

    #[test]
    fn test_merchant_stock_prices_positive() {
        let stock = generate_merchant_stock(3);
        // All prices must be positive
        for offer in &stock {
            assert!(
                offer.price > 0,
                "offer {} price should be > 0",
                offer.item_id
            );
        }
        // At least one item should be gear
        assert!(
            stock.iter().any(|o| o.is_gear),
            "merchant stock should contain at least one gear item"
        );
    }

    #[test]
    fn test_spawn_enemies_boss_room() {
        // Boss rooms (index >= 6) should always spawn exactly 1 enemy
        for _ in 0..20 {
            let enemies = spawn_enemies(6);
            assert_eq!(enemies.len(), 1, "boss room should have exactly 1 enemy");
            let boss = &enemies[0];
            assert!(
                boss.level >= 4,
                "boss level should be >= 4, got {}",
                boss.level
            );
            // Boss HP should be higher than regular early enemies (max 20)
            assert!(
                boss.hp > 20,
                "boss HP ({}) should be higher than regular enemies",
                boss.hp
            );
        }
    }

    #[test]
    fn test_spawn_enemies_scaling() {
        // Collect level ranges from multiple spawns
        let mut min_level_room0 = u8::MAX;
        let mut max_level_room0 = 0u8;
        let mut min_level_room3 = u8::MAX;
        let mut max_level_room3 = 0u8;
        let mut min_level_boss = u8::MAX;
        let mut max_level_boss = 0u8;

        for _ in 0..50 {
            let e0 = spawn_enemies(0);
            for e in &e0 {
                min_level_room0 = min_level_room0.min(e.level);
                max_level_room0 = max_level_room0.max(e.level);
            }

            let e3 = spawn_enemies(3);
            for e in &e3 {
                min_level_room3 = min_level_room3.min(e.level);
                max_level_room3 = max_level_room3.max(e.level);
            }

            let e6 = spawn_enemies(6);
            for e in &e6 {
                min_level_boss = min_level_boss.min(e.level);
                max_level_boss = max_level_boss.max(e.level);
            }
        }

        // Room 3 enemies should have higher level than room 0
        assert!(
            max_level_room3 > max_level_room0,
            "room 3 max level ({}) should be higher than room 0 max level ({})",
            max_level_room3,
            max_level_room0
        );

        // Boss room should have the highest level
        assert!(
            min_level_boss > max_level_room3,
            "boss min level ({}) should be higher than room 3 max level ({})",
            min_level_boss,
            max_level_room3
        );
    }

    // ── Map generation tests ─────────────────────────────────────

    #[test]
    fn test_generate_initial_map() {
        let id = uuid::Uuid::new_v4();
        let map = generate_initial_map(&id);
        let origin = MapPos::new(0, 0);

        // Origin must exist and be an UndergroundCity
        let origin_tile = map.tiles.get(&origin).unwrap();
        assert_eq!(origin_tile.room_type, RoomType::UndergroundCity);
        assert!(origin_tile.visited);
        assert!(origin_tile.cleared);
        assert_eq!(origin_tile.exits.len(), 4);

        // All 4 neighbors must be revealed
        for &dir in Direction::all() {
            let neighbor = origin.neighbor(dir);
            assert!(
                map.tiles.contains_key(&neighbor),
                "missing neighbor {:?}",
                dir
            );
            let neighbor_tile = map.tiles.get(&neighbor).unwrap();
            // Neighbor must have exit back to origin
            assert!(
                neighbor_tile.exits.contains(&dir.opposite()),
                "neighbor {:?} missing exit back to origin",
                dir
            );
        }

        assert_eq!(map.position, origin);
        assert_eq!(map.tiles_visited, 1);
        assert!(map.tiles.len() >= 5); // origin + 4 neighbors
    }

    #[test]
    fn test_map_deterministic() {
        let id = uuid::Uuid::new_v4();
        let map1 = generate_initial_map(&id);
        let map2 = generate_initial_map(&id);

        // Same session ID should produce same map
        assert_eq!(map1.seed, map2.seed);
        assert_eq!(map1.boss_positions, map2.boss_positions);

        // Tiles at same positions should have same room types
        for (pos, tile1) in &map1.tiles {
            let tile2 = map2.tiles.get(pos).unwrap();
            assert_eq!(tile1.room_type, tile2.room_type);
            assert_eq!(tile1.name, tile2.name);
        }
    }

    #[test]
    fn test_reveal_tile_bidirectional() {
        let id = uuid::Uuid::new_v4();
        let mut map = generate_initial_map(&id);
        let new_pos = MapPos::new(2, 0);

        reveal_tile(&mut map, new_pos, Some(Direction::East));
        let tile = map.tiles.get(&new_pos).unwrap();
        // Must have exit back to west (where we came from)
        assert!(tile.exits.contains(&Direction::West));
    }

    #[test]
    fn test_room_from_tile() {
        let tile = MapTile {
            pos: MapPos::new(3, 4),
            room_type: RoomType::Combat,
            name: "Test Room".to_owned(),
            description: "A test.".to_owned(),
            exits: vec![Direction::North],
            visited: true,
            cleared: false,
        };
        let room = room_from_tile(&tile);
        assert_eq!(room.room_type, RoomType::Combat);
        assert_eq!(room.name, "Test Room");
        assert_eq!(room.index, 7); // depth = |3| + |4| = 7
    }

    #[test]
    fn test_encounter_room() {
        let room = generate_encounter_room(5);
        assert_eq!(room.room_type, RoomType::Combat);
        assert_eq!(room.index, 5);
        assert!(!room.name.is_empty());
    }

    #[test]
    fn test_boss_positions() {
        let positions = compute_boss_positions(42);
        assert_eq!(positions.len(), 5);
        // Each boss should be at a depth that's a multiple of 7
        for (i, pos) in positions.iter().enumerate() {
            let expected_depth = (i as u32 + 1) * 7;
            assert_eq!(
                pos.depth(),
                expected_depth,
                "Boss {} at {:?} should be at depth {}",
                i,
                pos,
                expected_depth
            );
        }
    }

    // ── New gear item validation tests ─────────────────────────────

    #[test]
    fn new_gear_items_all_exist() {
        let new_ids = [
            "iron_mace",
            "glass_stiletto",
            "excalibur",
            "void_scythe",
            "shadow_cloak",
            "runeguard_plate",
            "dragon_scale",
        ];
        for id in &new_ids {
            assert!(
                find_gear(id).is_some(),
                "gear '{}' should exist in registry",
                id
            );
        }
    }

    #[test]
    fn legendary_gear_stats_correct() {
        let excalibur = find_gear("excalibur").unwrap();
        assert_eq!(excalibur.rarity, ItemRarity::Legendary);
        assert_eq!(excalibur.slot, EquipSlot::Weapon);
        assert_eq!(excalibur.bonus_damage, 6);
        assert_eq!(excalibur.bonus_hp, 5);
        assert_eq!(
            excalibur.special,
            Some(GearSpecial::CritBonus { percent: 10 })
        );

        let void_scythe = find_gear("void_scythe").unwrap();
        assert_eq!(void_scythe.rarity, ItemRarity::Legendary);
        assert_eq!(void_scythe.bonus_damage, 7);
        assert_eq!(
            void_scythe.special,
            Some(GearSpecial::LifeSteal { percent: 15 })
        );

        let dragon_scale = find_gear("dragon_scale").unwrap();
        assert_eq!(dragon_scale.rarity, ItemRarity::Legendary);
        assert_eq!(dragon_scale.slot, EquipSlot::Armor);
        assert_eq!(dragon_scale.bonus_armor, 8);
        assert_eq!(dragon_scale.bonus_hp, 15);
        assert_eq!(
            dragon_scale.special,
            Some(GearSpecial::DamageReduction { percent: 10 })
        );
    }

    #[test]
    fn gear_loot_tables_reference_valid_gear() {
        // Every gear_id in loot tables must exist in the gear registry
        let tables = gear_loot_tables();
        for table in tables {
            for entry in table.entries {
                assert!(
                    find_gear(entry.gear_id).is_some(),
                    "gear loot table '{}' references non-existent gear '{}'",
                    table.id,
                    entry.gear_id
                );
            }
        }
    }

    #[test]
    fn gear_registry_unique_ids() {
        let registry = gear_registry();
        let mut seen = std::collections::HashSet::new();
        for gear in registry {
            assert!(
                seen.insert(gear.id),
                "duplicate gear id '{}' in registry",
                gear.id
            );
        }
    }

    #[test]
    fn gear_rarity_distribution() {
        let registry = gear_registry();
        let common = registry
            .iter()
            .filter(|g| g.rarity == ItemRarity::Common)
            .count();
        let uncommon = registry
            .iter()
            .filter(|g| g.rarity == ItemRarity::Uncommon)
            .count();
        let rare = registry
            .iter()
            .filter(|g| g.rarity == ItemRarity::Rare)
            .count();
        let epic = registry
            .iter()
            .filter(|g| g.rarity == ItemRarity::Epic)
            .count();
        let legendary = registry
            .iter()
            .filter(|g| g.rarity == ItemRarity::Legendary)
            .count();

        assert!(common >= 2, "should have at least 2 Common gear");
        assert!(uncommon >= 2, "should have at least 2 Uncommon gear");
        assert!(rare >= 2, "should have at least 2 Rare gear");
        assert!(epic >= 1, "should have at least 1 Epic gear");
        assert!(legendary >= 3, "should have at least 3 Legendary gear");
    }

    // ── is_rare_or_above tests ──────────────────────────────────────

    #[test]
    fn is_rare_or_above_common_items() {
        assert!(!is_rare_or_above("potion"), "potion is Common");
        assert!(!is_rare_or_above("rations"), "rations is Common");
        assert!(!is_rare_or_above("bandage"), "bandage is Common");
    }

    #[test]
    fn is_rare_or_above_uncommon_items() {
        assert!(!is_rare_or_above("bomb"), "bomb is Uncommon");
    }

    #[test]
    fn is_rare_or_above_rare_items() {
        assert!(is_rare_or_above("ward"), "ward is Rare");
        assert!(is_rare_or_above("smoke_bomb"), "smoke_bomb is Rare");
    }

    #[test]
    fn is_rare_or_above_legendary_items() {
        assert!(is_rare_or_above("elixir"), "elixir is Legendary");
    }

    #[test]
    fn is_rare_or_above_gear() {
        assert!(!is_rare_or_above("rusty_sword"), "rusty_sword is Common");
        assert!(is_rare_or_above("flame_axe"), "flame_axe is Rare");
        assert!(is_rare_or_above("vampiric_blade"), "vampiric_blade is Epic");
        assert!(is_rare_or_above("excalibur"), "excalibur is Legendary");
    }

    #[test]
    fn is_rare_or_above_unknown_id() {
        assert!(!is_rare_or_above("nonexistent_item"));
    }

    // ── Flavor text tests ───────────────────────────────────────────

    #[test]
    fn flavor_attack_contains_name_and_damage() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_attack(personality, "Goblin", "Hero", 10);
            assert!(msg.contains("Goblin"), "should contain enemy name: {msg}");
            assert!(msg.contains("10"), "should contain damage: {msg}");
            assert!(msg.contains("Hero"), "should contain target name: {msg}");
        }
    }

    #[test]
    fn flavor_heavy_attack_contains_name_and_damage() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_heavy_attack(personality, "Dragon", "Warrior", 25);
            assert!(msg.contains("Dragon"), "{msg}");
            assert!(msg.contains("25"), "{msg}");
        }
    }

    #[test]
    fn flavor_defend_contains_armor() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_defend(personality, "Golem", 5);
            assert!(msg.contains("5"), "should contain armor value: {msg}");
        }
    }

    #[test]
    fn flavor_charge_contains_name() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_charge(personality, "Knight");
            assert!(msg.contains("Knight"), "{msg}");
        }
    }

    #[test]
    fn flavor_flee_contains_name() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_flee(personality, "Imp");
            assert!(msg.contains("Imp"), "{msg}");
        }
    }

    #[test]
    fn flavor_debuff_contains_effect_and_names() {
        let msg = flavor_debuff(Personality::Cunning, "Spider", "Archer", "Poison");
        assert!(msg.contains("Spider"), "{msg}");
        assert!(msg.contains("Poison"), "{msg}");
    }

    #[test]
    fn flavor_aoe_contains_damage() {
        let msg = flavor_aoe(Personality::Ancient, "King", 12);
        assert!(msg.contains("12"), "{msg}");
        assert!(msg.contains("King"), "{msg}");
    }

    #[test]
    fn flavor_heal_contains_amount() {
        let msg = flavor_heal(Personality::Fearful, "Goblin", 8);
        assert!(msg.contains("8"), "{msg}");
        assert!(msg.contains("Goblin"), "{msg}");
    }

    #[test]
    fn flavor_stunned_contains_name() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_stunned(personality, "Bat");
            assert!(msg.contains("Bat"), "{msg}");
        }
    }

    #[test]
    fn flavor_death_contains_name() {
        for personality in [
            Personality::Aggressive,
            Personality::Cunning,
            Personality::Fearful,
            Personality::Stoic,
            Personality::Feral,
            Personality::Ancient,
            Personality::Cheerful,
            Personality::Mysterious,
            Personality::Cowardly,
            Personality::Noble,
            Personality::Passive,
        ] {
            let msg = flavor_death(personality, "Wraith");
            assert!(msg.contains("Wraith"), "{msg}");
        }
    }

    #[test]
    fn flavor_emotional_reaction_only_triggers_at_low_hp() {
        // At full HP (1.0), should never trigger
        let mut triggered = false;
        for _ in 0..100 {
            if flavor_emotional_reaction(Personality::Fearful, "Goblin", 1.0).is_some() {
                triggered = true;
                break;
            }
        }
        assert!(!triggered, "should not trigger at full HP");
    }

    #[test]
    fn flavor_emotional_reaction_can_trigger_at_critical_hp() {
        // At 10% HP, should trigger sometimes (30% chance per call)
        let mut triggered = false;
        for _ in 0..100 {
            if flavor_emotional_reaction(Personality::Fearful, "Goblin", 0.10).is_some() {
                triggered = true;
                break;
            }
        }
        assert!(
            triggered,
            "should trigger at critical HP within 100 attempts"
        );
    }

    #[test]
    fn all_enemies_have_personality_assigned() {
        // Run spawn_enemy many times and verify personality is set
        for room_idx in 0..8 {
            for _ in 0..10 {
                let enemy = spawn_enemy(room_idx);
                // Just verify it doesn't panic and has a valid personality
                let _ = flavor_attack(enemy.personality, &enemy.name, "Hero", 5);
            }
        }
    }
}
