//! Wraith Executioner ambient creature using unified Creature + SpriteData.
//!
//! Wraiths are nighttime undead enemies with sprite-sheet animation. They
//! patrol in slow gliding arcs and occasionally perform attack or skill
//! animations. Uses the same UV-shift system as the frog module.
//!
//! Atlas layout: 20 columns × 5 rows of 100×100 frames (2000×500 texture).
//!   Row 0: idle       (4 frames)
//!   Row 1: idle2      (8 frames)
//!   Row 2: attacking  (13 frames)
//!   Row 3: skill1     (12 frames)
//!   Row 4: death      (18 frames)
//!
//! Asset reference: Undead Executioner by DarkPixel Kronovi
//! https://darkpixel-kronovi.itch.io/undead-executioner

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, GameTime, hash_f32, night_factor, scene_center};
use super::creature::{
    Creature, CreaturePoolIndex, CreatureRegistry, CreatureState, RenderKind, SpriteData,
    SpriteHopState,
};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;

const NPC_REF: &str = "wraith-executioner";

// ---------------------------------------------------------------------------
// Atlas constants
// ---------------------------------------------------------------------------

const SHEET_COLS: u32 = 20;
const SHEET_ROWS: u32 = 5;
const FRAME_W: f32 = 1.0 / SHEET_COLS as f32;
const FRAME_H: f32 = 1.0 / SHEET_ROWS as f32;

/// World-space size of the wraith billboard quad (larger than frog).
const WRAITH_SIZE: f32 = 1.6;

const FRAME_DURATION_BASE: f32 = 0.12;

const IDLE_MIN: f32 = 4.0;
const IDLE_MAX: f32 = 12.0;

const RECYCLE_DIST: f32 = 32.0;
const SPAWN_RING_INNER: f32 = 24.0;
const SPAWN_RING_OUTER: f32 = 30.0;

// ---------------------------------------------------------------------------
// Animation definitions
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Anim {
    row: u32,
    start_col: u32,
    frame_count: u32,
}

const ANIM_IDLE: Anim = Anim {
    row: 0,
    start_col: 0,
    frame_count: 4,
};
const ANIM_IDLE2: Anim = Anim {
    row: 1,
    start_col: 0,
    frame_count: 8,
};
const ANIM_ATTACK: Anim = Anim {
    row: 2,
    start_col: 0,
    frame_count: 13,
};
const ANIM_SKILL: Anim = Anim {
    row: 3,
    start_col: 0,
    frame_count: 12,
};
const _ANIM_DEATH: Anim = Anim {
    row: 4,
    start_col: 0,
    frame_count: 18,
};

// ---------------------------------------------------------------------------
// WraithMaterials — exposed for day/night tinting in weather.rs
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct WraithMaterials {
    pub handles: Vec<Handle<StandardMaterial>>,
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------

fn build_wraith_quad() -> Mesh {
    let h = WRAITH_SIZE;
    let w = WRAITH_SIZE;
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-w * 0.5, h, 0.0],
            [w * 0.5, h, 0.0],
            [w * 0.5, 0.0, 0.0],
            [-w * 0.5, 0.0, 0.0],
        ],
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 1.0]; 4])
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_UV_0,
        vec![
            [0.0, 0.0],
            [FRAME_W, 0.0],
            [FRAME_W, FRAME_H],
            [0.0, FRAME_H],
        ],
    )
    .with_inserted_indices(Indices::U32(vec![0, 2, 1, 0, 3, 2]))
}

