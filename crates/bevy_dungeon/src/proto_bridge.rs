//! Bridge between the proto-driven [`ItemDb`] and the game's legacy type system.
//!
//! Loads all items from an embedded JSON snapshot of the Astro `/api/itemdb.json`
//! endpoint, converts proto [`Item`] structs into the game's [`ItemDef`] and
//! [`GearDef`] types, and exposes them via the same lookup functions that the
//! rest of the codebase already uses.

use std::sync::LazyLock;

use bevy_dialogue::{DialogueDb, DialogueGraph};
use bevy_items::{
    EquipSlot as ProtoEquipSlot, GearSpecialType, ItemDb, StatusEffectKind, UseEffectType,
    inventory_adapter::ProtoItemKind,
};
use bevy_mapdb::{MapDb, WorldObjectType};
use bevy_npc::NpcDb;
use bevy_quests::QuestDb;
use rand::{Rng, RngExt};

use crate::types::*;

pub use bevy_items::inventory_adapter;

/// Embedded JSON snapshot of the full itemdb — generated from the Astro dev server.
/// This will be replaced by a live endpoint fetch once the production API is deployed.
const ITEMDB_JSON: &str = include_str!("../data/itemdb.json");

/// The global proto item database, loaded once from the embedded JSON.
/// Also initializes the [`ProtoItemKind`] adapter so inventory lookups work.
static ITEM_DB: LazyLock<ItemDb> =
    LazyLock::new(|| ItemDb::from_json(ITEMDB_JSON).expect("embedded itemdb.json must be valid"));

/// Ensure the `ProtoItemKind` adapter is initialized with our global `ItemDb`.
/// Called lazily on first use of any inventory-related function.
static INVENTORY_INIT: LazyLock<()> = LazyLock::new(|| {
    // Force ITEM_DB to load first, then hand it to the adapter.
    let db: &'static ItemDb = &ITEM_DB;
    inventory_adapter::init_item_db(db);
});

/// Embedded JSON snapshot of the NPC database — generated from the Astro dev server.
const NPCDB_JSON: &str = include_str!("../data/npcdb.json");

/// The conversation graphs. Hand-authored, unlike the databases either side of
/// it: npcdb.json and itemdb.json are generated, so a conversation written into
/// one would be overwritten the next time content synced.
///
/// Enum fields are written as numbers rather than as the names the schema
/// gives them. Canonical proto JSON spells an enum out -- and prost's generated
/// types take an i32 and no serde adapter for it -- so a graph saying
/// "DIALOGUE_NODE_KIND_CHOICE" fails to load. The numbers are stable on the
/// wire, so this is safe; it is only unpleasant to read.
const DIALOGUE_JSON: &str = include_str!("../data/dialogue.json");

/// The global dialogue database, loaded once from the embedded JSON.
static DIALOGUE_DB: LazyLock<DialogueDb> = LazyLock::new(|| {
    DialogueDb::from_json(DIALOGUE_JSON).expect("embedded dialogue.json must be valid")
});

/// The global proto NPC database, loaded once from the embedded JSON.
static NPC_DB: LazyLock<NpcDb> =
    LazyLock::new(|| NpcDb::from_json(NPCDB_JSON).expect("embedded npcdb.json must be valid"));

/// Embedded JSON snapshot of the map database (proto-canonical). Synced from
/// the astro-kbve `sync:mapdb` target.
const MAPDB_JSON: &str = include_str!("../data/mapdb.json");

/// The global proto map database, loaded once from the embedded JSON.
static MAP_DB: LazyLock<MapDb> =
    LazyLock::new(|| MapDb::from_json(MAPDB_JSON).expect("embedded mapdb.json must be valid"));

/// Buckets of `(ref, name)` pairs grouped by the `RoomType` they may decorate.
/// Built once from `MAP_DB` at first use; ordered by ref for determinism.
struct LandmarkBuckets {
    boss: Vec<(String, String)>,
    merchant: Vec<(String, String)>,
    rest: Vec<(String, String)>,
    story: Vec<(String, String)>,
    resource: Vec<(String, String)>,
    underground_city: Vec<(String, String)>,
}

static LANDMARK_BUCKETS: LazyLock<LandmarkBuckets> = LazyLock::new(|| {
    let mut boss = Vec::new();
    let mut merchant = Vec::new();
    let mut rest = Vec::new();
    let mut story = Vec::new();
    let mut resource = Vec::new();
    let mut underground_city = Vec::new();

    for (_id, def) in MAP_DB.object_defs() {
        if def.drafted.unwrap_or(false) {
            continue;
        }
        let kind = def.sub_kind.as_deref().unwrap_or("");
        let pair = || (def.r#ref.clone(), def.name.clone());
        match WorldObjectType::try_from(def.r#type).ok() {
            Some(WorldObjectType::Arena) => boss.push(pair()),
            Some(WorldObjectType::ResourceNode) => resource.push(pair()),
            // Trading posts are marked as NPC positions rather than buildings.
            Some(WorldObjectType::NpcMarker) => merchant.push(pair()),
            Some(WorldObjectType::Prop) => match kind {
                "shrine" => rest.push(pair()),
                _ => story.push(pair()),
            },
            Some(WorldObjectType::Settlement) => underground_city.push(pair()),
            Some(WorldObjectType::Building) => match kind {
                // Trade-flavored buildings → Merchant rooms
                "market" | "trade-house" | "merchants-guild" | "dusty-bazaar"
                | "mushroom-bazaar" | "sunken-market" | "wanderers-nook" => merchant.push(pair()),
                // Healing / sleep / restorative buildings → RestShrine rooms
                "inn" | "outpost" | "barracks" | "farm" => rest.push(pair()),
                // Story-flavored civic structures
                _ => story.push(pair()),
            },
            Some(WorldObjectType::Landmark) => {
                // Tranquil landmarks tend to feel like rest shrines; the rest is story.
                match kind {
                    "spring" | "pool" | "shrine" | "alcove" => rest.push(pair()),
                    _ => story.push(pair()),
                }
            }
            _ => {}
        }
    }

    let sort_pairs = |v: &mut Vec<(String, String)>| v.sort_by(|a, b| a.0.cmp(&b.0));
    sort_pairs(&mut boss);
    sort_pairs(&mut merchant);
    sort_pairs(&mut rest);
    sort_pairs(&mut story);
    sort_pairs(&mut resource);
    sort_pairs(&mut underground_city);

    LandmarkBuckets {
        boss,
        merchant,
        rest,
        story,
        resource,
        underground_city,
    }
});

/// Turn a node ref into something readable: `copper-vein` -> `Copper Vein`.
///
/// mapdb is the preferred source for these names, but its object defs do not
/// currently survive the JSON load (the snapshot writes `objectDefs` while the
/// proto struct expects `object_defs`), so a node would otherwise be shown to
/// the player as a raw slug.
fn node_ref_title(node_ref: &str) -> String {
    node_ref
        .split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Every workable node the dungeon knows about, joining professiondb's gather
/// actions to the mapdb object that represents them.
///
/// professiondb is the authority on what a node costs and pays; mapdb only
/// supplies the display name. A gather action with no `resourceNodeRef` (loose
/// pickups like branches and leaves) has nothing to stand in a room, so it is
/// skipped.
static GATHER_NODES: LazyLock<Vec<ResourceNode>> = LazyLock::new(|| {
    let Some(db) = crate::skills::professions() else {
        return Vec::new();
    };
    let mut nodes: Vec<ResourceNode> = db
        .gather_iter()
        .filter(|(_, info)| !info.resource_node_ref.is_empty())
        .map(|(item_ref, info)| {
            let name = MAP_DB
                .get_object_def_by_ref(&info.resource_node_ref)
                .map(|def| def.name.clone())
                .unwrap_or_else(|| node_ref_title(&info.resource_node_ref));
            ResourceNode {
                node_ref: info.resource_node_ref.clone(),
                item_ref: item_ref.to_owned(),
                name,
                skill_ref: info.skill_ref.clone(),
                required_level: info.required_level,
                xp_reward: info.xp_reward,
                remaining: 0,
            }
        })
        .collect();
    nodes.sort_by(|a, b| {
        a.required_level
            .cmp(&b.required_level)
            .then_with(|| a.node_ref.cmp(&b.node_ref))
    });
    nodes
});

/// Display name for any item in the database.
///
/// Raw materials carry no `discordsh` tag, so they never reach
/// [`item_registry`] and [`find_item`] cannot see them — but a player who
/// mined one still needs to read its name in their pack.
pub fn material_name(item_ref: &str) -> Option<&'static str> {
    ITEM_DB.get_by_ref(item_ref).map(|i| i.name.as_str())
}

/// Flavour text for any item in the database, materials included.
pub fn material_description(item_ref: &str) -> Option<&'static str> {
    ITEM_DB
        .get_by_ref(item_ref)
        .and_then(|i| i.description.as_deref())
}

/// All workable nodes, ordered easiest first.
pub fn gather_nodes() -> &'static [ResourceNode] {
    &GATHER_NODES
}

/// The nodes a player of this level could actually work, easiest first.
pub fn gather_nodes_up_to(level: u32) -> Vec<&'static ResourceNode> {
    GATHER_NODES
        .iter()
        .filter(|node| node.required_level <= level)
        .collect()
}

/// Probability of attaching a curated landmark to a tile of the given room
/// type. Combat/Trap/Hallway never get landmarks (no fitting catalog buckets).
fn landmark_attach_chance(room_type: &RoomType) -> f32 {
    match room_type {
        RoomType::Boss => 0.85,
        RoomType::UndergroundCity => 0.80,
        RoomType::Merchant => 0.60,
        RoomType::RestShrine => 0.50,
        RoomType::Resource => 0.95,
        RoomType::Story => 0.40,
        // Treasure draws nothing: the catalog has no chest-like objects, and
        // the resource nodes it used to borrow now belong to resource rooms.
        RoomType::Treasure | RoomType::Combat | RoomType::Trap | RoomType::Hallway => 0.0,
    }
}

/// Sample a curated mapdb landmark for the given room type. Returns
/// `(ref, display_name)` when the catalog has a fitting entry and the
/// attach roll succeeds, otherwise `None` so the caller falls back to
/// procedural naming.
pub fn pick_landmark_for_room_type<R: Rng + ?Sized>(
    room_type: &RoomType,
    rng: &mut R,
) -> Option<(String, String)> {
    let chance = landmark_attach_chance(room_type);
    if chance <= 0.0 || rng.random_range(0.0f32..1.0) >= chance {
        return None;
    }
    let bucket: &[(String, String)] = match room_type {
        RoomType::Boss => &LANDMARK_BUCKETS.boss,
        RoomType::Merchant => &LANDMARK_BUCKETS.merchant,
        RoomType::RestShrine => &LANDMARK_BUCKETS.rest,
        RoomType::Story => &LANDMARK_BUCKETS.story,
        RoomType::Resource => &LANDMARK_BUCKETS.resource,
        RoomType::UndergroundCity => &LANDMARK_BUCKETS.underground_city,
        RoomType::Treasure | RoomType::Combat | RoomType::Trap | RoomType::Hallway => {
            return None;
        }
    };
    if bucket.is_empty() {
        return None;
    }
    let idx = rng.random_range(0..bucket.len());
    Some(bucket[idx].clone())
}

