//! Enemy AI turn system — execute intents, roll new intents.

use bevy::prelude::*;
use rand::Rng;

use crate::component::*;
use crate::event::*;
use crate::resource::*;
use crate::types::*;

/// Execute all enemy turns when `EnemyTurnRequest` is received.
pub fn enemy_turn_system(
    mut requests: MessageReader<EnemyTurnRequest>,
    mut outcomes: MessageWriter<CombatOutcome>,
    mut enemies: Query<
        (
            Entity,
            &CombatName,
            &mut Health,
            &mut Armor,
            &mut ActiveEffects,
            &mut EnemyAI,
            &mut CurrentIntent,
        ),
        (With<EnemyTag>, Without<Dead>, Without<PlayerTag>),
    >,
    mut players: Query<
        (
            Entity,
            &CombatName,
            &mut Health,
            &Armor,
            &mut CombatStats,
            &mut ActiveEffects,
            &EquippedGear,
        ),
        (With<PlayerTag>, Without<Dead>, Without<EnemyTag>),
    >,
    modifiers: Res<CombatModifiers>,
    mut rng: ResMut<BattleRng>,
) {
    let mut fired = false;
    for _ in requests.read() {
        fired = true;
    }
    if !fired {
        return;
    }

    // Snapshot enemy data to avoid borrow conflicts
    let enemy_data: Vec<_> = enemies
        .iter()
        .map(|(e, name, hp, armor, effects, ai, intent)| {
            (
                e,
                name.0.clone(),
                hp.current,
                hp.max,
                armor.value,
                effects.has(&EffectKind::Stunned),
                effects.has(&EffectKind::Weakened),
                ai.enraged,
                ai.charged,
                ai.level,
                intent.0.clone(),
            )
        })
        .collect();

    // Snapshot alive players
    let alive_players: Vec<_> = players
        .iter()
        .map(|(e, name, _hp, armor, stats, effects, gear)| {
            (
                e,
                name.0.clone(),
                armor.value,
                effects.has(&EffectKind::Shielded),
                stats.defending,
                gear.armor_damage_reduction,
                gear.armor_thorns,
            )
        })
        .collect();

    if alive_players.is_empty() {
        return;
    }

    let cursed_mult = modifiers.cursed_dmg_multiplier;

    for (
        enemy_entity,
        _enemy_name,
        _enemy_hp,
        _enemy_max_hp,
        _enemy_armor_val,
        is_stunned,
        is_weakened,
        is_enraged,
        _is_charged,
        _enemy_level,
        current_intent,
    ) in &enemy_data
    {
        if *is_stunned {
            outcomes.write(CombatOutcome::Stunned {
                entity: *enemy_entity,
            });
            if let Ok((_, _, _, _, _, mut ai, mut intent)) = enemies.get_mut(*enemy_entity) {
                roll_and_set_intent(&mut ai, &mut intent, &mut rng.0);
            }
            continue;
        }

        let target_idx = rng.0.random_range(0..alive_players.len());
        let (
            target_entity,
            _target_name,
            target_armor,
            target_shielded,
            target_defending,
            target_dr,
            target_thorns_gear,
        ) = &alive_players[target_idx];

        match current_intent {
            Intent::Attack { dmg } | Intent::HeavyAttack { dmg } => {
                let is_heavy = matches!(current_intent, Intent::HeavyAttack { .. });
                let mut base = (*dmg - target_armor).max(1);
                if *is_enraged {
                    base = (base as f32 * 1.5) as i32;
                }
                let actual = (base as f32 * cursed_mult).round() as i32;
                let mut final_dmg = if *target_shielded { actual / 2 } else { actual };
                if *is_weakened {
                    final_dmg = (final_dmg as f32 * 0.7) as i32;
                }
                if *target_defending {
                    final_dmg /= 2;
                }
                if *target_dr > 0.0 {
                    final_dmg = ((final_dmg as f32) * (1.0 - target_dr)).ceil() as i32;
                    final_dmg = final_dmg.max(1);
                }

                if let Ok((_, _, mut hp, _, _, _, _)) = players.get_mut(*target_entity) {
                    hp.take_damage(final_dmg);
                }

                outcomes.write(CombatOutcome::EnemyAttack {
                    attacker: *enemy_entity,
                    target: *target_entity,
                    damage: final_dmg,
                    is_heavy,
                });

                // Thorns
                if let Ok((_, _, _, _, _, effects, _)) = players.get(*target_entity) {
                    let effect_thorns = effects.stacks(&EffectKind::Thorns) as i32;
                    let total = *target_thorns_gear + effect_thorns;
                    if total > 0 {
                        if let Ok((_, _, mut ehp, _, _, _, _)) = enemies.get_mut(*enemy_entity) {
                            ehp.take_damage(total);
                            outcomes.write(CombatOutcome::Thorns {
                                target: *enemy_entity,
                                reflected: total,
                            });
                        }
                    }
                }
            }
            Intent::Defend { armor } => {
                if let Ok((_, _, _, mut e_armor, _, _, _)) = enemies.get_mut(*enemy_entity) {
                    e_armor.value += armor;
                }
                outcomes.write(CombatOutcome::EnemyDefend {
                    entity: *enemy_entity,
                    armor_gained: *armor,
                });
            }
            Intent::Charge => {
                if let Ok((_, _, _, _, _, mut ai, _)) = enemies.get_mut(*enemy_entity) {
                    ai.charged = true;
                }
            }
            Intent::Flee => {
                outcomes.write(CombatOutcome::EnemyFled {
                    entity: *enemy_entity,
                });
            }
            Intent::Debuff {
                effect,
                stacks,
                turns,
            } => {
                if let Ok((_, _, _, _, _, mut p_effects, _)) = players.get_mut(*target_entity) {
                    p_effects.add(EffectInstance {
                        kind: *effect,
                        stacks: *stacks,
                        turns_left: *turns,
                    });
                }
                outcomes.write(CombatOutcome::EnemyDebuff {
                    attacker: *enemy_entity,
                    target: *target_entity,
                    effect: *effect,
                    stacks: *stacks,
                    turns: *turns,
                });
            }
            Intent::AoeAttack { dmg } => {
                let mut per_target = Vec::new();
                for (pe, _, p_armor, p_shielded, p_defending, p_dr, _) in &alive_players {
                    let mut actual = (*dmg - p_armor).max(1);
                    if *p_shielded || *p_defending {
                        actual /= 2;
                    }
                    if *p_dr > 0.0 {
                        actual = ((actual as f32) * (1.0 - p_dr)).ceil() as i32;
                        actual = actual.max(1);
                    }
                    if let Ok((_, _, mut hp, _, _, _, _)) = players.get_mut(*pe) {
                        hp.take_damage(actual);
                    }
                    per_target.push((*pe, actual));
                }
                outcomes.write(CombatOutcome::EnemyAoe {
                    attacker: *enemy_entity,
                    per_target,
                });
            }
            Intent::HealSelf { amount } => {
                if let Ok((_, _, mut hp, _, _, _, _)) = enemies.get_mut(*enemy_entity) {
                    let healed = hp.heal(*amount);
                    outcomes.write(CombatOutcome::EnemyHeal {
                        entity: *enemy_entity,
                        healed,
                    });
                }
            }
        }

        // Roll new intent
        if let Ok((_, _, _, _, _, mut ai, mut intent)) = enemies.get_mut(*enemy_entity) {
            roll_and_set_intent(&mut ai, &mut intent, &mut rng.0);
        }
    }
}

