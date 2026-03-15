//! ECS components for battle entities.

use bevy::prelude::*;

use crate::types::{ClassType, EffectInstance, Intent, Personality};

/// Health pool for any combatant.
#[derive(Component, Debug, Clone)]
pub struct Health {
    pub current: i32,
    pub max: i32,
}

impl Health {
    pub fn new(current: i32, max: i32) -> Self {
        Self { current, max }
    }

    /// Apply damage (clamped to 0). Returns actual damage dealt.
    pub fn take_damage(&mut self, amount: i32) -> i32 {
        let actual = amount.min(self.current);
        self.current = (self.current - amount).max(0);
        actual
    }

    /// Heal (clamped to max). Returns actual healing done.
    pub fn heal(&mut self, amount: i32) -> i32 {
        let before = self.current;
        self.current = (self.current + amount).min(self.max);
        self.current - before
    }

    pub fn is_dead(&self) -> bool {
        self.current <= 0
    }
}

/// Armor value — subtracted from incoming damage.
#[derive(Component, Debug, Clone)]
pub struct Armor {
    pub value: i32,
}

/// Active status effects on a combatant.
#[derive(Component, Debug, Clone, Default)]
pub struct ActiveEffects(pub Vec<EffectInstance>);

impl ActiveEffects {
    pub fn has(&self, kind: &crate::types::EffectKind) -> bool {
        self.0.iter().any(|e| &e.kind == kind)
    }

    pub fn stacks(&self, kind: &crate::types::EffectKind) -> u8 {
        self.0
            .iter()
            .filter(|e| &e.kind == kind)
            .map(|e| e.stacks)
            .sum()
    }

    pub fn add(&mut self, effect: EffectInstance) {
        self.0.push(effect);
    }
}

/// Player combat statistics.
#[derive(Component, Debug, Clone)]
pub struct CombatStats {
    pub accuracy: f32,
    pub crit_chance: f32,
    pub base_damage_bonus: i32,
    pub defending: bool,
    pub first_attack_in_combat: bool,
    pub heals_used_this_combat: u8,
}

impl Default for CombatStats {
    fn default() -> Self {
        Self {
            accuracy: 1.0,
            crit_chance: 0.10,
            base_damage_bonus: 0,
            defending: false,
            first_attack_in_combat: true,
            heals_used_this_combat: 0,
        }
    }
}

/// Player class component.
#[derive(Component, Debug, Clone)]
pub struct PlayerClass(pub ClassType);

/// Pre-computed gear bonuses for combat (avoids needing item lookups mid-combat).
#[derive(Component, Debug, Clone, Default)]
pub struct EquippedGear {
    pub weapon_bonus_damage: i32,
    pub weapon_crit_bonus: f32,
    pub weapon_lifesteal: Option<f32>,
    pub armor_damage_reduction: f32,
    pub armor_thorns: i32,
}

/// Enemy AI state.
#[derive(Component, Debug, Clone)]
pub struct EnemyAI {
    pub level: u8,
    pub charged: bool,
    pub enraged: bool,
    pub first_strike: bool,
    pub personality: Personality,
}

/// Enemy's current intent (telegraphed action).
#[derive(Component, Debug, Clone)]
pub struct CurrentIntent(pub Intent);

/// Enemy's index within the encounter (for targeting).
#[derive(Component, Debug, Clone, Copy)]
pub struct CombatIndex(pub u8);

/// Display name for combat log messages.
#[derive(Component, Debug, Clone)]
pub struct CombatName(pub String);

// ── Marker components ──────────────────────────────────────────────

/// Marker: entity participates in the current battle.
#[derive(Component, Debug, Clone, Copy)]
pub struct Combatant;

/// Marker: entity is a player.
#[derive(Component, Debug, Clone, Copy)]
pub struct PlayerTag;

/// Marker: entity is an enemy.
#[derive(Component, Debug, Clone, Copy)]
pub struct EnemyTag;

/// Marker: entity has died. Added on death, used for filtering.
#[derive(Component, Debug, Clone, Copy)]
pub struct Dead;
