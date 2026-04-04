//! Wild Boar — 4-directional ambient sprite creature.
//!
//! Atlas layout: 7 columns × 8 rows of 46×32 frames (322×256 texture).
//! Each animation occupies 4 consecutive rows (one per isometric direction).
//!
//!   Rows 0–3: idle (7 frames/dir)
//!   Rows 4–7: run  (4 frames/dir)
//!
//! Direction order per block:
//!   Row +0: NE    Row +1: NW    Row +2: SE    Row +3: SW
//!
//! Uses SpriteAtlasMaterial + SSBO pattern (same as frog/wolf/stag).

use bevy::asset::RenderAssetUsages;
use bevy::camera::visibility::NoFrustumCulling;
use bevy::mesh::{Indices, MeshTag, PrimitiveTopology};
use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::common::{CreaturePool, GameTime, hash_f32, scene_center};
use super::creature::{
    Creature, CreaturePoolIndex, CreatureRegistry, CreatureState, RenderKind, SpriteData,
    SpriteHopState,
};
use super::sprite_material::{SpriteAnimData, SpriteAtlasMaterial};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;

const NPC_REF: &str = "wild-boar";

// ---------------------------------------------------------------------------
// Atlas constants
// ---------------------------------------------------------------------------

const SHEET_COLS: u32 = 7;
const SHEET_ROWS: u32 = 8;

/// World-space size of the boar billboard quad.
const BOAR_SIZE: f32 = 1.4;

const FRAME_DURATION_BASE: f32 = 0.12;

const IDLE_MIN: f32 = 3.0;
const IDLE_MAX: f32 = 10.0;

const RECYCLE_DIST: f32 = 32.0;
const SPAWN_RING_INNER: f32 = 18.0;
const SPAWN_RING_OUTER: f32 = 26.0;

// ---------------------------------------------------------------------------
// Animation definitions
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct DirAnim {
    base_row: u32,
    frame_count: u32,
}

const ANIM_IDLE: DirAnim = DirAnim {
    base_row: 0,
    frame_count: 7,
};
const ANIM_RUN: DirAnim = DirAnim {
    base_row: 4,
    frame_count: 4,
};

// ---------------------------------------------------------------------------
// Isometric direction (NE=0, NW=1, SE=2, SW=3 — matches atlas row order)
// ---------------------------------------------------------------------------

fn iso_direction(dx: f32, dz: f32) -> u32 {
    let sum = dx + dz;
    let diff = dx - dz;
    match (diff >= 0.0, sum >= 0.0) {
        (true, false) => 0,  // NE
        (false, false) => 1, // NW
        (true, true) => 2,   // SE
        (false, true) => 3,  // SW
    }
}

// ---------------------------------------------------------------------------
// BoarAtlasResources
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct BoarAtlasResources {
    pub material: Handle<SpriteAtlasMaterial>,
    pub anim_buffer: Handle<ShaderStorageBuffer>,
    pub anim_data: Vec<SpriteAnimData>,
}

