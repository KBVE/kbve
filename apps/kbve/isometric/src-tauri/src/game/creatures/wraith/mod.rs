//! Wraith Executioner ambient creature using unified Creature + SpriteData.
//!
//! Wraiths are nighttime undead enemies with sprite-sheet animation. They
//! patrol in slow gliding arcs and occasionally perform attack or skill
//! animations. Uses the same UV-shift system as the frog module.
//!
//! Atlas layout: 20 columns × 6 rows of 100×100 frames (2000×600 texture).
//!   Row 0: idle       (4 frames)
//!   Row 1: idle2      (4 frames)
//!   Row 2: attacking  (13 frames)
//!   Row 3: skill1     (12 frames)
//!   Row 4: death      (20 frames)
//!   Row 5: summon     (5 frames)
//!
//! Asset reference: Undead Executioner by DarkPixel Kronovi
//! https://darkpixel-kronovi.itch.io/undead-executioner

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, MeshTag, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::common::{CreaturePool, GameTime, day_factor, hash_f32, scene_center};
use super::creature::{
    Creature, CreaturePoolIndex, CreatureRegistry, CreatureState, RenderKind, SpriteData,
    SpriteHopState,
};
use super::sprite_material::{
    SpriteInstanceData, SpriteSheetMaterial, SpriteTypeResources, flush_sprite_buffer,
};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;

const NPC_REF: &str = "wraith-executioner";

// ---------------------------------------------------------------------------
// Atlas constants
// ---------------------------------------------------------------------------

const SHEET_COLS: u32 = 20;
const SHEET_ROWS: u32 = 6;
const FRAME_W: f32 = 1.0 / SHEET_COLS as f32;
const FRAME_H: f32 = 1.0 / SHEET_ROWS as f32;

/// World-space size of the wraith billboard quad (larger than frog).
const WRAITH_SIZE: f32 = 3.52;

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
    frame_count: 4,
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
    frame_count: 20,
};
const ANIM_SUMMON: Anim = Anim {
    row: 5,
    start_col: 0,
    frame_count: 5,
};

// ---------------------------------------------------------------------------
// WraithMaterials — exposed for day/night tinting in weather.rs
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct WraithSpriteResources(pub SpriteTypeResources);

impl Default for WraithSpriteResources {
    fn default() -> Self {
        Self(SpriteTypeResources {
            material: Handle::default(),
            storage_buffer: Handle::default(),
            mesh: Handle::default(),
            instances: Vec::new(),
        })
    }
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
        vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
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
    mut sprite_materials: ResMut<Assets<SpriteSheetMaterial>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    asset_server: Res<AssetServer>,
    mut pool: ResMut<CreaturePool>,
    mut wraith_res: ResMut<WraithSpriteResources>,
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

    // Pre-fill instance data
    let instances: Vec<SpriteInstanceData> = (0..count)
        .map(|_| SpriteInstanceData {
            sheet_cols: SHEET_COLS as f32,
            sheet_rows: SHEET_ROWS as f32,
            alpha_cutoff: 0.1, // wraiths use blend, low cutoff
            ..Default::default()
        })
        .collect();

    let initial_data: Vec<[f32; 4]> = instances.iter().flat_map(|inst| inst.to_floats()).collect();
    let storage_handle = buffers.add(ShaderStorageBuffer::from(initial_data));

    let material_handle = sprite_materials.add(SpriteSheetMaterial {
        instance_data: storage_handle.clone(),
        texture,
    });

    wraith_res.0 = SpriteTypeResources {
        material: material_handle.clone(),
        storage_buffer: storage_handle,
        mesh: wraith_mesh.clone(),
        instances,
    };

    for i in 0..count {
        let seed = (i as u32).wrapping_add(7700);
        let phase = hash_f32(seed * 11 + 1);

        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);
        let frame_duration = FRAME_DURATION_BASE * (0.8 + hash_f32(seed * 79 + 17) * 0.4);
        let start_frame = (hash_f32(seed * 41 + 7) * ANIM_IDLE.frame_count as f32) as u32;

        commands.spawn((
            Mesh3d(wraith_mesh.clone()),
            MeshMaterial3d(material_handle.clone()),
            MeshTag(i as u32),
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
                mat_handle: Handle::default(),
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
            WraithMarker {
                patrol_step: (hash_f32(seed * 97 + 31) * 1000.0) as u32,
            },
        ));
    }

    info!("[wraith] spawned {count} entities (instanced)");
}

/// Wraith-specific component: marker + deterministic patrol counter.
/// `patrol_step` increments on each state transition so decisions are
/// seed-driven and naturally desync'd across wraiths.
#[derive(Component)]
pub struct WraithMarker {
    pub patrol_step: u32,
}

