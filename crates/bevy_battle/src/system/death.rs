//! Death detection systems.

use bevy::prelude::*;

use crate::component::*;
use crate::event::*;

/// Check all combatants for death (HP <= 0) and emit `CombatOutcome::Death`.
#[allow(clippy::type_complexity)]
pub fn death_check_system(
    mut commands: Commands,
    mut outcomes: MessageWriter<CombatOutcome>,
    combatants: Query<(Entity, &Health, Option<&PlayerTag>), (With<Combatant>, Without<Dead>)>,
) {
    check_deaths(&mut commands, &mut outcomes, &combatants);
}

/// Same check, runs again after effects tick to catch DoT kills.
#[allow(clippy::type_complexity)]
pub fn final_death_check_system(
    mut commands: Commands,
    mut outcomes: MessageWriter<CombatOutcome>,
    combatants: Query<(Entity, &Health, Option<&PlayerTag>), (With<Combatant>, Without<Dead>)>,
) {
    check_deaths(&mut commands, &mut outcomes, &combatants);
}

#[allow(clippy::type_complexity)]
fn check_deaths(
    commands: &mut Commands,
    outcomes: &mut MessageWriter<CombatOutcome>,
    combatants: &Query<(Entity, &Health, Option<&PlayerTag>), (With<Combatant>, Without<Dead>)>,
) {
    for (entity, hp, player_tag) in combatants.iter() {
        if hp.is_dead() {
            let is_player = player_tag.is_some();
            commands.entity(entity).insert(Dead);
            outcomes.write(CombatOutcome::Death { entity, is_player });
        }
    }
}
