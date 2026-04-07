//! Butterfly system: spawn + sim (adapted from bevy_kbve_net) + render.
//!
//! Simulation logic (flight state machine) uses shared types from
//! `bevy_kbve_net::creatures::ambient_types` adapted to client resource types.
//! Render-only code (billboard facing, wing flap, material alpha) stays client-side.

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::common::{CreaturePool, GameTime, day_factor, flutter_offset, hash_f32, scene_center};
use super::creature::{
    AmbientCreatureMarker, AmbientRenderData, ButterflyFlightState, ButterflySimState, Creature,
    CreaturePoolIndex, CreatureRegistry, CreatureState, RenderKind,
};
use crate::game::camera::IsometricCamera;
use crate::game::terrain::TerrainMap;
use crate::game::weather::WindState;

const NPC_REF: &str = "woodland-butterfly";

/// Minimum height above terrain surface for butterfly flight.
const MIN_FLY_HEIGHT: f32 = 0.8;
/// Maximum additional height above MIN_FLY_HEIGHT.
const MAX_FLY_HEIGHT_EXTRA: f32 = 1.5;
/// XZ distance from scene center that triggers exit flight.
const EXIT_TRIGGER: f32 = 18.0;
/// Radius at which entering butterflies spawn (edge of visible area).
const ENTER_RADIUS: f32 = 22.0;
/// Flight speed (units/sec) during entry.
const ENTER_SPEED: f32 = 2.5;
/// Flight speed (units/sec) during exit.
const EXIT_SPEED: f32 = 3.0;
/// Total distance a butterfly travels while exiting before going idle.
const EXIT_DISTANCE: f32 = 10.0;

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
// Mesh
// ---------------------------------------------------------------------------

/// Two-winged butterfly mesh with distinct upper and lower wing lobes.
pub(super) fn build_butterfly_mesh() -> Mesh {
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
// Spawn
// ---------------------------------------------------------------------------

pub(super) fn spawn_butterflies(
    mut commands: Commands,
    creature_meshes: Res<super::common::CreatureMeshes>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut pool: ResMut<CreaturePool>,
    registry: Res<CreatureRegistry>,
) {
    pool.butterflies_spawned = true;

    let Some(config) = registry.config_by_ref(NPC_REF) else {
        warn!("[butterfly] no registry config for '{NPC_REF}' — skipping spawn");
        return;
    };
    let npc_id = registry
        .npc_db
        .id_for_ref(NPC_REF)
        .unwrap_or(bevy_kbve_net::npcdb::ProtoNpcId(0));
    let count = config.pool_size;
    let wing_mesh = creature_meshes.butterfly_wings.clone();

    for i in 0..count {
        let seed = (i as u32).wrapping_add(500);

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
            Creature {
                npc_id,
                render_kind: RenderKind::Billboard,
                state: CreatureState::Pooled,
                slot_seed: seed,
                assigned_slot: None,
                anchor: Vec3::ZERO,
                phase: hash_f32(seed * 11 + 1),
                mat_handle: mat_clone.clone(),
            },
            AmbientCreatureMarker { type_key: NPC_REF },
            ButterflySimState::from_seed(seed),
            AmbientRenderData {
                mat_handle: mat_clone,
                light_entity: None,
            },
            CreaturePoolIndex(i as u32),
        ));
    }

    info!("[butterfly] spawned {count} entities");
}

// ---------------------------------------------------------------------------
// Simulation (adapted from bevy_kbve_net::creatures::simulate_butterfly)
// ---------------------------------------------------------------------------