/// Deterministic seed for wraith decisions. Combines slot_seed, patrol_step,
/// and creature_seed so all clients produce identical behavior.
#[inline]
fn patrol_seed(slot_seed: u32, step: u32, creature_seed: u64) -> u32 {
    slot_seed
        .wrapping_mul(2654435761)
        .wrapping_add(step.wrapping_mul(7919))
        .wrapping_add(creature_seed as u32)
}

pub(super) fn animate_wraiths(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    mut wraith_res: ResMut<WraithSpriteResources>,
    mut wraith_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut SpriteData,
            &mut Visibility,
            &CreaturePoolIndex,
            &mut WraithMarker,
        ),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let cseed = game_time.creature_seed;

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);

    for (mut tf, mut cr, mut sd, mut vis, pool_idx, mut wm) in &mut wraith_q {
        // Relocate if too far or below world
        let dist = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || cr.anchor.y < -50.0 {
            wm.patrol_step = wm.patrol_step.wrapping_add(1);
            let ps = patrol_seed(cr.slot_seed, wm.patrol_step, cseed);
            let angle = hash_f32(ps) * std::f32::consts::TAU;
            let ring =
                SPAWN_RING_INNER + hash_f32(ps + 100) * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            cr.anchor = Vec3::new(spawn_x, ground, spawn_z);
            sd.anim_row = ANIM_IDLE.row;
            sd.anim_frames = ANIM_IDLE.frame_count;
            sd.current_frame = 0;
            sd.frame_timer = 0.0;
            let idle_timer = IDLE_MIN + hash_f32(ps + 500) * (IDLE_MAX - IDLE_MIN);
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

        // State machine — each transition increments patrol_step so decisions
        // are deterministic and unique per wraith (no time dependency).
        let mut state = sd.hop_state;
        match state {
            SpriteHopState::Idle { ref mut timer } => {
                sd.anim_row = ANIM_IDLE.row;
                sd.anim_frames = ANIM_IDLE.frame_count;
                tf.translation = cr.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    wm.patrol_step = wm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, wm.patrol_step, cseed);
                    let roll = hash_f32(ps);
                    if roll < 0.30 {
                        // Glide to a nearby position (deterministic direction)
                        let angle = hash_f32(ps + 100) * std::f32::consts::TAU;
                        let glide_dist = 1.5 + hash_f32(ps + 200) * 2.5;
                        let target_x = cr.anchor.x + angle.cos() * glide_dist;
                        let target_z = cr.anchor.z + angle.sin() * glide_dist;
                        let target_ground = terrain.height_at_world(target_x, target_z);
                        let target = Vec3::new(target_x, target_ground, target_z);
                        let dx = target.x - cr.anchor.x;
                        let dz = target.z - cr.anchor.z;
                        sd.facing_left = (dx - dz) < 0.0;
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
                    } else if roll < 0.60 {
                        // Skill emote
                        sd.anim_row = ANIM_SKILL.row;
                        sd.anim_frames = ANIM_SKILL.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_SKILL.frame_count,
                        };
                    } else if roll < 0.75 {
                        // Summon emote
                        sd.anim_row = ANIM_SUMMON.row;
                        sd.anim_frames = ANIM_SUMMON.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_SUMMON.frame_count,
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
                    wm.patrol_step = wm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, wm.patrol_step, cseed);
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(ps) * (IDLE_MAX - IDLE_MIN),
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

                // Flip sprite based on isometric screen-space movement direction
                let dx = target.x - start.x;
                let dz = target.z - start.z;
                sd.facing_left = (dx - dz) < 0.0;

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
                    wm.patrol_step = wm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, wm.patrol_step, cseed);
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(ps) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }
        }
        sd.hop_state = state;

        // Update per-instance sprite data in storage buffer
        let idx = pool_idx.0 as usize;
        if idx < wraith_res.0.instances.len() {
            let col = (sd.current_frame % SHEET_COLS) as f32;
            let row = sd.anim_row as f32;
            wraith_res.0.instances[idx].frame_col = col;
            wraith_res.0.instances[idx].frame_row = row;
            wraith_res.0.instances[idx].flip = if sd.facing_left { 1.0 } else { 0.0 };
            // Wraiths: ghostly during day, full opacity at night
            let night = 1.0 - day_factor(game_time.hour);
            let alpha = 0.3 + night * 0.7;
            wraith_res.0.instances[idx].tint = [0.7, 0.6, 0.9, alpha];
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

    // Flush all instance data to GPU
    flush_sprite_buffer(&wraith_res.0, &mut buffers);
}
