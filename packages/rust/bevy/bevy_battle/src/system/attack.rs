//! Player attack and item-use systems.

use bevy::prelude::*;
use rand::Rng;

use crate::component::*;
use crate::event::*;
use crate::resource::*;
use crate::types::*;

/// Resolve player attack intents.
#[allow(clippy::type_complexity)]
pub fn attack_system(
    mut intents: MessageReader<AttackIntent>,
    mut outcomes: MessageWriter<CombatOutcome>,
    mut players: Query<
        (
            &CombatName,
            &mut CombatStats,
            &PlayerClass,
            &EquippedGear,
            &mut ActiveEffects,
            &mut Health,
        ),
        (With<PlayerTag>, Without<EnemyTag>),
    >,
    mut enemies: Query<
        (
            &CombatName,
            &mut Health,
            &Armor,
            &mut ActiveEffects,
            &mut EnemyAI,
        ),
        (With<EnemyTag>, Without<PlayerTag>),
    >,
    modifiers: Res<CombatModifiers>,
    mut rng: ResMut<BattleRng>,
    first_strike: Res<FirstStrikeFired>,
) {
    for intent in intents.read() {
        let Ok((player_name, mut stats, player_class, gear, mut player_effects, mut player_health)) =
            players.get_mut(intent.attacker)
        else {
            continue;
        };

        let Ok((enemy_name, mut enemy_hp, enemy_armor, mut enemy_effects, _enemy_ai)) =
            enemies.get_mut(intent.target)
        else {
            continue;
        };

        let accuracy = stats.accuracy - modifiers.fog_accuracy_penalty;
        let base_dmg_bonus = stats.base_damage_bonus;
        let crit_chance = stats.crit_chance;
        let first_attack = stats.first_attack_in_combat;
        let class = player_class.0;
        let sharp_stacks = player_effects.stacks(&EffectKind::Sharpened);
        let is_weakened = player_effects.has(&EffectKind::Weakened);
        let first_strike_blocked = first_strike.0;

        // Base damage: 1d7 (6..=12) + bonuses
        let mut dmg = rng.0.random_range(6..=12) + base_dmg_bonus + gear.weapon_bonus_damage;

        // Sharpened bonus
        dmg += 3 * sharp_stacks as i32;

        // Weakened penalty
        if is_weakened {
            dmg = (dmg as f32 * 0.7) as i32;
        }

        // Warrior Charge
        let is_charge = class == ClassType::Warrior
            && first_attack
            && !first_strike_blocked
            && rng.0.random::<f32>() < 0.50;
        if is_charge {
            dmg += 4;
        }

        // Accuracy check
        if rng.0.random_range(0.0f32..1.0) > accuracy {
            outcomes.write(CombatOutcome::Miss {
                attacker: intent.attacker,
                target: intent.target,
            });
            stats.first_attack_in_combat = false;
            continue;
        }

        // Crit check
        let mut effective_crit = crit_chance + gear.weapon_crit_bonus;
        let is_ambush = class == ClassType::Rogue
            && first_attack
            && !first_strike_blocked
            && rng.0.random::<f32>() < 0.50;
        if is_ambush {
            effective_crit = 1.0;
        }
        let crit = rng.0.random::<f32>() < effective_crit;
        if crit {
            dmg *= 2;
        }

        // Armor reduction
        dmg = (dmg - enemy_armor.value).max(1);

        // Apply damage
        let overkill = dmg > enemy_hp.current;
        enemy_hp.take_damage(dmg);

        // Emit charge/ambush class proc BEFORE the attack outcome
        if is_charge {
            outcomes.write(CombatOutcome::ClassProc {
                entity: intent.attacker,
                proc_name: "Charge",
                detail: format!(
                    "{} spots an opening and charges into {}! {} damage!",
                    player_name.0, enemy_name.0, dmg
                ),
            });
        }
        if is_ambush && crit {
            outcomes.write(CombatOutcome::ClassProc {
                entity: intent.attacker,
                proc_name: "Ambush",
                detail: format!(
                    "{} strikes from the shadows, ambushing {}! {} damage! Critical hit!",
                    player_name.0, enemy_name.0, dmg
                ),
            });
        }

        outcomes.write(CombatOutcome::Attack {
            attacker: intent.attacker,
            target: intent.target,
            damage: dmg,
            crit,
            overkill,
        });

        // Warrior Charge stun
        if is_charge {
            enemy_effects.add(EffectInstance {
                kind: EffectKind::Stunned,
                stacks: 1,
                turns_left: 1,
            });
            outcomes.write(CombatOutcome::EffectApplied {
                target: intent.target,
                effect: EffectKind::Stunned,
                stacks: 1,
                turns: 1,
            });
        }

        // Warrior passive: 20% stagger (not on charge)
        if !is_charge && class == ClassType::Warrior && rng.0.random::<f32>() < 0.20 {
            enemy_effects.add(EffectInstance {
                kind: EffectKind::Stunned,
                stacks: 1,
                turns_left: 1,
            });
            outcomes.write(CombatOutcome::ClassProc {
                entity: intent.attacker,
                proc_name: "Stagger",
                detail: format!("{} staggers the {}!", player_name.0, enemy_name.0),
            });
        }

        // ── Class procs ─────────────────────────────────────────────
        let enemy_alive = !enemy_hp.is_dead();
        match class {
            ClassType::Warrior => {
                if rng.0.random::<f32>() < 0.15 {
                    player_effects.add(EffectInstance {
                        kind: EffectKind::Sharpened,
                        stacks: 1,
                        turns_left: 2,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Battle Fury",
                        detail: format!(
                            "{} feels a surge of battle fury! (+3 attack for 2 turns)",
                            player_name.0
                        ),
                    });
                }
                if rng.0.random::<f32>() < 0.12 {
                    player_effects.add(EffectInstance {
                        kind: EffectKind::Shielded,
                        stacks: 1,
                        turns_left: 2,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Iron Resolve",
                        detail: format!(
                            "{}'s resolve hardens like iron! (Shielded for 2 turns)",
                            player_name.0
                        ),
                    });
                }
            }
            ClassType::Rogue => {
                if enemy_alive && rng.0.random::<f32>() < 0.20 {
                    enemy_effects.add(EffectInstance {
                        kind: EffectKind::Poison,
                        stacks: 1,
                        turns_left: 3,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Envenom",
                        detail: format!(
                            "{}'s blade leaves a poisoned wound on the {}!",
                            player_name.0, enemy_name.0
                        ),
                    });
                }
                if rng.0.random::<f32>() < 0.10 {
                    player_effects.add(EffectInstance {
                        kind: EffectKind::Shielded,
                        stacks: 1,
                        turns_left: 1,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Shadow Step",
                        detail: format!(
                            "{} melts into the shadows! (Shielded for 1 turn)",
                            player_name.0
                        ),
                    });
                }
            }
            ClassType::Cleric => {
                if rng.0.random::<f32>() < 0.20 {
                    player_effects.add(EffectInstance {
                        kind: EffectKind::Shielded,
                        stacks: 1,
                        turns_left: 2,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Blessing of Light",
                        detail: format!(
                            "A divine blessing shields {}! (Shielded for 2 turns)",
                            player_name.0
                        ),
                    });
                }
                if enemy_alive && rng.0.random::<f32>() < 0.15 {
                    enemy_effects.add(EffectInstance {
                        kind: EffectKind::Weakened,
                        stacks: 1,
                        turns_left: 2,
                    });
                    outcomes.write(CombatOutcome::ClassProc {
                        entity: intent.attacker,
                        proc_name: "Holy Smite",
                        detail: format!(
                            "{}'s holy strike weakens the {}!",
                            player_name.0, enemy_name.0
                        ),
                    });
                }
            }
        }

        // Lifesteal
        if let Some(pct) = gear.weapon_lifesteal {
            let heal = (dmg as f32 * pct) as i32;
            if heal > 0 {
                let actual = player_health.heal(heal);
                if actual > 0 {
                    outcomes.write(CombatOutcome::Lifesteal {
                        entity: intent.attacker,
                        healed: actual,
                    });
                }
            }
        }

        stats.first_attack_in_combat = false;
    }
}

