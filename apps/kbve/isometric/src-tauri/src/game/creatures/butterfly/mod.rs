use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, day_factor, flutter_offset, hash_f32, scene_center};
use super::firefly::Firefly;
use crate::game::camera::IsometricCamera;
use crate::game::weather::{DayCycle, WindState};

const BUTTERFLY_COUNT: usize = 14;

/// XZ distance from scene center that triggers exit flight.
const EXIT_TRIGGER: f32 = 10.0;
/// Radius at which entering butterflies spawn (edge of visible area).
const ENTER_RADIUS: f32 = 12.0;
/// Flight speed (units/sec) during entry.
const ENTER_SPEED: f32 = 2.5;
/// Flight speed (units/sec) during exit.
const EXIT_SPEED: f32 = 3.0;
/// Total distance a butterfly travels while exiting before going idle.
const EXIT_DISTANCE: f32 = 8.0;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const PALETTE: &[(f32, f32, f32)] = &[
    (0.90, 0.50, 0.10), // monarch orange
    (0.92, 0.88, 0.78), // cabbage white
    (0.35, 0.35, 0.92), // morpho blue
    (0.95, 0.85, 0.20), // sulphur yellow
    (0.85, 0.25, 0.55), // painted lady pink
    (0.20, 0.75, 0.45), // emerald swallowtail
    (0.70, 0.35, 0.80), // purple emperor
];

fn butterfly_color(index: usize) -> Color {
    let (r, g, b) = PALETTE[index % PALETTE.len()];
    let seed = (index as u32).wrapping_add(800);
    let dr = (hash_f32(seed * 41 + 1) - 0.5) * 0.08;
    let dg = (hash_f32(seed * 43 + 2) - 0.5) * 0.08;
    let db = (hash_f32(seed * 47 + 3) - 0.5) * 0.08;
    Color::srgba(
        (r + dr).clamp(0.0, 1.0),
        (g + dg).clamp(0.0, 1.0),
        (b + db).clamp(0.0, 1.0),
        1.0,
    )
}

// ---------------------------------------------------------------------------
// State & component
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum ButterflyState {
    Idle,
    Entering {
        origin: Vec3,
        target: Vec3,
        progress: f32,
    },
    Active,
    Exiting {
        start: Vec3,
        direction: Vec3,
        progress: f32,
    },
}

#[derive(Component)]
pub(super) struct Butterfly {
    phase: f32,
    anchor: Vec3,
    wander_speed: f32,
    wander_radius: f32,
    flap_speed: f32,
    size_scale: f32,
    mat_handle: Handle<StandardMaterial>,
    state: ButterflyState,
    idle_cooldown: f32,
}

// ---------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------

