//! Placeable candle — a wax cylinder with a small fire on top.
//! Reuses `FireMaterial` from the campfire module for the flame billboard.

use bevy::asset::RenderAssetUsages;
use bevy::camera::visibility::NoFrustumCulling;
use bevy::light::NotShadowCaster;
use bevy::mesh::{Indices, PrimitiveTopology};
use bevy::prelude::*;

use super::camera::IsometricCamera;
use super::campfire::FireMaterial;
use super::terrain::TerrainMap;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Marker for candle flame billboards.
#[derive(Component)]
pub struct CandleFlame;

/// Marker for candle point lights.
#[derive(Component)]
struct CandleLight;

// ---------------------------------------------------------------------------
// Candle positions (client-side, decorative)
// ---------------------------------------------------------------------------

const CANDLE_POSITIONS: &[(f32, f32)] = &[(1.0, -1.0), (-2.0, 2.5), (5.0, 4.0), (-1.0, -3.0)];

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn setup_candles(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut std_materials: ResMut<Assets<StandardMaterial>>,
    mut fire_materials: ResMut<Assets<FireMaterial>>,
    mut terrain: ResMut<TerrainMap>,
    perf_tier: Res<super::PerfTier>,
) {
    let quality = match *perf_tier {
        super::PerfTier::Low => 0.0,
        super::PerfTier::Medium => 0.5,
        super::PerfTier::High => 1.0,
    };
    let flame_quad = meshes.add(build_candle_flame_quad(0.45, 0.7));
    let candle_body = meshes.add(build_candle_body(0.10, 0.45, 8));

    // Cream/off-white wax material (unlit, vertex-colored override)
    let wax_mat = std_materials.add(StandardMaterial {
        base_color: Color::srgb(0.92, 0.88, 0.78),
        unlit: true,
        ..default()
    });

    for (i, &(wx, wz)) in CANDLE_POSITIONS.iter().enumerate() {
        let ground_y = terrain.height_at_world(wx, wz);
        let candle_top = ground_y + 0.45;

        // Wax body
        commands.spawn((
            Mesh3d(candle_body.clone()),
            MeshMaterial3d(wax_mat.clone()),
            Transform::from_xyz(wx, ground_y + 0.01, wz),
            Pickable::IGNORE,
        ));

        // Small fire on top
        let flame_mat = fire_materials.add(FireMaterial {
            uniforms: super::campfire::FireUniforms {
                time: 0.0,
                intensity: 0.9,
                pixel_size: 16.0,
                quality,
                color_core: Vec4::new(1.0, 0.95, 0.70, 1.0),
                color_mid: Vec4::new(1.0, 0.65, 0.10, 1.0),
                color_outer: Vec4::new(0.90, 0.30, 0.02, 1.0),
            },
        });

        commands.spawn((
            Mesh3d(flame_quad.clone()),
            MeshMaterial3d(flame_mat),
            Transform::from_xyz(wx, candle_top, wz),
            NoFrustumCulling,
            NotShadowCaster,
            CandleFlame,
        ));

        // Small warm point light — skip on Low tier
        if *perf_tier != super::PerfTier::Low {
            commands.spawn((
                PointLight {
                    color: Color::srgb(1.0, 0.75, 0.35),
                    intensity: 4000.0,
                    radius: 0.1,
                    range: 6.0,
                    shadows_enabled: false,
                    ..default()
                },
                Transform::from_xyz(wx, candle_top + 0.3, wz),
                CandleLight,
            ));
        }
    }
}

/// Billboard candle flames toward camera and update material time.
fn animate_candles(
    time: Res<Time>,
    camera_q: Query<&Transform, With<IsometricCamera>>,
    flame_q: Query<&MeshMaterial3d<FireMaterial>, With<CandleFlame>>,
    mut fire_materials: ResMut<Assets<FireMaterial>>,
    mut billboard_q: Query<&mut Transform, (With<CandleFlame>, Without<IsometricCamera>)>,
) {
    let Ok(cam_tf) = camera_q.single() else {
        return;
    };
    let t = time.elapsed_secs();

    for mut tf in &mut billboard_q {
        tf.look_to(cam_tf.forward().as_vec3(), Vec3::Y);
    }

    for mat_handle in &flame_q {
        if let Some(mat) = fire_materials.get_mut(&mat_handle.0) {
            mat.uniforms.time = t;
        }
    }
}

