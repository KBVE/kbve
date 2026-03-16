#![allow(dead_code)]

use std::collections::HashMap;
use std::time::Instant;

use poise::serenity_prelude as serenity;
use serde::ser::SerializeMap;

// ── Map types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
pub struct MapPos {
    pub x: i16,
    pub y: i16,
}

impl MapPos {
    pub fn new(x: i16, y: i16) -> Self {
        Self { x, y }
    }

    /// Manhattan distance from origin (0,0) — used as difficulty depth.
    pub fn depth(&self) -> u32 {
        (self.x.unsigned_abs() as u32) + (self.y.unsigned_abs() as u32)
    }

    /// Get the adjacent position in the given direction.
    pub fn neighbor(&self, dir: Direction) -> Self {
        match dir {
            Direction::North => Self {
                x: self.x,
                y: self.y - 1,
            },
            Direction::South => Self {
                x: self.x,
                y: self.y + 1,
            },
            Direction::East => Self {
                x: self.x + 1,
                y: self.y,
            },
            Direction::West => Self {
                x: self.x - 1,
                y: self.y,
            },
        }
    }

    /// Manhattan distance to another position.
    pub fn distance(&self, other: &MapPos) -> u32 {
        ((self.x - other.x).unsigned_abs() as u32) + ((self.y - other.y).unsigned_abs() as u32)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Direction {
    North,
    South,
    East,
    West,
}

impl Direction {
    pub fn code(&self) -> &'static str {
        match self {
            Direction::North => "n",
            Direction::South => "s",
            Direction::East => "e",
            Direction::West => "w",
        }
    }

    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "n" => Some(Direction::North),
            "s" => Some(Direction::South),
            "e" => Some(Direction::East),
            "w" => Some(Direction::West),
            _ => None,
        }
    }

    pub fn opposite(&self) -> Self {
        match self {
            Direction::North => Direction::South,
            Direction::South => Direction::North,
            Direction::East => Direction::West,
            Direction::West => Direction::East,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Direction::North => "North",
            Direction::South => "South",
            Direction::East => "East",
            Direction::West => "West",
        }
    }

    pub fn emoji(&self) -> &'static str {
        match self {
            Direction::North => "\u{2B06}",
            Direction::South => "\u{2B07}",
            Direction::East => "\u{27A1}",
            Direction::West => "\u{2B05}",
        }
    }

    pub fn all() -> &'static [Direction] {
        &[
            Direction::North,
            Direction::South,
            Direction::East,
            Direction::West,
        ]
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MapTile {
    pub pos: MapPos,
    pub room_type: RoomType,
    pub name: String,
    pub description: String,
    pub exits: Vec<Direction>,
    pub visited: bool,
    pub cleared: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MapState {
    pub seed: u64,
    pub position: MapPos,
    #[serde(serialize_with = "serialize_tiles")]
    pub tiles: HashMap<MapPos, MapTile>,
    pub tiles_visited: u32,
    pub boss_positions: Vec<MapPos>,
}

// ── Serde helpers ──────────────────────────────────────────────────

/// Serialize `HashMap<MapPos, MapTile>` as a flat `Vec<MapTile>`.
fn serialize_tiles<S: serde::Serializer>(
    tiles: &HashMap<MapPos, MapTile>,
    s: S,
) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeSeq;
    let mut seq = s.serialize_seq(Some(tiles.len()))?;
    for tile in tiles.values() {
        seq.serialize_element(tile)?;
    }
    seq.end()
}

/// Serialize `HashMap<UserId, PlayerState>` with string keys.
fn serialize_players<S: serde::Serializer>(
    players: &HashMap<serenity::UserId, PlayerState>,
    s: S,
) -> Result<S::Ok, S::Error> {
    let mut map = s.serialize_map(Some(players.len()))?;
    for (uid, player) in players {
        map.serialize_entry(&uid.get().to_string(), player)?;
    }
    map.end()
}

// ── Short session ID ────────────────────────────────────────────────

/// First 8 hex characters of a UUID, used as the session identifier
/// in custom_id strings (Discord limits custom_id to 100 chars).
pub type ShortSid = String;

/// Generate a new UUID and return its 8-char hex prefix.
pub fn new_short_sid() -> (uuid::Uuid, ShortSid) {
    let id = uuid::Uuid::new_v4();
    let short = id.simple().to_string()[..8].to_owned();
    (id, short)
}

// ── Game phase ──────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum GamePhase {
    Exploring,
    Combat,
    Looting,
    Event,
    Rest,
    Merchant,
    City,
    Trap,
    Treasure,
    Hallway,
    WaitingForActions,
    GameOver(GameOverReason),
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum GameOverReason {
    Defeated,
    Escaped,
    Victory,
    Expired,
}