fn frame_uvs(anim: &Anim, frame: u32, flip: bool) -> [[f32; 2]; 4] {
    let col = anim.start_col + (frame % anim.frame_count);
    let row = anim.row;
    let u0 = col as f32 * FRAME_W;
    let u1 = u0 + FRAME_W;
    let v0 = row as f32 * FRAME_H;
    let v1 = v0 + FRAME_H;
    if flip {
        [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]
    } else {
        [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
    }
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

pub(super) fn spawn_wraiths(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    asset_server: Res<AssetServer>,
    mut pool: ResMut<CreaturePool>,
    mut wraith_mats: ResMut<WraithMaterials>,
    registry: Res<CreatureRegistry>,
) {
    if pool.wraiths_spawned {
        return;
    }
    pool.wraiths_spawned = true;

    let Some(config) = registry.config_by_ref(NPC_REF) else {
        warn!("[wraith] no registry config for '{NPC_REF}' — skipping spawn");
        return;
    };
    let npc_id = registry
        .npc_db
        .id_for_ref(NPC_REF)
        .unwrap_or(bevy_kbve_net::npcdb::ProtoNpcId(0));
    let count = config.pool_size;

    let texture: Handle<Image> =
        asset_server.load("textures/creatures/wraith/wraith_executioner.png");
    let wraith_mesh = meshes.add(build_wraith_quad());

    for i in 0..count {
        let seed = (i as u32).wrapping_add(7700);
        let phase = hash_f32(seed * 11 + 1);

        let mat = materials.add(StandardMaterial {
            base_color_texture: Some(texture.clone()),
            alpha_mode: AlphaMode::Mask(0.5),
            cull_mode: None,
            double_sided: true,
            unlit: true,
            ..default()
        });
        wraith_mats.handles.push(mat.clone());

        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);
        let frame_duration = FRAME_DURATION_BASE * (0.8 + hash_f32(seed * 79 + 17) * 0.4);
        let start_frame = (hash_f32(seed * 41 + 7) * ANIM_IDLE.frame_count as f32) as u32;

        commands.spawn((
            Mesh3d(wraith_mesh.clone()),
            MeshMaterial3d(mat.clone()),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Creature {
                npc_id,
                render_kind: RenderKind::Sprite,
                state: CreatureState::Pooled,
                slot_seed: seed,
                assigned_slot: None,
                anchor: Vec3::new(0.0, -100.0, 0.0),
                phase,
                mat_handle: mat,
            },
            SpriteData {
                frame_timer: hash_f32(seed * 83 + 13) * frame_duration,
                frame_duration,
                current_frame: start_frame % ANIM_IDLE.frame_count,
                anim_row: ANIM_IDLE.row,
                anim_frames: ANIM_IDLE.frame_count,
                facing_left: hash_f32(seed * 67 + 3) > 0.5,
                hop_state: SpriteHopState::Idle { timer: idle_timer },
            },
            CreaturePoolIndex(i as u32),
            WraithMarker,
        ));
    }

    info!("[wraith] spawned {count} entities");
}

/// Marker component to distinguish wraith queries from frog queries.
#[derive(Component)]
pub struct WraithMarker;

pub(super) fn animate_wraiths(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut wraith_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut SpriteData,
            &mut Visibility,
            &Mesh3d,
        ),
        (Without<IsometricCamera>, With<WraithMarker>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let nf = night_factor(game_time.hour);

    // Hide wraiths during daytime
    if nf < 0.01 {
        for (mut tf, mut cr, _, mut vis, _) in &mut wraith_q {
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            cr.anchor.y = -100.0;
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);

    for (mut tf, mut cr, mut sd, mut vis, mesh_handle) in &mut wraith_q {
        let wraith_id = (cr.phase * 100000.0) as u32;

        // Relocate if too far or below world
        let dist = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || cr.anchor.y < -50.0 {
            let seed = wraith_id.wrapping_mul(2654435761) ^ (t * 31.0) as u32;
            let angle = hash_f32(seed) * std::f32::consts::TAU;
            let ring =
                SPAWN_RING_INNER + hash_f32(seed + 100) * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            cr.anchor = Vec3::new(spawn_x, ground, spawn_z);
            sd.anim_row = ANIM_IDLE.row;
            sd.anim_frames = ANIM_IDLE.frame_count;
            sd.current_frame = 0;
            sd.frame_timer = 0.0;
            let idle_timer = IDLE_MIN + hash_f32(seed + 500) * (IDLE_MAX - IDLE_MIN);
            sd.hop_state = SpriteHopState::Idle { timer: idle_timer };
            cr.state = CreatureState::Active;
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            continue;
        }

        // Advance animation frame
        sd.frame_timer += dt;
        if sd.frame_timer >= sd.frame_duration {
            sd.frame_timer -= sd.frame_duration;
            sd.current_frame += 1;
            if sd.current_frame >= sd.anim_frames {
                sd.current_frame = 0;
            }
        }

        // Snap anchor to terrain
        let ground = terrain.height_at_world(cr.anchor.x, cr.anchor.z);
        cr.anchor.y = ground;

        // State machine — wraiths glide slowly, occasionally emote with
        // attack/skill animations, then return to idle.
        let mut state = sd.hop_state;
        match state {
            SpriteHopState::Idle { ref mut timer } => {
                sd.anim_row = ANIM_IDLE.row;
                sd.anim_frames = ANIM_IDLE.frame_count;
                tf.translation = cr.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    let seed = wraith_id.wrapping_mul(2654435761) ^ (t * 100.0) as u32;
                    let roll = hash_f32(seed);
                    if roll < 0.30 {
                        // Glide to a nearby position
                        let angle = hash_f32(seed + 100) * std::f32::consts::TAU;
                        let glide_dist = 1.5 + hash_f32(seed + 200) * 2.5;
                        let target_x = cr.anchor.x + angle.cos() * glide_dist;
                        let target_z = cr.anchor.z + angle.sin() * glide_dist;
                        let target_ground = terrain.height_at_world(target_x, target_z);
                        let target = Vec3::new(target_x, target_ground, target_z);
                        let dx = target.x - cr.anchor.x;
                        let dz = target.z - cr.anchor.z;
                        sd.facing_left = (dx - dz) < 0.0;
                        // Use idle2 (glide) animation during movement
                        sd.anim_row = ANIM_IDLE2.row;
                        sd.anim_frames = ANIM_IDLE2.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Airborne {
                            start: cr.anchor,
                            target,
                            progress: 0.0,
                        };
                    } else if roll < 0.50 {
                        // Attack emote
                        sd.anim_row = ANIM_ATTACK.row;
                        sd.anim_frames = ANIM_ATTACK.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_ATTACK.frame_count,
                        };
                    } else if roll < 0.65 {
                        // Skill emote
                        sd.anim_row = ANIM_SKILL.row;
                        sd.anim_frames = ANIM_SKILL.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_SKILL.frame_count,
                        };
                    } else {
                        // Extended idle2
                        sd.anim_row = ANIM_IDLE2.row;
                        sd.anim_frames = ANIM_IDLE2.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_IDLE2.frame_count * 2,
                        };
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
                    let seed = wraith_id.wrapping_mul(2654435761) ^ (t * 73.0) as u32;
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                    sd.anim_row = ANIM_IDLE.row;
                    sd.anim_frames = ANIM_IDLE.frame_count;
                    sd.current_frame = 0;
                }
            }

            // Wraiths don't jump — they glide. Reuse Airborne for smooth movement
            // with no vertical arc (ghosts float, not hop).
            SpriteHopState::Airborne {
                start,
                target,
                ref mut progress,
            } => {
                let glide_speed = 1.2;
                let glide_duration = start.distance(target) / glide_speed;
                *progress += dt / glide_duration.max(0.1);
                let p = progress.clamp(0.0, 1.0);

                // Smooth glide with slight hover bob instead of hop arc
                let pos = start.lerp(target, p);
                let hover = (t * 1.5 + cr.phase * 6.28).sin() * 0.15;
                tf.translation = Vec3::new(pos.x, pos.y + 0.3 + hover, pos.z);

                if *progress >= 1.0 {
                    cr.anchor = target;
                    sd.anim_row = ANIM_IDLE.row;
                    sd.anim_frames = ANIM_IDLE.frame_count;
                    sd.current_frame = 0;
                    state = SpriteHopState::Landing { timer: 0.2 };
                }
            }

            SpriteHopState::JumpWindup { target } => {
                // Wraiths skip windup — go straight to glide
                sd.anim_row = ANIM_IDLE2.row;
                sd.anim_frames = ANIM_IDLE2.frame_count;
                sd.current_frame = 0;
                state = SpriteHopState::Airborne {
                    start: cr.anchor,
                    target,
                    progress: 0.0,
                };
            }

            SpriteHopState::Landing { ref mut timer } => {
                tf.translation = cr.anchor;
                sd.anim_row = ANIM_IDLE.row;
                sd.anim_frames = ANIM_IDLE.frame_count;
                sd.current_frame = 0;
                *timer -= dt;
                if *timer <= 0.0 {
                    let seed = wraith_id.wrapping_mul(2654435761) ^ (t * 47.0) as u32;
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }
        }
        sd.hop_state = state;

        // Update UVs for current frame
        let anim = Anim {
            row: sd.anim_row,
            start_col: 0,
            frame_count: sd.anim_frames,
        };
        let uvs = frame_uvs(&anim, sd.current_frame, sd.facing_left);
        if let Some(mesh) = meshes.get_mut(mesh_handle.0.id()) {
            mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, vec![uvs[0], uvs[1], uvs[2], uvs[3]]);
        }

        // Billboard: face camera
        let to_cam = cam_pos - tf.translation;
        let to_cam_flat = Vec3::new(to_cam.x, 0.0, to_cam.z).normalize_or_zero();
        if to_cam_flat.length_squared() > 0.001 {
            tf.look_to(to_cam_flat, Vec3::Y);
        }

        // Slight hover above ground
        if matches!(
            sd.hop_state,
            SpriteHopState::Idle { .. } | SpriteHopState::Landing { .. }
        ) {
            let hover = (t * 1.5 + cr.phase * 6.28).sin() * 0.15;
            tf.translation.y = cr.anchor.y + 0.3 + hover;
        }

        *vis = Visibility::Visible;
    }
}
