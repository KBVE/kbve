//! Core battle types — Discord-free copies of the game's combat enums.

use serde::{Deserialize, Serialize};

/// Status effect kinds that can be applied to combatants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

impl EffectKind {
    /// Damage-per-tick per stack for DoT effects. Non-DoT effects return 0.
    pub fn dot_per_stack(self) -> i32 {
        match self {
            EffectKind::Poison => 2,
            EffectKind::Burning => 3,
            EffectKind::Bleed => 1,
            _ => 0,
        }
    }

    /// Whether this effect is considered negative (can be cleansed).
    pub fn is_negative(self) -> bool {
        matches!(
            self,
            EffectKind::Poison
                | EffectKind::Burning
                | EffectKind::Bleed
                | EffectKind::Weakened
                | EffectKind::Stunned
        )
    }
}

/// A single active effect instance on an entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectInstance {
    pub kind: EffectKind,
    pub stacks: u8,
    pub turns_left: u8,
}

/// Enemy intent — telegraphed action to execute next turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Player class archetype.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ClassType {
    Warrior,
    Rogue,
    Cleric,
}

/// Gear special ability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum GearSpecial {
    LifeSteal { percent: u8 },
    Thorns { damage: i32 },
    CritBonus { percent: u8 },
    DamageReduction { percent: u8 },
}

/// Item use-effect for consumables.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    CampfireRest {
        heal_percent: u8,
    },
    TeleportCity,
    DamageAndApply {
        damage: i32,
        kind: EffectKind,
        stacks: u8,
        turns: u8,
    },
    ReviveAlly {
        heal_percent: u8,
    },
}

/// Enemy personality — drives flavor text selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Personality {
    Aggressive,
    Cunning,
    Fearful,
    Stoic,
    Feral,
    Ancient,
    Cheerful,
    Mysterious,
    Cowardly,
    Noble,
    Passive,
}