// ── Room types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum RoomType {
    Combat,
    Treasure,
    Trap,
    RestShrine,
    Merchant,
    Boss,
    Story,
    Hallway,
    UndergroundCity,
}

// ── Effects ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum EffectKind {
    Poison,
    Burning,
    Bleed,
    Shielded,
    Weakened,
    Stunned,
    Sharpened,
    Thorns,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EffectInstance {
    pub kind: EffectKind,
    pub stacks: u8,
    pub turns_left: u8,
}

// ── Enemy intent (telegraph) ────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum Intent {
    Attack {
        dmg: i32,
    },
    HeavyAttack {
        dmg: i32,
    },
    Defend {
        armor: i32,
    },
    Charge,
    Flee,
    Debuff {
        effect: EffectKind,
        stacks: u8,
        turns: u8,
    },
    AoeAttack {
        dmg: i32,
    },
    HealSelf {
        amount: i32,
    },
}

// ── Items ───────────────────────────────────────────────────────────

pub const MAX_INVENTORY_SLOTS: usize = 16;

pub type ItemId = String;

#[derive(Debug, Clone, serde::Serialize)]
pub enum UseEffect {
    Heal {
        amount: i32,
    },
    DamageEnemy {
        amount: i32,
    },
    ApplyEffect {
        kind: EffectKind,
        stacks: u8,
        turns: u8,
    },
    RemoveEffect {
        kind: EffectKind,
    },
    GuaranteedFlee,
    FullHeal,
    RemoveAllNegativeEffects,
    /// Rest all alive party members: heal % of max HP, clear negative effects.
    CampfireRest {
        heal_percent: u8,
    },
    /// Teleport the entire party back to the origin city tile.
    TeleportCity,
    /// Deal damage to an enemy and apply a status effect.
    DamageAndApply {
        damage: i32,
        kind: EffectKind,
        stacks: u8,
        turns: u8,
    },
    /// Revive a dead party member at a percentage of their max HP.
    ReviveAlly {
        heal_percent: u8,
    },
}

// ── Item rarity ────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
pub enum ItemRarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

#[derive(Debug, Clone)]
pub struct ItemDef {
    pub id: &'static str,
    pub name: &'static str,
    pub emoji: &'static str,
    pub description: &'static str,
    pub max_stack: u16,
    pub rarity: ItemRarity,
    pub use_effect: Option<UseEffect>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ItemStack {
    pub item_id: ItemId,
    pub qty: u16,
}

// ── Equipment / Gear ────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum EquipSlot {
    Weapon,
    Armor,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum GearSpecial {
    LifeSteal { percent: u8 },
    Thorns { damage: i32 },
    CritBonus { percent: u8 },
    DamageReduction { percent: u8 },
}

#[derive(Debug, Clone)]
pub struct GearDef {
    pub id: &'static str,
    pub name: &'static str,
    pub emoji: &'static str,
    pub slot: EquipSlot,
    pub rarity: ItemRarity,
    pub bonus_damage: i32,
    pub bonus_armor: i32,
    pub bonus_hp: i32,
    pub special: Option<GearSpecial>,
}

// ── Player class ────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum ClassType {
    Warrior,
    Rogue,
    Cleric,
}

impl ClassType {
    pub fn emoji(&self) -> &'static str {
        match self {
            ClassType::Warrior => "\u{2694}",
            ClassType::Rogue => "\u{1F5E1}",
            ClassType::Cleric => "\u{271A}",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ClassType::Warrior => "Warrior",
            ClassType::Rogue => "Rogue",
            ClassType::Cleric => "Cleric",
        }
    }
}

// ── Player state ────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct PlayerState {
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
    pub armor: i32,
    pub gold: i32,
    pub effects: Vec<EffectInstance>,
    pub inventory: Vec<ItemStack>,
    pub accuracy: f32,
    pub alive: bool,
    pub member_status: MemberStatusTag,
    pub class: ClassType,
    pub level: u8,
    pub xp: u32,
    pub xp_to_next: u32,
    pub crit_chance: f32,
    pub base_damage_bonus: i32,
    pub weapon: Option<String>,
    pub armor_gear: Option<String>,
    pub defending: bool,
    pub stunned_turns: u8,
    pub first_attack_in_combat: bool,
    pub heals_used_this_combat: u8,
    pub lifetime_kills: u32,
    pub lifetime_gold_earned: u32,
    pub lifetime_rooms_cleared: u32,
    pub lifetime_bosses_defeated: u32,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            name: "Adventurer".to_owned(),
            hp: 50,
            max_hp: 50,
            armor: 5,
            gold: 0,
            effects: Vec::new(),
            inventory: Vec::new(),
            accuracy: 1.0,
            alive: true,
            member_status: MemberStatusTag::Guest,
            class: ClassType::Warrior,
            level: 1,
            xp: 0,
            xp_to_next: 100,
            crit_chance: 0.10,
            base_damage_bonus: 0,
            weapon: None,
            armor_gear: None,
            defending: false,
            stunned_turns: 0,
            first_attack_in_combat: true,
            heals_used_this_combat: 0,
            lifetime_kills: 0,
            lifetime_gold_earned: 0,
            lifetime_rooms_cleared: 0,
            lifetime_bosses_defeated: 0,
        }
    }
}

