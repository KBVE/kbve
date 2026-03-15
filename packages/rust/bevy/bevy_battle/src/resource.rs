//! Battle resources — turn-scoped configuration and RNG.

use bevy::prelude::*;
use rand::SeedableRng;
use rand::rngs::StdRng;

/// Room-level combat modifiers applied to the current encounter.
#[derive(Resource, Debug, Clone)]
pub struct CombatModifiers {
    /// Fog: accuracy penalty applied to all players.
    pub fog_accuracy_penalty: f32,
    /// Cursed: multiplier on enemy damage (1.0 = normal).
    pub cursed_dmg_multiplier: f32,
    /// Blessing: bonus healing (not yet used in logic).
    pub blessing_heal_bonus: i32,
}

impl Default for CombatModifiers {
    fn default() -> Self {
        Self {
            fog_accuracy_penalty: 0.0,
            cursed_dmg_multiplier: 1.0,
            blessing_heal_bonus: 0,
        }
    }
}

/// Seeded RNG resource for deterministic combat.
#[derive(Resource)]
pub struct BattleRng(pub StdRng);

impl Default for BattleRng {
    fn default() -> Self {
        Self(StdRng::from_os_rng())
    }
}

impl BattleRng {
    pub fn seeded(seed: u64) -> Self {
        Self(StdRng::seed_from_u64(seed))
    }
}

/// Flag to track whether first-strike has already fired this encounter.
#[derive(Resource, Debug, Clone, Default)]
pub struct FirstStrikeFired(pub bool);
