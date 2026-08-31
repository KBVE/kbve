//! Headless butterfly simulation — flight state machine.
//!
//! Runs identically on client and server. NO rendering code (no billboard
//! facing, no material alpha, no wing flap scale).

use bevy::prelude::*;

use super::ambient_types::*;
use super::common::{GameTime, day_factor, flutter_offset, hash_f32};
use super::simulate::SimulationCenter;
use super::types::{Creature, CreatureState};
use crate::terrain::TerrainMap;

/// NPC ref slug.
const NPC_REF: &str = "woodland-butterfly";

/// Minimum height above terrain surface.
const MIN_FLY_HEIGHT: f32 = 0.8;
/// Maximum additional height above MIN_FLY_HEIGHT.
const MAX_FLY_HEIGHT_EXTRA: f32 = 1.5;
/// XZ distance from center that triggers exit flight.
const EXIT_TRIGGER: f32 = 18.0;
/// Radius at which entering butterflies spawn.
const ENTER_RADIUS: f32 = 22.0;
/// Flight speed during entry (units/sec).
const ENTER_SPEED: f32 = 2.5;
/// Flight speed during exit (units/sec).
const EXIT_SPEED: f32 = 3.0;
/// Total distance traveled while exiting.
const EXIT_DISTANCE: f32 = 10.0;

/// Advance butterfly flight state machine. Writes to Transform::translation.
/// NO billboard facing, material alpha, or wing flap scale.
pub fn simulate_butterflies(
    time: Res<Time>,
    game_time: Res<GameTime>,
    sim_center: Res<SimulationCenter>,
    mut terrain: ResMut<TerrainMap>,
    mut bfly_q: Query<
        (&mut Transform, &mut Creature, &mut ButterflySimState),
        With<AmbientCreatureMarker>,
    >,
) {
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let df = day_factor(game_time.hour);
    let center = sim_center.0;

    // Daytime check
    if df < 0.01 {
        for (mut tf, _, mut bs) in &mut bfly_q {
            if bs.flight_state != ButterflyFlightState::Idle {
                bs.flight_state = ButterflyFlightState::Idle;
                bs.idle_cooldown = 1.0 + hash_f32((bs.flap_speed * 10000.0) as u32) * 2.0;
            }
            tf.translation.y = -100.0;
        }
        return;
    }

    for (mut tf, mut cr, mut bs) in &mut bfly_q {
        if cr.npc_ref != NPC_REF {
            continue;
        }

        let mut state = bs.flight_state;

        match state {
            ButterflyFlightState::Idle => {
                tf.translation.y = -100.0;
                bs.idle_cooldown -= dt;
                if bs.idle_cooldown <= 0.0 {
                    let seed = (cr.phase * 10000.0) as u32 + (t * 7.1) as u32;
                    let theta = hash_f32(seed) * std::f32::consts::TAU;
                    let ry = hash_f32(seed + 200);
                    let origin_x = center.x + theta.cos() * ENTER_RADIUS;
                    let origin_z = center.z + theta.sin() * ENTER_RADIUS;
                    let ground_o = terrain.height_at_world(origin_x, origin_z);
                    let origin = Vec3::new(
                        origin_x,
                        ground_o + MIN_FLY_HEIGHT + ry * MAX_FLY_HEIGHT_EXTRA,
                        origin_z,
                    );
                    let rx = hash_f32(seed + 300) * 2.0 - 1.0;
                    let rz = hash_f32(seed + 400) * 2.0 - 1.0;
                    let ry2 = hash_f32(seed + 500);
                    let target_x = center.x + rx * 12.0;
                    let target_z = center.z + rz * 12.0;
                    let ground_t = terrain.height_at_world(target_x, target_z);
                    let target = Vec3::new(
                        target_x,
                        ground_t + MIN_FLY_HEIGHT + ry2 * MAX_FLY_HEIGHT_EXTRA,
                        target_z,
                    );

                    state = ButterflyFlightState::Entering {
                        origin,
                        target,
                        progress: 0.0,
                    };
                    cr.state = CreatureState::Active;
                }
            }

            ButterflyFlightState::Entering {
                origin,
                target,
                ref mut progress,
            } => {
                let path_len = origin.distance(target).max(0.1);
                *progress += dt * ENTER_SPEED / path_len;
                let p = progress.clamp(0.0, 1.0);
                let ease = p * p * (3.0 - 2.0 * p);
                let base_pos = origin.lerp(target, ease);
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 0.3);
                let mut pos = base_pos + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                if *progress >= 1.0 {
                    cr.anchor = target;
                    state = ButterflyFlightState::Active;
                }
            }

            ButterflyFlightState::Active => {
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 1.0);
                let mut pos = cr.anchor + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                let dist_xz = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
                if dist_xz > EXIT_TRIGGER {
                    let away = Vec3::new(cr.anchor.x - center.x, 0.15, cr.anchor.z - center.z)
                        .normalize_or_zero();
                    let dir = if away.length_squared() < 0.01 {
                        let seed = (cr.phase * 10000.0) as u32 + (t * 5.0) as u32;
                        let a = hash_f32(seed) * std::f32::consts::TAU;
                        Vec3::new(a.cos(), 0.15, a.sin()).normalize()
                    } else {
                        away
                    };
                    state = ButterflyFlightState::Exiting {
                        start: tf.translation,
                        direction: dir,
                        progress: 0.0,
                    };
                }
            }

            ButterflyFlightState::Exiting {
                start,
                direction,
                ref mut progress,
            } => {
                *progress += dt * EXIT_SPEED / EXIT_DISTANCE;
                let p = progress.clamp(0.0, 1.0);
                let base_pos = start + direction * (p * EXIT_DISTANCE);
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 1.0 - p);
                let mut pos = base_pos + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                if *progress >= 1.0 {
                    let seed = (cr.phase * 10000.0) as u32 + (t * 3.3) as u32;
                    bs.idle_cooldown = 1.0 + hash_f32(seed) * 2.0;
                    tf.translation.y = -100.0;
                    cr.state = CreatureState::Pooled;
                    state = ButterflyFlightState::Idle;
                }
            }
        }

        bs.flight_state = state;
    }
}
