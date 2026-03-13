use avian3d::prelude::*;
use bevy::prelude::*;

use crate::component::{Player, PlayerPhysics};
use crate::config::PlayerConfig;
use crate::event::FallDamageEvent;

/// Detects ground contact via `ShapeHits` and triggers fall damage events.
///
/// Runs in `PostUpdate` after physics writeback. Reads the downward
/// `ShapeCaster` results to determine if the player is grounded, and
/// fires a [`FallDamageEvent`] when landing after exceeding the
/// configured fall damage threshold.
pub fn detect_ground(
    mut query: Query<(Entity, &ShapeHits, &mut PlayerPhysics, &Transform), With<Player>>,
    config: Res<PlayerConfig>,
    mut commands: Commands,
) {
    for (entity, hits, mut physics, transform) in &mut query {
        let was_airborne = !physics.on_ground;
        let grounded = !hits.is_empty();
        physics.on_ground = grounded;

        if grounded {
            if was_airborne {
                let fall_distance = physics.fall_start_y - transform.translation.y;
                if physics.velocity_y < 0.0 && fall_distance > config.fall_damage_threshold {
                    let damage =
                        (fall_distance - config.fall_damage_threshold) * config.fall_damage_per_unit;
                    commands.trigger(FallDamageEvent {
                        entity,
                        fall_distance,
                        damage,
                    });
                }
            }
            physics.velocity_y = 0.0;
        } else if !was_airborne {
            // Just walked off an edge.
            physics.fall_start_y = transform.translation.y;
        }
    }
}
