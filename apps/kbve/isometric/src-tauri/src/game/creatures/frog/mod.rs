use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, GameTime, day_factor, hash_f32, scene_center};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROG_COUNT: usize = 8;

/// Sprite sheet layout: 9 columns × 5 rows of 48×48 frames in a 432×240 texture.
const SHEET_COLS: u32 = 9;
const SHEET_ROWS: u32 = 5;
const FRAME_W: f32 = 1.0 / SHEET_COLS as f32; // UV width per frame
const FRAME_H: f32 = 1.0 / SHEET_ROWS as f32; // UV height per frame

/// World-space size of the frog billboard quad.
const FROG_SIZE: f32 = 0.9;

/// Seconds per animation frame (base — each frog gets a randomized variant).
const FRAME_DURATION_BASE: f32 = 0.15;

/// How long a frog sits idle before doing something (seconds).
const IDLE_MIN: f32 = 3.0;
const IDLE_MAX: f32 = 10.0;

/// Recycle when this far from scene center — naturally hop out then reappear at edge.
const RECYCLE_DIST: f32 = 28.0;
/// Spawn/recycle at this radius (well beyond camera view so frogs hop in naturally).
const SPAWN_RING_INNER: f32 = 22.0;
const SPAWN_RING_OUTER: f32 = 26.0;
/// Maximum height difference allowed for a jump target (rejects cliffs/walls).
const MAX_JUMP_HEIGHT_DIFF: f32 = 0.8;

// ---------------------------------------------------------------------------
// Animation definitions
// ---------------------------------------------------------------------------

/// An animation is a row + frame range in the sprite sheet (left to right).
#[derive(Clone, Copy)]
struct Anim {
    row: u32,
    start_col: u32,
    frame_count: u32,
}

/// Row 0 — Idle / Croak (8 frames). Frame 0 is the resting pose.
const ANIM_IDLE: Anim = Anim {
    row: 0,
    start_col: 0,
    frame_count: 8,
};
/// Row 1 — Jump (7 frames). Frames 0-3 = windup, frames 4-6 = mid-air.
const ANIM_JUMP: Anim = Anim {
    row: 1,
    start_col: 0,
    frame_count: 7,
};
/// First mid-air frame index within ANIM_JUMP.
const JUMP_AIRBORNE_FRAME: u32 = 4;
/// Row 2 — Attack (6 frames).
#[allow(dead_code)]
const ANIM_ATTACK: Anim = Anim {
    row: 2,
    start_col: 0,
    frame_count: 6,
};
/// Row 3 — Hurt (4 frames).
#[allow(dead_code)]
const ANIM_HURT: Anim = Anim {
    row: 3,
    start_col: 0,
    frame_count: 4,
};
/// Row 4 — Death (9 frames).
#[allow(dead_code)]
const ANIM_DEATH: Anim = Anim {
    row: 4,
    start_col: 0,
    frame_count: 9,
};

// ---------------------------------------------------------------------------
// State & component
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum FrogState {
    /// Sitting, playing idle animation, waiting to do something.
    Idle { timer: f32 },
    /// Playing the croak emote (full idle row animation), then returning to idle.
    Emote { remaining_frames: u32 },
    /// Wind-up: playing jump animation frames while still on the ground.
    /// Once the animation finishes, transitions to Airborne.
    JumpWindup { target: Vec3 },
    /// Airborne arc — holds the last jump frame (legs up) while moving.
    Airborne {
        start: Vec3,
        target: Vec3,
        progress: f32,
    },
    /// Brief landing pause before returning to idle.
    Landing { timer: f32 },
}

/// Holds all frog material handles so the weather system can tint them.
#[derive(Resource, Default)]
pub struct FrogMaterials {
    pub handles: Vec<Handle<StandardMaterial>>,
}

#[derive(Component)]
pub(crate) struct Frog {
    phase: f32,
    anchor: Vec3,
    anim: Anim,
    frame_timer: f32,
    frame_duration: f32,
    current_frame: u32,
    state: FrogState,
    facing_left: bool,
}

// ---------------------------------------------------------------------------
// Mesh — a simple billboard quad
// ---------------------------------------------------------------------------

fn build_frog_quad() -> Mesh {
    let h = FROG_SIZE;
    let w = FROG_SIZE;
    // Quad sitting on the ground (bottom edge at y=0)
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-w * 0.5, h, 0.0],   // top-left
            [w * 0.5, h, 0.0],    // top-right
            [w * 0.5, 0.0, 0.0],  // bottom-right
            [-w * 0.5, 0.0, 0.0], // bottom-left
        ],
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 1.0]; 4])
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_UV_0,
        vec![
            [0.0, 0.0], // top-left (will be updated per frame)
            [FRAME_W, 0.0],
            [FRAME_W, FRAME_H],
            [0.0, FRAME_H],
        ],
    )
    .with_inserted_indices(Indices::U32(vec![0, 2, 1, 0, 3, 2]))
}

