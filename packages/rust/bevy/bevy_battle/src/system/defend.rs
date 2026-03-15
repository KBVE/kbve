//! Defend action system.

use bevy::prelude::*;
use rand::Rng;

use crate::component::*;
use crate::event::*;
use crate::resource::*;
use crate::types::*;

/// Process defend intents — set defending flag and handle Cleric prayer proc.
pub fn defend_system(
    mut intents: MessageReader<DefendIntent>,
    mut outcomes: MessageWriter<CombatOutcome>,
    mut players: Query<
        (
            &CombatName,
            &mut CombatStats,
            &PlayerClass,
            &mut Health,
            &mut ActiveEffects,
        ),
        (With<PlayerTag>, Without<EnemyTag>),
    >,
    mut rng: ResMut<BattleRng>,
) {
    for intent in intents.read() {
        let Ok((name, mut stats, class, mut hp, _effects)) = players.get_mut(intent.entity) else {
            continue;
        };

        stats.defending = true;
        outcomes.write(CombatOutcome::Defend {
            entity: intent.entity,
        });

        // Cleric Prayer of Healing: 25% chance to heal 5-10 HP on defend
        if class.0 == ClassType::Cleric && rng.0.random::<f32>() < 0.25 {
            let heal_amount = rng.0.random_range(5..=10);
            let actual = hp.heal(heal_amount);
            if actual > 0 {
                outcomes.write(CombatOutcome::ClassProc {
                    entity: intent.entity,
                    proc_name: "Prayer of Healing",
                    detail: format!("{} whispers a prayer and heals for {} HP!", name.0, actual),
                });
            }
        }
    }
}