impl PlayerState {
    /// Check if the player has a specific effect active.
    pub fn has_effect(&self, kind: &EffectKind) -> bool {
        self.effects.iter().any(|e| &e.kind == kind)
    }

    /// Get total stacks of a specific effect.
    pub fn effect_stacks(&self, kind: &EffectKind) -> u8 {
        self.effects
            .iter()
            .filter(|e| &e.kind == kind)
            .map(|e| e.stacks)
            .sum()
    }

    /// Number of occupied inventory slots (stacks with qty > 0).
    pub fn inventory_slots_used(&self) -> usize {
        self.inventory.iter().filter(|s| s.qty > 0).count()
    }

    /// Whether the inventory is at capacity.
    pub fn inventory_full(&self) -> bool {
        self.inventory_slots_used() >= MAX_INVENTORY_SLOTS
    }
}

// ── Enemy personality ───────────────────────────────────────────────

/// Personality archetype that drives flavor text selection for enemy actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Personality {
    /// Relentless, rage-fueled — loves to taunt and charge.
    Aggressive,
    /// Calculating, deceptive — comments on strategy, mocks mistakes.
    Cunning,
    /// Cowardly, desperate — panics at low HP, hesitates before attacking.
    Fearful,
    /// Silent, disciplined — minimal dialogue, matter-of-fact.
    Stoic,
    /// Bestial, instinct-driven — growls, hisses, no real speech.
    Feral,
    /// Ancient, weary — speaks in riddles, references the past.
    Ancient,
}

// ── Enemy state ─────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct EnemyState {
    pub name: String,
    pub level: u8,
    pub hp: i32,
    pub max_hp: i32,
    pub armor: i32,
    pub effects: Vec<EffectInstance>,
    pub intent: Intent,
    pub charged: bool,
    pub loot_table_id: &'static str,
    pub enraged: bool,
    pub index: u8,
    pub first_strike: bool,
    pub personality: Personality,
}

