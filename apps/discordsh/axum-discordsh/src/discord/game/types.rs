#![allow(dead_code)]

use std::collections::HashMap;
use std::time::Instant;

use poise::serenity_prelude as serenity;

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

#[derive(Debug, Clone, PartialEq)]
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

#[derive(Debug, Clone, PartialEq)]
pub enum GameOverReason {
    Defeated,
    Escaped,
    Victory,
    Expired,
}

// ── Room types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
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

// ── Enemy intent (telegraph) ────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Intent {
    Attack { dmg: i32 },
    HeavyAttack { dmg: i32 },
    Defend { armor: i32 },
    Charge,
    Flee,
}

// ── Effects ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
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

#[derive(Debug, Clone)]
pub struct EffectInstance {
    pub kind: EffectKind,
    pub stacks: u8,
    pub turns_left: u8,
}

// ── Items ───────────────────────────────────────────────────────────

pub type ItemId = String;

#[derive(Debug, Clone)]
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
}

// ── Item rarity ────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
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

#[derive(Debug, Clone)]
pub struct ItemStack {
    pub item_id: ItemId,
    pub qty: u16,
}

// ── Equipment / Gear ────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum EquipSlot {
    Weapon,
    Armor,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GearSpecial {
    LifeSteal { percent: u8 },
    Thorns { damage: i32 },
    CritBonus { percent: u8 },
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

#[derive(Debug, Clone, PartialEq)]
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

#[derive(Debug, Clone)]
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
}

// ── Enemy state ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
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
}

// ── Room state ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum RoomModifier {
    Fog { accuracy_penalty: f32 },
    Blessing { heal_bonus: i32 },
    Cursed { dmg_multiplier: f32 },
}

#[derive(Debug, Clone)]
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

#[derive(Debug, Clone)]
pub struct MerchantOffer {
    pub item_id: ItemId,
    pub price: i32,
    pub is_gear: bool,
}

#[derive(Debug, Clone)]
pub struct StoryChoice {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct StoryEvent {
    pub prompt: String,
    pub choices: Vec<StoryChoice>,
}

#[derive(Debug, Clone)]
pub struct StoryOutcome {
    pub log_message: String,
    pub hp_change: i32,
    pub gold_change: i32,
    pub item_gain: Option<&'static str>,
    pub effect_gain: Option<(EffectKind, u8, u8)>,
}

#[derive(Debug, Clone)]
pub struct RoomState {
    pub index: u32,
    pub room_type: RoomType,
    pub name: String,
    pub description: String,
    pub modifiers: Vec<RoomModifier>,
    pub hazards: Vec<Hazard>,
    pub merchant_stock: Vec<MerchantOffer>,
    pub story_event: Option<StoryEvent>,
}

// ── Game action ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum GameAction {
    Attack,
    AttackTarget(u8),
    Defend,
    UseItem(ItemId),
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
}

// ── Session mode ────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum SessionMode {
    Solo,
    Party,
}

// ── Member status tag ────────────────────────────────────────────────

/// Lightweight membership tag stored in the session.
#[derive(Debug, Clone, PartialEq)]
pub enum MemberStatusTag {
    Member { username: String },
    Guest,
}

// ── Session state ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SessionState {
    pub id: uuid::Uuid,
    pub short_id: ShortSid,
    pub owner: serenity::UserId,
    pub party: Vec<serenity::UserId>,
    pub mode: SessionMode,
    pub phase: GamePhase,
    pub channel_id: serenity::ChannelId,
    pub message_id: serenity::MessageId,
    pub created_at: Instant,
    pub last_action_at: Instant,
    pub turn: u32,
    pub players: HashMap<serenity::UserId, PlayerState>,
    pub enemies: Vec<EnemyState>,
    pub room: RoomState,
    pub log: Vec<String>,
    pub show_items: bool,
    pub pending_actions: HashMap<serenity::UserId, GameAction>,
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

    /// Check if all alive players have submitted pending actions.
    pub fn all_actions_submitted(&self) -> bool {
        let alive = self.alive_player_ids();
        alive
            .iter()
            .all(|uid| self.pending_actions.contains_key(uid))
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
                },
            ],
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
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
}