impl Default for BoarAtlasResources {
    fn default() -> Self {
        Self {
            material: Handle::default(),
            anim_buffer: Handle::default(),
            anim_data: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Boar marker component
// ---------------------------------------------------------------------------

#[derive(Component)]
pub struct BoarMarker {
    pub patrol_step: u32,
    pub direction: u32,
    pub anim_base_row: u32,
    pub anim_frame_count: u32,
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------

fn build_boar_quad() -> Mesh {
    let h = BOAR_SIZE;
    let w = BOAR_SIZE;
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

// ---------------------------------------------------------------------------
// Deterministic patrol seed
// ---------------------------------------------------------------------------

#[inline]
fn patrol_seed(slot_seed: u32, step: u32, creature_seed: u64) -> u32 {
    slot_seed
        .wrapping_mul(2654435761)
        .wrapping_add(step.wrapping_mul(7919))
        .wrapping_add(creature_seed as u32)
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

pub(super) fn spawn_boars(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut atlas_materials: ResMut<Assets<SpriteAtlasMaterial>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    asset_server: Res<AssetServer>,
    mut pool: ResMut<CreaturePool>,
    mut boar_res: ResMut<BoarAtlasResources>,
    registry: Res<CreatureRegistry>,
) {
    if pool.boars_spawned {
        return;
    }
    pool.boars_spawned = true;

    let Some(config) = registry.config_by_ref(NPC_REF) else {
        warn!("[boar] no registry config for '{NPC_REF}' — skipping spawn");
        return;
    };
    let npc_id = registry
        .npc_db
        .id_for_ref(NPC_REF)
        .unwrap_or(bevy_kbve_net::npcdb::ProtoNpcId(0));
    let count = config.pool_size;

    let texture: Handle<Image> = asset_server.load("textures/creatures/boar/boar-sprite.png");
    let boar_mesh = meshes.add(build_boar_quad());

    let anim_data: Vec<SpriteAnimData> = (0..count).map(|_| SpriteAnimData::default()).collect();
    let anim_buffer = buffers.add(ShaderStorageBuffer::from(anim_data.clone()));

    let material = atlas_materials.add(SpriteAtlasMaterial {
        atlas: texture,
        anim_data: anim_buffer.clone(),
        atlas_grid: UVec2::new(SHEET_COLS, SHEET_ROWS),
        tint: LinearRgba::WHITE,
    });

    boar_res.material = material.clone();
    boar_res.anim_buffer = anim_buffer;
    boar_res.anim_data = anim_data;

    for i in 0..count {
        let seed = (i as u32).wrapping_add(4400);
        let phase = hash_f32(seed * 11 + 1);
        let direction = (hash_f32(seed * 37 + 5) * 4.0) as u32 % 4;
        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);
        let frame_duration = FRAME_DURATION_BASE * (0.8 + hash_f32(seed * 79 + 17) * 0.4);

        commands.spawn((
            Mesh3d(boar_mesh.clone()),
            MeshMaterial3d(material.clone()),
            MeshTag(i as u32),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            NoFrustumCulling,
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
                current_frame: 0,
                anim_row: ANIM_IDLE.base_row + direction,
                anim_frames: ANIM_IDLE.frame_count,
                facing_left: false,
                hop_state: SpriteHopState::Idle { timer: idle_timer },
            },
            CreaturePoolIndex(i as u32),
            BoarMarker {
                patrol_step: (hash_f32(seed * 97 + 31) * 1000.0) as u32,
                direction,
                anim_base_row: ANIM_IDLE.base_row,
                anim_frame_count: ANIM_IDLE.frame_count,
            },
        ));
    }

    info!("[boar] spawned {count} entities (atlas instanced, 4-directional)");
}

pub(super) fn animate_boars(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
    mut boar_res: ResMut<BoarAtlasResources>,
    mut boar_q: Query<
        (
            &mut Transform,
            &mut Creature,
            &mut SpriteData,
            &mut Visibility,
            &CreaturePoolIndex,
            &mut BoarMarker,
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

    for (mut tf, mut cr, mut sd, mut vis, pool_idx, mut bm) in &mut boar_q {
        // Relocate if too far or below world
        let dist = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || cr.anchor.y < -50.0 {
            bm.patrol_step = bm.patrol_step.wrapping_add(1);
            let ps = patrol_seed(cr.slot_seed, bm.patrol_step, cseed);
            let angle = hash_f32(ps) * std::f32::consts::TAU;
            let ring =
                SPAWN_RING_INNER + hash_f32(ps + 100) * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            cr.anchor = Vec3::new(spawn_x, ground, spawn_z);
            bm.direction = (hash_f32(ps + 300) * 4.0) as u32 % 4;
            set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
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

        // State machine: boars idle then charge-run
        let mut state = sd.hop_state;
        match state {
            SpriteHopState::Idle { ref mut timer } => {
                set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
                tf.translation = cr.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    bm.patrol_step = bm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, bm.patrol_step, cseed);
                    let roll = hash_f32(ps);
                    if roll < 0.40 {
                        // Charge-run to a nearby position
                        let angle = hash_f32(ps + 100) * std::f32::consts::TAU;
                        let run_dist = 2.0 + hash_f32(ps + 200) * 3.0;
                        let target_x = cr.anchor.x + angle.cos() * run_dist;
                        let target_z = cr.anchor.z + angle.sin() * run_dist;
                        let target_ground = terrain.height_at_world(target_x, target_z);
                        let target = Vec3::new(target_x, target_ground, target_z);
                        let dx = target.x - cr.anchor.x;
                        let dz = target.z - cr.anchor.z;
                        bm.direction = iso_direction(dx, dz);
                        set_boar_anim(&mut sd, &mut bm, &ANIM_RUN);
                        state = SpriteHopState::Airborne {
                            start: cr.anchor,
                            target,
                            progress: 0.0,
                        };
                    } else {
                        // Extended idle (rooting/sniffing)
                        set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
                        state = SpriteHopState::Emote {
                            remaining_frames: ANIM_IDLE.frame_count * 2,
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
                    bm.patrol_step = bm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, bm.patrol_step, cseed);
                    set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(ps) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }

            SpriteHopState::Airborne {
                start,
                target,
                ref mut progress,
            } => {
                let run_speed = 3.5;
                let run_duration = start.distance(target) / run_speed;
                *progress += dt / run_duration.max(0.1);
                let p = progress.clamp(0.0, 1.0);

                let pos = start.lerp(target, p);
                tf.translation = pos;

                let dx = target.x - start.x;
                let dz = target.z - start.z;
                bm.direction = iso_direction(dx, dz);
                sd.anim_row = bm.anim_base_row + bm.direction;

                if *progress >= 1.0 {
                    cr.anchor = target;
                    set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
                    state = SpriteHopState::Landing { timer: 0.2 };
                }
            }

            SpriteHopState::JumpWindup { target } => {
                let dx = target.x - cr.anchor.x;
                let dz = target.z - cr.anchor.z;
                bm.direction = iso_direction(dx, dz);
                set_boar_anim(&mut sd, &mut bm, &ANIM_RUN);
                state = SpriteHopState::Airborne {
                    start: cr.anchor,
                    target,
                    progress: 0.0,
                };
            }

            SpriteHopState::Landing { ref mut timer } => {
                tf.translation = cr.anchor;
                set_boar_anim(&mut sd, &mut bm, &ANIM_IDLE);
                *timer -= dt;
                if *timer <= 0.0 {
                    bm.patrol_step = bm.patrol_step.wrapping_add(1);
                    let ps = patrol_seed(cr.slot_seed, bm.patrol_step, cseed);
                    state = SpriteHopState::Idle {
                        timer: IDLE_MIN + hash_f32(ps) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }
        }
        sd.hop_state = state;

        // Update per-instance animation data in SSBO
        let idx = pool_idx.0 as usize;
        if idx < boar_res.anim_data.len() {
            let col = sd.current_frame % SHEET_COLS;
            let row = sd.anim_row;
            boar_res.anim_data[idx] = SpriteAnimData {
                frame: col + row * SHEET_COLS,
                flip: 0,
                _pad1: 0,
                _pad2: 0,
            };
        }

        // Billboard: face camera
        tf.look_to(cam_tf.forward().as_vec3(), Vec3::Y);

        *vis = Visibility::Visible;
    }

    // Flush animation data to GPU once per frame
    if let Some(buffer) = buffers.get_mut(&boar_res.anim_buffer) {
        buffer.set_data(boar_res.anim_data.clone());
    }
}

fn set_boar_anim(sd: &mut SpriteData, bm: &mut BoarMarker, anim: &DirAnim) {
    if bm.anim_base_row != anim.base_row {
        bm.anim_base_row = anim.base_row;
        bm.anim_frame_count = anim.frame_count;
        sd.anim_row = anim.base_row + bm.direction;
        sd.anim_frames = anim.frame_count;
        sd.current_frame = 0;
        sd.frame_timer = 0.0;
    } else {
        sd.anim_row = anim.base_row + bm.direction;
        sd.anim_frames = anim.frame_count;
    }
}
