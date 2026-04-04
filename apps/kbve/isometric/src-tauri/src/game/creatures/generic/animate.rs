//! Generic animate system for all sprite-sheet creatures.

use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::super::common::{GameTime, day_factor, hash_f32, patrol_seed, scene_center};
use super::super::creature::{
    Creature, CreaturePoolIndex, CreatureState, SpriteData, SpriteHopState,
};
use super::super::sprite_material::SpriteAnimData;
use super::types::*;
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;
use crate::game::weather::BlobShadow;

/// Single animate system for all generic sprite creatures.
pub fn animate_sprite_creatures(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    mut atlas_pool: ResMut<SpriteAtlasPool>,
    types: Res<SpriteCreatureTypes>,
    mut creature_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut SpriteData,
            &mut Visibility,
            &CreaturePoolIndex,
            &mut SpriteCreatureMarker,
            Option<&CreatureShadowLink>,
        ),
        Without<IsometricCamera>,
    >,
    mut shadow_q: Query<(&mut BlobShadow, &mut Visibility), Without<Creature>>,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let cseed = game_time.creature_seed;
    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);

    for (mut tf, mut cr, mut sd, mut vis, pool_idx, mut marker, shadow) in &mut creature_q {
        // Look up type descriptor
        let Some(ctype) = types.types.iter().find(|ct| ct.npc_ref == marker.type_key) else {
            continue;
        };

        // --- Visibility schedule ---
        match ctype.visibility {
            VisibilitySchedule::Day => {
                if day_factor(game_time.hour) < 0.01 {
                    *vis = Visibility::Hidden;
                    tf.translation.y = -100.0;
                    cr.anchor.y = -100.0;
                    hide_shadow(shadow, &mut shadow_q);
                    continue;
                }
            }
            VisibilitySchedule::Night => {
                if day_factor(game_time.hour) > 0.99 {
                    *vis = Visibility::Hidden;
                    tf.translation.y = -100.0;
                    cr.anchor.y = -100.0;
                    hide_shadow(shadow, &mut shadow_q);
                    continue;
                }
            }
            VisibilitySchedule::Always => {}
        }

        // --- Recycle if too far ---
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
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            hide_shadow(shadow, &mut shadow_q);
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

                if *timer <= 0.0 {
                    marker.patrol_step = marker.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, marker.patrol_step, cseed);
                    let roll = hash_f32(ps);

                    // Find matching behavior
                    let action = ctype
                        .behavior
                        .choices
                        .iter()
                        .find(|c| roll < c.threshold)
                        .map(|c| &c.action);

                    if let Some(action) = action {
                        match action {
                            BehaviorAction::Move {
                                anim_name,
                                min_dist,
                                max_dist,
                                speed,
                            } => {
                                let angle = hash_f32(ps + 100) * std::f32::consts::TAU;
                                let run_dist =
                                    min_dist + hash_f32(ps + 200) * (max_dist - min_dist);
                                let target_x = cr.anchor.x + angle.cos() * run_dist;
                                let target_z = cr.anchor.z + angle.sin() * run_dist;
                                let target_ground = terrain.height_at_world(target_x, target_z);
                                let target = Vec3::new(target_x, target_ground, target_z);
                                let dx = target.x - cr.anchor.x;
                                let dz = target.z - cr.anchor.z;

                                // Update direction
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
                                marker.active_move_speed = *speed;
                                state = SpriteHopState::Airborne {
                                    start: cr.anchor,
                                    target,
                                    progress: 0.0,
                                };
                            }
                            BehaviorAction::Emote { anim_name, repeat } => {
                                let anim_def = ctype.anims.find(anim_name);
                                set_anim(&mut sd, &mut marker, &anim_def);
                                state = SpriteHopState::Emote {
                                    remaining_frames: anim_def.frame_count * repeat,
                                };
                            }
                            BehaviorAction::ExtendedIdle { repeat } => {
                                set_anim(&mut sd, &mut marker, &ctype.anims.idle);
                                state = SpriteHopState::Emote {
                                    remaining_frames: ctype.anims.idle.frame_count * repeat,
                                };
                            }
                        }
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
                // For HopArc: wait for airborne frame, then transition
                // For others: skip straight to Airborne
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

        // --- SSBO update ---
        let entry = atlas_pool
            .entries
            .iter_mut()
            .find(|e| e.type_key == marker.type_key);
        if let Some(entry) = entry {
            let idx = pool_idx.0 as usize;
            if idx < entry.anim_data.len() {
                let col = sd.current_frame % ctype.sheet_cols;
                let row = sd.anim_row;
                let flip = match &ctype.direction_model {
                    DirectionModel::Flip => {
                        if sd.facing_left {
                            1
                        } else {
                            0
                        }
                    }
                    DirectionModel::FourWay { .. } => 0,
                };
                entry.anim_data[idx] = SpriteAnimData {
                    frame: col + row * ctype.sheet_cols,
                    flip,
                    _pad1: 0,
                    _pad2: 0,
                };
            }
        }

        // --- Billboard ---
        tf.look_to(cam_tf.forward().as_vec3(), Vec3::Y);

        // --- Glide hover for idle/landing (wraith-style) ---
        if let MovementProfile::Glide {
            hover_base,
            hover_amplitude,
            hover_frequency,
            ..
        } = &ctype.movement
        {
            if matches!(
                sd.hop_state,
                SpriteHopState::Idle { .. } | SpriteHopState::Landing { .. }
            ) {
                let hover = (t * hover_frequency + cr.phase * 6.28).sin() * hover_amplitude;
                tf.translation.y = cr.anchor.y + hover_base + hover;
            }
        }

        // --- Shadow sync ---
        if let Some(CreatureShadowLink(se)) = shadow {
            if let Ok((mut bs, mut sv)) = shadow_q.get_mut(*se) {
                bs.anchor = Vec3::new(cr.anchor.x, cr.anchor.y + 0.01, cr.anchor.z);
                *sv = Visibility::Visible;
            }
        }

        *vis = Visibility::Visible;
    }

    // --- Flush all SSBO buffers ---
    for entry in &atlas_pool.entries {
        if let Some(buffer) = buffers.get_mut(&entry.anim_buffer) {
            buffer.set_data(entry.anim_data.as_slice());
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Set the active animation on a sprite creature, resetting frame on anim change.
fn set_anim(sd: &mut SpriteData, marker: &mut SpriteCreatureMarker, anim: &AnimDef) {
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

/// Hide a creature's blob shadow.
fn hide_shadow(
    shadow: Option<&CreatureShadowLink>,
    shadow_q: &mut Query<(&mut BlobShadow, &mut Visibility), Without<Creature>>,
) {
    if let Some(CreatureShadowLink(se)) = shadow {
        if let Ok((mut bs, mut sv)) = shadow_q.get_mut(*se) {
            bs.anchor.y = -100.0;
            *sv = Visibility::Hidden;
        }
    }
}