/// Resolve item use intents.
pub fn use_item_system(
    mut intents: MessageReader<UseItemIntent>,
    mut outcomes: MessageWriter<CombatOutcome>,
    mut combatants: Query<(&CombatName, &mut Health, &mut ActiveEffects), With<Combatant>>,
) {
    for intent in intents.read() {
        match &intent.effect {
            UseEffect::Heal { amount } => {
                if let Ok((_name, mut hp, _effects)) = combatants.get_mut(intent.user) {
                    hp.heal(*amount);
                }
            }
            UseEffect::DamageEnemy { amount } => {
                if let Some(target) = intent.target
                    && let Ok((_name, mut hp, _effects)) = combatants.get_mut(target)
                {
                    hp.take_damage(*amount);
                    outcomes.write(CombatOutcome::Attack {
                        attacker: intent.user,
                        target,
                        damage: *amount,
                        crit: false,
                        overkill: hp.is_dead(),
                    });
                }
            }
            UseEffect::ApplyEffect {
                kind,
                stacks,
                turns,
            } => {
                let target = intent.target.unwrap_or(intent.user);
                if let Ok((_name, _hp, mut effects)) = combatants.get_mut(target) {
                    effects.add(EffectInstance {
                        kind: *kind,
                        stacks: *stacks,
                        turns_left: *turns,
                    });
                    outcomes.write(CombatOutcome::EffectApplied {
                        target,
                        effect: *kind,
                        stacks: *stacks,
                        turns: *turns,
                    });
                }
            }
            UseEffect::RemoveEffect { kind } => {
                if let Ok((_name, _hp, mut effects)) = combatants.get_mut(intent.user) {
                    effects.0.retain(|e| &e.kind != kind);
                }
            }
            UseEffect::FullHeal => {
                if let Ok((_name, mut hp, _effects)) = combatants.get_mut(intent.user) {
                    hp.current = hp.max;
                }
            }
            UseEffect::RemoveAllNegativeEffects => {
                if let Ok((_name, _hp, mut effects)) = combatants.get_mut(intent.user) {
                    effects.0.retain(|e| !e.kind.is_negative());
                }
            }
            UseEffect::DamageAndApply {
                damage,
                kind,
                stacks,
                turns,
            } => {
                if let Some(target) = intent.target
                    && let Ok((_name, mut hp, mut effects)) = combatants.get_mut(target)
                {
                    hp.take_damage(*damage);
                    effects.add(EffectInstance {
                        kind: *kind,
                        stacks: *stacks,
                        turns_left: *turns,
                    });
                    outcomes.write(CombatOutcome::Attack {
                        attacker: intent.user,
                        target,
                        damage: *damage,
                        crit: false,
                        overkill: hp.is_dead(),
                    });
                    outcomes.write(CombatOutcome::EffectApplied {
                        target,
                        effect: *kind,
                        stacks: *stacks,
                        turns: *turns,
                    });
                }
            }
            // Session-level effects handled by bridge: GuaranteedFlee, CampfireRest, TeleportCity, ReviveAlly
            _ => {}
        }
    }
}
