use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::camera::IsometricCamera;
use super::weather::{DayCycle, WindState};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Number of firefly entities in the pool.
const FIREFLY_COUNT: usize = 40;

/// Fireflies appear when hour >= NIGHT_START or hour < NIGHT_END.
const NIGHT_START: f32 = 19.0;
const NIGHT_END: f32 = 5.5;

/// Transition band (hours) for fade in/out at dusk/dawn.
const TRANSITION_BAND: f32 = 1.5;

const BUTTERFLY_COUNT: usize = 14;

/// Butterflies active during 7:00–18:00 with 1.5h fade.
const DAY_START: f32 = 7.0;
const DAY_END: f32 = 18.0;
const DAY_BAND: f32 = 1.5;

/// XZ distance from scene center that triggers exit flight.
const BUTTERFLY_EXIT_TRIGGER: f32 = 10.0;
/// Radius at which entering butterflies spawn (edge of visible area).
const BUTTERFLY_ENTER_RADIUS: f32 = 12.0;
/// Flight speed (units/sec) during entry.
const BUTTERFLY_ENTER_SPEED: f32 = 2.5;
/// Flight speed (units/sec) during exit.
const BUTTERFLY_EXIT_SPEED: f32 = 3.0;
/// Total distance a butterfly travels while exiting before going idle.
const BUTTERFLY_EXIT_DISTANCE: f32 = 8.0;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

#[derive(Component)]
struct Firefly {
    /// Unique phase offset for desynchronized animation.
    phase: f32,
    /// World position the firefly orbits around.
    anchor: Vec3,
    /// Current glow pulse phase (0.0–1.0 within a pulse cycle).
    glow_phase: f32,
    /// Duration of one full glow pulse cycle in seconds.
    glow_period: f32,
    /// Orbit radius (XZ wander distance from anchor).
    orbit_radius: f32,
    /// Orbit speed multiplier.
    orbit_speed: f32,
    /// Handle to this firefly's unique material (for per-entity alpha/emissive).
    mat_handle: Handle<StandardMaterial>,
    /// Handle to this firefly's point light entity.
    light_entity: Entity,
}

