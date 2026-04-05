//! Shared simulation logic for generic sprite creatures.
//!
//! This system runs on both client and server — it contains NO rendering code
//! (no SSBO, billboard, shadow, visibility-component, or camera queries).
//! Rendering is handled by [`super::render::render_sprite_creatures`].

use bevy::prelude::*;

use super::super::common::{GameTime, day_factor, hash_f32, patrol_seed};
use super::super::creature::{
    Creature, CreaturePoolIndex, CreatureState, SpriteData, SpriteHopState,
};
use super::behavior::CreatureIntent;
use super::brain::CreatureBrain;
use super::types::*;
use crate::game::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/// The center point used for creature spawn-ring and recycle distance checks.
///
/// On **client**: set from the camera position each frame (via
/// [`super::render::render_sprite_creatures`]).
/// On **server**: set from average player position or world origin.
/// Both sides use the same deterministic seed, so identical center → identical
/// creature placement.
#[derive(Resource)]
pub struct SimulationCenter(pub Vec3);

impl Default for SimulationCenter {
    fn default() -> Self {
        Self(Vec3::ZERO)
    }
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/// Shared simulation system for all generic sprite creatures.
///
/// Handles: visibility-schedule culling (sets anchor.y = -100 instead of
/// Visibility component), recycle/respawn ring, frame advance, terrain snap,
/// state machine (idle → intent → airborne → landing), direction updates.
pub fn simulate_sprite_creatures(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    sim_center: Res<SimulationCenter>,
    types: Res<SpriteCreatureTypes>,
    mut creature_q: Query<(
        &mut Transform,
        &mut Creature,
        &mut SpriteData,
        &CreaturePoolIndex,
        &mut SpriteCreatureMarker,
        Option<&mut CreatureBrain>,
    )>,
) {
    let dt = time.delta_secs();
    let _t = time.elapsed_secs();
    let cseed = game_time.creature_seed;
    let center = sim_center.0;

    for (mut tf, mut cr, mut sd, _pool_idx, mut marker, mut brain) in &mut creature_q {
        // Look up type descriptor
        let Some(ctype) = types.types.iter().find(|ct| ct.npc_ref == marker.type_key) else {
            continue;
        };

        // --- Visibility schedule (hide by moving off-screen, no Visibility component) ---
        match ctype.visibility {
            VisibilitySchedule::Day => {
                if day_factor(game_time.hour) < 0.01 {
                    tf.translation.y = -100.0;
                    cr.anchor.y = -100.0;
                    continue;
                }
            }
            VisibilitySchedule::Night => {
                if day_factor(game_time.hour) > 0.99 {
                    tf.translation.y = -100.0;
                    cr.anchor.y = -100.0;
                    continue;
                }
            }
            VisibilitySchedule::Always => {}
        }

        // --- Recycle if too far from simulation center ---
        let dist = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
        if dist > ctype.recycle_dist || cr.anchor.y < -50.0 {
            marker.patrol_step = marker.patrol_step.wrapping_add(1);
            let ps = patrol_seed(cr.slot_seed, marker.patrol_step, cseed);
            let angle = hash_f32(ps) * std::f32::consts::TAU;
            let ring = ctype.spawn_ring_inner
                + hash_f32(ps + 100) * (ctype.spawn_ring_outer - ctype.spawn_ring_inner);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            cr.anchor = Vec3::new(spawn_x, ground, spawn_z);

            // Reset direction
            match &ctype.direction_model {
                DirectionModel::Flip => {
                    sd.facing_left = hash_f32(ps + 300) > 0.5;
                }
                DirectionModel::FourWay { .. } => {
                    marker.direction = (hash_f32(ps + 300) * 4.0) as u32 % 4;
                }
            }

            set_anim(&mut sd, &mut marker, &ctype.anims.idle);
            let idle_timer =
                ctype.idle_min + hash_f32(ps + 500) * (ctype.idle_max - ctype.idle_min);
            sd.hop_state = SpriteHopState::Idle { timer: idle_timer };
            cr.state = CreatureState::Active;
            tf.translation.y = -100.0;
            continue;
        }

        // --- Frame advance ---
        sd.frame_timer += dt;
        if sd.frame_timer >= sd.frame_duration {
            sd.frame_timer -= sd.frame_duration;
            sd.current_frame += 1;
            if sd.current_frame >= sd.anim_frames {
                sd.current_frame = 0;
            }
        }

        // --- Terrain snap ---
        let ground = terrain.height_at_world(cr.anchor.x, cr.anchor.z);
        cr.anchor.y = ground;

        // --- State machine ---
        let mut state = sd.hop_state;
        match state {
            SpriteHopState::Idle { ref mut timer } => {
                set_anim(&mut sd, &mut marker, &ctype.anims.idle);
                tf.translation = cr.anchor;
                *timer -= dt;

                // Check for behavior tree intent first
                let brain_intent = brain.as_mut().and_then(|b| {
                    let intent = std::mem::take(&mut b.intent);
                    if matches!(intent, CreatureIntent::None) {
                        None
                    } else {
                        Some(intent)
                    }
                });

                // Use brain intent if available, otherwise fall back to
                // probability rolls when idle timer expires.
                let resolved_intent = if let Some(intent) = brain_intent {
                    Some(intent)
                } else if *timer <= 0.0 {
                    // Legacy fallback: probability-weighted behavior
                    marker.patrol_step = marker.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, marker.patrol_step, cseed);
                    let roll = hash_f32(ps);

                    ctype
                        .behavior
                        .choices
                        .iter()
                        .find(|c| roll < c.threshold)
                        .map(|c| {
                            legacy_action_to_intent(&c.action, ps, cr.anchor, &mut terrain, ctype)
                        })
                } else {
                    None
                };

                if let Some(intent) = resolved_intent {
                    match intent {
                        CreatureIntent::MoveTo {
                            target,
                            speed,
                            anim_name,
                        } => {
                            let dx = target.x - cr.anchor.x;
                            let dz = target.z - cr.anchor.z;
                            match &ctype.direction_model {
                                DirectionModel::Flip => {
                                    sd.facing_left = (dx - dz) < 0.0;
                                }
                                DirectionModel::FourWay { quadrant_to_row } => {
                                    let q = iso_quadrant(dx, dz) as usize;
                                    marker.direction = quadrant_to_row[q];
                                }
                            }
                            let anim_def = ctype.anims.find(anim_name);
                            set_anim(&mut sd, &mut marker, &anim_def);
                            marker.active_move_speed = speed;
                            state = SpriteHopState::Airborne {
                                start: cr.anchor,
                                target,
                                progress: 0.0,
                            };
                        }
                        CreatureIntent::Flee {
                            direction,
                            speed,
                            anim_name,
                        } => {
                            let flee_dist = 6.0;
                            let target = Vec3::new(
                                cr.anchor.x + direction.x * flee_dist,
                                cr.anchor.y,
                                cr.anchor.z + direction.z * flee_dist,
                            );
                            let dx = target.x - cr.anchor.x;
                            let dz = target.z - cr.anchor.z;
                            match &ctype.direction_model {
                                DirectionModel::Flip => {
                                    sd.facing_left = (dx - dz) < 0.0;
                                }
                                DirectionModel::FourWay { quadrant_to_row } => {
                                    let q = iso_quadrant(dx, dz) as usize;
                                    marker.direction = quadrant_to_row[q];
                                }
                            }
                            let anim_def = ctype.anims.find(anim_name);
                            set_anim(&mut sd, &mut marker, &anim_def);
                            marker.active_move_speed = speed;
                            state = SpriteHopState::Airborne {
                                start: cr.anchor,
                                target,
                                progress: 0.0,
                            };
                        }
                        CreatureIntent::Emote { anim_name, repeat } => {
                            let anim_def = ctype.anims.find(anim_name);
                            set_anim(&mut sd, &mut marker, &anim_def);
                            state = SpriteHopState::Emote {
                                remaining_frames: anim_def.frame_count * repeat,
                            };
                        }
                        CreatureIntent::SetIdle { duration } => {
                            state = SpriteHopState::Idle { timer: duration };
                        }
                        CreatureIntent::None => {}
                    }
                }
            }

            SpriteHopState::Emote {
                ref mut remaining_frames,
            } => {
                tf.translation = cr.anchor;
                if sd.frame_timer < 0.001 && sd.current_frame == 0 && *remaining_frames > 0 {
                    *remaining_frames = remaining_frames.saturating_sub(sd.anim_frames);
                }
                if sd.current_frame == sd.anim_frames - 1 && *remaining_frames == 0 {
                    marker.patrol_step = marker.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, marker.patrol_step, cseed);
                    set_anim(&mut sd, &mut marker, &ctype.anims.idle);
                    state = SpriteHopState::Idle {
                        timer: ctype.idle_min + hash_f32(ps) * (ctype.idle_max - ctype.idle_min),
                    };
                }
            }

            SpriteHopState::Airborne {
                start,
                target,
                ref mut progress,
            } => {
                let speed = marker.active_move_speed.max(1.0);
                let duration = start.distance(target) / speed;
                *progress += dt / duration.max(0.1);
                let p = progress.clamp(0.0, 1.0);

                match &ctype.movement {
                    MovementProfile::HopArc {
                        base_height,
                        height_per_dist,
                        ..
                    } => {
                        let pos = start.lerp(target, p);
                        let arc = 4.0
                            * (base_height + start.distance(target) * height_per_dist)
                            * p
                            * (1.0 - p);
                        tf.translation = Vec3::new(pos.x, pos.y + arc, pos.z);
                    }
                    MovementProfile::LinearRun => {
                        tf.translation = start.lerp(target, p);
                    }
                    MovementProfile::Glide {
                        hover_base,
                        hover_amplitude,
                        hover_frequency,
                        ..
                    } => {
                        let t = time.elapsed_secs();
                        let pos = start.lerp(target, p);
                        let hover = (t * hover_frequency + cr.phase * 6.28).sin() * hover_amplitude;
                        tf.translation = Vec3::new(pos.x, pos.y + hover_base + hover, pos.z);
                    }
                }

                // Update direction during movement
                let dx = target.x - start.x;
                let dz = target.z - start.z;
                match &ctype.direction_model {
                    DirectionModel::Flip => {
                        sd.facing_left = (dx - dz) < 0.0;
                    }
                    DirectionModel::FourWay { quadrant_to_row } => {
                        let q = iso_quadrant(dx, dz) as usize;
                        marker.direction = quadrant_to_row[q];
                        sd.anim_row = marker.anim_base_row + marker.direction;
                    }
                }

                if *progress >= 1.0 {
                    cr.anchor = target;
                    set_anim(&mut sd, &mut marker, &ctype.anims.idle);
                    state = SpriteHopState::Landing { timer: 0.2 };
                }
            }

            SpriteHopState::JumpWindup { target } => {
                let dx = target.x - cr.anchor.x;
                let dz = target.z - cr.anchor.z;
                match &ctype.direction_model {
                    DirectionModel::Flip => {
                        sd.facing_left = (dx - dz) < 0.0;
                    }
                    DirectionModel::FourWay { quadrant_to_row } => {
                        let q = iso_quadrant(dx, dz) as usize;
                        marker.direction = quadrant_to_row[q];
                    }
                }
                // Find the move anim (first Move action's anim)
                if let Some(move_action) = ctype.behavior.choices.iter().find_map(|c| {
                    if let BehaviorAction::Move {
                        anim_name, speed, ..
                    } = &c.action
                    {
                        Some((*anim_name, *speed))
                    } else {
                        None
                    }
                }) {
                    let anim_def = ctype.anims.find(move_action.0);
                    set_anim(&mut sd, &mut marker, &anim_def);
                    marker.active_move_speed = move_action.1;
                }
                state = SpriteHopState::Airborne {
                    start: cr.anchor,
                    target,
                    progress: 0.0,
                };
            }

            SpriteHopState::Landing { ref mut timer } => {
                tf.translation = cr.anchor;
                set_anim(&mut sd, &mut marker, &ctype.anims.idle);
                *timer -= dt;
                if *timer <= 0.0 {
                    marker.patrol_step = marker.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, marker.patrol_step, cseed);
                    state = SpriteHopState::Idle {
                        timer: ctype.idle_min + hash_f32(ps) * (ctype.idle_max - ctype.idle_min),
                    };
                }
            }
        }
        sd.hop_state = state;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Set the active animation on a sprite creature, resetting frame on anim change.
