//! Battle systems — ordered sets for turn-based combat resolution.

pub mod attack;
pub mod class_proc;
pub mod death;
pub mod defend;
pub mod effects;
pub mod enemy_turn;
pub mod flee;
pub mod initiative;

use bevy::prelude::*;

/// System ordering sets for a single combat turn.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub enum BattleSet {
    /// First-strike check (enemy initiative).
    Initiative,
    /// Player action resolution (attack, defend, use item, flee).
    PlayerAction,
    /// Death detection after player actions.
    DeathCheck,
    /// Enemy AI turn execution.
    EnemyTurn,
    /// DoT / effect tick processing.
    EffectTick,
    /// Death detection after effects.
    FinalDeathCheck,
}

/// Register all battle systems into the app.
pub fn register_systems(app: &mut App) {
    // Configure set ordering
    app.configure_sets(
        Update,
        (
            BattleSet::Initiative,
            BattleSet::PlayerAction,
            BattleSet::DeathCheck,
            BattleSet::EnemyTurn,
            BattleSet::EffectTick,
            BattleSet::FinalDeathCheck,
        )
            .chain(),
    );

    app.add_systems(
        Update,
        initiative::first_strike_system.in_set(BattleSet::Initiative),
    );

    // Player actions are mutually exclusive per turn — chain to avoid query conflicts
    app.add_systems(
        Update,
        (
            attack::attack_system,
            defend::defend_system,
            flee::flee_system,
            attack::use_item_system,
        )
            .chain()
            .in_set(BattleSet::PlayerAction),
    );

    app.add_systems(
        Update,
        death::death_check_system.in_set(BattleSet::DeathCheck),
    );

    app.add_systems(
        Update,
        enemy_turn::enemy_turn_system.in_set(BattleSet::EnemyTurn),
    );

    app.add_systems(
        Update,
        effects::tick_effects_system.in_set(BattleSet::EffectTick),
    );

    app.add_systems(
        Update,
        death::final_death_check_system.in_set(BattleSet::FinalDeathCheck),
    );
}
