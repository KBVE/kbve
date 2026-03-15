/// Data types mirroring `npcdb.proto` — the single source of truth for NPC definitions.
///
/// Field numbers in comments reference the proto field tags for traceability.
use bevy::prelude::*;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

// =============================================================================
// Enums
// =============================================================================

/// NPC archetype flags — an NPC can wear multiple hats (bitmask of `NpcTypeFlag`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[repr(u32)]
pub enum NpcTypeFlag {
    None = 0x0000,
    Enemy = 0x0001,
    Merchant = 0x0002,
    QuestGiver = 0x0004,
    Companion = 0x0008,
    Neutral = 0x0010,
    Boss = 0x0020,
    Miniboss = 0x0040,
    Summon = 0x0080,
    Trainer = 0x0100,
    Repair = 0x0200,
    Innkeeper = 0x0400,
}

/// Personality — drives dialogue, flavor text, AI weighting.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum Personality {
    #[default]
    Unspecified = 0,
    Aggressive = 1,
    Cunning = 2,
    Fearful = 3,
    Stoic = 4,
    Feral = 5,
    Ancient = 6,
    Cheerful = 7,
    Mysterious = 8,
    Cowardly = 9,
    Noble = 10,
}

/// Element / damage affinity.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum Element {
    #[default]
    None = 0,
    Fire = 1,
    Ice = 2,
    Lightning = 3,
    Poison = 4,
    Shadow = 5,
    Holy = 6,
    Arcane = 7,
    Earth = 8,
    Wind = 9,
}

/// Rarity tier.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum NpcRarity {
    #[default]
    Common = 0,
    Uncommon = 1,
    Rare = 2,
    Epic = 3,
    Legendary = 4,
    Mythic = 5,
}

/// Combat rank — separate from rarity, affects difficulty expectation.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum NpcRank {
    #[default]
    Normal = 0,
    Elite = 1,
    RareElite = 2,
    WorldBoss = 3,
}

/// Creature family — taxonomic grouping for ability targeting.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum CreatureFamily {
    #[default]
    Unspecified = 0,
    Beast = 1,
    Undead = 2,
    Demon = 3,
    Elemental = 4,
    Humanoid = 5,
    Mechanical = 6,
    Dragon = 7,
    Aberration = 8,
    Plant = 9,
    Spirit = 10,
    Construct = 11,
}

/// Idle movement behavior.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum MovementType {
    #[default]
    Stationary = 0,
    RandomWander = 1,
    Patrol = 2,
    Scripted = 3,
}

/// Difficulty mode for stat overrides.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum DifficultyMode {
    #[default]
    Normal = 0,
    Hard = 1,
    Heroic = 2,
    Mythic = 3,
}

/// Equipment slot.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum EquipSlot {
    #[default]
    Unspecified = 0,
    Head = 1,
    Chest = 2,
    Legs = 3,
    Feet = 4,
    Hands = 5,
    MainHand = 6,
    OffHand = 7,
    Neck = 8,
    Ring = 9,
    Back = 10,
}

// =============================================================================
// Sub-messages
// =============================================================================

/// Base combat stats — mirrors `NpcStats` in proto.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NpcStats {
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub speed: i32,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub mp: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub max_mp: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub ep: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub max_ep: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub armor: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub intelligence: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub strength: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub agility: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub hp_regen: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub mp_regen: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub ep_regen: Option<f32>,
}

impl Default for NpcStats {
    fn default() -> Self {
        Self {
            hp: 100,
            max_hp: 100,
            attack: 10,
            defense: 5,
            speed: 5,
            mp: None,
            max_mp: None,
            ep: None,
            max_ep: None,
            armor: None,
            intelligence: None,
            strength: None,
            agility: None,
            hp_regen: None,
            mp_regen: None,
            ep_regen: None,
        }
    }
}

/// Elemental affinity with magnitude.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ElementalAffinity {
    pub element: Element,
    pub magnitude: f32,
}

/// A single loot drop entry.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LootEntry {
    pub item_ref: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub item_name: Option<String>,
    #[cfg_attr(feature = "serde", serde(default = "default_one_i32"))]
    pub min_quantity: i32,
    #[cfg_attr(feature = "serde", serde(default = "default_one_i32"))]
    pub max_quantity: i32,
    pub drop_rate: f32,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub level_requirement: Option<i32>,
}

#[cfg(feature = "serde")]
fn default_one_i32() -> i32 {
    1
}

