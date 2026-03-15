//! First-strike initiative system.

use bevy::prelude::*;

use crate::component::*;
use crate::resource::*;

/// Check if any enemy has first-strike and hasn't fired it yet.
///
/// Sets the `FirstStrikeFired` resource flag so class procs know
/// whether first-strike blocked their opening abilities.
pub fn first_strike_system(
    enemies: Query<&EnemyAI, (With<EnemyTag>, Without<Dead>)>,
    mut first_strike: ResMut<FirstStrikeFired>,
) {
    if first_strike.0 {
        return;
    }
    let any = enemies.iter().any(|ai| ai.first_strike);
    if any {
        first_strike.0 = true;
    }
}