/// Advance butterfly flight state machine. Writes Transform::translation.
/// NO billboard facing, material alpha, or wing flap scale.
#[allow(clippy::type_complexity)]
pub(super) fn simulate_butterflies(
    time: Res<Time>,
    game_time: Res<GameTime>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut terrain: ResMut<TerrainMap>,
    mut bfly_q: Query<
        (&mut Transform, &mut Creature, &mut ButterflySimState),
        (With<AmbientCreatureMarker>, Without<IsometricCamera>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let dt = time.delta_secs();
    let t = time.elapsed_secs();
    let df = day_factor(game_time.hour);
    let center = scene_center(cam_tf.translation);

    // Nighttime: force all to idle
    if df < 0.01 {
        for (mut tf, _, mut bs) in &mut bfly_q {
            if bs.flight_state != ButterflyFlightState::Idle {
                bs.flight_state = ButterflyFlightState::Idle;
                bs.idle_cooldown = 1.0 + hash_f32((bs.flap_speed * 10000.0) as u32) * 2.0;
            }
            tf.translation.y = -100.0;
        }
        return;
    }

    for (mut tf, mut cr, mut bs) in &mut bfly_q {
        if cr.render_kind != RenderKind::Billboard {
            continue;
        }

        let mut state = bs.flight_state;

        match state {
            ButterflyFlightState::Idle => {
                tf.translation.y = -100.0;
                bs.idle_cooldown -= dt;
                if bs.idle_cooldown <= 0.0 {
                    let seed = (cr.phase * 10000.0) as u32 + (t * 7.1) as u32;
                    let theta = hash_f32(seed) * std::f32::consts::TAU;
                    let ry = hash_f32(seed + 200);
                    let origin_x = center.x + theta.cos() * ENTER_RADIUS;
                    let origin_z = center.z + theta.sin() * ENTER_RADIUS;
                    let ground_o = terrain.height_at_world(origin_x, origin_z);
                    let origin = Vec3::new(
                        origin_x,
                        ground_o + MIN_FLY_HEIGHT + ry * MAX_FLY_HEIGHT_EXTRA,
                        origin_z,
                    );
                    let rx = hash_f32(seed + 300) * 2.0 - 1.0;
                    let rz = hash_f32(seed + 400) * 2.0 - 1.0;
                    let ry2 = hash_f32(seed + 500);
                    let target_x = center.x + rx * 12.0;
                    let target_z = center.z + rz * 12.0;
                    let ground_t = terrain.height_at_world(target_x, target_z);
                    let target = Vec3::new(
                        target_x,
                        ground_t + MIN_FLY_HEIGHT + ry2 * MAX_FLY_HEIGHT_EXTRA,
                        target_z,
                    );

                    state = ButterflyFlightState::Entering {
                        origin,
                        target,
                        progress: 0.0,
                    };
                    cr.state = CreatureState::Active;
                }
            }

            ButterflyFlightState::Entering {
                origin,
                target,
                ref mut progress,
            } => {
                let path_len = origin.distance(target).max(0.1);
                *progress += dt * ENTER_SPEED / path_len;
                let p = progress.clamp(0.0, 1.0);
                let ease = p * p * (3.0 - 2.0 * p);
                let base_pos = origin.lerp(target, ease);
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 0.3);
                let mut pos = base_pos + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                if *progress >= 1.0 {
                    cr.anchor = target;
                    state = ButterflyFlightState::Active;
                }
            }

            ButterflyFlightState::Active => {
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 1.0);
                let mut pos = cr.anchor + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                let dist_xz = Vec2::new(cr.anchor.x - center.x, cr.anchor.z - center.z).length();
                if dist_xz > EXIT_TRIGGER {
                    let away = Vec3::new(cr.anchor.x - center.x, 0.15, cr.anchor.z - center.z)
                        .normalize_or_zero();
                    let dir = if away.length_squared() < 0.01 {
                        let seed = (cr.phase * 10000.0) as u32 + (t * 5.0) as u32;
                        let a = hash_f32(seed) * std::f32::consts::TAU;
                        Vec3::new(a.cos(), 0.15, a.sin()).normalize()
                    } else {
                        away
                    };
                    state = ButterflyFlightState::Exiting {
                        start: tf.translation,
                        direction: dir,
                        progress: 0.0,
                    };
                }
            }

            ButterflyFlightState::Exiting {
                start,
                direction,
                ref mut progress,
            } => {
                *progress += dt * EXIT_SPEED / EXIT_DISTANCE;
                let p = progress.clamp(0.0, 1.0);
                let base_pos = start + direction * (p * EXIT_DISTANCE);
                let flut = flutter_offset(t, cr.phase, bs.wander_speed, bs.wander_radius, 1.0 - p);
                let mut pos = base_pos + flut;
                let ground = terrain.height_at_world(pos.x, pos.z);
                pos.y = pos.y.max(ground + MIN_FLY_HEIGHT);
                tf.translation = pos;

                if *progress >= 1.0 {
                    let seed = (cr.phase * 10000.0) as u32 + (t * 3.3) as u32;
                    bs.idle_cooldown = 1.0 + hash_f32(seed) * 2.0;
                    tf.translation.y = -100.0;
                    cr.state = CreatureState::Pooled;
                    state = ButterflyFlightState::Idle;
                }
            }
        }

        bs.flight_state = state;
    }
}

// ---------------------------------------------------------------------------
// Render (client-only)
// ---------------------------------------------------------------------------

/// Per-frame render: billboard facing, wing flap, material alpha, wind, visibility.
/// Reads sim state set by simulate_butterflies.
#[allow(clippy::type_complexity)]
pub(super) fn render_butterflies(
    time: Res<Time>,
    game_time: Res<GameTime>,
    wind: Res<WindState>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    mut bfly_q: Query<
        (
            &mut Transform,
            &Creature,
            &ButterflySimState,
            &AmbientRenderData,
            &mut Visibility,
        ),
        (With<AmbientCreatureMarker>, Without<IsometricCamera>),
    >,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let t = time.elapsed_secs();
    let df = day_factor(game_time.hour);
    let cam_pos = cam_tf.translation;

    // Nighttime: hide all
    if df < 0.01 {
        for (_, _, _, _, mut vis) in &mut bfly_q {
            *vis = Visibility::Hidden;
        }
        return;
    }

    let (wd_x, wd_z) = wind.direction;
    let wind_drift = wind.speed_mph * 0.005;
    let wind_off = Vec3::new(wd_x * wind_drift * t, 0.0, wd_z * wind_drift * t);

    for (mut tf, cr, bs, rd, mut vis) in &mut bfly_q {
        if cr.render_kind != RenderKind::Billboard {
            continue;
        }

        match bs.flight_state {
            ButterflyFlightState::Idle => {
                *vis = Visibility::Hidden;
            }

            ButterflyFlightState::Entering { progress, .. } => {
                let pos = tf.translation + wind_off;
                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bs.flap_speed,
                    cr.phase,
                    bs.size_scale,
                );
                if let Some(mat) = materials.get_mut(&rd.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9 * progress;
                    mat.base_color = c.into();
                }
            }

            ButterflyFlightState::Active => {
                let pos = tf.translation + wind_off;
                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bs.flap_speed,
                    cr.phase,
                    bs.size_scale,
                );
                if let Some(mat) = materials.get_mut(&rd.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9;
                    mat.base_color = c.into();
                }
            }

            ButterflyFlightState::Exiting { progress, .. } => {
                let pos = tf.translation + wind_off;
                *vis = Visibility::Visible;
                apply_flap_and_billboard(
                    &mut tf,
                    pos,
                    cam_pos,
                    t,
                    bs.flap_speed,
                    cr.phase,
                    bs.size_scale,
                );
                if let Some(mat) = materials.get_mut(&rd.mat_handle) {
                    let mut c = mat.base_color.to_srgba();
                    c.alpha = df * 0.9 * (1.0 - progress);
                    mat.base_color = c.into();
                }
            }
        }
    }
}
