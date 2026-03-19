//! Point-in-time render-ready combat snapshot.
//!
//! After `app.update()`, call [`capture`] to extract a game-agnostic snapshot
//! of the combat state. Any renderer (SVG cards, isometric HUD, web UI) can
//! consume this without importing bevy or discord types.

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::component::*;
use crate::types::{ClassType, EffectKind, Intent};

/// A point-in-time render-ready view of the combat state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatSnapshot {
    pub players: Vec<PlayerSnapshot>,
    pub enemies: Vec<EnemySnapshot>,
}

/// Player snapshot for rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
    pub armor: i32,
    pub defending: bool,
    pub effects: Vec<EffectSnapshot>,
    pub class: ClassType,
    pub alive: bool,
}

/// Enemy snapshot for rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnemySnapshot {
    pub name: String,
    pub index: u8,
    pub level: u8,
    pub hp: i32,
    pub max_hp: i32,
    pub armor: i32,
    pub intent: Intent,
    pub enraged: bool,
    pub effects: Vec<EffectSnapshot>,
    pub alive: bool,
}

/// A single effect instance for rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectSnapshot {
    pub kind: EffectKind,
    pub stacks: u8,
    pub turns_left: u8,
}

/// Extract a [`CombatSnapshot`] from the Bevy World after `app.update()`.
pub fn capture(world: &mut World) -> CombatSnapshot {
    let players = capture_players(world);
    let enemies = capture_enemies(world);
    CombatSnapshot { players, enemies }
}

fn capture_players(world: &mut World) -> Vec<PlayerSnapshot> {
    let mut players = Vec::new();
    let mut query = world.query_filtered::<(
        &CombatName,
        &Health,
        &Armor,
        &CombatStats,
        &ActiveEffects,
        &PlayerClass,
        Has<Dead>,
    ), With<PlayerTag>>();

    for (name, health, armor, stats, effects, class, is_dead) in query.iter(world) {
        players.push(PlayerSnapshot {
            name: name.0.clone(),
            hp: health.current,
            max_hp: health.max,
            armor: armor.value,
            defending: stats.defending,
            effects: snapshot_effects(effects),
            class: class.0,
            alive: !is_dead,
        });
    }
    players
}

fn capture_enemies(world: &mut World) -> Vec<EnemySnapshot> {
    let mut enemies = Vec::new();
    let mut query = world.query_filtered::<(
        &CombatName,
        &CombatIndex,
        &Health,
        &Armor,
        &EnemyAI,
        &CurrentIntent,
        &ActiveEffects,
        Has<Dead>,
    ), With<EnemyTag>>();

    for (name, idx, health, armor, ai, intent, effects, is_dead) in query.iter(world) {
        enemies.push(EnemySnapshot {
            name: name.0.clone(),
            index: idx.0,
            level: ai.level,
            hp: health.current,
            max_hp: health.max,
            armor: armor.value,
            intent: intent.0.clone(),
            enraged: ai.enraged,
            effects: snapshot_effects(effects),
            alive: !is_dead,
        });
    }
    enemies.sort_by_key(|e| e.index);
    enemies
}

