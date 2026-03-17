//! Frog ambient creatures using unified Creature + SpriteData components.
//!
//! Frogs are daytime creatures with sprite-sheet animation. They sit idle,
//! occasionally croak, and hop to nearby positions. Camera-relative placement;
//! chunk-based deterministic seeding is pending.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, GameTime, day_factor, hash_f32, scene_center};
use super::creature::{
    Creature, CreatureRegistry, CreatureState, RenderKind, SpriteData, SpriteHopState,
};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;

const NPC_REF: &str = "green-toad";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Sprite sheet layout: 9 columns x 5 rows of 48x48 frames in a 432x240 texture.
const SHEET_COLS: u32 = 9;
const SHEET_ROWS: u32 = 5;
const FRAME_W: f32 = 1.0 / SHEET_COLS as f32;
const FRAME_H: f32 = 1.0 / SHEET_ROWS as f32;

/// World-space size of the frog billboard quad.
const FROG_SIZE: f32 = 0.9;

/// Seconds per animation frame (base — each frog gets a randomized variant).
const FRAME_DURATION_BASE: f32 = 0.15;

/// How long a frog sits idle before doing something (seconds).
const IDLE_MIN: f32 = 3.0;
const IDLE_MAX: f32 = 10.0;

/// Recycle when this far from scene center.
const RECYCLE_DIST: f32 = 28.0;
/// Spawn/recycle at this radius.
const SPAWN_RING_INNER: f32 = 22.0;
const SPAWN_RING_OUTER: f32 = 26.0;
/// Maximum height difference allowed for a jump target.
const MAX_JUMP_HEIGHT_DIFF: f32 = 0.8;

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
    frame_count: 8,
};
const ANIM_JUMP: Anim = Anim {
    row: 1,
    start_col: 0,
    frame_count: 7,
};
/// First mid-air frame index within ANIM_JUMP.
const JUMP_AIRBORNE_FRAME: u32 = 4;

// ---------------------------------------------------------------------------
// FrogMaterials — exposed for day/night tinting in weather.rs
// ---------------------------------------------------------------------------

/// Holds all frog material handles so the weather system can tint them.
#[derive(Resource, Default)]
pub struct FrogMaterials {
    pub handles: Vec<Handle<StandardMaterial>>,
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------

fn build_frog_quad() -> Mesh {
    let h = FROG_SIZE;
    let w = FROG_SIZE;
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

pub(super) fn spawn_frogs(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    asset_server: Res<AssetServer>,
    mut pool: ResMut<CreaturePool>,
    mut frog_mats: ResMut<FrogMaterials>,
    registry: Res<CreatureRegistry>,
) {
    if pool.frogs_spawned {
        return;
    }
    pool.frogs_spawned = true;

    let Some(config) = registry.config_by_ref(NPC_REF) else {
        warn!("[frog] no registry config for '{NPC_REF}' — skipping spawn");
        return;
    };
    let npc_id = registry
        .npc_db
        .id_for_ref(NPC_REF)
        .unwrap_or(bevy_kbve_net::npcdb::ProtoNpcId(0));
    let count = config.pool_size;

    let texture: Handle<Image> = asset_server.load("textures/frog_green_mob.png");
    let frog_mesh = meshes.add(build_frog_quad());

    for i in 0..count {
        let seed = (i as u32).wrapping_add(900);
        let phase = hash_f32(seed * 11 + 1);

        let mat = materials.add(StandardMaterial {
            base_color_texture: Some(texture.clone()),
            alpha_mode: AlphaMode::Mask(0.5),
            cull_mode: None,
            double_sided: true,
            unlit: true,
            ..default()
        });
        frog_mats.handles.push(mat.clone());

        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);
        let frame_duration = FRAME_DURATION_BASE * (0.8 + hash_f32(seed * 79 + 17) * 0.4);
        let start_frame = (hash_f32(seed * 41 + 7) * ANIM_IDLE.frame_count as f32) as u32;

        commands.spawn((
            Mesh3d(frog_mesh.clone()),
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
        ));
    }

    info!("[frog] spawned {count} entities");
}

pub(super) fn animate_frogs(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut frog_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut SpriteData,
            &mut Visibility,
            &Mesh3d,
        ),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let df = day_factor(game_time.hour);