/// Two-winged butterfly mesh with distinct upper and lower wing lobes.
/// Wing span ~0.5 units (~16px at 32px/unit).
fn build_mesh() -> Mesh {
    let positions = vec![
        [0.0, 0.02, 0.0],    // 0: body top
        [-0.22, 0.05, 0.0],  // 1: left upper wing inner
        [-0.18, 0.18, 0.0],  // 2: left upper wing tip
        [-0.20, -0.04, 0.0], // 3: left lower wing inner
        [-0.15, -0.14, 0.0], // 4: left lower wing tip
        [0.18, 0.18, 0.0],   // 5: right upper wing tip
        [0.22, 0.05, 0.0],   // 6: right upper wing inner
        [0.15, -0.14, 0.0],  // 7: right lower wing tip
        [0.20, -0.04, 0.0],  // 8: right lower wing inner
        [0.0, -0.06, 0.0],   // 9: body bottom
    ];
    let normals = vec![[0.0, 0.0, 1.0]; 10];
    let uvs = vec![
        [0.5, 0.42],
        [0.06, 0.33],
        [0.14, 0.0],
        [0.1, 0.58],
        [0.19, 1.0],
        [0.86, 0.0],
        [0.94, 0.33],
        [0.81, 1.0],
        [0.9, 0.58],
        [0.5, 0.72],
    ];
    let indices = vec![
        0, 1, 2, // left upper wing
        9, 4, 3, // left lower wing
        0, 2, 1, // left upper back-face
        0, 5, 6, // right upper wing
        9, 8, 7, // right lower wing
        0, 3, 1, // left wing bridge
        9, 3, 0, // left body
        0, 6, 8, // right wing bridge
        9, 0, 8, // right body
    ];
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_indices(Indices::U32(indices))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn apply_flap_and_billboard(
    tf: &mut Transform,
    pos: Vec3,
    cam_pos: Vec3,
    t: f32,
    flap_speed: f32,
    phase: f32,
    size_scale: f32,
) {
    tf.translation = pos;
    let to_cam = (cam_pos - pos).normalize_or_zero();
    tf.look_to(to_cam, Vec3::Y);
    let flap = (t * flap_speed * std::f32::consts::TAU + phase * 10.0).sin();
    let wing_scale = 0.4 + flap.abs() * 0.6;
    tf.scale = Vec3::new(wing_scale * size_scale, size_scale, size_scale);
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

pub(super) fn spawn_butterflies(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<CreaturePool>,
) {
    if pool.butterflies_spawned {
        return;
    }
    pool.butterflies_spawned = true;

    let wing_mesh = meshes.add(build_mesh());

    for i in 0..BUTTERFLY_COUNT {
        let seed = (i as u32).wrapping_add(500);
        let phase = hash_f32(seed * 11 + 1);
        let wander_speed = 0.3 + hash_f32(seed * 17 + 3) * 0.4;
        let wander_radius = 0.8 + hash_f32(seed * 29 + 5) * 1.2;
        let flap_speed = 6.0 + hash_f32(seed * 37 + 7) * 4.0;
        let size_scale = 0.7 + hash_f32(seed * 41 + 9) * 0.6;
        let idle_cooldown = hash_f32(seed * 53 + 11) * 3.0;

        let mat = materials.add(StandardMaterial {
            base_color: butterfly_color(i),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            cull_mode: None,
            ..default()
        });
        let mat_clone = mat.clone();

        commands.spawn((
            Mesh3d(wing_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Butterfly {
                phase,
                anchor: Vec3::ZERO,
                wander_speed,
                wander_radius,
                flap_speed,
                size_scale,
                mat_handle: mat_clone,
                state: ButterflyState::Idle,
                idle_cooldown,
            },
        ));
    }
}

pub(super) fn animate_butterflies(
    time: Res<Time>,
    day: Res<DayCycle>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut bfly_q: Query<
        (&mut Transform, &mut Butterfly, &mut Visibility),
        (Without<IsometricCamera>, Without<Firefly>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let df = day_factor(day.hour);

    if df < 0.01 {
        for (mut tf, mut bfly, mut vis) in &mut bfly_q {
            if bfly.state != ButterflyState::Idle {
                bfly.state = ButterflyState::Idle;
                bfly.idle_cooldown = 1.0 + hash_f32((bfly.phase * 10000.0) as u32) * 2.0;
            }
            *vis = Visibility::Hidden;
            tf.translation.y = -100.0;
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    let center = scene_center(cam_pos);
    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.005;
    let wind_off = Vec3::new(wd_x * wind_drift * t, 0.0, wd_z * wind_drift * t);

    for (mut tf, mut bfly, mut vis) in &mut bfly_q {
        let mut state = bfly.state;

        match state {
            ButterflyState::Idle => {
                *vis = Visibility::Hidden;
                tf.translation.y = -100.0;

                bfly.idle_cooldown -= dt;
                if bfly.idle_cooldown <= 0.0 {
                    let seed = (bfly.phase * 10000.0) as u32 + (t * 7.1) as u32;
                    let theta = hash_f32(seed) * std::f32::consts::TAU;
                    let ry = hash_f32(seed + 200);
                    let origin = center
                        + Vec3::new(
                            theta.cos() * ENTER_RADIUS,
                            0.8 + ry * 1.5,
                            theta.sin() * ENTER_RADIUS,
                        );
                    let rx = hash_f32(seed + 300) * 2.0 - 1.0;
                    let rz = hash_f32(seed + 400) * 2.0 - 1.0;
                    let ry2 = hash_f32(seed + 500);
                    let target = center + Vec3::new(rx * 6.0, 0.8 + ry2 * 1.5, rz * 6.0);

                    state = ButterflyState::Entering {
                        origin,
                        target,
                        progress: 0.0,
                    };
                }
            }

            ButterflyState::Entering {
                origin,
                target,
                ref mut progress,
            } => {
                let path_len = origin.distance(target).max(0.1);
                *progress += dt * ENTER_SPEED / path_len;
                let p = progress.clamp(0.0, 1.0);

                let ease = p * p * (3.0 - 2.0 * p);
                let base_pos = origin.lerp(target, ease);
                let flut =
                    flutter_offset(t, bfly.phase, bfly.wander_speed, bfly.wander_radius, 0.3);
                let pos = base_pos + flut + wind_off;

                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bfly.flap_speed,
                    bfly.phase,
                    bfly.size_scale,
                );

                if let Some(mat) = materials.get_mut(&bfly.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9 * p;
                    mat.base_color = c.into();
                }

                if *progress >= 1.0 {
                    bfly.anchor = target;
                    state = ButterflyState::Active;
                }
            }

            ButterflyState::Active => {
                let flut =
                    flutter_offset(t, bfly.phase, bfly.wander_speed, bfly.wander_radius, 1.0);
                let pos = bfly.anchor + flut + wind_off;

                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bfly.flap_speed,
                    bfly.phase,
                    bfly.size_scale,
                );

                if let Some(mat) = materials.get_mut(&bfly.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9;
                    mat.base_color = c.into();
                }

                let dist_xz =
                    Vec2::new(bfly.anchor.x - center.x, bfly.anchor.z - center.z).length();
                if dist_xz > EXIT_TRIGGER {
                    let away = Vec3::new(bfly.anchor.x - center.x, 0.15, bfly.anchor.z - center.z)
                        .normalize_or_zero();
                    let dir = if away.length_squared() < 0.01 {
                        let seed = (bfly.phase * 10000.0) as u32 + (t * 5.0) as u32;
                        let a = hash_f32(seed) * std::f32::consts::TAU;
                        Vec3::new(a.cos(), 0.15, a.sin()).normalize()
                    } else {
                        away
                    };
                    state = ButterflyState::Exiting {
                        start: tf.translation,
                        direction: dir,
                        progress: 0.0,
                    };
                }
            }

            ButterflyState::Exiting {
                start,
                direction,
                ref mut progress,
            } => {
                *progress += dt * EXIT_SPEED / EXIT_DISTANCE;
                let p = progress.clamp(0.0, 1.0);

                let base_pos = start + direction * (p * EXIT_DISTANCE);
                let flut = flutter_offset(
                    t,
                    bfly.phase,
                    bfly.wander_speed,
                    bfly.wander_radius,
                    1.0 - p,
                );
                let pos = base_pos + flut + wind_off;

                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bfly.flap_speed,
                    bfly.phase,
                    bfly.size_scale,
                );

                if let Some(mat) = materials.get_mut(&bfly.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9 * (1.0 - p);
                    mat.base_color = c.into();
                }

                if *progress >= 1.0 {
                    let seed = (bfly.phase * 10000.0) as u32 + (t * 3.3) as u32;
                    bfly.idle_cooldown = 1.0 + hash_f32(seed) * 2.0;
                    tf.translation.y = -100.0;
                    *vis = Visibility::Hidden;
                    state = ButterflyState::Idle;
                }
            }
        }

        bfly.state = state;
    }
}