/// Pick the curated settlement that names a session's origin hub.
///
/// Unlike [`pick_landmark_for_room_type`] this never rolls to skip: the hub
/// always carries a mapdb settlement so every run opens somewhere named. The
/// choice is keyed off the session seed alone, so the same session always
/// reopens in the same city.
pub fn pick_origin_settlement(seed: u64) -> Option<(String, String)> {
    let bucket = &LANDMARK_BUCKETS.underground_city;
    if bucket.is_empty() {
        return None;
    }
    let mix = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) >> 33;
    let idx = (mix as usize) % bucket.len();
    Some(bucket[idx].clone())
}

/// Look up a landmark's display name by ref. Used by `/dungeon route
/// landmark:<slug>` to surface the curated mapdb name in the result.
pub fn landmark_name(r#ref: &str) -> Option<&'static str> {
    MAP_DB
        .get_object_def_by_ref(r#ref)
        .map(|def| def.name.as_str())
}

/// Look up a landmark's description by ref.
pub fn landmark_description(r#ref: &str) -> Option<&'static str> {
    MAP_DB
        .get_object_def_by_ref(r#ref)
        .and_then(|def| def.description.as_deref())
}

/// All discordsh-tagged consumable items, converted from proto.
static ITEMS: LazyLock<Vec<ItemDef>> = LazyLock::new(|| {
    let db = &*ITEM_DB;
    let mut items = Vec::new();
    for (_id, proto) in db.iter() {
        if !proto.tags.iter().any(|t| t == "discordsh") {
            continue;
        }
        // Items with equipment info are gear, not consumables
        if proto.equipment.is_some() {
            continue;
        }
        if let Some(def) = proto_to_item_def(proto) {
            items.push(def);
        }
    }
    // Sort by slug for deterministic ordering
    items.sort_by(|a, b| a.id.cmp(b.id));
    items
});

/// All discordsh-tagged gear items, converted from proto.
static GEAR: LazyLock<Vec<GearDef>> = LazyLock::new(|| {
    let db = &*ITEM_DB;
    let mut gear = Vec::new();
    for (_id, proto) in db.iter() {
        if !proto.tags.iter().any(|t| t == "discordsh") {
            continue;
        }
        if proto.equipment.is_none() {
            continue;
        }
        if let Some(def) = proto_to_gear_def(proto) {
            gear.push(def);
        }
    }
    // Sort by slug for deterministic ordering
    gear.sort_by(|a, b| a.id.cmp(b.id));
    gear
});

// ── Public API (drop-in replacements for content.rs functions) ──────────

/// All consumable item definitions loaded from the proto item database.
pub fn item_registry() -> &'static [ItemDef] {
    &ITEMS
}

/// All gear definitions loaded from the proto item database.
pub fn gear_registry() -> &'static [GearDef] {
    &GEAR
}

/// Look up a consumable item by its slug ID.
/// Accepts both underscore (`smoke_bomb`) and hyphenated (`smoke-bomb`) formats.
pub fn find_item(id: &str) -> Option<&'static ItemDef> {
    ITEMS.iter().find(|item| item.id == id)
}

/// Look up a gear definition by its slug ID.
/// Accepts both underscore (`rusty_sword`) and hyphenated (`rusty-sword`) formats.
pub fn find_gear(id: &str) -> Option<&'static GearDef> {
    GEAR.iter().find(|g| g.id == id)
}

/// Check whether an item or gear ID has rarity >= Rare.
pub fn is_rare_or_above(id: &str) -> bool {
    if let Some(item) = find_item(id) {
        return item.rarity >= ItemRarity::Rare;
    }
    if let Some(gear) = find_gear(id) {
        return gear.rarity >= ItemRarity::Rare;
    }
    false
}

/// Access the underlying [`ItemDb`] for advanced queries.
#[allow(dead_code)]
pub fn item_db() -> &'static ItemDb {
    &ITEM_DB
}

/// Ensure the inventory adapter is initialized and return a reference to the db.
/// Call this before using any `ProtoItemKind` operations.
pub fn ensure_inventory_init() {
    LazyLock::force(&INVENTORY_INIT);
}

/// Convert a game ID (underscore format, e.g. `"smoke_bomb"`) to a [`ProtoItemKind`].
/// Returns `None` if the item isn't in the database.
pub fn game_id_to_proto_item_kind(game_id: &str) -> Option<ProtoItemKind> {
    ensure_inventory_init();
    let slug = game_id.replace('_', "-");
    let db = item_db();
    db.id_for_ref(&slug).map(ProtoItemKind::new)
}

