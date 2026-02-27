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
        }
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
    Defend,
    UseItem(ItemId),
    Explore,
    Flee,
    Rest,
    ToggleItems,
    Buy(ItemId),
    StoryChoice(usize),
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
    pub enemy: Option<EnemyState>,
    pub room: RoomState,
    pub log: Vec<String>,
    pub show_items: bool,
    pub member_status: Option<MemberStatusTag>,
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
    }
}