/// Gentle flicker for candle lights.
fn flicker_candle_lights(time: Res<Time>, mut light_q: Query<&mut PointLight, With<CandleLight>>) {
    let t = time.elapsed_secs();
    for (i, mut pl) in light_q.iter_mut().enumerate() {
        let phase = i as f32 * 5.13;
        let flicker = 0.88
            + (t * 10.0 + phase).sin() * 0.06
            + (t * 17.0 + phase * 1.7).sin() * 0.04
            + (t * 29.0 + phase * 0.5).sin() * 0.02;
        pl.intensity = 4000.0 * flicker;
    }
}

// ---------------------------------------------------------------------------
// Mesh builders
// ---------------------------------------------------------------------------

/// Vertical billboard quad for candle flame, anchored at bottom center.
fn build_candle_flame_quad(width: f32, height: f32) -> Mesh {
    let hw = width / 2.0;
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        vec![
            [-hw, 0.0, 0.0],
            [hw, 0.0, 0.0],
            [hw, height, 0.0],
            [-hw, height, 0.0],
        ],
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 1.0]; 4])
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_UV_0,
        vec![[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]],
    )
    .with_inserted_indices(Indices::U32(vec![0, 1, 2, 0, 2, 3]))
}

/// Procedural wax cylinder with slight taper and melted wax drips.
fn build_candle_body(radius: f32, height: f32, segments: u32) -> Mesh {
    let tau = std::f32::consts::TAU;
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let top_radius = radius * 0.85; // slight taper toward top
    let wax_color = [
        srgb_to_linear(0.92),
        srgb_to_linear(0.88),
        srgb_to_linear(0.78),
        1.0,
    ];
    let wax_shadow = [
        srgb_to_linear(0.75),
        srgb_to_linear(0.70),
        srgb_to_linear(0.62),
        1.0,
    ];

    // Bottom ring
    let base_bot = positions.len() as u32;
    for i in 0..segments {
        let a = (i as f32 / segments as f32) * tau;
        let (s, c) = a.sin_cos();
        positions.push([c * radius, 0.0, s * radius]);
        normals.push([c, 0.0, s]);
        colors.push(wax_shadow);
    }

    // Top ring
    let base_top = positions.len() as u32;
    for i in 0..segments {
        let a = (i as f32 / segments as f32) * tau;
        let (s, c) = a.sin_cos();
        // Add slight wobble for melted wax look
        let wobble = 1.0 + ((a * 3.0).sin() * 0.08 + (a * 7.0).cos() * 0.04);
        positions.push([c * top_radius * wobble, height, s * top_radius * wobble]);
        normals.push([c, 0.0, s]);
        colors.push(wax_color);
    }

    // Barrel
    for i in 0..segments {
        let j = (i + 1) % segments;
        indices.extend_from_slice(&[
            base_bot + i,
            base_top + i,
            base_bot + j,
            base_bot + j,
            base_top + i,
            base_top + j,
        ]);
    }

    // Top cap
    let top_center = positions.len() as u32;
    positions.push([0.0, height, 0.0]);
    normals.push([0.0, 1.0, 0.0]);
    colors.push(wax_color);
    for i in 0..segments {
        let j = (i + 1) % segments;
        indices.extend_from_slice(&[base_top + i, top_center, base_top + j]);
    }

    // Bottom cap
    let bot_center = positions.len() as u32;
    positions.push([0.0, 0.0, 0.0]);
    normals.push([0.0, -1.0, 0.0]);
    colors.push(wax_shadow);
    for i in 0..segments {
        let j = (i + 1) % segments;
        indices.extend_from_slice(&[base_bot + j, bot_center, base_bot + i]);
    }

    let uv_count = positions.len();
    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, vec![[0.0f32, 0.0]; uv_count])
    .with_inserted_indices(Indices::U32(indices))
}

fn srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct CandlePlugin;

impl Plugin for CandlePlugin {
    fn build(&self, app: &mut App) {
        // FireMaterial plugin is already registered by CampfirePlugin
        app.add_systems(Startup, setup_candles);
        app.add_systems(
            Update,
            (animate_candles, flicker_candle_lights).run_if(any_with_component::<CandleFlame>),
        );
    }
}
