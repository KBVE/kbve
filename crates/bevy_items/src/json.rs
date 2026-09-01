//! JSON loading for the Astro `/api/itemdb.json` endpoint.
//!
//! The Astro endpoint serves items with string enum values (`"common"`,
//! `"rare"`) and Astro-specific extension fields. This module maps that
//! JSON shape into proto [`Item`] structs that [`ItemDb`] can index.

use serde_json::Value;

use crate::proto::item;
use crate::proto::{Element, EquipSlot, Extension, ItemAmount, Rarity};
use kbve_proto::kbve::common::v1::extension;

/// Errors that can occur when loading items from JSON.
#[derive(Debug)]
pub enum JsonLoadError {
    /// Failed to parse the JSON string.
    Parse(serde_json::Error),
    /// The JSON structure is missing the expected `items` array.
    MissingItems,
    /// An item is missing a required field.
    MissingField { slug: String, field: &'static str },
}

impl std::fmt::Display for JsonLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(e) => write!(f, "JSON parse error: {e}"),
            Self::MissingItems => write!(f, "JSON missing 'items' array"),
            Self::MissingField { slug, field } => {
                write!(f, "Item '{slug}' missing required field '{field}'")
            }
        }
    }
}

impl std::error::Error for JsonLoadError {}

/// Parse the Astro `/api/itemdb.json` response into a list of proto items.
///
/// The expected JSON shape is:
/// ```json
/// {
///   "items": [ { "id": "...", "ref": "blue-shark", "name": "Blue Shark", ... } ],
///   "index": { "blue-shark": 0, ... }
/// }
/// ```
///
/// Astro-specific fields not in the proto schema are silently ignored.
pub fn parse_itemdb_json(json_str: &str) -> Result<Vec<item::Item>, JsonLoadError> {
    let root: Value = serde_json::from_str(json_str).map_err(JsonLoadError::Parse)?;

    let items_arr = root
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or(JsonLoadError::MissingItems)?;

    let mut items = Vec::with_capacity(items_arr.len());
    for val in items_arr {
        if let Some(item) = json_value_to_item(val) {
            items.push(item);
        }
    }

    Ok(items)
}

fn json_value_to_item(v: &Value) -> Option<item::Item> {
    let slug = v.get("ref")?.as_str()?.to_string();
    // The schema stores sixteen bytes; a content file writes the twenty-six
    // characters. `Ulid` is declared to convert through `UlidText` for serde, so
    // the text form decodes without this crate reimplementing Crockford.
    let id = v
        .get("id")
        .and_then(|v| v.as_str())
        .and_then(|text| serde_json::from_value(Value::String(text.to_string())).ok());
    let name = v
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&slug)
        .to_string();

    Some(item::Item {
        id,
        r#ref: slug,
        name,
        title: str_opt(v, "title"),
        description: str_opt(v, "description"),
        lore: str_opt(v, "lore"),
        type_flags: int_or(v, "type_flags", 0),
        rarity: parse_rarity(v.get("rarity")),
        element: v.get("element").map(parse_element),
        tags: str_array(v, "tags"),
        img: str_opt(v, "img"),
        icon: str_opt(v, "icon"),
        emoji: str_opt(v, "emoji"),
        pixel_density: int_opt(v, "pixel_density"),
        sorting_layer: str_opt(v, "sorting_layer"),
        sorting_order: int_opt(v, "sorting_order"),
        model_ref: str_opt(v, "model_ref"),
        animation_ref: str_opt(v, "animation_ref"),
        sound_ref: str_opt(v, "sound_ref"),
        max_stack: int_opt(v, "max_stack"),
        stackable: bool_opt(v, "stackable"),
        weight: float_opt(v, "weight"),
        level_requirement: int_opt(v, "level_requirement"),
        quest_requirement: str_opt(v, "quest_requirement"),
        buy_price: int_opt(v, "buy_price"),
        sell_price: int_opt(v, "sell_price"),
        tradeable: bool_opt(v, "tradeable"),
        consumable: bool_opt(v, "consumable"),
        cooldown: int_opt(v, "cooldown"),
        action: str_opt(v, "action"),
        use_effects: parse_use_effects(v.get("use_effects")),
        equipment: parse_equipment(v.get("equipment")),
        food: parse_food(v.get("food")),
        recipes: parse_recipes(v.get("recipes")),
        deployable: parse_deployable(v.get("deployable")),
        resistances: parse_affinities(v.get("resistances")),
        affinities: parse_affinities(v.get("affinities")),
        scripts: parse_scripts(v.get("scripts")),
        sources: parse_sources(v.get("sources")),
        related_item_refs: str_array(v, "related_item_refs"),
        set_ref: str_opt(v, "set_ref"),
        durability: int_opt(v, "durability"),
        max_durability: int_opt(v, "max_durability"),
        extensions: parse_extensions(v.get("extensions")),
        credits: str_opt(v, "credits"),
        drafted: bool_opt(v, "drafted"),
        ..Default::default()
    })
}

