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
    db.id_for_slug(&slug).map(ProtoItemKind::new)
}

/// Convert a [`ProtoItemKind`] back to a game ID (underscore format).
/// Returns `None` if the item isn't in the database.
pub fn proto_item_kind_to_game_id(kind: &ProtoItemKind) -> Option<&'static str> {
    let db = item_db();
    let item = db.get(kind.id)?;
    Some(slug_to_game_id(&item.slug))
}

/// Create a [`ProtoItemKind`] directly from a slug (hyphenated format).
#[allow(dead_code)]
pub fn proto_item_kind_from_slug(slug: &str) -> ProtoItemKind {
    ensure_inventory_init();
    ProtoItemKind::from_slug(slug)
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
        id: slug_to_game_id(&proto.slug),
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
        id: slug_to_game_id(&proto.slug),
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
}