/// Compute UV coordinates for a given frame in the sprite sheet.
/// Animations are row-based: each row is one animation, frames go left to right.
fn frame_uvs(anim: &Anim, frame: u32, flip: bool) -> [[f32; 2]; 4] {
    let col = anim.start_col + (frame % anim.frame_count);
    let row = anim.row;
    let u0 = col as f32 * FRAME_W;
    let u1 = u0 + FRAME_W;
    let v0 = row as f32 * FRAME_H;
    let v1 = v0 + FRAME_H;
    if flip {
        // Mirror horizontally
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
) {
    if pool.frogs_spawned {
        return;
    }
    pool.frogs_spawned = true;

    let texture: Handle<Image> = asset_server.load("textures/frog_green_mob.png");
    let frog_mesh = meshes.add(build_frog_quad());

    for i in 0..FROG_COUNT {
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

        // Stagger idle timers so frogs don't all act in unison.
        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);
        // Per-frog animation speed variation (±20%) so they feel independent.
        let frame_duration = FRAME_DURATION_BASE * (0.8 + hash_f32(seed * 79 + 17) * 0.4);
        // Start each frog on a different animation frame.
        let start_frame = (hash_f32(seed * 41 + 7) * ANIM_IDLE.frame_count as f32) as u32;

        commands.spawn((
            Mesh3d(frog_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Frog {
                phase,
                anchor: Vec3::new(0.0, -100.0, 0.0),
                anim: ANIM_IDLE,
                frame_timer: hash_f32(seed * 83 + 13) * frame_duration,
                frame_duration,
                current_frame: start_frame % ANIM_IDLE.frame_count,
                state: FrogState::Idle { timer: idle_timer },
                facing_left: hash_f32(seed * 67 + 3) > 0.5,
            },
        ));
    }
}

pub(super) fn animate_frogs(
    time: Res<Time>,
    game_time: Res<GameTime>,
    mut terrain: ResMut<TerrainMap>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut frog_q: Query<
        (&mut Transform, &mut Frog, &mut Visibility, &Mesh3d),
        Without<IsometricCamera>,
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let df = day_factor(game_time.hour);

    // Frogs are daytime creatures (same schedule as butterflies)
    if df < 0.01 {
        for (mut tf, mut frog, mut vis, _) in &mut frog_q {
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            frog.anchor.y = -100.0;
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);

    for (mut tf, mut frog, mut vis, mesh_handle) in &mut frog_q {
        // Per-frog seed: mix phase bits so each frog gets unique randomness
        let frog_id = (frog.phase * 100000.0) as u32;

        // Relocate frog if too far from scene center or below world
        let dist = Vec2::new(frog.anchor.x - center.x, frog.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || frog.anchor.y < -50.0 {
            // Respawn on the edge ring and hop inward so they enter naturally.
            let seed = frog_id.wrapping_mul(2654435761) ^ (t * 31.0) as u32;
            let angle = hash_f32(seed) * std::f32::consts::TAU;
            let ring =
                SPAWN_RING_INNER + hash_f32(seed + 100) * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
            let spawn_x = center.x + angle.cos() * ring;
            let spawn_z = center.z + angle.sin() * ring;
            let ground = terrain.height_at_world(spawn_x, spawn_z);
            frog.anchor = Vec3::new(spawn_x, ground, spawn_z);
            // Pick a hop target toward center so the frog enters by jumping in
            let inward_angle = angle + std::f32::consts::PI + (hash_f32(seed + 300) - 0.5) * 0.6;
            let hop_dist = 1.0 + hash_f32(seed + 400) * 1.5;
            let hop_x = spawn_x + inward_angle.cos() * hop_dist;
            let hop_z = spawn_z + inward_angle.sin() * hop_dist;
            let hop_ground = terrain.height_at_world(hop_x, hop_z);
            let target = Vec3::new(hop_x, hop_ground, hop_z);
            let dx = target.x - frog.anchor.x;
            let dz = target.z - frog.anchor.z;
            frog.facing_left = (dx - dz) < 0.0;
            frog.anim = ANIM_JUMP;
            frog.current_frame = 0;
            frog.frame_timer = 0.0;
            frog.state = FrogState::JumpWindup { target };
            // Stay hidden until the hop starts (Airborne will set Visible)
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
            continue;
        }

        // Advance animation frame (per-frog timing for variety)
        frog.frame_timer += dt;
        if frog.frame_timer >= frog.frame_duration {
            frog.frame_timer -= frog.frame_duration;
            frog.current_frame += 1;
            if frog.current_frame >= frog.anim.frame_count {
                frog.current_frame = 0;
            }
        }

        // Snap anchor to terrain so frogs sit on the ground
        let ground = terrain.height_at_world(frog.anchor.x, frog.anchor.z);
        frog.anchor.y = ground;

        // State machine
        let mut state = frog.state;
        match state {
            FrogState::Idle { ref mut timer } => {
                frog.anim = ANIM_IDLE;
                frog.current_frame = 0; // hold resting pose
                tf.translation = frog.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    // Per-frog unique seed using wrapping multiply for spread
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 100.0) as u32;
                    let roll = hash_f32(seed);
                    if roll < 0.35 {
                        // Prepare to jump — pick a target, reject cliffs/walls
                        let angle = hash_f32(seed + 100) * std::f32::consts::TAU;
                        let dist = 0.5 + hash_f32(seed + 200) * 1.5;
                        let target_x = frog.anchor.x + angle.cos() * dist;
                        let target_z = frog.anchor.z + angle.sin() * dist;
                        let target_ground = terrain.height_at_world(target_x, target_z);
                        let height_diff = (target_ground - frog.anchor.y).abs();
                        if height_diff > MAX_JUMP_HEIGHT_DIFF {
                            // Too steep — stay idle a bit longer instead
                            state = FrogState::Idle { timer: 0.5 };
                        } else {
                            let target = Vec3::new(target_x, target_ground, target_z);
                            // Isometric facing: screen-left = world(-X,+Z)
                            let dx = target.x - frog.anchor.x;
                            let dz = target.z - frog.anchor.z;
                            frog.facing_left = (dx - dz) < 0.0;
                            frog.anim = ANIM_JUMP;
                            frog.current_frame = 0;
                            frog.frame_timer = 0.0;
                            state = FrogState::JumpWindup { target };
                        }
                    } else {
                        // Croak emote — play through row 0 animation
                        frog.anim = ANIM_IDLE;
                        frog.current_frame = 0;
                        frog.frame_timer = 0.0;
                        state = FrogState::Emote {
                            remaining_frames: ANIM_IDLE.frame_count,
                        };
                    }
                }
            }

            FrogState::Emote {
                ref mut remaining_frames,
            } => {
                tf.translation = frog.anchor;
                // Count down frames
                if frog.frame_timer < 0.001 && frog.current_frame == 0 && *remaining_frames > 0 {
                    *remaining_frames = remaining_frames.saturating_sub(frog.anim.frame_count);
                }
                if frog.current_frame == frog.anim.frame_count - 1 && *remaining_frames == 0 {
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 73.0) as u32;
                    state = FrogState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                    frog.anim = ANIM_IDLE;
                    frog.current_frame = 0;
                }
            }

            FrogState::JumpWindup { target } => {
                // Stay on the ground, play windup frames (0 .. JUMP_AIRBORNE_FRAME-1)
                tf.translation = frog.anchor;
                // Once we reach the first airborne frame, launch into the arc
                if frog.current_frame >= JUMP_AIRBORNE_FRAME {
                    frog.current_frame = JUMP_AIRBORNE_FRAME;
                    state = FrogState::Airborne {
                        start: frog.anchor,
                        target,
                        progress: 0.0,
                    };
                }
            }

            FrogState::Airborne {
                start,
                target,
                ref mut progress,
            } => {
                // Cycle through the mid-air frames (JUMP_AIRBORNE_FRAME .. frame_count-1)
                frog.anim = ANIM_JUMP;
                let airborne_frames = ANIM_JUMP.frame_count - JUMP_AIRBORNE_FRAME;
                frog.current_frame =
                    JUMP_AIRBORNE_FRAME + ((t / frog.frame_duration) as u32 % airborne_frames);

                let jump_duration = start.distance(target) / 2.0; // ~2 units/sec
                *progress += dt / jump_duration.max(0.1);
                let p = progress.clamp(0.0, 1.0);

                // Horizontal lerp
                let pos = start.lerp(target, p);
                // Arc: parabolic hop
                let hop_height = 0.3 + start.distance(target) * 0.15;
                let arc = 4.0 * hop_height * p * (1.0 - p);
                tf.translation = Vec3::new(pos.x, pos.y + arc, pos.z);

                if *progress >= 1.0 {
                    frog.anchor = target;
                    frog.anim = ANIM_IDLE;
                    frog.current_frame = 0;
                    state = FrogState::Landing { timer: 0.15 };
                }
            }

            FrogState::Landing { ref mut timer } => {
                tf.translation = frog.anchor;
                frog.anim = ANIM_IDLE;
                frog.current_frame = 0; // hold first frame (settled pose)
                *timer -= dt;
                if *timer <= 0.0 {
                    let seed = frog_id.wrapping_mul(2654435761) ^ (t * 47.0) as u32;
                    state = FrogState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                }
            }
        }
        frog.state = state;

        // Update UVs on the mesh to show current frame
        // Sprite natively faces right (east); flip UVs when facing left
        let uvs = frame_uvs(&frog.anim, frog.current_frame, frog.facing_left);
        if let Some(mesh) = meshes.get_mut(mesh_handle.0.id()) {
            mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, vec![uvs[0], uvs[1], uvs[2], uvs[3]]);
        }

        // Billboard: face camera (project onto XZ plane to stay perfectly upright)
        let to_cam = cam_pos - tf.translation;
        let to_cam_flat = Vec3::new(to_cam.x, 0.0, to_cam.z).normalize_or_zero();
        if to_cam_flat.length_squared() > 0.001 {
            tf.look_to(to_cam_flat, Vec3::Y);
        }

        *vis = Visibility::Visible;
    }
}