/// Convert a [`ProtoItemKind`] back to a game ID (underscore format).
/// Returns `None` if the item isn't in the database.
pub fn proto_item_kind_to_game_id(kind: &ProtoItemKind) -> Option<&'static str> {
    let db = item_db();
    let item = db.get(kind.id)?;
    Some(slug_to_game_id(&item.r#ref))
}

/// Create a [`ProtoItemKind`] directly from a slug (hyphenated format).
#[allow(dead_code)]
pub fn proto_item_kind_from_slug(slug: &str) -> ProtoItemKind {
    ensure_inventory_init();
    ProtoItemKind::from_ref(slug)
}

// ── Conversion helpers ──────────────────────────────────────────────────

/// Leak a String to get a `&'static str`. Safe for long-lived statics.
fn leak(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

/// Convert a hyphenated slug to the underscore format used by the game code.
/// e.g. "smoke-bomb" → "smoke_bomb"
fn slug_to_game_id(slug: &str) -> &'static str {
    leak(slug.replace('-', "_"))
}

fn proto_rarity(rarity: i32) -> ItemRarity {
    match rarity {
        0 => ItemRarity::Common,
        1 => ItemRarity::Uncommon,
        2 => ItemRarity::Rare,
        3 => ItemRarity::Epic,
        4 | 5 => ItemRarity::Legendary,
        _ => ItemRarity::Common,
    }
}

fn proto_status_to_effect_kind(status: i32) -> Option<EffectKind> {
    match StatusEffectKind::try_from(status).ok()? {
        StatusEffectKind::StatusEffectPoison => Some(EffectKind::Poison),
        StatusEffectKind::StatusEffectBurning => Some(EffectKind::Burning),
        StatusEffectKind::StatusEffectBleed => Some(EffectKind::Bleed),
        StatusEffectKind::StatusEffectShielded => Some(EffectKind::Shielded),
        StatusEffectKind::StatusEffectWeakened => Some(EffectKind::Weakened),
        StatusEffectKind::StatusEffectStunned => Some(EffectKind::Stunned),
        StatusEffectKind::StatusEffectSharpened => Some(EffectKind::Sharpened),
        StatusEffectKind::StatusEffectThorns => Some(EffectKind::Thorns),
        _ => None,
    }
}

fn proto_use_effect(ue: &bevy_items::UseEffect) -> Option<UseEffect> {
    let typ = UseEffectType::try_from(ue.r#type).ok()?;
    match typ {
        UseEffectType::UseEffectHeal => Some(UseEffect::Heal {
            amount: ue.amount.unwrap_or(0),
        }),
        UseEffectType::UseEffectDamageEnemy => Some(UseEffect::DamageEnemy {
            amount: ue.amount.unwrap_or(0),
        }),
        UseEffectType::UseEffectApplyEffect => {
            let kind = proto_status_to_effect_kind(ue.status_effect.unwrap_or(0))?;
            Some(UseEffect::ApplyEffect {
                kind,
                stacks: ue.stacks.unwrap_or(1) as u8,
                turns: ue.turns.unwrap_or(1) as u8,
            })
        }
        UseEffectType::UseEffectRemoveEffect => {
            let kind = proto_status_to_effect_kind(ue.status_effect.unwrap_or(0))?;
            Some(UseEffect::RemoveEffect { kind })
        }
        UseEffectType::UseEffectGuaranteedFlee => Some(UseEffect::GuaranteedFlee),
        UseEffectType::UseEffectFullHeal => Some(UseEffect::FullHeal),
        UseEffectType::UseEffectRemoveAllNegative => Some(UseEffect::RemoveAllNegativeEffects),
        UseEffectType::UseEffectCampfireRest => Some(UseEffect::CampfireRest {
            heal_percent: ue.percent.unwrap_or(50) as u8,
        }),
        UseEffectType::UseEffectTeleportCity => Some(UseEffect::TeleportCity),
        UseEffectType::UseEffectDamageAndApply => {
            let kind = proto_status_to_effect_kind(ue.status_effect.unwrap_or(0))?;
            Some(UseEffect::DamageAndApply {
                damage: ue.amount.unwrap_or(0),
                kind,
                stacks: ue.stacks.unwrap_or(1) as u8,
                turns: ue.turns.unwrap_or(1) as u8,
            })
        }
        UseEffectType::UseEffectReviveAlly => Some(UseEffect::ReviveAlly {
            heal_percent: ue.percent.unwrap_or(30) as u8,
        }),
        _ => None,
    }
}

fn proto_to_item_def(proto: &bevy_items::Item) -> Option<ItemDef> {
    // Only include items that are consumable or have use effects
    if !proto.consumable.unwrap_or(false) && proto.use_effects.is_empty() {
        return None;
    }

    let use_effect = proto.use_effects.first().and_then(proto_use_effect);

    Some(ItemDef {
        id: slug_to_game_id(&proto.r#ref),
        name: leak(proto.name.clone()),
        emoji: leak(proto.emoji.clone().unwrap_or_default()),
        description: leak(proto.description.clone().unwrap_or_default()),
        max_stack: proto.max_stack.unwrap_or(1) as u16,
        rarity: proto_rarity(proto.rarity),
        use_effect,
    })
}

fn proto_to_gear_def(proto: &bevy_items::Item) -> Option<GearDef> {
    let equip = proto.equipment.as_ref()?;
    let bonuses = equip.bonuses.as_ref();

    let slot = match ProtoEquipSlot::try_from(equip.slot).ok()? {
        ProtoEquipSlot::MainHand | ProtoEquipSlot::TwoHand => EquipSlot::Weapon,
        _ => EquipSlot::Armor,
    };

    let special = equip.special.and_then(|s| {
        let special_value = equip.special_value.unwrap_or(0.0);
        match GearSpecialType::try_from(s).ok()? {
            GearSpecialType::GearSpecialLifeSteal => Some(GearSpecial::LifeSteal {
                percent: (special_value * 100.0) as u8,
            }),
            GearSpecialType::GearSpecialThorns => Some(GearSpecial::Thorns {
                damage: special_value as i32,
            }),
            GearSpecialType::GearSpecialCritBonus => Some(GearSpecial::CritBonus {
                percent: (special_value * 100.0) as u8,
            }),
            GearSpecialType::GearSpecialDamageReduction => Some(GearSpecial::DamageReduction {
                percent: (special_value * 100.0) as u8,
            }),
            _ => None,
        }
    });

    Some(GearDef {
        id: slug_to_game_id(&proto.r#ref),
        name: leak(proto.name.clone()),
        emoji: leak(proto.emoji.clone().unwrap_or_default()),
        slot,
        rarity: proto_rarity(proto.rarity),
        bonus_damage: bonuses.and_then(|b| b.attack).unwrap_or(0),
        bonus_armor: bonuses.and_then(|b| b.armor).unwrap_or(0),
        bonus_hp: bonuses.and_then(|b| b.health).unwrap_or(0),
        special,
    })
}

// ── NPC public API ─────────────────────────────────────────────────────

/// Access the underlying [`NpcDb`] for advanced queries.
pub fn npc_db() -> &'static NpcDb {
    &NPC_DB
}

/// Find NPCs at a given level. Returns refs into the global NPC database.
pub fn find_npcs_by_level(level: i32) -> Vec<&'static bevy_npc::Npc> {
    NPC_DB.find_by_level(level).collect()
}

/// Look up a single NPC by its ref slug (e.g. "glass-slime").
pub fn find_npc_by_ref(r: &str) -> Option<&'static bevy_npc::Npc> {
    NPC_DB.get_by_ref(r)
}

/// Convert a proto NPC into an [`EnemyState`] ready for combat.
///
/// Stats (HP, armor, personality, first_strike) come from the proto definition.
/// The initial intent is derived from proto abilities when available, with a
/// hardcoded fallback table for NPCs that haven't been migrated yet.
/// The loot table ID is kept for legacy compatibility; proto loot is resolved
/// at drop time via [`roll_npc_loot`].
pub fn proto_to_enemy_state(npc: &bevy_npc::Npc) -> EnemyState {
    let stats = npc.stats.as_ref();
    let behavior = npc.behavior.as_ref();

    let hp = stats.map(|s| s.hp).unwrap_or(20);
    let armor = stats.and_then(|s| s.armor).unwrap_or(0);
    let attack = stats.map(|s| s.attack).unwrap_or(5);
    let first_strike = behavior.and_then(|b| b.first_strike).unwrap_or(false);

    EnemyState {
        name: npc.name.clone(),
        level: npc.level as u8,
        hp,
        max_hp: hp,
        armor,
        effects: Vec::new(),
        intent: proto_initial_intent(npc, attack),
        charged: false,
        loot_table_id: loot_table_for_level(npc.level as u8),
        npc_ref: leak(npc.r#ref.clone()),
        enraged: false,
        index: 0,
        first_strike,
        personality: proto_personality(npc.personality),
    }
}

/// Map proto personality i32 to the game's Personality enum.
fn proto_personality(p: i32) -> Personality {
    match bevy_npc::Personality::try_from(p) {
        Ok(bevy_npc::Personality::Aggressive) => Personality::Aggressive,
        Ok(bevy_npc::Personality::Cunning) => Personality::Cunning,
        Ok(bevy_npc::Personality::Fearful) => Personality::Fearful,
        Ok(bevy_npc::Personality::Stoic) => Personality::Stoic,
        Ok(bevy_npc::Personality::Feral) => Personality::Feral,
        Ok(bevy_npc::Personality::Ancient) => Personality::Ancient,
        Ok(bevy_npc::Personality::Cheerful) => Personality::Cheerful,
        Ok(bevy_npc::Personality::Mysterious) => Personality::Mysterious,
        Ok(bevy_npc::Personality::Cowardly) => Personality::Cowardly,
        Ok(bevy_npc::Personality::Noble) => Personality::Noble,
        Ok(bevy_npc::Personality::Passive) => Personality::Passive,
        _ => Personality::Feral,
    }
}

/// Derive the loot table ID from enemy level tier (legacy fallback).
fn loot_table_for_level(level: u8) -> &'static str {
    match level {
        0..=1 => "slime",
        2 => "skeleton",
        3 => "wraith",
        _ => "boss",
    }
}

// ── Proto-driven loot rolling ─────────────────────────────────────────

/// Roll loot from an NPC's proto loot table. Returns a list of (game_id, qty) pairs.
/// If the NPC has no proto loot entries, returns an empty Vec (caller should
/// fall back to legacy `content::roll_loot`).
pub fn roll_npc_loot(npc_ref: &str) -> Vec<(&'static str, u32)> {
    use rand::RngExt;

    let npc = match find_npc_by_ref(npc_ref) {
        Some(n) => n,
        None => return Vec::new(),
    };
    let loot = match npc.loot.as_ref() {
        Some(l) if !l.entries.is_empty() => l,
        _ => return Vec::new(),
    };

    let max_drops = loot.max_drops.unwrap_or(2) as usize;
    let mut rng = rand::rng();
    let mut drops = Vec::new();

    for entry in &loot.entries {
        if entry.drop_rate <= 0.0 || entry.item_ref.is_empty() {
            continue;
        }
        if rng.random_range(0.0f32..1.0) >= entry.drop_rate {
            continue;
        }
        let qty = if entry.max_quantity > entry.min_quantity {
            rng.random_range(entry.min_quantity..=entry.max_quantity) as u32
        } else {
            entry.min_quantity.max(1) as u32
        };
        // Convert slug (hyphenated) to game_id (underscored)
        let game_id = slug_to_game_id(&entry.item_ref);
        drops.push((game_id, qty));
        if drops.len() >= max_drops {
            break;
        }
    }
    drops
}

/// Roll gold from an NPC's proto loot table. Returns 0 if no proto gold defined.
pub fn roll_npc_gold(npc_ref: &str) -> i32 {
    use rand::RngExt;

    let npc = match find_npc_by_ref(npc_ref) {
        Some(n) => n,
        None => return 0,
    };
    let loot = match npc.loot.as_ref() {
        Some(l) => l,
        None => return 0,
    };
    let gold_min = loot.gold_min.unwrap_or(0);
    let gold_max = loot.gold_max.unwrap_or(0);
    if gold_max <= 0 {
        return 0;
    }
    if gold_max <= gold_min {
        return gold_min;
    }
    rand::rng().random_range(gold_min..=gold_max)
}

/// Get XP reward from proto loot table. Returns 0 if not defined.
pub fn npc_xp_reward(npc_ref: &str) -> i32 {
    find_npc_by_ref(npc_ref)
        .and_then(|n| n.loot.as_ref())
        .and_then(|l| l.xp_reward)
        .unwrap_or(0)
}

// ── Proto-driven conversation graphs ──────────────────────────────────

/// Access the underlying [`DialogueDb`].
pub fn dialogue_db() -> &'static DialogueDb {
    &DIALOGUE_DB
}

/// The conversation graph an NPC speaks, if it has one.
///
/// Resolved two ways, in order. An NPC that names graphs in
/// `dialogue_graph_refs` gets the first of those that exists -- that is the
/// schema's own mechanism, and the one that lets several NPCs share a
/// conversation. Failing that, a graph whose ref equals the NPC's ref is
/// treated as belonging to it.
///
/// The convention exists because npcdb.json is generated: an author who wants
/// to give an existing NPC something to say cannot add a field to a file that
/// is about to be overwritten, but they can write a graph named after it.
pub fn get_npc_dialogue_graph(npc_ref: &str) -> Option<&'static DialogueGraph> {
    let npc = find_npc_by_ref(npc_ref)?;
    npc.dialogue_graph_refs
        .iter()
        .filter_map(|id| bevy_dialogue::ulid_text(Some(id)))
        .find_map(|ulid| DIALOGUE_DB.get_by_ulid(&ulid))
        .or_else(|| DIALOGUE_DB.get(npc_ref))
}

/// Find a node within a graph.
pub fn get_dialogue_node<'a>(
    graph: &'a DialogueGraph,
    node_id: &str,
) -> Option<&'a bevy_dialogue::DialogueNode> {
    bevy_dialogue::node(graph, node_id)
}

/// Whether an NPC has a conversation at all.
///
/// Distinct from having nothing to say right now: a graph decides for itself
/// which of its entry points applies, and none of them may.
pub fn npc_has_dialogue(npc_ref: &str) -> bool {
    get_npc_dialogue_graph(npc_ref).is_some()
}

// ── Proto-driven faction reputation ───────────────────────────────────

/// Faction reputation tier thresholds.
pub const FACTION_HOSTILE: i32 = -50;
pub const FACTION_UNFRIENDLY: i32 = 0;
pub const FACTION_FRIENDLY: i32 = 50;
pub const FACTION_HONORED: i32 = 100;

/// Get the faction ID for an NPC (if assigned). Returns None if no faction.
pub fn npc_faction(npc_ref: &str) -> Option<&'static str> {
    let npc = find_npc_by_ref(npc_ref)?;
    let faction = npc.faction.as_ref()?;
    if faction.faction_id.is_empty() {
        return None;
    }
    Some(leak(faction.faction_id.clone()))
}

/// Get the merchant price modifier based on faction standing.
/// Returns a multiplier: 0.9 = 10% discount, 1.1 = 10% markup.
pub fn faction_price_modifier(standing: i32) -> f32 {
    if standing >= FACTION_HONORED {
        0.85 // 15% discount
    } else if standing >= FACTION_FRIENDLY {
        0.90 // 10% discount
    } else if standing < FACTION_HOSTILE {
        1.15 // 15% markup
    } else if standing < FACTION_UNFRIENDLY {
        1.10 // 10% markup
    } else {
        1.0 // neutral
    }
}

/// Get faction reputation tier label.
pub fn faction_tier_label(standing: i32) -> &'static str {
    if standing >= FACTION_HONORED {
        "Honored"
    } else if standing >= FACTION_FRIENDLY {
        "Friendly"
    } else if standing >= FACTION_UNFRIENDLY {
        "Neutral"
    } else if standing >= FACTION_HOSTILE {
        "Unfriendly"
    } else {
        "Hostile"
    }
}

// ── Proto-driven crafting recipes ─────────────────────────────────────

