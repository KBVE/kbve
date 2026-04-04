//! Adaptive physics LOD — adds/removes collision components based on
//! distance to the nearest player. Saves physics budget for creatures
//! that are far away.
//!
//! | Tier      | Distance | Components                            |
//! |-----------|----------|---------------------------------------|
//! | Ghost     | > sensor | None (pure visual)                    |
//! | Sensor    | kin–sen  | Sensor + Collider::capsule            |
//! | Kinematic | < kin    | RigidBody::Kinematic + Collider       |

use avian3d::prelude::*;
use bevy::prelude::*;

use super::super::creature::Creature;
use super::types::{SpriteCreatureMarker, SpriteCreatureTypes};
use crate::game::player::Player;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Current physics LOD tier for a generic creature.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum PhysicsLod {
    #[default]
    Ghost,
    Sensor,
    Kinematic,
}

/// Cached player proximity data, updated by the physics LOD system.
/// Read by the behavior tree dispatch to avoid re-querying players.
#[derive(Component, Default)]
pub struct PlayerProximity {
    /// Distance to the nearest player (f32::MAX if no players).
    pub distance: f32,
    /// Direction from creature toward nearest player (unnormalized).
    pub direction: Vec3,
}

/// Per-creature-type physics LOD configuration.
#[derive(Clone, Debug)]
pub struct PhysicsLodConfig {
    /// Distance threshold for full kinematic physics.
    pub kinematic_radius: f32,
    /// Distance threshold for sensor-only detection.
    pub sensor_radius: f32,
    /// Capsule collider radius.
    pub collider_radius: f32,
    /// Capsule collider half-height.
    pub collider_half_height: f32,
}

impl Default for PhysicsLodConfig {
    fn default() -> Self {
        Self {
            kinematic_radius: 10.0,
            sensor_radius: 20.0,
            collider_radius: 0.4,
            collider_half_height: 0.6,
        }
    }
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/// Timer resource to throttle LOD updates (every 0.5s, not every frame).
#[derive(Resource)]
pub struct PhysicsLodTimer(pub Timer);

impl Default for PhysicsLodTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(0.5, TimerMode::Repeating))
    }
}

/// Update physics LOD tiers based on distance to nearest player.
/// Adds/removes avian3d components as creatures move between tiers.
pub fn update_physics_lod(
    time: Res<Time>,
    mut timer: ResMut<PhysicsLodTimer>,
    types: Res<SpriteCreatureTypes>,
    player_q: Query<&Transform, With<Player>>,
    mut commands: Commands,
    mut creature_q: Query<(
        Entity,
        &Creature,
        &SpriteCreatureMarker,
        &mut PhysicsLod,
        &mut PlayerProximity,
    )>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    let player_positions: Vec<Vec3> = player_q.iter().map(|t| t.translation).collect();
    if player_positions.is_empty() {
        return;
    }

    for (entity, cr, marker, mut lod, mut proximity) in &mut creature_q {
        // Skip pooled creatures
        if cr.anchor.y < -50.0 {
            if *lod != PhysicsLod::Ghost {
                demote_to_ghost(entity, &mut commands);
                *lod = PhysicsLod::Ghost;
            }
            proximity.distance = f32::MAX;
            proximity.direction = Vec3::ZERO;
            continue;
        }

        // Find nearest player distance + direction
        let (nearest_dist, nearest_dir) = player_positions
            .iter()
            .map(|p| {
                let diff = *p - cr.anchor;
                (diff.length(), diff)
            })
            .min_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((f32::MAX, Vec3::ZERO));

        proximity.distance = nearest_dist;
        proximity.direction = nearest_dir;

        let Some(ctype) = types.types.iter().find(|t| t.npc_ref == marker.type_key) else {
            continue;
        };
        let Some(ref phys) = ctype.physics_lod else {
            continue;
        };

        let target_lod = if nearest_dist <= phys.kinematic_radius {
            PhysicsLod::Kinematic
        } else if nearest_dist <= phys.sensor_radius {
            PhysicsLod::Sensor
        } else {
            PhysicsLod::Ghost
        };

        if target_lod == *lod {
            continue;
        }

        // Transition LOD
        match (*lod, target_lod) {
            (PhysicsLod::Ghost, PhysicsLod::Sensor) => {
                commands.entity(entity).insert((
                    Collider::capsule(phys.collider_radius, phys.collider_half_height * 2.0),
                    Sensor,
                ));
            }
            (PhysicsLod::Ghost, PhysicsLod::Kinematic) => {
                commands.entity(entity).insert((
                    RigidBody::Kinematic,
                    Collider::capsule(phys.collider_radius, phys.collider_half_height * 2.0),
                    Sensor,
                ));
            }
            (PhysicsLod::Sensor, PhysicsLod::Kinematic) => {
                commands.entity(entity).insert(RigidBody::Kinematic);
            }
            (PhysicsLod::Kinematic, PhysicsLod::Sensor) => {
                commands.entity(entity).remove::<RigidBody>();
            }
            (PhysicsLod::Kinematic, PhysicsLod::Ghost) => {
                demote_to_ghost(entity, &mut commands);
            }
            (PhysicsLod::Sensor, PhysicsLod::Ghost) => {
                commands.entity(entity).remove::<(Collider, Sensor)>();
            }
            _ => {}
        }

        *lod = target_lod;
    }
}

fn demote_to_ghost(entity: Entity, commands: &mut Commands) {
    commands
        .entity(entity)
        .remove::<(RigidBody, Collider, Sensor)>();
}