// ── Room state ──────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub enum RoomModifier {
    Fog { accuracy_penalty: f32 },
    Blessing { heal_bonus: i32 },
    Cursed { dmg_multiplier: f32 },
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum Hazard {
    Spikes {
        dmg: i32,
    },
    Gas {
        effect: EffectKind,
        stacks: u8,
        turns: u8,
    },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MerchantOffer {
    pub item_id: ItemId,
    pub price: i32,
    pub is_gear: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StoryChoice {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StoryEvent {
    pub prompt: String,
    pub choices: Vec<StoryChoice>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StoryOutcome {
    pub log_message: String,
    pub hp_change: i32,
    pub gold_change: i32,
    pub item_gain: Option<&'static str>,
    pub effect_gain: Option<(EffectKind, u8, u8)>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RoomState {
    pub index: u32,
    pub room_type: RoomType,
    pub name: String,
    pub description: String,
    pub modifiers: Vec<RoomModifier>,
    pub hazards: Vec<Hazard>,
    pub merchant_stock: Vec<MerchantOffer>,
    pub story_event: Option<StoryEvent>,
    /// Quest refs offered by NPCs in this room (city/merchant).
    pub available_quests: Vec<String>,
}

// ── Quest tracking ──────────────────────────────────────────────────

/// Status of an objective within an active quest.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ObjectiveProgress {
    pub objective_id: String,
    pub current: i32,
    pub required: i32,
}

impl ObjectiveProgress {
    pub fn is_complete(&self) -> bool {
        self.current >= self.required
    }
}

/// Status of an active quest step.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StepProgress {
    pub step_id: String,
    pub objectives: Vec<ObjectiveProgress>,
}

impl StepProgress {
    pub fn is_complete(&self) -> bool {
        self.objectives.iter().all(|o| o.is_complete())
    }
}

/// Tracks the state of a single quest for a player.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ActiveQuest {
    /// The quest ref slug (e.g. "slime-slayer").
    pub quest_ref: String,
    /// Index of the current step in the quest's step list.
    pub current_step: usize,
    /// Progress for each step (only the current step is actively tracked).
    pub steps: Vec<StepProgress>,
}

impl ActiveQuest {
    /// Whether all steps are complete.
    pub fn is_complete(&self) -> bool {
        self.steps.iter().all(|s| s.is_complete())
    }

    /// Get the current step progress, if it exists.
    pub fn current_step_progress(&self) -> Option<&StepProgress> {
        self.steps.get(self.current_step)
    }

    /// Get a mutable reference to the current step progress.
    pub fn current_step_progress_mut(&mut self) -> Option<&mut StepProgress> {
        self.steps.get_mut(self.current_step)
    }

    /// Advance to the next step if the current one is complete.
    /// Returns true if advanced, false if already at the last step or not complete.
    pub fn try_advance_step(&mut self) -> bool {
        if let Some(step) = self.steps.get(self.current_step) {
            if step.is_complete() && self.current_step + 1 < self.steps.len() {
                self.current_step += 1;
                return true;
            }
        }
        false
    }
}

/// Per-session quest journal tracking active, completed, and failed quests.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct QuestJournal {
    /// Currently active quests (max ~5 at a time for UX).
    pub active: Vec<ActiveQuest>,
    /// Refs of completed quests (persisted across sessions eventually).
    pub completed: Vec<String>,
    /// Refs of failed/abandoned quests.
    pub abandoned: Vec<String>,
}

impl QuestJournal {
    /// Find an active quest by ref.
    pub fn find_active(&self, quest_ref: &str) -> Option<&ActiveQuest> {
        self.active.iter().find(|q| q.quest_ref == quest_ref)
    }

    /// Find a mutable active quest by ref.
    pub fn find_active_mut(&mut self, quest_ref: &str) -> Option<&mut ActiveQuest> {
        self.active.iter_mut().find(|q| q.quest_ref == quest_ref)
    }

    /// Whether a quest ref is currently active.
    pub fn is_active(&self, quest_ref: &str) -> bool {
        self.active.iter().any(|q| q.quest_ref == quest_ref)
    }

    /// Whether a quest ref has been completed.
    pub fn is_completed(&self, quest_ref: &str) -> bool {
        self.completed.iter().any(|r| r == quest_ref)
    }

    /// Whether a quest ref has been abandoned.
    pub fn is_abandoned(&self, quest_ref: &str) -> bool {
        self.abandoned.iter().any(|r| r == quest_ref)
    }

    /// Remove a quest from active and move it to completed.
    pub fn complete_quest(&mut self, quest_ref: &str) {
        self.active.retain(|q| q.quest_ref != quest_ref);
        if !self.is_completed(quest_ref) {
            self.completed.push(quest_ref.to_owned());
        }
    }

    /// Remove a quest from active and move it to abandoned.
    pub fn abandon_quest(&mut self, quest_ref: &str) {
        self.active.retain(|q| q.quest_ref != quest_ref);
        if !self.is_abandoned(quest_ref) {
            self.abandoned.push(quest_ref.to_owned());
        }
    }

    /// Number of active quests.
    pub fn active_count(&self) -> usize {
        self.active.len()
    }
}

// ── Game action ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum GameAction {
    Attack,
    AttackTarget(u8),
    Defend,
    UseItem(ItemId, Option<u8>),
    Explore,
    Flee,
    Rest,
    ToggleItems,
    Buy(ItemId),
    Sell(ItemId),
    RoomChoice(u8),
    StoryChoice(usize),
    HealAlly(serenity::UserId),
    Equip(String),
    Unequip(String),
    Move(Direction),
    ViewMap,
    ViewInventory,
    Revive(serenity::UserId),
    Gift(ItemId, serenity::UserId),
    AcceptQuest(String),
    AbandonQuest(String),
    ViewQuests,
}

// ── Session mode ────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum SessionMode {
    Solo,
    Party,
}

// ── Member status tag ────────────────────────────────────────────────

/// Lightweight membership tag stored in the session.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum MemberStatusTag {
    Member { username: String },
    Guest,
}

// ── Session state ───────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionState {
    pub id: uuid::Uuid,
    pub short_id: ShortSid,
    pub owner: serenity::UserId,
    pub party: Vec<serenity::UserId>,
    pub mode: SessionMode,
    pub phase: GamePhase,
    pub channel_id: serenity::ChannelId,
    pub message_id: serenity::MessageId,
    #[serde(skip)]
    pub created_at: Instant,
    #[serde(skip)]
    pub last_action_at: Instant,
    pub turn: u32,
    #[serde(serialize_with = "serialize_players")]
    pub players: HashMap<serenity::UserId, PlayerState>,
    pub enemies: Vec<EnemyState>,
    pub room: RoomState,
    pub log: Vec<String>,
    pub show_items: bool,
    #[serde(skip)]
    pub pending_actions: HashMap<serenity::UserId, GameAction>,
    pub map: MapState,
    pub show_map: bool,
    pub show_inventory: bool,
    #[serde(skip)]
    pub pending_destination: Option<MapPos>,
    pub enemies_had_first_strike: bool,
    pub quest_journal: QuestJournal,
}

impl SessionState {
    /// Get the owner's player state (convenience for rendering).
    pub fn owner_player(&self) -> &PlayerState {
        self.players
            .get(&self.owner)
            .expect("owner must have a PlayerState")
    }

