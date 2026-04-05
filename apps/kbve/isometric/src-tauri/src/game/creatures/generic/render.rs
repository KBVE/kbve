//! Client-only rendering system for generic sprite creatures.
//!
//! Runs after [`super::simulate::simulate_sprite_creatures`] and handles:
//! SSBO updates, billboard look_to, glide hover (idle/landing), shadow sync,
//! Visibility component management, and the SimulationCenter update from camera.

use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::super::common::{GameTime, day_factor};
use super::super::creature::{Creature, CreaturePoolIndex, SpriteData, SpriteHopState};
use super::types::*;
use crate::game::camera::IsometricCamera;
use crate::game::weather::BlobShadow;

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/// Client-only rendering system for all generic sprite creatures.
///
/// Updates the [`SimulationCenter`] resource from camera position, then handles
/// SSBO writes, billboard orientation, glide hover, shadow sync, and
/// Visibility component toggling (day/night schedule + recycle hide).
pub fn render_sprite_creatures(
    time: Res<Time>,
    game_time: Res<GameTime>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    mut atlas_pool: ResMut<SpriteAtlasPool>,
    types: Res<SpriteCreatureTypes>,
    mut creature_q: Query<
        (
            &mut Transform,
            &Creature,
            &mut SpriteData,
            &mut Visibility,
            &CreaturePoolIndex,
            &SpriteCreatureMarker,
            Option<&CreatureShadowLink>,
        ),
        Without<IsometricCamera>,
    >,
    mut shadow_q: Query<(&mut BlobShadow, &mut Visibility), Without<Creature>>,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let t = time.elapsed_secs();

    // Update simulation center: use a fixed world origin derived from
    // creature_seed so all clients agree on creature positions.
    // The camera is NOT used as center — this ensures multiplayer sync.
    // Creatures populate the area around world origin; the spawn ring
    // constants in each creature type define the radius.
    // (SimulationCenter defaults to Vec3::ZERO, set once at seed change)

    for (mut tf, cr, sd, mut vis, pool_idx, marker, shadow) in &mut creature_q {
        let Some(ctype) = types.types.iter().find(|ct| ct.npc_ref == marker.type_key) else {
            continue;
        };

        // --- Visibility schedule (set Visibility component) ---
        let schedule_hidden = match ctype.visibility {
            VisibilitySchedule::Day => day_factor(game_time.hour) < 0.01,
            VisibilitySchedule::Night => day_factor(game_time.hour) > 0.99,
            VisibilitySchedule::Always => false,
        };

        if schedule_hidden || cr.anchor.y < -50.0 {
            *vis = Visibility::Hidden;
            hide_shadow(shadow, &mut shadow_q);
            continue;
        }

        // If simulate recycled this creature (tf.translation.y == -100), keep
        // it hidden for one frame so the next simulate pass can place it.
        if tf.translation.y < -90.0 {
            *vis = Visibility::Hidden;
            hide_shadow(shadow, &mut shadow_q);
            continue;
        }

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
                entry.anim_data[idx] = super::super::sprite_material::SpriteAnimData {
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