/// Loot table attached to an NPC.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct LootTable {
    #[cfg_attr(feature = "serde", serde(default))]
    pub entries: Vec<LootEntry>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub guaranteed_drops: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub max_drops: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub gold_min: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub gold_max: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub xp_reward: Option<i32>,
}

/// A single equipped item on an NPC.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct EquipmentEntry {
    pub slot: EquipSlot,
    pub item_ref: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub item_name: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub enchant_level: Option<i32>,
}

/// Full equipment loadout for an NPC.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct EquipmentLoadout {
    #[cfg_attr(feature = "serde", serde(default))]
    pub equipped: Vec<EquipmentEntry>,
}

/// A single ability / skill the NPC can use.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NpcAbility {
    pub id: String,
    pub name: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub description: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub element: Option<Element>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub damage: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub mp_cost: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub ep_cost: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub cooldown_turns: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub hit_chance: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_aoe: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub heal_amount: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub status_effect: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub weight: Option<f32>,
}

/// Intent weight — probability of choosing an ability by tier.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct IntentWeight {
    pub ability_id: String,
    pub weight: f32,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub tier_min: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub tier_max: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub hp_threshold: Option<f32>,
}

/// Behavioral traits — combat modifiers baked into the NPC definition.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct BehaviorTraits {
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub first_strike: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub enrage_threshold: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub enrage_multiplier: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub can_flee: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub can_charge: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_tethered: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub aggro_range: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub leash_distance: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub call_for_help_radius: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub wander_radius: Option<f32>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub movement_type: MovementType,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub patrol_path_ref: Option<String>,
}

/// Faction membership.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct FactionInfo {
    pub faction_id: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub faction_rank: Option<i32>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub hostile_factions: Vec<String>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub friendly_factions: Vec<String>,
}

/// Flavor text pool for a specific action.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct FlavorPool {
    pub action: String,
    #[cfg_attr(feature = "serde", serde(default))]
    pub messages: Vec<String>,
}

/// Dialogue line for non-combat interactions (simple / legacy).
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DialogueLine {
    pub trigger: String,
    #[cfg_attr(feature = "serde", serde(default))]
    pub lines: Vec<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub condition: Option<String>,
}

/// Dialogue option — a player response within a dialogue node.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DialogueOption {
    pub id: String,
    pub label: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub next_node_id: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub consequence_type: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub consequence_ref: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub consequence_value: Option<i32>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub required_item_refs: Vec<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub required_class: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub required_quest_status: Option<String>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub required_flags: Vec<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub set_flag: Option<String>,
}

/// Dialogue node — one beat in a conversation tree.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DialogueNode {
    pub id: String,
    pub text: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub speaker_override: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub portrait_override: Option<String>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub options: Vec<DialogueOption>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub next_node_id: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub quest_ref: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub condition: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub priority: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub trigger_on_enter: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub trigger_on_exit: Option<String>,
}

/// Dialogue tree — a full conversation graph for an NPC.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DialogueTree {
    pub entry_node_id: String,
    #[cfg_attr(feature = "serde", serde(default))]
    pub nodes: Vec<DialogueNode>,
}

/// Spawn rule — where and how this NPC appears.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SpawnRule {
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub zone: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub floor_min: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub floor_max: Option<i32>,
    pub spawn_weight: f32,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub max_active: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub level_min: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub level_max: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub respawn_time_secs: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub respawn_variance: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub despawn_time_secs: Option<i32>,
}

/// Difficulty-specific stat override.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct DifficultyOverride {
    pub mode: DifficultyMode,
    pub stats: NpcStats,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub xp_modifier: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub gold_modifier: Option<f32>,
}

/// Party-size scaling rules.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PartyScaling {
    pub enabled: bool,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub hp_per_member: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub damage_per_member: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub base_party_size: Option<i32>,
}

/// Phasing / conditional availability.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct PhaseRule {
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub phase_id: Option<i32>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub prerequisite_quest_refs: Vec<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub event_ref: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub time_start: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub time_end: Option<i32>,
}

/// Spatial / physics properties.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct SpatialProperties {
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub combat_reach: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub bounding_radius: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub walk_speed: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub run_speed: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub fly_speed: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub can_swim: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub can_fly: Option<bool>,
}

/// Interaction flags — what players can do with this NPC.
#[derive(Debug, Default, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct InteractionFlags {
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_interactable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_attackable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_targetable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_skinnable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_herbable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_mineable: Option<bool>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub is_civilian: Option<bool>,
}