    /// Get a player's state by user ID.
    pub fn player(&self, uid: serenity::UserId) -> &PlayerState {
        self.players
            .get(&uid)
            .expect("player must exist in session")
    }

    /// Get a mutable reference to a player's state by user ID.
    pub fn player_mut(&mut self, uid: serenity::UserId) -> &mut PlayerState {
        self.players
            .get_mut(&uid)
            .expect("player must exist in session")
    }

    /// Check if all players are dead.
    pub fn all_players_dead(&self) -> bool {
        self.players.values().all(|p| !p.alive)
    }

    /// Ordered list of (UserId, &PlayerState) for roster display.
    /// Owner is always first, then party members in join order.
    pub fn roster(&self) -> Vec<(serenity::UserId, &PlayerState)> {
        let mut result = vec![(self.owner, self.owner_player())];
        for &uid in &self.party {
            if let Some(player) = self.players.get(&uid) {
                result.push((uid, player));
            }
        }
        result
    }

    /// Whether the session has any enemies alive.
    pub fn has_enemies(&self) -> bool {
        !self.enemies.is_empty()
    }

    /// Get the primary (first) enemy, if any.
    pub fn primary_enemy(&self) -> Option<&EnemyState> {
        self.enemies.first()
    }

    /// Get a mutable reference to the primary enemy.
    pub fn primary_enemy_mut(&mut self) -> Option<&mut EnemyState> {
        self.enemies.first_mut()
    }

    /// Get an enemy by index.
    pub fn enemy_at(&self, idx: u8) -> Option<&EnemyState> {
        self.enemies.iter().find(|e| e.index == idx)
    }

    /// Get a mutable enemy by index.
    pub fn enemy_at_mut(&mut self, idx: u8) -> Option<&mut EnemyState> {
        self.enemies.iter_mut().find(|e| e.index == idx)
    }

    /// Remove dead enemies and return their loot_table_ids.
    pub fn remove_dead_enemies(&mut self) -> Vec<&'static str> {
        let dead: Vec<&'static str> = self
            .enemies
            .iter()
            .filter(|e| e.hp <= 0)
            .map(|e| e.loot_table_id)
            .collect();
        self.enemies.retain(|e| e.hp > 0);
        dead
    }

    /// Get alive player IDs in roster order.
    pub fn alive_player_ids(&self) -> Vec<serenity::UserId> {
        let mut ids = Vec::new();
        if self.players.get(&self.owner).is_some_and(|p| p.alive) {
            ids.push(self.owner);
        }
        for &uid in &self.party {
            if self.players.get(&uid).is_some_and(|p| p.alive) {
                ids.push(uid);
            }
        }
        ids
    }

    /// Whether any alive enemy has the first_strike trait.
    pub fn any_enemy_has_first_strike(&self) -> bool {
        self.enemies.iter().any(|e| e.first_strike && e.hp > 0)
    }

    /// Check if all alive players have submitted pending actions.
    pub fn all_actions_submitted(&self) -> bool {
        let alive = self.alive_player_ids();
        alive
            .iter()
            .all(|uid| self.pending_actions.contains_key(uid))
    }
}