/// A resolved crafting recipe ready for display and execution.
#[derive(Debug, Clone)]
pub struct ResolvedRecipe {
    /// Output item ref slug (e.g. "health-potion").
    pub output_ref: &'static str,
    /// Output display name.
    pub output_name: &'static str,
    /// Output quantity per craft.
    pub output_qty: u32,
    /// Ingredients: (game_id, display_name, required_amount).
    pub ingredients: Vec<(&'static str, &'static str, u32)>,
    /// Skill required (optional).
    pub skill_name: Option<&'static str>,
    /// Minimum skill level required.
    pub skill_level: u32,
    /// XP granted on craft.
    pub xp_reward: u32,
}

/// Find all craftable recipes for items tagged "discordsh".
/// Filters by player inventory (has all ingredients) and skill level.
/// Recipes the player could make right now: they hold every ingredient and
/// meet the skill requirement.
pub fn available_recipes(
    inventory: &super::types::GameInventory,
    skills: &bevy_skills::SkillProfile,
) -> Vec<ResolvedRecipe> {
    let db = item_db();
    let mut recipes = Vec::new();

    for (_id, item) in db.iter() {
        if !item.tags.iter().any(|t| t == "discordsh") {
            continue;
        }
        for recipe in &item.recipes {
            if recipe.ingredients.is_empty() {
                continue;
            }

            // Check if player has all ingredients
            let mut can_craft = true;
            let mut resolved_ingredients = Vec::new();
            for ing in &recipe.ingredients {
                let game_id = leak(ing.item_ref.replace('-', "_"));
                let name = ing
                    .name
                    .as_deref()
                    .map(|n| leak(n.to_owned()))
                    .unwrap_or(game_id);
                let required = ing.amount.max(1) as u32;
                let have = super::types::inv_count(inventory, game_id);
                if have < required {
                    can_craft = false;
                }
                resolved_ingredients.push((game_id, name, required));
            }

            if !can_craft {
                continue;
            }

            let output_ref = slug_to_game_id(&item.r#ref);
            let output_name = leak(item.name.clone());
            let output_qty = recipe.output_quantity.unwrap_or(1).max(1) as u32;
            let xp_reward = recipe.xp_reward.unwrap_or(0.0) as u32;

            let skill_name: Option<&'static str> = recipe.skill.as_deref().and_then(|s| match s {
                "cooking" => Some("Cooking"),
                "smithing" => Some("Smithing"),
                "crafting" => Some("Crafting"),
                "alchemy" => Some("Alchemy"),
                "woodcutting" => Some("Woodcutting"),
                "mining" => Some("Mining"),
                "foraging" => Some("Foraging"),
                "fletching" => Some("Fletching"),
                _ => None,
            });
            let skill_level = recipe.skill_level.unwrap_or(0) as u32;

            // A recipe the player is not trained for is not available; listing
            // it would only earn a refusal from execute_craft.
            if let Some(skill) = recipe.skill.as_deref()
                && skill_level > ENTRY_TIER
                && skills.level(bevy_skills::SkillId::from_ref(skill)) < skill_level
            {
                continue;
            }

            recipes.push(ResolvedRecipe {
                output_ref,
                output_name,
                output_qty,
                ingredients: resolved_ingredients,
                skill_name,
                skill_level,
                xp_reward,
            });
        }
    }
    // The registry iterates a hash map, so without this the list reorders
    // between renders — and a front end that keys by position would craft
    // something other than the row the player pressed.
    recipes.sort_by(|a, b| a.output_name.cmp(b.output_name));
    recipes
}

/// Execute a craft: consume ingredients, return the output item ref + qty.
/// Returns Err if the recipe isn't found or ingredients are missing.
/// The highest requirement an untrained player can still meet.
///
/// Every recipe in the catalog asks for at least level 1 while a fresh
/// `SkillProfile` reads 0, and no skill here earns XP from anything but
/// crafting — so enforcing level 1 literally would lock the whole ladder shut.
/// Level 1 is the entry tier; level 5 and up is where training starts to
/// matter. Gathering is unaffected: its entry nodes genuinely ask for 0.
const ENTRY_TIER: u32 = 1;

/// What a successful craft produced.
#[derive(Debug, Clone)]
pub struct CraftOutcome {
    pub output_name: &'static str,
    pub output_qty: u32,
    pub xp: u32,
    /// The skill the recipe trains, e.g. `smithing`. `None` when the recipe
    /// names no skill.
    pub skill_ref: Option<&'static str>,
}

/// Why a craft was refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CraftError {
    UnknownItem(String),
    NoRecipe(String),
    SkillTooLow {
        skill: &'static str,
        required: u32,
        current: u32,
    },
    MissingIngredient {
        item_ref: String,
        required: u32,
        have: u32,
    },
}

impl std::fmt::Display for CraftError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CraftError::UnknownItem(id) => write!(f, "Item '{id}' not found"),
            CraftError::NoRecipe(id) => write!(f, "No recipe for '{id}'"),
            CraftError::SkillTooLow {
                skill,
                required,
                current,
            } => write!(f, "Needs {skill} level {required}. Yours is {current}."),
            CraftError::MissingIngredient {
                item_ref,
                required,
                have,
            } => write!(f, "Missing ingredient: {item_ref} ({have}/{required})"),
        }
    }
}

/// Craft an item, consuming its ingredients.
///
/// Every ingredient is checked before any is taken. Consuming as it went meant
/// a craft that failed on the last ingredient still ate the earlier ones.
pub fn execute_craft(
    inventory: &mut super::types::GameInventory,
    skills: &bevy_skills::SkillProfile,
    output_game_id: &str,
) -> Result<CraftOutcome, CraftError> {
    let db = item_db();
    let slug = output_game_id.replace('_', "-");
    let item = db
        .get_by_ref(&slug)
        .ok_or_else(|| CraftError::UnknownItem(output_game_id.to_owned()))?;
    let recipe = item
        .recipes
        .first()
        .ok_or_else(|| CraftError::NoRecipe(output_game_id.to_owned()))?;

    let skill_ref = recipe.skill.as_deref().map(|s| leak(s.to_owned()));
    if let Some(skill) = skill_ref {
        let required = recipe.skill_level.unwrap_or(0) as u32;
        let current = skills.level(bevy_skills::SkillId::from_ref(skill));
        if required > ENTRY_TIER && current < required {
            return Err(CraftError::SkillTooLow {
                skill,
                required,
                current,
            });
        }
    }

    // Check everything first, then take it.
    let mut to_consume: Vec<(&'static str, u32)> = Vec::new();
    for ing in &recipe.ingredients {
        let game_id = leak(ing.item_ref.replace('-', "_"));
        let required = ing.amount.max(1) as u32;
        let have = super::types::inv_count(inventory, game_id);
        if have < required {
            return Err(CraftError::MissingIngredient {
                item_ref: ing.item_ref.clone(),
                required,
                have,
            });
        }
        if ing.consumed.unwrap_or(true) {
            to_consume.push((game_id, required));
        }
    }
    for (game_id, required) in to_consume {
        super::types::inv_remove_qty(inventory, game_id, required);
    }

    let output_ref = slug_to_game_id(&item.r#ref);
    let output_name = leak(item.name.clone());
    let output_qty = recipe.output_quantity.unwrap_or(1).max(1) as u32;
    super::types::inv_add_qty(inventory, output_ref, output_qty);

    Ok(CraftOutcome {
        output_name,
        output_qty,
        xp: recipe.xp_reward.unwrap_or(0.0) as u32,
        skill_ref,
    })
}

// ── Proto-driven initial intent ───────────────────────────────────────

/// Derive the NPC's initial combat intent. Reads from proto abilities first;
/// falls back to the hardcoded table for NPCs that haven't been migrated yet.
fn proto_initial_intent(npc: &bevy_npc::Npc, attack: i32) -> Intent {
    // Try proto abilities: use the first ability (highest priority opener).
    if let Some(ability) = npc.abilities.first()
        && let Some(intent) = ability_to_intent(ability, attack)
    {
        return intent;
    }
    // Fallback: hardcoded table keyed by NPC ref slug.
    legacy_initial_intent(&npc.r#ref, attack)
}

/// Convert a proto NpcAbility to a game Intent.
fn ability_to_intent(ability: &bevy_npc::NpcAbility, fallback_dmg: i32) -> Option<Intent> {
    let id = ability.id.as_str();
    match id {
        "attack" | "bite" | "slash" | "claw" | "smash" | "sting" | "shoot" => {
            Some(Intent::Attack {
                dmg: ability.damage.unwrap_or(fallback_dmg),
            })
        }
        "heavy-attack" | "heavy_attack" | "crush" | "slam" => Some(Intent::HeavyAttack {
            dmg: ability.damage.unwrap_or(fallback_dmg),
        }),
        "defend" | "shield" | "harden" => Some(Intent::Defend {
            armor: ability.damage.unwrap_or(3),
        }),
        "charge" => Some(Intent::Charge),
        "aoe-attack" | "aoe_attack" | "cleave" | "shockwave" => Some(Intent::AoeAttack {
            dmg: ability.damage.unwrap_or(fallback_dmg),
        }),
        "heal" | "heal-self" | "heal_self" | "regenerate" => Some(Intent::HealSelf {
            amount: ability.heal_amount.unwrap_or(ability.damage.unwrap_or(10)),
        }),
        "poison" | "venom" | "toxic" => Some(Intent::Debuff {
            effect: EffectKind::Poison,
            stacks: 1,
            turns: ability.cooldown_turns.unwrap_or(2) as u8,
        }),
        "burn" | "fire" | "ignite" => Some(Intent::Debuff {
            effect: EffectKind::Burning,
            stacks: 1,
            turns: ability.cooldown_turns.unwrap_or(3) as u8,
        }),
        "stun" | "daze" | "paralyze" => Some(Intent::Debuff {
            effect: EffectKind::Stunned,
            stacks: 1,
            turns: 1,
        }),
        "weaken" | "curse" => Some(Intent::Debuff {
            effect: EffectKind::Weakened,
            stacks: 1,
            turns: ability.cooldown_turns.unwrap_or(2) as u8,
        }),
        "flee" | "escape" => Some(Intent::Flee),
        _ => None,
    }
}

/// Hardcoded initial intents — legacy fallback for NPCs without proto abilities.
fn legacy_initial_intent(npc_ref: &str, attack: i32) -> Intent {
    match npc_ref {
        "glass-slime" => Intent::Attack { dmg: 5 },
        "crystal-bat" => Intent::Attack { dmg: 4 },
        "mushroom-sprite" => Intent::Attack { dmg: 4 },
        "dust-mite" => Intent::Attack { dmg: 6 },
        "cave-spider" => Intent::Debuff {
            effect: EffectKind::Poison,
            stacks: 1,
            turns: 2,
        },
        "crumbling-statue" => Intent::Defend { armor: 3 },
        "skeleton-guard" => Intent::Defend { armor: 5 },
        "bone-archer" => Intent::Attack { dmg: 7 },
        "cursed-knight" => Intent::Defend { armor: 5 },
        "fire-imp" => Intent::Attack { dmg: 8 },
        "shade-stalker" => Intent::Attack { dmg: 8 },
        "fungal-brute" => Intent::HeavyAttack { dmg: 10 },
        "ember-wisp" => Intent::Debuff {
            effect: EffectKind::Burning,
            stacks: 1,
            turns: 3,
        },
        "shadow-wraith" => Intent::HeavyAttack { dmg: 12 },
        "phantom-knight" => Intent::Charge,
        "void-walker" => Intent::HeavyAttack { dmg: 10 },
        "stone-sentinel" => Intent::Attack { dmg: 6 },
        "glass-assassin" => Intent::Attack { dmg: 10 },
        "venomfang-lurker" => Intent::Debuff {
            effect: EffectKind::Poison,
            stacks: 2,
            turns: 3,
        },
        "crystal-golem" => Intent::Charge,
        "glass-golem" => Intent::Charge,
        "corrupted-warden" => Intent::Charge,
        "the-shattered-king" => Intent::AoeAttack { dmg: 8 },
        _ => Intent::Attack { dmg: attack },
    }
}

// ── Quest public API ──────────────────────────────────────────────────

/// Embedded JSON snapshot of the quest database.
const QUESTDB_JSON: &str = include_str!("../data/questdb.json");

/// The global proto quest database, loaded once from the embedded JSON.
static QUEST_DB: LazyLock<QuestDb> = LazyLock::new(|| {
    QuestDb::from_json(QUESTDB_JSON).expect("embedded questdb.json must be valid")
});

/// Access the underlying [`QuestDb`] for advanced queries.
pub fn quest_db() -> &'static QuestDb {
    &QUEST_DB
}

/// Find a quest by its ref slug (e.g. "slime-slayer").
pub fn find_quest_by_ref(r: &str) -> Option<&'static bevy_quests::Quest> {
    QUEST_DB.get_by_ref(r)
}

/// Find all quests tagged with "discordsh".
pub fn discordsh_quests() -> Vec<&'static bevy_quests::Quest> {
    QUEST_DB.find_by_tag("discordsh")
}