#[derive(Resource, Default)]
struct FireflyPool {
    initialized: bool,
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random (no deps, WASM-safe)
// ---------------------------------------------------------------------------

/// Simple hash for deterministic variety per firefly index.
fn hash_f32(seed: u32) -> f32 {
    let mut x = seed;
    x ^= x >> 16;
    x = x.wrapping_mul(0x45d9f3b);
    x ^= x >> 16;
    (x & 0xFFFF) as f32 / 65535.0
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn spawn_fireflies(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<FireflyPool>,
) {
    if pool.initialized {
        return;
    }
    pool.initialized = true;

    // Shared mesh: tiny sphere for the firefly body
    let fly_mesh = meshes.add(Sphere::new(0.04).mesh().ico(1).unwrap());

    for i in 0..FIREFLY_COUNT {
        let seed = i as u32;
        let phase = hash_f32(seed * 7 + 1);
        let glow_period = 2.0 + hash_f32(seed * 13 + 3) * 3.0; // 2–5 seconds
        let orbit_radius = 0.4 + hash_f32(seed * 19 + 5) * 0.8; // 0.4–1.2
        let orbit_speed = 0.6 + hash_f32(seed * 23 + 7) * 0.8; // 0.6–1.4

        // Each firefly gets its own material for independent glow control
        let mat = materials.add(StandardMaterial {
            base_color: Color::srgba(0.5, 0.9, 0.3, 0.0),
            emissive: LinearRgba::new(0.0, 0.0, 0.0, 1.0),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            ..default()
        });
        let mat_clone = mat.clone();

        // Spawn a small point light per firefly for the green glow
        let light_entity = commands
            .spawn((
                PointLight {
                    color: Color::srgb(0.4, 0.85, 0.25),
                    intensity: 0.0, // starts off
                    radius: 0.05,
                    range: 3.0,
                    shadows_enabled: false,
                    ..default()
                },
                Transform::from_xyz(0.0, -100.0, 0.0),
                Visibility::Hidden,
            ))
            .id();

        commands.spawn((
            Mesh3d(fly_mesh.clone()),
            MeshMaterial3d(mat),
            Transform::from_xyz(0.0, -100.0, 0.0),
            Visibility::Hidden,
            Firefly {
                phase,
                anchor: Vec3::ZERO,
                glow_phase: phase, // staggered start
                glow_period,
                orbit_radius,
                orbit_speed,
                mat_handle: mat_clone,
                light_entity,
            },
        ));
    }
}

/// Compute how visible fireflies should be (0.0 = hidden, 1.0 = full night).
fn night_factor(hour: f32) -> f32 {
    if hour >= NIGHT_START {
        // Dusk transition: 19:00–20:30
        ((hour - NIGHT_START) / TRANSITION_BAND).clamp(0.0, 1.0)
    } else if hour < NIGHT_END {
        // Full night until dawn transition: 4:00–5:30
        ((NIGHT_END - hour) / TRANSITION_BAND).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn animate_fireflies(
    time: Res<Time>,
    day: Res<DayCycle>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut fly_q: Query<(&mut Transform, &mut Firefly, &mut Visibility), Without<IsometricCamera>>,
    mut light_q: Query<
        (&mut PointLight, &mut Transform, &mut Visibility),
        (Without<IsometricCamera>, Without<Firefly>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let nf = night_factor(day.hour);

    // Daytime: hide everything
    if nf < 0.01 {
        for (_, mut fly, mut vis) in &mut fly_q {
            *vis = Visibility::Hidden;
            // Reset anchor so fireflies reposition when night returns
            fly.anchor.y = -100.0;
            if let Ok((mut pl, _, mut lvis)) = light_q.get_mut(fly.light_entity) {
                pl.intensity = 0.0;
                *lvis = Visibility::Hidden;
            }
        }
        return;
    }

    let cam_pos = cam_tf.translation;
    // Scene center (camera offset matches weather.rs pattern)
    let scene_center = Vec3::new(cam_pos.x - 15.0, 0.0, cam_pos.z - 15.0);
    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.003; // subtle wind influence

    for (mut tf, mut fly, mut vis) in &mut fly_q {
        // Advance glow pulse
        fly.glow_phase += dt / fly.glow_period;
        if fly.glow_phase >= 1.0 {
            fly.glow_phase -= 1.0;
        }

        // Relocate anchor when firefly drifts too far or on first frame
        let dist_to_scene = (fly.anchor - scene_center).length();
        if dist_to_scene > 14.0 || fly.anchor.y < -50.0 {
            let seed = (fly.phase * 10000.0) as u32 + (t * 3.7) as u32;
            let rx = hash_f32(seed) * 2.0 - 1.0;
            let rz = hash_f32(seed + 100) * 2.0 - 1.0;
            let ry = hash_f32(seed + 200);
            fly.anchor = scene_center + Vec3::new(rx * 10.0, 1.5 + ry * 2.5, rz * 10.0);
        }

        // Orbit motion: figure-eight-ish path
        let p = fly.phase;
        let spd = fly.orbit_speed;
        let r = fly.orbit_radius;
        let ox = (t * spd * 0.7 + p * 6.28).sin() * r + (t * spd * 1.3 + p * 3.14).sin() * r * 0.4;
        let oy = (t * spd * 0.5 + p * 4.71).sin() * 0.3 + (t * spd * 1.1 + p * 2.09).cos() * 0.15;
        let oz = (t * spd * 0.9 + p * 5.24).cos() * r + (t * spd * 1.7 + p * 1.57).cos() * r * 0.3;

        // Wind drift
        let wind_off = Vec3::new(wd_x * wind_drift * t, 0.0, wd_z * wind_drift * t);

        let pos = fly.anchor + Vec3::new(ox, oy, oz) + wind_off;
        tf.translation = pos;
        *vis = Visibility::Visible;

        // Glow pulse: smooth blink pattern
        // Fireflies have a characteristic double-flash pattern
        let pulse_t = fly.glow_phase;
        let glow = if pulse_t < 0.15 {
            // First flash
            (pulse_t / 0.15 * std::f32::consts::PI).sin()
        } else if pulse_t < 0.25 {
            // Brief pause
            0.0
        } else if pulse_t < 0.40 {
            // Second flash (dimmer)
            ((pulse_t - 0.25) / 0.15 * std::f32::consts::PI).sin() * 0.6
        } else {
            // Dark period
            0.0
        };

        let intensity = glow * nf;

        // Update material emissive + alpha
        if let Some(mat) = materials.get_mut(&fly.mat_handle) {
            let emit = intensity * 4.0;
            mat.emissive = LinearRgba::new(0.3 * emit, 0.85 * emit, 0.15 * emit, 1.0);
            mat.base_color = Color::srgba(0.5, 0.9, 0.3, intensity * 0.8 + 0.1 * nf);
        }

        // Update point light
        if let Ok((mut pl, mut ltf, mut lvis)) = light_q.get_mut(fly.light_entity) {
            pl.intensity = intensity * 800.0; // candela
            ltf.translation = pos;
            *lvis = if intensity > 0.01 {
                Visibility::Visible
            } else {
                Visibility::Hidden
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Butterflies
// ---------------------------------------------------------------------------

/// Color palette for butterfly variants — each gets a slight per-entity tint shift.
const BUTTERFLY_PALETTE: &[(f32, f32, f32)] = &[
    (0.90, 0.50, 0.10), // monarch orange
    (0.92, 0.88, 0.78), // cabbage white
    (0.35, 0.35, 0.92), // morpho blue
    (0.95, 0.85, 0.20), // sulphur yellow
    (0.85, 0.25, 0.55), // painted lady pink
    (0.20, 0.75, 0.45), // emerald swallowtail
    (0.70, 0.35, 0.80), // purple emperor
];

/// Pick a base color from the palette with a per-entity tint variation.
fn butterfly_color(index: usize) -> Color {
    let (r, g, b) = BUTTERFLY_PALETTE[index % BUTTERFLY_PALETTE.len()];
    // Small per-entity tint shift so no two are identical
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

#[derive(Clone, Copy, PartialEq)]
enum ButterflyState {
    /// In the pool, hidden, waiting for cooldown to expire.
    Idle,
    /// Flying in from screen edge toward a target anchor.
    Entering {
        origin: Vec3,
        target: Vec3,
        progress: f32,
    },
    /// Normal wandering around anchor.
    Active,
    /// Flying away from the player toward the screen edge.
    Exiting {
        start: Vec3,
        direction: Vec3,
        progress: f32,
    },
}

#[derive(Component)]
struct Butterfly {
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

#[derive(Resource, Default)]
struct ButterflyPool {
    initialized: bool,
}

/// Two-winged butterfly mesh with distinct upper and lower wing lobes.
/// Wing span ~0.5 units (~16px at 32px/unit), clearly readable as a butterfly.
fn build_butterfly_mesh() -> Mesh {
    // Body center at origin. Wings extend left/right.
    // Each wing has an upper lobe (larger) and lower lobe (smaller).
    //
    //        2              5
    //       / \            / \
    //      /   \    0     /   \
    //     /     \  /|\   /     \
    //    1       \/   \ /       6
    //            |  B  |
    //    3      /\   / \       8
    //     \   /   \ /   \   /
    //      \ /     |     \ /
    //       4      0      7
    //
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
        [0.5, 0.42],  // 0
        [0.06, 0.33], // 1
        [0.14, 0.0],  // 2
        [0.1, 0.58],  // 3
        [0.19, 1.0],  // 4
        [0.86, 0.0],  // 5
        [0.94, 0.33], // 6
        [0.81, 1.0],  // 7
        [0.9, 0.58],  // 8
        [0.5, 0.72],  // 9
    ];
    // Left upper, left lower, right upper, right lower wing triangles
    let indices = vec![
        0, 1, 2, // left upper wing
        9, 4, 3, // left lower wing
        0, 2, 1, // left upper back-face (for double-sided without cull)
        0, 5, 6, // right upper wing
        9, 8, 7, // right lower wing
        // Connect wings to body
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

/// Daytime visibility factor: 0.0 at night, 1.0 during full day.
fn day_factor(hour: f32) -> f32 {
    if hour >= DAY_START && hour <= DAY_END {
        let fade_in = ((hour - DAY_START) / DAY_BAND).clamp(0.0, 1.0);
        let fade_out = ((DAY_END - hour) / DAY_BAND).clamp(0.0, 1.0);
        fade_in.min(fade_out)
    } else {
        0.0
    }
}

fn spawn_butterflies(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<ButterflyPool>,
) {
    if pool.initialized {
        return;
    }
    pool.initialized = true;

    let wing_mesh = meshes.add(build_butterfly_mesh());

    for i in 0..BUTTERFLY_COUNT {
        let seed = (i as u32).wrapping_add(500); // offset from firefly seeds
        let phase = hash_f32(seed * 11 + 1);
        let wander_speed = 0.3 + hash_f32(seed * 17 + 3) * 0.4; // 0.3–0.7
        let wander_radius = 0.8 + hash_f32(seed * 29 + 5) * 1.2; // 0.8–2.0
        let flap_speed = 6.0 + hash_f32(seed * 37 + 7) * 4.0; // 6–10 Hz
        let size_scale = 0.7 + hash_f32(seed * 41 + 9) * 0.6; // 0.7–1.3

        let mat = materials.add(StandardMaterial {
            base_color: butterfly_color(i),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            cull_mode: None, // visible from both sides
            ..default()
        });
        let mat_clone = mat.clone();

        // Stagger initial entry so butterflies don't all appear at once
        let idle_cooldown = hash_f32(seed * 53 + 11) * 3.0;

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

/// Reusable flutter offset — overlapping sine waves for erratic butterfly motion.
/// `amp` scales the overall amplitude (1.0 = full wander, 0.3 = subtle entry flutter).
fn flutter_offset(t: f32, phase: f32, speed: f32, radius: f32, amp: f32) -> Vec3 {
    let p = phase;
    let spd = speed;
    let r = radius * amp;
    let ox = (t * spd * 0.6 + p * 6.28).sin() * r
        + (t * spd * 1.7 + p * 2.1).sin() * r * 0.3
        + (t * spd * 3.1 + p * 4.5).cos() * r * 0.1;
    let oy = ((t * spd * 0.8 + p * 3.14).sin() * 0.25
        + (t * spd * 2.3 + p * 1.57).cos() * 0.12
        + (t * spd * 4.0 + p * 5.0).sin() * 0.06)
        * amp;
    let oz = (t * spd * 0.5 + p * 4.71).cos() * r
        + (t * spd * 1.9 + p * 3.3).cos() * r * 0.25
        + (t * spd * 2.8 + p * 0.7).sin() * r * 0.08;
    Vec3::new(ox, oy, oz)
}

/// Apply wing flap animation and billboard facing to a butterfly transform.
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

fn animate_butterflies(
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

    // Night: force all butterflies to Idle
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
    let scene_center = Vec3::new(cam_pos.x - 15.0, 0.0, cam_pos.z - 15.0);
    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.005;
    let wind_off = Vec3::new(wd_x * wind_drift * t, 0.0, wd_z * wind_drift * t);

    for (mut tf, mut bfly, mut vis) in &mut bfly_q {
        // We need to copy the state to avoid borrow issues, then write it back.
        let mut state = bfly.state;

        match state {
            ButterflyState::Idle => {
                *vis = Visibility::Hidden;
                tf.translation.y = -100.0;

                bfly.idle_cooldown -= dt;
                if bfly.idle_cooldown <= 0.0 {
                    // Pick a spawn point on the edge of the visible area
                    let seed = (bfly.phase * 10000.0) as u32 + (t * 7.1) as u32;
                    let theta = hash_f32(seed) * std::f32::consts::TAU;
                    let ry = hash_f32(seed + 200);
                    let origin = scene_center
                        + Vec3::new(
                            theta.cos() * BUTTERFLY_ENTER_RADIUS,
                            0.8 + ry * 1.5,
                            theta.sin() * BUTTERFLY_ENTER_RADIUS,
                        );
                    // Target anchor near scene center
                    let rx = hash_f32(seed + 300) * 2.0 - 1.0;
                    let rz = hash_f32(seed + 400) * 2.0 - 1.0;
                    let ry2 = hash_f32(seed + 500);
                    let target = scene_center + Vec3::new(rx * 6.0, 0.8 + ry2 * 1.5, rz * 6.0);

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
                *progress += dt * BUTTERFLY_ENTER_SPEED / path_len;
                let p = progress.clamp(0.0, 1.0);

                // Smoothstep interpolation
                let ease = p * p * (3.0 - 2.0 * p);
                let base_pos = origin.lerp(target, ease);

                // Subtle flutter overlay during entry (30% amplitude)
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

                // Fade in alpha
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
                // Full wander around anchor
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

                // Check if anchor has drifted too far from scene center (XZ only)
                let dist_xz = Vec2::new(
                    bfly.anchor.x - scene_center.x,
                    bfly.anchor.z - scene_center.z,
                )
                .length();
                if dist_xz > BUTTERFLY_EXIT_TRIGGER {
                    let away = Vec3::new(
                        bfly.anchor.x - scene_center.x,
                        0.15, // slight upward drift
                        bfly.anchor.z - scene_center.z,
                    )
                    .normalize_or_zero();
                    // Fallback direction if normalize fails
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
                *progress += dt * BUTTERFLY_EXIT_SPEED / BUTTERFLY_EXIT_DISTANCE;
                let p = progress.clamp(0.0, 1.0);

                let base_pos = start + direction * (p * BUTTERFLY_EXIT_DISTANCE);

                // Diminishing flutter as it flies away
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

                // Fade out alpha
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

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct InsectsPlugin;

impl Plugin for InsectsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<FireflyPool>();
        app.init_resource::<ButterflyPool>();
        app.add_systems(
            Update,
            (
                spawn_fireflies,
                animate_fireflies,
                spawn_butterflies,
                animate_butterflies,
            ),
        );
    }
}
