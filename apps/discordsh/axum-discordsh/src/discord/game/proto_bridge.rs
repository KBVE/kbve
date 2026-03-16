//! Bridge between the proto-driven [`ItemDb`] and the game's legacy type system.
//!
//! Loads all items from an embedded JSON snapshot of the Astro `/api/itemdb.json`
//! endpoint, converts proto [`Item`] structs into the game's [`ItemDef`] and
//! [`GearDef`] types, and exposes them via the same lookup functions that the
//! rest of the codebase already uses.

use std::sync::LazyLock;

use bevy_items::{
    EquipSlot as ProtoEquipSlot, GearSpecialType, ItemDb, ProtoItemId, StatusEffectKind,
    UseEffectType, inventory_adapter::ProtoItemKind,
};
use bevy_npc::NpcDb;
use bevy_quests::QuestDb;

use super::types::*;

pub use bevy_items::inventory_adapter;

/// Embedded JSON snapshot of the full itemdb — generated from the Astro dev server.
/// This will be replaced by a live endpoint fetch once the production API is deployed.
const ITEMDB_JSON: &str = include_str!("../../../data/itemdb.json");

/// The global proto item database, loaded once from the embedded JSON.
/// Also initializes the [`ProtoItemKind`] adapter so inventory lookups work.
static ITEM_DB: LazyLock<ItemDb> = LazyLock::new(|| {
    let db = ItemDb::from_json(ITEMDB_JSON).expect("embedded itemdb.json must be valid");
    db
});

/// Ensure the `ProtoItemKind` adapter is initialized with our global `ItemDb`.
/// Called lazily on first use of any inventory-related function.
static INVENTORY_INIT: LazyLock<()> = LazyLock::new(|| {
    // Force ITEM_DB to load first, then hand it to the adapter.
    let db: &'static ItemDb = &ITEM_DB;
    inventory_adapter::init_item_db(db);
});

/// Embedded JSON snapshot of the NPC database — generated from the Astro dev server.
const NPCDB_JSON: &str = include_str!("../../../data/npcdb.json");

/// The global proto NPC database, loaded once from the embedded JSON.
static NPC_DB: LazyLock<NpcDb> =
    LazyLock::new(|| NpcDb::from_json(NPCDB_JSON).expect("embedded npcdb.json must be valid"));

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
    NPC_DB.find_by_level(level)
}

/// Look up a single NPC by its ref slug (e.g. "glass-slime").
pub fn find_npc_by_ref(r: &str) -> Option<&'static bevy_npc::Npc> {
    NPC_DB.get_by_ref(r)
}

/// Convert a proto NPC into an [`EnemyState`] ready for combat.
///
/// Stats (HP, armor, personality, first_strike) come from the proto definition.
/// The initial intent is looked up from a static table keyed by NPC ref.
/// The loot table is derived from the NPC's level tier.
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
        intent: npc_initial_intent(&npc.r#ref, attack),
        charged: false,
        loot_table_id: loot_table_for_level(npc.level as u8),
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
        _ => Personality::Feral,
    }
}

/// Derive the loot table ID from enemy level tier.
fn loot_table_for_level(level: u8) -> &'static str {
    match level {
        0..=1 => "slime",
        2 => "skeleton",
        3 => "wraith",
        _ => "boss",
    }
}

/// Look up the initial combat intent for an NPC by ref.
/// Falls back to a basic Attack using the NPC's attack stat.
fn npc_initial_intent(npc_ref: &str, attack: i32) -> Intent {
    match npc_ref {
        // Level 1 — tier "slime"
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

        // Level 2 — tier "skeleton"
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

        // Level 3 — tier "wraith"
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

        // Level 5 — tier "boss"
        "glass-golem" => Intent::Charge,
        "corrupted-warden" => Intent::Charge,
        "the-shattered-king" => Intent::AoeAttack { dmg: 8 },

        // Fallback: basic attack using proto attack stat
        _ => Intent::Attack { dmg: attack },
    }
}

// ── Quest public API ──────────────────────────────────────────────────

/// Embedded JSON snapshot of the quest database.
const QUESTDB_JSON: &str = include_str!("../../../data/questdb.json");

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
        if let Some(req_level) = prereq.level_requirement {
            if (player_level as i32) < req_level {
                return false;
            }
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
    fn npc_db_has_23_npcs() {
        assert_eq!(npc_db().len(), 23, "Should have 23 discordsh NPCs");
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
        assert_eq!(npcs.len(), 6, "Should have 6 level-1 NPCs");
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
    fn all_npcs_have_discordsh_tag() {
        for (_id, npc) in npc_db().iter() {
            assert!(
                npc.tags.iter().any(|t| t == "discordsh"),
                "NPC {} missing discordsh tag",
                npc.name
            );
        }
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