pub(super) fn set_anim(sd: &mut SpriteData, marker: &mut SpriteCreatureMarker, anim: &AnimDef) {
    if marker.anim_base_row != anim.base_row {
        marker.anim_base_row = anim.base_row;
        marker.anim_frame_count = anim.frame_count;
        sd.anim_row = anim.base_row + marker.direction;
        sd.anim_frames = anim.frame_count;
        sd.current_frame = 0;
        sd.frame_timer = 0.0;
    } else {
        sd.anim_row = anim.base_row + marker.direction;
        sd.anim_frames = anim.frame_count;
        if sd.current_frame >= sd.anim_frames {
            sd.current_frame = 0;
        }
    }
}

/// Convert a legacy `BehaviorAction` to a `CreatureIntent` (fallback path for
/// creatures without a behavior tree).
fn legacy_action_to_intent(
    action: &BehaviorAction,
    ps: u32,
    anchor: Vec3,
    terrain: &mut TerrainMap,
    _ctype: &SpriteCreatureType,
) -> CreatureIntent {
    match action {
        BehaviorAction::Move {
            anim_name,
            min_dist,
            max_dist,
            speed,
        } => {
            let angle = hash_f32(ps + 100) * std::f32::consts::TAU;
            let run_dist = min_dist + hash_f32(ps + 200) * (max_dist - min_dist);
            let target_x = anchor.x + angle.cos() * run_dist;
            let target_z = anchor.z + angle.sin() * run_dist;
            let target_ground = terrain.height_at_world(target_x, target_z);
            CreatureIntent::MoveTo {
                target: Vec3::new(target_x, target_ground, target_z),
                speed: *speed,
                anim_name,
            }
        }
        BehaviorAction::Emote { anim_name, repeat } => CreatureIntent::Emote {
            anim_name,
            repeat: *repeat,
        },
        BehaviorAction::ExtendedIdle { repeat } => CreatureIntent::Emote {
            anim_name: "idle",
            repeat: *repeat,
        },
    }
}