fn parse_rarity(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("common") => Rarity::Common as i32,
        Some("uncommon") => Rarity::Uncommon as i32,
        Some("rare") => Rarity::Rare as i32,
        Some("epic") => Rarity::Epic as i32,
        Some("legendary") => Rarity::Legendary as i32,
        Some("mythic") => Rarity::Mythic as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_element(v: &Value) -> i32 {
    match v.as_str() {
        Some("fire") => Element::Fire as i32,
        Some("ice") => Element::Ice as i32,
        Some("lightning") => Element::Lightning as i32,
        Some("poison") => Element::Poison as i32,
        Some("shadow") => Element::Shadow as i32,
        Some("holy") => Element::Holy as i32,
        Some("arcane") => Element::Arcane as i32,
        Some("earth") => Element::Earth as i32,
        Some("wind") => Element::Wind as i32,
        _ => v.as_i64().unwrap_or(0) as i32,
    }
}

fn parse_equip_slot(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("head") => EquipSlot::Head as i32,
        Some("chest") => EquipSlot::Chest as i32,
        Some("legs") => EquipSlot::Legs as i32,
        Some("feet") => EquipSlot::Feet as i32,
        Some("hands") => EquipSlot::Hands as i32,
        Some("main_hand") => EquipSlot::MainHand as i32,
        Some("off_hand") => EquipSlot::OffHand as i32,
        Some("neck") => EquipSlot::Neck as i32,
        Some("ring") => EquipSlot::Ring as i32,
        Some("back") => EquipSlot::Back as i32,
        Some("two_hand") => EquipSlot::TwoHand as i32,
        Some("ammo") => EquipSlot::Ammo as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_use_effect_type(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("heal") => item::UseEffectType::Heal as i32,
        Some("damage_enemy") => item::UseEffectType::DamageEnemy as i32,
        Some("apply_effect") => item::UseEffectType::ApplyEffect as i32,
        Some("remove_effect") => item::UseEffectType::RemoveEffect as i32,
        Some("guaranteed_flee") => item::UseEffectType::GuaranteedFlee as i32,
        Some("full_heal") => item::UseEffectType::FullHeal as i32,
        Some("remove_all_negative") => item::UseEffectType::RemoveAllNegative as i32,
        Some("campfire_rest") => item::UseEffectType::CampfireRest as i32,
        Some("teleport_city") => item::UseEffectType::TeleportCity as i32,
        Some("damage_and_apply") => item::UseEffectType::DamageAndApply as i32,
        Some("revive_ally") => item::UseEffectType::ReviveAlly as i32,
        Some("buff_party") => item::UseEffectType::BuffParty as i32,
        Some("summon") => item::UseEffectType::Summon as i32,
        Some("transform") => item::UseEffectType::Transform as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_gear_special(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("life_steal") => item::GearSpecialType::LifeSteal as i32,
        Some("thorns") => item::GearSpecialType::Thorns as i32,
        Some("crit_bonus") => item::GearSpecialType::CritBonus as i32,
        Some("damage_reduction") => item::GearSpecialType::DamageReduction as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_status_effect(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("poison") => item::StatusEffectKind::Poison as i32,
        Some("burning") => item::StatusEffectKind::Burning as i32,
        Some("bleed") => item::StatusEffectKind::Bleed as i32,
        Some("shielded") => item::StatusEffectKind::Shielded as i32,
        Some("weakened") => item::StatusEffectKind::Weakened as i32,
        Some("stunned") => item::StatusEffectKind::Stunned as i32,
        Some("sharpened") => item::StatusEffectKind::Sharpened as i32,
        Some("thorns") => item::StatusEffectKind::Thorns as i32,
        Some("regen") => item::StatusEffectKind::Regen as i32,
        Some("haste") => item::StatusEffectKind::Haste as i32,
        Some("slow") => item::StatusEffectKind::Slow as i32,
        Some("frozen") => item::StatusEffectKind::Frozen as i32,
        Some("cursed") => item::StatusEffectKind::Cursed as i32,
        Some("blessed") => item::StatusEffectKind::Blessed as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_bonuses(v: Option<&Value>) -> Option<item::ItemBonuses> {
    let v = v?.as_object()?;
    Some(item::ItemBonuses {
        armor: v.get("armor").and_then(|v| v.as_i64()).map(|n| n as i32),
        attack: v.get("attack").and_then(|v| v.as_i64()).map(|n| n as i32),
        defense: v.get("defense").and_then(|v| v.as_i64()).map(|n| n as i32),
        strength: v.get("strength").and_then(|v| v.as_i64()).map(|n| n as i32),
        intelligence: v
            .get("intelligence")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        health: v.get("health").and_then(|v| v.as_i64()).map(|n| n as i32),
        mana: v.get("mana").and_then(|v| v.as_i64()).map(|n| n as i32),
        energy: v.get("energy").and_then(|v| v.as_i64()).map(|n| n as i32),
        speed: v.get("speed").and_then(|v| v.as_i64()).map(|n| n as i32),
        agility: v.get("agility").and_then(|v| v.as_i64()).map(|n| n as i32),
        crit_chance: v
            .get("crit_chance")
            .and_then(|v| v.as_f64())
            .map(|n| n as f32),
        crit_damage: v
            .get("crit_damage")
            .and_then(|v| v.as_f64())
            .map(|n| n as f32),
        stamina: v.get("stamina").and_then(|v| v.as_i64()).map(|n| n as i32),
        charisma: v.get("charisma").and_then(|v| v.as_i64()).map(|n| n as i32),
        dexterity: v
            .get("dexterity")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        perception: v
            .get("perception")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        extra: v
            .get("extra")
            .and_then(|v| v.as_object())
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| Some((k.clone(), v.as_f64()?)))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

fn parse_equipment(v: Option<&Value>) -> Option<item::EquipmentInfo> {
    let v = v?.as_object()?;
    Some(item::EquipmentInfo {
        slot: parse_equip_slot(v.get("slot")),
        bonuses: parse_bonuses(v.get("bonuses")),
        special: v.get("special").map(|s| parse_gear_special(Some(s))),
        special_value: v
            .get("special_value")
            .and_then(|v| v.as_f64())
            .map(|n| n as f32),
        durability: v
            .get("durability")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        max_durability: v
            .get("max_durability")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        ..Default::default()
    })
}

fn parse_use_effect(v: &Value) -> Option<item::UseEffect> {
    let obj = v.as_object()?;
    Some(item::UseEffect {
        r#type: parse_use_effect_type(obj.get("type")),
        amount: obj.get("amount").and_then(|v| v.as_i64()).map(|n| n as i32),
        status_effect: obj
            .get("status_effect")
            .map(|s| parse_status_effect(Some(s))),
        effect_kind_custom: obj
            .get("effect_kind_custom")
            .and_then(|v| v.as_str())
            .map(String::from),
        stacks: obj.get("stacks").and_then(|v| v.as_i64()).map(|n| n as i32),
        turns: obj.get("turns").and_then(|v| v.as_i64()).map(|n| n as i32),
        percent: obj
            .get("percent")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        summon_ref: obj
            .get("summon_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        element: obj.get("element").map(parse_element),
    })
}

fn parse_use_effects(v: Option<&Value>) -> Vec<item::UseEffect> {
    v.and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(parse_use_effect).collect())
        .unwrap_or_default()
}

fn parse_food(v: Option<&Value>) -> Option<item::FoodInfo> {
    let v = v?.as_object()?;
    Some(item::FoodInfo {
        heals: v.get("heals").and_then(|v| v.as_i64()).map(|n| n as i32),
        doses: v.get("doses").and_then(|v| v.as_i64()).map(|n| n as i32),
        burn_level: v
            .get("burn_level")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        duration: v.get("duration").and_then(|v| v.as_i64()).map(|n| n as i32),
        buff_effects: parse_use_effects(v.get("buff_effects")),
        ..Default::default()
    })
}

fn parse_ingredient(v: &Value) -> Option<ItemAmount> {
    let obj = v.as_object()?;
    Some(ItemAmount {
        item_ref: obj.get("item_ref")?.as_str()?.to_string(),
        item_name: obj.get("name").and_then(|v| v.as_str()).map(String::from),
        quantity: obj.get("amount").and_then(|v| v.as_i64()).unwrap_or(1) as u32,
        consumed: obj.get("consumed").and_then(|v| v.as_bool()),
        ..Default::default()
    })
}

fn parse_recipes(v: Option<&Value>) -> Vec<item::CraftingRecipe> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    let obj = r.as_object()?;
                    Some(item::CraftingRecipe {
                        ingredients: obj
                            .get("ingredients")
                            .and_then(|v| v.as_array())
                            .map(|a| a.iter().filter_map(parse_ingredient).collect())
                            .unwrap_or_default(),
                        required_tools: str_array_from(obj.get("required_tools")),
                        skill: obj.get("skill").and_then(|v| v.as_str()).map(String::from),
                        skill_level: obj
                            .get("skill_level")
                            .and_then(|v| v.as_i64())
                            .map(|n| n as i32),
                        xp_reward: obj
                            .get("xp_reward")
                            .and_then(|v| v.as_f64())
                            .map(|n| n as f32),
                        output_quantity: obj
                            .get("output_quantity")
                            .and_then(|v| v.as_i64())
                            .map(|n| n as i32),
                        facility: obj
                            .get("facility")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        members_only: obj.get("members_only").and_then(|v| v.as_bool()),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_scripts(v: Option<&Value>) -> Vec<item::ScriptBinding> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    let obj = s.as_object()?;
                    Some(item::ScriptBinding {
                        guid: obj.get("guid")?.as_str()?.to_string(),
                        name: obj.get("name").and_then(|v| v.as_str()).map(String::from),
                        vars: obj
                            .get("vars")
                            .and_then(|v| v.as_object())
                            .map(|m| {
                                m.iter()
                                    .filter_map(|(k, v)| {
                                        let val = match v {
                                            Value::String(s) => s.clone(),
                                            Value::Number(n) => n.to_string(),
                                            Value::Bool(b) => b.to_string(),
                                            _ => return None,
                                        };
                                        Some((k.clone(), val))
                                    })
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_deployable(v: Option<&Value>) -> Option<item::DeployableInfo> {
    let v = v?.as_object()?;
    Some(item::DeployableInfo {
        size: v
            .get("size")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_i64().map(|n| n as i32))
                    .collect()
            })
            .unwrap_or_default(),
        pivot: v
            .get("pivot")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_f64().map(|n| n as f32))
                    .collect()
            })
            .unwrap_or_default(),
        override_prefab: v
            .get("override_prefab")
            .and_then(|v| v.as_str())
            .map(String::from),
        scale_multiplier: v
            .get("scale_multiplier")
            .and_then(|v| v.as_f64())
            .map(|n| n as f32),
        grid_snap: v.get("grid_snap").and_then(|v| v.as_bool()),
        scripts: parse_scripts(v.get("scripts")),
        deployable_type: v
            .get("deployable_type")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

fn parse_affinities(v: Option<&Value>) -> Vec<item::ItemAffinity> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let obj = a.as_object()?;
                    Some(item::ItemAffinity {
                        element: parse_element(obj.get("element")?),
                        magnitude: obj.get("magnitude").and_then(|v| v.as_f64()).unwrap_or(0.0)
                            as f32,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_sources(v: Option<&Value>) -> Vec<item::ItemSource> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    let obj = s.as_object()?;
                    Some(item::ItemSource {
                        source_type: obj
                            .get("source_type")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        source_ref: obj
                            .get("source_ref")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        source_name: obj
                            .get("source_name")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        drop_rate: obj
                            .get("drop_rate")
                            .and_then(|v| v.as_f64())
                            .map(|n| n as f32),
                        min_quantity: obj
                            .get("min_quantity")
                            .and_then(|v| v.as_i64())
                            .map(|n| n as i32),
                        max_quantity: obj
                            .get("max_quantity")
                            .and_then(|v| v.as_i64())
                            .map(|n| n as i32),
                        level_requirement: obj
                            .get("level_requirement")
                            .and_then(|v| v.as_i64())
                            .map(|n| n as i32),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_extensions(v: Option<&Value>) -> Vec<Extension> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| {
                    let obj = e.as_object()?;
                    let key = obj.get("key")?.as_str()?.to_string();
                    let value = if let Some(s) = obj.get("string_value").and_then(|v| v.as_str()) {
                        Some(extension::Value::StringValue(s.to_string()))
                    } else if let Some(n) = obj.get("int_value").and_then(|v| v.as_i64()) {
                        Some(extension::Value::IntValue(n))
                    } else if let Some(n) = obj.get("float_value").and_then(|v| v.as_f64()) {
                        Some(extension::Value::FloatValue(n))
                    } else {
                        obj.get("bool_value")
                            .and_then(|v| v.as_bool())
                            .map(extension::Value::BoolValue)
                    };
                    Some(Extension { key, value })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn str_opt(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|v| v.as_str()).map(String::from)
}

fn int_or(v: &Value, key: &str, default: i32) -> i32 {
    v.get(key)
        .and_then(|v| v.as_i64())
        .map(|n| n as i32)
        .unwrap_or(default)
}

fn int_opt(v: &Value, key: &str) -> Option<i32> {
    v.get(key).and_then(|v| v.as_i64()).map(|n| n as i32)
}

fn float_opt(v: &Value, key: &str) -> Option<f32> {
    v.get(key).and_then(|v| v.as_f64()).map(|n| n as f32)
}

fn bool_opt(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(|v| v.as_bool())
}

fn str_array(v: &Value, key: &str) -> Vec<String> {
    str_array_from(v.get(key))
}

fn str_array_from(v: Option<&Value>) -> Vec<String> {
    v.and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}