fn roll_and_set_intent(ai: &mut EnemyAI, intent: &mut CurrentIntent, rng: &mut impl Rng) {
    if ai.charged {
        ai.charged = false;
        let mut heavy_dmg = 12 + ai.level as i32 * 3;
        if ai.enraged {
            heavy_dmg = (heavy_dmg as f32 * 1.5) as i32;
        }
        intent.0 = Intent::HeavyAttack { dmg: heavy_dmg };
    } else {
        intent.0 = roll_new_intent(ai.level, ai.enraged, rng);
    }
}

/// Generate a random intent based on enemy level tier.
pub fn roll_new_intent(level: u8, is_enraged: bool, rng: &mut impl Rng) -> Intent {
    let mut intent = if level >= 4 {
        match rng.random_range(0..10) {
            0 => Intent::Attack {
                dmg: 5 + level as i32,
            },
            1 => Intent::HeavyAttack {
                dmg: 8 + level as i32 * 2,
            },
            2 => Intent::Defend { armor: 3 },
            3 => Intent::Charge,
            4 => Intent::Flee,
            5 => {
                if rng.random_bool(0.5) {
                    Intent::Debuff {
                        effect: EffectKind::Weakened,
                        stacks: 1,
                        turns: rng.random_range(2..=3),
                    }
                } else {
                    Intent::Debuff {
                        effect: EffectKind::Poison,
                        stacks: 1,
                        turns: rng.random_range(2..=3),
                    }
                }
            }
            6 => Intent::Debuff {
                effect: EffectKind::Burning,
                stacks: 1,
                turns: 2,
            },
            7 => Intent::AoeAttack {
                dmg: rng.random_range(4..=7),
            },
            8 | 9 => Intent::HealSelf {
                amount: rng.random_range(8..=15),
            },
            _ => Intent::Attack {
                dmg: 5 + level as i32,
            },
        }
    } else if level >= 2 {
        match rng.random_range(0..7) {
            0 => Intent::Attack {
                dmg: 5 + level as i32,
            },
            1 => Intent::HeavyAttack {
                dmg: 8 + level as i32 * 2,
            },
            2 => Intent::Defend { armor: 3 },
            3 => Intent::Charge,
            4 => Intent::Flee,
            5 => {
                if rng.random_bool(0.5) {
                    Intent::Debuff {
                        effect: EffectKind::Weakened,
                        stacks: 1,
                        turns: rng.random_range(2..=3),
                    }
                } else {
                    Intent::Debuff {
                        effect: EffectKind::Poison,
                        stacks: 1,
                        turns: rng.random_range(2..=3),
                    }
                }
            }
            6 => Intent::Debuff {
                effect: EffectKind::Burning,
                stacks: 1,
                turns: 2,
            },
            _ => Intent::Attack {
                dmg: 5 + level as i32,
            },
        }
    } else {
        match rng.random_range(0..5) {
            0 => Intent::Attack {
                dmg: rng.random_range(5..=8),
            },
            1 => Intent::HeavyAttack {
                dmg: rng.random_range(8..=12),
            },
            2 => Intent::Defend { armor: 3 },
            3 => Intent::Charge,
            _ => Intent::Flee,
        }
    };

    if is_enraged {
        intent = match intent {
            Intent::Attack { dmg } => Intent::Attack {
                dmg: (dmg as f32 * 1.5) as i32,
            },
            Intent::HeavyAttack { dmg } => Intent::HeavyAttack {
                dmg: (dmg as f32 * 1.5) as i32,
            },
            Intent::AoeAttack { dmg } => Intent::AoeAttack {
                dmg: (dmg as f32 * 1.5) as i32,
            },
            other => other,
        };
    }

    intent
}
