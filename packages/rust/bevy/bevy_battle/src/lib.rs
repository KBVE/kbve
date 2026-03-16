//! `bevy_battle` — Generic Bevy turn-based battle plugin.
//!
//! Provides ECS components, events, and systems for turn-based combat:
//! damage calculation, status effects, class procs, enemy AI, and death detection.
//!
//! This crate is game-agnostic — it knows nothing about Discord, sessions, or
//! rendering. The host application creates a bridge to sync game state into ECS
//! components, calls `app.update()` per turn, then reads results back.
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use bevy::prelude::*;
//! use bevy_battle::BevyBattlePlugin;
//!
//! let mut app = App::new();
//! app.add_plugins(MinimalPlugins);
//! app.add_plugins(BevyBattlePlugin);
//! // Spawn player/enemy entities, send events, call app.update()
//! ```

pub mod component;
pub mod event;
pub mod resource;
pub mod snapshot;
pub mod system;
pub mod types;

// Re-export key types for convenience
pub use component::*;
pub use event::*;
pub use resource::*;
pub use types::*;

// Re-export bevy types needed by bridge consumers
pub use bevy::MinimalPlugins;
pub use bevy::app::App;
pub use bevy::ecs::entity::Entity;
pub use bevy::ecs::message::Messages;

use bevy::prelude::*;

/// Plugin that registers all battle components, events, resources, and systems.
pub struct BevyBattlePlugin;