    if df < 0.01 {
        for (mut tf, mut cr, _, mut vis, _) in &mut frog_q {
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            cr.anchor.y = -100.0;
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);

    for (mut tf, mut cr, mut sd, mut vis, mesh_handle) in &mut frog_q {
        let frog_id = (cr.phase * 100000.0) as u32;

        // Relocate frog if too far from scene center or below world
        let dist = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || cr.anchor.y < -50.0 {
            let seed = frog_id.wrapping_mul(2654435761) ^ (t * 31.0) as u32;
            let angle = hash_f32(seed) * std::f32::consts::TAU;
            let ring =
                SPAWN_RING_INNER + hash_f32(seed + 100) * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            cr.anchor = Vec3::new(spawn_x, ground, spawn_z);
            let inward_angle = angle + std::f32::consts::PI + (hash_f32(seed + 300) - 0.5) * 0.6;
            let hop_dist = 1.0 + hash_f32(seed + 400) * 1.5;
            let hop_x = spawn_x + inward_angle.cos() * hop_dist;
            let hop_z = spawn_z + inward_angle.sin() * hop_dist;
            let hop_ground = terrain.height_at_world(hop_x, hop_z);
            let target = Vec3::new(hop_x, hop_ground, hop_z);
            let dx = target.x - cr.anchor.x;
            let dz = target.z - cr.anchor.z;
            sd.facing_left = (dx - dz) < 0.0;
            sd.anim_row = ANIM_JUMP.row;
            sd.anim_frames = ANIM_JUMP.frame_count;
            sd.current_frame = 0;
            sd.frame_timer = 0.0;
            sd.hop_state = SpriteHopState::JumpWindup { target };
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

        // State machine
        let mut state = sd.hop_state;
        match state {
            SpriteHopState::Idle { ref mut timer } => {
                sd.anim_row = ANIM_IDLE.row;
                sd.anim_frames = ANIM_IDLE.frame_count;
                sd.current_frame = 0;
                tf.translation = cr.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 100.0) as u32;
                    let roll = hash_f32(seed);
                    if roll < 0.35 {
                        let angle = hash_f32(seed + 100) * std::f32::consts::TAU;
                        let dist = 0.5 + hash_f32(seed + 200) * 1.5;
                        let target_x = cr.anchor.x + angle.cos() * dist;
                        let target_z = cr.anchor.z + angle.sin() * dist;
                        let target_ground = terrain.height_at_world(target_x, target_z);
                        let height_diff = (target_ground - cr.anchor.y).abs();
                        if height_diff > MAX_JUMP_HEIGHT_DIFF {
                            state = SpriteHopState::Idle { timer: 0.5 };
                        } else {
                            let target = Vec3::new(target_x, target_ground, target_z);
                            let dx = target.x - cr.anchor.x;
                            let dz = target.z - cr.anchor.z;
                            sd.facing_left = (dx - dz) < 0.0;
                            sd.anim_row = ANIM_JUMP.row;
                            sd.anim_frames = ANIM_JUMP.frame_count;
                            sd.current_frame = 0;
                            sd.frame_timer = 0.0;
                            state = SpriteHopState::JumpWindup { target };
                        }
                    } else {
                        sd.anim_row = ANIM_IDLE.row;
                        sd.anim_frames = ANIM_IDLE.frame_count;
                        sd.current_frame = 0;
                        sd.frame_timer = 0.0;
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_IDLE.frame_count,
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
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 73.0) as u32;
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                    sd.anim_row = ANIM_IDLE.row;
                    sd.anim_frames = ANIM_IDLE.frame_count;
                    sd.current_frame = 0;
                }
            }

            SpriteHopState::JumpWindup { target } => {
                tf.translation = cr.anchor;
                if sd.current_frame >= JUMP_AIRBORNE_FRAME {
                    sd.current_frame = JUMP_AIRBORNE_FRAME;
                    state = SpriteHopState::Airborne {
                        start: cr.anchor,
                        target,
                        progress: 0.0,
                    };
                }
            }

            SpriteHopState::Airborne {
                start,
                target,
                ref mut progress,
            } => {
                sd.anim_row = ANIM_JUMP.row;
                sd.anim_frames = ANIM_JUMP.frame_count;
                let airborne_frames = ANIM_JUMP.frame_count - JUMP_AIRBORNE_FRAME;
                sd.current_frame =
                    JUMP_AIRBORNE_FRAME + ((t / sd.frame_duration) as u32 % airborne_frames);

                let jump_duration = start.distance(target) / 2.0;
                *progress += dt / jump_duration.max(0.1);
                let p = progress.clamp(0.0, 1.0);

                let pos = start.lerp(target, p);
                let hop_height = 0.3 + start.distance(target) * 0.15;
                let arc = 4.0 * hop_height * p * (1.0 - p);
                tf.translation = Vec3::new(pos.x, pos.y + arc, pos.z);

                if *progress >= 1.0 {
                    cr.anchor = target;
                    sd.anim_row = ANIM_IDLE.row;
                    sd.anim_frames = ANIM_IDLE.frame_count;
                    sd.current_frame = 0;
                    state = SpriteHopState::Landing { timer: 0.15 };
                }
            }

            SpriteHopState::Landing { ref mut timer } => {
                tf.translation = cr.anchor;
                sd.anim_row = ANIM_IDLE.row;
                sd.anim_frames = ANIM_IDLE.frame_count;
                sd.current_frame = 0;
                *timer -= dt;
                if *timer <= 0.0 {
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 47.0) as u32;
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }
        }
        sd.hop_state = state;

        // Update UVs on the mesh to show current frame
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

        *vis = Visibility::Visible;
    }
}