/// Create a default MapState for use in tests.
#[cfg(test)]
pub fn test_map_default() -> MapState {
    let origin = MapPos::new(0, 0);
    let mut tiles = HashMap::new();
    tiles.insert(
        origin,
        MapTile {
            pos: origin,
            room_type: RoomType::UndergroundCity,
            name: "Test City".to_owned(),
            description: "A test city.".to_owned(),
            exits: vec![
                Direction::North,
                Direction::South,
                Direction::East,
                Direction::West,
            ],
            visited: true,
            cleared: true,
        },
    );
    MapState {
        seed: 42,
        position: origin,
        tiles,
        tiles_visited: 1,
        boss_positions: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_short_sid_is_8_chars() {
        let (uuid, short) = new_short_sid();
        assert_eq!(short.len(), 8);
        assert!(uuid.simple().to_string().starts_with(&short));
    }

    #[test]
    fn new_short_sid_unique() {
        let (_, a) = new_short_sid();
        let (_, b) = new_short_sid();
        assert_ne!(a, b);
    }

    #[test]
    fn default_player_state() {
        let p = PlayerState::default();
        assert_eq!(p.hp, 50);
        assert_eq!(p.max_hp, 50);
        assert_eq!(p.armor, 5);
        assert_eq!(p.gold, 0);
        assert!(p.inventory.is_empty());
        assert!(p.effects.is_empty());
        assert!(p.alive);
        assert_eq!(p.member_status, MemberStatusTag::Guest);
        assert_eq!(p.class, ClassType::Warrior);
        assert_eq!(p.level, 1);
        assert_eq!(p.xp, 0);
        assert_eq!(p.xp_to_next, 100);
        assert!((p.crit_chance - 0.10).abs() < f32::EPSILON);
        assert_eq!(p.base_damage_bonus, 0);
        assert!(p.weapon.is_none());
        assert!(p.armor_gear.is_none());
        assert!(!p.defending);
        assert_eq!(p.stunned_turns, 0);
    }

    #[test]
    fn roster_owner_first() {
        use std::time::Instant;
        let owner = serenity::UserId::new(1);
        let member = serenity::UserId::new(2);
        let mut players = HashMap::new();
        players.insert(owner, PlayerState::default());
        players.insert(
            member,
            PlayerState {
                name: "Bob".to_owned(),
                ..PlayerState::default()
            },
        );
        let session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "test1234".to_owned(),
            owner,
            party: vec![member],
            mode: SessionMode::Party,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players,
            enemies: Vec::new(),
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };
        let roster = session.roster();
        assert_eq!(roster.len(), 2);
        assert_eq!(roster[0].0, owner);
        assert_eq!(roster[1].0, member);
    }

    #[test]
    fn class_type_labels() {
        assert_eq!(ClassType::Warrior.label(), "Warrior");
        assert_eq!(ClassType::Rogue.label(), "Rogue");
        assert_eq!(ClassType::Cleric.label(), "Cleric");
    }

    #[test]
    fn player_has_effect() {
        let mut p = PlayerState::default();
        assert!(!p.has_effect(&EffectKind::Poison));
        p.effects.push(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 2,
            turns_left: 3,
        });
        assert!(p.has_effect(&EffectKind::Poison));
        assert_eq!(p.effect_stacks(&EffectKind::Poison), 2);
    }

    #[test]
    fn session_enemy_helpers() {
        let owner = serenity::UserId::new(1);
        let mut players = HashMap::new();
        players.insert(owner, PlayerState::default());
        let mut session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "test1234".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Combat,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players,
            enemies: vec![
                EnemyState {
                    name: "Slime".to_owned(),
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
                    first_strike: false,
                    personality: Personality::Feral,
                },
                EnemyState {
                    name: "Bat".to_owned(),
                    level: 1,
                    hp: 15,
                    max_hp: 15,
                    armor: 0,
                    effects: Vec::new(),
                    intent: Intent::Attack { dmg: 4 },
                    charged: false,
                    loot_table_id: "slime",
                    enraged: false,
                    index: 1,
                    first_strike: false,
                    personality: Personality::Feral,
                },
            ],
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };

        assert!(session.has_enemies());
        assert_eq!(session.primary_enemy().unwrap().name, "Slime");
        assert_eq!(session.enemy_at(1).unwrap().name, "Bat");

        // Kill slime
        session.enemies[0].hp = 0;
        let dead = session.remove_dead_enemies();
        assert_eq!(dead.len(), 1);
        assert_eq!(dead[0], "slime");
        assert_eq!(session.enemies.len(), 1);
        assert_eq!(session.primary_enemy().unwrap().name, "Bat");
    }

    // ── Map type tests ─────────────────────────────────────────────

    #[test]
    fn map_pos_depth() {
        assert_eq!(MapPos::new(0, 0).depth(), 0);
        assert_eq!(MapPos::new(3, 4).depth(), 7);
        assert_eq!(MapPos::new(-2, 5).depth(), 7);
        assert_eq!(MapPos::new(-3, -4).depth(), 7);
    }

    #[test]
    fn map_pos_neighbor() {
        let pos = MapPos::new(2, 3);
        assert_eq!(pos.neighbor(Direction::North), MapPos::new(2, 2));
        assert_eq!(pos.neighbor(Direction::South), MapPos::new(2, 4));
        assert_eq!(pos.neighbor(Direction::East), MapPos::new(3, 3));
        assert_eq!(pos.neighbor(Direction::West), MapPos::new(1, 3));
    }

    #[test]
    fn map_pos_distance() {
        let a = MapPos::new(0, 0);
        let b = MapPos::new(3, 4);
        assert_eq!(a.distance(&b), 7);
        assert_eq!(b.distance(&a), 7);
        assert_eq!(a.distance(&a), 0);
    }

    #[test]
    fn direction_code_roundtrip() {
        for &dir in Direction::all() {
            let code = dir.code();
            let parsed = Direction::from_code(code);
            assert_eq!(parsed, Some(dir));
        }
        assert_eq!(Direction::from_code("x"), None);
    }

    #[test]
    fn direction_opposite() {
        assert_eq!(Direction::North.opposite(), Direction::South);
        assert_eq!(Direction::South.opposite(), Direction::North);
        assert_eq!(Direction::East.opposite(), Direction::West);
        assert_eq!(Direction::West.opposite(), Direction::East);
    }

    #[test]
    fn direction_labels_and_emojis() {
        assert_eq!(Direction::North.label(), "North");
        assert!(!Direction::North.emoji().is_empty());
        assert_eq!(Direction::all().len(), 4);
    }

    // ── Inventory helper tests ──────────────────────────────────────

    #[test]
    fn inventory_slots_used_empty() {
        let p = PlayerState::default();
        assert_eq!(p.inventory_slots_used(), 0);
        assert!(!p.inventory_full());
    }

    #[test]
    fn inventory_slots_used_counts_nonzero_qty() {
        let mut p = PlayerState::default();
        p.inventory.push(ItemStack {
            item_id: "potion".to_owned(),
            qty: 3,
        });
        p.inventory.push(ItemStack {
            item_id: "bomb".to_owned(),
            qty: 0,
        });
        p.inventory.push(ItemStack {
            item_id: "ward".to_owned(),
            qty: 1,
        });
        assert_eq!(p.inventory_slots_used(), 2);
        assert!(!p.inventory_full());
    }

    #[test]
    fn inventory_full_at_max_slots() {
        let mut p = PlayerState::default();
        for i in 0..MAX_INVENTORY_SLOTS {
            p.inventory.push(ItemStack {
                item_id: format!("item_{i}"),
                qty: 1,
            });
        }
        assert_eq!(p.inventory_slots_used(), MAX_INVENTORY_SLOTS);
        assert!(p.inventory_full());
    }

    #[test]
    fn inventory_full_boundary() {
        let mut p = PlayerState::default();
        // Fill to MAX - 1
        for i in 0..(MAX_INVENTORY_SLOTS - 1) {
            p.inventory.push(ItemStack {
                item_id: format!("item_{i}"),
                qty: 1,
            });
        }
        assert!(!p.inventory_full(), "should not be full at MAX-1");
        // Add one more
        p.inventory.push(ItemStack {
            item_id: "last_item".to_owned(),
            qty: 1,
        });
        assert!(p.inventory_full(), "should be full at MAX");
    }

    #[test]
    fn max_inventory_slots_is_16() {
        assert_eq!(MAX_INVENTORY_SLOTS, 16);
    }

    #[test]
    fn view_inventory_action_equality() {
        assert_eq!(GameAction::ViewInventory, GameAction::ViewInventory);
        assert_ne!(GameAction::ViewInventory, GameAction::ViewMap);
    }

    #[test]
    fn show_inventory_default_false() {
        use std::time::Instant;
        let owner = serenity::UserId::new(1);
        let mut players = HashMap::new();
        players.insert(owner, PlayerState::default());
        let session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "test1234".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players,
            enemies: Vec::new(),
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };
        assert!(!session.show_inventory);
    }

    // ── Serde serialization tests ──────────────────────────────────

    #[test]
    fn serde_session_state_round_trip() {
        use std::time::Instant;
        let owner = serenity::UserId::new(42);
        let mut players = HashMap::new();
        let mut player = PlayerState::default();
        player.name = "TestHero".to_owned();
        player.gold = 100;
        player.weapon = Some("rusty_sword".to_owned());
        player.armor_gear = Some("leather_vest".to_owned());
        player.effects.push(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 2,
            turns_left: 3,
        });
        player.inventory.push(ItemStack {
            item_id: "potion".to_owned(),
            qty: 5,
        });
        players.insert(owner, player);

        let session = SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "serde123".to_owned(),
            owner,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Combat,
            channel_id: serenity::ChannelId::new(999),
            message_id: serenity::MessageId::new(888),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 7,
            players,
            enemies: vec![EnemyState {
                name: "Goblin".to_owned(),
                level: 3,
                hp: 30,
                max_hp: 40,
                armor: 2,
                effects: Vec::new(),
                intent: Intent::HeavyAttack { dmg: 12 },
                charged: false,
                loot_table_id: "skeleton",
                enraged: false,
                index: 0,
                first_strike: false,
                personality: Personality::Fearful,
            }],
            room: super::super::content::generate_room(5),
            log: vec!["Turn begins.".to_owned(), "Goblin attacks!".to_owned()],
            show_items: true,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            show_inventory: true,
            pending_destination: Some(MapPos::new(1, 0)),
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        };

        let json = serde_json::to_string(&session).unwrap();
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();

        // Core fields present
        assert_eq!(val["short_id"], "serde123");
        assert_eq!(val["turn"], 7);
        assert_eq!(val["mode"], "Solo");
        assert_eq!(val["phase"], "Combat");
        assert_eq!(val["show_inventory"], true);

        // Players map uses string keys
        let players_obj = val["players"].as_object().unwrap();
        assert_eq!(players_obj.len(), 1);
        assert!(players_obj.contains_key("42"));
        let p = &players_obj["42"];
        assert_eq!(p["name"], "TestHero");
        assert_eq!(p["gold"], 100);
        assert_eq!(p["weapon"], "rusty_sword");
        assert_eq!(p["inventory"][0]["item_id"], "potion");
        assert_eq!(p["inventory"][0]["qty"], 5);
        assert_eq!(p["effects"][0]["kind"], "Poison");

        // Enemies
        assert_eq!(val["enemies"][0]["name"], "Goblin");
        assert_eq!(val["enemies"][0]["hp"], 30);

        // Skipped fields should be absent
        assert!(val.get("created_at").is_none());
        assert!(val.get("last_action_at").is_none());
        assert!(val.get("pending_actions").is_none());
        assert!(val.get("pending_destination").is_none());

        // Tiles serialized as array
        assert!(val["map"]["tiles"].is_array());

        // Log preserved
        assert_eq!(val["log"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn serde_gear_special_all_variants() {
        let variants = vec![
            GearSpecial::LifeSteal { percent: 20 },
            GearSpecial::Thorns { damage: 5 },
            GearSpecial::CritBonus { percent: 15 },
            GearSpecial::DamageReduction { percent: 10 },
        ];

        for variant in &variants {
            let json = serde_json::to_string(variant).unwrap();
            let val: serde_json::Value = serde_json::from_str(&json).unwrap();
            // Each variant serializes as an object with the variant name as key
            assert!(
                val.is_object(),
                "GearSpecial variant should be an object: {json}"
            );
        }

        // Verify specific field values
        let dr_json = serde_json::to_string(&GearSpecial::DamageReduction { percent: 10 }).unwrap();
        let dr_val: serde_json::Value = serde_json::from_str(&dr_json).unwrap();
        assert_eq!(dr_val["DamageReduction"]["percent"], 10);
    }

    #[test]
    fn serde_game_phase_variants() {
        let phases = vec![
            GamePhase::Exploring,
            GamePhase::Combat,
            GamePhase::Looting,
            GamePhase::Event,
            GamePhase::Rest,
            GamePhase::Merchant,
            GamePhase::GameOver(GameOverReason::Victory),
            GamePhase::GameOver(GameOverReason::Defeated),
        ];

        for phase in &phases {
            let json = serde_json::to_string(phase).unwrap();
            // Should not panic and produce valid JSON
            let _: serde_json::Value = serde_json::from_str(&json).unwrap();
        }

        // Simple variants serialize as strings
        let json = serde_json::to_string(&GamePhase::Exploring).unwrap();
        assert_eq!(json, "\"Exploring\"");

        // Nested variants serialize with data
        let json = serde_json::to_string(&GamePhase::GameOver(GameOverReason::Victory)).unwrap();
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(val["GameOver"], "Victory");
    }

    #[test]
    fn serde_map_tiles_serialized_as_array() {
        let mut tiles = HashMap::new();
        tiles.insert(
            MapPos::new(0, 0),
            MapTile {
                pos: MapPos::new(0, 0),
                room_type: RoomType::UndergroundCity,
                name: "City".to_owned(),
                description: "A city.".to_owned(),
                exits: vec![Direction::North],
                visited: true,
                cleared: true,
            },
        );
        tiles.insert(
            MapPos::new(1, 0),
            MapTile {
                pos: MapPos::new(1, 0),
                room_type: RoomType::Combat,
                name: "Arena".to_owned(),
                description: "A fight.".to_owned(),
                exits: vec![Direction::West, Direction::East],
                visited: false,
                cleared: false,
            },
        );

        let map = MapState {
            seed: 42,
            position: MapPos::new(0, 0),
            tiles,
            tiles_visited: 1,
            boss_positions: vec![MapPos::new(5, 5)],
        };

        let json = serde_json::to_string(&map).unwrap();
        let val: serde_json::Value = serde_json::from_str(&json).unwrap();

        // tiles is an array, not an object
        let tiles_arr = val["tiles"].as_array().unwrap();
        assert_eq!(tiles_arr.len(), 2);

        // Each tile has its pos embedded
        let names: Vec<&str> = tiles_arr
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"City"));
        assert!(names.contains(&"Arena"));

        // boss_positions serializes normally
        assert_eq!(val["boss_positions"][0]["x"], 5);
        assert_eq!(val["boss_positions"][0]["y"], 5);
    }

    #[test]
    fn serde_member_status_tag_variants() {
        let member = MemberStatusTag::Member {
            username: "fudster".to_owned(),
        };
        let guest = MemberStatusTag::Guest;

        let member_json = serde_json::to_string(&member).unwrap();
        let val: serde_json::Value = serde_json::from_str(&member_json).unwrap();
        assert_eq!(val["Member"]["username"], "fudster");

        let guest_json = serde_json::to_string(&guest).unwrap();
        assert_eq!(guest_json, "\"Guest\"");
    }
}
