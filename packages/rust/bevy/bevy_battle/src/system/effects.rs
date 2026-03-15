//! Effect tick system — process DoT damage, decrement durations, remove expired effects.

use bevy::prelude::*;

use crate::component::*;
use crate::event::*;

/// Tick all active effects on all combatants.
pub fn tick_effects_system(
    mut requests: MessageReader<TickEffectsRequest>,
    mut outcomes: MessageWriter<CombatOutcome>,
    mut combatants: Query<
        (Entity, &CombatName, &mut Health, &mut ActiveEffects),
        (With<Combatant>, Without<Dead>),
    >,
) {
    // Only run if a tick was requested
    let mut fired = false;
    for _ in requests.read() {
        fired = true;
    }
    if !fired {
        return;
    }

    for (entity, _name, mut hp, mut effects) in combatants.iter_mut() {
        let mut total_dot = 0i32;

        for effect in effects.0.iter_mut() {
            let dot = effect.kind.dot_per_stack() * effect.stacks as i32;
            if dot > 0 {
                total_dot += dot;
                outcomes.write(CombatOutcome::EffectTick {
                    target: entity,
                    effect: effect.kind,
                    damage: dot,
                });
            }
            effect.turns_left = effect.turns_left.saturating_sub(1);
        }

        if total_dot > 0 {
            hp.take_damage(total_dot);
        }

        let expired: Vec<_> = effects
            .0
            .iter()
            .filter(|e| e.turns_left == 0)
            .map(|e| e.kind)
            .collect();
        for kind in expired {
            outcomes.write(CombatOutcome::EffectExpired {
                target: entity,
                effect: kind,
            });
        }
        effects.0.retain(|e| e.turns_left > 0);
    }
}