/// Generic extension slot — arbitrary key-value pairs for game-specific data.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NpcExtension {
    pub key: String,
    pub value: ExtensionValue,
}

/// Extension value — mirrors the proto `oneof value`.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(untagged))]
pub enum ExtensionValue {
    String(String),
    Int(i64),
    Float(f64),
    Bool(bool),
}

// =============================================================================
// Core NPC Definition
// =============================================================================

/// Complete NPC definition — mirrors the `Npc` message in `npcdb.proto`.
#[derive(Debug, Clone, Reflect)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct NpcDef {
    // Identity
    pub id: String,
    pub slug: String,
    pub name: String,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub title: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub description: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub lore: Option<String>,

    // Classification
    pub type_flags: i32,
    #[cfg_attr(feature = "serde", serde(default))]
    pub rarity: NpcRarity,
    #[cfg_attr(feature = "serde", serde(default))]
    pub personality: Personality,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub element: Option<Element>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub tags: Vec<String>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub rank: NpcRank,
    #[cfg_attr(feature = "serde", serde(default))]
    pub family: CreatureFamily,

    // Visual
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub img: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub icon: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub pixel_density: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub scale: Option<f32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub model_ref: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub animation_set: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub sound_set: Option<String>,

    // Level & scaling
    pub level: i32,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub level_min: Option<i32>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub level_max: Option<i32>,

    // Stats
    #[cfg_attr(feature = "serde", serde(default))]
    pub stats: NpcStats,

    // Combat
    #[cfg_attr(feature = "serde", serde(default))]
    pub abilities: Vec<NpcAbility>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub weaknesses: Vec<ElementalAffinity>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub resistances: Vec<ElementalAffinity>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub status_immunities: Vec<String>,
    #[cfg_attr(feature = "serde", serde(default))]
    pub intent_weights: Vec<IntentWeight>,

    // Behavior
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub behavior: Option<BehaviorTraits>,

    // Faction
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub faction: Option<FactionInfo>,

    // Loot
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub loot: Option<LootTable>,

    // Equipment
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub equipment: Option<EquipmentLoadout>,

    // Flavor text
    #[cfg_attr(feature = "serde", serde(default))]
    pub flavor_text: Vec<FlavorPool>,

    // Dialogue
    #[cfg_attr(feature = "serde", serde(default))]
    pub dialogue: Vec<DialogueLine>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub dialogue_tree: Option<DialogueTree>,

    // Linkage
    #[cfg_attr(feature = "serde", serde(default))]
    pub quest_refs: Vec<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub shop_inventory_ref: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub kill_credit_ref: Option<String>,

    // Spawning
    #[cfg_attr(feature = "serde", serde(default))]
    pub spawn_rules: Vec<SpawnRule>,

    // Phasing
    #[cfg_attr(feature = "serde", serde(default))]
    pub phase_rules: Vec<PhaseRule>,

    // Difficulty & scaling
    #[cfg_attr(feature = "serde", serde(default))]
    pub difficulty_overrides: Vec<DifficultyOverride>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub party_scaling: Option<PartyScaling>,

    // Spatial
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub spatial: Option<SpatialProperties>,

    // Interaction
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub interaction: Option<InteractionFlags>,

    // Extensions
    #[cfg_attr(feature = "serde", serde(default))]
    pub extensions: Vec<NpcExtension>,

    // Metadata
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub credits: Option<String>,
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none")
    )]
    pub drafted: Option<bool>,
}

impl NpcDef {
    /// Check if this NPC has a given type flag set.
    pub fn has_type(&self, flag: NpcTypeFlag) -> bool {
        self.type_flags & (flag as i32) != 0
    }

    /// Check if this NPC is an enemy.
    pub fn is_enemy(&self) -> bool {
        self.has_type(NpcTypeFlag::Enemy)
    }

    /// Check if this NPC is a merchant.
    pub fn is_merchant(&self) -> bool {
        self.has_type(NpcTypeFlag::Merchant)
    }

    /// Check if this NPC is a quest giver.
    pub fn is_quest_giver(&self) -> bool {
        self.has_type(NpcTypeFlag::QuestGiver)
    }

    /// Check if this NPC is a boss (boss or miniboss).
    pub fn is_boss(&self) -> bool {
        self.has_type(NpcTypeFlag::Boss) || self.has_type(NpcTypeFlag::Miniboss)
    }
}
