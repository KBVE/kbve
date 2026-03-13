use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, day_factor, hash_f32, scene_center};
use crate::game::camera::IsometricCamera;
use crate::game::weather::DayCycle;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROG_COUNT: usize = 6;

/// Sprite sheet layout: 8 columns × 4 rows of 32×32 frames in a 256×128 texture.
const SHEET_COLS: u32 = 8;
const SHEET_ROWS: u32 = 4;
const FRAME_W: f32 = 1.0 / SHEET_COLS as f32; // UV width per frame
const FRAME_H: f32 = 1.0 / SHEET_ROWS as f32; // UV height per frame

/// World-space size of the frog billboard quad.
const FROG_SIZE: f32 = 0.35;

/// Seconds per animation frame.
const FRAME_DURATION: f32 = 0.15;

/// How long a frog sits idle before doing something (seconds).
const IDLE_MIN: f32 = 3.0;
const IDLE_MAX: f32 = 8.0;

/// How far a frog can be from scene center before recycling.
const RECYCLE_DIST: f32 = 14.0;

// ---------------------------------------------------------------------------
// Animation definitions
// ---------------------------------------------------------------------------

/// An animation is a row + frame range in the sprite sheet.
#[derive(Clone, Copy)]
struct Anim {
    row: u32,
    start_col: u32,
    frame_count: u32,
}

const ANIM_IDLE: Anim = Anim {
    row: 0,
    start_col: 0,
    frame_count: 6,
};
const ANIM_CROAK: Anim = Anim {
    row: 1,
    start_col: 0,
    frame_count: 5,
};
const ANIM_JUMP: Anim = Anim {
    row: 2,
    start_col: 0,
    frame_count: 5,
};
const ANIM_JUDGE: Anim = Anim {
    row: 3,
    start_col: 1,
    frame_count: 4,
};

// ---------------------------------------------------------------------------
// State & component
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum FrogState {
    /// Sitting, playing idle animation, waiting to do something.
    Idle { timer: f32 },
    /// Playing croak or judge animation, then returning to idle.
    Emote { remaining_frames: u32 },
    /// Jumping to a new position.
    Jumping {
        start: Vec3,
        target: Vec3,
        progress: f32,
    },
}

#[derive(Component)]
pub(super) struct Frog {
    phase: f32,
    anchor: Vec3,
    anim: Anim,
    frame_timer: f32,
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
) {
    if pool.frogs_spawned {
        return;
    }
    pool.frogs_spawned = true;

    let texture: Handle<Image> =
        asset_server.load("../src-tauri/src/game/creatures/frog/frog_green.png");
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

        let idle_timer = IDLE_MIN + hash_f32(seed * 53 + 11) * (IDLE_MAX - IDLE_MIN);

        commands.spawn((
            Mesh3d(frog_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Frog {
                phase,
                anchor: Vec3::new(0.0, -100.0, 0.0),
                anim: ANIM_IDLE,
                frame_timer: 0.0,
                current_frame: 0,
                state: FrogState::Idle { timer: idle_timer },
                facing_left: hash_f32(seed * 67 + 3) > 0.5,
            },
        ));
    }
}

pub(super) fn animate_frogs(
    time: Res<Time>,
    day: Res<DayCycle>,
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
    let df = day_factor(day.hour);

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
        // Relocate frog if too far from scene center or below world
        let dist = Vec2::new(frog.anchor.x - center.x, frog.anchor.z - center.z).length();
        if dist > RECYCLE_DIST || frog.anchor.y < -50.0 {
            let seed = (frog.phase * 10000.0) as u32 + (t * 2.7) as u32;
            let rx = hash_f32(seed) * 2.0 - 1.0;
            let rz = hash_f32(seed + 100) * 2.0 - 1.0;
            frog.anchor = center + Vec3::new(rx * 8.0, 0.0, rz * 8.0);
            frog.state = FrogState::Idle {
                timer: IDLE_MIN + hash_f32(seed + 200) * (IDLE_MAX - IDLE_MIN),
            };
            frog.anim = ANIM_IDLE;
            frog.current_frame = 0;
        }

        // Advance animation frame
        frog.frame_timer += dt;
        if frog.frame_timer >= FRAME_DURATION {
            frog.frame_timer -= FRAME_DURATION;
            frog.current_frame += 1;
            if frog.current_frame >= frog.anim.frame_count {
                frog.current_frame = 0;
            }
        }

        // State machine
        let mut state = frog.state;
        match state {
            FrogState::Idle { ref mut timer } => {
                frog.anim = ANIM_IDLE;
                tf.translation = frog.anchor;

                *timer -= dt;
                if *timer <= 0.0 {
                    // Pick a random action
                    let seed = (frog.phase * 10000.0) as u32 + (t * 5.3) as u32;
                    let roll = hash_f32(seed);
                    if roll < 0.35 {
                        // Jump to a nearby position
                        let angle = hash_f32(seed + 100) * std::f32::consts::TAU;
                        let dist = 0.5 + hash_f32(seed + 200) * 1.5;
                        let target =
                            frog.anchor + Vec3::new(angle.cos() * dist, 0.0, angle.sin() * dist);
                        // Face the jump direction
                        frog.facing_left = target.x < frog.anchor.x;
                        frog.anim = ANIM_JUMP;
                        frog.current_frame = 0;
                        frog.frame_timer = 0.0;
                        state = FrogState::Jumping {
                            start: frog.anchor,
                            target,
                            progress: 0.0,
                        };
                    } else if roll < 0.65 {
                        // Croak
                        frog.anim = ANIM_CROAK;
                        frog.current_frame = 0;
                        frog.frame_timer = 0.0;
                        state = FrogState::Emote {
                            remaining_frames: ANIM_CROAK.frame_count,
                        };
                    } else {
                        // Judge (secondary idle)
                        frog.anim = ANIM_JUDGE;
                        frog.current_frame = 0;
                        frog.frame_timer = 0.0;
                        state = FrogState::Emote {
                            remaining_frames: ANIM_JUDGE.frame_count * 2, // play twice
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
                    let seed = (frog.phase * 10000.0) as u32 + (t * 3.1) as u32;
                    state = FrogState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                    frog.anim = ANIM_IDLE;
                    frog.current_frame = 0;
                }
            }

            FrogState::Jumping {
                start,
                target,
                ref mut progress,
            } => {
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
                    let seed = (frog.phase * 10000.0) as u32 + (t * 4.7) as u32;
                    state = FrogState::Idle {
                        timer: IDLE_MIN + hash_f32(seed) * (IDLE_MAX - IDLE_MIN),
                    };
                    frog.anim = ANIM_IDLE;
                    frog.current_frame = 0;
                }
            }
        }
        frog.state = state;

        // Update UVs on the mesh to show current frame
        let uvs = frame_uvs(&frog.anim, frog.current_frame, frog.facing_left);
        if let Some(mesh) = meshes.get_mut(mesh_handle.0.id()) {
            mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, vec![uvs[0], uvs[1], uvs[2], uvs[3]]);
        }

        // Billboard: face camera
        let to_cam = (cam_pos - tf.translation).normalize_or_zero();
        tf.look_to(to_cam, Vec3::Y);

        *vis = Visibility::Visible;
    }
}
