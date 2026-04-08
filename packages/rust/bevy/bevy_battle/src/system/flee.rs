//! Flee resolution system.

use bevy::prelude::*;
use rand::RngExt;

use crate::component::*;
use crate::event::*;
use crate::resource::*;
use crate::types::*;

/// Resolve flee attempts. Base: 60% - 5%/depth (min 30%). Rogue +15%.
pub fn flee_system(
    mut intents: MessageReader<FleeIntent>,
    mut outcomes: MessageWriter<CombatOutcome>,
    players: Query<&PlayerClass, With<PlayerTag>>,
    mut rng: ResMut<BattleRng>,
) {
    for intent in intents.read() {
        let class = players.get(intent.entity).ok().map(|c| c.0);

        let mut flee_chance = (0.60 - 0.05 * intent.depth as f32).max(0.30);
        if class == Some(ClassType::Rogue) {
            flee_chance += 0.15;
        }

        let success = rng.0.random::<f32>() < flee_chance;
        outcomes.write(CombatOutcome::FleeResult {
            entity: intent.entity,
            success,
        });
    }
}