/// Find quests available to a player at a given level.
pub fn quests_for_level(level: i32) -> Vec<&'static bevy_quests::Quest> {
    QUEST_DB
        .find_by_tag("discordsh")
        .into_iter()
        .filter(|q| q.recommended_level.unwrap_or(1) <= level)
        .collect()
}

/// Build an [`ActiveQuest`] from a proto quest definition.
///
/// Initializes all step and objective progress to zero.
pub fn build_active_quest(quest: &bevy_quests::Quest) -> ActiveQuest {
    let steps = quest
        .steps
        .iter()
        .map(|step| StepProgress {
            step_id: step.id.clone(),
            objectives: step
                .objectives
                .iter()
                .map(|obj| ObjectiveProgress {
                    objective_id: obj.id.clone(),
                    current: 0,
                    required: obj.required_amount,
                })
                .collect(),
        })
        .collect();

    ActiveQuest {
        quest_ref: quest.r#ref.clone(),
        current_step: 0,
        steps,
    }
}

/// Check if a player meets the prerequisites for a quest.
pub fn meets_prerequisites(
    quest: &bevy_quests::Quest,
    player_level: u8,
    journal: &QuestJournal,
) -> bool {
    if let Some(prereq) = &quest.prerequisites {
        if let Some(req_level) = prereq.level_requirement
            && (player_level as i32) < req_level
        {
            return false;
        }
        for req_ref in &prereq.quest_refs {
            if !journal.is_completed(req_ref) {
                return false;
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The embedded registries are snapshots of the astro `*.json.ts` endpoints.
    /// Those endpoints convert string enums to the integers prost expects using a
    /// hand-maintained `ENUM_FIELDS` whitelist, so a newly added enum field silently
    /// ships as a string and only surfaces here. Parse each registry directly: the
    /// `LazyLock` accessors poison on first failure and report that instead of the
    /// real serde error.
    #[test]
    fn embedded_registries_parse() {
        NpcDb::from_json(NPCDB_JSON).unwrap_or_else(|e| {
            panic!(
                "npcdb.json failed to parse: {e}\n\
                 A string where an integer is expected means the field is missing from \
                 ENUM_FIELDS in apps/kbve/astro-kbve/src/pages/api/npcdb.json.ts."
            )
        });
        ItemDb::from_json(ITEMDB_JSON).expect("itemdb.json must parse");
        MapDb::from_json(MAPDB_JSON).expect("mapdb.json must parse");
    }

    #[test]
    fn item_db_loads_successfully() {
        let db = item_db();
        assert!(!db.is_empty(), "ItemDb should have items");
    }

    #[test]
    fn item_registry_has_discordsh_consumables() {
        let items = item_registry();
        assert!(!items.is_empty(), "Should have discordsh consumable items");
        // Potion should be present
        assert!(
            items.iter().any(|i| i.id == "potion"),
            "Potion should be in item registry"
        );
    }

    #[test]
    fn gear_registry_has_discordsh_gear() {
        let gear = gear_registry();
        assert!(!gear.is_empty(), "Should have discordsh gear items");
        // Excalibur should be present
        assert!(
            gear.iter().any(|g| g.id == "excalibur"),
            "Excalibur should be in gear registry"
        );
    }

    #[test]
    fn find_item_by_game_id() {
        let item = find_item("smoke_bomb");
        assert!(item.is_some(), "Should find smoke_bomb");
        assert_eq!(item.unwrap().name, "Smoke Bomb");
    }

    #[test]
    fn find_gear_by_game_id() {
        let gear = find_gear("rusty_sword");
        assert!(gear.is_some(), "Should find rusty_sword");
        assert_eq!(gear.unwrap().name, "Rusty Sword");
    }

    #[test]
    fn potion_has_correct_use_effect() {
        let potion = find_item("potion").expect("potion should exist");
        match &potion.use_effect {
            Some(UseEffect::Heal { amount }) => assert_eq!(*amount, 15),
            other => panic!("Expected Heal(15), got {:?}", other),
        }
        assert_eq!(potion.max_stack, 5);
        assert_eq!(potion.rarity, ItemRarity::Common);
    }

    #[test]
    fn excalibur_has_correct_stats() {
        let gear = find_gear("excalibur").expect("excalibur should exist");
        assert_eq!(gear.slot, EquipSlot::Weapon);
        assert_eq!(gear.rarity, ItemRarity::Legendary);
        assert_eq!(gear.bonus_damage, 6);
        assert_eq!(gear.bonus_hp, 5);
    }

    #[test]
    fn vampiric_blade_has_lifesteal() {
        let gear = find_gear("vampiric_blade").expect("vampiric blade should exist");
        match &gear.special {
            Some(GearSpecial::LifeSteal { percent }) => assert_eq!(*percent, 20),
            other => panic!("Expected LifeSteal(20), got {:?}", other),
        }
    }

    #[test]
    fn fire_flask_has_damage_and_apply() {
        let item = find_item("fire_flask").expect("fire flask should exist");
        match &item.use_effect {
            Some(UseEffect::DamageAndApply {
                damage,
                kind,
                stacks,
                turns,
            }) => {
                assert_eq!(*damage, 8);
                assert_eq!(*kind, EffectKind::Burning);
                assert_eq!(*stacks, 2);
                assert_eq!(*turns, 3);
            }
            other => panic!("Expected DamageAndApply, got {:?}", other),
        }
    }

    #[test]
    fn item_and_gear_counts_match_legacy() {
        // Legacy had 17 consumables and 15 gear
        assert_eq!(item_registry().len(), 17, "Should have 17 consumables");
        assert_eq!(gear_registry().len(), 15, "Should have 15 gear items");
    }

    #[test]
    fn is_rare_or_above_works() {
        assert!(is_rare_or_above("excalibur"));
        assert!(is_rare_or_above("smoke_bomb"));
        assert!(!is_rare_or_above("potion"));
        assert!(!is_rare_or_above("nonexistent"));
    }

    // ── Inventory adapter tests ──────────────────────────────────────────

    #[test]
    fn game_id_to_proto_item_kind_roundtrip() {
        let kind = game_id_to_proto_item_kind("smoke_bomb").expect("smoke_bomb should resolve");
        let back = proto_item_kind_to_game_id(&kind).expect("should convert back");
        assert_eq!(back, "smoke_bomb");
    }

    #[test]
    fn proto_item_kind_display_name() {
        use bevy_inventory::ItemKind;
        let kind = game_id_to_proto_item_kind("potion").expect("potion should resolve");
        assert_eq!(kind.display_name(), "Potion");
    }

    #[test]
    fn proto_item_kind_max_stack() {
        use bevy_inventory::ItemKind;
        let kind = game_id_to_proto_item_kind("potion").expect("potion should resolve");
        assert_eq!(kind.max_stack(), 5);
    }

    #[test]
    fn proto_item_kind_nonexistent_returns_none() {
        assert!(game_id_to_proto_item_kind("nonexistent_item_xyz").is_none());
    }

    #[test]
    fn proto_item_kind_gear_works() {
        use bevy_inventory::ItemKind;
        let kind = game_id_to_proto_item_kind("excalibur").expect("excalibur should resolve");
        assert_eq!(kind.display_name(), "Excalibur");
        assert_eq!(kind.max_stack(), 1); // gear doesn't stack
    }

    // ── NPC bridge tests ─────────────────────────────────────────────────

    #[test]
    fn npc_db_loads_successfully() {
        let db = npc_db();
        assert!(!db.is_empty(), "NpcDb should have NPCs");
    }

    #[test]
    fn npc_db_has_26_npcs() {
        assert_eq!(npc_db().len(), 26, "Should have 26 NPCs");
    }

    #[test]
    fn find_npc_glass_slime() {
        let npc = find_npc_by_ref("glass-slime").expect("glass-slime should exist");
        assert_eq!(npc.name, "Glass Slime");
        assert_eq!(npc.level, 1);
        let stats = npc.stats.as_ref().expect("should have stats");
        assert_eq!(stats.hp, 20);
        assert_eq!(stats.armor, Some(0));
    }

    #[test]
    fn find_npcs_by_level_1() {
        let npcs = find_npcs_by_level(1);
        assert_eq!(npcs.len(), 9, "Should have 9 level-1 NPCs");
    }

    #[test]
    fn find_npcs_by_level_2() {
        let npcs = find_npcs_by_level(2);
        assert_eq!(npcs.len(), 7, "Should have 7 level-2 NPCs");
    }

    #[test]
    fn find_npcs_by_level_3() {
        let npcs = find_npcs_by_level(3);
        assert_eq!(npcs.len(), 7, "Should have 7 level-3 NPCs");
    }

    #[test]
    fn find_npcs_by_level_5() {
        let npcs = find_npcs_by_level(5);
        assert_eq!(npcs.len(), 3, "Should have 3 level-5 boss NPCs");
    }

    #[test]
    fn proto_to_enemy_state_glass_slime() {
        let npc = find_npc_by_ref("glass-slime").expect("glass-slime should exist");
        let enemy = proto_to_enemy_state(npc);
        assert_eq!(enemy.name, "Glass Slime");
        assert_eq!(enemy.level, 1);
        assert_eq!(enemy.hp, 20);
        assert_eq!(enemy.max_hp, 20);
        assert_eq!(enemy.armor, 0);
        assert!(!enemy.first_strike);
        assert_eq!(enemy.personality, Personality::Feral);
        assert_eq!(enemy.loot_table_id, "slime");
        assert!(matches!(enemy.intent, Intent::Attack { dmg: 5 }));
    }

    #[test]
    fn proto_to_enemy_state_cave_spider() {
        let npc = find_npc_by_ref("cave-spider").expect("cave-spider should exist");
        let enemy = proto_to_enemy_state(npc);
        assert!(enemy.first_strike);
        assert_eq!(enemy.personality, Personality::Feral);
        assert!(matches!(
            enemy.intent,
            Intent::Debuff {
                effect: EffectKind::Poison,
                stacks: 1,
                turns: 2,
            }
        ));
    }

    #[test]
    fn proto_to_enemy_state_skeleton_guard() {
        let npc = find_npc_by_ref("skeleton-guard").expect("skeleton-guard should exist");
        let enemy = proto_to_enemy_state(npc);
        assert_eq!(enemy.level, 2);
        assert_eq!(enemy.hp, 30);
        assert_eq!(enemy.armor, 3);
        assert_eq!(enemy.personality, Personality::Stoic);
        assert_eq!(enemy.loot_table_id, "skeleton");
    }

    #[test]
    fn proto_to_enemy_state_the_shattered_king() {
        let npc = find_npc_by_ref("the-shattered-king").expect("shattered king should exist");
        let enemy = proto_to_enemy_state(npc);
        assert_eq!(enemy.level, 5);
        assert_eq!(enemy.hp, 55);
        assert!(enemy.first_strike);
        assert_eq!(enemy.personality, Personality::Ancient);
        assert_eq!(enemy.loot_table_id, "boss");
        assert!(matches!(enemy.intent, Intent::AoeAttack { dmg: 8 }));
    }

    #[test]
    fn all_npcs_convert_to_enemy_state() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert!(!enemy.name.is_empty());
            assert!(enemy.level > 0);
            assert!(enemy.hp > 0);
        }
    }

    // ── Per-NPC stat verification (level 1) ──────────────────────────────

    #[test]
    fn npc_crystal_bat_stats() {
        let npc = find_npc_by_ref("crystal-bat").expect("crystal-bat");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 15);
        assert_eq!(e.armor, 0);
        assert_eq!(e.level, 1);
        assert!(!e.first_strike);
        assert_eq!(e.personality, Personality::Feral);
        assert!(matches!(e.intent, Intent::Attack { dmg: 4 }));
    }

    #[test]
    fn npc_mushroom_sprite_stats() {
        let npc = find_npc_by_ref("mushroom-sprite").expect("mushroom-sprite");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 18);
        assert_eq!(e.level, 1);
        assert_eq!(e.loot_table_id, "slime");
    }

    #[test]
    fn npc_dust_mite_stats() {
        let npc = find_npc_by_ref("dust-mite").expect("dust-mite");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 12);
        assert!(matches!(e.intent, Intent::Attack { dmg: 6 }));
    }

    #[test]
    fn npc_crumbling_statue_stats() {
        let npc = find_npc_by_ref("crumbling-statue").expect("crumbling-statue");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 22);
        assert_eq!(e.armor, 2);
        assert_eq!(e.personality, Personality::Stoic);
        assert!(matches!(e.intent, Intent::Defend { armor: 3 }));
    }

    // ── Per-NPC stat verification (level 2) ──────────────────────────────

    #[test]
    fn npc_bone_archer_stats() {
        let npc = find_npc_by_ref("bone-archer").expect("bone-archer");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 22);
        assert_eq!(e.armor, 1);
        assert_eq!(e.level, 2);
        assert_eq!(e.personality, Personality::Fearful);
        assert!(matches!(e.intent, Intent::Attack { dmg: 7 }));
    }

    #[test]
    fn npc_cursed_knight_stats() {
        let npc = find_npc_by_ref("cursed-knight").expect("cursed-knight");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 35);
        assert_eq!(e.armor, 5);
        assert_eq!(e.personality, Personality::Aggressive);
        assert!(matches!(e.intent, Intent::Defend { armor: 5 }));
    }

    #[test]
    fn npc_fire_imp_stats() {
        let npc = find_npc_by_ref("fire-imp").expect("fire-imp");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 18);
        assert_eq!(e.level, 2);
        assert_eq!(e.personality, Personality::Fearful);
        assert!(matches!(e.intent, Intent::Attack { dmg: 8 }));
    }

    #[test]
    fn npc_shade_stalker_stats() {
        let npc = find_npc_by_ref("shade-stalker").expect("shade-stalker");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 20);
        assert!(e.first_strike);
        assert_eq!(e.personality, Personality::Cunning);
        assert!(matches!(e.intent, Intent::Attack { dmg: 8 }));
    }

    #[test]
    fn npc_fungal_brute_stats() {
        let npc = find_npc_by_ref("fungal-brute").expect("fungal-brute");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 38);
        assert_eq!(e.armor, 2);
        assert!(matches!(e.intent, Intent::HeavyAttack { dmg: 10 }));
    }

    #[test]
    fn npc_ember_wisp_stats() {
        let npc = find_npc_by_ref("ember-wisp").expect("ember-wisp");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 16);
        assert_eq!(e.personality, Personality::Fearful);
        assert!(matches!(
            e.intent,
            Intent::Debuff {
                effect: EffectKind::Burning,
                stacks: 1,
                turns: 3,
            }
        ));
    }

    // ── Per-NPC stat verification (level 3) ──────────────────────────────

    #[test]
    fn npc_shadow_wraith_stats() {
        let npc = find_npc_by_ref("shadow-wraith").expect("shadow-wraith");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 25);
        assert_eq!(e.armor, 2);
        assert_eq!(e.level, 3);
        assert_eq!(e.personality, Personality::Cunning);
        assert!(matches!(e.intent, Intent::HeavyAttack { dmg: 12 }));
    }

    #[test]
    fn npc_phantom_knight_stats() {
        let npc = find_npc_by_ref("phantom-knight").expect("phantom-knight");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 28);
        assert_eq!(e.armor, 4);
        assert_eq!(e.personality, Personality::Aggressive);
        assert!(matches!(e.intent, Intent::Charge));
    }

    #[test]
    fn npc_void_walker_stats() {
        let npc = find_npc_by_ref("void-walker").expect("void-walker");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 30);
        assert_eq!(e.armor, 3);
        assert_eq!(e.personality, Personality::Cunning);
        assert!(matches!(e.intent, Intent::HeavyAttack { dmg: 10 }));
    }

    #[test]
    fn npc_stone_sentinel_stats() {
        let npc = find_npc_by_ref("stone-sentinel").expect("stone-sentinel");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 40);
        assert_eq!(e.armor, 6);
        assert_eq!(e.personality, Personality::Stoic);
        assert!(matches!(e.intent, Intent::Attack { dmg: 6 }));
    }

    #[test]
    fn npc_glass_assassin_stats() {
        let npc = find_npc_by_ref("glass-assassin").expect("glass-assassin");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 22);
        assert!(e.first_strike);
        assert_eq!(e.personality, Personality::Cunning);
        assert!(matches!(e.intent, Intent::Attack { dmg: 10 }));
    }

    #[test]
    fn npc_venomfang_lurker_stats() {
        let npc = find_npc_by_ref("venomfang-lurker").expect("venomfang-lurker");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 26);
        assert!(e.first_strike);
        assert_eq!(e.personality, Personality::Feral);
        assert!(matches!(
            e.intent,
            Intent::Debuff {
                effect: EffectKind::Poison,
                stacks: 2,
                turns: 3,
            }
        ));
    }

    #[test]
    fn npc_crystal_golem_stats() {
        let npc = find_npc_by_ref("crystal-golem").expect("crystal-golem");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 45);
        assert_eq!(e.armor, 8);
        assert_eq!(e.personality, Personality::Stoic);
        assert!(matches!(e.intent, Intent::Charge));
    }

    // ── Per-NPC stat verification (level 5 / boss) ───────────────────────

    #[test]
    fn npc_glass_golem_stats() {
        let npc = find_npc_by_ref("glass-golem").expect("glass-golem");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 60);
        assert_eq!(e.armor, 8);
        assert_eq!(e.level, 5);
        assert_eq!(e.personality, Personality::Stoic);
        assert_eq!(e.loot_table_id, "boss");
        assert!(matches!(e.intent, Intent::Charge));
    }

    #[test]
    fn npc_corrupted_warden_stats() {
        let npc = find_npc_by_ref("corrupted-warden").expect("corrupted-warden");
        let e = proto_to_enemy_state(npc);
        assert_eq!(e.hp, 50);
        assert_eq!(e.armor, 10);
        assert_eq!(e.personality, Personality::Aggressive);
        assert!(matches!(e.intent, Intent::Charge));
    }

    // ── Loot table mapping tests ─────────────────────────────────────────

    #[test]
    fn loot_table_level_1_is_slime() {
        assert_eq!(loot_table_for_level(1), "slime");
    }

    #[test]
    fn loot_table_level_2_is_skeleton() {
        assert_eq!(loot_table_for_level(2), "skeleton");
    }

    #[test]
    fn loot_table_level_3_is_wraith() {
        assert_eq!(loot_table_for_level(3), "wraith");
    }

    #[test]
    fn loot_table_level_5_is_boss() {
        assert_eq!(loot_table_for_level(5), "boss");
    }

    #[test]
    fn loot_table_level_0_is_slime() {
        assert_eq!(loot_table_for_level(0), "slime");
    }

    #[test]
    fn loot_table_level_99_is_boss() {
        assert_eq!(loot_table_for_level(99), "boss");
    }

    // ── Personality mapping tests ────────────────────────────────────────

    #[test]
    fn proto_personality_maps_all_variants() {
        assert_eq!(proto_personality(1), Personality::Aggressive);
        assert_eq!(proto_personality(2), Personality::Cunning);
        assert_eq!(proto_personality(3), Personality::Fearful);
        assert_eq!(proto_personality(4), Personality::Stoic);
        assert_eq!(proto_personality(5), Personality::Feral);
        assert_eq!(proto_personality(6), Personality::Ancient);
        assert_eq!(proto_personality(7), Personality::Cheerful);
        assert_eq!(proto_personality(8), Personality::Mysterious);
        assert_eq!(proto_personality(9), Personality::Cowardly);
        assert_eq!(proto_personality(10), Personality::Noble);
        assert_eq!(proto_personality(11), Personality::Passive);
    }

    #[test]
    fn proto_personality_unknown_defaults_to_feral() {
        assert_eq!(proto_personality(0), Personality::Feral);
        assert_eq!(proto_personality(99), Personality::Feral);
    }

    // ── NPC database query tests ─────────────────────────────────────────

    #[test]
    fn find_npc_nonexistent_returns_none() {
        assert!(find_npc_by_ref("nonexistent-npc-xyz").is_none());
    }

    #[test]
    fn find_npcs_by_level_4_is_empty() {
        assert!(find_npcs_by_level(4).is_empty(), "No level-4 NPCs exist");
    }

    #[test]
    fn all_npcs_have_stats() {
        for (_id, npc) in npc_db().iter() {
            assert!(npc.stats.is_some(), "NPC {} missing stats block", npc.name);
        }
    }

    #[test]
    fn all_npcs_have_unique_refs() {
        let mut refs = std::collections::HashSet::new();
        for (_id, npc) in npc_db().iter() {
            assert!(
                refs.insert(npc.r#ref.clone()),
                "Duplicate NPC ref: {}",
                npc.r#ref
            );
        }
    }

    #[test]
    fn all_level_1_npcs_use_slime_loot() {
        for npc in find_npcs_by_level(1) {
            let enemy = proto_to_enemy_state(npc);
            assert_eq!(
                enemy.loot_table_id, "slime",
                "{} should use slime loot table",
                enemy.name
            );
        }
    }

    #[test]
    fn all_level_5_npcs_use_boss_loot() {
        for npc in find_npcs_by_level(5) {
            let enemy = proto_to_enemy_state(npc);
            assert_eq!(
                enemy.loot_table_id, "boss",
                "{} should use boss loot table",
                enemy.name
            );
        }
    }

    #[test]
    fn all_enemies_start_with_empty_effects() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert!(
                enemy.effects.is_empty(),
                "{} should start with no effects",
                enemy.name
            );
        }
    }

    #[test]
    fn all_enemies_start_not_charged() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert!(!enemy.charged, "{} should start not charged", enemy.name);
        }
    }

    #[test]
    fn all_enemies_start_not_enraged() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert!(!enemy.enraged, "{} should start not enraged", enemy.name);
        }
    }

    #[test]
    fn all_enemies_start_at_index_zero() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert_eq!(enemy.index, 0, "{} should start at index 0", enemy.name);
        }
    }

    #[test]
    fn all_enemies_max_hp_equals_hp() {
        for (_id, npc) in npc_db().iter() {
            let enemy = proto_to_enemy_state(npc);
            assert_eq!(
                enemy.hp, enemy.max_hp,
                "{} should start at full HP",
                enemy.name
            );
        }
    }

    // ── Quest DB tests ──────────────────────────────────────────────────

    #[test]
    fn quest_db_loads_successfully() {
        let db = quest_db();
        assert!(!db.is_empty(), "QuestDb should have quests");
    }

    #[test]
    fn quest_db_has_6_quests() {
        assert_eq!(quest_db().len(), 6, "Should have 6 discordsh quests");
    }

    #[test]
    fn find_quest_slime_slayer() {
        let quest = find_quest_by_ref("slime-slayer").expect("slime-slayer should exist");
        assert_eq!(quest.title, "Slime Slayer");
        assert_eq!(quest.recommended_level, Some(1));
        assert!(!quest.steps.is_empty());
    }

    #[test]
    fn find_quest_dungeon_delver() {
        let quest = find_quest_by_ref("dungeon-delver").expect("dungeon-delver should exist");
        assert_eq!(quest.title, "Dungeon Delver");
        assert_eq!(quest.next_quest_ref, Some("shadow-hunter".to_owned()));
    }

    #[test]
    fn find_quest_shadow_hunter() {
        let quest = find_quest_by_ref("shadow-hunter").expect("shadow-hunter should exist");
        assert_eq!(quest.title, "Shadow Hunter");
        assert_eq!(quest.steps.len(), 2, "Shadow Hunter should have 2 steps");
        assert!(quest.prerequisites.is_some());
    }

    #[test]
    fn find_quest_kings_demise() {
        let quest = find_quest_by_ref("kings-demise").expect("kings-demise should exist");
        assert_eq!(quest.title, "The King's Demise");
        assert_eq!(quest.recommended_level, Some(5));
        let rewards = quest.rewards.as_ref().expect("should have rewards");
        assert_eq!(rewards.currency, Some(500));
        assert_eq!(rewards.xp, Some(300));
        assert!(rewards.achievement.is_some());
    }

    #[test]
    fn find_quest_treasure_seeker() {
        let quest = find_quest_by_ref("treasure-seeker").expect("treasure-seeker should exist");
        assert_eq!(quest.repeatable, Some(true));
    }

    #[test]
    fn find_quest_survivor() {
        let quest = find_quest_by_ref("survivor").expect("survivor should exist");
        assert_eq!(quest.repeatable, Some(true));
        assert_eq!(quest.recommended_level, Some(2));
    }

    #[test]
    fn find_quest_nonexistent_returns_none() {
        assert!(find_quest_by_ref("nonexistent-quest-xyz").is_none());
    }

    #[test]
    fn discordsh_quests_returns_all_6() {
        let quests = discordsh_quests();
        assert_eq!(quests.len(), 6);
    }

    #[test]
    fn quests_for_level_1_includes_beginner() {
        let quests = quests_for_level(1);
        assert!(quests.iter().any(|q| q.r#ref == "slime-slayer"));
        assert!(quests.iter().any(|q| q.r#ref == "dungeon-delver"));
        assert!(quests.iter().any(|q| q.r#ref == "treasure-seeker"));
    }

    #[test]
    fn quests_for_level_5_includes_all() {
        let quests = quests_for_level(5);
        assert_eq!(quests.len(), 6);
    }

    #[test]
    fn build_active_quest_slime_slayer() {
        let quest = find_quest_by_ref("slime-slayer").unwrap();
        let active = build_active_quest(quest);
        assert_eq!(active.quest_ref, "slime-slayer");
        assert_eq!(active.current_step, 0);
        assert_eq!(active.steps.len(), 1);
        assert_eq!(active.steps[0].objectives.len(), 1);
        assert_eq!(active.steps[0].objectives[0].current, 0);
        assert_eq!(active.steps[0].objectives[0].required, 3);
        assert!(!active.is_complete());
    }

    #[test]
    fn build_active_quest_shadow_hunter_has_2_steps() {
        let quest = find_quest_by_ref("shadow-hunter").unwrap();
        let active = build_active_quest(quest);
        assert_eq!(active.steps.len(), 2);
        assert_eq!(active.steps[0].objectives[0].required, 8); // explore 8 rooms
        assert_eq!(active.steps[1].objectives[0].required, 1); // kill boss
    }

    #[test]
    fn meets_prerequisites_no_prereqs() {
        let quest = find_quest_by_ref("slime-slayer").unwrap();
        let journal = QuestJournal::default();
        assert!(meets_prerequisites(quest, 1, &journal));
    }

    #[test]
    fn meets_prerequisites_level_too_low() {
        let quest = find_quest_by_ref("shadow-hunter").unwrap();
        let journal = QuestJournal::default();
        // Requires level 2, player is level 1
        assert!(!meets_prerequisites(quest, 1, &journal));
    }

    #[test]
    fn meets_prerequisites_missing_quest() {
        let quest = find_quest_by_ref("shadow-hunter").unwrap();
        let journal = QuestJournal::default();
        // Requires dungeon-delver complete, level 2
        assert!(!meets_prerequisites(quest, 5, &journal));
    }

    #[test]
    fn meets_prerequisites_all_met() {
        let quest = find_quest_by_ref("shadow-hunter").unwrap();
        let mut journal = QuestJournal::default();
        journal.completed.push("dungeon-delver".to_owned());
        assert!(meets_prerequisites(quest, 2, &journal));
    }

    #[test]
    fn all_quests_have_discordsh_tag() {
        for (_id, quest) in quest_db().iter() {
            assert!(
                quest.tags.iter().any(|t| t == "discordsh"),
                "Quest {} missing discordsh tag",
                quest.title
            );
        }
    }

    #[test]
    fn all_quests_have_at_least_one_step() {
        for (_id, quest) in quest_db().iter() {
            assert!(
                !quest.steps.is_empty(),
                "Quest {} should have at least one step",
                quest.title
            );
        }
    }

    #[test]
    fn all_quests_have_rewards() {
        for (_id, quest) in quest_db().iter() {
            assert!(
                quest.rewards.is_some(),
                "Quest {} should have rewards",
                quest.title
            );
        }
    }

    #[test]
    fn all_quest_objectives_have_positive_required_amount() {
        for (_id, quest) in quest_db().iter() {
            for step in &quest.steps {
                for obj in &step.objectives {
                    assert!(
                        obj.required_amount > 0,
                        "Quest {} objective {} should have required_amount > 0",
                        quest.title,
                        obj.id
                    );
                }
            }
        }
    }

    #[test]
    fn all_quests_have_unique_refs() {
        let mut refs = std::collections::HashSet::new();
        for (_id, quest) in quest_db().iter() {
            assert!(
                refs.insert(quest.r#ref.clone()),
                "Duplicate quest ref: {}",
                quest.r#ref
            );
        }
    }

    #[test]
    fn quest_chain_dungeon_delver_to_shadow_hunter_to_kings_demise() {
        let dd = find_quest_by_ref("dungeon-delver").unwrap();
        assert_eq!(dd.next_quest_ref, Some("shadow-hunter".to_owned()));

        let sh = find_quest_by_ref("shadow-hunter").unwrap();
        assert_eq!(sh.next_quest_ref, Some("kings-demise".to_owned()));

        let kd = find_quest_by_ref("kings-demise").unwrap();
        assert_eq!(kd.next_quest_ref, None);
    }

    #[test]
    fn kings_demise_rewards_excalibur() {
        let quest = find_quest_by_ref("kings-demise").unwrap();
        let rewards = quest.rewards.as_ref().unwrap();
        assert!(
            rewards.items.iter().any(|i| i.item_ref == "excalibur"),
            "Kings Demise should reward Excalibur"
        );
    }

    #[test]
    fn shadow_hunter_rewards_smoke_bombs() {
        let quest = find_quest_by_ref("shadow-hunter").unwrap();
        let rewards = quest.rewards.as_ref().unwrap();
        let smoke = rewards.items.iter().find(|i| i.item_ref == "smoke-bomb");
        assert!(smoke.is_some(), "Shadow Hunter should reward smoke bombs");
        assert_eq!(smoke.unwrap().amount, 3);
    }
}

#[cfg(test)]
mod gather_node_tests {
    use super::*;

    #[test]
    fn nodes_are_named_for_a_player_to_read() {
        let nodes = gather_nodes();
        assert!(!nodes.is_empty(), "no gather nodes built");
        for node in nodes {
            assert!(
                !node.name.contains('-'),
                "node {} is showing a raw slug: {}",
                node.node_ref,
                node.name
            );
            assert!(
                node.name.starts_with(|c: char| c.is_uppercase()),
                "node {} is not capitalised: {}",
                node.node_ref,
                node.name
            );
        }
    }

    #[test]
    fn every_node_pays_a_skill_that_exists() {
        for node in gather_nodes() {
            assert!(
                crate::skills::professions()
                    .expect("professiondb loaded")
                    .profession(&node.skill_ref)
                    .is_some(),
                "node {} pays into unknown skill {}",
                node.node_ref,
                node.skill_ref
            );
        }
    }
}

#[cfg(test)]
mod landmark_tests {
    use super::*;

    #[test]
    fn the_embedded_mapdb_actually_yields_object_defs() {
        assert!(
            MAP_DB.object_defs().count() > 0,
            "mapdb loaded zero object defs — the snapshot silently deserialized to defaults"
        );
    }

    #[test]
    fn resource_nodes_take_their_names_from_mapdb() {
        let node = gather_nodes()
            .iter()
            .find(|n| n.node_ref == "copper-vein")
            .expect("copper-vein must be a known node");
        assert_eq!(
            node.name, "Copper Vein",
            "node name should come from mapdb, not the slug fallback"
        );
    }

    /// A nonzero attach chance with an empty bucket is a silent dead end: the
    /// roll succeeds and then finds nothing, which is how treasure rooms came
    /// to advertise landmarks they could never show.
    #[test]
    fn no_room_type_promises_a_landmark_it_cannot_supply() {
        for room_type in [
            RoomType::Combat,
            RoomType::Treasure,
            RoomType::Trap,
            RoomType::RestShrine,
            RoomType::Merchant,
            RoomType::Boss,
            RoomType::Story,
            RoomType::Hallway,
            RoomType::Resource,
            RoomType::UndergroundCity,
        ] {
            if landmark_attach_chance(&room_type) <= 0.0 {
                continue;
            }
            let mut rng = rand::rng();
            let drew =
                (0..200).any(|_| pick_landmark_for_room_type(&room_type, &mut rng).is_some());
            assert!(
                drew,
                "{room_type:?} has a landmark chance but an empty bucket"
            );
        }
    }

    #[test]
    fn every_room_type_with_a_landmark_chance_has_a_bucket_to_draw_from() {
        for room_type in [
            RoomType::Boss,
            RoomType::UndergroundCity,
            RoomType::Merchant,
            RoomType::RestShrine,
            RoomType::Story,
            RoomType::Resource,
        ] {
            let mut rng = rand::rng();
            let mut drew = false;
            for _ in 0..200 {
                if pick_landmark_for_room_type(&room_type, &mut rng).is_some() {
                    drew = true;
                    break;
                }
            }
            assert!(drew, "{room_type:?} never draws a landmark");
        }
    }
}

#[cfg(test)]
mod craft_tests {
    use super::*;
    use crate::types::{inv_add_qty, inv_count, inv_from_pairs};

    #[test]
    fn the_catalog_actually_carries_recipes() {
        let with_recipes = item_db()
            .iter()
            .filter(|(_, i)| !i.recipes.is_empty())
            .count();
        assert!(
            with_recipes > 0,
            "no recipes baked — execute_craft can only ever fail"
        );
    }

    #[test]
    fn a_failed_craft_consumes_nothing() {
        // campfire-kit wants log x3 + stone x1; give it the stone and one log.
        let mut inv = inv_from_pairs(&[("log", 1), ("stone", 1)]);
        let skills = bevy_skills::SkillProfile::default();

        let err =
            execute_craft(&mut inv, &skills, "campfire_kit").expect_err("three logs are required");

        assert!(
            matches!(err, CraftError::MissingIngredient { .. }),
            "{err:?}"
        );
        assert_eq!(
            inv_count(&inv, "log"),
            1,
            "the log was eaten by a failed craft"
        );
        assert_eq!(
            inv_count(&inv, "stone"),
            1,
            "the stone was eaten by a failed craft"
        );
    }

    #[test]
    fn a_successful_craft_takes_its_ingredients_and_yields_the_output() {
        let mut inv = inv_from_pairs(&[("log", 3), ("stone", 1)]);
        let skills = bevy_skills::SkillProfile::default();

        let outcome = execute_craft(&mut inv, &skills, "campfire_kit").expect("entry tier recipe");

        assert_eq!(outcome.skill_ref, Some("crafting"));
        assert!(outcome.xp > 0);
        assert_eq!(inv_count(&inv, "log"), 0);
        assert_eq!(inv_count(&inv, "stone"), 0);
        assert_eq!(inv_count(&inv, "campfire_kit"), outcome.output_qty);
    }

    #[test]
    fn a_deeper_recipe_needs_training() {
        // ward wants crystal-ore + lavender at crafting 15.
        let mut inv = inv_from_pairs(&[("crystal-ore", 4), ("lavender", 4)]);
        let skills = bevy_skills::SkillProfile::default();

        let err = execute_craft(&mut inv, &skills, "ward").expect_err("crafting 15 is required");

        assert!(
            matches!(err, CraftError::SkillTooLow { required: 15, .. }),
            "{err:?}"
        );
        assert_eq!(
            inv_count(&inv, "crystal-ore"),
            4,
            "a refused craft took materials"
        );
    }

    #[test]
    fn available_recipes_hides_what_the_player_cannot_make() {
        let mut inv = inv_from_pairs(&[("crystal-ore", 4), ("lavender", 4)]);
        inv_add_qty(&mut inv, "log", 3);
        inv_add_qty(&mut inv, "stone", 1);
        let skills = bevy_skills::SkillProfile::default();

        let listed = available_recipes(&inv, &skills);
        let names: Vec<&str> = listed.iter().map(|r| r.output_ref).collect();

        assert!(
            names.contains(&"campfire_kit"),
            "an entry-tier recipe with ingredients should be listed: {names:?}"
        );
        assert!(
            !names.contains(&"ward"),
            "a recipe needing crafting 15 should not be offered: {names:?}"
        );
    }

    #[test]
    fn fletching_recipes_are_named_not_dropped() {
        let mut inv = inv_from_pairs(&[("log", 4), ("cacti-needle", 4), ("stone", 4)]);
        inv_add_qty(&mut inv, "timber", 4);
        let skills = bevy_skills::SkillProfile::default();

        let listed = available_recipes(&inv, &skills);
        let arrow = listed.iter().find(|r| r.output_ref == "arrow");

        if let Some(arrow) = arrow {
            assert_eq!(
                arrow.skill_name,
                Some("Fletching"),
                "fletching was missing from the skill display table"
            );
        }
    }
}

#[cfg(test)]
mod recipe_order_tests {
    use super::*;
    use crate::types::inv_from_pairs;

    #[test]
    fn the_recipe_list_is_stable_across_calls() {
        let inv = inv_from_pairs(&[("log", 6), ("stone", 4), ("wildflower", 4), ("porcini", 4)]);
        let skills = bevy_skills::SkillProfile::default();

        let first: Vec<&str> = available_recipes(&inv, &skills)
            .iter()
            .map(|r| r.output_ref)
            .collect();

        for _ in 0..8 {
            let again: Vec<&str> = available_recipes(&inv, &skills)
                .iter()
                .map(|r| r.output_ref)
                .collect();
            assert_eq!(
                first, again,
                "recipe order changed between calls — a positional key would craft the wrong row"
            );
        }
    }
}

#[cfg(test)]
mod dialogue_tests {
    use super::*;

    #[test]
    fn the_embedded_graphs_load() {
        assert!(
            !dialogue_db().is_empty(),
            "dialogue.json must contain at least one graph"
        );
    }

    #[test]
    fn a_graph_named_after_an_npc_belongs_to_it() {
        // npcdb.json is generated, so an author cannot add dialogue_graph_refs
        // to it. Naming the graph after the NPC is the way in.
        let graph = get_npc_dialogue_graph("the-shattered-king")
            .expect("the shattered king has a conversation");
        assert_eq!(graph.r#ref, "the-shattered-king");
        assert!(npc_has_dialogue("the-shattered-king"));
    }

    #[test]
    fn an_npc_without_a_graph_has_nothing_to_say() {
        assert!(get_npc_dialogue_graph("cave-spider").is_none());
        assert!(!npc_has_dialogue("cave-spider"));
    }

    #[test]
    fn the_opening_line_changes_once_you_have_met_him() {
        let graph = get_npc_dialogue_graph("the-shattered-king").unwrap();
        let mut ctx = bevy_dialogue::DialogueContext::default();

        let first = bevy_dialogue::entry_node(graph, &ctx).expect("a first meeting");
        assert_eq!(first.id, "first_meeting");

        // Entering that node sets the flag, which is what the higher-priority
        // entry is waiting for.
        ctx.flags.insert("met_shattered_king".into());
        let second = bevy_dialogue::entry_node(graph, &ctx).expect("a second meeting");
        assert_eq!(second.id, "again");
    }

    #[test]
    fn the_farewell_ends_the_conversation() {
        let graph = get_npc_dialogue_graph("the-shattered-king").unwrap();
        let farewell = get_dialogue_node(graph, "farewell").expect("a farewell node");
        assert_eq!(bevy_dialogue::next_node(farewell), None);
        assert!(
            bevy_dialogue::choices(graph, farewell, &bevy_dialogue::DialogueContext::default())
                .is_empty(),
            "nothing to reply to means the conversation is over"
        );
    }
}