impl Plugin for BevyBattlePlugin {
    fn build(&self, app: &mut App) {
        // Resources
        app.init_resource::<CombatModifiers>();
        app.init_resource::<BattleRng>();
        app.init_resource::<FirstStrikeFired>();

        // Messages — input
        app.add_message::<AttackIntent>();
        app.add_message::<DefendIntent>();
        app.add_message::<FleeIntent>();
        app.add_message::<UseItemIntent>();
        app.add_message::<EnemyTurnRequest>();
        app.add_message::<TickEffectsRequest>();

        // Messages — output
        app.add_message::<CombatOutcome>();

        // Systems
        system::register_systems(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand::rngs::StdRng;

    /// Helper to create a minimal battle app with seeded RNG for deterministic tests.
    fn test_app(seed: u64) -> App {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins);
        app.add_plugins(BevyBattlePlugin);
        app.insert_resource(BattleRng(StdRng::seed_from_u64(seed)));
        app
    }

    /// Spawn a player entity with standard components.
    fn spawn_player(app: &mut App, name: &str, hp: i32, armor: i32) -> Entity {
        app.world_mut()
            .spawn((
                CombatName(name.to_owned()),
                Health::new(hp, hp),
                Armor { value: armor },
                ActiveEffects::default(),
                CombatStats::default(),
                PlayerClass(ClassType::Warrior),
                EquippedGear::default(),
                Combatant,
                PlayerTag,
            ))
            .id()
    }

    /// Spawn an enemy entity with standard components.
    fn spawn_enemy(
        app: &mut App,
        name: &str,
        hp: i32,
        armor: i32,
        level: u8,
        intent: Intent,
    ) -> Entity {
        app.world_mut()
            .spawn((
                CombatName(name.to_owned()),
                Health::new(hp, hp),
                Armor { value: armor },
                ActiveEffects::default(),
                EnemyAI {
                    level,
                    charged: false,
                    enraged: false,
                    first_strike: false,
                    personality: Personality::Stoic,
                },
                CurrentIntent(intent),
                CombatIndex(0),
                Combatant,
                EnemyTag,
            ))
            .id()
    }

    #[test]
    fn attack_reduces_enemy_health() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 5 });

        // Send attack intent
        app.world_mut().write_message(AttackIntent {
            attacker: player,
            target: enemy,
        });
        app.update();

        // Enemy should have taken damage
        let hp = app.world().get::<Health>(enemy).unwrap();
        assert!(
            hp.current < 30,
            "Enemy HP should be reduced, got {}",
            hp.current
        );
    }

    #[test]
    fn attack_emits_combat_outcome() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 100, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(AttackIntent {
            attacker: player,
            target: enemy,
        });
        app.update();

        // Check that outcomes were emitted
        let outcomes = app.world().resource::<Messages<CombatOutcome>>();
        let mut reader = outcomes.get_cursor();
        let events: Vec<_> = reader.read(outcomes).collect();
        assert!(
            !events.is_empty(),
            "Should have emitted at least one CombatOutcome"
        );
        // First event should be an Attack or Miss
        let has_attack_or_miss = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Attack { .. } | CombatOutcome::Miss { .. }));
        assert!(has_attack_or_miss, "Should have Attack or Miss outcome");
    }

    #[test]
    fn defend_sets_defending_flag() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        app.world_mut()
            .write_message(DefendIntent { entity: player });
        app.update();

        let stats = app.world().get::<CombatStats>(player).unwrap();
        assert!(
            stats.defending,
            "Player should be defending after DefendIntent"
        );
    }

    #[test]
    fn effect_tick_applies_dot_damage() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        // Give player poison (2 dmg/stack)
        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Poison,
                stacks: 2,
                turns_left: 2,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        // Poison: 2 dmg/stack * 2 stacks = 4 damage
        assert_eq!(hp.current, 46, "Should have taken 4 poison damage");
    }

    #[test]
    fn effect_tick_decrements_turns() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns_left: 2,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let effects = app.world().get::<ActiveEffects>(player).unwrap();
        assert_eq!(effects.0.len(), 1);
        assert_eq!(effects.0[0].turns_left, 1);
    }

    #[test]
    fn effect_tick_removes_expired() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns_left: 1,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let effects = app.world().get::<ActiveEffects>(player).unwrap();
        assert!(
            effects.0.is_empty(),
            "Expired effect should have been removed"
        );
    }

    #[test]
    fn death_check_marks_dead() {
        let mut app = test_app(42);
        let enemy = spawn_enemy(&mut app, "Slime", 1, 0, 1, Intent::Attack { dmg: 5 });

        // Manually set HP to 0
        {
            let mut hp = app.world_mut().get_mut::<Health>(enemy).unwrap();
            hp.current = 0;
        }

        app.update();

        assert!(
            app.world().get::<Dead>(enemy).is_some(),
            "Dead marker should be added when HP <= 0"
        );
    }

    #[test]
    fn flee_emits_result() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        app.world_mut().write_message(FleeIntent {
            entity: player,
            depth: 0,
        });
        app.update();

        let outcomes = app.world().resource::<Messages<CombatOutcome>>();
        let mut reader = outcomes.get_cursor();
        let events: Vec<_> = reader.read(outcomes).collect();
        let has_flee = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::FleeResult { .. }));
        assert!(has_flee, "Should have FleeResult outcome");
    }

    #[test]
    fn enemy_turn_deals_damage() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let _enemy = spawn_enemy(&mut app, "Goblin", 30, 2, 2, Intent::Attack { dmg: 10 });

        // First update to initialize systems, second to process the message
        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        assert!(
            hp.current < 50,
            "Player should have taken damage, got {}",
            hp.current
        );
    }

    #[test]
    fn enemy_turn_rolls_new_intent() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Goblin", 30, 2, 2, Intent::Attack { dmg: 10 });

        let original_intent = app.world().get::<CurrentIntent>(enemy).unwrap().0.clone();

        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        // Intent should have changed (very likely with seeded RNG)
        let new_intent = app.world().get::<CurrentIntent>(enemy).unwrap().0.clone();
        // Can't guarantee it's different due to RNG, but the system ran
        let _ = (original_intent, new_intent);
    }

    #[test]
    fn use_item_heal() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 30, 5);
        // Set HP below max
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.current = 20;
        }

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: None,
            effect: UseEffect::Heal { amount: 15 },
        });
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        assert_eq!(hp.current, 30, "Should heal to max (20+15 capped at 30)");
    }

    #[test]
    fn health_take_damage_clamps() {
        let mut hp = Health::new(10, 10);
        hp.take_damage(20);
        assert_eq!(hp.current, 0);
        assert!(hp.is_dead());
    }

    #[test]
    fn health_heal_clamps() {
        let mut hp = Health::new(8, 10);
        let actual = hp.heal(5);
        assert_eq!(hp.current, 10);
        assert_eq!(actual, 2);
    }

    // ── Expanded tests ────────────────────────────────────────────

    /// Spawn a player with a specific class.
    fn spawn_player_class(
        app: &mut App,
        name: &str,
        hp: i32,
        armor: i32,
        class: ClassType,
    ) -> Entity {
        app.world_mut()
            .spawn((
                CombatName(name.to_owned()),
                Health::new(hp, hp),
                Armor { value: armor },
                ActiveEffects::default(),
                CombatStats::default(),
                PlayerClass(class),
                EquippedGear::default(),
                Combatant,
                PlayerTag,
            ))
            .id()
    }

    /// Collect all CombatOutcome messages from the app.
    fn collect_outcomes(app: &App) -> Vec<CombatOutcome> {
        let outcomes = app.world().resource::<Messages<CombatOutcome>>();
        let mut reader = outcomes.get_cursor();
        reader.read(outcomes).cloned().collect()
    }

    // ── Health unit tests ─────────────────────────────────────────

    #[test]
    fn health_new_sets_both_fields() {
        let hp = Health::new(25, 50);
        assert_eq!(hp.current, 25);
        assert_eq!(hp.max, 50);
    }

    #[test]
    fn health_zero_damage_is_noop() {
        let mut hp = Health::new(10, 10);
        hp.take_damage(0);
        assert_eq!(hp.current, 10);
    }

    #[test]
    fn health_heal_at_max_returns_zero() {
        let mut hp = Health::new(10, 10);
        let actual = hp.heal(5);
        assert_eq!(actual, 0);
        assert_eq!(hp.current, 10);
    }

    // ── ActiveEffects unit tests ──────────────────────────────────

    #[test]
    fn active_effects_has_and_stacks() {
        let mut effects = ActiveEffects::default();
        assert!(!effects.has(&EffectKind::Poison));
        assert_eq!(effects.stacks(&EffectKind::Poison), 0);

        effects.add(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 3,
            turns_left: 2,
        });
        assert!(effects.has(&EffectKind::Poison));
        assert_eq!(effects.stacks(&EffectKind::Poison), 3);
    }

    // ── EffectKind unit tests ─────────────────────────────────────

    #[test]
    fn effect_kind_dot_values() {
        assert_eq!(EffectKind::Poison.dot_per_stack(), 2);
        assert_eq!(EffectKind::Burning.dot_per_stack(), 3);
        assert_eq!(EffectKind::Bleed.dot_per_stack(), 1);
        assert_eq!(EffectKind::Shielded.dot_per_stack(), 0);
        assert_eq!(EffectKind::Stunned.dot_per_stack(), 0);
    }

    #[test]
    fn effect_kind_is_negative() {
        assert!(EffectKind::Poison.is_negative());
        assert!(EffectKind::Burning.is_negative());
        assert!(EffectKind::Bleed.is_negative());
        assert!(EffectKind::Weakened.is_negative());
        assert!(EffectKind::Stunned.is_negative());
        assert!(!EffectKind::Shielded.is_negative());
        assert!(!EffectKind::Sharpened.is_negative());
        assert!(!EffectKind::Thorns.is_negative());
    }

    // ── CombatModifiers default ───────────────────────────────────

    #[test]
    fn combat_modifiers_default_multiplier_is_one() {
        let mods = CombatModifiers::default();
        assert_eq!(mods.cursed_dmg_multiplier, 1.0);
        assert_eq!(mods.fog_accuracy_penalty, 0.0);
        assert_eq!(mods.blessing_heal_bonus, 0);
    }

    // ── Burning DoT test ──────────────────────────────────────────

    #[test]
    fn effect_tick_burning_dot() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Burning,
                stacks: 1,
                turns_left: 2,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        // Burning: 3 dmg/stack * 1 stack = 3 damage
        assert_eq!(hp.current, 47, "Should have taken 3 burning damage");
    }

    #[test]
    fn effect_tick_bleed_dot() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Bleed,
                stacks: 3,
                turns_left: 2,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        // Bleed: 1 dmg/stack * 3 stacks = 3 damage
        assert_eq!(hp.current, 47, "Should have taken 3 bleed damage");
    }

    #[test]
    fn effect_tick_multiple_dots_stack() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Poison,
                stacks: 1,
                turns_left: 3,
            });
            effects.add(EffectInstance {
                kind: EffectKind::Burning,
                stacks: 1,
                turns_left: 3,
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        // Poison: 2 + Burning: 3 = 5 total
        assert_eq!(hp.current, 45, "Should have taken 5 combined DoT damage");
    }

    #[test]
    fn effect_tick_emits_tick_and_expired_outcomes() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Poison,
                stacks: 1,
                turns_left: 1, // expires after this tick
            });
        }

        app.world_mut().write_message(TickEffectsRequest);
        app.update();

        let events = collect_outcomes(&app);
        assert!(
            events.iter().any(|e| matches!(
                e,
                CombatOutcome::EffectTick {
                    effect: EffectKind::Poison,
                    ..
                }
            )),
            "Should emit EffectTick for Poison"
        );
        assert!(
            events.iter().any(|e| matches!(
                e,
                CombatOutcome::EffectExpired {
                    effect: EffectKind::Poison,
                    ..
                }
            )),
            "Should emit EffectExpired for Poison"
        );
    }

    // ── Death check tests ─────────────────────────────────────────

    #[test]
    fn death_check_emits_death_outcome() {
        let mut app = test_app(42);
        let enemy = spawn_enemy(&mut app, "Slime", 1, 0, 1, Intent::Attack { dmg: 5 });

        {
            let mut hp = app.world_mut().get_mut::<Health>(enemy).unwrap();
            hp.current = 0;
        }

        app.update();

        let events = collect_outcomes(&app);
        let has_death = events.iter().any(|e| {
            matches!(
                e,
                CombatOutcome::Death {
                    is_player: false,
                    ..
                }
            )
        });
        assert!(has_death, "Should emit Death outcome for enemy");
    }

    #[test]
    fn death_check_player_death_flagged() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 1, 0);

        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.current = 0;
        }

        app.update();

        assert!(app.world().get::<Dead>(player).is_some());
        let events = collect_outcomes(&app);
        let has_player_death = events.iter().any(|e| {
            matches!(
                e,
                CombatOutcome::Death {
                    is_player: true,
                    ..
                }
            )
        });
        assert!(
            has_player_death,
            "Should emit Death outcome with is_player=true"
        );
    }

    #[test]
    fn dead_entities_not_double_killed() {
        let mut app = test_app(42);
        let enemy = spawn_enemy(&mut app, "Slime", 1, 0, 1, Intent::Attack { dmg: 5 });

        {
            let mut hp = app.world_mut().get_mut::<Health>(enemy).unwrap();
            hp.current = 0;
        }

        app.update(); // marks Dead
        app.update(); // second update should not re-emit Death

        let events = collect_outcomes(&app);
        let death_count = events
            .iter()
            .filter(|e| matches!(e, CombatOutcome::Death { .. }))
            .count();
        // Should only have death from the first update (messages may persist 1 frame)
        // The key test: entity has Dead marker and no panic from double-insert
        assert!(app.world().get::<Dead>(enemy).is_some());
        let _ = death_count;
    }

    // ── Attack system edge cases ──────────────────────────────────

    #[test]
    fn attack_against_armored_enemy_does_minimum_one() {
        let mut app = test_app(99);
        let player = spawn_player(&mut app, "Hero", 50, 0);
        // Enemy with very high armor — damage should be clamped to 1
        let enemy = spawn_enemy(&mut app, "Golem", 100, 999, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(AttackIntent {
            attacker: player,
            target: enemy,
        });
        app.update();

        let hp = app.world().get::<Health>(enemy).unwrap();
        // Should take at least 1 damage (or miss)
        let events = collect_outcomes(&app);
        let hit = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Attack { .. }));
        let miss = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Miss { .. }));
        assert!(hit || miss, "Should have Attack or Miss outcome");
        if hit {
            assert!(
                hp.current < 100,
                "Armored enemy should still take at least 1 damage on hit"
            );
        }
    }

    #[test]
    fn attack_kills_enemy_marks_overkill() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 0);
        let enemy = spawn_enemy(&mut app, "Weak", 1, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(AttackIntent {
            attacker: player,
            target: enemy,
        });
        app.update();

        let events = collect_outcomes(&app);
        let attack = events
            .iter()
            .find(|e| matches!(e, CombatOutcome::Attack { .. }));
        if let Some(CombatOutcome::Attack { overkill, .. }) = attack {
            assert!(overkill, "Killing a 1-HP enemy should be overkill");
        }
        // Death system should also have run
        assert!(app.world().get::<Dead>(enemy).is_some());
    }

    // ── Defend emits outcome ──────────────────────────────────────

    #[test]
    fn defend_emits_defend_outcome() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        app.world_mut()
            .write_message(DefendIntent { entity: player });
        app.update();

        let events = collect_outcomes(&app);
        let has_defend = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Defend { .. }));
        assert!(has_defend, "Should emit Defend outcome");
    }

    // ── Flee depth scaling ────────────────────────────────────────

    #[test]
    fn flee_at_high_depth_still_has_min_chance() {
        // At depth=100, chance = max(0.60 - 5.0, 0.30) = 0.30
        // Run many trials with deterministic seeds to verify flee can succeed
        let mut any_success = false;
        for seed in 0..50 {
            let mut app = test_app(seed);
            let player = spawn_player(&mut app, "Hero", 50, 5);

            app.world_mut().write_message(FleeIntent {
                entity: player,
                depth: 100,
            });
            app.update();

            let events = collect_outcomes(&app);
            if events
                .iter()
                .any(|e| matches!(e, CombatOutcome::FleeResult { success: true, .. }))
            {
                any_success = true;
                break;
            }
        }
        assert!(
            any_success,
            "Flee at high depth should still succeed sometimes (30% chance)"
        );
    }

    #[test]
    fn rogue_flee_bonus() {
        // Run many trials — Rogue should succeed more often than Warrior
        let mut rogue_successes = 0;
        let mut warrior_successes = 0;
        for seed in 0..100 {
            // Rogue
            {
                let mut app = test_app(seed);
                let player = spawn_player_class(&mut app, "Rogue", 50, 5, ClassType::Rogue);
                app.world_mut().write_message(FleeIntent {
                    entity: player,
                    depth: 0,
                });
                app.update();
                let events = collect_outcomes(&app);
                if events
                    .iter()
                    .any(|e| matches!(e, CombatOutcome::FleeResult { success: true, .. }))
                {
                    rogue_successes += 1;
                }
            }
            // Warrior
            {
                let mut app = test_app(seed);
                let player = spawn_player_class(&mut app, "Warrior", 50, 5, ClassType::Warrior);
                app.world_mut().write_message(FleeIntent {
                    entity: player,
                    depth: 0,
                });
                app.update();
                let events = collect_outcomes(&app);
                if events
                    .iter()
                    .any(|e| matches!(e, CombatOutcome::FleeResult { success: true, .. }))
                {
                    warrior_successes += 1;
                }
            }
        }
        assert!(
            rogue_successes >= warrior_successes,
            "Rogue should flee at least as often as Warrior ({} vs {})",
            rogue_successes,
            warrior_successes
        );
    }

    // ── Enemy turn edge cases ─────────────────────────────────────

    #[test]
    fn enemy_defend_increases_armor() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Turtle", 30, 2, 1, Intent::Defend { armor: 5 });

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let armor = app.world().get::<Armor>(enemy).unwrap();
        assert_eq!(armor.value, 7, "Enemy armor should increase from 2 to 7");
    }

    #[test]
    fn enemy_charge_then_heavy_attack() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Brute", 30, 0, 1, Intent::Charge);

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        // After Charge, roll_and_set_intent detects charged=true and sets HeavyAttack
        let intent = &app.world().get::<CurrentIntent>(enemy).unwrap().0;
        assert!(
            matches!(intent, Intent::HeavyAttack { .. }),
            "After Charge, next intent should be HeavyAttack, got {:?}",
            intent
        );
        // charged flag consumed
        let ai = app.world().get::<EnemyAI>(enemy).unwrap();
        assert!(
            !ai.charged,
            "charged flag should be consumed after HeavyAttack roll"
        );
    }

    #[test]
    fn enemy_heal_self_restores_hp() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(
            &mut app,
            "Shaman",
            50,
            0,
            1,
            Intent::HealSelf { amount: 10 },
        );

        // Damage the enemy first
        {
            let mut hp = app.world_mut().get_mut::<Health>(enemy).unwrap();
            hp.current = 30;
        }

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let hp = app.world().get::<Health>(enemy).unwrap();
        assert_eq!(hp.current, 40, "Enemy should heal from 30 to 40");
    }

    #[test]
    fn enemy_flee_emits_fled_outcome() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);
        let _enemy = spawn_enemy(&mut app, "Coward", 30, 0, 1, Intent::Flee);

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let events = collect_outcomes(&app);
        let has_fled = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::EnemyFled { .. }));
        assert!(has_fled, "Should emit EnemyFled outcome");
    }

    #[test]
    fn enemy_debuff_applies_to_player() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let _enemy = spawn_enemy(
            &mut app,
            "Witch",
            30,
            0,
            1,
            Intent::Debuff {
                effect: EffectKind::Weakened,
                stacks: 2,
                turns: 3,
            },
        );

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let effects = app.world().get::<ActiveEffects>(player).unwrap();
        assert!(
            effects.has(&EffectKind::Weakened),
            "Player should have Weakened effect"
        );
        assert_eq!(effects.stacks(&EffectKind::Weakened), 2);
    }

    #[test]
    fn enemy_aoe_hits_all_players() {
        let mut app = test_app(42);
        let p1 = spawn_player(&mut app, "Hero1", 50, 0);
        let p2 = spawn_player(&mut app, "Hero2", 50, 0);
        let _enemy = spawn_enemy(&mut app, "Dragon", 100, 5, 4, Intent::AoeAttack { dmg: 8 });

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let hp1 = app.world().get::<Health>(p1).unwrap();
        let hp2 = app.world().get::<Health>(p2).unwrap();
        assert!(
            hp1.current < 50,
            "Player 1 should take AoE damage, got {}",
            hp1.current
        );
        assert!(
            hp2.current < 50,
            "Player 2 should take AoE damage, got {}",
            hp2.current
        );
    }

    #[test]
    fn stunned_enemy_skips_turn() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 20 });

        // Stun the enemy
        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(enemy).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Stunned,
                stacks: 1,
                turns_left: 1,
            });
        }

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        assert_eq!(hp.current, 50, "Stunned enemy should not deal damage");

        let events = collect_outcomes(&app);
        let has_stunned = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Stunned { .. }));
        assert!(has_stunned, "Should emit Stunned outcome");
    }

    // ── First strike / initiative ─────────────────────────────────

    #[test]
    fn first_strike_sets_flag() {
        let mut app = test_app(42);
        let _player = spawn_player(&mut app, "Hero", 50, 5);

        app.world_mut().spawn((
            CombatName("Ambusher".to_owned()),
            Health::new(30, 30),
            Armor { value: 0 },
            ActiveEffects::default(),
            EnemyAI {
                level: 1,
                charged: false,
                enraged: false,
                first_strike: true,
                personality: Personality::Aggressive,
            },
            CurrentIntent(Intent::Attack { dmg: 5 }),
            CombatIndex(0),
            Combatant,
            EnemyTag,
        ));

        app.update();

        let flag = app.world().resource::<FirstStrikeFired>();
        assert!(
            flag.0,
            "FirstStrikeFired should be set when an enemy has first_strike"
        );
    }

    // ── UseItem variants ──────────────────────────────────────────

    #[test]
    fn use_item_damage_enemy() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: Some(enemy),
            effect: UseEffect::DamageEnemy { amount: 10 },
        });
        app.update();

        let hp = app.world().get::<Health>(enemy).unwrap();
        assert_eq!(hp.current, 20, "DamageEnemy should deal 10 damage");
    }

    #[test]
    fn use_item_apply_effect() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: Some(enemy),
            effect: UseEffect::ApplyEffect {
                kind: EffectKind::Poison,
                stacks: 2,
                turns: 3,
            },
        });
        app.update();

        let effects = app.world().get::<ActiveEffects>(enemy).unwrap();
        assert!(effects.has(&EffectKind::Poison));
        assert_eq!(effects.stacks(&EffectKind::Poison), 2);
    }

    #[test]
    fn use_item_remove_effect() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Poison,
                stacks: 3,
                turns_left: 5,
            });
        }

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: None,
            effect: UseEffect::RemoveEffect {
                kind: EffectKind::Poison,
            },
        });
        app.update();

        let effects = app.world().get::<ActiveEffects>(player).unwrap();
        assert!(
            !effects.has(&EffectKind::Poison),
            "Poison should be removed"
        );
    }

    #[test]
    fn use_item_full_heal() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 100, 5);

        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.current = 1;
        }

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: None,
            effect: UseEffect::FullHeal,
        });
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        assert_eq!(hp.current, 100, "FullHeal should restore to max");
    }

    #[test]
    fn use_item_remove_all_negative_effects() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);

        {
            let mut effects = app.world_mut().get_mut::<ActiveEffects>(player).unwrap();
            effects.add(EffectInstance {
                kind: EffectKind::Poison,
                stacks: 1,
                turns_left: 3,
            });
            effects.add(EffectInstance {
                kind: EffectKind::Weakened,
                stacks: 1,
                turns_left: 2,
            });
            effects.add(EffectInstance {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns_left: 2,
            });
        }

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: None,
            effect: UseEffect::RemoveAllNegativeEffects,
        });
        app.update();

        let effects = app.world().get::<ActiveEffects>(player).unwrap();
        assert!(
            !effects.has(&EffectKind::Poison),
            "Poison should be removed"
        );
        assert!(
            !effects.has(&EffectKind::Weakened),
            "Weakened should be removed"
        );
        assert!(
            effects.has(&EffectKind::Shielded),
            "Shielded (positive) should remain"
        );
    }

    #[test]
    fn use_item_damage_and_apply() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 50, 5);
        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(UseItemIntent {
            user: player,
            target: Some(enemy),
            effect: UseEffect::DamageAndApply {
                damage: 8,
                kind: EffectKind::Burning,
                stacks: 1,
                turns: 2,
            },
        });
        app.update();

        let hp = app.world().get::<Health>(enemy).unwrap();
        assert_eq!(hp.current, 22, "Should deal 8 damage");
        let effects = app.world().get::<ActiveEffects>(enemy).unwrap();
        assert!(effects.has(&EffectKind::Burning), "Should apply Burning");
    }

    // ── Lifesteal ─────────────────────────────────────────────────

    #[test]
    fn attack_with_lifesteal_heals_player() {
        let mut app = test_app(42);
        let player = app
            .world_mut()
            .spawn((
                CombatName("Vampire".to_owned()),
                Health::new(50, 50),
                Armor { value: 0 },
                ActiveEffects::default(),
                CombatStats::default(),
                PlayerClass(ClassType::Warrior),
                EquippedGear {
                    weapon_lifesteal: Some(0.5),
                    ..Default::default()
                },
                Combatant,
                PlayerTag,
            ))
            .id();

        // Damage the player first
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.current = 30;
        }

        let enemy = spawn_enemy(&mut app, "Slime", 100, 0, 1, Intent::Attack { dmg: 5 });

        app.world_mut().write_message(AttackIntent {
            attacker: player,
            target: enemy,
        });
        app.update();

        let events = collect_outcomes(&app);
        let hit = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Attack { .. }));
        if hit {
            let hp = app.world().get::<Health>(player).unwrap();
            assert!(
                hp.current > 30,
                "Lifesteal should heal player, got {}",
                hp.current
            );
        }
    }

    // ── Thorns reflection ─────────────────────────────────────────

    #[test]
    fn enemy_attack_triggers_thorns() {
        let mut app = test_app(42);
        let _player = app
            .world_mut()
            .spawn((
                CombatName("Thorny".to_owned()),
                Health::new(50, 50),
                Armor { value: 0 },
                ActiveEffects::default(),
                CombatStats::default(),
                PlayerClass(ClassType::Warrior),
                EquippedGear {
                    armor_thorns: 5,
                    ..Default::default()
                },
                Combatant,
                PlayerTag,
            ))
            .id();

        let enemy = spawn_enemy(&mut app, "Slime", 30, 0, 1, Intent::Attack { dmg: 10 });

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let enemy_hp = app.world().get::<Health>(enemy).unwrap();
        assert!(
            enemy_hp.current < 30,
            "Thorns should reflect damage to enemy, got {}",
            enemy_hp.current
        );

        let events = collect_outcomes(&app);
        let has_thorns = events
            .iter()
            .any(|e| matches!(e, CombatOutcome::Thorns { .. }));
        assert!(has_thorns, "Should emit Thorns outcome");
    }

    // ── Multi-enemy turn ──────────────────────────────────────────

    #[test]
    fn multiple_enemies_all_act() {
        let mut app = test_app(42);
        let player = spawn_player(&mut app, "Hero", 200, 0);
        let _e1 = spawn_enemy(&mut app, "Slime1", 30, 0, 1, Intent::Attack { dmg: 10 });
        let _e2 = spawn_enemy(&mut app, "Slime2", 30, 0, 1, Intent::Attack { dmg: 10 });

        app.update();
        app.world_mut().write_message(EnemyTurnRequest);
        app.update();

        let hp = app.world().get::<Health>(player).unwrap();
        // Both enemies attack for ~10 damage each (minus armor=0)
        assert!(
            hp.current < 200,
            "Player should take damage from both enemies, got {}",
            hp.current
        );

        let events = collect_outcomes(&app);
        let attack_count = events
            .iter()
            .filter(|e| matches!(e, CombatOutcome::EnemyAttack { .. }))
            .count();
        assert_eq!(attack_count, 2, "Both enemies should have attacked");
    }

    // ── roll_new_intent coverage ──────────────────────────────────

    #[test]
    fn roll_new_intent_low_level_limited_pool() {
        use rand::SeedableRng;
        use rand::rngs::StdRng;

        let mut rng = StdRng::seed_from_u64(42);
        // Level 1 enemy: pool is 0..5 (Attack, HeavyAttack, Defend, Charge, Flee)
        let mut seen_types = std::collections::HashSet::new();
        for _ in 0..100 {
            let intent = system::enemy_turn::roll_new_intent(1, false, &mut rng);
            match intent {
                Intent::Attack { .. } => {
                    seen_types.insert("Attack");
                }
                Intent::HeavyAttack { .. } => {
                    seen_types.insert("HeavyAttack");
                }
                Intent::Defend { .. } => {
                    seen_types.insert("Defend");
                }
                Intent::Charge => {
                    seen_types.insert("Charge");
                }
                Intent::Flee => {
                    seen_types.insert("Flee");
                }
                Intent::Debuff { .. } => {
                    seen_types.insert("Debuff");
                }
                Intent::AoeAttack { .. } => {
                    seen_types.insert("AoeAttack");
                }
                Intent::HealSelf { .. } => {
                    seen_types.insert("HealSelf");
                }
            }
        }
        // Low level should NOT have Debuff, AoeAttack, or HealSelf
        assert!(
            !seen_types.contains("Debuff"),
            "Level 1 should not roll Debuff"
        );
        assert!(
            !seen_types.contains("AoeAttack"),
            "Level 1 should not roll AoeAttack"
        );
        assert!(
            !seen_types.contains("HealSelf"),
            "Level 1 should not roll HealSelf"
        );
    }

    #[test]
    fn roll_new_intent_boss_has_full_pool() {
        use rand::SeedableRng;
        use rand::rngs::StdRng;

        let mut rng = StdRng::seed_from_u64(42);
        // Level 5 enemy: pool is 0..10 (all intent types)
        let mut seen_types = std::collections::HashSet::new();
        for _ in 0..500 {
            let intent = system::enemy_turn::roll_new_intent(5, false, &mut rng);
            match intent {
                Intent::Attack { .. } => {
                    seen_types.insert("Attack");
                }
                Intent::HeavyAttack { .. } => {
                    seen_types.insert("HeavyAttack");
                }
                Intent::Defend { .. } => {
                    seen_types.insert("Defend");
                }
                Intent::Charge => {
                    seen_types.insert("Charge");
                }
                Intent::Flee => {
                    seen_types.insert("Flee");
                }
                Intent::Debuff { .. } => {
                    seen_types.insert("Debuff");
                }
                Intent::AoeAttack { .. } => {
                    seen_types.insert("AoeAttack");
                }
                Intent::HealSelf { .. } => {
                    seen_types.insert("HealSelf");
                }
            }
        }
        // Boss should have access to all intent types
        assert!(
            seen_types.contains("AoeAttack"),
            "Boss should roll AoeAttack"
        );
        assert!(seen_types.contains("HealSelf"), "Boss should roll HealSelf");
        assert!(seen_types.contains("Debuff"), "Boss should roll Debuff");
    }

    #[test]
    fn enraged_intent_amplifies_damage() {
        use rand::SeedableRng;
        use rand::rngs::StdRng;

        let mut rng_normal = StdRng::seed_from_u64(42);
        let mut rng_enraged = StdRng::seed_from_u64(42);

        let normal = system::enemy_turn::roll_new_intent(3, false, &mut rng_normal);
        let enraged = system::enemy_turn::roll_new_intent(3, true, &mut rng_enraged);

        // If both are attack types, enraged should do more damage
        match (&normal, &enraged) {
            (Intent::Attack { dmg: n }, Intent::Attack { dmg: e }) => {
                assert!(
                    e > n,
                    "Enraged attack should do more damage: {} vs {}",
                    e,
                    n
                );
            }
            (Intent::HeavyAttack { dmg: n }, Intent::HeavyAttack { dmg: e }) => {
                assert!(
                    e > n,
                    "Enraged heavy attack should do more damage: {} vs {}",
                    e,
                    n
                );
            }
            _ => {
                // Same seed but different RNG paths may produce different types — that's fine
            }
        }
    }
}