fn snapshot_effects(effects: &ActiveEffects) -> Vec<EffectSnapshot> {
    effects
        .0
        .iter()
        .map(|e| EffectSnapshot {
            kind: e.kind,
            stacks: e.stacks,
            turns_left: e.turns_left,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EffectInstance, Intent, Personality};
    use crate::{BevyBattlePlugin, resource::BattleRng};
    use rand::SeedableRng;

    fn test_app() -> App {
        let mut app = App::new();
        app.add_plugins(bevy::MinimalPlugins);
        app.add_plugins(BevyBattlePlugin);
        app.world_mut().resource_mut::<BattleRng>().0 = rand::rngs::StdRng::seed_from_u64(42);
        app
    }

    fn spawn_player(app: &mut App, name: &str) -> Entity {
        app.world_mut()
            .spawn((
                Combatant,
                PlayerTag,
                CombatName(name.to_owned()),
                Health::new(50, 50),
                Armor { value: 0 },
                CombatStats::default(),
                ActiveEffects::default(),
                PlayerClass(ClassType::Warrior),
                EquippedGear::default(),
            ))
            .id()
    }

    fn spawn_enemy(app: &mut App, name: &str, idx: u8) -> Entity {
        app.world_mut()
            .spawn((
                Combatant,
                EnemyTag,
                CombatName(name.to_owned()),
                CombatIndex(idx),
                Health::new(30, 30),
                Armor { value: 2 },
                EnemyAI {
                    level: 1,
                    charged: false,
                    enraged: false,
                    first_strike: false,
                    personality: Personality::Feral,
                },
                CurrentIntent(Intent::Attack { dmg: 5 }),
                ActiveEffects(vec![EffectInstance {
                    kind: EffectKind::Poison,
                    stacks: 2,
                    turns_left: 3,
                }]),
            ))
            .id()
    }

    #[test]
    fn capture_snapshot_has_player_and_enemy() {
        let mut app = test_app();
        spawn_player(&mut app, "Hero");
        spawn_enemy(&mut app, "Goblin", 0);
        app.update();

        let snap = capture(app.world_mut());
        assert_eq!(snap.players.len(), 1);
        assert_eq!(snap.enemies.len(), 1);
        assert_eq!(snap.players[0].name, "Hero");
        assert_eq!(snap.players[0].hp, 50);
        assert!(snap.players[0].alive);
        assert_eq!(snap.enemies[0].name, "Goblin");
        assert_eq!(snap.enemies[0].hp, 30);
        assert_eq!(snap.enemies[0].armor, 2);
        assert_eq!(snap.enemies[0].index, 0);
        assert!(snap.enemies[0].alive);
    }

    #[test]
    fn snapshot_captures_effects() {
        let mut app = test_app();
        spawn_enemy(&mut app, "Slime", 0);
        app.update();

        let snap = capture(app.world_mut());
        assert_eq!(snap.enemies[0].effects.len(), 1);
        assert_eq!(snap.enemies[0].effects[0].kind, EffectKind::Poison);
        assert_eq!(snap.enemies[0].effects[0].stacks, 2);
        assert_eq!(snap.enemies[0].effects[0].turns_left, 3);
    }

    #[test]
    fn snapshot_detects_dead_entities() {
        let mut app = test_app();
        let enemy = spawn_enemy(&mut app, "Weakling", 0);
        app.world_mut().entity_mut(enemy).insert(Dead);
        app.update();

        let snap = capture(app.world_mut());
        assert!(!snap.enemies[0].alive);
    }

    #[test]
    fn snapshot_enemies_sorted_by_index() {
        let mut app = test_app();
        spawn_enemy(&mut app, "Second", 1);
        spawn_enemy(&mut app, "First", 0);
        app.update();

        let snap = capture(app.world_mut());
        assert_eq!(snap.enemies[0].name, "First");
        assert_eq!(snap.enemies[1].name, "Second");
    }

    #[test]
    fn snapshot_player_defending_flag() {
        let mut app = test_app();
        let player = spawn_player(&mut app, "Defender");
        app.world_mut()
            .entity_mut(player)
            .get_mut::<CombatStats>()
            .unwrap()
            .defending = true;
        app.update();

        let snap = capture(app.world_mut());
        assert!(snap.players[0].defending);
    }

    #[test]
    fn snapshot_is_cloneable_and_debuggable() {
        let mut app = test_app();
        spawn_player(&mut app, "Hero");
        spawn_enemy(&mut app, "Goblin", 0);
        app.update();

        let snap = capture(app.world_mut());
        let cloned = snap.clone();
        let debug = format!("{:?}", cloned);
        assert!(debug.contains("Hero"));
        assert!(debug.contains("Goblin"));
    }
}
